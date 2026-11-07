import { isUuid } from "../.server/utils";
import { t } from "~/i18n";
import type { Route } from "./+types/bots";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  deleteBot,
  listBots,
  regenerateBotPublicIds,
  saveBot,
  setBotEnabled,
} from "../.server/repository/entities";
import { requireUser } from "../.server/auth";
import { APP_NAME } from "~/const";
import { entityListPage } from "../.server/repository/list-pages";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "pages.bots.title",
  description: "pages.bots.description",
  icon: "bots",
  tableFeatures: {
    subtitleKeys: ["description"],
    publicIds: true,
    webhookDetails: true,
    resourceGrants: true,
  },
  columns: [
    { key: "name", label: "pages.bots.nameLabel" },
    { key: "agent", label: "pages.bots.agentLabel" },
    { key: "adapters", label: "pages.bots.adaptersLabel" },
    { key: "sandboxes", label: "pages.bots.sandboxLabel" },
    { key: "toolsets", label: "pages.bots.toolsetsLabel" },
    {
      key: "webhooks",
      label: "pages.bots.webhookEndpointLabel",
      presentation: "webhook-count",
    },
    {
      key: "status",
      label: "pages.bots.statusLabel",
      presentation: "status-toggle",
    },
    { key: "updated", label: "pages.bots.updatedLabel" },
  ],
  fields: [
    {
      key: "name",
      label: "pages.bots.nameLabel",
      placeholder: "pages.bots.namePlaceholder",
    },
    {
      key: "description",
      label: "pages.bots.descriptionLabel",
      type: "textarea",
      wide: true,
      placeholder: "pages.bots.descriptionPlaceholder",
    },
    {
      key: "instruction",
      label: "pages.bots.instructionsLabel",
      type: "textarea",
      wide: true,
      placeholder: "pages.bots.instructionsPlaceholder",
    },
    {
      key: "onFailedMessage",
      label: "pages.bots.failureMessageLabel",
      type: "textarea",
      wide: true,
      placeholder: "pages.bots.failureMessagePlaceholder",
    },
    {
      key: "lookbackMessages",
      label: "pages.bots.historyMessageCountLabel",
      type: "number",
      placeholder: "pages.bots.zeroHistoryMessages",
    },
    {
      key: "memoryConfig",
      label: "pages.bots.memoryConfigLabel",
      type: "select",
      defaultValue: "nouse",
      required: true,
      options: [
        { value: "nouse", label: "pages.bots.memoryConfigNouseOption" },
        { value: "thread", label: "pages.bots.memoryConfigThreadOption" },
        { value: "bot", label: "pages.bots.memoryConfigBotOption" },
      ],
    },
    {
      key: "agentId",
      label: "pages.bots.agentLabel",
      type: "select",
      options: [],
      placeholder: "pages.bots.noLimitOption",
    },
    {
      key: "adapterIds",
      label: "pages.bots.adaptersLabel",
      type: "multiselect",
      options: [],
      placeholder: "pages.bots.adaptersPlaceholder",
    },
    {
      key: "sandboxId",
      label: "pages.bots.sandboxLabel",
      type: "select",
      options: [],
      placeholder: "pages.bots.sandboxPlaceholder",
    },
    {
      key: "toolSetContexts",
      label: "pages.bots.toolsetContextLabel",
      type: "toolset-contexts",
      wide: true,
    },
    {
      key: "mcpServerIds",
      label: "pages.bots.mcpServersLabel",
      type: "mcp-servers",
      options: [],
      placeholder: "pages.bots.mcpServersPlaceholder",
      wide: true,
    },
  ],
};

export function meta() {
  return [{ title: t("pages.bots.documentTitle", { 0: APP_NAME }) }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const publicOrigin = new URL(process.env["PUBLIC_APP_URL"] || request.url)
    .origin;
  const pagination = await entityListPage(user, "bots", request);
  return { ...(await listBots(user, publicOrigin, pagination.ids)), pagination };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = String(form.get("id") ?? "");
  if (intent === "regenerate-public-ids") {
    const slot = String(form.get("slot") ?? "");
    if (slot !== "first" && slot !== "second")
      return { ok: false, error: t("pages.bots.publicIdRegenerationRequired") };
    return isUuid(id) && (await regenerateBotPublicIds(user, id, slot))
      ? { ok: true }
      : { ok: false, error: t("pages.bots.notFound") };
  }
  if (intent === "delete")
    return isUuid(id) && (await deleteBot(user, id))
      ? { ok: true }
      : { ok: false, error: t("pages.bots.notFound") };
  if (intent === "toggle-status") {
    const enabled = String(form.get("enabled")) === "true";
    return isUuid(id) && (await setBotEnabled(user, id, enabled))
      ? { ok: true }
      : { ok: false, error: t("pages.bots.notFound") };
  }
  if (intent === "create") return saveBot(user, null, form);
  if (intent === "update")
    return isUuid(id)
      ? saveBot(user, id, form)
      : { ok: false, error: t("pages.bots.notFound") };
  return { ok: false, error: t("pages.bots.unknownAction") };
}

export default function Bots({ loaderData }: Route.ComponentProps) {
  return (
    <EntityPageView
      page={{
        ...page,
        records: loaderData.records,
        pagination: loaderData.pagination,
        toolSetSchemas: loaderData.toolSetSchemas,
        mcpAuthenticationOptions: loaderData.mcpAuthenticationOptions,
        fields: page.fields.map((field) => ({
          ...field,
          options:
            field.key === "agentId"
              ? loaderData.agentOptions
              : field.key === "adapterIds"
                ? loaderData.adapterOptions
                : field.key === "sandboxId"
                  ? loaderData.sandboxOptions
                  : field.key === "mcpServerIds"
                    ? loaderData.mcpServerOptions
                    : field.options,
        })),
      }}
    />
  );
}
