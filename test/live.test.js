const test = require('node:test'); const assert = require('node:assert/strict');
const L = require('../js/lead/live.js');
const { built, S, I } = require('./helpers.js');

test('parseJSON handles fences, prose around JSON and nested braces', () => {
  assert.deepEqual(L.parseJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(L.parseJSON('Sure! Here it is: {"a":{"b":"}"}} hope that helps'), { a: { b: '}' } });
  assert.throws(() => L.parseJSON('no json here'));
});
test('research prompt fences facts and people as untrusted data', () => {
  const { lead, research } = built('quillfeather');
  const p = L.researchPrompt(lead, research.facts, I.DEFAULT_ICP, I.DEFAULT_PRODUCT);
  assert.match(p.system, /untrusted data/); assert.match(p.system, /JSON only/);
  assert.match(p.messages[0].content, /<facts>[\s\S]*F1:[\s\S]*<\/facts>/);
  assert.match(p.messages[0].content, /<people>[\s\S]*<\/people>/);
  assert.equal(p.json, true);
});
test('validateResearch drops items that cite missing or injected facts', () => {
  const { research } = built('quillfeather');
  const inj = research.facts.find((f) => f.injection).id;
  const v = L.validateResearch({ summary: 'S', signals: [{ fact: 'F1', why: 'ok' }, { fact: 'F99', why: 'bad' }, { fact: inj, why: 'bad' }], pains: [{ text: 'Slow tests', basis: ['F1'] }, { text: 'Invented', basis: ['F42'] }], stakeholders: [{ role: 'Head of Data', why: 'owns it' }, {}] }, research.facts);
  assert.equal(v.signals.length, 1); assert.equal(v.pains.length, 1); assert.equal(v.stakeholders.length, 1);
  assert.equal(v.dropped, 3);
});
test('draft prompt asks for citations and the opt-out line; never sends', () => {
  const { lead, research } = built('aurora-ops');
  const p = L.draftPrompt(lead, research, I.DEFAULT_PRODUCT, S.DEFAULT_SENDER, 'formal');
  assert.match(p.system, /never send/i); assert.match(p.system, /\[P#\]/); assert.match(p.system, /opt-out/);
  assert.match(p.messages[0].content, /<product>[\s\S]*P1:/);
});
test('validateDraft adds the signature and builds day 4 / day 9 follow-ups', () => {
  const d = L.validateDraft({ subject: 'Idea', email: 'Hi Ciara,\n\nNoticed you are hiring [F4].\n\nCheers,\nAlex', linkedin: 'Hi Ciara [F4]', followup1: 'One more thing [P2].', followup2: 'Last note.' }, S.DEFAULT_SENDER, 'friendly', { first: 'Ciara' });
  assert.match(d.email.body, /100 Example Street/);
  assert.equal((d.email.body.match(/Cheers/g) || []).length, 1);
  assert.deepEqual(d.followups.map((f) => [f.day, f.subject]), [[4, 'Re: Idea'], [9, 'Re: Idea']]);
  assert.throws(() => L.validateDraft({ subject: 'x' }, S.DEFAULT_SENDER, 'friendly'));
});
test('validateFind keeps only companies backed by a search result, deduped', () => {
  const results = [{ title: 'A', url: 'https://a.example', content: 'A raised money' }, { title: 'B', url: 'https://b.example', content: '' }];
  const v = L.validateFind({ companies: [{ name: 'A Co', domain: 'https://www.a.example/x', evidence: [1] }, { name: 'A Co again', domain: 'a.example', evidence: [1] }, { name: 'Ghost', domain: 'ghost.example', evidence: [7] }, { name: 'No evidence', domain: 'n.example' }] }, results);
  assert.equal(v.length, 1); assert.equal(v[0].domain, 'a.example'); assert.equal(v[0].evidence[0].url, 'https://a.example');
});
test('search query reflects the ICP', () => {
  const q = L.searchQuery(I.DEFAULT_ICP, I.DEFAULT_PRODUCT);
  assert.match(q, /SaaS/); assert.match(q, /hiring data engineer/);
});
