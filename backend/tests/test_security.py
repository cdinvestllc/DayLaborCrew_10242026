"""Security regression tests: auth, authorization, sessions, resets, OAuth, WebSockets.

Runs against the live preview backend (HTTPS is required for Secure cookies).
"""
import asyncio
import os
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import requests
import websockets
from dotenv import load_dotenv
from jose import jwt
from pymongo import MongoClient

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
import sys  # noqa: E402
sys.path.insert(0, str(ROOT))
import auth  # noqa: E402

from staging_config import get_staging_api_url, get_staging_mongo_settings

BASE = get_staging_api_url()
API = f"{BASE}/api"
WS = BASE.replace("https", "wss", 1) + "/api/ws"
PW = "Sec@Test1234"
PREFIX = "sec_test_"

STAGING_MONGO_URL, STAGING_DB_NAME = get_staging_mongo_settings()
mongo = MongoClient(STAGING_MONGO_URL)[STAGING_DB_NAME]


def make_user(role="crew", active=True, **extra):
    uid = str(uuid.uuid4())
    email = f"{PREFIX}{uid[:8]}@example.com"
    mongo.users.insert_one({
        "id": uid, "email": email, "password_hash": auth.hash_password(PW), "role": role,
        "name": f"Sec {role}", "is_active": active, "points": 0, "token_version": 0,
        "created_at": datetime.now(timezone.utc).isoformat(), **extra,
    })
    return {"id": uid, "email": email}


def login(email, password=PW):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    return s, r


def csrf(s):
    return {"X-CSRF-Token": s.cookies.get("tdl_csrf", "")}


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    ids = [u["id"] for u in mongo.users.find({"email": {"$regex": f"^{PREFIX}"}}, {"id": 1})]
    mongo.users.delete_many({"id": {"$in": ids}})
    mongo.messages.delete_many({"subject": "sec-test"})
    mongo.payment_transactions.delete_many({"session_id": {"$regex": "^sec-test"}})
    mongo.password_resets.delete_many({"user_id": {"$in": ids}})
    mongo.login_attempts.delete_many({"email": {"$regex": f"^{PREFIX}"}})


# ─── Unit: token validation ──────────────────────────────────────────────────

def test_token_roundtrip_and_claims():
    tok = auth.create_token({"sub": "u1", "role": "crew"}, 3)
    p = auth.decode_token(tok)
    assert p["sub"] == "u1" and p["tv"] == 3 and p["iss"] == auth.ISSUER and p["aud"] == auth.AUDIENCE and p["jti"]


def test_token_rejects_tampering_expiry_alg_and_claims():
    now = datetime.now(timezone.utc)
    base = {"sub": "u1", "role": "crew", "iat": now, "exp": now + timedelta(hours=1), "iss": auth.ISSUER,
            "aud": auth.AUDIENCE, "jti": "x", "tv": 0, "typ": "access"}
    assert auth.decode_token(jwt.encode(base, "another-secret-that-is-long-enough-123456", algorithm="HS256")) is None
    assert auth.decode_token(jwt.encode({**base, "exp": now - timedelta(seconds=5)}, auth.SECRET_KEY, algorithm="HS256")) is None
    assert auth.decode_token(jwt.encode({**base, "aud": "other"}, auth.SECRET_KEY, algorithm="HS256")) is None
    assert auth.decode_token(jwt.encode({**base, "iss": "other"}, auth.SECRET_KEY, algorithm="HS256")) is None
    assert auth.decode_token(jwt.encode({**base, "role": "god"}, auth.SECRET_KEY, algorithm="HS256")) is None
    no_jti = {k: v for k, v in base.items() if k != "jti"}
    assert auth.decode_token(jwt.encode(no_jti, auth.SECRET_KEY, algorithm="HS256")) is None
    unsigned = jwt.encode(base, auth.SECRET_KEY, algorithm="HS256").rsplit(".", 1)[0] + "."
    assert auth.decode_token(unsigned) is None


def test_password_policy():
    assert auth.validate_password_strength("short1!A")is None
    for bad in ["abc", "alllowercase1!", "ALLUPPER1!", "NoDigits!!", "NoSymbol123", "A1!" + "a" * 80]:
        assert auth.validate_password_strength(bad)


# ─── Registration / role escalation ──────────────────────────────────────────

@pytest.mark.parametrize("role", ["admin", "super_admin"])
def test_public_registration_cannot_create_admin(role):
    r = requests.post(f"{API}/auth/register", json={"email": f"{PREFIX}{role}{uuid.uuid4().hex[:6]}@example.com",
                                                    "password": PW, "role": role, "name": "x", "agreed_to_terms": True})
    assert r.status_code == 400
    assert mongo.users.count_documents({"email": {"$regex": f"^{PREFIX}{role}"}}) == 0


def test_registration_rejects_weak_password():
    r = requests.post(f"{API}/auth/register", json={"email": f"{PREFIX}weak@example.com", "password": "123456",
                                                    "role": "crew", "name": "x", "agreed_to_terms": True})
    assert r.status_code == 400


# ─── Sessions: cookies, CSRF, logout, revocation ─────────────────────────────

def test_login_sets_httponly_secure_cookie_and_csrf_enforced():
    u = make_user()
    s, r = login(u["email"])
    assert r.status_code == 200
    cookie_hdr = r.headers.get("set-cookie", "").lower()
    assert "tdl_session=" in cookie_hdr and "httponly" in cookie_hdr and "secure" in cookie_hdr and "samesite=lax" in cookie_hdr
    assert s.get(f"{API}/users/me").json()["id"] == u["id"]
    assert "password_hash" not in s.get(f"{API}/users/me").json()
    assert s.put(f"{API}/users/privacy", json={"hide_email": True}).status_code == 403
    assert s.put(f"{API}/users/privacy", json={"hide_email": True}, headers={"X-CSRF-Token": "wrong"}).status_code == 403
    assert s.put(f"{API}/users/privacy", json={"hide_email": True}, headers=csrf(s)).status_code == 200


def test_logout_revokes_token():
    u = make_user()
    s, r = login(u["email"])
    token = r.json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    assert requests.get(f"{API}/users/me", headers=h).status_code == 200
    assert requests.post(f"{API}/auth/logout", headers=h).status_code == 200
    assert requests.get(f"{API}/users/me", headers=h).status_code == 401


def test_logout_all_and_role_change_invalidate_sessions():
    u = make_user()
    _, r1 = login(u["email"])
    _, r2 = login(u["email"])
    h1 = {"Authorization": f"Bearer {r1.json()['access_token']}"}
    h2 = {"Authorization": f"Bearer {r2.json()['access_token']}"}
    assert requests.post(f"{API}/auth/logout-all", headers=h1).status_code == 200
    assert requests.get(f"{API}/users/me", headers=h2).status_code == 401

    v = make_user()
    _, r = login(v["email"])
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    mongo.users.update_one({"id": v["id"]}, {"$set": {"role": "contractor"}})
    assert requests.get(f"{API}/users/me", headers=h).status_code == 401


def test_inactive_user_blocked():
    u = make_user()
    _, r = login(u["email"])
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    mongo.users.update_one({"id": u["id"]}, {"$set": {"is_active": False}})
    assert requests.get(f"{API}/users/me", headers=h).status_code == 403
    assert login(u["email"])[1].status_code == 403


def test_missing_or_garbage_token_rejected():
    assert requests.get(f"{API}/users/me").status_code == 401
    assert requests.get(f"{API}/users/me", headers={"Authorization": "Bearer abc.def.ghi"}).status_code == 401


def test_account_lockout_after_repeated_failures():
    u = make_user()
    mongo.login_attempts.update_one({"email": u["email"]}, {"$set": {"count": 9, "first_at": time.time(), "locked_until": 0}}, upsert=True)
    assert login(u["email"], "Wrong@Pass1")[1].status_code == 401
    assert login(u["email"])[1].status_code == 429  # locked even with the right password


# ─── Password reset ──────────────────────────────────────────────────────────

def _seed_reset(user_id, expires_in=timedelta(hours=1)):
    raw = secrets.token_urlsafe(32)
    mongo.password_resets.insert_one({"id": str(uuid.uuid4()), "user_id": user_id, "token_hash": auth.hash_secret(raw),
                                      "expires_at": datetime.now(timezone.utc) + expires_in, "used": False})
    return raw


def test_password_reset_single_use_and_session_invalidation():
    u = make_user()
    _, r = login(u["email"])
    old = {"Authorization": f"Bearer {r.json()['access_token']}"}
    raw = _seed_reset(u["id"])
    weak = requests.post(f"{API}/auth/reset-password", json={"token": raw, "new_password": "weak"})
    assert weak.status_code == 400
    ok = requests.post(f"{API}/auth/reset-password", json={"token": raw, "new_password": "New@Pass5678"})
    assert ok.status_code == 200
    reuse = requests.post(f"{API}/auth/reset-password", json={"token": raw, "new_password": "Other@Pass5678"})
    assert reuse.status_code == 400
    assert requests.get(f"{API}/users/me", headers=old).status_code == 401
    assert login(u["email"], "New@Pass5678")[1].status_code == 200
    stored = mongo.password_resets.find_one({"user_id": u["id"]})
    assert stored and raw not in str(stored)


def test_password_reset_expired_and_unknown_tokens():
    u = make_user()
    raw = _seed_reset(u["id"], expires_in=timedelta(seconds=-1))
    assert requests.post(f"{API}/auth/reset-password", json={"token": raw, "new_password": "New@Pass5678"}).status_code == 400
    assert requests.post(f"{API}/auth/reset-password", json={"token": "nope", "new_password": "New@Pass5678"}).status_code == 400


def test_forgot_password_stores_only_hash():
    u = make_user()
    r = requests.post(f"{API}/auth/forgot-password", json={"email": u["email"]})
    assert r.status_code == 200
    doc = mongo.password_resets.find_one({"user_id": u["id"]})
    assert doc and "token" not in doc and len(doc["token_hash"]) == 64


# ─── OAuth ───────────────────────────────────────────────────────────────────

def test_oauth_failures_are_safe():
    assert requests.post(f"{API}/auth/google/callback", json={}).status_code == 400
    r = requests.post(f"{API}/auth/google/callback", json={"session_id": "invalid-session-123"})
    assert r.status_code in (401, 503)
    assert "access_token" not in r.text


# ─── Authorization / cross-user access ───────────────────────────────────────

def test_admin_endpoints_require_admin():
    u = make_user()
    _, r = login(u["email"])
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    for path in ["/admin/users", "/admin/analytics", "/admin/export/users/json", "/ws/online-users"]:
        assert requests.get(f"{API}{path}", headers=h).status_code == 403, path
    assert requests.get(f"{API}/ws/online-users").status_code == 401


def test_admin_cannot_escalate_roles():
    admin = make_user(role="admin")
    target = make_user()
    sup = mongo.users.find_one({"role": "super_admin"}, {"id": 1})
    _, r = login(admin["email"])
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert requests.put(f"{API}/admin/users/{target['id']}", json={"role": "super_admin"}, headers=h).status_code == 403
    assert requests.put(f"{API}/admin/users/{target['id']}", json={"role": "admin"}, headers=h).status_code == 403
    assert requests.put(f"{API}/admin/users/{admin['id']}", json={"role": "contractor"}, headers=h).status_code == 403
    if sup:
        assert requests.post(f"{API}/admin/users/{sup['id']}/activate", headers=h).status_code == 403
        assert requests.put(f"{API}/admin/users/{sup['id']}/points?points=5", headers=h).status_code == 403
    assert mongo.users.find_one({"id": target["id"]})["role"] == "crew"


def test_suspension_by_admin_revokes_sessions():
    admin = make_user(role="admin")
    target = make_user()
    _, ra = login(admin["email"])
    _, rt = login(target["email"])
    ha = {"Authorization": f"Bearer {ra.json()['access_token']}"}
    ht = {"Authorization": f"Bearer {rt.json()['access_token']}"}
    assert requests.post(f"{API}/admin/users/{target['id']}/suspend", headers=ha).status_code == 200
    mongo.users.update_one({"id": target["id"]}, {"$set": {"is_active": True}})
    assert requests.get(f"{API}/users/me", headers=ht).status_code == 401


def test_cross_user_message_and_payment_access():
    a, b, c = make_user(), make_user(), make_user()
    thread = str(uuid.uuid4())
    mongo.messages.insert_one({"thread_id": thread, "sender_id": a["id"], "recipient_id": b["id"], "subject": "sec-test", "body": "secret", "replies": []})
    mongo.payment_transactions.insert_one({"id": str(uuid.uuid4()), "user_id": a["id"], "session_id": "sec-test-order", "plan": "daily", "payment_status": "pending"})
    _, r = login(c["email"])
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert requests.get(f"{API}/users/messages/{thread}", headers=h).status_code == 404
    assert requests.post(f"{API}/users/messages/{thread}/reply", json={"body": "x"}, headers=h).status_code == 403
    assert requests.post(f"{API}/payments/paypal/capture/sec-test-order?plan=monthly", headers=h).status_code == 404


def test_public_profile_privacy_cannot_be_bypassed_with_viewer_id():
    u = make_user(privacy={"hide_email": True, "hide_phone": True}, phone="555")
    r = requests.get(f"{API}/users/public/{u['id']}?viewer_id={u['id']}")
    assert r.status_code == 200 and "email" not in r.json() and "phone" not in r.json()


# ─── WebSockets ──────────────────────────────────────────────────────────────

def test_websocket_requires_single_use_ticket():
    u = make_user()
    _, r = login(u["email"])
    token = r.json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    ticket = requests.post(f"{API}/ws/ticket", headers=h).json()["ticket"]

    async def run():
        async with websockets.connect(f"{WS}?ticket={ticket}") as ws:
            first = await asyncio.wait_for(ws.recv(), 10)
            assert '"connected"' in first
        for url in [f"{WS}?ticket={ticket}", f"{WS}?ticket=bogus", WS, f"{WS}/{token}"]:
            with pytest.raises(Exception):
                async with websockets.connect(url) as ws:
                    await asyncio.wait_for(ws.recv(), 10)

    asyncio.run(run())
    assert requests.post(f"{API}/ws/ticket").status_code == 401


# ─── CORS ────────────────────────────────────────────────────────────────────

def test_cors_rejects_untrusted_origin():
    r = requests.options(f"{API}/auth/login", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert r.headers.get("access-control-allow-origin") not in ("*", "https://evil.example")
    r = requests.options(f"{API}/auth/login", headers={"Origin": BASE, "Access-Control-Request-Method": "POST"})
    assert r.headers.get("access-control-allow-origin") == BASE
