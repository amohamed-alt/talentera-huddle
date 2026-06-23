(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const arr = value => Array.isArray(value) ? value : [];
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const first = (row, keys) => {
    const sources = [row, row?.properties, row?.fields, row?.propertyValues].filter(Boolean);
    for (const key of keys) for (const source of sources) {
      const value = source[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
  };
  const countryName = value => String(value || 'Unknown').trim() || 'Unknown';
  const countryKey = value => countryName(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
  const rowCountry = row => countryName(first(row, ['country','companyCountry','countryName','hs_country','company_country','Country']) || row?._country);
  const rowRank = row => String(first(row, ['rank','companyRank','company_rank','hs_lead_rank','tier','Rank']) || row?._rank || '').toUpperCase().replace('RANK ', '');
  const rowName = row => String(first(row, ['name','companyName','company','domain','website','id']) || 'Unknown account');
  const statFromCountry = (object, country) => object ? Object.entries(object).find(([key]) => countryKey(key) === countryKey(country))?.[1] : null;
  const metric = (object, keys) => {
    for (const key of keys) {
      const value = object?.[key];
      if (Array.isArray(value)) return value.length;
      if (value !== undefined && value !== null && Number.isFinite(Number(value))) return Number(value);
    }
    return 0;
  };
  const meetingKeysA = ['rankAMeetingsCompleted','rankACompletedMeetings','rankAMeetings','meetingsCompletedA','completedMeetingsA','aMeetingsCompleted'];
  const meetingKeysB = ['rankBMeetingsCompleted','rankBCompletedMeetings','rankBMeetings','meetingsCompletedB','completedMeetingsB','bMeetingsCompleted'];

  function countriesForRep(rep) {
    const countries = new Map();
    const add = value => { const name = countryName(value); if (name !== 'Unknown') countries.set(countryKey(name), name); };
    [...arr(rep.rankAUntouched), ...arr(rep.rankBUntouched)].forEach(row => add(rowCountry(row)));
    ['rankAByCountry','rankBByCountry','rankByCountry','countryBreakdown','rankCoverageByCountry'].forEach(key => Object.keys(rep[key] || {}).forEach(add));
    ['rankAContactedList','rankBContactedList','rankACompanies','rankBCompanies','rankAccounts','rankCompanies'].forEach(key => arr(rep[key]).forEach(row => add(rowCountry(row))));
    return [...countries.values()].sort((a, b) => a.localeCompare(b));
  }

  function rowsFor(rep, rank, country) {
    const lists = rank === 'A'
      ? [...arr(rep.rankAUntouched), ...arr(rep.rankAContactedList), ...arr(rep.rankACompanies)]
      : [...arr(rep.rankBUntouched), ...arr(rep.rankBContactedList), ...arr(rep.rankBCompanies)];
    const seen = new Set();
    return lists.filter(row => {
      if (country !== 'all' && countryKey(rowCountry(row)) !== countryKey(country)) return false;
      const key = `${rowName(row).toLowerCase()}|${countryKey(rowCountry(row))}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function meetingRows(rep, rank, country) {
    const rows = [];
    ['completedMeetings','meetingsCompleted','meetingsList','completedMeetingsList','activities','activityRows'].forEach(key => arr(rep[key]).forEach(row => rows.push(row)));
    return rows.filter(row => {
      const rowR = rowRank(row);
      if (rowR && rowR !== rank) return false;
      if (country !== 'all' && countryKey(rowCountry(row)) !== countryKey(country)) return false;
      const outcome = String(first(row, ['hs_meeting_outcome','meetingOutcome','outcome','status','meetingStatus']) || '').toLowerCase();
      const count = metric(row, ['completedMeetings','meetingsCompleted','completed_meetings','meetings_completed']);
      return count > 0 || outcome.includes('complete') || first(row, ['completedMeetingDate','lastCompletedMeetingDate','hs_meeting_start_time']);
    });
  }

  function statsFor(rep, country) {
    if (country === 'all') {
      const a = num(rep.rankA), b = num(rep.rankB);
      const aU = num(rep.rankANotContacted) || arr(rep.rankAUntouched).length;
      const bU = num(rep.rankBNotContacted) || arr(rep.rankBUntouched).length;
      const aC = num(rep.rankAContacted) || Math.max(0, a - aU);
      const bC = num(rep.rankBContacted) || Math.max(0, b - bU);
      const aM = metric(rep, meetingKeysA) || meetingRows(rep, 'A', 'all').length;
      const bM = metric(rep, meetingKeysB) || meetingRows(rep, 'B', 'all').length;
      return { a, aC, aM, aU, b, bC, bM, bU };
    }
    const untouchedA = arr(rep.rankAUntouched).filter(row => countryKey(rowCountry(row)) === countryKey(country));
    const untouchedB = arr(rep.rankBUntouched).filter(row => countryKey(rowCountry(row)) === countryKey(country));
    const aSource = statFromCountry(rep.rankAByCountry, country) || statFromCountry(rep.countryBreakdown, country) || statFromCountry(rep.rankCoverageByCountry, country) || {};
    const bSource = statFromCountry(rep.rankBByCountry, country) || statFromCountry(rep.countryBreakdown, country) || statFromCountry(rep.rankCoverageByCountry, country) || {};
    const a = metric(aSource, ['rankA','A','totalA','totalRankA','total']) || rowsFor(rep, 'A', country).length || untouchedA.length;
    const b = metric(bSource, ['rankB','B','totalB','totalRankB','total']) || rowsFor(rep, 'B', country).length || untouchedB.length;
    const aU = metric(aSource, ['rankANotContacted','notContactedA','untouchedA','rankAUntouched','notContacted']) || untouchedA.length;
    const bU = metric(bSource, ['rankBNotContacted','notContactedB','untouchedB','rankBUntouched','notContacted']) || untouchedB.length;
    const aC = metric(aSource, ['rankAContacted','contactedA','touchedA','contacted']) || Math.max(0, a - aU);
    const bC = metric(bSource, ['rankBContacted','contactedB','touchedB','contacted']) || Math.max(0, b - bU);
    const aM = metric(aSource, [...meetingKeysA, 'meetingsCompleted','completedMeetings']) || meetingRows(rep, 'A', country).length;
    const bM = metric(bSource, [...meetingKeysB, 'meetingsCompleted','completedMeetings']) || meetingRows(rep, 'B', country).length;
    return { a, aC, aM, aU, b, bC, bM, bU };
  }

  function recordUrl(row) {
    const explicit = first(row, ['hubspotUrl','url','recordUrl','companyUrl']);
    if (explicit && /^https?:\/\//i.test(String(explicit))) return String(explicit);
    const raw = String(first(row, ['companyId','company_id','hs_object_id','recordId','objectId','id']) || '');
    const id = raw.match(/\d{5,}/)?.[0];
    return id ? `https://app-eu1.hubspot.com/contacts/145742477/record/0-2/${id}` : `https://app-eu1.hubspot.com/contacts/145742477/objects/0-2/views/all/list?query=${encodeURIComponent(rowName(row))}`;
  }

  function statCard(value, label, note, color) {
    return `<div class="rank-stat-v5" style="--accent:${color}"><strong>${num(value).toLocaleString()}</strong><span>${esc(label)}</span><small>${esc(note)}</small></div>`;
  }

  function tableRows(rep, countries, selected) {
    const list = selected === 'all' ? countries : [selected];
    if (!list.length) return '<tr><td colspan="9">No country-level rank data was exported.</td></tr>';
    return list.map(country => {
      const stats = statsFor(rep, country);
      return `<tr><td><span class="rank-country-name-v5">${esc(country)}</span></td><td>${stats.a}</td><td>${stats.aC}</td><td style="color:#7a59d1">${stats.aM}</td><td style="color:#dd4a43">${stats.aU}</td><td>${stats.b}</td><td>${stats.bC}</td><td style="color:#7a59d1">${stats.bM}</td><td style="color:#dc8a18">${stats.bU}</td></tr>`;
    }).join('');
  }

  function accountRows(rep, rank, country) {
    const untouched = rank === 'A' ? arr(rep.rankAUntouched) : arr(rep.rankBUntouched);
    const rows = untouched.filter(row => country === 'all' || countryKey(rowCountry(row)) === countryKey(country));
    if (!rows.length) return '<div class="news-empty-v5">No untouched accounts for this rank and country.</div>';
    return rows.slice(0, 8).map(row => `<div class="rank-account-row-v5"><a href="${esc(recordUrl(row))}" target="_blank">${esc(rowName(row))} ↗</a><span>${esc(rowCountry(row))}</span><b class="${rank === 'A' ? 'rank-a-v5' : 'rank-b-v5'}">Rank ${rank}</b></div>`).join('');
  }

  function render(section, rep, countries, selected, activeRank) {
    const stats = statsFor(rep, selected);
    const label = selected === 'all' ? 'All countries' : selected;
    section.querySelector('.rank-summary-v5').innerHTML = [
      statCard(stats.a, 'Rank A total', label, '#dd4a43'),
      statCard(stats.aC, 'A contacted', 'Contact established', '#12965a'),
      statCard(stats.aM, 'A meetings completed', 'Completed meetings', '#7a59d1'),
      statCard(stats.aU, 'A not contacted', 'Requires outreach', '#dd4a43'),
      statCard(stats.b, 'Rank B total', label, '#dc8a18'),
      statCard(stats.bC, 'B contacted', 'Contact established', '#12965a'),
      statCard(stats.bM, 'B meetings completed', 'Completed meetings', '#7a59d1'),
      statCard(stats.bU, 'B not contacted', 'Requires outreach', '#dc8a18')
    ].join('');
    section.querySelector('.rank-table-v5 tbody').innerHTML = tableRows(rep, countries, selected);
    section.querySelector('.rank-account-list-v5').innerHTML = accountRows(rep, activeRank, selected);
    section.querySelectorAll('.rank-account-tabs-v5 button').forEach(button => button.classList.toggle('active', button.dataset.rank === activeRank));
  }

  function build(detail) {
    const { rep, root } = detail;
    root.querySelectorAll('.rank-v5').forEach(node => node.remove());
    [...root.querySelectorAll('.card')].forEach(card => {
      const title = card.querySelector(':scope > .card-head h3')?.textContent?.trim();
      if (title === 'Rank A/B Coverage') card.classList.add('legacy-rank-hidden');
    });
    const countries = countriesForRep(rep);
    let selected = 'all';
    let activeRank = 'A';
    const section = document.createElement('section');
    section.className = 'rank-v5 v5-injected';
    section.innerHTML = `<div class="v5-section-head"><div class="v5-section-title"><span class="v5-section-icon">◎</span><div><h3>Rank A/B Coverage Intelligence</h3><p>Contacted, not contacted and completed meetings by country</p></div></div><span class="v5-pill">${countries.length} countries tracked</span></div>
      <div class="rank-controls-v5"><div class="rank-country-v5"><label>Filter by country</label><select><option value="all">All countries</option>${countries.map(country => `<option value="${esc(country)}">${esc(country)}</option>`).join('')}</select><span class="rank-country-count-v5">${countries.length} countries available</span></div><span class="rank-country-count-v5">Live from exported Rank A/B data</span></div>
      <div class="rank-summary-v5"></div>
      <div class="rank-table-wrap-v5"><table class="rank-table-v5"><thead><tr><th>Country</th><th>A total</th><th>A contacted</th><th>A meetings</th><th>A not contacted</th><th>B total</th><th>B contacted</th><th>B meetings</th><th>B not contacted</th></tr></thead><tbody></tbody></table></div>
      <div class="rank-accounts-v5"><div class="rank-account-tabs-v5"><button class="active" data-rank="A">Rank A not contacted</button><button data-rank="B">Rank B not contacted</button></div><div class="rank-account-list-v5"></div></div>`;
    const news = root.querySelector('.market-news-v5');
    if (news) news.before(section); else root.appendChild(section);
    section.querySelector('select').addEventListener('change', event => { selected = event.target.value; render(section, rep, countries, selected, activeRank); });
    section.querySelectorAll('.rank-account-tabs-v5 button').forEach(button => button.addEventListener('click', () => { activeRank = button.dataset.rank; render(section, rep, countries, selected, activeRank); }));
    render(section, rep, countries, selected, activeRank);
  }

  window.addEventListener('talentera:v5-rep-ready', event => build(event.detail));
  if (window.__talenteraV5) build(window.__talenteraV5);
})();
