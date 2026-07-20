"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity, AlertTriangle, ArrowUpRight, BadgeCheck, BarChart3, BriefcaseBusiness,
  CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, Clock3,
  Database, Filter, Gauge, Layers3, ListFilter, ListTodo, Mail, Phone, PieChart,
  RefreshCw, Search, ShieldCheck, Target, TrendingUp, UserRound, UsersRound, X,
  type LucideIcon,
} from "lucide-react";
import type { DealRow } from "@/lib/types";
import type {
  AcquisitionCompanyV4, AcquisitionDashboardV4, AcquisitionLeadV4, ActivityRecordV4,
  ActivityTrendPoint, BreakdownRow, DetailedRepPerformance,
} from "@/lib/dashboard-v4-types";
import layoutStyles from "@/components/AcquisitionDashboardDetailed.module.css";
import styles from "@/components/AcquisitionDashboardV4.module.css";

type Period = "yesterday" | "mtd" | "ytd" | "custom";
type Tab = "overview" | "focus" | "leads" | "pipeline" | "team";
type DealTab = "open" | "won" | "lost" | "cold" | "stuck" | "noFuture" | "overdue";
type Drilldown = {
  kind: "leads" | "companies" | "deals" | "activities";
  title: string;
  description: string;
  leads?: AcquisitionLeadV4[];
  companies?: AcquisitionCompanyV4[];
  deals?: DealRow[];
  activities?: ActivityRecordV4[];
};

const CHART_COLORS = ["#14865c", "#3c7be0", "#7c5ac7", "#df8a16", "#d9554d", "#1c9aa0", "#7b8b84"];
const tabs: Array<{ id: Tab; label: string; icon: LucideIcon; activityOnly?: boolean }> = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "focus", label: "Today’s Focus", icon: Target, activityOnly: true },
  { id: "leads", label: "Lead Intelligence", icon: UsersRound, activityOnly: true },
  { id: "pipeline", label: "Pipeline & Revenue", icon: BriefcaseBusiness },
  { id: "team", label: "Team Performance", icon: BarChart3 },
];

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function today() { return isoDate(new Date()); }
function monthStart() { const date = new Date(); return isoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))); }
function yearStart() { const date = new Date(); return isoDate(new Date(Date.UTC(date.getUTCFullYear(), 0, 1))); }
function yesterday() { const date = new Date(); date.setUTCDate(date.getUTCDate() - 1); return isoDate(date); }
function rangeForPeriod(period: Period, customFrom: string, customTo: string) {
  if (period === "yesterday") return { from: yesterday(), to: yesterday() };
  if (period === "ytd") return { from: yearStart(), to: today() };
  if (period === "custom") return { from: customFrom, to: customTo };
  return { from: monthStart(), to: today() };
}
function formatNumber(value: number) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value); }
function formatCurrency(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }
function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
function initials(name: string) { return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?"; }
function objectListUrl(portalId: string, objectId: string) { return `https://app-eu1.hubspot.com/contacts/${portalId}/objects/${objectId}/views/all/list?utm_source=acquisition_dashboard&utm_medium=dashboard`; }
function sumDeals(rows: DealRow[]) { return rows.reduce((sum, row) => sum + row.amount, 0); }

function breakdown(
  leads: AcquisitionLeadV4[],
  keyFor: (lead: AcquisitionLeadV4) => string,
  labelFor: (lead: AcquisitionLeadV4) => string,
): BreakdownRow[] {
  const map = new Map<string, { label: string; rows: AcquisitionLeadV4[] }>();
  for (const lead of leads) {
    const key = keyFor(lead) || "__blank";
    const row = map.get(key) ?? { label: labelFor(lead) || "No status", rows: [] };
    row.rows.push(lead);
    map.set(key, row);
  }
  return [...map.entries()].map(([key, row]) => ({
    key,
    label: row.label,
    count: row.rows.length,
    percentage: leads.length ? Math.round(row.rows.length / leads.length * 1000) / 10 : 0,
    contacted: row.rows.filter((lead) => Boolean(lead.lastContacted)).length,
    untouched: row.rows.filter((lead) => lead.followUpEligible && !lead.lastContacted).length,
    excluded: row.rows.filter((lead) => lead.eligibility === "excluded").length,
  })).sort((a, b) => b.count - a.count);
}

function trendFor(from: string, to: string, activities: ActivityRecordV4[]): ActivityTrendPoint[] {
  const map = new Map<string, ActivityTrendPoint>();
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < 400) {
    const date = cursor.toISOString().slice(0, 10);
    map.set(date, { date, calls: 0, connectedCalls: 0, meetings: 0, completedMeetings: 0, tasks: 0, completedTasks: 0 });
    cursor = new Date(cursor.getTime() + 86_400_000);
    guard += 1;
  }
  for (const activity of activities) {
    const date = activity.timestamp.slice(0, 10);
    const row = map.get(date);
    if (!row) continue;
    if (activity.type === "Call") { row.calls += 1; if (activity.connected) row.connectedCalls += 1; }
    if (activity.type === "Meeting") { row.meetings += 1; if (activity.completed) row.completedMeetings += 1; }
    if (activity.type === "Task") { row.tasks += 1; if (activity.completed) row.completedTasks += 1; }
  }
  return [...map.values()];
}

export function AcquisitionDashboardV4() {
  const [period, setPeriod] = useState<Period>("mtd");
  const [customFrom, setCustomFrom] = useState(monthStart);
  const [customTo, setCustomTo] = useState(today);
  const [ownerId, setOwnerId] = useState("all");
  const [country, setCountry] = useState("all");
  const [source, setSource] = useState("all");
  const [rank, setRank] = useState("all");
  const [leadStatus, setLeadStatus] = useState("all");
  const [lifecycle, setLifecycle] = useState("all");
  const [stage, setStage] = useState("all");
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dealTab, setDealTab] = useState<DealTab>("open");
  const [data, setData] = useState<AcquisitionDashboardV4 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);

  const { from, to } = useMemo(() => rangeForPeriod(period, customFrom, customTo), [period, customFrom, customTo]);
  const loadDashboard = useCallback(async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ from, to });
      if (refresh) query.set("refresh", "1");
      const response = await fetch(`/api/dashboard?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || payload.details || "Unable to load dashboard");
      setData(payload as AcquisitionDashboardV4);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const selectedRep = data?.reps.find((rep) => rep.ownerId === ownerId);
  const dealOnly = selectedRep?.role === "deals-only";
  const activityReps = data?.reps.filter((rep) => rep.role === "acquisition") ?? [];
  const dealOnlyReps = data?.reps.filter((rep) => rep.role === "deals-only") ?? [];

  const filteredLeads = useMemo(() => (data?.leads ?? []).filter((lead) =>
    (ownerId === "all" || lead.ownerId === ownerId)
    && (country === "all" || (lead.companyCountry || lead.country || "Unknown") === country)
    && (source === "all" || lead.sourceBucket === source)
    && (rank === "all" || lead.companyRank === rank)
    && (leadStatus === "all" || lead.rawLeadStatus === leadStatus)
    && (lifecycle === "all" || lead.lifecycleStage === lifecycle),
  ), [data, ownerId, country, source, rank, leadStatus, lifecycle]);
  const filteredCompanies = useMemo(() => (data?.companies ?? []).filter((company) =>
    (ownerId === "all" || company.ownerIds.includes(ownerId))
    && (country === "all" || (company.country || "Unknown") === country)
    && (rank === "all" || company.rank === rank),
  ), [data, ownerId, country, rank]);
  const filteredDeals = useMemo(() => (data?.deals ?? []).filter((deal) =>
    (ownerId === "all" || deal.ownerId === ownerId)
    && (stage === "all" || deal.stage === stage),
  ), [data, ownerId, stage]);
  const filteredActivities = useMemo(() => (data?.activities ?? []).filter((activity) => ownerId === "all" || activity.ownerId === ownerId), [data, ownerId]);

  const followUpPopulation = filteredLeads.filter((lead) => lead.followUpEligible);
  const contactedFollowUp = followUpPopulation.filter((lead) => Boolean(lead.lastContacted));
  const untouchedLeads = followUpPopulation.filter((lead) => !lead.lastContacted).sort((a, b) => b.priorityScore - a.priorityScore || b.ageHours - a.ageHours);
  const excludedLeads = filteredLeads.filter((lead) => lead.eligibility === "excluded");
  const convertedLeads = filteredLeads.filter((lead) => lead.eligibility === "converted");
  const unqualifiedLeads = filteredLeads.filter((lead) => lead.exclusionReason === "Unqualified");
  const onlineUntouched = untouchedLeads.filter((lead) => lead.sourceBucket === "online");
  const offlineUntouched = untouchedLeads.filter((lead) => lead.sourceBucket === "offline");
  const contactRate = followUpPopulation.length ? Math.round(contactedFollowUp.length / followUpPopulation.length * 1000) / 10 : 0;

  const openDeals = filteredDeals.filter((deal) => deal.isOpen);
  const wonDeals = filteredDeals.filter((deal) => !deal.isOpen && deal.isWon);
  const lostDeals = filteredDeals.filter((deal) => !deal.isOpen && !deal.isWon);
  const coldDeals = openDeals.filter((deal) => deal.ageDays >= 21);
  const stuckDeals = openDeals.filter((deal) => !deal.nextActivity && deal.ageDays >= 14);
  const noFutureDeals = openDeals.filter((deal) => !deal.nextActivity);
  const overdueDeals = openDeals.filter((deal) => Boolean(deal.closeDate) && new Date(deal.closeDate).getTime() < Date.now());
  const riskDeals = openDeals.filter((deal) => Boolean(deal.riskReason));

  const calls = filteredActivities.filter((activity) => activity.type === "Call");
  const meetings = filteredActivities.filter((activity) => activity.type === "Meeting");
  const tasks = filteredActivities.filter((activity) => activity.type === "Task");
  const connectedCalls = calls.filter((activity) => activity.connected);
  const completedMeetings = meetings.filter((activity) => activity.completed);
  const completedTasks = tasks.filter((activity) => activity.completed);
  const openTasks = tasks.filter((activity) => !activity.completed);
  const activityTrend = trendFor(from, to, filteredActivities);

  const statusBreakdown = breakdown(filteredLeads, (lead) => lead.rawLeadStatus, (lead) => lead.leadStatusLabel);
  const lifecycleBreakdown = breakdown(filteredLeads, (lead) => lead.lifecycleStage, (lead) => lead.lifecycleLabel);
  const sourceBreakdown = breakdown(filteredLeads, (lead) => lead.source, (lead) => lead.source);
  const stageBreakdown = useMemo(() => {
    const map = new Map<string, { label: string; count: number; amount: number }>();
    for (const deal of openDeals) {
      const row = map.get(deal.stage) ?? { label: deal.stage, count: 0, amount: 0 };
      row.count += 1;
      row.amount += deal.amount;
      map.set(deal.stage, row);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [openDeals]);

  const ownerName = ownerId === "all" ? "Acquisition Team" : selectedRep?.ownerName || "Selected Owner";
  const portalId = data?.meta.portalId ?? "145742477";
  const dealGroups: Record<DealTab, DealRow[]> = { open: openDeals, won: wonDeals, lost: lostDeals, cold: coldDeals, stuck: stuckDeals, noFuture: noFutureDeals, overdue: overdueDeals };
  const dealLabels: Record<DealTab, string> = { open: "Open", won: "Won", lost: "Lost", cold: "Cold", stuck: "Stuck", noFuture: "No Future Task", overdue: "Overdue Close" };

  const rankSummary = ["A", "B", "C", "Unknown"].map((rankValue) => {
    const rows = filteredCompanies.filter((company) => company.rank === rankValue);
    return {
      rank: rankValue,
      companies: rows.length,
      contacts: rows.reduce((sum, company) => sum + company.contacts, 0),
      contactedCompanies: rows.filter((company) => company.contactedContacts > 0).length,
      untouchedCompanies: rows.filter((company) => company.untouchedContacts > 0 && company.contactedContacts === 0).length,
      meetingCompanies: rows.filter((company) => company.hasCompletedMeeting).length,
      rows,
    };
  }).filter((row) => row.companies > 0);

  function selectOwner(rep: DetailedRepPerformance | null) {
    setOwnerId(rep?.ownerId ?? "all");
    setCountry("all");
    setSource("all");
    setRank("all");
    setLeadStatus("all");
    setLifecycle("all");
    setStage("all");
    setDealTab("open");
    if (rep?.role === "deals-only" && (activeTab === "focus" || activeTab === "leads")) setActiveTab("pipeline");
  }
  function openLeads(title: string, description: string, rows: AcquisitionLeadV4[]) { setDrilldown({ kind: "leads", title, description, leads: rows }); }
  function openCompanies(title: string, description: string, rows: AcquisitionCompanyV4[]) { setDrilldown({ kind: "companies", title, description, companies: rows }); }
  function openDealsDrawer(title: string, description: string, rows: DealRow[]) { setDrilldown({ kind: "deals", title, description, deals: rows }); }
  function openActivities(title: string, description: string, rows: ActivityRecordV4[]) { setDrilldown({ kind: "activities", title, description, activities: rows }); }
  function openHubSpot(objectId: string) { window.open(objectListUrl(portalId, objectId), "_blank", "noopener,noreferrer"); }

  const kpiCards = dealOnly ? [
    { label: "Open pipeline", value: formatCurrency(sumDeals(openDeals)), helper: `${openDeals.length} open deals`, icon: CircleDollarSign, tone: "amber", action: () => openDealsDrawer("Open pipeline", `${ownerName} open opportunities.`, openDeals) },
    { label: "Deals at risk", value: formatNumber(riskDeals.length), helper: formatCurrency(sumDeals(riskDeals)), icon: AlertTriangle, tone: "red", action: () => openDealsDrawer("Deals at risk", "Cold, stuck, overdue or missing a next step.", riskDeals) },
    { label: "Cold deals", value: formatNumber(coldDeals.length), helper: "21+ days without movement", icon: Clock3, tone: "amber", action: () => openDealsDrawer("Cold deals", "Open deals unchanged for at least 21 days.", coldDeals) },
    { label: "Stuck deals", value: formatNumber(stuckDeals.length), helper: "14+ days and no next activity", icon: Layers3, tone: "purple", action: () => openDealsDrawer("Stuck deals", "No next activity and no recent movement.", stuckDeals) },
    { label: "No future task", value: formatNumber(noFutureDeals.length), helper: "Missing next activity", icon: ListTodo, tone: "blue", action: () => openDealsDrawer("No future task", "Open deals without a next activity.", noFutureDeals) },
    { label: "Won revenue", value: formatCurrency(sumDeals(wonDeals)), helper: `${wonDeals.length} won deals`, icon: TrendingUp, tone: "green", action: () => openDealsDrawer("Won deals", "Closed-won deals in the selected period.", wonDeals) },
  ] : [
    { label: "New leads", value: formatNumber(filteredLeads.length), helper: `${followUpPopulation.length} follow-up eligible`, icon: UsersRound, tone: "green", action: () => openLeads("All new leads", "All contacts created in the selected period.", filteredLeads) },
    { label: "Need contact", value: formatNumber(untouchedLeads.length), helper: `${untouchedLeads.filter((lead) => lead.ageHours >= 24).length} over 24h`, icon: UserRound, tone: "red", action: () => openLeads("Leads needing contact", "Only eligible leads with no Last Contacted value.", untouchedLeads) },
    { label: "Unqualified", value: formatNumber(unqualifiedLeads.length), helper: "Excluded from follow-up queue", icon: ShieldCheck, tone: "amber", action: () => openLeads("Unqualified leads", "Separated from not-contacted and SLA calculations.", unqualifiedLeads) },
    { label: "Contact rate", value: `${contactRate}%`, helper: `${contactedFollowUp.length}/${followUpPopulation.length} eligible contacted`, icon: Target, tone: "blue", action: () => openLeads("Follow-up coverage", "Eligible leads behind the contact-rate calculation.", followUpPopulation) },
    { label: "Calls", value: formatNumber(calls.length), helper: `${connectedCalls.length} connected`, icon: Phone, tone: "teal", action: () => openActivities("Calls", "Calls logged in the selected period.", calls) },
    { label: "Meetings", value: formatNumber(meetings.length), helper: `${completedMeetings.length} completed`, icon: CalendarDays, tone: "purple", action: () => openActivities("Meetings", "Meetings booked in the selected period.", meetings) },
    { label: "Open pipeline", value: formatCurrency(sumDeals(openDeals)), helper: `${openDeals.length} open deals`, icon: CircleDollarSign, tone: "amber", action: () => openDealsDrawer("Open pipeline", "Open opportunities in the current view.", openDeals) },
    { label: "Deals at risk", value: formatNumber(riskDeals.length), helper: formatCurrency(sumDeals(riskDeals)), icon: AlertTriangle, tone: "red", action: () => openDealsDrawer("Deals at risk", "Open deals requiring attention.", riskDeals) },
  ];

  return <main className="app-shell">
    <header className="topbar">
      <div className="top-title"><strong>Acquisition Command Center</strong><span>Company-ranked lead intelligence, activity execution and revenue health</span></div>
      <div className="top-actions"><span className="status-pill live"><i/>LIVE · HUBSPOT</span><button className="icon-button" onClick={() => setFiltersOpen((open) => !open)} aria-label="Toggle filters"><Filter size={18}/></button><button className="refresh-button" onClick={() => void loadDashboard(true)} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""}/>{loading ? "Refreshing…" : "Refresh data"}</button></div>
    </header>

    <div className="workspace">
      <aside className="sidebar">
        <div className="brand"><div className="brand-logo" role="img" aria-label="Talentera ATS"/><span className="brand-subtitle">Acquisition Intelligence V4</span></div>
        <div className="nav-label">MAIN</div>
        <nav>{tabs.map(({ id, label, icon: Icon, activityOnly }) => <button key={id} disabled={Boolean(dealOnly && activityOnly)} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)}><Icon size={17}/><span>{label}</span>{dealOnly && activityOnly ? <small className={layoutStyles.navLock}>FULL REPS</small> : activeTab === id && <ChevronRight size={15}/>}</button>)}</nav>
        <div className="nav-label owner-label">CURRENT VIEW</div>
        <div className="owner-card"><div className="avatar">{ownerId === "all" ? "AT" : initials(ownerName)}</div><div><span>Reporting for</span><strong>{ownerName}</strong><small className={layoutStyles.ownerRole}>{dealOnly ? "Deals-only owner" : ownerId === "all" ? "4 acquisition reps + 2 deals-only" : "Full acquisition rep"}</small></div><BadgeCheck size={17}/></div>
        <div className="external-nav"><a href="https://sdr.dashboardtalentera.tech" target="_blank" rel="noreferrer"><Activity size={15}/>SDR Dashboard<ArrowUpRight size={12}/></a></div>
        <div className="sync-card"><Database size={18}/><div><strong>Last sync</strong><span>{data ? new Date(data.meta.generatedAt).toLocaleString("en-GB") : "Loading…"}</span></div></div>
      </aside>

      <div className="content">
        <div className="page-title"><div><span className="eyebrow">TALENTERA · ACQUISITION INTELLIGENCE</span><h1>{tabs.find((tab) => tab.id === activeTab)?.label}</h1><p>{formatDate(from)} – {formatDate(to)} · {data?.meta.timezone || "Asia/Riyadh"} · {ownerName}</p></div></div>

        <section className={layoutStyles.ownerWorkspace}>
          <button className={`${layoutStyles.ownerButton} ${ownerId === "all" ? layoutStyles.activeOwner : ""}`} onClick={() => selectOwner(null)}><span className="rep-dot team">TM</span><div><strong>Team Overview</strong><small>Filtered totals · correct eligibility</small></div></button>
          <div className={layoutStyles.ownerGroup}><span className={layoutStyles.groupLabel}>ACQUISITION REPS</span>{activityReps.map((rep) => <button key={rep.ownerId} className={`${layoutStyles.ownerButton} ${ownerId === rep.ownerId ? layoutStyles.activeOwner : ""}`} onClick={() => selectOwner(rep)}><span className="rep-dot">{initials(rep.ownerName)}</span><div><strong>{rep.ownerName}</strong><small>Leads + activity + deals</small></div></button>)}</div>
          <div className={layoutStyles.ownerGroup}><span className={`${layoutStyles.groupLabel} ${layoutStyles.dealOnlyLabel}`}>DEALS ONLY</span>{dealOnlyReps.map((rep) => <button key={rep.ownerId} className={`${layoutStyles.ownerButton} ${layoutStyles.dealOnlyOwner} ${ownerId === rep.ownerId ? layoutStyles.activeOwner : ""}`} onClick={() => selectOwner(rep)}><span className="rep-dot">{initials(rep.ownerName)}</span><div><strong>{rep.ownerName}</strong><small>Pipeline view only</small></div></button>)}</div>
        </section>

        <div className={layoutStyles.periodBar}><span>Reporting period</span>{(["yesterday", "mtd", "ytd", "custom"] as Period[]).map((item) => <button key={item} className={period === item ? layoutStyles.selectedPeriod : ""} onClick={() => setPeriod(item)}>{item === "mtd" ? "Month to Date" : item === "ytd" ? "Year to Date" : item.charAt(0).toUpperCase() + item.slice(1)}</button>)}</div>

        <div className={`filter-drawer ${filtersOpen ? "open" : ""}`}>
          <div className="filter-grid">
            {period === "custom" && <><FilterField label="From"><input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)}/></FilterField><FilterField label="To"><input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)}/></FilterField></>}
            {!dealOnly && <><FilterField label="Company Country"><select value={country} onChange={(event) => setCountry(event.target.value)}><option value="all">All countries</option>{[...new Set((data?.companies ?? []).filter((company) => ownerId === "all" || company.ownerIds.includes(ownerId)).map((company) => company.country || "Unknown"))].sort().map((item) => <option key={item}>{item}</option>)}</select></FilterField><FilterField label="Lead Source"><select value={source} onChange={(event) => setSource(event.target.value)}><option value="all">Online + Offline</option><option value="online">Online / inbound</option><option value="offline">Offline / outbound</option></select></FilterField><FilterField label="Company Rank"><select value={rank} onChange={(event) => setRank(event.target.value)}><option value="all">All company ranks</option><option value="A">Rank A</option><option value="B">Rank B</option><option value="C">Rank C</option><option value="Unknown">Unknown</option></select></FilterField><FilterField label="Lead Status"><select value={leadStatus} onChange={(event) => setLeadStatus(event.target.value)}><option value="all">All lead statuses</option>{(data?.leadStatusBreakdown ?? []).map((item) => <option key={item.key} value={item.key === "__blank" ? "" : item.key}>{item.label}</option>)}</select></FilterField><FilterField label="Lifecycle"><select value={lifecycle} onChange={(event) => setLifecycle(event.target.value)}><option value="all">All lifecycle stages</option>{(data?.lifecycleBreakdown ?? []).map((item) => <option key={item.key} value={item.key === "__blank" ? "" : item.key}>{item.label}</option>)}</select></FilterField></>}
            <FilterField label="Deal Stage"><select value={stage} onChange={(event) => setStage(event.target.value)}><option value="all">All stages</option>{[...new Set((data?.deals ?? []).filter((deal) => ownerId === "all" || deal.ownerId === ownerId).map((deal) => deal.stage))].sort().map((item) => <option key={item}>{item}</option>)}</select></FilterField>
            <div className="filter-actions"><button className="secondary-button" onClick={() => { setCountry("all"); setSource("all"); setRank("all"); setLeadStatus("all"); setLifecycle("all"); setStage("all"); }}>Reset</button><button className="primary-button" onClick={() => setFiltersOpen(false)}><Search size={15}/>Apply</button></div>
          </div>
          <p className="filter-note">Rank is read from the associated Company `rank` property. Unqualified, Bad Timing and Existing Client are excluded from follow-up and SLA counts.</p>
        </div>

        {selectedRep && <RepProfile rep={selectedRep}/>} 
        {!!data?.meta.warnings.length && <div className="warning-banner"><AlertTriangle size={17}/><div><strong>Some HubSpot data needs attention</strong><span>{data.meta.warnings.join(" · ")}</span></div></div>}
        {error && <div className="error-banner"><AlertTriangle size={20}/><div><strong>Dashboard failed to load</strong><span>{error}</span></div><button onClick={() => void loadDashboard(true)}>Try again</button></div>}

        {data && <>
          {(activeTab === "overview" || (dealOnly && activeTab !== "team")) && <>
            <div className="kpi-grid">{kpiCards.map((card) => <KpiCard key={card.label} {...card}/>)}</div>
            {!dealOnly && <ExecutiveFocus total={filteredLeads.length} eligible={followUpPopulation.length} eligibleLeads={followUpPopulation} untouched={untouchedLeads} unqualified={unqualifiedLeads} converted={convertedLeads} contactRate={contactRate} rankSummary={rankSummary} riskDeals={riskDeals} noFutureDeals={noFutureDeals} onLeads={openLeads} onCompanies={openCompanies} onDeals={openDealsDrawer}/>} 
            {!dealOnly && <div className={`${styles.chartGrid} ${styles.chartGridWide}`}><ChartPanel title="Activity momentum" description="Calls, connected calls, meetings and completed tasks by day." icon={Activity}><ActivityLineChart rows={activityTrend} onSelect={(kind) => openActivities(`${kind} activity`, "Matching activity records in the selected period.", filteredActivities.filter((activity) => kind === "Calls" ? activity.type === "Call" : kind === "Connected" ? activity.type === "Call" && activity.connected : kind === "Meetings" ? activity.type === "Meeting" : activity.type === "Task" && activity.completed))}/></ChartPanel><ChartPanel title="Lead status mix" description="Unqualified is separated from the actionable follow-up queue." icon={PieChart}><DonutBreakdown rows={statusBreakdown} onSelect={(row) => openLeads(row.label, "Contacts in this Lead Status.", filteredLeads.filter((lead) => (lead.rawLeadStatus || "__blank") === row.key))}/></ChartPanel></div>}
            {!dealOnly && <div className={styles.chartGrid}><ChartPanel title="Source distribution" description="Online, offline and original traffic-source mix." icon={Target}><DonutBreakdown rows={sourceBreakdown} onSelect={(row) => openLeads(row.label, "Contacts from this source.", filteredLeads.filter((lead) => lead.source === row.key))}/></ChartPanel><ChartPanel title="Lifecycle breakdown" description="Prospect to customer progression and disqualified stages." icon={Layers3}><HorizontalBreakdown rows={lifecycleBreakdown} onSelect={(row) => openLeads(row.label, "Contacts in this lifecycle stage.", filteredLeads.filter((lead) => (lead.lifecycleStage || "__blank") === row.key))}/></ChartPanel></div>}
            {!dealOnly && <ChartPanel title="Company Rank A/B execution matrix" description="Unique companies from Company.rank — not duplicated contact counts." icon={ShieldCheck}><RankCompanyMatrix rows={rankSummary} onOpen={openCompanies}/></ChartPanel>}
            <div className={styles.chartGrid}><ChartPanel title="Open pipeline stage mix" description="Count and value across the current pipeline." icon={CircleDollarSign}><PipelineBars rows={stageBreakdown} onSelect={(label) => openDealsDrawer(label, "Open deals in this stage.", openDeals.filter((deal) => deal.stage === label))}/></ChartPanel><ChartPanel title="Deal health" description="Cold, stuck, missing next steps and overdue close dates." icon={AlertTriangle}><DealHealthBars rows={[{ label: "At risk", value: riskDeals.length, deals: riskDeals }, { label: "Cold 21+d", value: coldDeals.length, deals: coldDeals }, { label: "Stuck", value: stuckDeals.length, deals: stuckDeals }, { label: "No future task", value: noFutureDeals.length, deals: noFutureDeals }, { label: "Overdue close", value: overdueDeals.length, deals: overdueDeals }]} onSelect={openDealsDrawer}/></ChartPanel></div>
            {!dealOnly && <div className="two-column"><Section title="Priority follow-up queue" description="Eligible leads only; unqualified and converted contacts are removed."><LeadTable rows={untouchedLeads.slice(0, 12)}/></Section><Section title="Latest sales activity" description="Recent calls, meetings and tasks for the selected rep."><ActivityTable rows={filteredActivities.slice(0, 12)}/></Section></div>}
            <DealWorkspace tab={dealTab} setTab={setDealTab} groups={dealGroups} labels={dealLabels} ownerName={ownerName} onOpen={openDealsDrawer}/>
          </>}

          {activeTab === "focus" && !dealOnly && <>
            <ExecutiveFocus total={filteredLeads.length} eligible={followUpPopulation.length} eligibleLeads={followUpPopulation} untouched={untouchedLeads} unqualified={unqualifiedLeads} converted={convertedLeads} contactRate={contactRate} rankSummary={rankSummary} riskDeals={riskDeals} noFutureDeals={noFutureDeals} onLeads={openLeads} onCompanies={openCompanies} onDeals={openDealsDrawer}/>
            <div className="two-column"><Section title="Online leads requiring follow-up" description="Eligible online leads with no Last Contacted value."><LeadTable rows={onlineUntouched.slice(0, 20)}/></Section><Section title="Offline leads requiring follow-up" description="Eligible outbound/imported leads with no Last Contacted value."><LeadTable rows={offlineUntouched.slice(0, 20)}/></Section></div>
            <div className="two-column"><Section title="Unqualified & excluded" description="Tracked separately and never counted as not contacted."><LeadTable rows={excludedLeads.slice(0, 20)}/></Section><Section title="Open Deal / converted contacts" description="Converted contacts removed from first-contact SLA."><LeadTable rows={convertedLeads.slice(0, 20)}/></Section></div>
            <div className="two-column"><Section title="Deals with no future activity" description="Open opportunities without a next activity date."><DealTable rows={noFutureDeals.slice(0, 20)}/></Section><Section title="Close date overdue" description="Open opportunities whose target close date has passed."><DealTable rows={overdueDeals.slice(0, 20)}/></Section></div>
          </>}

          {activeTab === "leads" && !dealOnly && <>
            <div className="kpi-grid compact-kpis"><KpiCard label="Follow-up eligible" value={formatNumber(followUpPopulation.length)} helper={`${untouchedLeads.length} untouched`} icon={Target} tone="green" action={() => openLeads("Follow-up eligible", "Active lead statuses only.", followUpPopulation)}/><KpiCard label="Excluded" value={formatNumber(excludedLeads.length)} helper={`${unqualifiedLeads.length} unqualified`} icon={ShieldCheck} tone="amber" action={() => openLeads("Excluded leads", "Unqualified, Bad Timing, Existing Client, Lost or Churned.", excludedLeads)}/><KpiCard label="Untouched over 24h" value={formatNumber(untouchedLeads.filter((lead) => lead.ageHours >= 24).length)} helper="True SLA breach" icon={Clock3} tone="red" action={() => openLeads("Untouched over 24h", "Eligible leads waiting more than 24 hours.", untouchedLeads.filter((lead) => lead.ageHours >= 24))}/><KpiCard label="Rank A/B companies" value={formatNumber(filteredCompanies.filter((company) => company.rank === "A" || company.rank === "B").length)} helper="Unique associated companies" icon={BriefcaseBusiness} tone="purple" action={() => openCompanies("Rank A/B companies", "Unique companies with Company.rank A or B.", filteredCompanies.filter((company) => company.rank === "A" || company.rank === "B"))}/></div>
            <div className={styles.chartGrid}><ChartPanel title="Lead Status: total vs untouched" description="Every status shows contacted, untouched and excluded counts." icon={BarChart3}><HorizontalBreakdown rows={statusBreakdown} onSelect={(row) => openLeads(row.label, "Full Lead Status records.", filteredLeads.filter((lead) => (lead.rawLeadStatus || "__blank") === row.key))}/></ChartPanel><ChartPanel title="Lifecycle stage mix" description="Qualification movement across the selected period." icon={PieChart}><DonutBreakdown rows={lifecycleBreakdown} onSelect={(row) => openLeads(row.label, "Lifecycle stage records.", filteredLeads.filter((lead) => (lead.lifecycleStage || "__blank") === row.key))}/></ChartPanel></div>
            <ChartPanel title="Rank A/B company coverage" description="Companies, contacts, contacted accounts, untouched accounts and completed-meeting accounts." icon={ShieldCheck}><RankCompanyMatrix rows={rankSummary} onOpen={openCompanies}/></ChartPanel>
            <Section title="Lead intelligence workspace" description="Company rank, Lead Status, lifecycle, eligibility, last contact and next activity."><LeadTable rows={filteredLeads.slice(0, 50)}/></Section>
          </>}

          {activeTab === "pipeline" && <>
            <div className="financial-panel"><div className="section-heading"><div><span>FINANCIAL SUMMARY</span><h2>Revenue movement</h2></div><small>Filtered to owner and stage</small></div><div className="financial-grid">{[["Open Pipeline", sumDeals(openDeals)], ["Won Revenue", sumDeals(wonDeals)], ["At-Risk Pipeline", sumDeals(riskDeals)], ["Cold Pipeline", sumDeals(coldDeals)], ["No-Future Pipeline", sumDeals(noFutureDeals)], ["Overdue Pipeline", sumDeals(overdueDeals)]].map(([label, value]) => <article key={String(label)}><span>{label}</span><strong>{formatCurrency(Number(value))}</strong></article>)}</div></div>
            <div className={styles.chartGrid}><ChartPanel title="Pipeline by stage" description="Open deal value and volume." icon={CircleDollarSign}><PipelineBars rows={stageBreakdown} onSelect={(label) => openDealsDrawer(label, "Open deals in this stage.", openDeals.filter((deal) => deal.stage === label))}/></ChartPanel><ChartPanel title="Deal risk distribution" description="Click any risk signal for full deal details." icon={AlertTriangle}><DealHealthBars rows={[{ label: "At risk", value: riskDeals.length, deals: riskDeals }, { label: "Cold", value: coldDeals.length, deals: coldDeals }, { label: "Stuck", value: stuckDeals.length, deals: stuckDeals }, { label: "No future", value: noFutureDeals.length, deals: noFutureDeals }, { label: "Overdue", value: overdueDeals.length, deals: overdueDeals }]} onSelect={openDealsDrawer}/></ChartPanel></div>
            <DealWorkspace tab={dealTab} setTab={setDealTab} groups={dealGroups} labels={dealLabels} ownerName={ownerName} onOpen={openDealsDrawer}/>
          </>}

          {activeTab === "team" && <>
            <ChartPanel title="Rep activity comparison" description="Calls, connected calls, meetings and completed tasks for full Acquisition reps only." icon={BarChart3}><RepActivityBars reps={data.reps} activities={data.activities} onSelect={(rep) => selectOwner(rep)}/></ChartPanel>
            <Section title="Role-based team scoreboard" description="Fadi and Faizan remain deals-only; activity columns are intentionally blank."><TeamTable rows={data.reps} onSelect={selectOwner}/></Section>
            <div className="two-column"><Section title="Open pipeline by rep" description="Current open value across all six approved owners."><RepPipeline rows={data.reps}/></Section><Section title="Deal health by rep" description="Cold, stuck, no-future-task and overdue-close workload."><RepRisk rows={data.reps}/></Section></div>
          </>}
        </>}
      </div>
    </div>

    {drilldown && <DrilldownDrawer data={drilldown} onClose={() => setDrilldown(null)}/>} 
  </main>;
}

function FilterField({ label, children }: { label: string; children: ReactNode }) { return <label className="filter-field"><span>{label}</span>{children}</label>; }
function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) { return <section className="panel"><div className="panel-heading"><div><h2>{title}</h2><p>{description}</p></div></div>{children}</section>; }
function ChartPanel({ title, description, icon: Icon, children }: { title: string; description: string; icon: LucideIcon; children: ReactNode }) { return <section className={`${styles.chartPanel} panel`}><div className="panel-heading"><div><h2>{title}</h2><p>{description}</p></div><Icon size={19}/></div>{children}</section>; }
function KpiCard({ label, value, helper, icon: Icon, tone, action }: { label: string; value: string; helper: string; icon: LucideIcon; tone: string; action: () => void }) { return <button className={`kpi-card tone-${tone}`} onClick={action}><div className="kpi-top"><span>{label}</span><Icon size={18}/></div><strong>{value}</strong><small>{helper}<ListFilter size={13}/></small></button>; }

function RepProfile({ rep }: { rep: DetailedRepPerformance }) {
  return <section className={`${layoutStyles.repProfile} ${rep.role === "deals-only" ? layoutStyles.repProfileDealOnly : ""}`}><div className={layoutStyles.repIdentity}><span>{initials(rep.ownerName)}</span><div><small>{rep.role === "deals-only" ? "DEALS ONLY" : "ACQUISITION REP"}</small><h2>{rep.ownerName}</h2><p>{rep.role === "deals-only" ? "Pipeline, deal movement and deal health only." : "Lead eligibility, activities, Rank A/B companies, pipeline and revenue."}</p></div></div><div className={layoutStyles.repHealth}><span>Current pipeline</span><strong>{formatCurrency(rep.openPipeline)}</strong><small>{rep.openDeals} open · {rep.dealsAtRisk} at risk</small></div></section>;
}

function ExecutiveFocus({ total, eligible, eligibleLeads, untouched, unqualified, converted, contactRate, rankSummary, riskDeals, noFutureDeals, onLeads, onCompanies, onDeals }: { total: number; eligible: number; eligibleLeads: AcquisitionLeadV4[]; untouched: AcquisitionLeadV4[]; unqualified: AcquisitionLeadV4[]; converted: AcquisitionLeadV4[]; contactRate: number; rankSummary: Array<{ rank: string; companies: number; untouchedCompanies: number; rows: AcquisitionCompanyV4[] }>; riskDeals: DealRow[]; noFutureDeals: DealRow[]; onLeads: (title: string, description: string, rows: AcquisitionLeadV4[]) => void; onCompanies: (title: string, description: string, rows: AcquisitionCompanyV4[]) => void; onDeals: (title: string, description: string, rows: DealRow[]) => void }) {
  const rankAB = rankSummary.filter((row) => row.rank === "A" || row.rank === "B");
  const rankABCompanies = rankAB.flatMap((row) => row.rows);
  return <section className="execution-focus"><div className="focus-heading"><div><span>EXECUTIVE HEALTH</span><strong>Actionable workload — corrected for Lead Status and Company Rank</strong></div><span className="drilldown-hint"><ListFilter size={13}/>Click a value</span></div><div className="focus-grid"><FocusMetric label="Eligible leads" value={eligible} helper={`${total} total · active statuses only`} icon={Target} tone="green" onClick={() => onLeads("Eligible leads", "Contacts eligible for active sales follow-up.", eligibleLeads)}/><FocusMetric label="Need contact" value={untouched.length} helper="Unqualified excluded" icon={UserRound} tone="red" onClick={() => onLeads("Leads needing contact", "Eligible leads with no Last Contacted value.", untouched)}/><FocusMetric label="Unqualified" value={unqualified.length} helper="Separate non-actionable bucket" icon={ShieldCheck} tone="amber" onClick={() => onLeads("Unqualified", "Not counted as untouched or SLA breach.", unqualified)}/><FocusMetric label="Converted / Open Deal" value={converted.length} helper="Removed from first-contact SLA" icon={TrendingUp} tone="blue" onClick={() => onLeads("Converted contacts", "Contacts whose Lead Status is Open Deal.", converted)}/><FocusMetric label="Rank A/B companies" value={rankABCompanies.length} helper={`${rankAB.reduce((sum, row) => sum + row.untouchedCompanies, 0)} untouched accounts`} icon={BriefcaseBusiness} tone="purple" onClick={() => onCompanies("Rank A/B companies", "Unique associated companies from Company.rank.", rankABCompanies)}/><FocusMetric label="Contact rate" value={`${contactRate}%`} helper="Eligible denominator only" icon={Gauge} tone="green" onClick={() => onLeads("Contact coverage", "Follow-up eligible contacts.", eligibleLeads)}/><FocusMetric label="Deals at risk" value={riskDeals.length} helper={formatCurrency(sumDeals(riskDeals))} icon={AlertTriangle} tone="red" onClick={() => onDeals("Deals at risk", "Cold, stuck, overdue or missing next activity.", riskDeals)}/><FocusMetric label="No future task" value={noFutureDeals.length} helper="Open deals missing next step" icon={ListTodo} tone="blue" onClick={() => onDeals("No future task", "Open deals without a next activity.", noFutureDeals)}/></div></section>;
}
function FocusMetric({ label, value, helper, icon: Icon, tone, onClick }: { label: string; value: number | string; helper: string; icon: LucideIcon; tone: string; onClick: () => void }) { return <button className={`focus-metric tone-${tone}`} onClick={onClick}><span><Icon size={16}/>{label}</span><strong>{typeof value === "number" ? formatNumber(value) : value}</strong><small>{helper}</small></button>; }

function DonutBreakdown({ rows, onSelect }: { rows: BreakdownRow[]; onSelect: (row: BreakdownRow) => void }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  let cursor = 0;
  const stops = rows.slice(0, 7).map((row, index) => {
    const start = cursor;
    cursor += total ? row.count / total * 100 : 0;
    return `${CHART_COLORS[index % CHART_COLORS.length]} ${start}% ${cursor}%`;
  });
  return <div className={styles.donutLayout}><div className={styles.donut} style={{ background: total ? `conic-gradient(${stops.join(",")})` : "#e8efeb" }}><div><strong>{formatNumber(total)}</strong><span>Total</span></div></div><div className={styles.legendList}>{rows.slice(0, 9).map((row, index) => <button key={row.key} onClick={() => onSelect(row)}><i style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}/><span><strong>{row.label}</strong><small>{row.contacted} contacted · {row.untouched} untouched</small></span><b>{row.count}</b><em>{row.percentage}%</em></button>)}</div></div>;
}

function HorizontalBreakdown({ rows, onSelect }: { rows: BreakdownRow[]; onSelect: (row: BreakdownRow) => void }) {
  const maximum = Math.max(...rows.map((row) => row.count), 1);
  return <div className={styles.horizontalBars}>{rows.slice(0, 10).map((row, index) => <button key={row.key} onClick={() => onSelect(row)}><div><span><i style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}/><strong>{row.label}</strong></span><em>{row.count} · {row.percentage}%</em></div><div className={styles.barTrack}><i style={{ width: `${Math.max(3, row.count / maximum * 100)}%`, background: CHART_COLORS[index % CHART_COLORS.length] }}/></div><small>{row.contacted} contacted · {row.untouched} true untouched · {row.excluded} excluded</small></button>)}</div>;
}

function ActivityLineChart({ rows, onSelect }: { rows: ActivityTrendPoint[]; onSelect: (kind: string) => void }) {
  const visible = rows.length > 90 ? rows.filter((_, index) => index % Math.ceil(rows.length / 90) === 0) : rows;
  const width = 760;
  const height = 230;
  const padding = 24;
  const maximum = Math.max(...visible.flatMap((row) => [row.calls, row.connectedCalls, row.meetings, row.completedTasks]), 1);
  const points = (selector: (row: ActivityTrendPoint) => number) => visible.map((row, index) => {
    const x = padding + (visible.length <= 1 ? 0 : index / (visible.length - 1) * (width - padding * 2));
    const y = height - padding - selector(row) / maximum * (height - padding * 2);
    return `${x},${y}`;
  }).join(" ");
  const series = [
    { label: "Calls", color: "#3c7be0", points: points((row) => row.calls) },
    { label: "Connected", color: "#14865c", points: points((row) => row.connectedCalls) },
    { label: "Meetings", color: "#7c5ac7", points: points((row) => row.meetings) },
    { label: "Completed tasks", color: "#df8a16", points: points((row) => row.completedTasks) },
  ];
  return <div className={styles.lineChart}><div className={styles.lineLegend}>{series.map((item) => <button key={item.label} onClick={() => onSelect(item.label)}><i style={{ background: item.color }}/>{item.label}</button>)}</div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Activity trend chart"><line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding}/>{series.map((item) => <polyline key={item.label} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={item.points}/>)}</svg><div className={styles.axisLabels}><span>{visible[0]?.date || ""}</span><span>{visible[Math.floor(visible.length / 2)]?.date || ""}</span><span>{visible.at(-1)?.date || ""}</span></div></div>;
}

function RankCompanyMatrix({ rows, onOpen }: { rows: Array<{ rank: string; companies: number; contacts: number; contactedCompanies: number; untouchedCompanies: number; meetingCompanies: number; rows: AcquisitionCompanyV4[] }>; onOpen: (title: string, description: string, companies: AcquisitionCompanyV4[]) => void }) {
  return <div className={styles.rankMatrix}>{rows.map((row) => <article key={row.rank}><header><span className={`${styles.rankBadge} ${styles[`rank${row.rank}`] ?? ""}`}>{row.rank}</span><div><strong>Rank {row.rank}</strong><small>Company.rank source</small></div><b>{row.companies}</b></header><div><button onClick={() => onOpen(`Rank ${row.rank} companies`, "All unique companies in this rank.", row.rows)}><strong>{row.companies}</strong><span>Companies</span></button><button onClick={() => onOpen(`Rank ${row.rank} contacted`, "Companies with at least one contacted associated lead.", row.rows.filter((company) => company.contactedContacts > 0))}><strong>{row.contactedCompanies}</strong><span>Contacted</span></button><button onClick={() => onOpen(`Rank ${row.rank} untouched`, "Companies whose eligible contacts have not been contacted.", row.rows.filter((company) => company.untouchedContacts > 0 && company.contactedContacts === 0))}><strong>{row.untouchedCompanies}</strong><span>Untouched</span></button><button onClick={() => onOpen(`Rank ${row.rank} meetings`, "Companies with completed meetings.", row.rows.filter((company) => company.hasCompletedMeeting))}><strong>{row.meetingCompanies}</strong><span>Meetings</span></button></div><footer>{row.contacts} associated contacts</footer></article>)}</div>;
}

function PipelineBars({ rows, onSelect }: { rows: Array<{ label: string; count: number; amount: number }>; onSelect: (label: string) => void }) {
  const maximum = Math.max(...rows.map((row) => row.amount), 1);
  return <div className={styles.pipelineBars}>{rows.slice(0, 12).map((row) => <button key={row.label} onClick={() => onSelect(row.label)}><div><strong>{row.label}</strong><span>{row.count} deals · {formatCurrency(row.amount)}</span></div><i><b style={{ width: `${Math.max(3, row.amount / maximum * 100)}%` }}/></i></button>)}</div>;
}

function DealHealthBars({ rows, onSelect }: { rows: Array<{ label: string; value: number; deals: DealRow[] }>; onSelect: (title: string, description: string, rows: DealRow[]) => void }) {
  const maximum = Math.max(...rows.map((row) => row.value), 1);
  return <div className={styles.healthBars}>{rows.map((row, index) => <button key={row.label} onClick={() => onSelect(row.label, `${row.label} deal records.`, row.deals)}><span><i style={{ background: CHART_COLORS[(index + 3) % CHART_COLORS.length] }}/><strong>{row.label}</strong><b>{row.value}</b></span><div><i style={{ width: `${Math.max(4, row.value / maximum * 100)}%`, background: CHART_COLORS[(index + 3) % CHART_COLORS.length] }}/></div><small>{formatCurrency(sumDeals(row.deals))}</small></button>)}</div>;
}

function RepActivityBars({ reps, activities, onSelect }: { reps: DetailedRepPerformance[]; activities: ActivityRecordV4[]; onSelect: (rep: DetailedRepPerformance) => void }) {
  const rows = reps.filter((rep) => rep.role === "acquisition").map((rep) => {
    const mine = activities.filter((activity) => activity.ownerId === rep.ownerId);
    return { rep, calls: mine.filter((item) => item.type === "Call").length, connected: mine.filter((item) => item.type === "Call" && item.connected).length, meetings: mine.filter((item) => item.type === "Meeting").length, tasks: mine.filter((item) => item.type === "Task" && item.completed).length };
  });
  const maximum = Math.max(...rows.flatMap((row) => [row.calls, row.connected, row.meetings, row.tasks]), 1);
  return <div className={styles.repBars}>{rows.map((row) => <button key={row.rep.ownerId} onClick={() => onSelect(row.rep)}><header><span>{initials(row.rep.ownerName)}</span><strong>{row.rep.ownerName}</strong></header><div><MetricBar label="Calls" value={row.calls} maximum={maximum} color="#3c7be0"/><MetricBar label="Connected" value={row.connected} maximum={maximum} color="#14865c"/><MetricBar label="Meetings" value={row.meetings} maximum={maximum} color="#7c5ac7"/><MetricBar label="Tasks" value={row.tasks} maximum={maximum} color="#df8a16"/></div></button>)}</div>;
}
function MetricBar({ label, value, maximum, color }: { label: string; value: number; maximum: number; color: string }) { return <div className={styles.metricBar}><span>{label}</span><i><b style={{ width: `${Math.max(2, value / maximum * 100)}%`, background: color }}/></i><em>{value}</em></div>; }

function DealWorkspace({ tab, setTab, groups, labels, ownerName, onOpen }: { tab: DealTab; setTab: (tab: DealTab) => void; groups: Record<DealTab, DealRow[]>; labels: Record<DealTab, string>; ownerName: string; onOpen: (title: string, description: string, rows: DealRow[]) => void }) {
  const rows = groups[tab];
  return <section className="panel"><div className="panel-heading"><div><h2>Deals Workspace</h2><p>Open, won, lost, cold, stuck, no-future-task and overdue-close views.</p></div><button className="text-action" onClick={() => onOpen(`${labels[tab]} deals — ${ownerName}`, "Full matching HubSpot records.", rows)}>View all {rows.length}<ChevronRight size={13}/></button></div><div className={layoutStyles.dealTabs}>{(Object.keys(labels) as DealTab[]).map((key) => <button key={key} className={tab === key ? layoutStyles.activeDealTab : ""} onClick={() => setTab(key)}><span>{labels[key]}</span><b>{groups[key].length}</b></button>)}</div><DealTable rows={rows.slice(0, 20)}/></section>;
}

function TeamTable({ rows, onSelect }: { rows: DetailedRepPerformance[]; onSelect: (rep: DetailedRepPerformance) => void }) { return <div className="table-wrap"><table><thead><tr><th>Rep</th><th>Role</th><th>Leads</th><th>Calls</th><th>Connected</th><th>Meetings</th><th>Open tasks</th><th>New deals</th><th>Won</th><th>Open pipeline</th><th>Cold</th><th>Stuck</th><th>No future</th></tr></thead><tbody>{rows.map((row) => <tr key={row.ownerId} onClick={() => onSelect(row)}><td><div className="rep-cell"><span>{initials(row.ownerName)}</span><div><strong>{row.ownerName}</strong><small>{row.ownerEmail || "HubSpot owner"}</small></div></div></td><td><span className={`${layoutStyles.rolePill} ${row.role === "deals-only" ? layoutStyles.roleDealOnly : ""}`}>{row.role === "deals-only" ? "Deals only" : "Acquisition"}</span></td><td>{row.role === "deals-only" ? "—" : row.newLeads}</td><td>{row.role === "deals-only" ? "—" : row.calls}</td><td>{row.role === "deals-only" ? "—" : row.connectedCalls}</td><td>{row.role === "deals-only" ? "—" : row.meetingsBooked}</td><td>{row.role === "deals-only" ? "—" : row.openTasks}</td><td>{row.dealsCreated}</td><td>{row.dealsWon}</td><td>{formatCurrency(row.openPipeline)}</td><td>{row.coldDeals}</td><td>{row.stuckDeals}</td><td>{row.noFutureActivityDeals}</td></tr>)}</tbody></table></div>; }
function RepPipeline({ rows }: { rows: DetailedRepPerformance[] }) { const maximum = Math.max(...rows.map((row) => row.openPipeline), 1); return <div className="source-list">{rows.map((row) => <div className="source-row" key={row.ownerId}><div><strong>{row.ownerName}</strong><span>{row.openDeals} open · {row.role === "deals-only" ? "Deals only" : "Full rep"}</span></div><i><b style={{ width: `${Math.max(4, row.openPipeline / maximum * 100)}%` }}/></i><em>{formatCurrency(row.openPipeline)}</em></div>)}</div>; }
function RepRisk({ rows }: { rows: DetailedRepPerformance[] }) { return <div className={layoutStyles.riskList}>{rows.map((row) => <article key={row.ownerId}><div><strong>{row.ownerName}</strong><span>{row.role === "deals-only" ? "Deals only" : "Acquisition rep"}</span></div><dl><div><dt>Cold</dt><dd>{row.coldDeals}</dd></div><div><dt>Stuck</dt><dd>{row.stuckDeals}</dd></div><div><dt>No future</dt><dd>{row.noFutureActivityDeals}</dd></div><div><dt>Overdue</dt><dd>{row.overdueCloseDeals}</dd></div></dl></article>)}</div>; }

function LeadTable({ rows }: { rows: AcquisitionLeadV4[] }) { if (!rows.length) return <EmptyState text="No matching leads in this view."/>; return <div className="table-wrap"><table><thead><tr><th>Lead</th><th>Owner</th><th>Company</th><th>Rank</th><th>Lead Status</th><th>Lifecycle</th><th>Eligibility</th><th>Last contact</th><th>Next activity</th></tr></thead><tbody>{rows.map((lead) => <tr key={lead.id} onClick={() => window.open(lead.url, "_blank", "noopener,noreferrer")}><td><strong>{lead.name}</strong><small>{lead.email || lead.title || "No email"}</small></td><td>{lead.ownerName}</td><td><strong>{lead.companyName || "—"}</strong><small>{lead.companyCountry || "—"}</small></td><td><span className={`${styles.rankChip} ${styles[`rank${lead.companyRank}`] ?? ""}`}>{lead.companyRank || "Unknown"}</span></td><td><span className="chip">{lead.leadStatusLabel}</span></td><td>{lead.lifecycleLabel}</td><td><span className={`${styles.eligibility} ${styles[lead.eligibility]}`}>{lead.followUpEligible ? (lead.lastContacted ? "Contacted" : "Needs contact") : lead.exclusionReason || "Converted"}</span></td><td>{formatDate(lead.lastContacted)}</td><td>{formatDate(lead.nextActivity)}</td></tr>)}</tbody></table></div>; }
function CompanyTable({ rows }: { rows: AcquisitionCompanyV4[] }) { if (!rows.length) return <EmptyState text="No matching companies in this view."/>; return <div className="table-wrap"><table><thead><tr><th>Company</th><th>Rank</th><th>Country</th><th>Rep(s)</th><th>Contacts</th><th>Eligible</th><th>Contacted</th><th>Untouched</th><th>Unqualified</th><th>Completed meetings</th><th>Next activity</th></tr></thead><tbody>{rows.map((company) => <tr key={company.id} onClick={() => window.open(company.url, "_blank", "noopener,noreferrer")}><td><strong>{company.name}</strong></td><td><span className={`${styles.rankChip} ${styles[`rank${company.rank}`] ?? ""}`}>{company.rank}</span></td><td>{company.country || "—"}</td><td>{company.ownerNames.join(", ") || "—"}</td><td>{company.contacts}</td><td>{company.eligibleContacts}</td><td>{company.contactedContacts}</td><td className={company.untouchedContacts ? "danger-cell" : ""}>{company.untouchedContacts}</td><td>{company.unqualifiedContacts}</td><td>{company.completedMeetings}</td><td>{formatDate(company.nextActivity)}</td></tr>)}</tbody></table></div>; }
function DealTable({ rows }: { rows: DealRow[] }) { if (!rows.length) return <EmptyState text="No matching deals in this view."/>; return <div className="table-wrap"><table><thead><tr><th>Deal</th><th>Owner</th><th>Stage</th><th>Amount</th><th>Last update</th><th>Next activity</th><th>Close date</th><th>Age</th><th>Risk</th></tr></thead><tbody>{rows.map((deal) => <tr key={deal.id} onClick={() => window.open(deal.url, "_blank", "noopener,noreferrer")}><td><strong>{deal.name}</strong></td><td>{deal.ownerName}</td><td><span className="chip">{deal.stage}</span></td><td>{formatCurrency(deal.amount)}</td><td>{formatDate(deal.updatedAt)}</td><td>{formatDate(deal.nextActivity)}</td><td>{formatDate(deal.closeDate)}</td><td>{deal.ageDays}d</td><td className={deal.riskReason ? "danger-cell" : ""}>{deal.riskReason || "Healthy"}</td></tr>)}</tbody></table></div>; }
function ActivityTable({ rows }: { rows: ActivityRecordV4[] }) { if (!rows.length) return <EmptyState text="No matching activities in this view."/>; return <div className="table-wrap"><table><thead><tr><th>Activity</th><th>Type</th><th>Owner</th><th>Contact(s)</th><th>Date</th><th>Status</th></tr></thead><tbody>{rows.map((activity) => <tr key={`${activity.type}-${activity.id}`} onClick={() => window.open(activity.url, "_blank", "noopener,noreferrer")}><td><strong>{activity.title}</strong></td><td><span className="chip">{activity.type}</span></td><td>{activity.ownerName}</td><td>{activity.contactNames.join(", ") || "—"}</td><td>{formatDate(activity.timestamp)}</td><td>{activity.connected ? "Connected" : activity.completed ? "Completed" : activity.status}</td></tr>)}</tbody></table></div>; }
function EmptyState({ text }: { text: string }) { return <div className="empty-state"><CheckCircle2 size={24}/><span>{text}</span></div>; }

function DrilldownDrawer({ data, onClose }: { data: Drilldown; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const searchable = data.kind === "leads" ? data.leads ?? [] : data.kind === "companies" ? data.companies ?? [] : data.kind === "deals" ? data.deals ?? [] : data.activities ?? [];
  const filtered = searchable.filter((row) => JSON.stringify(row).toLowerCase().includes(query.toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="drawer" onMouseDown={(event) => event.stopPropagation()}><header><div><span>DRILLDOWN · {filtered.length} RECORDS</span><h2>{data.title}</h2><p>{data.description}</p></div><button onClick={onClose}><X size={18}/></button></header><div className={styles.drawerToolbar}><label><Search size={14}/><input value={query} placeholder="Search records…" onChange={(event) => { setQuery(event.target.value); setPage(1); }}/></label><div><button disabled={page <= 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={14}/></button><span>{page} / {pages}</span><button disabled={page >= pages} onClick={() => setPage((current) => current + 1)}><ChevronRight size={14}/></button></div></div><div className="drawer-content">{data.kind === "leads" ? <LeadTable rows={pageRows as AcquisitionLeadV4[]}/> : data.kind === "companies" ? <CompanyTable rows={pageRows as AcquisitionCompanyV4[]}/> : data.kind === "deals" ? <DealTable rows={pageRows as DealRow[]}/> : <ActivityTable rows={pageRows as ActivityRecordV4[]}/>}</div></aside></div>;
}
