import React, { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Send, X } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Contractor sends one of their open jobs to a specific crew member.
export default function OfferCrewModal({ crew, jobs: providedJobs, onClose }) {
  const [jobs, setJobs] = useState(providedJobs || []);
  const [selectedJob, setSelectedJob] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (providedJobs) return;
    axios.get(`${API}/jobs/`).then(r => setJobs(r.data || [])).catch(() => setJobs([]));
  }, [providedJobs]);

  const openJobs = jobs.filter(j => j.status === "open");

  const sendOffer = async () => {
    if (!selectedJob) return toast.error("Select a job first");
    setSending(true);
    try {
      await axios.post(`${API}/jobs/${selectedJob}/invite`, { crew_ids: [crew.id] });
      toast.success(`Offer sent to ${crew.name}!`);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to send offer");
    }
    setSending(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="offer-crew-modal">
      <div className="card max-w-sm w-full p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400" data-testid="offer-modal-close"><X className="w-5 h-5" /></button>
        <h2 className="font-extrabold text-[#050A30] dark:text-white text-lg mb-1" style={{ fontFamily: "Manrope, sans-serif" }}>New Job Offer for {crew.name}</h2>
        <p className="text-slate-500 dark:text-slate-300 text-sm mb-4">Pick one of your open jobs. When {crew.name} accepts, a position is reserved for them.</p>
        <select value={selectedJob} onChange={e => setSelectedJob(e.target.value)}
          className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] bg-white text-slate-900 dark:bg-slate-800 dark:text-white mb-4"
          data-testid="offer-job-select">
          <option value="">Select a job...</option>
          {openJobs.map(j => <option key={j.id} value={j.id}>{j.title} — ${j.pay_rate}/hr ({j.crew_accepted?.length || 0}/{j.crew_needed})</option>)}
        </select>
        {openJobs.length === 0 && <p className="text-amber-600 dark:text-amber-400 text-sm mb-4">No open jobs with free positions. Post a job first.</p>}
        <div className="flex gap-2">
          <button onClick={onClose} type="button"
            className="flex-1 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 py-3 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
            data-testid="cancel-offer-btn">Cancel</button>
          <button onClick={sendOffer} disabled={sending || !selectedJob}
            className="flex-1 bg-[#0000FF] text-white py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
            data-testid="send-offer-btn">
            {sending ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Send className="w-4 h-4" />}
            {sending ? "Sending..." : "Send Offer"}
          </button>
        </div>
      </div>
    </div>
  );
}
