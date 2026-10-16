import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { MapPin, List, Map as MapIcon, Search, Shield, Star, CheckCircle, X } from "lucide-react";
import Navbar from "../components/Navbar";
import { US_STATES } from "../lib/usStates";
import { toLngLat } from "../lib/media";
import SafeImage from "../components/SafeImage";
import { resolveImageUrl } from "../lib/media";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TRADES = [
  "All Trades", "General Labor", "Carpentry", "Electrical", "Plumbing", "HVAC",
  "Painting", "Roofing", "Landscaping", "Concrete/Masonry", "Welding",
  "Flooring", "Drywall", "Demolition", "Moving/Hauling", "Cleaning",
  "Fencing", "Tile Work", "Insulation", "Glass/Windows", "Other"
];

function ContractorCard({ c, onClick, selected }) {
  const name = c.company_name || c.name;
  const initials = name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <button
      onClick={() => onClick(c)}
      data-testid={`verified-contractor-card-${c.id}`}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${selected ? "border-[#0000FF] bg-blue-50 dark:bg-blue-950" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-[#0000FF]/50"}`}>
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-[#050A30] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {c.logo || c.profile_photo
            ? <SafeImage src={resolveImageUrl(c.logo || c.profile_photo)} alt={name} className="w-full h-full object-cover rounded-xl" />
            : initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-[#050A30] dark:text-white text-sm truncate">{name}</p>
            <span className="inline-flex items-center gap-1 bg-[#0000FF] text-white text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0">
              <CheckCircle className="w-3 h-3" /> Verified
            </span>
          </div>
          <p className="text-xs text-[#0000FF] font-semibold">{c.trade || "General Labor"}</p>
          <div className="flex items-center gap-3 mt-1">
            {c.rating > 0 && (
              <span className="flex items-center gap-1 text-amber-500 text-xs font-semibold">
                <Star className="w-3 h-3 fill-current" /> {c.rating?.toFixed(1)}
              </span>
            )}
            {c.location?.city && (
              <span className="flex items-center gap-1 text-slate-500 text-xs">
                <MapPin className="w-3 h-3" /> {c.location.city}, {c.location.state}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function ContractorSidebar({ contractor, onClose }) {
  if (!contractor) return null;
  const name = contractor.company_name || contractor.name;
  const initials = name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-96 bg-white dark:bg-slate-900 shadow-2xl z-50 overflow-y-auto" data-testid="contractor-sidebar">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-extrabold text-[#050A30] dark:text-white text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>Contractor Profile</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" data-testid="close-sidebar-btn"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-2xl bg-[#050A30] flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
            {contractor.logo || contractor.profile_photo
              ? <SafeImage src={resolveImageUrl(contractor.logo || contractor.profile_photo)} alt={name} className="w-full h-full object-cover rounded-2xl" />
              : initials}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-extrabold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>{name}</p>
              <span className="inline-flex items-center gap-1 bg-[#0000FF] text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                <CheckCircle className="w-3 h-3" /> Verified Contractor
              </span>
            </div>
            <p className="text-[#0000FF] text-sm font-semibold">{contractor.trade || "General Labor"}</p>
          </div>
        </div>

        {contractor.bio && <p className="text-slate-600 dark:text-slate-300 text-sm mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">{contractor.bio}</p>}

        <div className="space-y-2 mb-4">
          {contractor.rating > 0 && (
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500 fill-current" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{contractor.rating?.toFixed(1)} rating ({contractor.rating_count || 0} reviews)</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-green-500" />
            <span className="text-sm text-slate-700 dark:text-slate-300">{contractor.jobs_completed || 0} jobs completed</span>
          </div>
          {contractor.location?.city && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-slate-700 dark:text-slate-300">{contractor.location.city}, {contractor.location.state}</span>
            </div>
          )}
        </div>

        {contractor.skills?.length > 0 && (
          <div className="mb-4">
            <p className="font-semibold text-[#050A30] dark:text-white text-sm mb-2">Skills</p>
            <div className="flex flex-wrap gap-1.5">
              {contractor.skills.map(s => (
                <span key={s} className="bg-blue-50 dark:bg-blue-950 text-[#0000FF] px-2 py-1 rounded-full text-xs font-semibold">{s}</span>
              ))}
            </div>
          </div>
        )}

        {contractor.portfolio?.length > 0 && (
          <div className="mb-4">
            <p className="font-semibold text-[#050A30] dark:text-white text-sm mb-2">Portfolio</p>
            <div className="grid grid-cols-3 gap-1.5">
              {contractor.portfolio.slice(0, 6).map((url, i) => (
                <a key={i} href={resolveImageUrl(url)} target="_blank" rel="noreferrer">
                  <SafeImage src={resolveImageUrl(url)} alt={`Work ${i + 1}`} className="aspect-square w-full object-cover rounded-lg" />
                </a>
              ))}
            </div>
          </div>
        )}

        <a href={`/profile/${contractor.id}`} target="_blank" rel="noreferrer"
          className="w-full block text-center bg-[#0000FF] text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors"
          data-testid="view-full-profile-btn">
          View Full Profile
        </a>
      </div>
    </div>
  );
}

function MapView({ contractors, onSelect, selected }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);
  const libRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      await import("maplibre-gl/dist/maplibre-gl.css");
      if (cancelled || !mapRef.current || mapInstance.current) return;
      libRef.current = maplibregl;
      const map = new maplibregl.Map({
        container: mapRef.current,
        style: {
          version: 8,
          sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256,
            attribution: "© <a href='https://www.openstreetmap.org/copyright' target='_blank'>OpenStreetMap</a> contributors" } },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
        center: [-98.5795, 39.8283],
        zoom: 3.5,
        maxBounds: [[-179.9, -85], [179.9, 85]], // full 360° span crashes maplibre 5.x
      });
      map.addControl(new maplibregl.NavigationControl(), "top-right");
      map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }), "top-right");
      map.on("load", () => { map.resize(); setReady(true); });
      mapInstance.current = map;
    })().catch(err => console.error("Map failed to initialise", err));
    return () => {
      cancelled = true;
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
    };
  }, []);

  useEffect(() => {
    const map = mapInstance.current;
    const maplibregl = libRef.current;
    if (!ready || !map || !maplibregl) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    const bounds = new maplibregl.LngLatBounds();
    contractors.forEach(c => {
      const lngLat = toLngLat(c.location);
      if (!lngLat) return;
      const isSel = selected?.id === c.id;
      const label = document.createElement("button");
      label.type = "button";
      label.style.cssText = `background:${isSel ? "#0000FF" : "#050A30"};color:#fff;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:700;white-space:nowrap;border:2px solid ${isSel ? "#7EC8E3" : "#0000FF"};box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer`;
      label.textContent = c.company_name || c.name;
      label.setAttribute("data-testid", `verified-marker-${c.id}`);
      label.addEventListener("click", () => onSelect(c));
      markersRef.current.push(new maplibregl.Marker({ element: label }).setLngLat(lngLat).addTo(map));
      bounds.extend(lngLat);
    });
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, maxZoom: 11, duration: 600 });
  }, [ready, contractors, selected, onSelect]);

  return (
    <div ref={mapRef} className="w-full h-full min-h-[400px] rounded-xl overflow-hidden" data-testid="verified-map-view" />
  );
}

export default function VerifiedContractorsPage() {
  const [contractors, setContractors] = useState([]);
  const [pageSettings, setPageSettings] = useState({ verified_page_header: "FIND VERIFIED CONTRACTORS", verified_page_tagline: "For property owners, apartments and home owners." });
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("list");
  const [selectedState, setSelectedState] = useState("All States");
  const [selectedTrade, setSelectedTrade] = useState("All Trades");
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => { const t = setTimeout(() => setDebounced(query.trim()), 350); return () => clearTimeout(t); }, [query]);

  const onSelect = useCallback(c => setSelected(c), []);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedState !== "All States") params.state = selectedState;
      if (selectedTrade !== "All Trades") params.trade = selectedTrade;
      if (debounced) params.q = debounced;
      const [res, settings] = await Promise.all([
        axios.get(`${API}/public/verified-contractors`, { params }),
        axios.get(`${API}/public/verified-contractors/settings`)
      ]);
      setContractors(res.data.contractors || []);
      setPageSettings(settings.data);
    } catch { setContractors([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [selectedState, selectedTrade, debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617]" style={{ fontFamily: "Inter, sans-serif" }}>
      <Navbar />

      {/* Header */}
      <div className="bg-[#050A30] py-10 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-[#0000FF]/20 border border-[#0000FF]/40 rounded-full px-4 py-1.5 mb-4">
            <CheckCircle className="w-4 h-4 text-[#7EC8E3]" />
            <span className="text-[#7EC8E3] text-sm font-medium">Verified Professionals</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-3" style={{ fontFamily: "Manrope, sans-serif" }} data-testid="verified-page-header">
            {pageSettings.verified_page_header}
          </h1>
          <p className="text-[#7EC8E3] text-lg" data-testid="verified-page-tagline">{pageSettings.verified_page_tagline}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-16 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, trade or city"
              className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white text-slate-900 placeholder:text-slate-400 dark:bg-slate-800 dark:text-white focus:outline-none focus:border-[#0000FF]"
              data-testid="verified-search-input" />
          </div>
          <select value={selectedState} onChange={e => setSelectedState(e.target.value)}
            className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
            data-testid="state-filter">
            <option>All States</option>
            {(US_STATES || []).map(s => <option key={s.abbr} value={s.name}>{s.name}</option>)}
          </select>

          <select value={selectedTrade} onChange={e => setSelectedTrade(e.target.value)}
            className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
            data-testid="trade-filter">
            {TRADES.map(t => <option key={t}>{t}</option>)}
          </select>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-slate-500 text-sm font-semibold" data-testid="contractor-count">
              {loading ? "..." : `${contractors.length} contractor${contractors.length !== 1 ? "s" : ""} verified`}
            </span>
            <button onClick={() => setViewMode("list")}
              className={`p-2 rounded-lg transition-colors ${viewMode === "list" ? "bg-[#0000FF] text-white" : "text-slate-400 hover:text-[#0000FF]"}`}
              data-testid="list-view-btn">
              <List className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode("map")}
              className={`p-2 rounded-lg transition-colors ${viewMode === "map" ? "bg-[#0000FF] text-white" : "text-slate-400 hover:text-[#0000FF]"}`}
              data-testid="map-view-btn">
              <MapIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0000FF]" /></div>
        ) : contractors.length === 0 ? (
          <div className="text-center py-16">
            <Shield className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-600 dark:text-slate-400 mb-2">No verified contractors found</h3>
            <p className="text-slate-400">Try adjusting your filters or check back later.</p>
          </div>
        ) : viewMode === "list" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="contractor-list">
            {contractors.map(c => (
              <ContractorCard key={c.id} c={c} onClick={setSelected} selected={selected?.id === c.id} />
            ))}
          </div>
        ) : (
          <div className="h-[500px] rounded-xl overflow-hidden">
            <MapView contractors={contractors} onSelect={onSelect} selected={selected} />
          </div>
        )}
      </div>

      {/* Sidebar */}
      {selected && <ContractorSidebar contractor={selected} onClose={() => setSelected(null)} />}
      {selected && <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setSelected(null)} />}
    </div>
  );
}
