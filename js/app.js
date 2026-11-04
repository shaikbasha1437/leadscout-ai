/* LeadScout AI app core: state, model and search selection, running the agent, lead actions,
   routing and shared widgets. Views live in js/views/*.js and register on LS.app.views. */
(function (root) {
  'use strict';
  const { $, $$, h, toast, undoToast, sheet, ask } = LS.ui;
  const AK = root.AgentKit; const ST = LS.store; const T = LS.text;
  const PROVIDER_IDS = Object.keys(AK.llm.PROVIDERS);
  const keys = AK.keystore.createKeyStore({ prefix: 'leadscout' });
  const app = { views: {}, keys, state: ST.load(), running: null, liveTrace: null, route: { tab: 'agent', param: '' }, webllm: { text: '' } };
  root.LS.app = app;
  const S = () => app.state;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  app.clone = clone;
  app.knownKeys = () => PROVIDER_IDS.concat(['tavily']).map((p) => keys.get(p)).filter(Boolean);
  let saveTimer = null;
  app.save = (now) => {
    clearTimeout(saveTimer);
    const run = () => { const r = ST.save(S(), null, app.knownKeys()); if (!r.ok && r.error) toast(r.error); };
    if (now) run(); else saveTimer = setTimeout(run, 150);
  };
  window.addEventListener('pagehide', () => app.save(true));
  app.lead = (id) => S().leads.find((l) => l.id === id) || null;
  app.STATUS = { new: 'New', researched: 'Researched', drafted: 'Drafted', approved: 'Approved', skipped: 'Skipped' };
  app.STATUS_CHIP = { new: 'info', researched: 'brand', drafted: 'warn', approved: 'ok', skipped: '' };
  app.dncFor = (l) => LS.compliance.blocked(l, S().dnc);

  // ---------- model and search ----------
  app.modelCfg = () => {
    const s = S().settings; const p = s.provider in AK.llm.PROVIDERS ? s.provider : 'openai'; const P = AK.llm.PROVIDERS[p];
    return { provider: p, model: (s.models && s.models[p]) || P.defaultModel, baseUrl: p === 'compatible' ? (s.baseUrl || P.baseUrl) : '', key: keys.get(p), referer: location.origin + location.pathname, title: 'LeadScout AI' };
  };
  app.llm = () => {
    const s = S().settings;
    if (s.mode === 'live') {
      const c = app.modelCfg(); const P = AK.llm.PROVIDERS[c.provider];
      if (P.needsKey && !c.key) return { error: 'Live mode needs your ' + P.label + ' API key. Add it in Settings \u203a AI model, or switch back to demo mode.' };
      return { label: P.label, model: c.model, call: (msg) => AK.llm.call(c, msg, { prices: Object.assign({}, AK.llm.PRICES, S().prices || {}), timeoutMs: 90000 }) };
    }
    if (s.mode === 'webllm') {
      const model = s.webllmModel || AK.webllm.MODELS[0].id;
      return { label: 'In-browser (WebLLM)', model, call: (msg) => AK.webllm.call({ model, onProgress: (p) => { app.webllm.text = p.text || ''; $$('[data-webllm-status]').forEach((el) => { el.textContent = p.text || ''; }); } }, msg) };
    }
    return null;
  };
  app.search = () => (S().settings.mode !== 'demo' && S().settings.useSearch && keys.get('tavily') ? AK.search.createTavily(keys.get('tavily')) : null);
  app.deps = () => { const l = app.llm(); if (l && l.error) return { error: l.error }; return { llm: l ? (req) => l.call(req).then((r) => Object.assign({ model: l.model }, r, { model: r.model || l.model })) : null, search: app.search() }; };
  app.modeLabel = () => {
    const s = S().settings;
    if (s.mode === 'live') { const c = app.modelCfg(); return 'Live \u00b7 ' + AK.llm.PROVIDERS[c.provider].label + ' \u00b7 ' + c.model; }
    if (s.mode === 'webllm') return 'In-browser model';
    return 'Demo mode \u00b7 fictional data';
  };
  app.paintMode = () => { const c = $('#mode-chip'); if (!c) return; c.textContent = app.modeLabel(); c.className = 'mode-chip ' + (S().settings.mode === 'demo' ? 'demo' : 'live'); };
  app.agentOpts = (extra) => Object.assign({ icp: S().icp, product: S().product, sender: S().sender, tone: S().settings.tone, dnc: S().dnc }, extra || {});

  // ---------- agent ----------
  app.runAgent = async () => {
    if (app.running) return;
    const deps = app.deps(); if (deps.error) { toast(deps.error); return; }
    const ctl = new AbortController();
    const before = clone(S().leads); const beforeRun = S().run;
    app.running = { ctl }; app.liveTrace = [];
    app.refresh();
    let r;
    try {
      r = await LS.agent.run(app.agentOpts({ leads: clone(S().leads), dataset: S().settings.demoData ? LS.demoCompanies : null, delay: S().settings.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 380 : 0, signal: ctl.signal, onStep: (s, trace) => { app.liveTrace = trace.slice(); app.paintTrace(); } }), deps);
    } catch (e) { app.running = null; app.refresh(); toast('The run failed: ' + e.message); return; }
    app.running = null;
    S().leads = AK.keystore.redact(r.leads.concat(r.others), app.knownKeys());
    S().run = AK.keystore.redact({ trace: r.trace, stats: r.stats, at: r.at, mode: r.mode, search: r.search, model: deps.llm ? app.modeLabel() : 'Demo composer', stopped: r.stopped, leadIds: r.leads.map((l) => l.id) }, app.knownKeys());
    S().seen = true;
    app.save(true); app.refresh();
    const st = r.stats;
    undoToast((r.stopped ? 'Stopped. ' : '') + st.drafted + ' sequence' + (st.drafted === 1 ? '' : 's') + ' drafted, ' + (st.flags.stop + st.flags.warn) + ' flag' + (st.flags.stop + st.flags.warn === 1 ? '' : 's') + '. Nothing was sent.', () => { S().leads = before; S().run = beforeRun; app.save(true); app.refresh(); });
  };
  app.stopAgent = () => { if (app.running) app.running.ctl.abort(); };
  app.paintTrace = () => { const el = $('#trace'); if (el && app.views.agent) app.views.agent.paintTrace(el, app.liveTrace || (S().run && S().run.trace) || []); };
  // Research + draft one lead (manual or imported).
  app.processLead = async (id, what) => {
    const l = app.lead(id); if (!l) return;
    const deps = app.deps(); if (deps.error) { toast(deps.error); return; }
    if (app.dncFor(l)) { toast('This lead is on your do-not-contact list, so LeadScout won\u2019t draft for it.'); return; }
    const snap = clone(l); app.busy = id; app.refresh();
    try {
      const icp = LS.icp.normalize(S().icp);
      l.fit = LS.icp.scoreFit(l.company, icp, l.people, LS.agent.asOfFor(l, new Date().toISOString().slice(0, 10)));
      l.contact = LS.agent.contactFor(l, l.fit);
      if (what !== 'draft' || !l.research) { const r = await LS.agent.reresearch(l, app.agentOpts(), deps); l.research = r.research; l.trace = r.trace; }
      const d = await LS.agent.redraft(l, app.agentOpts({ tone: l.tone || S().settings.tone, variant: (l.draft && l.draft.variant) || 0 }), deps);
      l.draft = d.draft; l.quality = d.quality; l.trace = (what === 'draft' ? (l.trace || []).filter((t) => t.step === 'research') : l.trace || []).concat(d.trace);
      if (l.status === 'new' || l.status === 'researched') l.status = 'drafted';
      l.updatedAt = new Date().toISOString();
    } catch (e) { toast('Could not process ' + l.company.name + ': ' + e.message); }
    app.busy = null; Object.assign(l, AK.keystore.redact(l, app.knownKeys()));
    app.save(); app.refresh();
    undoToast('Researched and drafted ' + l.company.name + '. Nothing was sent.', () => { Object.keys(l).forEach((k) => delete l[k]); Object.assign(l, snap); app.save(); app.refresh(); });
  };
  app.regenerate = async (id, tone) => {
    const l = app.lead(id); if (!l || !l.research) return;
    const deps = app.deps(); if (deps.error) { toast(deps.error); return; }
    const snap = clone(l); app.busy = id; app.refresh();
    try {
      const t = tone || l.tone || S().settings.tone; const v = tone && tone !== (l.draft && l.draft.tone) ? 0 : ((l.draft && l.draft.variant) || 0) + 1;
      const d = await LS.agent.redraft(l, app.agentOpts({ tone: t, variant: v }), deps);
      l.draft = d.draft; l.quality = d.quality; l.tone = t; l.trace = (l.trace || []).filter((x) => x.step === 'research').concat(d.trace);
      if (l.status === 'approved') l.status = 'drafted';
      l.updatedAt = new Date().toISOString();
    } catch (e) { toast('Could not regenerate: ' + e.message); }
    app.busy = null; app.save(); app.refresh();
    undoToast((tone ? 'Rewritten in a ' + LS.compose.TONES[tone].label.toLowerCase() + ' tone.' : 'New version drafted.') + (snap.status === 'approved' ? ' It needs approval again.' : ''), () => { Object.keys(l).forEach((k) => delete l[k]); Object.assign(l, snap); app.save(); app.refresh(); });
  };
  app.recheck = (l) => { if (l.draft && l.research) l.quality = LS.agent.recheck(l, app.agentOpts()); };

  // ---------- lead actions ----------
  const restoreLead = (l, snap) => { Object.keys(l).forEach((k) => delete l[k]); Object.assign(l, snap); app.save(); app.refresh(); };
  app.setStatus = async (id, status, opts) => {
    const l = app.lead(id); if (!l || l.status === status) return;
    if (status === 'approved') {
      if (!l.draft) { toast('Draft outreach first.'); return; }
      if (app.dncFor(l)) { toast('On your do-not-contact list: can\u2019t approve.'); return; }
      if (l.quality && l.quality.counts.stop && !(await ask({ title: 'Approve with open problems?', text: [l.quality.counts.stop + ' stop flag' + (l.quality.counts.stop > 1 ? 's are' : ' is') + ' still open (for example unverified claims or a missing opt-out line).', 'Approving only marks it ready for you to copy. LeadScout never sends anything.'], ok: 'Approve anyway' }))) return;
    }
    const snap = clone(l); l.status = status; l.updatedAt = new Date().toISOString();
    if (status === 'skipped') l.skipReason = (opts && opts.reason) || 'Skipped by you'; else delete l.skipReason;
    app.save(); app.refresh();
    undoToast(l.company.name + ': ' + app.STATUS[status] + (status === 'approved' ? '. Ready to copy; nothing was sent.' : '.'), () => restoreLead(l, snap));
  };
  app.deleteLeads = (ids) => {
    const before = S().leads.slice(); const n = ids.length;
    S().leads = S().leads.filter((l) => !ids.includes(l.id));
    app.save();
    if (app.route.tab === 'lead' && ids.includes(app.route.param)) location.hash = '#leads'; else app.refresh();
    undoToast('Deleted ' + (n === 1 ? (before.find((l) => l.id === ids[0]) || { company: { name: '1 lead' } }).company.name : n + ' leads') + '.', () => { S().leads = before; app.save(); app.refresh(); });
  };
  app.addLeads = (leads, label) => {
    const before = S().leads.slice(); const have = new Set(S().leads.map((l) => LS.agent.keyOf(l.company)));
    let dup = 0; const now = new Date().toISOString();
    const add = leads.filter((l) => { const k = LS.agent.keyOf(l.company); if (have.has(k)) { dup++; return false; } have.add(k); return true; }).map((l) => Object.assign({ id: T.uid('lead'), status: 'new', notes: '', urls: [], createdAt: now, updatedAt: now }, l));
    S().leads = add.concat(S().leads); app.save(); app.refresh();
    undoToast((label || 'Added') + ' ' + add.length + ' lead' + (add.length === 1 ? '' : 's') + (dup ? ' (' + dup + ' already in your list)' : '') + '.', () => { S().leads = before; app.save(); app.refresh(); });
    return add;
  };
  app.addDnc = (text, label) => {
    const entries = LS.compliance.parseList(text); const before = S().dnc.slice();
    const have = new Set(before.map((e) => e.type + ':' + e.value)); const add = entries.filter((e) => !have.has(e.type + ':' + e.value));
    if (!add.length) { toast(entries.length ? 'Already on the list.' : 'Nothing to add. Use an email, a domain or a company name.'); return 0; }
    S().dnc = before.concat(add.map((e) => Object.assign(e, { added: new Date().toISOString().slice(0, 10) })));
    const hit = S().leads.filter((l) => l.status !== 'skipped' && app.dncFor(l));
    const snaps = hit.map((l) => [l, clone(l)]);
    hit.forEach((l) => { l.status = 'skipped'; l.skipReason = app.dncFor(l).reason; });
    app.save(); app.refresh();
    undoToast((label || 'Added') + ' ' + add.length + ' to do-not-contact' + (hit.length ? '; ' + hit.length + ' lead' + (hit.length > 1 ? 's' : '') + ' skipped' : '') + '.', () => { S().dnc = before; snaps.forEach(([l, s]) => { Object.keys(l).forEach((k) => delete l[k]); Object.assign(l, s); }); app.save(); app.refresh(); });
    return add.length;
  };

  // ---------- routing ----------
  app.go = (hash) => { if (location.hash !== hash) location.hash = hash; else app.refresh(); };
  function parse() { const m = (location.hash || '#agent').slice(1).split('/'); const tab = app.views[m[0]] ? m[0] : 'agent'; return { tab, param: decodeURIComponent(m.slice(1).join('/') || '') }; }
  app.refresh = (keepScroll) => {
    const r = app.route = parse();
    const nav = r.tab === 'lead' ? 'leads' : r.tab;
    $$('[data-tab]').forEach((a) => { const on = a.dataset.tab === nav; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const n = S().leads.filter((l) => l.status === 'drafted').length;
    ['#review-badge', '#review-badge-m'].forEach((s) => { const b = $(s); if (b) { b.hidden = !n; b.textContent = n; } });
    app.paintMode();
    const main = $('#view');
    const y = window.scrollY;
    const active = document.activeElement && document.activeElement.id;
    main.textContent = '';
    app.views[r.tab].render(main, r.param);
    if (keepScroll !== false) window.scrollTo(0, y);
    if (active) { const el = document.getElementById(active); if (el && main.contains(el)) { el.focus(); if (el.setSelectionRange && el.value != null && /^(text|search|url|email)$/.test(el.type || '') ) { try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* ignore */ } } } }
  };
  let lastTab = '';
  window.addEventListener('hashchange', () => { const r = parse(); const key = r.tab + '/' + r.param; const changed = key !== lastTab; lastTab = key; app.refresh(changed ? false : undefined); if (changed) window.scrollTo(0, 0); });

  // ---------- shared widgets ----------
  app.chip = (text, cls, attrs) => h('span', Object.assign({ class: 'chip ' + (cls || '') }, attrs || {}), text);
  app.statusChip = (l) => app.chip(app.STATUS[l.status] || l.status, app.STATUS_CHIP[l.status]);
  app.fitChip = (fit) => (fit ? app.chip(fit.score + ' fit', fit.score >= 75 ? 'ok' : fit.score >= 50 ? 'warn' : 'stop', { title: 'Fit ' + fit.score + '/100 (' + fit.grade + ')' }) : app.chip('No fit score'));
  app.flagChip = (q) => (!q ? null : q.counts.stop ? app.chip(q.counts.stop + ' stop', 'stop') : q.counts.warn ? app.chip(q.counts.warn + ' warn', 'warn') : app.chip('Clean', 'ok'));
  app.field = (label, input, hint) => h('label', { class: 'f' }, label, hint ? h('span', { class: 'h' }, hint) : null, input);
  app.select = (opts, value, attrs) => h('select', attrs || {}, opts.map((o) => { const v = Array.isArray(o) ? o[0] : o; const l = Array.isArray(o) ? o[1] : o; return h('option', { value: v, selected: v === value }, l); }));
  app.fictionalTag = (l) => (l.company && l.company.fictional ? app.chip('Fictional demo', 'brand', { title: 'Made-up company, people and news for the demo. .example domains can\u2019t receive mail.' }) : null);
  app.ask = ask; app.sheet = sheet;
  app.about = () => sheet({
    id: 'about', title: 'About LeadScout AI', wide: true,
    body: (b) => b.append(
      h('p', {}, 'LeadScout AI is a sales research agent. You describe your product and ideal customer; it finds matching accounts, scores fit with reasons you can check, researches each one and drafts outreach (an email, a LinkedIn note and two follow-ups) that cites the facts it used.'),
      h('div', { class: 'notice ok' }, h('b', {}, 'Drafts only. '), 'LeadScout never sends anything. The most it does is copy a draft or open it in your own mail app, where you decide.'),
      h('h3', { style: 'margin-top:14px' }, 'Demo mode vs live mode'),
      h('p', {}, 'Demo mode needs no key and works offline. It uses 25 made-up companies on .example domains, with fictional people and news, and a deterministic composer, so every run gives the same result. Nothing in the demo describes a real company or person.'),
      h('p', {}, 'Live mode uses your own key for OpenAI, Anthropic, Google Gemini or an OpenAI-compatible endpoint (OpenRouter, Ollama, LM Studio). Add a Tavily key to search the web for accounts and read pages you paste. Fit scores, the do-not-contact check and draft quality checks always run locally, so a model can\u2019t inflate a score or skip a check.'),
      h('h3', {}, 'What LeadScout will not do'),
      h('ul', {}, h('li', {}, 'Look up, scrape or guess people\u2019s personal details. Named contacts come only from your own imports; otherwise it suggests roles to find yourself.'), h('li', {}, 'Send email or messages, or schedule anything.'), h('li', {}, 'Follow instructions hidden in web pages or notes. Such text is flagged and never quoted.')),
      h('h3', {}, 'Privacy'),
      h('ul', {}, h('li', {}, 'There is no LeadScout server. Leads, drafts and settings stay in this browser (localStorage).'), h('li', {}, 'Keys stay in this browser and go only to the provider you chose. They are never put in exports or share links.')),
      h('p', { class: 'small muted' }, 'Compliance notes are reminders, not legal advice. Open source under the MIT license.'))
  });
  root.LS.app = app;
})(self);
