"""
SaaS Billing — per-user (per-seat) plan via Stripe (emergentintegrations).

Pricing is defined SERVER-SIDE: PRICE_PER_SEAT_USD × active users, billed as a
30-day cycle. Payment activates/extends `subscription_valid_until` on the tenant.

Routes (mounted under /api):
  GET  /billing/info                → plan, trial, seats, pricing (auth)
  POST /billing/checkout            → Stripe checkout session (tenant admin)
  GET  /billing/status/{session_id} → poll payment status; activates on paid
  POST /webhook/stripe              → Stripe webhook (library-required exact path)
"""
import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest,
)

router = APIRouter(tags=["Billing"])
logger = logging.getLogger(__name__)

PRICE_PER_SEAT_USD = 10.0
CYCLE_DAYS = 31
_ADMIN_ROLES = {"admin", "ceo", "system admin", "director", "owner"}


def _now():
    return datetime.now(timezone.utc)


def _get_stripe(request: Request) -> StripeCheckout:
    host_url = str(request.base_url)
    return StripeCheckout(
        api_key=os.environ["STRIPE_API_KEY"],
        webhook_url=f"{host_url}api/webhook/stripe",
    )


async def _seats(tenant_id: str) -> int:
    n = await db.users.count_documents({
        "tenant_id": tenant_id, "is_active": {"$ne": False},
        "role": {"$nin": ["Driver", "Distributor"]},
    })
    return max(1, n)


def _sub_state(tenant: dict) -> dict:
    now = _now()
    valid_until = tenant.get("subscription_valid_until")
    sub_active = False
    if valid_until:
        try:
            sub_active = datetime.fromisoformat(valid_until.replace("Z", "+00:00")) > now
        except ValueError:
            pass
    trial_ends = tenant.get("trial_ends_at")
    trial_days_left = None
    trial_expired = False
    # Legacy tenants (created before self-serve signup) are exempt from trial enforcement.
    legacy = "onboarding_completed" not in tenant
    if tenant.get("is_trial") and trial_ends and not legacy:
        try:
            delta = datetime.fromisoformat(trial_ends.replace("Z", "+00:00")) - now
            trial_days_left = max(0, delta.days)
            trial_expired = delta.total_seconds() <= 0
        except ValueError:
            pass
    return {
        "subscription_active": sub_active,
        "subscription_valid_until": valid_until,
        "trial_days_left": trial_days_left,
        "trial_expired": trial_expired and not sub_active,
    }


@router.get("/billing/info")
async def billing_info(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tenant = await db.tenants.find_one({"tenant_id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    seats = await _seats(tenant_id)
    state = _sub_state(tenant)
    return {
        "plan": tenant.get("subscription_plan", "trial"),
        "is_trial": tenant.get("is_trial", False),
        "trial_ends_at": tenant.get("trial_ends_at"),
        **state,
        "seats": seats,
        "price_per_seat": PRICE_PER_SEAT_USD,
        "currency": "usd",
        "total_per_cycle": round(seats * PRICE_PER_SEAT_USD, 2),
        "cycle_days": CYCLE_DAYS,
    }


class CheckoutBody(BaseModel):
    origin_url: str


@router.post("/billing/checkout")
async def billing_checkout(body: CheckoutBody, request: Request, current_user: dict = Depends(get_current_user)):
    if (current_user.get("role") or "").strip().lower() not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Only workspace admins can manage billing")
    tenant_id = get_current_tenant_id()
    tenant = await db.tenants.find_one({"tenant_id": tenant_id}, {"_id": 0, "tenant_id": 1})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    seats = await _seats(tenant_id)
    amount = round(seats * PRICE_PER_SEAT_USD, 2)
    stripe_checkout = _get_stripe(request)
    session = await stripe_checkout.create_checkout_session(CheckoutSessionRequest(
        amount=amount,
        currency="usd",
        success_url=f"{body.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{body.origin_url}/payment/cancel",
        metadata={"tenant_id": tenant_id, "seats": str(seats), "kind": "saas_seat_cycle"},
    ))
    await db.payment_transactions.insert_one({
        "session_id": session.session_id,
        "tenant_id": tenant_id,
        "seats": seats,
        "amount": amount,
        "currency": "usd",
        "status": "initiated",
        "payment_status": "pending",
        "created_by": current_user.get("id"),
        "created_at": _now().isoformat(),
        "updated_at": _now().isoformat(),
    })
    return {"checkout_url": session.url, "session_id": session.session_id}


def _extend_until(tenant: dict) -> str:
    base = _now()
    current = tenant.get("subscription_valid_until")
    if current:
        try:
            cur_dt = datetime.fromisoformat(current.replace("Z", "+00:00"))
            if cur_dt > base:
                base = cur_dt
        except ValueError:
            pass
    return (base + timedelta(days=CYCLE_DAYS)).isoformat()


async def _mark_paid_and_extend(session_id: str):
    """Idempotent: flips txn to paid and extends tenant subscription once."""
    res = await db.payment_transactions.update_one(
        {"session_id": session_id, "payment_status": {"$ne": "paid"}},
        {"$set": {"status": "completed", "payment_status": "paid", "updated_at": _now().isoformat()}},
    )
    if res.modified_count == 0:
        return  # already processed
    txn = await db.payment_transactions.find_one({"session_id": session_id})
    tenant = await db.tenants.find_one({"tenant_id": txn["tenant_id"]}, {"_id": 0})
    if not tenant:
        return
    await db.tenants.update_one(
        {"tenant_id": txn["tenant_id"]},
        {"$set": {
            "subscription_plan": "pro",
            "subscription_status": "active",
            "is_trial": False,
            "subscription_seats": txn.get("seats"),
            "subscription_valid_until": _extend_until(tenant),
            "updated_at": _now().isoformat(),
        }},
    )
    logger.info(f"Billing: tenant {txn['tenant_id']} activated/extended ({txn.get('seats')} seats)")


@router.get("/billing/status/{session_id}")
async def billing_status(session_id: str, request: Request):
    txn = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if txn.get("payment_status") != "paid":
        try:
            status = await _get_stripe(request).get_checkout_status(session_id)
            if status.payment_status == "paid":
                await _mark_paid_and_extend(session_id)
                txn = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        except Exception as e:
            logger.warning(f"Billing status check failed for {session_id}: {e}")
    return {
        "session_id": txn["session_id"],
        "status": txn.get("status"),
        "payment_status": txn.get("payment_status"),
    }


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    try:
        wh = await _get_stripe(request).handle_webhook(body, request.headers.get("Stripe-Signature"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Webhook error: {e}")
    if wh.payment_status == "paid" and wh.session_id:
        await _mark_paid_and_extend(wh.session_id)
    return {"status": "ok"}
