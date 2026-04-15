const callsData = $('HTTP Request').item.json;
const meetingsData = $('HTTP Request1').item.json;
const closedDealsData = $('HTTP Request2').item.json;
const contactsData = $('HTTP Request3').item.json;
const rankCompaniesData = $('HTTP Request4').item.json;
const dealsData = $('HTTP Request5').item.json;
const pipelineData = $('HTTP Request6').item.json;
const leadsYesterdayData = $('HTTP Request7').item.json;
const leadsMtdData = $('HTTP Request8').item.json;
const leadsYtdData = $('HTTP Request9').item.json;
const dateInfo = $('Code in JavaScript').item.json;

const yesterdayLabel = dateInfo.yesterdayLabel;
const generatedAt = dateInfo.generatedAt;

const CONNECTED = 'f240bbac-87c9-4f6e-bf70-924b57d47db7';
const inboundSources = ['ORGANIC_SEARCH','SOCIAL_MEDIA','DIRECT_TRAFFIC','OTHER_CAMPAIGNS','EMAIL_MARKETING','REFERRALS'];

const reps = {
  '31644369': 'Marita',
  '31558980': 'Zein',
  '76369997': 'Ursula',
  '32332250': 'Ahmad',
  '32332251': 'Mohammed'
};

const repColors = {
  Marita: '#7c3aed', Zein: '#1d4ed8', Ursula: '#be185d',
  Ahmad: '#b45309', Mohammed: '#065f46'
};

const repFullNames = {
  Marita: 'Marita Chedid', Zein: 'Zein Fares', Ursula: 'Ursula Waked',
  Ahmad: 'Ahmad Khawajah', Mohammed: 'Mohammed Khalid'
};

const stageNames = {
  'appointmentscheduled': 'Demo Booked',
  'qualifiedtobuy': 'Demo Done',
  'presentationscheduled': 'Tech Meeting Done',
  'decisionmakerboughtin': 'Proposal Shared',
  'contractsent': 'Signed Contract',
  '1521682643': 'Lead',
  '4571370698': 'Renewal',
  'closedwon': 'Closed Won',
  'closedlost': 'Closed Lost'
};

// ─── SUMMARY ───
const summary = {
  Marita:   { calls: 0, connected: 0, meetings: 0, meetings_completed: 0, deals: 0, contacts: 0, contacts_inbound: 0, contacts_outbound: 0 },
  Zein:     { calls: 0, connected: 0, meetings: 0, meetings_completed: 0, deals: 0, contacts: 0, contacts_inbound: 0, contacts_outbound: 0 },
  Ursula:   { calls: 0, connected: 0, meetings: 0, meetings_completed: 0, deals: 0, contacts: 0, contacts_inbound: 0, contacts_outbound: 0 },
  Ahmad:    { calls: 0, connected: 0, meetings: 0, meetings_completed: 0, deals: 0, contacts: 0, contacts_inbound: 0, contacts_outbound: 0 },
  Mohammed: { calls: 0, connected: 0, meetings: 0, meetings_completed: 0, deals: 0, contacts: 0, contacts_inbound: 0, contacts_outbound: 0 }
};

for (const r of callsData.results || []) {
  const rep = reps[r.properties.hubspot_owner_id];
  if (rep) { summary[rep].calls++; if (r.properties.hs_call_disposition === CONNECTED) summary[rep].connected++; }
}
for (const r of meetingsData.results || []) {
  const rep = reps[r.properties.hubspot_owner_id];
  if (rep) { summary[rep].meetings++; if (r.properties.hs_meeting_outcome === 'COMPLETED') summary[rep].meetings_completed++; }
}
for (const r of dealsData.results || []) {
  const rep = reps[r.properties.hubspot_owner_id];
  if (rep) summary[rep].deals++;
}
for (const r of contactsData.results || []) {
  const rep = reps[r.properties.hubspot_owner_id];
  if (rep) {
    summary[rep].contacts++;
    if (inboundSources.includes(r.properties.hs_analytics_source)) summary[rep].contacts_inbound++;
    else summary[rep].contacts_outbound++;
  }
}

// ─── CLOSED DEALS ───
const closedWon = [], closedLost = [];
for (const r of closedDealsData.results || []) {
  const rep = reps[r.properties.hubspot_owner_id] || 'Unknown';
  const deal = {
    name: r.properties.dealname || 'Unnamed Deal',
    amount: parseFloat(r.properties.amount || 0),
    rep, repColor: repColors[rep] || '#6b7280',
    closedate: r.properties.closedate ? r.properties.closedate.split('T')[0] : '',
    lost_reason: r.properties.closed_lost_reason || '',
    lost_explanation: r.properties.closed_lost_reason_explination || '',
    won_reason: r.properties.closed_won_reason || '',
    competitive_reasons: r.properties.competitive_reasons || ''
  };
  if (r.properties.dealstage === 'closedwon') closedWon.push(deal);
  else closedLost.push(deal);
}

// ─── LEADS ───
const now = new Date();
function analyzeLeads(data) {
  const result = {
    total: data.total || 0, inbound: 0, outbound: 0, covered: 0, no_action: 0,
    by_status: { NEW: 0, IN_PROGRESS: 0, OPEN_DEAL: 0, ATTEMPTED_TO_CONTACT: 0, BAD_TIMING: 0, UNQUALIFIED: 0, 'Existing Client': 0 },
    by_rep: {}
  };
  for (const repName of Object.keys(summary)) result.by_rep[repName] = { total: 0, inbound: 0, outbound: 0, covered: 0, no_action: 0 };
  for (const r of data.results || []) {
    const rep = reps[r.properties.hubspot_owner_id];
    const isInbound = inboundSources.includes(r.properties.hs_analytics_source);
    const hasContacted = parseInt(r.properties.num_contacted_notes || 0) > 0;
    const hasNextActivity = !!r.properties.notes_next_activity_date;
    const status = r.properties.hs_lead_status || 'NEW';
    if (isInbound) result.inbound++; else result.outbound++;
    if (hasContacted) result.covered++; else result.no_action++;
    if (result.by_status[status] !== undefined) result.by_status[status]++;
    if (rep) {
      result.by_rep[rep].total++;
      if (isInbound) result.by_rep[rep].inbound++; else result.by_rep[rep].outbound++;
      if (hasContacted) result.by_rep[rep].covered++; else result.by_rep[rep].no_action++;
    }
  }
  return result;
}
const leadsYesterday = analyzeLeads(leadsYesterdayData);
const leadsMtd = analyzeLeads(leadsMtdData);
const leadsYtd = analyzeLeads(leadsYtdData);

// ─── RANK A/B ───
const rankCompanies = { A: [], B: [] };
const rankByRep = {};
for (const repName of Object.keys(summary)) rankByRep[repName] = { A: [], B: [], total: 0, no_activity: [] };
for (const r of rankCompaniesData.results || []) {
  const rep = reps[r.properties.hubspot_owner_id];
  const rank = r.properties.rank;
  const lastActivity = r.properties.notes_last_updated ? new Date(r.properties.notes_last_updated) : null;
  const daysSinceActivity = lastActivity ? Math.floor((now - lastActivity) / 86400000) : 999;
  const company = {
    name: r.properties.name || 'Unknown', rank,
    rep: rep || 'Unassigned', repColor: rep ? repColors[rep] : '#6b7280',
    employees: r.properties.numberofemployees || '—', daysSinceActivity,
    lastActivity: lastActivity ? lastActivity.toISOString().split('T')[0] : 'Never'
  };
  if (rank === 'A') rankCompanies.A.push(company);
  if (rank === 'B') rankCompanies.B.push(company);
  if (rep) {
    rankByRep[rep].total++;
    if (rank === 'A') rankByRep[rep].A.push(company.name);
    if (rank === 'B') rankByRep[rep].B.push(company.name);
    if (daysSinceActivity > 14) rankByRep[rep].no_activity.push({ name: company.name, rank, days: daysSinceActivity });
  }
}
const rankTotals = {
  A: rankCompanies.A.length, B: rankCompanies.B.length,
  total: rankCompanies.A.length + rankCompanies.B.length,
  no_activity_14d: Object.values(rankByRep).reduce((a, p) => a + p.no_activity.length, 0)
};

// ─── PIPELINE ───
const pipeline = {};
for (const repName of Object.keys(summary)) pipeline[repName] = { deals: [], total_value: 0, stuck: [], no_activity: [], no_next_action: [] };
const stageCounts = {};
for (const stageKey of Object.keys(stageNames)) stageCounts[stageKey] = 0;

for (const r of pipelineData.results || []) {
  const rep = reps[r.properties.hubspot_owner_id];
  if (!rep) continue;
  const lastActivity = r.properties.notes_last_updated ? new Date(r.properties.notes_last_updated) : null;
  const daysSinceActivity = lastActivity ? Math.floor((now - lastActivity) / 86400000) : 999;
  const daysInStage = r.properties.hs_v2_time_in_current_stage ? Math.floor(r.properties.hs_v2_time_in_current_stage / 86400) : 0;
  const amount = parseFloat(r.properties.amount || 0);
  const stageKey = r.properties.dealstage;
  const stage = stageNames[stageKey] || stageKey || 'Unknown';
  const hasNextActivity = !!r.properties.notes_next_activity_date;
  const deal = {
    name: r.properties.dealname, stage, amount,
    daysSinceActivity, daysInStage, hasNextActivity,
    closedate: r.properties.closedate ? r.properties.closedate.split('T')[0] : '',
    nextActivity: r.properties.notes_next_activity_date ? r.properties.notes_next_activity_date.split('T')[0] : null
  };
  pipeline[rep].deals.push(deal);
  pipeline[rep].total_value += amount;
  if (daysSinceActivity > 7) pipeline[rep].no_activity.push(deal.name);
  if (daysInStage > 14) pipeline[rep].stuck.push({ name: deal.name, days: daysInStage, stage });
  if (!hasNextActivity) pipeline[rep].no_next_action.push(deal.name);
  if (stageCounts[stageKey] !== undefined) stageCounts[stageKey]++;
}

// ─── TOTALS ───
const totals = {
  calls: Object.values(summary).reduce((a, r) => a + r.calls, 0),
  connected: Object.values(summary).reduce((a, r) => a + r.connected, 0),
  meetings: Object.values(summary).reduce((a, r) => a + r.meetings, 0),
  meetings_completed: Object.values(summary).reduce((a, r) => a + r.meetings_completed, 0),
  deals: Object.values(summary).reduce((a, r) => a + r.deals, 0),
  contacts: Object.values(summary).reduce((a, r) => a + r.contacts, 0),
  contacts_inbound: Object.values(summary).reduce((a, r) => a + r.contacts_inbound, 0),
  contacts_outbound: Object.values(summary).reduce((a, r) => a + r.contacts_outbound, 0),
  won_value: closedWon.reduce((a, d) => a + d.amount, 0),
  lost_value: closedLost.reduce((a, d) => a + d.amount, 0),
  pipeline_value: Object.values(pipeline).reduce((a, p) => a + p.total_value, 0),
  open_deals: Object.values(pipeline).reduce((a, p) => a + p.deals.length, 0),
  stuck_deals: Object.values(pipeline).reduce((a, p) => a + p.stuck.length, 0),
  no_activity_deals: Object.values(pipeline).reduce((a, p) => a + p.no_activity.length, 0),
  no_next_action_deals: Object.values(pipeline).reduce((a, p) => a + p.no_next_action.length, 0)
};

const teamRate = totals.calls > 0 ? Math.round(totals.connected / totals.calls * 100) : 0;
const topPerformer = Object.entries(summary).sort((a, b) => b[1].calls - a[1].calls)[0][0];

// ─── AUTO RECOMMENDATIONS ───
const autoRecs = [];

Object.entries(summary).forEach(([name, d]) => {
  const rate = d.calls > 0 ? Math.round(d.connected / d.calls * 100) : 0;
  if (d.calls < 10) autoRecs.push({ severity: 'action_required', owner: name, text: `${name} logged only ${d.calls} call${d.calls !== 1 ? 's' : ''} yesterday — below target. Push for minimum 20 calls today.` });
  else if (rate < 30) autoRecs.push({ severity: 'action_required', owner: name, text: `${name}'s connection rate is ${rate}% (${d.connected}/${d.calls}) — critical low. Review call times and prospect quality.` });
  else if (rate < 60) autoRecs.push({ severity: 'needs_attention', owner: name, text: `${name}'s connection rate is ${rate}% — below 60% threshold. Try calling between 9-11am.` });
  if (d.meetings === 0 && d.calls > 5) autoRecs.push({ severity: 'needs_attention', owner: name, text: `${name} had ${d.calls} calls but 0 meetings. Focus on converting connected calls to demos today.` });
});

Object.entries(pipeline).forEach(([name, p]) => {
  if (p.stuck.length > 0) autoRecs.push({ severity: 'action_required', owner: name, text: `${name} has ${p.stuck.length} stuck deal${p.stuck.length !== 1 ? 's' : ''} (>14d): ${p.stuck.slice(0, 2).map(s => s.name).join(', ')}. Immediate follow-up required.` });
  if (p.no_activity.length > 3) autoRecs.push({ severity: 'needs_attention', owner: name, text: `${name} has ${p.no_activity.length} deals with no activity in 7+ days. Schedule follow-up calls today.` });
});

Object.entries(rankByRep).forEach(([name, r]) => {
  const urgentA = r.no_activity.filter(c => c.rank === 'A');
  if (urgentA.length > 0) autoRecs.push({ severity: 'action_required', owner: name, text: `${name} has ${urgentA.length} Rank A account${urgentA.length !== 1 ? 's' : ''} inactive >14d: ${urgentA.slice(0, 2).map(c => c.name).join(', ')}.` });
});

if (leadsYesterday.no_action > 3) autoRecs.push({ severity: 'needs_attention', owner: 'Team', text: `${leadsYesterday.no_action} of yesterday's new leads have no follow-up scheduled. Assign tasks today.` });
if (totals.no_next_action_deals > 10) autoRecs.push({ severity: 'action_required', owner: 'Team', text: `${totals.no_next_action_deals} open deals have no next activity date. All reps must log next steps before EOD.` });
if (closedLost.length > 0) autoRecs.push({ severity: 'needs_attention', owner: 'Team', text: `${closedLost.length} deal${closedLost.length !== 1 ? 's' : ''} lost: ${closedLost.map(d => d.name).join(', ')}. Review loss reasons with reps.` });
if (closedWon.length > 0) autoRecs.push({ severity: 'positive', owner: 'Team', text: `${closedWon.length} deal${closedWon.length !== 1 ? 's' : ''} closed won: ${closedWon.map(d => `${d.name} $${d.amount.toLocaleString()}`).join(', ')}. Outstanding work!` });
if (teamRate >= 70) autoRecs.push({ severity: 'positive', owner: 'Team', text: `Team connection rate is ${teamRate}% — above 70% benchmark. Strong outreach performance!` });

// ─── MARKET NEWS (static, updated periodically) ───
const marketNews = [
  { icon: '📈', tag: 'Market Growth', color: '#059669', text: 'Middle East HR Tech market projected to reach $1.89B in 2026, growing 9.2% CAGR — strong tailwind for Talentera.', source: 'Fortune Business Insights' },
  { icon: '🏛️', tag: 'Compliance', color: '#1d4ed8', text: 'Saudi Arabia Nitaqat & UAE Emiratisation quotas tightening in 2026 — recruiters must align ATS workflows with nationalization reporting.', source: 'Business Line Global' },
  { icon: '🤖', tag: 'AI Trend', color: '#7c3aed', text: '43% of organizations now use AI for recruiting tasks (up from 26% in 2024) — companies using AI-powered ATS win talent faster in competitive GCC market.', source: 'HeroHunt.ai' },
  { icon: '🚀', tag: 'Opportunity', color: '#d97706', text: 'Online recruitment activity in Middle East surged 53% YoY in Jan 2026, with HR & admin roles up 54% — high inbound opportunity for Talentera.', source: 'Staffing Industry Analysts' },
  { icon: '💼', tag: 'Sector', color: '#0891b2', text: 'Saudi oil production expansion creating new hiring demand in O&G sector — target energy & industrial companies in KSA pipeline for Q2 push.', source: 'Research & Markets' }
];

// ─── TOP RANK A/B by inactivity ───
const topInactiveRankAccounts = [...rankCompanies.A, ...rankCompanies.B]
  .sort((a, b) => b.daysSinceActivity - a.daysSinceActivity)
  .slice(0, 10);

// ─── FINAL JSON OUTPUT ───
const data = {
  meta: {
    yesterdayLabel,
    generatedAt,
    generatedAtFormatted: new Date(generatedAt).toLocaleString('en-US', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }),
    teamRate,
    topPerformer
  },
  repColors,
  repFullNames,
  summary,
  totals,
  pipeline,
  stageCounts,
  rankByRep,
  rankTotals,
  topInactiveRankAccounts,
  leadsYesterday,
  leadsMtd,
  leadsYtd,
  closedWon,
  closedLost,
  autoRecs,
  marketNews
};

// Also build email HTML for Gmail node
const fmt = n => n >= 1000000 ? `$${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`;

const emailHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Talentera Huddle · ${yesterdayLabel}</title></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:-apple-system,'Segoe UI',sans-serif">
<div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
  <div style="background:linear-gradient(135deg,#0f172a,#1e3a5f);padding:20px 24px;border-bottom:3px solid #f59e0b">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="background:white;border-radius:8px;padding:6px 10px"><span style="font-weight:900;font-size:14px;color:#1e3a5f">talentera</span></div>
        <div style="color:rgba(255,255,255,0.7);font-size:11px;text-transform:uppercase;letter-spacing:0.1em">Daily Sales Huddle</div>
      </div>
      <div style="color:white;font-weight:700;font-size:14px">${yesterdayLabel}</div>
    </div>
  </div>
  <div style="padding:20px 24px">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
      ${[
        { val: totals.calls, lbl: 'Calls', color: '#1d4ed8' },
        { val: `${teamRate}%`, lbl: 'Connection Rate', color: teamRate >= 70 ? '#059669' : '#dc2626' },
        { val: totals.meetings, lbl: 'Meetings', color: '#7c3aed' },
        { val: fmt(totals.pipeline_value), lbl: 'Pipeline', color: '#0369a1' }
      ].map(k => `<div style="text-align:center;padding:12px;background:#f9fafb;border-radius:8px;border-top:3px solid ${k.color}">
        <div style="font-size:20px;font-weight:900;color:${k.color}">${k.val}</div>
        <div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-top:3px">${k.lbl}</div>
      </div>`).join('')}
    </div>
    <div style="background:#f9fafb;border-radius:8px;padding:14px;margin-bottom:16px">
      <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Quick Actions Needed</div>
      ${autoRecs.filter(r => r.severity === 'action_required').slice(0, 3).map(r => `
        <div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #e5e7eb">
          <span style="font-size:11px">🔴</span>
          <span style="font-size:11px;color:#374151">${r.text}</span>
        </div>`).join('')}
    </div>
    <div style="text-align:center;padding:14px">
      <a href="https://amohamed-alt.github.io/talentera-huddle/" style="display:inline-block;background:#1e3a5f;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:13px">
        📊 Open Full Dashboard
      </a>
      <div style="font-size:10px;color:#9ca3af;margin-top:8px">Live data · Updated daily · All reps & pipeline</div>
    </div>
  </div>
  <div style="padding:12px 24px;border-top:1px solid #f1f5f9;display:flex;justify-content:space-between">
    <span style="font-size:9px;color:#d1d5db">© 2026 Talentera · Bayt.com</span>
    <span style="font-size:9px;color:#d1d5db">n8n · Claude AI · HubSpot CRM</span>
  </div>
</div>
</body></html>`;

return [{ json: { data, emailHtml, yesterdayLabel } }];
