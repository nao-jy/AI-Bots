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

const page: Omit<EntityPageDefinition, "records"> = {
  title: t("pages.bots.title"),
  description:
    t("pages.bots.description"),
  icon: "bots",
  tableFeatures: {
    subtitleKeys: ["description"],
    publicIds: true,
    webhookDetails: true,
  },
  columns: [
    { key: "name", label: t("pages.bots.nameLabel") },
    { key: "agent", label: t("pages.bots.agentLabel") },
    { key: "adapters", label: t("pages.bots.adaptersLabel") },
    { key: "sandboxes", label: t("pages.bots.sandboxLabel") },
    { key: "toolsets", label: t("pages.bots.toolsetsLabel") },
    {
      key: "webhooks",
      label: t("pages.bots.webhookEndpointLabel"),
      presentation: "webhook-count",
    },
    { key: "status", label: t("pages.bots.statusLabel"), presentation: "status-toggle" },
    { key: "updated", label: t("pages.bots.updatedLabel") },
  ],
  fields: [
    { key: "name", label: t("pages.bots.nameLabel"), placeholder: t("pages.bots.namePlaceholder") },
    {
      key: "description",
      label: t("pages.bots.descriptionLabel"),
      type: "textarea",
      wide: true,
      placeholder: t("pages.bots.descriptionPlaceholder"),
    },
    {
      key: "instruction",
      label: t("pages.bots.instructionsLabel"),
      type: "textarea",
      wide: true,
      placeholder: t("pages.bots.instructionsPlaceholder"),
    },
    {
      key: "onFailedMessage",
      label: t("pages.bots.failureMessageLabel"),
      type: "textarea",
      wide: true,
      placeholder: t("pages.bots.failureMessagePlaceholder"),
    },
    {
      key: "lookbackMessages",
      label: t("pages.bots.historyMessageCountLabel"),
      type: "number",
      placeholder: t("pages.bots.zeroHistoryMessages"),
    },
    {
      key: "agentId",
      label: t("pages.bots.agentLabel"),
      type: "select",
      options: [],
      placeholder: t("pages.bots.noLimitOption"),
    },
    {
      key: "adapterIds",
      label: t("pages.bots.adaptersLabel"),
      type: "multiselect",
      options: [],
      placeholder: t("pages.bots.adaptersPlaceholder"),
    },
    {
      key: "sandboxId",
      label: t("pages.bots.sandboxLabel"),
      type: "select",
      options: [],
      placeholder: t("pages.bots.sandboxPlaceholder"),
    },
    {
      key: "toolSetContexts",
      label: t("pages.bots.toolsetContextLabel"),
      type: "toolset-contexts",
      wide: true,
    },
    {
      key: "mcpServerIds",
      label: t("pages.bots.mcpServersLabel"),
      type: "mcp-servers",
      options: [],
      placeholder: t("pages.bots.mcpServersPlaceholder"),
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
  return listBots(user, publicOrigin);
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "regenerate-public-ids") {
    const slot = String(form.get("slot") ?? "");
    if (slot !== "first" && slot !== "second")
      return { ok: false, error: t("pages.bots.publicIdRegenerationRequired") };
    return Number.isInteger(id) &&
      (await regenerateBotPublicIds(user, id, slot))
      ? { ok: true }
      : { ok: false, error: t("pages.bots.notFound") };
  }
  if (intent === "delete")
    return Number.isInteger(id) && (await deleteBot(user, id))
      ? { ok: true }
      : { ok: false, error: t("pages.bots.notFound") };
  if (intent === "toggle-status") {
    const enabled = String(form.get("enabled")) === "true";
    return Number.isInteger(id) && (await setBotEnabled(user, id, enabled))
      ? { ok: true }
      : { ok: false, error: t("pages.bots.notFound") };
  }
  if (intent === "create") return saveBot(user, null, form);
  if (intent === "update")
    return Number.isInteger(id)
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
