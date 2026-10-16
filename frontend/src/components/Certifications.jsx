import React, { useState } from "react";
import { Award, Plus, X } from "lucide-react";

const input = "w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 dark:bg-slate-800 dark:text-white";

export function CertificationsEditor({ value = [], onChange }) {
  const [draft, setDraft] = useState({ name: "", issuer: "", number: "", expires: "" });
  const add = () => {
    if (!draft.name.trim() || value.length >= 20) return;
    onChange([...value, { ...draft, name: draft.name.trim() }]);
    setDraft({ name: "", issuer: "", number: "", expires: "" });
  };
  return (
    <div data-testid="certifications-editor">
      <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-2">Licenses & Certifications</label>
      {value.map((c, i) => (
        <div key={`${c.name}-${i}`} className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2 mb-2 text-sm">
          <span className="text-slate-800 dark:text-slate-100">{c.name}{c.issuer ? ` · ${c.issuer}` : ""}{c.expires ? ` · exp ${c.expires}` : ""}</span>
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500" data-testid={`remove-cert-${i}`}><X className="w-4 h-4" /></button>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <input className={input} placeholder="Name (e.g. OSHA 10)" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} data-testid="cert-name-input" />
        <input className={input} placeholder="Issuer" value={draft.issuer} onChange={e => setDraft(d => ({ ...d, issuer: e.target.value }))} data-testid="cert-issuer-input" />
        <input className={input} placeholder="License # (optional)" value={draft.number} onChange={e => setDraft(d => ({ ...d, number: e.target.value }))} data-testid="cert-number-input" />
        <input className={input} type="date" value={draft.expires} onChange={e => setDraft(d => ({ ...d, expires: e.target.value }))} data-testid="cert-expires-input" />
      </div>
      <button type="button" onClick={add} disabled={!draft.name.trim()}
        className="mt-2 flex items-center gap-1 text-sm font-semibold text-[#0000FF] dark:text-[#7EC8E3] disabled:opacity-50" data-testid="add-cert-btn">
        <Plus className="w-4 h-4" /> Add certification
      </button>
    </div>
  );
}

export function CertificationsList({ items }) {
  if (!items?.length) return null;
  return (
    <div className="pt-2" data-testid="certifications-list">
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Licenses & Certifications</p>
      <div className="flex flex-wrap gap-2">
        {items.map((c, i) => (
          <span key={`${c.name}-${i}`} className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 rounded-full text-xs font-semibold">
            <Award className="w-3.5 h-3.5" />{c.name}{c.issuer ? ` · ${c.issuer}` : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
