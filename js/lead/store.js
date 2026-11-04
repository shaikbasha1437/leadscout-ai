/* LeadScout persistence (localStorage), exports and share links. API keys live in AgentKit.keystore
   under their own names and are never part of state, exports or share links. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../agentkit/keystore.js'), require('./icp.js'), require('./text.js'), require('./csv.js'), require('./compliance.js'));
  else (root.LS = root.LS || {}).store = factory(root.AgentKit.keystore, root.LS.icp, root.LS.text, root.LS.csv, root.LS.compliance);
})(typeof self !== 'undefined' ? self : this, function (KS, I, T, CSV, C) {
  'use strict';
  const KEY = 'leadscout.state.v1';
  const STATUSES = ['new', 'researched', 'drafted', 'approved', 'skipped'];
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const DEFAULT_SENDER = { name: 'Alex Rivera', title: 'Founder', company: 'Beaconly (fictional)', address: '100 Example Street, Springfield, USA', email: 'alex@beaconly.example' };
  function defaultSettings() { return { mode: 'demo', provider: 'openai', models: {}, baseUrl: '', keyMode: 'local', webllmModel: '', theme: 'auto', tone: 'friendly', cadence: [4, 9], animate: true, useSearch: true, demoData: true }; }
  function blank() { return { v: 1, product: clone(I.DEFAULT_PRODUCT), icp: clone(I.DEFAULT_ICP), sender: clone(DEFAULT_SENDER), settings: defaultSettings(), leads: [], dnc: C.parseList('cobalt-freight.example'), run: null, prices: {}, seen: false }; }
  function migrate(j) {
    const b = blank();
    const out = Object.assign(b, j || {});
    out.settings = Object.assign(defaultSettings(), (j && j.settings) || {});
    out.product = Object.assign(clone(I.DEFAULT_PRODUCT), (j && j.product) || {});
    out.icp = Object.assign(clone(I.DEFAULT_ICP), (j && j.icp) || {});
    out.sender = Object.assign({}, DEFAULT_SENDER, (j && j.sender) || {});
    out.leads = Array.isArray(out.leads) ? out.leads.filter((l) => l && l.company && l.company.name) : [];
    out.leads.forEach((l) => { if (!STATUSES.includes(l.status)) l.status = 'new'; l.id = l.id || T.uid('lead'); l.notes = l.notes || ''; l.researchNotes = l.researchNotes || ''; l.urls = Array.isArray(l.urls) ? l.urls : []; l.people = Array.isArray(l.people) ? l.people : []; });
    out.dnc = Array.isArray(out.dnc) ? out.dnc.filter((e) => e && e.type && e.value) : [];
    return out;
  }
  function load(storage) {
    const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    try { const raw = s && s.getItem(KEY); return raw ? migrate(JSON.parse(raw)) : blank(); } catch (e) { return blank(); }
  }
  function save(state, storage, known) {
    const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!s) return { ok: false };
    const clean = JSON.stringify(KS.redact(state, known));
    try { s.setItem(KEY, clean); return { ok: true, bytes: clean.length }; } catch (e) { return { ok: false, error: 'Browser storage is full. Export your leads and delete some.' }; }
  }
  function exportWorkspace(state, known) {
    return KS.redact({ app: 'leadscout-ai', v: 1, exportedAt: new Date().toISOString(), note: 'API keys are never included in exports. Demo companies are fictional.', product: state.product, icp: state.icp, sender: state.sender, settings: state.settings, leads: state.leads, dnc: state.dnc, prices: state.prices }, known);
  }
  function importWorkspace(obj) {
    if (!obj || obj.app !== 'leadscout-ai') throw new Error('That file isn\u2019t a LeadScout AI export.');
    const clean = KS.redact(obj);
    return migrate({ product: clean.product, icp: clean.icp, sender: clean.sender, settings: clean.settings, leads: clean.leads, dnc: clean.dnc, prices: clean.prices, seen: true });
  }
  const flagText = (l) => (l.quality ? l.quality.flags.map((f) => f.level + ': ' + f.msg).join(' | ') : '');
  const CSV_HEADER = ['company', 'domain', 'industry', 'employees', 'country', 'status', 'fit', 'first_name', 'last_name', 'title', 'email', 'email_subject', 'email_body', 'linkedin_note', 'followup_1', 'followup_2', 'flags', 'notes', 'fictional', 'sent'];
  function leadsCSV(leads, known) {
    const rows = leads.map((l) => { const c = l.contact || {}; const d = l.draft || {}; const co = l.company; const fu = d.followups || [];
      return [co.name, co.domain, co.industry, co.employees, co.country, l.status, l.fit ? l.fit.score : '', c.first, c.last, c.title, c.email, d.email ? T.stripMarkers(d.email.subject) : '', d.email ? T.stripMarkers(d.email.body) : '', d.linkedin ? T.stripMarkers(d.linkedin) : '', fu[0] ? T.stripMarkers(fu[0].body) : '', fu[1] ? T.stripMarkers(fu[1].body) : '', flagText(l), l.notes, co.fictional ? 'yes' : 'no', 'no'].map((v) => KS.redactString(v == null ? '' : v, known)); });
    return CSV.serialize(CSV_HEADER, rows);
  }
  function leadsJSON(leads, known) {
    return KS.redact({ app: 'leadscout-ai', kind: 'leads', exportedAt: new Date().toISOString(), note: 'Drafts only: nothing here was sent. Citation markers like [F2] point to research.facts.', leads: leads.map((l) => ({ id: l.id, company: l.company, contact: l.contact, status: l.status, fit: l.fit, notes: l.notes, research: l.research ? { summary: l.research.summary, facts: l.research.facts, pains: l.research.pains, stakeholders: l.research.stakeholders } : null, draft: l.draft, quality: l.quality ? { flags: l.quality.flags, counts: l.quality.counts } : null, sent: false })) }, known);
  }
  function b64e(s) { return typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64'); }
  function b64d(s) { return typeof atob !== 'undefined' ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, 'base64').toString('utf8'); }
  // Share link: product, ICP and tone only. No leads, notes, sender details, settings or keys.
  const PRODUCT_FIELDS = ['name', 'pitch', 'valueProps', 'proofPoints'];
  const ICP_FIELDS = Object.keys(I.DEFAULT_ICP);
  function pickFields(o, f) { const r = {}; f.forEach((k) => { if (o && o[k] != null) r[k] = o[k]; }); return r; }
  function shareLink(baseUrl, state, known) {
    const payload = KS.redact({ p: pickFields(state.product, PRODUCT_FIELDS), i: pickFields(state.icp, ICP_FIELDS), t: state.settings.tone }, known);
    return String(baseUrl).split('#')[0] + '#share=' + encodeURIComponent(b64e(JSON.stringify(payload)));
  }
  function readShareHash(hash) {
    const m = String(hash || '').match(/#share=([^&]+)/);
    if (!m) return null;
    try {
      const j = KS.redact(JSON.parse(b64d(decodeURIComponent(m[1]))));
      const cap = (v) => (typeof v === 'string' ? v.slice(0, 2000) : Array.isArray(v) ? v.slice(0, 40).map((x) => String(x).slice(0, 300)) : typeof v === 'number' || typeof v === 'boolean' ? v : undefined);
      const p = {}; PRODUCT_FIELDS.forEach((k) => { const v = cap(j.p && j.p[k]); if (v !== undefined) p[k] = v; });
      const i = {}; ICP_FIELDS.forEach((k) => { const v = cap(j.i && j.i[k]); if (v !== undefined) i[k] = v; });
      return { product: p, icp: I.normalize(i), tone: ['friendly', 'direct', 'formal', 'consultative'].includes(j.t) ? j.t : 'friendly' };
    } catch (e) { return null; }
  }
  /* Merge an agent run into the lead list: run leads replace ones with the same id, others stay. */
  function mergeRun(leads, runLeads) {
    const byId = new Map(leads.map((l) => [l.id, l]));
    runLeads.forEach((l) => byId.set(l.id, l));
    const order = runLeads.map((l) => l.id);
    return order.map((id) => byId.get(id)).concat(leads.filter((l) => !order.includes(l.id)));
  }
  return { KEY, STATUSES, DEFAULT_SENDER, blank, load, save, migrate, defaultSettings, exportWorkspace, importWorkspace, leadsCSV, leadsJSON, shareLink, readShareHash, mergeRun, CSV_HEADER };
});
