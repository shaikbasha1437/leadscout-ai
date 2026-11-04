/* Boot: theme, share links, offline banner, service worker. */
(async function () {
  'use strict';
  const app = LS.app; const { $, toast } = LS.ui;
  app.applyTheme = () => { const t = app.state.settings.theme; if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; };
  app.applyTheme();
  $('#theme-btn').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    app.state.settings.theme = dark ? 'light' : 'dark'; app.save(); app.applyTheme();
    toast((dark ? 'Light' : 'Dark') + ' theme.');
  });
  $('#about-btn').addEventListener('click', () => app.about());
  $('#mode-chip').addEventListener('click', () => app.go('#settings/model'));
  const net = () => { $('#offline-bar').hidden = navigator.onLine; };
  window.addEventListener('online', net); window.addEventListener('offline', net); net();
  // Shared link: product + ICP + tone only (never keys, leads or notes).
  const shared = LS.store.readShareHash(location.hash);
  history.replaceState(history.state, '', location.pathname + location.search + (shared || !location.hash ? '#agent' : location.hash));
  app.refresh();
  if (shared) {
    const ok = await app.ask({ title: 'Use a shared product and ICP?', text: ['This link carries someone\u2019s product description, ideal customer profile and tone. It has no leads, notes or API keys.', 'Apply it to your workspace? You can undo right after.'], ok: 'Apply' });
    if (ok) {
      const before = { p: app.clone(app.state.product), i: app.clone(app.state.icp), t: app.state.settings.tone };
      Object.assign(app.state.product, shared.product); app.state.icp = Object.assign(app.state.icp, shared.icp); app.state.settings.tone = shared.tone;
      app.save(); app.refresh();
      LS.ui.undoToast('Shared product and ICP applied.', () => { app.state.product = before.p; app.state.icp = before.i; app.state.settings.tone = before.t; app.save(); app.refresh(); });
    }
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { /* offline support unavailable */ });
})();
