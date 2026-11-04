const test = require('node:test'); const assert = require('node:assert/strict');
const T = require('../js/lead/text.js');
test('citation markers are found and stripped cleanly', () => {
  assert.deepEqual(T.markers('A [F1]. B [P2][F3].'), ['F1', 'P2', 'F3']);
  assert.equal(T.stripMarkers('Raised $9M [F5]. Fast [P2].'), 'Raised $9M. Fast.');
});
test('word count, sentences, slug and day maths', () => {
  assert.equal(T.wordCount('Hi there, Ciara! [F1]'), 3);
  assert.equal(T.sentences('One. Two? Three!').length, 3);
  assert.equal(T.slug('Aurora Ops, Inc.'), 'aurora-ops-inc');
  assert.equal(T.daysBetween('2026-10-01', '2026-11-01'), 31);
});
test('esc escapes HTML', () => assert.equal(T.esc('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;'));
test('list splits commas and newlines and trims', () => assert.deepEqual(T.list(' a, b\nc ,, '), ['a', 'b', 'c']));
