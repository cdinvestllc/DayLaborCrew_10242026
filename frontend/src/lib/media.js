const BACKEND = process.env.REACT_APP_BACKEND_URL || "";

// Absolute/data/blob URLs pass through; legacy /uploads paths go via /api; other relative paths get the backend origin.
export function resolveImageUrl(url) {
  if (!url || typeof url !== "string") return null;
  if (/^(https?:)?\/\//i.test(url) || url.startsWith("data:") || url.startsWith("blob:")) return url;
  const path = url.startsWith("/") ? url : `/${url}`;
  if (path.startsWith("/uploads/")) return `${BACKEND}/api${path}`;
  return `${BACKEND}${path}`;
}

// Returns MapLibre [lng, lat] for valid coordinates (0 is valid), otherwise null.
export function toLngLat(loc) {
  if (!loc || loc.lat === null || loc.lat === undefined || loc.lng === null || loc.lng === undefined) return null;
  if (loc.lat === "" || loc.lng === "" || typeof loc.lat === "boolean" || typeof loc.lng === "boolean") return null;
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lng, lat];
}

export function initials(name) {
  return (name || "?").split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}
