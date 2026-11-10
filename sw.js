// Offline support. Bump VERSION whenever any file in SHELL changes, so installed copies update.
const VERSION = "fernweh-v1";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
  "src/styles.css", "src/main.js", "src/constants.js", "src/util.js", "src/model.js", "src/brain.js",
  "src/csv.js", "src/share.js", "src/platform.js", "src/state.js", "src/ui/render.js"
];
// Fonts and the Excel/Word readers come from CDNs; keep a copy once fetched.
const RUNTIME = ["fonts.googleapis.com", "fonts.gstatic.com", "cdnjs.cloudflare.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  if (url.origin === location.origin) {
    // Network first so updates show up straight away; cache when offline.
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))));
  } else if (RUNTIME.includes(url.hostname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res;
    })));
  }
});
