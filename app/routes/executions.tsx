import { Form, Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { Route } from "./+types/executions";
import { requireUser } from "../.server/auth";
import {
  listExecutionHistory,
  type ExecutionStatus,
} from "../.server/repository/executions";
import { t } from "~/i18n";
import { APP_NAME } from "~/const";

const statuses = new Set<ExecutionStatus>([
  "running",
  "succeeded",
  "failed",
  "skipped",
]);
const periods = new Set([1, 7, 30]);

export function meta() {
  return [{ title: t("pages.executions.documentTitle", { 0: APP_NAME }) }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const search = new URL(request.url).searchParams;
  const botId = search.get("bot") ?? "";
  const rawStatus = search.get("status") ?? "";
  const status = statuses.has(rawStatus as ExecutionStatus)
    ? (rawStatus as ExecutionStatus)
    : undefined;
  const requestedDays = Number(search.get("days") ?? 7);
  const days = periods.has(requestedDays) ? requestedDays : 7;
  const requestedPage = Number(search.get("page") ?? 1);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 10_000)
      : 1;
  const history = await listExecutionHistory(user, {
    botId: botId || undefined,
    status,
    days,
    page,
  });
  return { ...history, filters: { botId, status: status ?? "", days, page } };
}

export default function ExecutionsRoute({ loaderData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage?.startsWith("en") ? "en-US" : "ja-JP";
  const dateTime = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(value));
  const { filters } = loaderData;
  const pageUrl = (page: number) => {
    const search = new URLSearchParams();
    if (filters.botId) search.set("bot", filters.botId);
    if (filters.status) search.set("status", filters.status);
    search.set("days", String(filters.days));
    search.set("page", String(page));
    return `/executions?${search}`;
  };
  const statusLabel = (status: string) =>
    t(`pages.executions.status.${status}`);
  const sourceLabel = (source: string) =>
    t(`pages.executions.source.${source}`);
  const errorLabel = (code: string | null) =>
    code
      ? t(`pages.executions.error.${code}`, {
          defaultValue: t("pages.executions.error.unknown"),
        })
      : "—";

  return (
    <div className="execution-page">
      <header className="page-heading">
        <div>
          <h1>{t("pages.executions.title")}</h1>
          <p>{t("pages.executions.description")}</p>
        </div>
      </header>
      <section className="entity-panel">
        <Form method="get" className="execution-filters">
          <label>
            {t("pages.executions.bot")}
            <select
              name="bot"
              defaultValue={filters.botId}
              key={`bot-${filters.botId}`}
            >
              <option value="">{t("pages.executions.allBots")}</option>
              {loaderData.bots.map((bot) => (
                <option key={bot.id} value={bot.id}>
                  {bot.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("pages.executions.statusLabel")}
            <select
              name="status"
              defaultValue={filters.status}
              key={`status-${filters.status}`}
            >
              <option value="">{t("pages.executions.allStatuses")}</option>
              {Array.from(statuses).map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("pages.executions.period")}
            <select
              name="days"
              defaultValue={filters.days}
              key={`days-${filters.days}`}
            >
              {[1, 7, 30].map((days) => (
                <option key={days} value={days}>
                  {t("pages.executions.lastDays", { count: days })}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">{t("pages.executions.filter")}</button>
        </Form>
        <div className="execution-list">
          {loaderData.records.length ? (
            loaderData.records.map((record) => (
              <article className="execution-row" key={record.id}>
                <div className="execution-row-main">
                  <span
                    className={`execution-status ${record.stale ? "stale" : record.status}`}
                  >
                    {record.stale
                      ? t("pages.executions.status.stale")
                      : statusLabel(record.status)}
                  </span>
                  <strong>
                    {record.botName ?? t("pages.executions.deletedBot")}
                  </strong>
                  <span>{sourceLabel(record.source)}</span>
                  <time dateTime={record.startedAt}>
                    {dateTime(record.startedAt)}
                  </time>
                </div>
                {record.errorCode && (
                  <p className="execution-error">
                    {errorLabel(record.errorCode)}
                  </p>
                )}
                {record.stale && (
                  <p className="execution-stale-note">
                    {t("pages.executions.staleNote")}
                  </p>
                )}
                <details>
                  <summary>{t("pages.executions.details")}</summary>
                  <dl>
                    <div>
                      <dt>{t("pages.executions.executionId")}</dt>
                      <dd className="mono">{record.id}</dd>
                    </div>
                    <div>
                      <dt>{t("pages.executions.finishedAt")}</dt>
                      <dd>
                        {record.finishedAt ? dateTime(record.finishedAt) : "—"}
                      </dd>
                    </div>
                    {record.scheduleName && (
                      <div>
                        <dt>{t("pages.executions.schedule")}</dt>
                        <dd>{record.scheduleName}</dd>
                      </div>
                    )}
                    {record.threadId && (
                      <div>
                        <dt>{t("pages.executions.threadId")}</dt>
                        <dd className="mono">{record.threadId}</dd>
                      </div>
                    )}
                    <div>
                      <dt>{t("pages.executions.usageId")}</dt>
                      <dd>{record.usageId ?? "—"}</dd>
                    </div>
                  </dl>
                </details>
              </article>
            ))
          ) : (
            <p className="execution-empty">{t("pages.executions.empty")}</p>
          )}
        </div>
        <nav
          className="execution-pagination"
          aria-label={t("pages.executions.pagination")}
        >
          {filters.page > 1 && (
            <Link to={pageUrl(filters.page - 1)}>
              {t("pages.executions.previous")}
            </Link>
          )}
          <span>{t("pages.executions.page", { count: filters.page })}</span>
          {loaderData.hasNext && (
            <Link to={pageUrl(filters.page + 1)}>
              {t("pages.executions.next")}
            </Link>
          )}
        </nav>
      </section>
    </div>
  );
}
