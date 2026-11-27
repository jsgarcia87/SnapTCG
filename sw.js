/**
 * sw.js — Service worker de Kard Lume
 * Objetivo: que la app abra sin conexión (requisito de calidad para Android/Play Store) sin servir nunca
 * una versión vieja cuando hay red. Estrategia: red primero para los archivos propios, con la caché como
 * respaldo. Las peticiones a otros dominios (APIs de precios, Supabase, CDN) no se tocan.
 * Sube CACHE al publicar una versión para limpiar la caché anterior.
 */
const CACHE = "kardlume-v3.20.0";
const SHELL = [
  "./", "./index.html", "./privacidad.html", "./borrar-cuenta.html", "./manifest.webmanifest",
  "./css/style.css", "./css/design.css",
  "./js/icons.js", "./js/config.js", "./js/prices.js", "./js/charts.js", "./js/api.js", "./js/cardmatch.js",
  "./js/scanner.js", "./js/scantray.js", "./js/deckbuilder.js", "./js/stats.js", "./js/cloud.js", "./js/alerts.js", "./js/portfolio.js",
  "./js/home.js", "./js/app.js",
  "./img/kardlume-dark.svg", "./img/favicon.svg", "./img/pwa/icon-192.png", "./img/pwa/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("kardlume-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // APIs, Supabase y CDN: siempre a la red
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: req.mode === "navigate" })
        .then(hit => hit || (req.mode === "navigate" ? caches.match("./index.html") : Response.error())))
  );
});
