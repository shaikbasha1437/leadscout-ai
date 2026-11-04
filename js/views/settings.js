/* Settings: AI model (demo / your key / in-browser), web search (Tavily), sending cadence, theme, data and privacy. */
(function () {
  'use strict';
  const app = LS.app; const AK = AgentKit; const { $, h, toast, undoToast, sheet, money, ms } = LS.ui;
  const P = AK.llm.PROVIDERS;
  let lastParam = null; let draftKey = ''; let showKey = false; let testOut = null;
  const S = () => app.state.settings;
  const setS = (k, v, rerender) => { S()[k] = v; app.save(); app.paintMode(); if (rerender) app.refresh(); };
  function flash() { const el = $('#saved-flag'); if (el) { el.textContent = 'Saved'; clearTimeout(flash.t); flash.t = setTimeout(() => { el.textContent = ''; }, 1500); } }
  const host = (u) => { try { return new URL(u).host; } catch (e) { return u; } };
  function modelSection() {
    const s = S(); const c = app.modelCfg(); const prov = P[c.provider];
    const sec = h('section', { class: 'panel ssec', id: 's-model' }, h('h2', {}, 'AI model'));
    const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'How research and drafts are written' }, [['demo', 'Demo (no key)'], ['live', 'Your API key'], ['webllm', 'In-browser model']].map(([v, l]) => h('label', {}, h('input', { type: 'radio', name: 'mode', value: v, checked: s.mode === v, onchange: () => { setS('mode', v, true); toast(v === 'demo' ? 'Demo mode: fictional data, no AI model, no key.' : v === 'live' ? 'Live mode: research and drafts by ' + prov.label + '.' : 'In-browser model selected (experimental).'); } }), l)));
    sec.append(seg);
    if (s.mode === 'demo') sec.append(h('div', { class: 'notice', style: 'margin-top:12px' }, h('b', {}, 'Demo mode. '), 'No AI model and no key. The agent runs on 25 fictional companies (.example domains, made-up people and news) and the deterministic demo composer writes the drafts. Works offline. Nothing is sent, ever.'));
    if (s.mode === 'live') {
      const provSel = app.select(Object.keys(P).map((k) => [k, P[k].label]), c.provider, { id: 'provider', onchange: (e) => { draftKey = ''; testOut = null; setS('provider', e.target.value, true); } });
      const dl = h('datalist', { id: 'model-list' }, prov.models.map((m) => h('option', { value: m })));
      const model = h('input', { type: 'text', id: 'model', list: 'model-list', value: c.model, autocomplete: 'off', spellcheck: 'false', onchange: (e) => { const m = Object.assign({}, S().models); m[c.provider] = e.target.value.trim() || prov.defaultModel; setS('models', m, true); } });
      sec.append(h('div', { class: 'cols', style: 'margin-top:12px' }, app.field('Provider', provSel), app.field('Model', h('div', {}, model, dl), (() => { const pr = AK.llm.priceFor(c.model, app.prices()); return pr ? '$' + pr.in + ' in / $' + pr.out + ' out per 1M tokens' : 'Price unknown for this model, so cost estimates are skipped.'; })())));
      if (c.provider === 'compatible') {
        const base = h('input', { type: 'url', id: 'base-url', value: c.baseUrl, spellcheck: 'false', onchange: (e) => setS('baseUrl', e.target.value.trim(), true) });
        sec.append(app.field('Base URL', base, 'The endpoint that serves /chat/completions.'), h('div', { class: 'row', style: 'margin:-4px 0 12px' }, h('span', { class: 'small muted' }, 'Presets:'), AK.llm.PRESETS.map((p) => h('button', { type: 'button', class: 'btn sm', onclick: () => { const m = Object.assign({}, S().models); m.compatible = p.model; S().models = m; setS('baseUrl', p.baseUrl, true); } }, p.label))),
          h('div', { class: 'notice warn small', style: 'margin-bottom:12px' }, h('b', {}, 'Local servers: '), 'Ollama must allow this site: start it with OLLAMA_ORIGINS=' + location.origin + ' ollama serve. In LM Studio, turn on \u201cEnable CORS\u201d in the server settings. Chrome may ask to let this site reach devices on your local network; allow it. HTTPS pages can reach http://localhost but not other http:// addresses.'));
      }
      const where = app.keys.where(c.provider);
      const keyIn = h('input', { type: showKey ? 'text' : 'password', id: 'api-key', autocomplete: 'off', spellcheck: 'false', placeholder: where ? 'Saved \u2022\u2022\u2022\u2022 (type to replace)' : prov.keyHint, value: draftKey, oninput: (e) => { draftKey = e.target.value; } });
      const remember = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Where to keep the key' }, [['local', 'Remember in this browser'], ['session', 'This tab only']].map(([v, l]) => h('label', {}, h('input', { type: 'radio', name: 'keymode', value: v, checked: (s.keyMode || 'local') === v, onchange: () => { setS('keyMode', v); const k = app.keys.get(c.provider); if (k) { app.keys.set(c.provider, k, v); toast(v === 'session' ? 'Key moved to this tab only. It is forgotten when you close the tab.' : 'Key will be remembered in this browser.'); app.refresh(); } } }), l)));
      sec.append(app.field('API key' + (prov.needsKey ? '' : ' (optional)'), h('div', { class: 'row' }, h('div', { class: 'grow' }, keyIn), h('button', { type: 'button', class: 'btn sm', 'aria-pressed': String(showKey), onclick: () => { showKey = !showKey; app.refresh(); } }, showKey ? 'Hide' : 'Show')), prov.keyUrl ? h('span', {}, 'Get one at ', h('a', { href: prov.keyUrl, target: '_blank', rel: 'noopener noreferrer' }, host(prov.keyUrl)), '. Use a key with a spending limit.') : 'Leave empty for local servers that don\u2019t need one.'),
        h('div', { class: 'row', style: 'margin-bottom:12px' }, remember),
        h('div', { class: 'actions', style: 'margin-top:0' },
          h('button', { type: 'button', class: 'btn primary', id: 'save-key', onclick: () => { if (!draftKey.trim()) { toast('Type a key first.'); return; } app.keys.set(c.provider, draftKey.trim(), s.keyMode || 'local'); draftKey = ''; showKey = false; app.refresh(); toast(prov.label + ' key saved ' + ((s.keyMode || 'local') === 'session' ? 'for this tab only.' : 'in this browser.')); } }, 'Save key'),
          where ? h('button', { type: 'button', class: 'btn danger', id: 'remove-key', onclick: () => { app.keys.clear(c.provider); app.refresh(); toast(prov.label + ' key removed from this browser.'); } }, 'Remove key') : null,
          h('button', { type: 'button', class: 'btn', id: 'test-conn', onclick: testConnection }, 'Test connection'),
          h('span', { class: 'small muted' }, where ? 'Key saved ' + (where === 'session' ? 'for this tab only' : 'in this browser') : prov.needsKey ? 'No key saved' : '')),
        testOut ? h('div', { class: 'notice ' + (testOut.ok ? 'ok' : 'stop'), id: 'test-out', style: 'margin-top:10px' }, testOut.text) : null,
        h('div', { class: 'notice', id: 'key-notice', style: 'margin-top:12px' }, h('b', {}, '\ud83d\udd12 Where your key goes. '), 'It is stored only in this browser (' + ((s.keyMode || 'local') === 'session' ? 'sessionStorage: gone when this tab closes' : 'localStorage on this device') + ') and sent only to ' + host(c.provider === 'compatible' ? c.baseUrl : prov.baseUrl) + ' when research or drafts are written. It is never put in URLs, share links or exports, and LeadScout has no server. Anyone who can use this browser profile could read it, so remove it on shared computers.'),
        c.provider === 'anthropic' ? h('p', { class: 'small muted' }, 'Anthropic calls from a web page need the \u201canthropic-dangerous-direct-browser-access\u201d header, which LeadScout sends. The name is Anthropic\u2019s reminder that the key is visible to this page.') : null,
        h('p', { class: 'small muted' }, 'The model writes research summaries and drafts from numbered facts and must cite them. Fit scores, the do-not-contact check and the quality checks always run locally. If a call fails, the demo composer fills in and the lead\u2019s trace says so.'));
    }
    if (s.mode === 'webllm') {
      const box = h('div', { id: 'webllm-box', style: 'margin-top:12px' }, h('p', { class: 'small muted' }, 'Checking WebGPU\u2026'));
      sec.append(box);
      AK.webllm.support().then((sp) => {
        box.textContent = '';
        if (!sp.ok) { box.append(h('div', { class: 'notice warn' }, sp.reason + ' Runs fall back to the demo composer until a model loads.')); return; }
        const sel = app.select(AK.webllm.MODELS.map((m) => [m.id, m.label]), s.webllmModel || AK.webllm.MODELS[0].id, { id: 'webllm-model', onchange: (e) => setS('webllmModel', e.target.value) });
        box.append(app.field('Model', sel, 'Runs on your GPU. Downloaded once from the MLC CDN and cached by the browser. Small models write weaker drafts than hosted ones. This mode is experimental and was not tested on a GPU.'),
          h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', id: 'webllm-load', onclick: async (e) => { e.target.disabled = true; try { await AK.webllm.load(sel.value, (p) => { $$set('[data-webllm-status]', p.text || ''); }); $$set('[data-webllm-status]', 'Ready. Run the agent to use it.'); } catch (err) { $$set('[data-webllm-status]', 'Could not load: ' + err.message); } e.target.disabled = false; } }, 'Download and load'), h('span', { class: 'small', 'data-webllm-status': '' }, app.webllm.text || '')));
      });
    }
    return sec;
  }
  function $$set(sel, text) { document.querySelectorAll(sel).forEach((el) => { el.textContent = text; }); }
  async function testConnection() {
    const llm = app.llm();
    if (!llm) { testOut = { ok: false, text: 'Pick \u201cYour API key\u201d first.' }; app.refresh(); return; }
    if (llm.error) { testOut = { ok: false, text: llm.error }; app.refresh(); return; }
    const b = $('#test-conn'); if (b) { b.disabled = true; b.textContent = 'Testing\u2026'; }
    try {
      const r = await llm.call({ system: 'You are a connection test.', messages: [{ role: 'user', content: 'Reply with the single word OK.' }], maxTokens: 30, temperature: 0 });
      testOut = { ok: true, text: '\u2713 Connected to ' + llm.label + ' \u00b7 ' + (r.model || llm.model) + ' replied \u201c' + String(r.text).trim().slice(0, 40) + '\u201d \u00b7 ' + r.usage.input + ' in / ' + r.usage.output + ' out tokens \u00b7 ' + money(r.cost) + ' \u00b7 ' + ms(r.latencyMs) };
    } catch (e) { testOut = { ok: false, text: '\u2717 ' + e.message }; }
    app.refresh();
  }
  function searchSection() {
    const where = app.keys.where('tavily'); let k = '';
    return h('section', { class: 'panel ssec', id: 's-search' }, h('h2', {}, 'Web search (optional)'),
      h('p', { class: 'small' }, 'With a Tavily key, live mode searches the web for accounts that match your ICP, looks up recent news for each one, and reads page URLs you paste. Tavily allows calls straight from a web page; the key stays in this browser and goes only to api.tavily.com.'),
      h('div', { class: 'notice small', style: 'margin-bottom:12px' }, 'Brave Search is not offered: its API does not allow browser calls (no CORS), so it would need a server, and LeadScout has none. Demo mode never searches.'),
      h('label', { class: 'switch', style: 'margin-bottom:10px' }, h('input', { type: 'checkbox', id: 'use-search', checked: S().useSearch, onchange: (e) => setS('useSearch', e.target.checked, true) }), 'Use Tavily in live mode'),
      app.field('Tavily API key', h('div', { class: 'row' }, h('div', { class: 'grow' }, h('input', { type: 'password', id: 'tavily-key', autocomplete: 'off', spellcheck: 'false', placeholder: where ? 'Saved \u2022\u2022\u2022\u2022 (type to replace)' : 'tvly-...', oninput: (e) => { k = e.target.value; } })), h('button', { type: 'button', class: 'btn primary', id: 'save-tavily', onclick: () => { if (!k.trim()) { toast('Type a key first.'); return; } app.keys.set('tavily', k.trim(), S().keyMode || 'local'); app.refresh(); toast('Tavily key saved in this browser.'); } }, 'Save'), where ? h('button', { type: 'button', class: 'btn danger', id: 'remove-tavily', onclick: () => { app.keys.clear('tavily'); app.refresh(); toast('Tavily key removed.'); } }, 'Remove') : null), h('span', {}, 'Get one at ', h('a', { href: 'https://app.tavily.com/', target: '_blank', rel: 'noopener noreferrer' }, 'app.tavily.com'), '. Each search or page read uses Tavily credits.')),
      h('p', { class: 'small muted' }, where ? 'Key saved ' + (where === 'session' ? 'for this tab only.' : 'in this browser.') : 'No key saved.'));
  }
  function runSection() {
    return h('section', { class: 'panel ssec', id: 's-run' }, h('h2', {}, 'Runs and display'),
      h('label', { class: 'switch', style: 'display:flex;margin-bottom:8px' }, h('input', { type: 'checkbox', id: 'demo-data', checked: S().demoData, onchange: (e) => setS('demoData', e.target.checked) }), 'Include the 25 fictional demo companies in runs'),
      h('label', { class: 'switch', style: 'display:flex;margin-bottom:8px' }, h('input', { type: 'checkbox', id: 'animate', checked: S().animate, onchange: (e) => setS('animate', e.target.checked) }), 'Show each step of a demo run (slower, easier to follow)'),
      app.field('Theme', app.select([['auto', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']], S().theme || 'auto', { id: 'theme-select', onchange: (e) => { setS('theme', e.target.value); app.applyTheme(); } })));
  }
  function dataSection() {
    const fileIn = h('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', id: 'ws-file', onchange: async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; let next; try { next = LS.store.importWorkspace(JSON.parse(await f.text())); } catch (err) { toast(err.message || 'Could not read that file.'); return; } if (!(await app.ask({ title: 'Replace this workspace?', text: 'Leads, drafts, product, ICP, do-not-contact list and settings are replaced by the file. Saved API keys are kept (exports never contain them).', ok: 'Replace' }))) return; const before = app.state; app.state = next; app.save(true); app.refresh(); undoToast('Workspace imported.', () => { app.state = before; app.save(true); app.refresh(); }); } });
    return h('section', { class: 'panel ssec', id: 's-data' }, h('h2', {}, 'Data and privacy'),
      h('ul', { class: 'small' }, h('li', {}, 'Everything is stored in this browser. There is no LeadScout server and no analytics.'), h('li', {}, 'Exports and share links never include API keys. Share links carry only your product, ICP and tone.'), h('li', {}, 'LeadScout never sends email or messages. It doesn\u2019t look up or scrape people.')),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn', id: 'export-ws', onclick: () => { LS.ui.download('leadscout-workspace.json', JSON.stringify(LS.store.exportWorkspace(app.state, app.knownKeys()), null, 1)); toast('Workspace downloaded (no API keys).'); } }, 'Export workspace'),
        h('label', { for: 'ws-file', class: 'btn', tabindex: '0', onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } } }, 'Import workspace'), fileIn,
        h('button', { type: 'button', class: 'btn', id: 'share-link', onclick: async () => { const ok = await LS.ui.copy(LS.store.shareLink(location.href, app.state, app.knownKeys())); toast(ok ? 'Link copied: product, ICP and tone only.' : 'Copy failed.'); } }, 'Copy share link'),
        h('button', { type: 'button', class: 'btn danger', id: 'forget-keys', onclick: () => { app.keys.clearAll(Object.keys(P).concat(['tavily'])); app.refresh(); toast('All API keys removed from this browser.'); } }, 'Remove all keys'),
        h('button', { type: 'button', class: 'btn danger', id: 'reset-all', onclick: async () => { if (!(await app.ask({ title: 'Reset everything?', text: 'Leads, drafts, notes, the do-not-contact list and settings go back to the demo defaults. API keys are kept; remove them separately.', ok: 'Reset', danger: true }))) return; const before = app.state; app.state = LS.store.blank(); app.save(true); app.refresh(); undoToast('Workspace reset.', () => { app.state = before; app.save(true); app.refresh(); }); } }, 'Reset everything')));
  }
  function render(main, param) {
    main.append(h('div', { class: 'row', style: 'margin-bottom:12px' }, h('h1', { class: 'grow' }, 'Settings'), h('span', { class: 'small', id: 'saved-flag', role: 'status', style: 'color:var(--ok)' })));
    const nav = h('nav', { class: 'snav', 'aria-label': 'Settings sections' }, [['model', 'AI model'], ['search', 'Web search'], ['run', 'Runs and display'], ['data', 'Data and privacy']].map(([id, l]) => h('a', { href: '#settings/' + id, onclick: (e) => { e.preventDefault(); history.replaceState(history.state, '', '#settings/' + id); const el = document.getElementById('s-' + id); if (el) el.scrollIntoView({ behavior: 'smooth' }); } }, l)));
    main.append(h('div', { class: 'settings' }, nav, h('div', {}, modelSection(), searchSection(), runSection(), dataSection())));
    if (param !== lastParam) { lastParam = param; if (param) setTimeout(() => { const el = document.getElementById('s-' + param); if (el) el.scrollIntoView(); }, 0); }
  }
  app.views.settings = { render };
})();
