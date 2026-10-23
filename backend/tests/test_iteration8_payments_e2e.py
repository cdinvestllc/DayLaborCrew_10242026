# Iteration 8: Stripe/PayPal payment API checks against the public preview URL
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api/payments"


def login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code}")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}", "Origin": BASE_URL})
    return s


@pytest.fixture(scope="module")
def crew():
    return login("testcrew@thedaylaborers.com", "Crew@1234")


@pytest.fixture(scope="module")
def crew2():
    return login("testcrew2@thedaylaborers.com", "Crew@1234")


@pytest.fixture(scope="module")
def contractor():
    return login("contractor1@test.com", "Test@1234")


def checkout(s, plan="crew_monthly", coupon=None, method="stripe"):
    body = {"plan": plan, "payment_method": method, "origin_url": BASE_URL}
    if coupon:
        body["coupon_code"] = coupon
    return s.post(f"{API}/{'stripe/create-session' if method == 'stripe' else 'paypal/create-order'}", json=body, timeout=60)


# Stripe subscription session creation + coupon
class TestStripeSubscription:
    def test_session_with_coupon_amount(self, crew):
        r = checkout(crew, coupon="test20")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "checkout.stripe.com" in d["url"]
        assert d["final_amount"] == 15.99

    def test_unpaid_status_grants_nothing(self, crew, crew2):
        before = crew.get(f"{API}/subscription/status").json()
        sid = checkout(crew).json()["session_id"]
        r = crew.get(f"{API}/stripe/status/{sid}", timeout=60)
        assert r.status_code == 200, r.text
        assert r.json()["payment_status"] == "unpaid"
        assert not r.json().get("already_processed")
        after = crew.get(f"{API}/subscription/status").json()
        assert after["plan"] == before["plan"] and after["subscription_end"] == before["subscription_end"]
        # another user may not read it
        r2 = crew2.get(f"{API}/stripe/status/{sid}", timeout=60)
        assert r2.status_code == 404

    def test_wrong_role_plan(self, crew):
        r = checkout(crew, plan="contractor_pro")
        assert r.status_code == 400
        assert "not available" in r.json()["detail"]

    def test_invalid_plan(self, crew):
        assert checkout(crew, plan="bogus").status_code == 400

    def test_invalid_coupon(self, crew):
        r = checkout(crew, coupon="NOPE_XYZ")
        assert r.status_code == 400
        assert "coupon" in r.json()["detail"].lower()

    def test_unauthenticated(self):
        r = requests.post(f"{API}/stripe/create-session", json={"plan": "crew_monthly", "payment_method": "stripe", "origin_url": BASE_URL})
        assert r.status_code in (401, 403)

    def test_webhook_fail_closed(self):
        r = requests.post(f"{API}/stripe/webhook", data=b'{"type":"checkout.session.completed"}',
                          headers={"Content-Type": "application/json"})
        assert r.status_code == 503
        assert "not configured" in r.json()["detail"]

    def test_webhook_fake_signature(self):
        r = requests.post(f"{API}/stripe/webhook", data=b'{}', headers={"Stripe-Signature": "t=1,v1=abc"})
        assert r.status_code in (400, 503)


# Boost, verified contractor, contact unlock sessions (unpaid)
class TestOtherStripeCheckouts:
    def test_boost_session_and_unpaid(self, contractor):
        jobs = contractor.get(f"{BASE_URL}/api/jobs/my-jobs").json()
        job = next(j for j in jobs if j["status"] == "open")
        r = contractor.post(f"{API}/boost/stripe/{job['id']}", json={"origin_url": BASE_URL}, timeout=60)
        assert r.status_code == 200, r.text
        assert "checkout.stripe.com" in r.json()["url"]
        st = contractor.get(f"{API}/boost/stripe/status/{r.json()['session_id']}", timeout=60)
        assert st.status_code == 200 and st.json()["payment_status"] == "unpaid"

    def test_boost_not_your_job(self, crew, contractor):
        jobs = contractor.get(f"{BASE_URL}/api/jobs/my-jobs").json()
        r = crew.post(f"{API}/boost/stripe/{jobs[0]['id']}", json={"origin_url": BASE_URL})
        assert r.status_code == 403

    def test_boost_missing_job(self, contractor):
        r = contractor.post(f"{API}/boost/stripe/nope-job", json={"origin_url": BASE_URL})
        assert r.status_code == 404

    def test_verified_contractor_active_blocked(self, contractor):
        r = contractor.post(f"{API}/verified-contractor/create-session", json={"origin_url": BASE_URL})
        assert r.status_code == 400

    def test_verified_contractor_crew_forbidden(self, crew):
        r = crew.post(f"{API}/verified-contractor/create-session", json={"origin_url": BASE_URL})
        assert r.status_code == 403

    def test_contact_unlock_session(self, crew, contractor):
        lr = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "contractor3@test.com", "password": "Test@1234"}).json()
        target_id = (lr.get("user") or {}).get("id")
        assert target_id, lr.keys()
        r = crew.post(f"{API}/contact-unlock/{target_id}", json={"origin_url": BASE_URL}, timeout=60)
        # crew may already have access to contractor contacts -> 400 is a valid outcome
        assert r.status_code in (200, 400), r.text
        if r.status_code == 200:
            assert "checkout.stripe.com" in r.json()["url"]
            st = crew.get(f"{API}/contact-unlock/status/{r.json()['session_id']}", timeout=60)
            assert st.json()["payment_status"] == "unpaid"


# PayPal not configured -> graceful 503s
class TestPayPalUnconfigured:
    def test_create_order(self, crew):
        r = checkout(crew, method="paypal")
        assert r.status_code == 503 and "PayPal is not configured" in r.json()["detail"]

    def test_capture(self, crew):
        r = crew.post(f"{API}/paypal/capture/FAKEORDER?plan=crew_monthly")
        assert r.status_code in (404, 503)

    def test_boost_paypal(self, contractor):
        jobs = contractor.get(f"{BASE_URL}/api/jobs/my-jobs").json()
        r = contractor.post(f"{API}/boost/paypal/{jobs[0]['id']}", json={"origin_url": BASE_URL})
        assert r.status_code == 503 and "PayPal is not configured" in r.json()["detail"]

    def test_paypal_webhook(self):
        r = requests.post(f"{API}/paypal/webhook", json={"event_type": "PAYMENT.CAPTURE.COMPLETED"})
        assert r.status_code == 503 and "PayPal webhook is not configured" in r.json()["detail"]
