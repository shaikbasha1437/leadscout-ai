/* LeadScout agent: plan -> find -> score -> do-not-contact -> research -> draft -> check.
   Each step reports progress through onStep so the UI can show a live trace.
   deps.llm(req) and deps.search ({search, extract}) are optional; without them everything runs on the
   bundled fictional data and the deterministic demo composer. Nothing is ever sent. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./text.js'), require('./icp.js'), require('./research.js'), require('./compose.js'), require('./quality.js'), require('./compliance.js'), require('./live.js'));
  else (root.LS = root.LS || {}).agent = factory(root.LS.text, root.LS.icp, root.LS.research, root.LS.compose, root.LS.quality, root.LS.compliance, root.LS.live);
})(typeof self !== 'undefined' ? self : this, function (T, I, R, D, Q, C, L) {
  'use strict';
  const DEMO_AS_OF = '2026-11-01'; // the fictional dataset is written as of this date
  const STEPS = [
    { id: 'plan', title: 'Plan the run' },
    { id: 'find', title: 'Find candidate accounts' },
    { id: 'score', title: 'Score fit against your ICP' },
    { id: 'dnc', title: 'Check the do-not-contact list' },
    { id: 'research', title: 'Research each account' },
    { id: 'draft', title: 'Draft outreach (email, LinkedIn, 2 follow-ups)' },
    { id: 'check', title: 'Quality-check every draft' }
  ];
  const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
  const keyOf = (co) => String((co && (co.domain || co.name)) || '').toLowerCase().replace(/^www\./, '').trim();
  const asOfFor = (lead, today) => (lead.company && lead.company.fictional ? DEMO_AS_OF : today);
  function demoLead(co) {
    return { id: 'demo-' + co.id, company: { name: co.name, domain: co.domain, industry: co.industry, employees: co.employees, country: co.country, city: co.city, founded: co.founded, about: co.about, tech: co.tech.slice(), hiring: co.hiring.map((h) => Object.assign({}, h)), funding: co.funding ? Object.assign({}, co.funding) : null, news: co.news.map((n) => Object.assign({}, n)), fictional: true }, people: co.people.map((p) => Object.assign({}, p, { email: p.email + co.domain })), contact: null, source: 'demo', status: 'new', notes: '', researchNotes: '', urls: [] };
  }
  function webLead(c) {
    return { id: 'web-' + T.slug(c.domain || c.name), company: { name: c.name, domain: c.domain, industry: c.industry, employees: c.employees, country: c.country, city: '', tech: [], hiring: [], news: [], funding: null, fictional: false }, people: [], contact: null, source: 'web', status: 'new', notes: '', researchNotes: '', urls: [], web: c.evidence.map((e) => ({ title: e.title, url: e.url, content: e.content, date: e.date })) };
  }
  function contactFor(lead, fit) {
    if (lead.contact && (lead.contact.first || lead.contact.email)) return lead.contact;
    const c = fit && fit.contact;
    return c ? { first: c.first, last: c.last, title: c.title, email: c.email } : null;
  }
  function checkCtx(lead, research, opts) {
    return { lead, facts: research.facts, productFacts: research.productFacts, sender: opts.sender, product: opts.product };
  }
  /* Research one lead. Returns { research, trace[] } */
  async function researchLead(lead, opts, deps) {
    const today = opts.today || new Date().toISOString().slice(0, 10);
    const trace = []; const t0 = Date.now(); let web = (lead.web || []).slice();
    if (deps.search && !lead.company.fictional) {
      try {
        const q = '"' + lead.company.name + '"' + (lead.company.domain ? ' ' + lead.company.domain : '') + ' news funding hiring';
        const hits = await deps.search.search(q, { max: 5, timeRange: 'year', dates: true });
        web = web.concat(hits.slice(0, 5)); trace.push({ step: 'research', by: 'Tavily search', note: hits.length + ' result' + (hits.length === 1 ? '' : 's') + ' for \u201c' + q + '\u201d' });
      } catch (e) { trace.push({ step: 'research', by: 'Tavily search', error: e.message }); }
    }
    const urls = (lead.urls || []).filter((u) => /^https?:\/\//i.test(u));
    if (urls.length) {
      if (deps.search) {
        try { const ex = await deps.search.extract(urls); web = ex.results.concat(web); trace.push({ step: 'research', by: 'Tavily extract', note: 'Read ' + ex.results.length + ' of ' + urls.length + ' pasted URL' + (urls.length > 1 ? 's' : '') + (ex.failed.length ? ' (failed: ' + ex.failed.join(', ') + ')' : '') }); } catch (e) { trace.push({ step: 'research', by: 'Tavily extract', error: e.message }); }
      } else trace.push({ step: 'research', by: 'local', note: 'Pasted URLs were not opened: browsers block reading other sites. Add a Tavily key, or paste the page text into research notes.' });
    }
    const base = R.research(lead, { icp: opts.icp, product: opts.product, asOf: asOfFor(lead, today), web, now: opts.now });
    base.by = 'demo';
    if (deps.llm) {
      try {
        const res = await deps.llm(L.researchPrompt(lead, base.facts, opts.icp, opts.product));
        const v = L.validateResearch(L.parseJSON(res.text), base.facts);
        if (v.summary) base.summary = v.summary;
        if (v.signals.length) {
          const pick = v.signals.map((s) => Object.assign({}, base.signals.find((b) => b.factId === s.factId) || { factId: s.factId, type: (base.facts.find((f) => f.id === s.factId) || {}).kind, text: (base.facts.find((f) => f.id === s.factId) || {}).text, weight: 0 }, { why: s.why }));
          base.signals = pick.concat(base.signals.filter((b) => !pick.some((p) => p.factId === b.factId)));
        }
        if (v.pains.length) base.pains = v.pains;
        const known = new Set((lead.people || []).map((p) => T.norm([p.first, p.last].filter(Boolean).join(' '))));
        v.stakeholders.forEach((s) => { if (s.name && !known.has(T.norm(s.name))) s.name = ''; if (!base.stakeholders.some((b) => T.norm(b.title) === T.norm(s.title))) base.stakeholders.push({ name: s.name, title: s.title, why: s.why || 'Suggested by the model', score: 0 }); });
        base.stakeholders = base.stakeholders.slice(0, 6);
        base.angle = v.angle; base.by = res.model || 'model';
        trace.push({ step: 'research', by: base.by, note: 'Model summary, ' + v.signals.length + ' signals, ' + v.pains.length + ' pains' + (v.dropped ? '; dropped ' + v.dropped + ' item(s) that cited no valid fact' : ''), cost: res.cost || 0 });
      } catch (e) { trace.push({ step: 'research', by: 'model', error: e.message + ' \u2014 used local research instead.' }); }
    } else trace.push({ step: 'research', by: 'demo', note: base.facts.length + ' facts, ' + base.signals.length + ' signals, ' + base.pains.length + ' likely pains' });
    trace[trace.length - 1].ms = Date.now() - t0;
    return { research: base, trace };
  }
  /* Draft one lead. Returns { draft, quality, trace[] } */
  async function draftLead(lead, research, opts, deps) {
    const trace = []; let d = null; const t0 = Date.now();
    if (deps.llm) {
      try {
        const res = await deps.llm(L.draftPrompt(lead, research, opts.product, opts.sender, opts.tone));
        d = L.validateDraft(L.parseJSON(res.text), opts.sender, opts.tone, lead.contact);
        d.by = res.model || 'model'; d.variant = opts.variant || 0; d.at = opts.now || new Date().toISOString();
        d.used = T.markers([d.email.body, d.linkedin].concat(d.followups.map((f) => f.body)).join('\n'));
        trace.push({ step: 'draft', by: d.by, note: 'Model draft (' + (D.TONES[opts.tone] || D.TONES.friendly).label + ')', cost: res.cost || 0 });
      } catch (e) { trace.push({ step: 'draft', by: 'model', error: e.message + ' \u2014 used the demo composer instead.' }); d = null; }
    }
    if (!d) { d = D.draft(lead, research, { tone: opts.tone, variant: opts.variant, product: opts.product, sender: opts.sender, now: opts.now }); if (!deps.llm) trace.push({ step: 'draft', by: 'demo', note: 'Demo composer (' + (D.TONES[d.tone] || D.TONES.friendly).label + ')' }); }
    const quality = Q.checkSequence(d, checkCtx(lead, research, opts));
    trace.push({ step: 'check', by: 'local', note: quality.flags.length ? quality.counts.stop + ' stop, ' + quality.counts.warn + ' warn, ' + quality.counts.info + ' info' : 'No flags' });
    trace[trace.length - 1].ms = Date.now() - t0;
    return { draft: d, quality, trace };
  }
  /* Run the whole pipeline.
     opts = { icp, product, sender, tone, leads (existing), dataset (demo companies or null), dnc (parsed list), today, now, delay, signal, onStep }
     deps = { llm?, search? } */
  async function run(optsIn, depsIn) {
    const opts = Object.assign({ tone: 'friendly', delay: 0, leads: [], dnc: [] }, optsIn || {});
    const deps = depsIn || {}; const icp = I.normalize(opts.icp); opts.icp = icp;
    const today = opts.today || new Date().toISOString().slice(0, 10); opts.today = today;
    const trace = []; const stats = { candidates: 0, matched: 0, blocked: 0, researched: 0, drafted: 0, kept: 0, flags: { stop: 0, warn: 0, info: 0 }, cost: 0, errors: 0 };
    const emit = (id, state, detail, extra) => { const s = Object.assign({ id, title: STEPS.find((x) => x.id === id).title, state, detail: detail || '', at: Date.now() }, extra || {}); const i = trace.findIndex((t) => t.id === id); if (i >= 0) trace[i] = Object.assign(trace[i], s); else trace.push(s); if (opts.onStep) opts.onStep(s, trace); };
    const stopped = () => opts.signal && opts.signal.aborted;
    const result = (extra) => Object.assign({ trace, stats, leads: out, at: opts.now || new Date().toISOString(), mode: deps.llm ? 'live' : 'demo', search: deps.search ? deps.search.label || 'search' : '' }, extra || {});
    let out = [];
    // 1. plan
    emit('plan', 'run');
    const plan = ['Look for ' + I.describe(icp) + '.', 'Sources: ' + [opts.dataset ? opts.dataset.length + ' fictional demo companies' : '', (opts.leads || []).filter((l) => l.source !== 'demo').length ? 'your ' + (opts.leads || []).filter((l) => l.source !== 'demo').length + ' imported/added leads' : '', deps.search && deps.llm ? 'a Tavily web search' : ''].filter(Boolean).join(', ') + '.', 'Keep the top ' + icp.maxLeads + ' with fit \u2265 ' + icp.minFit + ', then research and draft each.', deps.llm ? 'Research and drafts by your model; fit scores and quality checks stay local.' : 'Demo mode: no model is called; drafts come from the deterministic composer.'];
    await sleep(opts.delay);
    emit('plan', 'done', plan.join(' '), { items: plan });
    // 2. find
    emit('find', 'run');
    const pool = new Map(); const existing = new Map();
    (opts.leads || []).forEach((l) => { existing.set(keyOf(l.company), l); pool.set(keyOf(l.company), l); });
    (opts.dataset || []).forEach((co) => { const k = keyOf(co); if (!pool.has(k)) pool.set(k, demoLead(co)); });
    let findNote = '';
    if (deps.search && deps.llm && !stopped()) {
      try {
        const q = L.searchQuery(icp, opts.product);
        const hits = await deps.search.search(q, { max: 10 });
        const res = await deps.llm(L.findPrompt(hits, icp, icp.maxLeads)); stats.cost += res.cost || 0;
        const found = L.validateFind(L.parseJSON(res.text), hits);
        let added = 0; found.forEach((c) => { const k = keyOf(c); if (k && !pool.has(k)) { pool.set(k, webLead(c)); added++; } });
        findNote = ' Web search \u201c' + q + '\u201d returned ' + hits.length + ' results; the model named ' + found.length + ' companies (' + added + ' new).';
      } catch (e) { stats.errors++; findNote = ' Web search failed: ' + e.message; }
    } else if (deps.search && !deps.llm) findNote = ' Web search needs a model to read the results, so it was skipped.';
    const cands = [...pool.values()].filter((l) => l.status !== 'skipped' || !l.manualSkip);
    stats.candidates = cands.length;
    await sleep(opts.delay);
    emit('find', 'done', cands.length + ' candidate accounts.' + findNote, { count: cands.length });
    // 3. score
    emit('score', 'run');
    cands.forEach((l) => { l.fit = I.scoreFit(l.company, icp, l.people, asOfFor(l, today)); });
    const ranked = cands.slice().sort((a, b) => b.fit.score - a.fit.score || a.company.name.localeCompare(b.company.name));
    const pass = ranked.filter((l) => l.fit.score >= icp.minFit);
    const chosen = pass.slice(0, icp.maxLeads);
    stats.matched = pass.length;
    await sleep(opts.delay);
    emit('score', 'done', pass.length + ' of ' + cands.length + ' meet fit \u2265 ' + icp.minFit + '; keeping the top ' + chosen.length + '.', { items: chosen.map((l) => l.company.name + ' \u2014 ' + l.fit.score) });
    // 4. do-not-contact
    emit('dnc', 'run');
    const go = [];
    chosen.forEach((l) => { const b = C.blocked(l, opts.dnc); if (b) { l.status = 'skipped'; l.skipReason = b.reason; l.dnc = b.reason; stats.blocked++; } else { l.dnc = null; go.push(l); } });
    await sleep(opts.delay);
    emit('dnc', 'done', stats.blocked ? stats.blocked + ' skipped: ' + chosen.filter((l) => l.dnc).map((l) => l.company.name).join(', ') + '.' : 'No matches on your list.', { items: chosen.filter((l) => l.dnc).map((l) => l.company.name + ': ' + l.dnc) });
    // 5 + 6 + 7 per lead
    emit('research', 'run', '0 of ' + go.length); emit('draft', 'run', 'Waiting'); emit('check', 'run', 'Waiting');
    let i = 0;
    for (const l of go) {
      if (stopped()) break;
      if (l.status === 'approved' && l.draft) { stats.kept++; i++; continue; } // never overwrite an approved draft
      l.contact = contactFor(l, l.fit);
      const r = await researchLead(l, opts, deps);
      l.research = r.research; l.trace = r.trace; stats.researched++;
      r.trace.forEach((t) => { stats.cost += t.cost || 0; if (t.error) stats.errors++; });
      if (l.status === 'new') l.status = 'researched';
      emit('research', 'run', (i + 1) + ' of ' + go.length + ': ' + l.company.name, { progress: (i + 1) / go.length });
      await sleep(opts.delay / 2);
      if (stopped()) break;
      const d = await draftLead(l, l.research, Object.assign({}, opts, { tone: l.tone || opts.tone }), deps);
      l.draft = d.draft; l.quality = d.quality; l.trace = l.trace.concat(d.trace); stats.drafted++;
      d.trace.forEach((t) => { stats.cost += t.cost || 0; if (t.error) stats.errors++; });
      ['stop', 'warn', 'info'].forEach((k) => { stats.flags[k] += d.quality.counts[k]; });
      if (l.status === 'researched') l.status = 'drafted';
      l.updatedAt = opts.now || new Date().toISOString();
      emit('draft', 'run', (i + 1) + ' of ' + go.length + ': ' + l.company.name, { progress: (i + 1) / go.length });
      emit('check', 'run', stats.flags.stop + ' stop, ' + stats.flags.warn + ' warn so far');
      i++;
      await sleep(opts.delay / 2);
    }
    const halted = stopped();
    emit('research', halted ? 'stopped' : 'done', stats.researched + ' researched' + (stats.kept ? ', ' + stats.kept + ' approved kept as is' : '') + '.');
    emit('draft', halted ? 'stopped' : 'done', stats.drafted + ' sequences drafted (' + stats.drafted * 4 + ' messages). Nothing was sent.');
    emit('check', halted ? 'stopped' : 'done', stats.flags.stop + stats.flags.warn + stats.flags.info ? stats.flags.stop + ' stop, ' + stats.flags.warn + ' warn, ' + stats.flags.info + ' info flags.' : 'No flags raised.');
    out = chosen;
    // also return existing leads that were not chosen (with fresh fit), so the store keeps them
    const others = [...existing.values()].filter((l) => !chosen.includes(l));
    return result({ stopped: halted, others });
  }
  /* Redo one lead's draft (tone change or regenerate). */
  async function redraft(lead, opts, deps) {
    const o = Object.assign({ tone: 'friendly' }, opts || {});
    return draftLead(lead, lead.research, o, deps || {});
  }
  async function reresearch(lead, opts, deps) {
    const o = Object.assign({}, opts || {}); o.icp = I.normalize(o.icp);
    return researchLead(lead, o, deps || {});
  }
  function recheck(lead, opts) { return Q.checkSequence(lead.draft, checkCtx(lead, lead.research, opts || {})); }
  return { STEPS, DEMO_AS_OF, run, redraft, reresearch, recheck, demoLead, keyOf, asOfFor, contactFor };
});
