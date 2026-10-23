import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import Navbar from "../components/Navbar";
import axios from "axios";
import { toast } from "sonner";
import { Check, Clock, Zap, Shield, Tag, X } from "lucide-react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PAYPAL_CLIENT_ID = process.env.REACT_APP_PAYPAL_CLIENT_ID || "";
// Validate: PayPal client IDs start with "A", not "re_" (Stripe key) or similar
const PAYPAL_VALID = PAYPAL_CLIENT_ID && !PAYPAL_CLIENT_ID.startsWith("re_") && !PAYPAL_CLIENT_ID.startsWith("sk_");

const FEATURES = {
  crew: ["View and accept local jobs", "Real-time job alerts", "AI-powered job matching", "Portfolio showcase", "Referral rewards program"],
  contractor: ["Post unlimited jobs", "Access to all available crew", "Real-time crew tracking on map", "Job management dashboard", "Priority support"],
};

export default function SubscriptionPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [plans, setPlans] = useState({});
  const [selectedPlan, setSelectedPlan] = useState("");
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("paypal");
  const [couponCode, setCouponCode] = useState("");
  const [couponResult, setCouponResult] = useState(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [paypalOrderId, setPaypalOrderId] = useState(null);

  const fetchPlans = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/payments/plans`, { params: { role: user?.role } });
      setPlans(res.data);
      const keys = Object.keys(res.data);
      setSelectedPlan(p => (p && res.data[p]) ? p : keys[0] || "");
    } catch { }
  }, [user?.role]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const capturePayPal = useCallback(async (orderId, plan) => {
    setLoading(true);
    try {
      const res = await axios.post(`${API}/payments/paypal/capture/${orderId}?plan=${plan}`);
      if (res.data.status === "COMPLETED") {
        toast.success("Payment successful! Subscription activated.");
        await refreshUser();
        setTimeout(() => navigate(user?.role === "contractor" ? "/contractor/dashboard" : "/crew/dashboard"), 1500);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Payment capture failed");
    } finally {
      setLoading(false);
    }
  }, [refreshUser, navigate, user?.role]);

  const verifyStripe = useCallback(async (sessionId) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/payments/stripe/status/${sessionId}`);
      if (res.data.payment_status === "paid") {
        toast.success("Payment confirmed! Subscription active.");
        await refreshUser();
        setTimeout(() => navigate(user?.role === "contractor" ? "/contractor/dashboard" : "/crew/dashboard"), 1500);
      }
    } catch { }
    finally {
      setLoading(false);
    }
  }, [refreshUser, navigate, user?.role]);

  useEffect(() => {
    const method = params.get("method");
    const plan = params.get("plan");
    const orderId = params.get("order_id") || params.get("token");
    if (method === "paypal" && plan && orderId) {
      capturePayPal(orderId, plan);
    }
    const sessionId = params.get("session_id");
    if (sessionId && method === "stripe") {
      verifyStripe(sessionId);
    }
  }, [params, capturePayPal, verifyStripe]);

  const validateCoupon = async () => {
    if (!couponCode.trim()) return;
    setValidatingCoupon(true);
    try {
      const res = await axios.get(`${API}/payments/coupon/${couponCode.trim()}?plan=${selectedPlan}`);
      setCouponResult(res.data);
      toast.success(`Coupon applied! ${res.data.discount_percent}% off`);
    } catch (e) {
      setCouponResult(null);
      toast.error(e?.response?.data?.detail || "Invalid coupon");
    }
    setValidatingCoupon(false);
  };

  const clearCoupon = () => {
    setCouponCode("");
    setCouponResult(null);
  };

  const getDisplayPrice = () => {
    if (!plans[selectedPlan]) return "—";
    if (couponResult) return `$${couponResult.final_price.toFixed(2)}`;
    return `$${plans[selectedPlan]?.amount?.toFixed(2)}`;
  };

  const getOriginalPrice = () => plans[selectedPlan]?.amount?.toFixed(2);

  const handleStripeCheckout = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API}/payments/stripe/create-session`, {
        plan: selectedPlan,
        payment_method: "stripe",
        origin_url: window.location.origin,
        coupon_code: couponResult ? couponCode : null
      });
      window.location.href = res.data.url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Checkout failed");
      setLoading(false);
    }
  };

  const createPayPalOrder = async () => {
    const res = await axios.post(`${API}/payments/paypal/create-order`, {
      plan: selectedPlan,
      payment_method: "paypal",
      origin_url: window.location.origin,
      coupon_code: couponResult ? couponCode : null
    });
    setPaypalOrderId(res.data.order_id);
    return res.data.order_id;
  };

  const onPayPalApprove = async (data) => {
    await capturePayPal(data.orderID, selectedPlan);
  };

  const features = FEATURES[user?.role] || FEATURES.crew;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617]" style={{ fontFamily: "Inter, sans-serif" }}>
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Trial Expiry Banner */}
        {user?.subscription_status === "trial" && (
          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-xl p-4 mb-6 flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <div>
              <p className="font-semibold text-amber-700 dark:text-amber-300">Your trial is active</p>
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Expires: {user?.trial_end_date ? new Date(user.trial_end_date).toLocaleDateString() : "Soon"}. Subscribe to keep access.
              </p>
            </div>
          </div>
        )}

        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold text-[#050A30] dark:text-white mb-2" style={{ fontFamily: "Manrope, sans-serif" }}>
            Choose Your Plan
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            {user?.role === "contractor" ? "Post jobs and hire qualified crew" : "Find jobs and grow your career"}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {Object.keys(plans).map(plan => (
            <button key={plan} onClick={() => { setSelectedPlan(plan); clearCoupon(); }}
              className={`card p-6 text-left transition-all border-2 ${selectedPlan === plan ? "border-[#0000FF] shadow-lg shadow-blue-100" : "border-transparent hover:border-slate-200"}`}
              data-testid={`plan-${plan}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-extrabold text-[#050A30] dark:text-white capitalize" style={{ fontFamily: "Manrope, sans-serif" }}>
                  {plans[plan].label}
                </span>
                {(plan === "crew_annual" || plan === "contractor_pro") && <span className="bg-[#0000FF] text-white text-xs px-2 py-0.5 rounded-full font-bold">BEST VALUE</span>}
              </div>
              <div className="text-3xl font-extrabold text-[#0000FF] mb-1">
                ${plans[plan]?.amount?.toFixed(2) || "—"}
              </div>
              <div className="text-sm text-slate-500">
                {plans[plan].days === 365 ? "per year" : plans[plan].days === 90 ? "every 3 months" : "per month"}
                {plans[plan].job_posts ? ` · ${plans[plan].job_posts} job posts` : ""}
              </div>
              {selectedPlan === plan && (
                <div className="mt-3 w-5 h-5 bg-[#0000FF] rounded-full flex items-center justify-center ml-auto">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Features */}
          <div className="card p-6">
            <h3 className="font-bold text-[#050A30] dark:text-white mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#0000FF]" /> What's Included
            </h3>
            <ul className="space-y-2">
              {features.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" /> {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Payment */}
          <div className="card p-6">
            <h3 className="font-bold text-[#050A30] dark:text-white mb-4">Complete Payment</h3>

            {/* Coupon */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5 flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-[#0000FF]" /> Coupon Code
              </label>
              {couponResult ? (
                <div className="flex items-center justify-between bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-700 rounded-lg px-3 py-2">
                  <div>
                    <p className="font-bold text-green-700 dark:text-green-400 text-sm">{couponCode.toUpperCase()} — {couponResult.discount_percent}% OFF</p>
                    <p className="text-xs text-green-600 dark:text-green-500">{couponResult.uses_remaining} uses remaining</p>
                  </div>
                  <button onClick={clearCoupon} className="text-slate-400 hover:text-red-500" data-testid="remove-coupon-btn">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input type="text" value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())}
                    placeholder="Enter coupon code"
                    onKeyDown={e => e.key === "Enter" && validateCoupon()}
                    className="flex-1 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white uppercase"
                    data-testid="coupon-input" />
                  <button onClick={validateCoupon} disabled={!couponCode || validatingCoupon}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-semibold hover:bg-slate-200 disabled:opacity-60"
                    data-testid="apply-coupon-btn">
                    {validatingCoupon ? "..." : "Apply"}
                  </button>
                </div>
              )}
            </div>

            {/* Price Summary */}
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-500 capitalize">{selectedPlan} plan</span>
                <span className={couponResult ? "line-through text-slate-400" : "font-bold text-[#050A30] dark:text-white"}>
                  ${getOriginalPrice()}
                </span>
              </div>
              {couponResult && (
                <>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-green-600">Coupon ({couponResult.discount_percent}% off)</span>
                    <span className="text-green-600 font-semibold">-${(couponResult.original_price - couponResult.final_price).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-base font-extrabold text-[#050A30] dark:text-white border-t border-slate-200 dark:border-slate-700 pt-2 mt-1">
                    <span>Total</span>
                    <span className="text-[#0000FF]">{getDisplayPrice()}</span>
                  </div>
                </>
              )}
            </div>

            {/* Payment method selector */}
            <div className="flex gap-2 mb-4">
              <button onClick={() => setPaymentMethod("paypal")}
                className={`flex-1 py-2 rounded-lg font-semibold text-sm border-2 transition-colors ${paymentMethod === "paypal" ? "border-[#0000FF] bg-blue-50 dark:bg-blue-950 text-[#0000FF]" : "border-slate-200 dark:border-slate-600 text-slate-500"}`}
                data-testid="paypal-method-btn">
                PayPal
              </button>
              <button onClick={() => setPaymentMethod("stripe")}
                className={`flex-1 py-2 rounded-lg font-semibold text-sm border-2 transition-colors ${paymentMethod === "stripe" ? "border-[#0000FF] bg-blue-50 dark:bg-blue-950 text-[#0000FF]" : "border-slate-200 dark:border-slate-600 text-slate-500"}`}
                data-testid="stripe-method-btn">
                Card (Stripe)
              </button>
            </div>

            {paymentMethod === "stripe" ? (
              <button onClick={handleStripeCheckout} disabled={loading}
                className="w-full bg-[#0000FF] text-white py-3.5 rounded-xl font-extrabold text-base hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                data-testid="stripe-checkout-btn">
                {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Zap className="w-5 h-5" />}
                {loading ? "Processing..." : `Pay ${getDisplayPrice()} with Card`}
              </button>
            ) : PAYPAL_VALID ? (
              <PayPalScriptProvider options={{ clientId: PAYPAL_CLIENT_ID, currency: "USD" }}>
                <PayPalButtons
                  style={{ layout: "vertical", shape: "rect", label: "pay" }}
                  createOrder={createPayPalOrder}
                  onApprove={onPayPalApprove}
                  onError={(err) => toast.error("PayPal error: " + (err?.message || String(err)))}
                  disabled={loading}
                />
              </PayPalScriptProvider>
            ) : (
              <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-700 rounded-xl p-4 text-center" data-testid="paypal-unavailable">
                <p className="text-amber-700 dark:text-amber-300 font-semibold text-sm mb-1">PayPal Unavailable</p>
                <p className="text-amber-600 dark:text-amber-400 text-xs">PayPal is not configured. Please use Card (Stripe) to complete payment.</p>
                <button onClick={() => setPaymentMethod("stripe")}
                  className="mt-3 text-sm font-bold text-[#0000FF] hover:underline"
                  data-testid="switch-to-stripe-btn">
                  Switch to Card Payment
                </button>
              </div>
            )}

            <p className="text-xs text-center text-slate-400 mt-3">
              Secure payment. Cancel anytime. No hidden fees.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
