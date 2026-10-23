#!/usr/bin/env python3
"""One-command seeding of an isolated STAGING database for the legacy integration tests.

Usage (from the repo root or the backend folder):

    python backend/scripts/seed_staging.py            # seed / re-assert (idempotent)
    python backend/scripts/seed_staging.py --reset    # wipe the staging DB first, then seed
    python backend/scripts/seed_staging.py --check    # only verify, change nothing

It reads the SAME names used by the GitHub "staging" environment
(.github/workflows/legacy-backend-staging.yml), so one set of values feeds both:

  required : STAGING_MONGO_URL, STAGING_DB_NAME,
             STAGING_SUPERADMIN_EMAIL, STAGING_SUPERADMIN_PASSWORD,
             STAGING_ADMIN_EMAIL, STAGING_ADMIN_PASSWORD
  optional : STAGING_MONGO_HOST (must match the URI host when set),
             STAGING_CONTRACTOR{1,2,3}_EMAIL / _PASSWORD  (default contractorN@test.com / Test@1234),
             STAGING_CREW_EMAIL / _PASSWORD, STAGING_CREW2_EMAIL / _PASSWORD
                                               (default testcrew[2]@thedaylaborers.com / Crew@1234),
             STAGING_JWT_SECRET_KEY, STAGING_WEB_ORIGIN

What it creates: super-admin + admin, 3 verified contractors, 2 crew members, 9 metro-Atlanta
demo jobs (incl. the in-progress "Drywall Hanging" job assigned to CREW2), the TEST20 coupon,
default plan settings (monthly 79.99), trades and CMS pages. It ends with a verification
report and exits non-zero if anything the tests rely on is missing.

Safety: refuses to run unless the database name AND the MongoDB host contain a
staging/stage/stg/test marker, and never touches *.preview.emergentagent.com hosts.
"""
import argparse
import asyncio
import os
import re
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

STAGE_MARKER = re.compile(r"(^|[-._])(staging|stage|stg|test)([-._]|$)", re.IGNORECASE)
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}

# account key -> (default email, default password, kind, index into seed_demo list)
ACCOUNTS = {
    "SUPERADMIN": (None, None, "super_admin", None),
    "ADMIN": (None, None, "admin", None),
    "CONTRACTOR1": ("contractor1@test.com", "Test@1234", "contractor", 0),
    "CONTRACTOR2": ("contractor2@test.com", "Test@1234", "contractor", 1),
    "CONTRACTOR3": ("contractor3@test.com", "Test@1234", "contractor", 2),
    "CREW": ("testcrew@thedaylaborers.com", "Crew@1234", "crew", 0),
    "CREW2": ("testcrew2@thedaylaborers.com", "Crew@1234", "crew", 1),
}


def fail(msg: str):
    print(f"\n[seed-staging] REFUSED: {msg}", file=sys.stderr)
    sys.exit(2)


def resolve_accounts() -> dict:
    out = {}
    for key, (d_email, d_pw, role, idx) in ACCOUNTS.items():
        email = (os.environ.get(f"STAGING_{key}_EMAIL") or d_email or "").strip().lower()
        password = os.environ.get(f"STAGING_{key}_PASSWORD") or d_pw or ""
        if not email or not password:
            fail(f"STAGING_{key}_EMAIL and STAGING_{key}_PASSWORD are required.")
        try:  # same check the login API applies, so a seeded account can always sign in
            from email_validator import validate_email
            validate_email(email, check_deliverability=False)
        except Exception as e:
            fail(f"STAGING_{key}_EMAIL '{email}' would be rejected by the login API: {e}")
        out[key] = {"email": email, "password": password, "role": role, "idx": idx}
    emails = [a["email"] for a in out.values()]
    if len(set(emails)) != len(emails):
        fail("Every staging account must use a different email address.")
    return out


def guard_target(allow_localhost: bool) -> tuple[str, str]:
    uri = (os.environ.get("STAGING_MONGO_URL") or "").strip()
    db_name = (os.environ.get("STAGING_DB_NAME") or "").strip()
    if not uri or not db_name:
        fail("STAGING_MONGO_URL and STAGING_DB_NAME must be set explicitly (the backend .env is never used).")
    parsed = urlsplit(uri)
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme not in ("mongodb", "mongodb+srv") or not host:
        fail("STAGING_MONGO_URL is not a valid MongoDB URI.")
    if not STAGE_MARKER.search(db_name):
        fail(f"STAGING_DB_NAME '{db_name}' must contain staging/stage/stg/test.")
    pinned = (os.environ.get("STAGING_MONGO_HOST") or "").strip().lower().rstrip(".")
    if pinned and pinned != host:
        fail("STAGING_MONGO_URL host does not match STAGING_MONGO_HOST.")
    if host.endswith(".preview.emergentagent.com"):
        fail("Shared preview hosts are never allowed.")
    if host in LOCAL_HOSTS:
        if not allow_localhost:
            fail("Mongo host is localhost; pass --allow-localhost for a local rehearsal.")
    elif not STAGE_MARKER.search(host):
        fail(f"Mongo host '{host}' must contain staging/stage/stg/test.")
    stripe_mode = os.environ.get("STAGING_STRIPE_MODE", "test").strip().lower()
    if stripe_mode != "test":
        fail("STAGING_STRIPE_MODE must be 'test'.")
    return uri, db_name


def prepare_env(uri: str, db_name: str, accounts: dict):
    # Force the app modules onto the staging DB (set BEFORE they load the backend .env).
    os.environ["MONGO_URL"] = uri
    os.environ["DB_NAME"] = db_name
    os.environ["SEED_DEMO_ACCOUNTS"] = "false"  # we seed explicitly with the staging accounts below
    os.environ["SUPER_ADMIN_EMAIL"] = accounts["SUPERADMIN"]["email"]
    os.environ["SUPER_ADMIN_PASSWORD"] = accounts["SUPERADMIN"]["password"]
    os.environ["ADMIN_EMAIL"] = accounts["ADMIN"]["email"]
    os.environ["ADMIN_PASSWORD"] = accounts["ADMIN"]["password"]
    if os.environ.get("STAGING_JWT_SECRET_KEY"):
        os.environ["JWT_SECRET_KEY"] = os.environ["STAGING_JWT_SECRET_KEY"]
    if os.environ.get("STAGING_WEB_ORIGIN"):
        os.environ["CORS_ORIGINS"] = os.environ["STAGING_WEB_ORIGIN"]
    # Values the server module insists on at import time but the seeder never uses.
    os.environ.setdefault("JWT_SECRET_KEY", "seed-script-placeholder-secret-not-used-0000")
    os.environ.setdefault("JWT_EXPIRE_HOURS", "24")
    os.environ.setdefault("CORS_ORIGINS", "https://staging.invalid")
    os.environ.setdefault("EMERGENT_LLM_KEY", "seed-script-unused")
    os.environ.setdefault("TRUSTED_PROXY_HOPS", "1")


async def ensure_staff(db, acct: dict, hash_password, pwd_context, validate_password_strength):
    err = validate_password_strength(acct["password"])
    if err:
        fail(f"{acct['role']} password: {err}")
    now = datetime.now(timezone.utc)
    existing = await db.users.find_one({"email": acct["email"]}, {"_id": 0})
    if existing:
        if existing.get("role") != acct["role"]:
            fail(f"{acct['email']} already exists with role '{existing.get('role')}', expected '{acct['role']}'.")
        updates = {"is_active": True, "is_verified": True}
        if not pwd_context.verify(acct["password"], existing.get("password_hash") or ""):
            updates["password_hash"] = hash_password(acct["password"])
            updates["token_version"] = int(existing.get("token_version") or 0) + 1
        await db.users.update_one({"email": acct["email"]}, {"$set": updates})
        await db.login_attempts.delete_one({"email": acct["email"]})
        return
    far = (now + timedelta(days=36500)).isoformat()
    name = "Super Administrator" if acct["role"] == "super_admin" else "Platform Admin"
    await db.users.insert_one({
        "id": str(uuid.uuid4()), "email": acct["email"], "password_hash": hash_password(acct["password"]),
        "role": acct["role"], "name": name, "phone": None, "is_active": True, "is_verified": True,
        "created_at": now.isoformat(), "trial_start_date": now.isoformat(), "trial_end_date": far,
        "subscription_status": "active", "subscription_plan": "lifetime", "subscription_end": far,
        "points": 0, "referral_code": uuid.uuid4().hex[:8].upper(), "referred_by": None,
        "bio": "", "trade": "", "skills": [], "profile_photo": None, "availability": True, "location": None,
        "rating": 0.0, "rating_count": 0, "jobs_completed": 0, "company_name": "", "logo": None,
        "hide_location": False, "favorite_crew": [], "auth_provider": "email", "token_version": 0,
    })


async def seed(accounts: dict):
    import seed_demo
    import server
    from auth import hash_password, pwd_context, validate_password_strength
    from database import db

    # Remap the demo fixtures onto the staging emails (jobs keep their crew assignments).
    remap = {}
    for key, a in accounts.items():
        if a["role"] == "contractor":
            remap[seed_demo.CONTRACTORS[a["idx"]]["email"]] = a["email"]
        elif a["role"] == "crew":
            remap[seed_demo.CREW[a["idx"]]["email"]] = a["email"]
    seed_demo.CONTRACTORS = [{**c, "email": remap[c["email"]]} for c in seed_demo.CONTRACTORS]
    seed_demo.CREW = [{**c, "email": remap[c["email"]]} for c in seed_demo.CREW]
    seed_demo.DEMO_JOBS = [j[:11] + ([remap[e] for e in j[11]],) + j[12:] for j in seed_demo.DEMO_JOBS]

    # Indexes, default settings/plans, trades, CMS and staff bootstrap from the real app startup.
    # Object storage is not needed to seed and is skipped so the script works without platform keys.
    server.init_storage = lambda: None

    async def _no_migrate(*_a, **_k):
        return 0
    server.migrate_legacy_uploads = _no_migrate
    await server.startup_event()

    for key in ("SUPERADMIN", "ADMIN"):
        await ensure_staff(db, accounts[key], hash_password, pwd_context, validate_password_strength)

    now = datetime.now(timezone.utc)
    for key, a in accounts.items():
        if a["role"] == "contractor":
            c = seed_demo.CONTRACTORS[a["idx"]]
            verified = {"is_verified_contractor": True, "verification_expired": False,
                        "verified_at": now.isoformat(), "verified_expires_at": (now + timedelta(days=365)).isoformat()}
            await seed_demo._upsert_user({**c, "bio": f"{c['company_name']} - verified contractor serving metro Atlanta."},
                                         "contractor", a["password"], "contractor_pro", verified)
        elif a["role"] == "crew":
            c = seed_demo.CREW[a["idx"]]
            await seed_demo._upsert_user({**c, "bio": f"Reliable {c['trade'].lower()} crew member, available for day jobs."},
                                         "crew", a["password"], "crew_annual", {})

    if not await db.coupons.find_one({"code": seed_demo.COUPON["code"]}):
        await db.coupons.insert_one({
            "id": str(uuid.uuid4()), **seed_demo.COUPON, "usage_count": 0, "expires_at": None,
            "created_at": now.isoformat(), "created_by": "staging_seed",
        })
    await seed_demo.seed_demo_jobs()


async def verify(accounts: dict) -> bool:
    from auth import pwd_context
    from database import db

    ok = True

    def line(passed: bool, text: str):
        nonlocal ok
        ok = ok and passed
        print(f"  [{'OK' if passed else 'FAIL'}] {text}")

    print("\nAccounts:")
    users = {}
    for key, a in accounts.items():
        u = await db.users.find_one({"email": a["email"]}, {"_id": 0})
        users[key] = u
        good = bool(u) and u.get("role") == a["role"] and u.get("is_active", True) \
            and pwd_context.verify(a["password"], u.get("password_hash") or "")
        line(good, f"{key:<12} {a['email']} ({a['role']}) can sign in")
    c1 = users.get("CONTRACTOR1") or {}
    line(bool(c1.get("is_verified_contractor")), "CONTRACTOR1 is a verified contractor")

    print("\nFixtures:")
    for key in ("CONTRACTOR1", "CONTRACTOR2", "CONTRACTOR3"):
        uid = (users.get(key) or {}).get("id")
        n = await db.jobs.count_documents({"contractor_id": uid}) if uid else 0
        line(n >= 3, f"{key} owns {n} jobs (need >= 3)")
    open_atl = await db.jobs.count_documents({"status": "open", "location.state": "GA",
                                              "location.lat": {"$gte": 33.5, "$lte": 34.2}})
    line(open_atl >= 3, f"{open_atl} open metro-Atlanta jobs available to crew (need >= 3)")
    crew2_id = (users.get("CREW2") or {}).get("id")
    drywall = await db.jobs.find_one({"title": {"$regex": "^Drywall Hanging"}, "status": "in_progress",
                                      "crew_accepted": crew2_id}) if crew2_id else None
    line(bool(drywall), "In-progress 'Drywall Hanging' job assigned to CREW2")
    coupon = await db.coupons.find_one({"code": "TEST20"})
    line(bool(coupon) and float(coupon.get("discount_percent", 0)) == 20.0, "TEST20 coupon (20% off)")
    settings = await db.settings.find_one({}) or {}
    line(float(settings.get("monthly_price", 0)) == 79.99, f"Plan settings monthly_price = {settings.get('monthly_price')}")
    return ok


async def main():
    ap = argparse.ArgumentParser(description="Seed an isolated staging database for the legacy integration tests.")
    ap.add_argument("--reset", action="store_true", help="drop the staging database before seeding")
    ap.add_argument("--check", action="store_true", help="only verify the existing data, change nothing")
    ap.add_argument("--allow-localhost", action="store_true", help="permit a localhost Mongo for a local rehearsal")
    args = ap.parse_args()

    accounts = resolve_accounts()
    uri, db_name = guard_target(args.allow_localhost)
    prepare_env(uri, db_name, accounts)
    print(f"[seed-staging] target: {urlsplit(uri).hostname} / {db_name}")

    from database import client
    if args.reset and not args.check:
        await client.drop_database(db_name)
        print(f"[seed-staging] dropped database {db_name}")
    if not args.check:
        await seed(accounts)
        print("[seed-staging] seeding complete")
    ok = await verify(accounts)
    client.close()
    print("\n[seed-staging] " + ("READY - staging matches the integration-test requirements." if ok
                                 else "NOT READY - fix the FAIL lines above."))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    asyncio.run(main())
