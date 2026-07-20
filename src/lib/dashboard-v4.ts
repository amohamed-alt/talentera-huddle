import {
  CONNECTED_CALL_DISPOSITION,
  HUBSPOT_PORTAL_ID,
  HUBSPOT_TIMEZONE,
  hubspotRecordUrl,
} from "@/lib/config";
import {
  batchReadAssociations,
  batchReadObjects,
  listObjectProperties,
  searchAll,
  type AssociationTarget,
  type HubSpotObjectProperty,
} from "@/lib/hubspot";
import { buildDetailedAcquisitionDashboard } from "@/lib/dashboard-v3";
import type { DealRow, HubSpotRecord, KpiSet } from "@/lib/types";
import type {
  AcquisitionCompanyV4,
  AcquisitionDashboardV4,
  AcquisitionLeadV4,
  ActivityRecordV4,
  ActivityTrendPoint,
  BreakdownRow,
  CompanyRankSummary,
  DetailedRepPerformance,
  LeadEligibility,
  RepActivityPoint,
} from "@/lib/dashboard-v4-types";

const ACTIVITY_OWNER_IDS = ["76369997", "31558980", "32332250", "32332251"] as const;
const CACHE_TTL_MS = 10 * 60 * 1000;
const DAY_MS = 86_400_000;

const CALL_PROPERTIES = [
  "hs_timestamp", "hs_call_status", "hs_call_disposition", "hs_call_title", "hubspot_owner_id",
] as const;
const MEETING_PROPERTIES = [
  "hs_timestamp", "hs_meeting_title", "hs_meeting_outcome", "hubspot_owner_id",
] as const;
const TASK_PROPERTIES = [
  "hs_timestamp", "hs_task_status", "hs_task_priority", "hs_task_subject", "hubspot_owner_id",
] as const;
const COMPANY_PROPERTIES = [
  "name", "country", "rank", "company_tier", "hubspot_owner_id", "notes_last_contacted",
  "notes_next_activity_date", "hs_lastmodifieddate",
] as const;

const cache = new Map<string, { expiresAt: number; data: AcquisitionDashboardV4 }>();

function value(record: HubSpotRecord, property: string) {
  return String(record.properties[property] ?? "").trim();
}

function timestamp(date: string, endOfDay = false) {
  return String(new Date(`${date}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`).getTime());
}

function zonedDay(raw: string) {
  if (!raw) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: HUBSPOT_TIMEZONE,
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

function normalizedRank(raw: string) {
  const rank = raw.trim().toUpperCase();
  if (["A", "B", "C"].includes(rank)) return rank;
  return rank ? rank : "Unknown";
}

function humanize(raw: string) {
  if (!raw) return "No status";
  return raw.replace(/[_-]+/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function optionMap(properties: HubSpotObjectProperty[], propertyName: string) {
  const property = properties.find((item) => item.name === propertyName);
  return new Map((property?.options ?? []).map((option) => [option.value, option.label]));
}

function classifyLead(rawStatus: string, lifecycleLabel: string): {
  eligibility: LeadEligibility;
  followUpEligible: boolean;
  exclusionReason: string;
} {
  const status = rawStatus.trim().toUpperCase();
  const lifecycle = lifecycleLabel.trim().toUpperCase();

  if (status === "OPEN_DEAL") {
    return { eligibility: "converted", followUpEligible: false, exclusionReason: "Open Deal" };
  }
  if (status === "UNQUALIFIED" || lifecycle === "UNQUALIFIED") {
    return { eligibility: "excluded", followUpEligible: false, exclusionReason: "Unqualified" };
  }
  if (status === "BAD_TIMING") {
    return { eligibility: "excluded", followUpEligible: false, exclusionReason: "Bad Timing" };
  }
  if (status === "EXISTING CLIENT" || lifecycle === "CUSTOMER") {
    return { eligibility: "excluded", followUpEligible: false, exclusionReason: "Existing Client" };
  }
  if (["LOST", "CHURNED"].includes(lifecycle)) {
    return { eligibility: "excluded", followUpEligible: false, exclusionReason: lifecycleLabel };
  }
  return { eligibility: "follow-up", followUpEligible: true, exclusionReason: "" };
}

function choosePrimaryCompany(targets: AssociationTarget[]) {
  return targets.find((target) => target.labels.some((label) => /primary/i.test(label))) ?? targets[0];
}

async function safeLoad<T>(
  label: string,
  warnings: string[],
  action: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    console.error(`${label} load failed`, error);
    warnings.push(`${label} is temporarily unavailable.`);
    return fallback;
  }
}

function applyLeadMetrics(kpis: KpiSet, leads: AcquisitionLeadV4[]): KpiSet {
  const followUp = leads.filter((lead) => lead.followUpEligible);
  const contacted = followUp.filter((lead) => Boolean(lead.lastContacted));
  const untouched = followUp.filter((lead) => !lead.lastContacted);
  return {
    ...kpis,
    newLeads: leads.length,
    onlineLeads: leads.filter((lead) => lead.sourceBucket === "online").length,
    offlineLeads: leads.filter((lead) => lead.sourceBucket === "offline").length,
    contactedLeads: contacted.length,
    untouchedLeads: untouched.length,
    untouchedOver24h: untouched.filter((lead) => lead.ageHours >= 24).length,
    contactRate: followUp.length ? Math.round((contacted.length / followUp.length) * 1000) / 10 : 0,
  };
}

function breakdown(
  leads: AcquisitionLeadV4[],
  keyFor: (lead: AcquisitionLeadV4) => string,
  labelFor: (lead: AcquisitionLeadV4) => string,
): BreakdownRow[] {
  const rows = new Map<string, { label: string; leads: AcquisitionLeadV4[] }>();
  for (const lead of leads) {
    const key = keyFor(lead) || "__blank";
    const row = rows.get(key) ?? { label: labelFor(lead) || "No status", leads: [] };
    row.leads.push(lead);
    rows.set(key, row);
  }
  return [...rows.entries()].map(([key, row]) => ({
    key,
    label: row.label,
    count: row.leads.length,
    percentage: leads.length ? Math.round((row.leads.length / leads.length) * 1000) / 10 : 0,
    contacted: row.leads.filter((lead) => Boolean(lead.lastContacted)).length,
    untouched: row.leads.filter((lead) => lead.followUpEligible && !lead.lastContacted).length,
    excluded: row.leads.filter((lead) => lead.eligibility === "excluded").length,
  })).sort((left, right) => right.count - left.count);
}

function isCompletedMeeting(record: HubSpotRecord) {
  return /completed|successful|held/i.test(value(record, "hs_meeting_outcome"));
}

function isCompletedTask(record: HubSpotRecord) {
  return value(record, "hs_task_status").toUpperCase() === "COMPLETED";
}

function buildTrend(from: string, to: string, activities: ActivityRecordV4[]): ActivityTrendPoint[] {
  const rows = new Map<string, ActivityTrendPoint>();
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 400) {
    rows.set(cursor, {
      date: cursor,
      calls: 0,
      connectedCalls: 0,
      meetings: 0,
      completedMeetings: 0,
      tasks: 0,
      completedTasks: 0,
    });
    cursor = shiftDay(cursor, 1);
    guard += 1;
  }

  for (const activity of activities) {
    const row = rows.get(zonedDay(activity.timestamp));
    if (!row) continue;
    if (activity.type === "Call") {
      row.calls += 1;
      if (activity.connected) row.connectedCalls += 1;
    }
    if (activity.type === "Meeting") {
      row.meetings += 1;
      if (activity.completed) row.completedMeetings += 1;
    }
    if (activity.type === "Task") {
      row.tasks += 1;
      if (activity.completed) row.completedTasks += 1;
    }
  }

  return [...rows.values()];
}

function buildRepActivity(reps: DetailedRepPerformance[], activities: ActivityRecordV4[]): RepActivityPoint[] {
  return reps.filter((rep) => rep.role === "acquisition").map((rep) => {
    const rows = activities.filter((activity) => activity.ownerId === rep.ownerId);
    return {
      ownerId: rep.ownerId,
      ownerName: rep.ownerName,
      calls: rows.filter((activity) => activity.type === "Call").length,
      connectedCalls: rows.filter((activity) => activity.type === "Call" && activity.connected).length,
      meetings: rows.filter((activity) => activity.type === "Meeting").length,
      completedMeetings: rows.filter((activity) => activity.type === "Meeting" && activity.completed).length,
      tasks: rows.filter((activity) => activity.type === "Task").length,
      completedTasks: rows.filter((activity) => activity.type === "Task" && activity.completed).length,
    };
  });
}

function rankSummary(companies: AcquisitionCompanyV4[]): CompanyRankSummary[] {
  const order = ["A", "B", "C", "Unknown"];
  const ranks = new Set([...order, ...companies.map((company) => company.rank)]);
  return [...ranks].map((rank) => {
    const rows = companies.filter((company) => company.rank === rank);
    return {
      rank,
      companies: rows.length,
      contacts: rows.reduce((sum, company) => sum + company.contacts, 0),
      eligibleContacts: rows.reduce((sum, company) => sum + company.eligibleContacts, 0),
      contactedCompanies: rows.filter((company) => company.contactedContacts > 0).length,
      untouchedCompanies: rows.filter((company) => company.untouchedContacts > 0 && company.contactedContacts === 0).length,
      meetingCompanies: rows.filter((company) => company.hasCompletedMeeting).length,
    };
  }).filter((row) => row.companies > 0).sort((left, right) => {
    const leftIndex = order.indexOf(left.rank);
    const rightIndex = order.indexOf(right.rank);
    return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex);
  });
}

function buildActivityRows(
  records: { calls: HubSpotRecord[]; meetings: HubSpotRecord[]; tasks: HubSpotRecord[] },
  associationMaps: {
    calls: Map<string, AssociationTarget[]>;
    meetings: Map<string, AssociationTarget[]>;
    tasks: Map<string, AssociationTarget[]>;
  },
  leadMap: Map<string, AcquisitionLeadV4>,
  ownerNames: Map<string, string>,
  contactCompanyIds: Map<string, string>,
): ActivityRecordV4[] {
  const rows: ActivityRecordV4[] = [];
  const contactsFor = (type: keyof typeof associationMaps, id: string) =>
    (associationMaps[type].get(id) ?? []).map((target) => target.id);
  const companyIdsFor = (contactIds: string[]) => [...new Set(contactIds.map((id) => contactCompanyIds.get(id) ?? "").filter(Boolean))];
  const contactNamesFor = (contactIds: string[]) => contactIds.map((id) => leadMap.get(id)?.name ?? "").filter(Boolean);

  for (const record of records.calls) {
    const contactIds = contactsFor("calls", String(record.id));
    const ownerId = value(record, "hubspot_owner_id");
    rows.push({
      id: String(record.id),
      type: "Call",
      ownerId,
      ownerName: ownerNames.get(ownerId) ?? ownerId,
      title: value(record, "hs_call_title") || "Sales call",
      timestamp: value(record, "hs_timestamp"),
      status: value(record, "hs_call_status") || "Logged",
      connected: value(record, "hs_call_disposition") === CONNECTED_CALL_DISPOSITION,
      completed: true,
      contactIds,
      contactNames: contactNamesFor(contactIds),
      companyIds: companyIdsFor(contactIds),
      url: hubspotRecordUrl("call", String(record.id)),
    });
  }

  for (const record of records.meetings) {
    const contactIds = contactsFor("meetings", String(record.id));
    const ownerId = value(record, "hubspot_owner_id");
    rows.push({
      id: String(record.id),
      type: "Meeting",
      ownerId,
      ownerName: ownerNames.get(ownerId) ?? ownerId,
      title: value(record, "hs_meeting_title") || "Sales meeting",
      timestamp: value(record, "hs_timestamp"),
      status: value(record, "hs_meeting_outcome") || "Scheduled",
      connected: false,
      completed: isCompletedMeeting(record),
      contactIds,
      contactNames: contactNamesFor(contactIds),
      companyIds: companyIdsFor(contactIds),
      url: hubspotRecordUrl("meeting", String(record.id)),
    });
  }

  for (const record of records.tasks) {
    const contactIds = contactsFor("tasks", String(record.id));
    const ownerId = value(record, "hubspot_owner_id");
    rows.push({
      id: String(record.id),
      type: "Task",
      ownerId,
      ownerName: ownerNames.get(ownerId) ?? ownerId,
      title: value(record, "hs_task_subject") || "Sales task",
      timestamp: value(record, "hs_timestamp"),
      status: value(record, "hs_task_status") || "Open",
      connected: false,
      completed: isCompletedTask(record),
      contactIds,
      contactNames: contactNamesFor(contactIds),
      companyIds: companyIdsFor(contactIds),
      url: hubspotRecordUrl("task", String(record.id)),
    });
  }

  return rows.sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
}

export async function buildAcquisitionDashboardV4(
  from: string,
  to: string,
  bypassCache = false,
): Promise<AcquisitionDashboardV4> {
  const cacheKey = `${from}:${to}`;
  const cached = cache.get(cacheKey);
  if (!bypassCache && cached && cached.expiresAt > Date.now()) return cached.data;

  const warnings: string[] = [];
  const base = await buildDetailedAcquisitionDashboard(from, to, bypassCache);
  warnings.push(...base.meta.warnings);

  const contactProperties = await safeLoad(
    "Contact status definitions",
    warnings,
    () => listObjectProperties("contacts"),
    [],
  );
  const leadStatusLabels = optionMap(contactProperties, "hs_lead_status");
  const lifecycleLabels = optionMap(contactProperties, "lifecyclestage");

  const contactIds = base.allLeads.map((lead) => lead.id);
  const contactCompanyAssociations = await safeLoad(
    "Contact-to-company associations",
    warnings,
    () => batchReadAssociations("contacts", "companies", contactIds),
    new Map<string, AssociationTarget[]>(),
  );
  const contactCompanyIds = new Map<string, string>();
  for (const contactId of contactIds) {
    const primary = choosePrimaryCompany(contactCompanyAssociations.get(contactId) ?? []);
    if (primary) contactCompanyIds.set(contactId, primary.id);
  }

  const companyIds = [...new Set(contactCompanyIds.values())];
  const companyRecords = await safeLoad(
    "Associated companies",
    warnings,
    () => batchReadObjects("companies", companyIds, COMPANY_PROPERTIES),
    [],
  );
  const companyRecordMap = new Map(companyRecords.map((record) => [String(record.id), record]));

  const leads: AcquisitionLeadV4[] = base.allLeads.map((lead) => {
    const companyId = contactCompanyIds.get(lead.id) ?? "";
    const companyRecord = companyRecordMap.get(companyId);
    const rawLeadStatus = lead.leadStatus || "";
    const leadStatusLabel = leadStatusLabels.get(rawLeadStatus) ?? humanize(rawLeadStatus);
    const lifecycleLabel = lifecycleLabels.get(lead.lifecycleStage) ?? humanize(lead.lifecycleStage);
    const eligibility = classifyLead(rawLeadStatus, lifecycleLabel);
    const companyRank = normalizedRank(companyRecord ? value(companyRecord, "rank") || value(companyRecord, "company_tier") : "");
    const companyName = companyRecord ? value(companyRecord, "name") : lead.company;
    const companyCountry = companyRecord ? value(companyRecord, "country") : lead.country;
    return {
      ...lead,
      rank: companyRank === "Unknown" ? "" : companyRank,
      company: companyName || lead.company,
      country: lead.country || companyCountry,
      rawLeadStatus,
      leadStatusLabel,
      lifecycleLabel,
      ...eligibility,
      companyId,
      companyName: companyName || lead.company || "No associated company",
      companyCountry: companyCountry || lead.country,
      companyRank,
      companyUrl: companyId ? hubspotRecordUrl("company", companyId) : "",
    };
  });

  const ownerNames = new Map(base.reps.map((rep) => [rep.ownerId, rep.ownerName]));
  const ownerLeadMap = new Map<string, AcquisitionLeadV4[]>();
  for (const lead of leads) {
    const rows = ownerLeadMap.get(lead.ownerId) ?? [];
    rows.push(lead);
    ownerLeadMap.set(lead.ownerId, rows);
  }
  const reps = base.reps.map((rep) => rep.role === "acquisition"
    ? { ...rep, ...applyLeadMetrics(rep, ownerLeadMap.get(rep.ownerId) ?? []) }
    : rep);
  const kpis = applyLeadMetrics(base.kpis, leads);

  const activityFilters = [
    { propertyName: "hs_timestamp", operator: "BETWEEN", value: timestamp(from), highValue: timestamp(to, true) },
    { propertyName: "hubspot_owner_id", operator: "IN", values: [...ACTIVITY_OWNER_IDS] },
  ];
  const [calls, meetings, tasks] = await Promise.all([
    safeLoad("Calls", warnings, () => searchAll("calls", CALL_PROPERTIES, activityFilters, ["-hs_timestamp"]), []),
    safeLoad("Meetings", warnings, () => searchAll("meetings", MEETING_PROPERTIES, activityFilters, ["-hs_timestamp"]), []),
    safeLoad("Tasks", warnings, () => searchAll("tasks", TASK_PROPERTIES, activityFilters, ["-hs_timestamp"]), []),
  ]);

  const [callAssociations, meetingAssociations, taskAssociations] = await Promise.all([
    safeLoad("Call associations", warnings, () => batchReadAssociations("calls", "contacts", calls.map((record) => String(record.id))), new Map<string, AssociationTarget[]>()),
    safeLoad("Meeting associations", warnings, () => batchReadAssociations("meetings", "contacts", meetings.map((record) => String(record.id))), new Map<string, AssociationTarget[]>()),
    safeLoad("Task associations", warnings, () => batchReadAssociations("tasks", "contacts", tasks.map((record) => String(record.id))), new Map<string, AssociationTarget[]>()),
  ]);

  const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
  const activities = buildActivityRows(
    { calls, meetings, tasks },
    { calls: callAssociations, meetings: meetingAssociations, tasks: taskAssociations },
    leadMap,
    ownerNames,
    contactCompanyIds,
  );

  const companiesById = new Map<string, AcquisitionCompanyV4>();
  for (const companyId of companyIds) {
    const record = companyRecordMap.get(companyId);
    if (!record) continue;
    const companyLeads = leads.filter((lead) => lead.companyId === companyId);
    const lastContactedValues = companyLeads.map((lead) => lead.lastContacted).filter(Boolean).sort();
    const nextActivityValues = companyLeads.map((lead) => lead.nextActivity).filter(Boolean).sort();
    const ownerIds = [...new Set(companyLeads.map((lead) => lead.ownerId).filter(Boolean))];
    companiesById.set(companyId, {
      id: companyId,
      name: value(record, "name") || `Company ${companyId}`,
      country: value(record, "country"),
      rank: normalizedRank(value(record, "rank") || value(record, "company_tier")),
      ownerIds,
      ownerNames: ownerIds.map((id) => ownerNames.get(id) ?? id),
      contacts: companyLeads.length,
      eligibleContacts: companyLeads.filter((lead) => lead.followUpEligible).length,
      contactedContacts: companyLeads.filter((lead) => Boolean(lead.lastContacted)).length,
      untouchedContacts: companyLeads.filter((lead) => lead.followUpEligible && !lead.lastContacted).length,
      unqualifiedContacts: companyLeads.filter((lead) => lead.exclusionReason === "Unqualified").length,
      completedMeetings: 0,
      hasCompletedMeeting: false,
      lastContacted: lastContactedValues.at(-1) ?? value(record, "notes_last_contacted"),
      nextActivity: nextActivityValues[0] ?? value(record, "notes_next_activity_date"),
      url: hubspotRecordUrl("company", companyId),
      contactIds: companyLeads.map((lead) => lead.id),
    });
  }

  for (const meeting of activities.filter((activity) => activity.type === "Meeting" && activity.completed)) {
    for (const companyId of [...new Set(meeting.companyIds)]) {
      const company = companiesById.get(companyId);
      if (!company) continue;
      company.completedMeetings += 1;
      company.hasCompletedMeeting = true;
    }
  }

  const companies = [...companiesById.values()].sort((left, right) => {
    const rankOrder = { A: 0, B: 1, C: 2, Unknown: 3 } as Record<string, number>;
    return (rankOrder[left.rank] ?? 9) - (rankOrder[right.rank] ?? 9) || left.name.localeCompare(right.name);
  });

  const deals = base.allDeals;
  const openDeals = deals.filter((deal) => deal.isOpen).sort((left, right) => right.amount - left.amount);
  const wonDeals = deals.filter((deal) => !deal.isOpen && deal.isWon);
  const lostDeals = deals.filter((deal) => !deal.isOpen && !deal.isWon);
  const dealsAtRisk = openDeals.filter((deal) => Boolean(deal.riskReason));
  const coldDeals = openDeals.filter((deal) => deal.ageDays >= 21);
  const stuckDeals = openDeals.filter((deal) => !deal.nextActivity && deal.ageDays >= 14);
  const noFutureDeals = openDeals.filter((deal) => !deal.nextActivity);
  const overdueDeals = openDeals.filter((deal) => Boolean(deal.closeDate) && new Date(deal.closeDate).getTime() < Date.now());
  const followUpLeads = leads.filter((lead) => lead.followUpEligible && !lead.lastContacted)
    .sort((left, right) => right.priorityScore - left.priorityScore || right.ageHours - left.ageHours);
  const excludedLeads = leads.filter((lead) => lead.eligibility === "excluded");
  const convertedLeads = leads.filter((lead) => lead.eligibility === "converted");

  const data: AcquisitionDashboardV4 = {
    meta: {
      generatedAt: new Date().toISOString(),
      from,
      to,
      portalId: HUBSPOT_PORTAL_ID,
      timezone: HUBSPOT_TIMEZONE,
      uiVersion: "acquisition-intelligence-v4",
      companyRankProperty: "rank",
      companyRankFallbackProperty: "company_tier",
      warnings: [...new Set(warnings)],
    },
    kpis,
    yesterday: base.yesterday,
    reps,
    leads,
    companies,
    deals,
    openDeals,
    wonDeals,
    lostDeals,
    dealsAtRisk,
    coldDeals,
    stuckDeals,
    noFutureDeals,
    overdueDeals,
    followUpLeads,
    excludedLeads,
    convertedLeads,
    leadStatusBreakdown: breakdown(leads, (lead) => lead.rawLeadStatus, (lead) => lead.leadStatusLabel),
    lifecycleBreakdown: breakdown(leads, (lead) => lead.lifecycleStage, (lead) => lead.lifecycleLabel),
    sourceBreakdown: breakdown(leads, (lead) => lead.source, (lead) => lead.source),
    rankSummary: rankSummary(companies),
    activities: activities.slice(0, 7000),
    activityTrend: buildTrend(from, to, activities),
    repActivity: buildRepActivity(reps, activities),
  };

  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data });
  return data;
}
