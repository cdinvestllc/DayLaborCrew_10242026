import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { X, AlertTriangle, FileText } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const JOB_CATEGORIES = [["completion","Completion / work quality"],["conduct","Conduct"],["safety","Safety concern"],["scope","Scope or expectations"],["other","Other"]];
const RATING_CATEGORIES = [["inaccurate","Inaccurate review"],["abusive","Abusive or inappropriate"],["retaliatory","Retaliatory rating"],["other","Other"]];

export default function DisputeModal({ job, initialType = "job", currentUser, onClose, onSubmitted }) {
  const type = job.status === "completed" ? "rating" : initialType;
  const [disputeType, setDisputeType] = useState(type);
  const [category, setCategory] = useState(type === "rating" ? "inaccurate" : "completion");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [ratingId, setRatingId] = useState("");
  const [ratings, setRatings] = useState([]);
  const [loadingRatings, setLoadingRatings] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const categories = disputeType === "rating" ? RATING_CATEGORIES : JOB_CATEGORIES;
  const allowedTypes = useMemo(() => job.status === "completed" ? ["rating"] : ["job"], [job.status]);

  useEffect(() => {
    if (disputeType !== "rating") { setRatings([]); setRatingId(""); return; }
    let active = true;
    setLoadingRatings(true);
    axios.get(`${API}/jobs/${job.id}/ratings`)
      .then(response => {
        const list = (response.data || []).filter(r => r.rater_id === currentUser?.id || r.rated_id === currentUser?.id);
        if (active) { setRatings(list); setRatingId(previous => list.some(r => r.id === previous) ? previous : (list[0]?.id || "")); }
      })
      .catch(error => { if (active) toast.error(error?.response?.data?.detail || "Could not load job ratings"); })
      .finally(() => { if (active) setLoadingRatings(false); });
    return () => { active = false; };
  }, [disputeType, job.id, currentUser?.id]);

  useEffect(() => { setCategory(disputeType === "rating" ? "inaccurate" : "completion"); }, [disputeType]);

  const submit = async event => {
    event.preventDefault();
    if (reason.trim().length < 10) return toast.error("Please describe what happened in at least 10 characters.");
    if (disputeType === "rating" && !ratingId) return toast.error("There is no visible rating to challenge for this job.");
    setSubmitting(true);
    try {
      await axios.post(`${API}/jobs/${job.id}/disputes`, {
        dispute_type: disputeType, category, reason: reason.trim(), evidence: evidence.trim(),
        ...(disputeType === "rating" ? { rating_id: ratingId } : {}),
      });
      toast.success("Dispute submitted for administrator review."); onSubmitted?.();
    } catch (error) { toast.error(error?.response?.data?.detail || "Could not submit dispute"); }
    finally { setSubmitting(false); }
  };

  return <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
    <form className="card w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto" onSubmit={submit} onClick={e => e.stopPropagation()} data-testid="dispute-modal">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2"><AlertTriangle className="w-5 h-5 text-amber-600 mt-1" /><div>
          <h2 className="text-lg font-extrabold text-[#050A30] dark:text-white">{job.status === "completed" ? "Challenge a rating" : "Report a job issue"}</h2><p className="text-sm text-slate-500">{job.title}</p>
        </div></div>
        <button type="button" onClick={onClose} aria-label="Close dispute form" className="text-slate-400"><X className="w-5 h-5" /></button>
      </div>
      {allowedTypes.length > 1 && <label className="block text-sm font-semibold mb-1">Dispute type
        <select value={disputeType} onChange={e => setDisputeType(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 dark:bg-slate-800"><option value="job">Job dispute</option><option value="rating">Rating dispute</option></select>
      </label>}
      <label className="block text-sm font-semibold mb-1 mt-3">Category
        <select value={category} onChange={e => setCategory(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 dark:bg-slate-800" data-testid="dispute-category">
          {categories.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      {disputeType === "rating" && <div className="mt-3"><label className="block text-sm font-semibold mb-1">Rating to challenge</label>
        {loadingRatings ? <p className="text-sm text-slate-500">Loading ratings…</p> : ratings.length === 0 ?
          <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-lg">No visible rating for this job involves your account yet.</p> :
          <select value={ratingId} onChange={e => setRatingId(e.target.value)} className="w-full border rounded-lg px-3 py-2 dark:bg-slate-800" data-testid="dispute-rating-select">
            {ratings.map(r => <option key={r.id} value={r.id}>{r.stars}/5 · {r.rater_id === currentUser?.id ? "your review" : "review about you"} · {r.review || "No text"}</option>)}
          </select>}
      </div>}
      <label className="block text-sm font-semibold mt-3 mb-1">What happened? (required)
        <textarea value={reason} onChange={e => setReason(e.target.value)} minLength={10} maxLength={2000} required rows={4}
          className="mt-1 w-full border rounded-lg px-3 py-2 dark:bg-slate-800" placeholder="Describe the issue clearly and factually." data-testid="dispute-reason" />
      </label>
      <label className="block text-sm font-semibold mt-3 mb-1"><span className="inline-flex items-center gap-1"><FileText className="w-4 h-4" /> Evidence or references (optional)</span>
        <textarea value={evidence} onChange={e => setEvidence(e.target.value)} maxLength={3000} rows={2}
          className="mt-1 w-full border rounded-lg px-3 py-2 dark:bg-slate-800" placeholder="Relevant dates, messages, links, or other context" data-testid="dispute-evidence" />
      </label>
      <p className="text-xs text-slate-500 mt-3">Administrators review the report and record a resolution. Only include information relevant to this job.</p>
      <div className="flex gap-3 mt-5"><button type="button" onClick={onClose} className="flex-1 border rounded-lg py-2.5 font-semibold">Cancel</button>
        <button type="submit" disabled={submitting || (disputeType === "rating" && (loadingRatings || !ratingId))} className="flex-1 bg-[#0000FF] text-white rounded-lg py-2.5 font-bold disabled:opacity-60" data-testid="submit-dispute">{submitting ? "Submitting…" : "Submit Dispute"}</button>
      </div>
    </form>
  </div>;
}
