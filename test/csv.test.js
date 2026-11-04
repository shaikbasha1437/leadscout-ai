const test = require('node:test'); const assert = require('node:assert/strict');
const CSV = require('../js/lead/csv.js');

test('parses quotes, commas, escaped quotes and CRLF', () => {
  const r = CSV.parse('a,b\r\n"x, y","say ""hi"""\r\n');
  assert.deepEqual(r, [['a', 'b'], ['x, y', 'say "hi"']]);
});
test('detects semicolon and tab delimiters', () => {
  assert.equal(CSV.detectDelimiter('company;domain\nA;a.example'), ';');
  assert.equal(CSV.detectDelimiter('company\tdomain\nA\ta.example'), '\t');
});
test('maps common header names', () => {
  const { map } = CSV.mapHeaders(['Company Name', 'Website', 'First Name', 'Last Name', 'Job Title', 'Email Address', 'Employees', 'Country']);
  ['company', 'domain', 'first', 'last', 'title', 'email', 'employees', 'country'].forEach((k) => assert.ok(map[k] != null, k));
});
test('toLeads: domains cleaned, employee ranges and "2k" parsed, bad rows reported', () => {
  const out = CSV.toLeads('company,website,employees,name,email\n"Acme, Inc",https://www.acme.example/about,51-200,Jo Park,jo@acme.example\nGlobex,globex.example,2k,,not-an-email\n,,10,Sam,\n,,,,\n');
  assert.equal(out.errors.length, 0); assert.equal(out.leads.length, 2);
  const [a, g] = out.leads;
  assert.equal(a.company.name, 'Acme, Inc'); assert.equal(a.company.domain, 'acme.example'); assert.equal(a.company.employees, 126);
  assert.equal(a.contact.first, 'Jo'); assert.equal(a.contact.last, 'Park');
  assert.equal(g.company.employees, 2000);
  assert.ok(out.warnings.some((w) => /email/.test(w))); assert.ok(out.warnings.some((w) => /no company/.test(w)));
});
test('toLeads: a company name can be derived from the domain; missing columns is an error', () => {
  assert.equal(CSV.toLeads('domain\nblue-river.example\n').leads[0].company.name, 'Blue-River');
  assert.equal(CSV.toLeads('foo,bar\n1,2\n').errors.length, 1);
  assert.equal(CSV.toLeads('').errors.length, 1);
});
test('row cap', () => {
  const rows = ['company'].concat(Array.from({ length: 20 }, (_, i) => 'Co ' + i)).join('\n');
  const out = CSV.toLeads(rows, { max: 5 });
  assert.equal(out.leads.length, 5); assert.ok(out.warnings.some((w) => /first 5/.test(w)));
});
test('serialize escapes cells and blocks spreadsheet formulas', () => {
  assert.equal(CSV.cell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(CSV.cell('+1'), '\'+1'); assert.equal(CSV.cell('@SUM'), '\'@SUM'); assert.equal(CSV.cell(['a', 'b']), 'a; b');
  const s = CSV.serialize(['a', 'b'], [['x,y', 'line\nbreak']]);
  assert.deepEqual(CSV.parse(s), [['a', 'b'], ['x,y', 'line\nbreak']]);
});
