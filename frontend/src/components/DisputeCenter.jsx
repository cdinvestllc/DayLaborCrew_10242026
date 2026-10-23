import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { MessageCircle, Send, Scale, RefreshCw, X, Clock } from "lucide-react";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function DisputeCenter({ jobs = [] }) {
  const eligibleJobs = useMemo(() => (jobs || [])
    .filter(job => job?.id && ["in_progress", "completed_pending_review", "completed"].includes(job.status))
    .slice(0, 80), [jobs]);
  const jobsKey = eligibleJobs.map(job => job.id).sort().join("|");
  const jobsById = useMemo(() => Object.fromEntries(eligibleJobs.map(job => [job.id, job])), [eligibleJobs]);
  const [cases, setCases] = useState([]);
  const [loadingCases, setLoadingCases] = useState(false);
  const [activeId, setActiveId] = useState("");
  const [thread, setThread] = useState(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [showAppeal, setShowAppeal] = useState(false);
  const [appealReason, setAppealReason] = useState("");
  const [appealEvidence, setAppealEvidence] = useState("");
  const [submittingAppeal, setSubmittingAppeal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadCases = useCallback(async () => {
    const ids = jobsKey ? jobsKey.split("|") : [];
    if (!ids.length) { setCases([]); setLoadingCases(false); return; }
    setLoadingCases(true);
    try {
      const responses = await Promise.all(ids.map(async jobId => {
        try {
          const response = await axios.get(`${API}/jobs/${jobId}/disputes`);
          return (response.data || []).map(item => ({ ...item, job_title: item.job_title || jobsById[jobId]?.title || jobId }));
        } catch { return []; }
      }));
      const flattened = responses.flat().sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));
      setCases(flattened);
      setActiveId(currentId => currentId && !flattened.some(item => item.id === currentId) ? "" : currentId);
    } finally { setLoadingCases(false); }
  }, [jobsKey, jobsById]);

  useEffect(() => { loadCases(); }, [loadCases, refreshKey]);

  const loadThread = useCallback(async () => {
    const item = cases.find(entry => entry.id === activeId);
    if (!item) { setThread(null); return; }
    setLoadingThread(true);
    try {
      const response = await axios.get(`${API}/jobs/${item.job_id}/disputes/${item.id}/messages`);
      setThread(response.data);
    } catch (error) {
      setThread(null);
      toast.error(error?.response?.data?.detail || "Could not load this dispute conversation");
    } finally { setLoadingThread(false); }
  }, [cases, activeId]);

  useEffect(() => { loadThread(); }, [loadThread]);

  const sendReply = async () => {
    const item = cases.find(entry => entry.id === activeId);
    if (!item || !reply.trim()) return;
    setSending(true);
    try {
      await axios.post(`${API}/jobs/${item.job_id}/disputes/${item.id}/messages`, { body: reply.trim() });
      setReply("");
      await loadThread();
      setRefreshKey(value => value + 1);
    } catch (error) { toast.error(error?.response?.data?.detail || "Could not send reply"); }
    finally { setSending(false); }
  };

  const submitAppeal = async () => {
    const item = cases.find(entry => entry.id === activeId);
    if (!item || appealReason.trim().length < 10) return toast.error("Please explain the appeal in at least 10 characters.");
    setSubmittingAppeal(true);
    try {
      await axios.post(`${API}/jobs/${item.job_id}/disputes/${item.id}/appeal`, {
        reason: appealReason.trim(), evidence: appealEvidence.trim()
      });
      toast.success("Appeal submitted for administrator review");
      setShowAppeal(false); setAppealReason(""); setAppealEvidence("");
      setRefreshKey(value => value + 1);
      await loadThread();
    } catch (error) { toast.error(error?.response?.data?.detail || "Could not submit appeal"); }
    finally { setSubmittingAppeal(false); }
  };

  if (!loadingCases && cases.length === 0) return null;
  const activeCase = cases.find(item => item.id === activeId);
  return <section className="card p-4 mb-4 space-y-3" data-testid="participant-dispute-center">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2"><MessageCircle className="w-5 h-5 text-[#0000FF]" />
        <div><h2 className="font-bold text-[#050A30] dark:text-white">Dispute conversations</h2>
        <p className="text-xs text-slate-500">Message the other party and administrators, and appeal a decision within seven days.</p></div>
      </div>
      <button onClick={() => { setRefreshKey(value => value + 1); }} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700" aria-label="Refresh disputes" data-testid="refresh-dispute-center"><RefreshCw className="w-4 h-4" /></button>
    </div>
    {loadingCases ? <p className="text-sm text-slate-500">Loading disputes…</p> : <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.7fr)] gap-3">
      <div className="space-y-2 max-h-[32rem] overflow-y-auto">
        {cases.map(item => <button key={item.id} onClick={() => { setActiveId(item.id); setShowAppeal(false); }}
          className={`w-full text-left p-3 rounded-lg border transition-colors ${activeId === item.id ? "border-[#0000FF] bg-blue-50 dark:bg-blue-950/30" : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
          data-testid={`participant-dispute-${item.id}`}>
          <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold capitalize">{item.dispute_type} · {item.category}</span><span className="text-[10px] rounded-full px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700">{item.status?.replaceAll("_", " ")}</span></div>
          <p className="text-sm font-semibold mt-1 truncate">{item.job_title}</p>
          <p className="text-xs text-slate-500 line-clamp-2 mt-1">{item.reason}</p>
        </button>)}
      </div>
      {!activeId || !activeCase ? <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-6 flex flex-col items-center justify-center text-center text-slate-500"><MessageCircle className="w-7 h-7 mb-2" /><p className="text-sm">Select a case to view the conversation.</p></div> :
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-3" data-testid={`participant-thread-${activeId}`}>
          <div className="flex justify-between gap-2"><div><h3 className="font-bold text-sm text-[#050A30] dark:text-white">{activeCase.job_title}</h3><p className="text-xs text-slate-500 capitalize">{activeCase.dispute_type} · {activeCase.category} · {activeCase.status?.replaceAll("_", " ")}</p></div>
            <button onClick={() => { setActiveId(""); setThread(null); }} aria-label="Close thread" className="p-1 text-slate-400"><X className="w-4 h-4" /></button>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3"><p className="text-sm whitespace-pre-wrap">{activeCase.reason}</p>
            {activeCase.evidence && <p className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs whitespace-pre-wrap">Initial evidence: {activeCase.evidence}</p>}
          </div>
          {loadingThread ? <p className="text-sm text-slate-500">Loading conversation…</p> : <>
            <div className="space-y-2 max-h-80 overflow-y-auto" aria-label="Dispute message history">
              {(thread?.messages || []).map(message => <article key={message.id} className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
                <div className="flex flex-wrap justify-between gap-2"><strong className="text-xs">{message.sender_name} · {message.sender_role}</strong><span className="text-[10px] text-slate-400">{message.created_at ? new Date(message.created_at).toLocaleString() : ""}</span></div>
                <p className="text-sm whitespace-pre-wrap mt-1">{message.body}</p>
                {message.evidence && <p className="text-xs mt-2 whitespace-pre-wrap"><strong>Evidence:</strong> {message.evidence}</p>}
              </article>)}
              {!thread?.messages?.length && <p className="text-sm text-slate-500">No messages yet. Use the reply box to begin the discussion.</p>}
            </div>
            {thread?.dispute?.appeal && <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
              <p className="font-bold text-amber-800 dark:text-amber-200">Appeal submitted · {thread.dispute.appeal.created_at ? new Date(thread.dispute.appeal.created_at).toLocaleString() : ""}</p>
              <p className="whitespace-pre-wrap mt-1">{thread.dispute.appeal.reason}</p>
              {thread.dispute.appeal.evidence && <p className="whitespace-pre-wrap mt-1 text-xs">Evidence: {thread.dispute.appeal.evidence}</p>}
            </div>}
            {thread?.dispute?.resolution && <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 p-3 text-sm">
              <p className="font-semibold">Initial decision: {thread.dispute.resolution.replaceAll("_", " ")}</p>
              {thread.dispute.resolution_notes && <p className="mt-1 whitespace-pre-wrap">{thread.dispute.resolution_notes}</p>}
              {thread.dispute.appeal_deadline && thread.dispute.status === "resolved" && <p className="mt-2 text-xs text-slate-500"><Clock className="inline w-3 h-3 mr-1" />Appeal deadline: {new Date(thread.dispute.appeal_deadline).toLocaleString()}</p>}
              {thread.dispute.status === "appeal_resolved" && <p className="mt-1 font-semibold text-emerald-700">Final appeal decision: {thread.dispute.appeal_resolution?.replaceAll("_", " ")}</p>}
              {thread.dispute.appeal_resolution_notes && <p className="mt-1 whitespace-pre-wrap">{thread.dispute.appeal_resolution_notes}</p>}
            </div>}
            {thread?.can_message && <div className="space-y-2">
              <textarea value={reply} onChange={e => setReply(e.target.value)} rows={2} maxLength={3000} placeholder="Write a reply to the other party and support team…" className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm dark:bg-slate-900" data-testid="participant-dispute-reply" />
              <div className="flex justify-end"><button onClick={sendReply} disabled={sending || !reply.trim()} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0000FF] text-white text-sm font-bold disabled:opacity-60" data-testid="send-dispute-reply"><Send className="w-4 h-4" />{sending ? "Sending…" : "Send reply"}</button></div>
            </div>}
            {thread?.can_appeal && !showAppeal && <button onClick={() => setShowAppeal(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-300 text-amber-800 text-sm font-semibold" data-testid="start-dispute-appeal"><Scale className="w-4 h-4" /> Appeal this decision</button>}
            {showAppeal && thread?.can_appeal && <div className="rounded-lg border border-amber-200 p-3 space-y-2">
              <h4 className="font-bold text-sm">Formal appeal · 7-day window</h4>
              <textarea value={appealReason} onChange={e => setAppealReason(e.target.value)} rows={3} maxLength={2000} minLength={10} placeholder="Explain why you disagree with the resolution (at least 10 characters)." className="w-full border rounded-lg p-2 text-sm dark:bg-slate-900" data-testid="appeal-reason" />
              <textarea value={appealEvidence} onChange={e => setAppealEvidence(e.target.value)} rows={2} maxLength={3000} placeholder="Additional evidence or references (optional)" className="w-full border rounded-lg p-2 text-sm dark:bg-slate-900" data-testid="appeal-evidence" />
              <div className="flex gap-2 justify-end"><button onClick={() => setShowAppeal(false)} className="px-3 py-2 rounded-lg border text-sm">Cancel</button>
                <button onClick={submitAppeal} disabled={submittingAppeal || appealReason.trim().length < 10} className="px-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-bold disabled:opacity-60" data-testid="submit-appeal">{submittingAppeal ? "Submitting…" : "Submit appeal"}</button>
              </div>
            </div>}
            {!thread?.can_message && <p className="text-xs text-slate-500">The conversation is closed after the appeal window or final appeal decision.</p>}
          </>}
        </div>}
    </div>}
  </section>;
}
