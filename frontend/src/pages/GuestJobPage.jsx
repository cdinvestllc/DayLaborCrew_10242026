import React, { useEffect, useState } from "react";
import axios from "axios";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle, Loader2 } from "lucide-react";
import Navbar from "../components/Navbar";
import AddressAutocomplete from "../components/AddressAutocomplete";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const TRADES = ["General Labor", "Carpentry", "Electrical", "Plumbing", "Painting", "Landscaping", "Masonry", "HVAC", "Roofing", "Drywall", "Demolition", "Concrete", "Moving/Hauling", "Cleaning"];
const field = "w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm bg-white text-slate-900 placeholder:text-slate-400 dark:bg-slate-800 dark:text-white focus:outline-none focus:border-[#0000FF]";
const EMPTY = { title: "", description: "", trade: "", crew_needed: 1, start_time: "", end_time: "", pay_rate: "", address: "", lat: null, lng: null, city: "", state: "", poster_name: "", poster_email: "", poster_phone: "" };

function Field({ label, children }) {
  return <label className="block"><span className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1">{label}</span>{children}</label>;
}

// One-time $9.99 job post without an account; the job publishes only after Stripe confirms payment server-side.
export default function GuestJobPage() {
  const [params] = useSearchParams();
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(params.get("guest_session_id") ? "checking" : "form");
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    const sessionId = params.get("guest_session_id");
    if (!sessionId) return;
    let tries = 0;
    const poll = async () => {
      try {
        const res = await axios.get(`${API}/payments/guest-job/status/${sessionId}`);
        if (res.data.published) { setStatus("published"); return; }
      } catch { }
      if (++tries < 8) setTimeout(poll, 2500); else setStatus("pending");
    };
    poll();
  }, [params]);

  const submit = async (e) => {
    e.preventDefault();
    if (form.end_time && new Date(form.end_time) <= new Date(form.start_time)) return toast.error("End time must be after start time");
    if (!window.confirm("Continue to the $9.99 payment? Your job is published only after payment is confirmed.")) return;
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/payments/guest-job/checkout`, {
        ...form, crew_needed: Number(form.crew_needed), pay_rate: Number(form.pay_rate), end_time: form.end_time || null,
        origin_url: window.location.origin,
      });
      window.location.href = res.data.url;
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(Array.isArray(d) ? "Please complete every required field correctly" : d || "Couldn't start checkout");
      setSubmitting(false);
    }
  };

  if (status !== "form") {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#020617]"><Navbar />
        <div className="max-w-md mx-auto px-4 py-20 text-center" data-testid="guest-job-status">
          {status === "checking" && <><Loader2 className="w-10 h-10 animate-spin text-[#0000FF] mx-auto mb-3" /><p className="text-slate-700 dark:text-slate-200">Confirming your payment…</p></>}
          {status === "published" && <><CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h1 className="text-2xl font-extrabold text-[#050A30] dark:text-white mb-2">Your job is live</h1>
            <p className="text-slate-600 dark:text-slate-300">Crew nearby can now see it. Your contact details are shared only with crew who accept.</p></>}
          {status === "pending" && <p className="text-slate-700 dark:text-slate-200">We haven't received payment confirmation yet. If you completed checkout, refresh this page in a minute.</p>}
          <Link to="/" className="inline-block mt-6 text-[#0000FF] dark:text-[#7EC8E3] font-semibold">Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617]" style={{ fontFamily: "Inter, sans-serif" }}>
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-extrabold text-[#050A30] dark:text-white mb-1" style={{ fontFamily: "Manrope, sans-serif" }}>Post a Job – No Account Needed</h1>
        <p className="text-slate-600 dark:text-slate-300 mb-6">One-time $9.99. Fill in every detail; we publish after payment is confirmed.</p>
        <form onSubmit={submit} className="card p-6 space-y-4" data-testid="guest-job-form">
          <Field label="Job title *"><input required minLength={3} className={field} value={form.title} onChange={set("title")} data-testid="guest-title" /></Field>
          <Field label="Description *"><textarea required minLength={20} rows={4} className={field} value={form.description} onChange={set("description")} data-testid="guest-description" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Trade *"><select required className={field} value={form.trade} onChange={set("trade")} data-testid="guest-trade">
              <option value="">Select trade</option>{TRADES.map(t => <option key={t} value={t.toLowerCase()}>{t}</option>)}</select></Field>
            <Field label="Crew needed *"><input required type="number" min="1" max="20" className={field} value={form.crew_needed} onChange={set("crew_needed")} data-testid="guest-crew-needed" /></Field>
            <Field label="Start *"><input required type="datetime-local" className={field} value={form.start_time} onChange={set("start_time")} data-testid="guest-start" /></Field>
            <Field label="End"><input type="datetime-local" min={form.start_time} className={field} value={form.end_time} onChange={set("end_time")} data-testid="guest-end" /></Field>
            <Field label="Pay rate ($/hr) *"><input required type="number" min="1" step="0.5" className={field} value={form.pay_rate} onChange={set("pay_rate")} data-testid="guest-pay" /></Field>
          </div>
          <Field label="Job address *">
            <AddressAutocomplete required value={form.address} testId="guest-address"
              onChange={v => setForm(f => ({ ...f, address: v, lat: null, lng: null }))}
              onSelect={({ address, lat, lng, city, state }) => setForm(f => ({ ...f, address, lat, lng, city, state }))} />
          </Field>
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Your name *"><input required minLength={2} className={field} value={form.poster_name} onChange={set("poster_name")} data-testid="guest-name" /></Field>
            <Field label="Email *"><input required type="email" className={field} value={form.poster_email} onChange={set("poster_email")} data-testid="guest-email" /></Field>
            <Field label="Phone *"><input required type="tel" minLength={7} className={field} value={form.poster_phone} onChange={set("poster_phone")} data-testid="guest-phone" /></Field>
          </div>
          <div className="flex gap-3">
            <Link to="/" className="flex-1 text-center border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 py-3 rounded-xl font-bold" data-testid="guest-cancel">Cancel</Link>
            <button type="submit" disabled={submitting} className="flex-[2] bg-[#0000FF] text-white py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60" data-testid="guest-submit">
              {submitting ? "Opening checkout…" : "Pay $9.99 & Publish"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
