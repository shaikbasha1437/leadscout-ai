const test = require('node:test'); const assert = require('node:assert/strict');
const { I, D, A, co } = require('./helpers.js');

test('demo dataset: 25 fictional companies, .example domains, labelled people', () => {
  assert.equal(D.length, 25);
  const ids = new Set();
  D.forEach((c) => {
    assert.ok(c.fictional, c.id + ' marked fictional');
    assert.match(c.domain, /\.example$/, c.id);
    assert.ok(!ids.has(c.id)); ids.add(c.id);
    (c.people || []).forEach((p) => { if (p.email) assert.match(p.email, /@[a-z0-9-]+\.example$/); });
    (c.news || []).forEach((n) => assert.match(n.outlet || '', /fictional/i, c.id + ' news outlet labelled'));
  });
});
test('regions: country inside a region, explicit country, and no match', () => {
  assert.equal(I.regionMatch('Germany', ['Europe']).ok, true);
  assert.equal(I.regionMatch('Germany', ['DACH']).ok, true);
  assert.equal(I.regionMatch('USA', ['United States']).ok, true);
  assert.equal(I.regionMatch('Brazil', ['North America']).ok, false);
});
test('industries: exact, synonyms and spelling variants', () => {
  assert.equal(I.industryMatch('E-commerce', ['ecommerce']).ok, true);
  assert.equal(I.industryMatch('SaaS', ['SaaS']).ok, true);
  assert.equal(I.industryMatch('Healthcare', ['Fintech']).ok, false);
  assert.equal(I.industryMatch('anything', []).ok, null);
});
test('roles: full match scores 1, unrelated title scores 0, best role picked', () => {
  assert.equal(I.roleScore('Head of Data', 'Head of Data'), 1);
  assert.equal(I.roleScore('Chief Marketing Officer', 'Head of Data'), 0);
  assert.equal(I.bestRole('Vice President, Data', ['Head of Data', 'VP Data']).role, 'VP Data');
});
test('tech overlap and hiring keywords', () => {
  assert.deepEqual(I.techOverlap(['Snowflake', 'dbt'], ['snowflake', 'BigQuery']), ['Snowflake']);
  assert.equal(I.hiringMatches([{ role: 'Senior Data Engineer' }, { role: 'Sales Rep' }], ['data engineer']).length, 1);
});
test('normalize clamps and swaps bad ICP values', () => {
  const n = I.normalize({ industries: 'SaaS, Fintech', sizeMin: '5000', sizeMax: '10', maxLeads: 999, minFit: -5 });
  assert.deepEqual(n.industries, ['SaaS', 'Fintech']);
  assert.equal(n.sizeMin, 10); assert.equal(n.sizeMax, 5000);
  assert.equal(n.maxLeads, 200); assert.equal(n.minFit, 0);
});
test('fit score: strong match gets 100 with a reason per rule', () => {
  const c = co('northwind-ledger'); const f = I.scoreFit(c, I.DEFAULT_ICP, c.people, A.DEMO_AS_OF);
  assert.equal(f.score, 100); assert.equal(f.grade, 'strong');
  assert.equal(f.reasons.length, 7);
  f.reasons.forEach((r) => { assert.ok(r.text); assert.ok(r.pts <= r.max); });
  assert.ok(f.contact && f.contact.first);
});
test('fit score: off-profile company scores low and explains why', () => {
  const c = Object.assign({}, co('northwind-ledger'), { industry: 'Mining', employees: 12000, country: 'Brazil', tech: ['Excel'], hiring: [], funding: null });
  const f = I.scoreFit(c, I.DEFAULT_ICP, [], A.DEMO_AS_OF);
  assert.ok(f.score < 30, 'score ' + f.score);
  assert.ok(f.reasons.filter((r) => !r.ok).length >= 4);
});
test('fit score is deterministic and bounded for every demo company', () => {
  D.forEach((c) => {
    const a = I.scoreFit(c, I.DEFAULT_ICP, c.people, A.DEMO_AS_OF); const b = I.scoreFit(c, I.DEFAULT_ICP, c.people, A.DEMO_AS_OF);
    assert.deepEqual(a, b); assert.ok(a.score >= 0 && a.score <= 100);
  });
});
test('funding older than 180 days earns partial points only', () => {
  const c = Object.assign({}, co('northwind-ledger'), { funding: { round: 'Seed', amount: '$2M', date: '2025-01-10' } });
  const r = I.scoreFit(c, I.DEFAULT_ICP, c.people, A.DEMO_AS_OF).reasons.find((x) => /Seed/.test(x.text));
  assert.ok(r && r.pts > 0 && r.pts < r.max, JSON.stringify(r));
});
test('hiring signals respect the recency window', () => {
  const c = co('northwind-ledger');
  const r = I.scoreFit(c, Object.assign({}, I.DEFAULT_ICP, { recencyDays: 7 }), c.people, A.DEMO_AS_OF).reasons.find((x) => /job|Hiring/i.test(x.text));
  assert.equal(r.ok, false);
});
