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
from routes import job_routes as job_routes  # noqa: E402
from models import ProfileUpdate, ClockInRequest, DisputeCreate, DisputeResolution  # noqa: E402
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


def test_clock_in_request_validates_coordinate_accuracy():
    request = ClockInRequest(lat=33.749, lng=-84.388, accuracy_meters=12.5)
    assert request.lat == 33.749
    assert request.lng == -84.388
    assert request.accuracy_meters == 12.5


def test_clock_in_accepts_worker_inside_radius():
    job = {"location": {"lat": 33.749, "lng": -84.388}}
    assert job_routes.validate_clock_in_location(job, 33.749, -84.388) == 0


def test_clock_in_rejects_worker_outside_radius():
    job = {"location": {"lat": 33.749, "lng": -84.388}}
    with pytest.raises(HTTPException) as err:
        job_routes.validate_clock_in_location(job, 34.0, -84.388)
    assert err.value.status_code == 403


def test_clock_in_fails_closed_when_job_has_no_coordinates():
    with pytest.raises(HTTPException) as err:
        job_routes.validate_clock_in_location({"location": {"address": "Atlanta, GA"}}, 33.749, -84.388)
    assert err.value.status_code == 409


@pytest.mark.parametrize("lat,lng", [(None, -84.388), (91, -84.388), (33.749, 181), (float("nan"), -84.388)])
def test_clock_in_rejects_invalid_gps_coordinates(lat, lng):
    with pytest.raises(HTTPException) as err:
        job_routes.validate_clock_in_location(
            {"location": {"lat": 33.749, "lng": -84.388}}, lat, lng)
    assert err.value.status_code == 400


def test_clock_in_rejects_inaccurate_gps_readings():
    with pytest.raises(HTTPException) as err:
        job_routes.validate_clock_in_accuracy(251)
    assert err.value.status_code == 400
    assert "not accurate enough" in err.value.detail


def test_clock_in_accepts_missing_accuracy_from_older_clients():
    assert job_routes.validate_clock_in_accuracy(None) is None
    assert job_routes.validate_clock_in_accuracy(10) is None


def test_job_dispute_requires_participant_and_reviewable_state():
    job = {"id": "job-1", "contractor_id": "contractor-1", "crew_accepted": ["crew-1"],
           "status": "completed_pending_review"}
    assert job_routes.validate_dispute_submission(
        job, {"id": "crew-1", "role": "crew"}, "job", "completion") == "contractor-1"
    with pytest.raises(HTTPException) as unrelated:
        job_routes.validate_dispute_submission(job, {"id": "stranger", "role": "crew"}, "job", "completion")
    assert unrelated.value.status_code == 403
    with pytest.raises(HTTPException) as completed:
        job_routes.validate_dispute_submission(
            {**job, "status": "completed"}, {"id": "crew-1", "role": "crew"}, "job", "completion")
    assert completed.value.status_code == 409


def test_rating_dispute_requires_matching_job_and_author_or_recipient():
    job = {"id": "job-1", "contractor_id": "contractor-1", "crew_accepted": ["crew-1"], "status": "completed"}
    rating = {"id": "rating-1", "job_id": "job-1", "rater_id": "contractor-1", "rated_id": "crew-1"}
    assert job_routes.validate_dispute_submission(
        job, {"id": "crew-1", "role": "crew"}, "rating", "abusive", rating) == "contractor-1"
    with pytest.raises(HTTPException) as unrelated:
        job_routes.validate_dispute_submission(job, {"id": "stranger", "role": "crew"}, "rating", "abusive", rating)
    assert unrelated.value.status_code == 403


def test_dispute_resolution_actions_are_restricted_by_type():
    job_routes.validate_dispute_resolution({"dispute_type": "job"}, "uphold")
    job_routes.validate_dispute_resolution({"dispute_type": "rating", "rating_id": "rating-1"}, "hide_rating")
    with pytest.raises(HTTPException):
        job_routes.validate_dispute_resolution({"dispute_type": "job"}, "hide_rating")
    with pytest.raises(HTTPException):
        job_routes.validate_dispute_resolution({"dispute_type": "rating"}, "restore_rating")


def test_rating_summary_recalculates_only_valid_visible_stars():
    assert job_routes.rating_summary([5, 4, 0, 7, "5"]) == {"rating": 4.5, "rating_count": 2}
    assert job_routes.rating_summary([]) == {"rating": 0, "rating_count": 0}


def test_dispute_models_enforce_reason_and_resolution_note_limits():
    with pytest.raises(Exception):
        DisputeCreate(dispute_type="job", category="completion", reason="short")
    with pytest.raises(Exception):
        DisputeResolution(resolution="dismiss", notes="x" * 2001)
