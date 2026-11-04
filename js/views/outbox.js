/* Sequence preview: what each approved (or drafted) sequence would look like on a calendar.
   It is only a preview: LeadScout schedules nothing and sends nothing. */
(function () {
  'use strict';
  const app = LS.app; const { h, toast } = LS.ui; const T = LS.text;
  const S = () => app.state;
  let show = 'approved'; let start = '';
  const nextWorkday = () => { const d = new Date(); d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
  function addWorkdays(iso, n) { const d = new Date(iso + 'T12:00:00'); let left = n; while (left > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) left--; } return d; }
  const fmt = (d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  function render(main) {
    start = start || nextWorkday();
    const cad = S().settings.cadence || [4, 9];
    const leads = S().leads.filter((l) => l.draft && (show === 'all' ? ['drafted', 'approved'].includes(l.status) : l.status === 'approved') && !app.dncFor(l));
    main.append(h('div', { class: 'row', style: 'margin-bottom:10px' }, h('h1', { class: 'grow' }, 'Sequence preview')),
      h('div', { class: 'notice', style: 'margin-bottom:12px' }, h('b', {}, 'Preview only. '), 'Nothing here is scheduled or sent. Use it to plan; then copy each message, or open it in your own mail app, on the day.'),
      h('div', { class: 'toolbar' },
        h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Which sequences' }, [['approved', 'Approved'], ['all', 'Approved + drafted']].map(([v, l]) => h('label', {}, h('input', { type: 'radio', name: 'ob-show', value: v, checked: show === v, onchange: () => { show = v; app.refresh(); } }), l))),
        h('label', { class: 'row small', style: 'gap:6px' }, 'Start', h('input', { type: 'date', id: 'ob-start', value: start, style: 'width:auto', onchange: (e) => { start = e.target.value || nextWorkday(); app.refresh(); } })),
        h('label', { class: 'row small', style: 'gap:6px' }, 'Follow-ups after', h('input', { type: 'number', id: 'cad-1', min: 1, max: 30, value: cad[0], style: 'width:70px', 'aria-label': 'Follow-up 1 after working days', onchange: (e) => { S().settings.cadence = [Math.max(1, Number(e.target.value) || 4), Math.max(Number(e.target.value) + 1, cad[1])]; app.save(); app.refresh(); } }), 'and', h('input', { type: 'number', id: 'cad-2', min: 2, max: 60, value: cad[1], style: 'width:70px', 'aria-label': 'Follow-up 2 after working days', onchange: (e) => { S().settings.cadence = [cad[0], Math.max(cad[0] + 1, Number(e.target.value) || 9)]; app.save(); app.refresh(); } }), 'working days')));
    if (!leads.length) { main.append(h('div', { class: 'panel empty' }, h('p', {}, show === 'approved' ? 'No approved sequences yet. Approve drafts on a lead\u2019s page, or show drafted ones too.' : 'No drafts yet. Run the agent first.'), h('a', { class: 'btn', href: show === 'approved' ? '#leads' : '#agent' }, show === 'approved' ? 'Review drafts' : 'Go to the agent'))); return; }
    const steps = [['Email', 0, (d) => d.email.subject], ['LinkedIn note', 0, () => 'Connection note'], ['Follow-up 1', cad[0], (d) => d.followups[0].subject], ['Follow-up 2', cad[1], (d) => d.followups[1].subject]];
    main.append(h('div', { class: 'grid' }, leads.map((l) => h('article', { class: 'panel seq', 'data-seq': l.id },
      h('div', { class: 'row' }, h('a', { href: '#lead/' + encodeURIComponent(l.id), class: 'grow' }, h('b', {}, l.company.name)), app.statusChip(l), app.flagChip(l.quality)),
      h('div', { class: 'small muted' }, l.contact ? [l.contact.first, l.contact.last].filter(Boolean).join(' ') + (l.contact.title ? ', ' + l.contact.title : '') : 'No named contact'),
      h('ol', { class: 'timeline' }, steps.map(([label, day, sub], i) => h('li', {}, h('span', { class: 'when' }, fmt(addWorkdays(start, day))), h('div', {}, h('b', {}, label), h('div', { class: 'small muted' }, T.stripMarkers(sub(l.draft))), h('button', { type: 'button', class: 'btn sm', style: 'margin-top:4px', onclick: async () => { const d = l.draft; const body = i === 0 ? d.email.body : i === 1 ? d.linkedin : d.followups[i - 2].body; const ok = await LS.ui.copy(T.stripMarkers(body)); toast(ok ? label + ' copied. Nothing was sent.' : 'Copy failed.'); } }, 'Copy')))))))));
    main.append(h('p', { class: 'small muted' }, 'Weekends are skipped. Stop the sequence as soon as someone replies or asks you not to contact them, and add them to the do-not-contact list.'));
  }
  app.views.outbox = { render };
})();
