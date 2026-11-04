const test = require('node:test'); const assert = require('node:assert/strict');
const { built, Q, D, A, R, C, I, S } = require('./helpers.js');
const clone = (x) => JSON.parse(JSON.stringify(x));
const ids = (q) => q.flags.map((f) => f.id);

test('every demo draft in every tone passes with no stop flags', () => {
  D.forEach((c) => ['friendly', 'direct', 'formal', 'consultative'].forEach((tone) => {
    const { draft, ctx } = built(c.id, tone); const q = Q.checkSequence(draft, ctx);
    assert.equal(q.counts.stop, 0, c.id + '/' + tone + ': ' + JSON.stringify(q.flags));
  }));
});
test('an invented number is flagged as an unverified claim', () => {
  const { draft, ctx } = built('northwind-ledger'); const d = clone(draft);
  d.email.body = d.email.body.replace(/\n\n/, '\n\nWe helped 4,000 retailers cut costs by 63% last year.\n\n');
  const q = Q.checkSequence(d, ctx);
  assert.ok(q.flags.some((f) => f.id === 'unverified' && f.level === 'stop' && f.part === 'email'), JSON.stringify(q.flags));
  assert.equal(q.status, 'stop');
});
test('citing a fact that does not exist is a stop flag', () => {
  const { draft, ctx } = built('northwind-ledger'); const d = clone(draft);
  d.linkedin += ' [F99]';
  assert.ok(ids(Q.checkSequence(d, ctx)).includes('bad-cite'));
});
test('an uncited company event is flagged', () => {
  const { draft, ctx } = built('northwind-ledger'); const d = clone(draft);
  d.followups[0].body = 'Congrats on the acquisition announced this week.\n\n' + d.followups[0].body;
  assert.ok(Q.checkSequence(d, ctx).flags.some((f) => f.id === 'unverified' && f.part === 'followup1'));
});
test('spam words and shouting are flagged', () => {
  const { draft, ctx } = built('northwind-ledger'); const d = clone(draft);
  d.email.body = d.email.body.replace(/\n\n/, '\n\nAct now: this is a GUARANTEED, risk-free offer!!!\n\n');
  const f = ids(Q.checkSequence(d, ctx));
  assert.ok(f.includes('spam'), f.join());
});
test('overlong email and LinkedIn note are flagged', () => {
  const { draft, ctx } = built('northwind-ledger'); const d = clone(draft);
  d.email.body = d.email.body.replace(/\n\n/, '\n\n' + 'This sentence adds words but says nothing at all. '.repeat(30) + '\n\n');
  d.linkedin = d.linkedin + ' ' + 'More words here. '.repeat(25);
  const q = Q.checkSequence(d, ctx);
  assert.ok(q.flags.some((f) => f.id === 'length' && f.part === 'email'), JSON.stringify(q.flags));
  assert.ok(q.flags.some((f) => f.id === 'length' && f.part === 'linkedin'));
});
test('a missing opt-out line is flagged on the email', () => {
  const { draft, ctx } = built('northwind-ledger'); const d = clone(draft);
  d.email.body = d.email.body.split('\n').filter((l) => !Q.OPT_OUT.test(l)).join('\n');
  assert.ok(Q.checkSequence(d, ctx).flags.some((f) => /opt/.test(f.id) && f.part === 'email'));
});
test('a generic draft with no personalisation is flagged', () => {
  const { ctx } = built('northwind-ledger');
  const d = { email: { subject: 'Quick question', body: 'Hi there,\n\nWe make great software for teams. Would you like a demo?\n\nNot relevant? Just reply \u201cno thanks\u201d and I won\u2019t follow up.\n\nCheers,\nAlex Rivera\nFounder, Beaconly (fictional)\n100 Example Street, Springfield, USA' }, linkedin: 'Hi, would love to connect.', followups: [] };
  assert.ok(ids(Q.checkSequence(d, ctx)).some((i) => /personal/.test(i)), ids(Q.checkSequence(d, ctx)).join());
});
test('subject checks: Re: on a first email and all caps', () => {
  const f = Q.checkSubject('RE: FREE DEMO TODAY').map((x) => x.id);
  assert.ok(f.length >= 1, f.join());
});
test('score falls as flags rise; status reflects the worst flag', () => {
  const { draft, ctx } = built('northwind-ledger'); const ok = Q.checkSequence(draft, ctx);
  const d = clone(draft); d.email.body = d.email.body.replace(/\n\n/, '\n\nWe guarantee 10x ROI for 500 customers.\n\n');
  const bad = Q.checkSequence(d, ctx);
  assert.equal(ok.status, 'ok'); assert.ok(bad.score < ok.score);
});
