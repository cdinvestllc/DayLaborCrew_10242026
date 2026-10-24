"""Safety gates for legacy backend tests that write to a live API and MongoDB."""
import os
import re
from urllib.parse import urlsplit

_STAGE_MARKER = re.compile(r"(^|[-._])(staging|stage|stg|test)([-._]|$)", re.IGNORECASE)
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
    if not _STAGE_MARKER.search(expected_host):
        raise RuntimeError("STAGING_MONGO_HOST must explicitly identify the staging/test deployment.")
    if parsed.hostname.lower().rstrip(".") != expected_host:
        raise RuntimeError("STAGING_MONGO_URL host does not match the pinned STAGING_MONGO_HOST.")
    db_name = _required("STAGING_DB_NAME")
    if not _STAGE_MARKER.search(db_name):
        raise RuntimeError("STAGING_DB_NAME must uniquely identify an isolated stage/test database.")
    return uri, db_name


_STRIPE_PREFIXES = {
    "STAGING_STRIPE_API_KEY": ("sk_test_", "rk_test_"),
    "STAGING_STRIPE_WEBHOOK_SECRET": ("whsec_",),
    "STAGING_STRIPE_WEBHOOK_ENDPOINT_ID": ("we_",),
}
_PAYPAL_NAMES = ("STAGING_PAYPAL_CLIENT_ID", "STAGING_PAYPAL_SECRET", "STAGING_PAYPAL_WEBHOOK_ID")


def _optional(name: str) -> str:
    return os.environ.get(name, "").strip()


def get_staging_payment_settings() -> dict:
    """Optional sandbox payment credentials for the staging environment.

    All values are optional so the suite still runs before payment providers are
    connected, but anything provided must be test/sandbox-only and complete.
    Values are never included in error messages.
    """
    stripe = {name: _optional(name) for name in _STRIPE_PREFIXES}
    for name, prefixes in _STRIPE_PREFIXES.items():
        value = stripe[name]
        if value and not value.startswith(prefixes):
            if name == "STAGING_STRIPE_API_KEY":
                raise RuntimeError("STAGING_STRIPE_API_KEY must be a Stripe test-mode key (sk_test_/rk_test_); live keys are refused.")
            raise RuntimeError(f"{name} does not look like a Stripe value (expected prefix {prefixes[0]}).")
    if stripe["STAGING_STRIPE_WEBHOOK_ENDPOINT_ID"] and not stripe["STAGING_STRIPE_API_KEY"]:
        raise RuntimeError("STAGING_STRIPE_WEBHOOK_ENDPOINT_ID requires STAGING_STRIPE_API_KEY to verify the endpoint.")

    paypal = {name: _optional(name) for name in _PAYPAL_NAMES}
    if paypal["STAGING_PAYPAL_WEBHOOK_ID"] and not (paypal["STAGING_PAYPAL_CLIENT_ID"] and paypal["STAGING_PAYPAL_SECRET"]):
        raise RuntimeError("STAGING_PAYPAL_WEBHOOK_ID requires STAGING_PAYPAL_CLIENT_ID and STAGING_PAYPAL_SECRET.")
    if bool(paypal["STAGING_PAYPAL_CLIENT_ID"]) != bool(paypal["STAGING_PAYPAL_SECRET"]):
        raise RuntimeError("STAGING_PAYPAL_CLIENT_ID and STAGING_PAYPAL_SECRET must be set together.")

    return {
        "stripe_api_key": stripe["STAGING_STRIPE_API_KEY"],
        "stripe_webhook_secret": stripe["STAGING_STRIPE_WEBHOOK_SECRET"],
        "stripe_webhook_endpoint_id": stripe["STAGING_STRIPE_WEBHOOK_ENDPOINT_ID"],
        "paypal_client_id": paypal["STAGING_PAYPAL_CLIENT_ID"],
        "paypal_secret": paypal["STAGING_PAYPAL_SECRET"],
        "paypal_webhook_id": paypal["STAGING_PAYPAL_WEBHOOK_ID"],
        "stripe_webhook_configured": bool(stripe["STAGING_STRIPE_WEBHOOK_SECRET"]),
        "paypal_configured": bool(paypal["STAGING_PAYPAL_CLIENT_ID"]),
        "paypal_webhook_configured": bool(paypal["STAGING_PAYPAL_WEBHOOK_ID"]),
    }


def validate_staging_configuration() -> tuple[str, str, str]:
    api = get_staging_api_url()
    web = get_staging_web_origin()
    _, db_name = get_staging_mongo_settings()
    get_staging_payment_settings()
    stage_secret = _required("STAGING_JWT_SECRET_KEY")
    if len(stage_secret) < 32:
        raise RuntimeError("STAGING_JWT_SECRET_KEY must contain at least 32 characters.")
    if os.environ.get("STAGING_STRIPE_MODE", "").strip().lower() != "test":
        raise RuntimeError("STAGING_STRIPE_MODE must be explicitly set to 'test'.")
    for account in _SEEDED_ACCOUNTS:
        get_seeded_account(account)
    return (urlsplit(api).hostname or "", urlsplit(web).hostname or "", db_name)
