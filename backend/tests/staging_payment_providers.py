"""Read-only checks that the staging Stripe/PayPal sandbox webhooks point at the staging API.

Run from the manual staging workflow. Only booleans/hostnames are printed - never secrets.
"""
import sys

import requests

from staging_config import get_staging_api_url, get_staging_payment_settings

PAYPAL_SANDBOX = "https://api-m.sandbox.paypal.com"
STRIPE_EVENTS = {"checkout.session.completed", "checkout.session.async_payment_succeeded"}
PAYPAL_EVENT = "PAYMENT.CAPTURE.COMPLETED"


def check_stripe(api_url: str, s: dict) -> list[str]:
    problems = []
    if not s["stripe_api_key"]:
        print("Stripe sandbox: not configured (staging API's own Stripe key is used)")
        return problems
    auth = (s["stripe_api_key"], "")
    r = requests.get("https://api.stripe.com/v1/balance", auth=auth, timeout=30)
    if r.status_code != 200:
        problems.append(f"Stripe test key was rejected by Stripe (HTTP {r.status_code}).")
        return problems
    if r.json().get("livemode"):
        problems.append("Stripe key is a LIVE key; staging requires test mode.")
    print("Stripe test key: valid")

    endpoint_id = s["stripe_webhook_endpoint_id"]
    if not endpoint_id:
        print("Stripe webhook endpoint: not configured")
        return problems
    r = requests.get(f"https://api.stripe.com/v1/webhook_endpoints/{endpoint_id}", auth=auth, timeout=30)
    if r.status_code != 200:
        problems.append(f"Stripe webhook endpoint could not be read (HTTP {r.status_code}).")
        return problems
    ep = r.json()
    expected = f"{api_url}/api/payments/stripe/webhook"
    if ep.get("url") != expected:
        problems.append("Stripe webhook endpoint URL does not match STAGING_API_URL + /api/payments/stripe/webhook.")
    if ep.get("status") != "enabled":
        problems.append("Stripe webhook endpoint is disabled.")
    if ep.get("livemode"):
        problems.append("Stripe webhook endpoint is a live-mode endpoint.")
    events = set(ep.get("enabled_events") or [])
    if "*" not in events and not STRIPE_EVENTS <= events:
        problems.append("Stripe webhook endpoint must subscribe to checkout.session.completed and checkout.session.async_payment_succeeded.")
    if not problems:
        print("Stripe webhook endpoint: enabled, test mode, points at staging")
    return problems


def check_paypal(api_url: str, s: dict) -> list[str]:
    problems = []
    if not s["paypal_configured"]:
        print("PayPal sandbox: not configured")
        return problems
    r = requests.post(f"{PAYPAL_SANDBOX}/v1/oauth2/token", auth=(s["paypal_client_id"], s["paypal_secret"]),
                      data={"grant_type": "client_credentials"}, timeout=30)
    if r.status_code != 200:
        problems.append(f"PayPal sandbox credentials were rejected (HTTP {r.status_code}).")
        return problems
    token = r.json()["access_token"]
    print("PayPal sandbox credentials: valid")

    if not s["paypal_webhook_id"]:
        print("PayPal webhook: not configured")
        return problems
    r = requests.get(f"{PAYPAL_SANDBOX}/v1/notifications/webhooks/{s['paypal_webhook_id']}",
                     headers={"Authorization": f"Bearer {token}"}, timeout=30)
    if r.status_code != 200:
        problems.append(f"PayPal sandbox webhook could not be read (HTTP {r.status_code}).")
        return problems
    wh = r.json()
    if wh.get("url") != f"{api_url}/api/payments/paypal/webhook":
        problems.append("PayPal webhook URL does not match STAGING_API_URL + /api/payments/paypal/webhook.")
    names = {e.get("name") for e in wh.get("event_types") or []}
    if "*" not in names and PAYPAL_EVENT not in names:
        problems.append("PayPal webhook must subscribe to PAYMENT.CAPTURE.COMPLETED.")
    if not problems:
        print("PayPal webhook: points at staging")
    return problems


def main() -> int:
    api_url = get_staging_api_url().rstrip("/")
    settings = get_staging_payment_settings()
    problems = check_stripe(api_url, settings) + check_paypal(api_url, settings)
    for p in problems:
        print(f"::error::{p}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
