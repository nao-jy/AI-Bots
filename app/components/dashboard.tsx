import { useMemo } from "react";
import { ArrowUpRightIcon, ArrowsLeftRightIcon, ChatCircleDotsIcon, CpuIcon, RobotIcon } from "@phosphor-icons/react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Route } from "../routes/+types/index";

export default function Dashboard({
  loaderData,
}: {
  loaderData: Route.ComponentProps["loaderData"];
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage?.startsWith("en") ? "en-US" : "ja-JP";
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const totalTokens = loaderData.totals.inputTokens + loaderData.totals.outputTokens;
  const maxAgent = Math.max(1, ...loaderData.agents.map((agent) => agent.tokens));
  const maxPlatform = Math.max(1, ...loaderData.platforms.map((platform) => platform.tokens));
  const dateLabel = (value: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, options).format(new Date(value));

  return (
    <div className="dashboard-page">
      <header className="dashboard-heading">
        <div>
          <div className="dashboard-eyebrow">{t("pages.dashboard.eyebrow")}</div>
          <h1>{t("pages.dashboard.title")}</h1>
          <p>{t("pages.dashboard.description")}</p>
        </div>
        <div className="dashboard-period"><span className="period-pulse" />{t("pages.dashboard.last30Days")}</div>
      </header>

      <section className="dashboard-stats" aria-label={t("pages.dashboard.summary")}>
        <article className="dashboard-stat dashboard-stat-featured">
          <div className="stat-top"><span>{t("pages.dashboard.totalTokens")}</span><span className="stat-icon"><ArrowsLeftRightIcon size={17} /></span></div>
          <strong>{nf.format(totalTokens)}</strong>
          <div className="stat-caption"><span className="stat-dot input-dot" />{t("pages.dashboard.input")}: {nf.format(loaderData.totals.inputTokens)} <span className="stat-caption-separator">·</span> <span className="stat-dot output-dot" />{t("pages.dashboard.output")}: {nf.format(loaderData.totals.outputTokens)}</div>
        </article>
        <article className="dashboard-stat">
          <div className="stat-top"><span>{t("pages.dashboard.requests")}</span><span className="stat-icon stat-icon-blue"><ChatCircleDotsIcon size={17} /></span></div>
          <strong>{nf.format(loaderData.totals.calls)}</strong>
          <div className="stat-caption">{t("pages.dashboard.recordedRequests")}</div>
        </article>
        <article className="dashboard-stat">
          <div className="stat-top"><span>{t("pages.dashboard.activeBots")}</span><span className="stat-icon stat-icon-green"><RobotIcon size={17} /></span></div>
          <strong>{nf.format(loaderData.totals.bots)}</strong>
          <div className="stat-caption">{t("pages.dashboard.configuredBots")}</div>
        </article>
        <article className="dashboard-stat">
          <div className="stat-top"><span>{t("pages.dashboard.activeAgents")}</span><span className="stat-icon stat-icon-orange"><CpuIcon size={17} /></span></div>
          <strong>{nf.format(loaderData.totals.agents)}</strong>
          <div className="stat-caption">{t("pages.dashboard.configuredAgents")}</div>
        </article>
      </section>

      <section className="dashboard-panel trend-panel">
        <div className="dashboard-panel-heading">
          <div><h2>{t("pages.dashboard.usageTrend")}</h2><p>{t("pages.dashboard.usageTrendDescription")}</p></div>
          <div className="chart-legend"><span><i className="input-dot" />{t("pages.dashboard.input")}</span><span><i className="output-dot" />{t("pages.dashboard.output")}</span></div>
        </div>
        <div className="usage-chart" role="img" aria-label={t("pages.dashboard.usageTrend")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={loaderData.days} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke="#eeedf2" strokeDasharray="3 4" />
              <XAxis dataKey="date" tickFormatter={(value: string) => dateLabel(value, { month: "numeric", day: "numeric" })} interval={4} tickLine={false} axisLine={false} tick={{ fill: "#a8a6b0", fontSize: 9 }} minTickGap={20} />
              <YAxis tickFormatter={(value: number) => nf.format(value)} tickLine={false} axisLine={false} tick={{ fill: "#a8a6b0", fontSize: 9 }} width={42} />
              <Tooltip
                labelFormatter={(value) => dateLabel(String(value), { year: "numeric", month: "short", day: "numeric" })}
                formatter={(value, name) => [`${nf.format(Number(value))} ${t("pages.dashboard.tokens")}`, name === "input" ? t("pages.dashboard.input") : t("pages.dashboard.output")]}
                cursor={{ fill: "#f8f7fb" }}
                contentStyle={{ border: "1px solid #eeedf2", borderRadius: 8, boxShadow: "0 8px 24px #24233112", fontSize: 11 }}
              />
              <Bar dataKey="input" name="input" stackId="usage" fill="#8970dc" radius={[0, 0, 3, 3]} />
              <Bar dataKey="output" name="output" stackId="usage" fill="#c0b1f3" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="dashboard-lower-grid">
        <section className="dashboard-panel breakdown-panel">
          <div className="dashboard-panel-heading"><div><h2>{t("pages.dashboard.usageByAgent")}</h2><p>{t("pages.dashboard.topAgents")}</p></div><Link className="dashboard-link" to="/agents">{t("pages.dashboard.viewAll")}<ArrowUpRightIcon size={14} /></Link></div>
          {loaderData.agents.length ? <div className="breakdown-list">{loaderData.agents.map((agent, index) => <div className="breakdown-row" key={agent.id}>
            <span className={`breakdown-rank rank-${index + 1}`}>{String(index + 1).padStart(2, "0")}</span>
            <div className="breakdown-main"><div className="breakdown-label"><strong>{agent.name}</strong><span>{agent.provider}</span></div><div className="breakdown-track"><i style={{ width: `${agent.tokens / maxAgent * 100}%` }} /></div></div>
            <div className="breakdown-value"><strong>{nf.format(agent.tokens)}</strong><span>{t("pages.dashboard.tokens")}</span></div>
          </div>)}</div> : <div className="dashboard-empty">{t("pages.dashboard.noUsage")}</div>}
        </section>

        <section className="dashboard-panel platform-panel">
          <div className="dashboard-panel-heading"><div><h2>{t("pages.dashboard.byPlatform")}</h2><p>{t("pages.dashboard.platformDescription")}</p></div></div>
          {loaderData.platforms.length ? <div className="platform-list">{loaderData.platforms.slice(0, 5).map((platform, index) => <div className="platform-row" key={platform.name}>
            <span className={`platform-mark platform-mark-${index % 5}`}>{platform.name.slice(0, 1).toUpperCase()}</span><span className="platform-name">{platform.name}</span><div className="platform-count"><strong>{nf.format(platform.calls)}</strong><span>{t("pages.dashboard.requestsShort")}</span></div><i className="platform-meter"><b style={{ width: `${platform.tokens / maxPlatform * 100}%` }} /></i>
          </div>)}</div> : <div className="dashboard-empty">{t("pages.dashboard.noUsage")}</div>}
        </section>
      </div>

      <section className="dashboard-panel recent-panel">
        <div className="dashboard-panel-heading"><div><h2>{t("pages.dashboard.recentActivity")}</h2><p>{t("pages.dashboard.recentDescription")}</p></div></div>
        {loaderData.recent.length ? <div className="recent-list">{loaderData.recent.map((row) => <div className="recent-row" key={row.id}>
          <span className="recent-mark"><ChatCircleDotsIcon size={17} /></span><div className="recent-details"><strong>{row.name || t("pages.dashboard.unknownAgent")}</strong><span>{row.platform}</span></div><div className="recent-tokens"><strong>{nf.format(row.tokens)}</strong><span>{t("pages.dashboard.tokens")}</span></div><time>{dateLabel(row.createdAt, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
        </div>)}</div> : <div className="dashboard-empty">{t("pages.dashboard.noUsage")}</div>}
      </section>
      <footer className="dashboard-footnote">{t("pages.dashboard.periodNote", { start: dateLabel(loaderData.period.start, { year: "numeric", month: "short", day: "numeric" }), end: dateLabel(loaderData.period.end, { year: "numeric", month: "short", day: "numeric" }) })}</footer>
    </div>
  );
}

