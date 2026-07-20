import { buildAcquisitionDashboard } from "@/lib/dashboard";
import type {
  AcquisitionDashboardData,
  CountryCoverage,
  DealRow,
  FinancialSummary,
  KpiSet,
  LeadRow,
  RepPerformance,
  SourceBreakdown,
  StageBreakdown,
} from "@/lib/types";

export type RepRole = "acquisition" | "deals-only";

export interface DetailedRepPerformance extends RepPerformance {
  role: RepRole;
  yesterday: KpiSet;
}

export interface DetailedAcquisitionDashboard extends Omit<AcquisitionDashboardData, "reps"> {
  reps: DetailedRepPerformance[];
  meta: AcquisitionDashboardData["meta"] & {
    uiVersion: "rep-details-v3";
    activityOwnerIds: string[];
    dealOnlyOwnerIds: string[];
  };
}

const ACTIVITY_REPS = [
  { id: "76369997", name: "Ursula Waked" },
  { id: "31558980", name: "Zein Fares" },
  { id: "32332250", name: "Ahmad Khawajah" },
  { id: "32332251", name: "Mohammed Khalid Aldaghir" },
] as const;

const DEAL_ONLY_REPS = [
  { id: "76369998", name: "Fadi Zanona" },
  { id: "76369995", name: "Mohammed Faizan" },
] as const;

const ALL_REPS = [
  ...ACTIVITY_REPS.map((rep) => ({ ...rep, role: "acquisition" as const })),
  ...DEAL_ONLY_REPS.map((rep) => ({ ...rep, role: "deals-only" as const })),
];

const ACTIVITY_IDS = new Set<string>(ACTIVITY_REPS.map((rep) => rep.id));
const DEAL_ONLY_IDS = new Set<string>(DEAL_ONLY_REPS.map((rep) => rep.id));
const ALL_IDS = new Set<string>(ALL_REPS.map((rep) => rep.id));

function emptyKpis(): KpiSet {
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

const ACTIVITY_FIELDS: Array<keyof KpiSet> = [
  "newLeads", "onlineLeads", "offlineLeads", "contactedLeads", "untouchedLeads",
  "untouchedOver24h", "calls", "connectedCalls", "meetingsBooked", "meetingsCompleted",
  "openTasks", "overdueTasks", "tasksCompleted",
];

const DEAL_FIELDS: Array<keyof KpiSet> = [
  "openDeals", "openPipeline", "dealsCreated", "dealsWon", "dealsLost", "pipelineCreated",
  "wonRevenue", "dealsAtRisk", "noFutureActivityDeals", "overdueCloseDeals", "coldDeals", "stuckDeals",
];

function roleAdjustedKpis(source: KpiSet | undefined, role: RepRole): KpiSet {
  const result = emptyKpis();
  if (!source) return result;
  for (const field of DEAL_FIELDS) result[field] = source[field];
  if (role === "acquisition") {
    for (const field of ACTIVITY_FIELDS) result[field] = source[field];
    result.contactRate = source.contactRate;
    result.connectionRate = source.connectionRate;
  }
  return result;
}

function aggregateTeam(reps: DetailedRepPerformance[]): KpiSet {
  const result = emptyKpis();
  for (const rep of reps) {
    for (const field of DEAL_FIELDS) result[field] += rep[field];
    if (rep.role === "acquisition") {
      for (const field of ACTIVITY_FIELDS) result[field] += rep[field];
    }
  }
  result.contactRate = result.newLeads ? Math.round((result.contactedLeads / result.newLeads) * 1000) / 10 : 0;
  result.connectionRate = result.calls ? Math.round((result.connectedCalls / result.calls) * 1000) / 10 : 0;
  return result;
}

function sourceBreakdown(leads: LeadRow[]): SourceBreakdown[] {
  const map = new Map<string, SourceBreakdown>();
  for (const lead of leads) {
    const row = map.get(lead.source) ?? { source: lead.source, count: 0, contacted: 0, untouched: 0 };
    row.count += 1;
    if (lead.lastContacted) row.contacted += 1;
    else row.untouched += 1;
    map.set(lead.source, row);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function countryCoverage(leads: LeadRow[]): CountryCoverage[] {
  const map = new Map<string, CountryCoverage>();
  for (const lead of leads) {
    const country = lead.country || "Unknown";
    const row = map.get(country) ?? {
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
    row.leads += 1;
    if (lead.sourceBucket === "online") row.online += 1;
    if (lead.lastContacted) row.contacted += 1;
    else row.untouched += 1;
    if (lead.rank === "A") {
      row.rankATotal += 1;
      if (lead.lastContacted) row.rankAContacted += 1;
      else row.rankAUntouched += 1;
    }
    if (lead.rank === "B") {
      row.rankBTotal += 1;
      if (lead.lastContacted) row.rankBContacted += 1;
      else row.rankBUntouched += 1;
    }
    map.set(country, row);
  }
  return [...map.values()].sort((a, b) => b.leads - a.leads);
}

function stageBreakdown(deals: DealRow[]): StageBreakdown[] {
  const map = new Map<string, StageBreakdown>();
  for (const deal of deals.filter((row) => row.isOpen)) {
    const row = map.get(deal.stage) ?? { stage: deal.stage, count: 0, amount: 0 };
    row.count += 1;
    row.amount += deal.amount;
    map.set(deal.stage, row);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

function financialSummary(deals: DealRow[], kpis: KpiSet): FinancialSummary {
  const sumStage = (pattern: RegExp) => deals.filter((deal) => pattern.test(deal.stage)).reduce((sum, deal) => sum + deal.amount, 0);
  return {
    signedContract: sumStage(/signed|contract/i),
    booked: sumStage(/booked|booking/i),
    cashing: sumStage(/cash|collect/i),
    wonRevenue: kpis.wonRevenue,
    openPipeline: kpis.openPipeline,
    atRiskPipeline: deals.filter((deal) => deal.isOpen && deal.riskReason).reduce((sum, deal) => sum + deal.amount, 0),
  };
}

function zonedToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function previousDay(day: string) {
  const date = new Date(`${day}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function buildRepRows(base: AcquisitionDashboardData, yesterdayBase: AcquisitionDashboardData): DetailedRepPerformance[] {
  const current = new Map(base.reps.map((rep) => [rep.ownerId, rep]));
  const yesterday = new Map(yesterdayBase.reps.map((rep) => [rep.ownerId, rep]));
  const owners = new Map(base.owners.map((owner) => [owner.id, owner]));

  return ALL_REPS.map((configured) => {
    const currentKpis = roleAdjustedKpis(current.get(configured.id), configured.role);
    const yesterdayKpis = roleAdjustedKpis(yesterday.get(configured.id), configured.role);
    return {
      ownerId: configured.id,
      ownerName: owners.get(configured.id)?.name || configured.name,
      ownerEmail: owners.get(configured.id)?.email,
      role: configured.role,
      yesterday: yesterdayKpis,
      ...currentKpis,
    };
  });
}

export async function buildDetailedAcquisitionDashboard(
  from: string,
  to: string,
  bypassCache = false,
): Promise<DetailedAcquisitionDashboard> {
  const yesterday = previousDay(zonedToday());
  const base = await buildAcquisitionDashboard(from, to, bypassCache);
  const yesterdayBase = from === yesterday && to === yesterday
    ? base
    : await buildAcquisitionDashboard(yesterday, yesterday, bypassCache);

  const reps = buildRepRows(base, yesterdayBase);
  const teamKpis = aggregateTeam(reps);
  const yesterdayReps = reps.map((rep) => ({ ...rep, ...rep.yesterday }));
  const yesterdayKpis = aggregateTeam(yesterdayReps);

  const leads = base.allLeads.filter((lead) => ACTIVITY_IDS.has(lead.ownerId));
  const deals = base.allDeals.filter((deal) => ALL_IDS.has(deal.ownerId));
  const openDeals = deals.filter((deal) => deal.isOpen).sort((a, b) => b.amount - a.amount);
  const priorityLeads = [...leads].sort((a, b) => b.priorityScore - a.priorityScore || b.ageHours - a.ageHours);
  const dealsAtRisk = openDeals.filter((deal) => deal.riskReason).sort((a, b) => b.amount - a.amount);
  const noFuture = openDeals.filter((deal) => !deal.nextActivity).sort((a, b) => b.amount - a.amount);
  const overdue = openDeals.filter((deal) => deal.closeDate && new Date(deal.closeDate).getTime() < Date.now()).sort((a, b) => b.amount - a.amount);
  const cold = openDeals.filter((deal) => deal.ageDays >= 21).sort((a, b) => b.ageDays - a.ageDays);
  const stuck = openDeals.filter((deal) => !deal.nextActivity && deal.ageDays >= 14).sort((a, b) => b.ageDays - a.ageDays);

  return {
    ...base,
    meta: {
      ...base.meta,
      uiVersion: "rep-details-v3",
      activityOwnerIds: [...ACTIVITY_IDS],
      dealOnlyOwnerIds: [...DEAL_ONLY_IDS],
    },
    owners: base.owners.filter((owner) => ALL_IDS.has(owner.id)),
    kpis: teamKpis,
    yesterday: yesterdayKpis,
    reps,
    sources: sourceBreakdown(leads),
    countries: countryCoverage(leads),
    stages: stageBreakdown(openDeals),
    dailyActivities: [],
    financial: financialSummary(deals, teamKpis),
    allLeads: priorityLeads,
    priorityLeads: priorityLeads.slice(0, 500),
    onlineLeads: priorityLeads.filter((lead) => lead.sourceBucket === "online").slice(0, 500),
    offlineLeads: priorityLeads.filter((lead) => lead.sourceBucket === "offline").slice(0, 500),
    allDeals: deals,
    dealsAtRisk: dealsAtRisk.slice(0, 500),
    noFutureActivityDeals: noFuture.slice(0, 500),
    overdueCloseDeals: overdue.slice(0, 500),
    coldDeals: cold.slice(0, 500),
    stuckDeals: stuck.slice(0, 500),
    openDeals: openDeals.slice(0, 1000),
  };
}
