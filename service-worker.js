
const CACHE = "rr-autodetailing-v3";
const ASSETS = ["./","./index.html","./styles.css","./app.js","./manifest.json","./assets/rr-logo.png","./assets/rr-background.jpeg"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))));
self.addEventListener("fetch", e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
