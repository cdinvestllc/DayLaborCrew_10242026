# Iteration 7: crew status allow-list on GET /api/jobs/ and job-post credit refund on deleting unpaid emergency job
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

JOB = {"title": "TEST_iter7 job", "description": "TEST_ automated test job description", "trade": "General Labor",
       "crew_needed": 1, "start_time": "2026-02-01T08:00", "end_time": "2026-02-01T16:00", "pay_rate": 20,
       "address": "Atlanta, GA", "lat": 33.749, "lng": -84.388, "city": "Atlanta", "state": "GA"}


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    b = r.json()
    s.headers.update({"X-CSRF-Token": b["csrf_token"]})
    return s


@pytest.fixture(scope="module")
def c3():
    return login("contractor3@test.com", "Test@1234")


@pytest.fixture(scope="module")
def crew():
    return login("testcrew@thedaylaborers.com", "Crew@1234")


def used(s):
    r = s.get(f"{API}/payments/subscription/status")
    assert r.status_code == 200, r.text
    return r.json()["job_posts_used"]


# ---- Crew status allow-list ----
@pytest.mark.parametrize("st", ["pending_payment", "cancelled", "in_progress", "completed", "suspended", "bogus"])
def test_crew_disallowed_status_only_returns_live(crew, st):
    r = crew.get(f"{API}/jobs/", params={"status": st})
    assert r.status_code == 200
    statuses = {j["status"] for j in r.json()}
    assert statuses <= {"open", "fulfilled"}, statuses


def test_crew_no_status_live_only(crew):
    jobs = crew.get(f"{API}/jobs/").json()
    assert len(jobs) > 0
    assert {j["status"] for j in jobs} <= {"open", "fulfilled"}


def test_crew_status_open(crew):
    jobs = crew.get(f"{API}/jobs/", params={"status": "open"}).json()
    assert len(jobs) > 0
    assert all(j["status"] == "open" for j in jobs)


def test_crew_status_fulfilled(crew):
    r = crew.get(f"{API}/jobs/", params={"status": "fulfilled"})
    assert r.status_code == 200
    assert all(j["status"] == "fulfilled" for j in r.json())


def test_pending_job_hidden_from_crew_all_queries(c3, crew):
    r = c3.post(f"{API}/jobs/", json={**JOB, "title": "TEST_iter7 hidden", "is_emergency": True})
    assert r.status_code == 201, r.text
    j = r.json()
    try:
        assert j["status"] == "pending_payment"
        for p in [{}, {"status": "pending_payment"}, {"status": "cancelled"}, {"status": "in_progress"},
                  {"status": "pending_payment", "lat": 33.749, "lng": -84.388, "radius": 50}]:
            ids = [x["id"] for x in crew.get(f"{API}/jobs/", params=p).json()]
            assert j["id"] not in ids, p
        assert crew.get(f"{API}/jobs/{j['id']}").status_code == 404
        # contractor still sees own pending job
        assert j["id"] in [x["id"] for x in c3.get(f"{API}/jobs/").json()]
    finally:
        c3.delete(f"{API}/jobs/{j['id']}")


# ---- Refund on delete ----
def test_delete_pending_emergency_refunds_credit(c3):
    before = used(c3)
    r = c3.post(f"{API}/jobs/", json={**JOB, "title": "TEST_iter7 refund", "is_emergency": True})
    assert r.status_code == 201, r.text
    jid = r.json()["id"]
    assert used(c3) == before + 1
    d = c3.delete(f"{API}/jobs/{jid}")
    assert d.status_code == 200
    assert used(c3) == before
    assert c3.get(f"{API}/jobs/{jid}").status_code == 404


def test_delete_regular_open_job_no_refund(c3):
    before = used(c3)
    r = c3.post(f"{API}/jobs/", json={**JOB, "title": "TEST_iter7 regular"})
    assert r.status_code == 201
    jid = r.json()["id"]
    assert used(c3) == before + 1
    c3.delete(f"{API}/jobs/{jid}")
    assert used(c3) == before + 1  # live job post is consumed


def test_double_delete_no_double_refund(c3):
    before = used(c3)
    jid = c3.post(f"{API}/jobs/", json={**JOB, "title": "TEST_iter7 dbl", "is_emergency": True}).json()["id"]
    assert c3.delete(f"{API}/jobs/{jid}").status_code == 200
    assert c3.delete(f"{API}/jobs/{jid}").status_code == 404
    assert used(c3) == before


def test_crew_cannot_delete(c3, crew):
    jid = c3.post(f"{API}/jobs/", json={**JOB, "title": "TEST_iter7 crewdel", "is_emergency": True}).json()["id"]
    try:
        assert crew.delete(f"{API}/jobs/{jid}").status_code in (403, 404)
    finally:
        c3.delete(f"{API}/jobs/{jid}")
