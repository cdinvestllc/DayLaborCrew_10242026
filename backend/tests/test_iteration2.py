"""Backend tests for iteration 2 - Stripe verified contractor fee, coupon test UI"""
import pytest
import requests
import os

BASE_URL = "https://crew-workforce.preview.emergentagent.com"

ADMIN_EMAIL = "admin@thedaylaborers.com"
ADMIN_PASS = "Admin@123"
CONTRACTOR_EMAIL = "contractor1@test.com"
CONTRACTOR_PASS = "Test@1234"


def get_token(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    if r.status_code == 200:
        return r.json().get("access_token") or r.json().get("token")
    return None


@pytest.fixture(scope="module")
def contractor_token():
    token = get_token(CONTRACTOR_EMAIL, CONTRACTOR_PASS)
    if not token:
        pytest.skip("Contractor login failed")
    return token


@pytest.fixture(scope="module")
def admin_token():
    token = get_token(ADMIN_EMAIL, ADMIN_PASS)
    if not token:
        pytest.skip("Admin login failed")
    return token


# Verified contractor fee endpoint (public)
def test_verified_contractor_fee_public():
    r = requests.get(f"{BASE_URL}/api/payments/verified-contractor/fee")
    assert r.status_code == 200
    data = r.json()
    assert "fee" in data
    assert float(data["fee"]) == 39.99, f"Expected 39.99 got {data['fee']}"
    print(f"PASS: fee = {data['fee']}")


# Create session requires contractor auth
def test_create_verified_contractor_session(contractor_token):
    headers = {"Authorization": f"Bearer {contractor_token}"}
    r = requests.post(f"{BASE_URL}/api/payments/verified-contractor/create-session",
                      json={"origin_url": BASE_URL}, headers=headers)
    print(f"Create session status: {r.status_code}, body: {r.text[:200]}")
    # Either 200 (new session) or 400 (already verified)
    assert r.status_code in [200, 400]
    if r.status_code == 200:
        data = r.json()
        assert "url" in data
        assert "stripe.com" in data["url"] or "checkout" in data["url"].lower()
        print(f"PASS: Stripe URL returned: {data['url'][:80]}")
    else:
        print(f"INFO: Contractor may already be verified: {r.json()}")


# Admin coupon test endpoint
def test_coupon_test_endpoint(admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    # Frontend uses GET /api/payments/coupon/{code}?plan=monthly
    r = requests.get(f"{BASE_URL}/api/payments/coupon/TEST20?plan=monthly", headers=headers)
    print(f"Coupon test status: {r.status_code}, body: {r.text[:300]}")
    assert r.status_code == 200
    data = r.json()
    assert "original_price" in data
    assert "final_price" in data
    # monthly is $79.99 with 20% off -> $63.99
    assert float(data["original_price"]) == 79.99, f"Expected 79.99 got {data['original_price']}"
    assert abs(float(data["final_price"]) - 63.99) < 0.05, f"Expected 63.99 got {data['final_price']}"
    print(f"PASS: original={data['original_price']}, final={data['final_price']}")
