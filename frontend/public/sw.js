/* TheDayLaborers Service Worker v3.0 — Offline + Push */
// v3: app shell & bundles are network-first so users always get the latest release
// (stale-while-revalidate kept serving an old bundle, e.g. one without current CSRF handling).
const CACHE_NAME = "daylaborers-v3";
const API_CACHE = "daylaborers-api-v3";

const STATIC_ASSETS = ["/", "/manifest.json", "/offline.html"];

// API routes to cache for offline browsing
const CACHEABLE_API_PATTERNS = [
  "/api/public/settings",
  "/api/public/verified-contractors",
  "/api/jobs/",
  "/api/payments/plans"
];

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(STATIC_ASSETS).catch(() => {})
    )
  );
  self.skipWaiting();
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => ![CACHE_NAME, API_CACHE].includes(k)).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== "GET") return;
  if (!["http:", "https:"].includes(url.protocol)) return;

  // API routes: network-first, cache on success, fallback to cache offline
  if (url.pathname.startsWith("/api/")) {
    const shouldCache = CACHEABLE_API_PATTERNS.some(p => url.pathname.includes(p.replace("/api/", "")));
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res.ok && shouldCache) {
            const clone = res.clone();
            caches.open(API_CACHE).then(c => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Only handle same-origin static assets; everything else goes straight to the network
  if (url.origin !== self.location.origin) return;

  // App shell + static assets: network-first, cached copy only when offline
  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match("/")))
  );
});

// ─── Background Sync for offline job data ────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-jobs") {
    event.waitUntil(syncJobs());
  }
});

async function syncJobs() {
  try {
    const res = await fetch("/api/jobs/");
    if (res.ok) {
      const cache = await caches.open(API_CACHE);
      await cache.put(new Request("/api/jobs/"), res);
    }
  } catch {}
}

// ─── Push Notifications ───────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = { title: "TheDayLaborers", body: "You have a new notification.", icon: "/logo192.png", url: "/" };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/logo192.png",
      badge: "/logo192.png",
      tag: data.tag || "daylaborers-notification",
      requireInteraction: false,
      data: { url: data.url }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(windowClients => {
      const existing = windowClients.find(c => c.url === targetUrl && "focus" in c);
      if (existing) return existing.focus();
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
