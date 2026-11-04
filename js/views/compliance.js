/* Compliance: CAN-SPAM / GDPR and other reminders for the countries in your list, the outreach
   checklist, and the do-not-contact list (add, bulk add, remove with undo, export). */
(function () {
  'use strict';
  const app = LS.app; const { h, toast, sheet, undoToast, download } = LS.ui; const C = LS.compliance;
  const S = () => app.state;
  function bulkSheet() {
    let text = ''; const prev = h('p', { class: 'small muted', id: 'dnc-preview' }, 'One entry per line: an email, a domain, or a company name.');
    const paint = () => { const e = C.parseList(text); prev.textContent = e.length ? e.length + ' entr' + (e.length === 1 ? 'y' : 'ies') + ': ' + ['email', 'domain', 'company'].map((t) => e.filter((x) => x.type === t).length + ' ' + t + (e.filter((x) => x.type === t).length === 1 ? '' : 's')).join(', ') : 'One entry per line: an email, a domain, or a company name.'; };
    sheet({ id: 'dnc-bulk', title: 'Add to do-not-contact', cancelLabel: 'Cancel', isDirty: () => !!text.trim(), confirmText: 'Discard this list?',
      body: (b) => b.append(app.field('Entries', h('textarea', { id: 'dnc-text', rows: 8, spellcheck: 'false', placeholder: 'someone@company.example\ncompany.example\nAcme Corp', oninput: (e) => { text = e.target.value; paint(); } })), prev),
      actions: [{ id: 'dnc-add-all', label: 'Add', cls: 'primary', fn: (api) => { if (!text.trim()) { toast('Type at least one entry, or press Cancel.'); return; } const t = text; text = ''; api.close(); app.addDnc(t, 'Added'); } }] });
  }
  function render(main) {
    const leads = S().leads; const regimes = {};
    leads.forEach((l) => { const r = C.regimeFor(l.company.country).id; (regimes[r] = regimes[r] || []).push(l.company.name); });
    const order = Object.keys(regimes).sort((a, b) => regimes[b].length - regimes[a].length);
    if (!order.length) order.push('canspam', 'gdpr');
    main.append(h('h1', {}, 'Compliance'), h('div', { class: 'notice warn', style: 'margin-bottom:14px' }, h('b', {}, 'Reminders, not legal advice. '), 'Rules differ by country and change. Check with someone qualified before you run campaigns.'));
    main.append(h('div', { class: 'cols' },
      h('section', { class: 'panel' }, h('h2', {}, 'Before you send anything'), h('ul', { class: 'checklist' }, C.CHECKLIST.map((c) => h('li', {}, c))),
        h('h2', { style: 'margin-top:14px' }, 'Rules for the countries in your list'),
        order.map((id) => { const r = C.RULES[id]; return h('div', { class: 'rule', 'data-rule': id }, h('div', { class: 'row' }, h('b', { class: 'grow' }, r.name), regimes[id] ? app.chip(regimes[id].length + ' lead' + (regimes[id].length > 1 ? 's' : ''), 'info', { title: regimes[id].join(', ') }) : null), h('p', { class: 'small', style: 'margin:4px 0' }, r.short), r.url ? h('a', { class: 'small', href: r.url, target: '_blank', rel: 'noopener noreferrer' }, 'Official guidance') : null); })),
      h('section', { class: 'panel', id: 'dnc' }, h('div', { class: 'row', style: 'margin-bottom:8px' }, h('h2', { class: 'grow', style: 'margin:0' }, 'Do-not-contact list'), h('span', { class: 'chip' }, String(S().dnc.length))),
        h('p', { class: 'small muted' }, 'Leads matching an email, domain or company here are skipped by the agent and can\u2019t be copied or approved. Add anyone who opts out right away.'),
        (() => { let v = ''; const inp = h('input', { type: 'text', id: 'dnc-one', placeholder: 'email, domain or company', 'aria-label': 'New do-not-contact entry', oninput: (e) => { v = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); if (app.addDnc(v)) v = ''; } } }); return h('div', { class: 'row', style: 'margin-bottom:10px' }, h('div', { class: 'grow' }, inp), h('button', { type: 'button', class: 'btn primary', id: 'dnc-add', onclick: () => { if (app.addDnc(v)) v = ''; } }, 'Add'), h('button', { type: 'button', class: 'btn', id: 'dnc-bulk-btn', onclick: bulkSheet }, 'Bulk add')); })(),
        S().dnc.length ? h('ul', { class: 'dnclist' }, S().dnc.map((e, i) => h('li', { 'data-dnc': e.value }, h('span', { class: 'chip' }, e.type), h('span', { class: 'grow mono' }, e.value), h('button', { type: 'button', class: 'btn sm ghost', 'aria-label': 'Remove ' + e.value, onclick: () => { const before = S().dnc.slice(); S().dnc.splice(i, 1); app.save(); app.refresh(); undoToast('Removed ' + e.value + ' from do-not-contact. Skipped leads stay skipped.', () => { S().dnc = before; app.save(); app.refresh(); }); } }, 'Remove')))) : h('p', { class: 'muted small' }, 'The list is empty.'),
        S().dnc.length ? h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn sm', id: 'dnc-export', onclick: () => { download('leadscout-do-not-contact.csv', LS.csv.serialize(['type', 'value', 'added'], S().dnc.map((e) => [e.type, e.value, e.added || ''])), 'text/csv'); toast('Do-not-contact list downloaded.'); } }, 'Export CSV')) : null)));
  }
  app.views.compliance = { render };
})();
