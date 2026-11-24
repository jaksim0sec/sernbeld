/* SERNBELD offline cache. Keep network as authority whenever reachable.
 * Version changes force a clean install; network-first fetches also refresh unchanged-SW deployments.
 * Never serve cached HTML or JS while the network returns a successful newer response.
 */
const VERSION = 'sernbeld-pwa-29';
const PREFIX = 'sernbeld-pwa-';
const SHELL = VERSION + '-shell';
const RUNTIME = VERSION + '-runtime';
const BASE = new URL(self.registration.scope);
const OFFLINE_FILES = [
  './', './index.html', './game.js', './pwa.js', './manifest.webmanifest',
  './src/core/game-events.js', './src/core/entity-registry.js', './src/core/inventory.js',
  './src/core/region-lifecycle.js', './src/core/skill-engine.js',
  './src/core/skill-library.js', './src/core/skill-runner.js', './src/ui/skill-workbench.js',
  './src/ui/skill-orbit-model.js',
  './src/entities/character/appearance.js',
  './src/entities/character/reference-eyes.js',
  './src/entities/character/reference-eye-contours.js',
  './src/entities/character/avatar-motion.js',
  './src/entities/character/schoolyard-motion.js',
  './src/entities/character/combat-stance.js',
  './src/entities/character/schoolyard-reference-clips.js',
  './src/entities/character/studio-geometry.js',
  './src/entities/character/studio-model.js',
  './src/entities/character/studio-source.js',
  './src/entities/character/studio-integration.js',
  './src/entities/character/attention-pose.js',
  './src/entities/character/studio.html',
  './src/entities/character/studio-ui.css',
  './assets/models/characters/studio-v1.json.gz',
  './assets/models/characters/studio-v1.lod.json.gz',
  './assets/pwa-icon.svg', './assets/pwa-icon-192.png',
  './assets/pwa-icon-512.png', './assets/ui-icons.svg',
  './styles/tokens.css', './styles/hud.css',
  './styles/menus-and-overlays.css', './styles/responsive.css',
  './styles/world-map.css', './styles/skill-workbench.css', './styles/main-menu.css', './styles.css',
  './assets/kael-cutstone-v7.glb.gz'
];
const absolute = path => new URL(path, BASE).href;
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // The install only succeeds once all mandatory local resources are cached.
    // Do NOT activate a partial app shell.
    await Promise.all(OFFLINE_FILES.map(async path => {
      const url = absolute(path);
      const response = await fetch(url, {cache: 'no-store'});
      if (!response.ok || response.type === 'opaque') {
        throw new Error('Cannot precache ' + path + ' (HTTP ' + response.status + ')');
      }
      await cache.put(url, response);
    }));
    // Do not replace a currently running game without the player's consent.
    // For the first registration, the browser automatically activates this worker.
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== SHELL && k !== RUNTIME)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(BASE.href)) return;
  if (!['http:','https:'].includes(url.protocol)) return;
  event.respondWith((async () => {
    try {
      // Bypass the browser HTTP cache, including for navigations, JS and CSS.
      const fresh = await fetch(request, {cache: 'no-store'});
      if (fresh.ok && fresh.type !== 'opaque') {
        try {
          // Persist the newer response before resolving the fetch, so switching
          // offline immediately afterward cannot race an unfinished cache write.
          const cache = await caches.open(RUNTIME);
          await cache.put(request, fresh.clone());
        } catch {
          // Storage quota must not prevent an otherwise healthy online response.
        }
      }
      // A real 404/500 must not be replaced by a hidden stale successful response.
      return fresh;
    } catch (error) {
      const runtime = await caches.open(RUNTIME);
      const shell = await caches.open(SHELL);
      const previous = await runtime.match(request, {ignoreSearch:true})
        || await shell.match(request, {ignoreSearch:true});
      if (previous) return previous;
      if (request.mode === 'navigate') {
        const fallback = await runtime.match(absolute('./index.html'))
          || await shell.match(absolute('./index.html'));
        if (fallback) return fallback;
      }
      return Response.error();
    }
  })());
});
