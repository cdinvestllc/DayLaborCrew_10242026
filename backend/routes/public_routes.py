"""Public routes — no authentication required."""
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Response, Request, Query
from auth import limiter
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


US_STATE_ABBR = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA", "colorado": "CO",
    "connecticut": "CT", "delaware": "DE", "district of columbia": "DC", "florida": "FL", "georgia": "GA", "hawaii": "HI",
    "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS", "kentucky": "KY", "louisiana": "LA",
    "maine": "ME", "maryland": "MD", "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
    "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ",
    "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
    "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
    "tennessee": "TN", "texas": "TX", "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA",
    "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
}


def state_code(value: str) -> str:
    v = (value or "").strip()
    return US_STATE_ABBR.get(v.lower(), v.upper() if len(v) == 2 else v.lower())


def verification_current(c: dict, now) -> bool:
    """Paid within the last year and listing requirements (name, location) still satisfied."""
    from datetime import datetime as _dt
    from utils.profile_view import user_coords
    try:
        exp = _dt.fromisoformat(c.get("verified_expires_at") or "")
        exp = exp if exp.tzinfo else exp.replace(tzinfo=timezone.utc)
    except ValueError:
        return False
    return exp > now and bool(c.get("company_name") or c.get("name")) and user_coords(c) is not None


@router.get("/verified-contractors")
async def get_verified_contractors(state: str = None, trade: str = None, q: str = None, limit: int = 100):
    """Public list of active, paid, currently-verified contractors (no contact details)."""
    import re
    from utils.profile_view import build_user_view
    now = datetime.now(timezone.utc)
    query: dict = {"role": "contractor", "is_verified_contractor": True, "is_active": True}
    if trade and trade != "All Trades":
        query["trade"] = {"$regex": re.escape(trade), "$options": "i"}
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()[:80]), "$options": "i"}
        query["$or"] = [{"company_name": rx}, {"name": rx}, {"trade": rx}, {"location.city": rx}, {"bio": rx}]
    docs = await db.users.find(query, {"_id": 0, "password_hash": 0}).to_list(500)
    want_state = state_code(state) if state and state != "All States" else None
    results, expired = [], []
    for c in docs:
        if not verification_current(c, now):
            if c.get("verified_expires_at"):
                expired.append(c["id"])
            continue
        if want_state and state_code((c.get("location") or {}).get("state", "")) != want_state:
            continue
        results.append(await build_user_view(c, None, include_coords=True))
        if len(results) >= min(limit, 200):
            break
    if expired:
        await db.users.update_many({"id": {"$in": expired}, "verified_expires_at": {"$lt": now.isoformat()}},
                                   {"$set": {"is_verified_contractor": False, "verification_expired": True}})
    return {"contractors": results, "total": len(results)}


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


@router.get("/geocode/search")
@limiter.limit("20/minute")
async def public_geocode_search(request: Request, q: str = Query(..., min_length=3, max_length=200)):
    """Address autocomplete proxied server-side so no geocoder key ships to browsers."""
    from utils.geocoding import autocomplete_address
    return await autocomplete_address(q)
