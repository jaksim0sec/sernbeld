// SERNBELD PWA lifecycle: never force-reload a player during gameplay.
(() => {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  let registration;
  let refreshing = false;
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
      if (!registration?.waiting) return;
      button.disabled = true;
      button.textContent = '적용 중…';
      registration.waiting.postMessage({type: 'SKIP_WAITING'});
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
  const check = () => {
    if (navigator.onLine) registration?.update().catch(() => {});
  };
  window.addEventListener('online', check);
  window.addEventListener('pageshow', check);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  navigator.serviceWorker.register('./sw.js', {scope: './', updateViaCache: 'none'})
    .then(value => {
      registration = value;
      watch();
      registration.addEventListener('updatefound', watch);
      check();
    })
    .catch(error => {
      // PWA is an enhancement; a registration failure must not block the running game.
      console.warn('[PWA] Offline mode unavailable:', error);
    });
})();
