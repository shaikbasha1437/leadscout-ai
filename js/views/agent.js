/* Agent view: product + ICP form, the visible step-by-step run trace, and the run summary. */
(function () {
  'use strict';
  const app = LS.app; const { h, toast, undoToast } = LS.ui; const T = LS.text;
  const S = () => app.state;
  const csv = (a) => T.list(a).join(', ');
  function setIn(obj, k, v) { obj[k] = v; app.save(); const d = document.getElementById('icp-desc'); if (d) d.textContent = LS.icp.describe(S().icp); }
  const text = (obj, k, label, hint, attrs) => app.field(label, h('input', Object.assign({ type: 'text', id: 'f-' + k, value: Array.isArray(obj[k]) ? csv(obj[k]) : obj[k] || '', onchange: (e) => setIn(obj, k, Array.isArray(obj[k]) ? T.list(e.target.value) : e.target.value.trim()) }, attrs || {})), hint);
  const lines = (obj, k, label, hint) => app.field(label, h('textarea', { id: 'f-' + k, rows: 3, onchange: (e) => setIn(obj, k, e.target.value.split(/\n+/).map((x) => x.trim()).filter(Boolean)) }, T.list(obj[k]).join('\n')), hint);
  const num = (obj, k, label, hint, min, max) => app.field(label, h('input', { type: 'number', id: 'f-' + k, min, max, value: obj[k], inputmode: 'numeric', onchange: (e) => { const n = Number(e.target.value); setIn(obj, k, isFinite(n) ? n : obj[k]); } }), hint);
  const check = (obj, k, label) => h('label', { class: 'switch' }, h('input', { type: 'checkbox', id: 'f-' + k, checked: obj[k] !== false, onchange: (e) => setIn(obj, k, e.target.checked) }), label);
  function form() {
    const p = S().product; const i = S().icp; const s = S().sender;
    return h('div', { class: 'panel', id: 'icp-form' },
      h('details', { class: 'fold', open: !S().run }, h('summary', {}, h('h2', {}, '1. Your product')),
        text(p, 'name', 'Product name'), app.field('One-line pitch', h('textarea', { id: 'f-pitch', rows: 2, onchange: (e) => setIn(p, 'pitch', e.target.value.trim()) }, p.pitch || '')),
        lines(p, 'valueProps', 'Value points (one per line)', 'Drafts cite these as [P#]. Keep them true.'),
        lines(p, 'proofPoints', 'Proof points (one per line)', 'Only claims you can back up.')),
      h('details', { class: 'fold', open: true }, h('summary', {}, h('h2', {}, '2. Ideal customer profile')),
        text(i, 'industries', 'Industries', 'Comma separated, e.g. SaaS, Fintech'),
        h('div', { class: 'cols3' }, num(i, 'sizeMin', 'Min employees', '', 0, 1000000), num(i, 'sizeMax', 'Max employees', '', 1, 1000000), num(i, 'recencyDays', 'Signals within (days)', '', 7, 730)),
        text(i, 'regions', 'Regions or countries', 'North America, Europe, EMEA, APAC, LATAM, DACH, Nordics, or country names'),
        text(i, 'roles', 'Role titles to reach', 'Used to pick a contact from your own lead data and suggest stakeholders'),
        text(i, 'tech', 'Tech stack signals', 'Tools they use'),
        text(i, 'hiringKeywords', 'Hiring signals', 'Words in job titles that suggest need'),
        h('div', { class: 'row', style: 'margin:0 0 12px' }, check(i, 'wantHiring', 'Score hiring'), check(i, 'wantFunding', 'Score recent funding')),
        h('div', { class: 'cols3' }, num(i, 'maxLeads', 'Max leads per run', '', 1, 200), num(i, 'minFit', 'Minimum fit (0\u2013100)', '', 0, 100))),
      h('details', { class: 'fold', open: !S().run }, h('summary', {}, h('h2', {}, '3. Sender and tone')),
        h('div', { class: 'cols' }, text(s, 'name', 'Your name'), text(s, 'title', 'Your title')),
        text(s, 'company', 'Company'), text(s, 'address', 'Postal address', 'CAN-SPAM requires a valid postal address in commercial email. The demo uses a fictional one.'),
        app.field('Tone', app.select(Object.keys(LS.compose.TONES).map((k) => [k, LS.compose.TONES[k].label]), S().settings.tone, { id: 'f-tone', onchange: (e) => { S().settings.tone = e.target.value; app.save(); } }))),
      h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { type: 'button', class: 'btn sm', onclick: () => { const b = { p: app.clone(S().product), i: app.clone(S().icp), s: app.clone(S().sender) }; S().product = app.clone(LS.icp.DEFAULT_PRODUCT); S().icp = app.clone(LS.icp.DEFAULT_ICP); S().sender = app.clone(LS.store.DEFAULT_SENDER); app.save(); app.refresh(); undoToast('Demo product and ICP restored.', () => { S().product = b.p; S().icp = b.i; S().sender = b.s; app.save(); app.refresh(); }); } }, 'Reset to demo example'),
        h('button', { type: 'button', class: 'btn sm', id: 'share-icp', onclick: async () => { const ok = await LS.ui.copy(LS.store.shareLink(location.href, S(), app.knownKeys())); toast(ok ? 'Link copied. It holds your product, ICP and tone only: no leads, notes or keys.' : 'Copy failed.'); } }, 'Copy share link')));
  }
  const ICON = { done: '\u2713', run: '\u2022', stopped: '\u25a0', error: '!', wait: '' };
  function paintTrace(el, trace) {
    el.textContent = '';
    LS.agent.STEPS.forEach((st, n) => {
      const t = trace.find((x) => x.id === st.id); const state = t ? t.state : 'wait';
      el.append(h('li', { class: state === 'done' ? 'ok' : state === 'run' ? 'run' : state === 'stopped' ? 'warn' : state === 'wait' ? 'wait' : 'stop', 'data-step': st.id, 'data-state': state },
        h('span', { class: 'ic', 'aria-hidden': 'true' }, ICON[state] || String(n + 1)),
        h('div', { class: 'st' }, (n + 1) + '. ' + st.title, h('span', { class: 'visually-hidden' }, ' (' + state + ')')),
        t && t.detail ? h('div', { class: 'sum' }, t.detail) : null,
        t && t.progress != null && state === 'run' ? h('div', { class: 'progress' }, h('i', { style: 'width:' + Math.round(t.progress * 100) + '%' })) : null,
        t && t.items && t.items.length && st.id !== 'plan' ? h('details', {}, h('summary', {}, 'Details'), h('ul', { class: 'small' }, t.items.map((x) => h('li', {}, x)))) : null));
    });
  }
  function results() {
    const r = S().run; if (!r) return null;
    const st = r.stats; const leads = (r.leadIds || []).map(app.lead).filter(Boolean);
    const k = (v, label, id) => h('div', { class: 'kpi', 'data-kpi': id }, h('div', { class: 'v' }, String(v)), h('div', { class: 'k' }, label));
    return h('section', { class: 'panel', id: 'run-results', style: 'margin-top:14px' },
      h('div', { class: 'row', style: 'margin-bottom:10px' }, h('h2', { class: 'grow', style: 'margin:0' }, 'Last run'), h('span', { class: 'small muted' }, LS.ui.when(r.at) + ' \u00b7 ' + r.model + (r.search ? ' + ' + r.search : ''))),
      h('div', { class: 'kpis' }, k(st.candidates, 'accounts considered', 'candidates'), k(st.matched, 'met your fit bar', 'matched'), k(st.blocked, 'skipped (do not contact)', 'blocked'), k(st.drafted, 'sequences drafted', 'drafted'), k(st.flags.stop + st.flags.warn, 'quality flags', 'flags')),
      st.errors ? h('div', { class: 'notice warn', style: 'margin-bottom:10px' }, st.errors + ' step(s) failed and fell back to local output. Open a lead to see its trace.') : null,
      h('ol', { class: 'rlist' }, leads.map((l) => h('li', {}, h('a', { href: '#lead/' + encodeURIComponent(l.id), class: 'rlink' }, h('b', {}, l.company.name), h('span', { class: 'row', style: 'gap:6px' }, app.fitChip(l.fit), app.statusChip(l), app.flagChip(l.quality), app.fictionalTag(l)))))),
      h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#leads' }, 'Review drafts'), h('a', { class: 'btn', href: '#outbox' }, 'Sequence preview')),
      h('p', { class: 'small muted', style: 'margin-bottom:0' }, 'Nothing was sent. Drafts wait for you to review, copy or open in your own mail app.'));
  }
  function render(main) {
    const run = app.running;
    const demo = S().settings.mode === 'demo';
    main.append(h('div', { class: 'hero' }, h('div', { class: 'grow' }, h('h1', {}, 'Find leads and draft outreach that cites its research'), h('p', { class: 'muted', style: 'margin:0' }, demo ? 'Demo mode: 25 fictional companies on .example domains, no key needed. Every run gives the same result.' : 'Live mode: ' + app.modeLabel() + (app.search() ? ' with Tavily web search.' : '. Add a Tavily key in Settings to search the web.')))));
    if (!S().seen && !run) main.append(h('div', { class: 'notice', style: 'margin-bottom:14px' }, h('b', {}, 'New here? '), 'Press ', h('b', {}, 'Run agent'), ' to watch the plan run on the fictional demo data. Edit the product and ICP first if you like. Nothing is ever sent.'));
    const traceEl = h('ol', { class: 'trace', id: 'trace', 'aria-live': 'polite' });
    paintTrace(traceEl, app.liveTrace && run ? app.liveTrace : (S().run && S().run.trace) || []);
    const side = h('div', {},
      h('section', { class: 'panel' },
        h('div', { class: 'row', style: 'margin-bottom:10px' }, h('h2', { class: 'grow', style: 'margin:0' }, 'Agent plan'),
          run ? h('button', { type: 'button', class: 'btn', id: 'stop-agent', onclick: app.stopAgent }, 'Stop') : null,
          h('button', { type: 'button', class: 'btn primary', id: 'run-agent', disabled: !!run, onclick: app.runAgent }, run ? 'Running\u2026' : S().run ? 'Run again' : 'Run agent')),
        h('p', { class: 'small muted', id: 'icp-desc' }, LS.icp.describe(S().icp)),
        traceEl),
      run ? null : results());
    main.append(h('div', { class: 'agent' }, form(), side));
  }
  app.views.agent = { render, paintTrace };
})();
