/* LeadScout compliance basics: do-not-contact matching, per-country reminders and mailto links.
   Reminders are general information, not legal advice. LeadScout never sends anything itself. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./text.js'), require('./icp.js'));
  else (root.LS = root.LS || {}).compliance = factory(root.LS.text, root.LS.icp);
})(typeof self !== 'undefined' ? self : this, function (T, I) {
  'use strict';
  const EEA = I.REGIONS.eu.concat(['norway', 'iceland', 'liechtenstein']);
  const RULES = {
    canspam: { id: 'canspam', name: 'CAN-SPAM (United States)', level: 'info', short: 'US: honest subject and sender, a postal address, and an opt-out you honour within 10 business days.', url: 'https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business' },
    gdpr: { id: 'gdpr', name: 'GDPR + ePrivacy (EU/EEA)', level: 'warn', short: 'EU/EEA: you need a lawful basis (often legitimate interest for B2B), must say where you got the data, keep it minimal, and honour objections at once. Some countries need prior consent even for B2B email.', url: 'https://commission.europa.eu/law/law-topic/data-protection_en' },
    ukgdpr: { id: 'ukgdpr', name: 'UK GDPR + PECR (United Kingdom)', level: 'warn', short: 'UK: B2B email to corporate addresses is allowed with an opt-out, but sole traders and partnerships need consent; UK GDPR still applies to the personal data.', url: 'https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/' },
    casl: { id: 'casl', name: 'CASL (Canada)', level: 'warn', short: 'Canada: commercial email needs consent (express, or implied e.g. a published business address relevant to the message), plus sender ID and an unsubscribe that works for 60 days.', url: 'https://crtc.gc.ca/eng/com500/faq500.htm' },
    spamact: { id: 'spamact', name: 'Spam Act 2003 (Australia)', level: 'warn', short: 'Australia: consent (express or inferred), clear sender identity and a working unsubscribe.', url: 'https://www.acma.gov.au/avoid-sending-spam' },
    lgpd: { id: 'lgpd', name: 'LGPD (Brazil)', level: 'warn', short: 'Brazil: a legal basis such as legitimate interest, transparency about the source of the data, and an easy objection.', url: 'https://www.gov.br/anpd/' },
    pdpa: { id: 'pdpa', name: 'PDPA + Spam Control Act (Singapore)', level: 'warn', short: 'Singapore: business-to-business messages are mostly outside the DNC Registry, but personal data rules and unsubscribe duties still apply.', url: 'https://www.pdpc.gov.sg/' },
    dpdp: { id: 'dpdp', name: 'DPDP Act (India)', level: 'warn', short: 'India: personal data processing generally needs consent or a listed legitimate use; give a clear way to withdraw.', url: 'https://www.meity.gov.in/data-protection-framework' },
    appi: { id: 'appi', name: 'APPI + Anti-Spam Act (Japan)', level: 'warn', short: 'Japan: marketing email generally needs prior opt-in consent, with sender details and an opt-out.', url: 'https://www.ppc.go.jp/en/' },
    general: { id: 'general', name: 'Local rules', level: 'info', short: 'Check the email-marketing and privacy rules for this country before you reach out.', url: '' }
  };
  function regimeFor(country) {
    const c = I.canonPlace(country);
    if (!c) return RULES.general;
    if (c === 'united states') return RULES.canspam;
    if (c === 'united kingdom') return RULES.ukgdpr;
    if (EEA.includes(c)) return RULES.gdpr;
    if (c === 'canada') return RULES.casl;
    if (c === 'australia') return RULES.spamact;
    if (c === 'brazil') return RULES.lgpd;
    if (c === 'singapore') return RULES.pdpa;
    if (c === 'india') return RULES.dpdp;
    if (c === 'japan') return RULES.appi;
    return RULES.general;
  }
  /* Do-not-contact entries: an email (a@b.com), a domain (b.com or @b.com) or a company name. */
  function parseEntry(raw) {
    const s = String(raw || '').trim().replace(/^mailto:/i, '');
    if (!s) return null;
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return { type: 'email', value: s.toLowerCase(), raw: s };
    const d = s.replace(/^@/, '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '').toLowerCase();
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) return { type: 'domain', value: d, raw: s };
    return { type: 'company', value: T.norm(s).replace(/[^a-z0-9]+/g, ' ').trim(), raw: s };
  }
  function parseList(text) {
    const seen = new Set(); const out = [];
    String(text || '').split(/[\n,;]+/).map(parseEntry).filter(Boolean).forEach((e) => { const k = e.type + ':' + e.value; if (!seen.has(k)) { seen.add(k); out.push(e); } });
    return out;
  }
  const domainOf = (email) => String(email || '').toLowerCase().split('@')[1] || '';
  function blocked(lead, list) {
    const co = lead.company || {}; const emails = [lead.contact && lead.contact.email].concat((lead.people || []).map((p) => p.email)).filter(Boolean).map((e) => e.toLowerCase());
    const domains = new Set([String(co.domain || '').toLowerCase().replace(/^www\./, '')].concat(emails.map(domainOf)).filter(Boolean));
    const name = T.norm(co.name).replace(/[^a-z0-9]+/g, ' ').trim();
    for (const e of list || []) {
      if (e.type === 'email' && lead.contact && lead.contact.email && lead.contact.email.toLowerCase() === e.value) return { entry: e, reason: 'Contact ' + e.value + ' is on your do-not-contact list' };
      if (e.type === 'domain' && [...domains].some((d) => d === e.value || d.endsWith('.' + e.value))) return { entry: e, reason: 'Domain ' + e.value + ' is on your do-not-contact list' };
      if (e.type === 'company' && name && name === e.value) return { entry: e, reason: co.name + ' is on your do-not-contact list' };
    }
    return null;
  }
  // Remove one contact from the people list if only that email is blocked (others at the company stay).
  function mailto(to, subject, body) {
    const q = [];
    if (subject) q.push('subject=' + encodeURIComponent(T.stripMarkers(subject)));
    if (body) q.push('body=' + encodeURIComponent(T.stripMarkers(body).replace(/\r?\n/g, '\r\n')));
    return 'mailto:' + encodeURIComponent(to || '').replace(/%40/g, '@') + (q.length ? '?' + q.join('&') : '');
  }
  const CHECKLIST = [
    'LeadScout writes drafts only. It never sends email, LinkedIn messages or anything else.',
    'Check every fact before you send. Flags show claims that no source backs up.',
    'Tell people who you are and how you found them, and make saying no easy.',
    'Honour opt-outs at once and add them to the do-not-contact list here.',
    'Keep only the data you need, and delete leads you no longer work.',
    'Don\u2019t buy or scrape personal email lists; respect each site\u2019s terms.'
  ];
  return { RULES, regimeFor, parseEntry, parseList, blocked, mailto, CHECKLIST, domainOf };
});
