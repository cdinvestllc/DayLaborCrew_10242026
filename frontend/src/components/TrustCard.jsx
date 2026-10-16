import React from "react";
import { ShieldCheck, Award, Repeat, Star, Clock } from "lucide-react";

const BADGES = {
  top_rated: { label: "Top Rated", icon: Star },
  reliable: { label: "Reliable", icon: ShieldCheck },
  repeat_hire: { label: "Repeat Hire", icon: Repeat },
  experienced: { label: "Experienced", icon: Award },
};

function Stat({ label, value, testId }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3" data-testid={testId}>
      <div className="text-lg font-extrabold text-[#050A30] dark:text-white">{value ?? "—"}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );
}

// Reputation from real job/rating history; "—" means not enough data yet.
export default function TrustCard({ reputation }) {
  if (!reputation) return null;
  const r = reputation;
  return (
    <div className="card p-5 mb-4" data-testid="trust-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Trust & Reputation</h3>
        <span className="text-sm font-extrabold text-[#0000FF] dark:text-[#7EC8E3]" data-testid="trust-score">
          {r.trust_score === null ? "New member" : `${r.trust_score}/100`}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Completed jobs" value={r.completed_jobs} testId="trust-completed" />
        <Stat label="Completion rate" value={r.completion_rate === null ? null : `${r.completion_rate}%`} testId="trust-completion" />
        {r.repeat_hires !== null && <Stat label="Repeat hires" value={r.repeat_hires} testId="trust-repeat" />}
        {r.cancellation_rate !== null && <Stat label="Cancellation rate" value={`${r.cancellation_rate}%`} testId="trust-cancel" />}
        <Stat label="Response time" value={r.response_time} testId="trust-response" />
      </div>
      {r.badges?.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {r.badges.map(b => {
            const B = BADGES[b];
            if (!B) return null;
            return (
              <span key={b} className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-950 text-[#0000FF] dark:text-[#7EC8E3] px-2.5 py-1 rounded-full text-xs font-bold" data-testid={`badge-${b}`}>
                <B.icon className="w-3.5 h-3.5" /> {B.label}
              </span>
            );
          })}
        </div>
      )}
      {r.response_time === null && <p className="text-xs text-slate-400 mt-2 flex items-center gap-1"><Clock className="w-3 h-3" /> Response time appears once there's enough message history.</p>}
    </div>
  );
}
