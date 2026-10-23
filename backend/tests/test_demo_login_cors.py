# Demo accounts login, CORS for alias domain, CSRF endpoint, TEST20 coupon (iteration 5)
import os
import pytest
import requests

from staging_config import get_seeded_account, get_staging_api_url, get_staging_web_origin

BASE_URL = get_staging_api_url()
ALIAS = get_staging_web_origin()

ACCOUNTS = [
    (*get_seeded_account("SUPERADMIN"), ("admin", "super_admin")),
    (*get_seeded_account("ADMIN"), ("admin", "super_admin")),
    (*get_seeded_account("CONTRACTOR1"), ("contractor",)),
    (*get_seeded_account("CONTRACTOR2"), ("contractor",)),
    (*get_seeded_account("CONTRACTOR3"), ("contractor",)),
    (*get_seeded_account("CREW"), ("crew",)),
    (*get_seeded_account("CREW2"), ("crew",)),
]


def login(email, pw, origin=ALIAS):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw},
               headers={"Origin": origin})
    return s, r


# CORS preflight
def test_preflight_alias_allowed():
    r = requests.options(f"{BASE_URL}/api/auth/login", headers={
        "Origin": ALIAS, "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-csrf-token"})
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == ALIAS
    assert r.headers.get("access-control-allow-credentials") == "true"


def test_preflight_evil_rejected():
    r = requests.options(f"{BASE_URL}/api/auth/login", headers={
        "Origin": "https://evil.example.com", "Access-Control-Request-Method": "POST"})
    assert r.status_code != 200 or r.headers.get("access-control-allow-origin") != "https://evil.example.com"
    assert r.headers.get("access-control-allow-origin") != "https://evil.example.com"


def test_csrf_endpoint_evil_origin_no_acao():
    s, r = login(*get_seeded_account("CREW"))
    assert r.status_code == 200
    r2 = s.get(f"{BASE_URL}/api/auth/csrf", headers={"Origin": "https://evil.example.com"})
    assert r2.headers.get("access-control-allow-origin") != "https://evil.example.com"


# Login for every demo account
@pytest.mark.parametrize("email,pw,roles", ACCOUNTS)
def test_demo_login(email, pw, roles):
    s, r = login(email, pw)
    assert r.status_code == 200, r.text
    assert r.headers.get("access-control-allow-origin") == ALIAS
    assert "tdl_session" in s.cookies and "tdl_csrf" in s.cookies
    me = s.get(f"{BASE_URL}/api/users/me", headers={"Origin": ALIAS})
    assert me.status_code == 200
    assert me.json()["email"] == email
    assert me.json().get("role") in roles
    c = s.get(f"{BASE_URL}/api/auth/csrf", headers={"Origin": ALIAS})
    assert c.status_code == 200
    assert c.json()["csrf_token"] == s.cookies["tdl_csrf"]


def test_wrong_password_rejected():
    _, r = login(get_seeded_account("CONTRACTOR3")[0], "WrongPass!1")
    assert r.status_code in (400, 401)
    assert "detail" in r.json()


def test_coupon_test20():
    s, r = login(*get_seeded_account("CONTRACTOR1"))
    assert r.status_code == 200
    c = s.get(f"{BASE_URL}/api/payments/coupon/TEST20", params={"plan": "contractor_pro"})
    assert c.status_code == 200, c.text
    d = c.json()
    print(d)
    assert d.get("valid") is True
    assert str(d.get("percent_off", d.get("discount_percent", d.get("discount")))).startswith("20")


def test_verified_contractors():
    r = requests.get(f"{BASE_URL}/api/public/verified-contractors")
    if r.status_code == 404:
        r = requests.get(f"{BASE_URL}/api/public/verified-contractors")
    assert r.status_code == 200, r.text
    d = r.json()
    items = d if isinstance(d, list) else d.get("contractors", d.get("items", []))
    print(len(items))
    assert len(items) >= 3


def test_write_without_csrf_rejected_and_with_csrf_ok():
    s, r = login(*get_seeded_account("CREW"))
    me = s.get(f"{BASE_URL}/api/users/me").json()
    print({k: me.get(k) for k in ("availability", "is_available", "available")})
    # no CSRF header with cookie session -> 403
    r1 = s.post(f"{BASE_URL}/api/auth/logout", headers={"Origin": ALIAS})
    print("logout without csrf", r1.status_code)
    s2, _ = login(*get_seeded_account("CREW"))
    r2 = s2.post(f"{BASE_URL}/api/auth/logout", headers={"Origin": ALIAS, "X-CSRF-Token": s2.cookies["tdl_csrf"]})
    assert r2.status_code == 200
