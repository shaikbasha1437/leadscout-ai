/* LeadScout research: turns what we know about an account into numbered facts with sources, then
   derives signals, likely pain points (clearly labelled hypotheses) and stakeholders.
   Demo research uses only the bundled fictional data plus anything the user pasted. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./text.js'), require('./icp.js'), require('../agentkit/guard.js'));
  else (root.LS = root.LS || {}).research = factory(root.LS.text, root.LS.icp, root.AgentKit.guard);
})(typeof self !== 'undefined' ? self : this, function (T, I, G) {
  'use strict';
  const poss = (n) => (/s$/i.test(n || '') ? n + '\u2019' : (n || 'The company') + '\u2019s');
  const site = (co) => (co.domain ? 'https://' + co.domain : co.website || '');
  /* Build the fact list. Every fact has an id (F1..), text, a source label/url/kind and an optional date.
     extra = { notes: user-pasted text, web: [{title,url,content,date}] } */
  function buildFacts(lead, extra) {
    const co = lead.company || {}; const facts = []; const fictional = !!co.fictional;
    const tag = fictional ? ' (fictional)' : '';
    const push = (text, source, date, kind) => { if (!text) return; const id = 'F' + (facts.length + 1); facts.push({ id, text: String(text).trim(), source: source || {}, date: date || '', kind: kind || source.kind || 'data' }); return id; };
    if (co.about) push(co.about, { label: (co.name || 'Company') + ' website' + tag, url: site(co) ? site(co) + '/about' : '', kind: fictional ? 'demo' : 'import' }, '', 'about');
    if (co.employees || co.city || co.country) push([co.name, co.employees ? 'has about ' + co.employees + ' employees' : '', (co.city || co.country) ? 'and is based in ' + [co.city, co.country].filter(Boolean).join(', ') : ''].filter(Boolean).join(' ') + '.', { label: fictional ? 'Demo company profile (fictional)' : 'Your lead list', kind: fictional ? 'demo' : 'import' }, '', 'profile');
    if (co.tech && co.tech.length) push(poss(co.name) + ' data stack includes ' + co.tech.join(', ') + '.', { label: fictional ? 'Demo tech profile (fictional)' : 'Your lead list', url: '', kind: fictional ? 'demo' : 'import' }, '', 'tech');
    const jobs = co.hiring || [];
    if (jobs.length) {
      const by = {}; jobs.forEach((j) => { by[j.role] = by[j.role] || { n: 0, date: j.date }; by[j.role].n++; if (j.date > by[j.role].date) by[j.role].date = j.date; });
      Object.keys(by).forEach((r) => push(co.name + ' is hiring ' + (by[r].n > 1 ? by[r].n + ' \u00d7 ' : (/^[aeiou]/i.test(r) ? 'an ' : 'a ')) + r + ' (posted ' + by[r].date + ').', { label: (co.name || 'Company') + ' careers page' + tag, url: site(co) ? site(co) + '/careers' : '', kind: fictional ? 'demo' : 'import' }, by[r].date, 'hiring'));
    }
    if (co.funding) push(co.name + ' raised a ' + co.funding.amount + ' ' + co.funding.round + (co.funding.lead ? ' led by ' + co.funding.lead : '') + ' on ' + co.funding.date + '.', { label: (co.funding.outlet || 'Fictional Business Wire') + (fictional && !/fictional/i.test(co.funding.outlet || 'Fictional') ? ' (fictional)' : ''), url: site(co) ? site(co) + '/news' : '', kind: fictional ? 'demo' : 'import' }, co.funding.date, 'funding');
    (co.news || []).forEach((n) => { const id = push(n.text, { label: n.outlet + (fictional && !/fictional/i.test(n.outlet) ? ' (fictional)' : '') + (n.title ? ' \u2014 \u201c' + n.title + '\u201d' : ''), url: n.url || (site(co) ? site(co) + '/news/' + T.slug(n.title || 'post') : ''), kind: fictional ? 'demo' : 'import' }, n.date, 'news'); if (id && n.title) facts[facts.length - 1].title = n.title; });
    const ex = extra || {};
    if (ex.notes && String(ex.notes).trim()) {
      T.sentences(G.sanitize(ex.notes)).filter((s) => T.wordCount(s) >= 3).slice(0, 12).forEach((s) => push(s, { label: 'Your research notes', kind: 'note' }, '', 'note'));
    }
    (ex.web || []).slice(0, 8).forEach((w) => {
      const snippet = T.sentences(G.sanitize(w.content || '')).filter((s) => T.wordCount(s) >= 4).slice(0, 2).join(' ');
      if (snippet) push(snippet.slice(0, 400), { label: w.title || w.url, url: w.url, kind: 'web' }, w.date || '', 'web');
    });
    // Mark facts whose text tries to instruct an AI (prompt injection) so they are never quoted.
    facts.forEach((f) => { const d = G.detectInjection(f.text); if (d.flagged) { f.injection = d.findings.map((x) => x.label); } });
    return facts;
  }
  function productFacts(product) {
    const p = product || {}; const out = [];
    const push = (text, kind) => { if (text && String(text).trim()) out.push({ id: 'P' + (out.length + 1), text: String(text).trim(), source: { label: 'Your product description', kind: 'product' }, kind }); };
    push(p.pitch, 'pitch');
    T.list(p.valueProps).forEach((v) => push(v, 'value'));
    T.list(p.proofPoints).forEach((v) => push(v, 'proof'));
    return out;
  }
  // Signals to write about, most useful first.
  function signals(facts, asOf) {
    const now = asOf || new Date().toISOString().slice(0, 10);
    const rank = { news: 3, funding: 3, hiring: 2, note: 2, web: 2, tech: 1 };
    return facts.filter((f) => rank[f.kind] && !f.injection).map((f) => {
      const age = f.date ? T.daysBetween(f.date, now) : null;
      const recent = age == null ? 0.5 : age <= 45 ? 1 : age <= 120 ? 0.7 : 0.3;
      const pain = PAIN_RULES.some((r) => r.re.test(f.text)) ? 1 : 0;
      return { factId: f.id, type: f.kind, text: f.text, date: f.date, age, weight: rank[f.kind] + recent * 2 + pain * 1.5 };
    }).sort((a, b) => b.weight - a.weight);
  }
  const PAIN_RULES = [
    { id: 'freshness', re: /\b(stale|delay(ed|s)?|late|outage|downtime|unnoticed|apologi[sz]ed)\b/i, text: 'Late or broken data loads are reaching customers, which costs trust.' },
    { id: 'scale', re: /\bhiring\b.*\b(data|analytics)\b|\b(doubled|\d+ (dbt )?models|billion events|10 million)\b/i, text: 'The data team and pipeline count are growing faster than they can be watched by hand.' },
    { id: 'pressure', re: /\braised\b|\bseries [a-d]\b|\bseed\b/i, text: 'New funding usually comes with pressure to ship data products quickly.' },
    { id: 'compliance', re: /\b(audit|lineage|soc 2|regulators?|governance)\b/i, text: 'They have to prove data quality and lineage to auditors or customers.' },
    { id: 'realtime', re: /\b(real-time|live|every \d+ minutes|same-day|by 6 am|daily|weekly)\b/i, text: 'Tighter freshness promises leave less room for a silent failure.' },
    { id: 'migration', re: /\b(migrat\w*|moving .* to)\b/i, text: 'A warehouse migration is a common time for pipelines to break quietly.' },
    { id: 'expansion', re: /\b(expand\w*|launched in|new (market|office)|opened)\b/i, text: 'New markets or offices mean new data sources and more reports to keep correct.' }
  ];
  function pains(facts) {
    const out = [];
    PAIN_RULES.forEach((r) => {
      const basis = facts.filter((f) => !f.injection && f.kind !== 'about' && r.re.test(f.text)).map((f) => f.id);
      if (basis.length) out.push({ id: r.id, text: r.text, basis, hypothesis: true });
    });
    return out.slice(0, 4);
  }
  function stakeholders(lead, icp) {
    const roles = T.list((icp || {}).roles);
    const ranked = I.rankPeople(lead.people || [], roles);
    const named = ranked.filter((p) => p.match.score >= 0.34).map((p) => ({ name: [p.first, p.last].filter(Boolean).join(' '), first: p.first, title: p.title, email: p.email, why: 'Matches \u201c' + p.match.role + '\u201d', score: p.match.score }));
    const others = ranked.filter((p) => p.match.score < 0.34).map((p) => ({ name: [p.first, p.last].filter(Boolean).join(' '), first: p.first, title: p.title, email: p.email, why: 'Possible sponsor or influencer', score: p.match.score }));
    const covered = new Set(named.map((n) => n.why));
    const suggest = roles.filter((r) => !covered.has('Matches \u201c' + r + '\u201d')).slice(0, 2).map((r) => ({ name: '', title: r, why: 'Target role: find this person yourself (LeadScout never looks people up)', score: 0 }));
    return named.concat(others).concat(named.length ? [] : suggest).slice(0, 5);
  }
  function summary(lead, facts) {
    const co = lead.company || {};
    const about = facts.find((f) => f.kind === 'about');
    const bits = [co.name + (co.industry ? ' is a' + (/^[aeiou]/i.test(co.industry) ? 'n ' : ' ') + co.industry + ' company' : '') + (co.employees ? ' with about ' + co.employees + ' people' : '') + (co.city || co.country ? ' in ' + [co.city, co.country].filter(Boolean).join(', ') : '') + '.'];
    if (about) bits.push(about.text);
    const n = facts.filter((f) => ['news', 'funding', 'hiring', 'note', 'web'].includes(f.kind) && !f.injection).length;
    bits.push(n ? n + ' recent signal' + (n > 1 ? 's' : '') + ' found.' : 'No recent signals found; personalise with your own notes.');
    return bits.join(' ');
  }
  /* Full demo research for one lead. */
  function research(lead, ctx) {
    const c = ctx || {};
    const facts = buildFacts(lead, { notes: lead.researchNotes, web: c.web });
    const sig = signals(facts, c.asOf);
    const injected = facts.filter((f) => f.injection);
    return {
      summary: summary(lead, facts), facts, productFacts: productFacts(c.product), signals: sig, pains: pains(facts), stakeholders: stakeholders(lead, c.icp),
      injection: injected.map((f) => ({ factId: f.id, findings: f.injection })), by: 'demo', at: c.now || new Date().toISOString()
    };
  }
  return { poss, buildFacts, productFacts, signals, pains, stakeholders, summary, research, PAIN_RULES };
});
