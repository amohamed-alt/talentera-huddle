export type HubSpotProperties = Record<string, string | null | undefined>;

export interface HubSpotRecord {
  id: string;
  properties: HubSpotProperties;
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
}

export interface HubSpotOwner {
  id: string;
  name: string;
  email?: string;
}

export interface KpiSet {
  newLeads: number;
  onlineLeads: number;
  offlineLeads: number;
  contactedLeads: number;
  untouchedLeads: number;
  untouchedOver24h: number;
  contactRate: number;
  calls: number;
  connectedCalls: number;
  connectionRate: number;
  meetingsBooked: number;
  meetingsCompleted: number;
  openDeals: number;
  openPipeline: number;
  dealsCreated: number;
  dealsWon: number;
  dealsLost: number;
  pipelineCreated: number;
  wonRevenue: number;
  openTasks: number;
  overdueTasks: number;
  tasksCompleted: number;
  dealsAtRisk: number;
  noFutureActivityDeals: number;
  overdueCloseDeals: number;
  coldDeals: number;
  stuckDeals: number;
}

export interface RepPerformance extends KpiSet {
  ownerId: string;
  ownerName: string;
  ownerEmail?: string;
}

export interface LeadRow {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  email: string;
  phone: string;
  title: string;
  company: string;
  country: string;
  source: string;
  sourceBucket: "online" | "offline" | "unknown";
  leadStatus: string;
  lifecycleStage: string;
  rank: string;
  createdAt: string;
  lastContacted: string;
  nextActivity: string;
  ageHours: number;
  priorityScore: number;
  url: string;
}

export interface DealRow {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  stage: string;
  pipeline: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
  closeDate: string;
  nextActivity: string;
  isOpen: boolean;
  isWon: boolean;
  ageDays: number;
  riskReason: string;
  url: string;
}

export interface SourceBreakdown {
  source: string;
  count: number;
  contacted: number;
  untouched: number;
}

export interface CountryCoverage {
  country: string;
  leads: number;
  online: number;
  contacted: number;
  untouched: number;
  rankATotal: number;
  rankAContacted: number;
  rankAUntouched: number;
  rankBTotal: number;
  rankBContacted: number;
  rankBUntouched: number;
}

export interface StageBreakdown {
  stage: string;
  count: number;
  amount: number;
}

export interface DailyActivityDatum {
  date: string;
  leads: number;
  calls: number;
  connected: number;
  meetings: number;
  tasksCompleted: number;
  dealsCreated: number;
}

export interface FinancialSummary {
  signedContract: number;
  booked: number;
  cashing: number;
  wonRevenue: number;
  openPipeline: number;
  atRiskPipeline: number;
}

export interface AcquisitionDashboardData {
  meta: {
    generatedAt: string;
    from: string;
    to: string;
    portalId: string;
    timezone: string;
    rankProperty: string;
    warnings: string[];
  };
  owners: HubSpotOwner[];
  kpis: KpiSet;
  yesterday: KpiSet;
  reps: RepPerformance[];
  yesterdayReps: RepPerformance[];
  sources: SourceBreakdown[];
  countries: CountryCoverage[];
  stages: StageBreakdown[];
  dailyActivities: DailyActivityDatum[];
  financial: FinancialSummary;
  allLeads: LeadRow[];
  priorityLeads: LeadRow[];
  onlineLeads: LeadRow[];
  offlineLeads: LeadRow[];
  allDeals: DealRow[];
  dealsAtRisk: DealRow[];
  noFutureActivityDeals: DealRow[];
  overdueCloseDeals: DealRow[];
  coldDeals: DealRow[];
  stuckDeals: DealRow[];
  openDeals: DealRow[];
}
