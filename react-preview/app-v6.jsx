const { useEffect, useMemo, useRef, useState } = React;

const LOGO = 'https://talimg1.b8cdn.com/wp-content/themes/talentera-2018/images/new-design/Talentera-ATS-white-logo.svg';
const HUBSPOT = 'https://app-eu1.hubspot.com';
const PORTAL = '145742477';
const DATA_SOURCES = location.pathname.includes('/react-preview/')
  ? ['../data.json', '/talentera-huddle/data.json']
  : ['./data.json', '/talentera-huddle/data.json'];

const PERIODS = [
  { key: 'yesterday', label: 'Yesterday', short: 'Yesterday', tone: 'blue' },
  { key: 'mtd', label: 'Month to Date', short: 'MTD', tone: 'green' },
  { key: 'ytd', label: 'Year to Date', short: 'YTD', tone: 'purple' }
];

const arr = value => Array.isArray(value) ? value : [];
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const txt = (value, fallback = '—') => String(value ?? '').trim() || fallback;
const slug = value => txt(value, 'team').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const numericText = value => /^\d+$/.test(String(value ?? '').trim());
const formatNumber = value => value === null || value === undefined ? '—' : Number(value).toLocaleString();
const money = value => {
  if (value === null || value === undefined || value === '') return '—';
  const amount = num(value);
  if (Math.abs(amount) >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1000) return `$${Math.round(amount / 1000)}K`;
  return `$${Math.round(amount).toLocaleString()}`;
};
const first = (row, keys) => {
  const sources = [row, row?.properties, row?.fields, row?.propertyValues].filter(Boolean);
  for (const key of keys) for (const source of sources) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
};
const maybeNumber = (object, keys) => {
  for (const key of keys) {
    const value = first(object, [key]);
    if (value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
};
const nestedNumber = (object, paths) => {
  for (const path of paths) {
    let value = object;
    for (const part of path.split('.')) value = value?.[part];
    if (value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
};
const sumNullable = values => {
  const known = values.filter(value => value !== null && value !== undefined && Number.isFinite(Number(value)));
  return known.length ? known.reduce((sum, value) => sum + Number(value), 0) : null;
};
const humanName = row => {
  const firstName = txt(first(row, ['firstname','firstName','first_name']), '');
  const lastName = txt(first(row, ['lastname','lastName','last_name']), '');
  const combined = `${firstName} ${lastName}`.trim();
  const candidates = [
    first(row, ['fullName','contactName','leadName','personName']),
    combined,
    first(row, ['companyName','company','accountName']),
    first(row, ['email','workEmail']),
    first(row, ['dealname','dealName']),
    first(row, ['name','title'])
  ];
  for (const candidate of candidates) {
    const value = txt(candidate, '');
    if (value && !numericText(value)) return value;
  }
  return txt(first(row, ['id','hs_object_id','recordId']), 'Unknown record');
};
const rowOwner = row => txt(first(row, ['ownerName','rep','owner','_owner','hubspot_owner_name','contactOwnerName','assignedTo']));
const rowCountry = row => txt(first(row, ['country','_country','companyCountry','countryName','hs_country','company_country']), 'Unknown');
const rowAge = row => {
  const value = first(row, ['ageDays','days','daysWithoutContact','daysSinceCreated','daysSinceActivity']);
  return value === undefined ? '—' : `${num(value)}d`;
};
const rowDate = row => {
  const value = first(row, ['closedate','stageDate','createdAt','createdate','lastActivityDate','nextActivityDate','signedDate','cashingDate']);
  return value ? String(value).slice(0, 10) : '—';
};
const objectType = row => first(row, ['dealId','deal_id','dealname','dealstage','amount']) ? '0-3' : first(row, ['companyId','company_id','domain','companyName']) ? '0-2' : '0-1';
const recordUrl = row => {
  const explicit = txt(first(row, ['hubspotUrl','url','recordUrl','hs_url','dealUrl','companyUrl','contactUrl']), '');
  if (/^https?:\/\//i.test(explicit)) return explicit;
  const id = String(first(row, ['dealId','deal_id','companyId','company_id','contactId','contact_id','vid','hs_object_id','recordId','objectId','id']) ?? '').match(/\d{5,}/)?.[0];
  const type = objectType(row);
  return id
    ? `${HUBSPOT}/contacts/${PORTAL}/record/${type}/${id}`
    : `${HUBSPOT}/contacts/${PORTAL}/objects/${type}/views/all/list?query=${encodeURIComponent(humanName(row))}`;
};
const sourceKind = row => {
  const source = txt(first(row, ['sourceBucket','source','originalSource','leadSource','hs_analytics_source','channel','type']), '').toLowerCase();
  if (['online','inbound','website','form','organic','paid','social','referral','direct'].some(marker => source.includes(marker))) return 'online';
  if (['offline','outbound','manual','import','event','cold','prospect','sales generated'].some(marker => source.includes(marker))) return 'offline';
  return 'unknown';
};
const ownerMatch = (row, name) => {
  const expected = txt(name, '').toLowerCase();
  const actual = rowOwner(row).toLowerCase();
  return actual === expected || (actual && expected && actual.split(' ')[0] === expected.split(' ')[0]);
};
const statusTone = rate => rate >= 50 ? 'green' : rate >= 30 ? 'amber' : 'red';
const periodSuffixes = {
  yesterday: ['Yest','Yesterday','yest','yesterday'],
  mtd: ['MTD','Mtd','mtd'],
  ytd: ['YTD','Ytd','ytd']
};
const periodNumber = (rep, period, bases, fallback = null) => {
  const keys = [];
  for (const base of bases) for (const suffix of periodSuffixes[period]) keys.push(`${base}${suffix}`, `${base}_${suffix}`);
  const value = maybeNumber(rep, keys);
  return value === null ? fallback : value;
};
const repPeriod = (rep, period) => {
  const calls = period === 'yesterday' ? maybeNumber(rep.calls, ['yest','yesterday']) : period === 'mtd' ? maybeNumber(rep.calls, ['mtd']) : maybeNumber(rep.calls, ['ytd']);
  const connected = period === 'yesterday' ? maybeNumber(rep.calls, ['yestConn','yesterdayConnected']) : period === 'mtd' ? maybeNumber(rep.calls, ['mtdConn','connectedMTD']) : maybeNumber(rep.calls, ['ytdConn','connectedYTD']);
  const rate = period === 'yesterday' ? maybeNumber(rep, ['connRateYest','connectionRateYest']) : period === 'mtd' ? maybeNumber(rep, ['connRateMTD','connectionRateMTD']) : maybeNumber(rep, ['connRateYTD','connectionRateYTD']);
  const meetings = period === 'yesterday' ? maybeNumber(rep.meetings, ['yest','yesterday']) : period === 'mtd' ? maybeNumber(rep.meetings, ['mtd']) : maybeNumber(rep.meetings, ['ytd']);
  const completedMeetings = periodNumber(rep, period, ['completedMeetings','meetingsCompleted'], meetings);
  const bookedMeetings = periodNumber(rep, period, ['meetingsBooked','bookedMeetings'], null);
  const leads = period === 'yesterday' ? maybeNumber(rep, ['leadsYest','leadsYesterday']) : period === 'mtd' ? maybeNumber(rep, ['leadsMTD']) : maybeNumber(rep, ['leadsYTD']);
  const newDeals = periodNumber(rep, period, ['newDeals','dealsCreated','createdDeals'], null);
  const won = periodNumber(rep, period, ['won','dealsWon'], period === 'mtd' ? maybeNumber(rep, ['won']) : null);
  const lost = periodNumber(rep, period, ['lost','dealsLost'], period === 'mtd' ? maybeNumber(rep, ['lost']) : null);
  const pipeline = periodNumber(rep, period, ['pipelineCreated','pipelineAmount','newPipeline'], period === 'mtd' ? maybeNumber(rep, ['pipeAmt']) : null);
  const revenue = periodNumber(rep, period, ['wonRevenue','revenueWon','wonAmount'], period === 'mtd' ? maybeNumber(rep, ['wonAmt']) : null);
  return { calls, connected, rate, meetings, completedMeetings, bookedMeetings, leads, newDeals, won, lost, pipeline, revenue };
};
const teamPeriod = (reps, period) => {
  const rows = reps.map(rep => repPeriod(rep, period));
  const calls = sumNullable(rows.map(row => row.calls));
  const connected = sumNullable(rows.map(row => row.connected));
  const explicitRates = rows.map(row => row.rate).filter(value => value !== null);
  const rate = calls ? Math.round((num(connected) / calls) * 100) : explicitRates.length ? Math.round(explicitRates.reduce((sum, value) => sum + value, 0) / explicitRates.length) : null;
  return {
    calls,
    connected,
    rate,
    meetings: sumNullable(rows.map(row => row.meetings)),
    completedMeetings: sumNullable(rows.map(row => row.completedMeetings)),
    bookedMeetings: sumNullable(rows.map(row => row.bookedMeetings)),
    leads: sumNullable(rows.map(row => row.leads)),
    newDeals: sumNullable(rows.map(row => row.newDeals)),
    won: sumNullable(rows.map(row => row.won)),
    lost: sumNullable(rows.map(row => row.lost)),
    pipeline: sumNullable(rows.map(row => row.pipeline)),
    revenue: sumNullable(rows.map(row => row.revenue))
  };
};

async function loadDashboard() {
  const errors = [];
  for (const url of DATA_SOURCES) {
    try {
      const response = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) { errors.push(`${url}: ${response.status}`); continue; }
      return await response.json();
    } catch (error) { errors.push(`${url}: ${error.message}`); }
  }
  throw new Error(errors.join(' | '));
}

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(() => location.hash.slice(1) || 'team');
  const [modal, setModal] = useState(null);
  const [mobile, setMobile] = useState(false);

  const refresh = async () => {
    setLoading(true); setError('');
    try { setData(await loadDashboard()); }
    catch (err) { setError(err.message || String(err)); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const handler = () => setPage(location.hash.slice(1) || 'team');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const go = next => {
    location.hash = next;
    setPage(next);
    setMobile(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const openRows = (title, description, rows, empty) => setModal({ title, description, rows, empty });

  if (!data && loading) return <StatePanel loading />;
  if (!data) return <StatePanel error={error} retry={refresh} />;

  const reps = arr(data.repData);
  const currentRep = reps.find(rep => page === `rep/${slug(rep.name)}`);
  const title = page === 'financial' ? 'Acquisition Financials' : currentRep ? currentRep.name : 'Acquisition Command Center';
  const subtitle = currentRep
    ? `${txt(data.meta?.yesterdayLabel)} · Acquisition rep performance`
    : page === 'financial'
      ? 'YTD · Cashing, signed deals and missing financial data'
      : `Updated ${txt(data.meta?.generatedAt, 'latest refresh')} · Team performance and execution`;

  return <div className="app">
    <Sidebar data={data} page={page} go={go} open={mobile} close={() => setMobile(false)} />
    <main>
      <Header title={title} subtitle={subtitle} data={data} loading={loading} refresh={refresh} go={go} openRows={openRows} menu={() => setMobile(true)} />
      <Tabs reps={reps} page={page} go={go} />
      <div className="content">
        {error && <div className="notice">⚠ Latest refresh failed. Showing the last successful snapshot: {error}</div>}
        {page === 'team' && <TeamPage data={data} openRows={openRows} />}
        {page === 'financial' && <FinancialPage data={data} />}
        {currentRep && <RepPage data={data} rep={currentRep} openRows={openRows} />}
      </div>
    </main>
    {modal && <Modal {...modal} close={() => setModal(null)} />}
  </div>;
}

function StatePanel({ loading, error, retry }) {
  return <div className="state"><div className="state-card">{loading ? <><span className="spinner"/><b>Loading Talentera Huddle…</b></> : <><b>Dashboard data could not be loaded</b><p>{error}</p><button onClick={retry}>Try again</button></>}</div></div>;
}

function Sidebar({ data, page, go, open, close }) {
  return <><aside className={open ? 'open' : ''}>
    <div className="brand"><img src={LOGO}/><small>Talentera Huddle</small></div>
    <nav>
      <NavLabel>Main</NavLabel>
      <Nav active={page === 'team'} icon="▦" onClick={() => go('team')}>Acquisition</Nav>
      <Nav active={page === 'financial'} icon="$" onClick={() => go('financial')}>Financial</Nav>
      <NavLabel>External</NavLabel>
      <a className="nav" href="https://amohamed-alt.github.io/talentera-retention/" target="_blank"><i>◉</i><span>Retention</span><em>↗</em></a>
      <a className="nav" href="#" onClick={event => event.preventDefault()}><i>↗</i><span>P&amp;L</span><em>↗</em></a>
      <NavLabel>Reps</NavLabel>
      {arr(data.repData).map(rep => <Nav key={rep.name} active={page === `rep/${slug(rep.name)}`} icon={<Avatar rep={rep} small/>} alert={rep.type !== 'view' && (num(rep.connRateYest) < 30 || arr(rep.stuck).length || arr(rep.cold).length > 3)} onClick={() => go(`rep/${slug(rep.name)}`)}>{rep.name}</Nav>)}
    </nav>
    <div className="user"><b>SM</b><span><strong>Sales Manager</strong><small>Admin · Riyadh</small></span></div>
  </aside>{open && <button className="overlay" onClick={close}/>}</>;
}
function NavLabel({ children }) { return <div className="nav-label">{children}</div>; }
function Nav({ active, icon, alert, onClick, children }) { return <button className={`nav ${active ? 'active' : ''}`} onClick={onClick}><i>{icon}</i><span>{children}</span>{alert && <em>!</em>}</button>; }
function Avatar({ rep, small }) { return <b className={`avatar ${small ? 'small' : ''}`} style={{ '--rep': rep.color || '#13a466' }}>{txt(rep.name, '?')[0]}</b>; }

function Header({ title, subtitle, data, loading, refresh, go, openRows, menu }) {
  const [query, setQuery] = useState('');
  const search = () => {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const rows = [
      ...arr(data.outreachCoverage?.contacts?.notContactedList),
      ...arr(data.repData).flatMap(rep => arr(rep.topDeals).map(row => ({ ...row, ownerName: rep.name }))),
      ...arr(data.closedWon),
      ...arr(data.closedLost)
    ].filter(row => JSON.stringify(row).toLowerCase().includes(q));
    openRows(`Search results (${rows.length})`, q, rows, 'No matching acquisition records.');
  };
  return <>
    <header>
      <button className="icon mobile" onClick={menu}>☰</button>
      <div className="search"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => event.key === 'Enter' && search()} placeholder="Search lead, deal, account, rep…"/><kbd>⌘ F</kbd></div>
      <div className="actions"><button className="icon" onClick={() => go('team')}>↗</button><button className="icon" onClick={refresh}>⟳</button><span className="live"><i/> Live · HubSpot</span><button className="primary" onClick={refresh}>{loading ? '⟳' : '↻'} Refresh Data</button></div>
    </header>
    <section className="hero"><div><h1>{title}</h1><p>{subtitle}</p></div><div><button className="primary" onClick={() => go('financial')}>+ Open Financial Tab</button><button className="outline" onClick={() => go('team')}>Open Data</button></div></section>
  </>;
}
function Tabs({ reps, page, go }) {
  return <div className="tabs"><button className={page === 'team' ? 'active' : ''} onClick={() => go('team')}>⌂ Team Overview</button><button className={page === 'financial' ? 'active' : ''} onClick={() => go('financial')}>$ Financial</button>{reps.map(rep => <button key={rep.name} className={page === `rep/${slug(rep.name)}` ? 'active' : ''} onClick={() => go(`rep/${slug(rep.name)}`)}><i style={{ background: rep.color || '#13a466' }}/> {rep.name.split(' ')[0]}</button>)}</div>;
}

function Card({ title, icon, action, children, className = '' }) {
  return <section className={`card ${className}`}><div className="card-head"><div><i>{icon}</i><h3>{title}</h3></div>{action}</div>{children}</section>;
}
function Badge({ tone, children }) { return <span className={`badge ${tone}`}>{children}</span>; }
function Metric({ tone, value, label, note, click }) { return <button className={`metric ${tone}`} onClick={click}><strong>{typeof value === 'number' ? value.toLocaleString() : value}</strong><b>{label}</b><small>{note}</small></button>; }
function PMetric({ tone, value, label, click }) { return <button className={`pmetric ${tone}`} onClick={click}><strong>{formatNumber(value)}</strong><span>{label}</span></button>; }
function Tile({ value, label, tone, note }) { return <div className="tile"><strong className={tone}>{typeof value === 'number' ? value.toLocaleString() : value}</strong><span>{label}</span>{note && <small>{note}</small>}</div>; }
function Empty({ text }) { return <div className="empty">✓ {text}</div>; }
function RecordLink({ row }) { return <a className="record-link" href={recordUrl(row)} target="_blank" title={humanName(row)}>{humanName(row)} ↗</a>; }
function Table({ heads, rows, stickyFirst = false, minWidth = 760 }) {
  return <div className={`table ${stickyFirst ? 'sticky-first' : ''}`}><table style={{ minWidth }}><thead><tr>{heads.map(head => <th key={head}>{head}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
}
function Segment({ value, options, labels = {}, onChange }) {
  return <div className="segments">{options.map(option => <button key={option} className={value === option ? 'active' : ''} onClick={() => onChange(option)}>{labels[option] || option}</button>)}</div>;
}
function Rate({ value }) {
  if (value === null || value === undefined) return <span className="not-exported">—</span>;
  const tone = statusTone(value);
  const color = tone === 'green' ? '#13a466' : tone === 'amber' ? '#db8a12' : '#df4037';
  return <span className="rate"><b style={{ color }}>{value}%</b><i><em style={{ width: `${Math.min(value, 100)}%`, background: color }}/></i></span>;
}

function PeriodBreakdown({ title, subtitle, periods }) {
  return <section className="period-section">
    <div className="section-heading"><div><span className="section-icon">▦</span><div><h3>{title}</h3><p>{subtitle}</p></div></div><Badge tone="green">Yesterday · MTD · YTD</Badge></div>
    <div className="period-grid">{PERIODS.map(period => <PeriodCard key={period.key} definition={period} values={periods[period.key]} />)}</div>
  </section>;
}
function PeriodCard({ definition, values }) {
  const activity = [
    ['Calls', values.calls],
    ['Connected', values.connected],
    ['Connection rate', values.rate === null ? null : `${values.rate}%`],
    ['Meetings booked', values.bookedMeetings],
    ['Meetings completed', values.completedMeetings],
    ['Leads', values.leads]
  ];
  const sales = [
    ['New deals', values.newDeals],
    ['Won', values.won],
    ['Lost', values.lost],
    ['Pipeline created', values.pipeline, true],
    ['Won revenue', values.revenue, true]
  ];
  return <article className={`period-card ${definition.tone}`}>
    <header><div><strong>{definition.label}</strong><span>{definition.key === 'yesterday' ? 'Latest completed business day' : definition.key === 'mtd' ? 'Current month' : 'Current year'}</span></div>{values.rate !== null && <span className="period-rate">{values.rate}%</span>}</header>
    <div className="metric-group"><h4>Activity</h4><div>{activity.map(([label, value]) => <PeriodMetric key={label} label={label} value={value} />)}</div></div>
    <div className="metric-group sales"><h4>Pipeline & revenue</h4><div>{sales.map(([label, value, isMoney]) => <PeriodMetric key={label} label={label} value={isMoney ? money(value) : value} missing={value === null} />)}</div></div>
    <div className="period-progress"><span>Connection efficiency <b>{values.rate === null ? 'Not exported' : `${values.rate}%`}</b></span><i><em style={{ width: `${Math.min(values.rate || 0, 100)}%` }}/></i></div>
  </article>;
}
function PeriodMetric({ label, value, missing }) {
  const absent = missing || value === null || value === undefined;
  return <div className={`period-metric ${absent ? 'missing' : ''}`}><strong>{absent ? '—' : typeof value === 'number' ? value.toLocaleString() : value}</strong><span>{label}</span>{absent && <small>Not exported</small>}</div>;
}

function TeamPage({ data, openRows }) {
  const reps = arr(data.repData).filter(rep => rep.type !== 'view');
  const contacts = data.outreachCoverage?.contacts || {};
  const ranks = data.rankTotals || {};
  const deals = reps.flatMap(rep => [
    ...arr(rep.needsAttention).map(row => ({ ...row, ownerName: rep.name, _type: 'No next activity' })),
    ...arr(rep.stuck).map(row => ({ ...row, ownerName: rep.name, _type: 'Stuck deal' })),
    ...arr(rep.cold).map(row => ({ ...row, ownerName: rep.name, _type: 'Cold deal' }))
  ]);
  const leadRows = arr(contacts.notContactedList);
  const leadCount = num(contacts.notContacted) || leadRows.length;
  const total = leadCount + deals.length;
  const teamPeriods = Object.fromEntries(PERIODS.map(period => [period.key, teamPeriod(reps, period.key)]));

  return <div className="stack team-page">
    <section className="focus"><label>Today’s executive focus</label><div>
      <Metric tone="red" value={leadCount} label="Leads need contact" note={`${num(contacts.total)} eligible total`} click={() => openRows(`Leads not contacted (${leadCount})`, 'Eligible leads with no connected call.', leadRows, 'Summary count exists, but row records are not exported.')} />
      <Metric tone="amber" value={num(ranks.ANotContacted) + num(ranks.BNotContacted)} label="Rank A/B untouched" note={`${num(ranks.ANotContacted)}A · ${num(ranks.BNotContacted)}B`} click={() => openRows('Rank A/B untouched', 'Accounts requiring outreach.', reps.flatMap(rep => [...arr(rep.rankAUntouched), ...arr(rep.rankBUntouched)]))} />
      <Metric tone="purple" value={deals.length} label="Deals at risk" note="Cold · stuck · no next" click={() => openRows('Deals at risk', 'Operational risk signals.', deals)} />
      <Metric tone="green" value={`${num(contacts.contactedRate)}%`} label="Contact rate" note={`${num(contacts.contacted)}/${num(contacts.total)} contacted`} />
    </div></section>
    <PeriodBreakdown title="Team Performance" subtitle="All acquisition activities and sales outcomes by period" periods={teamPeriods} />
    <MarketNews data={data} />
    <Card title="Priority Leads & SLA Breaches" icon="◎" action={<button className="text-button" onClick={() => openRows(`All priority actions (${total})`, 'Lead and deal actions requiring follow-up.', [...leadRows, ...deals], 'No row-level records were exported.')}>View all {total}</button>}>
      <div className="priority-metrics"><PMetric tone="red" value={leadCount} label="Lead actions" click={() => openRows(`Lead actions (${leadCount})`, `${leadRows.length} row-level records exported`, leadRows, 'Summary count exists, but row records are not exported.')} /><PMetric tone="amber" value={deals.length} label="Deal actions" click={() => openRows(`Deal actions (${deals.length})`, 'Cold, stuck and no-next-activity deals.', deals)} /><PMetric tone="purple" value={total} label="Total priority" click={() => openRows(`Total priority (${total})`, 'All available priority rows.', [...leadRows, ...deals])} /></div>
      <div className="priority-list">{[...leadRows, ...deals].slice(0, 5).map((row, index) => <ActionRow key={index} row={row} index={index + 1} />)}</div>
    </Card>
    <div className="grid core"><ActivityCard reps={reps} /><Card title="Pipeline Stages" icon="◌" action={<Badge tone="green">Open pipeline</Badge>}><PipelineChart stages={arr(data.stageData)} /></Card></div>
    <Scoreboard reps={reps} />
    <div className="grid"><Coverage data={data} /><TeamRankCoverage data={data} /></div>
    <Brief data={data} />
    <DealMovement data={data} />
  </div>;
}

function ActionRow({ row, index }) {
  return <div className="action-row"><b>{index}</b><div><RecordLink row={row}/><small>{txt(row._type, 'Lead needs contact')} · {rowOwner(row)}</small></div><span>{rowAge(row)}</span><strong>{first(row, ['amount']) !== undefined ? money(first(row, ['amount'])) : '—'}</strong></div>;
}

function ActivityCard({ reps }) {
  const [period, setPeriod] = useState('yesterday');
  return <Card title="Team Activity" icon="▥" action={<Segment value={period} options={PERIODS.map(item => item.key)} labels={{ yesterday: 'Yesterday', mtd: 'MTD', ytd: 'YTD' }} onChange={setPeriod} />}><ActivityChart reps={reps} period={period} /></Card>;
}
function ActivityChart({ reps, period }) {
  const ref = useRef(null);
  useEffect(() => {
    const chart = new Chart(ref.current, {
      type: 'bar',
      data: {
        labels: reps.map(rep => rep.name.split(' ')[0]),
        datasets: [
          { label: 'Calls', data: reps.map(rep => repPeriod(rep, period).calls || 0), backgroundColor: 'rgba(56,120,232,.16)', borderColor: '#3878e8', borderWidth: 2, borderRadius: 8 },
          { label: 'Connected', data: reps.map(rep => repPeriod(rep, period).connected || 0), backgroundColor: 'rgba(19,164,102,.16)', borderColor: '#13a466', borderWidth: 2, borderRadius: 8 },
          { label: 'Meetings', data: reps.map(rep => repPeriod(rep, period).meetings || 0), backgroundColor: 'rgba(123,88,216,.13)', borderColor: '#7b58d8', borderWidth: 2, borderRadius: 8 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: 'rgba(43,82,63,.06)' } } } }
    });
    return () => chart.destroy();
  }, [reps, period]);
  return <div className="chart"><canvas ref={ref}/></div>;
}
function PipelineChart({ stages }) {
  const ref = useRef(null);
  const open = stages.filter(stage => !['closedwon','closedlost'].includes(txt(stage.id, '').toLowerCase()) && num(stage.count) > 0);
  const colors = ['#13a466','#3878e8','#0f97a0','#7b58d8','#db8a12','#df4037'];
  useEffect(() => {
    const chart = new Chart(ref.current, { type: 'doughnut', data: { labels: open.map(stage => txt(stage.label || stage.id)), datasets: [{ data: open.map(stage => num(stage.count)), backgroundColor: colors, borderColor: '#fff', borderWidth: 3 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { display: false } } } });
    return () => chart.destroy();
  }, [stages]);
  return <div className="donut"><div><canvas ref={ref}/></div><ul>{open.map((stage, index) => <li key={txt(stage.id)}><i style={{ background: colors[index % colors.length] }}/><span>{txt(stage.label || stage.id)}</span><b>{num(stage.count)}</b></li>)}</ul></div>;
}

function Scoreboard({ reps }) {
  const [period, setPeriod] = useState('yesterday');
  return <Card title="Team Scoreboard" icon="♙" action={<Segment value={period} options={PERIODS.map(item => item.key)} labels={{ yesterday: 'Yesterday', mtd: 'MTD', ytd: 'YTD' }} onChange={setPeriod} />}><Table stickyFirst minWidth={1120} heads={['Rep','Calls','Connected','Conn. rate','Meetings','Leads','New deals','Won','Lost','Pipeline','Revenue','Status']} rows={reps.map(rep => {
    const metrics = repPeriod(rep, period);
    return [
      <span className="rep-cell"><Avatar rep={rep} small/><a href={`#rep/${slug(rep.name)}`}>{rep.name}</a></span>,
      formatNumber(metrics.calls),
      formatNumber(metrics.connected),
      <Rate value={metrics.rate}/>,
      formatNumber(metrics.meetings),
      formatNumber(metrics.leads),
      formatNumber(metrics.newDeals),
      formatNumber(metrics.won),
      formatNumber(metrics.lost),
      money(metrics.pipeline),
      money(metrics.revenue),
      <Badge tone={metrics.rate === null ? 'gray' : statusTone(metrics.rate)}>{metrics.rate === null ? 'No data' : metrics.rate >= 50 ? 'Healthy' : metrics.rate >= 30 ? 'Watch' : 'At Risk'}</Badge>
    ];
  })} /></Card>;
}

function Coverage({ data }) {
  const contacts = data.outreachCoverage?.contacts || {}, split = data.outreachCoverage?.sourceSplit || {}, online = split.online || {}, offline = split.offline || {};
  const rate = num(contacts.contactedRate), onlineRate = num(online.total) ? Math.round(num(online.contacted) / num(online.total) * 100) : 0, offlineRate = num(offline.total) ? Math.round(num(offline.contacted) / num(offline.total) * 100) : 0;
  return <Card title="Lead Outreach Coverage" icon="☎" action={<Badge tone="green">Live coverage</Badge>}><div className="tiles"><Tile value={num(contacts.notContacted)} label="Not contacted" tone="red"/><Tile value={`${rate}%`} label="Contact rate"/><Tile value={num(contacts.total)} label="Eligible leads"/></div><div className="bars"><BarRow label="Overall contact rate" value={rate}/><BarRow label="Online / inbound" value={onlineRate} color="#3878e8"/><BarRow label="Offline / outbound" value={offlineRate} color="#db8a12"/></div></Card>;
}
function BarRow({ label, value, color }) {
  const selected = color || (value >= 70 ? '#13a466' : value >= 40 ? '#db8a12' : '#df4037');
  return <div className="bar"><span>{label}<b style={{ color: selected }}>{value}%</b></span><i><em style={{ width: `${Math.min(value, 100)}%`, background: selected }}/></i></div>;
}
function TeamRankCoverage({ data }) {
  const reps = arr(data.repData).filter(rep => rep.type !== 'view');
  const totals = reps.reduce((state, rep) => {
    const a = num(rep.rankA), b = num(rep.rankB), aNot = num(rep.rankANotContacted) || arr(rep.rankAUntouched).length, bNot = num(rep.rankBNotContacted) || arr(rep.rankBUntouched).length;
    state.aContacted += num(rep.rankAContacted) || Math.max(0, a - aNot);
    state.aNot += aNot;
    state.bContacted += num(rep.rankBContacted) || Math.max(0, b - bNot);
    state.bNot += bNot;
    return state;
  }, { aContacted: 0, aNot: 0, bContacted: 0, bNot: 0 });
  return <Card title="Rank A/B Coverage" icon="◎" action={<Badge tone="purple">Coverage summary</Badge>}><div className="rank-grid"><Tile value={totals.aContacted} label="A contacted"/><Tile value={totals.aNot} label="A not contacted" tone="red"/><Tile value={totals.bContacted} label="B contacted"/><Tile value={totals.bNot} label="B not contacted" tone="amber"/></div><div className="rows compact">{arr(data.topInactiveRankAccounts).slice(0, 3).map((row, index) => <div className="row" key={index}><b className={`rank ${txt(row.rank, 'B').toLowerCase()}`}>{txt(row.rank, 'B')}</b><span><RecordLink row={row}/><small>{rowCountry(row)} · {rowOwner(row)}</small></span><strong className="danger">{num(row.daysSinceActivity) > 900 ? 'Never' : `${num(row.daysSinceActivity)}d`}</strong></div>)}</div></Card>;
}
function Brief({ data }) {
  const reps = arr(data.repData).filter(rep => rep.type !== 'view'), urgent = arr(data.autoRecs).filter(item => ['red','warn'].includes(txt(item.type, ''))).slice(0, 4), wins = arr(data.aiInsights?.quick_wins).slice(0, 4), coach = reps.map(rep => ({ rep, count: arr(rep.needsAttention).length + arr(rep.stuck).length })).filter(item => item.count).sort((a, b) => b.count - a.count).slice(0, 4);
  return <Card title="Management Brief" icon="✦" action={<Badge tone="purple">AI + operational signals</Badge>}><div className="brief"><BriefCol tone="red" title="Needs attention" sub="Highest-priority risks">{urgent.map((item, index) => <p key={index}>• {txt(item.text)}</p>)}</BriefCol><BriefCol tone="green" title="Quick wins" sub="Recommended actions">{wins.map((item, index) => <p key={index}>• {txt(item)}</p>)}</BriefCol><BriefCol tone="purple" title="Rep follow-up" sub="Manager support">{coach.map(item => <button key={item.rep.name} onClick={() => location.hash = `rep/${slug(item.rep.name)}`}><Avatar rep={item.rep} small/><span><b>{item.rep.name}</b><small>{item.count} attention signals</small></span>→</button>)}</BriefCol></div></Card>;
}
function BriefCol({ tone, title, sub, children }) { return <div className={`brief-col ${tone}`}><h4><i>{tone === 'red' ? '!' : tone === 'green' ? '↗' : '◎'}</i><span>{title}<small>{sub}</small></span></h4>{children}</div>; }
function DealMovement({ data }) {
  const [tab, setTab] = useState('recent');
  const reps = arr(data.repData), won = arr(data.closedWon).map(row => ({ ...row, _move: 'Won' })), lost = arr(data.closedLost).map(row => ({ ...row, _move: 'Lost' })), risk = reps.flatMap(rep => [...arr(rep.stuck).map(row => ({ ...row, ownerName: rep.name, _move: 'Stuck' })), ...arr(rep.cold).map(row => ({ ...row, ownerName: rep.name, _move: 'Cold' }))]);
  const rows = tab === 'won' ? won : tab === 'lost' ? lost : tab === 'risk' ? risk : [...won.slice(0, 5), ...lost.slice(0, 5)];
  return <Card title="Deal Movement" icon="⇄" action={<Segment value={tab} options={['recent','won','lost','risk']} onChange={setTab} />}><Table stickyFirst heads={['Deal','Owner','Movement','Date / age','Amount']} rows={rows.slice(0, 12).map(row => [<RecordLink row={row}/>, rowOwner(row), <Badge tone={txt(row._move).includes('Won') ? 'green' : txt(row._move).includes('Lost') || txt(row._move).includes('Stuck') ? 'red' : 'amber'}>{txt(row._move)}</Badge>, rowDate(row) !== '—' ? rowDate(row) : rowAge(row), money(first(row, ['amount']))])} /></Card>;
}

function MarketNews({ data }) {
  const [expanded, setExpanded] = useState(false);
  const news = arr(data.marketNews);
  const shown = expanded ? news : news.slice(0, 3);
  return <section className="market-news"><div className="section-heading"><div><span className="section-icon">📰</span><div><h3>Market & M&A News</h3><p>Strategic context for acquisition conversations</p></div></div>{news.length > 3 && <button className="text-button" onClick={() => setExpanded(value => !value)}>{expanded ? 'Show less' : `View all ${news.length}`}</button>}</div>{news.length ? <div className="news-grid">{shown.map((item, index) => <article className="news-card" key={index}><span>{item.icon || '📰'}</span><div><header><Badge tone={index % 3 === 0 ? 'green' : index % 3 === 1 ? 'purple' : 'amber'}>{txt(item.tag, 'Market')}</Badge><small>{txt(item.source, '')}</small></header><p>{txt(item.text, 'No description')}</p></div></article>)}</div> : <Empty text="No market news was included in the latest data refresh."/>}</section>;
}

function RepPage({ data, rep, openRows }) {
  const allLeads = arr(data.outreachCoverage?.contacts?.notContactedList).filter(row => ownerMatch(row, rep.name));
  const online = allLeads.filter(row => sourceKind(row) === 'online');
  const offline = allLeads.filter(row => sourceKind(row) === 'offline');
  const periods = Object.fromEntries(PERIODS.map(period => [period.key, repPeriod(rep, period.key)]));
  const health = Math.max(0, Math.min(100, Math.round((num(rep.connRateYest) * .55) + (Math.min(num(rep.meetings?.mtd), 20) / 20 * 30) + (arr(rep.stuck).length ? 0 : 15))));
  return <div className="stack rep-page">
    <section className="rep-profile" style={{ '--rep': rep.color || '#13a466' }}><div><Avatar rep={rep}/><span><h2>{rep.name}</h2><p>Acquisition rep · Performance and follow-up workspace</p></span></div><div className="health"><span>Execution health</span><strong>{health}</strong><i><em style={{ width: `${health}%` }}/></i></div></section>
    <PeriodBreakdown title="Performance Breakdown" subtitle="Activities, pipeline and revenue split by Yesterday, Month to Date and Year to Date" periods={periods} />
    <MarketNews data={data} />
    <LeadWorkspace data={data} rep={rep} all={allLeads} online={online} offline={offline} openRows={openRows} />
    <CoachingWorkspace rep={rep} openRows={openRows} />
    <DealsWorkspace data={data} rep={rep} openRows={openRows} />
    <RankCoverageWorkspace rep={rep} openRows={openRows} />
  </div>;
}

function LeadWorkspace({ data, rep, all, online, offline, openRows }) {
  const [filter, setFilter] = useState('all');
  const summary = arr(data.outreachCoverage?.byRep).find(item => slug(item.name) === slug(rep.name)) || {};
  const allCount = all.length || nestedNumber(summary, ['contacts.notContacted','notContacted','contacts.noConnected']) || 0;
  const onlineCount = online.length || nestedNumber(summary, ['sourceSplit.online.notContacted','online.notContacted','contacts.onlineNotContacted']) || 0;
  const offlineCount = offline.length || nestedNumber(summary, ['sourceSplit.offline.notContacted','offline.notContacted','contacts.offlineNotContacted']) || 0;
  const rows = filter === 'online' ? online : filter === 'offline' ? offline : all;
  const total = filter === 'online' ? onlineCount : filter === 'offline' ? offlineCount : allCount;
  return <Card title="Leads Requiring Contact" icon="☎" action={<button className="text-button" onClick={() => openRows(`${filter === 'all' ? 'No connected calls' : `${filter} leads not contacted`} — ${rep.name}`, `${rows.length} exported rows · ${total} summary count`, rows, 'The summary count exists, but row-level records were not exported.')}>View all {total}</button>}>
    <div className="contact"><PMetric tone="blue" value={onlineCount} label="Online not contacted" click={() => setFilter('online')}/><PMetric tone="amber" value={offlineCount} label="Offline not contacted" click={() => setFilter('offline')}/><PMetric tone="red" value={allCount} label="No connected calls" click={() => setFilter('all')}/></div>
    <div className="toolbar"><b>Top 8 exported records</b><Segment value={filter} options={['all','online','offline']} onChange={setFilter} /></div>
    {rows.length ? <Table stickyFirst heads={['Lead','Source','Country','Age','Status']} rows={rows.slice(0, 8).map(row => [<RecordLink row={row}/>, <Badge tone={sourceKind(row) === 'online' ? 'blue' : sourceKind(row) === 'offline' ? 'amber' : 'gray'}>{txt(first(row, ['sourceBucket','source','originalSource','leadSource']), 'Unknown')}</Badge>, rowCountry(row), rowAge(row), <Badge tone="red">No connected call</Badge>])} /> : <Empty text="No row-level records were exported for this selection."/>}
  </Card>;
}

function CoachingWorkspace({ rep, openRows }) {
  const actions = arr(rep.needsAttention).map(row => ({ ...row, _type: 'No next activity' }));
  const all = [...actions, ...arr(rep.cold).map(row => ({ ...row, _type: 'Cold deal' })), ...arr(rep.stuck).map(row => ({ ...row, _type: 'Stuck deal' }))];
  return <Card title="Rep Coaching & Required Actions" icon="✦" action={<button className="text-button" onClick={() => openRows(`Coaching actions — ${rep.name}`, 'All exported coaching and risk signals.', all, 'No coaching records were exported.')}>View all {all.length}</button>}>
    <div className="tiles four"><Tile value={actions.length} label="No next activity" tone="red"/><Tile value={arr(rep.cold).length} label="Cold deals" tone="amber"/><Tile value={arr(rep.stuck).length} label="Stuck deals" tone="red"/><Tile value={actions.length} label="No future task" tone="purple"/></div>
    <div className="priority-list">{actions.slice(0, 5).map((row, index) => <ActionRow key={index} row={row} index="!"/>)}{!actions.length && <Empty text="No immediate coaching actions in this refresh."/>}</div>
  </Card>;
}

function DealsWorkspace({ data, rep, openRows }) {
  const [tab, setTab] = useState('open');
  const groups = {
    open: arr(rep.topDeals),
    won: arr(data.closedWon).filter(row => ownerMatch(row, rep.name)),
    lost: arr(data.closedLost).filter(row => ownerMatch(row, rep.name)),
    cold: arr(rep.cold),
    stuck: arr(rep.stuck),
    noFuture: arr(rep.needsAttention)
  };
  const labels = { open: 'Open', won: 'Won', lost: 'Lost', cold: 'Cold', stuck: 'Stuck', noFuture: 'No Future Task' };
  const tones = { open: 'blue', won: 'green', lost: 'red', cold: 'amber', stuck: 'red', noFuture: 'purple' };
  const rows = groups[tab];
  return <Card title="Deals Workspace" icon="⇄" action={<button className="text-button" onClick={() => openRows(`${labels[tab]} deals — ${rep.name}`, 'All matching exported deals.', rows, 'No records were exported for this view.')}>View all {rows.length}</button>}>
    <div className="workspace-tabs">{Object.keys(labels).map(key => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}><span>{labels[key]}</span><b>{groups[key].length}</b></button>)}</div>
    {rows.length ? <Table stickyFirst heads={['Deal','Stage','Next activity','Date / age','Amount','Status']} rows={rows.slice(0, 10).map(row => [<RecordLink row={row}/>, txt(first(row, ['stage','dealstage'])), txt(first(row, ['nextActivityDate','next_activity_date'])), rowDate(row) !== '—' ? rowDate(row) : rowAge(row), money(first(row, ['amount'])), <Badge tone={tones[tab]}>{labels[tab]}</Badge>])} /> : <Empty text={`No ${labels[tab].toLowerCase()} deal records.`}/>} 
  </Card>;
}

const countryKey = value => txt(value, 'Unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
const rankRows = (rep, rank) => {
  const lists = rank === 'A'
    ? [...arr(rep.rankAUntouched), ...arr(rep.rankAContactedList), ...arr(rep.rankACompanies)]
    : [...arr(rep.rankBUntouched), ...arr(rep.rankBContactedList), ...arr(rep.rankBCompanies)];
  const seen = new Set();
  return lists.filter(row => {
    const key = `${humanName(row).toLowerCase()}|${countryKey(rowCountry(row))}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const rankCountries = rep => {
  const map = new Map();
  const add = value => { const country = txt(value, 'Unknown'); if (country !== 'Unknown') map.set(countryKey(country), country); };
  ['rankAUntouched','rankBUntouched','rankAContactedList','rankBContactedList','rankACompanies','rankBCompanies'].forEach(key => arr(rep[key]).forEach(row => add(rowCountry(row))));
  ['rankAByCountry','rankBByCountry','rankByCountry','countryBreakdown','rankCoverageByCountry'].forEach(key => Object.keys(rep[key] || {}).forEach(add));
  return [...map.values()].sort((a, b) => a.localeCompare(b));
};
const countryObject = (object, country) => Object.entries(object || {}).find(([key]) => countryKey(key) === countryKey(country))?.[1] || null;
const rankMeetingCount = (rep, rank, country = 'all') => {
  const keys = rank === 'A'
    ? ['rankAMeetingsCompleted','rankACompletedMeetings','rankAMeetings','meetingsCompletedA','completedMeetingsA']
    : ['rankBMeetingsCompleted','rankBCompletedMeetings','rankBMeetings','meetingsCompletedB','completedMeetingsB'];
  if (country === 'all') {
    const explicit = maybeNumber(rep, keys);
    if (explicit !== null) return explicit;
  }
  const meetingRows = ['completedMeetings','meetingsCompleted','meetingsList','completedMeetingsList','activities','activityRows'].flatMap(key => arr(rep[key]));
  const matched = meetingRows.filter(row => {
    const rowRank = txt(first(row, ['rank','companyRank','company_rank','tier']), '').toUpperCase().replace('RANK ', '');
    if (rowRank && rowRank !== rank) return false;
    if (country !== 'all' && countryKey(rowCountry(row)) !== countryKey(country)) return false;
    const outcome = txt(first(row, ['hs_meeting_outcome','meetingOutcome','outcome','status']), '').toLowerCase();
    return outcome.includes('complete') || first(row, ['completedMeetingDate','lastCompletedMeetingDate']);
  });
  return matched.length ? matched.length : null;
};
const rankStats = (rep, rank, country = 'all') => {
  const totalKey = rank === 'A' ? 'rankA' : 'rankB';
  const contactedKey = rank === 'A' ? 'rankAContacted' : 'rankBContacted';
  const notKey = rank === 'A' ? 'rankANotContacted' : 'rankBNotContacted';
  const untouched = rank === 'A' ? arr(rep.rankAUntouched) : arr(rep.rankBUntouched);
  if (country === 'all') {
    const total = maybeNumber(rep, [totalKey]);
    const notContacted = maybeNumber(rep, [notKey]) ?? untouched.length;
    const contacted = maybeNumber(rep, [contactedKey]) ?? (total !== null ? Math.max(0, total - notContacted) : null);
    return { total, contacted, meetings: rankMeetingCount(rep, rank), notContacted };
  }
  const sourceCandidates = [countryObject(rep[rank === 'A' ? 'rankAByCountry' : 'rankBByCountry'], country), countryObject(rep.countryBreakdown, country), countryObject(rep.rankCoverageByCountry, country)].filter(Boolean);
  const source = sourceCandidates[0] || {};
  const total = maybeNumber(source, [totalKey, rank, `total${rank}`, `totalRank${rank}`, 'total']);
  const notRows = untouched.filter(row => countryKey(rowCountry(row)) === countryKey(country));
  const notContacted = maybeNumber(source, [notKey, `notContacted${rank}`, `untouched${rank}`, 'notContacted']) ?? (notRows.length ? notRows.length : null);
  const contacted = maybeNumber(source, [contactedKey, `contacted${rank}`, `touched${rank}`, 'contacted']) ?? (total !== null && notContacted !== null ? Math.max(0, total - notContacted) : null);
  const meetings = maybeNumber(source, [rank === 'A' ? 'rankAMeetingsCompleted' : 'rankBMeetingsCompleted', 'meetingsCompleted','completedMeetings']) ?? rankMeetingCount(rep, rank, country);
  return { total, contacted, meetings, notContacted };
};

function RankCoverageWorkspace({ rep, openRows }) {
  const [rank, setRank] = useState('A');
  const countries = useMemo(() => rankCountries(rep), [rep]);
  const [country, setCountry] = useState('all');
  useEffect(() => { setCountry('all'); setRank('A'); }, [rep.name]);
  const stats = rankStats(rep, rank, country);
  const untouchedAll = rank === 'A' ? arr(rep.rankAUntouched) : arr(rep.rankBUntouched);
  const untouched = untouchedAll.filter(row => country === 'all' || countryKey(rowCountry(row)) === countryKey(country));
  const countryRows = (country === 'all' ? countries : [country]).map(name => ({ country: name, a: rankStats(rep, 'A', name), b: rankStats(rep, 'B', name) }));
  return <Card title="Rank A/B Coverage Intelligence" icon="◎" action={<button className="text-button" onClick={() => openRows(`Rank ${rank} not contacted — ${rep.name}`, `${country === 'all' ? 'All countries' : country}`, untouched, 'No untouched account records were exported.')}>View all {untouched.length}</button>}>
    <div className="rank-toolbar"><Segment value={rank} options={['A','B']} labels={{ A: 'Rank A', B: 'Rank B' }} onChange={setRank} /><label>Country<select value={country} onChange={event => setCountry(event.target.value)}><option value="all">All countries</option>{countries.map(name => <option key={name} value={name}>{name}</option>)}</select></label><Badge tone="green">{countries.length} countries</Badge></div>
    <div className="rank-active-grid"><Tile value={formatNumber(stats.total)} label={`Rank ${rank} total`} tone={rank === 'A' ? 'red' : 'amber'} note={country === 'all' ? 'All countries' : country}/><Tile value={formatNumber(stats.contacted)} label="Contacted" tone="green" note={stats.contacted === null ? 'Not exported' : 'Contact established'}/><Tile value={formatNumber(stats.meetings)} label="Meetings completed" tone="purple" note={stats.meetings === null ? 'Not exported' : 'Completed outcomes'}/><Tile value={formatNumber(stats.notContacted)} label="Not contacted" tone={rank === 'A' ? 'red' : 'amber'} note={stats.notContacted === null ? 'Not exported' : 'Requires outreach'}/></div>
    <Table stickyFirst minWidth={980} heads={['Country','A total','A contacted','A meetings','A not contacted','B total','B contacted','B meetings','B not contacted']} rows={countryRows.length ? countryRows.map(row => [row.country, formatNumber(row.a.total), formatNumber(row.a.contacted), formatNumber(row.a.meetings), formatNumber(row.a.notContacted), formatNumber(row.b.total), formatNumber(row.b.contacted), formatNumber(row.b.meetings), formatNumber(row.b.notContacted)]) : [['No country data','—','—','—','—','—','—','—','—']]} />
    <div className="rank-account-heading"><div><h4>Rank {rank} not contacted accounts</h4><p>Top 8 exported accounts for {country === 'all' ? 'all countries' : country}</p></div></div>
    <div className="rank-account-list">{untouched.slice(0, 8).map((row, index) => <div className="rank-account-row" key={index}><RecordLink row={row}/><span>{rowCountry(row)}</span><Badge tone={rank === 'A' ? 'red' : 'amber'}>Rank {rank}</Badge></div>)}{!untouched.length && <Empty text="No untouched accounts for this selection."/>}</div>
  </Card>;
}

function FinancialPage({ data }) {
  const details = data.financialDetails || {}, summary = details.summary || {}, cash = arr(details.cashing), signed = arr(details.signed), missing = arr(details.missingFinancials), delayed = signed.filter(row => num(row.daysFromSigned) > 7 || txt(row.riskLabel || row.status, '').toLowerCase().includes('delayed'));
  const cashAmount = num(summary.cashingRevenue) || cash.reduce((sum, row) => sum + num(row.amount), 0);
  const signedAmount = num(summary.signedRevenue) || signed.reduce((sum, row) => sum + num(row.amount), 0);
  return <div className="stack"><section className="fin-hero"><i>$</i><span><h2>Acquisition Financial Details</h2><p>YTD · {cash.length} cashing · {signed.length} signed · {delayed.length} delayed</p></span></section><Card title="Financial Summary" icon="$" action={<Badge tone="green">YTD</Badge>}><div className="financial"><Metric tone="green" value={money(cashAmount)} label="Cashing Revenue" note={`${cash.length} closed won`}/><Metric tone="amber" value={money(signedAmount)} label="Signed Contract" note={`${signed.length} contract sent`}/><Metric tone="blue" value={money(num(summary.pendingToCash) || signedAmount)} label="Pending to Cash" note="Signed deals waiting"/><Metric tone="red" value={delayed.length} label="Delayed Signed" note="More than 7 days"/></div></Card><div className="grid"><FinancialTable title="Cashing" rows={cash} tone="green"/><FinancialTable title="Signed" rows={signed} tone="amber"/></div><FinancialTable title="Missing Financial Data" rows={missing} tone="red"/></div>;
}
function FinancialTable({ title, rows, tone }) { return <Card title={title} icon="$" action={<Badge tone={tone}>{rows.length}</Badge>}><Table stickyFirst heads={['Deal','Rep','Stage','Date','Days','Amount']} rows={rows.slice(0, 15).map(row => [<RecordLink row={row}/>, rowOwner(row), txt(row.riskLabel || row.status || row.stage || row.dealstage), rowDate(row), row.daysFromSigned !== undefined ? `${num(row.daysFromSigned)}d` : '—', money(row.amount)])} /></Card>; }

function Modal({ title, description, rows, empty, close }) {
  useEffect(() => {
    const handler = event => event.key === 'Escape' && close();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close]);
  return <div className="modal-bg" onMouseDown={event => event.target === event.currentTarget && close()}><div className="modal"><div className="modal-head"><span><h2>{title}</h2><p>{description}</p></span><button onClick={close}>×</button></div><div className="modal-body">{rows.length ? rows.map((row, index) => <div className="modal-row" key={index}><b>{index + 1}</b><span><RecordLink row={row}/><small>{[txt(row._type, ''), rowOwner(row), rowCountry(row), rowDate(row)].filter(value => value && value !== '—').join(' · ')}</small></span><strong>{first(row, ['amount']) !== undefined ? money(first(row, ['amount'])) : rowAge(row)}</strong></div>) : <Empty text={empty || 'No rows found.'}/>}</div></div></div>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
