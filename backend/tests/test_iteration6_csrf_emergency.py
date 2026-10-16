# Iteration 6: session-bound CSRF, emergency job fee, demo jobs, admin emergency fee settings
import os
import io
import struct
import zlib
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def png_bytes():
    raw = b"\x00\xff\x00\x00"
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return s, r.json()


def session_only(s):
    """New session carrying ONLY tdl_session cookie (simulates browser dropping tdl_csrf)."""
    n = requests.Session()
    n.cookies.set("tdl_session", s.cookies.get("tdl_session"), domain=requests.utils.urlparse(BASE_URL).hostname)
    return n


@pytest.fixture(scope="module")
def contractor():
    return login("contractor1@test.com", "Test@1234")


@pytest.fixture(scope="module")
def crew():
    return login("testcrew@thedaylaborers.com", "Crew@1234")


@pytest.fixture(scope="module")
def admin():
    return login("admin@thedaylaborers.com", "Admin@123")


# ---- CSRF (session-bound) ----
def test_login_body_has_csrf(contractor):
    s, body = contractor
    assert isinstance(body.get("csrf_token"), str) and len(body["csrf_token"]) == 64
    assert s.cookies.get("tdl_csrf") == body["csrf_token"]


def test_csrf_endpoint_session_only(contractor):
    s, body = contractor
    n = session_only(s)
    r = n.get(f"{API}/auth/csrf")
    assert r.status_code == 200
    assert r.json()["csrf_token"] == body["csrf_token"]


def test_upload_job_images_session_only_with_header(contractor):
    s, body = contractor
    n = session_only(s)
    r = n.post(f"{API}/users/upload-job-images", headers={"X-CSRF-Token": body["csrf_token"]},
               files=[("files", ("t.png", png_bytes(), "image/png"))])
    assert r.status_code == 200, r.text
    assert r.json()["urls"][0].startswith("/api/public/files/thedaylaborers/job_images/")


def test_upload_missing_header_403(contractor):
    n = session_only(contractor[0])
    r = n.post(f"{API}/users/upload-job-images", files=[("files", ("t.png", png_bytes(), "image/png"))])
    assert r.status_code == 403
    assert "CSRF" in r.json()["detail"]


def test_upload_wrong_header_403(contractor):
    n = session_only(contractor[0])
    r = n.post(f"{API}/users/upload-job-images", headers={"X-CSRF-Token": "a" * 64},
               files=[("files", ("t.png", png_bytes(), "image/png"))])
    assert r.status_code == 403


def test_upload_photo_and_portfolio_crew(crew):
    s, body = crew
    n = session_only(s)
    h = {"X-CSRF-Token": body["csrf_token"]}
    r = n.post(f"{API}/users/upload-photo", headers=h, files={"file": ("p.png", png_bytes(), "image/png")})
    assert r.status_code == 200, r.text
    assert "url" in r.json()


def test_other_users_token_rejected(contractor, crew):
    n = session_only(contractor[0])
    r = n.post(f"{API}/users/upload-job-images", headers={"X-CSRF-Token": crew[1]["csrf_token"]},
               files=[("files", ("t.png", png_bytes(), "image/png"))])
    assert r.status_code == 403


# ---- Emergency fee ----
def test_public_fee():
    r = requests.get(f"{API}/payments/emergency/fee")
    assert r.status_code == 200
    assert r.json()["fee"] == 2.99


def _hdr(body):
    return {"X-CSRF-Token": body["csrf_token"]}


JOB = {"title": "TEST_iter6 job", "description": "TEST_ automated test job description", "trade": "General Labor", "crew_needed": 1,
       "start_time": "2026-02-01T08:00", "end_time": "2026-02-01T16:00", "pay_rate": 20,
       "address": "Atlanta, GA", "lat": 33.749, "lng": -84.388, "city": "Atlanta", "state": "GA"}


def test_emergency_job_flow(contractor, crew):
    s, body = contractor
    r = s.post(f"{API}/jobs/", json={**JOB, "title": "TEST_iter6 emergency", "is_emergency": True}, headers=_hdr(body))
    assert r.status_code == 201, r.text
    j = r.json()
    try:
        assert j["status"] == "pending_payment" and j["requires_payment"] is True and j["emergency_fee"] == 2.99
        cs, cb = crew
        ids = [x["id"] for x in cs.get(f"{API}/jobs/").json()]
        assert j["id"] not in ids
        assert cs.get(f"{API}/jobs/{j['id']}").status_code == 404
        # Crew should not bypass via status query
        leak = [x["id"] for x in cs.get(f"{API}/jobs/", params={"status": "pending_payment"}).json()]
        assert j["id"] not in leak, "crew can list pending_payment jobs via ?status=pending_payment"
    finally:
        s.delete(f"{API}/jobs/{j['id']}", headers=_hdr(body))


def test_emergency_checkout_url(contractor):
    s, body = contractor
    r = s.post(f"{API}/jobs/", json={**JOB, "title": "TEST_iter6 emergency2", "is_emergency": True}, headers=_hdr(body))
    j = r.json()
    try:
        c = s.post(f"{API}/payments/emergency/stripe/{j['id']}", json={"origin_url": BASE_URL}, headers=_hdr(body))
        assert c.status_code == 200, c.text
        assert "checkout.stripe.com" in c.json()["url"]
        st = s.get(f"{API}/payments/emergency/status/{c.json()['session_id']}")
        assert st.status_code == 200 and st.json()["published"] is False
    finally:
        s.delete(f"{API}/jobs/{j['id']}", headers=_hdr(body))


def test_checkout_regular_job_400(contractor):
    s, body = contractor
    r = s.post(f"{API}/jobs/", json=JOB, headers=_hdr(body))
    assert r.status_code == 201
    j = r.json()
    try:
        assert j["status"] == "open"
        assert s.get(f"{API}/jobs/my-jobs").json()[0]["id"] == j["id"]
        u = s.put(f"{API}/jobs/{j['id']}", json={"is_emergency": True}, headers=_hdr(body))
        assert u.status_code == 400
        c = s.post(f"{API}/payments/emergency/stripe/{j['id']}", json={}, headers=_hdr(body))
        assert c.status_code == 400
    finally:
        s.delete(f"{API}/jobs/{j['id']}", headers=_hdr(body))


# ---- Admin settings ----
def test_admin_fee_update_and_restore(admin):
    s, body = admin
    try:
        r = s.put(f"{API}/admin/settings", json={"emergency_job_price": 4.5}, headers=_hdr(body))
        assert r.status_code == 200, r.text
        assert requests.get(f"{API}/payments/emergency/fee").json()["fee"] == 4.5
        bad = s.put(f"{API}/admin/settings", json={"emergency_job_price": 0.3}, headers=_hdr(body))
        assert bad.status_code in (400, 422)
        assert requests.get(f"{API}/payments/emergency/fee").json()["fee"] == 4.5
    finally:
        s.put(f"{API}/admin/settings", json={"emergency_job_price": 2.99}, headers=_hdr(body))
    assert requests.get(f"{API}/payments/emergency/fee").json()["fee"] == 2.99


# ---- Demo jobs ----
@pytest.mark.parametrize("email", ["contractor1@test.com", "contractor2@test.com", "contractor3@test.com"])
def test_demo_jobs_per_contractor(email):
    s, _ = login(email, "Test@1234")
    jobs = s.get(f"{API}/jobs/my-jobs").json()
    demo = [j for j in jobs if 33.5 < (j.get("location") or {}).get("lat", 0) < 34.2]
    assert len(demo) >= 3


def test_crew_sees_atlanta_jobs(crew):
    s, _ = crew
    jobs = s.get(f"{API}/jobs/", params={"lat": 33.749, "lng": -84.388, "radius": 50}).json()
    assert len(jobs) >= 3


def test_testcrew2_active_job():
    s, _ = login("testcrew2@thedaylaborers.com", "Crew@1234")
    jobs = s.get(f"{API}/jobs/my-jobs").json()
    m = [j for j in jobs if "Drywall Hanging" in j["title"]]
    assert m and m[0]["status"] == "in_progress"
