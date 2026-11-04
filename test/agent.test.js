const test = require('node:test'); const assert = require('node:assert/strict');
const { A, D, I, S, Q, baseOpts } = require('./helpers.js');
const T = require('../js/lead/text.js');

function mockLLM(over) {
  const calls = [];
  const fn = async (req) => {
    calls.push(req); const sys = req.system;
    if (over && over(req, calls)) return over(req, calls);
    if (/sales researcher/.test(sys)) return { text: JSON.stringify({ summary: 'Mock summary [F1].', signals: [{ fact: 'F1', why: 'context' }, { fact: 'F77', why: 'invented' }], pains: [{ text: 'Likely data checks by hand', basis: ['F1'] }], stakeholders: [{ role: 'Head of Data', name: 'Not A Real Person', why: 'owns pipelines' }], angle: 'reliability' }), cost: 0.001, model: 'mock-1' };
    if (/outreach drafts/.test(sys)) return { text: '```json\n' + JSON.stringify({ subject: 'Mock idea', email: 'Hi there,\n\nI read your company overview [F1]. Beaconly catches late or failed data loads before customers see stale dashboards [P2].\n\nOpen to a quick chat?\n\nNot relevant? Just reply \u201cno thanks\u201d and I won\u2019t follow up.', linkedin: 'Hi, saw your overview [F1]. Would be glad to connect.', followup1: 'One more thought [P2].\n\nNot relevant? Just reply \u201cno thanks\u201d and I won\u2019t follow up.', followup2: 'Last note from me.\n\nNot relevant? Just reply \u201cno thanks\u201d and I won\u2019t follow up.' }) + '\n```', cost: 0.002, model: 'mock-1' };
    if (/candidate companies/.test(sys)) return { text: JSON.stringify({ companies: [{ name: 'Webfound Data', domain: 'webfound.example', industry: 'SaaS', country: 'Germany', employees: 200, evidence: [1] }, { name: 'Ghost', domain: 'ghost.example', evidence: [9] }] }), cost: 0.001, model: 'mock-1' };
    throw new Error('unexpected prompt');
  };
  fn.calls = calls; return fn;
}

test('demo run: 7 visible steps, deterministic results, nothing sent', async () => {
  const steps = []; const a = await A.run(baseOpts({ onStep: (s) => steps.push(s.id + ':' + s.state) }));
  const b = await A.run(baseOpts());
  assert.deepEqual(a.trace.map((t) => t.id), ['plan', 'find', 'score', 'dnc', 'research', 'draft', 'check']);
  assert.ok(a.trace.every((t) => t.state === 'done'));
  assert.ok(steps.includes('plan:run') && steps.includes('check:done'));
  assert.equal(a.mode, 'demo'); assert.equal(a.stats.candidates, 25);
  assert.equal(a.leads.length, 12); assert.equal(a.stats.drafted, 11); assert.equal(a.stats.blocked, 1);
  assert.equal(a.stats.flags.stop, 0);
  assert.deepEqual(a.leads.map((l) => l.id), b.leads.map((l) => l.id));
  assert.deepEqual(a.leads.map((l) => l.draft && l.draft.email.body), b.leads.map((l) => l.draft && l.draft.email.body));
  assert.match(a.trace.find((t) => t.id === 'draft').detail, /Nothing was sent/);
  a.leads.forEach((l) => assert.ok(l.company.fictional));
});
test('leads are ranked by fit and respect minFit / maxLeads', async () => {
  const r = await A.run(baseOpts({ icp: Object.assign({}, I.DEFAULT_ICP, { maxLeads: 5, minFit: 80 }) }));
  assert.ok(r.leads.length <= 5);
  r.leads.forEach((l) => assert.ok(l.fit.score >= 80));
  const s = r.leads.map((l) => l.fit.score); assert.deepEqual(s, s.slice().sort((x, y) => y - x));
});
test('DNC: blocked leads are skipped with a reason and get no draft', async () => {
  const r = await A.run(baseOpts({ dnc: require('../js/lead/compliance.js').parseList('cobalt-freight.example\naurora-ops.example') }));
  const sk = r.leads.filter((l) => l.status === 'skipped');
  assert.equal(r.stats.blocked, 2); assert.equal(sk.length, 2);
  sk.forEach((l) => { assert.match(l.dnc, /do-not-contact/); assert.ok(!l.draft); });
});
test('approved drafts are never overwritten by a new run', async () => {
  const first = await A.run(baseOpts());
  const leads = JSON.parse(JSON.stringify(first.leads));
  const ap = leads.find((l) => l.status === 'drafted'); ap.status = 'approved'; ap.draft.email.body = 'MY HAND EDIT';
  const r = await A.run(baseOpts({ leads, tone: 'formal' }));
  const again = r.leads.find((l) => l.id === ap.id);
  assert.equal(again.status, 'approved'); assert.equal(again.draft.email.body, 'MY HAND EDIT'); assert.equal(r.stats.kept, 1);
});
test('imported leads join the pool and existing leads not chosen come back in "others"', async () => {
  const mine = { id: 'u1', company: { name: 'Tiny Shop', domain: 'tiny.example', industry: 'Retail', employees: 3, country: 'Peru' }, people: [], contact: null, status: 'new', source: 'import' };
  const r = await A.run(baseOpts({ leads: [mine] }));
  assert.equal(r.stats.candidates, 26);
  assert.ok(r.others.some((l) => l.id === 'u1'));
  assert.ok(r.others[0].fit, 'fit refreshed');
});
test('live run: model research and drafts, invalid citations dropped, invented names removed, rules local', async () => {
  const llm = mockLLM();
  const r = await A.run(baseOpts({ icp: Object.assign({}, I.DEFAULT_ICP, { maxLeads: 3 }) }), { llm });
  assert.equal(r.mode, 'live');
  const l = r.leads.find((x) => x.draft);
  assert.equal(l.research.by, 'mock-1'); assert.equal(l.draft.by, 'mock-1');
  assert.ok(l.research.signals.every((s) => s.factId !== 'F77'));
  assert.ok(l.research.stakeholders.every((s) => s.name !== 'Not A Real Person'));
  assert.match(l.draft.email.body, /Alex Rivera/);
  assert.ok(l.fit.reasons.length === 7, 'fit still local');
  assert.ok(r.stats.cost > 0);
  assert.ok(llm.calls.some((c) => /<facts>/.test(c.messages[0].content)));
});
test('model failures fall back to the local composer and are recorded', async () => {
  const llm = async () => { throw new Error('HTTP 401: bad key'); };
  const r = await A.run(baseOpts({ icp: Object.assign({}, I.DEFAULT_ICP, { maxLeads: 2 }) }), { llm });
  const l = r.leads.find((x) => x.draft);
  assert.equal(l.draft.by, 'demo');
  assert.ok(l.trace.some((t) => t.error && /used the demo composer/.test(t.error)));
  assert.ok(l.trace.some((t) => t.error && /local research/.test(t.error)));
  assert.ok(r.stats.errors >= 2);
});
test('garbage model output also falls back safely', async () => {
  const llm = async () => ({ text: 'I cannot help with that.', cost: 0, model: 'mock' });
  const r = await A.run(baseOpts({ icp: Object.assign({}, I.DEFAULT_ICP, { maxLeads: 1 }) }), { llm });
  assert.ok(r.leads[0].draft && r.leads[0].draft.email.body.length > 50);
});
test('web search + model can add companies, but only with evidence', async () => {
  const search = { label: 'Tavily', search: async () => [{ title: 'Webfound raises', url: 'https://news.example/webfound', content: 'Webfound Data raised' }], extract: async () => ({ results: [], failed: [] }) };
  const r = await A.run(baseOpts({ dataset: [] , icp: Object.assign({}, I.DEFAULT_ICP, { minFit: 0 }) }), { llm: mockLLM(), search });
  assert.equal(r.stats.candidates, 1);
  assert.equal(r.leads[0].company.name, 'Webfound Data');
  assert.match(r.trace.find((t) => t.id === 'find').detail, /Web search/);
  assert.equal(r.search, 'Tavily');
});
test('search without a model is skipped with a note', async () => {
  const r = await A.run(baseOpts({ icp: Object.assign({}, I.DEFAULT_ICP, { maxLeads: 1 }) }), { search: { label: 'Tavily', search: async () => { throw new Error('should not run'); } } });
  assert.match(r.trace.find((t) => t.id === 'find').detail, /needs a model/);
});
test('pasted URLs without search are not fetched and the trace says why', async () => {
  const first = await A.run(baseOpts({ icp: Object.assign({}, I.DEFAULT_ICP, { maxLeads: 1 }) }));
  const l = first.leads[0]; l.urls = ['https://somewhere.example/page'];
  const r = await A.reresearch(l, baseOpts(), {});
  assert.ok(r.trace.some((t) => /browsers block/.test(t.note || '')));
});
test('stopping mid-run marks steps stopped and keeps finished work', async () => {
  const ac = new AbortController(); let n = 0;
  const llm = mockLLM((req) => { if (/outreach drafts/.test(req.system) && ++n === 2) ac.abort(); return null; });
  const r = await A.run(baseOpts({ signal: ac.signal }), { llm });
  assert.equal(r.stopped, true);
  assert.equal(r.trace.find((t) => t.id === 'draft').state, 'stopped');
  assert.ok(r.stats.drafted >= 1 && r.stats.drafted < 11);
});
test('redraft with a new tone and variant; recheck runs the same quality rules', async () => {
  const first = await A.run(baseOpts({ icp: Object.assign({}, I.DEFAULT_ICP, { maxLeads: 1 }) }));
  const l = first.leads[0];
  const d = await A.redraft(l, baseOpts({ tone: 'formal', variant: 1 }), {});
  assert.equal(d.draft.tone, 'formal'); assert.notEqual(d.draft.email.body, l.draft.email.body);
  l.draft = d.draft; l.draft.email.body += '\n\nWe doubled revenue for 300 clients.';
  const q = A.recheck(l, baseOpts());
  assert.ok(q.flags.some((f) => f.id === 'unverified'));
});
test('keyOf dedupes by domain then name', () => {
  assert.equal(A.keyOf({ domain: 'WWW.Acme.example', name: 'Acme' }), A.keyOf({ domain: 'acme.example', name: 'ACME Inc' }));
});
test('demo leads carry valid fictional emails', () => {
  D.forEach((c) => A.demoLead(c).people.forEach((p) => { if (p.email) assert.match(p.email, /^[a-z0-9.-]+@[a-z0-9-]+\.example$/, p.email); }));
});
