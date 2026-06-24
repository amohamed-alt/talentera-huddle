(() => {
  const { useMemo, useState } = React;
  const roots = new WeakMap();
  let dashboardData = null;
  let loadingPromise = null;

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const txt = (value, fallback = '—') => String(value ?? '').trim() || fallback;
  const slug = value => txt(value, 'rep').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const formatNumber = value => value === null || value === undefined ? '—' : Number(value).toLocaleString();
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
  const countryKey = value => txt(value, 'Unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
  const rowCountry = row => txt(first(row, ['country','companyCountry','company_country','countryName','hs_country']), 'Unknown');
  const normalOutcome = value => txt(value, 'UNKNOWN').toUpperCase().replace(/[\s-]+/g, '_');
  const outcomeLabel = value => {
    const outcome = normalOutcome(value);
    const labels = {
      COMPLETED: 'Completed',
      SCHEDULED: 'Scheduled',
      NO_SHOW: 'No show',
      CANCELLED: 'Canceled',
      CANCELED: 'Canceled',
      RESCHEDULED: 'Rescheduled',
      UNKNOWN: 'Unknown'
    };
    return labels[outcome] || outcome.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  };
  const outcomeTone = value => {
    const outcome = normalOutcome(value);
    if (outcome === 'COMPLETED') return 'green';
    if (outcome === 'SCHEDULED' || outcome === 'RESCHEDULED') return 'blue';
    if (outcome === 'NO_SHOW') return 'red';
    if (outcome === 'CANCELLED' || outcome === 'CANCELED') return 'amber';
    return 'gray';
  };
  const recordDate = row => {
    const value = first(row, ['date','activityDate','meetingDate','hs_timestamp','hs_meeting_start_time','createdAt','createdate']);
    return value ? String(value).slice(0, 10) : '—';
  };
  const meetingName = row => txt(first(row, ['meetingName','meetingTitle','hs_meeting_title','name','title']), 'Meeting');
  const companyName = row => txt(first(row, ['companyName','company','accountName']), 'Unknown company');
  const meetingUrl = row => {
    const explicit = txt(first(row, ['meetingUrl','hubspotUrl','url','recordUrl']), '');
    if (/^https?:\/\//i.test(explicit)) return explicit;
    const id = String(first(row, ['meetingId','id','hs_object_id']) || '').match(/\d{5,}/)?.[0];
    return id ? `https://app-eu1.hubspot.com/contacts/145742477/activity/${id}` : '#';
  };
  const companyUrl = row => {
    const explicit = txt(first(row, ['companyUrl']), '');
    if (/^https?:\/\//i.test(explicit)) return explicit;
    const id = String(first(row, ['companyId','company_id']) || '').match(/\d{5,}/)?.[0];
    return id ? `https://app-eu1.hubspot.com/contacts/145742477/record/0-2/${id}` : '#';
  };
  const meetingId = row => String(first(row, ['meetingId','id','hs_object_id']) || '');
  const companyId = row => String(first(row, ['companyId','company_id']) || '');

  async function loadData(force = false) {
    if (force) {
      dashboardData = null;
      loadingPromise = null;
    }
    if (dashboardData) return dashboardData;
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
      const urls = location.pathname.includes('/react-preview/')
        ? ['../data.json', '/talentera-huddle/data.json']
        : ['./data.json', '/talentera-huddle/data.json'];

      for (const url of urls) {
        try {
          const response = await fetch(`${url}?rankCoverage=${Date.now()}`, { cache: 'no-store' });
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

  function currentRep(data) {
    const match = location.hash.match(/^#rep\/(.+)$/);
    if (!match) return null;
    return arr(data?.repData).find(rep => slug(rep.name) === match[1]) || null;
  }

  function sameOwnerRow(row) {
    const meetingOwner = String(first(row, ['meetingOwnerId','meeting_owner_id','hubspot_owner_id','ownerId']) || '');
    const companyOwner = String(first(row, ['companyOwnerId','company_owner_id']) || '');
    return !meetingOwner || !companyOwner || meetingOwner === companyOwner;
  }

  function dedupeMeetingRows(rows) {
    const seen = new Set();
    return rows.filter(row => {
      if (!sameOwnerRow(row)) return false;
      const key = `${meetingId(row)}|${companyId(row)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function rankMeetingRows(rep, rank, country = 'all') {
    const explicit = rank === 'A' ? arr(rep.rankAMeetingRows) : arr(rep.rankBMeetingRows);
    const fallback = arr(rep.rankMeetingRows).filter(row =>
      txt(first(row, ['rank','companyRank','company_rank','tier']), '').toUpperCase().replace('RANK ', '') === rank
    );

    return dedupeMeetingRows(explicit.length ? explicit : fallback).filter(row =>
      country === 'all' || countryKey(rowCountry(row)) === countryKey(country)
    );
  }

  function uniqueMeetingCount(rows) {
    return new Set(rows.map(meetingId).filter(Boolean)).size;
  }

  function uniqueCompanyCount(rows) {
    return new Set(rows.map(companyId).filter(Boolean)).size;
  }

  function outcomeCounts(rows) {
    const counts = {};
    const seen = new Set();
    for (const row of rows) {
      const id = meetingId(row);
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      const outcome = normalOutcome(first(row, ['outcome','hs_meeting_outcome','meetingOutcome','status']));
      counts[outcome] = (counts[outcome] || 0) + 1;
    }
    return counts;
  }

  function outcomeSummary(outcomes) {
    const order = ['COMPLETED','SCHEDULED','NO_SHOW','RESCHEDULED','CANCELED','CANCELLED','UNKNOWN'];
    const entries = Object.entries(outcomes || {}).filter(([, count]) => num(count) > 0).sort(([a], [b]) => {
      const ai = order.indexOf(normalOutcome(a));
      const bi = order.indexOf(normalOutcome(b));
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    });
    return entries.length ? entries.map(([outcome, count]) => `${outcomeLabel(outcome)} ${formatNumber(count)}`).join(' · ') : 'No meetings';
  }

  function countriesFor(rep) {
    const countries = new Map();
    const add = value => {
      const country = txt(value, 'Unknown');
      if (country !== 'Unknown') countries.set(countryKey(country), country);
    };

    ['rankAUntouched','rankBUntouched','rankAMeetingRows','rankBMeetingRows','rankMeetingRows'].forEach(key =>
      arr(rep[key]).forEach(row => add(rowCountry(row)))
    );
    ['rankAByCountry','rankBByCountry','countryBreakdown','rankCoverageByCountry'].forEach(key =>
      Object.keys(rep[key] || {}).forEach(add)
    );

    return [...countries.values()].sort((a, b) => a.localeCompare(b));
  }

  function countrySource(rep, rank, country) {
    const sources = [
      rep[rank === 'A' ? 'rankAByCountry' : 'rankBByCountry'],
      rep.countryBreakdown,
      rep.rankCoverageByCountry
    ];
    for (const source of sources) {
      const found = Object.entries(source || {}).find(([key]) => countryKey(key) === countryKey(country));
      if (found) return found[1] || {};
    }
    return {};
  }

  function rankStats(rep, rank, country = 'all') {
    const rows = rankMeetingRows(rep, rank, country);
    const completedRows = rows.filter(row => normalOutcome(first(row, ['outcome','hs_meeting_outcome','meetingOutcome','status'])) === 'COMPLETED');
    const untouched = (rank === 'A' ? arr(rep.rankAUntouched) : arr(rep.rankBUntouched)).filter(row =>
      country === 'all' || countryKey(rowCountry(row)) === countryKey(country)
    );

    const totalKey = rank === 'A' ? 'rankA' : 'rankB';
    const contactedKey = rank === 'A' ? 'rankAContacted' : 'rankBContacted';
    const notKey = rank === 'A' ? 'rankANotContacted' : 'rankBNotContacted';
    const source = country === 'all' ? rep : countrySource(rep, rank, country);

    const total = maybeNumber(source, country === 'all'
      ? [totalKey]
      : [totalKey, rank, `total${rank}`, `totalRank${rank}`, 'total']);
    const notContacted = maybeNumber(source, country === 'all'
      ? [notKey]
      : [notKey, `notContacted${rank}`, `untouched${rank}`, 'notContacted']) ?? untouched.length;
    const contacted = maybeNumber(source, country === 'all'
      ? [contactedKey]
      : [contactedKey, `contacted${rank}`, `touched${rank}`, 'contacted']) ??
      (total !== null ? Math.max(0, total - notContacted) : null);

    const meetingsLogged = maybeNumber(source, [
      rank === 'A' ? 'rankAMeetingsLogged' : 'rankBMeetingsLogged',
      'meetingsLogged'
    ]) ?? uniqueMeetingCount(rows);
    const meetingsCompleted = maybeNumber(source, [
      rank === 'A' ? 'rankAMeetingsCompleted' : 'rankBMeetingsCompleted',
      'meetingsCompleted',
      'completedMeetings'
    ]) ?? uniqueMeetingCount(completedRows);
    const companiesReached = maybeNumber(source, [
      rank === 'A' ? 'rankACompaniesReached' : 'rankBCompaniesReached',
      'companiesReached'
    ]) ?? uniqueCompanyCount(completedRows);
    const companiesWithMeetings = maybeNumber(source, [
      rank === 'A' ? 'rankACompaniesWithMeetings' : 'rankBCompaniesWithMeetings',
      'companiesWithMeetings'
    ]) ?? uniqueCompanyCount(rows);
    const outcomes = source[rank === 'A' ? 'rankAMeetingOutcomes' : 'rankBMeetingOutcomes'] || source.meetingOutcomes || outcomeCounts(rows);

    return {
      total,
      contacted,
      notContacted,
      meetingsLogged,
      meetingsCompleted,
      companiesReached,
      companiesWithMeetings,
      outcomes,
      rows,
      untouched
    };
  }

  function Badge({ tone = 'gray', children }) {
    return <span className={`rcv2-badge ${tone}`}>{children}</span>;
  }

  function Metric({ value, label, note, tone }) {
    return <article className={`rcv2-metric ${tone || ''}`}>
      <strong>{formatNumber(value)}</strong>
      <span>{label}</span>
      <small>{note}</small>
    </article>;
  }

  function CompanyLink({ row }) {
    const url = companyUrl(row);
    return url === '#'
      ? <span className="rcv2-plain-link">{companyName(row)}</span>
      : <a href={url} target="_blank" rel="noopener noreferrer">{companyName(row)} ↗</a>;
  }

  function MeetingLink({ row }) {
    const url = meetingUrl(row);
    return url === '#'
      ? <span className="rcv2-plain-link">{meetingName(row)}</span>
      : <a href={url} target="_blank" rel="noopener noreferrer">{meetingName(row)} ↗</a>;
  }

  function RankCoverageV2({ rep }) {
    const [rank, setRank] = useState('A');
    const [country, setCountry] = useState('all');
    const [expandedMeetings, setExpandedMeetings] = useState(false);
    const [expandedUntouched, setExpandedUntouched] = useState(false);
    const countries = useMemo(() => countriesFor(rep), [rep]);
    const stats = rankStats(rep, rank, country);
    const countryRows = (country === 'all' ? countries : [country]).map(name => ({
      country: name,
      a: rankStats(rep, 'A', name),
      b: rankStats(rep, 'B', name)
    }));
    const shownMeetings = expandedMeetings ? stats.rows : stats.rows.slice(0, 8);
    const shownUntouched = expandedUntouched ? stats.untouched : stats.untouched.slice(0, 8);

    const changeRank = next => {
      setRank(next);
      setExpandedMeetings(false);
      setExpandedUntouched(false);
    };

    return <section className="rcv2-card">
      <div className="rcv2-head">
        <div className="rcv2-title">
          <i>◎</i>
          <div>
            <h3>Rank A/B Coverage Intelligence</h3>
            <p>{rep.name} · Meetings logged only when meeting owner matches company owner</p>
          </div>
        </div>
        <Badge tone="green">{formatNumber(stats.meetingsLogged)} meetings</Badge>
      </div>

      <div className="rcv2-toolbar">
        <div className="rcv2-segment">
          {['A','B'].map(value => <button key={value} className={rank === value ? 'active' : ''} onClick={() => changeRank(value)}>Rank {value}</button>)}
        </div>
        <label>Country
          <select value={country} onChange={event => setCountry(event.target.value)}>
            <option value="all">All countries</option>
            {countries.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <Badge tone="green">{countries.length} countries</Badge>
      </div>

      <div className="rcv2-metrics">
        <Metric value={stats.total} label={`Rank ${rank} total`} note={country === 'all' ? 'All countries' : country} tone={rank === 'A' ? 'red' : 'amber'} />
        <Metric value={stats.contacted} label="Contacted" note="Connected call or completed meeting" tone="green" />
        <Metric value={stats.companiesReached} label="Companies reached" note={`${formatNumber(stats.meetingsCompleted)} completed meetings`} tone="purple" />
        <Metric value={stats.meetingsLogged} label="Meetings logged" note={`${formatNumber(stats.companiesWithMeetings)} companies · all outcomes`} tone="blue" />
        <Metric value={stats.notContacted} label="Not contacted" note="Requires outreach" tone={rank === 'A' ? 'red' : 'amber'} />
      </div>

      <div className="rcv2-outcomes">
        {Object.entries(stats.outcomes || {}).filter(([, count]) => num(count) > 0).map(([outcome, count]) =>
          <Badge key={outcome} tone={outcomeTone(outcome)}>{outcomeLabel(outcome)} {formatNumber(count)}</Badge>
        )}
        {!Object.values(stats.outcomes || {}).some(count => num(count) > 0) && <Badge>No meeting outcomes</Badge>}
      </div>

      <div className="rcv2-table-wrap country-table">
        <table>
          <thead><tr>
            {['Country','A total','A contacted','A reached','A meetings','A outcomes','A not contacted','B total','B contacted','B reached','B meetings','B outcomes','B not contacted'].map(head => <th key={head}>{head}</th>)}
          </tr></thead>
          <tbody>
            {countryRows.length ? countryRows.map(row => <tr key={row.country}>
              <td>{row.country}</td>
              <td>{formatNumber(row.a.total)}</td>
              <td>{formatNumber(row.a.contacted)}</td>
              <td>{formatNumber(row.a.companiesReached)}</td>
              <td>{formatNumber(row.a.meetingsLogged)}</td>
              <td>{outcomeSummary(row.a.outcomes)}</td>
              <td>{formatNumber(row.a.notContacted)}</td>
              <td>{formatNumber(row.b.total)}</td>
              <td>{formatNumber(row.b.contacted)}</td>
              <td>{formatNumber(row.b.companiesReached)}</td>
              <td>{formatNumber(row.b.meetingsLogged)}</td>
              <td>{outcomeSummary(row.b.outcomes)}</td>
              <td>{formatNumber(row.b.notContacted)}</td>
            </tr>) : <tr><td colSpan="13" className="rcv2-empty">No country data exported.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="rcv2-section-head">
        <div><h4>Rank {rank} meetings logged</h4><p>Same meeting owner and company owner · {country === 'all' ? 'all countries' : country}</p></div>
        {stats.rows.length > 8 && <button onClick={() => setExpandedMeetings(value => !value)}>{expandedMeetings ? 'Show top 8' : `View all ${stats.rows.length}`}</button>}
      </div>

      <div className="rcv2-table-wrap">
        <table>
          <thead><tr><th>Company</th><th>Meeting</th><th>Outcome</th><th>Country</th><th>Date</th></tr></thead>
          <tbody>
            {shownMeetings.length ? shownMeetings.map((row, index) => <tr key={`${meetingId(row)}-${companyId(row)}-${index}`}>
              <td><CompanyLink row={row} /></td>
              <td><MeetingLink row={row} /></td>
              <td><Badge tone={outcomeTone(first(row, ['outcome','hs_meeting_outcome','meetingOutcome','status']))}>{outcomeLabel(first(row, ['outcome','hs_meeting_outcome','meetingOutcome','status']))}</Badge></td>
              <td>{rowCountry(row)}</td>
              <td>{recordDate(row)}</td>
            </tr>) : <tr><td colSpan="5" className="rcv2-empty">No same-owner meeting records for this selection.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="rcv2-section-head secondary">
        <div><h4>Rank {rank} not contacted accounts</h4><p>{country === 'all' ? 'All countries' : country}</p></div>
        {stats.untouched.length > 8 && <button onClick={() => setExpandedUntouched(value => !value)}>{expandedUntouched ? 'Show top 8' : `View all ${stats.untouched.length}`}</button>}
      </div>

      <div className="rcv2-account-list">
        {shownUntouched.length ? shownUntouched.map((row, index) => {
          const explicit = txt(first(row, ['hubspotUrl','companyUrl','url']), '');
          const id = String(first(row, ['companyId','id','hs_object_id']) || '').match(/\d{5,}/)?.[0];
          const url = /^https?:\/\//i.test(explicit) ? explicit : id ? `https://app-eu1.hubspot.com/contacts/145742477/record/0-2/${id}` : '#';
          const name = txt(first(row, ['companyName','name','accountName']), 'Unknown company');
          return <div key={`${name}-${index}`}>
            {url === '#' ? <span>{name}</span> : <a href={url} target="_blank" rel="noopener noreferrer">{name} ↗</a>}
            <small>{rowCountry(row)}</small>
            <Badge tone={rank === 'A' ? 'red' : 'amber'}>Rank {rank}</Badge>
          </div>;
        }) : <div className="rcv2-empty block">No untouched accounts for this selection.</div>}
      </div>
    </section>;
  }

  function findLegacyCard() {
    return [...document.querySelectorAll('.card')].find(card =>
      card.querySelector(':scope > .card-head h3')?.textContent?.trim() === 'Rank A/B Coverage Intelligence'
    );
  }

  async function enhance(force = false) {
    const legacy = findLegacyCard();
    if (!legacy) return;
    const data = await loadData(force);
    const rep = currentRep(data);
    if (!data || !rep || !legacy.isConnected) return;

    legacy.style.display = 'none';
    legacy.setAttribute('aria-hidden', 'true');

    let host = legacy.nextElementSibling;
    if (!host || !host.classList.contains('rcv2-host')) {
      host = document.createElement('div');
      host.className = 'rcv2-host';
      legacy.after(host);
    }

    const renderKey = `${slug(rep.name)}|${txt(data.meta?.generatedAt, '')}|${arr(rep.rankAMeetingRows).length}|${arr(rep.rankBMeetingRows).length}`;
    if (host.dataset.renderKey === renderKey && !force) return;
    host.dataset.renderKey = renderKey;

    let root = roots.get(host);
    if (!root) {
      root = ReactDOM.createRoot(host);
      roots.set(host, root);
    }
    root.render(<RankCoverageV2 rep={rep} />);
  }

  const observerTarget = document.getElementById('root') || document.documentElement;
  new MutationObserver(() => enhance()).observe(observerTarget, { childList: true, subtree: true });
  window.addEventListener('hashchange', () => setTimeout(() => enhance(), 80));
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button?.textContent?.includes('Refresh Data')) setTimeout(() => enhance(true), 500);
  });

  enhance();
  setTimeout(() => enhance(), 500);
})();