/* LeadScout text helpers: tokens, sentences, word counts, citation markers, ids. Pure functions. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.LS = root.LS || {}).text = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const STOP = new Set('a an and the of for to in on at by with &amp; & or de da van von der la le'.split(' '));
  const norm = (s) => String(s == null ? '' : s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const tokens = (s) => norm(s).split(/[^a-z0-9+#.]+/).map((t) => t.replace(/^\.+|\.+$/g, '')).filter((t) => t && !STOP.has(t));
  const list = (s) => (Array.isArray(s) ? s : String(s || '').split(/[,;\n]+/)).map((x) => String(x).trim()).filter(Boolean);
  // Citation markers like [F3] or [P1] (also [F3, F4]).
  const MARK = /\[((?:[FP]\d+)(?:\s*,\s*[FP]\d+)*)\]/g;
  function markers(s) { const out = []; String(s || '').replace(MARK, (m, g) => { g.split(/\s*,\s*/).forEach((x) => out.push(x)); return m; }); return out; }
  const stripMarkers = (s) => String(s || '').replace(/\s*\[(?:[FP]\d+)(?:\s*,\s*[FP]\d+)*\]/g, '').replace(/[ \t]+([.,;:!?])/g, '$1');
  const words = (s) => (stripMarkers(s).match(/[\p{L}\p{N}][\p{L}\p{N}'\u2019-]*/gu) || []);
  const wordCount = (s) => words(s).length;
  // Split into sentences, keeping citation markers with the sentence they follow.
  function sentences(s) {
    const t = String(s || '').replace(/\r/g, '');
    const out = [];
    t.split(/\n+/).forEach((line) => {
      const re = /[^.!?]+(?:[.!?]+(?:\s*\[(?:[FP]\d+)(?:\s*,\s*[FP]\d+)*\])*|$)/g;
      let m; while ((m = re.exec(line))) { const x = m[0].trim(); if (x) out.push(x); if (!m[0]) break; }
    });
    return out;
  }
  function slug(s) { return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'lead'; }
  function uid(prefix) { return (prefix || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function daysBetween(a, b) { const x = new Date(a); const y = new Date(b); if (isNaN(x) || isNaN(y)) return Infinity; return Math.round((y - x) / 86400000); }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return { norm, tokens, list, markers, stripMarkers, words, wordCount, sentences, slug, uid, daysBetween, esc, MARK };
});
