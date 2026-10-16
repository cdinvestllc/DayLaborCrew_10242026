import os
import uuid
import httpx
import base64
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request, Depends
from database import db
from auth import get_current_user
from models import CheckoutRequest
from utils.email_utils import send_subscription_email
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest, CheckoutSessionResponse, CheckoutStatusResponse
)

router = APIRouter()
logger = logging.getLogger(__name__)

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "sk_test_emergent")
PAYPAL_CLIENT_ID = os.environ.get("PAYPAL_CLIENT_ID", "")
PAYPAL_SECRET = os.environ.get("PAYPAL_SECRET", "")
PAYPAL_MODE = os.environ.get("PAYPAL_MODE", "sandbox")
PAYPAL_BASE_URL = "https://api-m.sandbox.paypal.com" if PAYPAL_MODE == "sandbox" else "https://api-m.paypal.com"

# Subscription plans (prices defined server-side for security)
PLANS = {
    "daily": {"amount": 4.99, "days": 1, "label": "Daily Pass"},
    "weekly": {"amount": 24.99, "days": 7, "label": "Weekly Pass"},
    "monthly": {"amount": 79.99, "days": 30, "label": "Monthly Pass"},
}

# Default verified contractor fee (admin can override in settings)
DEFAULT_VERIFIED_FEE = 39.99


async def get_paypal_token() -> str:
    if not PAYPAL_CLIENT_ID or not PAYPAL_SECRET:
        raise HTTPException(status_code=503, detail="PayPal is not configured")
    creds = base64.b64encode(f"{PAYPAL_CLIENT_ID}:{PAYPAL_SECRET}".encode()).decode()
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{PAYPAL_BASE_URL}/v1/oauth2/token",
                headers={"Authorization": f"Basic {creds}", "Content-Type": "application/x-www-form-urlencoded"},
                data={"grant_type": "client_credentials"},
            )
            resp.raise_for_status()
    except httpx.HTTPError:
        logger.error("PayPal token request failed")
        raise HTTPException(status_code=502, detail="PayPal is temporarily unavailable")
    return resp.json()["access_token"]


async def get_owned_tx(session_id: str, user: dict) -> dict | None:
    """Payment transactions may only be read/finalised by the user who created them."""
    tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if tx and tx.get("user_id") != user["id"] and user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=404, detail="Payment not found")
    return tx


def now_str():
    return datetime.now(timezone.utc).isoformat()


async def resolve_plan_price(plan: str) -> dict:
    """Get plan with DB-overridden prices."""
    info = {**PLANS.get(plan, PLANS["monthly"])}
    settings = await db.settings.find_one({}, {"_id": 0})
    if settings:
        info["amount"] = settings.get(f"{plan}_price", info["amount"])
    return info


async def apply_coupon(code: str, plan: str, amount: float) -> tuple[float, dict | None]:
    """Validate coupon and return (discounted_amount, coupon_doc). Raises on invalid."""
    coupon = await db.coupons.find_one({"code": code.upper()})
    if not coupon:
        raise HTTPException(status_code=400, detail="Invalid coupon code")
    if coupon.get("usage_count", 0) >= coupon.get("usage_limit", 1):
        raise HTTPException(status_code=400, detail="Coupon usage limit reached")
    if coupon.get("expires_at"):
        try:
            exp = datetime.fromisoformat(coupon["expires_at"])
            if exp < datetime.now(timezone.utc):
                raise HTTPException(status_code=400, detail="Coupon has expired")
        except ValueError:
            pass
    if coupon.get("plan_restriction") and coupon["plan_restriction"] != plan:
        raise HTTPException(status_code=400, detail=f"Coupon only valid for {coupon['plan_restriction']} plan")
    discount = float(coupon.get("discount_percent", 0))
    discounted = round(amount * (1 - discount / 100), 2)
    return max(discounted, 0.50), coupon  # min $0.50


@router.get("/coupon/{code}")
async def validate_coupon(code: str, plan: str = "monthly", current_user: dict = Depends(get_current_user)):
    """Validate coupon and return discount info."""
    coupon = await db.coupons.find_one({"code": code.upper()}, {"_id": 0, "password_hash": 0})
    if not coupon:
        raise HTTPException(status_code=404, detail="Invalid coupon")
    if coupon.get("usage_count", 0) >= coupon.get("usage_limit", 1):
        raise HTTPException(status_code=400, detail="Coupon usage limit reached")
    if coupon.get("expires_at"):
        try:
            if datetime.fromisoformat(coupon["expires_at"]) < datetime.now(timezone.utc):
                raise HTTPException(status_code=400, detail="Coupon expired")
        except ValueError:
            pass
    plan_info = await resolve_plan_price(plan)
    discounted = round(plan_info["amount"] * (1 - float(coupon["discount_percent"]) / 100), 2)
    return {
        "valid": True,
        "code": coupon["code"],
        "discount_percent": coupon["discount_percent"],
        "original_price": plan_info["amount"],
        "final_price": max(discounted, 0.50),
        "uses_remaining": coupon["usage_limit"] - coupon.get("usage_count", 0)
    }
    credentials = base64.b64encode(f"{PAYPAL_CLIENT_ID}:{PAYPAL_SECRET}".encode()).decode()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{PAYPAL_BASE_URL}/v1/oauth2/token",
            headers={"Authorization": f"Basic {credentials}", "Content-Type": "application/x-www-form-urlencoded"},
            data={"grant_type": "client_credentials"}
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


async def update_subscription(user_id: str, plan: str, days: int, payment_method: str, amount: float, coupon_id: str = None):
    """Update user subscription after successful payment."""
    now = datetime.now(timezone.utc)
    sub_end = (now + timedelta(days=days)).isoformat()
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "subscription_status": "active",
            "subscription_plan": plan,
            "subscription_end": sub_end
        }}
    )
    # Increment coupon usage
    if coupon_id:
        await db.coupons.update_one({"_id": coupon_id}, {"$inc": {"usage_count": 1}})
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if user:
        await send_subscription_email(user["email"], user["name"], plan, sub_end)
    return sub_end


@router.get("/plans")
async def get_plans():
    settings = await db.settings.find_one({}, {"_id": 0})
    if settings:
        PLANS["daily"]["amount"] = settings.get("daily_price", PLANS["daily"]["amount"])
        PLANS["weekly"]["amount"] = settings.get("weekly_price", PLANS["weekly"]["amount"])
        PLANS["monthly"]["amount"] = settings.get("monthly_price", PLANS["monthly"]["amount"])
    return PLANS


# ─── Stripe ──────────────────────────────────────────────────────────────────

@router.post("/stripe/create-session")
async def stripe_create_session(data: CheckoutRequest, current_user: dict = Depends(get_current_user)):
    if data.plan not in PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")

    plan_info = await resolve_plan_price(data.plan)
    final_amount = plan_info["amount"]
    coupon_code = None

    if data.coupon_code:
        final_amount, coupon_doc = await apply_coupon(data.coupon_code, data.plan, final_amount)
        coupon_code = data.coupon_code.upper()
        if coupon_doc:
            await db.coupons.update_one({"code": coupon_code}, {"$inc": {"usage_count": 1}})

    origin = data.origin_url.rstrip("/")
    success_url = f"{origin}/subscription?session_id={{CHECKOUT_SESSION_ID}}&method=stripe"
    cancel_url = f"{origin}/subscription"

    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{origin}/api/payments/stripe/webhook")
    req = CheckoutSessionRequest(
        amount=float(final_amount),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"user_id": current_user["id"], "plan": data.plan, "payment_method": "stripe", "coupon": coupon_code or ""}
    )
    session = await stripe.create_checkout_session(req)

    tx = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "session_id": session.session_id,
        "amount": float(final_amount),
        "original_amount": float(plan_info["amount"]),
        "coupon_code": coupon_code,
        "currency": "usd",
        "plan": data.plan,
        "payment_method": "stripe",
        "payment_status": "pending",
        "created_at": now_str()
    }
    await db.payment_transactions.insert_one(tx)
    return {"url": session.url, "session_id": session.session_id, "final_amount": final_amount}


@router.get("/stripe/status/{session_id}")
async def stripe_payment_status(session_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{str(request.base_url)}api/payments/stripe/webhook")

    # Check if already processed
    tx = await get_owned_tx(session_id, current_user)
    if tx and tx.get("payment_status") == "paid":
        return {"status": "complete", "payment_status": "paid", "already_processed": True}

    status = await stripe.get_checkout_status(session_id)
    if status.metadata.get("user_id") not in (None, current_user["id"]) and current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=404, detail="Payment not found")

    if status.payment_status == "paid" and (not tx or tx.get("payment_status") != "paid"):
        plan = status.metadata.get("plan", "monthly")
        user_id = status.metadata.get("user_id", current_user["id"])
        plan_info = PLANS.get(plan, PLANS["monthly"])
        sub_end = await update_subscription(user_id, plan, plan_info["days"], "stripe", status.amount_total / 100)

        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "paid", "updated_at": now_str()}}
        )

    return {"status": status.status, "payment_status": status.payment_status}


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    try:
        body = await request.body()
        stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
        event = await stripe.handle_webhook(body, request.headers.get("Stripe-Signature", ""))
        if event.payment_status == "paid":
            await db.payment_transactions.update_one(
                {"session_id": event.session_id},
                {"$set": {"payment_status": "paid", "updated_at": now_str()}}
            )
    except Exception as e:
        logger.warning(f"Stripe webhook error: {e}")
    return {"status": "ok"}


# ─── PayPal ──────────────────────────────────────────────────────────────────

@router.post("/paypal/create-order")
async def paypal_create_order(data: CheckoutRequest, current_user: dict = Depends(get_current_user)):
    if data.plan not in PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")

    plan_info = await resolve_plan_price(data.plan)
    final_amount = plan_info["amount"]
    coupon_code = None

    if data.coupon_code:
        final_amount, coupon_doc = await apply_coupon(data.coupon_code, data.plan, final_amount)
        coupon_code = data.coupon_code.upper()
        if coupon_doc:
            await db.coupons.update_one({"code": coupon_code}, {"$inc": {"usage_count": 1}})

    access_token = await get_paypal_token()

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{PAYPAL_BASE_URL}/v2/checkout/orders",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json={
                "intent": "CAPTURE",
                "purchase_units": [{
                    "reference_id": f"{current_user['id']}_{data.plan}",
                    "description": f"TheDayLaborers {data.plan.title()} Subscription{' (Coupon: ' + coupon_code + ')' if coupon_code else ''}",
                    "amount": {"currency_code": "USD", "value": f"{final_amount:.2f}"}
                }],
                "application_context": {
                    "return_url": f"{data.origin_url}/subscription?method=paypal&plan={data.plan}",
                    "cancel_url": f"{data.origin_url}/subscription"
                }
            }
        )
        resp.raise_for_status()
        order = resp.json()

    order_id = order["id"]
    tx = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "session_id": order_id,
        "amount": float(final_amount),
        "original_amount": float(plan_info["amount"]),
        "coupon_code": coupon_code,
        "currency": "usd",
        "plan": data.plan,
        "payment_method": "paypal",
        "payment_status": "pending",
        "created_at": now_str()
    }
    await db.payment_transactions.insert_one(tx)

    approve_url = next((l["href"] for l in order["links"] if l["rel"] == "approve"), None)
    return {"order_id": order_id, "approve_url": approve_url, "final_amount": final_amount}


@router.post("/paypal/capture/{order_id}")
async def paypal_capture(order_id: str, plan: str, current_user: dict = Depends(get_current_user)):
    tx = await get_owned_tx(order_id, current_user)
    if not tx or tx.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=404, detail="Payment not found")
    plan = tx.get("plan", plan)
    if tx.get("payment_status") == "paid":
        return {"status": "COMPLETED", "already_processed": True}

    access_token = await get_paypal_token()

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{PAYPAL_BASE_URL}/v2/checkout/orders/{order_id}/capture",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
        )
        resp.raise_for_status()
        result = resp.json()

    status = result.get("status")
    if status == "COMPLETED":
        plan_info = PLANS.get(plan, PLANS["monthly"])
        await update_subscription(current_user["id"], plan, plan_info["days"], "paypal", plan_info["amount"])
        await db.payment_transactions.update_one(
            {"session_id": order_id},
            {"$set": {"payment_status": "paid", "updated_at": now_str()}}
        )

    return {"status": status, "order_id": order_id}


# ─── Subscription Status ─────────────────────────────────────────────────────

@router.get("/subscription/status")
async def subscription_status(current_user: dict = Depends(get_current_user)):
    from datetime import datetime, timezone
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    sub_status = user.get("subscription_status", "trial")
    sub_end = user.get("subscription_end")
    trial_end = user.get("trial_end_date")

    days_left = 0
    if sub_status == "active" and sub_end:
        try:
            end = datetime.fromisoformat(sub_end)
            days_left = max(0, (end - datetime.now(timezone.utc)).days)
            if days_left == 0:
                await db.users.update_one({"id": current_user["id"]}, {"$set": {"subscription_status": "expired"}})
                sub_status = "expired"
        except Exception:
            pass
    elif sub_status == "trial" and trial_end:
        try:
            end = datetime.fromisoformat(trial_end)
            days_left = max(0, (end - datetime.now(timezone.utc)).days)
            if days_left == 0:
                await db.users.update_one({"id": current_user["id"]}, {"$set": {"subscription_status": "expired"}})
                sub_status = "expired"
        except Exception:
            pass

    return {
        "status": sub_status,
        "plan": user.get("subscription_plan"),
        "days_remaining": days_left,
        "subscription_end": sub_end or trial_end
    }


# ─── Featured / Boost Job ─────────────────────────────────────────────────────

BOOST_PRICE = float(os.environ.get("BOOST_JOB_PRICE", "9.99"))
BOOST_DURATION_DAYS = 7


@router.post("/boost/stripe/{job_id}")
async def boost_job_stripe(job_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["contractor_id"] != current_user["id"] and current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Not your job")

    body = await request.json()
    origin = body.get("origin_url", str(request.base_url)).rstrip("/")
    success_url = f"{origin}/contractor/dashboard?boost_success=1&job_id={job_id}"
    cancel_url = f"{origin}/contractor/dashboard"

    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{origin}/api/payments/stripe/webhook")
    from emergentintegrations.payments.stripe.checkout import CheckoutSessionRequest
    req = CheckoutSessionRequest(
        amount=BOOST_PRICE,
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"user_id": current_user["id"], "job_id": job_id, "type": "boost", "payment_method": "stripe"}
    )
    session = await stripe.create_checkout_session(req)

    tx = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "session_id": session.session_id,
        "job_id": job_id,
        "amount": BOOST_PRICE,
        "currency": "usd",
        "plan": "boost",
        "payment_method": "stripe",
        "payment_status": "pending",
        "created_at": now_str()
    }
    await db.payment_transactions.insert_one(tx)
    return {"url": session.url, "session_id": session.session_id}


@router.get("/boost/stripe/status/{session_id}")
async def boost_stripe_status(session_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{str(request.base_url)}api/payments/stripe/webhook")
    tx = await get_owned_tx(session_id, current_user)
    if tx and tx.get("payment_status") == "paid":
        return {"status": "complete", "already_processed": True}

    status = await stripe.get_checkout_status(session_id)
    if status.metadata.get("user_id") not in (None, current_user["id"]) and current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=404, detail="Payment not found")
    if status.payment_status == "paid":
        job_id = status.metadata.get("job_id") or (tx.get("job_id") if tx else None)
        if job_id:
            boost_until = (datetime.now(timezone.utc) + timedelta(days=BOOST_DURATION_DAYS)).isoformat()
            await db.jobs.update_one({"id": job_id}, {"$set": {"is_featured": True, "boost_expires_at": boost_until}})
        await db.payment_transactions.update_one({"session_id": session_id}, {"$set": {"payment_status": "paid", "updated_at": now_str()}})
    return {"status": status.status, "payment_status": status.payment_status}


@router.post("/boost/paypal/{job_id}")
async def boost_job_paypal(job_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["contractor_id"] != current_user["id"] and current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Not your job")

    body = await request.json()
    origin = body.get("origin_url", str(request.base_url)).rstrip("/")

    access_token = await get_paypal_token()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{PAYPAL_BASE_URL}/v2/checkout/orders",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json={
                "intent": "CAPTURE",
                "purchase_units": [{
                    "reference_id": f"{current_user['id']}_boost_{job_id}",
                    "description": f"Boost Job: {job.get('title', job_id)[:50]}",
                    "amount": {"currency_code": "USD", "value": f"{BOOST_PRICE:.2f}"}
                }],
                "application_context": {
                    "return_url": f"{origin}/contractor/dashboard?boost_success=1&job_id={job_id}&method=paypal",
                    "cancel_url": f"{origin}/contractor/dashboard"
                }
            }
        )
        resp.raise_for_status()
        order = resp.json()

    order_id = order["id"]
    await db.payment_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "session_id": order_id,
        "job_id": job_id,
        "amount": BOOST_PRICE,
        "currency": "usd",
        "plan": "boost",
        "payment_method": "paypal",
        "payment_status": "pending",
        "created_at": now_str()
    })
    approve_url = next((l["href"] for l in order["links"] if l["rel"] == "approve"), None)
    return {"order_id": order_id, "approve_url": approve_url}


@router.post("/boost/paypal/capture/{order_id}")
async def boost_paypal_capture(order_id: str, job_id: str, current_user: dict = Depends(get_current_user)):
    tx = await get_owned_tx(order_id, current_user)
    if not tx or tx.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=404, detail="Payment not found")
    job_id = tx.get("job_id") or job_id
    if tx.get("payment_status") == "paid":
        return {"status": "COMPLETED", "already_processed": True}

    access_token = await get_paypal_token()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{PAYPAL_BASE_URL}/v2/checkout/orders/{order_id}/capture",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
        )
        resp.raise_for_status()
        result = resp.json()

    if result.get("status") == "COMPLETED":
        boost_until = (datetime.now(timezone.utc) + timedelta(days=BOOST_DURATION_DAYS)).isoformat()
        await db.jobs.update_one({"id": job_id}, {"$set": {"is_featured": True, "boost_expires_at": boost_until}})
        await db.payment_transactions.update_one(
            {"session_id": order_id},
            {"$set": {"payment_status": "paid", "updated_at": now_str()}}
        )
    return {"status": result.get("status"), "order_id": order_id}


# ─── Verified Contractor Fee (Stripe) ─────────────────────────────────────────

@router.post("/verified-contractor/create-session")
async def create_verified_contractor_session(request: Request, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "contractor":
        raise HTTPException(status_code=403, detail="Only contractors can purchase verification")
    if current_user.get("is_verified_contractor"):
        raise HTTPException(status_code=400, detail="You are already a verified contractor")

    # Check for existing pending transaction (prevent duplicate sessions)
    existing = await db.payment_transactions.find_one({
        "user_id": current_user["id"],
        "plan": "verified_contractor",
        "payment_status": "pending"
    })

    # Fetch admin-configured fee
    settings = await db.settings.find_one({}, {"_id": 0})
    fee = float((settings or {}).get("verified_contractor_fee", DEFAULT_VERIFIED_FEE))

    body = await request.json()
    origin = body.get("origin_url", str(request.base_url)).rstrip("/")
    success_url = f"{origin}/contractor/dashboard?verified_session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/contractor/dashboard"

    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{origin}/api/payments/stripe/webhook")
    req = CheckoutSessionRequest(
        amount=float(fee),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"user_id": current_user["id"], "type": "verified_contractor", "payment_method": "stripe"}
    )
    session = await stripe.create_checkout_session(req)

    tx = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "session_id": session.session_id,
        "amount": float(fee),
        "currency": "usd",
        "plan": "verified_contractor",
        "payment_method": "stripe",
        "payment_status": "pending",
        "created_at": now_str()
    }
    await db.payment_transactions.insert_one(tx)
    return {"url": session.url, "session_id": session.session_id, "fee": fee}


@router.get("/verified-contractor/status/{session_id}")
async def verified_contractor_status(session_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{str(request.base_url)}api/payments/stripe/webhook")

    # Idempotency check
    tx = await get_owned_tx(session_id, current_user)
    if tx and tx.get("payment_status") == "paid":
        return {"status": "complete", "payment_status": "paid", "already_processed": True}

    status = await stripe.get_checkout_status(session_id)
    if status.metadata.get("user_id") not in (None, current_user["id"]) and current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=404, detail="Payment not found")

    if status.payment_status == "paid":
        user_id = status.metadata.get("user_id", current_user["id"])
        # Grant verified status
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"is_verified_contractor": True, "verified_at": now_str()}}
        )
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "paid", "updated_at": now_str()}}
        )
        # Send confirmation email (fire & forget)
        try:
            from utils.email_utils import send_verified_contractor_email
            paid_user = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1, "name": 1, "company_name": 1})
            if paid_user:
                settings = await db.settings.find_one({}, {"_id": 0})
                fee = float((settings or {}).get("verified_contractor_fee", DEFAULT_VERIFIED_FEE))
                await send_verified_contractor_email(
                    email=paid_user["email"],
                    name=paid_user["name"],
                    company_name=paid_user.get("company_name", ""),
                    fee=fee
                )
        except Exception:
            pass

    return {"status": status.status, "payment_status": status.payment_status}


@router.get("/verified-contractor/fee")
async def get_verified_fee():
    """Public endpoint to get the current verification fee."""
    settings = await db.settings.find_one({}, {"_id": 0})
    return {"fee": float((settings or {}).get("verified_contractor_fee", DEFAULT_VERIFIED_FEE))}
