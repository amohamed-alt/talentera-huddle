export type WorkspaceLeadState =
  | "online-untouched"
  | "online-contacted"
  | "offline-untouched"
  | "offline-contacted"
  | "unqualified"
  | "converted"
  | "excluded"
  | "unknown";

export type WorkspaceUrgency = "critical" | "high" | "medium" | "low" | "none";
export type WorkspaceChangeType = "added" | "updated" | "removed";

export interface WorkspaceAdvice {
  urgency: WorkspaceUrgency;
  title: string;
  reason: string;
  suggestedChannels: string[];
  taskSuggestion: string;
}

export interface WorkspaceLead {
  id: string;
  name: string;
  email: string;
  phone: string;
  title: string;
  company: string;
  country: string;
  ownerId: string;
  ownerName: string;
  source: string;
  sourceBucket: "online" | "offline" | "unknown";
  rawLeadStatus: string;
  leadStatusLabel: string;
  lifecycleStage: string;
  lifecycleLabel: string;
  createdAt: string;
  modifiedAt: string;
  lastContacted: string;
  nextActivity: string;
  ageHours: number;
  companyId: string;
  companyName: string;
  companyCountry: string;
  companyRank: string;
  eligibility: "follow-up" | "converted" | "excluded";
  exclusionReason: string;
  state: WorkspaceLeadState;
  priorityScore: number;
  advice: WorkspaceAdvice;
  url: string;
  companyUrl: string;
}

export interface WorkspaceChange {
  leadId: string;
  leadName: string;
  type: WorkspaceChangeType;
  changedAt: string;
  fields: string[];
  state: WorkspaceLeadState;
}

export interface WorkspaceSummary {
  total: number;
  followUpEligible: number;
  contacted: number;
  untouched: number;
  onlineUntouched: number;
  onlineContacted: number;
  offlineUntouched: number;
  offlineContacted: number;
  unqualified: number;
  converted: number;
  excluded: number;
  rankA: number;
  rankB: number;
  overdueFollowUps: number;
  noNextActivity: number;
}

export interface WorkspacePageResponse {
  meta: {
    year: number;
    generatedAt: string;
    fullSyncedAt: string;
    cursor: string;
    version: number;
    totalSnapshotLeads: number;
    page: number;
    pageSize: number;
    totalFiltered: number;
    totalPages: number;
    syncMode: "cache" | "delta" | "full";
    staleAfterSeconds: number;
  };
  summary: WorkspaceSummary;
  owners: Array<{ id: string; name: string }>;
  rows: WorkspaceLead[];
  changes: WorkspaceChange[];
}

export interface WorkspaceTask {
  id: string;
  subject: string;
  status: string;
  priority: string;
  dueAt: string;
  body: string;
  ownerId: string;
  completed: boolean;
  url: string;
}

export interface WorkspaceActivity {
  id: string;
  type: "Call" | "Meeting";
  title: string;
  status: string;
  timestamp: string;
  ownerId: string;
  completed: boolean;
  connected: boolean;
  url: string;
}

export interface WorkspaceLeadDetail {
  lead: WorkspaceLead;
  tasks: WorkspaceTask[];
  activities: WorkspaceActivity[];
  fetchedAt: string;
}
