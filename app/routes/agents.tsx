import { t } from "~/i18n";
import type { Route } from "./+types/agents";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  deleteAgent,
  listAgents,
  saveAgent,
} from "../.server/repository/entities";
import { requireUser } from "../.server/auth";
import { APP_NAME } from "~/const";
import { testAgent } from "~/.server/test";

const page: Omit<EntityPageDefinition, "records"> = {
  title: t("pages.agents.title"),
  description: t("pages.agents.description"),
  icon: "agents",
  columns: [
    { key: "name", label: t("pages.agents.title") },
    { key: "model", label: t("pages.agents.modelLabel") },
    { key: "mcpAuthentications", label: t("pages.agents.mcpOauthAuthenticationLabel") },
    { key: "status", label: t("pages.agents.usageLabel") },
  ],
  fields: [
    {
      key: "name",
      label: t("pages.agents.nameLabel"),
      placeholder: t("pages.agents.namePlaceholder"),
    },
    {
      key: "providerId",
      label: t("pages.agents.providerLabel"),
      type: "select",
      options: [],
      placeholder: t("pages.agents.providerPlaceholder"),
    },
    {
      key: "modelId",
      label: t("pages.agents.modelIdLabel"),
      placeholder: t("pages.agents.modelIdPlaceholder"),
    },
    {
      key: "options",
      label: t("pages.agents.modelOptionsLabel"),
      type: "key-value",
      valueType: "json-scalar",
      wide: true,
    },
  ],
};

export function meta() {
  return [{ title: t("pages.agents.documentTitle", { 0: APP_NAME }) }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return listAgents(user);
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "test") return testAgent(user, form);
  if (intent === "delete")
    return Number.isInteger(id) && (await deleteAgent(user, id))
      ? { ok: true }
      : { ok: false, error: t("pages.agents.notFound") };
  if (intent === "create") return saveAgent(user, null, form);
  if (intent === "update")
    return Number.isInteger(id)
      ? saveAgent(user, id, form)
      : { ok: false, error: t("pages.agents.notFound") };
  return { ok: false, error: t("pages.agents.unknownAction") };
}

export default function Agents({ loaderData }: Route.ComponentProps) {
  return (
    <EntityPageView
      page={{
        ...page,
        records: loaderData.records,
        fields: page.fields.map((field) => ({
          ...field,
          options:
            field.key === "providerId"
              ? loaderData.providerOptions
              : field.options,
        })),
      }}
    />
  );
}
