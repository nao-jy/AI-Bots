import { or } from "@prisma/orm-postgres/orm-client";
import type { AuthUser } from "../auth";
import { getReadableResourceIds } from "../authorization";
import { db } from "./db";
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
  const finish = (rows: Array<{ id: string }>) => ({
    ids: rows.slice(0, ENTITY_PAGE_SIZE).map((row) => row.id),
    query,
    page,
    hasNext: rows.length > ENTITY_PAGE_SIZE,
  });

  switch (kind) {
    case "bots":
      return finish(
        await db.orm.aibot.ChatBot.where({
          organizationId: user.organizationId,
        })
          .where((row) => row.name.ilike(pattern))
          .where((row) =>
            readableIds === null ? row.id.isNotNull() : row.id.in(readableIds),
          )
          .select("id")
          .orderBy([(row) => row.updatedAt.desc(), (row) => row.id.desc()])
          .limit(ENTITY_PAGE_SIZE + 1)
          .offset(offset)
          .all(),
      );
    case "adapters":
      return finish(
        await db.orm.aibot.ChatAdapter.where({
          organizationId: user.organizationId,
        })
          .where((row) => row.name.ilike(pattern))
          .where((row) =>
            readableIds === null ? row.id.isNotNull() : row.id.in(readableIds),
          )
          .select("id")
          .orderBy([(row) => row.updatedAt.desc(), (row) => row.id.desc()])
          .limit(ENTITY_PAGE_SIZE + 1)
          .offset(offset)
          .all(),
      );
    case "providers":
      return finish(
        await db.orm.aibot.Provider.where({
          organizationId: user.organizationId,
        })
          .where((row) => row.name.ilike(pattern))
          .where((row) =>
            readableIds === null ? row.id.isNotNull() : row.id.in(readableIds),
          )
          .select("id")
          .orderBy([(row) => row.updatedAt.desc(), (row) => row.id.desc()])
          .limit(ENTITY_PAGE_SIZE + 1)
          .offset(offset)
          .all(),
      );
    case "agents":
      return finish(
        await db.orm.aibot.AgentDefinition.where({
          organizationId: user.organizationId,
        })
          .where((row) => row.name.ilike(pattern))
          .where((row) =>
            readableIds === null ? row.id.isNotNull() : row.id.in(readableIds),
          )
          .select("id")
          .orderBy([(row) => row.updatedAt.desc(), (row) => row.id.desc()])
          .limit(ENTITY_PAGE_SIZE + 1)
          .offset(offset)
          .all(),
      );
    case "rate-limits":
      return finish(
        await db.orm.aibot.RateLimit.where({
          organizationId: user.organizationId,
        })
          .where((row) => row.name.ilike(pattern))
          .where((row) =>
            readableIds === null ? row.id.isNotNull() : row.id.in(readableIds),
          )
          .select("id")
          .orderBy([(row) => row.updatedAt.desc(), (row) => row.id.desc()])
          .limit(ENTITY_PAGE_SIZE + 1)
          .offset(offset)
          .all(),
      );
    case "sandboxes":
      return finish(
        await db.orm.aibot.Sandbox.where({
          organizationId: user.organizationId,
        })
          .where((row) => row.name.ilike(pattern))
          .where((row) =>
            readableIds === null ? row.id.isNotNull() : row.id.in(readableIds),
          )
          .select("id")
          .orderBy([(row) => row.updatedAt.desc(), (row) => row.id.desc()])
          .limit(ENTITY_PAGE_SIZE + 1)
          .offset(offset)
          .all(),
      );
    case "schedules":
      return finish(
        await db.orm.aibot.ChatBotSchedule.where({
          organizationId: user.organizationId,
        })
          .where((row) => row.name.ilike(pattern))
          .where((row) =>
            readableIds === null ? row.id.isNotNull() : row.id.in(readableIds),
          )
          .select("id")
          .orderBy([(row) => row.createdAt.desc(), (row) => row.id.desc()])
          .limit(ENTITY_PAGE_SIZE + 1)
          .offset(offset)
          .all(),
      );
    case "mcp-servers":
      return finish(
        await db.orm.aibot.McpServer.where({
          organizationId: user.organizationId,
        })
          .where((row) => row.name.ilike(pattern))
          .where((row) =>
            readableIds === null ? row.id.isNotNull() : row.id.in(readableIds),
          )
          .select("id")
          .orderBy([(row) => row.updatedAt.desc(), (row) => row.id.desc()])
          .limit(ENTITY_PAGE_SIZE + 1)
          .offset(offset)
          .all(),
      );
    case "oauth-clients":
      return finish(
        await db.orm.aibot.OAuthClient.where({
          organizationId: user.organizationId,
        })
          .where((row) => row.name.ilike(pattern))
          .where((row) =>
            readableIds === null ? row.id.isNotNull() : row.id.in(readableIds),
          )
          .select("id")
          .orderBy([(row) => row.updatedAt.desc(), (row) => row.id.desc()])
          .limit(ENTITY_PAGE_SIZE + 1)
          .offset(offset)
          .all(),
      );
    case "oauth-authentications":
      return finish(
        await db.orm.aibot.OAuthAuthentication.where({
          organizationId: user.organizationId,
        })
          .where((row) => row.name.ilike(pattern))
          .where((row) =>
            readableIds === null ? row.id.isNotNull() : row.id.in(readableIds),
          )
          .select("id")
          .orderBy([(row) => row.updatedAt.desc(), (row) => row.id.desc()])
          .limit(ENTITY_PAGE_SIZE + 1)
          .offset(offset)
          .all(),
      );
    case "users":
      return finish(
        await db.orm.aibot.User.where({ organizationId: user.organizationId })
          .where((row) => or(row.name.ilike(pattern), row.email.ilike(pattern)))
          .select("id")
          .orderBy([(row) => row.createdAt.asc(), (row) => row.id.asc()])
          .limit(ENTITY_PAGE_SIZE + 1)
          .offset(offset)
          .all(),
      );
    case "groups":
      return finish(
        await db.orm.aibot.Group.where({ organizationId: user.organizationId })
          .where((row) => row.name.ilike(pattern))
          .select("id")
          .orderBy([(row) => row.name.asc(), (row) => row.id.asc()])
          .limit(ENTITY_PAGE_SIZE + 1)
          .offset(offset)
          .all(),
      );
  }
}
