import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import Navbar from "../components/Navbar";
import axios from "axios";
import { Star, MapPin, Briefcase, Copy, Check, ArrowLeft, Send, Shield, Lock, Truck } from "lucide-react";
import OfferCrewModal from "../components/OfferCrewModal";
import { CertificationsList } from "../components/Certifications";
import TrustCard from "../components/TrustCard";
import { toast } from "sonner";
import SafeImage from "../components/SafeImage";
import { resolveImageUrl } from "../lib/media";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function PublicProfilePage() {
  const { userId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showOffer, setShowOffer] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const load = async () => {
    try {
      const res = await axios.get(`${API}/users/public/${userId}`);
      setProfile(res.data);
    } catch (e) {
      if (e?.response?.status === 404) toast.error("Profile not found");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [userId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Returning from the $2.99 contact-unlock checkout: confirm payment server-side, then reload
  useEffect(() => {
    const sessionId = searchParams.get("unlock_session_id");
    if (!sessionId || !user) return;
    let tries = 0;
    const poll = async () => {
      try {
        const res = await axios.get(`${API}/payments/contact-unlock/status/${sessionId}`);
        if (res.data.payment_status === "paid") {
          toast.success("Contact unlocked");
          setSearchParams({});
          load();
          return;
        }
      } catch { }
      if (++tries < 6) setTimeout(poll, 2000);
      else toast.error("Payment not confirmed yet. Refresh in a moment.");
    };
    poll();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const unlockContact = async () => {
    if (!user) { navigate("/auth?mode=login"); return; }
    setUnlocking(true);
    try {
      const res = await axios.post(`${API}/payments/contact-unlock/${userId}`, { origin_url: window.location.origin });
      window.location.href = res.data.url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't start checkout");
      setUnlocking(false);
    }
  };

  const copyProfileLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Profile link copied!");
  };

  const sendOffer = async () => {
    if (!user || user.role !== "contractor") {
      navigate("/auth?mode=login");
      return;
    }
    setShowOffer(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#020617]">
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 py-12 animate-pulse">
          <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded-2xl mb-4" />
          <div className="h-16 bg-slate-200 dark:bg-slate-800 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#020617]">
        <Navbar />
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <Shield className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-2xl font-extrabold text-slate-600 dark:text-slate-400">Profile not found</h2>
          <Link to="/" className="mt-4 inline-flex items-center gap-2 text-[#0000FF] font-semibold">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>
        </div>
      </div>
    );
  }

  const isOwn = user?.id === userId;
  const displayName = profile.company_name || profile.name;
  const initials = displayName?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const photoUrl = profile.profile_photo || profile.logo;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617]" style={{ fontFamily: "Inter, sans-serif" }}>
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Back */}
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-slate-500 hover:text-[#0000FF] text-sm font-semibold mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Header Card */}
        <div className="card p-6 mb-4">
          <div className="flex items-start gap-5">
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-[#050A30] flex items-center justify-center text-white text-2xl font-extrabold flex-shrink-0">
              {photoUrl
                ? <SafeImage src={resolveImageUrl(photoUrl)} alt={displayName} className="w-full h-full object-cover" />
                : initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="text-2xl font-extrabold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
                    {displayName}
                  </h1>
                  <p className="text-[#0000FF] font-semibold capitalize text-sm">{profile.trade || profile.role}</p>
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 capitalize">{profile.role}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={copyProfileLink}
                    className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    data-testid="copy-profile-link">
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Copied!" : "Share"}
                  </button>
                  {!isOwn && user?.role === "contractor" && profile.role === "crew" && (
                    <button onClick={sendOffer}
                      className="flex items-center gap-1.5 px-3 py-2 bg-[#0000FF] text-white rounded-lg text-sm font-bold hover:bg-blue-700"
                      data-testid="send-offer-profile-btn">
                      <Send className="w-4 h-4" /> Offer Job
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-4 mt-3 text-sm">
                {profile.transportation && user?.role === "contractor" && (
                  <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300 capitalize" data-testid="profile-transportation">
                    <Truck className="w-4 h-4" /> {profile.transportation}
                  </span>
                )}
                {profile.rating > 0 && (
                  <span className="flex items-center gap-1 text-amber-500 font-semibold">
                    <Star className="w-4 h-4 fill-current" /> {profile.rating.toFixed(1)}
                    <span className="text-slate-400 font-normal">({profile.rating_count || 0})</span>
                  </span>
                )}
                <span className="flex items-center gap-1 text-slate-500">
                  <Briefcase className="w-4 h-4" /> {profile.jobs_completed || 0} jobs done
                </span>
                {profile.location?.city && (
                  <span className="flex items-center gap-1 text-slate-500">
                    <MapPin className="w-4 h-4" /> {profile.location.city}, {profile.location.state}
                  </span>
                )}
                <span className={`font-semibold ${profile.availability ? "text-emerald-500" : "text-red-400"}`}>
                  {profile.availability ? "Available" : "Not Available"}
                </span>
              </div>
            </div>
          </div>

          {profile.bio && (
            <p className="mt-4 text-slate-600 dark:text-slate-300 text-sm border-t border-slate-100 dark:border-slate-700 pt-4">
              {profile.bio}
            </p>
          )}
        </div>

        <TrustCard reputation={profile.reputation} />

        {profile.certifications?.length > 0 && (
          <div className="card p-5 mb-4"><CertificationsList items={profile.certifications} /></div>
        )}

        {/* Skills */}
        {profile.skills?.length > 0 && (
          <div className="card p-5 mb-4">
            <h3 className="font-bold text-[#050A30] dark:text-white mb-3" style={{ fontFamily: "Manrope, sans-serif" }}>Skills</h3>
            <div className="flex flex-wrap gap-2">
              {profile.skills.map(s => (
                <span key={s} className="bg-blue-50 dark:bg-blue-950 text-[#0000FF] dark:text-[#7EC8E3] px-3 py-1 rounded-full text-xs font-semibold">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Portfolio */}
        {profile.portfolio?.length > 0 && (
          <div className="card p-5 mb-4">
            <h3 className="font-bold text-[#050A30] dark:text-white mb-3" style={{ fontFamily: "Manrope, sans-serif" }}>
              Portfolio ({profile.portfolio.length} photos)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {profile.portfolio.map((url, i) => (
                <a key={i} href={resolveImageUrl(url)} target="_blank" rel="noreferrer"
                  className="aspect-square rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 hover:opacity-90 transition-opacity">
                  <SafeImage src={resolveImageUrl(url)} alt={`Work ${i + 1}`}
                    className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Contact: released only after hiring or a paid unlock (enforced by the API) */}
        {!isOwn && (
          <div className="card p-5" data-testid="profile-contact-card">
            <h3 className="font-bold text-[#050A30] dark:text-white mb-3" style={{ fontFamily: "Manrope, sans-serif" }}>Contact</h3>
            {profile.contact_access ? (
              <div className="space-y-2">
                {profile.phone && <p className="text-sm text-slate-600 dark:text-slate-300">Phone: <strong data-testid="profile-phone">{profile.phone}</strong></p>}
                {profile.email && <p className="text-sm text-slate-600 dark:text-slate-300">Email: <strong data-testid="profile-email">{profile.email}</strong></p>}
                {!profile.phone && !profile.email && <p className="text-sm text-slate-500 dark:text-slate-400">This member keeps their contact details private. Use in-app messages.</p>}
              </div>
            ) : (
              <div className="space-y-2">
                {profile.phone_masked && <p className="text-sm text-slate-600 dark:text-slate-300">Phone: <strong>{profile.phone_masked}</strong></p>}
                {profile.email_masked && <p className="text-sm text-slate-600 dark:text-slate-300">Email: <strong>{profile.email_masked}</strong></p>}
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> Shared automatically once you work a job together.</p>
                {(profile.phone_masked || profile.email_masked) && (
                  <button onClick={unlockContact} disabled={unlocking}
                    className="mt-1 inline-flex items-center gap-2 bg-[#0000FF] text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-60"
                    data-testid="unlock-contact-btn">
                    <Lock className="w-4 h-4" /> {unlocking ? "Opening checkout..." : "Unlock contact – $2.99"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {showOffer && <OfferCrewModal crew={profile} onClose={() => setShowOffer(false)} />}
      </div>
    </div>
  );
}
