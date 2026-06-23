#!/usr/bin/env node
'use strict';

/**
 * Talentera Huddle n8n workflow patcher
 *
 * Usage:
 *   node patch-talentera-huddle-workflow.js workflow.json workflow-all-time.json
 *
 * What it changes:
 * - Replaces CRM Search requests with paginated CRM object-list requests.
 * - Pulls contacts, deals, calls, meetings, and companies across all time.
 * - Keeps the configured Talentera owner scope.
 * - Processes associations only for connected calls and completed meetings.
 * - Restores correct Yesterday / MTD / YTD filtering in the final Code node.
 * - Adds compact allTimeExport arrays to data.json.
 * - Raises accumulator safety limits and deduplicates records by object ID.
 *
 * The script preserves every unmodified node, connection, credential reference,
 * node position, workflow setting, and existing dashboard calculation.
 */

const fs = require('node:fs');
const path = require('node:path');

const inputPath = path.resolve(process.argv[2] || 'workflow.json');
const outputPath = path.resolve(process.argv[3] || 'workflow-all-time.json');

const OWNER_IDS = [
  '31644369',
  '31558980',
  '76369997',
  '32332250',
  '32332251',
  '76370000',
  '76369998',
  '76369995',
];

const CONNECTED_GUID = 'f240bbac-87c9-4f6e-bf70-924b57d47db7';
const MAX_ITEMS = 250000;

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(inputPath)) {
  fail(`Input workflow was not found: ${inputPath}`);
}

let workflow;
try {
  workflow = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch (error) {
  fail(`Input is not valid JSON: ${error.message}`);
}

if (!workflow || !Array.isArray(workflow.nodes) || !workflow.connections) {
  fail('The input is not a valid n8n workflow export. Expected nodes[] and connections.');
}

function node(name) {
  const found = workflow.nodes.find((item) => item.name === name);
  if (!found) fail(`Required node is missing: ${name}`);
  return found;
}

function escapeForSingleQuotedJs(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function objectListUrlExpression(objectType, appendNodeName, properties) {
  const props = properties.join(',');
  const escapedAppendName = escapeForSingleQuotedJs(appendNodeName);

  return `={{ (() => {
  const baseUrl = 'https://api.hubapi.com/crm/v3/objects/${objectType}';
  const properties = '${props}';
  let after = '';

  try {
    const cursor = $('${escapedAppendName}').last().json.after;
    if (cursor !== null && cursor !== undefined && String(cursor) !== '') {
      after = '&after=' + encodeURIComponent(String(cursor));
    }
  } catch (error) {}

  return baseUrl + '?limit=100&archived=false&properties=' + encodeURIComponent(properties) + after;
})() }}`;
}

function patchHttpListNode(name, objectType, appendNodeName, properties) {
  const target = node(name);
  const previousHeaders = target.parameters?.headerParameters;
  const previousOptions = target.parameters?.options || {};

  target.parameters = {
    method: 'GET',
    url: objectListUrlExpression(objectType, appendNodeName, properties),
    sendHeaders: true,
    headerParameters: previousHeaders,
    options: previousOptions,
  };
}

function appendCode({ fetchNode, appendNode, outputKey, carryKeys = [] }) {
  const ownersJson = JSON.stringify(OWNER_IDS, null, 2);
  const carryLines = carryKeys
    .map(
      (key) => `      ${key}: Array.isArray(initData?.${key}) ? initData.${key} : [],`,
    )
    .join('\n');

  const initReader = carryKeys.length
    ? `\n  const initData = $('${escapeForSingleQuotedJs(
        appendNode.replace('Code — Append', 'Init').replace(' Page', ' Accumulator'),
      )}').first().json;`
    : '';

  return `'use strict';

try {
  const OWNER_IDS = new Set(${ownersJson});
  const http = $('${escapeForSingleQuotedJs(fetchNode)}').last().json || {};
  const pageResults = Array.isArray(http.results) ? http.results : [];

  const results = pageResults.filter((record) =>
    OWNER_IDS.has(String(record.properties?.hubspot_owner_id || ''))
  );

  const rawAfter = http?.paging?.next?.after;
  const nextAfter =
    rawAfter !== null && rawAfter !== undefined && String(rawAfter) !== ''
      ? String(rawAfter)
      : null;

  let existing = [];
  try {
    const previous = $('${escapeForSingleQuotedJs(appendNode)}').last().json;
    existing = Array.isArray(previous?.${outputKey}) ? previous.${outputKey} : [];
  } catch (error) {
    existing = [];
  }
${initReader}

  const recordsById = new Map();
  for (const record of [...existing, ...results]) {
    if (!record || record.id === null || record.id === undefined) continue;
    recordsById.set(String(record.id), record);
  }

  const combined = [...recordsById.values()];

  if (combined.length > ${MAX_ITEMS}) {
    throw new Error(
      'Safety limit exceeded for ${outputKey}: ' + combined.length +
      ' records; configured maximum is ${MAX_ITEMS}'
    );
  }

  return [{
    json: {
${carryLines ? `${carryLines}\n` : ''}      ${outputKey}: combined,
      after: nextAfter,
      hasMore: nextAfter !== null,
    },
  }];
} catch (error) {
  throw new Error('${appendNode} failed: ' + error.message);
}`;
}

function setCode(nodeName, jsCode) {
  node(nodeName).parameters.jsCode = jsCode;
}

function replaceRequired(source, searchValue, replacement, description) {
  if (!source.includes(searchValue)) {
    fail(`Could not patch ${description}; expected source text was not found.`);
  }
  return source.replace(searchValue, replacement);
}

function replaceRegexRequired(source, regex, replacement, description) {
  if (!regex.test(source)) {
    fail(`Could not patch ${description}; expected source pattern was not found.`);
  }
  return source.replace(regex, replacement);
}

patchHttpListNode('Fetch Deals Page', 'deals', 'Code — Append Deals Page', [
  'hubspot_owner_id', 'hs_object_id', 'dealname', 'dealstage', 'amount',
  'amount_in_home_currency', 'hs_deal_currency_code', 'pipeline', 'closedate',
  'hs_v2_date_entered_current_stage', 'hs_v2_date_entered_contractsent',
  'hs_v2_date_entered_closedwon', 'hs_v2_date_entered_closedlost',
  'hs_v2_date_exited_contractsent', 'notes_last_updated', 'hs_lastmodifieddate',
  'notes_next_activity_date', 'hs_createdate', 'closed_lost_reason',
]);

patchHttpListNode('Fetch Calls Page', 'calls', 'Code — Append Calls Page', [
  'hubspot_owner_id', 'hs_call_title', 'hs_call_disposition', 'hs_call_status',
  'hs_timestamp', 'hs_createdate',
]);

patchHttpListNode('Fetch Meetings Page', 'meetings', 'Code — Append Meetings Page', [
  'hubspot_owner_id', 'hs_meeting_title', 'hs_meeting_outcome', 'hs_timestamp',
  'hs_meeting_start_time', 'hs_createdate',
]);

patchHttpListNode('Fetch Contacts Page', 'contacts', 'Code — Append Contacts Page', [
  'hubspot_owner_id', 'firstname', 'lastname', 'email', 'phone', 'hs_lead_status',
  'hs_createdate', 'hs_analytics_source', 'notes_last_contacted',
  'hs_last_booked_meeting_date', 'hs_sales_email_last_replied',
  'last_activity_date', 'num_associated_deals',
]);

patchHttpListNode('Fetch Companies Page', 'companies', 'Code — Append Companies Page', [
  'hubspot_owner_id', 'name', 'domain', 'rank', 'hs_createdate',
  'notes_last_contacted', 'notes_last_updated', 'hs_lastmodifieddate',
  'hs_last_booked_meeting_date', 'hs_sales_email_last_replied',
  'numberofemployees', 'country',
]);

setCode('Code — Append Deals Page', appendCode({
  fetchNode: 'Fetch Deals Page', appendNode: 'Code — Append Deals Page', outputKey: 'allDeals',
}));
setCode('Code — Append Calls Page', appendCode({
  fetchNode: 'Fetch Calls Page', appendNode: 'Code — Append Calls Page', outputKey: 'allCalls', carryKeys: ['allDeals'],
}));
setCode('Code — Append Meetings Page', appendCode({
  fetchNode: 'Fetch Meetings Page', appendNode: 'Code — Append Meetings Page', outputKey: 'allMeetings', carryKeys: ['allDeals', 'allCalls'],
}));
setCode('Code — Append Contacts Page', appendCode({
  fetchNode: 'Fetch Contacts Page', appendNode: 'Code — Append Contacts Page', outputKey: 'allContacts', carryKeys: ['allDeals', 'allCalls', 'allMeetings'],
}));
setCode('Code — Append Companies Page', appendCode({
  fetchNode: 'Fetch Companies Page', appendNode: 'Code — Append Companies Page', outputKey: 'allCompanies', carryKeys: ['allDeals', 'allCalls', 'allMeetings', 'allContacts'],
}));

setCode('Code — Prepare Calls Association Batches', `'use strict';
const CONNECTED_GUID = '${CONNECTED_GUID}';
const allCalls = $('Code — Append Calls Page').last().json.allCalls || [];
const calls = allCalls.filter((call) => String(call.properties?.hs_call_disposition || '') === CONNECTED_GUID);
const output = [];
for (let i = 0; i < calls.length; i += 100) {
  output.push({ json: { batchIndex: Math.floor(i / 100), inputs: calls.slice(i, i + 100).map((call) => ({ id: String(call.id) })) } });
}
return output;`);

setCode('Code — Merge Calls With ContactIds', `'use strict';
const CONNECTED_GUID = '${CONNECTED_GUID}';
const allCalls = $('Code — Append Calls Page').last().json.allCalls || [];
const calls = allCalls.filter((call) => String(call.properties?.hs_call_disposition || '') === CONNECTED_GUID);
const items = $('HTTP — Fetch Calls Contacts Associations').all();
const map = new Map();
for (const item of items) {
  for (const row of item.json.results || []) {
    map.set(String(row.from?.id || ''), (row.to || []).map((x) => String(x.toObjectId || x.id || '')).filter(Boolean));
  }
}
const merged = calls.map((call) => ({ ...call, contactIds: map.get(String(call.id)) || [] }));
return [{ json: { totalCalls: merged.length, callsWithContacts: merged.filter((x) => x.contactIds.length).length, callsWithoutContacts: merged.filter((x) => !x.contactIds.length).length, calls: merged } }];`);

setCode('Code — Prepare Meetings Association Batches', `'use strict';
const allMeetings = $('Code — Append Meetings Page').last().json.allMeetings || [];
const meetings = allMeetings.filter((meeting) => String(meeting.properties?.hs_meeting_outcome || '').trim().toUpperCase() === 'COMPLETED');
const output = [];
for (let i = 0; i < meetings.length; i += 100) {
  output.push({ json: { batchIndex: Math.floor(i / 100), inputs: meetings.slice(i, i + 100).map((meeting) => ({ id: String(meeting.id) })) } });
}
return output;`);

setCode('Code — Merge Meetings With ContactIds', `'use strict';
const allMeetings = $('Code — Append Meetings Page').last().json.allMeetings || [];
const meetings = allMeetings.filter((meeting) => String(meeting.properties?.hs_meeting_outcome || '').trim().toUpperCase() === 'COMPLETED');
const items = $('HTTP — Fetch Meetings Contacts Associations').all();
const map = new Map();
for (const item of items) {
  for (const row of item.json.results || []) {
    map.set(String(row.from?.id || ''), (row.to || []).map((x) => String(x.toObjectId || x.id || '')).filter(Boolean));
  }
}
const merged = meetings.map((meeting) => ({ ...meeting, contactIds: map.get(String(meeting.id)) || [] }));
return [{ json: { totalMeetings: merged.length, meetingsWithContacts: merged.filter((x) => x.contactIds.length).length, meetingsWithoutContacts: merged.filter((x) => !x.contactIds.length).length, meetings: merged } }];`);

const dashboardNode = node('Code in JavaScript');
let dashboardCode = dashboardNode.parameters.jsCode;
const activityDateHelpers = `
function getCallActivityDate(call) {
  const p = call.properties || {};
  return p.hs_timestamp || p.hs_createdate || null;
}
function getMeetingActivityDate(meeting) {
  const p = meeting.properties || {};
  return p.hs_timestamp || p.hs_meeting_start_time || p.hs_createdate || null;
}
`;
if (!dashboardCode.includes('function getCallActivityDate(call)')) {
  dashboardCode = replaceRequired(dashboardCode, 'function isConnectedCall(call) {', `${activityDateHelpers}\nfunction isConnectedCall(call) {`, 'activity-date helper insertion');
}
dashboardCode = replaceRegexRequired(dashboardCode, /const callsYest = allCalls\.filter\(c =>\s*inRange\(c\.properties\?\.hs_createdate, yesterdayStart, yesterdayEnd\)\s*\);/, `const callsYest = allCalls.filter(c =>\n  inRange(getCallActivityDate(c), yesterdayStart, yesterdayEnd)\n);`, 'yesterday calls filter');
dashboardCode = replaceRegexRequired(dashboardCode, /const callsMTD = allCalls\.filter\(c =>\s*inRange\(c\.properties\?\.hs_createdate, mtdStart, nowMs\)\s*\);/, `const callsMTD = allCalls.filter(c =>\n  inRange(getCallActivityDate(c), mtdStart, nowMs)\n);`, 'MTD calls filter');
dashboardCode = replaceRequired(dashboardCode, 'const callsYTD = allCalls;', `const callsYTD = allCalls.filter(c =>\n  inRange(getCallActivityDate(c), ytdStart, nowMs)\n);`, 'YTD calls filter');
dashboardCode = replaceRegexRequired(dashboardCode, /const meetingsYest = allMeetings\.filter\(m =>\s*isCompletedMeeting\(m\) &&\s*inRange\(m\.properties\?\.hs_createdate, yesterdayStart, yesterdayEnd\)\s*\);/, `const meetingsYest = allMeetings.filter(m =>\n  isCompletedMeeting(m) &&\n  inRange(getMeetingActivityDate(m), yesterdayStart, yesterdayEnd)\n);`, 'yesterday meetings filter');
dashboardCode = replaceRegexRequired(dashboardCode, /const meetingsMTD = allMeetings\.filter\(m =>\s*isCompletedMeeting\(m\) &&\s*inRange\(m\.properties\?\.hs_createdate, mtdStart, nowMs\)\s*\);/, `const meetingsMTD = allMeetings.filter(m =>\n  isCompletedMeeting(m) &&\n  inRange(getMeetingActivityDate(m), mtdStart, nowMs)\n);`, 'MTD meetings filter');
dashboardCode = replaceRequired(dashboardCode, 'const meetingsYTD = allMeetings.filter(m => isCompletedMeeting(m));', `const meetingsYTD = allMeetings.filter(m =>\n  isCompletedMeeting(m) &&\n  inRange(getMeetingActivityDate(m), ytdStart, nowMs)\n);`, 'YTD meetings filter');
dashboardCode = replaceRequired(dashboardCode, 'const leadsYTD = validContacts;', `const leadsYTD = validContacts.filter(c =>\n  inRange(getContactCreateDate(c), ytdStart, nowMs)\n);`, 'YTD leads filter');
dashboardCode = replaceRequired(dashboardCode, 'const dealsCreatedYTD = allDeals;', `const dealsCreatedYTD = allDeals.filter(d =>\n  inRange(d.properties?.hs_createdate, ytdStart, nowMs)\n);`, 'YTD deals filter');
dashboardCode = replaceRegexRequired(dashboardCode, /const mktConverted = mktLeads\.filter\(c =>\s*ownersWithDeal\.has\(c\.properties\?\.hubspot_owner_id\)\s*\);/, `const mktConverted = mktLeads.filter(c =>\n  Number(c.properties?.num_associated_deals || 0) > 0\n);`, 'team conversion logic');
dashboardCode = replaceRegexRequired(dashboardCode, /const repMktConverted = repMktLeads\.filter\(c =>\s*ownersWithDeal\.has\(c\.properties\?\.hubspot_owner_id\)\s*\);/, `const repMktConverted = repMktLeads.filter(c =>\n  Number(c.properties?.num_associated_deals || 0) > 0\n);`, 'rep conversion logic');
dashboardCode = replaceRequired(dashboardCode, "date: safeDateOnly(p.hs_createdate),\n    activityDate: safeDateOnly(p.hs_createdate),", "date: safeDateOnly(getCallActivityDate(call)),\n    activityDate: safeDateOnly(getCallActivityDate(call)),", 'call activity row');
dashboardCode = replaceRequired(dashboardCode, "date: safeDateOnly(p.hs_createdate),\n    activityDate: safeDateOnly(p.hs_createdate),", "date: safeDateOnly(getMeetingActivityDate(meeting)),\n    activityDate: safeDateOnly(getMeetingActivityDate(meeting)),", 'meeting activity row');
if (!dashboardCode.includes('const allTimeExport = {')) {
  const block = `// ===============================
// ALL-TIME EXPORTED RECORDS
// ===============================
const connectedCallsAllTime = allCalls.filter(isConnectedCall);
const completedMeetingsAllTime = allMeetings.filter(isCompletedMeeting);
const allTimeExport = {
  generatedAt: new Date().toISOString(),
  scope: { ownerIds: REPS.map((rep) => rep.id), period: 'all_time' },
  counts: {
    contacts: allContacts.length,
    deals: allDeals.length,
    totalCalls: allCalls.length,
    connectedCalls: connectedCallsAllTime.length,
    totalMeetings: allMeetings.length,
    completedMeetings: completedMeetingsAllTime.length,
  },
  contacts: allContacts.map(acqContactRow),
  deals: allDeals.map((deal) => acqDealRow(deal, 'All-Time')),
  connectedCalls: connectedCallsAllTime.map(acqCallRow),
  completedMeetings: completedMeetingsAllTime.map(acqMeetingRow),
};

`;
  dashboardCode = replaceRequired(dashboardCode, '// ===============================\n// RETURN\n// ===============================', `${block}// ===============================\n// RETURN\n// ===============================`, 'all-time export block');
}
if (!/\ballTimeExport\s*,/.test(dashboardCode)) {
  dashboardCode = replaceRequired(dashboardCode, 'financialDetails,\nacquisitionDetails,\nfirstLookSummary,', 'financialDetails,\nacquisitionDetails,\nallTimeExport,\nfirstLookSummary,', 'all-time return property');
}
dashboardNode.parameters.jsCode = dashboardCode;

for (const codeNode of workflow.nodes.filter((item) => item.type === 'n8n-nodes-base.code' && typeof item.parameters?.jsCode === 'string')) {
  try { new Function(codeNode.parameters.jsCode); }
  catch (error) { fail(`JavaScript syntax validation failed in node "${codeNode.name}": ${error.message}`); }
}

fs.writeFileSync(outputPath, `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');
console.log(`Workflow patched successfully: ${outputPath}`);
console.log('Rotate the exposed HubSpot private-app token before running the workflow.');
