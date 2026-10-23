# Iteration 9: retest payment fixes (empty body, origin allow-list, admin-paid boost owner, unpaid status regressions)
import os
import uuid
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv, dotenv_values

load_dotenv("/app/backend/.env")
_ENV = dotenv_values("/app/backend/.env")  # read real DB even if other test modules set DB_NAME defaults
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api/payments"
EVIL = "https://evil.example.com"
mdb = MongoClient(_ENV["MONGO_URL"])[_ENV["DB_NAME"]]


def login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code}")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}", "Origin": BASE_URL})
    s.user = r.json().get("user", {})
    return s


@pytest.fixture(scope="module")
def crew():
    return login("testcrew@thedaylaborers.com", "Crew@1234")


@pytest.fixture(scope="module")
def contractor3():
    return login("contractor3@test.com", "Test@1234")


@pytest.fixture(scope="module")
def admin():
    return login("admin@thedaylaborers.com", "Admin@123")


@pytest.fixture(scope="module")
def new_contractor():
    """Fresh unverified contractor so verified-contractor checkout reaches the body parser."""
    email = f"test_iter9_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={
        "email": email, "password": "Test@12345!", "role": "contractor", "name": "TEST Iter9",
        "phone": "5551234567", "agreed_to_terms": True}, timeout=30)
    if r.status_code not in (200, 201):
        pytest.skip(f"register failed: {r.status_code} {r.text[:200]}")
    s = login(email, "Test@12345!")
    yield s
    uid = mdb.users.find_one({"email": email}, {"id": 1})
    if uid:
        mdb.payment_transactions.delete_many({"user_id": uid["id"]})
    mdb.users.delete_many({"email": email})


def open_job(s):
    jobs = s.get(f"{BASE_URL}/api/jobs/my-jobs", timeout=30).json()
    return next(j for j in jobs if j["status"] == "open")


# Empty / missing JSON body must never 500
class TestEmptyBody:
    @pytest.mark.parametrize("ctype", [None, "application/json"])
    def test_boost_stripe_empty(self, contractor3, ctype):
        job = open_job(contractor3)
        h = {"Content-Type": ctype} if ctype else {}
        r = contractor3.post(f"{API}/boost/stripe/{job['id']}", headers=h, data=b"", timeout=60)
        assert r.status_code == 200, r.text
        assert "checkout.stripe.com" in r.json()["url"]

    @pytest.mark.parametrize("ctype", [None, "application/json"])
    def test_boost_paypal_empty(self, contractor3, ctype):
        job = open_job(contractor3)
        h = {"Content-Type": ctype} if ctype else {}
        r = contractor3.post(f"{API}/boost/paypal/{job['id']}", headers=h, data=b"", timeout=60)
        assert r.status_code == 503, r.text

    @pytest.mark.parametrize("ctype", [None, "application/json"])
    def test_verified_contractor_empty(self, new_contractor, ctype):
        h = {"Content-Type": ctype} if ctype else {}
        r = new_contractor.post(f"{API}/verified-contractor/create-session", headers=h, data=b"", timeout=60)
        assert r.status_code == 200, r.text
        assert "checkout.stripe.com" in r.json()["url"]

    @pytest.mark.parametrize("ctype", [None, "application/json"])
    def test_contact_unlock_empty(self, crew, contractor3, ctype):
        h = {"Content-Type": ctype} if ctype else {}
        r = crew.post(f"{API}/contact-unlock/{contractor3.user['id']}", headers=h, data=b"", timeout=60)
        assert r.status_code in (200, 400), r.text

    def test_malformed_json(self, contractor3):
        job = open_job(contractor3)
        r = contractor3.post(f"{API}/boost/stripe/{job['id']}", headers={"Content-Type": "application/json"},
                             data=b"{not json", timeout=60)
        assert r.status_code == 200, r.text


# Evil origin is replaced; endpoints still succeed
class TestOriginAllowList:
    def test_subscription_evil_origin(self, crew):
        r = crew.post(f"{API}/stripe/create-session",
                      json={"plan": "crew_monthly", "payment_method": "stripe", "origin_url": EVIL}, timeout=60)
        assert r.status_code == 200, r.text

    def test_paypal_evil_origin(self, crew):
        r = crew.post(f"{API}/paypal/create-order",
                      json={"plan": "crew_monthly", "payment_method": "paypal", "origin_url": EVIL}, timeout=60)
        assert r.status_code == 503

    def test_verified_evil_origin(self, new_contractor):
        r = new_contractor.post(f"{API}/verified-contractor/create-session", json={"origin_url": EVIL}, timeout=60)
        assert r.status_code == 200, r.text


# Admin creates a boost for a contractor's job -> tx.job_owner_id is the job owner
class TestAdminBoostOwner:
    def test_admin_boost_tx_owner(self, admin, contractor3):
        job = open_job(contractor3)
        r = admin.post(f"{API}/boost/stripe/{job['id']}", json={"origin_url": EVIL}, timeout=60)
        assert r.status_code == 200, r.text
        tx = mdb.payment_transactions.find_one({"session_id": r.json()["session_id"]})
        assert tx["job_owner_id"] == contractor3.user["id"]
        assert tx["user_id"] == admin.user["id"]
        st = admin.get(f"{API}/boost/stripe/status/{r.json()['session_id']}", timeout=60)
        assert st.status_code == 200 and st.json()["payment_status"] == "unpaid"


# Unpaid sessions grant nothing (polling path uses _status_matches)
class TestUnpaidRegression:
    def test_verified_unpaid(self, new_contractor):
        sid = new_contractor.post(f"{API}/verified-contractor/create-session", json={"origin_url": BASE_URL},
                                  timeout=60).json()["session_id"]
        st = new_contractor.get(f"{API}/verified-contractor/status/{sid}", timeout=60)
        assert st.status_code == 200 and st.json()["payment_status"] == "unpaid"
        me = mdb.users.find_one({"id": new_contractor.user["id"]})
        assert not me.get("is_verified_contractor")

    def test_guest_job_unpaid(self):
        r = requests.post(f"{API}/guest-job/checkout", json={
            "title": "TEST guest job", "description": "TEST guest job description long enough",
            "trade": "General Labor", "crew_needed": 1, "start_time": "2026-03-01T08:00", "pay_rate": 20,
            "address": "123 Main St, Austin, TX", "lat": 30.27, "lng": -97.74, "city": "Austin", "state": "TX",
            "poster_name": "TEST Guest", "poster_email": "test_guest@example.com", "poster_phone": "5551234567",
            "origin_url": EVIL}, timeout=60)
        assert r.status_code == 200, r.text
        sid = r.json()["session_id"]
        st = requests.get(f"{API}/guest-job/status/{sid}", timeout=60)
        assert st.status_code == 200 and st.json()["published"] is False
        mdb.guest_jobs.delete_many({"session_id": sid})
        mdb.payment_transactions.delete_many({"session_id": sid})

    def test_emergency_status_missing(self, contractor3):
        r = contractor3.get(f"{API}/emergency/status/cs_test_nonexistent", timeout=60)
        assert r.status_code == 404

    def test_contact_unlock_unpaid(self, crew, contractor3):
        r = crew.post(f"{API}/contact-unlock/{contractor3.user['id']}", json={"origin_url": BASE_URL}, timeout=60)
        if r.status_code == 400:
            pytest.skip("crew already has contact access")
        st = crew.get(f"{API}/contact-unlock/status/{r.json()['session_id']}", timeout=60)
        assert st.status_code == 200 and st.json()["payment_status"] == "unpaid"
