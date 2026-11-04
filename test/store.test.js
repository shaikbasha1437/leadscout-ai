const test = require('node:test'); const assert = require('node:assert/strict');
const KS = require('../js/agentkit/keystore.js');
const CSV = require('../js/lead/csv.js');
const { A, S, I, FAKE_KEY, memStorage, baseOpts } = require('./helpers.js');
const TAVILY = 'tvly-FAKE-abcdefghijklmnop1234';

async function stateWithLeads() {
  const st = S.blank(); const r = await A.run(baseOpts({ icp: Object.assign({}, I.DEFAULT_ICP, { maxLeads: 4 }) }));
  st.leads = r.leads; st.run = { stats: r.stats, trace: r.trace };
  // a key pasted by mistake into notes and settings must never leave the browser
  st.leads[0].notes = 'my key is ' + FAKE_KEY + ' and ' + TAVILY;
  st.settings.apiKey = FAKE_KEY; st.product.pitch += ' ' + FAKE_KEY;
  return st;
}
test('blank state: demo mode, fictional sender, default DNC entry, statuses', () => {
  const b = S.blank();
  assert.equal(b.settings.mode, 'demo'); assert.match(b.sender.company, /fictional/); assert.match(b.sender.email, /\.example$/);
  assert.ok(b.dnc.some((e) => e.value === 'cobalt-freight.example'));
  assert.deepEqual(S.STATUSES, ['new', 'researched', 'drafted', 'approved', 'skipped']);
});
test('keystore keeps keys per provider in local or session storage only', () => {
  const local = memStorage(); const session = memStorage();
  const ks = KS.createKeyStore({ prefix: 'leadscout', local, session });
  ks.set('openai', FAKE_KEY); assert.equal(ks.get('openai'), FAKE_KEY); assert.equal(ks.where('openai'), 'local');
  ks.set('openai', FAKE_KEY, 'session'); assert.equal(ks.where('openai'), 'session'); assert.equal(local.getItem('leadscout.key.openai'), null);
  ks.clear('openai'); assert.equal(ks.get('openai'), '');
});
test('save never writes a key to the workspace record', async () => {
  const st = await stateWithLeads(); const m = memStorage();
  assert.equal(S.save(st, m, [FAKE_KEY, TAVILY]).ok, true);
  const raw = m.dump();
  assert.ok(!raw.includes(FAKE_KEY)); assert.ok(!raw.includes(TAVILY)); assert.ok(!raw.includes('"apiKey"'));
  const back = S.load(m); assert.equal(back.leads.length, 4); assert.match(back.leads[0].notes, /\[redacted\]/);
});
test('save reports a full storage instead of throwing', () => {
  const m = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } };
  const r = S.save(S.blank(), m); assert.equal(r.ok, false); assert.match(r.error, /full/);
});
test('load recovers from corrupt storage', () => {
  const m = memStorage(); m.setItem(S.KEY, '{not json'); assert.equal(S.load(m).settings.mode, 'demo');
});
test('workspace export has no keys and round-trips through import', async () => {
  const st = await stateWithLeads();
  const ex = S.exportWorkspace(st, [FAKE_KEY, TAVILY]); const txt = JSON.stringify(ex);
  assert.ok(!txt.includes(FAKE_KEY) && !txt.includes(TAVILY)); assert.match(ex.note, /never included/);
  const im = S.importWorkspace(JSON.parse(txt)); assert.equal(im.leads.length, 4); assert.equal(im.leads[0].id, st.leads[0].id);
  assert.throws(() => S.importWorkspace({ app: 'other' }), /isn.t a LeadScout/);
});
test('even without a known-key list, key-shaped strings are masked', async () => {
  const st = await stateWithLeads(); const txt = JSON.stringify(S.exportWorkspace(st));
  assert.ok(!txt.includes(FAKE_KEY)); assert.ok(!txt.includes(TAVILY));
});
test('CSV export: markers stripped, sent=no, formulas neutralised, no keys', async () => {
  const st = await stateWithLeads(); st.leads[1].notes = '=cmd|calc';
  const csv = S.leadsCSV(st.leads, [FAKE_KEY, TAVILY]);
  const rows = CSV.parse(csv); assert.deepEqual(rows[0], S.CSV_HEADER);
  assert.equal(rows.length, 5);
  assert.doesNotMatch(csv, /\[[FP]\d+\]/); assert.ok(!csv.includes(FAKE_KEY));
  const sent = rows[0].indexOf('sent'); rows.slice(1).forEach((r) => assert.equal(r[sent], 'no'));
  assert.ok(rows[2][rows[0].indexOf('notes')].startsWith("'="));
});
test('JSON export marks every lead unsent and keeps citations with their facts', async () => {
  const st = await stateWithLeads(); const j = S.leadsJSON(st.leads, [FAKE_KEY]);
  assert.ok(j.leads.every((l) => l.sent === false)); assert.match(j.note, /nothing here was sent/i);
  assert.ok(j.leads.find((l) => l.draft).research.facts.length);
  assert.ok(!JSON.stringify(j).includes(FAKE_KEY));
});
test('share link: product, ICP and tone only; no leads, notes, sender or keys', async () => {
  const st = await stateWithLeads(); st.settings.tone = 'formal';
  const link = S.shareLink('https://x.example/app/#leads', st, [FAKE_KEY]);
  assert.match(link, /^https:\/\/x\.example\/app\/#share=/);
  const payload = Buffer.from(decodeURIComponent(link.split('#share=')[1]), 'base64').toString('utf8');
  assert.ok(!payload.includes(FAKE_KEY)); assert.ok(!payload.includes(st.leads[0].company.name)); assert.ok(!payload.includes(st.sender.address));
  const back = S.readShareHash('#share=' + link.split('#share=')[1]);
  assert.equal(back.tone, 'formal'); assert.deepEqual(back.icp.industries, st.icp.industries); assert.equal(back.product.name, st.product.name);
});
test('share hash: garbage, unknown fields and oversize values are handled', () => {
  assert.equal(S.readShareHash('#share=%%%'), null); assert.equal(S.readShareHash('#agent'), null);
  const evil = Buffer.from(JSON.stringify({ p: { name: 'x'.repeat(5000), evil: 1, apiKey: FAKE_KEY }, i: { maxLeads: 9999, roles: Array(100).fill('r') }, t: '<script>' })).toString('base64');
  const r = S.readShareHash('#share=' + encodeURIComponent(evil));
  assert.equal(r.product.name.length, 2000); assert.equal(r.product.evil, undefined); assert.equal(r.product.apiKey, undefined);
  assert.equal(r.icp.maxLeads, 200); assert.equal(r.icp.roles.length, 40); assert.equal(r.tone, 'friendly');
});
test('mergeRun: run leads first, replaced by id, others kept', () => {
  const m = S.mergeRun([{ id: 'a', v: 1 }, { id: 'b', v: 1 }], [{ id: 'b', v: 2 }, { id: 'c', v: 2 }]);
  assert.deepEqual(m.map((x) => x.id + x.v), ['b2', 'c2', 'a1']);
});
test('migrate fills missing settings from defaults', () => {
  const m = S.migrate({ leads: [], settings: { mode: 'live' } });
  assert.equal(m.settings.mode, 'live'); assert.equal(m.settings.tone, 'friendly'); assert.ok(Array.isArray(m.dnc));
});
