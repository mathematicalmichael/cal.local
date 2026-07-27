const CACHE = "cal-local-v6";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./js/app.js",
  "./js/schema.js",
  "./js/storage.js",
  "./js/time.js",
  "./js/week-view.js",
  "./js/day-view.js",
  "./js/grid-common.js",
  "./js/list-view.js",
  "./js/modal.js",
  "./js/legend.js",
  "./js/diff.js",
  "./js/import-modal.js",
  "./js/picker-modal.js",
  "./icons/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first, falling back to cache only when offline. This is a small,
// frequently-edited static site — cache-first would mean users (and anyone
// developing it locally) keep seeing stale HTML/CSS/JS after every update.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
