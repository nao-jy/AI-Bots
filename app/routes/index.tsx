import { requireUser } from "../.server/auth";
import { db } from "../.server/repository/db";
import Dashboard from "../components/dashboard";
import type { Route } from "./+types/index";
import { filterResourcesByRole } from "../.server/authorization";

const DAY_MS = 24 * 60 * 60 * 1_000;
const PERIOD_DAYS = 30;

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const [botRows, agentRows, usageRows] = await Promise.all([
    db.orm.aibot.ChatBot.where({ organizationId: user.organizationId }).all(),
    db.orm.aibot.AgentDefinition.where({ organizationId: user.organizationId }).include("provider").all(),
    db.orm.aibot.AgentUsage.all(),
  ]);
  const [bots, agents] = await Promise.all([
    filterResourcesByRole(user, botRows),
    filterResourcesByRole(user, agentRows),
  ]);

  const botNames = new Map(bots.map((bot) => [bot.id, bot.name]));
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));
  const agentProviderNames = new Map(agents.map((agent) => [agent.id, agent.provider.name]));
  const botIds = new Set(botNames.keys());
  const agentIds = new Set(agentNames.keys());
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = today - (PERIOD_DAYS - 1) * DAY_MS;
  const usage = usageRows
    .filter((row) => (row.chatbotId !== null && botIds.has(row.chatbotId)) || (row.agentId !== null && agentIds.has(row.agentId)))
    .filter((row) => new Date(row.createdAt).getTime() >= start && new Date(row.createdAt).getTime() < today + DAY_MS)
    .map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      platform: row.platform,
      chatbotId: row.chatbotId,
      agentId: row.agentId,
    }));

  const days = Array.from({ length: PERIOD_DAYS }, (_, index) => {
    const date = new Date(start + index * DAY_MS);
    return { date: date.toISOString().slice(0, 10), input: 0, output: 0, calls: 0 };
  });
  const dayMap = new Map(days.map((day) => [day.date, day]));
  const byAgent = new Map<string, { name: string; provider: string; tokens: number; calls: number }>();
  const byPlatform = new Map<string, { tokens: number; calls: number }>();

  for (const row of usage) {
    const bucket = dayMap.get(new Date(row.createdAt).toISOString().slice(0, 10));
    if (!bucket) continue;
    bucket.input += row.inputTokens;
    bucket.output += row.outputTokens;
    bucket.calls += 1;
    if (row.agentId !== null && agentIds.has(row.agentId)) {
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
    period: { start: new Date(start).toISOString(), end: new Date(today + DAY_MS - 1).toISOString() },
    totals: {
      inputTokens: usage.reduce((sum, row) => sum + row.inputTokens, 0),
      outputTokens: usage.reduce((sum, row) => sum + row.outputTokens, 0),
      calls: usage.length,
      bots: bots.length,
      agents: agents.length,
    },
    days,
    agents: [...byAgent.entries()].map(([id, item]) => ({ id, ...item })).sort((a, b) => b.tokens - a.tokens).slice(0, 6),
    platforms: [...byPlatform.entries()].map(([name, item]) => ({ name, ...item })).sort((a, b) => b.tokens - a.tokens),
    recent: usage.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6).map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      tokens: row.inputTokens + row.outputTokens,
      platform: row.platform,
      name: row.chatbotId !== null ? botNames.get(row.chatbotId) ?? "" : row.agentId !== null ? agentNames.get(row.agentId) ?? "" : "",
    })),
  };
}

export default function DashboardRoute({ loaderData }: Route.ComponentProps) {
  if (!loaderData) {
    throw new Error("Dashboard route rendered without loader data.");
  }
  return <Dashboard loaderData={loaderData} />;
}
