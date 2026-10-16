"""Advertiser routes — signup, ad submission, public ad listing."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Request
from database import db
from auth import get_current_user, hash_password, create_token, user_to_response, validate_password_strength, limiter
from pydantic import BaseModel, EmailStr
from typing import Optional
import random, string, logging

router = APIRouter()
logger = logging.getLogger(__name__)


def now_str():
    return datetime.now(timezone.utc).isoformat()


class AdvertiserSignup(BaseModel):
    name: str
    email: EmailStr
    password: str
    company_name: str
    phone: Optional[str] = None
    website: Optional[str] = None
    ad_description: Optional[str] = None


class AdSubmit(BaseModel):
    title: str
    body: str
    image_url: Optional[str] = None
    link_url: Optional[str] = None
    placement: str = "sidebar"  # sidebar, banner, featured


# ─── Public ───────────────────────────────────────────────────────────────────

@router.get("/active")
async def get_active_ads():
    """Public endpoint: return approved/active ads for display."""
    ads = await db.ads.find(
        {"status": "approved"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(20)
    return ads


# ─── Advertiser: Signup ───────────────────────────────────────────────────────

@router.post("/signup", status_code=201)
@limiter.limit("5/minute")
async def advertiser_signup(data: AdvertiserSignup, request: Request):
    pw_error = validate_password_strength(data.password)
    if pw_error:
        raise HTTPException(status_code=400, detail=pw_error)
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
    user_doc = {
        "id": str(uuid.uuid4()),
        "email": data.email.lower(),
        "password_hash": hash_password(data.password),
        "role": "advertiser",
        "name": data.name,
        "company_name": data.company_name,
        "phone": data.phone,
        "website": data.website,
        "is_active": True,
        "is_verified": False,
        "agreed_to_terms": True,
        "created_at": now_str(),
        "subscription_status": "active",
        "points": 0,
        "referral_code": code,
        "profile_photo": None,
        "bio": "",
        "auth_provider": "email",
    }
    await db.users.insert_one(user_doc)
    token = create_token({"sub": user_doc["id"], "role": "advertiser"})
    return {"access_token": token, "token_type": "bearer", "user": user_to_response(user_doc)}


# ─── Advertiser: Submit Ad ────────────────────────────────────────────────────

@router.post("/ads", status_code=201)
async def submit_ad(data: AdSubmit, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "advertiser":
        raise HTTPException(status_code=403, detail="Advertisers only")
    ad = {
        "id": str(uuid.uuid4()),
        "advertiser_id": current_user["id"],
        "advertiser_name": current_user.get("company_name") or current_user.get("name"),
        "title": data.title,
        "body": data.body,
        "image_url": data.image_url,
        "link_url": data.link_url,
        "placement": data.placement,
        "status": "pending",
        "created_at": now_str(),
        "approved_at": None,
    }
    await db.ads.insert_one(ad)
    return {k: v for k, v in ad.items() if k != "_id"}


@router.get("/ads/my")
async def my_ads(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "advertiser":
        raise HTTPException(status_code=403, detail="Advertisers only")
    ads = await db.ads.find({"advertiser_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return ads


# ─── Admin: Ad Management ─────────────────────────────────────────────────────

async def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin required")
    return current_user


@router.get("/admin/ads")
async def admin_list_ads(status: Optional[str] = None, admin: dict = Depends(require_admin)):
    query = {}
    if status:
        query["status"] = status
    ads = await db.ads.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return ads


@router.post("/admin/ads/{ad_id}/approve")
async def approve_ad(ad_id: str, admin: dict = Depends(require_admin)):
    ad = await db.ads.find_one({"id": ad_id})
    if not ad:
        raise HTTPException(status_code=404, detail="Ad not found")
    await db.ads.update_one({"id": ad_id}, {"$set": {"status": "approved", "approved_at": now_str(), "approved_by": admin["id"]}})
    return {"message": "Ad approved"}


@router.post("/admin/ads/{ad_id}/reject")
async def reject_ad(ad_id: str, admin: dict = Depends(require_admin)):
    await db.ads.update_one({"id": ad_id}, {"$set": {"status": "rejected"}})
    return {"message": "Ad rejected"}


@router.delete("/admin/ads/{ad_id}")
async def delete_ad(ad_id: str, admin: dict = Depends(require_admin)):
    await db.ads.delete_one({"id": ad_id})
    return {"message": "Ad deleted"}
