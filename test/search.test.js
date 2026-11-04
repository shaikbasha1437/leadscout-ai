const test = require('node:test'); const assert = require('node:assert/strict');
const SR = require('../js/agentkit/search.js');
const KEY = 'tvly-FAKE-0000000000000000'; // never a real key
const mock = (status, body, log) => async (url, init) => { log && log.push({ url, init }); return { ok: status < 300, status, text: async () => JSON.stringify(body) }; };

test('search request: POST, bearer auth, capped results', () => {
  const r = SR.buildSearch(KEY, 'data teams hiring', { max: 50, timeRange: 'year', dates: true });
  assert.equal(r.url, 'https://api.tavily.com/search'); assert.equal(r.init.method, 'POST');
  assert.equal(r.init.headers.authorization, 'Bearer ' + KEY);
  const b = JSON.parse(r.init.body); assert.equal(b.max_results, 20); assert.equal(b.time_range, 'year'); assert.equal(b.include_published_date, true);
  assert.equal(b.api_key, undefined, 'key not in the body');
});
test('extract request caps at 5 URLs', () => {
  const b = JSON.parse(SR.buildExtract(KEY, ['1', '2', '3', '4', '5', '6', '7']).init.body);
  assert.equal(b.urls.length, 5);
});
test('client parses results and extract output', async () => {
  const log = [];
  const t = SR.createTavily(KEY, { fetch: mock(200, { results: [{ title: 'T', url: 'https://x.example', content: 'C', published_date: 'Mon, 02 Nov 2026 10:00:00 GMT', score: 0.8 }] }, log) });
  const r = await t.search('q');
  assert.deepEqual(r[0], { title: 'T', url: 'https://x.example', content: 'C', date: '2026-11-02', score: 0.8 });
  const t2 = SR.createTavily(KEY, { fetch: mock(200, { results: [{ url: 'https://x.example', raw_content: 'page' }], failed_results: [{ url: 'https://y.example' }] }) });
  const e = await t2.extract(['https://x.example', 'https://y.example']);
  assert.equal(e.results[0].content, 'page'); assert.deepEqual(e.failed, ['https://y.example']);
  assert.equal(t.label, 'Tavily'); assert.equal(SR.createTavily(''), null);
});
for (const [status, re] of [[401, /rejected the key/], [429, /rate limit/], [432, /plan or credit/], [500, /Tavily 500/]]) {
  test('HTTP ' + status + ' gives a clear error', async () => {
    const t = SR.createTavily(KEY, { fetch: mock(status, { detail: { error: 'nope' } }) });
    await assert.rejects(t.search('q'), re);
  });
}
test('network failure is reported, not thrown raw', async () => {
  const t = SR.createTavily(KEY, { fetch: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(t.search('q'), /Could not reach api\.tavily\.com/);
});
