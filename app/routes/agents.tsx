import { isUuid } from "../.server/utils";
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
  title: "pages.agents.title",
  description: "pages.agents.description",
  icon: "agents",
  columns: [
    { key: "name", label: "pages.agents.title" },
    { key: "model", label: "pages.agents.modelLabel" },
    { key: "mcpAuthentications", label: "pages.agents.mcpOauthAuthenticationLabel" },
    { key: "status", label: "pages.agents.usageLabel" },
  ],
  fields: [
    {
      key: "name",
      label: "pages.agents.nameLabel",
      placeholder: "pages.agents.namePlaceholder",
    },
    {
      key: "providerId",
      label: "pages.agents.providerLabel",
      type: "select",
      options: [],
      placeholder: "pages.agents.providerPlaceholder",
    },
    {
      key: "modelId",
      label: "pages.agents.modelIdLabel",
      placeholder: "pages.agents.modelIdPlaceholder",
    },
    {
      key: "options",
      label: "pages.agents.modelOptionsLabel",
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
  const id = String(form.get("id") ?? "");
  if (intent === "test") return testAgent(user, form);
  if (intent === "delete")
    return isUuid(id) && (await deleteAgent(user, id))
      ? { ok: true }
      : { ok: false, error: t("pages.agents.notFound") };
  if (intent === "create") return saveAgent(user, null, form);
  if (intent === "update")
    return isUuid(id)
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
