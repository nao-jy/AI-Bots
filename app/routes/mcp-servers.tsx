import { isUuid } from "../.server/utils";
import { t } from "~/i18n";
import type { Route } from "./+types/mcp-servers";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  deleteMcpServer,
  listMcpServers,
  saveMcpServer,
  TRANSPORTS,
} from "../.server/repository/entities";
import { requireUser } from "../.server/auth";
import { APP_NAME } from "~/const";
import { entityListPage } from "../.server/repository/list-pages";
import { testMcpServer } from "~/.server/test";

function getPage(transport: Record<string, string>) {
  const page: Omit<EntityPageDefinition, "records"> = {
    title: t("pages.mcpServers.title"),
    description: t("pages.mcpServers.description"),
    icon: "mcp",
    tableFeatures: {
      subtitleKeys: ["description", "endpoint"],
      resourceGrants: true,
    },
    columns: [
      { key: "name", label: t("pages.mcpServers.nameLabel") },
      { key: "transport", label: t("pages.mcpServers.transportLabel") },
      { key: "endpoint", label: t("pages.mcpServers.endpointLabel") },
      { key: "status", label: t("pages.mcpServers.statusLabel") },
      { key: "updated", label: t("pages.mcpServers.updatedLabel") },
    ],
    fields: [
      {
        key: "name",
        label: t("pages.mcpServers.nameLabel"),
        placeholder: t("pages.mcpServers.namePlaceholder"),
      },
      {
        key: "transportId",
        label: t("pages.mcpServers.transportLabel"),
        type: "select",
        options: Object.entries(transport).map((v) => ({
          label: v[1],
          value: v[0],
        })),
      },
      {
        key: "endpoint",
        label: t("pages.mcpServers.endpointLabel"),
        wide: true,
        placeholder: t("pages.mcpServers.endpointPlaceholder"),
      },
      {
        key: "headers",
        label: t("pages.mcpServers.httpHeadersLabel"),
        type: "key-value",
        valueType: "string",
        wide: true,
      },
      {
        key: "context",
        label: t("pages.mcpServers.contextLabel"),
        type: "textarea",
        placeholder: '{"apiKey": "..."}',
        wide: true,
      },
    ],
  };
  return page;
}

export function meta() {
  return [{ title: t("pages.mcpServers.documentTitle", { 0: APP_NAME }) }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const pagination = await entityListPage(user, "mcp-servers", request);
  return {
    servers: await listMcpServers(user, pagination.ids),
    pagination,
    transport: TRANSPORTS,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = String(form.get("id") ?? "");
  if (intent === "test") return testMcpServer(user, form);
  if (intent === "delete")
    return isUuid(id) && (await deleteMcpServer(user, id))
      ? { ok: true }
      : { ok: false, error: t("pages.mcpServers.notFound") };
  if (intent === "create") return saveMcpServer(user, null, form);
  if (intent === "update")
    return isUuid(id)
      ? saveMcpServer(user, id, form)
      : { ok: false, error: t("pages.mcpServers.notFound") };
  return { ok: false, error: t("pages.mcpServers.unknownAction") };
}

export default function McpServers({ loaderData }: Route.ComponentProps) {
  const page = getPage(loaderData.transport);
  return (
    <EntityPageView
      page={{
        ...page,
        records: loaderData.servers.records,
        pagination: loaderData.pagination,
      }}
    />
  );
}
