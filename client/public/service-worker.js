self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  if (url.includes("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((res) => res || fetch(event.request))
  );
});
