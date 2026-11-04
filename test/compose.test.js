const test = require('node:test'); const assert = require('node:assert/strict');
const { built, C, Q, S, I, T = require('../js/lead/text.js') } = require('./helpers.js');

const TONES = Object.keys(C.TONES);
test('four tone presets exist', () => assert.deepEqual(TONES.sort(), ['consultative', 'direct', 'formal', 'friendly']));
for (const tone of ['friendly', 'direct', 'formal', 'consultative']) {
  test('"' + tone + '" draft: email, LinkedIn note, two follow-ups, all cited and clean', () => {
    const { draft, ctx, research } = built('northwind-ledger', tone);
    assert.ok(draft.email.subject && draft.email.body);
    assert.ok(draft.linkedin.length <= 300, 'linkedin ' + draft.linkedin.length);
    assert.equal(draft.followups.length, 2);
    assert.deepEqual(draft.followups.map((f) => f.day), [4, 9]);
    const ids = new Set(research.facts.concat(research.productFacts).map((f) => f.id));
    const cites = T.markers(draft.email.body);
    assert.ok(cites.some((m) => m.startsWith('F')), 'email cites an account fact');
    cites.forEach((m) => assert.ok(ids.has(m), m));
    assert.match(draft.email.body, new RegExp(S.DEFAULT_SENDER.address));
    assert.match(draft.email.body, Q.OPT_OUT, 'opt-out line');
    assert.equal(draft.tone, tone);
    const q = Q.checkSequence(draft, ctx);
    assert.equal(q.counts.stop, 0, JSON.stringify(q.flags));
  });
}
test('drafts greet the contact by first name and name the company', () => {
  const { draft, lead } = built('aurora-ops');
  assert.match(draft.email.body, new RegExp('^\\w+ ' + lead.contact.first));
  assert.match(draft.email.body + draft.email.subject, /Aurora Ops/);
});
test('drafting is deterministic; a variant changes the wording', () => {
  const a = built('aurora-ops').draft; const b = built('aurora-ops').draft;
  delete a.at; delete b.at; assert.deepEqual(a, b);
  const { lead, research } = built('aurora-ops');
  const v1 = C.draft(lead, research, { tone: 'friendly', variant: 1, product: I.DEFAULT_PRODUCT, sender: S.DEFAULT_SENDER });
  assert.notEqual(v1.email.body + v1.email.subject + v1.linkedin, a.email.body + a.email.subject + a.linkedin);
});
test('no contact name: a neutral greeting, never an invented name', () => {
  const { lead, research } = built('aurora-ops');
  const l = Object.assign({}, lead, { contact: null, people: [] });
  const d = C.draft(l, research, { tone: 'formal', product: I.DEFAULT_PRODUCT, sender: S.DEFAULT_SENDER });
  assert.doesNotMatch(d.email.body.split('\n')[0], /Ciara|Liam/);
});
test('signature and opt-out helpers', () => {
  assert.match(C.signature(S.DEFAULT_SENDER), /Alex Rivera[\s\S]*100 Example Street/);
  TONES.forEach((t) => assert.match(C.optOut(t), Q.OPT_OUT));
});
