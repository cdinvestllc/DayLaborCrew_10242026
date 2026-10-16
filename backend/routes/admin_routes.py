from fastapi import APIRouter, HTTPException, Depends, Query, Request
from database import db
from auth import get_current_user, bump_token_version, log_security_event
from utils.storage import save_image
from models import (
    AdminUserUpdate, TermsUpdate, SettingsUpdate, CMSUpdate,
    TradeCreate, TradeUpdate, BulkEmailRequest, ActivityLogEntry,
    MessageCreate, MessageReply, CouponCreate
)
from typing import Optional
import uuid
import logging
import csv
import json
import io
from datetime import datetime, timezone
from fastapi.responses import StreamingResponse

router = APIRouter()
logger = logging.getLogger(__name__)

ADMIN_ROLES = {"admin", "super_admin"}
ASSIGNABLE_ROLES = {"crew", "contractor", "advertiser", "admin"}


# ─── Permission Helpers ───────────────────────────────────────────────────────

async def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


async def require_super_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    return current_user


def is_protected(target_user: dict, actor: dict) -> bool:
    """Returns True if actor cannot modify target."""
    if target_user["role"] == "super_admin":
        return True  # Nobody can modify super_admin
    if target_user["role"] == "admin" and actor["role"] != "super_admin":
        return True  # Only super_admin can modify admins
    return False


async def log_activity(
    request: Request,
    admin: dict,
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    details: Optional[str] = None
):
    """Log an admin action to the activity log."""
    try:
        ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
        entry = {
            "id": str(uuid.uuid4()),
            "admin_id": admin["id"],
            "admin_name": admin.get("name", "Unknown"),
            "admin_role": admin.get("role", "admin"),
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "details": details,
            "ip_address": ip,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await db.admin_activity_log.insert_one(entry)
    except Exception as e:
        logger.warning(f"Activity log failed: {e}")


# ─── Analytics ─────────────────────────────────────────────────────────────────

@router.get("/analytics")
async def get_analytics(admin: dict = Depends(require_admin)):
    total_users = await db.users.count_documents({"role": {"$nin": ["admin", "super_admin"]}})
    crew_count = await db.users.count_documents({"role": "crew"})
    contractor_count = await db.users.count_documents({"role": "contractor"})
    admin_count = await db.users.count_documents({"role": "admin"})
    active_jobs = await db.jobs.count_documents({"status": {"$in": ["open", "fulfilled", "in_progress"]}})
    completed_jobs = await db.jobs.count_documents({"status": "completed"})
    total_jobs = await db.jobs.count_documents({})
    active_subs = await db.users.count_documents({"subscription_status": "active", "role": {"$nin": ["admin", "super_admin"]}})
    trial_subs = await db.users.count_documents({"subscription_status": "trial"})
    expired_subs = await db.users.count_documents({"subscription_status": "expired"})
    suspended_users = await db.users.count_documents({"is_active": False, "role": {"$nin": ["admin", "super_admin"]}})

    payments = await db.payment_transactions.find(
        {"payment_status": "paid"}, {"_id": 0, "amount": 1}
    ).to_list(1000)
    total_revenue = sum(p.get("amount", 0) for p in payments)

    recent_users = await db.users.find(
        {}, {"_id": 0, "password_hash": 0}
    ).sort("created_at", -1).to_list(10)

    return {
        "total_users": total_users,
        "crew_count": crew_count,
        "contractor_count": contractor_count,
        "admin_count": admin_count,
        "active_jobs": active_jobs,
        "completed_jobs": completed_jobs,
        "total_jobs": total_jobs,
        "active_subscriptions": active_subs,
        "trial_subscriptions": trial_subs,
        "expired_subscriptions": expired_subs,
        "suspended_users": suspended_users,
        "total_revenue": round(total_revenue, 2),
        "recent_users": recent_users
    }


# ─── User Management ──────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    role: Optional[str] = None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    admin: dict = Depends(require_admin)
):
    query = {}
    if role:
        query["role"] = role
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}}
        ]
    if status == "active":
        query["is_active"] = True
    elif status == "suspended":
        query["is_active"] = False

    # Admins can see all users including other admins (but super_admin is hidden from regular admins)
    if admin["role"] == "admin":
        if role and role != "super_admin":
            query["role"] = role  # specific role filter already excludes super_admin implicitly
        else:
            query["role"] = {"$ne": "super_admin"}

    skip = (page - 1) * limit
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).skip(skip).limit(limit).to_list(limit)
    total = await db.users.count_documents(query)
    return {"users": users, "total": total, "page": page, "pages": (total + limit - 1) // limit}


@router.get("/users/{user_id}")
async def get_user(user_id: str, admin: dict = Depends(require_admin)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user["role"] == "super_admin" and admin["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Access denied")
    ratings = await db.ratings.find({"rated_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(20)
    jobs = await db.jobs.find(
        {"$or": [{"contractor_id": user_id}, {"crew_accepted": user_id}]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(10)
    return {**user, "recent_ratings": ratings, "recent_jobs": jobs}


@router.put("/users/{user_id}")
async def update_user(user_id: str, data: AdminUserUpdate, request: Request, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if is_protected(target, admin):
        raise HTTPException(status_code=403, detail="Cannot modify this user")

    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "role" in update:
        new_role = update["role"]
        if new_role not in ASSIGNABLE_ROLES:
            log_security_event("role_escalation_blocked", request, actor=admin["id"], target=user_id, role=new_role)
            raise HTTPException(status_code=403, detail="Cannot assign this role")
        if new_role == "admin" and admin["role"] != "super_admin":
            log_security_event("role_escalation_blocked", request, actor=admin["id"], target=user_id, role=new_role)
            raise HTTPException(status_code=403, detail="Only Super Admin can grant admin access")
        if user_id == admin["id"]:
            raise HTTPException(status_code=403, detail="You cannot change your own role")

    await db.users.update_one({"id": user_id}, {"$set": update})
    if update.get("role", target["role"]) != target["role"] or update.get("is_active") is False:
        await bump_token_version(user_id)
        log_security_event("user_privileges_changed", request, actor=admin["id"], target=user_id)
    await log_activity(request, admin, "update_user", "user", user_id, str(update))
    return {"message": "User updated"}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if is_protected(target, admin):
        raise HTTPException(status_code=403, detail="Cannot delete this user")

    await db.users.delete_one({"id": user_id})
    await log_activity(request, admin, "delete_user", "user", user_id, f"Deleted user: {target.get('email')}")
    return {"message": "User deleted"}


@router.post("/users/{user_id}/suspend")
async def suspend_user(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if is_protected(target, admin):
        raise HTTPException(status_code=403, detail="Cannot suspend this user")
    await db.users.update_one({"id": user_id}, {"$set": {"is_active": False}})
    await bump_token_version(user_id)
    await log_activity(request, admin, "suspend_user", "user", user_id, f"Suspended: {target.get('email')}")
    return {"message": "User suspended"}


@router.post("/users/{user_id}/activate")
async def activate_user(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "role": 1})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if is_protected(target, admin):
        raise HTTPException(status_code=403, detail="Cannot modify this user")
    await db.users.update_one({"id": user_id}, {"$set": {"is_active": True}})
    await log_activity(request, admin, "activate_user", "user", user_id)
    return {"message": "User activated"}


@router.put("/users/{user_id}/points")
async def update_user_points(user_id: str, points: int, request: Request, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "role": 1})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if is_protected(target, admin):
        raise HTTPException(status_code=403, detail="Cannot modify this user")
    if points < 0:
        raise HTTPException(status_code=400, detail="Points cannot be negative")
    await db.users.update_one({"id": user_id}, {"$set": {"points": points}})
    await log_activity(request, admin, "update_points", "user", user_id, f"Points set to {points}")
    return {"message": f"Points set to {points}"}


@router.post("/suspend-all")
async def suspend_all_users(request: Request, admin: dict = Depends(require_super_admin)):
    result = await db.users.update_many(
        {"role": {"$in": ["crew", "contractor"]}},
        {"$set": {"is_active": False}, "$inc": {"token_version": 1}}
    )
    await log_activity(request, admin, "suspend_all_users", details=f"Suspended {result.modified_count} users")
    return {"message": f"Suspended {result.modified_count} users"}


# ─── Job Management ─────────────────────────────────────────────────────────

@router.get("/jobs")
async def list_all_jobs(
    status: Optional[str] = None,
    trade: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    admin: dict = Depends(require_admin)
):
    query = {}
    if status:
        query["status"] = status
    if trade:
        query["trade"] = {"$regex": trade, "$options": "i"}
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"contractor_name": {"$regex": search, "$options": "i"}}
        ]
    skip = (page - 1) * limit
    jobs = await db.jobs.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.jobs.count_documents(query)
    return {"jobs": jobs, "total": total, "page": page, "pages": (total + limit - 1) // limit}


@router.get("/jobs/{job_id}")
async def get_job_detail(job_id: str, admin: dict = Depends(require_admin)):
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    # Enrich with crew info
    crew_ids = job.get("crew_accepted", [])
    crew_members = []
    for cid in crew_ids:
        u = await db.users.find_one({"id": cid}, {"_id": 0, "password_hash": 0, "id": 1, "name": 1, "trade": 1, "rating": 1})
        if u:
            crew_members.append(u)
    return {**job, "crew_members": crew_members}


@router.put("/jobs/{job_id}")
async def admin_update_job(job_id: str, data: dict, request: Request, admin: dict = Depends(require_admin)):
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    update = {k: v for k, v in data.items() if v is not None}
    await db.jobs.update_one({"id": job_id}, {"$set": update})
    await log_activity(request, admin, "update_job", "job", job_id, str(update))
    return {"message": "Job updated"}


@router.delete("/jobs/{job_id}")
async def admin_delete_job(job_id: str, request: Request, admin: dict = Depends(require_admin)):
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    await db.jobs.delete_one({"id": job_id})
    await log_activity(request, admin, "delete_job", "job", job_id, f"Deleted job: {job.get('title')}")
    return {"message": "Job deleted"}


@router.post("/jobs/{job_id}/close")
async def admin_close_job(job_id: str, request: Request, admin: dict = Depends(require_admin)):
    await db.jobs.update_one({"id": job_id}, {"$set": {"status": "cancelled"}})
    await log_activity(request, admin, "close_job", "job", job_id)
    return {"message": "Job closed"}


# ─── Map Data ────────────────────────────────────────────────────────────────

@router.get("/map-data")
async def get_map_data(admin: dict = Depends(require_admin)):
    active_jobs = await db.jobs.find(
        {"status": {"$in": ["open", "fulfilled", "in_progress"]}},
        {"_id": 0}
    ).to_list(500)

    crew_with_location = await db.users.find(
        {"role": "crew", "location": {"$ne": None}, "is_active": True},
        {"_id": 0, "password_hash": 0}
    ).to_list(1000)

    return {"jobs": active_jobs, "crew": crew_with_location}


# ─── Trades Management ─────────────────────────────────────────────────────

@router.get("/trades")
async def list_trades(admin: dict = Depends(require_admin)):
    trades = await db.trades.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    return trades


@router.post("/trades")
async def create_trade(data: TradeCreate, request: Request, admin: dict = Depends(require_admin)):
    existing = await db.trades.find_one({"name": {"$regex": f"^{data.name}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail="Trade already exists")
    trade = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "is_active": data.is_active,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.trades.insert_one(trade)
    await log_activity(request, admin, "create_trade", "trade", trade["id"], f"Created: {data.name}")
    return {k: v for k, v in trade.items() if k != "_id"}


@router.put("/trades/{trade_id}")
async def update_trade(trade_id: str, data: TradeUpdate, request: Request, admin: dict = Depends(require_admin)):
    trade = await db.trades.find_one({"id": trade_id})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    await db.trades.update_one({"id": trade_id}, {"$set": update})
    await log_activity(request, admin, "update_trade", "trade", trade_id, str(update))
    return {"message": "Trade updated"}


@router.delete("/trades/{trade_id}")
async def delete_trade(trade_id: str, request: Request, admin: dict = Depends(require_admin)):
    trade = await db.trades.find_one({"id": trade_id})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    await db.trades.delete_one({"id": trade_id})
    await log_activity(request, admin, "delete_trade", "trade", trade_id, f"Deleted: {trade.get('name')}")
    return {"message": "Trade deleted"}


# ─── CMS ─────────────────────────────────────────────────────────────────────

@router.get("/cms/{page}")
async def get_cms_page(page: str, admin: dict = Depends(require_admin)):
    doc = await db.cms.find_one({"page": page}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="CMS page not found")
    return doc


@router.put("/cms/{page}")
async def update_cms_page(page: str, data: CMSUpdate, request: Request, admin: dict = Depends(require_admin)):
    existing = await db.cms.find_one({"page": page})
    version = (existing.get("version", 0) + 1) if existing else 1
    update = {
        "content": data.content,
        "version": version,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "published": data.published if data.published is not None else True,
        "updated_by": admin["id"]
    }
    if data.title:
        update["title"] = data.title
    await db.cms.update_one(
        {"page": page},
        {"$set": update},
        upsert=True
    )
    await log_activity(request, admin, f"update_cms_{page}", "cms", page, f"Updated v{version}")
    return {"message": "CMS updated", "version": version}


# ─── Settings ─────────────────────────────────────────────────────────────────

@router.get("/settings")
async def get_settings(admin: dict = Depends(require_admin)):
    settings = await db.settings.find_one({}, {"_id": 0})
    if not settings:
        settings = {
            "daily_price": 4.99, "weekly_price": 24.99, "monthly_price": 79.99,
            "trial_days": 30, "job_visibility_hours": 12,
            "site_name": "TheDayLaborers", "site_tagline": "A Blue Collar ME Company",
            "site_logo": None, "site_favicon": None
        }
    return settings


@router.put("/settings")
async def update_settings(data: SettingsUpdate, request: Request, admin: dict = Depends(require_admin)):
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    await db.settings.update_one({}, {"$set": update}, upsert=True)
    await log_activity(request, admin, "update_settings", details=str(update))
    return {"message": "Settings updated"}


@router.post("/settings/logo")
async def upload_logo(
    request: Request,
    logo_type: str = Query("logo"),  # logo or favicon
    admin: dict = Depends(require_admin)
):
    if logo_type not in ("logo", "favicon"):
        raise HTTPException(status_code=400, detail="logo_type must be logo or favicon")
    form = await request.form()
    file = form.get("file")
    if not file or not hasattr(file, "read"):
        raise HTTPException(status_code=400, detail="No file provided")
    url = await save_image(file, "site", "cms")
    field = "site_logo" if logo_type == "logo" else "site_favicon"
    await db.settings.update_one({}, {"$set": {field: url}}, upsert=True)
    await log_activity(request, admin, f"upload_{logo_type}", details=url)
    return {"url": url}


# ─── Legacy Terms (backward compat) ─────────────────────────────────────────

@router.get("/terms")
async def get_terms(admin: dict = Depends(require_admin)):
    terms = await db.cms.find_one({"page": "terms"}, {"_id": 0})
    return terms or {"content": "Terms and Conditions will be added here.", "version": 1}


@router.put("/terms")
async def update_terms(data: TermsUpdate, request: Request, admin: dict = Depends(require_admin)):
    existing = await db.cms.find_one({"page": "terms"})
    version = (existing.get("version", 0) + 1) if existing else 1
    await db.cms.update_one(
        {"page": "terms"},
        {"$set": {"content": data.content, "version": version, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    await log_activity(request, admin, "update_terms", details=f"v{version}")
    return {"message": "Terms updated", "version": version}


# ─── Payments ────────────────────────────────────────────────────────────────

@router.get("/payments")
async def list_payments(
    page: int = 1,
    limit: int = 30,
    admin: dict = Depends(require_admin)
):
    skip = (page - 1) * limit
    payments = await db.payment_transactions.find({}, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.payment_transactions.count_documents({})
    return {"payments": payments, "total": total, "page": page}


# ─── Bulk Email ──────────────────────────────────────────────────────────────

@router.post("/bulk-email")
async def send_bulk_email(data: BulkEmailRequest, request: Request, admin: dict = Depends(require_admin)):
    query = {}
    if data.target == "crew":
        query["role"] = "crew"
    elif data.target == "contractor":
        query["role"] = "contractor"
    else:
        query["role"] = {"$in": ["crew", "contractor"]}
    query["is_active"] = True

    users = await db.users.find(query, {"_id": 0, "email": 1, "name": 1}).to_list(5000)
    sent = 0
    failed = 0

    try:
        from utils.email_utils import send_bulk_email_to_users
        result = await send_bulk_email_to_users(users, data.subject, data.body)
        sent = result.get("sent", len(users))
        failed = result.get("failed", 0)
    except Exception as e:
        logger.warning(f"Bulk email error: {e}")
        sent = 0
        failed = len(users)

    await log_activity(
        request, admin, "bulk_email",
        details=f"Target: {data.target}, Subject: {data.subject}, Sent: {sent}"
    )
    return {"message": f"Email queued for {len(users)} users", "sent": sent, "failed": failed, "total": len(users)}


# ─── Activity Log ────────────────────────────────────────────────────────────

@router.get("/activity-log")
async def get_activity_log(
    page: int = 1,
    limit: int = 50,
    admin_id: Optional[str] = None,
    action: Optional[str] = None,
    admin: dict = Depends(require_admin)
):
    query = {}
    if admin_id:
        query["admin_id"] = admin_id
    if action:
        query["action"] = {"$regex": action, "$options": "i"}

    skip = (page - 1) * limit
    logs = await db.admin_activity_log.find(query, {"_id": 0}).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.admin_activity_log.count_documents(query)
    return {"logs": logs, "total": total, "page": page, "pages": (total + limit - 1) // limit}


# ─── Super Admin: Export/Import ──────────────────────────────────────────────

@router.get("/export/users/csv")
async def export_users_csv(admin: dict = Depends(require_super_admin), request: Request = None):
    users = await db.users.find(
        {}, {"_id": 0, "password_hash": 0}
    ).to_list(10000)

    output = io.StringIO()
    if users:
        fields = ["id", "email", "name", "role", "phone", "trade", "is_active",
                  "subscription_status", "points", "rating", "jobs_completed", "created_at"]
        writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(users)

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users_export.csv"}
    )


@router.get("/export/users/json")
async def export_users_json(admin: dict = Depends(require_super_admin)):
    users = await db.users.find(
        {}, {"_id": 0, "password_hash": 0}
    ).to_list(10000)
    return StreamingResponse(
        iter([json.dumps(users, default=str, indent=2)]),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=users_export.json"}
    )


@router.post("/import/users/csv")
async def import_users_csv(request: Request, admin: dict = Depends(require_super_admin)):
    import secrets
    from auth import hash_password, validate_password_strength
    form = await request.form()
    file = form.get("file")
    if not file:
        raise HTTPException(status_code=400, detail="No file provided")

    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode("utf-8")))
    imported = 0
    errors = []
    now = datetime.now(timezone.utc).isoformat()
    import random, string

    for row in reader:
        try:
            email = row.get("email", "").lower().strip()
            if not email:
                continue
            existing = await db.users.find_one({"email": email})
            if existing:
                continue
            role = (row.get("role") or "crew").strip()
            if role not in ("crew", "contractor"):
                errors.append(f"{email}: role must be crew or contractor")
                continue
            password = row.get("password") or ""
            if validate_password_strength(password):
                password = secrets.token_urlsafe(24)  # unusable until the user resets it
            code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
            user_doc = {
                "id": str(uuid.uuid4()),
                "email": email,
                "password_hash": hash_password(password),
                "role": role,
                "name": row.get("name", email),
                "phone": row.get("phone", None),
                "is_active": True, "is_verified": False,
                "created_at": now,
                "trial_start_date": now,
                "subscription_status": "trial",
                "points": 50, "referral_code": code,
                "bio": "", "trade": row.get("trade", ""),
                "skills": [], "profile_photo": None,
                "availability": True, "location": None,
                "rating": 0.0, "rating_count": 0, "jobs_completed": 0,
                "company_name": row.get("company_name", ""),
                "logo": None, "hide_location": False, "favorite_crew": []
            }
            await db.users.insert_one(user_doc)
            imported += 1
        except Exception as e:
            errors.append(str(e))

    await log_activity(request, admin, "import_users_csv", details=f"Imported {imported} users")
    return {"imported": imported, "errors": errors[:10]}


# ─── Seed Data ───────────────────────────────────────────────────────────────

@router.post("/seed")
async def seed_data(request: Request, admin: dict = Depends(require_super_admin)):
    from auth import hash_password
    import random
    from datetime import datetime, timezone, timedelta

    now = datetime.now(timezone.utc)
    trades_list = ["Carpentry", "Electrical", "Plumbing", "Painting", "General Labor"]
    seed_users = []
    seed_jobs = []

    # Create 5 crew and 3 contractors
    for i in range(1, 6):
        uid = str(uuid.uuid4())
        email = f"seed_crew_{i}@thedaylaborers.com"
        existing = await db.users.find_one({"email": email})
        if not existing:
            import string as strmod
            code = ''.join(random.choices(strmod.ascii_uppercase + strmod.digits, k=8))
            seed_users.append({
                "id": uid, "email": email,
                "password_hash": hash_password("Crew@123"),
                "role": "crew",
                "name": f"Seed Crew {i}",
                "phone": f"555-000{i}",
                "is_active": True, "is_verified": True,
                "created_at": now.isoformat(),
                "trial_start_date": now.isoformat(),
                "trial_end_date": (now + timedelta(days=30)).isoformat(),
                "subscription_status": "trial",
                "subscription_plan": None, "subscription_end": None,
                "points": random.randint(50, 500),
                "referral_code": code, "referred_by": None,
                "bio": f"Experienced {trades_list[i-1]} worker",
                "trade": trades_list[i-1],
                "skills": [trades_list[i-1], "General Labor"],
                "profile_photo": None, "availability": True,
                "location": {"lat": 25.7617 + random.uniform(-0.1, 0.1), "lng": -80.1918 + random.uniform(-0.1, 0.1), "city": "Miami"},
                "rating": round(random.uniform(3.5, 5.0), 1),
                "rating_count": random.randint(2, 20),
                "jobs_completed": random.randint(5, 50),
                "company_name": "", "logo": None, "hide_location": False, "favorite_crew": [],
                "transportation": random.choice(["car", "truck", "bike"])
            })

    for i in range(1, 4):
        uid = str(uuid.uuid4())
        email = f"seed_contractor_{i}@thedaylaborers.com"
        existing = await db.users.find_one({"email": email})
        if not existing:
            import string as strmod
            code = ''.join(random.choices(strmod.ascii_uppercase + strmod.digits, k=8))
            seed_users.append({
                "id": uid, "email": email,
                "password_hash": hash_password("Contractor@123"),
                "role": "contractor",
                "name": f"Seed Contractor {i}",
                "phone": f"555-001{i}",
                "is_active": True, "is_verified": True,
                "created_at": now.isoformat(),
                "trial_start_date": now.isoformat(),
                "trial_end_date": (now + timedelta(days=30)).isoformat(),
                "subscription_status": "trial",
                "subscription_plan": None, "subscription_end": None,
                "points": random.randint(50, 200),
                "referral_code": code, "referred_by": None,
                "bio": "", "trade": "", "skills": [],
                "profile_photo": None, "availability": True,
                "location": {"lat": 25.7617 + random.uniform(-0.1, 0.1), "lng": -80.1918 + random.uniform(-0.1, 0.1), "city": "Miami"},
                "rating": round(random.uniform(3.0, 5.0), 1),
                "rating_count": random.randint(1, 10),
                "jobs_completed": 0,
                "company_name": f"Seed Construction Co {i}",
                "logo": None, "hide_location": False, "favorite_crew": []
            })

    if seed_users:
        await db.users.insert_many(seed_users)

    # Create 10 seed jobs
    contractor_ids = [u["id"] for u in seed_users if u["role"] == "contractor"]
    if contractor_ids:
        statuses = ["open", "open", "fulfilled", "in_progress", "completed", "open", "open", "fulfilled", "open", "in_progress"]
        for i in range(10):
            jid = str(uuid.uuid4())
            trade = trades_list[i % len(trades_list)]
            contractor_id = contractor_ids[i % len(contractor_ids)]
            contractor_user = next((u for u in seed_users if u["id"] == contractor_id), None)
            seed_jobs.append({
                "id": jid,
                "contractor_id": contractor_id,
                "contractor_name": contractor_user["company_name"] if contractor_user else "Seed Contractor",
                "title": f"Seed Job {i+1}: {trade} Work",
                "description": f"Need experienced {trade} workers for a project.",
                "trade": trade,
                "crew_needed": random.randint(1, 4),
                "crew_accepted": [],
                "start_time": (now + timedelta(days=random.randint(1, 10))).isoformat(),
                "pay_rate": round(random.uniform(15, 45), 2),
                "location": {"lat": 25.7617 + random.uniform(-0.2, 0.2), "lng": -80.1918 + random.uniform(-0.2, 0.2), "city": "Miami", "address": f"{100+i} Main St, Miami FL"},
                "status": statuses[i],
                "is_emergency": i % 4 == 0,
                "created_at": (now - timedelta(hours=random.randint(1, 48))).isoformat(),
                "completed_at": now.isoformat() if statuses[i] == "completed" else None,
                "rated_crew": [], "rated_by_crew": []
            })
        await db.jobs.insert_many(seed_jobs)

    await log_activity(request, admin, "seed_data", details=f"Seeded {len(seed_users)} users, {len(seed_jobs)} jobs")
    return {
        "message": "Seed data created",
        "users_created": len(seed_users),
        "jobs_created": len(seed_jobs),
        "crew_password": "Crew@123",
        "contractor_password": "Contractor@123"
    }


# ─── Messaging System ─────────────────────────────────────────────────────────

@router.post("/messages/send")
async def send_message(data: MessageCreate, request: Request, admin: dict = Depends(require_admin)):
    """Admin sends a message to any user."""
    recipient = await db.users.find_one({"id": data.recipient_id}, {"_id": 0, "id": 1, "name": 1, "email": 1})
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    now = datetime.now(timezone.utc).isoformat()
    thread_id = str(uuid.uuid4())

    message_doc = {
        "id": str(uuid.uuid4()),
        "thread_id": thread_id,
        "sender_id": admin["id"],
        "sender_name": admin.get("name", "Admin"),
        "sender_role": admin.get("role", "admin"),
        "recipient_id": data.recipient_id,
        "recipient_name": recipient["name"],
        "subject": data.subject,
        "body": data.body,
        "read": False,
        "created_at": now,
        "replies": []
    }
    await db.messages.insert_one(message_doc)

    # Create in-app notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": data.recipient_id,
        "type": "admin_message",
        "title": f"Message from Admin: {data.subject}",
        "message": data.body[:100] + ("..." if len(data.body) > 100 else ""),
        "thread_id": thread_id,
        "read": False,
        "created_at": now
    })

    await log_activity(request, admin, "send_message", target_type="user", target_id=data.recipient_id, details=f"Subject: {data.subject}")
    return {"message": "Message sent", "thread_id": thread_id}


@router.get("/messages")
async def get_admin_messages(admin: dict = Depends(require_admin)):
    """Get all messages sent/received by admin."""
    messages = await db.messages.find(
        {"$or": [{"sender_id": admin["id"]}, {"recipient_id": admin["id"]}]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return messages


@router.get("/messages/archived")
async def get_archived_messages(admin: dict = Depends(require_admin), search: str = None, limit: int = 50):
    query = {}
    if search:
        query["$or"] = [
            {"sender_name": {"$regex": search, "$options": "i"}},
            {"recipient_name": {"$regex": search, "$options": "i"}},
            {"subject": {"$regex": search, "$options": "i"}},
        ]
    msgs = await db.archived_messages.find(query, {"_id": 0}).sort("archived_at", -1).limit(limit).to_list(limit)
    return msgs


@router.get("/messages/export")
async def export_messages(admin: dict = Depends(require_admin)):
    msgs = await db.messages.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    rows = []
    for m in msgs:
        rows.append({
            "date": m.get("created_at", ""),
            "from": m.get("sender_name", ""),
            "to": m.get("recipient_name", ""),
            "subject": m.get("subject", ""),
            "message": m.get("body", ""),
            "thread_id": m.get("thread_id", ""),
            "read": m.get("read", False),
            "reply_count": len(m.get("replies", []))
        })
    return rows


@router.get("/messages/{thread_id}")
async def get_thread(thread_id: str, admin: dict = Depends(require_admin)):
    """Get a full message thread."""
    msg = await db.messages.find_one({"thread_id": thread_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Thread not found")
    return msg


@router.post("/messages/{thread_id}/reply")
async def admin_reply(thread_id: str, data: MessageReply, admin: dict = Depends(require_admin)):
    """Admin replies to a message thread."""
    msg = await db.messages.find_one({"thread_id": thread_id})
    if not msg:
        raise HTTPException(status_code=404, detail="Thread not found")

    now = datetime.now(timezone.utc).isoformat()
    reply = {
        "id": str(uuid.uuid4()),
        "sender_id": admin["id"],
        "sender_name": admin.get("name", "Admin"),
        "sender_role": admin.get("role", "admin"),
        "body": data.body,
        "created_at": now
    }
    await db.messages.update_one({"thread_id": thread_id}, {"$push": {"replies": reply}})

    # Notify the other party
    other_id = msg["recipient_id"] if msg["sender_id"] == admin["id"] else msg["sender_id"]
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": other_id,
        "type": "admin_message",
        "title": f"Reply: {msg['subject']}",
        "message": data.body[:100],
        "thread_id": thread_id,
        "read": False,
        "created_at": now
    })
    return {"message": "Reply sent"}


# ─── User Messages (crew/contractor side) ─────────────────────────────────────

@router.get("/users/{user_id}/messages")
async def get_user_messages(user_id: str, admin: dict = Depends(require_admin)):
    messages = await db.messages.find(
        {"$or": [{"sender_id": user_id}, {"recipient_id": user_id}]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return messages


# ─── Admin: Reset User Password ───────────────────────────────────────────────

@router.post("/users/{user_id}/reset-password")
async def admin_reset_password(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    """Admin resets a user's password to a temporary one."""
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if is_protected(target, admin):
        raise HTTPException(status_code=403, detail="Cannot reset this user's password")

    import secrets
    from auth import hash_password
    temp_password = "Tmp@" + secrets.token_urlsafe(12) + "a1"
    await db.users.update_one({"id": user_id}, {"$set": {"password_hash": hash_password(temp_password)}})
    await bump_token_version(user_id)

    await log_activity(request, admin, "reset_password", target_type="user", target_id=user_id, details=f"Password reset for {target['name']}")
    return {"message": "Password reset successfully", "temp_password": temp_password}


# ─── Emergency Job Pricing ─────────────────────────────────────────────────────

@router.get("/settings/emergency-price")
async def get_emergency_price(admin: dict = Depends(require_admin)):
    settings = await db.settings.find_one({}, {"_id": 0})
    return {"emergency_job_price": (settings or {}).get("emergency_job_price", 9.99)}


@router.put("/settings/emergency-price")
async def set_emergency_price(request: Request, admin: dict = Depends(require_admin)):
    body = await request.json()
    price = body.get("price")
    if price is None or float(price) < 0:
        raise HTTPException(status_code=400, detail="Valid price required")
    await db.settings.update_one({}, {"$set": {"emergency_job_price": float(price)}})
    await log_activity(request, admin, "update_emergency_price", details=f"Price set to ${price}")
    return {"message": "Emergency price updated", "emergency_job_price": float(price)}



# ─── Coupon Management ────────────────────────────────────────────────────────

@router.post("/coupons")
async def create_coupon(data: CouponCreate, request: Request, admin: dict = Depends(require_admin)):
    existing = await db.coupons.find_one({"code": data.code.upper()})
    if existing:
        raise HTTPException(status_code=400, detail="Coupon code already exists")
    coupon_doc = {
        "id": str(uuid.uuid4()),
        "code": data.code.upper(),
        "discount_percent": data.discount_percent,
        "usage_limit": data.usage_limit,
        "usage_count": 0,
        "expires_at": data.expires_at,
        "plan_restriction": data.plan_restriction,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": admin["id"]
    }
    await db.coupons.insert_one(coupon_doc)
    await log_activity(request, admin, "create_coupon", details=f"Code: {data.code}")
    return {k: v for k, v in coupon_doc.items() if k != "_id"}


@router.get("/coupons")
async def list_coupons(admin: dict = Depends(require_admin)):
    coupons = await db.coupons.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return coupons


@router.delete("/coupons/{coupon_id}")
async def delete_coupon(coupon_id: str, request: Request, admin: dict = Depends(require_admin)):
    result = await db.coupons.delete_one({"id": coupon_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Coupon not found")
    await log_activity(request, admin, "delete_coupon", details=f"ID: {coupon_id}")
    return {"message": "Coupon deleted"}


# ─── Archived Messages delete/restore (already defined above, delete/restore still needed) ───


@router.put("/settings/trials")
async def set_trial_settings(request: Request, admin: dict = Depends(require_admin)):
    body = await request.json()
    updates = {}
    if "crew_trial_days" in body:
        updates["crew_trial_days"] = int(body["crew_trial_days"])
    if "contractor_trial_days" in body:
        updates["contractor_trial_days"] = int(body["contractor_trial_days"])
    if updates:
        await db.settings.update_one({}, {"$set": updates}, upsert=True)
    return {"message": "Trial settings updated", **updates}


@router.get("/settings/trials")
async def get_trial_settings(admin: dict = Depends(require_admin)):
    settings = await db.settings.find_one({}, {"_id": 0})
    return {
        "crew_trial_days": (settings or {}).get("crew_trial_days", 30),
        "contractor_trial_days": (settings or {}).get("contractor_trial_days", 14)
    }



# ─── Archive / Unarchive Messages ─────────────────────────────────────────────

@router.post("/messages/{thread_id}/archive")
async def archive_message(thread_id: str, request: Request, admin: dict = Depends(require_admin)):
    """Move a message thread to archived_messages collection."""
    msg = await db.messages.find_one({"thread_id": thread_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Thread not found")
    archived = {**msg, "archived_at": datetime.now(timezone.utc).isoformat(), "archived_by": admin["id"]}
    await db.archived_messages.replace_one({"thread_id": thread_id}, archived, upsert=True)
    await db.messages.delete_one({"thread_id": thread_id})
    await log_activity(request, admin, "archive_message", target_type="message", target_id=thread_id)
    return {"message": "Thread archived"}


@router.post("/messages/{thread_id}/unarchive")
async def unarchive_message(thread_id: str, request: Request, admin: dict = Depends(require_admin)):
    """Restore an archived message thread back to active messages."""
    msg = await db.archived_messages.find_one({"thread_id": thread_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Archived thread not found")
    restored = {k: v for k, v in msg.items() if k not in ("archived_at", "archived_by")}
    await db.messages.replace_one({"thread_id": thread_id}, restored, upsert=True)
    await db.archived_messages.delete_one({"thread_id": thread_id})
    await log_activity(request, admin, "unarchive_message", target_type="message", target_id=thread_id)
    return {"message": "Thread restored"}


@router.delete("/messages/{thread_id}")
async def delete_message(thread_id: str, request: Request, admin: dict = Depends(require_admin)):
    """Permanently delete a message thread from either collection."""
    r1 = await db.messages.delete_one({"thread_id": thread_id})
    r2 = await db.archived_messages.delete_one({"thread_id": thread_id})
    if r1.deleted_count == 0 and r2.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Thread not found")
    await log_activity(request, admin, "delete_message", target_type="message", target_id=thread_id)
    return {"message": "Thread deleted"}


# ─── Verified Contractors (Admin) ─────────────────────────────────────────────

@router.get("/verified-contractors")
async def list_verified_contractors(admin: dict = Depends(require_admin), state: str = None, trade: str = None, limit: int = 100):
    query: dict = {"role": "contractor", "is_verified_contractor": True}
    if state:
        query["location.state"] = {"$regex": state, "$options": "i"}
    if trade:
        query["trade"] = {"$regex": trade, "$options": "i"}
    docs = await db.users.find(query, {"_id": 0, "password_hash": 0}).limit(limit).to_list(limit)
    return docs


@router.put("/verified-contractors/{user_id}")
async def set_verified_contractor(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    body = await request.json()
    is_verified = body.get("is_verified_contractor", True)
    revoke_note = body.get("revoke_note", "")

    user = await db.users.find_one({"id": user_id, "role": "contractor"}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Contractor not found")

    update_fields: dict = {"is_verified_contractor": is_verified}
    if not is_verified:
        update_fields["verified_revoked_at"] = datetime.now(timezone.utc).isoformat()
        update_fields["verified_revoke_note"] = revoke_note
    else:
        update_fields["verified_at"] = datetime.now(timezone.utc).isoformat()
        update_fields.pop("verified_revoked_at", None)

    await db.users.update_one({"id": user_id}, {"$set": update_fields})

    # Send revocation email if being revoked
    if not is_verified:
        try:
            from utils.email_utils import send_revoke_verified_email
            await send_revoke_verified_email(
                email=user["email"],
                name=user["name"],
                company_name=user.get("company_name", ""),
                note=revoke_note
            )
        except Exception:
            pass

    await log_activity(request, admin, "update_verified_contractor", target_type="user", target_id=user_id,
                       details=f"verified={is_verified}" + (f", note={revoke_note}" if revoke_note else ""))
    return {"message": "Verified status updated"}


@router.get("/settings/verified-contractor-fee")
async def get_verified_fee(admin: dict = Depends(require_admin)):
    settings = await db.settings.find_one({}, {"_id": 0})
    return {
        "verified_contractor_fee": (settings or {}).get("verified_contractor_fee", 39.99),
        "verified_page_header": (settings or {}).get("verified_page_header", "FIND VERIFIED CONTRACTORS"),
        "verified_page_tagline": (settings or {}).get("verified_page_tagline", "For property owners, apartments and home owners.")
    }


@router.put("/settings/verified-contractor-fee")
async def set_verified_fee(request: Request, admin: dict = Depends(require_admin)):
    body = await request.json()
    updates = {}
    if "fee" in body:
        updates["verified_contractor_fee"] = float(body["fee"])
    if "header" in body:
        updates["verified_page_header"] = body["header"]
    if "tagline" in body:
        updates["verified_page_tagline"] = body["tagline"]
    if updates:
        await db.settings.update_one({}, {"$set": updates}, upsert=True)
    await log_activity(request, admin, "update_verified_fee", details=str(updates))
    return {"message": "Settings updated", **updates}


# ─── Push Notification Subscriptions ─────────────────────────────────────────

@router.post("/push/subscribe")
async def save_push_subscription(request: Request, current_user: dict = Depends(get_current_user)):
    body = await request.json()
    endpoint = body.get("endpoint")
    if not endpoint:
        raise HTTPException(status_code=400, detail="endpoint required")
    await db.push_subscriptions.replace_one(
        {"user_id": current_user["id"], "endpoint": endpoint},
        {"user_id": current_user["id"], "endpoint": endpoint, "keys": body.get("keys", {}), "created_at": datetime.now(timezone.utc).isoformat()},
        upsert=True
    )
    return {"message": "Subscription saved"}



@router.put("/ratings/{rating_id}/moderate")
async def moderate_rating(rating_id: str, request: Request, admin: dict = Depends(require_admin)):
    """Hide or restore a review; the rated user's average is recalculated and the action logged."""
    body = await request.json()
    hidden = bool(body.get("hidden", True))
    reason = str(body.get("reason", ""))[:300]
    rating = await db.ratings.find_one({"id": rating_id}, {"_id": 0})
    if not rating:
        raise HTTPException(status_code=404, detail="Rating not found")
    await db.ratings.update_one({"id": rating_id}, {"$set": {"hidden": hidden, "moderation_reason": reason, "moderated_by": admin["id"]}})
    visible = await db.ratings.find({"rated_id": rating["rated_id"], "hidden": {"$ne": True}}, {"_id": 0, "stars": 1}).to_list(5000)
    avg = round(sum(r["stars"] for r in visible) / len(visible), 1) if visible else 0
    await db.users.update_one({"id": rating["rated_id"]}, {"$set": {"rating": avg, "rating_count": len(visible)}})
    await log_activity(request, admin, "hide_rating" if hidden else "restore_rating", "rating", rating_id, reason)
    return {"message": "Rating updated", "rating": avg, "rating_count": len(visible)}
