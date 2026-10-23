"""Tests for 3 new features: verified contractor email, push notification widget, admin revoke verified"""
import pytest
import requests

from staging_config import get_seeded_account, get_staging_api_url, get_staging_web_origin
import os

BASE_URL = get_staging_api_url()

ADMIN_EMAIL, ADMIN_PASS = get_seeded_account("ADMIN")
CONTRACTOR_EMAIL, CONTRACTOR_PASS = get_seeded_account("CONTRACTOR1")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    if r.status_code == 200:
        return r.json().get("access_token") or r.json().get("token")
    pytest.skip("Admin login failed")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def contractor_id(admin_headers):
    """Find contractor1 user ID"""
    r = requests.get(f"{BASE_URL}/api/admin/users?role=contractor", headers=admin_headers)
    if r.status_code == 200:
        users = r.json().get("users", [])
        for u in users:
            if u["email"] == CONTRACTOR_EMAIL:
                return u["id"]
    pytest.skip("Contractor not found")


# ─── Test 1: Verified contractor fee endpoint ───────────────────────────────

class TestVerifiedContractorFee:
    def test_get_verified_fee_returns_fee(self):
        r = requests.get(f"{BASE_URL}/api/payments/verified-contractor/fee")
        assert r.status_code == 200, f"Expected 200 got {r.status_code}: {r.text}"
        data = r.json()
        assert "fee" in data, f"Missing 'fee' in response: {data}"
        assert isinstance(data["fee"], (int, float)), f"fee must be numeric: {data}"
        assert data["fee"] == 39.99 or data["fee"] > 0, f"Unexpected fee: {data['fee']}"
        print(f"✅ Verified contractor fee: {data['fee']}")


# ─── Test 2: Admin revoke verified contractor ────────────────────────────────

class TestAdminRevokeVerified:
    def test_revoke_verified_with_note(self, admin_headers, contractor_id):
        """PUT with is_verified_contractor=false and revoke_note should work"""
        r = requests.put(
            f"{BASE_URL}/api/admin/verified-contractors/{contractor_id}",
            json={"is_verified_contractor": False, "revoke_note": "TEST revoke reason"},
            headers=admin_headers
        )
        assert r.status_code == 200, f"Revoke failed: {r.status_code} {r.text}"
        data = r.json()
        assert "message" in data
        print(f"✅ Revoke response: {data}")

        # Verify DB: the contractor should no longer be in verified list
        r2 = requests.get(f"{BASE_URL}/api/admin/verified-contractors", headers=admin_headers)
        assert r2.status_code == 200
        verified_ids = [c["id"] for c in r2.json()]
        assert contractor_id not in verified_ids, "Contractor still in verified list after revoke"
        print("✅ Contractor removed from verified list")

    def test_revoke_note_stored_in_db(self, admin_headers, contractor_id):
        """Verify revoke_note was stored"""
        r = requests.get(f"{BASE_URL}/api/admin/users/{contractor_id}", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data.get("verified_revoke_note") == "TEST revoke reason", \
            f"revoke_note not stored correctly: {data.get('verified_revoke_note')}"
        assert "verified_revoked_at" in data, "verified_revoked_at not set"
        print(f"✅ Revoke note stored: {data.get('verified_revoke_note')}")

    def test_grant_verified_back(self, admin_headers, contractor_id):
        """PUT with is_verified_contractor=true should restore verified status"""
        r = requests.put(
            f"{BASE_URL}/api/admin/verified-contractors/{contractor_id}",
            json={"is_verified_contractor": True},
            headers=admin_headers
        )
        assert r.status_code == 200, f"Grant failed: {r.status_code} {r.text}"
        print(f"✅ Grant back response: {r.json()}")

        # Verify in verified list now
        r2 = requests.get(f"{BASE_URL}/api/admin/verified-contractors", headers=admin_headers)
        assert r2.status_code == 200
        verified_ids = [c["id"] for c in r2.json()]
        assert contractor_id in verified_ids, "Contractor not in verified list after re-grant"
        print("✅ Contractor restored to verified list")


# ─── Test 3: Email functions exist ───────────────────────────────────────────

class TestEmailFunctions:
    def test_send_verified_contractor_email_exists(self):
        try:
            import sys
            sys.path.insert(0, '/app/backend')
            from utils.email_utils import send_verified_contractor_email
            assert callable(send_verified_contractor_email)
            print("✅ send_verified_contractor_email exists and is callable")
        except ImportError as e:
            pytest.fail(f"send_verified_contractor_email not importable: {e}")

    def test_send_revoke_verified_email_exists(self):
        try:
            import sys
            sys.path.insert(0, '/app/backend')
            from utils.email_utils import send_revoke_verified_email
            assert callable(send_revoke_verified_email)
            print("✅ send_revoke_verified_email exists and is callable")
        except ImportError as e:
            pytest.fail(f"send_revoke_verified_email not importable: {e}")
