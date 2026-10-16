import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from database import db
from auth import get_current_user, user_to_response
from models import JobCreate, JobUpdate, RatingCreate
from utils.geocoding import geocode_address, valid_coords, distance_between
from utils.email_utils import send_job_completion_email
from utils.ai_utils import generate_smart_job_matches
from typing import Optional
import logging

logger = logging.getLogger(__name__)

def now_str():
    return datetime.now(timezone.utc).isoformat()

router = APIRouter()


@router.post("/", status_code=201)
async def create_job(data: JobCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "contractor":
        raise HTTPException(status_code=403, detail="Only contractors can post jobs")
    from routes.payment_routes import consume_job_post_credit
    await consume_job_post_credit(current_user)

    coords = valid_coords(data.lat, data.lng)
    if coords:
        location = {"address": data.address, "lat": coords[0], "lng": coords[1], "city": data.city or "", "state": data.state or ""}
    else:
        location = await geocode_address(data.address)
    if not location:
        from routes.payment_routes import refund_job_post_credit
        await refund_job_post_credit(current_user)
        raise HTTPException(status_code=400, detail="We couldn't locate that address. Please pick a suggested address.")
    images = _validated_job_images(data.images, current_user["id"])

    job_doc = {
        "id": str(uuid.uuid4()),
        "contractor_id": current_user["id"],
        "contractor_name": current_user.get("company_name") or current_user["name"],
        "contractor_photo": current_user.get("logo") or current_user.get("profile_photo"),
        "title": data.title,
        "description": data.description,
        "trade": data.trade,
        "crew_needed": data.crew_needed,
        "crew_accepted": [],
        "start_time": data.start_time,
        "end_time": data.end_time,
        "pay_rate": data.pay_rate,
        "location": location,
        "status": "open",
        "is_emergency": data.is_emergency,
        "created_at": now_str(),
        "completed_at": None,
        "rated_crew": [],
        "rated_by_crew": [],
        "invited_crew": [],
        "images": images,
    }

    await db.jobs.insert_one(job_doc)

    # Broadcast via WebSocket
    try:
        from routes.ws_routes import manager
        await manager.broadcast_new_job(job_doc)
    except Exception as e:
        logger.warning(f"WS broadcast failed: {e}")

    # Trigger AI matching in background (non-blocking)
    import asyncio
    asyncio.create_task(_run_ai_match(job_doc))

    return {k: v for k, v in job_doc.items() if k != "_id"}


def _validated_job_images(images, user_id: str) -> list:
    images = images or []
    prefix = f"/api/public/files/thedaylaborers/job_images/{user_id}/"
    if len(images) > 6 or any(not isinstance(u, str) or not u.startswith(prefix) for u in images):
        raise HTTPException(status_code=400, detail="Job images must be up to 6 of your uploaded images")
    return images


@router.get("/")
async def list_jobs(
    status: Optional[str] = None,
    trade: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius: Optional[float] = 25,
    smart_match: Optional[bool] = False,
    current_user: dict = Depends(get_current_user)
):
    query = {}

    if current_user["role"] == "contractor":
        # Contractors only see their own jobs
        query["contractor_id"] = current_user["id"]
    else:
        # Crew sees all open/fulfilled jobs
        if status:
            query["status"] = status
        else:
            query["status"] = {"$in": ["open", "fulfilled"]}

    if trade:
        query["trade"] = trade

    jobs = await db.jobs.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)

    # Filter by radius if location provided (jobs without valid coordinates are excluded)
    origin = valid_coords(lat, lng)
    if origin:
        radius = min(max(radius or 25, 1), 250)
        jobs = [j for j in jobs if (d := distance_between(origin, valid_coords((j.get("location") or {}).get("lat"), (j.get("location") or {}).get("lng")))) is not None and d <= radius]

    # AI smart matching for crew
    if smart_match and current_user["role"] == "crew" and jobs:
        jobs = await generate_smart_job_matches(jobs, current_user)

    return jobs


@router.get("/my-jobs")
async def my_jobs(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "contractor":
        jobs = await db.jobs.find({"contractor_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    else:
        jobs = await db.jobs.find(
            {"crew_accepted": current_user["id"]},
            {"_id": 0}
        ).sort("created_at", -1).to_list(100)
    return jobs


@router.get("/{job_id}")
async def get_job(job_id: str, current_user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.put("/{job_id}")
async def update_job(job_id: str, data: JobUpdate, current_user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["contractor_id"] != current_user["id"] and current_user["role"] not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    if job["status"] not in ("open", "fulfilled", "suspended"):
        raise HTTPException(status_code=400, detail=f"A {job['status']} job can no longer be edited")

    update = {k: v for k, v in data.model_dump().items() if v is not None}
    update.pop("status", None)  # status changes only through workflow endpoints
    if "crew_needed" in update:
        if update["crew_needed"] < max(1, len(job.get("crew_accepted", []))):
            raise HTTPException(status_code=400, detail="Crew needed cannot be less than crew already accepted")
        if job["status"] in ("open", "fulfilled"):
            update["status"] = "fulfilled" if len(job.get("crew_accepted", [])) >= update["crew_needed"] else "open"
    if update:
        await db.jobs.update_one({"id": job_id}, {"$set": update})
    return {"message": "Job updated"}


@router.delete("/{job_id}")
async def delete_job(job_id: str, current_user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["contractor_id"] != current_user["id"] and current_user["role"] not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    if job.get("crew_accepted") and current_user["role"] not in ("admin", "super_admin"):
        raise HTTPException(status_code=400, detail="Jobs with accepted crew must be cancelled, not deleted")
    await db.jobs.delete_one({"id": job_id})
    return {"message": "Job deleted"}


@router.post("/{job_id}/accept")
async def accept_job(job_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "crew":
        raise HTTPException(status_code=403, detail="Only crew members can accept jobs")

    from routes.payment_routes import require_active_subscription
    require_active_subscription(current_user)
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if current_user["id"] in job["crew_accepted"]:
        raise HTTPException(status_code=400, detail="Already accepted this job")
    if job["status"] != "open":
        raise HTTPException(status_code=400, detail=f"Job is {job['status']}, cannot accept")

    # Atomic: only succeeds while the job is open, not full, and the crew member isn't already on it
    job = await db.jobs.find_one_and_update(
        {"id": job_id, "status": "open", "crew_accepted": {"$ne": current_user["id"]},
         "$expr": {"$lt": [{"$size": "$crew_accepted"}, "$crew_needed"]}},
        {"$push": {"crew_accepted": current_user["id"]}, "$pull": {"invited_crew": current_user["id"]}},
        return_document=True, projection={"_id": 0},
    )
    if not job:
        raise HTTPException(status_code=409, detail="This job is no longer accepting crew")
    new_crew = job["crew_accepted"]
    new_status = "open"
    if len(new_crew) >= job["crew_needed"]:
        await db.jobs.update_one({"id": job_id, "status": "open"}, {"$set": {"status": "fulfilled"}})
        new_status = "fulfilled"

    # Notify contractor via WebSocket
    try:
        from routes.ws_routes import manager
        await manager.send_to_user(job["contractor_id"], {
            "type": "job_accepted",
            "job_id": job_id,
            "crew_name": current_user["name"],
            "crew_count": len(new_crew),
            "crew_needed": job["crew_needed"]
        })
    except Exception:
        pass

    # Send push notification to contractor
    try:
        from utils.push_utils import send_push_notification
        await send_push_notification(db, job["contractor_id"], "job_accepted", job_title=job.get("title", ""), crew_name=current_user["name"])
    except Exception:
        pass

    return {"message": "Job accepted", "status": new_status}


@router.post("/{job_id}/start")
async def start_job(job_id: str, current_user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["contractor_id"] != current_user["id"] and current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only the contractor can start this job")
    if not job.get("crew_accepted"):
        raise HTTPException(status_code=400, detail="At least one crew member must accept before starting")
    result = await db.jobs.update_one({"id": job_id, "status": {"$in": ["open", "fulfilled"]}},
                                      {"$set": {"status": "in_progress", "started_at": now_str()}})
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Job cannot be started in current status")
    return {"message": "Job started"}


@router.post("/{job_id}/complete")
async def complete_job(job_id: str, current_user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if current_user["id"] not in job.get("crew_accepted", []):
        raise HTTPException(status_code=403, detail="Not a crew member on this job")
    result = await db.jobs.update_one({"id": job_id, "status": "in_progress"},
                                      {"$set": {"status": "completed_pending_review"}})
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Job must be in_progress to complete")

    # Notify contractor
    contractor = await db.users.find_one({"id": job["contractor_id"]}, {"_id": 0})
    if contractor:
        await send_job_completion_email(contractor["email"], contractor["name"], job["title"])
        try:
            from routes.ws_routes import manager
            await manager.send_to_user(job["contractor_id"], {
                "type": "job_completed",
                "job_id": job_id,
                "job_title": job["title"]
            })
        except Exception:
            pass
        # Push notification
        try:
            from utils.push_utils import send_push_notification
            await send_push_notification(db, job["contractor_id"], "job_completed", job_title=job.get("title", ""))
        except Exception:
            pass

    return {"message": "Job marked complete, awaiting contractor review"}


@router.post("/{job_id}/verify")
async def verify_job(job_id: str, current_user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["contractor_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the contractor can verify")
    now = now_str()
    result = await db.jobs.update_one({"id": job_id, "status": "completed_pending_review"},
                                      {"$set": {"status": "completed", "completed_at": now}})
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Job not pending review")

    # Award points to crew members
    for crew_id in job.get("crew_accepted", []):
        await db.users.update_one(
            {"id": crew_id},
            {"$inc": {"points": 50, "jobs_completed": 1}}
        )

    return {"message": "Job verified and completed"}


@router.post("/{job_id}/rate")
async def rate_user(job_id: str, data: RatingCreate, current_user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail="Can only rate after the contractor verifies completion")

    # Contractor rates accepted crew; crew rate the contractor
    is_contractor = job["contractor_id"] == current_user["id"]
    is_crew = current_user["id"] in job.get("crew_accepted", [])
    if not (is_contractor or is_crew):
        raise HTTPException(status_code=403, detail="Not part of this job")
    if data.rated_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="You cannot rate yourself")
    if is_contractor and data.rated_id not in job.get("crew_accepted", []):
        raise HTTPException(status_code=400, detail="You can only rate crew who worked this job")
    if is_crew and data.rated_id != job["contractor_id"]:
        raise HTTPException(status_code=400, detail="Crew can only rate the job's contractor")
    if data.review and len(data.review) > 1000:
        raise HTTPException(status_code=400, detail="Review is too long")

    # Check no duplicate rating
    existing = await db.ratings.find_one({
        "job_id": job_id,
        "rater_id": current_user["id"],
        "rated_id": data.rated_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Already rated this person for this job")

    if not 1 <= data.stars <= 5:
        raise HTTPException(status_code=400, detail="Stars must be 1-5")

    rating_doc = {
        "id": str(uuid.uuid4()),
        "rater_id": current_user["id"],
        "rated_id": data.rated_id,
        "job_id": job_id,
        "stars": data.stars,
        "review": data.review,
        "created_at": now_str()
    }
    from pymongo.errors import DuplicateKeyError
    try:
        await db.ratings.insert_one(rating_doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Already rated this person for this job")
    field = "rated_crew" if is_contractor else "rated_by_crew"
    await db.jobs.update_one({"id": job_id}, {"$addToSet": {field: data.rated_id if is_contractor else current_user["id"]}})

    # Update average rating (hidden/moderated reviews excluded)
    all_ratings = await db.ratings.find({"rated_id": data.rated_id, "hidden": {"$ne": True}}, {"_id": 0, "stars": 1}).to_list(5000)
    avg = sum(r["stars"] for r in all_ratings) / len(all_ratings) if all_ratings else 0
    await db.users.update_one(
        {"id": data.rated_id},
        {"$set": {"rating": round(avg, 1), "rating_count": len(all_ratings)}}
    )

    return {"message": "Rating submitted", "rating": {k: v for k, v in rating_doc.items() if k != "_id"}}


@router.get("/{job_id}/ratings")
async def get_job_ratings(job_id: str, current_user: dict = Depends(get_current_user)):
    ratings = await db.ratings.find({"job_id": job_id, "hidden": {"$ne": True}}, {"_id": 0}).to_list(100)
    return ratings


# ─── Contractor: Cancel / Suspend Job ─────────────────────────────────────────

@router.post("/{job_id}/cancel")
async def cancel_job(job_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    from pydantic import BaseModel
    from typing import Optional

    body = await request.json() if request.headers.get("content-type") == "application/json" else {}
    reason = body.get("reason", "") if isinstance(body, dict) else ""

    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    is_contractor = job["contractor_id"] == current_user["id"]
    is_admin = current_user.get("role") in ("admin", "super_admin")
    if not (is_contractor or is_admin):
        raise HTTPException(status_code=403, detail="Only the contractor can cancel this job")

    if job["status"] in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Cannot cancel a {job['status']} job")

    # Keep job visible for 12h after cancel (admin-defined)
    settings = await db.settings.find_one({}, {"_id": 0}) or {}
    visibility_hours = settings.get("job_visibility_hours", 12)
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=visibility_hours)).isoformat()

    await db.jobs.update_one(
        {"id": job_id},
        {"$set": {"status": "cancelled", "cancelled_at": now_str(), "cancel_reason": reason, "expires_at": expires_at}}
    )

    # Notify all accepted crew via in-app notification + email
    crew_ids = job.get("crew_accepted", [])
    for crew_id in crew_ids:
        crew = await db.users.find_one({"id": crew_id}, {"_id": 0, "email": 1, "name": 1})
        if crew:
            # In-app notification
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": crew_id,
                "type": "job_cancelled",
                "title": "Job Cancelled",
                "message": f'"{job["title"]}" has been cancelled by the contractor. {reason}',
                "job_id": job_id,
                "read": False,
                "created_at": now_str()
            })
            # Email notification
            from utils.email_utils import send_job_cancelled_email
            await send_job_cancelled_email(crew["email"], crew["name"], job["title"], reason)

    return {"message": "Job cancelled. Crew has been notified.", "crew_notified": len(crew_ids)}


@router.post("/{job_id}/suspend")
async def suspend_job(job_id: str, current_user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    is_contractor = job["contractor_id"] == current_user["id"]
    is_admin = current_user.get("role") in ("admin", "super_admin")
    if not (is_contractor or is_admin):
        raise HTTPException(status_code=403, detail="Only the contractor can suspend this job")

    if job["status"] in ("completed", "cancelled", "suspended"):
        raise HTTPException(status_code=400, detail=f"Cannot suspend a {job['status']} job")

    await db.jobs.update_one(
        {"id": job_id},
        {"$set": {"status": "suspended", "suspended_at": now_str(), "previous_status": job["status"]}}
    )

    # Notify crew
    crew_ids = job.get("crew_accepted", [])
    for crew_id in crew_ids:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": crew_id,
            "type": "job_suspended",
            "title": "Job Paused",
            "message": f'"{job["title"]}" has been temporarily paused by the contractor.',
            "job_id": job_id,
            "read": False,
            "created_at": now_str()
        })

    return {"message": "Job suspended. Crew has been notified.", "crew_notified": len(crew_ids)}


@router.post("/{job_id}/resume")
async def resume_job(job_id: str, current_user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["contractor_id"] != current_user["id"] and current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Not authorized")

    if job["status"] != "suspended":
        raise HTTPException(status_code=400, detail="Job is not suspended")

    prev_status = job.get("previous_status", "open")
    await db.jobs.update_one({"id": job_id}, {"$set": {"status": prev_status}})
    return {"message": "Job resumed", "status": prev_status}


@router.get("/{job_id}/contact")
async def job_poster_contact(job_id: str, current_user: dict = Depends(get_current_user)):
    """Poster contact is released only to crew accepted on the job (or staff)."""
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if current_user["id"] not in job.get("crew_accepted", []) and current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Contact details are shared after you're hired on this job")
    if job.get("is_guest_post"):
        guest = await db.guest_jobs.find_one({"id": job["guest_job_id"], "status": "published"}, {"_id": 0, "contact": 1})
        return (guest or {}).get("contact", {})
    c = await db.users.find_one({"id": job["contractor_id"]}, {"_id": 0, "name": 1, "company_name": 1, "email": 1, "phone": 1})
    return c or {}


@router.post("/{job_id}/close")
async def admin_close_job(job_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    """Admin ends a job: no further accepts or workflow changes."""
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    body = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    reason = str((body or {}).get("reason", ""))[:300]
    result = await db.jobs.update_one(
        {"id": job_id, "status": {"$nin": ["completed", "cancelled", "closed"]}},
        {"$set": {"status": "closed", "closed_at": now_str(), "closed_by": current_user["id"], "close_reason": reason}})
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Job not found or already ended")
    await db.activity_logs.insert_one({"id": str(uuid.uuid4()), "admin_id": current_user["id"], "action": "close_job",
                                       "target_id": job_id, "details": reason, "created_at": now_str()})
    return {"message": "Job closed"}


@router.get("/{job_id}/recommended-crew")
async def recommended_crew(job_id: str, current_user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["contractor_id"] != current_user["id"] and current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    from utils.ai_utils import ai_match_crew_for_job
    from utils.profile_view import build_user_view
    crew = await db.users.find({"role": "crew", "is_active": True, "availability": True}, {"_id": 0, "password_hash": 0}).to_list(300)
    by_id = {c["id"]: c for c in crew}
    matches = (await ai_match_crew_for_job(job, crew))[:10]
    return [{**await build_user_view(by_id[m["crew_id"]], current_user, include_coords=True),
             "match_score": m["score"], "match_reason": m["reason"], "distance_miles": m["distance_miles"]} for m in matches]


# ─── Notifications ─────────────────────────────────────────────────────────────

@router.get("/notifications/me")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    notifs = await db.notifications.find(
        {"user_id": current_user["id"]},
        {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    unread = sum(1 for n in notifs if not n.get("read"))
    return {"notifications": notifs, "unread": unread}


@router.post("/notifications/read-all")
async def mark_all_read(current_user: dict = Depends(get_current_user)):
    await db.notifications.update_many(
        {"user_id": current_user["id"], "read": False},
        {"$set": {"read": True}}
    )
    return {"message": "All notifications marked as read"}


@router.post("/notifications/{notif_id}/read")
async def mark_one_read(notif_id: str, current_user: dict = Depends(get_current_user)):
    await db.notifications.update_one(
        {"id": notif_id, "user_id": current_user["id"]},
        {"$set": {"read": True}}
    )
    return {"message": "Marked as read"}


# ─── AI Matching trigger ───────────────────────────────────────────────────────

@router.post("/{job_id}/ai-match")
async def trigger_ai_match(job_id: str, current_user: dict = Depends(get_current_user)):
    """Manually trigger AI matching for a job (contractors and admins)."""
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["contractor_id"] != current_user["id"] and current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Not authorized")

    matched = await _run_ai_match(job)
    return {"message": f"AI matching complete. {matched} crew notified.", "notified": matched}


async def _run_ai_match(job: dict) -> int:
    """Background task: AI match crew for job, send notifications."""
    try:
        from utils.ai_utils import ai_match_crew_for_job
        crew = await db.users.find(
            {"role": "crew", "is_active": True, "availability": True},
            {"_id": 0, "id": 1, "name": 1, "trade": 1, "skills": 1, "rating": 1, "location": 1, "lat": 1, "lng": 1,
             "availability": 1, "is_active": 1, "jobs_completed": 1, "transportation": 1}
        ).to_list(300)

        if not crew:
            return 0

        matches = await ai_match_crew_for_job(job, crew)
        notified = 0
        for m in matches:
            if not m.get("notify"):
                continue
            crew_id = m.get("crew_id")
            if not crew_id:
                continue
            existing = await db.notifications.find_one({"user_id": crew_id, "job_id": job["id"], "type": {"$in": ["job_match", "job_invite"]}})
            if existing:
                continue
            score_pct = int(m.get("score", 0) * 100)
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": crew_id,
                "type": "job_match",
                "title": "New Job Match",
                "message": f'"{job["title"]}" — {score_pct}% match. {m.get("reason", "")}',
                "job_id": job["id"],
                "score": m.get("score", 0),
                "read": False,
                "created_at": now_str()
            })
            notified += 1
        return notified
    except Exception as e:
        logger.error(f"AI match background error: {e}")
        return 0


# ─── Crew Invites ─────────────────────────────────────────────────────────────

@router.post("/{job_id}/invite")
async def invite_crew(job_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    """Contractor invites specific crew members to a job."""
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["contractor_id"] != current_user["id"] and current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Not your job")
    if job["status"] != "open":
        raise HTTPException(status_code=400, detail="Only open jobs with free positions can receive offers")

    body = await request.json()
    crew_ids = body.get("crew_ids", [])
    if not crew_ids or not isinstance(crew_ids, list):
        raise HTTPException(status_code=400, detail="crew_ids array required")
    crew_ids = crew_ids[:10]  # max 10 invites at once

    sent = 0
    for crew_id in crew_ids:
        crew_member = await db.users.find_one({"id": crew_id, "role": "crew", "is_active": True}, {"_id": 0, "id": 1, "name": 1})
        if not crew_member or crew_id in job.get("crew_accepted", []):
            continue
        await db.jobs.update_one({"id": job_id}, {"$addToSet": {"invited_crew": crew_id}})
        existing = await db.notifications.find_one({"user_id": crew_id, "job_id": job_id, "type": "job_invite"})
        if existing:
            continue
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": crew_id,
            "type": "job_invite",
            "title": "You've Been Invited",
            "message": f'{current_user.get("company_name") or current_user["name"]} invited you to "{job["title"]}"',
            "job_id": job_id,
            "read": False,
            "created_at": now_str()
        })
        try:
            from routes.ws_routes import manager
            await manager.send_to_user(crew_id, {"type": "job_invite", "job_id": job_id, "job_title": job["title"]})
        except Exception:
            pass
        sent += 1

    return {"message": f"Invites sent to {sent} crew members", "sent": sent}
