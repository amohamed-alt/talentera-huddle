(() => {
  const state = { data: null, loading: false };
  const sources = ['../data.json', '/talentera-huddle/data.json'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const arr = value => Array.isArray(value) ? value : [];
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  async function getData() {
    if (state.data) return state.data;
    if (state.loading) {
      await new Promise(resolve => setTimeout(resolve, 120));
      return getData();
    }
    state.loading = true;
    for (const url of sources) {
      try {
        const response = await fetch(`${url}?v=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) continue;
        state.data = await response.json();
        state.loading = false;
        return state.data;
      } catch (error) {}
    }
    state.loading = false;
    return null;
  }

  function findRep(data) {
    const name = document.querySelector('.rep-hero h2')?.textContent?.trim();
    if (!name) return null;
    const expected = name.toLowerCase();
    return arr(data.repData).find(rep => String(rep.name || '').toLowerCase() === expected)
      || arr(data.repData).find(rep => String(rep.name || '').toLowerCase().split(' ')[0] === expected.split(' ')[0]);
  }

  function makePeriod(key, label, note, tone, calls, connected, rate, meetings, leads) {
    const callCount = num(calls), meetingCount = num(meetings);
    return { key, label, note, tone, calls: callCount, connected: num(connected), rate: num(rate), meetings: meetingCount, leads: num(leads), callsPerMeeting: meetingCount ? (callCount / meetingCount).toFixed(1) : '—' };
  }

  function periodData(rep) {
    return [
      makePeriod('yesterday', 'Yesterday', 'Latest completed business day', '', rep.calls?.yest, rep.calls?.yestConn, rep.connRateYest, rep.meetings?.yest, rep.leadsYest),
      makePeriod('mtd', 'Month to Date', 'Current month performance', 'green', rep.calls?.mtd, rep.calls?.mtdConn, rep.connRateMTD, rep.meetings?.mtd, rep.leadsMTD),
      makePeriod('ytd', 'Year to Date', 'Current year performance', 'purple', rep.calls?.ytd, rep.calls?.ytdConn, rep.connRateYTD, rep.meetings?.ytd, rep.leadsYTD)
    ];
  }

  function periodCard(item) {
    const metrics = [
      ['Calls', item.calls],
      ['Connected', item.connected],
      ['Connection rate', `${item.rate}%`],
      ['Meetings', item.meetings],
      ['Leads', item.leads],
      ['Calls / meeting', item.callsPerMeeting]
    ];
    return `<article class="period-card-v5 ${item.tone}">
      <header><span>${esc(item.label)}</span><small>${esc(item.note)}</small></header>
      <div class="period-metrics-v5">${metrics.map(([label, value]) => `<div class="period-metric-v5"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`).join('')}</div>
      <div class="period-progress-v5"><div><span>Connection efficiency</span><b>${item.rate}%</b></div><i><em style="width:${Math.min(100, item.rate)}%"></em></i></div>
    </article>`;
  }

  function buildPeriodSection(rep) {
    const section = document.createElement('section');
    section.className = 'period-overview-v5 v5-injected';
    section.innerHTML = `<div class="v5-section-head"><div class="v5-section-title"><span class="v5-section-icon">▦</span><div><h3>Performance Breakdown</h3><p>Every activity split by Yesterday, Month to Date and Year to Date</p></div></div><span class="v5-pill">Activities + KPIs</span></div><div class="period-grid-v5">${periodData(rep).map(periodCard).join('')}</div>`;
    return section;
  }

  function buildNewsSection(data) {
    const news = arr(data.marketNews);
    const section = document.createElement('section');
    section.className = 'market-news-v5 v5-injected';
    section.innerHTML = `<div class="v5-section-head"><div class="v5-section-title"><span class="v5-section-icon">📰</span><div><h3>Market & M&A News</h3><p>Strategic context for acquisition conversations</p></div></div><span class="v5-pill">${news.length} updates</span></div>${news.length ? `<div class="market-news-grid-v5">${news.slice(0, 6).map(item => {
      const color = item.color || '#12965a';
      return `<article class="news-card-v5"><span class="news-icon-v5">${esc(item.icon || '📰')}</span><div><header><span class="news-tag-v5" style="background:${esc(color)}15;color:${esc(color)}">${esc(item.tag || 'Market')}</span><span class="news-source-v5">${esc(item.source || '')}</span></header><p>${esc(item.text || '')}</p></div></article>`;
    }).join('')}</div>` : '<div class="news-empty-v5">No market news was included in the latest data refresh.</div>'}`;
    return section;
  }

  function hideLegacyKpi(root) {
    const kpis = root.querySelector('.kpis');
    const card = kpis?.closest('.card');
    if (card) card.classList.add('legacy-kpi-hidden');
  }

  function enhanceRep(data) {
    const hero = document.querySelector('.rep-hero');
    if (!hero) return false;
    const root = hero.closest('.stack');
    const rep = findRep(data);
    if (!root || !rep) return false;
    const key = slug(rep.name);
    if (root.dataset.v5Rep === key && root.querySelector('.period-overview-v5')) return true;
    root.querySelectorAll('.v5-injected').forEach(node => node.remove());
    root.dataset.v5Rep = key;
    root.classList.add('rep-v5-root');
    hideLegacyKpi(root);
    hero.after(buildPeriodSection(rep));
    const news = buildNewsSection(data);
    root.appendChild(news);
    window.__talenteraV5 = { data, rep, root };
    window.dispatchEvent(new CustomEvent('talentera:v5-rep-ready', { detail: { data, rep, root } }));
    return true;
  }

  function enhanceTeam(data) {
    if (document.querySelector('.rep-hero')) return;
    const focus = document.querySelector('.focus');
    const root = focus?.closest('.stack');
    if (!root || root.querySelector('.market-news-v5')) return;
    root.appendChild(buildNewsSection(data));
  }

  async function run() {
    const data = await getData();
    if (!data) return;
    if (!enhanceRep(data)) enhanceTeam(data);
  }

  new MutationObserver(() => run()).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('hashchange', () => setTimeout(run, 60));
  run();
  setTimeout(run, 400);
  setTimeout(run, 1200);
})();
