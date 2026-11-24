// SERNBELD PWA lifecycle: never force-reload a player during gameplay.
(() => {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  let registration;
  let refreshing = false;
  let knownRevision = null;
  let revisionCheckInFlight = false;
  let lastCheck = 0;
  const REVISION_FILES = ['./src/entities/character/appearance.js','./src/entities/character/avatar-motion.js','./src/entities/character/studio-geometry.js','./src/entities/character/studio-model.js','./src/entities/character/studio-source.js','./src/entities/character/studio-integration.js','./src/entities/character/studio.html','./index.html','./game.js','./src/core/game-events.js',
    './src/core/entity-registry.js','./src/core/inventory.js','./src/entities/character/reference-eyes.js','./src/entities/character/reference-eye-contours.js','./src/entities/character/combat-stance.js',
    './src/core/region-lifecycle.js','./styles/tokens.css',
    './styles/hud.css','./styles/menus-and-overlays.css','./styles/responsive.css',
    './styles/world-map.css','./assets/ui-icons.svg','./assets/models/clothing/runtime-bindings-v1.json.gz'];
  let updateNotice;
  const notice = () => {
    if (updateNotice) return updateNotice;
    const panel = document.createElement('div');
    panel.id = 'pwaUpdateNotice';
    panel.setAttribute('role', 'status');
    panel.style.cssText = 'position:fixed;z-index:9999;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 18px);transform:translateX(-50%);display:flex;align-items:center;gap:12px;max-width:calc(100vw - 24px);padding:10px 12px;border:1px solid rgba(255,255,255,.24);border-radius:12px;background:rgba(15,29,39,.97);box-shadow:0 8px 28px rgba(0,0,0,.25);color:#f7fbfa;font:13px/1.4 system-ui,sans-serif';
    const label = document.createElement('span');
    label.textContent = '새 버전이 준비됐어';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '업데이트';
    button.setAttribute('aria-label', '게임 새 버전 적용');
    button.style.cssText = 'flex:none;border:1px solid rgba(255,255,255,.33);border-radius:8px;padding:8px 12px;background:rgba(255,255,255,.13);color:inherit;font:inherit;cursor:pointer;min-height:40px';
    button.addEventListener('click', () => {
      if (registration?.waiting) {
        button.disabled = true;
        button.textContent = '적용 중…';
        registration.waiting.postMessage({type: 'SKIP_WAITING'});
      } else {
        // For normal asset-only deployments the SW source may be unchanged;
        // network-first navigation obtains the latest files directly.
        location.reload();
      }
    });
    panel.append(label, button);
    (document.body || document.documentElement).append(panel);
    updateNotice = panel;
    return panel;
  };
  const watch = () => {
    if (registration?.waiting && navigator.serviceWorker.controller) notice();
    registration?.installing?.addEventListener('statechange', () => {
      if (registration.waiting && navigator.serviceWorker.controller) notice();
    });
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing || !updateNotice) return;
    refreshing = true;
    // Reload only after the user explicitly requests activation, never in the middle of play.
    location.reload();
  });
  const check = async () => {
    if (!registration || (!registration.active && !navigator.serviceWorker.controller) || !navigator.onLine || revisionCheckInFlight) return;
    if (Date.now() - lastCheck < 15000) return;
    revisionCheckInFlight = true;
    lastCheck = Date.now();
    try {
      await registration?.update();
      // Detect deployments even when sw.js itself has not changed.
      // HEAD avoids downloading the 3 MB game bundle just to inspect freshness.
      const parts = await Promise.all(REVISION_FILES.map(async path => {
        const response = await fetch(path, {method: 'HEAD', cache: 'no-store'});
        if (!response.ok) throw new Error('Update check HTTP ' + response.status);
        const headers = response.headers;
        return headers.get('etag') || [headers.get('last-modified'),
          headers.get('content-length')].join(':');
      }));
      if (parts.every(p => p && p !== ':')) {
        const nextRevision = parts.join('|');
        if (knownRevision && nextRevision !== knownRevision) notice();
        else if (!knownRevision) knownRevision = nextRevision;
      }
    } catch {
      // Don't disrupt play or mark a new deployment while temporarily offline.
    } finally {
      revisionCheckInFlight = false;
    }
  };
  window.addEventListener('online', check);
  window.addEventListener('pageshow', check);
  window.addEventListener('focus', check);
  window.setInterval(check, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  // Cold startup is the highest priority. Do not compete with mandatory
  // model downloads and world generation for CPU, memory and bandwidth.
  let started=false;
  function startOffline(){
    if(started)return;started=true;
    navigator.serviceWorker.register('./sw.js', {scope: './', updateViaCache: 'none'})
      .then(value => {
        registration = value;
        watch();
        registration.addEventListener('updatefound', watch);
        check();
      })
      .catch(error => {
        console.warn('[PWA] Offline mode unavailable:', error);
      });
  }
  function afterCharacterCreation(){
    const chooser=document.getElementById('character-chooser');
    if(chooser?.open){
      const observer=new MutationObserver(()=>{
        if(!chooser.open){observer.disconnect();setTimeout(startOffline,0);}
      });
      observer.observe(chooser,{attributes:true,attributeFilter:['open']});
    }else setTimeout(startOffline,0);
  }
  const loading=document.getElementById('loading');
  if(loading&&!loading.classList.contains('done')){
    const observer=new MutationObserver(()=>{
      if(loading.classList.contains('done')){observer.disconnect();afterCharacterCreation();}
    });
    observer.observe(loading,{attributes:true,attributeFilter:['class']});
  }else afterCharacterCreation();
})();
