const test = require('node:test'); const assert = require('node:assert/strict');
const { built, D, A, R, I } = require('./helpers.js');

test('facts are numbered, sourced and fictional for demo leads', () => {
  const { research } = built('northwind-ledger');
  assert.ok(research.facts.length >= 4);
  research.facts.forEach((f, i) => {
    assert.equal(f.id, 'F' + (i + 1)); assert.ok(f.text); assert.ok(f.source && f.source.label);
    if (f.source.url) assert.match(f.source.url, /^https:\/\/[a-z0-9-]+\.example\//);
  });
  assert.ok(research.productFacts.every((p) => /^P\d+$/.test(p.id)));
});
test('signals, pains and stakeholders cite facts that exist', () => {
  const { research } = built('northwind-ledger');
  const ids = new Set(research.facts.map((f) => f.id));
  assert.ok(research.signals.length >= 1);
  research.signals.forEach((s) => assert.ok(ids.has(s.factId)));
  research.pains.forEach((p) => { assert.ok(p.basis.length); p.basis.forEach((b) => assert.ok(ids.has(b))); });
  assert.ok(research.stakeholders.length >= 1);
  assert.match(research.summary, /Northwind Ledger/);
});
test('research is deterministic for the same input', () => {
  const a = built('aurora-ops').research; const b = built('aurora-ops').research;
  delete a.at; delete b.at; assert.deepEqual(a, b);
});
test('every demo company researches without errors', () => {
  D.forEach((c) => { const l = A.demoLead(c); const r = R.research(l, { icp: I.DEFAULT_ICP, product: I.DEFAULT_PRODUCT, asOf: A.DEMO_AS_OF }); assert.ok(r.facts.length, c.id); });
});
test('pasted notes become user facts', () => {
  const l = A.demoLead(D[0]); l.researchNotes = 'Their CFO mentioned slow month-end close on a podcast.';
  const r = R.research(l, { icp: I.DEFAULT_ICP, product: I.DEFAULT_PRODUCT, asOf: A.DEMO_AS_OF });
  assert.ok(r.facts.some((f) => /month-end close/.test(f.text)));
});
test('possessive helper', () => { assert.equal(R.poss('Acme'), 'Acme\u2019s'); assert.equal(R.poss('Northwind Labs'), 'Northwind Labs\u2019'); });
