const cacheName = "card-tracker-v45";
const files = ["./", "index.html", "styles.css?v=45", "app.js?v=45", "main-bets.js?v=45", "research-history.js?v=45", "practice.js?v=45", "main-bets-worker.js?v=45", "manifest.webmanifest", "icon.svg"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(files.map((file) => new Request(file, { cache: "reload" })))).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== cacheName).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request, { cache: "no-cache" }).then((response) => {
    if (response.ok && new URL(event.request.url).origin === location.origin) caches.open(cacheName).then((cache) => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match(event.request)));
});
