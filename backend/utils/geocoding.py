import math
import httpx
import logging

logger = logging.getLogger(__name__)
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
HEADERS = {"User-Agent": "TheDayLaborers/1.0 (contact@thedaylaborers.com)"}


def valid_coords(lat, lng):
    """(lat, lng) floats when both are numeric and in range (0 is valid), else None."""
    if lat is None or lng is None or isinstance(lat, bool) or isinstance(lng, bool):
        return None
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return None
    if not (math.isfinite(lat) and math.isfinite(lng)) or not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return lat, lng


def _parse_result(item: dict, fallback_address: str = "") -> dict | None:
    coords = valid_coords(item.get("lat"), item.get("lon"))
    if not coords:
        return None
    addr = item.get("address") or {}
    return {
        "address": item.get("display_name") or fallback_address,
        "lat": coords[0],
        "lng": coords[1],
        "city": addr.get("city") or addr.get("town") or addr.get("village") or addr.get("county") or "",
        "state": addr.get("state") or "",
    }


async def geocode_address(address: str) -> dict | None:
    """Convert address string to a location via Nominatim (OpenStreetMap). None if not found."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(NOMINATIM_URL, headers=HEADERS,
                                        params={"q": address, "format": "json", "limit": 1, "addressdetails": 1})
            data = response.json()
            if data:
                result = _parse_result(data[0], address)
                if result:
                    result["address"] = address
                return result
    except Exception as e:
        logger.warning(f"Geocoding failed: {type(e).__name__}")
    return None


async def autocomplete_address(query: str, limit: int = 5) -> list:
    import os
    key = os.environ.get("GEOAPIFY_API_KEY")
    if key:
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.get("https://api.geoapify.com/v1/geocode/autocomplete", params={
                    "text": query, "filter": "countrycode:us", "format": "json", "limit": limit, "apiKey": key})
                out = []
                for i in r.json().get("results", []):
                    coords = valid_coords(i.get("lat"), i.get("lon"))
                    if coords:
                        out.append({"address": i.get("formatted", ""), "lat": coords[0], "lng": coords[1],
                                    "city": i.get("city") or "", "state": i.get("state_code") or i.get("state") or ""})
                return out
        except Exception as e:
            logger.warning(f"Geoapify autocomplete failed: {type(e).__name__}")
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(NOMINATIM_URL, headers=HEADERS, params={
                "q": query, "format": "json", "limit": limit, "addressdetails": 1, "countrycodes": "us"})
            return [r for r in (_parse_result(i) for i in response.json()) if r]
    except Exception as e:
        logger.warning(f"Address autocomplete failed: {type(e).__name__}")
        return []


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance in miles between two lat/lng points."""
    from math import radians, cos, sin, asin, sqrt
    R = 3959  # Earth's radius in miles
    lat1, lng1, lat2, lng2 = map(radians, [lat1, lng1, lat2, lng2])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlng/2)**2
    return 2 * R * asin(sqrt(a))


def distance_between(a, b):
    """Miles between two (lat, lng) tuples, or None if either is missing."""
    if not a or not b:
        return None
    return haversine_distance(a[0], a[1], b[0], b[1])
