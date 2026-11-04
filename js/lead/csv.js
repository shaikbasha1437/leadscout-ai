/* LeadScout CSV: RFC 4180 parser (quotes, CRLF, BOM, comma/semicolon/tab), header mapping to leads,
   and an exporter that guards against spreadsheet formula injection. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./text.js'));
  else (root.LS = root.LS || {}).csv = factory(root.LS.text);
})(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';
  function detectDelimiter(text) {
    const line = String(text).split(/\r?\n/).find((l) => l.trim()) || '';
    const counts = [',', ';', '\t'].map((d) => { let n = 0; let q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === d && !q) n++; } return [d, n]; });
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][1] ? counts[0][0] : ',';
  }
  function parse(text, delim) {
    let s = String(text || ''); if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    const d = delim || detectDelimiter(s);
    const rows = []; let row = []; let cell = ''; let q = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) {
        if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
      } else if (ch === '"' && cell === '') q = true;
      else if (ch === d) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  }
  const FIELDS = {
    company: ['company', 'company name', 'account', 'account name', 'organization', 'organisation', 'org'],
    domain: ['domain', 'company domain', 'website', 'url', 'company website', 'site'],
    industry: ['industry', 'sector', 'vertical'],
    employees: ['employees', 'employee count', 'headcount', 'size', 'company size', '# employees', 'number of employees'],
    country: ['country', 'company country', 'hq country'],
    city: ['city', 'location', 'hq', 'hq city'],
    first: ['first name', 'firstname', 'first', 'given name'],
    last: ['last name', 'lastname', 'last', 'surname', 'family name'],
    name: ['name', 'full name', 'contact', 'contact name'],
    title: ['title', 'job title', 'role', 'position'],
    email: ['email', 'email address', 'work email', 'e-mail'],
    tech: ['tech', 'tech stack', 'technologies', 'stack'],
    notes: ['notes', 'note', 'research', 'context', 'description', 'about']
  };
  function mapHeaders(header) {
    const map = {}; const unknown = [];
    header.forEach((h, i) => {
      const n = T.norm(h).replace(/[_]+/g, ' ').trim();
      const f = Object.keys(FIELDS).find((k) => FIELDS[k].includes(n));
      if (f && map[f] == null) map[f] = i; else if (n) unknown.push(h);
    });
    return { map, unknown };
  }
  const cleanDomain = (s) => String(s || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '').toLowerCase();
  /* Turn CSV text into leads. Returns { leads, errors, warnings, unknown } */
  function toLeads(text, opts) {
    const o = opts || {}; const rows = parse(text);
    const out = { leads: [], errors: [], warnings: [], unknown: [] };
    if (!rows.length) { out.errors.push('The file is empty.'); return out; }
    const { map, unknown } = mapHeaders(rows[0]); out.unknown = unknown;
    if (map.company == null && map.domain == null) { out.errors.push('No \u201ccompany\u201d or \u201cdomain\u201d column found. The first row must be a header.'); return out; }
    const max = o.max || 500;
    rows.slice(1).forEach((r, i) => {
      const g = (k) => (map[k] == null ? '' : String(r[map[k]] == null ? '' : r[map[k]]).trim());
      const dom = cleanDomain(g('domain'));
      const company = g('company') || (dom ? dom.split('.')[0].replace(/(^|-)\w/g, (x) => x.toUpperCase()) : '');
      if (!company) { out.warnings.push('Row ' + (i + 2) + ': no company, skipped.'); return; }
      if (out.leads.length >= max) { if (out.leads.length === max) out.warnings.push('Only the first ' + max + ' rows were imported.'); return; }
      let first = g('first'); let last = g('last');
      if (!first && g('name')) { const parts = g('name').split(/\s+/); first = parts[0]; last = parts.slice(1).join(' '); }
      const email = g('email');
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) out.warnings.push('Row ' + (i + 2) + ': \u201c' + email + '\u201d doesn\u2019t look like an email.');
      const empRaw = String(g('employees')).replace(/,/g, '');
      const rng = empRaw.match(/(\d+)\s*(?:-|\u2013|to)\s*(\d+)/);
      const emp = rng ? Math.round((Number(rng[1]) + Number(rng[2])) / 2) : (Number((empRaw.match(/\d+/) || [])[0]) || 0) * (/\d\s*k\b/i.test(empRaw) ? 1000 : 1);
      const contact = first || email || g('title') ? { first, last, title: g('title'), email } : null;
      out.leads.push({ company: { name: company, domain: dom, industry: g('industry'), employees: emp || null, country: g('country'), city: g('city'), tech: T.list(g('tech').replace(/\|/g, ',')), hiring: [], news: [], funding: null }, contact, people: contact ? [contact] : [], researchNotes: g('notes'), source: 'import' });
    });
    return out;
  }
  function cell(v) {
    let s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = '\'' + s; // stop spreadsheets from running formulas
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function serialize(header, rows) { return [header].concat(rows).map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'; }
  return { parse, detectDelimiter, mapHeaders, toLeads, serialize, cell, FIELDS };
});
