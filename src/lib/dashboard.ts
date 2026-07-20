import { CONNECTED_CALL_DISPOSITION, HUBSPOT_PORTAL_ID, hubspotRecordUrl } from "@/lib/config";
import { listDealStages, listOwners, searchAll } from "@/lib/hubspot";
import type {
  AcquisitionDashboardData,
  DealRow,
  HubSpotOwner,
  HubSpotRecord,
  KpiSet,
  LeadRow,
  RepPerformance,
} from "@/lib/types";

const CONTACT_PROPERTIES = [
  "firstname", "lastname", "email", "company", "country", "createdate",
  "hubspot_owner_id", "hs_analytics_source", "hs_lead_status", "lifecyclestage",
  "notes_last_contacted", "notes_next_activity_date",
] as const;

const DEAL_PROPERTIES = [
  "dealname", "dealstage", "pipeline", "amount", "createdate", "closedate",
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

function createEmptyKpis(): KpiSet {
  return {
    newLeads: 0,
    onlineLeads: 0,
    calls: 0,
    connectedCalls: 0,
    connectionRate: 0,
    meetings: 0,
    openDeals: 0,
    openPipeline: 0,
    openTasks: 0,
    overdueTasks: 0,
    dealsAtRisk: 0,
  };
}

function ownerId(record: HubSpotRecord) {
  return value(record, "hubspot_owner_id") || "unassigned";
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

function toLeadRow(record: HubSpotRecord): LeadRow {
  const email = value(record, "email");
  const name = [value(record, "firstname"), value(record, "lastname")].filter(Boolean).join(" ") || email || `Contact ${record.id}`;
  return {
    id: String(record.id),
    ownerId: ownerId(record),
    name,
    email,
    company: value(record, "company"),
    country: value(record, "country"),
    source: sourceLabel(value(record, "hs_analytics_source")),
    leadStatus: value(record, "hs_lead_status") || "New",
    lifecycleStage: value(record, "lifecyclestage"),
    createdAt: value(record, "createdate") || record.createdAt || "",
    lastContacted: value(record, "notes_last_contacted"),
    nextActivity: value(record, "notes_next_activity_date"),
    url: hubspotRecordUrl("contact", String(record.id)),
  };
}

function toDealRow(record: HubSpotRecord, stages: Map<string, string>): DealRow {
  const closeDate = value(record, "closedate");
  const nextActivity = value(record, "notes_next_activity_date");
  const overdue = Boolean(closeDate) && new Date(closeDate).getTime() < Date.now();
  const riskReason = [overdue ? "Close date overdue" : "", !nextActivity ? "No future activity" : ""].filter(Boolean).join(" · ");
  return {
    id: String(record.id),
    ownerId: ownerId(record),
    name: value(record, "dealname") || `Deal ${record.id}`,
    stage: stages.get(value(record, "dealstage")) || value(record, "dealstage") || "Unknown stage",
    amount: numberValue(record, "amount"),
    closeDate,
    nextActivity,
    riskReason,
    url: hubspotRecordUrl("deal", String(record.id)),
  };
}

function computeKpis(
  contacts: HubSpotRecord[],
  calls: HubSpotRecord[],
  meetings: HubSpotRecord[],
  tasks: HubSpotRecord[],
  deals: HubSpotRecord[],
  dealRows: DealRow[],
): KpiSet {
  const connectedCalls = calls.filter((record) => value(record, "hs_call_disposition") === CONNECTED_CALL_DISPOSITION).length;
  const openTasks = tasks.filter((record) => value(record, "hs_task_status").toUpperCase() !== "COMPLETED");
  const overdueTasks = openTasks.filter((record) => {
    const due = value(record, "hs_timestamp");
    return Boolean(due) && new Date(due).getTime() < Date.now();
  }).length;
  const onlineLeads = contacts.filter((record) => {
    const source = value(record, "hs_analytics_source");
    return Boolean(source) && source !== "OFFLINE";
  }).length;
  const dealsAtRisk = dealRows.filter((deal) => Boolean(deal.riskReason)).length;

  return {
    newLeads: contacts.length,
    onlineLeads,
    calls: calls.length,
    connectedCalls,
    connectionRate: calls.length ? Math.round((connectedCalls / calls.length) * 1000) / 10 : 0,
    meetings: meetings.length,
    openDeals: deals.length,
    openPipeline: deals.reduce((total, record) => total + numberValue(record, "amount"), 0),
    openTasks: openTasks.length,
    overdueTasks,
    dealsAtRisk,
  };
}

function metricsForOwner(
  id: string,
  contacts: HubSpotRecord[],
  calls: HubSpotRecord[],
  meetings: HubSpotRecord[],
  tasks: HubSpotRecord[],
  deals: HubSpotRecord[],
  dealRows: DealRow[],
) {
  return computeKpis(
    contacts.filter((record) => ownerId(record) === id),
    calls.filter((record) => ownerId(record) === id),
    meetings.filter((record) => ownerId(record) === id),
    tasks.filter((record) => ownerId(record) === id),
    deals.filter((record) => ownerId(record) === id),
    dealRows.filter((deal) => deal.ownerId === id),
  );
}

export async function buildAcquisitionDashboard(from: string, to: string, bypassCache = false): Promise<AcquisitionDashboardData> {
  const cacheKey = `${from}:${to}`;
  const cached = cache.get(cacheKey);
  if (!bypassCache && cached && cached.expiresAt > Date.now()) return cached.data;

  const warnings: string[] = [];
  const between = { operator: "BETWEEN", value: timestamp(from), highValue: timestamp(to, true) };

  const [owners, stages, contacts, calls, meetings, tasks, openDeals] = await Promise.all([
    safeLoad<HubSpotOwner[]>("Owners", warnings, () => listOwners(), []),
    safeLoad("Deal stages", warnings, () => listDealStages(), new Map<string, string>()),
    safeLoad("Contacts", warnings, () => searchAll("contacts", CONTACT_PROPERTIES, [{ propertyName: "createdate", ...between }], ["-createdate"]), []),
    safeLoad("Calls", warnings, () => searchAll("calls", CALL_PROPERTIES, [{ propertyName: "hs_timestamp", ...between }], ["-hs_timestamp"]), []),
    safeLoad("Meetings", warnings, () => searchAll("meetings", MEETING_PROPERTIES, [{ propertyName: "hs_timestamp", ...between }], ["-hs_timestamp"]), []),
    safeLoad("Tasks", warnings, () => searchAll("tasks", TASK_PROPERTIES, [{ propertyName: "hs_timestamp", ...between }], ["hs_timestamp"]), []),
    safeLoad("Deals", warnings, () => searchAll("deals", DEAL_PROPERTIES, [{ propertyName: "hs_is_closed", operator: "EQ", value: "false" }], ["closedate"]), []),
  ]);

  const leadRows = contacts.map(toLeadRow);
  const dealRows = openDeals.map((record) => toDealRow(record, stages));
  const priorityLeads = leadRows
    .filter((lead) => lead.source !== "Offline Sources" && lead.source !== "Unknown" && !lead.lastContacted)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 100);
  const dealsAtRisk = dealRows.filter((deal) => Boolean(deal.riskReason)).slice(0, 100);

  const ownerMap = new Map(owners.map((owner) => [owner.id, owner]));
  const activeOwnerIds = new Set<string>();
  for (const record of [...contacts, ...calls, ...meetings, ...tasks, ...openDeals]) activeOwnerIds.add(ownerId(record));

  const reps: RepPerformance[] = [...activeOwnerIds]
    .map((id) => {
      const metrics = metricsForOwner(id, contacts, calls, meetings, tasks, openDeals, dealRows);
      return {
        ownerId: id,
        ownerName: id === "unassigned" ? "Unassigned" : ownerMap.get(id)?.name || id,
        ...metrics,
      };
    })
    .sort((left, right) => right.openPipeline - left.openPipeline || right.newLeads - left.newLeads);

  const sourceCounts = new Map<string, number>();
  for (const lead of leadRows) sourceCounts.set(lead.source, (sourceCounts.get(lead.source) ?? 0) + 1);

  const data: AcquisitionDashboardData = {
    meta: {
      generatedAt: new Date().toISOString(),
      from,
      to,
      portalId: HUBSPOT_PORTAL_ID,
      warnings,
    },
    owners,
    kpis: computeKpis(contacts, calls, meetings, tasks, openDeals, dealRows),
    reps,
    sources: [...sourceCounts.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((left, right) => right.count - left.count),
    priorityLeads,
    dealsAtRisk,
    openDeals: dealRows.sort((left, right) => right.amount - left.amount).slice(0, 100),
  };

  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data });
  return data;
}
