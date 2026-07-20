"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity, AlertTriangle, ArrowUpRight, BadgeCheck, BarChart3, BriefcaseBusiness,
  CalendarDays, CheckCircle2, ChevronRight, CircleDollarSign, Clock3, Database,
  Filter, Gauge, Layers3, ListFilter, ListTodo, Mail, Phone, RefreshCw, Search,
  ShieldCheck, Target, TrendingUp, UserRound, UsersRound, X, type LucideIcon,
} from "lucide-react";
import type {
  AcquisitionDashboardData, CountryCoverage, DealRow, FinancialSummary, KpiSet,
  LeadRow, RepPerformance, StageBreakdown,
} from "@/lib/types";
import styles from "@/components/AcquisitionDashboardDetailed.module.css";

type Period = "yesterday" | "mtd" | "ytd" | "custom";
type Tab = "overview" | "focus" | "leads" | "pipeline" | "team";
type DealTab = "open" | "won" | "lost" | "cold" | "stuck" | "noFuture" | "overdue";
type RepRole = "acquisition" | "deals-only";

interface DetailedRep extends RepPerformance {
  role: RepRole;
  yesterday: KpiSet;
}

interface DetailedDashboardData extends Omit<AcquisitionDashboardData, "reps"> {
  reps: DetailedRep[];
  meta: AcquisitionDashboardData["meta"] & {
    uiVersion: string;
    activityOwnerIds: string[];
    dealOnlyOwnerIds: string[];
  };
}

type Drilldown = {
  kind: "leads" | "deals";
  title: string;
  description: string;
  leads?: LeadRow[];
  deals?: DealRow[];
};

const EMPTY_KPIS: KpiSet = {
  newLeads: 0, onlineLeads: 0, offlineLeads: 0, contactedLeads: 0, untouchedLeads: 0,
  untouchedOver24h: 0, contactRate: 0, calls: 0, connectedCalls: 0, connectionRate: 0,
  meetingsBooked: 0, meetingsCompleted: 0, openDeals: 0, openPipeline: 0, dealsCreated: 0,
  dealsWon: 0, dealsLost: 0, pipelineCreated: 0, wonRevenue: 0, openTasks: 0,
  overdueTasks: 0, tasksCompleted: 0, dealsAtRisk: 0, noFutureActivityDeals: 0,
  overdueCloseDeals: 0, coldDeals: 0, stuckDeals: 0,
};

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

function financialFor(deals: DealRow[], kpis: KpiSet): FinancialSummary {
  const sumStage = (pattern: RegExp) => deals.filter((deal) => pattern.test(deal.stage)).reduce((sum, deal) => sum + deal.amount, 0);
  return {
    signedContract: sumStage(/signed|contract/i),
    booked: sumStage(/booked|booking/i),
    cashing: sumStage(/cash|collect/i),
    wonRevenue: kpis.wonRevenue,
    openPipeline: deals.filter((deal) => deal.isOpen).reduce((sum, deal) => sum + deal.amount, 0),
    atRiskPipeline: deals.filter((deal) => deal.isOpen && deal.riskReason).reduce((sum, deal) => sum + deal.amount, 0),
  };
}

function coverageFromLeads(leads: LeadRow[]): CountryCoverage[] {
  const map = new Map<string, CountryCoverage>();
  for (const lead of leads) {
    const country = lead.country || "Unknown";
    const row = map.get(country) ?? { country, leads: 0, online: 0, contacted: 0, untouched: 0, rankATotal: 0, rankAContacted: 0, rankAUntouched: 0, rankBTotal: 0, rankBContacted: 0, rankBUntouched: 0 };
    row.leads += 1;
    if (lead.sourceBucket === "online") row.online += 1;
    if (lead.lastContacted) row.contacted += 1; else row.untouched += 1;
    if (lead.rank === "A") { row.rankATotal += 1; if (lead.lastContacted) row.rankAContacted += 1; else row.rankAUntouched += 1; }
    if (lead.rank === "B") { row.rankBTotal += 1; if (lead.lastContacted) row.rankBContacted += 1; else row.rankBUntouched += 1; }
    map.set(country, row);
  }
  return [...map.values()].sort((a, b) => b.leads - a.leads);
}

function stageRows(deals: DealRow[]): StageBreakdown[] {
  const map = new Map<string, StageBreakdown>();
  for (const deal of deals.filter((row) => row.isOpen)) {
    const item = map.get(deal.stage) ?? { stage: deal.stage, count: 0, amount: 0 };
    item.count += 1;
    item.amount += deal.amount;
    map.set(deal.stage, item);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export function AcquisitionDashboardDetailed() {
  const [period, setPeriod] = useState<Period>("mtd");
  const [customFrom, setCustomFrom] = useState(monthStart);
  const [customTo, setCustomTo] = useState(today);
  const [ownerId, setOwnerId] = useState("all");
  const [country, setCountry] = useState("all");
  const [source, setSource] = useState("all");
  const [rank, setRank] = useState("all");
  const [stage, setStage] = useState("all");
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dealTab, setDealTab] = useState<DealTab>("open");
  const [data, setData] = useState<DetailedDashboardData | null>(null);
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
      setData(payload as DetailedDashboardData);
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

  const selectedLeads = useMemo(() => (data?.allLeads ?? []).filter((lead) =>
    (ownerId === "all" || lead.ownerId === ownerId)
    && (country === "all" || (lead.country || "Unknown") === country)
    && (source === "all" || lead.sourceBucket === source)
    && (rank === "all" || lead.rank === rank),
  ), [data, ownerId, country, source, rank]);
  const selectedDeals = useMemo(() => (data?.allDeals ?? []).filter((deal) =>
    (ownerId === "all" || deal.ownerId === ownerId)
    && (stage === "all" || deal.stage === stage),
  ), [data, ownerId, stage]);

  const baseKpis = ownerId === "all" ? data?.kpis ?? EMPTY_KPIS : selectedRep ?? EMPTY_KPIS;
  const openDeals = selectedDeals.filter((deal) => deal.isOpen);
  const wonDeals = selectedDeals.filter((deal) => !deal.isOpen && deal.isWon);
  const lostDeals = selectedDeals.filter((deal) => !deal.isOpen && !deal.isWon);
  const coldDeals = openDeals.filter((deal) => deal.ageDays >= 21);
  const stuckDeals = openDeals.filter((deal) => !deal.nextActivity && deal.ageDays >= 14);
  const noFutureDeals = openDeals.filter((deal) => !deal.nextActivity);
  const overdueDeals = openDeals.filter((deal) => deal.closeDate && new Date(deal.closeDate).getTime() < Date.now());
  const riskDeals = openDeals.filter((deal) => deal.riskReason);
  const untouchedLeads = selectedLeads.filter((lead) => !lead.lastContacted).sort((a, b) => b.priorityScore - a.priorityScore);
  const onlineUntouched = untouchedLeads.filter((lead) => lead.sourceBucket === "online");
  const offlineUntouched = untouchedLeads.filter((lead) => lead.sourceBucket === "offline");
  const visibleFinancial = financialFor(selectedDeals, baseKpis);
  const visibleCoverage = coverageFromLeads(selectedLeads);
  const visibleStages = stageRows(selectedDeals);
  const ownerName = ownerId === "all" ? "Acquisition Team" : selectedRep?.ownerName || "Selected Owner";
  const portalId = data?.meta.portalId ?? "145742477";

  const dealGroups: Record<DealTab, DealRow[]> = { open: openDeals, won: wonDeals, lost: lostDeals, cold: coldDeals, stuck: stuckDeals, noFuture: noFutureDeals, overdue: overdueDeals };
  const dealLabels: Record<DealTab, string> = { open: "Open", won: "Won", lost: "Lost", cold: "Cold", stuck: "Stuck", noFuture: "No Future Task", overdue: "Overdue Close" };

  function selectOwner(rep: DetailedRep | null) {
    setOwnerId(rep?.ownerId ?? "all");
    setCountry("all");
    setSource("all");
    setRank("all");
    setStage("all");
    setDealTab("open");
    if (rep?.role === "deals-only" && (activeTab === "focus" || activeTab === "leads")) setActiveTab("pipeline");
  }
  function openLeads(title: string, description: string, leads: LeadRow[]) { setDrilldown({ kind: "leads", title, description, leads }); }
  function openDeals(title: string, description: string, deals: DealRow[]) { setDrilldown({ kind: "deals", title, description, deals }); }
  function openHubSpot(objectId: string) { window.open(objectListUrl(portalId, objectId), "_blank", "noopener,noreferrer"); }

  const kpiCards = dealOnly ? [
    { label: "Open pipeline", value: formatCurrency(baseKpis.openPipeline), helper: `${baseKpis.openDeals} open deals`, icon: CircleDollarSign, tone: "amber", action: () => openDeals("Open pipeline", `${ownerName} open opportunities.`, openDeals) },
    { label: "Deals at risk", value: formatNumber(riskDeals.length), helper: "Cold, stuck, overdue or no next step", icon: AlertTriangle, tone: "red", action: () => openDeals("Deals at risk", `${ownerName} deals requiring attention.`, riskDeals) },
    { label: "Cold deals", value: formatNumber(coldDeals.length), helper: "21+ days without movement", icon: Clock3, tone: "amber", action: () => openDeals("Cold deals", "Deals with no meaningful movement for 21+ days.", coldDeals) },
    { label: "Stuck deals", value: formatNumber(stuckDeals.length), helper: "14+ days and no next activity", icon: Layers3, tone: "purple", action: () => openDeals("Stuck deals", "Deals with no next activity and no movement for 14+ days.", stuckDeals) },
    { label: "No future task", value: formatNumber(noFutureDeals.length), helper: "Missing next activity", icon: ListTodo, tone: "blue", action: () => openDeals("No future task", "Open deals without a next activity.", noFutureDeals) },
    { label: "Won revenue", value: formatCurrency(baseKpis.wonRevenue), helper: `${baseKpis.dealsWon} won in period`, icon: TrendingUp, tone: "green", action: () => openDeals("Won deals", `${ownerName} won deals in the selected period.`, wonDeals) },
  ] : [
    { label: "New leads", value: formatNumber(baseKpis.newLeads), helper: `${baseKpis.onlineLeads} online · ${baseKpis.offlineLeads} offline`, icon: UsersRound, tone: "green", action: () => openLeads("New leads", `${ownerName} contacts created in the selected period.`, selectedLeads) },
    { label: "Calls", value: formatNumber(baseKpis.calls), helper: `${baseKpis.connectedCalls} connected · ${baseKpis.connectionRate}%`, icon: Phone, tone: "teal", action: () => openHubSpot("0-48") },
    { label: "Meetings", value: formatNumber(baseKpis.meetingsBooked), helper: `${baseKpis.meetingsCompleted} completed`, icon: CalendarDays, tone: "purple", action: () => openHubSpot("0-47") },
    { label: "Contact rate", value: `${baseKpis.contactRate}%`, helper: `${baseKpis.contactedLeads}/${baseKpis.newLeads} contacted`, icon: ShieldCheck, tone: "blue", action: () => openLeads("Contact coverage", `${ownerName} contact coverage.`, selectedLeads) },
    { label: "Open pipeline", value: formatCurrency(baseKpis.openPipeline), helper: `${baseKpis.openDeals} open deals`, icon: CircleDollarSign, tone: "amber", action: () => openDeals("Open pipeline", `${ownerName} open opportunities.`, openDeals) },
    { label: "Open tasks", value: formatNumber(baseKpis.openTasks), helper: `${baseKpis.overdueTasks} overdue`, icon: ListTodo, tone: "blue", action: () => openHubSpot("0-27") },
    { label: "Deals at risk", value: formatNumber(riskDeals.length), helper: "Overdue, cold, stuck or no next step", icon: AlertTriangle, tone: "red", action: () => openDeals("Deals at risk", `${ownerName} deals requiring attention.`, riskDeals) },
    { label: "Won revenue", value: formatCurrency(baseKpis.wonRevenue), helper: `${baseKpis.dealsWon} won in period`, icon: TrendingUp, tone: "green", action: () => openDeals("Won deals", `${ownerName} won deals in the selected period.`, wonDeals) },
  ];

  return <main className="app-shell">
    <header className="topbar">
      <div className="top-title"><strong>Acquisition Command Center</strong><span>Role-based HubSpot execution, pipeline and deal health</span></div>
      <div className="top-actions"><span className="status-pill live"><i/>LIVE · HUBSPOT</span><button className="icon-button" onClick={() => setFiltersOpen((open) => !open)} aria-label="Toggle filters"><Filter size={18}/></button><button className="refresh-button" onClick={() => void loadDashboard(true)} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""}/>{loading ? "Refreshing…" : "Refresh data"}</button></div>
    </header>

    <div className="workspace">
      <aside className="sidebar">
        <div className="brand"><div className="brand-logo" role="img" aria-label="Talentera ATS"/><span className="brand-subtitle">Acquisition Intelligence</span></div>
        <div className="nav-label">MAIN</div>
        <nav>{tabs.map(({ id, label, icon: Icon, activityOnly }) => {
          const disabled = Boolean(dealOnly && activityOnly);
          return <button key={id} className={activeTab === id ? "active" : ""} disabled={disabled} onClick={() => !disabled && setActiveTab(id)}><Icon size={17}/><span>{label}</span>{disabled ? <small className={styles.navLock}>Deals only</small> : activeTab === id && <ChevronRight size={15}/>}</button>;
        })}</nav>
        <div className="nav-label owner-label">CURRENT VIEW</div>
        <div className="owner-card"><div className="avatar">{initials(ownerName)}</div><div><span>Reporting for</span><strong>{ownerName}</strong><small className={styles.ownerRole}>{ownerId === "all" ? "4 acquisition reps + 2 deals-only" : dealOnly ? "Deals-only view" : "Full acquisition workspace"}</small></div><BadgeCheck size={17}/></div>
        <div className="external-nav"><a href="https://sdr.dashboardtalentera.tech" target="_blank" rel="noreferrer"><Activity size={15}/>SDR Dashboard<ArrowUpRight size={12}/></a></div>
        <div className="sync-card"><Database size={18}/><div><strong>Last sync</strong><span>{data ? new Date(data.meta.generatedAt).toLocaleString("en-GB") : "Loading…"}</span></div></div>
      </aside>

      <div className="content">
        <div className="page-title"><div><span className="eyebrow">TALENTERA · ACQUISITION PERFORMANCE</span><h1>{tabs.find((tab) => tab.id === activeTab)?.label}</h1><p>{formatDate(from)} – {formatDate(to)} · {data?.meta.timezone || "Asia/Riyadh"} · {ownerName}</p></div></div>

        <section className={styles.ownerWorkspace}>
          <button className={`${styles.ownerButton} ${ownerId === "all" ? styles.activeOwner : ""}`} onClick={() => selectOwner(null)}><span className="rep-dot team">TM</span><div><strong>Team Overview</strong><small>Filtered team totals</small></div></button>
          <div className={styles.ownerGroup}><span className={styles.groupLabel}>ACQUISITION REPS</span>{activityReps.map((rep) => <button key={rep.ownerId} className={`${styles.ownerButton} ${ownerId === rep.ownerId ? styles.activeOwner : ""}`} onClick={() => selectOwner(rep)}><span className="rep-dot">{initials(rep.ownerName)}</span><div><strong>{rep.ownerName}</strong><small>Full activity + deals</small></div></button>)}</div>
          <div className={styles.ownerGroup}><span className={`${styles.groupLabel} ${styles.dealOnlyLabel}`}>DEALS ONLY</span>{dealOnlyReps.map((rep) => <button key={rep.ownerId} className={`${styles.ownerButton} ${styles.dealOnlyOwner} ${ownerId === rep.ownerId ? styles.activeOwner : ""}`} onClick={() => selectOwner(rep)}><span className="rep-dot">{initials(rep.ownerName)}</span><div><strong>{rep.ownerName}</strong><small>Pipeline view only</small></div></button>)}</div>
        </section>

        <div className={styles.periodBar}><span>Reporting period</span>{(["yesterday", "mtd", "ytd", "custom"] as Period[]).map((item) => <button key={item} className={period === item ? styles.selectedPeriod : ""} onClick={() => setPeriod(item)}>{item === "mtd" ? "Month to Date" : item === "ytd" ? "Year to Date" : item.charAt(0).toUpperCase() + item.slice(1)}</button>)}</div>

        <div className={`filter-drawer ${filtersOpen ? "open" : ""}`}>
          <div className="filter-grid">
            {period === "custom" && <><FilterField label="From"><input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)}/></FilterField><FilterField label="To"><input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)}/></FilterField></>}
            {!dealOnly && <><FilterField label="Country"><select value={country} onChange={(event) => setCountry(event.target.value)}><option value="all">All countries</option>{[...new Set((data?.allLeads ?? []).filter((lead) => ownerId === "all" || lead.ownerId === ownerId).map((lead) => lead.country || "Unknown"))].sort().map((item) => <option key={item}>{item}</option>)}</select></FilterField><FilterField label="Lead Source"><select value={source} onChange={(event) => setSource(event.target.value)}><option value="all">Online + Offline</option><option value="online">Online / inbound</option><option value="offline">Offline / outbound</option></select></FilterField><FilterField label="Company Rank"><select value={rank} onChange={(event) => setRank(event.target.value)}><option value="all">All ranks</option><option value="A">Rank A</option><option value="B">Rank B</option></select></FilterField></>}
            <FilterField label="Deal Stage"><select value={stage} onChange={(event) => setStage(event.target.value)}><option value="all">All stages</option>{[...new Set((data?.allDeals ?? []).filter((deal) => ownerId === "all" || deal.ownerId === ownerId).map((deal) => deal.stage))].sort().map((item) => <option key={item}>{item}</option>)}</select></FilterField>
            <div className="filter-actions"><button className="secondary-button" onClick={() => { setCountry("all"); setSource("all"); setRank("all"); setStage("all"); }}>Reset</button><button className="primary-button" onClick={() => setFiltersOpen(false)}><Search size={15}/>Apply</button></div>
          </div>
        </div>

        {selectedRep && <RepProfile rep={selectedRep}/>} 
        {!!data?.meta.warnings.length && <div className="warning-banner"><AlertTriangle size={17}/><div><strong>Some HubSpot data needs attention</strong><span>{data.meta.warnings.join(" · ")}</span></div></div>}
        {error && <div className="error-banner"><AlertTriangle size={20}/><div><strong>Dashboard failed to load</strong><span>{error}</span></div><button onClick={() => void loadDashboard(true)}>Try again</button></div>}

        {data && <>
          {(activeTab === "overview" || (dealOnly && activeTab !== "team")) && <>
            <div className="kpi-grid">{kpiCards.map((card) => <KpiCard key={card.label} {...card}/>)}</div>
            {!dealOnly && <YesterdayPanel kpis={selectedRep?.yesterday ?? data.yesterday} title={ownerId === "all" ? "Team execution recap" : `${ownerName} execution recap`}/>} 
            {!dealOnly && <div className="two-column"><Section title="Leads requiring contact" description="Online, offline and SLA follow-up records with full HubSpot details."><LeadSummary online={onlineUntouched} offline={offlineUntouched} all={untouchedLeads} onOpen={openLeads}/></Section><Section title="Rank A/B coverage by country" description={`Detected property: ${data.meta.rankProperty || "Not found"}`}><RankCoverage rows={visibleCoverage}/></Section></div>}
            <DealHealth cold={coldDeals} stuck={stuckDeals} noFuture={noFutureDeals} overdue={overdueDeals} risk={riskDeals} onOpen={openDeals}/>
            <DealWorkspace tab={dealTab} setTab={setDealTab} groups={dealGroups} labels={dealLabels} ownerName={ownerName} onOpen={openDeals}/>
            {ownerId === "all" && <Section title="Role-based team scoreboard" description="Only the four Acquisition reps have activities. Fadi and Faizan are shown as deals-only."><TeamTable rows={data.reps} onSelect={(rep) => selectOwner(rep)}/></Section>}
          </>}

          {activeTab === "focus" && !dealOnly && <>
            <ExecutionFocus kpis={baseKpis} untouched={untouchedLeads} risk={riskDeals} noFuture={noFutureDeals} overdue={overdueDeals} onLeads={openLeads} onDeals={openDeals} onHubSpot={openHubSpot}/>
            <div className="two-column"><Section title="Online leads requiring follow-up" description="Inbound and online-source contacts ordered by priority."><LeadTable rows={onlineUntouched.slice(0, 20)}/></Section><Section title="Offline leads requiring follow-up" description="Outbound, imported and offline-source contacts ordered by priority."><LeadTable rows={offlineUntouched.slice(0, 20)}/></Section></div>
            <div className="two-column"><Section title="Deals with no future activity" description="Open deals without a next activity date."><DealTable rows={noFutureDeals.slice(0, 20)}/></Section><Section title="Close date overdue" description="Open deals whose target close date has passed."><DealTable rows={overdueDeals.slice(0, 20)}/></Section></div>
          </>}

          {activeTab === "leads" && !dealOnly && <>
            <div className="kpi-grid compact-kpis"><KpiCard label="Online untouched" value={formatNumber(onlineUntouched.length)} helper="Needs first contact" icon={Target} tone="green" action={() => openLeads("Online untouched", "Online leads needing first contact.", onlineUntouched)}/><KpiCard label="Offline untouched" value={formatNumber(offlineUntouched.length)} helper="Needs first contact" icon={Mail} tone="amber" action={() => openLeads("Offline untouched", "Offline leads needing first contact.", offlineUntouched)}/><KpiCard label="Untouched over 24h" value={formatNumber(untouchedLeads.filter((lead) => lead.ageHours >= 24).length)} helper="First-contact SLA breach" icon={Clock3} tone="red" action={() => openLeads("Untouched over 24h", "Leads waiting more than 24 hours.", untouchedLeads.filter((lead) => lead.ageHours >= 24))}/><KpiCard label="No next activity" value={formatNumber(selectedLeads.filter((lead) => !lead.nextActivity).length)} helper="Follow-up coverage gap" icon={CalendarDays} tone="purple" action={() => openLeads("No next activity", "Contacts without a next activity.", selectedLeads.filter((lead) => !lead.nextActivity))}/></div>
            <Section title="Rank A/B coverage by country" description={`Detected HubSpot property: ${data.meta.rankProperty || "Not found"}`}><RankCoverage rows={visibleCoverage}/></Section>
            <Section title="Priority lead workspace" description="Full contact details, last contact, next activity and age."><LeadTable rows={untouchedLeads.slice(0, 40)}/></Section>
          </>}

          {activeTab === "pipeline" && <>
            <FinancialPanel data={visibleFinancial}/>
            <DealHealth cold={coldDeals} stuck={stuckDeals} noFuture={noFutureDeals} overdue={overdueDeals} risk={riskDeals} onOpen={openDeals}/>
            <div className="two-column wide-left"><Section title="Open pipeline by stage" description="Deal count and value by HubSpot stage."><StageBars rows={visibleStages}/></Section><Section title="Largest open deals" description="Highest-value opportunities in the current view."><DealTable rows={[...openDeals].sort((a, b) => b.amount - a.amount).slice(0, 15)}/></Section></div>
            <DealWorkspace tab={dealTab} setTab={setDealTab} groups={dealGroups} labels={dealLabels} ownerName={ownerName} onOpen={openDeals}/>
          </>}

          {activeTab === "team" && <>
            <YesterdayPanel kpis={data.yesterday} title="Filtered Acquisition team recap"/>
            <Section title="Team scoreboard" description="Activity metrics apply only to Ursula, Zein, Ahmad and Mohammed Khalid. Fadi and Faizan are deals-only."><TeamTable rows={data.reps} onSelect={(rep) => selectOwner(rep)}/></Section>
            <div className="two-column"><Section title="Open pipeline by rep" description="Current open deal value for the six approved owners."><RepPipeline rows={data.reps}/></Section><Section title="Deal health by rep" description="Cold, stuck, no-future-task and overdue-close workload."><RepRisk rows={data.reps}/></Section></div>
          </>}
        </>}
      </div>
    </div>

    {drilldown && <DrilldownDrawer data={drilldown} onClose={() => setDrilldown(null)}/>} 
  </main>;
}

function FilterField({ label, children }: { label: string; children: ReactNode }) { return <label className="filter-field"><span>{label}</span>{children}</label>; }
function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) { return <section className="panel"><div className="panel-heading"><div><h2>{title}</h2><p>{description}</p></div></div>{children}</section>; }
function KpiCard({ label, value, helper, icon: Icon, tone, action }: { label: string; value: string; helper: string; icon: LucideIcon; tone: string; action: () => void }) { return <button className={`kpi-card tone-${tone}`} onClick={action}><div className="kpi-top"><span>{label}</span><Icon size={18}/></div><strong>{value}</strong><small>{helper}<ListFilter size={13}/></small></button>; }

function RepProfile({ rep }: { rep: DetailedRep }) {
  return <section className={`${styles.repProfile} ${rep.role === "deals-only" ? styles.repProfileDealOnly : ""}`}><div className={styles.repIdentity}><span>{initials(rep.ownerName)}</span><div><small>{rep.role === "deals-only" ? "RETENTION · DEALS ONLY" : "ACQUISITION REP"}</small><h2>{rep.ownerName}</h2><p>{rep.role === "deals-only" ? "Pipeline, deal movement and deal health only. Activities are intentionally excluded." : "Calls, meetings, leads, tasks, pipeline, revenue and follow-up workspace."}</p></div></div><div className={styles.repHealth}><span>Current pipeline</span><strong>{formatCurrency(rep.openPipeline)}</strong><small>{rep.openDeals} open · {rep.dealsAtRisk} at risk</small></div></section>;
}

function YesterdayPanel({ kpis, title }: { kpis: KpiSet; title: string }) {
  const metrics = [["Calls", kpis.calls], ["Connected", kpis.connectedCalls], ["Meetings booked", kpis.meetingsBooked], ["Meetings completed", kpis.meetingsCompleted], ["New leads", kpis.newLeads], ["Tasks completed", kpis.tasksCompleted], ["Deals created", kpis.dealsCreated], ["Won", kpis.dealsWon]] as const;
  return <section className="yesterday-panel"><div className="section-heading"><div><span>YESTERDAY&apos;S PERFORMANCE</span><h2>{title}</h2></div><small>{kpis.connectionRate}% call connection rate</small></div><div className="metric-strip">{metrics.map(([label, value]) => <article key={label}><strong>{formatNumber(value)}</strong><span>{label}</span></article>)}</div></section>;
}

function ExecutionFocus({ kpis, untouched, risk, noFuture, overdue, onLeads, onDeals, onHubSpot }: { kpis: KpiSet; untouched: LeadRow[]; risk: DealRow[]; noFuture: DealRow[]; overdue: DealRow[]; onLeads: (title: string, description: string, rows: LeadRow[]) => void; onDeals: (title: string, description: string, rows: DealRow[]) => void; onHubSpot: (objectId: string) => void }) {
  return <section className="execution-focus"><div className="focus-heading"><div><span>TODAY&apos;S EXECUTION FOCUS</span><strong>What needs attention now</strong></div><span className="drilldown-hint"><ListFilter size={13}/>Click a value</span></div><div className="focus-grid"><FocusMetric label="Leads need contact" value={untouched.length} helper={`${kpis.newLeads} leads in view`} icon={UserRound} tone="red" onClick={() => onLeads("Leads needing contact", "Contacts with no Last Contacted value.", untouched)}/><FocusMetric label="Untouched over 24h" value={untouched.filter((lead) => lead.ageHours >= 24).length} helper="First-contact SLA breach" icon={Clock3} tone="amber" onClick={() => onLeads("Untouched over 24 hours", "Contacts waiting more than 24 hours.", untouched.filter((lead) => lead.ageHours >= 24))}/><FocusMetric label="Deals at risk" value={risk.length} helper="Pipeline requiring action" icon={AlertTriangle} tone="purple" onClick={() => onDeals("Deals at risk", "Overdue, cold, stuck or missing next activity.", risk)}/><FocusMetric label="No future activity" value={noFuture.length} helper="Open deals with no next step" icon={CalendarDays} tone="blue" onClick={() => onDeals("No future activity", "Open deals without a next activity.", noFuture)}/><FocusMetric label="Overdue close" value={overdue.length} helper="Target close date passed" icon={ListTodo} tone="red" onClick={() => onDeals("Overdue close date", "Open deals with a past close date.", overdue)}/><FocusMetric label="Open tasks" value={kpis.openTasks} helper={`${kpis.overdueTasks} overdue`} icon={ShieldCheck} tone="green" onClick={() => onHubSpot("0-27")}/></div></section>;
}
function FocusMetric({ label, value, helper, icon: Icon, tone, onClick }: { label: string; value: number | string; helper: string; icon: LucideIcon; tone: string; onClick: () => void }) { return <button className={`focus-metric tone-${tone}`} onClick={onClick}><span><Icon size={16}/>{label}</span><strong>{typeof value === "number" ? formatNumber(value) : value}</strong><small>{helper}</small></button>; }

function LeadSummary({ online, offline, all, onOpen }: { online: LeadRow[]; offline: LeadRow[]; all: LeadRow[]; onOpen: (title: string, description: string, rows: LeadRow[]) => void }) {
  return <div className={styles.summaryGrid}><button onClick={() => onOpen("Online not contacted", "Online leads requiring contact.", online)}><Target size={17}/><strong>{online.length}</strong><span>Online not contacted</span></button><button onClick={() => onOpen("Offline not contacted", "Offline leads requiring contact.", offline)}><Mail size={17}/><strong>{offline.length}</strong><span>Offline not contacted</span></button><button onClick={() => onOpen("All leads needing contact", "All untouched leads in the current view.", all)}><Phone size={17}/><strong>{all.length}</strong><span>No first contact</span></button></div>;
}

function DealHealth({ cold, stuck, noFuture, overdue, risk, onOpen }: { cold: DealRow[]; stuck: DealRow[]; noFuture: DealRow[]; overdue: DealRow[]; risk: DealRow[]; onOpen: (title: string, description: string, rows: DealRow[]) => void }) {
  const cards = [
    { label: "All at risk", rows: risk, tone: "red", helper: "Any active risk signal" },
    { label: "Cold deals", rows: cold, tone: "amber", helper: "21+ days without movement" },
    { label: "Stuck deals", rows: stuck, tone: "purple", helper: "14+ days and no next activity" },
    { label: "No future task", rows: noFuture, tone: "blue", helper: "Missing next activity" },
    { label: "Overdue close", rows: overdue, tone: "red", helper: "Close date already passed" },
  ];
  return <section className={styles.dealHealth}><div className="section-heading"><div><span>DEAL HEALTH</span><h2>Cold, stuck and execution-risk details</h2></div><small>Click any card for full records</small></div><div className={styles.healthGrid}>{cards.map((card) => <button key={card.label} className={styles[card.tone]} onClick={() => onOpen(card.label, card.helper, card.rows)}><strong>{formatNumber(card.rows.length)}</strong><span>{card.label}</span><small>{card.helper}</small></button>)}</div></section>;
}

function DealWorkspace({ tab, setTab, groups, labels, ownerName, onOpen }: { tab: DealTab; setTab: (tab: DealTab) => void; groups: Record<DealTab, DealRow[]>; labels: Record<DealTab, string>; ownerName: string; onOpen: (title: string, description: string, rows: DealRow[]) => void }) {
  const rows = groups[tab];
  return <section className="panel"><div className="panel-heading"><div><h2>Deals Workspace</h2><p>Open, won, lost, cold, stuck, no-future-task and overdue-close views.</p></div><button className="text-action" onClick={() => onOpen(`${labels[tab]} deals — ${ownerName}`, "Full matching HubSpot records.", rows)}>View all {rows.length}<ChevronRight size={13}/></button></div><div className={styles.dealTabs}>{(Object.keys(labels) as DealTab[]).map((key) => <button key={key} className={tab === key ? styles.activeDealTab : ""} onClick={() => setTab(key)}><span>{labels[key]}</span><b>{groups[key].length}</b></button>)}</div><DealTable rows={rows.slice(0, 20)}/></section>;
}

function FinancialPanel({ data }: { data: FinancialSummary }) { const cards = [["Signed Contract", data.signedContract], ["Booked", data.booked], ["Cashing", data.cashing], ["Won Revenue", data.wonRevenue], ["Open Pipeline", data.openPipeline], ["At-Risk Pipeline", data.atRiskPipeline]] as const; return <section className="financial-panel"><div className="section-heading"><div><span>FINANCIAL SUMMARY</span><h2>Revenue movement</h2></div><small>Filtered to the selected owner and stage</small></div><div className="financial-grid">{cards.map(([label, value]) => <article key={label}><span>{label}</span><strong>{formatCurrency(value)}</strong></article>)}</div></section>; }
function StageBars({ rows }: { rows: StageBreakdown[] }) { const maximum = Math.max(...rows.map((row) => row.amount), 1); return <div className="source-list">{rows.slice(0, 12).map((row) => <div className="source-row" key={row.stage}><div><strong>{row.stage}</strong><span>{row.count} open deals</span></div><i><b style={{ width: `${Math.max(4, row.amount / maximum * 100)}%` }}/></i><em>{formatCurrency(row.amount)}</em></div>)}{!rows.length && <EmptyState text="No open pipeline for this selection."/>}</div>; }

function RankCoverage({ rows }: { rows: CountryCoverage[] }) { if (!rows.length) return <EmptyState text="No rank coverage data for this selection."/>; return <div className="table-wrap"><table><thead><tr><th>Country</th><th>Leads</th><th>Contacted</th><th>Untouched</th><th>A total</th><th>A contacted</th><th>A untouched</th><th>B total</th><th>B contacted</th><th>B untouched</th></tr></thead><tbody>{rows.slice(0, 20).map((row) => <tr key={row.country}><td><strong>{row.country}</strong></td><td>{row.leads}</td><td>{row.contacted}</td><td>{row.untouched}</td><td>{row.rankATotal}</td><td>{row.rankAContacted}</td><td>{row.rankAUntouched}</td><td>{row.rankBTotal}</td><td>{row.rankBContacted}</td><td>{row.rankBUntouched}</td></tr>)}</tbody></table></div>; }

function TeamTable({ rows, onSelect }: { rows: DetailedRep[]; onSelect: (rep: DetailedRep) => void }) { return <div className="table-wrap"><table><thead><tr><th>Rep</th><th>Role</th><th>Leads</th><th>Calls</th><th>Connected</th><th>Meetings</th><th>Open tasks</th><th>New deals</th><th>Won</th><th>Open pipeline</th><th>Cold</th><th>Stuck</th><th>No future</th></tr></thead><tbody>{rows.map((row) => <tr key={row.ownerId} onClick={() => onSelect(row)}><td><div className="rep-cell"><span>{initials(row.ownerName)}</span><div><strong>{row.ownerName}</strong><small>{row.ownerEmail || "HubSpot owner"}</small></div></div></td><td><span className={`${styles.rolePill} ${row.role === "deals-only" ? styles.roleDealOnly : ""}`}>{row.role === "deals-only" ? "Deals only" : "Acquisition"}</span></td><td>{row.role === "deals-only" ? "—" : row.newLeads}</td><td>{row.role === "deals-only" ? "—" : row.calls}</td><td>{row.role === "deals-only" ? "—" : row.connectedCalls}</td><td>{row.role === "deals-only" ? "—" : row.meetingsBooked}</td><td>{row.role === "deals-only" ? "—" : row.openTasks}</td><td>{row.dealsCreated}</td><td>{row.dealsWon}</td><td>{formatCurrency(row.openPipeline)}</td><td>{row.coldDeals}</td><td>{row.stuckDeals}</td><td>{row.noFutureActivityDeals}</td></tr>)}</tbody></table></div>; }
function RepPipeline({ rows }: { rows: DetailedRep[] }) { const maximum = Math.max(...rows.map((row) => row.openPipeline), 1); return <div className="source-list">{rows.map((row) => <div className="source-row" key={row.ownerId}><div><strong>{row.ownerName}</strong><span>{row.openDeals} open · {row.role === "deals-only" ? "Deals only" : "Full rep"}</span></div><i><b style={{ width: `${Math.max(4, row.openPipeline / maximum * 100)}%` }}/></i><em>{formatCurrency(row.openPipeline)}</em></div>)}</div>; }
function RepRisk({ rows }: { rows: DetailedRep[] }) { return <div className={styles.riskList}>{rows.map((row) => <article key={row.ownerId}><div><strong>{row.ownerName}</strong><span>{row.role === "deals-only" ? "Deals only" : "Acquisition rep"}</span></div><dl><div><dt>Cold</dt><dd>{row.coldDeals}</dd></div><div><dt>Stuck</dt><dd>{row.stuckDeals}</dd></div><div><dt>No future</dt><dd>{row.noFutureActivityDeals}</dd></div><div><dt>Overdue</dt><dd>{row.overdueCloseDeals}</dd></div></dl></article>)}</div>; }

function LeadTable({ rows }: { rows: LeadRow[] }) { if (!rows.length) return <EmptyState text="No matching leads in this view."/>; return <div className="table-wrap"><table><thead><tr><th>Lead</th><th>Owner</th><th>Company</th><th>Country</th><th>Source</th><th>Rank</th><th>Created</th><th>Last contacted</th><th>Next activity</th><th>Age</th></tr></thead><tbody>{rows.map((lead) => <tr key={lead.id} onClick={() => window.open(lead.url, "_blank", "noopener,noreferrer")}><td><strong>{lead.name}</strong><small>{lead.email || lead.title || "No email"}</small></td><td>{lead.ownerName}</td><td>{lead.company || "—"}</td><td>{lead.country || "—"}</td><td><span className={`chip ${lead.sourceBucket}`}>{lead.source}</span></td><td>{lead.rank || "—"}</td><td>{formatDate(lead.createdAt)}</td><td>{formatDate(lead.lastContacted)}</td><td>{formatDate(lead.nextActivity)}</td><td>{lead.ageHours}h</td></tr>)}</tbody></table></div>; }
function DealTable({ rows }: { rows: DealRow[] }) { if (!rows.length) return <EmptyState text="No matching deals in this view."/>; return <div className="table-wrap"><table><thead><tr><th>Deal</th><th>Owner</th><th>Stage</th><th>Amount</th><th>Close date</th><th>Last update</th><th>Next activity</th><th>Age</th><th>Risk reason</th></tr></thead><tbody>{rows.map((deal) => <tr key={deal.id} onClick={() => window.open(deal.url, "_blank", "noopener,noreferrer")}><td><strong>{deal.name}</strong></td><td>{deal.ownerName}</td><td><span className="chip">{deal.stage}</span></td><td>{formatCurrency(deal.amount)}</td><td>{formatDate(deal.closeDate)}</td><td>{formatDate(deal.updatedAt)}</td><td>{formatDate(deal.nextActivity)}</td><td>{deal.ageDays}d</td><td className={deal.riskReason ? "danger-cell" : ""}>{deal.riskReason || "Healthy"}</td></tr>)}</tbody></table></div>; }
function EmptyState({ text }: { text: string }) { return <div className="empty-state"><CheckCircle2 size={24}/><span>{text}</span></div>; }
function DrilldownDrawer({ data, onClose }: { data: Drilldown; onClose: () => void }) { return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="drawer" onMouseDown={(event) => event.stopPropagation()}><header><div><span>DRILLDOWN</span><h2>{data.title}</h2><p>{data.description}</p></div><button onClick={onClose}><X size={18}/></button></header><div className="drawer-content">{data.kind === "leads" ? <LeadTable rows={data.leads ?? []}/> : <DealTable rows={data.deals ?? []}/>}</div></aside></div>; }
