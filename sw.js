// Triviaty offline cache — installs the game as an app and works without internet
const CACHE = "triviaty-v11";
const ASSETS = [
  "./index.html",
  "./styles.css",
  "./app.js",
  "./questions.json",
  "./solo.json",
  "./thirty-categories.json",
  "./manifest.json",
  "./icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: "reload" }))).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return; // never touch external fonts/CDNs
  if (event.request.method !== "GET") return;

  // The page itself: NETWORK-FIRST so players always get the newest index.html
  // when online (falls back to the cached copy offline).
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match("./index.html")))
    );
    return;
  }

  // Everything else: cache-first, cached on the fly
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetched = fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached || caches.match("./index.html"));
      return cached || fetched;
    })
  );
});
