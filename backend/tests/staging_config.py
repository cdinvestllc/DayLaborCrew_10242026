"""Safety gates for legacy backend tests that write to a live API and MongoDB."""
import os
import re
from urllib.parse import urlsplit

_STAGE_MARKER = re.compile(r"(^|[-.])(staging|stage|stg|test)([-.]|$)", re.IGNORECASE)
_PREVIEW_SUFFIX = ".preview.emergentagent.com"
_SEEDED_ACCOUNTS = ("SUPERADMIN", "ADMIN", "CONTRACTOR1", "CONTRACTOR2", "CONTRACTOR3", "CREW", "CREW2")


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(
            f"{name} is required. Configure the dedicated, seeded GitHub Actions staging environment; "
            "legacy integration tests must never fall back to the shared preview API."
        )
    return value


def _require_https_stage_url(name: str) -> str:
    value = _required(name).rstrip("/")
    parsed = urlsplit(value)
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme != "https" or not host or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise RuntimeError(f"{name} must be a valid HTTPS URL without credentials, query, or fragment.")
    if host == "crew-workforce.preview.emergentagent.com" or host.endswith(_PREVIEW_SUFFIX):
        raise RuntimeError(f"{name} points at a shared preview host; only dedicated staging is allowed.")
    if not _STAGE_MARKER.search(host):
        raise RuntimeError(f"{name} hostname must explicitly identify staging (staging/stage/stg/test).")
    if parsed.path not in ("", "/"):
        raise RuntimeError(f"{name} must be an origin only, with no path.")
    return value


def get_staging_api_url() -> str:
    return _require_https_stage_url("STAGING_API_URL")


def get_staging_web_origin() -> str:
    return _require_https_stage_url("STAGING_WEB_ORIGIN")


def get_seeded_account(name: str) -> tuple[str, str]:
    account = name.strip().upper()
    if account not in _SEEDED_ACCOUNTS:
        raise ValueError(f"Unknown staging test account: {account}")
    return _required(f"STAGING_{account}_EMAIL"), _required(f"STAGING_{account}_PASSWORD")


def get_staging_mongo_settings() -> tuple[str, str]:
    uri = _required("STAGING_MONGO_URL")
    parsed = urlsplit(uri)
    if parsed.scheme not in ("mongodb", "mongodb+srv") or not parsed.hostname:
        raise RuntimeError("STAGING_MONGO_URL must be a valid MongoDB connection URI.")
    expected_host = _required("STAGING_MONGO_HOST").lower().rstrip(".")
    if parsed.hostname.lower().rstrip(".") != expected_host:
        raise RuntimeError("STAGING_MONGO_URL host does not match the pinned STAGING_MONGO_HOST.")
    db_name = _required("STAGING_DB_NAME")
    if not _STAGE_MARKER.search(db_name):
        raise RuntimeError("STAGING_DB_NAME must uniquely identify an isolated stage/test database.")
    return uri, db_name


def validate_staging_configuration() -> tuple[str, str, str]:
    api = get_staging_api_url()
    web = get_staging_web_origin()
    _, db_name = get_staging_mongo_settings()
    if os.environ.get("STAGING_STRIPE_MODE", "").strip().lower() != "test":
        raise RuntimeError("STAGING_STRIPE_MODE must be explicitly set to 'test'.")
    for account in _SEEDED_ACCOUNTS:
        get_seeded_account(account)
    return (urlsplit(api).hostname or "", urlsplit(web).hostname or "", db_name)
