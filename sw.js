// Service Worker – macht die Seite installierbar und offline-fähig.
const CACHE = "wm-tippspiel-v2";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./scoring.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./data/config.json",
  "./data/teams.json",
  "./data/ownership.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  // Spieldaten immer frisch holen (network-first), bei Offline aus Cache
  if (url.pathname.endsWith("matches.json")) {
    e.respondWith(
      fetch(e.request)
        .then((r) => { const c = r.clone(); caches.open(CACHE).then((cc) => cc.put(e.request, c)); return r; })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Rest: cache-first
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
