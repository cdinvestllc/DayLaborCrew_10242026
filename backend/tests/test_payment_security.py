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
from models import ProfileUpdate, ClockInRequest, DisputeCreate, DisputeResolution, DisputeMessageCreate, DisputeAppealCreate  # noqa: E402
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


def test_dispute_reason_rejects_whitespace_only_and_trims_padding():
    with pytest.raises(HTTPException) as err:
        job_routes.normalize_dispute_reason("          ")
    assert err.value.status_code == 400
    assert job_routes.normalize_dispute_reason("  work was not completed  ") == "work was not completed"



def test_dispute_conversation_is_limited_to_reporter_and_respondents():
    dispute = {"reporter_id": "crew-1", "respondent_id": "contractor-1",
               "respondent_ids": ["contractor-1", "crew-2"]}
    assert job_routes.can_access_dispute(dispute, "crew-1")
    assert job_routes.can_access_dispute(dispute, "contractor-1")
    assert job_routes.can_access_dispute(dispute, "crew-2")
    assert not job_routes.can_access_dispute(dispute, "stranger")


def test_dispute_message_policy_tracks_open_appeal_window_and_final_state():
    from datetime import datetime, timezone, timedelta
    now = datetime(2026, 10, 23, tzinfo=timezone.utc)
    resolved = {"status": "resolved", "resolved_at": (now - timedelta(days=2)).isoformat()}
    expired = {"status": "resolved", "resolved_at": (now - timedelta(days=8)).isoformat()}
    assert job_routes.dispute_can_message({"status": "open"}, now)
    assert job_routes.dispute_can_message({"status": "appealed"}, now)
    assert job_routes.dispute_can_message(resolved, now)
    assert not job_routes.dispute_can_message(expired, now)
    assert not job_routes.dispute_can_message({"status": "appeal_resolved"}, now)


def test_dispute_appeal_is_participant_only_once_and_within_seven_days():
    from datetime import datetime, timezone, timedelta
    now = datetime(2026, 10, 23, tzinfo=timezone.utc)
    dispute = {"reporter_id": "crew-1", "respondent_id": "contractor-1", "status": "resolved",
               "resolved_at": (now - timedelta(days=2)).isoformat()}
    assert job_routes.dispute_can_appeal(dispute, "crew-1", now)
    job_routes.validate_dispute_appeal(dispute, "crew-1", now)
    with pytest.raises(HTTPException) as unauthorized:
        job_routes.validate_dispute_appeal(dispute, "stranger", now)
    assert unauthorized.value.status_code == 403
    with pytest.raises(HTTPException) as expired:
        job_routes.validate_dispute_appeal(
            {**dispute, "resolved_at": (now - timedelta(days=9)).isoformat()}, "crew-1", now)
    assert expired.value.status_code == 409
    with pytest.raises(HTTPException) as repeated:
        job_routes.validate_dispute_appeal({**dispute, "appeal": {"reason": "duplicate"}}, "crew-1", now)
    assert repeated.value.status_code == 409


def test_appeal_resolution_actions_are_type_specific():
    job_routes.validate_appeal_resolution({"dispute_type": "job"}, "uphold_original")
    job_routes.validate_appeal_resolution({"dispute_type": "job"}, "dismiss")
    job_routes.validate_appeal_resolution({"dispute_type": "rating", "rating_id": "r1"}, "restore_rating")
    with pytest.raises(HTTPException):
        job_routes.validate_appeal_resolution({"dispute_type": "job"}, "hide_rating")
    with pytest.raises(HTTPException):
        job_routes.validate_appeal_resolution({"dispute_type": "rating"}, "hide_rating")


def test_dispute_conversation_models_limit_empty_or_oversized_input():
    assert DisputeMessageCreate(body=" Please share the invoice ").body.strip() == "Please share the invoice"
    with pytest.raises(Exception):
        DisputeMessageCreate(body="x" * 3001)
    with pytest.raises(Exception):
        DisputeAppealCreate(reason="short")



def test_dispute_message_rejects_whitespace_only_body():
    assert job_routes.normalize_dispute_message("  Please share the invoice  ") == "Please share the invoice"
    with pytest.raises(HTTPException) as err:
        job_routes.normalize_dispute_message("   \n  ")
    assert err.value.status_code == 400



def test_missing_vendor_checkout_adapter_fails_closed():
    if payments.STRIPE_CHECKOUT_AVAILABLE:
        pytest.skip("Vendor checkout SDK is installed in this environment")
    with pytest.raises(HTTPException) as err:
        payments.StripeCheckout(api_key="sk_test_example", webhook_url="")
    assert err.value.status_code == 503


class _MemoryResult:
    def __init__(self, modified_count):
        self.modified_count = modified_count


class _MemoryUsers:
    def __init__(self, user):
        self.user = dict(user)

    async def find_one(self, query, projection=None):
        if query.get("id") != self.user.get("id"):
            return None
        return dict(self.user)

    async def update_one(self, query, update):
        if query.get("id") != self.user.get("id"):
            return _MemoryResult(0)
        expected_end = query.get("subscription_end", object())
        if isinstance(expected_end, dict) and expected_end.get("$exists") is False:
            if "subscription_end" in self.user:
                return _MemoryResult(0)
        elif expected_end is not None and expected_end != self.user.get("subscription_end"):
            return _MemoryResult(0)
        marker_condition = query.get("subscription_payment_sessions")
        if isinstance(marker_condition, dict) and marker_condition.get("$ne") in (
            self.user.get("subscription_payment_sessions") or []
        ):
            return _MemoryResult(0)

        changed = False
        for key, value in update.get("$set", {}).items():
            if self.user.get(key) != value:
                self.user[key] = value
                changed = True
        for key, value in update.get("$addToSet", {}).items():
            items = self.user.setdefault(key, [])
            if value not in items:
                items.append(value)
                changed = True
        return _MemoryResult(int(changed))


class _MemoryCoupons:
    def __init__(self, coupon):
        self.coupon = dict(coupon)

    async def update_one(self, query, update):
        if query.get("code") != self.coupon.get("code"):
            return _MemoryResult(0)
        marker_condition = query.get("applied_payment_sessions")
        if isinstance(marker_condition, dict) and marker_condition.get("$ne") in (
            self.coupon.get("applied_payment_sessions") or []
        ):
            return _MemoryResult(0)
        self.coupon["usage_count"] = self.coupon.get("usage_count", 0) + update.get("$inc", {}).get("usage_count", 0)
        marker = update.get("$addToSet", {}).get("applied_payment_sessions")
        if marker and marker not in self.coupon.setdefault("applied_payment_sessions", []):
            self.coupon["applied_payment_sessions"].append(marker)
        return _MemoryResult(1)


class _MemoryTransactions:
    def __init__(self, tx):
        self.tx = dict(tx)
        self.update_calls = []

    async def find_one(self, query, projection=None):
        if query.get("session_id") != self.tx.get("session_id"):
            return None
        return dict(self.tx)

    async def update_one(self, query, update):
        self.update_calls.append((query, update))
        if query.get("session_id") != self.tx.get("session_id"):
            return _MemoryResult(0)
        status_condition = query.get("payment_status")
        if isinstance(status_condition, dict) and "$nin" in status_condition:
            if self.tx.get("payment_status") in status_condition["$nin"]:
                return _MemoryResult(0)
        self.tx.update(update.get("$set", {}))
        return _MemoryResult(1)


def test_subscription_fulfillment_is_idempotent_for_the_same_provider_session(monkeypatch):
    from datetime import datetime, timezone, timedelta
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    import asyncio

    original_end = (datetime.now(timezone.utc) + timedelta(days=10)).isoformat()
    users = _MemoryUsers({
        "id": "user-1",
        "email": "worker@example.test",
        "name": "Test Worker",
        "subscription_status": "active",
        "subscription_plan": "crew_monthly",
        "subscription_end": original_end,
    })
    coupons = _MemoryCoupons({"code": "TEST20", "usage_count": 0})
    monkeypatch.setattr(payments, "db", SimpleNamespace(users=users, coupons=coupons))
    email = AsyncMock()
    monkeypatch.setattr(payments, "send_subscription_email", email)

    first_end = asyncio.run(payments.update_subscription(
        "user-1", "crew_monthly", 30, "stripe", 19.99, "TEST20", payment_session_id="cs_once"
    ))
    second_end = asyncio.run(payments.update_subscription(
        "user-1", "crew_monthly", 30, "stripe", 19.99, "TEST20", payment_session_id="cs_once"
    ))

    assert first_end == second_end
    assert _parse_subscription_end(first_end) > _parse_subscription_end(original_end)
    assert users.user["subscription_payment_sessions"] == ["cs_once"]
    assert coupons.coupon["usage_count"] == 1
    assert coupons.coupon["applied_payment_sessions"] == ["cs_once"]
    assert email.await_count == 1


def _parse_subscription_end(value):
    from datetime import datetime
    return datetime.fromisoformat(value)


def test_subscription_transaction_remains_retryable_if_entitlement_write_fails(monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    import asyncio

    tx = {
        "session_id": "cs_retry",
        "user_id": "user-1",
        "plan": "crew_monthly",
        "payment_method": "stripe",
        "payment_status": "pending",
        "amount": 19.99,
    }
    transactions = _MemoryTransactions(tx)
    monkeypatch.setattr(payments, "db", SimpleNamespace(payment_transactions=transactions))
    grant = AsyncMock(side_effect=RuntimeError("temporary database error"))
    monkeypatch.setattr(payments, "update_subscription", grant)

    with pytest.raises(RuntimeError, match="temporary database error"):
        asyncio.run(payments.fulfill_subscription_tx("cs_retry", expected_provider="stripe"))

    assert transactions.tx["payment_status"] == "pending"
    assert transactions.update_calls == []


@pytest.mark.parametrize(
    "tx,provider,amount,currency,expected",
    [
        ({"payment_method": "paypal", "amount": 19.99, "currency": "usd"}, "paypal", "19.99", "USD", True),
        ({"payment_method": "stripe", "amount": 19.99, "currency": "usd"}, "paypal", "19.99", "USD", False),
        ({"payment_method": "paypal", "amount": 19.99, "currency": "usd"}, "paypal", "19.98", "USD", False),
        ({"payment_method": "paypal", "amount": 19.99, "currency": "usd"}, "paypal", "19.99", "EUR", False),
    ],
)
def test_payment_capture_requires_matching_provider_amount_and_currency(tx, provider, amount, currency, expected):
    assert payments._payment_matches_transaction(tx, provider, amount, currency) is expected



@pytest.mark.parametrize(
    "tx,status,provider,expected",
    [
        (
            {"payment_method": "stripe", "amount": 19.99, "currency": "usd"},
            type("Status", (), {"payment_status": "paid", "amount_total": 1999, "currency": "USD"})(),
            "stripe",
            True,
        ),
        (
            {"payment_method": "stripe", "amount": 19.99, "currency": "usd"},
            type("Status", (), {"payment_status": "paid", "amount_total": 1998, "currency": "USD"})(),
            "stripe",
            False,
        ),
        (
            {"payment_method": "stripe", "amount": 19.99, "currency": "usd"},
            type("Status", (), {"payment_status": "paid", "amount_total": 1999, "currency": "EUR"})(),
            "stripe",
            False,
        ),
        (
            {"payment_method": "paypal", "amount": 19.99, "currency": "usd"},
            type("Status", (), {"payment_status": "paid", "amount_total": 1999, "currency": "USD"})(),
            "stripe",
            False,
        ),
        (
            {"payment_method": "stripe", "amount": 19.99, "currency": "usd"},
            type("Status", (), {"payment_status": "unpaid", "amount_total": 1999, "currency": "USD"})(),
            "stripe",
            False,
        ),
    ],
)
def test_checkout_status_must_match_paid_provider_amount_and_currency(tx, status, provider, expected):
    assert payments._checkout_status_matches_transaction(tx, status, provider) is expected



@pytest.mark.parametrize(
    "amount,cents",
    [(19.99, 1999), (79.99, 7999), (0.29, 29), (1.15, 115), (39.99, 3999), (9.99, 999)],
)
def test_stripe_checkout_adapter_amount_preserves_exact_cents(amount, cents):
    adjusted = payments._stripe_amount(amount)
    assert int(adjusted * 100) == cents
    assert adjusted - cents / 100 < 1e-6


def test_paid_provider_status_is_not_reported_as_fulfilled_without_local_payment(monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    import asyncio

    transactions = SimpleNamespace(find_one=AsyncMock(return_value={"payment_status": "pending"}))
    monkeypatch.setattr(payments, "db", SimpleNamespace(payment_transactions=transactions))
    response = asyncio.run(payments._status_response(
        "cs_unfulfilled", SimpleNamespace(status="complete", payment_status="paid")
    ))
    assert response["payment_status"] == "verification_failed"
    assert response["fulfilled"] is False
