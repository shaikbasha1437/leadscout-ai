/* Leads view: filter, sort, pipeline status, bulk actions, CSV import, CSV/JSON export, add a lead. */
(function () {
  'use strict';
  const app = LS.app; const { h, toast, sheet, download } = LS.ui; const T = LS.text;
  const S = () => app.state;
  const f = { q: '', status: 'all', minFit: 0, flags: 'all', sort: 'fit' };
  const sel = new Set();
  const ORDER = { drafted: 0, researched: 1, new: 2, approved: 3, skipped: 4 };
  function filtered() {
    const q = T.norm(f.q).trim();
    let list = S().leads.filter((l) => (f.status === 'all' || l.status === f.status) && ((l.fit ? l.fit.score : 0) >= f.minFit)
      && (f.flags === 'all' || (f.flags === 'stop' ? l.quality && l.quality.counts.stop : f.flags === 'warn' ? l.quality && (l.quality.counts.stop || l.quality.counts.warn) : f.flags === 'clean' ? l.quality && !l.quality.counts.stop && !l.quality.counts.warn : !l.quality))
      && (!q || T.norm([l.company.name, l.company.domain, l.company.industry, l.company.country, l.contact && [l.contact.first, l.contact.last, l.contact.title].join(' '), l.notes].join(' ')).includes(q)));
    const by = { fit: (a, b) => (b.fit ? b.fit.score : -1) - (a.fit ? a.fit.score : -1), name: (a, b) => a.company.name.localeCompare(b.company.name), status: (a, b) => ORDER[a.status] - ORDER[b.status], flags: (a, b) => ((b.quality ? b.quality.counts.stop * 10 + b.quality.counts.warn : -1) - (a.quality ? a.quality.counts.stop * 10 + a.quality.counts.warn : -1)), updated: (a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) };
    return list.sort((a, b) => by[f.sort](a, b) || a.company.name.localeCompare(b.company.name));
  }
  const setF = (k, v) => { f[k] = v; app.refresh(); };
  function toolbar() {
    return h('div', { class: 'toolbar' },
      h('input', { type: 'search', id: 'lead-q', placeholder: 'Search company, contact, notes\u2026', 'aria-label': 'Search leads', value: f.q, oninput: (e) => setF('q', e.target.value) }),
      app.select([['all', 'All statuses']].concat(LS.store.STATUSES.map((s) => [s, app.STATUS[s]])), f.status, { id: 'lead-status', 'aria-label': 'Filter by status', onchange: (e) => setF('status', e.target.value) }),
      app.select([['all', 'Any flags'], ['stop', 'Has stop flags'], ['warn', 'Has warnings'], ['clean', 'Clean drafts'], ['none', 'Not drafted']], f.flags, { id: 'lead-flags', 'aria-label': 'Filter by flags', onchange: (e) => setF('flags', e.target.value) }),
      app.select([[0, 'Any fit'], [50, 'Fit \u2265 50'], [75, 'Fit \u2265 75']], f.minFit, { id: 'lead-fit', 'aria-label': 'Minimum fit', onchange: (e) => setF('minFit', Number(e.target.value)) }),
      app.select([['fit', 'Sort: fit'], ['name', 'Sort: company'], ['status', 'Sort: status'], ['flags', 'Sort: flags'], ['updated', 'Sort: updated']], f.sort, { id: 'lead-sort', 'aria-label': 'Sort', onchange: (e) => setF('sort', e.target.value) }));
  }
  function sortHead(key, label) { return h('th', { 'aria-sort': f.sort === key ? 'descending' : null }, h('button', { type: 'button', class: 'th-btn', onclick: () => setF('sort', key) }, label, f.sort === key ? ' \u2193' : '')); }
  function row(l) {
    const c = l.contact; const blocked = app.dncFor(l);
    return h('tr', { 'data-lead': l.id, class: l.status === 'skipped' ? 'dim' : '' },
      h('td', { class: 'cb' }, h('input', { type: 'checkbox', 'aria-label': 'Select ' + l.company.name, checked: sel.has(l.id), onchange: (e) => { if (e.target.checked) sel.add(l.id); else sel.delete(l.id); app.refresh(); } })),
      h('td', { 'data-label': 'Company' }, h('a', { href: '#lead/' + encodeURIComponent(l.id), class: 'lname' }, l.company.name), h('div', { class: 'small muted' }, [l.company.domain, l.company.industry, l.company.country].filter(Boolean).join(' \u00b7 ')), app.fictionalTag(l)),
      h('td', { 'data-label': 'Fit' }, app.fitChip(l.fit)),
      h('td', { 'data-label': 'Status' }, app.statusChip(l), blocked ? h('div', { class: 'small', style: 'color:var(--stop)' }, 'Do not contact') : null),
      h('td', { 'data-label': 'Contact' }, c && (c.first || c.title) ? h('span', {}, [c.first, c.last].filter(Boolean).join(' ') || '\u2014', h('div', { class: 'small muted' }, c.title || '')) : h('span', { class: 'muted small' }, 'No contact yet')),
      h('td', { 'data-label': 'Draft' }, app.flagChip(l.quality) || h('span', { class: 'muted small' }, 'Not drafted')),
      h('td', { 'data-label': 'Notes', class: 'notes-cell' }, l.notes ? h('span', { class: 'small' }, l.notes.slice(0, 80) + (l.notes.length > 80 ? '\u2026' : '')) : h('span', { class: 'muted small' }, '\u2014')));
  }
  function render(main) {
    const list = filtered(); const all = S().leads;
    [...sel].forEach((id) => { if (!app.lead(id)) sel.delete(id); });
    const counts = {}; LS.store.STATUSES.forEach((s) => { counts[s] = all.filter((l) => l.status === s).length; });
    main.append(h('div', { class: 'row', style: 'margin-bottom:10px' }, h('h1', { class: 'grow' }, 'Leads'),
      h('button', { type: 'button', class: 'btn', id: 'import-csv', onclick: importSheet }, 'Import CSV'),
      h('button', { type: 'button', class: 'btn', id: 'add-lead', onclick: () => addLeadSheet() }, 'Add lead'),
      h('div', { class: 'menu' }, h('button', { type: 'button', class: 'btn', id: 'export-csv', disabled: !all.length, onclick: () => { const ls = sel.size ? all.filter((l) => sel.has(l.id)) : list; download('leadscout-leads.csv', LS.store.leadsCSV(ls, app.knownKeys()), 'text/csv'); toast('Exported ' + ls.length + ' lead' + (ls.length === 1 ? '' : 's') + ' as CSV (drafts only, nothing sent).'); } }, 'Export CSV'),
        h('button', { type: 'button', class: 'btn', id: 'export-json', disabled: !all.length, onclick: () => { const ls = sel.size ? all.filter((l) => sel.has(l.id)) : list; download('leadscout-leads.json', JSON.stringify(LS.store.leadsJSON(ls, app.knownKeys()), null, 1)); toast('Exported ' + ls.length + ' lead' + (ls.length === 1 ? '' : 's') + ' as JSON.'); } }, 'Export JSON'))));
    main.append(h('div', { class: 'pipeline', role: 'list', 'aria-label': 'Pipeline' }, LS.store.STATUSES.map((s) => h('button', { type: 'button', role: 'listitem', class: 'pipe ' + (f.status === s ? 'on' : ''), 'data-pipe': s, onclick: () => setF('status', f.status === s ? 'all' : s) }, h('b', {}, String(counts[s])), app.STATUS[s]))));
    if (!all.length) {
      main.append(h('div', { class: 'panel empty' }, h('div', { class: 'big' }, '\ud83d\udd0e'), h('p', {}, 'No leads yet. Run the agent on the fictional demo data, import a CSV of accounts you already have, or add one by hand.'), h('div', { class: 'row', style: 'justify-content:center' }, h('a', { class: 'btn primary', href: '#agent' }, 'Go to the agent'), h('button', { type: 'button', class: 'btn', onclick: importSheet }, 'Import CSV'))));
      return;
    }
    main.append(toolbar());
    if (sel.size) main.append(h('div', { class: 'bulk row' }, h('b', {}, sel.size + ' selected'),
      h('button', { type: 'button', class: 'btn sm', id: 'bulk-skip', onclick: () => { const ids = [...sel]; const snaps = ids.map((id) => [app.lead(id), app.clone(app.lead(id))]); ids.forEach((id) => { const l = app.lead(id); l.status = 'skipped'; l.skipReason = 'Skipped by you'; }); sel.clear(); app.save(); app.refresh(); LS.ui.undoToast('Skipped ' + ids.length + ' lead' + (ids.length > 1 ? 's' : '') + '.', () => { snaps.forEach(([l, s]) => { Object.keys(l).forEach((k) => delete l[k]); Object.assign(l, s); }); app.save(); app.refresh(); }); } }, 'Skip'),
      h('button', { type: 'button', class: 'btn sm danger', id: 'bulk-delete', onclick: () => { const ids = [...sel]; sel.clear(); app.deleteLeads(ids); } }, 'Delete'),
      h('button', { type: 'button', class: 'btn sm ghost', onclick: () => { sel.clear(); app.refresh(); } }, 'Clear selection')));
    if (!list.length) { main.append(h('div', { class: 'panel empty' }, h('p', {}, 'No leads match these filters.'), h('button', { type: 'button', class: 'btn', onclick: () => { Object.assign(f, { q: '', status: 'all', minFit: 0, flags: 'all' }); app.refresh(); } }, 'Clear filters'))); return; }
    const allSel = list.every((l) => sel.has(l.id));
    main.append(h('div', { class: 'panel tight' }, h('table', { class: 't leads' },
      h('thead', {}, h('tr', {}, h('th', { class: 'cb' }, h('input', { type: 'checkbox', 'aria-label': 'Select all shown', checked: allSel, onchange: (e) => { list.forEach((l) => { if (e.target.checked) sel.add(l.id); else sel.delete(l.id); }); app.refresh(); } })), sortHead('name', 'Company'), sortHead('fit', 'Fit'), sortHead('status', 'Status'), h('th', {}, 'Contact'), sortHead('flags', 'Draft'), h('th', {}, 'Notes'))),
      h('tbody', {}, list.map(row)))),
      h('p', { class: 'small muted' }, list.length + ' of ' + all.length + ' leads shown. Fictional demo leads use .example domains, which can\u2019t receive mail.'));
  }
  // ---------- CSV import ----------
  const SAMPLE = 'company,domain,industry,employees,country,first_name,last_name,title,email,tech,notes\nExample Robotics,example-robotics.example,SaaS,51-200,Germany,Jo,Sample,Head of Data,jo@example-robotics.example,Snowflake|dbt,Met at a (fictional) meetup; asked about data tests\nSample Health Co,samplehealth.example,Healthcare,800,United States,,,VP Engineering,,BigQuery,\n';
  function importSheet() {
    let text = ''; let parsed = null; let name = '';
    const out = h('div', { id: 'csv-preview' });
    const paint = () => {
      out.textContent = '';
      if (!text.trim()) { out.append(h('p', { class: 'small muted' }, 'Columns LeadScout understands: company, domain, industry, employees, country, city, first_name, last_name (or name), title, email, tech (use | between tools), notes. Other columns are ignored.')); return; }
      parsed = LS.csv.toLeads(text);
      if (parsed.errors.length) { out.append(h('div', { class: 'notice stop' }, parsed.errors.join(' '))); return; }
      out.append(h('p', {}, h('b', {}, parsed.leads.length + ' lead' + (parsed.leads.length === 1 ? '' : 's')), ' ready to import' + (name ? ' from ' + name : '') + '.'),
        parsed.unknown.length ? h('p', { class: 'small muted' }, 'Ignored columns: ' + parsed.unknown.join(', ')) : null,
        parsed.warnings.length ? h('div', { class: 'notice warn small' }, h('ul', { style: 'margin:0;padding-left:18px' }, parsed.warnings.slice(0, 8).map((w) => h('li', {}, w)))) : null,
        h('div', { style: 'overflow:auto;max-height:220px;margin-top:8px' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Company', 'Domain', 'Size', 'Country', 'Contact'].map((x) => h('th', {}, x)))), h('tbody', {}, parsed.leads.slice(0, 50).map((l) => h('tr', {}, h('td', {}, l.company.name), h('td', {}, l.company.domain || '\u2014'), h('td', {}, l.company.employees || '\u2014'), h('td', {}, l.company.country || '\u2014'), h('td', {}, l.contact ? [l.contact.first, l.contact.last, l.contact.title].filter(Boolean).join(' ') : '\u2014')))))));
    };
    const ta = h('textarea', { id: 'csv-text', rows: 6, spellcheck: 'false', placeholder: 'Paste CSV here, or choose a file', oninput: (e) => { text = e.target.value; name = ''; paint(); } });
    const file = h('input', { type: 'file', id: 'csv-file', accept: '.csv,text/csv,.tsv,.txt', onchange: async (e) => { const fl = e.target.files[0]; if (!fl) return; if (fl.size > 5e6) { toast('That file is over 5 MB.'); return; } text = await fl.text(); name = fl.name; ta.value = text; paint(); } });
    sheet({
      id: 'import', title: 'Import leads from CSV', wide: true, cancelLabel: 'Cancel', isDirty: () => !!text.trim(), confirmText: 'Discard this import?',
      body: (b) => { b.append(h('p', { class: 'small' }, 'Import accounts you already have the right to contact. LeadScout does not look anyone up. ', h('button', { type: 'button', class: 'linkish', onclick: () => { text = SAMPLE; ta.value = SAMPLE; name = 'sample'; paint(); } }, 'Use a fictional sample')), app.field('CSV file', file), app.field('Or paste CSV', ta), out); paint(); },
      actions: [{ id: 'do-import', label: 'Import', cls: 'primary', fn: (api) => { if (!parsed || !parsed.leads.length) { toast(text.trim() ? 'Nothing importable in that CSV.' : 'Choose a file or paste CSV first.'); return; } const n = parsed.leads; text = ''; api.close(); app.addLeads(n, 'Imported'); } }]
    });
  }
  // ---------- add lead ----------
  function addLeadSheet() {
    const v = { name: '', domain: '', industry: '', employees: '', country: '', first: '', last: '', title: '', email: '', notes: '', urls: '' };
    const dirty = () => Object.values(v).some((x) => String(x).trim());
    const inp = (k, label, type, hint) => app.field(label, h(type === 'textarea' ? 'textarea' : 'input', Object.assign({ id: 'nl-' + k, oninput: (e) => { v[k] = e.target.value; } }, type === 'textarea' ? { rows: 3 } : { type: type || 'text' })), hint);
    const err = h('div', { class: 'notice stop', id: 'nl-err', hidden: true });
    sheet({
      id: 'add-lead', title: 'Add a lead', cancelLabel: 'Cancel', isDirty: dirty, confirmText: 'Discard this lead?',
      body: (b) => b.append(err, inp('name', 'Company name (required)'), h('div', { class: 'cols' }, inp('domain', 'Website domain'), inp('industry', 'Industry')), h('div', { class: 'cols' }, inp('employees', 'Employees', 'number'), inp('country', 'Country')),
        h('h3', {}, 'Contact (optional)'), h('p', { class: 'small muted', style: 'margin-top:-4px' }, 'Only someone you have a lawful reason to contact. Leave blank and LeadScout suggests roles instead.'),
        h('div', { class: 'cols' }, inp('first', 'First name'), inp('last', 'Last name')), h('div', { class: 'cols' }, inp('title', 'Title'), inp('email', 'Work email', 'email')),
        inp('notes', 'Research notes', 'textarea', 'Paste anything you know: news, a job post, a page\u2019s text. Drafts can cite it.'), inp('urls', 'Page URLs (one per line)', 'textarea', 'Read with Tavily in live mode. Without Tavily, browsers can\u2019t open other sites, so paste the text above.')),
      actions: [{ id: 'save-lead', label: 'Add lead', cls: 'primary', fn: (api) => {
        if (!v.name.trim()) { err.hidden = false; err.textContent = 'Add a company name, or press Cancel.'; document.getElementById('nl-name').focus(); return; }
        const contact = v.first || v.title || v.email ? { first: v.first.trim(), last: v.last.trim(), title: v.title.trim(), email: v.email.trim() } : null;
        const lead = { company: { name: v.name.trim(), domain: v.domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''), industry: v.industry.trim(), employees: Number(v.employees) || null, country: v.country.trim(), tech: [], hiring: [], news: [], funding: null }, contact, people: contact ? [contact] : [], researchNotes: v.notes.trim(), urls: v.urls.split(/\s+/).filter((u) => /^https?:\/\//i.test(u)), source: 'manual' };
        Object.keys(v).forEach((k) => { v[k] = ''; }); api.close().then(() => { const added = app.addLeads([lead], 'Added'); if (added[0]) location.hash = '#lead/' + encodeURIComponent(added[0].id); });
      } }]
    });
  }
  app.importSheet = importSheet; app.addLeadSheet = addLeadSheet;
  app.views.leads = { render, filters: f };
})();
