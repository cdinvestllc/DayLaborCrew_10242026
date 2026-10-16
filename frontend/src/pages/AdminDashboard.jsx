import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import Navbar from "../components/Navbar";
import { toast } from "sonner";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import {
  Users, Briefcase, DollarSign, TrendingUp, Shield, Settings, FileText,
  Trash2, Check, X, Search, ChevronLeft, ChevronRight, Map, Activity,
  Mail, Tag, Crown, Eye, Edit2, Plus, RefreshCw, Download, Upload,
  ToggleLeft, ToggleRight, Globe, Image, BookOpen, Lock, AlertTriangle,
  ChevronDown, Database, Send, Filter, ExternalLink, CheckCircle, XCircle,
  Layers, BarChart2, MessageSquare, Key, Zap
} from "lucide-react";
import SafeImage from "../components/SafeImage";
import { resolveImageUrl } from "../lib/media";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ADMIN_TABS = [
  { id: "Overview", label: "Overview", icon: BarChart2 },
  { id: "Users", label: "Users", icon: Users },
  { id: "Jobs", label: "Jobs", icon: Briefcase },
  { id: "Payments", label: "Payments", icon: DollarSign },
  { id: "Trades", label: "Trades", icon: Tag },
  { id: "CMS", label: "CMS", icon: Globe },
  { id: "Ads", label: "Ads", icon: Layers },
  { id: "Map", label: "Map Monitor", icon: Map },
  { id: "Email", label: "Bulk Email", icon: Mail },
  { id: "Messages", label: "Messages", icon: MessageSquare },
  { id: "Coupons", label: "Coupons", icon: Tag },
  { id: "Activity", label: "Activity Log", icon: Activity },
  { id: "Settings", label: "Settings", icon: Settings },
];

const SUPER_ADMIN_TABS = [
  { id: "Export", label: "Export / Import", icon: Database },
];

const PIE_COLORS = ["#0000FF", "#7EC8E3", "#10B981", "#F59E0B", "#EF4444"];

const STATUS_COLORS = {
  open: "bg-green-100 text-green-700",
  fulfilled: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-slate-100 text-slate-600",
  completed_pending_review: "bg-purple-100 text-purple-700",
  cancelled: "bg-red-100 text-red-600",
};

// ─── Reusable Components ──────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, bg, sublabel }) {
  return (
    <div className="card p-4 hover:shadow-md transition-shadow" data-testid={`stat-card-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: bg }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
      <div className="text-2xl font-extrabold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>{value ?? "—"}</div>
      {sublabel && <p className="text-xs text-slate-400 mt-1">{sublabel}</p>}
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[status] || "bg-slate-100 text-slate-600"}`}>
      {status?.replace(/_/g, " ")}
    </span>
  );
}

function UserProfileModal({ userId, onClose }) {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!userId) return;
    axios.get(`${API}/admin/users/${userId}`)
      .then(r => setProfile(r.data))
      .catch(() => toast.error("Failed to load profile"));
  }, [userId]);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!profile) return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 w-full max-w-lg">
        <div className="flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0000FF]" /></div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()} data-testid="user-profile-modal">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-[#050A30] rounded-full flex items-center justify-center text-white text-2xl font-bold">
              {profile.profile_photo
                ? <SafeImage src={resolveImageUrl(profile.profile_photo)} alt="" className="w-full h-full object-cover rounded-full" />
                : profile.name?.[0]?.toUpperCase()}
            </div>
            <div>
              <h2 className="font-extrabold text-[#050A30] dark:text-white text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>{profile.name}</h2>
              <p className="text-sm text-slate-500">{profile.email}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold mt-1 inline-block ${profile.role === "super_admin" ? "bg-purple-100 text-purple-700" : profile.role === "admin" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                {profile.role}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            ["Phone", profile.phone || "—"],
            ["Trade", profile.trade || "—"],
            ["Status", profile.is_active ? "Active" : "Suspended"],
            ["Subscription", profile.subscription_status],
            ["Rating", `${profile.rating} (${profile.rating_count} reviews)`],
            ["Jobs Done", profile.jobs_completed],
            ["Points", profile.points],
            ["Joined", new Date(profile.created_at).toLocaleDateString()],
          ].map(([k, v]) => (
            <div key={k} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
              <p className="text-xs text-slate-400 uppercase tracking-wide">{k}</p>
              <p className="font-semibold text-[#050A30] dark:text-white text-sm mt-0.5">{String(v)}</p>
            </div>
          ))}
        </div>

        {profile.bio && (
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 mb-3">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Bio</p>
            <p className="text-sm text-[#050A30] dark:text-slate-300">{profile.bio}</p>
          </div>
        )}

        {profile.recent_jobs?.length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Recent Jobs</p>
            <div className="space-y-1">
              {profile.recent_jobs.slice(0, 3).map(j => (
                <div key={j.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">
                  <span className="text-sm text-[#050A30] dark:text-white truncate">{j.title}</span>
                  <StatusBadge status={j.status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Jobs Tab ─────────────────────────────────────────────────────────────────

function JobsTab() {
  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tradeFilter, setTradeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null);
  const [editJobId, setEditJobId] = useState(null);
  const [editStatus, setEditStatus] = useState("");

  const fetchJobs = useCallback(async (pg = 1, q = "", st = "", tr = "") => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: pg, limit: 15 });
      if (q) params.append("search", q);
      if (st) params.append("status", st);
      if (tr) params.append("trade", tr);
      const res = await axios.get(`${API}/admin/jobs?${params}`);
      setJobs(res.data.jobs || []);
      setTotal(res.data.total || 0);
    } catch { toast.error("Failed to load jobs"); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchJobs(1, search, statusFilter, tradeFilter); }, []);

  const deleteJob = async (jobId, title) => {
    if (!window.confirm(`Delete job "${title}"?`)) return;
    try {
      await axios.delete(`${API}/admin/jobs/${jobId}`);
      toast.success("Job deleted");
      fetchJobs(page, search, statusFilter, tradeFilter);
    } catch { toast.error("Failed to delete job"); }
  };

  const updateJobStatus = async (jobId) => {
    try {
      await axios.put(`${API}/admin/jobs/${jobId}`, { status: editStatus });
      toast.success("Job status updated");
      setEditJobId(null);
      fetchJobs(page, search, statusFilter, tradeFilter);
    } catch { toast.error("Failed to update job"); }
  };

  const closeJob = async (jobId) => {
    try {
      await axios.post(`${API}/admin/jobs/${jobId}/close`);
      toast.success("Job closed");
      fetchJobs(page, search, statusFilter, tradeFilter);
    } catch { toast.error("Failed to close job"); }
  };

  const applyFilters = (s, st, tr) => { setPage(1); fetchJobs(1, s, st, tr); };

  return (
    <div data-testid="jobs-tab">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text" placeholder="Search jobs..."
            value={search}
            onChange={e => { setSearch(e.target.value); applyFilters(e.target.value, statusFilter, tradeFilter); }}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
            data-testid="jobs-search"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); applyFilters(search, e.target.value, tradeFilter); }}
          className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
          data-testid="jobs-status-filter"
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="in_progress">In Progress</option>
          <option value="completed_pending_review">Pending Review</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button
          onClick={() => { setSearch(""); setStatusFilter(""); setTradeFilter(""); fetchJobs(1, "", "", ""); }}
          className="px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Reset
        </button>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-2 mb-3 text-sm text-slate-500">
        <span>{total} total jobs</span>
        {statusFilter && <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs font-semibold">Filter: {statusFilter}</span>}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Job</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Trade</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Contractor</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Crew</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Pay</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Date</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center"><div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-[#0000FF]" /></td></tr>
              ) : jobs.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No jobs found</td></tr>
              ) : jobs.map(job => (
                <tr key={job.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50" data-testid={`job-row-${job.id}`}>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-semibold text-[#050A30] dark:text-white truncate max-w-[180px]">{job.title}</p>
                      {job.is_emergency && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-semibold">URGENT</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">{job.trade}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 text-xs">{job.contractor_name}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold">{job.crew_accepted?.length || 0}/{job.crew_needed}</span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-[#050A30] dark:text-white">${job.pay_rate}/hr</td>
                  <td className="px-4 py-3">
                    {editJobId === job.id ? (
                      <div className="flex items-center gap-1">
                        <select
                          value={editStatus}
                          onChange={e => setEditStatus(e.target.value)}
                          className="text-xs border border-slate-300 rounded px-1 py-0.5 dark:bg-slate-700 dark:border-slate-600"
                        >
                          {["open", "fulfilled", "in_progress", "completed", "cancelled"].map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        <button onClick={() => updateJobStatus(job.id)} className="text-green-600 p-0.5"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditJobId(null)} className="text-red-500 p-0.5"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : <StatusBadge status={job.status} />}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{new Date(job.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setSelectedJob(job)} className="p-1.5 rounded text-blue-500 hover:bg-blue-50" title="View" data-testid={`view-job-${job.id}`}>
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { setEditJobId(job.id); setEditStatus(job.status); }}
                        className="p-1.5 rounded text-amber-500 hover:bg-amber-50" title="Edit Status"
                        data-testid={`edit-job-${job.id}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {job.status !== "cancelled" && (
                        <button onClick={() => closeJob(job.id)} className="p-1.5 rounded text-orange-500 hover:bg-orange-50" title="Close Job">
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => deleteJob(job.id, job.title)} className="p-1.5 rounded text-red-500 hover:bg-red-50" title="Delete" data-testid={`delete-job-${job.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800">
          <p className="text-sm text-slate-500">Showing {jobs.length} of {total}</p>
          <div className="flex gap-2">
            <button onClick={() => { const np = Math.max(1, page - 1); setPage(np); fetchJobs(np, search, statusFilter, tradeFilter); }} disabled={page === 1} className="p-1.5 rounded border border-slate-200 disabled:opacity-50">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 text-sm">{page}</span>
            <button onClick={() => { const np = page + 1; setPage(np); fetchJobs(np, search, statusFilter, tradeFilter); }} disabled={page * 15 >= total} className="p-1.5 rounded border border-slate-200 disabled:opacity-50">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Job Detail Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedJob(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()} data-testid="job-detail-modal">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-extrabold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>{selectedJob.title}</h2>
              <button onClick={() => setSelectedJob(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <p className="text-slate-600 dark:text-slate-300">{selectedJob.description}</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Trade", selectedJob.trade],
                  ["Pay Rate", `$${selectedJob.pay_rate}/hr`],
                  ["Crew Needed", selectedJob.crew_needed],
                  ["Crew Accepted", selectedJob.crew_accepted?.length || 0],
                  ["Contractor", selectedJob.contractor_name],
                  ["Start Time", new Date(selectedJob.start_time).toLocaleString()],
                ].map(([k, v]) => (
                  <div key={k} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2">
                    <p className="text-xs text-slate-400">{k}</p>
                    <p className="font-semibold text-[#050A30] dark:text-white">{String(v)}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={selectedJob.status} />
                {selectedJob.is_emergency && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">EMERGENCY</span>}
              </div>
              {selectedJob.location && (
                <p className="text-xs text-slate-400">Location: {selectedJob.location.address || `${selectedJob.location.lat?.toFixed(4)}, ${selectedJob.location.lng?.toFixed(4)}`}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Trades Tab ──────────────────────────────────────────────────────────────

function TradesTab() {
  const [trades, setTrades] = useState([]);
  const [newTrade, setNewTrade] = useState("");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchTrades = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/admin/trades`);
      setTrades(res.data);
    } catch { toast.error("Failed to load trades"); }
    setLoading(false);
  };

  useEffect(() => { fetchTrades(); }, []);

  const createTrade = async () => {
    if (!newTrade.trim()) return toast.error("Enter a trade name");
    try {
      await axios.post(`${API}/admin/trades`, { name: newTrade.trim(), is_active: true });
      toast.success(`Trade "${newTrade}" created`);
      setNewTrade("");
      fetchTrades();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to create trade"); }
  };

  const saveTrade = async (id) => {
    try {
      await axios.put(`${API}/admin/trades/${id}`, { name: editName });
      toast.success("Trade updated");
      setEditId(null);
      fetchTrades();
    } catch { toast.error("Failed to update trade"); }
  };

  const toggleTrade = async (id, active) => {
    try {
      await axios.put(`${API}/admin/trades/${id}`, { is_active: !active });
      fetchTrades();
    } catch { toast.error("Failed to toggle trade"); }
  };

  const deleteTrade = async (id, name) => {
    if (!window.confirm(`Delete trade "${name}"?`)) return;
    try {
      await axios.delete(`${API}/admin/trades/${id}`);
      toast.success("Trade deleted");
      fetchTrades();
    } catch { toast.error("Failed to delete trade"); }
  };

  return (
    <div data-testid="trades-tab">
      <div className="card p-5 mb-4">
        <h3 className="font-bold text-[#050A30] dark:text-white mb-3" style={{ fontFamily: "Manrope, sans-serif" }}>Add New Trade</h3>
        <div className="flex gap-2">
          <input
            type="text" placeholder="Trade name (e.g. Welding)"
            value={newTrade}
            onChange={e => setNewTrade(e.target.value)}
            onKeyDown={e => e.key === "Enter" && createTrade()}
            className="flex-1 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
            data-testid="new-trade-input"
          />
          <button onClick={createTrade} className="bg-[#0000FF] text-white px-5 py-2.5 rounded-lg font-bold hover:bg-blue-700 flex items-center gap-2" data-testid="add-trade-btn">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Trades ({trades.length})</h3>
        </div>
        {loading ? (
          <div className="p-10 text-center"><div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-[#0000FF]" /></div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {trades.map(trade => (
              <div key={trade.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50" data-testid={`trade-row-${trade.id}`}>
                {editId === trade.id ? (
                  <div className="flex items-center gap-2 flex-1 mr-3">
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="flex-1 border border-[#0000FF] rounded px-2 py-1 text-sm focus:outline-none dark:bg-slate-700 dark:text-white"
                      autoFocus
                    />
                    <button onClick={() => saveTrade(trade.id)} className="text-green-600 p-1"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setEditId(null)} className="text-red-500 p-1"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 flex-1">
                    <span className={`font-semibold text-sm ${trade.is_active ? "text-[#050A30] dark:text-white" : "text-slate-400 line-through"}`}>{trade.name}</span>
                    {!trade.is_active && <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Inactive</span>}
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleTrade(trade.id, trade.is_active)} className={`p-1.5 rounded ${trade.is_active ? "text-green-500 hover:bg-green-50" : "text-slate-400 hover:bg-slate-50"}`} title={trade.is_active ? "Deactivate" : "Activate"}>
                    {trade.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                  <button onClick={() => { setEditId(trade.id); setEditName(trade.name); }} className="p-1.5 rounded text-amber-500 hover:bg-amber-50" data-testid={`edit-trade-${trade.id}`}>
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteTrade(trade.id, trade.name)} className="p-1.5 rounded text-red-500 hover:bg-red-50" data-testid={`delete-trade-${trade.id}`}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CMS Tab ─────────────────────────────────────────────────────────────────

function CMSTab() {
  const [activePage, setActivePage] = useState("terms");
  const [cmsData, setCmsData] = useState({});
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({});
  const [editSettings, setEditSettings] = useState({});
  const logoRef = useRef();
  const faviconRef = useRef();

  const CMS_PAGES = [
    { id: "terms", label: "Terms & Conditions", icon: FileText },
    { id: "privacy", label: "Privacy Policy", icon: Lock },
    { id: "guidelines", label: "Community Guidelines", icon: BookOpen },
  ];

  const loadPage = async (page) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/admin/cms/${page}`);
      setCmsData(d => ({ ...d, [page]: res.data }));
      setContent(res.data.content || "");
      setTitle(res.data.title || "");
    } catch { toast.error("Failed to load CMS page"); }
    setLoading(false);
  };

  const loadSettings = async () => {
    const res = await axios.get(`${API}/admin/settings`);
    setSettings(res.data);
    setEditSettings(res.data);
  };

  useEffect(() => {
    loadPage("terms");
    loadSettings();
  }, []);

  const handlePageChange = (page) => {
    setActivePage(page);
    if (!cmsData[page]) loadPage(page);
    else { setContent(cmsData[page].content || ""); setTitle(cmsData[page].title || ""); }
  };

  const savePage = async () => {
    try {
      await axios.put(`${API}/admin/cms/${activePage}`, { content, title, published: true });
      toast.success("Content saved and published");
      setCmsData(d => ({ ...d, [activePage]: { ...d[activePage], content, title } }));
    } catch { toast.error("Failed to save"); }
  };

  const openEditorWindow = () => {
    const w = window.open("", "_blank", "width=900,height=700");
    w.document.write(`
      <html><head><title>Edit - ${activePage}</title>
      <style>body{font-family:sans-serif;padding:20px;} textarea{width:100%;height:calc(100vh - 120px);font-size:14px;padding:12px;border:1px solid #ccc;border-radius:8px;} button{background:#0000FF;color:#fff;padding:10px 24px;border:none;border-radius:8px;cursor:pointer;font-weight:bold;}</style>
      </head><body>
      <h2>Editing: ${title}</h2>
      <textarea id="ed">${content}</textarea><br><br>
      <button onclick="window.opener.postMessage({page:'${activePage}',content:document.getElementById('ed').value},'*');window.close()">Save &amp; Close</button>
      </body></html>
    `);
  };

  useEffect(() => {
    const handler = (e) => {
      if (e.data?.page === activePage) {
        setContent(e.data.content);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [activePage]);

  const saveSettings = async () => {
    await axios.put(`${API}/admin/settings`, editSettings);
    setSettings(editSettings);
    toast.success("Site settings saved");
  };

  const uploadLogo = async (file, type) => {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await axios.post(`${API}/admin/settings/logo?logo_type=${type}`, fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setSettings(s => ({ ...s, [type === "logo" ? "site_logo" : "site_favicon"]: res.data.url }));
      toast.success(`${type === "logo" ? "Logo" : "Favicon"} updated`);
    } catch { toast.error("Upload failed"); }
  };

  return (
    <div data-testid="cms-tab" className="space-y-5">
      {/* Site Header Settings */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-5 h-5 text-[#0000FF]" />
          <h3 className="font-bold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Site Identity</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Site Name</label>
            <input
              type="text" value={editSettings.site_name || ""}
              onChange={e => setEditSettings(s => ({ ...s, site_name: e.target.value }))}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
              data-testid="site-name-input"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Tagline</label>
            <input
              type="text" value={editSettings.site_tagline || ""}
              onChange={e => setEditSettings(s => ({ ...s, site_tagline: e.target.value }))}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
              data-testid="site-tagline-input"
            />
          </div>
        </div>
        <div className="flex items-center gap-4 mb-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Site Logo</p>
            <div className="flex items-center gap-3">
              {settings.site_logo && <SafeImage src={resolveImageUrl(settings.site_logo)} alt="Logo" className="h-10 rounded" />}
              <button onClick={() => logoRef.current?.click()} className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800">
                <Upload className="w-4 h-4" /> Upload Logo
              </button>
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files[0] && uploadLogo(e.target.files[0], "logo")} />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Favicon</p>
            <div className="flex items-center gap-3">
              {settings.site_favicon && <SafeImage src={resolveImageUrl(settings.site_favicon)} alt="Favicon" className="h-8 w-8 rounded" />}
              <button onClick={() => faviconRef.current?.click()} className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800">
                <Upload className="w-4 h-4" /> Upload Favicon
              </button>
              <input ref={faviconRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files[0] && uploadLogo(e.target.files[0], "favicon")} />
            </div>
          </div>
        </div>
        <button onClick={saveSettings} className="bg-[#0000FF] text-white px-5 py-2.5 rounded-lg font-bold hover:bg-blue-700" data-testid="save-site-settings-btn">
          Save Site Settings
        </button>
      </div>

      {/* CMS Pages */}
      <div className="card overflow-hidden">
        <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          {CMS_PAGES.map(p => (
            <button
              key={p.id}
              onClick={() => handlePageChange(p.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold whitespace-nowrap transition-colors ${activePage === p.id ? "border-b-2 border-[#0000FF] text-[#0000FF]" : "text-slate-500 hover:text-slate-700"}`}
              data-testid={`cms-tab-${p.id}`}
            >
              <p.icon className="w-4 h-4" /> {p.label}
            </button>
          ))}
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-bold text-[#050A30] dark:text-white text-sm">{title}</p>
              <p className="text-xs text-slate-400">Version: {cmsData[activePage]?.version || 1}</p>
            </div>
            <button
              onClick={openEditorWindow}
              className="flex items-center gap-1.5 text-sm text-[#0000FF] hover:underline"
              data-testid="open-editor-btn"
            >
              <ExternalLink className="w-4 h-4" /> Open in New Window
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#0000FF]" /></div>
          ) : (
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-4 text-sm dark:bg-slate-800 dark:text-white min-h-72 focus:outline-none focus:border-[#0000FF] font-mono resize-y"
              placeholder="Enter content..."
              data-testid="cms-editor"
            />
          )}
          <button onClick={savePage} className="mt-3 bg-[#0000FF] text-white px-5 py-2.5 rounded-lg font-bold hover:bg-blue-700" data-testid="save-cms-btn">
            Save & Publish
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Ads Management Tab ───────────────────────────────────────────────────────

function AdsTab() {
  const [ads, setAds] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);

  const fetchAds = async (status = filter) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/advertisers/admin/ads${status ? `?status=${status}` : ""}`);
      setAds(res.data);
    } catch { toast.error("Failed to load ads"); }
    setLoading(false);
  };

  useEffect(() => { fetchAds(filter); }, [filter]);

  const approve = async (id) => {
    await axios.post(`${API}/advertisers/admin/ads/${id}/approve`);
    toast.success("Ad approved");
    fetchAds(filter);
  };

  const reject = async (id) => {
    await axios.post(`${API}/advertisers/admin/ads/${id}/reject`);
    toast.success("Ad rejected");
    fetchAds(filter);
  };

  const deleteAd = async (id) => {
    if (!window.confirm("Delete this ad?")) return;
    await axios.delete(`${API}/advertisers/admin/ads/${id}`);
    toast.success("Ad deleted");
    fetchAds(filter);
  };

  return (
    <div data-testid="ads-tab">
      <div className="flex gap-2 mb-4">
        {["pending", "approved", "rejected", ""].map(s => (
          <button key={s || "all"} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${filter === s ? "bg-[#050A30] text-white border-[#050A30]" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500"}`}>
            {s || "All"}
          </button>
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Advertiser</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Title</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Placement</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Submitted</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={6} className="py-10 text-center"><div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-[#0000FF]" /></td></tr>
              ) : ads.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-slate-400">No ads found</td></tr>
              ) : ads.map(ad => (
                <tr key={ad.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3 font-semibold text-[#050A30] dark:text-white">{ad.advertiser_name}</td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-semibold text-sm">{ad.title}</p>
                      <p className="text-xs text-slate-400 truncate max-w-xs">{ad.body}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className="capitalize text-xs bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">{ad.placement}</span></td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${ad.status === "approved" ? "bg-green-100 text-green-700" : ad.status === "rejected" ? "bg-red-100 text-red-600" : "bg-yellow-100 text-yellow-700"}`}>
                      {ad.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{new Date(ad.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {ad.status === "pending" && (
                        <>
                          <button onClick={() => approve(ad.id)} className="p-1.5 rounded text-green-500 hover:bg-green-50" title="Approve" data-testid={`approve-ad-${ad.id}`}><Check className="w-4 h-4" /></button>
                          <button onClick={() => reject(ad.id)} className="p-1.5 rounded text-red-500 hover:bg-red-50" title="Reject"><X className="w-4 h-4" /></button>
                        </>
                      )}
                      <button onClick={() => deleteAd(ad.id)} className="p-1.5 rounded text-slate-400 hover:bg-slate-100" title="Delete"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Map Tab ─────────────────────────────────────────────────────────────────

function MapTab() {
  const [mapData, setMapData] = useState(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);

  useEffect(() => {
    axios.get(`${API}/admin/map-data`)
      .then(r => setMapData(r.data))
      .catch(() => toast.error("Failed to load map data"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!mapData || loading) return;
    if (typeof window === "undefined") return;

    const L = require("leaflet");
    if (leafletRef.current) {
      leafletRef.current.remove();
      leafletRef.current = null;
    }

    const map = L.map("admin-map", { center: [25.7617, -80.1918], zoom: 11 });
    leafletRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    // Job markers
    (mapData.jobs || []).forEach(job => {
      if (!job.location?.lat) return;
      const marker = L.circleMarker([job.location.lat, job.location.lng], {
        radius: 10, color: "#0000FF", fillColor: "#0000FF", fillOpacity: 0.8, weight: 2
      }).addTo(map);
      marker.bindPopup(`<b>${job.title}</b><br>Status: ${job.status}<br>Pay: $${job.pay_rate}/hr`);
    });

    // Crew markers
    (mapData.crew || []).forEach(crew => {
      if (!crew.location?.lat) return;
      const marker = L.circleMarker([crew.location.lat, crew.location.lng], {
        radius: 7, color: "#10B981", fillColor: "#10B981", fillOpacity: 0.9, weight: 2
      }).addTo(map);
      marker.bindPopup(`<b>${crew.name}</b><br>Trade: ${crew.trade}<br>${crew.availability ? "Available" : "Unavailable"}`);
    });

    return () => { if (leafletRef.current) { leafletRef.current.remove(); leafletRef.current = null; } };
  }, [mapData, loading]);

  const centerOnMyLocation = () => {
    navigator.geolocation.getCurrentPosition(pos => {
      if (leafletRef.current) {
        leafletRef.current.setView([pos.coords.latitude, pos.coords.longitude], 13);
      }
    }, () => toast.error("Location access denied"));
  };

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0000FF]" /></div>;

  return (
    <div data-testid="map-tab">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#0000FF] inline-block"></span> Active Jobs ({mapData?.jobs?.length || 0})</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#10B981] inline-block"></span> Crew on Map ({mapData?.crew?.length || 0})</span>
        </div>
        <div className="flex gap-2">
          <button onClick={centerOnMyLocation} className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm hover:bg-slate-50 font-semibold">
            <Map className="w-4 h-4" /> My Location
          </button>
          <button onClick={() => { axios.get(`${API}/admin/map-data`).then(r => setMapData(r.data)); }} className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm hover:bg-slate-50">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>
      <div id="admin-map" className="w-full rounded-xl overflow-hidden border border-slate-200" style={{ height: 500 }} />
    </div>
  );
}

// ─── Bulk Email Tab ───────────────────────────────────────────────────────────

function BulkEmailTab() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState("all");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const send = async () => {
    if (!subject.trim() || !body.trim()) return toast.error("Fill in all fields");
    if (!window.confirm(`Send email to all ${target === "all" ? "users" : target}?`)) return;
    setSending(true);
    try {
      const res = await axios.post(`${API}/admin/bulk-email`, { subject, body, target });
      setResult(res.data);
      toast.success(`Email sent to ${res.data.total} users`);
    } catch { toast.error("Failed to send emails"); }
    setSending(false);
  };

  return (
    <div className="max-w-2xl" data-testid="email-tab">
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Mail className="w-5 h-5 text-[#0000FF]" />
          <h3 className="font-bold text-[#050A30] dark:text-white text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>Bulk Email</h3>
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Send To</label>
          <select value={target} onChange={e => setTarget(e.target.value)}
            className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
            data-testid="email-target-select">
            <option value="all">All Users (Crew + Contractors)</option>
            <option value="crew">Crew Members Only</option>
            <option value="contractor">Contractors Only</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Subject</label>
          <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
            placeholder="Email subject..."
            className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
            data-testid="email-subject" />
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Message Body</label>
          <textarea value={body} onChange={e => setBody(e.target.value)}
            placeholder="Email body..."
            rows={6}
            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white resize-y"
            data-testid="email-body" />
        </div>

        <button onClick={send} disabled={sending}
          className="bg-[#0000FF] text-white px-6 py-2.5 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          data-testid="send-email-btn">
          {sending ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Send className="w-4 h-4" />}
          {sending ? "Sending..." : "Send Email"}
        </button>

        {result && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4" data-testid="email-result">
            <p className="font-semibold text-green-700">Email Queued</p>
            <p className="text-sm text-green-600">Total: {result.total} | Sent: {result.sent} | Failed: {result.failed}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Activity Log Tab ─────────────────────────────────────────────────────────

function ActivityLogTab() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async (pg = 1) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/admin/activity-log?page=${pg}&limit=30`);
      setLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
    } catch { toast.error("Failed to load activity log"); }
    setLoading(false);
  };

  useEffect(() => { fetchLogs(1); }, []);

  const ACTION_COLORS = {
    delete: "text-red-600",
    suspend: "text-orange-600",
    activate: "text-green-600",
    update: "text-blue-600",
    create: "text-purple-600",
    import: "text-indigo-600",
    seed: "text-pink-600",
  };

  const getActionColor = (action) => {
    for (const [key, cls] of Object.entries(ACTION_COLORS)) {
      if (action.includes(key)) return cls;
    }
    return "text-slate-600";
  };

  return (
    <div data-testid="activity-tab">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500">{total} total entries</p>
        <button onClick={() => fetchLogs(page)} className="flex items-center gap-1 text-sm text-[#0000FF] hover:underline">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Admin</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Action</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Target</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Details</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">IP</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center"><div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-[#0000FF]" /></td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No activity yet</td></tr>
              ) : logs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-semibold text-[#050A30] dark:text-white text-xs">{log.admin_name}</p>
                      <p className="text-xs text-slate-400 capitalize">{log.admin_role}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold text-xs ${getActionColor(log.action)}`}>{log.action}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{log.target_type ? `${log.target_type}` : "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-400 max-w-[180px] truncate">{log.details || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{log.ip_address || "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{new Date(log.timestamp).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800">
          <p className="text-sm text-slate-500">Showing {logs.length} of {total}</p>
          <div className="flex gap-2">
            <button onClick={() => { const np = Math.max(1, page - 1); setPage(np); fetchLogs(np); }} disabled={page === 1} className="p-1.5 rounded border border-slate-200 disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
            <span className="px-3 py-1 text-sm">{page}</span>
            <button onClick={() => { const np = page + 1; setPage(np); fetchLogs(np); }} disabled={page * 30 >= total} className="p-1.5 rounded border border-slate-200 disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Export/Import Tab (Super Admin only) ────────────────────────────────────

function ExportTab() {
  const [seeding, setSeeding] = useState(false);
  const importRef = useRef();

  const exportFile = (type) => {
    const url = `${API}/admin/export/users/${type}`;
    fetch(url, { credentials: "include" })
      .then(r => { if (!r.ok) throw new Error("export failed"); return r.blob(); })
      .then(blob => {
        const u = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = u;
        a.download = `users_export.${type}`;
        a.click();
        URL.revokeObjectURL(u);
        toast.success(`Exported as ${type.toUpperCase()}`);
      })
      .catch(() => toast.error("Export failed"));
  };

  const importCSV = async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await axios.post(`${API}/admin/import/users/csv`, fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      toast.success(`Imported ${res.data.imported} users`);
    } catch { toast.error("Import failed"); }
  };

  const seedData = async () => {
    if (!window.confirm("Seed test data? This will create sample users and jobs.")) return;
    setSeeding(true);
    try {
      const res = await axios.post(`${API}/admin/seed`);
      toast.success(`Seeded: ${res.data.users_created} users, ${res.data.jobs_created} jobs`);
    } catch (e) { toast.error(e.response?.data?.detail || "Seed failed"); }
    setSeeding(false);
  };

  return (
    <div className="max-w-2xl space-y-5" data-testid="export-tab">
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Download className="w-5 h-5 text-[#0000FF]" />
          <h3 className="font-bold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Export Users</h3>
        </div>
        <div className="flex gap-3">
          <button onClick={() => exportFile("csv")} className="flex items-center gap-2 bg-[#0000FF] text-white px-5 py-2.5 rounded-lg font-bold hover:bg-blue-700" data-testid="export-csv-btn">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => exportFile("json")} className="flex items-center gap-2 bg-[#050A30] text-white px-5 py-2.5 rounded-lg font-bold hover:bg-slate-800" data-testid="export-json-btn">
            <Download className="w-4 h-4" /> Export JSON
          </button>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Upload className="w-5 h-5 text-green-600" />
          <h3 className="font-bold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Import Users (CSV)</h3>
        </div>
        <p className="text-sm text-slate-500 mb-3">CSV columns: email, name, role, phone, trade, company_name, password</p>
        <button onClick={() => importRef.current?.click()} className="flex items-center gap-2 border-2 border-dashed border-slate-300 text-slate-500 px-5 py-3 rounded-lg hover:border-[#0000FF] hover:text-[#0000FF] font-semibold" data-testid="import-csv-btn">
          <Upload className="w-4 h-4" /> Choose CSV File
        </button>
        <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={e => e.target.files[0] && importCSV(e.target.files[0])} />
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-5 h-5 text-purple-600" />
          <h3 className="font-bold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Seed Test Data</h3>
        </div>
        <p className="text-sm text-slate-500 mb-3">Creates sample crew, contractor accounts, and jobs for testing.</p>
        <button onClick={seedData} disabled={seeding} className="flex items-center gap-2 bg-purple-600 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-purple-700 disabled:opacity-50" data-testid="seed-data-btn">
          {seeding ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Database className="w-4 h-4" />}
          {seeding ? "Seeding..." : "Seed Data"}
        </button>
      </div>
    </div>
  );
}

// ─── Coupons Tab ─────────────────────────────────────────────────────────────

function CouponsTab() {
  const [coupons, setCoupons] = useState([]);
  const [form, setForm] = useState({ code: "", discount_percent: 10, usage_limit: 100, expires_at: "", plan_restriction: "" });
  const [creating, setCreating] = useState(false);
  const [testCode, setTestCode] = useState("");
  const [testPlan, setTestPlan] = useState("monthly");
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    axios.get(`${API}/admin/coupons`).then(r => setCoupons(r.data)).catch(() => {});
  }, []);

  const createCoupon = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await axios.post(`${API}/admin/coupons`, {
        ...form,
        discount_percent: parseFloat(form.discount_percent),
        usage_limit: parseInt(form.usage_limit),
        expires_at: form.expires_at || null,
        plan_restriction: form.plan_restriction || null
      });
      setCoupons(c => [res.data, ...c]);
      setForm({ code: "", discount_percent: 10, usage_limit: 100, expires_at: "", plan_restriction: "" });
      toast.success("Coupon created!");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
    setCreating(false);
  };

  const deleteCoupon = async (id) => {
    if (!window.confirm("Delete this coupon?")) return;
    try {
      await axios.delete(`${API}/admin/coupons/${id}`);
      setCoupons(c => c.filter(x => x.id !== id));
      toast.success("Deleted");
    } catch { toast.error("Failed"); }
  };

  const testCoupon = async () => {
    if (!testCode.trim()) return toast.error("Enter a coupon code to test");
    setTesting(true);
    setTestResult(null);
    try {
      const res = await axios.get(`${API}/payments/coupon/${testCode.toUpperCase()}?plan=${testPlan}`);
      setTestResult({ success: true, ...res.data });
    } catch (e) {
      setTestResult({ success: false, error: e?.response?.data?.detail || "Invalid or expired coupon" });
    }
    setTesting(false);
  };

  return (
    <div className="space-y-6" data-testid="coupons-tab">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create Coupon */}
        <div className="card p-5">
          <h3 className="font-bold text-[#050A30] dark:text-white text-lg mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>Create Coupon</h3>
          <form onSubmit={createCoupon} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Code *</label>
                <input required type="text" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm uppercase focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  placeholder="SUMMER20" data-testid="coupon-code-input" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Discount % *</label>
                <input required type="number" min="1" max="100" value={form.discount_percent} onChange={e => setForm(f => ({ ...f, discount_percent: e.target.value }))}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  data-testid="coupon-discount-input" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Usage Limit</label>
                <input type="number" min="1" value={form.usage_limit} onChange={e => setForm(f => ({ ...f, usage_limit: e.target.value }))}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  data-testid="coupon-limit-input" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Plan (optional)</label>
                <select value={form.plan_restriction} onChange={e => setForm(f => ({ ...f, plan_restriction: e.target.value }))}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  data-testid="coupon-plan-select">
                  <option value="">All plans</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Expires At (optional)</label>
              <input type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                data-testid="coupon-expires-input" />
            </div>
            <button type="submit" disabled={creating}
              className="w-full bg-[#0000FF] text-white py-2.5 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-60"
              data-testid="create-coupon-btn">
              {creating ? "Creating..." : "Create Coupon"}
            </button>
          </form>
        </div>

        {/* Test Coupon */}
        <div className="card p-5">
          <h3 className="font-bold text-[#050A30] dark:text-white text-lg mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>Test a Coupon</h3>
          <p className="text-slate-500 text-xs mb-4">Preview what a coupon does before sharing it with users.</p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Coupon Code</label>
              <input type="text" value={testCode} onChange={e => setTestCode(e.target.value.toUpperCase())}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm uppercase focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                placeholder="Enter code to test..." data-testid="test-coupon-code-input" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Test Against Plan</label>
              <select value={testPlan} onChange={e => setTestPlan(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                data-testid="test-coupon-plan-select">
                <option value="daily">Daily ($4.99)</option>
                <option value="weekly">Weekly ($24.99)</option>
                <option value="monthly">Monthly ($79.99)</option>
              </select>
            </div>
            <button onClick={testCoupon} disabled={testing}
              className="w-full border-2 border-[#0000FF] text-[#0000FF] py-2.5 rounded-lg font-bold hover:bg-blue-50 dark:hover:bg-blue-950 disabled:opacity-60"
              data-testid="test-coupon-btn">
              {testing ? "Testing..." : "Test Coupon"}
            </button>
            {testResult && (
              <div className={`rounded-xl p-4 ${testResult.success ? "bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-700" : "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-700"}`}
                data-testid="test-coupon-result">
                {testResult.success ? (
                  <div className="space-y-1">
                    <p className="font-bold text-green-700 dark:text-green-300 text-sm">Valid Coupon</p>
                    <p className="text-green-600 dark:text-green-400 text-xs">Code: <strong>{testResult.code}</strong> — {testResult.discount_percent}% off</p>
                    <p className="text-green-600 dark:text-green-400 text-xs">Original: <strong>${testResult.original_price}</strong> → After coupon: <strong>${testResult.final_price}</strong></p>
                    <p className="text-green-500 dark:text-green-500 text-xs">{testResult.uses_remaining} uses remaining</p>
                  </div>
                ) : (
                  <p className="font-semibold text-red-700 dark:text-red-300 text-sm">{testResult.error}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700">
          <h3 className="font-bold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>All Coupons ({coupons.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-xs">
              <tr>
                {["Code", "Discount", "Used", "Limit", "Plan", "Expires", "Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {coupons.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No coupons yet</td></tr>
              ) : coupons.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-4 py-3">
                    <span className="font-mono font-bold text-[#0000FF]">{c.code}</span>
                    <button onClick={() => { setTestCode(c.code); toast.success(`${c.code} loaded for testing`); }}
                      className="ml-2 text-xs text-slate-400 hover:text-[#0000FF]" title="Load for testing"
                      data-testid={`load-test-${c.id}`}>Test</button>
                  </td>
                  <td className="px-4 py-3 font-semibold text-emerald-600">{c.discount_percent}%</td>
                  <td className="px-4 py-3">{c.usage_count || 0}</td>
                  <td className="px-4 py-3">{c.usage_limit}</td>
                  <td className="px-4 py-3 capitalize">{c.plan_restriction || "All"}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "Never"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => deleteCoupon(c.id)}
                      className="text-red-400 hover:text-red-600"
                      data-testid={`delete-coupon-${c.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Admin Dashboard ─────────────────────────────────────────────────────

function AdminMessagesTab() {
  const [threads, setThreads] = useState([]);
  const [archivedThreads, setArchivedThreads] = useState([]);
  const [activeThread, setActiveThread] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [compose, setCompose] = useState({ recipient_id: "", subject: "", body: "" });
  const [users, setUsers] = useState([]);
  const [showArchived, setShowArchived] = useState(false);

  const loadThreads = () => {
    axios.get(`${API}/admin/messages`).then(r => setThreads(r.data)).catch(() => {});
    axios.get(`${API}/admin/messages/archived`).then(r => setArchivedThreads(r.data)).catch(() => {});
  };

  useEffect(() => {
    loadThreads();
    axios.get(`${API}/admin/users?limit=100`).then(r => setUsers(r.data.users || [])).catch(() => {});
  }, []);

  const sendMessage = async () => {
    if (!compose.recipient_id || !compose.subject || !compose.body) return toast.error("All fields required");
    setSending(true);
    try {
      await axios.post(`${API}/admin/messages/send`, compose);
      toast.success("Message sent!");
      setShowCompose(false);
      setCompose({ recipient_id: "", subject: "", body: "" });
      loadThreads();
    } catch { toast.error("Failed to send"); }
    setSending(false);
  };

  const openThread = async (t) => {
    if (showArchived) { setActiveThread(t); return; }
    const r = await axios.get(`${API}/admin/messages/${t.thread_id}`);
    setActiveThread(r.data);
  };

  const sendReply = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await axios.post(`${API}/admin/messages/${activeThread.thread_id}/reply`, { body: replyText });
      setReplyText("");
      const r = await axios.get(`${API}/admin/messages/${activeThread.thread_id}`);
      setActiveThread(r.data);
      toast.success("Reply sent!");
    } catch { toast.error("Failed"); }
    setSending(false);
  };

  const archiveThread = async (threadId) => {
    try {
      await axios.post(`${API}/admin/messages/${threadId}/archive`);
      toast.success("Thread archived");
      setActiveThread(null);
      loadThreads();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to archive"); }
  };

  const unarchiveThread = async (threadId) => {
    try {
      await axios.post(`${API}/admin/messages/${threadId}/unarchive`);
      toast.success("Thread restored");
      setActiveThread(null);
      loadThreads();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to restore"); }
  };

  const deleteThread = async (threadId) => {
    if (!window.confirm("Permanently delete this thread?")) return;
    try {
      await axios.delete(`${API}/admin/messages/${threadId}`);
      toast.success("Thread deleted");
      setActiveThread(null);
      loadThreads();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const resetPassword = async (userId, name) => {
    if (!window.confirm(`Reset password for ${name}?`)) return;
    try {
      const r = await axios.post(`${API}/admin/users/${userId}/reset-password`);
      toast.success(`Temporary password: ${r.data.temp_password}`, { duration: 10000 });
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const displayThreads = showArchived ? archivedThreads : threads;

  return (
    <div className="space-y-4" data-testid="messages-tab">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="font-bold text-[#050A30] dark:text-white text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>Admin Messaging</h3>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowArchived(!showArchived); setActiveThread(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold border-2 transition-colors ${showArchived ? "bg-slate-600 text-white border-slate-600" : "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
            data-testid="toggle-archived-btn">
            <Filter className="w-4 h-4" /> {showArchived ? "Active" : `Archived (${archivedThreads.length})`}
          </button>
          {!showArchived && (
            <button onClick={() => setShowCompose(!showCompose)}
              className="flex items-center gap-2 bg-[#0000FF] text-white px-4 py-2.5 rounded-xl font-bold hover:bg-blue-700"
              data-testid="compose-message-btn">
              <Plus className="w-4 h-4" /> Compose
            </button>
          )}
        </div>
      </div>

      {showCompose && (
        <div className="card p-5 border-2 border-[#0000FF]">
          <h4 className="font-bold text-[#050A30] dark:text-white mb-4">New Message</h4>
          <div className="space-y-3">
            <select value={compose.recipient_id} onChange={e => setCompose(c => ({ ...c, recipient_id: e.target.value }))}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
              data-testid="compose-recipient">
              <option value="">Select recipient...</option>
              {users.filter(u => !["admin", "super_admin"].includes(u.role)).map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
            <input type="text" placeholder="Subject" value={compose.subject} onChange={e => setCompose(c => ({ ...c, subject: e.target.value }))}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
              data-testid="compose-subject" />
            <textarea rows={4} placeholder="Message body..." value={compose.body} onChange={e => setCompose(c => ({ ...c, body: e.target.value }))}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
              data-testid="compose-body" />
            <div className="flex gap-2">
              <button onClick={sendMessage} disabled={sending}
                className="flex items-center gap-2 bg-[#0000FF] text-white px-5 py-2.5 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-60"
                data-testid="send-message-btn">
                {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
                Send
              </button>
              <button onClick={() => setShowCompose(false)} className="px-5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg font-semibold text-slate-500">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Thread list */}
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <h4 className="font-semibold text-[#050A30] dark:text-white">
              {showArchived ? `Archived (${archivedThreads.length})` : `All Threads (${threads.length})`}
            </h4>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {displayThreads.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">
                {showArchived ? "No archived messages" : "No messages yet"}
              </div>
            ) : displayThreads.map(t => (
              <button key={t.id} onClick={() => openThread(t)}
                className={`w-full text-left p-4 border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${activeThread?.thread_id === t.thread_id ? "bg-blue-50 dark:bg-blue-950" : ""}`}
                data-testid={`message-thread-${t.id}`}>
                <div className="flex justify-between items-start mb-1">
                  <p className="font-semibold text-sm text-[#050A30] dark:text-white truncate">{t.subject}</p>
                  {!t.read && !showArchived && <span className="w-2 h-2 rounded-full bg-[#0000FF] ml-2 flex-shrink-0 mt-1" />}
                  {showArchived && <span className="text-xs text-slate-400 flex-shrink-0 ml-2">archived</span>}
                </div>
                <p className="text-xs text-slate-500 mb-1">To: {t.recipient_name}</p>
                <p className="text-xs text-slate-400 truncate">{t.body}</p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-slate-400">{new Date(t.created_at).toLocaleDateString()}</p>
                  <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                    {!showArchived ? (
                      <>
                        <button onClick={() => archiveThread(t.thread_id)}
                          className="flex items-center gap-1 text-xs text-slate-500 hover:text-amber-600"
                          data-testid={`archive-thread-${t.thread_id}`} title="Archive">
                          <Filter className="w-3 h-3" /> Archive
                        </button>
                        <button onClick={() => resetPassword(t.recipient_id, t.recipient_name)}
                          className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800"
                          data-testid={`reset-password-${t.recipient_id}`}>
                          <Key className="w-3 h-3" /> Reset Pwd
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => unarchiveThread(t.thread_id)}
                          className="flex items-center gap-1 text-xs text-[#0000FF] hover:text-blue-800"
                          data-testid={`unarchive-thread-${t.thread_id}`}>
                          <RefreshCw className="w-3 h-3" /> Restore
                        </button>
                        <button onClick={() => deleteThread(t.thread_id)}
                          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                          data-testid={`delete-thread-${t.thread_id}`}>
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Thread view */}
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <h4 className="font-semibold text-[#050A30] dark:text-white">{activeThread ? activeThread.subject : "Select a thread"}</h4>
            {activeThread && !showArchived && (
              <button onClick={() => archiveThread(activeThread.thread_id)}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-amber-600 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded-lg"
                data-testid="archive-active-thread-btn">
                <Filter className="w-3 h-3" /> Archive
              </button>
            )}
          </div>
          {!activeThread ? (
            <div className="p-10 text-center text-slate-400 text-sm">Click a thread to view it</div>
          ) : (
            <div className="flex flex-col h-80">
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-xl">
                  <p className="text-xs text-slate-500 mb-1 font-semibold">Admin — {new Date(activeThread.created_at).toLocaleString()}</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{activeThread.body}</p>
                </div>
                {(activeThread.replies || []).map(r => (
                  <div key={r.id} className={`p-3 rounded-xl ${r.sender_role === "admin" || r.sender_role === "super_admin" ? "bg-blue-50 dark:bg-blue-950" : "bg-slate-100 dark:bg-slate-800 ml-4"}`}>
                    <p className="text-xs text-slate-500 mb-1 font-semibold">{r.sender_name} — {new Date(r.created_at).toLocaleString()}</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{r.body}</p>
                  </div>
                ))}
              </div>
              <div className="p-3 border-t border-slate-100 dark:border-slate-700 flex gap-2">
                <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)}
                  placeholder="Type reply..." onKeyDown={e => e.key === "Enter" && sendReply()}
                  className="flex-1 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  data-testid="admin-reply-input" />
                <button onClick={sendReply} disabled={sending}
                  className="bg-[#0000FF] text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
                  data-testid="admin-reply-send">
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reset password section */}
      <div className="card p-5">
        <h4 className="font-bold text-[#050A30] dark:text-white mb-3 flex items-center gap-2">
          <Key className="w-4 h-4 text-amber-500" /> Reset User Password
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-slate-600 dark:text-slate-400">Name</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-600 dark:text-slate-400">Email</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-600 dark:text-slate-400">Role</th>
                <th className="text-right px-3 py-2 font-semibold text-slate-600 dark:text-slate-400">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.filter(u => !["admin", "super_admin"].includes(u.role)).slice(0, 10).map(u => (
                <tr key={u.id}>
                  <td className="px-3 py-2 font-semibold text-[#050A30] dark:text-white">{u.name}</td>
                  <td className="px-3 py-2 text-slate-500">{u.email}</td>
                  <td className="px-3 py-2 capitalize text-slate-500">{u.role}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => resetPassword(u.id, u.name)}
                      className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-semibold ml-auto"
                      data-testid={`reset-pwd-user-${u.id}`}>
                      <Key className="w-3 h-3" /> Reset
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


// ─── Verified Contractors Admin Section ───────────────────────────────────────

function VerifiedContractorsAdminSection() {
  const [contractors, setContractors] = useState([]);
  const [allContractors, setAllContractors] = useState([]);
  const [feeSettings, setFeeSettings] = useState({ verified_contractor_fee: 39.99, verified_page_header: "FIND VERIFIED CONTRACTORS", verified_page_tagline: "For property owners, apartments and home owners." });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revokeNote, setRevokeNote] = useState("");
  const [revoking, setRevoking] = useState(false);

  const loadData = () => {
    Promise.all([
      axios.get(`${API}/admin/verified-contractors`).then(r => { setContractors(r.data); setAllContractors(r.data); }).catch(() => {}),
      axios.get(`${API}/admin/settings/verified-contractor-fee`).then(r => setFeeSettings(r.data)).catch(() => {})
    ]).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const saveFeeSettings = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/admin/settings/verified-contractor-fee`, { fee: feeSettings.verified_contractor_fee, header: feeSettings.verified_page_header, tagline: feeSettings.verified_page_tagline });
      toast.success("Verified contractor settings saved!");
    } catch { toast.error("Failed to save"); }
    setSaving(false);
  };

  const grantVerified = async (userId) => {
    try {
      await axios.put(`${API}/admin/verified-contractors/${userId}`, { is_verified_contractor: true });
      setContractors(cs => cs.map(c => c.id === userId ? { ...c, is_verified_contractor: true } : c));
      toast.success("Verified status granted!");
    } catch { toast.error("Failed"); }
  };

  const openRevokeModal = (contractor) => {
    setRevokeTarget(contractor);
    setRevokeNote("");
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await axios.put(`${API}/admin/verified-contractors/${revokeTarget.id}`, {
        is_verified_contractor: false,
        revoke_note: revokeNote.trim()
      });
      setContractors(cs => cs.map(c => c.id === revokeTarget.id ? { ...c, is_verified_contractor: false } : c));
      toast.success(`Verified status revoked for ${revokeTarget.company_name || revokeTarget.name}. Revocation email sent.`);
      setRevokeTarget(null);
      setRevokeNote("");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to revoke"); }
    setRevoking(false);
  };

  return (
    <div className="mt-6 space-y-6" data-testid="verified-contractors-admin">
      {/* Revoke Modal */}
      {revokeTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-6" data-testid="revoke-modal">
            <h3 className="font-extrabold text-[#050A30] dark:text-white text-lg mb-2" style={{ fontFamily: "Manrope, sans-serif" }}>
              Revoke Verified Status
            </h3>
            <p className="text-slate-500 text-sm mb-4">
              Revoking verification for <strong className="text-[#050A30] dark:text-white">{revokeTarget.company_name || revokeTarget.name}</strong>. A revocation email will be sent to the contractor.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Reason / Note <span className="text-slate-400">(optional — included in email)</span></label>
              <textarea
                value={revokeNote}
                onChange={e => setRevokeNote(e.target.value)}
                rows={3}
                placeholder="e.g. Account flagged for policy violation..."
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-red-400 dark:bg-slate-800 dark:text-white"
                data-testid="revoke-note-input"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setRevokeTarget(null); setRevokeNote(""); }}
                className="flex-1 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 py-2.5 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
                data-testid="cancel-revoke-btn">
                Cancel
              </button>
              <button onClick={confirmRevoke} disabled={revoking}
                className="flex-1 bg-red-500 text-white py-2.5 rounded-xl font-bold hover:bg-red-600 disabled:opacity-60"
                data-testid="confirm-revoke-btn">
                {revoking ? "Revoking..." : "Revoke Verified"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CMS Settings */}
      <div className="card p-6 max-w-xl">
        <h3 className="font-bold text-[#050A30] dark:text-white text-lg mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>Verified Contractors Page</h3>
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1">Page Header</label>
            <input type="text" value={feeSettings.verified_page_header} onChange={e => setFeeSettings(s => ({ ...s, verified_page_header: e.target.value }))}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
              data-testid="verified-page-header-input" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1">Page Tagline</label>
            <input type="text" value={feeSettings.verified_page_tagline} onChange={e => setFeeSettings(s => ({ ...s, verified_page_tagline: e.target.value }))}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
              data-testid="verified-page-tagline-input" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1">Verification Fee ($)</label>
            <input type="number" step="0.01" value={feeSettings.verified_contractor_fee} onChange={e => setFeeSettings(s => ({ ...s, verified_contractor_fee: parseFloat(e.target.value) }))}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
              data-testid="verified-fee-input" />
            <p className="text-xs text-slate-400 mt-1">One-time fee contractors pay to get "Verified" status</p>
          </div>
        </div>
        <button onClick={saveFeeSettings} disabled={saving}
          className="bg-[#0000FF] text-white px-5 py-2.5 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-60"
          data-testid="save-verified-settings-btn">
          {saving ? "Saving..." : "Save Verified Settings"}
        </button>
      </div>

      {/* Verified Contractors List */}
      <div className="card p-6">
        <h3 className="font-bold text-[#050A30] dark:text-white text-lg mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>
          Verified Contractors ({contractors.filter(c => c.is_verified_contractor).length} of {contractors.length})
        </h3>
        {loading ? (
          <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0000FF]" /></div>
        ) : contractors.length === 0 ? (
          <p className="text-slate-400 text-sm">No contractors yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">Name</th>
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">Trade</th>
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">Location</th>
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">Actions</th>
              </tr></thead>
              <tbody>
                {contractors.map(c => (
                  <tr key={c.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2.5 font-medium text-[#050A30] dark:text-white">{c.company_name || c.name}</td>
                    <td className="py-2.5 text-slate-500">{c.trade || "—"}</td>
                    <td className="py-2.5 text-slate-500">{c.location?.city ? `${c.location.city}, ${c.location.state}` : "—"}</td>
                    <td className="py-2.5">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${c.is_verified_contractor ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                        {c.is_verified_contractor ? "Verified" : "Not Verified"}
                      </span>
                      {c.verified_revoke_note && (
                        <p className="text-xs text-red-400 mt-0.5 max-w-[180px] truncate" title={c.verified_revoke_note}>
                          Note: {c.verified_revoke_note}
                        </p>
                      )}
                    </td>
                    <td className="py-2.5">
                      {c.is_verified_contractor ? (
                        <button onClick={() => openRevokeModal(c)}
                          className="px-3 py-1 rounded-lg text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors"
                          data-testid={`revoke-verified-${c.id}`}>
                          Revoke
                        </button>
                      ) : (
                        <button onClick={() => grantVerified(c.id)}
                          className="px-3 py-1 rounded-lg text-xs font-bold bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-colors"
                          data-testid={`grant-verified-${c.id}`}>
                          Grant
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Main Admin Dashboard ─────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const [tab, setTab] = useState("Overview");
  const [analytics, setAnalytics] = useState(null);
  const [users, setUsers] = useState([]);
  const [userPage, setUserPage] = useState(1);
  const [userTotal, setUserTotal] = useState(0);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState("");
  const [payments, setPayments] = useState([]);
  const [settings, setSettings] = useState(null);
  const [editSettings, setEditSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [viewUserId, setViewUserId] = useState(null);

  const allTabs = isSuperAdmin
    ? [...ADMIN_TABS, ...SUPER_ADMIN_TABS]
    : ADMIN_TABS;

  const fetchAnalytics = useCallback(async () => {
    const res = await axios.get(`${API}/admin/analytics`);
    setAnalytics(res.data);
  }, []);

  const fetchUsers = useCallback(async (pg = 1, search = "", role = "", status = "") => {
    const params = new URLSearchParams({ page: pg, limit: 15 });
    if (search) params.append("search", search);
    if (role) params.append("role", role);
    if (status) params.append("status", status);
    const res = await axios.get(`${API}/admin/users?${params}`);
    setUsers(res.data.users);
    setUserTotal(res.data.total);
  }, []);

  const fetchPayments = useCallback(async () => {
    const res = await axios.get(`${API}/admin/payments`);
    setPayments(res.data.payments || []);
  }, []);

  const fetchSettings = useCallback(async () => {
    const res = await axios.get(`${API}/admin/settings`);
    setSettings(res.data);
    setEditSettings(res.data);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        await fetchAnalytics();
        if (tab === "Users") await fetchUsers(userPage, userSearch, userRoleFilter, userStatusFilter);
        if (tab === "Payments") await fetchPayments();
        if (tab === "Settings") await fetchSettings();
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [tab]);

  const suspendUser = async (userId, isActive) => {
    try {
      await axios.post(`${API}/admin/users/${userId}/${isActive ? "suspend" : "activate"}`);
      toast.success(isActive ? "User suspended" : "User activated");
      fetchUsers(userPage, userSearch, userRoleFilter, userStatusFilter);
    } catch (e) { toast.error(e.response?.data?.detail || "Action failed"); }
  };

  const deleteUser = async (userId) => {
    if (!window.confirm("Delete this user permanently?")) return;
    try {
      await axios.delete(`${API}/admin/users/${userId}`);
      toast.success("User deleted");
      fetchUsers(userPage, userSearch, userRoleFilter, userStatusFilter);
    } catch (e) { toast.error(e.response?.data?.detail || "Delete failed"); }
  };

  const saveSettings = async () => {
    await axios.put(`${API}/admin/settings`, editSettings);
    toast.success("Settings saved");
    setSettings(editSettings);
  };

  const statCards = analytics ? [
    { label: "Total Users", value: analytics.total_users, icon: Users, color: "#0000FF", bg: "#EEF2FF" },
    { label: "Active Jobs", value: analytics.active_jobs, icon: Briefcase, color: "#10B981", bg: "#ECFDF5" },
    { label: "Completed Jobs", value: analytics.completed_jobs, icon: TrendingUp, color: "#F59E0B", bg: "#FFFBEB" },
    { label: "Revenue", value: `$${analytics.total_revenue?.toFixed(2)}`, icon: DollarSign, color: "#8B5CF6", bg: "#F5F3FF" },
    { label: "Active Subs", value: analytics.active_subscriptions, icon: CheckCircle, color: "#10B981", bg: "#ECFDF5" },
    { label: "Expired Subs", value: analytics.expired_subscriptions, icon: AlertTriangle, color: "#EF4444", bg: "#FEF2F2" },
    { label: "Suspended", value: analytics.suspended_users, icon: Lock, color: "#F59E0B", bg: "#FFFBEB" },
    { label: "Total Admins", value: analytics.admin_count, icon: Shield, color: "#8B5CF6", bg: "#F5F3FF" },
  ] : [];

  const pieData = analytics ? [
    { name: "Crew", value: analytics.crew_count },
    { name: "Contractors", value: analytics.contractor_count },
    { name: "Active Sub", value: analytics.active_subscriptions },
    { name: "Trial", value: analytics.trial_subscriptions },
    { name: "Expired", value: analytics.expired_subscriptions },
  ] : [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617]" style={{ fontFamily: "Inter, sans-serif" }}>
      <Navbar />

      {viewUserId && <UserProfileModal userId={viewUserId} onClose={() => setViewUserId(null)} />}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Admin Dashboard</h1>
            <p className="text-slate-500 text-sm">Platform management &amp; analytics</p>
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin ? (
              <div className="flex items-center gap-2 bg-purple-50 dark:bg-purple-900/20 px-3 py-1.5 rounded-lg">
                <Crown className="w-4 h-4 text-purple-600" />
                <span className="text-purple-700 font-semibold text-sm">Super Admin</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-lg">
                <Shield className="w-4 h-4 text-red-500" />
                <span className="text-red-600 font-semibold text-sm">Admin</span>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1 mb-6 overflow-x-auto">
          {allTabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold text-sm transition-colors whitespace-nowrap ${tab === t.id ? "bg-[#050A30] text-white" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
              data-testid={`admin-tab-${t.id.toLowerCase()}`}>
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {tab === "Overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map(card => (
                <StatCard key={card.label} {...card} />
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="card p-6">
                <h3 className="font-bold text-[#050A30] dark:text-white mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>User Distribution</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData.filter(d => d.value > 0)} cx="50%" cy="50%" outerRadius={75} dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="card p-6">
                <h3 className="font-bold text-[#050A30] dark:text-white mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>Recent Users</h3>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {analytics?.recent_users?.map(u => (
                    <button key={u.id} onClick={() => setViewUserId(u.id)}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 w-full text-left">
                      <div className="w-8 h-8 bg-[#0000FF] rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {u.name?.[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#050A30] dark:text-white truncate">{u.name}</p>
                        <p className="text-xs text-slate-500 capitalize">{u.role}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${u.subscription_status === "trial" ? "bg-blue-100 text-blue-700" : u.subscription_status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                        {u.subscription_status}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Users ── */}
        {tab === "Users" && (
          <div>
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="relative flex-1 min-w-48">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input type="text" placeholder="Search users..." value={userSearch}
                  onChange={e => { setUserSearch(e.target.value); fetchUsers(1, e.target.value, userRoleFilter, userStatusFilter); }}
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  data-testid="admin-user-search" />
              </div>
              <select value={userRoleFilter} onChange={e => { setUserRoleFilter(e.target.value); fetchUsers(1, userSearch, e.target.value, userStatusFilter); }}
                className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none dark:bg-slate-800 dark:text-white">
                <option value="">All Roles</option>
                <option value="crew">Crew</option>
                <option value="contractor">Contractor</option>
                <option value="admin">Admin</option>
                {isSuperAdmin && <option value="super_admin">Super Admin</option>}
              </select>
              <select value={userStatusFilter} onChange={e => { setUserStatusFilter(e.target.value); fetchUsers(1, userSearch, userRoleFilter, e.target.value); }}
                className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none dark:bg-slate-800 dark:text-white">
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>

            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">User</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Role</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Status</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Subscription</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Points</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {users.map(u => (
                      <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50" data-testid={`admin-user-row-${u.id}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${u.role === "super_admin" ? "bg-purple-600" : u.role === "admin" ? "bg-red-500" : "bg-[#050A30]"}`}>
                              {u.name?.[0]?.toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-[#050A30] dark:text-white">{u.name}</p>
                              <p className="text-xs text-slate-500">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`capitalize px-2 py-0.5 rounded-full text-xs font-semibold ${u.role === "super_admin" ? "bg-purple-100 text-purple-700" : u.role === "admin" ? "bg-red-100 text-red-600" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"}`}>
                            {u.role.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                            {u.is_active ? "Active" : "Suspended"}
                          </span>
                        </td>
                        <td className="px-4 py-3"><span className="text-xs capitalize">{u.subscription_status}</span></td>
                        <td className="px-4 py-3"><span className="text-xs font-semibold">{u.points || 0}</span></td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setViewUserId(u.id)} className="p-1.5 rounded text-blue-500 hover:bg-blue-50" title="View Profile" data-testid={`view-user-${u.id}`}>
                              <Eye className="w-4 h-4" />
                            </button>
                            {u.role !== "super_admin" && !(u.role === "admin" && !isSuperAdmin) && (
                              <>
                                <button onClick={() => suspendUser(u.id, u.is_active)}
                                  className={`p-1.5 rounded ${u.is_active ? "text-red-500 hover:bg-red-50" : "text-green-500 hover:bg-green-50"}`}
                                  title={u.is_active ? "Suspend" : "Activate"} data-testid={`admin-${u.is_active ? "suspend" : "activate"}-${u.id}`}>
                                  {u.is_active ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                                </button>
                                <button onClick={() => deleteUser(u.id)} className="p-1.5 rounded text-red-500 hover:bg-red-50" title="Delete" data-testid={`admin-delete-user-${u.id}`}>
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800">
                <p className="text-sm text-slate-500">Showing {users.length} of {userTotal}</p>
                <div className="flex gap-2">
                  <button onClick={() => { const np = Math.max(1, userPage - 1); setUserPage(np); fetchUsers(np, userSearch, userRoleFilter, userStatusFilter); }} disabled={userPage === 1} className="p-1.5 rounded border border-slate-200 disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
                  <span className="px-3 py-1 text-sm">{userPage}</span>
                  <button onClick={() => { const np = userPage + 1; setUserPage(np); fetchUsers(np, userSearch, userRoleFilter, userStatusFilter); }} disabled={userPage * 15 >= userTotal} className="p-1.5 rounded border border-slate-200 disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Jobs ── */}
        {tab === "Jobs" && <JobsTab />}

        {/* ── Payments ── */}
        {tab === "Payments" && (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">ID</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Amount</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Plan</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Method</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {payments.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 font-mono text-xs">{p.id?.slice(0, 8)}</td>
                      <td className="px-4 py-3 font-bold">${p.amount?.toFixed(2)}</td>
                      <td className="px-4 py-3 capitalize">{p.plan}</td>
                      <td className="px-4 py-3 capitalize">{p.payment_method}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.payment_status === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {p.payment_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{new Date(p.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {payments.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No payments yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Trades ── */}
        {tab === "Trades" && <TradesTab />}

        {/* ── CMS ── */}
        {tab === "CMS" && <CMSTab />}

        {/* ── Ads ── */}
        {tab === "Ads" && <AdsTab />}

        {/* ── Map ── */}
        {tab === "Map" && <MapTab />}

        {/* ── Email ── */}
        {tab === "Email" && <BulkEmailTab />}

        {/* ── Messages ── */}
        {tab === "Messages" && <AdminMessagesTab />}

        {/* ── Coupons ── */}
        {tab === "Coupons" && <CouponsTab />}

        {/* ── Activity Log ── */}
        {tab === "Activity" && <ActivityLogTab />}

        {/* ── Settings ── */}
        {tab === "Settings" && settings && (
          <div className="card p-6 max-w-xl">
            <h3 className="font-bold text-[#050A30] dark:text-white text-lg mb-5" style={{ fontFamily: "Manrope, sans-serif" }}>Subscription Pricing</h3>
            <div className="space-y-4 mb-6">
              {[["daily_price", "Daily Pass Price ($)"], ["weekly_price", "Weekly Pass Price ($)"], ["monthly_price", "Monthly Pass Price ($)"]].map(([key, label]) => (
                <div key={key}>
                  <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">{label}</label>
                  <input type="number" step="0.01" value={editSettings[key] || ""}
                    onChange={e => setEditSettings(s => ({ ...s, [key]: parseFloat(e.target.value) }))}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                    data-testid={`settings-${key}`} />
                </div>
              ))}
              {[["trial_days", "Free Trial Duration (days)"], ["job_visibility_hours", "Job Visibility (hours)"]].map(([key, label]) => (
                <div key={key}>
                  <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">{label}</label>
                  <input type="number" value={editSettings[key] || ""}
                    onChange={e => setEditSettings(s => ({ ...s, [key]: parseInt(e.target.value) }))}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                    data-testid={`settings-${key}`} />
                </div>
              ))}

              <div>
                <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Emergency Job Price ($)</label>
                <input type="number" step="0.01" value={editSettings.emergency_job_price || ""}
                  onChange={e => setEditSettings(s => ({ ...s, emergency_job_price: parseFloat(e.target.value) }))}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  data-testid="settings-emergency-price" />
                <p className="text-xs text-slate-400 mt-1">One-time fee required for contractors to post emergency jobs</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Login Page Message</label>
                <textarea value={editSettings.login_message || ""}
                  onChange={e => setEditSettings(s => ({ ...s, login_message: e.target.value }))}
                  rows={2}
                  placeholder="Optional message shown on login page..."
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  data-testid="settings-login-message" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Footer Text</label>
                <input type="text" value={editSettings.footer_text || ""}
                  onChange={e => setEditSettings(s => ({ ...s, footer_text: e.target.value }))}
                  placeholder="Footer text..."
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  data-testid="settings-footer-text" />
              </div>
            </div>
            <button onClick={saveSettings} className="bg-[#0000FF] text-white px-6 py-2.5 rounded-lg font-bold hover:bg-blue-700" data-testid="save-settings-btn">
              Save Settings
            </button>
          </div>
        )}

        {/* ── Verified Contractors Admin ── */}
        {tab === "Settings" && <VerifiedContractorsAdminSection />}

        {/* ── Export/Import (Super Admin) ── */}
        {tab === "Export" && <ExportTab />}
      </div>
    </div>
  );
}
