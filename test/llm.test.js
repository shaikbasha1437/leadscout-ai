const test = require('node:test'); const assert = require('node:assert/strict');
const L = require('../js/agentkit/llm.js');
const KEY = 'sk-test-' + 'x'.repeat(32); // dummy, never a real key
const msg = { system: 'You are helpful.', messages: [{ role: 'user', content: 'Hello' }], maxTokens: 300, temperature: 0.2 };
const mockFetch = (status, body, record) => async (url, init) => { record && record.push({ url, init }); return { ok: status >= 200 && status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) }; };

test('OpenAI request: bearer auth, developer message, completion token budget', () => {
  const r = L.buildRequest({ provider: 'openai', model: 'gpt-5-mini', key: KEY }, msg);
  assert.equal(r.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(r.init.headers.authorization, 'Bearer ' + KEY);
  const b = JSON.parse(r.init.body);
  assert.equal(b.messages[0].role, 'developer'); assert.equal(b.model, 'gpt-5-mini');
  assert.ok(b.max_completion_tokens >= 300); assert.equal(b.reasoning_effort, 'minimal'); assert.equal(b.temperature, undefined);
});
test('Anthropic request: x-api-key, version and direct-browser-access headers', () => {
  const r = L.buildRequest({ provider: 'anthropic', model: 'claude-haiku-4-5', key: KEY }, msg);
  assert.equal(r.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(r.init.headers['x-api-key'], KEY);
  assert.equal(r.init.headers['anthropic-version'], '2023-06-01');
  assert.equal(r.init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  const b = JSON.parse(r.init.body); assert.equal(b.system, 'You are helpful.'); assert.equal(b.max_tokens, 300);
});
test('Gemini request: key in x-goog-api-key header, never in the URL', () => {
  const r = L.buildRequest({ provider: 'gemini', model: 'gemini-2.5-flash', key: KEY }, Object.assign({}, msg, { messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] }));
  assert.equal(r.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
  assert.ok(!r.url.includes(KEY) && !/key=/.test(r.url));
  assert.equal(r.init.headers['x-goog-api-key'], KEY);
  const b = JSON.parse(r.init.body); assert.equal(b.contents[1].role, 'model'); assert.equal(b.systemInstruction.parts[0].text, 'You are helpful.');
});
test('OpenAI-compatible request: custom base URL, optional key, OpenRouter headers', () => {
  const r = L.buildRequest({ provider: 'compatible', model: 'llama3.2', baseUrl: 'http://localhost:11434/v1/' }, msg);
  assert.equal(r.url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(r.init.headers.authorization, undefined);
  assert.equal(JSON.parse(r.init.body).messages[0].role, 'system');
  const o = L.buildRequest({ provider: 'compatible', model: 'openai/gpt-5-mini', baseUrl: 'https://openrouter.ai/api/v1', key: KEY }, msg);
  assert.equal(o.init.headers['X-Title'], 'LeadScout AI'); assert.ok(o.init.headers['HTTP-Referer']);
});
test('responses are parsed with usage for every provider', () => {
  assert.deepEqual(L.parseResponse('openai', { choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 3 } }).usage, { input: 10, output: 3 });
  const a = L.parseResponse('anthropic', { content: [{ type: 'text', text: 'he' }, { type: 'text', text: 'llo' }], usage: { input_tokens: 7, output_tokens: 2 } });
  assert.equal(a.text, 'hello'); assert.deepEqual(a.usage, { input: 7, output: 2 });
  const g = L.parseResponse('gemini', { candidates: [{ content: { parts: [{ text: 'yo' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1, thoughtsTokenCount: 4 } });
  assert.equal(g.text, 'yo'); assert.deepEqual(g.usage, { input: 5, output: 5 });
});
test('call() with a mocked fetch returns text, usage, cost and latency', async () => {
  const calls = []; let t = 0;
  const out = await L.call({ provider: 'openai', model: 'gpt-5-mini', key: KEY }, msg, { fetch: mockFetch(200, { model: 'gpt-5-mini', choices: [{ message: { content: 'Done [1]' } }], usage: { prompt_tokens: 1000, completion_tokens: 200 } }, calls), now: () => (t += 40) });
  assert.equal(calls.length, 1); assert.equal(out.text, 'Done [1]');
  assert.equal(out.latencyMs, 40);
  assert.ok(Math.abs(out.cost - (1000 * 0.25 + 200 * 2) / 1e6) < 1e-12);
});
test('call() turns HTTP errors into readable messages without echoing the key', async () => {
  await assert.rejects(L.call({ provider: 'anthropic', key: KEY }, msg, { fetch: mockFetch(401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } }) }), (e) => { assert.match(e.message, /key was rejected/); assert.ok(!e.message.includes(KEY)); assert.equal(e.status, 401); return true; });
  await assert.rejects(L.call({ provider: 'gemini', key: KEY }, msg, { fetch: mockFetch(429, 'slow down') }), /Rate limit/);
  await assert.rejects(L.call({ provider: 'compatible', baseUrl: 'http://localhost:1234/v1' }, msg, { fetch: async () => { throw new TypeError('Failed to fetch'); } }), /CORS/);
  await assert.rejects(L.call({ provider: 'openai', key: KEY }, msg, { fetch: async () => { throw new TypeError('Failed to fetch'); } }), /check the key/);
  await assert.rejects(L.call({ provider: 'openai' }, msg, { fetch: mockFetch(200, {}) }), /Add your OpenAI key/);
});
test('cost math uses per-million prices, custom tables and provider-prefixed names', () => {
  assert.equal(L.cost({ input: 1e6, output: 1e6 }, 'gpt-5-mini'), 2.25);
  assert.equal(L.cost({ input: 2e6, output: 0 }, 'claude-haiku-4-5'), 2);
  assert.ok(Math.abs(L.cost({ input: 1e6, output: 1e6 }, 'gemini-2.5-flash') - 2.8) < 1e-9);
  assert.equal(L.cost({ input: 1e6, output: 0 }, 'openai/gpt-5-mini'), 0.25);
  assert.equal(L.cost({ input: 500, output: 500 }, 'my-local-model'), null);
  assert.equal(L.cost({ input: 1e6, output: 1e6 }, 'my-local-model', { 'my-local-model': { in: 0, out: 1 } }), 1);
});
