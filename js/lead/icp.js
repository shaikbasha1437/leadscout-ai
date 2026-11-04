/* LeadScout ideal-customer profile and fit scoring. The score is computed locally and explained line
   by line, so it is the same in demo and live mode and a model can't inflate it. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./text.js'));
  else (root.LS = root.LS || {}).icp = factory(root.LS.text);
})(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';
  const REGIONS = {
    'north america': ['united states', 'usa', 'us', 'canada', 'mexico'],
    europe: ['united kingdom', 'uk', 'ireland', 'germany', 'france', 'netherlands', 'belgium', 'spain', 'portugal', 'italy', 'sweden', 'norway', 'denmark', 'finland', 'poland', 'austria', 'switzerland', 'czech republic', 'estonia', 'iceland', 'luxembourg'],
    apac: ['australia', 'new zealand', 'singapore', 'india', 'japan', 'south korea', 'indonesia', 'malaysia', 'philippines', 'vietnam', 'thailand', 'hong kong', 'taiwan'],
    latam: ['brazil', 'argentina', 'chile', 'colombia', 'peru', 'mexico', 'uruguay'],
    mea: ['united arab emirates', 'saudi arabia', 'israel', 'south africa', 'nigeria', 'kenya', 'egypt']
  };
  REGIONS.emea = REGIONS.europe.concat(REGIONS.mea);
  REGIONS.eu = REGIONS.europe.filter((c) => !['united kingdom', 'uk', 'norway', 'switzerland', 'iceland'].includes(c));
  REGIONS.dach = ['germany', 'austria', 'switzerland'];
  REGIONS.nordics = ['sweden', 'norway', 'denmark', 'finland', 'iceland'];
  const ALIAS = { us: 'united states', usa: 'united states', 'u.s.': 'united states', uk: 'united kingdom', 'great britain': 'united kingdom', na: 'north america', amer: 'north america', 'latin america': 'latam', 'asia pacific': 'apac', 'asia-pacific': 'apac' };
  const INDUSTRY_SYN = { saas: ['software', 'b2b software', 'cloud'], fintech: ['payments', 'financial technology', 'banking', 'lending'], 'e-commerce': ['ecommerce', 'retail', 'marketplace', 'online retail'], healthcare: ['health', 'healthtech', 'medical', 'clinical'], logistics: ['freight', 'supply chain', 'shipping', 'transportation'] };
  const DEFAULT_ICP = {
    industries: ['SaaS', 'Fintech', 'E-commerce', 'Healthcare', 'Logistics'],
    sizeMin: 50, sizeMax: 1000,
    regions: ['North America', 'Europe'],
    roles: ['Head of Data', 'VP Data', 'Director of Data', 'Data Engineering Manager', 'VP Engineering'],
    tech: ['Snowflake', 'BigQuery', 'Databricks', 'dbt', 'Airflow'],
    hiringKeywords: ['data engineer', 'analytics engineer', 'data platform', 'data reliability', 'data quality'],
    wantFunding: true, wantHiring: true, maxLeads: 12, minFit: 50, recencyDays: 120
  };
  const DEFAULT_PRODUCT = {
    name: 'Beaconly',
    pitch: 'Beaconly is data pipeline observability for mid-size data teams. It watches dbt, Airflow and warehouse jobs and alerts the owner on Slack when a table is late, empty or broken, before a dashboard goes stale.',
    valueProps: ['Catches late or failed data loads before customers see stale dashboards', 'Shows which dashboards and reports a broken table affects', 'Sets up from your dbt project and Airflow DAGs without new code', 'Gives auditors a history of data-quality checks'],
    proofPoints: ['Most teams connect their first warehouse in under an hour', 'Free for up to 50 monitored tables'],
    fictional: true
  };
  const canonPlace = (s) => { const n = T.norm(s).trim(); return ALIAS[n] || n; };
  function regionMatch(country, regions) {
    const c = canonPlace(country);
    if (!regions || !regions.length) return { ok: null };
    for (const r of regions) {
      const k = canonPlace(r);
      if (k === c) return { ok: true, via: r };
      if (REGIONS[k] && REGIONS[k].map(canonPlace).includes(c)) return { ok: true, via: r };
    }
    return { ok: false };
  }
  function industryMatch(ind, list) {
    if (!list || !list.length) return { ok: null };
    const n = T.norm(ind);
    for (const want of list) {
      const w = T.norm(want).trim();
      if (!w) continue;
      if (n === w || n.includes(w) || (w.length > 3 && w.includes(n) && n)) return { ok: true, via: want };
      const syn = INDUSTRY_SYN[w] || [];
      if (syn.some((s) => n.includes(s))) return { ok: true, via: want };
    }
    return { ok: false };
  }
  const TITLE_SYN = [[/\bvice president\b/g, 'vp'], [/\bdir\.?\b/g, 'director'], [/\bmgr\b/g, 'manager'], [/\bchief data officer\b/g, 'cdo'], [/\bchief technology officer\b/g, 'cto'], [/\beng\b/g, 'engineering']];
  function titleTokens(s) { let n = T.norm(s); TITLE_SYN.forEach(([re, r]) => { n = n.replace(re, r); }); return T.tokens(n); }
  // How well a job title matches a target role, 0..1 (share of the role's words found in the title).
  function roleScore(title, role) {
    const r = titleTokens(role); const t = new Set(titleTokens(title));
    if (!r.length || !t.size) return 0;
    const hit = r.filter((w) => t.has(w) || (w === 'engineering' && t.has('engineer')) || (w === 'data' && (t.has('analytics') || t.has('analytic')))).length;
    return hit / r.length;
  }
  function bestRole(title, roles) { let best = { score: 0, role: '' }; (roles || []).forEach((r) => { const s = roleScore(title, r); if (s > best.score) best = { score: s, role: r }; }); return best; }
  function rankPeople(people, roles) {
    return (people || []).map((p) => Object.assign({}, p, { match: bestRole(p.title, roles) })).sort((a, b) => b.match.score - a.match.score);
  }
  function techOverlap(stack, wanted) {
    const have = new Map((stack || []).map((x) => [T.norm(x).trim(), x]));
    return (wanted || []).filter((w) => have.has(T.norm(w).trim())).map((w) => have.get(T.norm(w).trim()));
  }
  function hiringMatches(hiring, keywords) {
    const k = (keywords || []).map((x) => T.norm(x).trim()).filter(Boolean);
    return (hiring || []).filter((j) => { const r = T.norm(j.role); return k.some((w) => r.includes(w)); });
  }
  /* Score a company against the ICP. asOf = ISO date that "recent" is measured from. */
  function scoreFit(co, icpIn, people, asOf) {
    const icp = Object.assign({}, DEFAULT_ICP, icpIn || {});
    const now = asOf || new Date().toISOString().slice(0, 10);
    const reasons = []; let score = 0;
    const add = (pts, max, ok, text) => { score += pts; reasons.push({ pts, max, ok, text }); };
    const im = industryMatch(co.industry, icp.industries);
    if (im.ok === null) add(10, 20, null, 'No industry filter set');
    else if (im.ok) add(20, 20, true, (co.industry || 'Industry') + ' matches \u201c' + im.via + '\u201d');
    else add(0, 20, false, (co.industry ? co.industry + ' is' : 'Industry unknown,') + ' not in your target industries');
    const n = Number(co.employees);
    if (!n) add(5, 15, null, 'Company size unknown');
    else if (n >= icp.sizeMin && n <= icp.sizeMax) add(15, 15, true, n + ' employees is inside ' + icp.sizeMin + '\u2013' + icp.sizeMax);
    else if (n >= icp.sizeMin * 0.5 && n <= icp.sizeMax * 1.5) add(7, 15, false, n + ' employees is just outside ' + icp.sizeMin + '\u2013' + icp.sizeMax);
    else add(0, 15, false, n + ' employees is far from ' + icp.sizeMin + '\u2013' + icp.sizeMax);
    const rm = regionMatch(co.country, T.list(icp.regions));
    if (rm.ok === null) add(8, 15, null, 'No region filter set');
    else if (rm.ok) add(15, 15, true, (co.country || '') + ' is in ' + rm.via);
    else add(0, 15, false, (co.country || 'Country unknown') + ' is outside your regions');
    const tech = techOverlap(co.tech, T.list(icp.tech));
    const tp = Math.min(20, tech.length * 8);
    add(tp, 20, tech.length ? true : (T.list(icp.tech).length ? false : null), tech.length ? 'Uses ' + tech.join(', ') : (co.tech && co.tech.length ? 'None of your target tools in their stack (' + co.tech.slice(0, 3).join(', ') + ')' : 'Tech stack unknown'));
    const ranked = rankPeople(people || co.people, T.list(icp.roles));
    const top = ranked[0];
    if (top && top.match.score >= 0.66) add(10, 10, true, (top.first ? top.first + ' ' + (top.last || '') + ', ' : '') + top.title + ' matches \u201c' + top.match.role + '\u201d');
    else if (top && top.match.score >= 0.34) add(5, 10, null, 'Closest contact: ' + top.title + ' (partial role match)');
    else add(0, 10, false, 'No contact with a target role yet');
    const jobs = hiringMatches(co.hiring, T.list(icp.hiringKeywords)).filter((j) => T.daysBetween(j.date, now) <= icp.recencyDays);
    if (icp.wantHiring === false) add(5, 10, null, 'Hiring signal not required');
    else if (jobs.length) add(10, 10, true, 'Hiring ' + jobs.length + ' matching role' + (jobs.length > 1 ? 's' : '') + ' (' + Array.from(new Set(jobs.map((j) => j.role))).join(', ') + ')');
    else add(0, 10, false, 'No recent matching job posts found');
    const f = co.funding;
    const fAge = f ? T.daysBetween(f.date, now) : Infinity;
    if (icp.wantFunding === false) add(5, 10, null, 'Funding signal not required');
    else if (f && fAge <= 180) add(10, 10, true, f.round + ' (' + f.amount + ') ' + fAge + ' days ago');
    else if (f) add(4, 10, null, 'Last round (' + f.round + ') was ' + fAge + ' days ago');
    else add(0, 10, false, 'No recent funding found');
    score = Math.max(0, Math.min(100, Math.round(score)));
    return { score, grade: score >= 75 ? 'strong' : score >= 50 ? 'good' : score >= 30 ? 'weak' : 'poor', reasons, contact: top && top.match.score >= 0.34 ? top : (ranked[0] || null) };
  }
  function normalize(icp) {
    const o = Object.assign({}, DEFAULT_ICP, icp || {});
    ['industries', 'regions', 'roles', 'tech', 'hiringKeywords'].forEach((k) => { o[k] = T.list(o[k]); });
    o.sizeMin = Math.max(0, Number(o.sizeMin) || 0); o.sizeMax = Math.max(o.sizeMin, Number(o.sizeMax) || 100000);
    o.maxLeads = Math.min(200, Math.max(1, Math.round(Number(o.maxLeads) || 12))); o.minFit = Math.min(100, Math.max(0, Number(o.minFit) || 0));
    o.recencyDays = Math.max(7, Number(o.recencyDays) || 120);
    return o;
  }
  function describe(icp) {
    const o = normalize(icp);
    return [o.industries.length ? o.industries.join(', ') : 'any industry', o.sizeMin + '\u2013' + o.sizeMax + ' employees', o.regions.length ? o.regions.join(', ') : 'any region', o.roles.length ? 'roles: ' + o.roles.join(', ') : 'any role'].join(' \u00b7 ');
  }
  return { REGIONS, DEFAULT_ICP, DEFAULT_PRODUCT, regionMatch, industryMatch, roleScore, bestRole, rankPeople, techOverlap, hiringMatches, scoreFit, normalize, describe, canonPlace };
});
