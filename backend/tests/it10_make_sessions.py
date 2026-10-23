# Iteration 10 helper: create a fresh contractor plus contractor_basic and verified-contractor Stripe sessions (unpaid checks)
import json
import os
import time
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
email = f"test_ctr_it10_{int(time.time())}@example.com"
r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "Test@1234", "role": "contractor",
                  "name": "TEST Ctr It10", "company_name": "TEST Co", "agreed_to_terms": True}, timeout=30)
r.raise_for_status()
h = {"Authorization": f"Bearer {r.json()['access_token']}"}
sub = requests.post(f"{BASE_URL}/api/payments/stripe/create-session", headers=h, json={
    "plan": "contractor_basic", "payment_method": "stripe", "origin_url": BASE_URL}, timeout=60)
print("sub create", sub.status_code)
ver = requests.post(f"{BASE_URL}/api/payments/verified-contractor/create-session", headers=h,
                    json={"origin_url": BASE_URL}, timeout=60)
print("ver create", ver.status_code)
out = {"email": email, "token": r.json()["access_token"], "sub": sub.json(), "ver": ver.json()}
for k, path in (("sub", "stripe/status"), ("ver", "verified-contractor/status")):
    st = requests.get(f"{BASE_URL}/api/payments/{path}/{out[k]['session_id']}", headers=h, timeout=60).json()
    print(k, "unpaid status:", st)
    assert st["payment_status"] == "unpaid" and st["fulfilled"] is False
json.dump(out, open("/tmp/it10_sessions.json", "w"))
print(out["sub"]["url"])
print(out["ver"]["url"])
