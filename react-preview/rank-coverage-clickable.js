(() => {
  'use strict';

  const OWNER_IDS = Object.freeze({
    'Marita Chedid': '31644369',
    'Zein Fares': '31558980',
    'Ursula Waked': '76369997',
    'Ahmad Khawajah': '32332250',
    'Mohammed Khalid': '32332251',
    'Jehad Al-Barqawi': '76370000',
    'Fadi Zanona': '76369998',
    'Mohammed Faizan': '76369995'
  });

  const METRICS = Object.freeze([
    { key: 'total', label: rank => `Rank ${rank} total`, tone: 'purple' },
    { key: 'contacted', label: () => 'Contacted', tone: 'green' },
    { key: 'reached', label: () => 'Companies reached', tone: 'purple' },
    { key: 'meetings', label: () => 'Meetings logged', tone: 'blue' },
    { key: 'notContacted', label: () => 'Not contacted', tone: 'red' }
  ]);

  let dataCache = null;
  let dataPromise = null;
  let activeModal = null;

  const array = value => Array.isArray(value) ? value : [];
  const text = (value, fallback = '') => String(value ?? '').trim() || fallback;
  const normalized = value => text(value).toLowerCase().replace(/\s+/g, ' ').trim();
  const slug = value => text(value, 'rep').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const countryKey = value => text(value, 'Unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
  const rankKey = value => text(value).toUpperCase().replace(/^RANK\s+/, '').trim();
  const outcomeKey = value => text(value, 'UNKNOWN').toUpperCase().replace(/[\s-]+/g, '_');
  const formatNumber = value => Number(value || 0).toLocaleString();

  function first(row, keys) {
    const sources = [row, row?.properties, row?.fields, row?.propertyValues].filter(Boolean);
    for (const key of keys) {
      for (const source of sources) {
        const value = source[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
    }
    return undefined;
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function outcomeLabel(value) {
    const outcome = outcomeKey(value);
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
  }

  function outcomeSummary(counts) {
    const order = ['COMPLETED', 'SCHEDULED', 'NO_SHOW', 'RESCHEDULED', 'CANCELED', 'CANCELLED', 'UNKNOWN'];
    const entries = Object.entries(counts || {}).filter(([, count]) => Number(count) > 0);
    entries.sort(([left], [right]) => {
      const leftIndex = order.indexOf(outcomeKey(left));
      const rightIndex = order.indexOf(outcomeKey(right));
      return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex);
    });
    return entries.length
      ? entries.map(([outcome, count]) => `${outcomeLabel(outcome)} ${formatNumber(count)}`).join(' · ')
      : 'No meeting outcome';
  }

  function currentRep(data) {
    const match = location.hash.match(/^#rep\/(.+)$/);
    if (!match) return null;
    return array(data?.repData).find(rep => slug(rep.name) === match[1]) || null;
  }

  async function loadData(force = false) {
    if (force) {
      dataCache = null;
      dataPromise = null;
    }
    if (dataCache) return dataCache;
    if (dataPromise) return dataPromise;

    dataPromise = (async () => {
      const urls = location.pathname.includes('/react-preview/')
        ? ['../data.json', '/talentera-huddle/data.json']
        : ['./data.json', '/talentera-huddle/data.json'];

      let lastError = null;
      for (const url of urls) {
        try {
          const response = await fetch(`${url}?rankModal=${Date.now()}`, { cache: 'no-store' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          dataCache = await response.json();
          return dataCache;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error('Dashboard data could not be loaded');
    })();

    return dataPromise;
  }

  function rowCountry(row) {
    return text(first(row, ['country', 'companyCountry', 'company_country', 'countryName', 'hs_country']), 'Unknown');
  }

  function rowRank(row) {
    return rankKey(first(row, ['rank', 'companyRank', 'company_rank', 'tier']));
  }

  function rowOwnerName(row) {
    return text(first(row, ['ownerName', 'companyOwnerName', 'company_owner_name', 'rep', 'repName']));
  }

  function rowOwnerId(row) {
    return text(first(row, ['ownerId', 'companyOwnerId', 'company_owner_id', 'hubspot_owner_id']));
  }

  function companyId(row) {
    return text(first(row, ['companyId', 'company_id', 'hs_object_id', 'id']));
  }

  function companyName(row) {
    return text(first(row, ['companyName', 'company', 'accountName', 'name']), 'Unknown company');
  }

  function companyUrl(row) {
    const direct = text(first(row, ['companyUrl', 'company_url']));
    if (/^https?:\/\//i.test(direct)) return direct;

    const possible = text(first(row, ['hubspotUrl', 'url', 'recordUrl']));
    if (/^https?:\/\//i.test(possible) && /\/record\/0-2\//.test(possible)) return possible;

    const id = companyId(row).match(/\d{5,}/)?.[0];
    return id ? `https://app-eu1.hubspot.com/contacts/145742477/record/0-2/${id}` : '';
  }

  function sameOwnerMeeting(row) {
    const meetingOwner = text(first(row, ['meetingOwnerId', 'meeting_owner_id', 'hubspot_owner_id', 'ownerId']));
    const companyOwner = text(first(row, ['companyOwnerId', 'company_owner_id']));
    return !meetingOwner || !companyOwner || meetingOwner === companyOwner;
  }

  function matchesRep(row, rep) {
    const expectedId = OWNER_IDS[rep.name] || '';
    const ownerName = rowOwnerName(row);
    const ownerId = rowOwnerId(row);

    if (ownerId && expectedId) return ownerId === expectedId;
    if (ownerName) return normalized(ownerName) === normalized(rep.name);
    return false;
  }

  function matchesSelection(row, rep, rank, country) {
    if (!matchesRep(row, rep)) return false;
    if (rowRank(row) !== rank) return false;
    return country === 'all' || countryKey(rowCountry(row)) === countryKey(country);
  }

  function normalizeAccount(row, status, rep, rank) {
    return {
      key: companyId(row) || `${normalized(companyName(row))}|${countryKey(rowCountry(row))}`,
      id: companyId(row),
      name: companyName(row),
      url: companyUrl(row),
      country: rowCountry(row),
      rank: rowRank(row) || rank,
      ownerName: rowOwnerName(row) || rep.name,
      domain: text(first(row, ['domain', 'website'])),
      status,
      details: status,
      meetingCount: 0,
      completedCount: 0,
      outcomes: {}
    };
  }

  function dedupeAccounts(rows) {
    const map = new Map();
    for (const row of rows) {
      if (!row?.key) continue;
      const existing = map.get(row.key);
      if (!existing) {
        map.set(row.key, { ...row, outcomes: { ...(row.outcomes || {}) } });
        continue;
      }

      existing.url = existing.url || row.url;
      existing.id = existing.id || row.id;
      existing.domain = existing.domain || row.domain;
      existing.ownerName = existing.ownerName || row.ownerName;
      existing.country = existing.country === 'Unknown' ? row.country : existing.country;
      existing.meetingCount += Number(row.meetingCount || 0);
      existing.completedCount += Number(row.completedCount || 0);
      existing.status = existing.status === 'Not contacted' ? row.status : existing.status;

      for (const [outcome, count] of Object.entries(row.outcomes || {})) {
        existing.outcomes[outcome] = Number(existing.outcomes[outcome] || 0) + Number(count || 0);
      }
    }
    return [...map.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  function outreachAccounts(data, rep, rank, country, type) {
    const companies = data?.outreachCoverage?.companies || {};
    const contactedRows = array(companies.contactedList);
    const notContactedRows = array(companies.notContactedList);

    const normalizeRows = (rows, status) => rows
      .filter(row => matchesSelection(row, rep, rank, country))
      .map(row => normalizeAccount(row, status, rep, rank));

    if (type === 'contacted') return dedupeAccounts(normalizeRows(contactedRows, 'Contacted'));
    if (type === 'notContacted') return dedupeAccounts(normalizeRows(notContactedRows, 'Not contacted'));

    return dedupeAccounts([
      ...normalizeRows(contactedRows, 'Contacted'),
      ...normalizeRows(notContactedRows, 'Not contacted')
    ]);
  }

  function repArrayCandidates(rep, rank, type) {
    const prefix = `rank${rank}`;
    const candidates = type === 'contacted'
      ? [`${prefix}ContactedAccounts`, `${prefix}ContactedCompanies`, `${prefix}ContactedRows`]
      : type === 'notContacted'
        ? [`${prefix}Untouched`, `${prefix}NotContactedAccounts`, `${prefix}NotContactedCompanies`]
        : [`${prefix}Accounts`, `${prefix}AllAccounts`, `${prefix}Companies`, `${prefix}AccountRows`];

    return candidates.flatMap(key => array(rep[key]));
  }

  function fallbackOutreachAccounts(rep, rank, country, type) {
    return dedupeAccounts(
      repArrayCandidates(rep, rank, type)
        .filter(row => country === 'all' || countryKey(rowCountry(row)) === countryKey(country))
        .map(row => normalizeAccount(
          row,
          type === 'notContacted' ? 'Not contacted' : type === 'contacted' ? 'Contacted' : 'Account',
          rep,
          rank
        ))
    );
  }

  function rankMeetingRows(rep, rank, country) {
    const direct = rank === 'A' ? array(rep.rankAMeetingRows) : array(rep.rankBMeetingRows);
    const fallback = array(rep.rankMeetingRows).filter(row => rowRank(row) === rank);
    const rows = direct.length ? direct : fallback;

    return rows.filter(row =>
      sameOwnerMeeting(row) &&
      (country === 'all' || countryKey(rowCountry(row)) === countryKey(country))
    );
  }

  function meetingAccounts(rep, rank, country, completedOnly) {
    const rows = rankMeetingRows(rep, rank, country);
    const grouped = new Map();
    const meetingSeen = new Set();

    rows.forEach((row, index) => {
      const outcome = outcomeKey(first(row, ['outcome', 'hs_meeting_outcome', 'meetingOutcome', 'status']));
      if (completedOnly && outcome !== 'COMPLETED') return;

      const normalizedAccount = normalizeAccount(row, completedOnly ? 'Reached' : 'Meeting logged', rep, rank);
      const meetingId = text(first(row, ['meetingId', 'meeting_id', 'hs_object_id', 'id']), `row-${index}`);
      const dedupeKey = `${normalizedAccount.key}|${meetingId}`;
      if (meetingSeen.has(dedupeKey)) return;
      meetingSeen.add(dedupeKey);

      if (!grouped.has(normalizedAccount.key)) grouped.set(normalizedAccount.key, normalizedAccount);
      const account = grouped.get(normalizedAccount.key);
      account.meetingCount += 1;
      account.completedCount += outcome === 'COMPLETED' ? 1 : 0;
      account.outcomes[outcome] = Number(account.outcomes[outcome] || 0) + 1;
    });

    return [...grouped.values()]
      .map(account => ({
        ...account,
        details: completedOnly
          ? `${formatNumber(account.completedCount)} completed meeting${account.completedCount === 1 ? '' : 's'}`
          : `${formatNumber(account.meetingCount)} meeting${account.meetingCount === 1 ? '' : 's'} · ${outcomeSummary(account.outcomes)}`
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  function accountsForMetric(data, rep, rank, country, metricKey) {
    if (metricKey === 'reached') return meetingAccounts(rep, rank, country, true);
    if (metricKey === 'meetings') return meetingAccounts(rep, rank, country, false);

    let accounts = outreachAccounts(data, rep, rank, country, metricKey);
    if (!accounts.length) accounts = fallbackOutreachAccounts(rep, rank, country, metricKey);

    if (metricKey === 'total' && !accounts.length) {
      accounts = dedupeAccounts([
        ...fallbackOutreachAccounts(rep, rank, country, 'contacted'),
        ...fallbackOutreachAccounts(rep, rank, country, 'notContacted'),
        ...meetingAccounts(rep, rank, country, false)
      ]);
    }

    return accounts.map(account => ({
      ...account,
      details: metricKey === 'total'
        ? account.status
        : metricKey === 'contacted'
          ? 'Connected call or completed meeting'
          : 'Requires outreach'
    }));
  }

  function metricContext(metric) {
    const metrics = [...metric.parentElement.querySelectorAll('.rcv2-metric')];
    const index = metrics.indexOf(metric);
    const definition = METRICS[index];
    const card = metric.closest('.rcv2-card');
    const activeRankButton = card?.querySelector('.rcv2-segment button.active');
    const rank = text(activeRankButton?.textContent).match(/[AB]/i)?.[0]?.toUpperCase() || 'A';
    const country = card?.querySelector('.rcv2-toolbar select')?.value || 'all';
    return { definition, rank, country };
  }

  function pillTone(status) {
    const value = normalized(status);
    if (value.includes('not contacted') || value.includes('requires')) return 'red';
    if (value.includes('contacted')) return 'green';
    if (value.includes('reached')) return 'purple';
    if (value.includes('meeting')) return 'blue';
    return '';
  }

  function accountSearchText(account) {
    return normalized([
      account.name,
      account.country,
      account.rank,
      account.ownerName,
      account.domain,
      account.status,
      account.details,
      outcomeSummary(account.outcomes)
    ].join(' '));
  }

  function closeModal() {
    if (!activeModal) return;
    activeModal.remove();
    activeModal = null;
    document.body.classList.remove('rcv2-modal-open');
  }

  function openModal({ accounts, rep, rank, country, definition, cardValue }) {
    closeModal();

    const totalMeetings = accounts.reduce((sum, account) => sum + Number(account.meetingCount || 0), 0);
    const modal = document.createElement('div');
    modal.className = 'rcv2-modal-backdrop';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <section class="rcv2-modal" aria-label="${escapeHtml(definition.label(rank))}">
        <header class="rcv2-modal-head">
          <div>
            <p class="rcv2-modal-kicker">Rank ${escapeHtml(rank)} coverage · ${escapeHtml(rep.name)}</p>
            <h2 class="rcv2-modal-title">${escapeHtml(definition.label(rank))}</h2>
            <p class="rcv2-modal-subtitle">${escapeHtml(country === 'all' ? 'All countries' : country)} · Card value ${escapeHtml(cardValue)}</p>
          </div>
          <button type="button" class="rcv2-modal-close" aria-label="Close">×</button>
        </header>
        <div class="rcv2-modal-tools">
          <input class="rcv2-modal-search" type="search" placeholder="Search company, country, owner or status..." autocomplete="off" />
          <span class="rcv2-modal-count"></span>
        </div>
        <div class="rcv2-modal-table-wrap">
          <table class="rcv2-modal-table">
            <thead>
              <tr><th>Company</th><th>Country</th><th>Rank</th><th>Owner</th><th>Details</th></tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
        <footer class="rcv2-modal-foot">All available account rows are shown. Company names open the HubSpot company record when available.</footer>
      </section>`;

    const tbody = modal.querySelector('tbody');
    const searchInput = modal.querySelector('.rcv2-modal-search');
    const countNode = modal.querySelector('.rcv2-modal-count');

    function renderRows(query = '') {
      const needle = normalized(query);
      const filtered = needle ? accounts.filter(account => accountSearchText(account).includes(needle)) : accounts;
      const summary = definition.key === 'meetings'
        ? `${formatNumber(filtered.length)} accounts · ${formatNumber(filtered.reduce((sum, account) => sum + Number(account.meetingCount || 0), 0))} meetings`
        : `${formatNumber(filtered.length)} accounts`;
      countNode.textContent = summary;

      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="rcv2-modal-empty">No account rows found for this selection.</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(account => {
        const name = escapeHtml(account.name);
        const companyCell = account.url
          ? `<a href="${escapeHtml(account.url)}" target="_blank" rel="noopener noreferrer">${name} ↗</a>`
          : `<span>${name}</span>`;
        const secondary = account.domain || account.id;
        const details = account.details || account.status;

        return `<tr>
          <td><div class="rcv2-modal-company">${companyCell}${secondary ? `<small>${escapeHtml(secondary)}</small>` : ''}</div></td>
          <td>${escapeHtml(account.country)}</td>
          <td><span class="rcv2-modal-pill">Rank ${escapeHtml(account.rank)}</span></td>
          <td>${escapeHtml(account.ownerName)}</td>
          <td><span class="rcv2-modal-pill ${pillTone(details)}">${escapeHtml(details)}</span></td>
        </tr>`;
      }).join('');
    }

    renderRows();
    searchInput.addEventListener('input', event => renderRows(event.target.value));
    modal.querySelector('.rcv2-modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });

    activeModal = modal;
    document.body.classList.add('rcv2-modal-open');
    document.body.appendChild(modal);
    searchInput.focus();

    if (definition.key === 'meetings' && totalMeetings && !accounts.length) {
      countNode.textContent = `${formatNumber(totalMeetings)} meetings`;
    }
  }

  async function activateMetric(metric) {
    const { definition, rank, country } = metricContext(metric);
    if (!definition) return;

    metric.setAttribute('aria-busy', 'true');
    try {
      const data = await loadData();
      const rep = currentRep(data);
      if (!rep) throw new Error('Rep data was not found');
      const accounts = accountsForMetric(data, rep, rank, country, definition.key);
      const cardValue = text(metric.querySelector('strong')?.textContent, '—');
      openModal({ accounts, rep, rank, country, definition, cardValue });
    } catch (error) {
      console.error('Rank coverage modal failed:', error);
      alert(`Could not load the account list: ${error.message}`);
    } finally {
      metric.removeAttribute('aria-busy');
    }
  }

  function markCards() {
    document.querySelectorAll('.rcv2-metric').forEach((metric, index) => {
      if (!METRICS[index % METRICS.length]) return;
      metric.dataset.clickable = 'true';
      metric.setAttribute('role', 'button');
      metric.setAttribute('tabindex', '0');
      metric.setAttribute('aria-label', `Open ${text(metric.querySelector('span')?.textContent, 'metric')} account list`);
    });
  }

  document.addEventListener('click', event => {
    const metric = event.target.closest('.rcv2-metric[data-clickable="true"]');
    if (metric) {
      event.preventDefault();
      activateMetric(metric);
      return;
    }

    const button = event.target.closest('button');
    if (button?.textContent?.includes('Refresh Data')) {
      dataCache = null;
      dataPromise = null;
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeModal();
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') return;
    const metric = event.target.closest('.rcv2-metric[data-clickable="true"]');
    if (!metric) return;
    event.preventDefault();
    activateMetric(metric);
  });

  new MutationObserver(markCards).observe(document.getElementById('root') || document.documentElement, {
    childList: true,
    subtree: true
  });

  markCards();
  setTimeout(markCards, 600);
})();