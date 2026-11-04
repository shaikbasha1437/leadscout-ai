/* Lead detail: fit reasons, research with sources, drafts with citations and quality flags,
   tone/regenerate/edit, Copy and "Open in mail app", approve/skip, notes and pasted research. */
(function () {
  'use strict';
  const app = LS.app; const { h, toast, sheet, undoToast } = LS.ui; const T = LS.text;
  const S = () => app.state;
  const PARTS = [['email', 'Email', 0], ['linkedin', 'LinkedIn note', 0], ['followup1', 'Follow-up 1', 1], ['followup2', 'Follow-up 2', 2]];
  const partText = (d, p) => (p === 'email' ? d.email.body : p === 'linkedin' ? d.linkedin : (d.followups[p === 'followup1' ? 0 : 1] || {}).body || '');
  const partSubject = (d, p) => (p === 'email' ? d.email.subject : p === 'linkedin' ? '' : (d.followups[p === 'followup1' ? 0 : 1] || {}).subject || '');
  function withCites(text, facts, pfacts) {
    const out = []; let last = 0; const re = /\[((?:[FP]\d+)(?:\s*,\s*[FP]\d+)*)\]/g; let m;
    const s = String(text || '');
    while ((m = re.exec(s))) {
      out.push(s.slice(last, m.index));
      m[1].split(/\s*,\s*/).forEach((id) => { const f = (id[0] === 'F' ? facts : pfacts).find((x) => x.id === id); out.push(h('button', { type: 'button', class: 'cite' + (f ? '' : ' bad'), title: f ? f.text : 'No such fact', 'aria-label': 'Source ' + id + (f ? ': ' + f.text : ' (missing)'), onclick: () => { const el = document.getElementById('fact-' + id); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('hl'); setTimeout(() => el.classList.remove('hl'), 1600); } } }, id)); });
      last = m.index + m[0].length;
    }
    out.push(s.slice(last));
    return out;
  }
  const flagList = (flags) => (flags.length ? h('ul', { class: 'flags' }, flags.map((x) => h('li', { class: x.level, 'data-flag': x.id }, h('b', {}, x.level === 'stop' ? 'Fix' : x.level === 'warn' ? 'Check' : 'Note'), ' ', x.msg))) : h('p', { class: 'small', style: 'color:var(--ok);margin:4px 0 0' }, '\u2713 No flags'));
  function copyText(d, p) { const sub = partSubject(d, p); return T.stripMarkers((sub && p === 'email' ? 'Subject: ' + sub + '\n\n' : '') + partText(d, p)); }
  function partCard(l, p, label, idx) {
    const d = l.draft; const r = l.research; const flags = (l.quality ? l.quality.flags : []).filter((x) => x.part === p);
    const blocked = app.dncFor(l); const to = l.contact && l.contact.email;
    const sub = partSubject(d, p); const txt = partText(d, p);
    const day = p === 'email' || p === 'linkedin' ? 0 : (S().settings.cadence || [4, 9])[idx - 1];
    return h('article', { class: 'draft', 'data-part': p },
      h('div', { class: 'row' }, h('h3', { class: 'grow', style: 'margin:0' }, label), h('span', { class: 'chip' }, 'Day ' + day), p === 'linkedin' ? h('span', { class: 'small muted' }, T.stripMarkers(txt).length + '/300 chars') : h('span', { class: 'small muted' }, T.wordCount(T.stripMarkers(txt)) + ' words')),
      sub ? h('div', { class: 'subj' }, h('span', { class: 'muted' }, 'Subject: '), sub) : null,
      h('div', { class: 'reply' }, withCites(txt, r.facts, r.productFacts)),
      flagList(flags),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn sm', 'data-copy': p, disabled: !!blocked, onclick: async () => { const ok = await LS.ui.copy(copyText(d, p)); toast(ok ? label + ' copied without citation markers. Nothing was sent.' : 'Copy failed.'); } }, 'Copy'),
        p !== 'linkedin' ? h('a', { class: 'btn sm' + (blocked ? ' disabled' : ''), 'data-mailto': p, href: blocked ? null : LS.compliance.mailto(to || '', sub, txt), 'aria-disabled': blocked ? 'true' : null, onclick: (e) => { if (blocked) { e.preventDefault(); return; } toast('Opening your mail app with this draft. LeadScout does not send it.'); } }, 'Open in mail app') : null));
  }
  function fitPanel(l) {
    if (!l.fit) return h('section', { class: 'panel' }, h('h2', {}, 'Fit'), h('p', { class: 'muted' }, 'Not scored yet.'));
    return h('section', { class: 'panel', id: 'fit' }, h('div', { class: 'row' }, h('h2', { class: 'grow', style: 'margin:0' }, 'Fit score'), h('span', { class: 'fitnum ' + (l.fit.score >= 75 ? 'ok' : l.fit.score >= 50 ? 'warn' : 'stop') }, l.fit.score, h('small', {}, '/100'))),
      h('ul', { class: 'reasons' }, l.fit.reasons.map((x) => h('li', { class: x.ok === true ? 'ok' : x.ok === false ? 'no' : 'mid' }, h('span', { class: 'pts' }, x.pts + '/' + x.max), ' ', x.text))),
      h('p', { class: 'small muted', style: 'margin:6px 0 0' }, 'Scored locally from your ICP. A model never sets this number.'));
  }
  function researchPanel(l) {
    const r = l.research; const sec = h('section', { class: 'panel', id: 'research' }, h('div', { class: 'row' }, h('h2', { class: 'grow', style: 'margin:0' }, 'Research'), r ? h('span', { class: 'small muted' }, r.by === 'demo' ? 'Local research' : 'Model: ' + r.by) : null));
    if (!r) { sec.append(h('p', { class: 'muted' }, 'Not researched yet.')); return sec; }
    if (r.injection && r.injection.length) sec.append(h('div', { class: 'notice stop', id: 'injection-note' }, h('b', {}, 'Hidden instructions found. '), r.injection.map((x) => x.factId).join(', ') + ' contain text that tries to instruct an AI (' + [...new Set(r.injection.flatMap((x) => x.findings))].join(', ') + '). LeadScout ignores it and never quotes it in drafts.'));
    sec.append(h('p', {}, r.summary));
    if (r.angle) sec.append(h('p', { class: 'small' }, h('b', {}, 'Angle: '), r.angle));
    const sig = (r.signals || []).slice(0, 5);
    sec.append(h('h3', {}, 'Recent signals'), sig.length ? h('ul', { class: 'small' }, sig.map((s) => { const f = (r.facts || []).find((x) => x.id === s.factId); const t = s.text || (f && f.text) || ''; return h('li', {}, withCites(t + (s.why ? ' \u2014 ' + s.why : '') + (s.age != null ? ' (' + s.age + ' days ago)' : '') + ' [' + s.factId + ']', r.facts, [])); })) : h('p', { class: 'small muted' }, 'None found. Paste notes below to personalise.'));
    sec.append(h('h3', {}, 'Likely pain points ', h('span', { class: 'chip' }, 'hypotheses')), r.pains.length ? h('ul', { class: 'small' }, r.pains.map((p) => h('li', {}, p.text, ' ', withCites(p.basis.map((b) => '[' + b + ']').join(''), r.facts, [])))) : h('p', { class: 'small muted' }, 'No clear pain signals.'));
    sec.append(h('h3', {}, 'Stakeholders'), h('ul', { class: 'small' }, (r.stakeholders || []).map((s) => h('li', {}, s.name ? h('b', {}, s.name + ', ') : null, s.title, h('span', { class: 'muted' }, ' \u2014 ' + s.why)))));
    sec.append(h('details', { class: 'facts', open: true }, h('summary', {}, h('b', {}, 'Sources (' + r.facts.length + ' facts)')), h('ol', { class: 'factlist' }, r.facts.map((x) => h('li', { id: 'fact-' + x.id, class: x.injection ? 'inj' : '' }, h('span', { class: 'fid' }, x.id), h('div', {}, h('div', {}, x.injection ? h('s', {}, x.text) : x.text), h('div', { class: 'small muted' }, (x.source.url ? h('a', { href: x.source.url, target: '_blank', rel: 'noopener noreferrer nofollow' }, x.source.label) : x.source.label), x.date ? ' \u00b7 ' + x.date : '', x.injection ? ' \u00b7 ignored: hidden instructions' : '')))))),
      h('details', { class: 'facts' }, h('summary', {}, 'Product facts (' + r.productFacts.length + ')'), h('ol', { class: 'factlist' }, r.productFacts.map((x) => h('li', { id: 'fact-' + x.id }, h('span', { class: 'fid' }, x.id), h('div', {}, x.text))))));
    if (l.company.fictional) sec.append(h('p', { class: 'small muted' }, 'All of this is fictional demo data. Source links point to .example addresses, which don\u2019t exist.'));
    return sec;
  }
  function inputPanel(l) {
    let notes = l.researchNotes || ''; let urls = (l.urls || []).join('\n');
    return h('section', { class: 'panel', id: 'research-input' }, h('h2', {}, 'Your research input'),
      app.field('Pasted research notes', h('textarea', { id: 'research-notes', rows: 4, oninput: (e) => { notes = e.target.value; }, onchange: () => { l.researchNotes = notes; app.save(); } }, notes), 'Paste a news item, a job post or page text. Each sentence becomes a fact drafts can cite. Instructions aimed at AIs are flagged and ignored.'),
      app.field('Page URLs (one per line)', h('textarea', { id: 'research-urls', rows: 2, oninput: (e) => { urls = e.target.value; }, onchange: () => { l.urls = urls.split(/\s+/).filter((u) => /^https?:\/\//i.test(u)); app.save(); } }, urls), app.search() ? 'Tavily reads these on the next research.' : 'Only read with a Tavily key in live mode; otherwise paste the text above.'),
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn primary', id: 'rerun-lead', disabled: app.busy === l.id || !!app.dncFor(l), onclick: () => { l.researchNotes = notes; l.urls = urls.split(/\s+/).filter((u) => /^https?:\/\//i.test(u)); app.processLead(l.id); } }, app.busy === l.id ? 'Working\u2026' : l.research ? 'Re-research and redraft' : 'Research and draft')));
  }
  function draftsPanel(l) {
    const sec = h('section', { class: 'panel', id: 'drafts' });
    const d = l.draft;
    sec.append(h('div', { class: 'row', style: 'margin-bottom:8px' }, h('h2', { class: 'grow', style: 'margin:0' }, 'Outreach drafts'), d ? h('span', { class: 'small muted' }, d.by === 'demo' ? 'Demo composer' : 'Model: ' + d.by) : null));
    if (!d) { sec.append(h('p', { class: 'muted' }, 'No drafts yet.')); return sec; }
    const q = l.quality;
    sec.append(h('div', { class: 'qbar ' + q.status, id: 'quality-summary' }, h('b', {}, q.status === 'ok' ? '\u2713 Ready for your review' : q.status === 'warn' ? 'Check ' + q.counts.warn + ' warning' + (q.counts.warn > 1 ? 's' : '') : 'Fix ' + q.counts.stop + ' problem' + (q.counts.stop > 1 ? 's' : '') + ' before using'), h('span', { class: 'small' }, 'Quality ' + q.score + '/100 \u00b7 checks claims against sources, spam words, length, personalisation and opt-out')));
    sec.append(h('div', { class: 'row', style: 'margin:10px 0' },
      h('label', { class: 'row small', style: 'gap:6px' }, 'Tone', app.select(Object.keys(LS.compose.TONES).map((k) => [k, LS.compose.TONES[k].label]), d.tone, { id: 'tone-select', disabled: app.busy === l.id, onchange: (e) => app.regenerate(l.id, e.target.value) })),
      h('button', { type: 'button', class: 'btn sm', id: 'regen', disabled: app.busy === l.id, onclick: () => app.regenerate(l.id) }, 'Regenerate'),
      h('button', { type: 'button', class: 'btn sm', id: 'edit-draft', onclick: () => editSheet(l) }, 'Edit'),
      d.edited ? app.chip('Edited by you', 'brand') : null));
    PARTS.forEach(([p, label, idx]) => sec.append(partCard(l, p, label, idx)));
    return sec;
  }
  function editSheet(l) {
    const d = l.draft; const v = { subject: d.email.subject, email: d.email.body, linkedin: d.linkedin, followup1: d.followups[0].body, followup2: d.followups[1].body };
    const orig = JSON.stringify(v); const live = h('div', { id: 'edit-flags' });
    const build = () => ({ email: { subject: v.subject, body: v.email }, linkedin: v.linkedin, followups: [{ subject: 'Re: ' + v.subject, body: v.followup1, day: d.followups[0].day }, { subject: 'Re: ' + v.subject, body: v.followup2, day: d.followups[1].day }] });
    let t = null;
    const paint = () => { clearTimeout(t); t = setTimeout(() => { const q = LS.quality.checkSequence(build(), { lead: l, facts: l.research.facts, productFacts: l.research.productFacts, sender: S().sender, product: S().product }); live.textContent = ''; live.append(h('p', { class: 'small' }, h('b', {}, 'Live check: '), q.counts.stop + ' stop, ' + q.counts.warn + ' warn, ' + q.counts.info + ' info'), flagList(q.flags)); }, 120); };
    const ta = (k, label, rows, hint) => app.field(label, h(k === 'subject' ? 'input' : 'textarea', Object.assign({ id: 'ed-' + k, value: v[k], oninput: (e) => { v[k] = e.target.value; paint(); } }, k === 'subject' ? { type: 'text' } : { rows })), hint);
    const err = h('div', { class: 'notice stop', hidden: true, id: 'ed-err' });
    sheet({
      id: 'edit', title: 'Edit drafts \u00b7 ' + l.company.name, wide: true, cancelLabel: 'Cancel', isDirty: () => JSON.stringify(v) !== orig, confirmText: 'Discard your edits?',
      body: (b) => { b.append(h('p', { class: 'small muted' }, 'Keep citation markers like [F2] after facts so the checker can verify them. They are removed when you copy or open the draft in your mail app.'), err, ta('subject', 'Email subject (required)'), ta('email', 'Email', 10), ta('linkedin', 'LinkedIn note', 3, 'LinkedIn allows 300 characters in a connection note.'), ta('followup1', 'Follow-up 1', 6), ta('followup2', 'Follow-up 2', 6), live); paint(); },
      actions: [{ id: 'save-edit', label: 'Save drafts', cls: 'primary', fn: (api) => {
        if (!v.subject.trim() || !v.email.trim()) { err.hidden = false; err.textContent = 'The email needs a subject and a body. Fix them, or press Cancel to keep the old version.'; return; }
        const snap = app.clone(l); const nd = Object.assign({}, d, build(), { edited: true, at: new Date().toISOString() });
        nd.used = T.markers([nd.email.body, nd.linkedin].concat(nd.followups.map((x) => x.body)).join('\n'));
        l.draft = nd; app.recheck(l); if (l.status === 'approved') l.status = 'drafted'; l.updatedAt = new Date().toISOString();
        Object.assign(v, JSON.parse(orig)); // not dirty any more
        api.close(); app.save(); app.refresh();
        undoToast('Drafts saved' + (snap.status === 'approved' ? '; approve again when ready' : '') + '. ' + (l.quality.counts.stop ? l.quality.counts.stop + ' stop flag(s) to fix.' : 'No stop flags.'), () => { Object.keys(l).forEach((k) => delete l[k]); Object.assign(l, snap); app.save(); app.refresh(); });
      } }]
    });
  }
  function render(main, id) {
    const l = app.lead(id);
    if (!l) { main.append(h('div', { class: 'panel empty' }, h('p', {}, 'That lead no longer exists.'), h('a', { class: 'btn', href: '#leads' }, 'Back to leads'))); return; }
    const blocked = app.dncFor(l); const co = l.company;
    main.append(h('a', { href: '#leads', class: 'btn ghost sm back-link' }, '\u2190 Leads'),
      h('div', { class: 'lead-head' }, h('div', { class: 'grow' }, h('h1', {}, co.name), h('div', { class: 'row small muted', style: 'gap:6px' }, [co.domain, co.industry, co.employees ? co.employees + ' people' : '', [co.city, co.country].filter(Boolean).join(', ')].filter(Boolean).join(' \u00b7 '), app.fictionalTag(l), app.statusChip(l))),
        h('div', { class: 'row' },
          l.status !== 'approved' ? h('button', { type: 'button', class: 'btn ok', id: 'approve', disabled: !l.draft || !!blocked, onclick: () => app.setStatus(l.id, 'approved') }, 'Approve') : h('button', { type: 'button', class: 'btn', id: 'unapprove', onclick: () => app.setStatus(l.id, 'drafted') }, 'Back to drafted'),
          l.status !== 'skipped' ? h('button', { type: 'button', class: 'btn', id: 'skip', onclick: () => app.setStatus(l.id, 'skipped') }, 'Skip') : h('button', { type: 'button', class: 'btn', id: 'unskip', disabled: !!blocked, onclick: () => app.setStatus(l.id, l.draft ? 'drafted' : l.research ? 'researched' : 'new') }, 'Restore'),
          h('button', { type: 'button', class: 'btn danger', id: 'delete-lead', onclick: () => app.deleteLeads([l.id]) }, 'Delete'))));
    if (blocked) main.append(h('div', { class: 'notice stop', id: 'dnc-note', style: 'margin-bottom:12px' }, h('b', {}, 'Do not contact. '), blocked.reason + '. Copy and mail buttons are off. ', h('a', { href: '#compliance' }, 'Manage the list')));
    else if (l.status === 'skipped' && l.skipReason) main.append(h('div', { class: 'notice', style: 'margin-bottom:12px' }, 'Skipped: ' + l.skipReason));
    if (l.status === 'approved') main.append(h('div', { class: 'notice ok', style: 'margin-bottom:12px' }, h('b', {}, 'Approved. '), 'Copy each message or open it in your mail app when you are ready. LeadScout never sends anything, and nothing is scheduled.'));
    const notes = h('section', { class: 'panel', id: 'notes' }, h('h2', {}, 'Notes'), h('textarea', { id: 'lead-notes', rows: 3, 'aria-label': 'Notes', placeholder: 'Private notes for you (not used in drafts)', onchange: (e) => { l.notes = e.target.value; l.updatedAt = new Date().toISOString(); app.save(); toast('Notes saved.'); } }, l.notes || ''));
    const trace = l.trace && l.trace.length ? h('section', { class: 'panel' }, h('details', {}, h('summary', {}, h('b', {}, 'How this was made')), h('ul', { class: 'small' }, l.trace.map((t) => h('li', { style: t.error ? 'color:var(--stop)' : '' }, h('b', {}, t.step + ' \u00b7 ' + t.by + ': '), t.error || t.note, t.ms != null ? ' (' + LS.ui.ms(t.ms) + ')' : '', t.cost ? ' \u00b7 ' + LS.ui.money(t.cost) : ''))))) : null;
    main.append(h('div', { class: 'lead-grid' }, h('div', { class: 'col' }, draftsPanel(l), notes, trace), h('div', { class: 'col' }, fitPanel(l), researchPanel(l), inputPanel(l))));
  }
  app.editSheet = editSheet;
  app.views.lead = { render };
})();
