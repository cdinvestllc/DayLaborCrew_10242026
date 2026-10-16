"""Idempotent demo data: verified contractors, crew members and the TEST20 coupon.

Runs at startup when SEED_DEMO_ACCOUNTS=true. Safe to run repeatedly: existing
accounts keep their data, only the demo password / role / access fields are
re-asserted so the documented logins always work.
"""
import logging
import random
import string
import uuid
from datetime import datetime, timedelta, timezone

from auth import hash_password, pwd_context
from database import db

logger = logging.getLogger(__name__)

CONTRACTORS = [
    {"email": "contractor1@test.com", "name": "Marcus Reed", "company_name": "Reed Landscaping & Hardscape",
     "trade": "Landscaping", "skills": ["Landscaping", "Sod Install", "Irrigation"], "phone": "404-555-0101",
     "location": {"lat": 33.7490, "lng": -84.3880, "city": "Atlanta", "state": "GA"}},
    {"email": "contractor2@test.com", "name": "Dana Whitfield", "company_name": "Whitfield Builders",
     "trade": "Carpentry", "skills": ["Framing", "Carpentry", "Drywall"], "phone": "404-555-0102",
     "location": {"lat": 33.7701, "lng": -84.2963, "city": "Decatur", "state": "GA"}},
    {"email": "contractor3@test.com", "name": "Luis Ortega", "company_name": "Ortega Concrete Co.",
     "trade": "Concrete/Masonry", "skills": ["Concrete", "Masonry", "Demolition"], "phone": "770-555-0103",
     "location": {"lat": 33.9526, "lng": -84.5499, "city": "Marietta", "state": "GA"}},
]
CONTRACTOR_PASSWORD = "Test@1234"

CREW = [
    {"email": "testcrew@thedaylaborers.com", "name": "Jordan Hayes", "trade": "General Labor",
     "skills": ["General Labor", "Moving/Hauling", "Landscaping"], "phone": "404-555-0201",
     "transportation": "truck", "location": {"lat": 33.7537, "lng": -84.3863, "city": "Atlanta", "state": "GA"}},
    {"email": "testcrew2@thedaylaborers.com", "name": "Andre Mitchell", "trade": "Carpentry",
     "skills": ["Carpentry", "Painting", "Drywall"], "phone": "404-555-0202",
     "transportation": "car", "location": {"lat": 33.7748, "lng": -84.3963, "city": "Atlanta", "state": "GA"}},
]
CREW_PASSWORD = "Crew@1234"

COUPON = {"code": "TEST20", "discount_percent": 20.0, "usage_limit": 100000, "plan_restriction": None}


def _code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=8))


async def _upsert_user(spec: dict, role: str, password: str, plan: str, extra: dict):
    now = datetime.now(timezone.utc)
    year = (now + timedelta(days=365)).isoformat()
    email = spec["email"].lower()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing and existing.get("role") in ("admin", "super_admin"):
        logger.warning(f"Demo seed skipped {email}: belongs to a staff account")
        return
    access = {
        "role": role, "is_active": True, "is_verified": True,
        "subscription_status": "active", "subscription_plan": plan, "subscription_end": year,
        **extra,
    }
    if existing:
        updates = dict(access)
        if not pwd_context.verify(password, existing.get("password_hash") or ""):
            updates["password_hash"] = hash_password(password)
            updates["token_version"] = int(existing.get("token_version") or 0) + 1
        for k in ("location", "company_name", "trade", "skills", "phone"):
            if not existing.get(k) and spec.get(k):
                updates[k] = spec[k]
        await db.users.update_one({"email": email}, {"$set": updates})
        await db.login_attempts.delete_one({"email": email})
        return
    await db.users.insert_one({
        "id": str(uuid.uuid4()), "email": email, "password_hash": hash_password(password),
        "name": spec["name"], "phone": spec.get("phone"),
        "created_at": now.isoformat(), "trial_start_date": now.isoformat(),
        "trial_end_date": (now + timedelta(days=30)).isoformat(),
        "points": 0, "referral_code": _code(), "referred_by": None,
        "bio": spec.get("bio", ""), "trade": spec.get("trade", ""), "skills": spec.get("skills", []),
        "profile_photo": None, "availability": True, "location": spec.get("location"),
        "rating": 0.0, "rating_count": 0, "jobs_completed": 0,
        "company_name": spec.get("company_name", ""), "logo": None, "hide_location": False,
        "favorite_crew": [], "transportation": spec.get("transportation"),
        "auth_provider": "email", "token_version": 0,
        **access,
    })
    logger.info(f"Demo account created: {email} ({role})")


async def seed_demo_accounts():
    now = datetime.now(timezone.utc)
    for c in CONTRACTORS:
        verified = {"is_verified_contractor": True, "verification_expired": False,
                    "verified_at": now.isoformat(), "verified_expires_at": (now + timedelta(days=365)).isoformat()}
        existing = await db.users.find_one({"email": c["email"]}, {"_id": 0, "verified_expires_at": 1, "verified_at": 1})
        if existing and existing.get("verified_expires_at", "") > (now + timedelta(days=30)).isoformat():
            verified.pop("verified_at")
            verified.pop("verified_expires_at")
        await _upsert_user({**c, "bio": f"{c['company_name']} - verified contractor serving metro Atlanta."},
                           "contractor", CONTRACTOR_PASSWORD, "contractor_pro", verified)
    for c in CREW:
        await _upsert_user({**c, "bio": f"Reliable {c['trade'].lower()} crew member, available for day jobs."},
                           "crew", CREW_PASSWORD, "crew_annual", {})

    if not await db.coupons.find_one({"code": COUPON["code"]}):
        await db.coupons.insert_one({
            "id": str(uuid.uuid4()), **COUPON, "usage_count": 0, "expires_at": None,
            "created_at": now.isoformat(), "created_by": "system_seed",
        })
        logger.info("Demo coupon TEST20 created")

    await seed_demo_jobs()


# ─── Demo jobs (metro Atlanta) ────────────────────────────────────────────────
# (contractor index, title, trade, description, crew_needed, pay_rate, address, city, lat, lng, status, crew emails, emergency, start offset hours, duration hours)
DEMO_JOBS = [
    (0, "Spring Yard Cleanup & Mulch", "Landscaping",
     "Clear leaves and debris, edge beds and spread 15 yards of pine mulch at a 2-acre residential property.",
     3, 22.0, "1080 Peachtree St NE, Atlanta, GA", "Atlanta", 33.7838, -84.3830, "open", [], False, 20, 8),
    (0, "Sod Installation - New Build", "Landscaping",
     "Lay Bermuda sod on a freshly graded backyard (approx. 4,000 sq ft). Must be comfortable with heavy lifting.",
     2, 24.0, "400 Park Dr NE, Atlanta, GA", "Atlanta", 33.7812, -84.3733, "fulfilled", ["testcrew@thedaylaborers.com", "testcrew2@thedaylaborers.com"], False, 44, 8),
    (0, "Storm Debris Removal - Urgent", "General Labor",
     "Fallen tree limbs blocking a driveway after last night's storm. Need help cutting, hauling and loading today.",
     2, 30.0, "675 Ponce De Leon Ave NE, Atlanta, GA", "Atlanta", 33.7726, -84.3655, "open", [], True, 3, 5),
    (1, "Deck Framing Helper", "Carpentry",
     "Assist lead carpenter framing a 16x20 composite deck. Bring basic hand tools; power tools provided.",
     2, 26.0, "115 W Ponce de Leon Ave, Decatur, GA", "Decatur", 33.7748, -84.2963, "open", [], False, 26, 9),
    (1, "Drywall Hanging - Basement Finish", "Drywall",
     "Hang and screw 60 sheets of 1/2\" drywall in a basement remodel. Experience preferred.",
     2, 25.0, "2000 Lawrenceville Hwy, Decatur, GA", "Decatur", 33.7980, -84.2810, "in_progress", ["testcrew2@thedaylaborers.com"], False, -3, 8),
    (1, "Interior Painting - 3 Bedrooms", "Painting",
     "Prep, tape and paint walls and trim in three bedrooms. Paint and supplies provided.",
     1, 23.0, "315 W Ponce de Leon Ave, Decatur, GA", "Decatur", 33.7740, -84.3010, "completed", ["testcrew@thedaylaborers.com"], False, -72, 8),
    (2, "Concrete Pour Crew - Driveway", "Concrete/Masonry",
     "Help pour and finish a 600 sq ft driveway. Early start, boots and gloves required.",
     4, 28.0, "50 Lawrence St NE, Marietta, GA", "Marietta", 33.9540, -84.5490, "open", [], False, 30, 7),
    (2, "Brick Mailbox Rebuild", "Concrete/Masonry",
     "Demo a damaged brick mailbox and help the mason rebuild it. Half-day job.",
     1, 25.0, "1100 Johnson Ferry Rd, Marietta, GA", "Marietta", 33.9750, -84.4620, "open", [], False, 50, 4),
    (2, "Garage Demolition Cleanup", "Demolition",
     "Load debris into a 30-yard dumpster after a detached garage tear-down.",
     3, 22.0, "300 Cobb Pkwy S, Marietta, GA", "Marietta", 33.9380, -84.5180, "fulfilled", ["testcrew@thedaylaborers.com"], False, 68, 6),
]


async def seed_demo_jobs():
    now = datetime.now(timezone.utc)
    emails = [c["email"] for c in CONTRACTORS] + [c["email"] for c in CREW]
    users = {u["email"]: u async for u in db.users.find({"email": {"$in": emails}}, {"_id": 0})}
    if any(e not in users for e in emails):
        return
    if await db.jobs.count_documents({"is_demo": True}) > 0:
        return
    docs = []
    for (ci, title, trade, desc, needed, rate, addr, city, lat, lng, status, crew_emails, emergency, start_h, dur_h) in DEMO_JOBS:
        contractor = users[CONTRACTORS[ci]["email"]]
        start = now + timedelta(hours=start_h)
        crew_ids = [users[e]["id"] for e in crew_emails]
        if status in ("open", "fulfilled"):
            status = "fulfilled" if len(crew_ids) >= needed else "open"
        doc = {
            "id": str(uuid.uuid4()), "contractor_id": contractor["id"],
            "contractor_name": contractor.get("company_name") or contractor["name"],
            "contractor_photo": contractor.get("logo") or contractor.get("profile_photo"),
            "title": title, "description": desc, "trade": trade, "crew_needed": needed,
            "crew_accepted": crew_ids,
            "start_time": start.strftime("%Y-%m-%dT%H:%M"),
            "end_time": (start + timedelta(hours=dur_h)).strftime("%Y-%m-%dT%H:%M"),
            "pay_rate": rate,
            "location": {"address": addr, "lat": lat, "lng": lng, "city": city, "state": "GA"},
            "status": status, "is_emergency": emergency, "emergency_paid": emergency,
            "created_at": (now - timedelta(hours=2 + len(docs))).isoformat(),
            "completed_at": (start + timedelta(hours=dur_h)).isoformat() if status == "completed" else None,
            "rated_crew": [], "rated_by_crew": [], "invited_crew": [], "images": [], "is_demo": True,
        }
        if status == "in_progress":
            doc["started_at"] = start.isoformat()
        docs.append(doc)
    await db.jobs.insert_many(docs)
    for e in ("testcrew@thedaylaborers.com", "testcrew2@thedaylaborers.com"):
        done = sum(1 for d in docs if d["status"] == "completed" and users[e]["id"] in d["crew_accepted"])
        if done:
            await db.users.update_one({"email": e, "jobs_completed": {"$lt": done}}, {"$set": {"jobs_completed": done}})
    logger.info(f"Demo jobs created: {len(docs)}")
