/* LeadScout AI service worker: network-first for app files, per-file cache, versioned, offline fallback.
   Bump CACHE on each release; old caches are removed on activate. Demo mode works fully offline. */
const CACHE = 'leadscout-ai-v2';
const ASSETS = [
  './', './index.html', './styles.css', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './js/agentkit/guard.js','./js/agentkit/keystore.js','./js/agentkit/llm.js','./js/agentkit/modal.js','./js/agentkit/search.js','./js/agentkit/webllm.js','./js/app.js','./js/data/companies.js','./js/lead/agent.js','./js/lead/compliance.js','./js/lead/compose.js','./js/lead/csv.js','./js/lead/icp.js','./js/lead/live.js','./js/lead/quality.js','./js/lead/research.js','./js/lead/store.js','./js/lead/text.js','./js/main.js','./js/ui.js','./js/views/agent.js','./js/views/compliance.js','./js/views/lead.js','./js/views/leads.js','./js/views/outbox.js','./js/views/settings.js'
];
self.addEventListener('install', (e) => {
  self.skipWaiting();
  // Cache each file on its own so one failed request can't break install.
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(ASSETS.map((a) => c.add(new Request(a, { cache: 'reload' })).catch(() => {})))));
});
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('leadscout-ai-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Only our own files. Model APIs, Tavily, CDNs and local LLM servers are never cached or touched.
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })
    .then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html').then((i) => i || caches.match('./')) : undefined))
    .then((r) => r || Response.error())));
});
