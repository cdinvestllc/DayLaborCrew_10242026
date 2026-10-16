import React from "react";
import { MapPin, Clock, DollarSign, Users, AlertTriangle, Bookmark, CheckCircle } from "lucide-react";

const STATUS_COLORS = {
  open: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  fulfilled: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  completed_pending_review: "bg-orange-100 text-orange-700",
  completed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  pending_payment: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
};

const STATUS_LABELS = { pending_payment: "awaiting payment" };

const TRADE_COLORS = {
  carpentry: "bg-amber-100 text-amber-800",
  electrical: "bg-yellow-100 text-yellow-800",
  plumbing: "bg-blue-100 text-blue-800",
  painting: "bg-purple-100 text-purple-800",
  landscaping: "bg-green-100 text-green-800",
  general: "bg-gray-100 text-gray-800",
};

function formatTime(timeStr) {
  if (!timeStr) return "TBD";
  try {
    return new Date(timeStr).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
    });
  } catch { return timeStr; }
}

export default function JobCard({ job, onAccept, onStart, onComplete, onVerify, onRate, currentUser, isAccepted }) {
  const isCrew = currentUser?.role === "crew";
  const isContractor = currentUser?.role === "contractor";
  const crewCount = job.crew_accepted?.length || 0;
  const isFull = crewCount >= job.crew_needed;

  return (
    <div
      className={`card p-4 transition-all duration-200 hover:shadow-md cursor-pointer ${
        job.is_emergency ? "border-l-4 border-red-500" : ""
      }`}
      data-testid={`job-card-${job.id}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {job.is_emergency && (
              <span className="flex items-center gap-1 bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
                <AlertTriangle className="w-3 h-3" /> EMERGENCY
              </span>
            )}
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[job.status] || "bg-gray-100 text-gray-600"}`}>
              {STATUS_LABELS[job.status] || job.status?.replaceAll("_", " ")}
            </span>
          </div>
          <h3 className="font-bold text-[#050A30] dark:text-white text-base leading-tight truncate" style={{ fontFamily: "Manrope, sans-serif" }}>
            {job.title}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{job.contractor_name}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xl font-extrabold text-[#0000FF]">${job.pay_rate}</div>
          <div className="text-xs text-slate-500">/hr</div>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
          <MapPin className="w-3.5 h-3.5 text-[#0000FF] flex-shrink-0" />
          <span className="truncate">{job.location?.city || job.location?.address?.split(",")[0] || "N/A"}</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
          <Clock className="w-3.5 h-3.5 text-[#0000FF] flex-shrink-0" />
          <span className="truncate">{formatTime(job.start_time)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
          <Users className="w-3.5 h-3.5 text-[#0000FF] flex-shrink-0" />
          <span>{crewCount}/{job.crew_needed} crew</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${TRADE_COLORS[job.trade?.toLowerCase()] || "bg-gray-100 text-gray-700"}`}>
            {job.trade}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 mb-3">
        <div
          className="bg-[#0000FF] h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${Math.min((crewCount / job.crew_needed) * 100, 100)}%` }}
        />
      </div>

      {/* Description */}
      {job.description && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">{job.description}</p>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {isCrew && job.status === "open" && !isAccepted && (
          <button
            onClick={() => onAccept?.(job.id)}
            className="flex-1 bg-[#0000FF] text-white font-bold py-2 px-4 rounded-lg text-sm hover:bg-blue-700 transition-colors"
            data-testid={`accept-job-${job.id}`}
          >
            Accept Job
          </button>
        )}
        {isCrew && isAccepted && job.status === "in_progress" && (
          <button
            onClick={() => onComplete?.(job.id)}
            className="flex-1 bg-emerald-600 text-white font-bold py-2 px-4 rounded-lg text-sm hover:bg-emerald-700 transition-colors"
            data-testid={`complete-job-${job.id}`}
          >
            Mark Complete
          </button>
        )}
        {isCrew && isAccepted && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold px-2">
            <CheckCircle className="w-4 h-4" /> Accepted
          </span>
        )}
        {isContractor && job.status === "fulfilled" && (
          <button
            onClick={() => onStart?.(job.id)}
            className="flex-1 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg text-sm hover:bg-blue-700 transition-colors"
            data-testid={`start-job-${job.id}`}
          >
            Start Job
          </button>
        )}
        {isContractor && job.status === "completed_pending_review" && (
          <button
            onClick={() => onVerify?.(job.id)}
            className="flex-1 bg-emerald-600 text-white font-bold py-2 px-4 rounded-lg text-sm hover:bg-emerald-700 transition-colors"
            data-testid={`verify-job-${job.id}`}
          >
            Verify Complete
          </button>
        )}
        {isContractor && job.status === "completed" && !job.rated_crew?.includes(currentUser?.id) && (
          <button
            onClick={() => onRate?.(job)}
            className="flex-1 bg-yellow-500 text-white font-bold py-2 px-4 rounded-lg text-sm hover:bg-yellow-600 transition-colors"
            data-testid={`rate-job-${job.id}`}
          >
            Rate Workers
          </button>
        )}
      </div>
    </div>
  );
}
