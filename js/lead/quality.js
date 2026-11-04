/* LeadScout draft quality checks. Runs locally on every draft (demo, live model or your own edits):
   unverified claims, citations to missing sources, spammy wording, length, personalisation,
   opt-out line, sender address, leftover placeholders and quoting a source flagged as injection. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./text.js'));
  else (root.LS = root.LS || {}).quality = factory(root.LS.text);
})(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';
  const SPAM = ['free money', 'act now', 'limited time', 'risk-free', 'risk free', 'guarantee', 'guaranteed', '100%', 'click here', 'buy now', 'urgent', 'winner', 'no obligation', 'once in a lifetime', 'special promotion', 'double your', 'earn money', 'cash bonus', 'exclusive deal', 'amazing', 'incredible offer', 'best price', 'call now', 'don\u2019t miss', "don't miss", 'last chance', 'instant', 'miracle', 'no catch', 'revolutionary', 'game-changer', 'game changer', 'synergy', 'circle back', 'touch base', 'just checking in', 'per my last email', 'unsubscribe now'];
  const OPT_OUT = /\b(no thanks|unsubscribe|opt[ -]?out|won[\u2019']?t (follow up|email|contact)|will not (follow up|contact|email)|not (hear|be contacted)|stop (emailing|contacting)|reply (with )?["\u201c]?(no|stop|remove)|let me know if you['\u2019]?d rather not|prefer not to hear)\b/i;
  const PLACEHOLDER = /\{\{[^}]*\}\}|\[(first ?name|company|name|title|insert[^\]]*|your [^\]]*|todo)\]|\bTODO\b|\bXXX\b|<[A-Z_ ]{3,}>|lorem ipsum/i;
  const EVENT = /\b(raised|raise[sd]? (a|an|their)|funding|series [a-e]\b|ipo|acquired|acquisition|launched|launch(es|ing)?|hired|hiring|expanded|expanding|opened|outage|migrat\w*|award|congrat\w*|announced|partnership|revenue|grew|growth of|customers?\b.*\b\d)/i;
  // Words that are fine to capitalise without a source (greetings, months, roles, common terms).
  const COMMON = new Set(('i hi hello dear hey thanks thank cheers best kind regards sincerely ps re fw fwd ok yes no not if just would could can may will happy quick worth open we our you your it this that monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december linkedin email slack zoom google teams ceo cto cfo coo cdo ciso vp svp evp head director manager lead data engineering engineer analytics team ai api saas b2b sql etl elt ml ui ux q1 q2 q3 q4 eu uk us usa gdpr casl can-spam no-reply').split(' '));
  const monthsRe = /^(jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)$/;
  function claimTokens(sentence) {
    const s = T.stripMarkers(sentence);
    const out = [];
    // Numbers, money, percentages, multipliers (dates and small step counts are allowed below).
    (s.match(/[$\u20ac\u00a3]?\s?\d[\d,.]*\s?(%|x\b|k\b|m\b|bn\b|b\b|million|billion|thousand)?/gi) || []).forEach((n) => { const d = n.replace(/[^\d.]/g, '').replace(/\.$/, ''); if (d && !(Number(d) <= 3 && !/[%$\u20ac\u00a3]/.test(n))) out.push({ kind: 'number', text: n.trim(), key: d }); });
    // Capitalised words that are not the first word of the sentence or after a colon/quote.
    const words = s.split(/\s+/);
    words.forEach((w, i) => {
      const clean = w.replace(/^[^\p{L}\p{N}$]+|[^\p{L}\p{N}]+$/gu, '');
      if (!clean || i === 0) return;
      const prev = words[i - 1] || '';
      if (/[:\u201c"(]$/.test(prev) || /^[\u201c"(]/.test(w)) return;
      if (/^\p{Lu}/u.test(clean) && !/^\p{Lu}{4,}$/u.test(clean) && !COMMON.has(clean.toLowerCase()) && !monthsRe.test(clean.toLowerCase())) out.push({ kind: 'name', text: clean, key: clean.toLowerCase().replace(/[\u2019']s$/, '') });
    });
    return out;
  }
  function knownText(ids, facts, pfacts) {
    const all = (facts || []).concat(pfacts || []);
    return ids.map((id) => all.find((f) => f.id === id)).filter(Boolean).map((f) => f.text + ' ' + ((f.source && f.source.label) || '') + ' ' + (f.title || '')).join(' ');
  }
  const has = (hay, key) => { const h = T.norm(hay); const k = T.norm(key); if (/^\d/.test(k)) { const digits = h.replace(/,/g, ''); return digits.includes(k.replace(/,/g, '')); } return new RegExp('(^|[^a-z0-9])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-z0-9])', 'i').test(h); };
  /* Check one piece of a sequence. part = 'email' | 'linkedin' | 'followup'.
     ctx = { facts, productFacts, safe: [strings that are fine without a source], lead, sender } */
  function checkText(text, part, ctx) {
    const c = ctx || {}; const flags = [];
    const add = (level, id, msg, detail) => flags.push({ level, id, part, msg, detail: detail || '' });
    const ids = new Set(((c.facts || []).concat(c.productFacts || [])).map((f) => f.id));
    const safe = (c.safe || []).filter(Boolean).join(' ') + ' ' + (part === 'email' && c.subject ? '' : '');
    const body = String(text || '');
    const cited = T.markers(body);
    cited.filter((m) => !ids.has(m)).forEach((m) => add('stop', 'bad-cite', 'Cites [' + m + '], which is not a source for this lead.'));
    // Unverified claims, sentence by sentence.
    T.sentences(body).forEach((sent) => {
      const marks = T.markers(sent).filter((m) => ids.has(m));
      const known = knownText(marks, c.facts, c.productFacts) + ' ' + safe;
      const toks = claimTokens(sent).filter((t) => !has(known, t.key));
      const plain = T.stripMarkers(sent).trim();
      if (toks.length) add('stop', 'unverified', 'Unverified claim: \u201c' + toks.map((t) => t.text).slice(0, 4).join('\u201d, \u201c') + '\u201d is not in a cited source.', plain);
      else if (!marks.length && EVENT.test(plain) && !/^(re|subject)\b/i.test(plain)) add('stop', 'unverified', 'Mentions a company event without citing a source.', plain);
      const inj = marks.map((m) => (c.facts || []).find((f) => f.id === m)).filter((f) => f && f.injection);
      inj.forEach((f) => add('stop', 'injection-source', 'Quotes [' + f.id + '], a source that contains instructions aimed at AI tools. Don\u2019t use it.', plain));
    });
    const plain = T.stripMarkers(body);
    const low = plain.toLowerCase();
    const spam = SPAM.filter((w) => low.includes(w)).filter((w, i, a) => !a.some((x) => x !== w && x.includes(w)));
    if (spam.length) add('warn', 'spam', 'Spam-trigger wording: ' + spam.map((w) => '\u201c' + w + '\u201d').join(', ') + '.');
    const bang = (plain.match(/!/g) || []).length;
    if (bang > 1) add('warn', 'spam', bang + ' exclamation marks. One at most reads better and avoids spam filters.');
    const caps = (plain.match(/\b[A-Z]{4,}\b/g) || []).filter((w) => !/^(GDPR|CASL|SOC|HIPAA|AWS|GCP|HTTP|HTTPS|JSON|CSV|SAML|ISO|PCI|LGPD|PDPA|DPDP)$/.test(w));
    if (caps.length) add('warn', 'spam', 'Shouting in capitals: ' + caps.slice(0, 3).join(', ') + '.');
    if (PLACEHOLDER.test(body)) add('stop', 'placeholder', 'Leftover placeholder text: ' + body.match(PLACEHOLDER)[0] + '.');
    const wc = T.wordCount(plain);
    if (part === 'linkedin') {
      if (plain.length > 300) add('stop', 'length', 'LinkedIn note is ' + plain.length + ' characters; the limit is 300.');
      else if (plain.length > 200) add('info', 'length', plain.length + ' characters. Free LinkedIn accounts may be limited to 200 characters per note.');
    } else if (part === 'email') {
      const content = c.sender && c.sender.address ? plain.replace(c.sender.address, '') : plain;
      const n = T.wordCount(content);
      if (n > 220) add('stop', 'length', n + ' words. Cold emails over about 200 words get far fewer replies; cut it down.');
      else if (n > 150) add('warn', 'length', n + ' words. Aim for 50\u2013125 words.');
      else if (n < 25) add('warn', 'length', 'Only ' + n + ' words: too short to be useful.');
    } else if (wc > 120) add('warn', 'length', wc + ' words. Follow-ups work best under about 100 words.');
    // Personalisation.
    const accountCites = cited.filter((m) => /^F/.test(m) && ids.has(m));
    const signalCites = accountCites.filter((m) => { const f = (c.facts || []).find((x) => x.id === m); return f && ['news', 'funding', 'hiring', 'note', 'web'].includes(f.kind); });
    const co = c.lead && c.lead.company ? c.lead.company.name : '';
    if (part === 'email' || part === 'linkedin') {
      if (!accountCites.length && !(co && low.includes(co.toLowerCase()))) add('warn', 'personal', 'No personalisation: it doesn\u2019t mention the company or cite anything about it.');
      else if (part !== 'followup' && !signalCites.length) add('warn', 'personal', 'Weak personalisation: no recent signal (news, funding, hiring or your notes) is cited.');
    }
    const first = c.lead && c.lead.contact && c.lead.contact.first;
    if (part === 'email' && first && !new RegExp('\\b' + first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(plain)) add('info', 'personal', 'Doesn\u2019t greet ' + first + ' by name.');
    // Compliance basics for email.
    if (part !== 'linkedin' && !OPT_OUT.test(plain)) add(part === 'email' ? 'stop' : 'warn', 'optout', 'No opt-out line. CAN-SPAM and GDPR expect an easy way to say no.');
    if (part === 'email' && !(c.sender && c.sender.address && plain.includes(c.sender.address))) add('warn', 'address', 'No sender postal address. CAN-SPAM requires a valid physical address in commercial email.');
    return flags;
  }
  function checkSubject(subject) {
    const flags = []; const s = String(subject || '');
    if (!s.trim()) flags.push({ level: 'stop', id: 'subject', part: 'email', msg: 'Subject line is empty.' });
    if (s.length > 60) flags.push({ level: 'warn', id: 'length', part: 'email', msg: 'Subject is ' + s.length + ' characters; under 50 is easier to read on phones.' });
    if (/^(re|fw|fwd):/i.test(s)) flags.push({ level: 'stop', id: 'deceptive', part: 'email', msg: 'A first email must not pretend to be a reply (\u201cRe:\u201d). CAN-SPAM bans misleading subject lines.' });
    const low = s.toLowerCase(); const spam = SPAM.filter((w) => low.includes(w));
    if (spam.length) flags.push({ level: 'warn', id: 'spam', part: 'email', msg: 'Spam-trigger wording in subject: ' + spam.join(', ') + '.' });
    if (/!{1,}/.test(s)) flags.push({ level: 'warn', id: 'spam', part: 'email', msg: 'Exclamation mark in the subject line.' });
    return flags;
  }
  /* Check a whole sequence. Returns { flags, counts:{stop,warn,info}, score, status } */
  function checkSequence(d, ctx) {
    const c = Object.assign({}, ctx || {});
    const lead = c.lead || {}; const co = lead.company || {};
    c.safe = [co.name, co.domain, lead.contact && lead.contact.first, lead.contact && lead.contact.last, lead.contact && lead.contact.title, c.sender && c.sender.name, c.sender && c.sender.title, c.sender && c.sender.company, c.sender && c.sender.address, c.product && c.product.name].concat(c.safe || []);
    let flags = [];
    if (d && d.email) { flags = flags.concat(checkSubject(d.email.subject)); flags = flags.concat(checkText(d.email.body, 'email', c)); }
    if (d && d.linkedin != null) flags = flags.concat(checkText(d.linkedin, 'linkedin', c));
    ((d && d.followups) || []).forEach((f, i) => checkText(f.body, 'followup', c).forEach((x) => flags.push(Object.assign(x, { part: 'followup' + (i + 1) }))));
    const counts = { stop: 0, warn: 0, info: 0 }; flags.forEach((f) => { counts[f.level]++; });
    const score = Math.max(0, 100 - counts.stop * 25 - counts.warn * 8 - counts.info * 2);
    return { flags, counts, score, status: counts.stop ? 'stop' : counts.warn ? 'warn' : 'ok' };
  }
  return { SPAM, OPT_OUT, claimTokens, checkText, checkSubject, checkSequence };
});
