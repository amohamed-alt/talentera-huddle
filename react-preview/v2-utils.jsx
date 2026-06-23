(function () {
  const H = window.HuddleV2 = window.HuddleV2 || {};
  const HUBSPOT = 'https://app-eu1.hubspot.com';
  const PORTAL = '145742477';
  const DATA_SOURCES = location.pathname.includes('/react-preview/') ? ['../data.json', '/talentera-huddle/data.json'] : ['./data.json', '/talentera-huddle/data.json'];
  const arr = value => Array.isArray(value) ? value : [];
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const txt = (value, fallback = '—') => String(value ?? '').trim() || fallback;
  const slug = value => txt(value, 'team').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const money = value => { const amount = num(value); if (Math.abs(amount) >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`; if (Math.abs(amount) >= 1000) return `$${Math.round(amount / 1000)}K`; return `$${Math.round(amount).toLocaleString()}`; };
  const first = (row, keys) => { const sources = [row, row?.properties, row?.fields, row?.propertyValues].filter(Boolean); for (const key of keys) for (const source of sources) { const value = source[key]; if (value !== undefined && value !== null && String(value).trim() !== '') return value; } };
  const rowName = row => txt(first(row, ['name','dealname','companyName','fullName','email','id','hs_object_id']), 'Unknown record');
  const rowOwner = row => txt(first(row, ['ownerName','rep','owner','_owner','hubspot_owner_name','contactOwnerName']));
  const rowCountry = row => txt(first(row, ['country','_country','companyCountry','countryName','hs_country']));
  const rowAge = row => first(row, ['ageDays','days','daysWithoutContact','daysSinceCreated','daysSinceActivity']) === undefined ? '—' : `${num(first(row, ['ageDays','days','daysWithoutContact','daysSinceCreated','daysSinceActivity']))}d`;
  const rowDate = row => first(row, ['closedate','stageDate','createdAt','createdate','lastActivityDate','nextActivityDate','signedDate','cashingDate']) ? String(first(row, ['closedate','stageDate','createdAt','createdate','lastActivityDate','nextActivityDate','signedDate','cashingDate'])).slice(0, 10) : '—';
  const sourceKind = row => { const source = txt(first(row, ['sourceBucket','source','originalSource','leadSource','hs_analytics_source','channel','type']), '').toLowerCase(); if (['online','inbound','website','form','organic','paid','social','referral'].some(x => source.includes(x))) return 'online'; if (['offline','outbound','manual','import','event','cold','prospect'].some(x => source.includes(x))) return 'offline'; return 'unknown'; };
  const ownerMatch = (row, name) => { const expected = txt(name, '').toLowerCase(); const actual = rowOwner(row).toLowerCase(); return actual === expected || actual.split(' ')[0] === expected.split(' ')[0]; };
  const objectType = row => first(row, ['dealId','deal_id','dealname','dealstage','amount']) ? '0-3' : first(row, ['companyId','company_id','domain','companyName']) ? '0-2' : '0-1';
  const recordUrl = row => { const explicit = txt(first(row, ['hubspotUrl','url','recordUrl','hs_url','dealUrl','companyUrl','contactUrl']), ''); if (/^https?:\/\//i.test(explicit)) return explicit; const id = String(first(row, ['dealId','deal_id','companyId','company_id','contactId','contact_id','vid','hs_object_id','recordId','objectId','id']) ?? '').match(/\d{5,}/)?.[0]; const type = objectType(row); return id ? `${HUBSPOT}/contacts/${PORTAL}/record/${type}/${id}` : `${HUBSPOT}/contacts/${PORTAL}/objects/${type}/views/all/list?query=${encodeURIComponent(rowName(row))}`; };
  const toneForRate = value => value >= 50 ? 'green' : value >= 30 ? 'amber' : 'red';
  async function loadDashboard() { const errors = []; for (const url of DATA_SOURCES) { try { const response = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' }); if (!response.ok) { errors.push(`${url}: ${response.status}`); continue; } return await response.json(); } catch (error) { errors.push(`${url}: ${error.message}`); } } throw new Error(errors.join(' | ')); }
  Object.assign(H, { loadDashboard });
  H.helpers = { arr, num, txt, slug, money, first, rowName, rowOwner, rowCountry, rowAge, rowDate, sourceKind, ownerMatch, recordUrl, toneForRate };
})();
