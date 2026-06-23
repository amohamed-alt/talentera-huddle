const { useEffect, useMemo, useRef, useState } = React;

const LOGO = 'https://talimg1.b8cdn.com/wp-content/themes/talentera-2018/images/new-design/Talentera-ATS-white-logo.svg';
const HUBSPOT = 'https://app-eu1.hubspot.com';
const PORTAL = '145742477';
const DATA_SOURCES = location.pathname.includes('/react-preview/')
  ? ['../data.json', '/talentera-huddle/data.json']
  : ['./data.json', '/talentera-huddle/data.json'];

const arr = value => Array.isArray(value) ? value : [];
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const txt = (value, fallback = '—') => String(value ?? '').trim() || fallback;
const slug = value => txt(value, 'team').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const money = value => {
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
const rowName = row => txt(first(row, ['name','dealname','companyName','fullName','email','id','hs_object_id']), 'Unknown record');
const rowOwner = row => txt(first(row, ['ownerName','rep','owner','_owner','hubspot_owner_name','contactOwnerName']));
const rowCountry = row => txt(first(row, ['country','_country','companyCountry','countryName','hs_country']));
const rowAge = row => first(row, ['ageDays','days','daysWithoutContact','daysSinceCreated','daysSinceActivity']) === undefined ? '—' : `${num(first(row, ['ageDays','days','daysWithoutContact','daysSinceCreated','daysSinceActivity']))}d`;
const rowDate = row => first(row, ['closedate','stageDate','createdAt','createdate','lastActivityDate','nextActivityDate','signedDate','cashingDate']) ? String(first(row, ['closedate','stageDate','createdAt','createdate','lastActivityDate','nextActivityDate','signedDate','cashingDate'])).slice(0,10) : '—';
const objectType = row => first(row, ['dealId','deal_id','dealname','dealstage','amount']) ? '0-3' : first(row, ['companyId','company_id','domain','companyName']) ? '0-2' : '0-1';
const recordUrl = row => {
  const explicit = txt(first(row, ['hubspotUrl','url','recordUrl','hs_url','dealUrl','companyUrl','contactUrl']), '');
  if (/^https?:\/\//i.test(explicit)) return explicit;
  const id = String(first(row, ['dealId','deal_id','companyId','company_id','contactId','contact_id','vid','hs_object_id','recordId','objectId','id']) ?? '').match(/\d{5,}/)?.[0];
  const type = objectType(row);
  return id ? `${HUBSPOT}/contacts/${PORTAL}/record/${type}/${id}` : `${HUBSPOT}/contacts/${PORTAL}/objects/${type}/views/all/list?query=${encodeURIComponent(rowName(row))}`;
};
const sourceKind = row => {
  const source = txt(first(row, ['sourceBucket','source','originalSource','leadSource','hs_analytics_source','channel','type']), '').toLowerCase();
  if (['online','inbound','website','form','organic','paid','social','referral'].some(x => source.includes(x))) return 'online';
  if (['offline','outbound','manual','import','event','cold','prospect'].some(x => source.includes(x))) return 'offline';
  return 'unknown';
};
const ownerMatch = (row, name) => {
  const expected = txt(name, '').toLowerCase();
  const actual = rowOwner(row).toLowerCase();
  return actual === expected || actual.split(' ')[0] === expected.split(' ')[0];
};
const statusTone = rate => rate >= 50 ? 'green' : rate >= 30 ? 'amber' : 'red';

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

  const go = next => { location.hash = next; setPage(next); setMobile(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const openRows = (title, description, rows, empty) => setModal({ title, description, rows, empty });

  if (!data && loading) return <StatePanel loading />;
  if (!data) return <StatePanel error={error} retry={refresh} />;
  const reps = arr(data.repData);
  const currentRep = reps.find(rep => page === `rep/${slug(rep.name)}`);
  const title = page === 'financial' ? 'Acquisition Financials' : currentRep ? currentRep.name : 'Acquisition Command Center';
  const subtitle = currentRep ? `${txt(data.meta?.yesterdayLabel)} · Acquisition rep page` : page === 'financial' ? 'YTD · Cashing, signed deals and missing financial data' : `Updated ${txt(data.meta?.generatedAt, 'latest refresh')} · Team overview, pipeline, leads and rep execution`;

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
      <Label>Main</Label><Nav active={page==='team'} icon="▦" onClick={() => go('team')}>Acquisition</Nav><Nav active={page==='financial'} icon="$" onClick={() => go('financial')}>Financial</Nav>
      <Label>External</Label><a className="nav" href="https://amohamed-alt.github.io/talentera-retention/" target="_blank"><i>◉</i><span>Retention</span><em>↗</em></a><a className="nav" href="#" onClick={e=>e.preventDefault()}><i>↗</i><span>P&amp;L</span><em>↗</em></a>
      <Label>Reps</Label>{arr(data.repData).map(rep => <Nav key={rep.name} active={page===`rep/${slug(rep.name)}`} icon={<Avatar rep={rep} small/>} alert={rep.type!=='view' && (num(rep.connRateYest)<30 || arr(rep.stuck).length || arr(rep.cold).length>3)} onClick={() => go(`rep/${slug(rep.name)}`)}>{rep.name}</Nav>)}
    </nav>
    <div className="user"><b>SM</b><span><strong>Sales Manager</strong><small>Admin · Riyadh</small></span></div>
  </aside>{open && <button className="overlay" onClick={close}/> }</>;
}
function Label({children}){return <div className="nav-label">{children}</div>}
function Nav({active,icon,alert,onClick,children}){return <button className={`nav ${active?'active':''}`} onClick={onClick}><i>{icon}</i><span>{children}</span>{alert&&<em>!</em>}</button>}
function Avatar({rep,small}){return <b className={`avatar ${small?'small':''}`} style={{'--rep':rep.color||'#13a466'}}>{txt(rep.name,'?')[0]}</b>}

function Header({ title, subtitle, data, loading, refresh, go, openRows, menu }) {
  const [query,setQuery]=useState('');
  const search=()=>{const q=query.trim().toLowerCase();if(!q)return;const reps=arr(data.repData);const rows=[...arr(data.outreachCoverage?.contacts?.notContactedList),...reps.flatMap(r=>arr(r.topDeals).map(x=>({...x,ownerName:r.name}))),...arr(data.closedWon),...arr(data.closedLost)].filter(r=>JSON.stringify(r).toLowerCase().includes(q));openRows(`Search results (${rows.length})`,q,rows,'No matching acquisition records.');};
  return <><header><button className="icon mobile" onClick={menu}>☰</button><div className="search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&search()} placeholder="Search lead, deal, account, rep…"/><kbd>⌘ F</kbd></div><div className="actions"><button className="icon" onClick={()=>go('team')}>↗</button><button className="icon" onClick={refresh}>⟳</button><span className="live"><i/> Live · HubSpot</span><button className="primary" onClick={refresh}>{loading?'⟳':'↻'} Refresh Data</button></div></header><section className="hero"><div><h1>{title}</h1><p>{subtitle}</p></div><div><button className="primary" onClick={()=>go('financial')}>+ Open Financial Tab</button><button className="outline" onClick={()=>go('team')}>Open Data</button></div></section></>;
}
function Tabs({reps,page,go}){return <div className="tabs"><button className={page==='team'?'active':''} onClick={()=>go('team')}>⌂ Team Overview</button><button className={page==='financial'?'active':''} onClick={()=>go('financial')}>$ Financial</button>{reps.map(rep=><button key={rep.name} className={page===`rep/${slug(rep.name)}`?'active':''} onClick={()=>go(`rep/${slug(rep.name)}`)}><i style={{background:rep.color||'#13a466'}}/> {rep.name.split(' ')[0]}</button>)}</div>}

function TeamPage({data,openRows}){
  const reps=arr(data.repData).filter(r=>r.type!=='view'),contacts=data.outreachCoverage?.contacts||{},ranks=data.rankTotals||{};
  const deals=reps.flatMap(r=>[...arr(r.needsAttention).map(x=>({...x,ownerName:r.name,_type:'No next activity'})),...arr(r.stuck).map(x=>({...x,ownerName:r.name,_type:'Stuck deal'})),...arr(r.cold).map(x=>({...x,ownerName:r.name,_type:'Cold deal'}))]);
  const leadRows=arr(contacts.notContactedList),leadCount=num(contacts.notContacted)||leadRows.length,total=leadCount+deals.length;
  const rankUntouched=num(ranks.ANotContacted)+num(ranks.BNotContacted),risk=deals.length;
  return <div className="stack">
    <section className="focus"><label>Today’s executive focus</label><div>{[
      ['red',leadCount,'Leads need contact',`${num(contacts.total)} eligible total`,()=>openRows(`Leads not contacted (${leadCount})`,'Eligible leads with no connected call.',leadRows,'Summary count exists, but row records are not exported.')],
      ['amber',rankUntouched,'Rank A/B untouched',`${num(ranks.ANotContacted)}A · ${num(ranks.BNotContacted)}B`,()=>openRows('Rank A/B untouched','Accounts requiring outreach.',reps.flatMap(r=>[...arr(r.rankAUntouched),...arr(r.rankBUntouched)]))],
      ['purple',risk,'Deals at risk','Cold · stuck · no next',()=>openRows('Deals at risk','Operational risk signals.',deals)],
      ['green',`${num(contacts.contactedRate)}%`,'Contact rate',`${num(contacts.contacted)}/${num(contacts.total)} contacted`,()=>openRows('Contacted leads','Connected activity.',arr(contacts.contactedList))]
    ].map(([tone,value,label,note,click])=><Metric key={label} tone={tone} value={value} label={label} note={note} click={click}/>)}</div></section>
    <Card title="Priority Leads & SLA Breaches" icon="◎" action={<Badge tone="red">{total} actions</Badge>}><div className="priority-metrics"><PMetric tone="red" value={leadCount} label="Lead actions" click={()=>openRows(`Lead actions (${leadCount})`,`${leadRows.length} row-level records exported`,leadRows,'Summary count exists, but row records are not exported.')}/><PMetric tone="amber" value={deals.length} label="Deal actions" click={()=>openRows(`Deal actions (${deals.length})`,'Cold, stuck and no-next-activity deals.',deals)}/><PMetric tone="purple" value={total} label="Total priority" click={()=>openRows(`Total priority (${total})`,'All available priority rows.',[...leadRows,...deals])}/></div><div className="rows">{[...leadRows,...deals].slice(0,7).map((row,i)=><Row key={i} row={row} index={i+1}/>)}</div></Card>
    <div className="grid core"><Card title="Team Activity" icon="▥" action={<Badge tone="blue">Yesterday</Badge>}><ActivityChart reps={reps}/></Card><Card title="Pipeline Stages" icon="◌" action={<Badge tone="green">Open pipeline</Badge>}><PipelineChart stages={arr(data.stageData)}/></Card></div>
    <Scoreboard reps={reps}/>
    <div className="grid"><Coverage data={data}/><RankCoverage data={data}/></div>
    <Brief data={data}/><DealMovement data={data}/>
  </div>;
}
function Metric({tone,value,label,note,click}){return <button className={`metric ${tone}`} onClick={click}><strong>{typeof value==='number'?value.toLocaleString():value}</strong><b>{label}</b><small>{note}</small></button>}
function PMetric({tone,value,label,click}){return <button className={`pmetric ${tone}`} onClick={click}><strong>{value.toLocaleString()}</strong><span>{label}</span></button>}
function Row({row,index}){return <div className="row"><b>{index}</b><span><a href={recordUrl(row)} target="_blank">{rowName(row)} ↗</a><small>{txt(row._type)} · {rowOwner(row)}</small></span><strong>{first(row,['amount'])!==undefined?money(first(row,['amount'])):rowAge(row)}</strong></div>}

function Card({title,icon,action,children,className=''}){return <section className={`card ${className}`}><div className="card-head"><div><i>{icon}</i><h3>{title}</h3></div>{action}</div>{children}</section>}
function Badge({tone,children}){return <span className={`badge ${tone}`}>{children}</span>}
function ActivityChart({reps}){const ref=useRef(null);useEffect(()=>{const chart=new Chart(ref.current,{type:'bar',data:{labels:reps.map(r=>r.name.split(' ')[0]),datasets:[{label:'Calls',data:reps.map(r=>num(r.calls?.yest)),backgroundColor:'rgba(56,120,232,.16)',borderColor:'#3878e8',borderWidth:2,borderRadius:8},{label:'Connected',data:reps.map(r=>num(r.calls?.yestConn)),backgroundColor:'rgba(19,164,102,.16)',borderColor:'#13a466',borderWidth:2,borderRadius:8}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{usePointStyle:true,boxWidth:8,font:{size:10}}}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:'rgba(43,82,63,.06)'}}}}});return()=>chart.destroy()},[reps]);return <div className="chart"><canvas ref={ref}/></div>}
function PipelineChart({stages}){const ref=useRef(null),open=stages.filter(s=>!['closedwon','closedlost'].includes(txt(s.id,'').toLowerCase())&&num(s.count)>0),colors=['#13a466','#3878e8','#0f97a0','#7b58d8','#db8a12','#df4037'];useEffect(()=>{const chart=new Chart(ref.current,{type:'doughnut',data:{labels:open.map(s=>txt(s.label||s.id)),datasets:[{data:open.map(s=>num(s.count)),backgroundColor:colors,borderColor:'#fff',borderWidth:3}]},options:{responsive:true,maintainAspectRatio:false,cutout:'72%',plugins:{legend:{display:false}}}});return()=>chart.destroy()},[stages]);return <div className="donut"><div><canvas ref={ref}/></div><ul>{open.map((s,i)=><li key={txt(s.id)}><i style={{background:colors[i%colors.length]}}/><span>{txt(s.label||s.id)}</span><b>{num(s.count)}</b></li>)}</ul></div>}
function Scoreboard({reps}){return <Card title="Team Scoreboard" icon="♙" action={<Badge tone="blue">Yesterday + MTD</Badge>}><Table heads={['Rep','Calls','Connected','Conn. rate','Meetings','Leads Yest.','Leads MTD','Open','Pipeline','Won MTD','Status']} rows={reps.map(r=>[<span className="rep-cell"><Avatar rep={r} small/><a href={`#rep/${slug(r.name)}`}>{r.name}</a></span>,num(r.calls?.yest),<em className="good">{num(r.calls?.yestConn)}</em>,<Rate value={num(r.connRateYest)}/>,num(r.meetings?.yest),num(r.leadsYest),num(r.leadsMTD),num(r.openDeals),money(r.pipeAmt),<em className="good">{money(r.wonAmt)}</em>,<Badge tone={statusTone(num(r.connRateYest))}>{num(r.connRateYest)>=50?'Healthy':num(r.connRateYest)>=30?'Watch':'At Risk'}</Badge>])}/></Card>}
function Rate({value}){const tone=statusTone(value),color=tone==='green'?'#13a466':tone==='amber'?'#db8a12':'#df4037';return <span className="rate"><b style={{color}}>{value}%</b><i><em style={{width:`${Math.min(value,100)}%`,background:color}}/></i></span>}
function Table({heads,rows}){return <div className="table"><table><thead><tr>{heads.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>)}</tbody></table></div>}
function Coverage({data}){const c=data.outreachCoverage?.contacts||{},s=data.outreachCoverage?.sourceSplit||{},on=s.online||{},off=s.offline||{},rate=num(c.contactedRate),onr=num(on.total)?Math.round(num(on.contacted)/num(on.total)*100):0,offr=num(off.total)?Math.round(num(off.contacted)/num(off.total)*100):0;return <Card title="Lead Outreach Coverage" icon="☎" action={<Badge tone="green">Live coverage</Badge>}><div className="tiles"><Tile value={num(c.notContacted)} label="Not contacted" tone="red"/><Tile value={`${rate}%`} label="Contact rate"/><Tile value={num(c.total)} label="Eligible leads"/></div><div className="bars"><BarRow label="Overall contact rate" value={rate}/><BarRow label="Online / inbound" value={onr} color="#3878e8"/><BarRow label="Offline / outbound" value={offr} color="#db8a12"/></div></Card>}
function Tile({value,label,tone}){return <div className="tile"><strong className={tone}>{typeof value==='number'?value.toLocaleString():value}</strong><span>{label}</span></div>}
function BarRow({label,value,color}){const c=color||(value>=70?'#13a466':value>=40?'#db8a12':'#df4037');return <div className="bar"><span>{label}<b style={{color:c}}>{value}%</b></span><i><em style={{width:`${Math.min(value,100)}%`,background:c}}/></i></div>}
function RankCoverage({data}){const reps=arr(data.repData).filter(r=>r.type!=='view'),stats=reps.map(r=>{const a=num(r.rankA),b=num(r.rankB),au=num(r.rankANotContacted)||arr(r.rankAUntouched).length,bu=num(r.rankBNotContacted)||arr(r.rankBUntouched).length;return{ac:num(r.rankAContacted)||Math.max(0,a-au),au,bc:num(r.rankBContacted)||Math.max(0,b-bu),bu}}),t=stats.reduce((x,y)=>({ac:x.ac+y.ac,au:x.au+y.au,bc:x.bc+y.bc,bu:x.bu+y.bu}),{ac:0,au:0,bc:0,bu:0}),gaps=arr(data.topInactiveRankAccounts).slice(0,3);return <Card title="Rank A/B Coverage" icon="◎" action={<Badge tone="purple">Coverage summary</Badge>}><div className="rank-grid"><Tile value={t.ac} label="A contacted"/><Tile value={t.au} label="A untouched" tone="red"/><Tile value={t.bc} label="B contacted"/><Tile value={t.bu} label="B untouched" tone="amber"/></div><h4>Top coverage gaps</h4><div className="rows compact">{gaps.map((r,i)=><div className="row" key={i}><b className={`rank ${txt(r.rank,'B').toLowerCase()}`}>{txt(r.rank,'B')}</b><span><a href={recordUrl(r)} target="_blank">{rowName(r)} ↗</a><small>{rowCountry(r)} · {rowOwner(r)}</small></span><strong className="danger">{num(r.daysSinceActivity)>900?'Never':`${num(r.daysSinceActivity)}d`}</strong></div>)}</div></Card>}
function Brief({data}){const reps=arr(data.repData).filter(r=>r.type!=='view'),urgent=arr(data.autoRecs).filter(x=>['red','warn'].includes(txt(x.type,''))).slice(0,4),wins=arr(data.aiInsights?.quick_wins).slice(0,4),coach=reps.map(r=>({r,c:arr(r.needsAttention).length+arr(r.stuck).length})).filter(x=>x.c).sort((a,b)=>b.c-a.c).slice(0,4);return <Card title="Management Brief" icon="✦" action={<Badge tone="purple">AI + operational signals</Badge>}><div className="brief"><BriefCol tone="red" title="Needs attention" sub="Highest-priority risks">{urgent.map((x,i)=><p key={i}>• {txt(x.text)}</p>)}</BriefCol><BriefCol tone="green" title="Quick wins" sub="Recommended actions">{wins.map((x,i)=><p key={i}>• {txt(x)}</p>)}</BriefCol><BriefCol tone="purple" title="Rep follow-up" sub="Manager support">{coach.map(x=><button key={x.r.name} onClick={()=>location.hash=`rep/${slug(x.r.name)}`}><Avatar rep={x.r} small/><span><b>{x.r.name}</b><small>{x.c} attention signals</small></span>→</button>)}</BriefCol></div></Card>}
function BriefCol({tone,title,sub,children}){return <div className={`brief-col ${tone}`}><h4><i>{tone==='red'?'!':tone==='green'?'↗':'◎'}</i><span>{title}<small>{sub}</small></span></h4>{children}</div>}
function DealMovement({data}){const [tab,setTab]=useState('recent'),reps=arr(data.repData),won=arr(data.closedWon).map(x=>({...x,_move:'Won'})),lost=arr(data.closedLost).map(x=>({...x,_move:'Lost'})),risk=reps.flatMap(r=>[...arr(r.stuck).map(x=>({...x,ownerName:r.name,_move:'Stuck'})),...arr(r.cold).map(x=>({...x,ownerName:r.name,_move:'Cold'}))]),rows=tab==='won'?won:tab==='lost'?lost:tab==='risk'?risk:[...won.slice(0,5),...lost.slice(0,5)];return <Card title="Deal Movement" icon="⇄" action={<div className="segments">{['recent','won','lost','risk'].map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x}</button>)}</div>}><Table heads={['Deal','Owner','Movement','Date / age','Amount']} rows={rows.slice(0,12).map(r=>[<a href={recordUrl(r)} target="_blank">{rowName(r)} ↗</a>,rowOwner(r),<Badge tone={txt(r._move).includes('Won')?'green':txt(r._move).includes('Lost')||txt(r._move).includes('Stuck')?'red':'amber'}>{txt(r._move)}</Badge>,rowDate(r)!=='—'?rowDate(r):rowAge(r),money(first(r,['amount']))])}/></Card>}

function RepPage({data,rep,openRows}){const won=arr(data.closedWon).filter(x=>ownerMatch(x,rep.name)),lost=arr(data.closedLost).filter(x=>ownerMatch(x,rep.name)),allLeads=arr(data.outreachCoverage?.contacts?.notContactedList).filter(x=>ownerMatch(x,rep.name)),online=allLeads.filter(x=>sourceKind(x)==='online'),offline=allLeads.filter(x=>sourceKind(x)==='offline'),[filter,setFilter]=useState('all'),selected=filter==='online'?online:filter==='offline'?offline:allLeads;return <div className="stack"><section className="rep-hero" style={{'--rep':rep.color||'#13a466'}}><div><Avatar rep={rep}/><span><h2>{rep.name}</h2><p>Acquisition rep performance and follow-up</p></span></div><section>{[['Calls',num(rep.calls?.yest)],['Conn. rate',`${num(rep.connRateYest)}%`],['Meetings',num(rep.meetings?.yest)],['Open',num(rep.openDeals)],['Pipeline',money(rep.pipeAmt)],['Won MTD',num(rep.won)]].map(([l,v])=><b key={l}>{v}<small>{l}</small></b>)}</section></section><Kpis rep={rep}/><Card title="Online & Offline Leads Requiring Contact" icon="☎" action={<button className="outline small" onClick={()=>openRows(`No connected calls — ${rep.name}`,'Current exported rows.',allLeads,'Summary count exists, but rows are not exported.')}>Open all records</button>}><div className="contact"><PMetric tone="blue" value={online.length} label="Online not contacted" click={()=>setFilter('online')}/><PMetric tone="amber" value={offline.length} label="Offline not contacted" click={()=>setFilter('offline')}/><PMetric tone="red" value={allLeads.length} label="No connected calls" click={()=>setFilter('all')}/></div><div className="toolbar"><b>Preview records</b><div className="segments">{['all','online','offline'].map(x=><button key={x} className={filter===x?'active':''} onClick={()=>setFilter(x)}>{x}</button>)}</div></div><LeadTable rows={selected}/></Card><Coaching rep={rep}/><div className="grid"><Deals title="Won MTD" rows={won} tone="green"/><Deals title="Lost MTD" rows={lost} tone="red"/></div><Deals title="Open Deals" rows={arr(rep.topDeals)} tone="blue" table/><div className="three"><Deals title="Cold Deals" rows={arr(rep.cold)} tone="amber"/><Deals title="Stuck Deals" rows={arr(rep.stuck)} tone="red"/><Deals title="No Future Task" rows={arr(rep.needsAttention)} tone="purple"/></div><RepRanks rep={rep}/></div>}
function Kpis({rep}){const ps=[['Yesterday',rep.calls?.yest,rep.calls?.yestConn,rep.connRateYest,rep.meetings?.yest,rep.leadsYest],['MTD',rep.calls?.mtd,rep.calls?.mtdConn,rep.connRateMTD,rep.meetings?.mtd,rep.leadsMTD],['YTD',rep.calls?.ytd,rep.calls?.ytdConn,rep.connRateYTD,rep.meetings?.ytd,rep.leadsYTD]];return <Card title={`${rep.name} — KPI Breakdown`} icon="▦"><div className="kpis">{ps.map(p=><div key={p[0]}><b>{p[0]}</b>{[['Calls',p[1]],['Connected',p[2]],['Conn. rate',`${num(p[3])}%`],['Meetings',p[4]],['Leads',p[5]],['Open deals',rep.openDeals],['Won',`${num(rep.won)} (${money(rep.wonAmt)})`]].map(x=><span key={x[0]}><strong>{x[1]}</strong><small>{x[0]}</small></span>)}</div>)}</div></Card>}
function LeadTable({rows}){return rows.length?<Table heads={['Lead','Source','Country','Age','Status']} rows={rows.slice(0,12).map(r=>[<a href={recordUrl(r)} target="_blank">{rowName(r)} ↗</a>,<Badge tone={sourceKind(r)==='online'?'blue':sourceKind(r)==='offline'?'amber':'purple'}>{txt(first(r,['sourceBucket','source','originalSource','leadSource']),'Unknown')}</Badge>,rowCountry(r),rowAge(r),<Badge tone="red">No connected call</Badge>])}/>:<Empty text="No row-level records were exported for this selection."/>}
function Coaching({rep}){const items=arr(rep.needsAttention);return <Card title="Rep Coaching & Required Actions" icon="✦"><div className="tiles four"><Tile value={items.length} label="No next activity"/><Tile value={arr(rep.cold).length} label="Cold deals"/><Tile value={arr(rep.stuck).length} label="Stuck deals"/><Tile value={items.length} label="No future task"/></div><div className="rows">{items.slice(0,6).map((r,i)=><Row key={i} row={r} index="!"/>)}{!items.length&&<Empty text="No immediate coaching actions in this refresh."/>}</div></Card>}
function Deals({title,rows,tone,table}){return <Card title={title} icon={tone==='green'?'🏆':'⚠'} action={<Badge tone={tone}>{rows.length} · {money(rows.reduce((s,r)=>s+num(first(r,['amount'])),0))}</Badge>}>{table?<Table heads={['Deal','Stage','Next activity','Status','Amount']} rows={rows.map(r=>[<a href={recordUrl(r)} target="_blank">{rowName(r)} ↗</a>,txt(first(r,['stage','dealstage'])),txt(first(r,['nextActivityDate','next_activity_date'])),<Badge tone={r.isStuck?'red':r.isCold?'amber':'green'}>{r.isStuck?'Stuck':r.isCold?'Cold':'Open'}</Badge>,money(first(r,['amount']))])}/>:<div className="rows compact">{rows.slice(0,8).map((r,i)=><div className="row" key={i}><span><a href={recordUrl(r)} target="_blank">{rowName(r)} ↗</a><small>{rowOwner(r)} · {txt(first(r,['stage','dealstage']))}</small></span><strong>{money(first(r,['amount']))}</strong></div>)}{!rows.length&&<Empty text="No records."/>}</div>}</Card>}
function RepRanks({rep}){const a=num(rep.rankA),b=num(rep.rankB),au=num(rep.rankANotContacted)||arr(rep.rankAUntouched).length,bu=num(rep.rankBNotContacted)||arr(rep.rankBUntouched).length;return <Card title="Rank A/B Coverage" icon="◎"><div className="rank-grid six"><Tile value={a} label="Rank A" tone="red"/><Tile value={num(rep.rankAContacted)||Math.max(0,a-au)} label="A contacted"/><Tile value={au} label="A untouched" tone="red"/><Tile value={b} label="Rank B" tone="amber"/><Tile value={num(rep.rankBContacted)||Math.max(0,b-bu)} label="B contacted"/><Tile value={bu} label="B untouched" tone="amber"/></div><div className="grid ranks"><Deals title="Rank A Untouched" rows={arr(rep.rankAUntouched)} tone="red"/><Deals title="Rank B Untouched" rows={arr(rep.rankBUntouched)} tone="amber"/></div></Card>}
function Empty({text}){return <div className="empty">✓ {text}</div>}

function FinancialPage({data}){const d=data.financialDetails||{},s=d.summary||{},cash=arr(d.cashing),signed=arr(d.signed),missing=arr(d.missingFinancials),delayed=signed.filter(r=>num(r.daysFromSigned)>7||txt(r.riskLabel||r.status,'').toLowerCase().includes('delayed')),cashAmt=num(s.cashingRevenue)||cash.reduce((x,r)=>x+num(r.amount),0),signAmt=num(s.signedRevenue)||signed.reduce((x,r)=>x+num(r.amount),0);return <div className="stack"><section className="fin-hero"><i>$</i><span><h2>Acquisition Financial Details</h2><p>YTD · {cash.length} cashing · {signed.length} signed · {delayed.length} delayed</p></span></section><Card title="Financial Summary" icon="$" action={<Badge tone="green">YTD</Badge>}><div className="financial"><Metric tone="green" value={money(cashAmt)} label="Cashing Revenue" note={`${cash.length} closed won`}/><Metric tone="amber" value={money(signAmt)} label="Signed Contract" note={`${signed.length} contract sent`}/><Metric tone="blue" value={money(num(s.pendingToCash)||signAmt)} label="Pending to Cash" note="Signed deals waiting"/><Metric tone="red" value={delayed.length} label="Delayed Signed" note="More than 7 days"/></div></Card><div className="grid"><FinTable title="Cashing" rows={cash} tone="green"/><FinTable title="Signed" rows={signed} tone="amber"/></div><FinTable title="Missing Financial Data" rows={missing} tone="red"/></div>}
function FinTable({title,rows,tone}){return <Card title={title} icon="$" action={<Badge tone={tone}>{rows.length}</Badge>}><Table heads={['Deal','Rep','Stage','Date','Days','Amount']} rows={rows.slice(0,15).map(r=>[<a href={recordUrl(r)} target="_blank">{rowName(r)} ↗</a>,rowOwner(r),txt(r.riskLabel||r.status||r.stage||r.dealstage),rowDate(r),r.daysFromSigned!==undefined?`${num(r.daysFromSigned)}d`:'—',money(r.amount)])}/></Card>}

function Modal({title,description,rows,empty,close}){useEffect(()=>{const h=e=>e.key==='Escape'&&close();addEventListener('keydown',h);return()=>removeEventListener('keydown',h)},[]);return <div className="modal-bg" onMouseDown={e=>e.target===e.currentTarget&&close()}><div className="modal"><div className="modal-head"><span><h2>{title}</h2><p>{description}</p></span><button onClick={close}>×</button></div><div className="modal-body">{rows.length?rows.map((r,i)=><div className="modal-row" key={i}><b>{i+1}</b><span><a href={recordUrl(r)} target="_blank">{rowName(r)} ↗</a><small>{[txt(r._type,''),rowOwner(r),rowCountry(r),rowDate(r)].filter(x=>x&&x!=='—').join(' · ')}</small></span><strong>{first(r,['amount'])!==undefined?money(first(r,['amount'])):rowAge(r)}</strong></div>):<Empty text={empty||'No rows found.'}/>}</div></div></div>}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
