(() => {
  const { useMemo, useState } = React;
  const roots = new WeakMap();
  let dashboardData = null;
  let loadingPromise = null;

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const txt = (value, fallback = '—') => String(value ?? '').trim() || fallback;
  const first = (row, keys) => {
    const sources = [row, row?.properties, row?.fields, row?.propertyValues].filter(Boolean);
    for (const key of keys) for (const source of sources) {
      const value = source[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
  };
  const money = value => {
    const amount = num(value);
    if (Math.abs(amount) >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (Math.abs(amount) >= 1000) return `$${Math.round(amount / 1000)}K`;
    return `$${Math.round(amount).toLocaleString()}`;
  };
  const humanName = row => {
    const fullName = `${txt(first(row, ['firstname','firstName']), '')} ${txt(first(row, ['lastname','lastName']), '')}`.trim();
    const candidates = [
      first(row, ['dealname','dealName']),
      first(row, ['companyName','company','accountName']),
      first(row, ['fullName','contactName']),
      fullName,
      first(row, ['email','workEmail']),
      first(row, ['name','title']),
      first(row, ['id','hs_object_id'])
    ];
    return txt(candidates.find(value => txt(value, '')), 'Unknown deal');
  };
  const owner = row => txt(first(row, ['ownerName','rep','owner','_owner','hubspot_owner_name','contactOwnerName']));
  const date = row => {
    const value = first(row, ['closedate','stageDate','createdAt','createdate','lastActivityDate','nextActivityDate']);
    return value ? String(value).slice(0, 10) : '—';
  };
  const age = row => {
    const value = first(row, ['ageDays','days','daysSinceActivity','daysInStage']);
    return value === undefined ? '—' : `${num(value)}d`;
  };
  const recordUrl = row => {
    const explicit = first(row, ['hubspotUrl','url','recordUrl','dealUrl']);
    if (explicit && /^https?:\/\//i.test(String(explicit))) return String(explicit);
    const id = String(first(row, ['dealId','deal_id','hs_object_id','recordId','objectId','id']) || '').match(/\d{5,}/)?.[0];
    return id
      ? `https://app-eu1.hubspot.com/contacts/145742477/record/0-3/${id}`
      : `https://app-eu1.hubspot.com/contacts/145742477/objects/0-3/views/all/list?query=${encodeURIComponent(humanName(row))}`;
  };
  const lostReason = row => txt(first(row, [
    'hs_closed_lost_reason',
    'closed_lost_reason',
    'closedLostReason',
    'lost_reason',
    'lostReason',
    'deal_lost_reason',
    'dealLostReason',
    'reason_lost',
    'reasonLost',
    'closed_lost_reason_other',
    'lost_reason_other',
    'churn_reason',
    'reason'
  ]), 'Reason not provided');
  const riskType = row => txt(row._riskType || first(row, ['riskType','risk','status']), 'At risk');

  async function loadData() {
    if (dashboardData) return dashboardData;
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      for (const url of ['../data.json', '/talentera-huddle/data.json']) {
        try {
          const response = await fetch(`${url}?dealMovement=${Date.now()}`, { cache: 'no-store' });
          if (response.ok) {
            dashboardData = await response.json();
            return dashboardData;
          }
        } catch (error) {}
      }
      return null;
    })();
    return loadingPromise;
  }

  function Badge({ tone, children }) {
    return <span className={`dm7-badge ${tone}`}>{children}</span>;
  }

  function DealTable({ type, rows }) {
    const isLost = type === 'lost';
    const isRisk = type === 'risk';
    const headers = isLost
      ? ['Deal', 'Owner', 'Lost reason', 'Close date', 'Amount']
      : isRisk
        ? ['Deal', 'Owner', 'Risk type', 'Date / age', 'Amount']
        : ['Deal', 'Owner', 'Close date', 'Amount'];

    return <div className="dm7-table-wrap">
      <table className="dm7-table">
        <thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>
          {rows.length ? rows.map((row, index) => <tr key={`${humanName(row)}-${index}`}>
            <td><a href={recordUrl(row)} target="_blank" rel="noopener noreferrer">{humanName(row)} ↗</a></td>
            <td>{owner(row)}</td>
            {isLost && <td><Badge tone="red">{lostReason(row)}</Badge></td>}
            {isRisk && <td><Badge tone={riskType(row).toLowerCase().includes('stuck') ? 'red' : 'amber'}>{riskType(row)}</Badge></td>}
            <td>{date(row) !== '—' ? date(row) : age(row)}</td>
            <td>{money(first(row, ['amount']))}</td>
          </tr>) : <tr><td colSpan={headers.length} className="dm7-empty">No deals in this category.</td></tr>}
        </tbody>
      </table>
    </div>;
  }

  function LostReasonBreakdown({ lost }) {
    const breakdown = useMemo(() => {
      const map = new Map();
      lost.forEach(row => {
        const reason = lostReason(row);
        const current = map.get(reason) || { reason, count: 0, amount: 0 };
        current.count += 1;
        current.amount += num(first(row, ['amount']));
        map.set(reason, current);
      });
      return [...map.values()].sort((a, b) => b.amount - a.amount || b.count - a.count);
    }, [lost]);
    const totalAmount = breakdown.reduce((sum, item) => sum + item.amount, 0);

    return <div className="dm7-lost-breakdown">
      <div className="dm7-breakdown-head">
        <div><h4>Lost Reason Breakdown</h4><p>Count and lost amount grouped by closed-lost reason</p></div>
        <div className="dm7-breakdown-total"><strong>{lost.length}</strong><span>Lost deals</span><strong>{money(totalAmount)}</strong><span>Lost amount</span></div>
      </div>
      <div className="dm7-reason-grid">
        {breakdown.length ? breakdown.map(item => <article key={item.reason}>
          <span>{item.reason}</span>
          <strong>{item.count}</strong>
          <small>{money(item.amount)}</small>
          <i><em style={{ width: `${totalAmount ? Math.max(4, item.amount / totalAmount * 100) : 0}%` }}/></i>
        </article>) : <div className="dm7-empty">No lost reasons were exported.</div>}
      </div>
    </div>;
  }

  function DealMovementV7({ data }) {
    const [expanded, setExpanded] = useState({ won: false, lost: false, risk: false });
    const won = arr(data.closedWon).map(row => ({ ...row, _move: 'Won' }));
    const lost = arr(data.closedLost).map(row => ({ ...row, _move: 'Lost' }));
    const risk = arr(data.repData).flatMap(rep => [
      ...arr(rep.stuck).map(row => ({ ...row, ownerName: owner(row) === '—' ? rep.name : owner(row), _riskType: 'Stuck deal' })),
      ...arr(rep.cold).map(row => ({ ...row, ownerName: owner(row) === '—' ? rep.name : owner(row), _riskType: 'Cold deal' })),
      ...arr(rep.needsAttention).map(row => ({ ...row, ownerName: owner(row) === '—' ? rep.name : owner(row), _riskType: 'No next activity' }))
    ]);
    const sections = [
      { key: 'won', title: 'Won Deals', tone: 'green', rows: won },
      { key: 'lost', title: 'Lost Deals', tone: 'red', rows: lost },
      { key: 'risk', title: 'At-Risk Deals', tone: 'amber', rows: risk }
    ];

    return <section className="dm7-card">
      <div className="dm7-title"><div><span>⇄</span><div><h3>Deal Movement</h3><p>Won, lost and at-risk deals in separate operational views</p></div></div></div>
      <div className="dm7-summary">
        <div className="green"><strong>{won.length}</strong><span>Won deals</span><small>{money(won.reduce((sum, row) => sum + num(first(row, ['amount'])), 0))}</small></div>
        <div className="red"><strong>{lost.length}</strong><span>Lost deals</span><small>{money(lost.reduce((sum, row) => sum + num(first(row, ['amount'])), 0))}</small></div>
        <div className="amber"><strong>{risk.length}</strong><span>At-risk deals</span><small>{money(risk.reduce((sum, row) => sum + num(first(row, ['amount'])), 0))}</small></div>
      </div>
      {sections.map(section => <div className={`dm7-section ${section.tone}`} key={section.key}>
        <div className="dm7-section-head"><div><h4>{section.title}</h4><p>{section.rows.length} deals · {money(section.rows.reduce((sum, row) => sum + num(first(row, ['amount'])), 0))}</p></div><button onClick={() => setExpanded(value => ({ ...value, [section.key]: !value[section.key] }))}>{expanded[section.key] ? 'Show top 10' : `View all ${section.rows.length}`}</button></div>
        {section.key === 'lost' && <LostReasonBreakdown lost={lost} />}
        <DealTable type={section.key} rows={expanded[section.key] ? section.rows : section.rows.slice(0, 10)} />
      </div>)}
    </section>;
  }

  function findCard(title) {
    return [...document.querySelectorAll('.card')].find(card => card.querySelector(':scope > .card-head h3')?.textContent?.trim() === title);
  }

  function removeMissingFinancial() {
    document.querySelectorAll('.card').forEach(card => {
      const title = card.querySelector(':scope > .card-head h3')?.textContent?.trim();
      if (title === 'Missing Financial Data') card.remove();
    });
  }

  async function enhance() {
    removeMissingFinancial();
    const legacy = findCard('Deal Movement');
    if (!legacy || legacy.dataset.dm7Enhanced === 'true') return;
    const data = await loadData();
    if (!data || !legacy.isConnected) return;
    legacy.dataset.dm7Enhanced = 'true';
    legacy.style.display = 'none';
    const host = document.createElement('div');
    host.className = 'dm7-host';
    legacy.after(host);
    const root = ReactDOM.createRoot(host);
    roots.set(host, root);
    root.render(<DealMovementV7 data={data} />);
  }

  new MutationObserver(enhance).observe(document.getElementById('root') || document.documentElement, { childList: true, subtree: true });
  window.addEventListener('hashchange', () => setTimeout(enhance, 80));
  enhance();
  setTimeout(enhance, 500);
})();
