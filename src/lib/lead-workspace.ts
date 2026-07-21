import { promises as fs } from "node:fs";
import path from "node:path";
import { ACQUISITION_OWNER_IDS, ACQUISITION_REPS } from "@/lib/acquisition-reps";
import { CONNECTED_CALL_DISPOSITION, HUBSPOT_TIMEZONE, hubspotRecordUrl } from "@/lib/config";
import {
  batchReadAssociations,
  batchReadObjects,
  listObjectProperties,
  searchAll,
  type AssociationTarget,
  type HubSpotObjectProperty,
  type SearchFilter,
} from "@/lib/hubspot";
import type { HubSpotRecord } from "@/lib/types";
import type {
  WorkspaceActivity,
  WorkspaceAdvice,
  WorkspaceChange,
  WorkspaceLead,
  WorkspaceLeadDetail,
  WorkspaceLeadState,
  WorkspacePageResponse,
  WorkspaceSummary,
  WorkspaceTask,
} from "@/lib/lead-workspace-types";

const CACHE_DIR = process.env.LEAD_WORKSPACE_CACHE_DIR || path.join(process.cwd(), "data");
const DELTA_INTERVAL_MS = 5 * 60 * 1000;
const FULL_INTERVAL_MS = 12 * 60 * 60 * 1000;
const CHANGE_JOURNAL_LIMIT = 750;
const MAX_PAGE_SIZE = 100;
const DAY_MS = 86_400_000;

const CONTACT_PROPERTIES = [
  "firstname", "lastname", "email", "phone", "jobtitle", "company", "country",
  "createdate", "hs_lastmodifieddate", "hubspot_owner_id", "hs_analytics_source",
  "hs_lead_status", "lifecyclestage", "notes_last_contacted", "notes_next_activity_date",
] as const;
const COMPANY_PROPERTIES = ["name", "country", "rank", "company_tier", "hs_lastmodifieddate"] as const;
const TASK_PROPERTIES = [
  "hs_timestamp", "hs_task_status", "hs_task_priority", "hs_task_subject", "hs_task_body",
  "hubspot_owner_id", "hs_lastmodifieddate",
] as const;
const CALL_PROPERTIES = [
  "hs_timestamp", "hs_call_status", "hs_call_disposition", "hs_call_title", "hubspot_owner_id",
] as const;
const MEETING_PROPERTIES = [
  "hs_timestamp", "hs_meeting_title", "hs_meeting_outcome", "hubspot_owner_id",
] as const;

interface WorkspaceSnapshot {
  schemaVersion: 1;
  year: number;
  version: number;
  generatedAt: string;
  fullSyncedAt: string;
  cursor: string;
  leads: WorkspaceLead[];
  changes: WorkspaceChange[];
}

interface WorkspaceQuery {
  year: number;
  ownerId: string;
  source: "all" | "online" | "offline" | "unknown";
  state: "all" | WorkspaceLeadState;
  rank: string;
  search: string;
  page: number;
  pageSize: number;
  since: string;
  refresh: "none" | "delta" | "full";
}

const syncLocks = new Map<number, Promise<WorkspaceSnapshot>>();
let statusDefinitionCache: {
  expiresAt: number;
  leadStatuses: Map<string, string>;
  lifecycleStages: Map<string, string>;
} | null = null;

function value(record: HubSpotRecord, property: string) {
  return String(record.properties[property] ?? "").trim();
}

function humanize(raw: string) {
  if (!raw) return "No status";
  return raw.replace(/[_-]+/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function timestamp(date: Date) {
  return String(date.getTime());
}

function yearStart(year: number) {
  return new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
}

function yearEnd(year: number) {
  return new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
}

function snapshotPath(year: number) {
  return path.join(CACHE_DIR, year === 0 ? "lead-workspace-all.json" : `lead-workspace-${year}.json`);
}

function optionMap(properties: HubSpotObjectProperty[], propertyName: string) {
  const property = properties.find((item) => item.name === propertyName);
  return new Map((property?.options ?? []).map((option) => [option.value, option.label]));
}

async function loadStatusDefinitions() {
  if (statusDefinitionCache && statusDefinitionCache.expiresAt > Date.now()) return statusDefinitionCache;
  try {
    const properties = await listObjectProperties("contacts");
    statusDefinitionCache = {
      expiresAt: Date.now() + FULL_INTERVAL_MS,
      leadStatuses: optionMap(properties, "hs_lead_status"),
      lifecycleStages: optionMap(properties, "lifecyclestage"),
    };
  } catch (error) {
    console.error("Lead workspace status definitions failed", error);
    statusDefinitionCache = {
      expiresAt: Date.now() + DELTA_INTERVAL_MS,
      leadStatuses: new Map(),
      lifecycleStages: new Map(),
    };
  }
  return statusDefinitionCache;
}

function normalizedRank(raw: string) {
  const rank = raw.trim().toUpperCase();
  return ["A", "B", "C"].includes(rank) ? rank : "Unknown";
}

function sourceDetails(raw: string): { label: string; bucket: WorkspaceLead["sourceBucket"] } {
  if (!raw) return { label: "Unknown", bucket: "unknown" };
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
  return {
    label: labels[raw] ?? humanize(raw),
    bucket: raw === "OFFLINE" ? "offline" : "online",
  };
}

function classifyLead(rawStatus: string, lifecycleStage: string) {
  const status = rawStatus.trim().toUpperCase();
  const lifecycle = lifecycleStage.trim().toUpperCase();
  if (status === "OPEN_DEAL" || lifecycle === "OPPORTUNITY") {
    return { eligibility: "converted" as const, exclusionReason: "Open Deal / Opportunity" };
  }
  if (status === "UNQUALIFIED" || lifecycle === "UNQUALIFIED") {
    return { eligibility: "excluded" as const, exclusionReason: "Unqualified" };
  }
  if (status === "BAD_TIMING") {
    return { eligibility: "excluded" as const, exclusionReason: "Bad Timing" };
  }
  if (status === "EXISTING CLIENT" || lifecycle === "CUSTOMER") {
    return { eligibility: "excluded" as const, exclusionReason: "Existing Client" };
  }
  if (["LOST", "CHURNED"].includes(lifecycle)) {
    return { eligibility: "excluded" as const, exclusionReason: humanize(lifecycle) };
  }
  return { eligibility: "follow-up" as const, exclusionReason: "" };
}

function leadState(lead: Pick<WorkspaceLead, "eligibility" | "exclusionReason" | "sourceBucket" | "lastContacted">): WorkspaceLeadState {
  if (lead.eligibility === "converted") return "converted";
  if (lead.exclusionReason === "Unqualified") return "unqualified";
  if (lead.eligibility === "excluded") return "excluded";
  if (lead.sourceBucket === "online") return lead.lastContacted ? "online-contacted" : "online-untouched";
  if (lead.sourceBucket === "offline") return lead.lastContacted ? "offline-contacted" : "offline-untouched";
  return "unknown";
}

function adviceFor(lead: Pick<WorkspaceLead, "eligibility" | "exclusionReason" | "sourceBucket" | "lastContacted" | "nextActivity" | "companyRank" | "ageHours" | "phone" | "email">): WorkspaceAdvice {
  if (lead.eligibility === "converted") {
    return {
      urgency: "none",
      title: "Work from the open deal",
      reason: "This lead has already moved into an opportunity. Keep the next step on the deal rather than restarting lead outreach.",
      suggestedChannels: ["Deal activity"],
      taskSuggestion: "Confirm the deal has a future activity and an owner.",
    };
  }
  if (lead.eligibility === "excluded") {
    return {
      urgency: "none",
      title: "Keep out of the active queue",
      reason: lead.exclusionReason || "The current HubSpot status excludes this record from follow-up.",
      suggestedChannels: [],
      taskSuggestion: "Only review the status if it looks stale or incorrectly classified.",
    };
  }
  if (!lead.lastContacted && lead.sourceBucket === "online") {
    const critical = lead.ageHours >= 24 || ["A", "B"].includes(lead.companyRank);
    return {
      urgency: critical ? "critical" : "high",
      title: critical ? "Contact this inbound lead now" : "Make the first inbound touch",
      reason: `${lead.companyRank === "A" || lead.companyRank === "B" ? `Rank ${lead.companyRank} company · ` : ""}${lead.ageHours} hours since creation with no Last Contacted value.`,
      suggestedChannels: [lead.phone ? "Call" : "Email", "Email", "LinkedIn", "WhatsApp after first touch"],
      taskSuggestion: "Log the first touch and set a dated follow-up task before leaving the record.",
    };
  }
  if (!lead.lastContacted && lead.sourceBucket === "offline") {
    return {
      urgency: lead.companyRank === "A" ? "high" : "medium",
      title: "Research a trigger before outreach",
      reason: "This is an outbound/offline lead. A hiring, funding, expansion or technology signal will make the first message more relevant.",
      suggestedChannels: ["Email", "LinkedIn", "Call"],
      taskSuggestion: "Add one verified trigger or pain point, then schedule the first-touch task.",
    };
  }
  if (lead.lastContacted && !lead.nextActivity) {
    return {
      urgency: ["A", "B"].includes(lead.companyRank) ? "high" : "medium",
      title: "Create the missing next step",
      reason: "The lead was contacted but has no future activity, so it can silently fall out of the working queue.",
      suggestedChannels: ["Email follow-up", "Call", "LinkedIn"],
      taskSuggestion: "Create a dated follow-up task with the channel and intended outcome.",
    };
  }
  if (lead.lastContacted && lead.nextActivity) {
    return {
      urgency: "low",
      title: "Follow the scheduled task",
      reason: "The lead has contact history and a future activity. Keep the cadence consistent and update the outcome after execution.",
      suggestedChannels: ["Scheduled channel"],
      taskSuggestion: "Complete or reschedule the existing task after the next touch.",
    };
  }
  return {
    urgency: "medium",
    title: "Validate source and ownership",
    reason: "The source could not be classified as online or offline, so the record needs a quick data-quality check.",
    suggestedChannels: [lead.email ? "Email" : "LinkedIn"],
    taskSuggestion: "Confirm source, owner and the next activity.",
  };
}

function deriveLead(lead: WorkspaceLead): WorkspaceLead {
  const createdTime = new Date(lead.createdAt).getTime();
  const ageHours = Number.isFinite(createdTime) ? Math.max(0, Math.floor((Date.now() - createdTime) / 3_600_000)) : 0;
  const derived = { ...lead, ageHours };
  const state = leadState(derived);
  let priorityScore = 0;
  if (derived.eligibility === "follow-up") {
    if (!derived.lastContacted) priorityScore += 40;
    if (derived.sourceBucket === "online") priorityScore += 25;
    if (derived.companyRank === "A") priorityScore += 20;
    else if (derived.companyRank === "B") priorityScore += 12;
    if (ageHours >= 24 && !derived.lastContacted) priorityScore += 15;
    if (!derived.nextActivity) priorityScore += 10;
    if (derived.phone) priorityScore += 5;
  }
  return {
    ...derived,
    state,
    priorityScore: Math.min(100, priorityScore),
    advice: adviceFor(derived),
  };
}

function choosePrimaryCompany(targets: AssociationTarget[]) {
  return targets.find((target) => target.labels.some((label) => /primary/i.test(label))) ?? targets[0];
}

async function buildLeads(records: HubSpotRecord[]): Promise<WorkspaceLead[]> {
  if (!records.length) return [];
  const definitions = await loadStatusDefinitions();
  const contactIds = records.map((record) => String(record.id));
  const associations = await batchReadAssociations("contacts", "companies", contactIds);
  const companyByContact = new Map<string, string>();
  for (const contactId of contactIds) {
    const primary = choosePrimaryCompany(associations.get(contactId) ?? []);
    if (primary) companyByContact.set(contactId, primary.id);
  }
  const companyIds = [...new Set(companyByContact.values())];
  const companies = await batchReadObjects("companies", companyIds, COMPANY_PROPERTIES);
  const companyMap = new Map(companies.map((record) => [String(record.id), record]));

  return records.map((record) => {
    const id = String(record.id);
    const companyId = companyByContact.get(id) ?? "";
    const companyRecord = companyMap.get(companyId);
    const rawLeadStatus = value(record, "hs_lead_status");
    const lifecycleStage = value(record, "lifecyclestage");
    const eligibility = classifyLead(rawLeadStatus, lifecycleStage);
    const source = sourceDetails(value(record, "hs_analytics_source"));
    const companyName = companyRecord ? value(companyRecord, "name") : value(record, "company");
    const companyCountry = companyRecord ? value(companyRecord, "country") : value(record, "country");
    const companyRank = normalizedRank(companyRecord ? value(companyRecord, "rank") || value(companyRecord, "company_tier") : "");
    const ownerId = value(record, "hubspot_owner_id");
    const name = [value(record, "firstname"), value(record, "lastname")].filter(Boolean).join(" ") || value(record, "email") || `Contact ${id}`;
    const createdAt = value(record, "createdate") || record.createdAt || "";
    const modifiedAt = value(record, "hs_lastmodifieddate") || record.updatedAt || createdAt;
    const base: WorkspaceLead = {
      id,
      name,
      email: value(record, "email"),
      phone: value(record, "phone"),
      title: value(record, "jobtitle"),
      company: companyName || value(record, "company"),
      country: value(record, "country") || companyCountry,
      ownerId,
      ownerName: ACQUISITION_REPS.find((owner) => owner.id === ownerId)?.name ?? ownerId,
      source: source.label,
      sourceBucket: source.bucket,
      rawLeadStatus,
      leadStatusLabel: definitions.leadStatuses.get(rawLeadStatus) ?? humanize(rawLeadStatus),
      lifecycleStage,
      lifecycleLabel: definitions.lifecycleStages.get(lifecycleStage) ?? humanize(lifecycleStage),
      createdAt,
      modifiedAt,
      lastContacted: value(record, "notes_last_contacted"),
      nextActivity: value(record, "notes_next_activity_date"),
      ageHours: 0,
      companyId,
      companyName: companyName || "No associated company",
      companyCountry,
      companyRank,
      ...eligibility,
      state: "unknown",
      priorityScore: 0,
      advice: { urgency: "none", title: "", reason: "", suggestedChannels: [], taskSuggestion: "" },
      url: hubspotRecordUrl("contact", id),
      companyUrl: companyId ? hubspotRecordUrl("company", companyId) : "",
    };
    return deriveLead(base);
  });
}

const comparableFields: Array<keyof WorkspaceLead> = [
  "name", "email", "phone", "title", "company", "country", "ownerId", "source", "sourceBucket",
  "rawLeadStatus", "leadStatusLabel", "lifecycleStage", "lifecycleLabel", "createdAt", "modifiedAt",
  "lastContacted", "nextActivity", "companyId", "companyName", "companyCountry", "companyRank",
  "eligibility", "exclusionReason",
];

function changedFields(previous: WorkspaceLead, next: WorkspaceLead) {
  return comparableFields.filter((field) => previous[field] !== next[field]).map(String);
}

function changeFor(previous: WorkspaceLead | undefined, next: WorkspaceLead, changedAt: string): WorkspaceChange | null {
  if (!previous) {
    return { leadId: next.id, leadName: next.name, type: "added", changedAt, fields: ["created"], state: next.state };
  }
  const fields = changedFields(previous, next);
  if (!fields.length) return null;
  return { leadId: next.id, leadName: next.name, type: "updated", changedAt, fields, state: next.state };
}

function appendChanges(existing: WorkspaceChange[], incoming: WorkspaceChange[]) {
  return [...incoming, ...existing]
    .sort((left, right) => new Date(right.changedAt).getTime() - new Date(left.changedAt).getTime())
    .slice(0, CHANGE_JOURNAL_LIMIT);
}

async function readSnapshot(year: number): Promise<WorkspaceSnapshot | null> {
  try {
    const raw = await fs.readFile(snapshotPath(year), "utf8");
    const parsed = JSON.parse(raw) as WorkspaceSnapshot;
    if (parsed.schemaVersion !== 1 || parsed.year !== year || !Array.isArray(parsed.leads)) return null;
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("Lead workspace snapshot read failed", error);
    return null;
  }
}

async function writeSnapshot(snapshot: WorkspaceSnapshot) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const target = snapshotPath(snapshot.year);
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(snapshot), "utf8");
  await fs.rename(temporary, target);
}

async function fullSync(year: number, previous: WorkspaceSnapshot | null): Promise<WorkspaceSnapshot> {
  const now = new Date();
  const end = year === now.getUTCFullYear() ? now : yearEnd(year);
  const filters: SearchFilter[] = [
    { propertyName: "hubspot_owner_id", operator: "IN", values: [...ACQUISITION_OWNER_IDS] },
  ];
  if (year !== 0) {
    filters.unshift({ propertyName: "createdate", operator: "BETWEEN", value: timestamp(yearStart(year)), highValue: timestamp(end) });
  }
  const records = await searchAll("contacts", CONTACT_PROPERTIES, filters, ["-createdate"]);
  const leads = await buildLeads(records);
  const changedAt = now.toISOString();
  const previousMap = new Map((previous?.leads ?? []).map((lead) => [lead.id, lead]));
  const nextIds = new Set(leads.map((lead) => lead.id));
  const changes = leads.map((lead) => changeFor(previousMap.get(lead.id), lead, changedAt)).filter((change): change is WorkspaceChange => Boolean(change));
  for (const oldLead of previous?.leads ?? []) {
    if (!nextIds.has(oldLead.id)) {
      changes.push({ leadId: oldLead.id, leadName: oldLead.name, type: "removed", changedAt, fields: ["removed from YTD acquisition scope"], state: oldLead.state });
    }
  }
  const snapshot: WorkspaceSnapshot = {
    schemaVersion: 1,
    year,
    version: (previous?.version ?? 0) + 1,
    generatedAt: changedAt,
    fullSyncedAt: changedAt,
    cursor: changedAt,
    leads,
    changes: appendChanges(previous?.changes ?? [], changes),
  };
  await writeSnapshot(snapshot);
  return snapshot;
}

async function deltaSync(year: number, previous: WorkspaceSnapshot): Promise<WorkspaceSnapshot> {
  const now = new Date();
  const end = year === now.getUTCFullYear() ? now : yearEnd(year);
  const previousCursor = new Date(previous.cursor).getTime();
  const floor = year === 0 ? 0 : yearStart(year).getTime();
  const overlapStart = new Date(Math.max(floor, Number.isFinite(previousCursor) ? previousCursor - DELTA_INTERVAL_MS : floor));
  const filters: SearchFilter[] = [
    { propertyName: "hs_lastmodifieddate", operator: "BETWEEN", value: timestamp(overlapStart), highValue: timestamp(now) },
    { propertyName: "hubspot_owner_id", operator: "IN", values: [...ACQUISITION_OWNER_IDS] },
  ];
  if (year !== 0) {
    filters.unshift({ propertyName: "createdate", operator: "BETWEEN", value: timestamp(yearStart(year)), highValue: timestamp(end) });
  }
  const records = await searchAll("contacts", CONTACT_PROPERTIES, filters, ["-hs_lastmodifieddate"]);
  const updatedLeads = await buildLeads(records);
  const leadMap = new Map(previous.leads.map((lead) => [lead.id, lead]));
  const changes: WorkspaceChange[] = [];
  const changedAt = now.toISOString();
  for (const lead of updatedLeads) {
    const change = changeFor(leadMap.get(lead.id), lead, changedAt);
    if (change) changes.push(change);
    leadMap.set(lead.id, lead);
  }
  const snapshot: WorkspaceSnapshot = {
    ...previous,
    version: previous.version + 1,
    generatedAt: changedAt,
    cursor: changedAt,
    leads: [...leadMap.values()],
    changes: appendChanges(previous.changes, changes),
  };
  await writeSnapshot(snapshot);
  return snapshot;
}

async function runLocked(year: number, action: () => Promise<WorkspaceSnapshot>) {
  const existing = syncLocks.get(year);
  if (existing) return existing;
  const request = action().finally(() => syncLocks.delete(year));
  syncLocks.set(year, request);
  return request;
}

async function ensureSnapshot(year: number, refresh: WorkspaceQuery["refresh"]): Promise<{ snapshot: WorkspaceSnapshot; mode: "cache" | "delta" | "full" }> {
  const snapshot = await readSnapshot(year);
  if (!snapshot || refresh === "full") {
    return { snapshot: await runLocked(year, () => fullSync(year, snapshot)), mode: "full" };
  }
  if (refresh === "delta") {
    return { snapshot: await runLocked(year, () => deltaSync(year, snapshot)), mode: "delta" };
  }
  return { snapshot, mode: "cache" };
}

function summaryFor(leads: WorkspaceLead[]): WorkspaceSummary {
  const eligible = leads.filter((lead) => lead.eligibility === "follow-up");
  const contacted = eligible.filter((lead) => Boolean(lead.lastContacted));
  const untouched = eligible.filter((lead) => !lead.lastContacted);
  return {
    total: leads.length,
    followUpEligible: eligible.length,
    contacted: contacted.length,
    untouched: untouched.length,
    onlineUntouched: leads.filter((lead) => lead.state === "online-untouched").length,
    onlineContacted: leads.filter((lead) => lead.state === "online-contacted").length,
    offlineUntouched: leads.filter((lead) => lead.state === "offline-untouched").length,
    offlineContacted: leads.filter((lead) => lead.state === "offline-contacted").length,
    unqualified: leads.filter((lead) => lead.state === "unqualified").length,
    converted: leads.filter((lead) => lead.state === "converted").length,
    excluded: leads.filter((lead) => lead.state === "excluded").length,
    rankA: leads.filter((lead) => lead.companyRank === "A").length,
    rankB: leads.filter((lead) => lead.companyRank === "B").length,
    overdueFollowUps: eligible.filter((lead) => !lead.lastContacted && lead.ageHours >= 24).length,
    noNextActivity: eligible.filter((lead) => Boolean(lead.lastContacted) && !lead.nextActivity).length,
  };
}

function matchesSearch(lead: WorkspaceLead, search: string) {
  if (!search) return true;
  const haystack = [lead.name, lead.email, lead.phone, lead.title, lead.companyName, lead.companyCountry, lead.leadStatusLabel]
    .join(" ").toLowerCase();
  return haystack.includes(search.toLowerCase());
}

export async function queryLeadWorkspace(query: WorkspaceQuery): Promise<WorkspacePageResponse> {
  const { snapshot, mode } = await ensureSnapshot(query.year, query.refresh);
  const allLeads = snapshot.leads.map(deriveLead);
  const baseFiltered = allLeads.filter((lead) =>
    (query.ownerId === "all" || lead.ownerId === query.ownerId)
    && (query.source === "all" || lead.sourceBucket === query.source)
    && (query.rank === "all" || lead.companyRank === query.rank)
    && matchesSearch(lead, query.search));
  const filtered = baseFiltered.filter((lead) => query.state === "all" || lead.state === query.state)
    .sort((left, right) => right.priorityScore - left.priorityScore
      || new Date(right.modifiedAt).getTime() - new Date(left.modifiedAt).getTime()
      || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(10, query.pageSize));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, query.page), totalPages);
  const start = (page - 1) * pageSize;
  const visibleIds = new Set(baseFiltered.map((lead) => lead.id));
  const sinceTime = query.since ? new Date(query.since).getTime() : 0;
  const changes = snapshot.changes.filter((change) =>
    visibleIds.has(change.leadId)
    && (!sinceTime || new Date(change.changedAt).getTime() > sinceTime));

  return {
    meta: {
      year: query.year,
      generatedAt: snapshot.generatedAt,
      fullSyncedAt: snapshot.fullSyncedAt,
      cursor: snapshot.cursor,
      version: snapshot.version,
      totalSnapshotLeads: snapshot.leads.length,
      page,
      pageSize,
      totalFiltered: filtered.length,
      totalPages,
      syncMode: mode,
      staleAfterSeconds: Math.floor(DELTA_INTERVAL_MS / 1000),
    },
    summary: summaryFor(baseFiltered),
    owners: ACQUISITION_REPS.map((owner) => ({ id: owner.id, name: owner.name })),
    rows: filtered.slice(start, start + pageSize),
    changes,
  };
}

async function upsertRefreshedLead(lead: WorkspaceLead) {
  const created = new Date(lead.createdAt);
  if (Number.isNaN(created.getTime())) return;
  const year = 0;
  const snapshot = await readSnapshot(year);
  if (!snapshot) return;
  const map = new Map(snapshot.leads.map((row) => [row.id, row]));
  const change = changeFor(map.get(lead.id), lead, new Date().toISOString());
  map.set(lead.id, lead);
  if (!change) return;
  await writeSnapshot({
    ...snapshot,
    version: snapshot.version + 1,
    generatedAt: change.changedAt,
    cursor: change.changedAt,
    leads: [...map.values()],
    changes: appendChanges(snapshot.changes, [change]),
  });
}

async function refreshLead(contactId: string) {
  const records = await batchReadObjects("contacts", [contactId], CONTACT_PROPERTIES);
  if (!records.length) throw new Error("Lead not found in HubSpot");
  const leads = await buildLeads(records);
  if (!leads.length) throw new Error("Lead could not be resolved");
  const lead = deriveLead(leads[0]);
  await upsertRefreshedLead(lead);
  return lead;
}

function taskRow(record: HubSpotRecord): WorkspaceTask {
  const id = String(record.id);
  const status = value(record, "hs_task_status") || "NOT_STARTED";
  return {
    id,
    subject: value(record, "hs_task_subject") || "Sales task",
    status,
    priority: value(record, "hs_task_priority") || "NONE",
    dueAt: value(record, "hs_timestamp"),
    body: value(record, "hs_task_body"),
    ownerId: value(record, "hubspot_owner_id"),
    completed: status.toUpperCase() === "COMPLETED",
    url: hubspotRecordUrl("task", id),
  };
}

function callRow(record: HubSpotRecord): WorkspaceActivity {
  const id = String(record.id);
  return {
    id,
    type: "Call",
    title: value(record, "hs_call_title") || "Sales call",
    status: value(record, "hs_call_status") || "Logged",
    timestamp: value(record, "hs_timestamp"),
    ownerId: value(record, "hubspot_owner_id"),
    completed: true,
    connected: value(record, "hs_call_disposition") === CONNECTED_CALL_DISPOSITION,
    url: hubspotRecordUrl("call", id),
  };
}

function meetingRow(record: HubSpotRecord): WorkspaceActivity {
  const id = String(record.id);
  const status = value(record, "hs_meeting_outcome") || "Scheduled";
  return {
    id,
    type: "Meeting",
    title: value(record, "hs_meeting_title") || "Sales meeting",
    status,
    timestamp: value(record, "hs_timestamp"),
    ownerId: value(record, "hubspot_owner_id"),
    completed: /completed|successful|held/i.test(status),
    connected: false,
    url: hubspotRecordUrl("meeting", id),
  };
}

export async function getLeadWorkspaceDetail(contactId: string): Promise<WorkspaceLeadDetail> {
  const lead = await refreshLead(contactId);
  const [taskLinks, callLinks, meetingLinks] = await Promise.all([
    batchReadAssociations("contacts", "tasks", [contactId]),
    batchReadAssociations("contacts", "calls", [contactId]),
    batchReadAssociations("contacts", "meetings", [contactId]),
  ]);
  const taskIds = (taskLinks.get(contactId) ?? []).map((target) => target.id);
  const callIds = (callLinks.get(contactId) ?? []).map((target) => target.id);
  const meetingIds = (meetingLinks.get(contactId) ?? []).map((target) => target.id);
  const [taskRecords, callRecords, meetingRecords] = await Promise.all([
    batchReadObjects("tasks", taskIds, TASK_PROPERTIES),
    batchReadObjects("calls", callIds, CALL_PROPERTIES),
    batchReadObjects("meetings", meetingIds, MEETING_PROPERTIES),
  ]);
  const tasks = taskRecords.map(taskRow).sort((left, right) =>
    Number(left.completed) - Number(right.completed)
    || new Date(left.dueAt || "9999-12-31").getTime() - new Date(right.dueAt || "9999-12-31").getTime());
  const activities = [...callRecords.map(callRow), ...meetingRecords.map(meetingRow)]
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 100);
  return { lead, tasks: tasks.slice(0, 150), activities, fetchedAt: new Date().toISOString() };
}

export function workspaceTimezone() {
  return HUBSPOT_TIMEZONE;
}
