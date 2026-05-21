const CACHE_NAME = "setlist-builder-v5";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest"
];

const OPTIONAL_ASSETS = [
  "./icon.svg",
  "./assets/cont-play.png",
  "./assets/delete-icon.png",
  "./assets/edit-icon.png",
  "./assets/render-icon.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/clicks/Cowbell-1.wav",
  "./assets/clicks/Cowbell-2.wav",
  "./assets/clicks/Klank-3.wav",
  "./assets/clicks/Korg-N1R-Shaker.wav",
  "./assets/clicks/Woodblock.wav"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_ASSETS);

    // Optional assets should never block service worker installability.
    await Promise.allSettled(
      OPTIONAL_ASSETS.map(async (asset) => {
        const response = await fetch(asset, { cache: "no-cache" });
        if (response.ok) {
          await cache.put(asset, response.clone());
        }
      })
    );
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) {
      return cached;
    }

    try {
      const response = await fetch(event.request);
      if (isSameOrigin && response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      if (event.request.mode === "navigate") {
        const fallback = await caches.match("./index.html");
        if (fallback) {
          return fallback;
        }
      }

      return new Response("Offline", {
        status: 503,
        statusText: "Offline"
      });
    }
  })());
});
