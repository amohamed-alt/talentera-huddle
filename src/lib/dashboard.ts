import {
  CONNECTED_CALL_DISPOSITION,
  HUBSPOT_PORTAL_ID,
  HUBSPOT_TIMEZONE,
  hubspotRecordUrl,
} from "@/lib/config";
import { listDealStages, listObjectProperties, listOwners, searchAll } from "@/lib/hubspot";
import type {
  AcquisitionDashboardData,
  CountryCoverage,
  DailyActivityDatum,
  DealRow,
  HubSpotOwner,
  HubSpotRecord,
  KpiSet,
  LeadRow,
  RepPerformance,
  SourceBreakdown,
  StageBreakdown,
} from "@/lib/types";

const CONTACT_BASE_PROPERTIES = [
  "firstname", "lastname", "email", "phone", "jobtitle", "company", "country", "createdate",
  "hubspot_owner_id", "hs_analytics_source", "hs_lead_status", "lifecyclestage",
  "notes_last_contacted", "notes_next_activity_date",
] as const;

const DEAL_PROPERTIES = [
  "dealname", "dealstage", "pipeline", "amount", "createdate", "closedate", "hs_lastmodifieddate",
  "hubspot_owner_id", "hs_is_closed", "hs_is_closed_won", "notes_next_activity_date",
] as const;

const CALL_PROPERTIES = [
  "hs_timestamp", "hs_call_status", "hs_call_disposition", "hs_call_title", "hubspot_owner_id",
] as const;

const MEETING_PROPERTIES = [
  "hs_timestamp", "hs_meeting_title", "hs_meeting_outcome", "hubspot_owner_id",
] as const;

const TASK_PROPERTIES = [
  "hs_timestamp", "hs_task_status", "hs_task_priority", "hs_task_subject", "hubspot_owner_id",
] as const;

const cache = new Map<string, { expiresAt: number; data: AcquisitionDashboardData }>();
const CACHE_TTL_MS = 15 * 60 * 1000;
const DAY_MS = 86_400_000;

function value(record: HubSpotRecord, property: string) {
  return String(record.properties[property] ?? "").trim();
}

function numberValue(record: HubSpotRecord, property: string) {
  const parsed = Number(value(record, property));
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestamp(date: string, endOfDay = false) {
  return String(new Date(`${date}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`).getTime());
}

function zonedDay(raw: string, timezone = HUBSPOT_TIMEZONE) {
  if (!raw) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(raw));
}

function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function inRange(raw: string, from: string, to: string) {
  const day = zonedDay(raw);
  return Boolean(day && day >= from && day <= to);
}

function sourceLabel(raw: string) {
  if (!raw) return "Unknown";
  const labels: Record<string, string> = {
    OFFLINE: "Offline Sources",
    DIRECT_TRAFFIC: "Direct Traffic",
    ORGANIC_SEARCH: "Organic Search",
    PAID_SEARCH: "Paid Search",
    SOCIAL_MEDIA: "Organic Social",
    PAID_SOCIAL: "Paid Social",
    EMAIL_MARKETING: "Email Marketing",
    REFERRALS: "Referrals",
    OTHER_CAMPAIGNS: "Other Campaigns",
  };
  return labels[raw] ?? raw.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function sourceBucket(raw: string): LeadRow["sourceBucket"] {
  if (!raw) return "unknown";
  return raw === "OFFLINE" ? "offline" : "online";
}

function normalizedRank(raw: string) {
  const normalized = raw.trim().toUpperCase().replace(/RANK|TIER|COMPANY|ACCOUNT|[-_]/g, " ").replace(/\s+/g, " ").trim();
  if (normalized === "A" || normalized === "1") return "A";
  if (normalized === "B" || normalized === "2") return "B";
  return raw.trim();
}

function createEmptyKpis(): KpiSet {
  return {
    newLeads: 0,
    onlineLeads: 0,
    offlineLeads: 0,
    contactedLeads: 0,
    untouchedLeads: 0,
    untouchedOver24h: 0,
    contactRate: 0,
    calls: 0,
    connectedCalls: 0,
    connectionRate: 0,
    meetingsBooked: 0,
    meetingsCompleted: 0,
    openDeals: 0,
    openPipeline: 0,
    dealsCreated: 0,
    dealsWon: 0,
    dealsLost: 0,
    pipelineCreated: 0,
    wonRevenue: 0,
    openTasks: 0,
    overdueTasks: 0,
    tasksCompleted: 0,
    dealsAtRisk: 0,
    noFutureActivityDeals: 0,
    overdueCloseDeals: 0,
    coldDeals: 0,
    stuckDeals: 0,
  };
}

function ownerId(record: HubSpotRecord) {
  return value(record, "hubspot_owner_id") || "unassigned";
}

function isCompletedTask(record: HubSpotRecord) {
  return value(record, "hs_task_status").toUpperCase() === "COMPLETED";
}

function isCompletedMeeting(record: HubSpotRecord) {
  return /completed|successful|held/i.test(value(record, "hs_meeting_outcome"));
}

async function safeLoad<T>(label: string, warnings: string[], action: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await action();
  } catch (error) {
    console.error(`${label} load failed`, error);
    warnings.push(`${label} data is temporarily unavailable.`);
    return fallback;
  }
}

function findRankProperty(properties: Array<{ name: string; label: string }>) {
  const exactNames = ["company_rank", "account_rank", "company_tier", "account_tier", "rank"];
  for (const name of exactNames) {
    const match = properties.find((property) => property.name.toLowerCase() === name);
    if (match) return match.name;
  }
  const byLabel = properties.find((property) => /(?:company|account).*\b(?:rank|tier)\b|\b(?:rank|tier)\b.*(?:company|account)/i.test(property.label));
  return byLabel?.name ?? "";
}

function toLeadRow(record: HubSpotRecord, owners: Map<string, HubSpotOwner>, rankProperty: string): LeadRow {
  const email = value(record, "email");
  const rawSource = value(record, "hs_analytics_source");
  const createdAt = value(record, "createdate") || record.createdAt || "";
  const lastContacted = value(record, "notes_last_contacted");
  const nextActivity = value(record, "notes_next_activity_date");
  const ageHours = createdAt ? Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 3_600_000)) : 0;
  const rank = rankProperty ? normalizedRank(value(record, rankProperty)) : "";
  const bucket = sourceBucket(rawSource);
  const priorityScore = Math.min(100,
    (!lastContacted ? 30 : 0)
    + (bucket === "online" ? 25 : 5)
    + (ageHours >= 24 ? 20 : 0)
    + (!nextActivity ? 10 : 0)
    + (rank === "A" ? 15 : rank === "B" ? 8 : 0),
  );
  const id = ownerId(record);
  const name = [value(record, "firstname"), value(record, "lastname")].filter(Boolean).join(" ") || email || `Contact ${record.id}`;

  return {
    id: String(record.id),
    ownerId: id,
    ownerName: id === "unassigned" ? "Unassigned" : owners.get(id)?.name || id,
    name,
    email,
    phone: value(record, "phone"),
    title: value(record, "jobtitle"),
    company: value(record, "company"),
    country: value(record, "country"),
    source: sourceLabel(rawSource),
    sourceBucket: bucket,
    leadStatus: value(record, "hs_lead_status") || "New",
    lifecycleStage: value(record, "lifecyclestage"),
    rank,
    createdAt,
    lastContacted,
    nextActivity,
    ageHours,
    priorityScore,
    url: hubspotRecordUrl("contact", String(record.id)),
  };
}

function toDealRow(record: HubSpotRecord, stages: Map<string, string>, owners: Map<string, HubSpotOwner>): DealRow {
  const closeDate = value(record, "closedate");
  const nextActivity = value(record, "notes_next_activity_date");
  const updatedAt = value(record, "hs_lastmodifieddate") || record.updatedAt || value(record, "createdate");
  const isOpen = value(record, "hs_is_closed").toLowerCase() !== "true";
  const isWon = value(record, "hs_is_closed_won").toLowerCase() === "true";
  const overdue = Boolean(isOpen && closeDate) && new Date(closeDate).getTime() < Date.now();
  const ageDays = updatedAt ? Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / DAY_MS)) : 0;
  const cold = isOpen && ageDays >= 21;
  const stuck = isOpen && !nextActivity && ageDays >= 14;
  const riskReason = [
    overdue ? "Close date overdue" : "",
    isOpen && !nextActivity ? "No future activity" : "",
    cold ? "Cold 21+ days" : "",
    stuck ? "Stuck" : "",
  ].filter(Boolean).join(" · ");
  const id = ownerId(record);

  return {
    id: String(record.id),
    ownerId: id,
    ownerName: id === "unassigned" ? "Unassigned" : owners.get(id)?.name || id,
    name: value(record, "dealname") || `Deal ${record.id}`,
    stage: stages.get(value(record, "dealstage")) || value(record, "dealstage") || "Unknown stage",
    pipeline: value(record, "pipeline"),
    amount: numberValue(record, "amount"),
    createdAt: value(record, "createdate") || record.createdAt || "",
    updatedAt,
    closeDate,
    nextActivity,
    isOpen,
    isWon,
    ageDays,
    riskReason,
    url: hubspotRecordUrl("deal", String(record.id)),
  };
}

function computeKpis(
  contacts: HubSpotRecord[],
  calls: HubSpotRecord[],
  meetings: HubSpotRecord[],
  tasks: HubSpotRecord[],
  createdDeals: HubSpotRecord[],
  closedDeals: HubSpotRecord[],
  openDeals: HubSpotRecord[],
  openDealRows: DealRow[],
): KpiSet {
  const connectedCalls = calls.filter((record) => value(record, "hs_call_disposition") === CONNECTED_CALL_DISPOSITION).length;
  const openTasks = tasks.filter((record) => !isCompletedTask(record));
  const completedTasks = tasks.filter(isCompletedTask);
  const overdueTasks = openTasks.filter((record) => {
    const due = value(record, "hs_timestamp");
    return Boolean(due) && new Date(due).getTime() < Date.now();
  }).length;
  const onlineLeads = contacts.filter((record) => sourceBucket(value(record, "hs_analytics_source")) === "online").length;
  const offlineLeads = contacts.filter((record) => sourceBucket(value(record, "hs_analytics_source")) === "offline").length;
  const contactedLeads = contacts.filter((record) => Boolean(value(record, "notes_last_contacted"))).length;
  const untouchedOver24h = contacts.filter((record) => {
    const created = value(record, "createdate") || record.createdAt || "";
    return !value(record, "notes_last_contacted") && Boolean(created) && Date.now() - new Date(created).getTime() >= DAY_MS;
  }).length;
  const wonDeals = closedDeals.filter((record) => value(record, "hs_is_closed_won").toLowerCase() === "true");
  const lostDeals = closedDeals.filter((record) => value(record, "hs_is_closed_won").toLowerCase() !== "true");
  const atRisk = openDealRows.filter((deal) => Boolean(deal.riskReason));
  const noFuture = openDealRows.filter((deal) => !deal.nextActivity);
  const overdueClose = openDealRows.filter((deal) => Boolean(deal.closeDate) && new Date(deal.closeDate).getTime() < Date.now());
  const cold = openDealRows.filter((deal) => deal.ageDays >= 21);
  const stuck = openDealRows.filter((deal) => !deal.nextActivity && deal.ageDays >= 14);

  return {
    newLeads: contacts.length,
    onlineLeads,
    offlineLeads,
    contactedLeads,
    untouchedLeads: Math.max(0, contacts.length - contactedLeads),
    untouchedOver24h,
    contactRate: contacts.length ? Math.round((contactedLeads / contacts.length) * 1000) / 10 : 0,
    calls: calls.length,
    connectedCalls,
    connectionRate: calls.length ? Math.round((connectedCalls / calls.length) * 1000) / 10 : 0,
    meetingsBooked: meetings.length,
    meetingsCompleted: meetings.filter(isCompletedMeeting).length,
    openDeals: openDeals.length,
    openPipeline: openDeals.reduce((total, record) => total + numberValue(record, "amount"), 0),
    dealsCreated: createdDeals.length,
    dealsWon: wonDeals.length,
    dealsLost: lostDeals.length,
    pipelineCreated: createdDeals.reduce((total, record) => total + numberValue(record, "amount"), 0),
    wonRevenue: wonDeals.reduce((total, record) => total + numberValue(record, "amount"), 0),
    openTasks: openTasks.length,
    overdueTasks,
    tasksCompleted: completedTasks.length,
    dealsAtRisk: atRisk.length,
    noFutureActivityDeals: noFuture.length,
    overdueCloseDeals: overdueClose.length,
    coldDeals: cold.length,
    stuckDeals: stuck.length,
  };
}

function metricsForOwner(
  id: string,
  contacts: HubSpotRecord[],
  calls: HubSpotRecord[],
  meetings: HubSpotRecord[],
  tasks: HubSpotRecord[],
  createdDeals: HubSpotRecord[],
  closedDeals: HubSpotRecord[],
  openDeals: HubSpotRecord[],
  openDealRows: DealRow[],
) {
  return computeKpis(
    contacts.filter((record) => ownerId(record) === id),
    calls.filter((record) => ownerId(record) === id),
    meetings.filter((record) => ownerId(record) === id),
    tasks.filter((record) => ownerId(record) === id),
    createdDeals.filter((record) => ownerId(record) === id),
    closedDeals.filter((record) => ownerId(record) === id),
    openDeals.filter((record) => ownerId(record) === id),
    openDealRows.filter((deal) => deal.ownerId === id),
  );
}

function uniqueRecords(records: HubSpotRecord[]) {
  return [...new Map(records.map((record) => [String(record.id), record])).values()];
}

function sourceBreakdown(leads: LeadRow[]): SourceBreakdown[] {
  const rows = new Map<string, SourceBreakdown>();
  for (const lead of leads) {
    const current = rows.get(lead.source) ?? { source: lead.source, count: 0, contacted: 0, untouched: 0 };
    current.count += 1;
    if (lead.lastContacted) current.contacted += 1;
    else current.untouched += 1;
    rows.set(lead.source, current);
  }
  return [...rows.values()].sort((left, right) => right.count - left.count);
}

function countryCoverage(leads: LeadRow[]): CountryCoverage[] {
  const rows = new Map<string, CountryCoverage>();
  for (const lead of leads) {
    const country = lead.country || "Unknown";
    const current = rows.get(country) ?? {
      country,
      leads: 0,
      online: 0,
      contacted: 0,
      untouched: 0,
      rankATotal: 0,
      rankAContacted: 0,
      rankAUntouched: 0,
      rankBTotal: 0,
      rankBContacted: 0,
      rankBUntouched: 0,
    };
    current.leads += 1;
    if (lead.sourceBucket === "online") current.online += 1;
    if (lead.lastContacted) current.contacted += 1;
    else current.untouched += 1;
    if (lead.rank === "A") {
      current.rankATotal += 1;
      if (lead.lastContacted) current.rankAContacted += 1;
      else current.rankAUntouched += 1;
    }
    if (lead.rank === "B") {
      current.rankBTotal += 1;
      if (lead.lastContacted) current.rankBContacted += 1;
      else current.rankBUntouched += 1;
    }
    rows.set(country, current);
  }
  return [...rows.values()].sort((left, right) => right.leads - left.leads);
}

function stageBreakdown(deals: DealRow[]): StageBreakdown[] {
  const rows = new Map<string, StageBreakdown>();
  for (const deal of deals) {
    const current = rows.get(deal.stage) ?? { stage: deal.stage, count: 0, amount: 0 };
    current.count += 1;
    current.amount += deal.amount;
    rows.set(deal.stage, current);
  }
  return [...rows.values()].sort((left, right) => right.amount - left.amount);
}

function dailyActivities(
  from: string,
  to: string,
  contacts: HubSpotRecord[],
  calls: HubSpotRecord[],
  meetings: HubSpotRecord[],
  tasks: HubSpotRecord[],
  deals: HubSpotRecord[],
): DailyActivityDatum[] {
  const rows = new Map<string, DailyActivityDatum>();
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 400) {
    rows.set(cursor, { date: cursor, leads: 0, calls: 0, connected: 0, meetings: 0, tasksCompleted: 0, dealsCreated: 0 });
    cursor = shiftDay(cursor, 1);
    guard += 1;
  }
  const ensure = (day: string) => rows.get(day);
  for (const record of contacts) ensure(zonedDay(value(record, "createdate") || record.createdAt || ""))!.leads += 1;
  for (const record of calls) {
    const row = ensure(zonedDay(value(record, "hs_timestamp")));
    if (!row) continue;
    row.calls += 1;
    if (value(record, "hs_call_disposition") === CONNECTED_CALL_DISPOSITION) row.connected += 1;
  }
  for (const record of meetings) {
    const row = ensure(zonedDay(value(record, "hs_timestamp")));
    if (row) row.meetings += 1;
  }
  for (const record of tasks) {
    const row = ensure(zonedDay(value(record, "hs_timestamp")));
    if (row && isCompletedTask(record)) row.tasksCompleted += 1;
  }
  for (const record of deals) {
    const row = ensure(zonedDay(value(record, "createdate") || record.createdAt || ""));
    if (row) row.dealsCreated += 1;
  }
  return [...rows.values()];
}

export async function buildAcquisitionDashboard(from: string, to: string, bypassCache = false): Promise<AcquisitionDashboardData> {
  const cacheKey = `${from}:${to}`;
  const cached = cache.get(cacheKey);
  if (!bypassCache && cached && cached.expiresAt > Date.now()) return cached.data;

  const warnings: string[] = [];
  const today = zonedDay(new Date().toISOString());
  const yesterday = shiftDay(today, -1);
  const queryFrom = from < yesterday ? from : yesterday;
  const queryTo = to > yesterday ? to : yesterday;
  const combinedBetween = { operator: "BETWEEN", value: timestamp(queryFrom), highValue: timestamp(queryTo, true) };

  const [owners, stages, contactProperties] = await Promise.all([
    safeLoad<HubSpotOwner[]>("Owners", warnings, () => listOwners(), []),
    safeLoad("Deal stages", warnings, () => listDealStages(), new Map<string, string>()),
    safeLoad("Contact properties", warnings, () => listObjectProperties("contacts"), []),
  ]);

  const rankProperty = findRankProperty(contactProperties);
  if (!rankProperty) warnings.push("No contact company-rank property was detected; Rank A/B sections will show zero until one is available.");
  const contactFields = rankProperty ? [...CONTACT_BASE_PROPERTIES, rankProperty] : [...CONTACT_BASE_PROPERTIES];

  const [allContacts, allCalls, allMeetings, allTasks, allCreatedDeals, allClosedDeals, openDeals] = await Promise.all([
    safeLoad("Contacts", warnings, () => searchAll("contacts", contactFields, [{ propertyName: "createdate", ...combinedBetween }], ["-createdate"]), []),
    safeLoad("Calls", warnings, () => searchAll("calls", CALL_PROPERTIES, [{ propertyName: "hs_timestamp", ...combinedBetween }], ["-hs_timestamp"]), []),
    safeLoad("Meetings", warnings, () => searchAll("meetings", MEETING_PROPERTIES, [{ propertyName: "hs_timestamp", ...combinedBetween }], ["-hs_timestamp"]), []),
    safeLoad("Tasks", warnings, () => searchAll("tasks", TASK_PROPERTIES, [{ propertyName: "hs_timestamp", ...combinedBetween }], ["hs_timestamp"]), []),
    safeLoad("Created deals", warnings, () => searchAll("deals", DEAL_PROPERTIES, [{ propertyName: "createdate", ...combinedBetween }], ["-createdate"]), []),
    safeLoad("Closed deals", warnings, () => searchAll("deals", DEAL_PROPERTIES, [{ propertyName: "closedate", ...combinedBetween }], ["-closedate"]), []),
    safeLoad("Open deals", warnings, () => searchAll("deals", DEAL_PROPERTIES, [{ propertyName: "hs_is_closed", operator: "EQ", value: "false" }], ["closedate"]), []),
  ]);

  const ownerMap = new Map(owners.map((owner) => [owner.id, owner]));
  const contacts = allContacts.filter((record) => inRange(value(record, "createdate") || record.createdAt || "", from, to));
  const calls = allCalls.filter((record) => inRange(value(record, "hs_timestamp"), from, to));
  const meetings = allMeetings.filter((record) => inRange(value(record, "hs_timestamp"), from, to));
  const tasks = allTasks.filter((record) => inRange(value(record, "hs_timestamp"), from, to));
  const createdDeals = allCreatedDeals.filter((record) => inRange(value(record, "createdate") || record.createdAt || "", from, to));
  const closedDeals = allClosedDeals.filter((record) => inRange(value(record, "closedate"), from, to));

  const yesterdayContacts = allContacts.filter((record) => inRange(value(record, "createdate") || record.createdAt || "", yesterday, yesterday));
  const yesterdayCalls = allCalls.filter((record) => inRange(value(record, "hs_timestamp"), yesterday, yesterday));
  const yesterdayMeetings = allMeetings.filter((record) => inRange(value(record, "hs_timestamp"), yesterday, yesterday));
  const yesterdayTasks = allTasks.filter((record) => inRange(value(record, "hs_timestamp"), yesterday, yesterday));
  const yesterdayCreatedDeals = allCreatedDeals.filter((record) => inRange(value(record, "createdate") || record.createdAt || "", yesterday, yesterday));
  const yesterdayClosedDeals = allClosedDeals.filter((record) => inRange(value(record, "closedate"), yesterday, yesterday));

  const allDealRecords = uniqueRecords([...openDeals, ...allCreatedDeals, ...allClosedDeals]);
  const allDealRows = allDealRecords.map((record) => toDealRow(record, stages, ownerMap));
  const openDealRows = allDealRows.filter((deal) => deal.isOpen);
  const leadRows = contacts.map((record) => toLeadRow(record, ownerMap, rankProperty));

  const activeOwnerIds = new Set<string>();
  for (const record of [...contacts, ...calls, ...meetings, ...tasks, ...createdDeals, ...closedDeals, ...openDeals]) activeOwnerIds.add(ownerId(record));
  const configuredOwnerIds = (process.env.ACQUISITION_OWNER_IDS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  const ownerIds = configuredOwnerIds.length ? configuredOwnerIds : [...activeOwnerIds];

  const reps: RepPerformance[] = ownerIds.map((id) => ({
    ownerId: id,
    ownerName: id === "unassigned" ? "Unassigned" : ownerMap.get(id)?.name || id,
    ownerEmail: ownerMap.get(id)?.email,
    ...metricsForOwner(id, contacts, calls, meetings, tasks, createdDeals, closedDeals, openDeals, openDealRows),
  })).sort((left, right) => right.openPipeline - left.openPipeline || right.newLeads - left.newLeads);

  const kpis = computeKpis(contacts, calls, meetings, tasks, createdDeals, closedDeals, openDeals, openDealRows);
  const yesterdayKpis = computeKpis(
    yesterdayContacts,
    yesterdayCalls,
    yesterdayMeetings,
    yesterdayTasks,
    yesterdayCreatedDeals,
    yesterdayClosedDeals,
    openDeals,
    openDealRows,
  );

  const priorityLeads = [...leadRows]
    .sort((left, right) => right.priorityScore - left.priorityScore || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const onlineLeads = priorityLeads.filter((lead) => lead.sourceBucket === "online");
  const offlineLeads = priorityLeads.filter((lead) => lead.sourceBucket === "offline");
  const dealsAtRisk = openDealRows.filter((deal) => Boolean(deal.riskReason)).sort((left, right) => right.amount - left.amount);
  const noFutureActivityDeals = openDealRows.filter((deal) => !deal.nextActivity).sort((left, right) => right.amount - left.amount);
  const overdueCloseDeals = openDealRows.filter((deal) => Boolean(deal.closeDate) && new Date(deal.closeDate).getTime() < Date.now()).sort((left, right) => right.amount - left.amount);
  const coldDeals = openDealRows.filter((deal) => deal.ageDays >= 21).sort((left, right) => right.ageDays - left.ageDays);
  const stuckDeals = openDealRows.filter((deal) => !deal.nextActivity && deal.ageDays >= 14).sort((left, right) => right.ageDays - left.ageDays);

  const financialDeals = allDealRows.filter((deal) => inRange(deal.createdAt || deal.closeDate, from, to) || deal.isOpen);
  const sumByStage = (pattern: RegExp) => financialDeals.filter((deal) => pattern.test(deal.stage)).reduce((sum, deal) => sum + deal.amount, 0);
  const data: AcquisitionDashboardData = {
    meta: {
      generatedAt: new Date().toISOString(),
      from,
      to,
      portalId: HUBSPOT_PORTAL_ID,
      timezone: HUBSPOT_TIMEZONE,
      rankProperty,
      warnings,
    },
    owners,
    kpis,
    yesterday: yesterdayKpis,
    reps,
    sources: sourceBreakdown(leadRows),
    countries: countryCoverage(leadRows),
    stages: stageBreakdown(openDealRows),
    dailyActivities: dailyActivities(from, to, contacts, calls, meetings, tasks, createdDeals),
    financial: {
      signedContract: sumByStage(/signed|contract/i),
      booked: sumByStage(/booked|booking/i),
      cashing: sumByStage(/cash|collect/i),
      wonRevenue: kpis.wonRevenue,
      openPipeline: kpis.openPipeline,
      atRiskPipeline: dealsAtRisk.reduce((sum, deal) => sum + deal.amount, 0),
    },
    allLeads: priorityLeads.slice(0, 2000),
    priorityLeads: priorityLeads.slice(0, 250),
    onlineLeads: onlineLeads.slice(0, 500),
    offlineLeads: offlineLeads.slice(0, 500),
    allDeals: allDealRows.slice(0, 1500),
    dealsAtRisk: dealsAtRisk.slice(0, 500),
    noFutureActivityDeals: noFutureActivityDeals.slice(0, 500),
    overdueCloseDeals: overdueCloseDeals.slice(0, 500),
    coldDeals: coldDeals.slice(0, 500),
    stuckDeals: stuckDeals.slice(0, 500),
    openDeals: [...openDealRows].sort((left, right) => right.amount - left.amount).slice(0, 1000),
  };

  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data });
  return data;
}
