"""Regression tests for payment mode isolation and webhook verification helpers."""
import pytest
from fastapi import HTTPException

from routes import payment_routes as payments


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
