"""Regression tests for payment mode isolation and webhook verification helpers."""
import os
from pathlib import Path
import sys

import pytest
from fastapi import HTTPException

# Support running pytest from either the repository root or backend directory.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "daylaborcrew_test")
os.environ.setdefault("JWT_SECRET_KEY", "unit-test-only-secret-32-chars-minimum")
os.environ.setdefault("JWT_EXPIRE_HOURS", "24")
os.environ.setdefault("CORS_ORIGINS", "http://localhost")
os.environ.setdefault("EMERGENT_LLM_KEY", "unit-test-only-key")
os.environ.setdefault("TRUSTED_PROXY_HOPS", "1")

from auth import limiter  # noqa: E402
from routes import auth_routes as auth_routes  # noqa: E402
from routes import payment_routes as payments  # noqa: E402
from models import ProfileUpdate  # noqa: E402
from routes.user_routes import _build_crew_search_query  # noqa: E402


def test_global_api_rate_limit_is_enabled():
    assert limiter._default_limits


def test_test_mode_rejects_live_stripe_keys():
    assert payments._validate_stripe_api_key("sk_test_example", "test") == "sk_test_example"
    with pytest.raises(HTTPException) as err:
        payments._validate_stripe_api_key("sk_live_example", "test")
    assert err.value.status_code == 503


def test_live_stripe_key_requires_explicit_live_mode():
    assert payments._validate_stripe_api_key("sk_live_example", "live") == "sk_live_example"
    with pytest.raises(HTTPException):
        payments._validate_stripe_api_key("sk_test_example", "live")


@pytest.mark.parametrize(
    "tx,amount,currency,minor_units,expected",
    [
        ({"amount": 19.99, "currency": "usd"}, 1999, "USD", True, True),
        ({"amount": 19.99, "currency": "usd"}, 1998, "USD", True, False),
        ({"amount": 19.99, "currency": "usd"}, "19.99", "USD", False, True),
        ({"amount": 19.99, "currency": "usd"}, "19.99", "EUR", False, False),
        ({"amount": 9.99, "currency": "usd"}, None, "USD", False, False),
    ],
)
def test_provider_amount_and_currency_must_match(tx, amount, currency, minor_units, expected):
    assert payments._transaction_amount_matches(
        tx, amount, currency, minor_units=minor_units
    ) is expected


def test_stripe_webhook_requires_configured_secret():
    with pytest.raises(HTTPException) as err:
        payments._verify_stripe_event(b"{}", "", "")
    assert err.value.status_code == 503


def test_stripe_webhook_rejects_missing_or_invalid_signature(monkeypatch):
    with pytest.raises(HTTPException) as missing:
        payments._verify_stripe_event(b"{}", "", "whsec_test")
    assert missing.value.status_code == 400

    def invalid_signature(*args, **kwargs):
        raise ValueError("untrusted detail should not be exposed")

    monkeypatch.setattr(payments.stripe_sdk.Webhook, "construct_event", invalid_signature)
    with pytest.raises(HTTPException) as invalid:
        payments._verify_stripe_event(b"{}", "bad-signature", "whsec_test")
    assert invalid.value.status_code == 400
    assert "untrusted detail" not in invalid.value.detail


def test_paypal_webhook_requires_configured_id_and_all_signature_headers():
    headers = {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://example.test/cert",
        "paypal-transmission-id": "transmission",
        "paypal-transmission-sig": "signature",
        "paypal-transmission-time": "2026-10-23T00:00:00Z",
    }
    with pytest.raises(HTTPException) as missing_id:
        payments._paypal_verification_payload(headers, {"event_type": "TEST"}, "")
    assert missing_id.value.status_code == 503

    with pytest.raises(HTTPException) as missing_header:
        payments._paypal_verification_payload({}, {"event_type": "TEST"}, "webhook-id")
    assert missing_header.value.status_code == 400


def test_paypal_webhook_payload_uses_configured_webhook_id_and_signed_headers():
    headers = {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://example.test/cert",
        "paypal-transmission-id": "transmission",
        "paypal-transmission-sig": "signature",
        "paypal-transmission-time": "2026-10-23T00:00:00Z",
    }
    event = {"event_type": "PAYMENT.CAPTURE.COMPLETED"}
    payload = payments._paypal_verification_payload(headers, event, "configured-hook")
    assert payload["webhook_id"] == "configured-hook"
    assert payload["webhook_event"] == event
    assert payload["transmission_sig"] == "signature"


@pytest.mark.parametrize("role", ["crew", "contractor"])
def test_google_signup_accepts_only_public_roles(role):
    assert auth_routes.oauth_signup_role(role) == role


@pytest.mark.parametrize("role", ["admin", "super_admin", "invalid", "", None])
def test_google_signup_rejects_privileged_or_invalid_roles(role):
    with pytest.raises(HTTPException) as err:
        auth_routes.oauth_signup_role(role)
    assert err.value.status_code == 400


def test_profile_update_accepts_boolean_insurance_status():
    assert ProfileUpdate(is_insured=True).model_dump(exclude_none=True)["is_insured"] is True
    assert ProfileUpdate(is_insured=False).model_dump(exclude_none=True)["is_insured"] is False


def test_crew_search_filters_build_safe_and_composable_query():
    query = _build_crew_search_query(
        trade="Electric[al", name="Sam.*", skill="Welding",
        transportation="truck", state="Georgia", min_rating=4.5,
        available_only=True)
    assert query["role"] == "crew"
    assert query["is_active"] is True
    assert query["availability"] is True
    assert query["trade"]["$regex"] == r"Electric\[al"
    assert query["name"]["$regex"] == r"Sam\.\*"
    assert query["skills"]["$regex"] == "Welding"
    assert query["transportation"] == "truck"
    assert query["location.state"]["$regex"] == "Georgia"
    assert query["rating"] == {"$gte": 4.5}


def test_crew_search_can_include_unavailable_and_unfiltered_members():
    assert _build_crew_search_query(available_only=False) == {
        "role": "crew", "is_active": True
    }
