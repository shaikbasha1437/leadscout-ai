const test = require('node:test'); const assert = require('node:assert/strict');
const CM = require('../js/lead/compliance.js');

test('regime by country: CAN-SPAM, GDPR, CASL and a general fallback', () => {
  assert.equal(CM.regimeFor('United States').id, 'canspam');
  assert.equal(CM.regimeFor('Germany').id, 'gdpr');
  assert.equal(CM.regimeFor('Canada').id, 'casl');
  assert.equal(CM.regimeFor('').id, 'general');
});
test('every rule has a name, a short reminder and an official link', () => {
  Object.values(CM.RULES).forEach((r) => { assert.ok(r.name && r.short, r.id); if (r.id !== 'general') assert.match(r.url, /^https:\/\//); });
  assert.ok(CM.CHECKLIST.length >= 5);
});
test('DNC entries: email, domain, @domain and company names; comments skipped; deduped', () => {
  const l = CM.parseList('# my list\nFoo@Bar.example\n@acme.example; acme.example\nGlobex Corp');
  assert.deepEqual(l.map((e) => e.type + ':' + e.value), ['email:foo@bar.example', 'domain:acme.example', 'company:globex']);
});
test('DNC blocks by email, domain, subdomain and company name, but not look-alikes', () => {
  const L = CM.parseList('jo@acme.example\nglobex.example\nInitech');
  assert.ok(CM.blocked({ company: { name: 'Acme', domain: 'acme.example' }, contact: { email: 'JO@acme.example' } }, L));
  assert.ok(CM.blocked({ company: { name: 'G', domain: 'eu.globex.example' } }, L));
  assert.ok(CM.blocked({ company: { name: 'Initech, Inc.', domain: 'x.example' } }, L));
  assert.equal(CM.blocked({ company: { name: 'Acme', domain: 'acme.example' }, contact: { email: 'other@acme.example' } }, L), null);
  assert.equal(CM.blocked({ company: { name: 'Notglobex', domain: 'notglobex.example' } }, L), null);
  assert.match(CM.blocked({ company: { name: 'G', domain: 'globex.example' } }, L).reason, /do-not-contact/);
});
test('mailto strips citation markers and encodes text; it only opens a draft', () => {
  const m = CM.mailto('a@b.example', 'Hi [F1] there', 'Line one [P2].\nLine & two');
  assert.ok(m.startsWith('mailto:a@b.example?'));
  assert.doesNotMatch(decodeURIComponent(m), /\[[FP]\d+\]/);
  assert.match(m, /%0A/); assert.match(m, /%26/);
});
test('domainOf lowercases and strips the user part', () => assert.equal(CM.domainOf('Jo@Sub.Acme.example'), 'sub.acme.example'));
