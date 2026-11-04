/* LeadScout demo composer: writes an email, a LinkedIn note and two follow-ups from the research facts.
   Every account-specific sentence carries a citation marker like [F3]; product claims cite [P2].
   No model is involved, so the output is deterministic; "Regenerate" picks other phrasings. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./text.js'));
  else (root.LS = root.LS || {}).compose = factory(root.LS.text);
})(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';
  const TONES = {
    friendly: { label: 'Friendly', hi: 'Hi', signoff: 'Cheers', open: ['Hope your week is going well.', 'Quick note from a fellow data nerd.', ''], cta: ['Would a short call next week be useful?', 'Open to a quick chat to see if it fits?', 'Happy to send a two-minute video instead if that is easier.'] },
    direct: { label: 'Direct', hi: 'Hi', signoff: 'Best', open: ['', 'I\u2019ll keep this short.', ''], cta: ['Worth a short call next week?', 'Can I show you in a short call?', 'Is this a priority this quarter?'] },
    formal: { label: 'Formal', hi: 'Dear', signoff: 'Kind regards', open: ['I hope this message finds you well.', 'I am writing with a brief introduction.', ''], cta: ['Would you be open to a brief call at a time that suits you?', 'May I arrange a short introductory call?', 'I would welcome the chance to discuss whether this is relevant.'] },
    consultative: { label: 'Consultative', hi: 'Hi', signoff: 'Thanks', open: ['', 'I have been looking at how teams like yours handle this.', ''], cta: ['How are you handling this today?', 'Is this something your team is already working on?', 'Would it help to compare notes on how other teams approach it?'] }
  };
  const PAIN_Q = {
    freshness: 'How does the team find out today when a load is late, before customers do?',
    scale: 'As the team grows, how do you keep track of which pipelines need attention?',
    pressure: 'With new projects on the way, how much time goes into checking that data is right?',
    compliance: 'How much work is it to show auditors a history of data checks?',
    realtime: 'With tighter refresh times, how quickly would you spot a silent failure?',
    migration: 'During the move, how will you know a pipeline broke quietly?',
    expansion: 'With more markets and sources, how do you keep every report correct?'
  };
  const lc1 = (s, keep) => { const w = String(s).split(' ')[0]; return keep.some((k) => k && T.norm(k).split(' ')[0] === T.norm(w)) || /^[A-Z0-9]{2,}/.test(w) ? s : s.charAt(0).toLowerCase() + s.slice(1); };
  const art = (w) => (/^[aeiou]/i.test(String(w || '')) ? 'an ' : 'a ') + w;
  const nums = (s) => new Set((String(s).replace(/\d{4}-\d{2}-\d{2}/g, '').match(/\d[\d.,]*/g) || []).map((x) => x.replace(/[.,]+$/, '')));
  const noDot = (s) => String(s).trim().replace(/[.!?]+$/, '');
  function pick(arr, v, salt) { return arr[(v + (salt || 0)) % arr.length]; }
  function hookSentence(sig, fact, ctx, v) {
    const co = ctx.co; const keep = [co.name, ...(co.name || '').split(' ')];
    const m = ' [' + fact.id + ']';
    if (fact.kind === 'funding' && ctx.lead.company.funding) { const f = ctx.lead.company.funding; return pick(['I saw that ' + co.name + ' raised a ' + f.amount + ' ' + f.round, 'Congratulations on the ' + f.amount + ' ' + f.round, 'I noticed the ' + f.amount + ' ' + f.round + ' news'], v) + m + '.'; }
    if (fact.kind === 'hiring') { const r = (fact.text.match(/is hiring (?:an? |\d+ \u00d7 )(.+?) \(posted/) || [])[1] || 'data roles'; return pick(['I noticed ' + co.name + ' is hiring for ' + art(r) + ' role', 'I saw the open ' + r + ' role at ' + co.name, 'I saw you are hiring ' + art(r)], v) + m + '.'; }
    if (fact.kind === 'news') return pick(['I read that ', 'I came across the update that ', 'I saw that '], v) + lc1(noDot(fact.text), keep) + m + '.';
    if (fact.kind === 'note') return 'From what I have read, ' + lc1(noDot(fact.text), keep) + m + '.';
    if (fact.kind === 'web') return 'I came across this: \u201c' + noDot(fact.text).slice(0, 180) + '\u201d' + m + '.';
    if (fact.kind === 'tech') { const t = (fact.text.match(/includes (.+)\.$/) || [])[1] || 'a modern data stack'; return 'I understand your team works with ' + t + m + '.'; }
    return 'I was reading about ' + co.name + m + '.';
  }
  function shortHook(fact, ctx) {
    const co = ctx.co; const f = ctx.lead.company.funding;
    if (fact.kind === 'funding' && f) return 'congrats on the ' + f.amount + ' ' + f.round + ' [' + fact.id + ']';
    if (fact.kind === 'hiring') { const r = (fact.text.match(/is hiring (?:an? |\d+ \u00d7 )(.+?) \(posted/) || [])[1] || 'data roles'; return 'saw you are hiring ' + art(r) + ' [' + fact.id + ']'; }
    if (fact.kind === 'news' && fact.title) return 'saw \u201c' + fact.title + '\u201d [' + fact.id + ']';
    if (fact.kind === 'tech') { const t = (fact.text.match(/includes (.+)\.$/) || [])[1] || ''; return 'saw your team works with ' + t.split(', ').slice(0, 2).join(' and ') + ' [' + fact.id + ']'; }
    return 'came across ' + co.name + ' [' + fact.id + ']';
  }
  function bestValue(pfacts, pain, used) {
    const vals = pfacts.filter((p) => p.kind === 'value' && !(used || []).includes(p.id));
    if (!vals.length) return pfacts.find((p) => p.kind === 'pitch') || null;
    if (!pain) return vals[0];
    const pt = new Set(T.tokens(pain.text + ' ' + (PAIN_Q[pain.id] || '')));
    let best = vals[0]; let bs = -1;
    vals.forEach((p) => { const s = T.tokens(p.text).filter((w) => pt.has(w)).length; if (s > bs) { bs = s; best = p; } });
    return best;
  }
  const valueSentence = (product, p, v) => (p ? pick([product.name + ' ' + lc1(noDot(p.text), [product.name]).replace(/^(catches|shows|sets|gives)/, (x) => x) + ' [' + p.id + '].', 'We built ' + product.name + ' for exactly this: it ' + lc1(noDot(p.text), [product.name]) + ' [' + p.id + '].'], v).replace(product.name + ' ' + product.name, product.name) : '');
  function signature(sender) {
    const s = sender || {};
    return [s.name, [s.title, s.company].filter(Boolean).join(', '), s.address].filter(Boolean).join('\n');
  }
  const optOut = (tone) => (tone === 'formal' ? 'If you would prefer not to hear from me again, simply reply \u201cno thanks\u201d and I will not follow up.' : 'Not relevant? Just reply \u201cno thanks\u201d and I won\u2019t follow up.');
  /* draft(lead, research, opts) -> { email:{subject, body}, linkedin, followups:[{subject, body},{...}], tone, by, used } */
  function draft(lead, research, opts) {
    const o = opts || {}; const tone = TONES[o.tone] ? o.tone : 'friendly'; const tn = TONES[tone];
    const v = Math.max(0, Math.round(o.variant || 0));
    const product = Object.assign({ name: 'our product' }, o.product || {});
    const co = lead.company || {}; const ctx = { lead, co };
    const facts = research.facts || []; const pf = research.productFacts || [];
    const byId = (id) => facts.find((f) => f.id === id);
    const sigs = (research.signals || []).filter((s) => byId(s.factId) && !byId(s.factId).injection);
    const contact = lead.contact && lead.contact.first ? lead.contact : null;
    const first = contact ? contact.first : '';
    const greet = tn.hi + ' ' + (first || (tone === 'formal' ? co.name + ' team' : 'there')) + ',';
    const s1 = sigs[0] ? byId(sigs[0].factId) : null;
    const n1 = s1 ? nums(s1.text) : new Set();
    const fresh = (s) => s1 && s.factId !== s1.id && ![...nums(byId(s.factId).text)].some((n) => n1.has(n));
    const s2f = sigs.find((s) => fresh(s) && byId(s.factId).kind !== s1.kind && byId(s.factId).kind !== 'tech') || sigs.find((s) => fresh(s) && byId(s.factId).kind !== 'tech') || sigs.find(fresh);
    const s2 = s2f ? byId(s2f.factId) : null;
    const pains = research.pains || [];
    const pain = pains.find((p) => s1 && p.basis.includes(s1.id)) || pains[0] || null;
    const pain2 = pains.find((p) => p !== pain && s2 && p.basis.includes(s2.id)) || pains.find((p) => p !== pain) || pain;
    const val1 = bestValue(pf, pain);
    const val2 = bestValue(pf, pain2, val1 ? [val1.id] : []);
    const proof = pf.filter((p) => p.kind === 'proof');
    const used = [];
    const mark = (f) => { if (f && !used.includes(f.id)) used.push(f.id); };
    // ----- email -----
    const open = pick(tn.open, v);
    const hook = s1 ? hookSentence(sigs[0], s1, ctx, v) : '';
    if (s1) mark(s1);
    const q = pain ? (PAIN_Q[pain.id] || '') : '';
    const vs = valueSentence(product, val1, v); if (val1) mark(val1);
    const pr = proof[0] ? noDot(proof[0].text) + ' [' + proof[0].id + '].' : ''; if (proof[0]) mark(proof[0]);
    const cta = pick(tn.cta, v, 1);
    const subjects = { friendly: ['Idea for the ' + co.name + ' data team', 'Quick idea for ' + co.name, 'A thought for ' + co.name], direct: [co.name + ' + ' + product.name, 'Late data at ' + co.name + '?', product.name + ' for ' + co.name], formal: ['Data reliability at ' + co.name, 'Introduction: ' + product.name, 'A brief introduction for ' + co.name], consultative: ['Question about data at ' + co.name, 'How ' + co.name + ' watches its pipelines', 'Comparing notes on data reliability'] };
    let subject = pick(subjects[tone], v);
    if (subject.length > 60) subject = subjects.direct[2].slice(0, 60);
    const body = [greet, '', [open, hook, q].filter(Boolean).join(' '), '', [vs, pr].filter(Boolean).join(' '), '', cta, '', optOut(tone), '', tn.signoff + ',', signature(o.sender)].join('\n').replace(/\n{3,}/g, '\n\n');
    // ----- LinkedIn note (max 300 chars on LinkedIn) -----
    const lf = sigs.map((s) => byId(s.factId)).find((f) => f.kind === 'funding' || f.kind === 'hiring') || s1;
    if (lf) mark(lf);
    let li = (first ? 'Hi ' + first + ', ' : 'Hi, ') + (lf ? shortHook(lf, ctx) + '. ' : '') + 'I work on ' + product.name + (val1 ? ', which ' + lc1(noDot(val1.text), [product.name]) + ' [' + val1.id + ']' : '') + '. Would be glad to connect.';
    if (T.stripMarkers(li).length > 300 && val1) li = (first ? 'Hi ' + first + ', ' : 'Hi, ') + (lf ? shortHook(lf, ctx) + '. ' : '') + 'I work on ' + product.name + ' for data teams. Would be glad to connect.';
    // ----- follow-ups -----
    const f1parts = [greet, '', pick(['Following up on my note below with one more thought.', 'A quick follow-up with one more idea.', 'Circling back with one more thought.'], v)];
    if (s2) { f1parts.push(hookSentence(s2f, s2, ctx, v + 1).replace(/^I (read|saw|noticed|came across)/, (x) => 'I also ' + x.slice(2))); mark(s2); }
    if (val2 && val2 !== val1) { f1parts.push(product.name + ' also ' + lc1(noDot(val2.text), [product.name]) + ' [' + val2.id + '].'); mark(val2); }
    const f1 = f1parts.slice(0, 3).join('\n') + (f1parts.length > 3 ? ' ' + f1parts.slice(3).join(' ') : '') + '\n\n' + pick(tn.cta, v, 2) + '\n\n' + optOut(tone) + '\n\n' + tn.signoff + ',\n' + ((o.sender && o.sender.name) || '');
    const p2 = proof[1] || proof[0];
    if (p2) mark(p2);
    const f2 = [greet, '', pick(['Last note from me on this.', 'I will leave it here for now.', 'One final note.'], v) + ' If the timing is off, no problem.' + (p2 ? ' Worth knowing: ' + lc1(noDot(p2.text), [product.name]) + ' [' + p2.id + '], so it is easy to try on your own later.' : ''), '', (first ? 'Thanks, ' + first + '.' : 'Thanks for reading.') + ' ' + optOut(tone), '', tn.signoff + ',', (o.sender && o.sender.name) || ''].join('\n');
    return {
      email: { subject, body }, linkedin: li,
      followups: [{ subject: 'Re: ' + subject, body: f1, day: 4 }, { subject: 'Re: ' + subject, body: f2, day: 9 }],
      tone, variant: v, by: 'demo', used, contact: contact ? { first: contact.first, last: contact.last, title: contact.title, email: contact.email } : null, at: o.now || new Date().toISOString()
    };
  }
  return { TONES, PAIN_Q, draft, signature, optOut };
});
