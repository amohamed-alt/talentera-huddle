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
  calls: number;
  connectedCalls: number;
  connectionRate: number;
  meetings: number;
  openDeals: number;
  openPipeline: number;
  openTasks: number;
  overdueTasks: number;
  dealsAtRisk: number;
}

export interface RepPerformance extends KpiSet {
  ownerId: string;
  ownerName: string;
}

export interface LeadRow {
  id: string;
  ownerId: string;
  name: string;
  email: string;
  company: string;
  country: string;
  source: string;
  leadStatus: string;
  lifecycleStage: string;
  createdAt: string;
  lastContacted: string;
  nextActivity: string;
  url: string;
}

export interface DealRow {
  id: string;
  ownerId: string;
  name: string;
  stage: string;
  amount: number;
  closeDate: string;
  nextActivity: string;
  riskReason: string;
  url: string;
}

export interface SourceBreakdown {
  source: string;
  count: number;
}

export interface AcquisitionDashboardData {
  meta: {
    generatedAt: string;
    from: string;
    to: string;
    portalId: string;
    warnings: string[];
  };
  owners: HubSpotOwner[];
  kpis: KpiSet;
  reps: RepPerformance[];
  sources: SourceBreakdown[];
  priorityLeads: LeadRow[];
  dealsAtRisk: DealRow[];
  openDeals: DealRow[];
}
