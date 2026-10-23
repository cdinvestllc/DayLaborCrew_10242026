import React, { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Navigation } from "lucide-react";
import { resolveImageUrl, toLngLat, initials } from "../lib/media";

// Free OSM raster tiles — no API key required
const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© <a href='https://www.openstreetmap.org/copyright' target='_blank'>OpenStreetMap</a> contributors",
    },
  },
  layers: [{ id: "osm-tiles", type: "raster", source: "osm", minzoom: 0, maxzoom: 19 }],
};

const US_CENTER = [-95.7129, 37.0902];

// Haversine distance in miles
function haversine(lat1, lng1, lat2, lng2) {
  const R = 3959;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
export { haversine };

export function createRadiusGeoJSON(centerLngLat, radiusMiles, steps = 64) {
  const empty = { type: "FeatureCollection", features: [] };
  if (!Array.isArray(centerLngLat) || centerLngLat.length < 2 ||
      !Number.isFinite(centerLngLat[0]) || !Number.isFinite(centerLngLat[1]) ||
      !Number.isFinite(radiusMiles) || radiusMiles <= 0) return empty;
  const [lng, lat] = centerLngLat;
  const angular = radiusMiles / 3959;
  const lat1 = lat * Math.PI / 180;
  const lon1 = lng * Math.PI / 180;
  const count = Math.max(8, Math.floor(steps));
  const coordinates = [];
  for (let i = 0; i <= count; i++) {
    const bearing = 2 * Math.PI * i / count;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing));
    const lon2 = lon1 + Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2));
    coordinates.push([lon2 * 180 / Math.PI, lat2 * 180 / Math.PI]);
  }
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { radius_miles: radiusMiles },
      geometry: { type: "Polygon", coordinates: [coordinates] }
    }]
  };
}

// MapLibre owns the outer marker's transform; hover effects must stay on a child.
export function createStableJobMarker(size, color) {
  const anchor = el("div", `width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;cursor:pointer`);
  const visual = el("div", `width:${size}px;height:${size}px;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.35);transition:transform 0.15s`);
  anchor.appendChild(visual);
  anchor.addEventListener("mouseenter", () => { visual.style.transform = "rotate(-45deg) scale(1.2)"; });
  anchor.addEventListener("mouseleave", () => { visual.style.transform = "rotate(-45deg) scale(1)"; });
  return anchor;
}

// DOM helpers: popups are built with textContent, never innerHTML, so user data can't inject markup
function el(tag, style = "", text = null) {
  const node = document.createElement(tag);
  if (style) node.style.cssText = style;
  if (text !== null && text !== undefined) node.textContent = String(text);
  return node;
}

function avatarNode(photoUrl, name, size) {
  const fallback = el("div", `width:${size}px;height:${size}px;border-radius:50%;background:#050A30;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:${Math.round(size * 0.4)}px;flex-shrink:0`, initials(name));
  if (!photoUrl) return fallback;
  const img = el("img", `width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;object-position:center;border:2px solid #0000FF;flex-shrink:0`);
  img.alt = "";
  img.src = photoUrl;
  img.onerror = () => { console.warn("Map image failed:", photoUrl); img.replaceWith(fallback); };
  return img;
}

const TRANSPORT_LABELS = { bike: "Bike", car: "Car", suv_van: "SUV / Van", truck: "Truck", bus: "Bus", rideshare: "Rideshare", other: "Other" };

function crewPopupNode(member, onCrewOffer) {
  const root = el("div", "font-family:Inter,sans-serif;padding:4px 2px;min-width:180px;color:#0f172a");
  const head = el("div", "display:flex;align-items:center;gap:8px;margin-bottom:6px");
  head.appendChild(avatarNode(resolveImageUrl(member.profile_photo), member.name, 34));
  const meta = el("div");
  meta.appendChild(el("strong", "font-size:13px;color:#050A30;display:block", member.name || "Crew member"));
  meta.appendChild(el("span", "font-size:11px;color:#0000FF;font-weight:600;text-transform:capitalize", member.trade || "General Labor"));
  head.appendChild(meta);
  root.appendChild(head);
  const rating = typeof member.rating === "number" && member.rating_count ? member.rating.toFixed(1) : "New";
  root.appendChild(el("p", "font-size:11px;margin:2px 0;color:#334155", `★ ${rating} · ${member.jobs_completed || 0} jobs`));
  if (member.transportation) root.appendChild(el("p", "font-size:11px;margin:2px 0;color:#334155", `Transport: ${TRANSPORT_LABELS[member.transportation] || member.transportation}`));
  if (member.location?.city) root.appendChild(el("p", "font-size:11px;color:#64748b;margin:2px 0", `${member.location.city}${member.location.state ? ", " + member.location.state : ""}`));
  root.appendChild(el("p", `font-size:11px;font-weight:bold;margin:4px 0;color:${member.availability ? "#059669" : "#DC2626"}`, member.availability ? "Available" : "Unavailable"));
  const actions = el("div", "display:flex;gap:6px;margin-top:6px");
  const link = el("a", "flex:1;text-align:center;background:#0000FF;color:#fff;font-size:11px;font-weight:700;padding:6px 8px;border-radius:8px;text-decoration:none", "View Profile");
  link.href = `/profile/${encodeURIComponent(member.id)}`;
  link.setAttribute("data-testid", `map-crew-profile-${member.id}`);
  actions.appendChild(link);
  if (onCrewOffer) {
    const offer = el("button", "flex:1;background:#fff;color:#0000FF;border:1.5px solid #0000FF;font-size:11px;font-weight:700;padding:5px 8px;border-radius:8px;cursor:pointer", "Offer Job");
    offer.type = "button";
    offer.setAttribute("data-testid", `map-crew-offer-${member.id}`);
    offer.addEventListener("click", () => onCrewOffer(member));
    actions.appendChild(offer);
  }
  root.appendChild(actions);
  return root;
}

function jobPopupNode(job) {
  const root = el("div", "font-family:Inter,sans-serif;padding:6px 2px;color:#0f172a");
  const head = el("div", "display:flex;align-items:center;gap:10px;margin-bottom:8px");
  head.appendChild(avatarNode(resolveImageUrl(job.contractor_photo), job.contractor_name, 36));
  const meta = el("div");
  meta.appendChild(el("strong", "font-size:13px;color:#050A30;display:block", job.title));
  meta.appendChild(el("p", "font-size:11px;color:#475569;margin:2px 0", job.contractor_name || ""));
  head.appendChild(meta);
  root.appendChild(head);
  const row = el("div", "display:flex;justify-content:space-between;gap:4px;font-size:12px;margin-bottom:6px");
  row.appendChild(el("span", "color:#0000FF;font-weight:bold", `$${job.pay_rate}/hr`));
  row.appendChild(el("span", "color:#475569;text-transform:capitalize", job.trade || ""));
  root.appendChild(row);
  root.appendChild(el("p", "font-size:11px;color:#64748b;margin:0", `${job.crew_accepted?.length || 0}/${job.crew_needed} crew filled`));
  if (job.location?.city) root.appendChild(el("p", "font-size:11px;color:#64748b;margin:2px 0", job.location.city));
  const tags = el("div", "margin-top:5px;display:flex;gap:4px;flex-wrap:wrap");
  if (job.is_emergency) tags.appendChild(el("span", "background:#FEE2E2;color:#B91C1C;font-size:10px;padding:2px 7px;border-radius:10px;font-weight:bold", "EMERGENCY"));
  if (job.is_featured) tags.appendChild(el("span", "background:#FEF3C7;color:#B45309;font-size:10px;padding:2px 7px;border-radius:10px;font-weight:bold", "FEATURED"));
  root.appendChild(tags);
  return root;
}

export default function MapComponent({
  jobs = [],
  crew = [],
  userLocation,
  onJobClick,
  height = "500px",
  distanceFilter = null,
  searchCenter = null,
  onCenterUser = null,
  flyToCoords = null,
  flyToZoom = 13,
  showOnlyContractorJobs = false,
  onCrewOffer = null,
}) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [mapReady, setMapReady] = useState(false);
  const prevFlyTo = useRef(null);

  // Center map on user location
  const centerOnUser = useCallback(() => {
    if (!mapRef.current) return;
    if (toLngLat(userLocation)) {
      onCenterUser?.(userLocation);
      mapRef.current.flyTo({ center: toLngLat(userLocation), zoom: 12, speed: 1.5 });
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          onCenterUser?.(location);
          mapRef.current?.flyTo({ center: [location.lng, location.lat], zoom: 12, speed: 1.5 });
        },
        () => {}
      );
    }
  }, [userLocation, onCenterUser]);

  // Init map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: OSM_STYLE,
      center: toLngLat(userLocation) || US_CENTER,
      zoom: toLngLat(userLocation) ? 11 : 4,
      maxBounds: [[-179.9, -85], [179.9, 85]], // full 360° span crashes maplibre 5.x (non-invertible matrix)
      attributionControl: true,
    });

    // Navigation controls (zoom in/out + compass)
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), "top-right");

    // Geolocate control
    map.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      showAccuracyCircle: false,
    }), "top-right");

    map.on("load", () => { setMapReady(true); map.resize(); });
    map.on("error", (e) => {
      // suppress tile errors (OSM throttle)
      if (e?.error?.status === 429) return;
    });

    mapRef.current = map;
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; setMapReady(false); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FlyTo on coords change
  useEffect(() => {
    if (!mapRef.current || !flyToCoords) return;
    const key = `${flyToCoords[0]},${flyToCoords[1]}`;
    if (prevFlyTo.current === key) return;
    prevFlyTo.current = key;
    mapRef.current.flyTo({ center: flyToCoords, zoom: flyToZoom, speed: 1.4 });
  }, [flyToCoords, flyToZoom]);

  // Prefer a manually selected state center even if geolocation arrives afterwards.
  useEffect(() => {
    const target = toLngLat(searchCenter) || toLngLat(userLocation);
    if (!mapRef.current || !target || !mapReady) return;
    mapRef.current.flyTo({ center: target, zoom: searchCenter ? 6 : 11, speed: 1.2 });
  }, [userLocation, searchCenter, mapReady]);

  // Render the selected mileage radius as a geographic polygon.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const center = toLngLat(searchCenter) || toLngLat(userLocation);
    const data = createRadiusGeoJSON(center, distanceFilter);
    const sourceId = "crew-search-radius";
    const source = map.getSource(sourceId);
    if (source) {
      source.setData(data);
      return;
    }
    map.addSource(sourceId, { type: "geojson", data });
    map.addLayer({
      id: "crew-search-radius-fill",
      type: "fill",
      source: sourceId,
      paint: { "fill-color": "#0000FF", "fill-opacity": 0.10 }
    });
    map.addLayer({
      id: "crew-search-radius-outline",
      type: "line",
      source: sourceId,
      paint: { "line-color": "#0000FF", "line-width": 2, "line-dasharray": [2, 1] }
    });
  }, [mapReady, userLocation, searchCenter, distanceFilter]);

  // Render markers
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const map = mapRef.current;
    const add = (marker) => { marker.addTo(map); markersRef.current.push(marker); };

    const userLngLat = toLngLat(userLocation);
    if (userLngLat) {
      const dot = el("div", "width:18px;height:18px;background:#10B981;border-radius:50%;border:3px solid white;box-shadow:0 0 0 6px rgba(16,185,129,0.25);cursor:default");
      dot.title = "Your Location";
      add(new maplibregl.Marker({ element: dot }).setLngLat(userLngLat)
        .setPopup(new maplibregl.Popup({ offset: 14, closeButton: false }).setDOMContent(
          el("div", "font-family:Inter,sans-serif;font-size:12px;font-weight:bold;color:#047857;padding:2px 4px", "Your Location"))));
    }

    const filterCenter = toLngLat(searchCenter) || userLngLat;
    jobs.forEach((job) => {
      const lngLat = toLngLat(job.location);
      if (!lngLat) return;
      if (distanceFilter && filterCenter && haversine(filterCenter[1], filterCenter[0], lngLat[1], lngLat[0]) > distanceFilter) return;
      const color = job.is_emergency ? "#EF4444" : job.is_featured ? "#F59E0B" : "#10B981";
      const size = job.is_emergency ? 36 : job.is_featured ? 32 : 28;
      const pin = createStableJobMarker(size, color);
      pin.setAttribute("data-testid", `map-job-marker-${job.id}`);
      if (onJobClick) pin.addEventListener("click", () => onJobClick(job));
      add(new maplibregl.Marker({ element: pin }).setLngLat(lngLat)
        .setPopup(new maplibregl.Popup({ offset: 24, maxWidth: "240px" }).setDOMContent(jobPopupNode(job))));
    });

    crew.forEach((member) => {
      const lngLat = toLngLat(member.location);
      if (!lngLat) return;
      const base = "width:36px;height:36px;border-radius:50%;border:3px solid #7EC8E3;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);background:#050A30;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:13px;overflow:hidden";
      const dot = el("div", base);
      dot.setAttribute("data-testid", `map-crew-marker-${member.id}`);
      const photo = resolveImageUrl(member.profile_photo);
      if (photo) {
        const img = el("img", "width:100%;height:100%;object-fit:cover;object-position:center;display:block");
        img.alt = "";
        img.src = photo;
        img.onerror = () => { console.warn("Crew marker image failed:", photo); img.remove(); dot.textContent = initials(member.name); };
        dot.appendChild(img);
      } else {
        dot.textContent = initials(member.name);
      }
      add(new maplibregl.Marker({ element: dot }).setLngLat(lngLat)
        .setPopup(new maplibregl.Popup({ offset: 18, closeButton: true, maxWidth: "240px" }).setDOMContent(crewPopupNode(member, onCrewOffer))));
    });
    return () => { markersRef.current.forEach((m) => m.remove()); markersRef.current = []; };
  }, [jobs, crew, userLocation, searchCenter, mapReady, distanceFilter, onJobClick, onCrewOffer]);

  return (
    <div style={{ height, width: "100%", position: "relative" }}
      className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-inner">
      <div ref={mapContainer} style={{ height: "100%", width: "100%" }} />

      {/* Center map button */}
      {mapReady && (
        <button
          onClick={centerOnUser}
          title="Center on my location"
          data-testid="center-map-btn"
          className="absolute bottom-4 left-4 z-10 bg-white dark:bg-slate-800 shadow-lg rounded-xl px-3 py-2 flex items-center gap-2 text-xs font-bold text-[#050A30] dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 transition-colors"
          style={{ pointerEvents: "all" }}>
          <Navigation className="w-4 h-4 text-[#0000FF]" />
          Center Map
        </button>
      )}
    </div>
  );
}
