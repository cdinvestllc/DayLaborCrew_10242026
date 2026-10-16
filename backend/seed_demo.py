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
