"use client";

import Link from "next/link";
import {
  Activity, AlertCircle, ArrowLeft, ArrowUpRight, BadgeCheck, CalendarClock, CheckCircle2,
  ChevronLeft, ChevronRight, CircleDot, Clock3, Database, Filter, History, Inbox, ListChecks,
  LoaderCircle, Mail, Phone, RefreshCw, Search, ShieldCheck, Sparkles, Target, UserRound,
  UsersRound, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  WorkspaceChange,
  WorkspaceLead,
  WorkspaceLeadDetail,
  WorkspaceLeadState,
  WorkspacePageResponse,
} from "@/lib/lead-workspace-types";
import styles from "@/components/LeadWorkspace.module.css";

const FILTER_STORAGE_KEY = "talentera-lead-workspace-filters";
const LAST_SEEN_STORAGE_KEY = "talentera-lead-workspace-last-seen";

type StateFilter = "all" | WorkspaceLeadState;
type RefreshMode = "none" | "delta" | "full";

const stateLabels: Record<WorkspaceLeadState, string> = {
  "online-untouched": "Online · untouched",
  "online-contacted": "Online · contacted",
  "offline-untouched": "Offline · untouched",
  "offline-contacted": "Offline · contacted",
  unqualified: "Unqualified",
  converted: "Converted / open deal",
  excluded: "Excluded",
  unknown: "Unknown source",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDateTime(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?";
}

function urgencyLabel(urgency: WorkspaceLead["advice"]["urgency"]) {
  if (urgency === "critical") return "Do now";
  if (urgency === "high") return "High";
  if (urgency === "medium") return "Medium";
  if (urgency === "low") return "Planned";
  return "No outreach";
}

export function LeadWorkspace() {
  const currentYear = new Date().getUTCFullYear();
  const [year] = useState(currentYear);
  const [ownerId, setOwnerId] = useState("all");
  const [source, setSource] = useState<"all" | "online" | "offline" | "unknown">("all");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [rank, setRank] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [data, setData] = useState<WorkspacePageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [selectedLead, setSelectedLead] = useState<WorkspaceLead | null>(null);
  const [detail, setDetail] = useState<WorkspaceLeadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [changesOpen, setChangesOpen] = useState(true);
  const lastSeenRef = useRef("");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || "{}") as Partial<{
        ownerId: string;
        source: "all" | "online" | "offline" | "unknown";
        stateFilter: StateFilter;
        rank: string;
        pageSize: number;
      }>;
      if (saved.ownerId) setOwnerId(saved.ownerId);
      if (saved.source) setSource(saved.source);
      if (saved.stateFilter) setStateFilter(saved.stateFilter);
      if (saved.rank) setRank(saved.rank);
      if (saved.pageSize) setPageSize(saved.pageSize);
      lastSeenRef.current = localStorage.getItem(LAST_SEEN_STORAGE_KEY) || "";
    } catch {
      localStorage.removeItem(FILTER_STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ ownerId, source, stateFilter, rank, pageSize }));
  }, [hydrated, ownerId, source, stateFilter, rank, pageSize]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadWorkspace = useCallback(async (refresh: RefreshMode = "none") => {
    if (!hydrated) return;
    refresh === "none" ? setLoading(true) : setRefreshing(true);
    setError("");
    try {
      const query = new URLSearchParams({
        year: String(year),
        ownerId,
        source,
        state: stateFilter,
        rank,
        search,
        page: String(page),
        pageSize: String(pageSize),
        since: lastSeenRef.current,
        refresh,
      });
      const response = await fetch(`/api/lead-workspace?${query}`, { cache: "no-store" });
      const payload = await response.json() as WorkspacePageResponse & { error?: string; details?: string };
      if (!response.ok) throw new Error(payload.error || payload.details || "Unable to load lead workspace");
      setData(payload);
      lastSeenRef.current = payload.meta.generatedAt;
      localStorage.setItem(LAST_SEEN_STORAGE_KEY, payload.meta.generatedAt);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load lead workspace");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hydrated, year, ownerId, source, stateFilter, rank, search, page, pageSize]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  const openLead = useCallback(async (lead: WorkspaceLead | { id: string }) => {
    const row = "name" in lead ? lead : data?.rows.find((item) => item.id === lead.id) ?? null;
    setSelectedLead(row);
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/lead-workspace/${lead.id}`, { cache: "no-store" });
      const payload = await response.json() as WorkspaceLeadDetail & { error?: string; details?: string };
      if (!response.ok) throw new Error(payload.error || payload.details || "Unable to load live lead details");
      setSelectedLead(payload.lead);
      setDetail(payload);
      setData((current) => current ? {
        ...current,
        rows: current.rows.map((item) => item.id === payload.lead.id ? payload.lead : item),
      } : current);
    } catch (loadError) {
      setDetailError(loadError instanceof Error ? loadError.message : "Unable to load live lead details");
    } finally {
      setDetailLoading(false);
    }
  }, [data]);

  const resetFilters = () => {
    setOwnerId("all");
    setSource("all");
    setStateFilter("all");
    setRank("all");
    setSearchInput("");
    setSearch("");
    setPage(1);
  };

  const changedLeadIds = useMemo(() => new Set((data?.changes ?? []).map((change) => change.leadId)), [data]);
  const openTasks = detail?.tasks.filter((task) => !task.completed) ?? [];
  const completedTasks = detail?.tasks.filter((task) => task.completed) ?? [];

  const cards: Array<{
    label: string;
    value: number;
    helper: string;
    state: StateFilter;
    icon: typeof UsersRound;
    tone: string;
  }> = data ? [
    { label: "All YTD leads", value: data.summary.total, helper: `${data.summary.followUpEligible} follow-up eligible`, state: "all", icon: UsersRound, tone: "green" },
    { label: "Online untouched", value: data.summary.onlineUntouched, helper: `${data.summary.overdueFollowUps} over 24h`, state: "online-untouched", icon: Inbox, tone: "red" },
    { label: "Online contacted", value: data.summary.onlineContacted, helper: "Inbound with contact history", state: "online-contacted", icon: CheckCircle2, tone: "blue" },
    { label: "Offline untouched", value: data.summary.offlineUntouched, helper: "Research signal before touch", state: "offline-untouched", icon: Target, tone: "amber" },
    { label: "Offline contacted", value: data.summary.offlineContacted, helper: `${data.summary.noNextActivity} contacted with no next step`, state: "offline-contacted", icon: Phone, tone: "purple" },
    { label: "Unqualified", value: data.summary.unqualified, helper: "Excluded from active queue", state: "unqualified", icon: ShieldCheck, tone: "slate" },
    { label: "Converted", value: data.summary.converted, helper: "Open deal / opportunity", state: "converted", icon: BadgeCheck, tone: "teal" },
  ] : [];

  return <main className={styles.shell}>
    <header className={styles.topbar}>
      <div className={styles.titleBlock}>
        <span>Talentera · Acquisition Intelligence</span>
        <h1>YTD Lead Workspace</h1>
        <p>Prioritised lead queues, live HubSpot tasks and low-memory incremental sync.</p>
      </div>
      <div className={styles.topActions}>
        <span className={styles.livePill}><CircleDot size={13}/>LIVE · HUBSPOT</span>
        <button className={styles.secondaryButton} onClick={() => void loadWorkspace("delta")} disabled={refreshing}>
          <RefreshCw size={15} className={refreshing ? styles.spin : ""}/>{refreshing ? "Syncing changes…" : "Sync changes"}
        </button>
        <Link className={styles.backButton} href="/"><ArrowLeft size={15}/>Command Center</Link>
      </div>
    </header>

    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}><div className={styles.brandLogo}/><small>LEAD OPERATING SYSTEM</small></div>
        <nav className={styles.sideNav}>
          <a href="#queue"><UsersRound size={17}/>Smart queue</a>
          <a href="#changes"><History size={17}/>Recent changes</a>
          <a href="#guidance"><Sparkles size={17}/>Guidance</a>
        </nav>
        <div className={styles.syncInfo}>
          <Database size={18}/>
          <div><strong>Snapshot</strong><span>{data ? formatDateTime(data.meta.generatedAt) : "Loading…"}</span><small>{data ? `${data.meta.syncMode} sync · v${data.meta.version}` : "Disk-backed cache"}</small></div>
        </div>
        <button className={styles.fullSyncButton} onClick={() => void loadWorkspace("full")} disabled={refreshing}>Full reconcile</button>
      </aside>

      <section className={styles.content}>
        <div className={styles.contextBar}>
          <div><span>REPORTING PERIOD</span><strong>01 Jan {year} – Today</strong></div>
          <div><span>SNAPSHOT SIZE</span><strong>{formatNumber(data?.meta.totalSnapshotLeads ?? 0)} leads</strong></div>
          <div><span>RESOURCE MODE</span><strong>Disk cache + paginated API</strong></div>
        </div>

        {error && <div className={styles.errorBanner}><AlertCircle size={18}/><div><strong>Workspace could not load</strong><span>{error}</span></div><button onClick={() => void loadWorkspace("delta")}>Retry</button></div>}

        <section className={styles.cardsGrid}>
          {cards.map(({ label, value, helper, state, icon: Icon, tone }) => <button key={label} className={`${styles.summaryCard} ${styles[tone] ?? ""} ${stateFilter === state ? styles.activeCard : ""}`} onClick={() => { setStateFilter(state); setPage(1); }}>
            <div><span>{label}</span><Icon size={18}/></div><strong>{formatNumber(value)}</strong><small>{helper}</small>
          </button>)}
        </section>

        <section className={styles.filterPanel}>
          <div className={styles.searchBox}><Search size={16}/><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search name, email, phone, company or title…"/></div>
          <label><span>Owner</span><select value={ownerId} onChange={(event) => { setOwnerId(event.target.value); setPage(1); }}><option value="all">All Acquisition reps</option>{data?.owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label>
          <label><span>Source</span><select value={source} onChange={(event) => { setSource(event.target.value as typeof source); setPage(1); }}><option value="all">Online + Offline</option><option value="online">Online</option><option value="offline">Offline</option><option value="unknown">Unknown</option></select></label>
          <label><span>Queue</span><select value={stateFilter} onChange={(event) => { setStateFilter(event.target.value as StateFilter); setPage(1); }}><option value="all">All lead states</option>{Object.entries(stateLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label><span>Company rank</span><select value={rank} onChange={(event) => { setRank(event.target.value); setPage(1); }}><option value="all">All ranks</option><option value="A">Rank A</option><option value="B">Rank B</option><option value="C">Rank C</option><option value="Unknown">Unknown</option></select></label>
          <button className={styles.resetButton} onClick={resetFilters}><Filter size={15}/>Reset</button>
        </section>

        <section id="changes" className={styles.changePanel}>
          <button className={styles.sectionToggle} onClick={() => setChangesOpen((open) => !open)}>
            <div><History size={18}/><span><strong>Changes since your last visit</strong><small>Only records that were added or materially changed are listed here.</small></span></div>
            <b>{data?.changes.length ?? 0}</b>
          </button>
          {changesOpen && <div className={styles.changeList}>
            {!data?.changes.length && <p>No material HubSpot changes since the last saved cursor.</p>}
            {data?.changes.slice(0, 25).map((change) => <ChangeRow key={`${change.leadId}-${change.changedAt}-${change.type}`} change={change} onOpen={() => void openLead({ id: change.leadId })}/>)}
          </div>}
        </section>

        <section id="queue" className={styles.queuePanel}>
          <div className={styles.sectionHeader}>
            <div><span>SMART WORK QUEUE</span><h2>{stateFilter === "all" ? "All YTD leads" : stateLabels[stateFilter]}</h2><p>{formatNumber(data?.meta.totalFiltered ?? 0)} matching records · sorted by action priority.</p></div>
            <label className={styles.pageSize}>Rows<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label>
          </div>

          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Lead</th><th>Source & state</th><th>Status</th><th>Last contact</th><th>Next activity</th><th>Guidance</th><th/></tr></thead>
              <tbody>
                {loading && <tr><td colSpan={7}><div className={styles.loadingRow}><LoaderCircle className={styles.spin} size={20}/>Loading the saved YTD snapshot…</div></td></tr>}
                {!loading && !data?.rows.length && <tr><td colSpan={7}><div className={styles.emptyRow}>No leads match the current filters.</div></td></tr>}
                {!loading && data?.rows.map((lead) => <LeadRow key={lead.id} lead={lead} changed={changedLeadIds.has(lead.id)} onOpen={() => void openLead(lead)}/>) }
              </tbody>
            </table>
          </div>

          <div className={styles.pagination}>
            <button disabled={!data || data.meta.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={16}/>Previous</button>
            <span>Page <strong>{data?.meta.page ?? 1}</strong> of <strong>{data?.meta.totalPages ?? 1}</strong></span>
            <button disabled={!data || data.meta.page >= data.meta.totalPages} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={16}/></button>
          </div>
        </section>

        <section id="guidance" className={styles.guidanceFooter}>
          <Sparkles size={20}/><div><strong>Guidance runs without an AI API.</strong><span>It is a deterministic next-best-action engine using source, contact history, company rank, status, SLA age and future-task coverage—so it adds no model cost and almost no RAM overhead.</span></div>
        </section>
      </section>
    </div>

    {selectedLead && <LeadDrawer lead={selectedLead} detail={detail} loading={detailLoading} error={detailError} openTasks={openTasks} completedTasks={completedTasks} onClose={() => { setSelectedLead(null); setDetail(null); }}/>} 
  </main>;
}

function LeadRow({ lead, changed, onOpen }: { lead: WorkspaceLead; changed: boolean; onOpen: () => void }) {
  return <tr className={changed ? styles.changedRow : ""} onClick={onOpen}>
    <td><div className={styles.leadIdentity}><span>{initials(lead.name)}</span><div><strong>{lead.name}</strong><small>{lead.title || "No title"} · {lead.companyName}</small><em>{lead.ownerName}</em></div></div></td>
    <td><span className={`${styles.stateBadge} ${styles[lead.state] ?? ""}`}>{stateLabels[lead.state]}</span><small className={styles.rankLabel}>Rank {lead.companyRank}</small></td>
    <td><strong className={styles.statusText}>{lead.leadStatusLabel}</strong><small>{lead.lifecycleLabel}</small></td>
    <td><strong>{formatDate(lead.lastContacted)}</strong><small>{lead.lastContacted ? "Contacted" : `${lead.ageHours}h untouched`}</small></td>
    <td><strong>{formatDate(lead.nextActivity)}</strong><small>{lead.nextActivity ? "Scheduled" : "No future activity"}</small></td>
    <td><span className={`${styles.urgency} ${styles[lead.advice.urgency] ?? ""}`}>{urgencyLabel(lead.advice.urgency)}</span><strong className={styles.adviceTitle}>{lead.advice.title}</strong></td>
    <td><button className={styles.openRowButton} aria-label={`Open ${lead.name}`}><ArrowUpRight size={16}/></button></td>
  </tr>;
}

function ChangeRow({ change, onOpen }: { change: WorkspaceChange; onOpen: () => void }) {
  return <button className={styles.changeRow} onClick={onOpen}>
    <span className={`${styles.changeType} ${styles[change.type] ?? ""}`}>{change.type}</span>
    <div><strong>{change.leadName}</strong><small>{change.fields.join(" · ")}</small></div>
    <time>{formatDateTime(change.changedAt)}</time>
    <ArrowUpRight size={15}/>
  </button>;
}

function LeadDrawer({
  lead, detail, loading, error, openTasks, completedTasks, onClose,
}: {
  lead: WorkspaceLead;
  detail: WorkspaceLeadDetail | null;
  loading: boolean;
  error: string;
  openTasks: WorkspaceLeadDetail["tasks"];
  completedTasks: WorkspaceLeadDetail["tasks"];
  onClose: () => void;
}) {
  return <div className={styles.drawerBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className={styles.drawer}>
      <header><div><span className={styles.drawerAvatar}>{initials(lead.name)}</span><div><small>LIVE HUBSPOT RECORD</small><h2>{lead.name}</h2><p>{lead.title || "No title"} · {lead.companyName}</p></div></div><button onClick={onClose}><X size={19}/></button></header>

      <div className={styles.drawerActions}>
        <a href={lead.url} target="_blank" rel="noreferrer">Open contact<ArrowUpRight size={14}/></a>
        {lead.companyUrl && <a href={lead.companyUrl} target="_blank" rel="noreferrer">Open company<ArrowUpRight size={14}/></a>}
        {lead.email && <a href={`mailto:${lead.email}`}><Mail size={14}/>{lead.email}</a>}
        {lead.phone && <a href={`tel:${lead.phone}`}><Phone size={14}/>{lead.phone}</a>}
      </div>

      <section className={`${styles.adviceCard} ${styles[lead.advice.urgency] ?? ""}`}>
        <div><Sparkles size={18}/><span><small>NEXT BEST ACTION · {urgencyLabel(lead.advice.urgency)}</small><strong>{lead.advice.title}</strong></span></div>
        <p>{lead.advice.reason}</p>
        <div className={styles.channelList}>{lead.advice.suggestedChannels.map((channel) => <span key={channel}>{channel}</span>)}</div>
        <em>{lead.advice.taskSuggestion}</em>
      </section>

      <div className={styles.recordGrid}>
        <div><span>Source</span><strong>{lead.source}</strong></div><div><span>State</span><strong>{stateLabels[lead.state]}</strong></div>
        <div><span>Lead status</span><strong>{lead.leadStatusLabel}</strong></div><div><span>Lifecycle</span><strong>{lead.lifecycleLabel}</strong></div>
        <div><span>Company rank</span><strong>{lead.companyRank}</strong></div><div><span>Owner</span><strong>{lead.ownerName}</strong></div>
        <div><span>Created</span><strong>{formatDateTime(lead.createdAt)}</strong></div><div><span>Modified</span><strong>{formatDateTime(lead.modifiedAt)}</strong></div>
      </div>

      {loading && <div className={styles.drawerLoading}><LoaderCircle className={styles.spin} size={20}/>Refreshing the record and its tasks from HubSpot…</div>}
      {error && <div className={styles.drawerError}><AlertCircle size={17}/>{error}</div>}

      {detail && <>
        <section className={styles.taskSection}>
          <div className={styles.drawerSectionTitle}><div><ListChecks size={17}/><span><strong>Open tasks</strong><small>{openTasks.length} currently actionable</small></span></div><time>Live at {formatDateTime(detail.fetchedAt)}</time></div>
          {!openTasks.length && <p className={styles.emptyTask}>No open task is associated with this contact.</p>}
          {openTasks.map((task) => <a key={task.id} className={styles.taskRow} href={task.url} target="_blank" rel="noreferrer"><CalendarClock size={16}/><div><strong>{task.subject}</strong><small>{task.priority} · Due {formatDateTime(task.dueAt)}</small>{task.body && <p>{task.body}</p>}</div><ArrowUpRight size={15}/></a>)}
        </section>

        <section className={styles.taskSection}>
          <div className={styles.drawerSectionTitle}><div><Activity size={17}/><span><strong>Recent calls & meetings</strong><small>{detail.activities.length} associated activities</small></span></div></div>
          {!detail.activities.length && <p className={styles.emptyTask}>No associated calls or meetings were found.</p>}
          {detail.activities.slice(0, 20).map((activity) => <a key={`${activity.type}-${activity.id}`} className={styles.activityRow} href={activity.url} target="_blank" rel="noreferrer"><span className={activity.completed || activity.connected ? styles.activityDone : ""}>{activity.type === "Call" ? <Phone size={15}/> : <CalendarClock size={15}/>}</span><div><strong>{activity.title}</strong><small>{activity.status} · {formatDateTime(activity.timestamp)}</small></div><ArrowUpRight size={14}/></a>)}
        </section>

        {!!completedTasks.length && <details className={styles.completedDetails}><summary><CheckCircle2 size={16}/>{completedTasks.length} completed tasks</summary>{completedTasks.slice(0, 30).map((task) => <a key={task.id} href={task.url} target="_blank" rel="noreferrer">{task.subject}<span>{formatDateTime(task.dueAt)}</span></a>)}</details>}
      </>}
    </aside>
  </div>;
}
