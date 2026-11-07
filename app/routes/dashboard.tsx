import { requireUser } from "../.server/auth";
import { db } from "../.server/repository/db";
import Dashboard from "../components/dashboard";
import { t } from "~/i18n";
import { APP_NAME } from "~/const";
import type { Route } from "./+types/dashboard";
import { filterResourcesByRole } from "../.server/authorization";
import { recentExecutionFailures } from "../.server/repository/executions";

const DAY_MS = 24 * 60 * 60 * 1_000;
const PERIOD_DAYS = 30;

export function meta() {
  return [
    { title: t("pages.dashboard.documentTitle", { 0: APP_NAME }) },
    {
      name: "description",
      content: t("pages.dashboard.description"),
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const now = new Date();
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const start = today - (PERIOD_DAYS - 1) * DAY_MS;
  const end = today + DAY_MS;
  const startIso = new Date(start).toISOString();
  const endIso = new Date(end).toISOString();
  const [botRows, agentRows] = await Promise.all([
    db.orm.aibot.ChatBot.where({ organizationId: user.organizationId }).all(),
    db.orm.aibot.AgentDefinition.where({ organizationId: user.organizationId })
      .include("provider")
      .all(),
  ]);
  const [bots, agents] = await Promise.all([
    filterResourcesByRole(user, botRows),
    filterResourcesByRole(user, agentRows),
  ]);
  const failuresPromise = recentExecutionFailures(user, bots);

  const botNames = new Map(bots.map((bot) => [bot.id, bot.name]));
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));
  const agentProviderNames = new Map(
    agents.map((agent) => [agent.id, agent.provider.name]),
  );
  const botIds = [...botNames.keys()];
  const agentIds = [...agentNames.keys()];
  const usage =
    botIds.length && agentIds.length
      ? await db.orm.aibot.AgentUsage.where({
          organizationId: user.organizationId,
        })
          .where((row) => row.createdAt.gte(startIso))
          .where((row) => row.createdAt.lt(endIso))
          .where((row) => row.chatbotId.in(botIds))
          .where((row) => row.agentId.in(agentIds))
          .select(
            "id",
            "createdAt",
            "inputTokens",
            "outputTokens",
            "platform",
            "chatbotId",
            "agentId",
          )
          .all()
      : [];

  const days = Array.from({ length: PERIOD_DAYS }, (_, index) => {
    const date = new Date(start + index * DAY_MS);
    return {
      date: date.toISOString().slice(0, 10),
      input: 0,
      output: 0,
      calls: 0,
    };
  });
  const dayMap = new Map(days.map((day) => [day.date, day]));
  const byAgent = new Map<
    string,
    { name: string; provider: string; tokens: number; calls: number }
  >();
  const byPlatform = new Map<string, { tokens: number; calls: number }>();

  for (const row of usage) {
    const bucket = dayMap.get(
      new Date(row.createdAt).toISOString().slice(0, 10),
    );
    if (!bucket) continue;
    bucket.input += row.inputTokens;
    bucket.output += row.outputTokens;
    bucket.calls += 1;
    if (row.agentId !== null) {
      const current = byAgent.get(row.agentId) ?? {
        name: agentNames.get(row.agentId) ?? "",
        provider: agentProviderNames.get(row.agentId) ?? "",
        tokens: 0,
        calls: 0,
      };
      current.tokens += row.inputTokens + row.outputTokens;
      current.calls += 1;
      byAgent.set(row.agentId, current);
    }
    const platform = byPlatform.get(row.platform) ?? { tokens: 0, calls: 0 };
    platform.tokens += row.inputTokens + row.outputTokens;
    platform.calls += 1;
    byPlatform.set(row.platform, platform);
  }

  return {
    failures: await failuresPromise,
    period: { start: startIso, end: new Date(end - 1).toISOString() },
    totals: {
      inputTokens: usage.reduce((sum, row) => sum + row.inputTokens, 0),
      outputTokens: usage.reduce((sum, row) => sum + row.outputTokens, 0),
      calls: usage.length,
      bots: bots.length,
      agents: agents.length,
    },
    days,
    agents: [...byAgent.entries()]
      .map(([id, item]) => ({ id, ...item }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 6),
    platforms: [...byPlatform.entries()]
      .map(([name, item]) => ({ name, ...item }))
      .sort((a, b) => b.tokens - a.tokens),
    recent: usage
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 6)
      .map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        tokens: row.inputTokens + row.outputTokens,
        platform: row.platform,
        name:
          row.chatbotId !== null
            ? (botNames.get(row.chatbotId) ?? "")
            : row.agentId !== null
              ? (agentNames.get(row.agentId) ?? "")
              : "",
      })),
  };
}

export default function DashboardRoute({ loaderData }: Route.ComponentProps) {
  if (!loaderData) {
    throw new Error("Dashboard route rendered without loader data.");
  }
  return <Dashboard loaderData={loaderData} />;
}
