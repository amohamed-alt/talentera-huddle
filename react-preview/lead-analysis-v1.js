(() => {
  const SOURCES = location.pathname.includes('/react-preview/')
    ? ['../data.json', '/talentera-huddle/data.json']
    : ['./data.json', '/talentera-huddle/data.json'];

  const PERIODS = { yesterday: 'Yesterday', mtd: 'Month to Date', ytd: 'Year to Date' };
  const COLORS = {
    NEW: '#2563eb', IN_PROGRESS: '#059669', ATTEMPTED_TO_CONTACT: '#d97706',
    OPEN_DEAL: '#7c3aed', UNQUALIFIED: '#dc2626', BAD_TIMING: '#ea580c',
    'EXISTING CLIENT': '#64748b', UNSET: '#94a3b8', OTHER: '#475569'
  };

  let data = null;
  let timer = null;

  const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const fmt = value => n(value).toLocaleString();
  const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function styles() {
    if (document.getElementById('lead-analysis-styles')) return;
    const node = document.createElement('style');
    node.id = 'lead-analysis-styles';
    node.textContent = `
      .lead-analysis-click{cursor:pointer}.lead-analysis-click:hover{border-color:#7dd3a9!important;box-shadow:0 6px 18px rgba(16,120,80,.1)}
      .lead-analysis-mini{display:flex;flex-wrap:wrap;gap:3px 7px;margin-top:5px;font-size:9px;line-height:1.35;color:#60736a;text-transform:none;letter-spacing:0}
      .lead-analysis-mini b{color:#08764d}.lead-analysis-mini .ex{color:#b45309}.lead-analysis-mini .miss{color:#b91c1c}
      .metric-reason{display:block!important;margin-top:4px!important;color:#9a6700!important;font-size:9px!important;line-height:1.35!important;text-transform:none!important;letter-spacing:0!important;white-space:normal!important}
      .diagnostic-btn{border:1px solid #dce8e1;background:#f7faf8;color:#486157;border-radius:999px;padding:6px 10px;font:inherit;font-size:11px;cursor:pointer}
      .la-overlay{position:fixed;inset:0;z-index:99999;background:rgba(5,25,18,.5);backdrop-filter:blur(3px);display:grid;place-items:center;padding:20px}
      .la-modal{width:min(760px,96vw);max-height:88vh;overflow:auto;background:#fff;border-radius:18px;border:1px solid #dce8e1;box-shadow:0 30px 80px rgba(0,0,0,.24)}
      .la-head{display:flex;justify-content:space-between;gap:15px;padding:20px 22px 15px;border-bottom:1px solid #e6eee9}.la-head h3{margin:0;color:#173f32;font-size:20px}.la-head p{margin:4px 0 0;color:#6b7c74;font-size:12px}
      .la-close{width:36px;height:36px;border:1px solid #dce8e1;border-radius:10px;background:#fff;color:#456056;font-size:20px;cursor:pointer}.la-body{padding:18px 22px 24px}
      .la-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:16px}.la-kpi{border:1px solid #e1ebe5;border-radius:12px;padding:11px;background:#f9fbfa}.la-kpi strong{display:block;font-size:21px;color:#0e7a50}.la-kpi span{display:block;margin-top:3px;color:#718279;font-size:9px;text-transform:uppercase}
      .la-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:15px}.la-panel{border:1px solid #e1ebe5;border-radius:13px;padding:14px}.la-panel h4{margin:0 0 11px;color:#234c3e;font-size:13px}
      .la-status{display:grid;grid-template-columns:minmax(130px,1fr) 2fr auto;align-items:center;gap:9px;margin:9px 0}.la-status label{font-size:11px;color:#425a50;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.la-status i{height:8px;border-radius:999px;background:#edf2ef;overflow:hidden}.la-status em{display:block;height:100%;border-radius:999px}.la-status b{font-size:11px;color:#264d3f}
      .la-insights{margin:0;padding-left:17px;color:#4c6259;font-size:12px;line-height:1.55}.la-source{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px dashed #e2eae5;color:#52685e;font-size:12px}.la-source:last-child{border-bottom:0}
      .la-note{margin-top:13px;padding:10px 11px;background:#f4f8f6;border-radius:9px;color:#65776f;font-size:11px;line-height:1.45}.diag-item{border:1px solid #e3ebe7;border-radius:11px;padding:11px;margin-bottom:9px}.diag-item strong{display:block;color:#274d40;font-size:12px}.diag-item p{margin:4px 0 0;color:#6a7b73;font-size:11px;line-height:1.45}
      @media(max-width:700px){.la-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.la-grid{grid-template-columns:1fr}.la-status{grid-template-columns:minmax(105px,1fr) 1.4fr auto}}
    `;
    document.head.appendChild(node);
  }

  async function load() {
    for (const url of SOURCES) {
      try {
        const response = await fetch(`${url}?leadAnalysis=${Date.now()}`, { cache: 'no-store' });
        if (response.ok) return await response.json();
      } catch (_) {}
    }
    return null;
  }

  function context() {
    const page = location.hash.replace(/^#/, '') || 'team';
    const reps = Array.isArray(data?.repData) ? data.repData : [];
    const rep = page.startsWith('rep/') ? reps.find(item => slug(item.name) === page.slice(4)) : null;
    return { name: rep?.name || 'Acquisition Team', analysis: rep?.leadPeriodAnalysis || data?.leadPeriodAnalysis || null };
  }

  function period(card) {
    const text = card.querySelector('header strong')?.textContent?.toLowerCase() || '';
    if (text.includes('yesterday')) return 'yesterday';
    if (text.includes('month')) return 'mtd';
    if (text.includes('year')) return 'ytd';
    return null;
  }

  function label(metric) { return metric.querySelector('span')?.textContent?.trim() || ''; }

  function reason(metricLabel) {
    const exported = data?.dataDiagnostics?.blankMetricReasons || {};
    const key = { 'Meetings booked': 'meetingsBooked', 'New deals': 'newDeals', 'Pipeline created': 'pipelineCreated', 'Won revenue': 'wonRevenue' }[metricLabel];
    if (key && exported[key]) return exported[key];
    return {
      'Meetings booked': 'Missing from this data.json snapshot. HubSpot hs_meeting_outcome exists; run the latest n8n workflow to export SCHEDULED counts.',
      'New deals': 'Missing from this snapshot. Deal creation must use createdate; hs_createdate is not a Deal property in this portal.',
      'Pipeline created': 'Missing from this snapshot, or source deals have no createdate/amount.',
      'Won revenue': 'The wonRevenue field is not exported for this period in the current snapshot.'
    }[metricLabel] || 'This field is absent from the current data.json snapshot.';
  }

  function close() { document.querySelector('.la-overlay')?.remove(); }

  function modal(title, subtitle, html) {
    close();
    const overlay = document.createElement('div');
    overlay.className = 'la-overlay';
    overlay.innerHTML = `<div class="la-modal"><div class="la-head"><div><h3>${title}</h3><p>${subtitle}</p></div><button class="la-close">×</button></div><div class="la-body">${html}</div></div>`;
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('.la-close').addEventListener('click', close);
    document.body.appendChild(overlay);
  }

  function showAnalysis(periodKey, analysis, name) {
    const total = n(analysis.totalContacts), valid = n(analysis.validLeads), excluded = n(analysis.excluded), missing = n(analysis.missingStatus);
    const rows = Array.isArray(analysis.statusRows) ? analysis.statusRows : Object.values(analysis.byStatus || {}).sort((a,b) => n(b.count)-n(a.count));
    const statuses = rows.length ? rows.map(row => {
      const count = n(row.count), pct = total ? Math.round(count / total * 100) : 0;
      return `<div class="la-status"><label title="${row.label || row.key}">${row.label || row.key}</label><i><em style="width:${Math.min(pct,100)}%;background:${COLORS[row.key] || COLORS.OTHER}"></em></i><b>${fmt(count)} · ${pct}%</b></div>`;
    }).join('') : '<p>No status data exported.</p>';
    const insights = Array.isArray(analysis.analysis) && analysis.analysis.length ? `<ul class="la-insights">${analysis.analysis.map(x => `<li>${x}</li>`).join('')}</ul>` : '<p>No analysis exported.</p>';
    const source = analysis.bySource || {};
    const sources = ['inbound','outbound','import'].map(x => `<div class="la-source"><span>${x[0].toUpperCase()+x.slice(1)}</span><b>${fmt(source[x])}</b></div>`).join('');
    modal(`${PERIODS[periodKey]} Lead Status Analysis`, `${name} · Contacts created in the selected period`, `<div class="la-kpis"><div class="la-kpi"><strong>${fmt(total)}</strong><span>Total contacts</span></div><div class="la-kpi"><strong>${fmt(valid)}</strong><span>Valid leads</span></div><div class="la-kpi"><strong>${fmt(excluded)}</strong><span>Excluded</span></div><div class="la-kpi"><strong>${fmt(missing)}</strong><span>No status</span></div></div><div class="la-grid"><div class="la-panel"><h4>Status distribution</h4>${statuses}</div><div><div class="la-panel"><h4>Quick analysis</h4>${insights}</div><div class="la-panel" style="margin-top:11px"><h4>Source split</h4>${sources}</div></div></div><div class="la-note">${analysis.countedDefinition || 'Total includes every contact created in the period. Valid leads exclude Unqualified and Existing Client.'}</div>`);
  }

  function showDiagnostics() {
    const labels = ['Meetings booked','New deals','Pipeline created','Won revenue'];
    const health = data?.dataDiagnostics?.sourceHealth;
    const healthText = health ? Object.entries(health).map(([k,v]) => `${k}: ${fmt(v)}`).join(' · ') : 'The current snapshot predates diagnostic export. Run the latest n8n workflow.';
    modal('Why are some values blank?', 'A blank is now separated from a real zero.', `${labels.map(x => `<div class="diag-item"><strong>${x}</strong><p>${reason(x)}</p></div>`).join('')}<div class="la-note">${healthText}</div>`);
  }

  function decorate() {
    if (!data) return;
    const section = document.querySelector('.period-section');
    if (!section) return;
    const ctx = context();

    section.querySelectorAll('.period-card').forEach(card => {
      const p = period(card);
      if (!p) return;
      const metrics = [...card.querySelectorAll('.period-metric')];
      const lead = metrics.find(item => ['leads','total leads'].includes(label(item).toLowerCase()));
      const analysis = ctx.analysis?.[p];

      if (lead) {
        lead.querySelector('.lead-analysis-mini')?.remove();
        lead.querySelector('.metric-reason')?.remove();
        if (analysis) {
          lead.querySelector('strong').textContent = fmt(analysis.totalContacts);
          lead.querySelector('span').textContent = 'Total Leads';
          const mini = document.createElement('div');
          mini.className = 'lead-analysis-mini';
          mini.innerHTML = `<b>${fmt(analysis.validLeads)} valid</b><span class="ex">${fmt(analysis.excluded)} excluded</span><span class="miss">${fmt(analysis.missingStatus)} no status</span>`;
          lead.appendChild(mini);
          lead.classList.add('lead-analysis-click');
          lead.title = 'Click for Lead Status analysis';
          lead.onclick = () => showAnalysis(p, analysis, ctx.name);
        } else {
          const note = document.createElement('small');
          note.className = 'metric-reason';
          note.textContent = 'Total/status split is not exported yet. Run the latest n8n workflow.';
          lead.appendChild(note);
        }
      }

      metrics.forEach(metric => {
        const metricLabel = label(metric);
        const blank = metric.classList.contains('missing') || metric.querySelector('strong')?.textContent?.trim() === '—';
        if (!blank || ['Leads','Total Leads'].includes(metricLabel)) return;
        let note = metric.querySelector('small');
        if (!note) { note = document.createElement('small'); metric.appendChild(note); }
        note.className = 'metric-reason';
        note.textContent = reason(metricLabel);
        metric.title = note.textContent;
      });
    });

    const heading = section.querySelector('.section-heading');
    if (heading && !heading.querySelector('.diagnostic-btn')) {
      const button = document.createElement('button');
      button.className = 'diagnostic-btn';
      button.textContent = 'Why are values blank?';
      button.addEventListener('click', showDiagnostics);
      const last = heading.lastElementChild;
      if (last && last !== heading.firstElementChild) last.insertAdjacentElement('beforebegin', button); else heading.appendChild(button);
    }
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(decorate, 60); }

  async function start() {
    styles();
    data = await load();
    schedule();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', schedule);
  }

  start();
})();