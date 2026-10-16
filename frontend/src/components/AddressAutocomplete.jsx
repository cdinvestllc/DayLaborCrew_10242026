import React, { useRef, useState } from "react";
import axios from "axios";
import { MapPin } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Address input with server-side autocomplete; onSelect receives {address, lat, lng, city, state}.
export default function AddressAutocomplete({ value, onChange, onSelect, placeholder = "Enter an address...", testId = "address-input", required = false }) {
  const [suggestions, setSuggestions] = useState([]);
  const [show, setShow] = useState(false);
  const timerRef = useRef(null);

  const search = async (q) => {
    if (q.trim().length < 3) { setSuggestions([]); return; }
    try {
      const res = await axios.get(`${API}/public/geocode/search`, { params: { q } });
      setSuggestions(res.data || []);
      setShow(true);
    } catch { setSuggestions([]); }
  };

  const handleChange = (e) => {
    onChange(e.target.value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(e.target.value), 350);
  };

  const pick = (item) => {
    onChange(item.address);
    onSelect(item);
    setSuggestions([]);
    setShow(false);
  };

  return (
    <div className="relative">
      <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
      <input type="text" value={value} onChange={handleChange} required={required} autoComplete="off"
        onFocus={() => suggestions.length > 0 && setShow(true)}
        onBlur={() => setTimeout(() => setShow(false), 200)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0000FF] bg-white dark:bg-slate-800 dark:text-white"
        data-testid={testId} />
      {show && suggestions.length > 0 && (
        <div className="absolute z-30 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-48 overflow-y-auto" data-testid={`${testId}-suggestions`}>
          {suggestions.map((s, i) => (
            <button key={`${s.lat},${s.lng},${i}`} type="button" onMouseDown={() => pick(s)}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-200"
              data-testid={`${testId}-suggestion-${i}`}>
              <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              {s.address}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
