import { sql } from "kysely";
import type { AuthUser } from "../auth";
import { getReadableResourceIds } from "../authorization";
import { kysely } from "./kysely";
import { ENTITY_PAGE_SIZE } from "../../const";

export type EntityListKind =
  | "bots"
  | "adapters"
  | "providers"
  | "agents"
  | "rate-limits"
  | "sandboxes"
  | "schedules"
  | "mcp-servers"
  | "oauth-clients"
  | "oauth-authentications"
  | "users"
  | "groups";

export function entityListParams(request: Request) {
  const search = new URL(request.url).searchParams;
  const query = (search.get("q") ?? "").trim().slice(0, 100);
  const requestedPage = Number(search.get("page") ?? 1);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 10_000)
      : 1;
  return { query, page };
}

const PAGE_TABLES: Record<Exclude<EntityListKind, "users" | "groups">, string> = {
  bots: "ChatBot",
  adapters: "ChatAdapter",
  providers: "Provider",
  agents: "AgentDefinition",
  "rate-limits": "RateLimit",
  sandboxes: "Sandbox",
  schedules: "ChatBotSchedule",
  "mcp-servers": "McpServer",
  "oauth-clients": "OAuthClient",
  "oauth-authentications": "OAuthAuthentication",
};

const ordering = (kind: EntityListKind) => {
  if (kind === "groups") return '"name" ASC, "id" ASC';
  if (kind === "users") return '"createdAt" ASC, "id" ASC';
  if (kind === "schedules") return '"createdAt" DESC, "id" DESC';
  return '"updatedAt" DESC, "id" DESC';
};

export async function entityListPage(
  user: AuthUser,
  kind: EntityListKind,
  request: Request,
) {
  const { query, page } = entityListParams(request);
  if ((kind === "users" || kind === "groups") && !user.isAdmin)
    throw new Response("Forbidden", { status: 403 });
  const readableIds =
    kind === "users" || kind === "groups"
      ? null
      : await getReadableResourceIds(user);
  const empty = { ids: [] as string[], query, page, hasNext: false };
  if (readableIds?.length === 0) return empty;
  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  const offset = (page - 1) * ENTITY_PAGE_SIZE;
  const table = kind === "users" || kind === "groups" ? kind : PAGE_TABLES[kind];
  const orderingSql = sql.raw(ordering(kind));
  const rows =
    kind === "users"
      ? await sql<{ id: string }>`
          SELECT "id" FROM aibot."User"
          WHERE "organizationId" = ${user.organizationId}
            AND ("name" ILIKE ${pattern} OR "email" ILIKE ${pattern})
          ORDER BY ${orderingSql}
          LIMIT ${ENTITY_PAGE_SIZE + 1} OFFSET ${offset}
        `.execute(kysely)
      : await sql<{ id: string }>`
          SELECT "id" FROM aibot.${sql.raw(`"${table}"`)}
          WHERE "organizationId" = ${user.organizationId}
            AND "name" ILIKE ${pattern}
            AND (${readableIds}::text[] IS NULL OR "id" = ANY(${readableIds}::text[]))
          ORDER BY ${orderingSql}
          LIMIT ${ENTITY_PAGE_SIZE + 1} OFFSET ${offset}
        `.execute(kysely);
  return {
    ids: rows.rows.slice(0, ENTITY_PAGE_SIZE).map((row) => row.id),
    query,
    page,
    hasNext: rows.rows.length > ENTITY_PAGE_SIZE,
  };
}
