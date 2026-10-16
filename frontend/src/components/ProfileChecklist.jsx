import React from "react";
import { CheckCircle2, Circle } from "lucide-react";

export function profileChecklist(user) {
  if (!user) return [];
  const isCrew = user.role === "crew";
  const hasCoords = user.location?.lat !== undefined && user.location?.lat !== null;
  const items = [
    { key: "photo", label: isCrew ? "Profile photo" : "Logo or photo", done: !!(user.profile_photo || user.logo) },
    { key: "phone", label: "Phone number", done: !!user.phone },
    { key: "location", label: "Address / location", done: !!(user.address || hasCoords) },
    { key: "bio", label: "Short bio", done: !!user.bio?.trim() },
    isCrew ? { key: "trade", label: "Primary trade", done: !!user.trade } : { key: "company", label: "Company name", done: !!user.company_name },
    { key: "portfolio", label: "At least one portfolio photo", done: (user.portfolio || []).length > 0 },
  ];
  if (isCrew) {
    items.push({ key: "skills", label: "Skills", done: (user.skills || []).length > 0 });
    items.push({ key: "transportation", label: "Transportation", done: !!user.transportation });
  }
  return items;
}

export default function ProfileChecklist({ user, onEdit }) {
  const items = profileChecklist(user);
  const done = items.filter(i => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const missing = items.filter(i => !i.done);
  return (
    <div className="mt-4 text-left" data-testid="profile-checklist">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-600 dark:text-slate-300">Profile Completion</span>
        <span className="font-semibold text-[#0000FF] dark:text-[#7EC8E3]" data-testid="profile-completion-pct">{pct}%</span>
      </div>
      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
        <div className="bg-[#0000FF] h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      {missing.length > 0 && (
        <ul className="mt-3 space-y-1">
          {items.map(i => (
            <li key={i.key} className={`flex items-center gap-2 text-xs ${i.done ? "text-slate-400 line-through" : "text-slate-700 dark:text-slate-200"}`} data-testid={`checklist-${i.key}`}>
              {i.done ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Circle className="w-3.5 h-3.5 text-slate-400" />}
              {i.label}
            </li>
          ))}
          {onEdit && (
            <li><button type="button" onClick={onEdit} className="mt-1 text-xs font-semibold text-[#0000FF] dark:text-[#7EC8E3] underline" data-testid="checklist-edit-btn">Complete my profile</button></li>
          )}
        </ul>
      )}
    </div>
  );
}
