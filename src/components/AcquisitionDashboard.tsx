"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity, AlertTriangle, ArrowUpRight, BadgeCheck, BarChart3, BriefcaseBusiness,
  Building2, CalendarDays, CheckCircle2, ChevronRight, CircleDollarSign, Clock3,
  Database, ExternalLink, Filter, Gauge, Layers3, ListFilter, ListTodo, Mail,
  Phone, RefreshCw, Search, ShieldCheck, Target, TrendingUp, UserRound, UsersRound, X,
  type LucideIcon,
} from "lucide-react";
import type {
  AcquisitionDashboardData, CountryCoverage, DealRow, KpiSet, LeadRow, RepPerformance,
} from "@/lib/types";

type Period = "yesterday" | "mtd" | "ytd" | "custom";
type Tab = "overview" | "focus" | "leads" | "pipeline" | "team";
type Drilldown = { kind: "leads" | "deals"; title: string; description: string; leads?: LeadRow[]; deals?: DealRow[] };

const EMPTY_KPIS: KpiSet = {
  newLeads: 0, onlineLeads: 0, offlineLeads: 0, contactedLeads: 0, untouchedLeads: 0,
  untouchedOver24h: 0, contactRate: 0, calls: 0, connectedCalls: 0, connectionRate: 0,
  meetingsBooked: 0, meetingsCompleted: 0, openDeals: 0, openPipeline: 0, dealsCreated: 0,
  dealsWon: 0, dealsLost: 0, pipelineCreated: 0, wonRevenue: 0, openTasks: 0,
  overdueTasks: 0, tasksCompleted: 0, dealsAtRisk: 0, noFutureActivityDeals: 0,
  overdueCloseDeals: 0, coldDeals: 0, stuckDeals: 0,
};

const tabs: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "focus", label: "Today’s Focus", icon: Target },
  { id: "leads", label: "Lead Intelligence", icon: UsersRound },
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

function objectListUrl(portalId: string, objectId: string) {
  return `https://app-eu1.hubspot.com/contacts/${portalId}/objects/${objectId}/views/all/list?utm_source=acquisition_dashboard&utm_medium=dashboard`;
}

export function AcquisitionDashboard() {
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
  const [data, setData] = useState<AcquisitionDashboardData | null>(null);
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
      setData(payload as AcquisitionDashboardData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const selectedRep = data?.reps.find((rep) => rep.ownerId === ownerId);
  const baseKpis = ownerId === "all" ? data?.kpis ?? EMPTY_KPIS : selectedRep ?? EMPTY_KPIS;
  const leadFiltersActive = country !== "all" || source !== "all" || rank !== "all";
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
  const openDeals = selectedDeals.filter((deal) => deal.isOpen);
  const contactedLeads = selectedLeads.filter((lead) => Boolean(lead.lastContacted)).length;
  const visibleKpis: KpiSet = {
    ...baseKpis,
    ...(leadFiltersActive ? {
      newLeads: selectedLeads.length,
      onlineLeads: selectedLeads.filter((lead) => lead.sourceBucket === "online").length,
      offlineLeads: selectedLeads.filter((lead) => lead.sourceBucket === "offline").length,
      contactedLeads,
      untouchedLeads: selectedLeads.length - contactedLeads,
      untouchedOver24h: selectedLeads.filter((lead) => !lead.lastContacted && lead.ageHours >= 24).length,
      contactRate: selectedLeads.length ? Math.round((contactedLeads / selectedLeads.length) * 1000) / 10 : 0,
    } : {}),
    ...(stage !== "all" ? {
      openDeals: openDeals.length,
      openPipeline: openDeals.reduce((sum, deal) => sum + deal.amount, 0),
      dealsAtRisk: openDeals.filter((deal) => deal.riskReason).length,
      noFutureActivityDeals: openDeals.filter((deal) => !deal.nextActivity).length,
      overdueCloseDeals: openDeals.filter((deal) => deal.closeDate && new Date(deal.closeDate).getTime() < Date.now()).length,
      coldDeals: openDeals.filter((deal) => deal.ageDays >= 21).length,
      stuckDeals: openDeals.filter((deal) => !deal.nextActivity && deal.ageDays >= 14).length,
    } : {}),
  };
  const priorityLeads = selectedLeads.filter((lead) => !lead.lastContacted).sort((a, b) => b.priorityScore - a.priorityScore);
  const onlineLeads = selectedLeads.filter((lead) => lead.sourceBucket === "online");
  const offlineLeads = selectedLeads.filter((lead) => lead.sourceBucket === "offline");
  const dealsAtRisk = openDeals.filter((deal) => deal.riskReason);
  const noFutureDeals = openDeals.filter((deal) => !deal.nextActivity);
  const overdueDeals = openDeals.filter((deal) => deal.closeDate && new Date(deal.closeDate).getTime() < Date.now());
  const coldDeals = openDeals.filter((deal) => deal.ageDays >= 21);
  const stuckDeals = openDeals.filter((deal) => !deal.nextActivity && deal.ageDays >= 14);
  const countries = [...new Set((data?.allLeads ?? []).map((lead) => lead.country || "Unknown"))].sort();
  const stages = [...new Set((data?.openDeals ?? []).map((deal) => deal.stage))].sort();
  const ownerName = ownerId === "all" ? "Acquisition Team" : selectedRep?.ownerName || "Selected Owner";
  const portalId = data?.meta.portalId ?? "145742477";

  function openLeads(title: string, description: string, leads: LeadRow[]) { setDrilldown({ kind: "leads", title, description, leads }); }
  function openDealsDrawer(title: string, description: string, deals: DealRow[]) { setDrilldown({ kind: "deals", title, description, deals }); }
  function openHubSpot(objectId: string) { window.open(objectListUrl(portalId, objectId), "_blank", "noopener,noreferrer"); }
  function resetFilters() { setCountry("all"); setSource("all"); setRank("all"); setStage("all"); }

  const kpiCards = [
    { label: "New leads", value: formatNumber(visibleKpis.newLeads), helper: `${visibleKpis.onlineLeads} online · ${visibleKpis.offlineLeads} offline`, icon: UsersRound, tone: "green", action: () => openLeads("New leads", "Contacts created in the selected period.", selectedLeads) },
    { label: "Calls", value: formatNumber(visibleKpis.calls), helper: `${visibleKpis.connectedCalls} connected · ${visibleKpis.connectionRate}%`, icon: Phone, tone: "teal", action: () => openHubSpot("0-48") },
    { label: "Meetings", value: formatNumber(visibleKpis.meetingsBooked), helper: `${visibleKpis.meetingsCompleted} completed`, icon: CalendarDays, tone: "purple", action: () => openHubSpot("0-47") },
    { label: "Contact rate", value: `${visibleKpis.contactRate}%`, helper: `${visibleKpis.contactedLeads}/${visibleKpis.newLeads} contacted`, icon: ShieldCheck, tone: "blue", action: () => openLeads("Contact coverage", "Leads behind the displayed contact rate.", selectedLeads) },
    { label: "Open pipeline", value: formatCurrency(visibleKpis.openPipeline), helper: `${visibleKpis.openDeals} open deals`, icon: CircleDollarSign, tone: "amber", action: () => openDealsDrawer("Open pipeline", "Open HubSpot deals in the current selection.", openDeals) },
    { label: "Open tasks", value: formatNumber(visibleKpis.openTasks), helper: `${visibleKpis.overdueTasks} overdue`, icon: ListTodo, tone: "blue", action: () => openHubSpot("0-27") },
    { label: "Deals at risk", value: formatNumber(visibleKpis.dealsAtRisk), helper: "Overdue, cold, stuck or no next step", icon: AlertTriangle, tone: "red", action: () => openDealsDrawer("Deals at risk", "Open deals requiring immediate action.", dealsAtRisk) },
    { label: "Won revenue", value: formatCurrency(visibleKpis.wonRevenue), helper: `${visibleKpis.dealsWon} won in period`, icon: TrendingUp, tone: "green", action: () => openDealsDrawer("Won deals", "Closed-won deals in the selected period.", selectedDeals.filter((deal) => deal.isWon)) },
  ];

  return <main className="app-shell">
    <header className="topbar">
      <div className="top-title"><strong>Acquisition Command Center</strong><span>Live HubSpot performance, pipeline & revenue intelligence</span></div>
      <div className="top-actions"><span className="status-pill live"><i/>LIVE · HUBSPOT</span><button className="icon-button" onClick={() => setFiltersOpen((open) => !open)} aria-label="Toggle filters"><Filter size={18}/></button><button className="refresh-button" onClick={() => void loadDashboard(true)} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""}/>{loading ? "Refreshing…" : "Refresh data"}</button></div>
    </header>

    <div className="workspace">
      <aside className="sidebar">
        <div className="brand"><div className="brand-logo" role="img" aria-label="Talentera ATS"/><span className="brand-subtitle">Acquisition Intelligence</span></div>
        <div className="nav-label">MAIN</div>
        <nav>{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)}><Icon size={17}/><span>{label}</span>{activeTab === id && <ChevronRight size={15}/>}</button>)}</nav>
        <div className="nav-label owner-label">CURRENT VIEW</div>
        <div className="owner-card"><div className="avatar">{initials(ownerName)}</div><div><span>Reporting for</span><strong>{ownerName}</strong></div><BadgeCheck size={17}/></div>
        <div className="external-nav"><a href="https://sdr.dashboardtalentera.tech" target="_blank" rel="noreferrer"><Activity size={15}/>SDR Dashboard<ArrowUpRight size={12}/></a></div>
        <div className="sync-card"><Database size={18}/><div><strong>Last sync</strong><span>{data ? new Date(data.meta.generatedAt).toLocaleString("en-GB") : "Loading…"}</span></div></div>
      </aside>

      <div className="content">
        <div className="page-title"><div><span className="eyebrow">TALENTERA · ACQUISITION PERFORMANCE</span><h1>{tabs.find((tab) => tab.id === activeTab)?.label}</h1><p>{formatDate(from)} – {formatDate(to)} · {data?.meta.timezone || "Asia/Riyadh"} · {ownerName}</p></div></div>

        <section className="owner-strip"><button className={ownerId === "all" ? "active" : ""} onClick={() => setOwnerId("all")}><span className="rep-dot team">TM</span><strong>Team Overview</strong></button>{(data?.reps ?? []).map((rep) => <button key={rep.ownerId} className={ownerId === rep.ownerId ? "active" : ""} onClick={() => setOwnerId(rep.ownerId)}><span className="rep-dot">{initials(rep.ownerName)}</span><strong>{rep.ownerName}</strong></button>)}</section>

        <div className={`filter-drawer ${filtersOpen ? "open" : ""}`}>
          <div className="preset-row"><span>Reporting period</span>{(["yesterday", "mtd", "ytd", "custom"] as Period[]).map((item) => <button key={item} className={period === item ? "selected" : ""} onClick={() => setPeriod(item)}>{item === "mtd" ? "Month to Date" : item === "ytd" ? "Year to Date" : item.charAt(0).toUpperCase() + item.slice(1)}</button>)}</div>
          <div className="filter-grid">
            {period === "custom" && <><FilterField label="From"><input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)}/></FilterField><FilterField label="To"><input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)}/></FilterField></>}
            <FilterField label="Country"><select value={country} onChange={(event) => setCountry(event.target.value)}><option value="all">All countries</option>{countries.map((item) => <option key={item}>{item}</option>)}</select></FilterField>
            <FilterField label="Lead Source"><select value={source} onChange={(event) => setSource(event.target.value)}><option value="all">Online + Offline</option><option value="online">Online / inbound</option><option value="offline">Offline / outbound</option></select></FilterField>
            <FilterField label="Company Rank"><select value={rank} onChange={(event) => setRank(event.target.value)}><option value="all">All ranks</option><option value="A">Rank A</option><option value="B">Rank B</option></select></FilterField>
            <FilterField label="Deal Stage"><select value={stage} onChange={(event) => setStage(event.target.value)}><option value="all">All stages</option>{stages.map((item) => <option key={item}>{item}</option>)}</select></FilterField>
            <div className="filter-actions"><button className="secondary-button" onClick={resetFilters}>Reset</button><button className="primary-button" onClick={() => setFiltersOpen(false)}><Search size={15}/>Apply</button></div>
          </div>
          <p className="filter-note">Owner applies to the whole dashboard. Country, source and rank refine lead sections; stage refines pipeline sections.</p>
        </div>

        {!!data?.meta.warnings.length && <div className="warning-banner"><AlertTriangle size={17}/><div><strong>Some HubSpot data needs attention</strong><span>{data.meta.warnings.join(" · ")}</span></div></div>}
        {error && <div className="error-banner"><AlertTriangle size={20}/><div><strong>Dashboard failed to load</strong><span>{error}</span></div><button onClick={() => void loadDashboard(true)}>Try again</button></div>}

        {data && <>
          {activeTab === "overview" && <>
            <div className="kpi-grid">{kpiCards.map((card) => <KpiCard key={card.label} {...card}/>)}</div>
            <ExecutionFocus kpis={visibleKpis} priorityLeads={priorityLeads} noFutureDeals={noFutureDeals} overdueDeals={overdueDeals} onLeads={openLeads} onDeals={openDealsDrawer} onHubSpot={openHubSpot}/>
            <div className="two-column wide-left">
              <Section title="Daily Acquisition execution" description="Leads, calls, connected calls, meetings, completed tasks and deals created."><DailyExecution data={data.dailyActivities}/></Section>
              <Section title="Acquisition funnel" description="Live period progression from lead creation to sales outcomes."><Funnel kpis={visibleKpis}/></Section>
            </div>
            <YesterdayPanel kpis={data.yesterday}/>
            <div className="two-column wide-left">
              <Section title="Priority leads & SLA breaches" description="Highest-priority untouched records, ordered by urgency." action={<button className="text-action" onClick={() => openLeads("Priority leads", "All priority leads in this view.", priorityLeads)}>View all<ChevronRight size={13}/></button>}><LeadTable rows={priorityLeads.slice(0, 10)}/></Section>
              <Section title="Lead source performance" description="Contacted and untouched leads by Original Traffic Source."><SourceBars rows={data.sources}/></Section>
            </div>
            <FinancialPanel data={data.financial}/>
          </>}

          {activeTab === "focus" && <>
            <ExecutionFocus kpis={visibleKpis} priorityLeads={priorityLeads} noFutureDeals={noFutureDeals} overdueDeals={overdueDeals} onLeads={openLeads} onDeals={openDealsDrawer} onHubSpot={openHubSpot}/>
            <div className="two-column">
              <Section title="Online leads requiring follow-up" description="Inbound and online-source contacts ordered by priority."><LeadTable rows={onlineLeads.filter((lead) => !lead.lastContacted).slice(0, 15)}/></Section>
              <Section title="Offline leads requiring follow-up" description="Imported, outbound and offline-source contacts ordered by priority."><LeadTable rows={offlineLeads.filter((lead) => !lead.lastContacted).slice(0, 15)}/></Section>
            </div>
            <div className="two-column">
              <Section title="Deals with no future activity" description="Open opportunities without a next activity date."><DealTable rows={noFutureDeals.slice(0, 12)}/></Section>
              <Section title="Close date overdue" description="Open opportunities whose close date has passed."><DealTable rows={overdueDeals.slice(0, 12)}/></Section>
            </div>
          </>}

          {activeTab === "leads" && <>
            <div className="kpi-grid compact-kpis">
              <KpiCard label="Online leads" value={formatNumber(onlineLeads.length)} helper={`${onlineLeads.filter((lead) => !lead.lastContacted).length} untouched`} icon={Target} tone="green" action={() => openLeads("Online leads", "Online and inbound contacts.", onlineLeads)}/>
              <KpiCard label="Offline leads" value={formatNumber(offlineLeads.length)} helper={`${offlineLeads.filter((lead) => !lead.lastContacted).length} untouched`} icon={Mail} tone="amber" action={() => openLeads("Offline leads", "Offline and outbound contacts.", offlineLeads)}/>
              <KpiCard label="Untouched over 24h" value={formatNumber(priorityLeads.filter((lead) => lead.ageHours >= 24).length)} helper="First-contact SLA risk" icon={Clock3} tone="red" action={() => openLeads("Untouched over 24 hours", "Leads waiting more than 24 hours for first contact.", priorityLeads.filter((lead) => lead.ageHours >= 24))}/>
              <KpiCard label="No next activity" value={formatNumber(selectedLeads.filter((lead) => !lead.nextActivity).length)} helper="Follow-up coverage gap" icon={CalendarDays} tone="purple" action={() => openLeads("Leads with no next activity", "Contacts without a scheduled next activity.", selectedLeads.filter((lead) => !lead.nextActivity))}/>
            </div>
            <div className="two-column wide-left">
              <Section title="Lead acquisition funnel" description="Period-level progression and conversion health."><Funnel kpis={visibleKpis}/></Section>
              <Section title="Original Traffic Sources" description="Contacted and untouched lead coverage."><SourceBars rows={data.sources}/></Section>
            </div>
            <Section title="Rank A/B coverage by country" description={`Detected HubSpot property: ${data.meta.rankProperty || "Not found"}`}><RankCoverage rows={data.countries} onCountry={(item) => setCountry(item)}/></Section>
            <Section title="Priority lead workspace" description="Filtered contacts ordered by execution priority."><LeadTable rows={priorityLeads.slice(0, 30)}/></Section>
          </>}

          {activeTab === "pipeline" && <>
            <FinancialPanel data={data.financial}/>
            <div className="kpi-grid compact-kpis">
              <KpiCard label="Deals at risk" value={formatNumber(dealsAtRisk.length)} helper={formatCurrency(dealsAtRisk.reduce((sum, deal) => sum + deal.amount, 0))} icon={AlertTriangle} tone="red" action={() => openDealsDrawer("Deals at risk", "Open opportunities requiring attention.", dealsAtRisk)}/>
              <KpiCard label="Cold deals" value={formatNumber(coldDeals.length)} helper="No meaningful update for 21+ days" icon={Clock3} tone="amber" action={() => openDealsDrawer("Cold deals", "Open deals unchanged for 21 days or more.", coldDeals)}/>
              <KpiCard label="Stuck deals" value={formatNumber(stuckDeals.length)} helper="No next activity and 14+ days" icon={Layers3} tone="purple" action={() => openDealsDrawer("Stuck deals", "Open deals with no next step and no recent movement.", stuckDeals)}/>
              <KpiCard label="No future task" value={formatNumber(noFutureDeals.length)} helper="Missing next activity" icon={ListTodo} tone="blue" action={() => openDealsDrawer("Deals with no future activity", "Open deals missing a next activity.", noFutureDeals)}/>
            </div>
            <div className="two-column wide-left">
              <Section title="Open pipeline by stage" description="Deal count and value by HubSpot stage."><StageBars rows={data.stages}/></Section>
              <Section title="Largest open deals" description="Highest-value open opportunities in the current view."><DealTable rows={openDeals.sort((a, b) => b.amount - a.amount).slice(0, 12)}/></Section>
            </div>
            <div className="two-column">
              <Section title="Deals at risk" description="Overdue, cold, stuck or no next activity."><DealTable rows={dealsAtRisk.slice(0, 15)}/></Section>
              <Section title="Close date overdue" description="Open deals that have passed their target close date."><DealTable rows={overdueDeals.slice(0, 15)}/></Section>
            </div>
          </>}

          {activeTab === "team" && <>
            <YesterdayPanel kpis={data.yesterday}/>
            <Section title="Team scoreboard" description="Live comparison by HubSpot owner. Click a rep to focus the dashboard."><TeamTable rows={data.reps} selectedOwner={ownerId} onSelect={setOwnerId}/></Section>
            <div className="two-column">
              <Section title="Open pipeline by rep" description="Current open deal value across the Acquisition team."><RepBars rows={data.reps}/></Section>
              <Section title="Lead coverage by rep" description="New leads, contacted leads, untouched leads and contact rate."><LeadCoverage rows={data.reps}/></Section>
            </div>
          </>}
        </>}
      </div>
    </div>

    {drilldown && <DrilldownDrawer data={drilldown} onClose={() => setDrilldown(null)}/>} 
  </main>;
}

function FilterField({ label, children }: { label: string; children: ReactNode }) { return <label className="filter-field"><span>{label}</span>{children}</label>; }
function Section({ title, description, children, action }: { title: string; description: string; children: ReactNode; action?: ReactNode }) { return <section className="panel"><div className="panel-heading"><div><h2>{title}</h2><p>{description}</p></div>{action}</div>{children}</section>; }
function KpiCard({ label, value, helper, icon: Icon, tone, action }: { label: string; value: string; helper: string; icon: LucideIcon; tone: string; action: () => void }) { return <button className={`kpi-card tone-${tone}`} onClick={action}><div className="kpi-top"><span>{label}</span><Icon size={18}/></div><strong>{value}</strong><small>{helper}<ListFilter size={13}/></small></button>; }

function ExecutionFocus({ kpis, priorityLeads, noFutureDeals, overdueDeals, onLeads, onDeals, onHubSpot }: { kpis: KpiSet; priorityLeads: LeadRow[]; noFutureDeals: DealRow[]; overdueDeals: DealRow[]; onLeads: (title: string, description: string, rows: LeadRow[]) => void; onDeals: (title: string, description: string, rows: DealRow[]) => void; onHubSpot: (objectId: string) => void }) {
  return <section className="execution-focus"><div className="focus-heading"><div><span>TODAY&apos;S EXECUTION FOCUS</span><strong>What needs attention now</strong></div><span className="drilldown-hint"><ListFilter size={13}/>Click a value</span></div><div className="focus-grid">
    <FocusMetric label="Leads need contact" value={kpis.untouchedLeads} helper={`${kpis.newLeads} leads in view`} icon={UserRound} tone="red" onClick={() => onLeads("Leads needing contact", "Contacts with no Last Contacted value.", priorityLeads)}/>
    <FocusMetric label="Untouched over 24h" value={kpis.untouchedOver24h} helper="First-contact SLA breach" icon={Clock3} tone="amber" onClick={() => onLeads("Untouched over 24 hours", "Contacts waiting more than 24 hours for first contact.", priorityLeads.filter((lead) => lead.ageHours >= 24))}/>
    <FocusMetric label="Deals at risk" value={kpis.dealsAtRisk} helper="Pipeline requiring action" icon={AlertTriangle} tone="purple" onClick={() => onDeals("Deals at risk", "Overdue, cold, stuck or missing a next activity.", [...noFutureDeals, ...overdueDeals].filter((deal, index, rows) => rows.findIndex((item) => item.id === deal.id) === index))}/>
    <FocusMetric label="No future activity" value={kpis.noFutureActivityDeals} helper="Open deals with no next step" icon={CalendarDays} tone="blue" onClick={() => onDeals("Deals with no future activity", "Open deals without a next activity date.", noFutureDeals)}/>
    <FocusMetric label="Overdue tasks" value={kpis.overdueTasks} helper={`${kpis.openTasks} open tasks`} icon={ListTodo} tone="red" onClick={() => onHubSpot("0-27")}/>
    <FocusMetric label="Contact rate" value={`${kpis.contactRate}%`} helper={`${kpis.contactedLeads} contacted leads`} icon={ShieldCheck} tone="green" onClick={() => onLeads("Contact coverage", "Leads contributing to the displayed contact rate.", priorityLeads)}/>
  </div></section>;
}

function FocusMetric({ label, value, helper, icon: Icon, tone, onClick }: { label: string; value: number | string; helper: string; icon: LucideIcon; tone: string; onClick: () => void }) { return <button className={`focus-metric tone-${tone}`} onClick={onClick}><span><Icon size={16}/>{label}</span><strong>{typeof value === "number" ? formatNumber(value) : value}</strong><small>{helper}</small></button>; }

function YesterdayPanel({ kpis }: { kpis: KpiSet }) { const metrics = [["Calls", kpis.calls], ["Connected", kpis.connectedCalls], ["Meetings booked", kpis.meetingsBooked], ["Meetings completed", kpis.meetingsCompleted], ["New leads", kpis.newLeads], ["Tasks completed", kpis.tasksCompleted], ["Deals created", kpis.dealsCreated], ["Won", kpis.dealsWon]] as const; return <section className="yesterday-panel"><div className="section-heading"><div><span>YESTERDAY&apos;S PERFORMANCE</span><h2>Team execution recap</h2></div><small>{kpis.connectionRate}% call connection rate</small></div><div className="metric-strip">{metrics.map(([label, value]) => <article key={label}><strong>{formatNumber(value)}</strong><span>{label}</span></article>)}</div></section>; }

function DailyExecution({ data }: { data: AcquisitionDashboardData["dailyActivities"] }) { const rows = data.slice(-31); const maximum = Math.max(...rows.map((row) => Math.max(row.leads, row.calls, row.meetings, row.dealsCreated)), 1); return <div className="daily-chart"><div className="daily-legend"><span><i className="green"/>Calls</span><span><i className="blue"/>Leads</span><span><i className="purple"/>Meetings</span><span><i className="amber"/>Deals</span></div><div className="daily-bars">{rows.map((row) => <div className="day-column" key={row.date} title={`${row.date}: ${row.calls} calls, ${row.leads} leads, ${row.meetings} meetings, ${row.dealsCreated} deals`}><div className="bar-stack"><i className="calls" style={{ height: `${Math.max(2, (row.calls / maximum) * 100)}%` }}/><i className="leads" style={{ height: `${Math.max(2, (row.leads / maximum) * 100)}%` }}/><i className="meetings" style={{ height: `${Math.max(2, (row.meetings / maximum) * 100)}%` }}/><i className="deals" style={{ height: `${Math.max(2, (row.dealsCreated / maximum) * 100)}%` }}/></div><span>{row.date.slice(5)}</span></div>)}</div></div>; }

function Funnel({ kpis }: { kpis: KpiSet }) { const stages = [{ label: "New leads", value: kpis.newLeads }, { label: "Contacted", value: kpis.contactedLeads }, { label: "Connected calls", value: kpis.connectedCalls }, { label: "Meetings", value: kpis.meetingsBooked }, { label: "Deals created", value: kpis.dealsCreated }, { label: "Won", value: kpis.dealsWon }]; const maximum = Math.max(...stages.map((item) => item.value), 1); return <div className="funnel-list">{stages.map((item, index) => <div className="funnel-row" key={item.label}><span>{index + 1}</span><div><strong>{item.label}</strong><i><b style={{ width: `${Math.max(5, item.value / maximum * 100)}%` }}/></i></div><em>{formatNumber(item.value)}</em></div>)}</div>; }

function SourceBars({ rows }: { rows: AcquisitionDashboardData["sources"] }) { const maximum = Math.max(...rows.map((row) => row.count), 1); return <div className="source-list">{rows.slice(0, 10).map((row) => <div className="source-row" key={row.source}><div><strong>{row.source}</strong><span>{row.contacted} contacted · {row.untouched} untouched</span></div><i><b style={{ width: `${Math.max(4, row.count / maximum * 100)}%` }}/></i><em>{row.count}</em></div>)}{!rows.length && <EmptyState text="No lead source data for this period."/>}</div>; }

function StageBars({ rows }: { rows: AcquisitionDashboardData["stages"] }) { const maximum = Math.max(...rows.map((row) => row.amount), 1); return <div className="source-list">{rows.slice(0, 12).map((row) => <div className="source-row" key={row.stage}><div><strong>{row.stage}</strong><span>{row.count} open deals</span></div><i><b style={{ width: `${Math.max(4, row.amount / maximum * 100)}%` }}/></i><em>{formatCurrency(row.amount)}</em></div>)}{!rows.length && <EmptyState text="No open pipeline for this selection."/>}</div>; }

function FinancialPanel({ data }: { data: AcquisitionDashboardData["financial"] }) { const cards = [["Signed Contract", data.signedContract], ["Booked", data.booked], ["Cashing", data.cashing], ["Won Revenue", data.wonRevenue], ["Open Pipeline", data.openPipeline], ["At-Risk Pipeline", data.atRiskPipeline]] as const; return <section className="financial-panel"><div className="section-heading"><div><span>FINANCIAL SUMMARY</span><h2>Revenue movement</h2></div><small>Stage labels are read directly from HubSpot</small></div><div className="financial-grid">{cards.map(([label, value]) => <article key={label}><span>{label}</span><strong>{formatCurrency(value)}</strong></article>)}</div></section>; }

function RankCoverage({ rows, onCountry }: { rows: CountryCoverage[]; onCountry: (country: string) => void }) { if (!rows.length) return <EmptyState text="No country coverage data for this period."/>; return <div className="table-wrap"><table><thead><tr><th>Country</th><th>Leads</th><th>Contacted</th><th>Untouched</th><th>A total</th><th>A contacted</th><th>A untouched</th><th>B total</th><th>B contacted</th><th>B untouched</th></tr></thead><tbody>{rows.slice(0, 20).map((row) => <tr key={row.country}><td><button className="table-link" onClick={() => onCountry(row.country)}>{row.country}</button></td><td>{row.leads}</td><td>{row.contacted}</td><td>{row.untouched}</td><td>{row.rankATotal}</td><td>{row.rankAContacted}</td><td>{row.rankAUntouched}</td><td>{row.rankBTotal}</td><td>{row.rankBContacted}</td><td>{row.rankBUntouched}</td></tr>)}</tbody></table></div>; }

function TeamTable({ rows, selectedOwner, onSelect }: { rows: RepPerformance[]; selectedOwner: string; onSelect: (owner: string) => void }) { return <div className="table-wrap"><table><thead><tr><th>Sales Rep</th><th>Leads</th><th>Calls</th><th>Connected</th><th>Conn. rate</th><th>Meetings</th><th>New deals</th><th>Won</th><th>Pipeline created</th><th>Open pipeline</th><th>At risk</th></tr></thead><tbody>{rows.map((row) => <tr key={row.ownerId} className={selectedOwner === row.ownerId ? "selected-row" : ""} onClick={() => onSelect(row.ownerId)}><td><div className="rep-cell"><span>{initials(row.ownerName)}</span><div><strong>{row.ownerName}</strong><small>{row.ownerEmail || "HubSpot owner"}</small></div></div></td><td>{row.newLeads}</td><td>{row.calls}</td><td>{row.connectedCalls}</td><td>{row.connectionRate}%</td><td>{row.meetingsBooked}</td><td>{row.dealsCreated}</td><td>{row.dealsWon}</td><td>{formatCurrency(row.pipelineCreated)}</td><td>{formatCurrency(row.openPipeline)}</td><td className={row.dealsAtRisk ? "danger-cell" : ""}>{row.dealsAtRisk}</td></tr>)}</tbody></table></div>; }

function RepBars({ rows }: { rows: RepPerformance[] }) { const maximum = Math.max(...rows.map((row) => row.openPipeline), 1); return <div className="source-list">{rows.slice(0, 12).map((row) => <div className="source-row" key={row.ownerId}><div><strong>{row.ownerName}</strong><span>{row.openDeals} open deals</span></div><i><b style={{ width: `${Math.max(4, row.openPipeline / maximum * 100)}%` }}/></i><em>{formatCurrency(row.openPipeline)}</em></div>)}</div>; }
function LeadCoverage({ rows }: { rows: RepPerformance[] }) { return <div className="coverage-cards">{rows.slice(0, 12).map((row) => <article key={row.ownerId}><div><span>{initials(row.ownerName)}</span><strong>{row.ownerName}</strong></div><dl><div><dt>Leads</dt><dd>{row.newLeads}</dd></div><div><dt>Contacted</dt><dd>{row.contactedLeads}</dd></div><div><dt>Untouched</dt><dd>{row.untouchedLeads}</dd></div><div><dt>Rate</dt><dd>{row.contactRate}%</dd></div></dl></article>)}</div>; }

function LeadTable({ rows }: { rows: LeadRow[] }) { if (!rows.length) return <EmptyState text="No matching leads in this view."/>; return <div className="table-wrap"><table><thead><tr><th>Lead</th><th>Owner</th><th>Company</th><th>Country</th><th>Source</th><th>Rank</th><th>Age</th><th>Status</th></tr></thead><tbody>{rows.map((lead) => <tr key={lead.id} onClick={() => window.open(lead.url, "_blank", "noopener,noreferrer")}><td><strong>{lead.name}</strong><small>{lead.email || lead.title || "No email"}</small></td><td>{lead.ownerName}</td><td>{lead.company || "—"}</td><td>{lead.country || "—"}</td><td><span className={`chip ${lead.sourceBucket}`}>{lead.source}</span></td><td>{lead.rank || "—"}</td><td>{lead.ageHours}h</td><td><span className={`score-badge ${lead.priorityScore >= 70 ? "high" : lead.priorityScore >= 45 ? "medium" : "low"}`}>{lead.priorityScore}</span></td></tr>)}</tbody></table></div>; }
function DealTable({ rows }: { rows: DealRow[] }) { if (!rows.length) return <EmptyState text="No matching deals in this view."/>; return <div className="table-wrap"><table><thead><tr><th>Deal</th><th>Owner</th><th>Stage</th><th>Amount</th><th>Close date</th><th>Age</th><th>Risk</th></tr></thead><tbody>{rows.map((deal) => <tr key={deal.id} onClick={() => window.open(deal.url, "_blank", "noopener,noreferrer")}><td><strong>{deal.name}</strong></td><td>{deal.ownerName}</td><td><span className="chip">{deal.stage}</span></td><td>{formatCurrency(deal.amount)}</td><td>{formatDate(deal.closeDate)}</td><td>{deal.ageDays}d</td><td className={deal.riskReason ? "danger-cell" : ""}>{deal.riskReason || "Healthy"}</td></tr>)}</tbody></table></div>; }
function EmptyState({ text }: { text: string }) { return <div className="empty-state"><CheckCircle2 size={24}/><span>{text}</span></div>; }

function DrilldownDrawer({ data, onClose }: { data: Drilldown; onClose: () => void }) { return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="drawer" onMouseDown={(event) => event.stopPropagation()}><header><div><span>DRILLDOWN</span><h2>{data.title}</h2><p>{data.description}</p></div><button onClick={onClose}><X size={18}/></button></header><div className="drawer-content">{data.kind === "leads" ? <LeadTable rows={data.leads ?? []}/> : <DealTable rows={data.deals ?? []}/>}</div></aside></div>; }
