/* SERNBELD offline cache. Keep network as authority whenever reachable.
 * Version changes force a clean install; network-first fetches also refresh unchanged-SW deployments.
 * Never serve cached HTML or JS while the network returns a successful newer response.
 */
const VERSION = 'sernbeld-pwa-57';
const PREFIX = 'sernbeld-pwa-';
const SHELL = VERSION + '-shell';
const RUNTIME = VERSION + '-runtime';
const BASE = new URL(self.registration.scope);
const OFFLINE_FILES = [
  './', './index.html', './game.js', './pwa.js', './manifest.webmanifest',
  './src/core/game-events.js', './src/core/entity-registry.js', './src/core/inventory.js', './src/core/shared-items.js',
  './src/core/region-lifecycle.js', './src/core/npc-dialogue.js', './src/core/skill-engine.js',
  './src/core/living-world-registry.js', './src/core/living-world-state.js', './src/core/npc-behavior.js',
  './src/core/npc-scheduler.js', './src/core/npc-movement.js', './src/core/living-world-runtime.js', './src/core/living-world-content.js',
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
  './src/entities/character/clothing/registry.js',
  './src/entities/character/clothing/collar.js',
  './src/entities/character/clothing/shirt.js',
  './src/entities/character/clothing/shirt-binding.js',
  './src/entities/character/clothing/garment-binding.js',
  './src/entities/character/clothing/limb-fit.js',
  './src/entities/character/clothing/garment-pose.js',
  './src/entities/character/clothing/shirt-source.js',
  './src/entities/character/clothing/pants-source.js',
  './src/entities/character/clothing/pants.js',
  './assets/models/clothing/pants-v1/pants_male.json.gz',
  './assets/models/clothing/pants-v1/pants_female.json.gz',
  './assets/models/clothing/pants-v1/manifest.json',
  './assets/models/clothing/runtime-bindings-v1.json.gz',
  './assets/models/clothing/shirt-v1/male/runtime.json',
  './assets/models/clothing/shirt-v1/male/runtime.00.part',
  './assets/models/clothing/shirt-v1/male/runtime.01.part',
  './assets/models/clothing/shirt-v1/male/runtime.02.part',
  './assets/models/clothing/shirt-v1/male/runtime.03.part',
  './assets/models/clothing/shirt-v1/female/runtime.json',
  './assets/models/clothing/shirt-v1/female/runtime.00.part',
  './assets/models/clothing/shirt-v1/female/runtime.01.part',
  './assets/models/clothing/shirt-v1/female/runtime.02.part',
  './assets/models/clothing/shirt-v1/female/runtime.03.part',
  './assets/models/clothing/shirt-v1/female/runtime.04.part',
  './assets/models/clothing/shirt-v1/female/runtime.05.part',
  './assets/models/clothing/shirt-v1/female/runtime.06.part',
  './src/entities/character/studio-source.js',
  './src/entities/character/studio-integration.js',
  './src/entities/character/attention-pose.js',
  './src/entities/character/studio.html',
  './src/entities/character/studio-ui.css',
  './assets/models/characters/studio-v1.json.gz',
  './assets/models/characters/studio-v1.lod.json.gz',
  './assets/pwa-icon.svg', './assets/pwa-icon-192.png',
  './assets/pwa-icon-512.png', './assets/ui-icons.svg',
  './styles/seed.css', './styles/tokens.css', './styles/hud.css',
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
    // Bound concurrent downloads and cache writes; a complete install is
    // still atomic with respect to activation, not an eager download storm.
    let cursor=0;
    async function cacheNext(){
      while(cursor<OFFLINE_FILES.length){
        const path=OFFLINE_FILES[cursor++],url=absolute(path);
        const response=await fetch(url,{cache:'no-store'});
        if(!response.ok||response.type==='opaque')throw new Error('Cannot precache '+path+' (HTTP '+response.status+')');
        await cache.put(url,response);
      }
    }
    await Promise.all(Array.from({length:3},()=>cacheNext()));
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
  const shirtData=url.pathname.startsWith(new URL('assets/models/clothing/shirt-v1/',BASE).pathname)&&/\/runtime\.(json|\d{2}\.part)$/.test(url.pathname);
  // Recovery requests must reach the network, never fall back to a possibly mixed generation.
  if(shirtData&&url.searchParams.has('shirt-recovery')){
    event.respondWith(fetch(request,{cache:'reload'}));return;
  }
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
      // The loader validates each part against metadata. Keep versioned keys
      // distinct; the unversioned offline install is only a verified fallback.
      const previous = shirtData
        ? await runtime.match(request) || await shell.match(new URL(url.pathname,url.origin).href)
        : await runtime.match(request, {ignoreSearch:true}) || await shell.match(request, {ignoreSearch:true});
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
