"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AcquisitionDashboardData, DealRow, KpiSet, LeadRow } from "@/lib/types";

type Period = "yesterday" | "mtd" | "ytd" | "custom";

const EMPTY_KPIS: KpiSet = {
  newLeads: 0,
  onlineLeads: 0,
  calls: 0,
  connectedCalls: 0,
  connectionRate: 0,
  meetings: 0,
  openDeals: 0,
  openPipeline: 0,
  openTasks: 0,
  overdueTasks: 0,
  dealsAtRisk: 0,
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function today() {
  return isoDate(new Date());
}

function monthStart() {
  const date = new Date();
  return isoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
}

function yearStart() {
  const date = new Date();
  return isoDate(new Date(Date.UTC(date.getUTCFullYear(), 0, 1)));
}

function yesterday() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return isoDate(date);
}

function rangeForPeriod(period: Period, customFrom: string, customTo: string) {
  if (period === "yesterday") return { from: yesterday(), to: yesterday() };
  if (period === "ytd") return { from: yearStart(), to: today() };
  if (period === "custom") return { from: customFrom, to: customTo };
  return { from: monthStart(), to: today() };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function listUrl(portalId: string, objectId: string) {
  return `https://app-eu1.hubspot.com/contacts/${portalId}/objects/${objectId}/views/all/list?utm_source=acquisition_dashboard&utm_medium=dashboard`;
}

export function AcquisitionDashboard() {
  const [period, setPeriod] = useState<Period>("mtd");
  const [customFrom, setCustomFrom] = useState(monthStart);
  const [customTo, setCustomTo] = useState(today);
  const [ownerId, setOwnerId] = useState("all");
  const [data, setData] = useState<AcquisitionDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const { from, to } = useMemo(
    () => rangeForPeriod(period, customFrom, customTo),
    [period, customFrom, customTo],
  );

  const loadDashboard = useCallback(async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ from, to });
      if (refresh) query.set("refresh", "1");
      const response = await fetch(`/api/dashboard?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load dashboard");
      setData(payload as AcquisitionDashboardData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const selectedRep = data?.reps.find((rep) => rep.ownerId === ownerId);
  const kpis = ownerId === "all" ? data?.kpis ?? EMPTY_KPIS : selectedRep ?? EMPTY_KPIS;
  const leads = useMemo(
    () => (data?.priorityLeads ?? []).filter((lead) => ownerId === "all" || lead.ownerId === ownerId),
    [data, ownerId],
  );
  const dealsAtRisk = useMemo(
    () => (data?.dealsAtRisk ?? []).filter((deal) => ownerId === "all" || deal.ownerId === ownerId),
    [data, ownerId],
  );
  const openDeals = useMemo(
    () => (data?.openDeals ?? []).filter((deal) => ownerId === "all" || deal.ownerId === ownerId),
    [data, ownerId],
  );

  const portalId = data?.meta.portalId ?? "145742477";

  return <main className="dashboard-shell">
    <header className="topbar">
      <div className="brand-mark">T</div>
      <div className="brand-copy">
        <span>Talentera</span>
        <strong>Acquisition Command Center</strong>
      </div>
      <div className="live-status"><i/>LIVE · HUBSPOT API</div>
      <button className="refresh-button" type="button" onClick={() => void loadDashboard(true)} disabled={loading}>
        {loading ? "Refreshing…" : "Refresh live data"}
      </button>
    </header>

    <section className="hero-panel">
      <div>
        <span className="eyebrow">ACQUISITION PERFORMANCE</span>
        <h1>Revenue execution in one live view.</h1>
        <p>Contacts, calls, meetings, tasks, pipeline and deal risk are loaded directly from HubSpot without n8n or JSON files.</p>
      </div>
      <div className="generated-card">
        <span>Last generated</span>
        <strong>{data ? new Date(data.meta.generatedAt).toLocaleString("en-GB") : "Loading…"}</strong>
        <small>{from} → {to}</small>
      </div>
    </section>

    <section className="filter-bar">
      <div className="period-tabs">
        {(["yesterday", "mtd", "ytd", "custom"] as Period[]).map((item) => <button
          type="button"
          key={item}
          className={period === item ? "active" : ""}
          onClick={() => setPeriod(item)}
        >{item === "mtd" ? "Month to Date" : item === "ytd" ? "Year to Date" : item.charAt(0).toUpperCase() + item.slice(1)}</button>)}
      </div>
      {period === "custom" && <div className="custom-range">
        <label>From<input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)}/></label>
        <label>To<input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)}/></label>
      </div>}
      <label className="owner-filter">Sales Rep
        <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
          <option value="all">All Acquisition Team</option>
          {(data?.reps ?? []).map((rep) => <option key={rep.ownerId} value={rep.ownerId}>{rep.ownerName}</option>)}
        </select>
      </label>
    </section>

    {error && <div className="error-banner"><strong>Dashboard could not load</strong><span>{error}</span><button onClick={() => void loadDashboard(true)}>Try again</button></div>}
    {!!data?.meta.warnings.length && <div className="warning-banner"><strong>Partial HubSpot data</strong><span>{data.meta.warnings.join(" ")}</span></div>}

    <section className="kpi-grid" aria-busy={loading}>
      <KpiCard label="New leads" value={formatNumber(kpis.newLeads)} helper={`${kpis.onlineLeads} online`} href={listUrl(portalId, "0-1")}/>
      <KpiCard label="Calls" value={formatNumber(kpis.calls)} helper={`${kpis.connectedCalls} connected · ${kpis.connectionRate}%`} href={listUrl(portalId, "0-48")}/>
      <KpiCard label="Meetings" value={formatNumber(kpis.meetings)} helper="Booked in selected period" href={listUrl(portalId, "0-47")}/>
      <KpiCard label="Open pipeline" value={formatCurrency(kpis.openPipeline)} helper={`${kpis.openDeals} open deals`} href={listUrl(portalId, "0-3")}/>
      <KpiCard label="Open tasks" value={formatNumber(kpis.openTasks)} helper={`${kpis.overdueTasks} overdue`} href={listUrl(portalId, "0-27")}/>
      <KpiCard label="Deals at risk" value={formatNumber(kpis.dealsAtRisk)} helper="Overdue or no next activity" href="#deals-at-risk" danger={kpis.dealsAtRisk > 0}/>
    </section>

    <section className="content-grid">
      <div className="panel" id="priority-leads">
        <PanelHeading eyebrow="TODAY'S FOCUS" title="Untouched online leads" helper={`${leads.length} leads need first contact`}/>
        <LeadTable rows={leads.slice(0, 12)}/>
      </div>

      <div className="panel source-panel">
        <PanelHeading eyebrow="LEAD SOURCES" title="Source performance" helper="New contacts in the selected period"/>
        <div className="source-list">
          {(data?.sources ?? []).slice(0, 8).map((source) => {
            const maximum = Math.max(...(data?.sources ?? []).map((item) => item.count), 1);
            return <div className="source-row" key={source.source}>
              <div><strong>{source.source}</strong><span>{source.count}</span></div>
              <i><b style={{ width: `${Math.max(4, (source.count / maximum) * 100)}%` }}/></i>
            </div>;
          })}
          {!data?.sources.length && <EmptyState text="No lead source data for this period."/>}
        </div>
      </div>
    </section>

    <section className="panel" id="deals-at-risk">
      <PanelHeading eyebrow="PIPELINE CONTROL" title="Deals at risk" helper="Open deals with an overdue close date or no future activity"/>
      <DealTable rows={dealsAtRisk.slice(0, 15)} showRisk/>
    </section>

    <section className="content-grid lower-grid">
      <div className="panel">
        <PanelHeading eyebrow="REP EXECUTION" title="Team performance" helper="Live comparison by HubSpot owner"/>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Sales Rep</th><th>Leads</th><th>Calls</th><th>Connected</th><th>Meetings</th><th>Pipeline</th></tr></thead>
            <tbody>{(data?.reps ?? []).map((rep) => <tr key={rep.ownerId} className={ownerId === rep.ownerId ? "selected-row" : ""} onClick={() => setOwnerId(rep.ownerId)}>
              <td><strong>{rep.ownerName}</strong></td><td>{rep.newLeads}</td><td>{rep.calls}</td><td>{rep.connectedCalls}</td><td>{rep.meetings}</td><td>{formatCurrency(rep.openPipeline)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <PanelHeading eyebrow="OPEN PIPELINE" title="Largest open deals" helper={`${openDeals.length} deals in the current view`}/>
        <DealTable rows={openDeals.slice(0, 10)}/>
      </div>
    </section>
  </main>;
}

function KpiCard({ label, value, helper, href, danger = false }: { label: string; value: string; helper: string; href: string; danger?: boolean }) {
  return <a className={`kpi-card${danger ? " danger" : ""}`} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined}>
    <span>{label}</span><strong>{value}</strong><small>{helper}<b>→</b></small>
  </a>;
}

function PanelHeading({ eyebrow, title, helper }: { eyebrow: string; title: string; helper: string }) {
  return <div className="panel-heading"><div><span>{eyebrow}</span><h2>{title}</h2><p>{helper}</p></div></div>;
}

function LeadTable({ rows }: { rows: LeadRow[] }) {
  if (!rows.length) return <EmptyState text="No untouched online leads in this view."/>;
  return <div className="table-wrap"><table><thead><tr><th>Contact</th><th>Company</th><th>Country</th><th>Source</th><th>Added</th><th>Status</th></tr></thead>
    <tbody>{rows.map((lead) => <tr key={lead.id} onClick={() => window.open(lead.url, "_blank", "noopener,noreferrer")}>
      <td><strong>{lead.name}</strong><small>{lead.email || "No email"}</small></td><td>{lead.company || "—"}</td><td>{lead.country || "—"}</td><td><span className="chip">{lead.source}</span></td><td>{formatDate(lead.createdAt)}</td><td>{lead.leadStatus}</td>
    </tr>)}</tbody></table></div>;
}

function DealTable({ rows, showRisk = false }: { rows: DealRow[]; showRisk?: boolean }) {
  if (!rows.length) return <EmptyState text={showRisk ? "No deals at risk in this view." : "No open deals in this view."}/>;
  return <div className="table-wrap"><table><thead><tr><th>Deal</th><th>Stage</th><th>Amount</th><th>Close date</th>{showRisk && <th>Risk</th>}</tr></thead>
    <tbody>{rows.map((deal) => <tr key={deal.id} onClick={() => window.open(deal.url, "_blank", "noopener,noreferrer")}>
      <td><strong>{deal.name}</strong></td><td>{deal.stage}</td><td>{formatCurrency(deal.amount)}</td><td>{formatDate(deal.closeDate)}</td>{showRisk && <td><span className="risk-chip">{deal.riskReason}</span></td>}
    </tr>)}</tbody></table></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state"><strong>All clear</strong><span>{text}</span></div>;
}
