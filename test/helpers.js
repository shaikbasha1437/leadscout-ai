/* Shared fixtures. All data is fictional; no real keys are used (fake keys only). */
const B = '../js/';
const D = require(B + 'data/companies.js');
const I = require(B + 'lead/icp.js');
const A = require(B + 'lead/agent.js');
const R = require(B + 'lead/research.js');
const C = require(B + 'lead/compose.js');
const Q = require(B + 'lead/quality.js');
const S = require(B + 'lead/store.js');
const FAKE_KEY = 'sk-test-FAKE0000000000000000000000000000';
function memStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), dump: () => [...m.values()].join('\n') }; }
function co(id) { return D.find((c) => c.id === id); }
function built(id, tone) {
  const lead = A.demoLead(co(id));
  const asOf = A.DEMO_AS_OF;
  lead.fit = I.scoreFit(lead.company, I.DEFAULT_ICP, lead.people, asOf);
  lead.contact = lead.contact || lead.fit.contact;
  const research = R.research(lead, { icp: I.DEFAULT_ICP, product: I.DEFAULT_PRODUCT, asOf });
  const draft = C.draft(lead, research, { tone: tone || 'friendly', product: I.DEFAULT_PRODUCT, sender: S.DEFAULT_SENDER });
  const ctx = { lead, facts: research.facts, productFacts: research.productFacts, sender: S.DEFAULT_SENDER, product: I.DEFAULT_PRODUCT };
  return { lead, research, draft, ctx };
}
function baseOpts(extra) { return Object.assign({ icp: I.DEFAULT_ICP, product: I.DEFAULT_PRODUCT, sender: S.DEFAULT_SENDER, tone: 'friendly', leads: [], dataset: D, dnc: S.blank().dnc, delay: 0, today: '2026-11-04', now: '2026-11-04T16:00:00.000Z' }, extra || {}); }
module.exports = { D, I, A, R, C, Q, S, FAKE_KEY, memStorage, co, built, baseOpts };
