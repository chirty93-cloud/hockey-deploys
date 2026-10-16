const CACHE = "air-hockey-pwa-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-180.png", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("air-hockey-pwa-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put("/", copy));
      return response;
    }).catch(() => caches.match("/")));
    return;
  }

  if (new URL(request.url).pathname.startsWith("/assets/")) {
    event.respondWith(caches.match(request).then((cached) => {
      const fresh = fetch(request).then((response) => {
        if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
        return response;
      }).catch(() => cached || Response.error());
      return cached || fresh;
    }));
  }
});
