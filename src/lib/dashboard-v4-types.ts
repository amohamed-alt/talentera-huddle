import type { DealRow, KpiSet, LeadRow, RepPerformance } from "@/lib/types";

export type RepRole = "acquisition" | "deals-only";
export type LeadEligibility = "follow-up" | "converted" | "excluded";
export type ActivityKind = "Call" | "Meeting" | "Task";

export interface DetailedRepPerformance extends RepPerformance {
  role: RepRole;
  yesterday: KpiSet;
}

export interface AcquisitionLeadV4 extends LeadRow {
  rawLeadStatus: string;
  leadStatusLabel: string;
  lifecycleLabel: string;
  eligibility: LeadEligibility;
  exclusionReason: string;
  followUpEligible: boolean;
  companyId: string;
  companyName: string;
  companyCountry: string;
  companyRank: string;
  companyUrl: string;
}

export interface AcquisitionCompanyV4 {
  id: string;
  name: string;
  country: string;
  rank: string;
  ownerId: string;
  ownerName: string;
  contacts: number;
  eligibleContacts: number;
  contactedContacts: number;
  untouchedContacts: number;
  unqualifiedContacts: number;
  completedMeetings: number;
  hasCompletedMeeting: boolean;
  lastContacted: string;
  nextActivity: string;
  url: string;
  contactIds: string[];
}

export interface BreakdownRow {
  key: string;
  label: string;
  count: number;
  percentage: number;
  contacted: number;
  untouched: number;
  excluded: number;
}

export interface CompanyRankSummary {
  rank: string;
  companies: number;
  contacts: number;
  eligibleContacts: number;
  contactedCompanies: number;
  untouchedCompanies: number;
  meetingCompanies: number;
}

export interface ActivityRecordV4 {
  id: string;
  type: ActivityKind;
  ownerId: string;
  ownerName: string;
  title: string;
  timestamp: string;
  status: string;
  connected: boolean;
  completed: boolean;
  contactIds: string[];
  contactNames: string[];
  companyIds: string[];
  url: string;
}

export interface ActivityTrendPoint {
  date: string;
  calls: number;
  connectedCalls: number;
  meetings: number;
  completedMeetings: number;
  tasks: number;
  completedTasks: number;
}

export interface RepActivityPoint {
  ownerId: string;
  ownerName: string;
  calls: number;
  connectedCalls: number;
  meetings: number;
  completedMeetings: number;
  tasks: number;
  completedTasks: number;
}

export interface AcquisitionDashboardV4 {
  meta: {
    generatedAt: string;
    from: string;
    to: string;
    portalId: string;
    timezone: string;
    uiVersion: "acquisition-intelligence-v4";
    companyRankProperty: "rank";
    companyRankFallbackProperty: "company_tier";
    warnings: string[];
  };
  kpis: KpiSet;
  yesterday: KpiSet;
  reps: DetailedRepPerformance[];
  leads: AcquisitionLeadV4[];
  companies: AcquisitionCompanyV4[];
  deals: DealRow[];
  openDeals: DealRow[];
  wonDeals: DealRow[];
  lostDeals: DealRow[];
  dealsAtRisk: DealRow[];
  coldDeals: DealRow[];
  stuckDeals: DealRow[];
  noFutureDeals: DealRow[];
  overdueDeals: DealRow[];
  followUpLeads: AcquisitionLeadV4[];
  excludedLeads: AcquisitionLeadV4[];
  convertedLeads: AcquisitionLeadV4[];
  leadStatusBreakdown: BreakdownRow[];
  lifecycleBreakdown: BreakdownRow[];
  sourceBreakdown: BreakdownRow[];
  rankSummary: CompanyRankSummary[];
  activities: ActivityRecordV4[];
  activityTrend: ActivityTrendPoint[];
  repActivity: RepActivityPoint[];
}
