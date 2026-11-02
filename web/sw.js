// seedcal service worker.
// Code and data use network-first, so a new build reaches the page.
// Images and the icon use cache-first, because they change less often.

const CACHE = "seedcal-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./logo.png",
  "./manifest.webmanifest",
  "./data/plan.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/** A network-first fetch. The cache is the fallback when the network fails. */
async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    return new Response("Offline and no cached copy.", {
      status: 504,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  const isDocument = request.mode === "navigate";
  const isCode = /\.(?:js|css|webmanifest)$/.test(url.pathname);
  const isData = url.pathname.includes("/data/");

  if (isDocument || isCode || isData) {
    event.respondWith(networkFirst(request, isDocument ? "./index.html" : undefined));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
});