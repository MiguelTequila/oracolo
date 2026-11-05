// Service worker: rende il sito installabile e usabile anche con rete debole.
const VERSIONE = "oracolo-v1";
const BASE = ["./", "index.html", "style.css", "app.js", "config.js", "domande.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSIONE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSIONE).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Sempre prima la rete (cosi' le modifiche si vedono subito), cache se offline.
  const chiave = url.pathname;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(VERSIONE).then(c => c.put(chiave, copia)); }
    return r;
  }).catch(() => caches.match(chiave).then(c => c || caches.match(e.request))));
});
