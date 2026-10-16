import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, EmailStr


def utc_now_str() -> str:
    return datetime.now(timezone.utc).isoformat()


def trial_end_str(days: int = 30) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


# ─── Auth Models ─────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: str  # crew, contractor
    name: str
    phone: Optional[str] = None
    referral_code_used: Optional[str] = None
    company_name: Optional[str] = None
    agreed_to_terms: bool = False


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict


# ─── User Models ─────────────────────────────────────────────────────────────

class Certification(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    issuer: Optional[str] = Field(None, max_length=120)
    number: Optional[str] = Field(None, max_length=60)
    expires: Optional[str] = Field(None, max_length=20)


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    bio: Optional[str] = None
    trade: Optional[str] = None
    skills: Optional[List[str]] = None
    availability: Optional[bool] = None
    location: Optional[Dict] = None
    company_name: Optional[str] = None
    hide_location: Optional[bool] = None
    transportation: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    city: Optional[str] = None
    state: Optional[str] = None
    portfolio: Optional[List[str]] = None
    certifications: Optional[List[Certification]] = Field(None, max_length=20)


class LocationUpdate(BaseModel):
    lat: float
    lng: float
    city: Optional[str] = None


# ─── Job Models ──────────────────────────────────────────────────────────────

class JobCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=120)
    description: str = Field(..., min_length=10, max_length=4000)
    trade: str = Field(..., min_length=1, max_length=60)
    crew_needed: int = Field(..., ge=1, le=50)
    start_time: str
    end_time: Optional[str] = None
    pay_rate: float = Field(..., gt=0, le=1000)
    address: str = Field(..., min_length=3, max_length=300)
    is_emergency: bool = False
    lat: Optional[float] = None
    lng: Optional[float] = None
    city: Optional[str] = None
    state: Optional[str] = None
    images: Optional[List[str]] = None


class JobUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    trade: Optional[str] = None
    crew_needed: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    pay_rate: Optional[float] = None
    is_emergency: Optional[bool] = None
    status: Optional[str] = None


# ─── Rating Models ───────────────────────────────────────────────────────────

class RatingCreate(BaseModel):
    rated_id: str
    job_id: str
    stars: int = Field(..., ge=1, le=5)
    review: Optional[str] = None


# ─── Payment Models ──────────────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    plan: str  # daily, weekly, monthly
    payment_method: str  # stripe, paypal
    origin_url: str
    coupon_code: Optional[str] = None


class CouponCreate(BaseModel):
    code: str
    discount_percent: float  # 0-100
    usage_limit: int = 100
    expires_at: Optional[str] = None
    plan_restriction: Optional[str] = None  # None = all plans


class PayPalCaptureRequest(BaseModel):
    order_id: str
    plan: str
    user_id: str


# ─── Admin Models ────────────────────────────────────────────────────────────

class AdminUserUpdate(BaseModel):
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None
    role: Optional[str] = None
    points: Optional[int] = None
    subscription_status: Optional[str] = None
    name: Optional[str] = None
    phone: Optional[str] = None
    trade: Optional[str] = None


class TermsUpdate(BaseModel):
    content: str


class CMSUpdate(BaseModel):
    content: str
    title: Optional[str] = None
    published: Optional[bool] = True


class SettingsUpdate(BaseModel):
    daily_price: Optional[float] = None
    weekly_price: Optional[float] = None
    monthly_price: Optional[float] = None
    trial_days: Optional[int] = None
    job_visibility_hours: Optional[int] = None
    site_name: Optional[str] = None
    site_tagline: Optional[str] = None
    emergency_job_price: Optional[float] = None
    login_message: Optional[str] = None
    footer_text: Optional[str] = None


# ─── Messaging Models ─────────────────────────────────────────────────────────

class MessageCreate(BaseModel):
    recipient_id: str
    subject: str
    body: str


class MessageReply(BaseModel):
    body: str


# ─── Trades Models ───────────────────────────────────────────────────────────

class TradeCreate(BaseModel):
    name: str
    is_active: bool = True


class TradeUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None


# ─── Bulk Email ──────────────────────────────────────────────────────────────

class BulkEmailRequest(BaseModel):
    subject: str
    body: str
    target: str  # "all", "crew", "contractor"


# ─── Referral / Points ───────────────────────────────────────────────────────

class RedeemPoints(BaseModel):
    points: int


# ─── Forgot Password ─────────────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


# ─── Activity Log ─────────────────────────────────────────────────────────────

class ActivityLogEntry(BaseModel):
    admin_id: str
    admin_name: str
    action: str
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    details: Optional[str] = None
    ip_address: Optional[str] = None
    timestamp: str = Field(default_factory=utc_now_str)
