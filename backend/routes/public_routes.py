"""Public routes — no authentication required."""
from fastapi import APIRouter, HTTPException, Response
from database import db
from utils.storage import load_image, APP_NAME

router = APIRouter()


@router.get("/cms/{page}")
async def get_public_cms(page: str):
    """Legal pages accessible without login."""
    valid_pages = {"terms", "privacy", "guidelines"}
    if page not in valid_pages:
        raise HTTPException(status_code=404, detail="Page not found")
    doc = await db.cms.find_one({"page": page, "published": True}, {"_id": 0})
    if not doc:
        doc = await db.cms.find_one({"page": page}, {"_id": 0})
    if not doc:
        titles = {"terms": "Terms & Conditions", "privacy": "Privacy Policy", "guidelines": "Community Guidelines"}
        return {"page": page, "title": titles[page], "content": "This content is being prepared. Check back soon.", "version": 1}
    return doc


@router.get("/trades")
async def get_public_trades():
    """Active trades list for registration form."""
    trades = await db.trades.find({"is_active": True}, {"_id": 0}).sort("name", 1).to_list(200)
    return trades


@router.get("/settings")
async def get_public_settings():
    """Public site settings (name, tagline, logo, login message)."""
    settings = await db.settings.find_one({}, {"_id": 0, "daily_price": 0, "weekly_price": 0, "monthly_price": 0})
    return settings or {"site_name": "TheDayLaborers", "site_tagline": "A Blue Collar ME Company", "login_message": "", "footer_text": ""}


@router.get("/verified-contractors")
async def get_verified_contractors(state: str = None, trade: str = None, limit: int = 100):
    """Public list of verified contractors - no auth required."""
    query: dict = {"role": "contractor", "is_verified_contractor": True, "is_active": True}
    if state and state != "All States":
        query["location.state"] = {"$regex": state, "$options": "i"}
    if trade and trade != "All Trades":
        query["trade"] = {"$regex": trade, "$options": "i"}
    docs = await db.users.find(query, {
        "_id": 0, "password_hash": 0, "email": 0, "phone": 0
    }).limit(limit).to_list(limit)
    return {"contractors": docs, "total": len(docs)}


@router.get("/verified-contractors/settings")
async def get_verified_page_settings():
    """CMS settings for verified contractors page."""
    settings = await db.settings.find_one({}, {"_id": 0})
    return {
        "verified_contractor_fee": (settings or {}).get("verified_contractor_fee", 39.99),
        "verified_page_header": (settings or {}).get("verified_page_header", "FIND VERIFIED CONTRACTORS"),
        "verified_page_tagline": (settings or {}).get("verified_page_tagline", "For property owners, apartments and home owners.")
    }


@router.get("/files/{path:path}")
async def get_public_file(path: str):
    """Serves uploaded images (profile photos, logos, portfolio) for public profiles."""
    if not path.startswith(f"{APP_NAME}/") or ".." in path:
        raise HTTPException(status_code=404, detail="File not found")
    data, content_type = await load_image(path)
    return Response(content=data, media_type=content_type, headers={
        "Cache-Control": "public, max-age=86400",
        "Content-Security-Policy": "default-src 'none'; sandbox",
    })
