/* Talentera Huddle — Preview information architecture
   Runs only inside design-preview.html. It reorganizes rendered DOM and uses
   the already-loaded dashboard data without changing source JSON or formulas. */
(function () {
  'use strict';

  const state = {
    originalRender: null,
    renderWrapped: false,
    applying: false,
    repLeadRows: Object.create(null),
    dealMovement: 'recent'
  };

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const safeArray = value => Array.isArray(value) ? value : [];
  const number = value => Number(value || 0);
  const normalize = value => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  function sameOwner(row, repName) {
    const expected = normalize(repName);
    const first = expected.split(' ')[0];
    const values = [
      row && row.ownerName,
      row && row.rep,
      row && row.owner,
      row && row._owner,
      row && row.contactOwner,
      row && row.contactOwnerName,
      row && row.hubspotOwnerName,
      row && row.assignedTo,
      row && row.assignedOwner
    ].map(normalize).filter(Boolean);

    return values.some(value => value === expected || (
      first && value.split(' ')[0] === first
    ));
  }

  function sourceText(row) {
    return [
      row && row.sourceBucket,
      row && row.source,
      row && row.originalSource,
      row && row.leadSource,
      row && row.hs_analytics_source,
      row && row.channel,
      row && row.type
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function sourceKind(row) {
    const source = sourceText(row);
    const onlineMarkers = [
      'online', 'inbound', 'website', 'web form', 'form', 'organic',
      'paid', 'social', 'referral', 'direct traffic', 'email marketing'
    ];
    const offlineMarkers = [
      'offline', 'outbound', 'manual', 'import', 'event', 'cold',
      'prospect', 'sales generated', 'list upload'
    ];

    if (onlineMarkers.some(marker => source.includes(marker))) return 'online';
    if (offlineMarkers.some(marker => source.includes(marker))) return 'offline';
    return 'unknown';
  }

  function rowName(row) {
    return row && (
      row.name || row.fullName || row.email || row.companyName ||
      [row.firstname, row.lastname].filter(Boolean).join(' ') || row.id
    ) || 'Unknown lead';
  }

  function rowCountryValue(row) {
    return row && (row.country || row._country || row.hs_country || row.location) || '—';
  }

  function rowAge(row) {
    const value = row && (
      row.ageDays ?? row.daysWithoutContact ?? row.daysSinceCreated ??
      row.days ?? row.daysSinceActivity
    );
    return value === undefined || value === null || value === '' ? '—' : String(value) + 'd';
  }

  function byRepEntry(repName) {
    const rows = safeArray(window.D && window.D.outreachCoverage && window.D.outreachCoverage.byRep);
    const expected = normalize(repName);
    const first = expected.split(' ')[0];
    return rows.find(row => {
      const value = normalize(row && row.name);
      return value === expected || (first && value.split(' ')[0] === first);
    }) || null;
  }

  function nestedNumber(object, paths) {
    for (const path of paths) {
      const parts = path.split('.');
      let value = object;
      for (const part of parts) {
        if (value === null || value === undefined) break;
        value = value[part];
      }
      if (value !== null && value !== undefined && value !== '' && !Number.isNaN(Number(value))) {
        return Number(value);
      }
    }
    return 0;
  }

  function repLeadData(rep) {
    const contactData = window.D && window.D.outreachCoverage && window.D.outreachCoverage.contacts || {};
    const allRows = safeArray(contactData.notContactedList);
    const matched = allRows.filter(row => sameOwner(row, rep.name));
    const onlineRows = matched.filter(row => sourceKind(row) === 'online');
    const offlineRows = matched.filter(row => sourceKind(row) === 'offline');
    const unknownRows = matched.filter(row => sourceKind(row) === 'unknown');
    const repSummary = byRepEntry(rep.name) || {};

    const noConnectedFallback = nestedNumber(repSummary, [
      'contacts.notContacted', 'contacts.not_contacted', 'notContacted',
      'not_contacted', 'contacts.noConnected', 'contacts.no_connected'
    ]);
    const onlineFallback = nestedNumber(repSummary, [
      'sourceSplit.online.notContacted', 'sourceSplit.online.not_contacted',
      'online.notContacted', 'online.not_contacted', 'contacts.onlineNotContacted'
    ]);
    const offlineFallback = nestedNumber(repSummary, [
      'sourceSplit.offline.notContacted', 'sourceSplit.offline.not_contacted',
      'offline.notContacted', 'offline.not_contacted', 'contacts.offlineNotContacted'
    ]);

    return {
      all: matched,
      online: onlineRows,
      offline: offlineRows,
      unknown: unknownRows,
      counts: {
        all: matched.length || noConnectedFallback,
        online: onlineRows.length || onlineFallback,
        offline: offlineRows.length || offlineFallback
      }
    };
  }

  function leadRowsHtml(rows) {
    if (!rows.length) {
      return '<div class="rep-lead-empty">No row-level records were exported for this selection in the current data refresh.</div>';
    }

    return '<div class="rep-lead-table-wrap"><table class="rtbl rep-lead-table">' +
      '<thead><tr><th>Lead</th><th>Source</th><th>Country</th><th class="c">Age</th><th class="c">Status</th></tr></thead>' +
      '<tbody>' + rows.slice(0, 12).map(row => {
        const source = row.sourceBucket || row.source || row.originalSource || row.leadSource || sourceKind(row);
        return '<tr>' +
          '<td>' + window.rl(rowName(row), window.rowUrl(row), row) + '</td>' +
          '<td><span class="rep-source-pill rep-source-' + sourceKind(row) + '">' + window.esc(source || 'Unknown') + '</span></td>' +
          '<td>' + window.esc(rowCountryValue(row)) + '</td>' +
          '<td class="c mono">' + window.esc(rowAge(row)) + '</td>' +
          '<td class="c"><span class="sp sp-lost">No connected call</span></td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>' +
      (rows.length > 12 ? '<button class="see-more" onclick="openRepLeadMetric(\'' + window.esc(rows[0]._repSlug || '') + '\',\'' + window.esc(rows[0]._leadKind || 'all') + '\')">View all ' + rows.length + ' leads →</button>' : '');
  }

  function registerRepRows(slug, data) {
    const annotate = (rows, kind) => rows.map(row => Object.assign({}, row, {
      _repSlug: slug,
      _leadKind: kind
    }));

    state.repLeadRows[slug] = {
      all: annotate(data.all, 'all'),
      online: annotate(data.online, 'online'),
      offline: annotate(data.offline, 'offline')
    };
  }

  window.showRepLeadRows = function showRepLeadRows(slug, kind, button) {
    const store = state.repLeadRows[slug] || { all: [], online: [], offline: [] };
    const rows = store[kind] || [];
    const target = document.getElementById('rep-lead-rows-' + slug);
    if (target) target.innerHTML = leadRowsHtml(rows);

    qa('.rep-lead-filter', document.getElementById('rep-lead-section-' + slug) || document)
      .forEach(item => item.classList.remove('active'));
    if (button) button.classList.add('active');
  };

  window.openRepLeadMetric = function openRepLeadMetric(slug, kind) {
    const store = state.repLeadRows[slug] || { all: [], online: [], offline: [] };
    const rows = store[kind] || [];
    const labels = {
      online: 'Online Leads Not Contacted',
      offline: 'Offline Leads Not Contacted',
      all: 'Leads With No Connected Calls'
    };
    const rep = safeArray(window.D && window.D.repData).find(item => (
      String(item.name || '').toLowerCase().replace(/\s+/g, '-') === slug
    ));
    window.showRowsModal(
      labels[kind] + ' (' + rows.length + ')',
      (rep ? rep.name + ' · ' : '') + 'Current exported row-level records',
      rows,
      'The count may exist in the summary while row-level records are not included in data.json.'
    );
  };

  function repLeadSectionHtml(rep, slug) {
    const data = repLeadData(rep);
    registerRepRows(slug, data);

    const card = (kind, label, value, note, color, icon) => (
      '<button class="rep-contact-card rep-contact-' + kind + '" onclick="showRepLeadRows(\'' + slug + '\',\'' + kind + '\',document.querySelector(\'#rep-lead-section-' + slug + ' .rep-lead-filter[data-kind=&quot;' + kind + '&quot;]\'))">' +
        '<span class="rep-contact-icon" style="--contact-color:' + color + '">' + icon + '</span>' +
        '<span class="rep-contact-copy"><span class="rep-contact-value" style="color:' + color + '">' + Number(value || 0).toLocaleString() + '</span>' +
        '<span class="rep-contact-label">' + label + '</span><span class="rep-contact-note">' + note + '</span></span>' +
      '</button>'
    );

    return '<section class="rep-lead-section" id="rep-lead-section-' + slug + '">' +
      '<div class="rep-section-heading"><div><span class="rep-section-kicker">Lead follow-up</span><h3>Online & Offline Leads Requiring Contact</h3><p>Eligible leads assigned to this rep with no connected call signal.</p></div>' +
      '<button class="outline rep-open-all" onclick="openRepLeadMetric(\'' + slug + '\',\'all\')">Open all records</button></div>' +
      '<div class="rep-contact-grid">' +
        card('online', 'Online not contacted', data.counts.online, data.online.length ? 'Inbound / digital records' : 'Summary count or no exported rows', '#3878e8', '↘') +
        card('offline', 'Offline not contacted', data.counts.offline, data.offline.length ? 'Outbound / offline records' : 'Summary count or no exported rows', '#db8a12', '↗') +
        card('all', 'No connected calls', data.counts.all, 'All uncontacted eligible leads', '#df4037', '☎') +
      '</div>' +
      '<div class="rep-lead-toolbar"><span>Preview records</span><div class="rep-lead-filters">' +
        '<button class="rep-lead-filter active" data-kind="all" onclick="showRepLeadRows(\'' + slug + '\',\'all\',this)">All</button>' +
        '<button class="rep-lead-filter" data-kind="online" onclick="showRepLeadRows(\'' + slug + '\',\'online\',this)">Online</button>' +
        '<button class="rep-lead-filter" data-kind="offline" onclick="showRepLeadRows(\'' + slug + '\',\'offline\',this)">Offline</button>' +
      '</div></div>' +
      '<div id="rep-lead-rows-' + slug + '">' + leadRowsHtml(state.repLeadRows[slug].all) + '</div>' +
    '</section>';
  }

  function repCoachingHtml(rep, slug) {
    const items = safeArray(rep.needsAttention);
    const cold = safeArray(rep.cold).length;
    const stuck = safeArray(rep.stuck).length;
    const noFuture = typeof window.noFutureTaskDeals === 'function' ? window.noFutureTaskDeals(rep) : items;

    const rows = items.slice(0, 5).map(item => (
      '<div class="rep-coaching-row"><div class="rep-coaching-status">!</div><div class="rep-coaching-main">' +
        '<div class="rep-coaching-name">' + window.rl(item.name || 'Deal', window.rowUrl(item), item) + '</div>' +
        '<div class="rep-coaching-reason">' + window.esc(safeArray(item.reasons).join(' · ') || 'Missing next activity') + '</div>' +
      '</div><div class="rep-coaching-amount">' + window.fmt(item.amount || 0) + '</div></div>'
    )).join('');

    return '<section class="rep-coaching-section"><div class="rep-section-heading"><div><span class="rep-section-kicker">Manager follow-up</span><h3>Rep Coaching & Required Actions</h3><p>Deals and behaviors that need attention before the next review.</p></div></div>' +
      '<div class="rep-action-summary">' +
        '<div><strong>' + items.length + '</strong><span>No next activity</span></div>' +
        '<div><strong>' + cold + '</strong><span>Cold deals</span></div>' +
        '<div><strong>' + stuck + '</strong><span>Stuck deals</span></div>' +
        '<div><strong>' + noFuture.length + '</strong><span>No future task</span></div>' +
      '</div>' +
      '<div class="rep-coaching-list">' + (rows || '<div class="rep-lead-empty rep-good-state">✓ No immediate coaching actions in this refresh.</div>') + '</div>' +
    '</section>';
  }

  function enhanceRepPanels() {
    safeArray(window.D && window.D.repData).forEach(rep => {
      if (rep.type === 'view') return;
      const slug = String(rep.name || '').toLowerCase().replace(/\s+/g, '-');
      const panel = document.getElementById('panel-' + slug);
      if (!panel || panel.dataset.previewEnhanced === '1') return;

      const kpi = q('.rep-km', panel);
      if (kpi) {
        kpi.insertAdjacentHTML('afterend', repLeadSectionHtml(rep, slug) + repCoachingHtml(rep, slug));
      } else {
        panel.insertAdjacentHTML('afterbegin', repLeadSectionHtml(rep, slug) + repCoachingHtml(rep, slug));
      }
      panel.dataset.previewEnhanced = '1';
    });
  }

  function teamScoreboardHtml() {
    const reps = safeArray(window.D && window.D.repData).filter(rep => rep.type !== 'view');
    const rows = reps.map(rep => {
      const calls = number(rep.calls && rep.calls.yest);
      const connected = number(rep.calls && rep.calls.yestConn);
      const rate = number(rep.connRateYest);
      const meetings = number(rep.meetings && rep.meetings.yest);
      const leadsYesterday = number(rep.leadsYest);
      const leadsMtd = number(rep.leadsMTD);
      const statusClass = rate >= 50 ? 'sp-won' : rate >= 30 ? 'sp-warm' : 'sp-lost';
      const status = rate >= 50 ? 'Healthy' : rate >= 30 ? 'Watch' : 'At Risk';
      return '<tr><td><div class="score-rep"><span class="score-avatar" style="--rep-color:' + window.esc(rep.color || '#13a466') + '">' + window.esc(String(rep.name || '?')[0]) + '</span>' + window.repLink(rep.name, rep.color) + '</div></td>' +
        '<td class="c mono">' + calls + '</td><td class="c mono score-good">' + connected + '</td>' +
        '<td class="c"><div class="score-rate"><strong style="color:' + window.rcColor(rate) + '">' + rate + '%</strong><span><i style="width:' + Math.min(100, rate) + '%;background:' + window.rcColor(rate) + '"></i></span></div></td>' +
        '<td class="c mono score-purple">' + meetings + '</td><td class="c mono">' + leadsYesterday + '</td>' +
        '<td class="c mono">' + leadsMtd + '</td><td class="c mono score-amber">' + number(rep.openDeals) + '</td>' +
        '<td class="c mono">' + window.fmt(rep.pipeAmt || 0) + '</td><td class="c mono score-good">' + window.fmt(rep.wonAmt || 0) + '</td>' +
        '<td class="c"><span class="sp ' + statusClass + '">' + status + '</span></td></tr>';
    }).join('');

    return '<section class="gc team-scoreboard"><div class="gc-hd"><div class="gc-title"><div class="gc-icon">👥</div>Team Scoreboard</div><span class="badge bb">Yesterday + MTD</span></div>' +
      '<div class="team-table-scroll"><table class="rtbl"><thead><tr><th>Rep</th><th class="c">Calls</th><th class="c">Connected</th><th class="c">Conn. rate</th><th class="c">Meetings</th><th class="c">Leads Yest.</th><th class="c">Leads MTD</th><th class="c">Open</th><th class="c">Pipeline</th><th class="c">Won MTD</th><th class="c">Status</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>';
  }

  function outreachCompactHtml() {
    const coverage = window.D && window.D.outreachCoverage || {};
    const contacts = coverage.contacts || {};
    const split = coverage.sourceSplit || {};
    const online = split.online || {};
    const offline = split.offline || {};
    const onlineRate = number(online.total) ? Math.round(number(online.contacted) / number(online.total) * 100) : 0;
    const offlineRate = number(offline.total) ? Math.round(number(offline.contacted) / number(offline.total) * 100) : 0;
    const rate = number(contacts.contactedRate);

    const bar = (label, value, color) => '<div class="coverage-bar"><div><span>' + label + '</span><strong style="color:' + color + '">' + value + '%</strong></div><span class="coverage-track"><i style="width:' + Math.min(100, value) + '%;background:' + color + '"></i></span></div>';

    return '<section class="gc compact-coverage"><div class="gc-hd"><div class="gc-title"><div class="gc-icon">📞</div>Lead Outreach Coverage</div><button class="widget-link" onclick="openMetric(\'leads_not_contacted\')">Open leads →</button></div>' +
      '<div class="coverage-summary"><button onclick="openMetric(\'leads_not_contacted\')"><strong class="danger">' + number(contacts.notContacted).toLocaleString() + '</strong><span>Not contacted</span></button>' +
      '<div><strong>' + rate + '%</strong><span>Overall contact rate</span></div><div><strong>' + number(contacts.total).toLocaleString() + '</strong><span>Eligible leads</span></div></div>' +
      '<div class="coverage-bars">' + bar('Overall contact rate', rate, window.rateColor(rate)) + bar('Online / inbound', onlineRate, '#3878e8') + bar('Offline / outbound', offlineRate, '#db8a12') + '</div></section>';
  }

  function rankCompactHtml() {
    const reps = safeArray(window.D && window.D.repData).filter(rep => rep.type !== 'view');
    const stats = reps.map(rep => typeof window.repRankStats === 'function' ? window.repRankStats(rep, 'all') : {
      a: number(rep.rankA), aC: number(rep.rankAContacted), aM: number(rep.rankAMeetings), aU: safeArray(rep.rankAUntouched).length,
      b: number(rep.rankB), bC: number(rep.rankBContacted), bM: number(rep.rankBMeetings), bU: safeArray(rep.rankBUntouched).length
    });
    const sum = stats.reduce((total, item) => ({
      a: total.a + number(item.a), aC: total.aC + number(item.aC), aM: total.aM + number(item.aM), aU: total.aU + number(item.aU),
      b: total.b + number(item.b), bC: total.bC + number(item.bC), bM: total.bM + number(item.bM), bU: total.bU + number(item.bU)
    }), { a: 0, aC: 0, aM: 0, aU: 0, b: 0, bC: 0, bM: 0, bU: 0 });
    const gaps = safeArray(window.D && window.D.topInactiveRankAccounts).slice(0, 3);

    const metric = (value, label, color, kind) => '<button class="rank-compact-metric" onclick="openRankMetric(\'' + kind + '\',\'all\',\'\')"><strong style="color:' + color + '">' + Number(value || 0).toLocaleString() + '</strong><span>' + label + '</span></button>';

    return '<section class="gc rank-compact"><div class="gc-hd"><div class="gc-title"><div class="gc-icon">🎯</div>Rank A/B Coverage</div><button class="widget-link" onclick="openRankMetric(\'ab_untouched\',\'all\',\'\')">Full details →</button></div>' +
      '<div class="rank-compact-grid">' +
        metric(sum.aC, 'A contacted', '#13a466', 'a_contacted') + metric(sum.aM, 'A meetings', '#7b58d8', 'a_meetings') + metric(sum.aU, 'A untouched', '#df4037', 'a_untouched') +
        metric(sum.bC, 'B contacted', '#13a466', 'b_contacted') + metric(sum.bM, 'B meetings', '#7b58d8', 'b_meetings') + metric(sum.bU, 'B untouched', '#db8a12', 'b_untouched') +
      '</div><div class="rank-top-gaps"><div class="rank-gap-title">Top coverage gaps</div>' +
      (gaps.length ? gaps.map(row => '<div class="rank-gap-row"><span class="rank-' + String(row.rank || 'b').toLowerCase() + '">' + window.esc(row.rank || 'B') + '</span><div>' + window.rl(row.name || row.companyName || 'Company', window.rowUrl(row), row) + '<small>' + window.esc(row.country || 'Unknown country') + ' · ' + window.esc(row.rep || 'Unassigned') + '</small></div><strong>' + (number(row.daysSinceActivity) > 900 ? 'Never' : number(row.daysSinceActivity) + 'd') + '</strong></div>').join('') : '<div class="rep-lead-empty rep-good-state">✓ No exported Rank A/B coverage gaps.</div>') + '</div></section>';
  }

  function managementBriefHtml() {
    const autoRecs = safeArray(window.D && window.D.autoRecs);
    const ai = window.D && window.D.aiInsights || {};
    const reps = safeArray(window.D && window.D.repData).filter(rep => rep.type !== 'view');
    const urgent = autoRecs.filter(item => item.type === 'red' || item.type === 'warn').slice(0, 4);
    const quickWins = safeArray(ai.quick_wins).slice(0, 4);
    const coaching = reps
      .map(rep => ({ rep, count: safeArray(rep.needsAttention).length + safeArray(rep.stuck).length }))
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    const list = (items, render, empty) => items.length ? items.map(render).join('') : '<div class="brief-empty">' + empty + '</div>';

    return '<section class="gc management-brief"><div class="gc-hd"><div class="gc-title"><div class="gc-icon">✦</div>Management Brief</div><span class="badge bp">AI + operational signals</span></div><div class="brief-grid">' +
      '<div class="brief-column brief-urgent"><div class="brief-title"><span>!</span><div>Needs attention<small>Highest-priority risks</small></div></div>' + list(urgent, item => '<div class="brief-item"><i></i><span>' + window.esc(item.text || '') + '</span></div>', 'No urgent auto-insights.') + '</div>' +
      '<div class="brief-column brief-wins"><div class="brief-title"><span>↗</span><div>Quick wins<small>Recommended next actions</small></div></div>' + list(quickWins, item => '<div class="brief-item"><i></i><span>' + window.esc(item) + '</span></div>', 'No AI quick wins in this refresh.') + '</div>' +
      '<div class="brief-column brief-coaching"><div class="brief-title"><span>◎</span><div>Rep follow-up<small>Who needs manager support</small></div></div>' + list(coaching, item => '<button class="brief-rep" onclick="switchTab(\'' + String(item.rep.name || '').toLowerCase().replace(/\s+/g, '-') + '\')"><span class="score-avatar" style="--rep-color:' + window.esc(item.rep.color || '#13a466') + '">' + window.esc(String(item.rep.name || '?')[0]) + '</span><span><strong>' + window.esc(item.rep.name) + '</strong><small>' + item.count + ' attention signals</small></span><b>→</b></button>', 'No reps require immediate coaching.') + '</div>' +
    '</div></section>';
  }

  function dealMovementRows(kind) {
    const won = safeArray(window.D && window.D.closedWon);
    const lost = safeArray(window.D && window.D.closedLost);
    if (kind === 'won') return won.map(item => Object.assign({}, item, { _movement: 'Won' }));
    if (kind === 'lost') return lost.map(item => Object.assign({}, item, { _movement: 'Lost' }));
    if (kind === 'risk') return safeArray(window.D && window.D.repData).flatMap(rep => [
      ...safeArray(rep.stuck).map(item => Object.assign({}, item, { ownerName: rep.name, _movement: 'Stuck' })),
      ...safeArray(rep.cold).map(item => Object.assign({}, item, { ownerName: rep.name, _movement: 'Cold' }))
    ]);
    return [...won.slice(0, 5).map(item => Object.assign({}, item, { _movement: 'Won' })), ...lost.slice(0, 5).map(item => Object.assign({}, item, { _movement: 'Lost' }))]
      .sort((a, b) => String(b.closedate || '').localeCompare(String(a.closedate || '')));
  }

  function dealMovementContent(kind) {
    const rows = dealMovementRows(kind);
    if (!rows.length) return '<div class="rep-lead-empty">No matching deal movement records in this refresh.</div>';
    return '<table class="rtbl"><thead><tr><th>Deal</th><th>Owner</th><th>Stage / movement</th><th class="c">Date / age</th><th class="c">Amount</th></tr></thead><tbody>' + rows.slice(0, 12).map(row => {
      const movement = row._movement || row.stage || row.dealstage || 'Movement';
      const cls = movement === 'Won' ? 'sp-won' : movement === 'Lost' || movement === 'Stuck' ? 'sp-lost' : 'sp-warm';
      const date = row.closedate ? String(row.closedate).slice(0, 10) : row.daysSinceActivity != null ? row.daysSinceActivity + 'd' : row.ageDays != null ? row.ageDays + 'd' : '—';
      return '<tr><td>' + window.rl(row.name || row.dealname || 'Deal', window.rowUrl(row), row) + '</td><td>' + window.repLink(row.rep || row.ownerName || '—', row.repColor || null) + '</td><td><span class="sp ' + cls + '">' + window.esc(movement) + '</span></td><td class="c mono">' + window.esc(date) + '</td><td class="c mono">' + window.fmt(row.amount || 0) + '</td></tr>';
    }).join('') + '</tbody></table>';
  }

  window.setDealMovementTab = function setDealMovementTab(kind, button) {
    state.dealMovement = kind;
    const target = document.getElementById('dealMovementContent');
    if (target) target.innerHTML = dealMovementContent(kind);
    qa('.deal-movement-tab').forEach(item => item.classList.remove('active'));
    if (button) button.classList.add('active');
  };

  function dealMovementHtml() {
    return '<section class="gc deal-movement"><div class="gc-hd"><div class="gc-title"><div class="gc-icon">⇄</div>Deal Movement</div><div class="deal-movement-tabs">' +
      '<button class="deal-movement-tab active" onclick="setDealMovementTab(\'recent\',this)">Recent</button>' +
      '<button class="deal-movement-tab" onclick="setDealMovementTab(\'won\',this)">Won</button>' +
      '<button class="deal-movement-tab" onclick="setDealMovementTab(\'lost\',this)">Lost</button>' +
      '<button class="deal-movement-tab" onclick="setDealMovementTab(\'risk\',this)">At risk</button>' +
      '</div></div><div class="team-table-scroll" id="dealMovementContent">' + dealMovementContent('recent') + '</div></section>';
  }

  function prepareFocus(focus) {
    if (!focus) return;
    const ai = q('.focus-ai', focus);
    if (ai) ai.remove();
    const label = q('.fp-pills', focus) && q('.fp-pills', focus).previousElementSibling;
    if (label) {
      label.textContent = 'Today’s executive focus';
      label.removeAttribute('style');
      label.className = 'focus-kicker';
    }
    focus.classList.add('focus-summary-only');
  }

  function applyTeamStructure() {
    if (state.applying || !window.D) return;
    const panel = document.getElementById('panel-team');
    if (!panel) return;
    state.applying = true;

    try {
      const focus = q('.focus-strip', panel);
      const priority = document.getElementById('prioritySection');
      const activity = document.getElementById('actChart') && document.getElementById('actChart').closest('.gc');
      const pipeline = document.getElementById('donutC') && document.getElementById('donutC').closest('.gc');

      prepareFocus(focus);

      const layout = document.createElement('div');
      layout.id = 'teamCleanLayout';
      layout.className = 'team-clean-layout';

      if (focus) layout.appendChild(focus);
      if (priority) {
        priority.classList.add('team-priority-compact');
        layout.appendChild(priority);
      }

      if (activity && pipeline) {
        const core = document.createElement('div');
        core.className = 'team-core-grid';
        core.appendChild(activity);
        core.appendChild(pipeline);
        layout.appendChild(core);
      }

      layout.insertAdjacentHTML('beforeend', teamScoreboardHtml());
      layout.insertAdjacentHTML('beforeend', '<div class="team-coverage-grid">' + outreachCompactHtml() + rankCompactHtml() + '</div>');
      layout.insertAdjacentHTML('beforeend', managementBriefHtml());
      layout.insertAdjacentHTML('beforeend', dealMovementHtml());

      panel.replaceChildren(layout);
      panel.dataset.previewStructured = '1';
      enhanceRepPanels();
    } finally {
      state.applying = false;
    }
  }

  function wrapRender() {
    if (state.renderWrapped || typeof window.render !== 'function') return;
    state.originalRender = window.render;
    window.render = function previewStructuredRender() {
      const result = state.originalRender.apply(this, arguments);
      window.setTimeout(() => {
        applyTeamStructure();
        enhanceRepPanels();
      }, 0);
      return result;
    };
    state.renderWrapped = true;
  }

  function boot() {
    wrapRender();
    if (window.D && document.getElementById('panel-team')) {
      applyTeamStructure();
      enhanceRepPanels();
    }
  }

  const observer = new MutationObserver(() => {
    wrapRender();
    if (window.D && document.getElementById('dashMain') && document.getElementById('dashMain').style.display !== 'none') {
      if (!document.getElementById('teamCleanLayout')) applyTeamStructure();
      enhanceRepPanels();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  boot();
  window.setTimeout(boot, 250);
  window.setTimeout(boot, 1000);
})();
