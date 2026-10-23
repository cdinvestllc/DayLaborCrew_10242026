import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Archive, ArrowLeft, Briefcase } from "lucide-react";
import Navbar from "../components/Navbar";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ArchivedJobsPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    axios.get(`${API}/jobs/archived/list`)
      .then(res => { if (active) setJobs(res.data || []); })
      .catch(err => { if (active) setError(err?.response?.data?.detail || "Could not load archived jobs."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617]">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link to="/contractor/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0000FF] hover:underline mb-5">
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </Link>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-blue-100 text-[#0000FF] flex items-center justify-center"><Archive className="w-5 h-5" /></div>
          <div><h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Archived Jobs</h1><p className="text-sm text-slate-500">Cancelled jobs saved for your records.</p></div>
        </div>
        {loading ? <p className="text-sm text-slate-500">Loading archives…</p> : error ? (
          <div role="alert" className="card p-5 text-sm text-red-600">{error}</div>
        ) : jobs.length === 0 ? (
          <div className="card p-8 text-center"><Briefcase className="w-10 h-10 text-slate-300 mx-auto mb-3" /><p className="font-semibold text-slate-700 dark:text-slate-200">No archived jobs yet</p><p className="text-sm text-slate-500 mt-1">Cancel a job, then choose Archive from your dashboard.</p></div>
        ) : (
          <div className="space-y-3">
            {jobs.map(job => (
              <article key={job.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h2 className="font-bold text-slate-900 dark:text-white">{job.title}</h2><p className="text-sm text-slate-500 mt-1">{job.location?.city || job.location?.address || "Location not set"}</p></div>
                  <span className="px-2 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">Archived</span>
                </div>
                {job.cancel_reason && <p className="text-sm text-slate-600 dark:text-slate-300 mt-3">Cancellation reason: {job.cancel_reason}</p>}
                <p className="text-xs text-slate-400 mt-3">Cancelled: {job.cancelled_at ? new Date(job.cancelled_at).toLocaleString() : "Date unavailable"} · Archived: {job.archived_at ? new Date(job.archived_at).toLocaleString() : "Date unavailable"}</p>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
