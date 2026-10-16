const CACHE = "air-hockey-pwa-__BUILD_VERSION__";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-180.png", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const response = await fetch("/precache.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Offline asset manifest is unavailable");
    const files = await response.json();
    const cache = await caches.open(CACHE);
    await cache.addAll([...SHELL, ...files.map(file => "/" + file)]);
    await self.skipWaiting();
  })());
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

  const path = new URL(request.url).pathname;
  if (path.startsWith("/assets/") || path.startsWith("/icons/") || path === "/manifest.webmanifest") {
    // These are public, same-origin static files. Module/stylesheet requests can
    // carry Origin while install-time precache requests do not (Vite varies on it).
    event.respondWith(caches.match(request, { ignoreVary: true }).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
        return response;
      });
    }));
  }
});
