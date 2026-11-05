import { t } from "~/i18n";
import type { Route } from "./+types/adapters";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  deleteAdapter,
  listAdapters,
  regenerateAdapterPublicIds,
  saveAdapter,
} from "../.server/repository/entities";
import { requireUser } from "../.server/auth";
import { APP_NAME } from "~/const";
import { testAdapter } from "~/.server/test";
import { listAdapterNames } from "~/.server/features/chat-adapter";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "pages.adapters.title",
  description: "pages.adapters.description",
  icon: "adapters",
  tableFeatures: { publicIds: true },
  columns: [
    { key: "name", label: "pages.adapters.connectionNameLabel" },
    { key: "platform", label: "pages.adapters.platformLabel" },
    { key: "authentication", label: "pages.adapters.oauthAuthenticationLabel" },
    { key: "configured", label: "pages.adapters.environmentVariablesLabel" },
    { key: "updated", label: "pages.adapters.updatedLabel" },
  ],
  fields: [
    { key: "name", label: "pages.adapters.connectionNameLabel", placeholder: "pages.adapters.connectionNamePlaceholder" },
    {
      key: "platformId",
      label: "pages.adapters.platformLabel",
      type: "select",
      options: [],
    },
    {
      key: "config",
      label: "pages.adapters.configLabel",
      type: "key-value",
      valueType: "string",
      wide: true,
      help: {
        text: "pages.adapters.configHelp",
        linkText: "pages.adapters.documentationLink",
        href: "https://chat-sdk.dev/adapters",
      },
    },
    {
      key: "authId",
      label: "pages.adapters.oauthCredentialsLabel",
      type: "select",
      options: [],
      placeholder: "pages.adapters.noOauthOption",
    },
  ],
};

export function meta() {
  return [{ title: t("pages.adapters.documentTitle", { 0: APP_NAME }) }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const [adapters, adapterNames] = await Promise.all([
    listAdapters(user),
    Promise.resolve(listAdapterNames()),
  ]);
  return {
    ...adapters,
    adapterOptions: adapterNames.map(({ id, displayName }) => ({
      value: id,
      label: displayName,
    })),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "regenerate-public-ids") {
    const slot = String(form.get("slot") ?? "");
    if (slot !== "first" && slot !== "second")
      return { ok: false, error: t("pages.adapters.publicIdRegenerationRequired") };
    return Number.isInteger(id) &&
      (await regenerateAdapterPublicIds(user, id, slot))
      ? { ok: true }
      : { ok: false, error: t("pages.adapters.notFound") };
  }
  if (intent === "test") return testAdapter(user, form);
  if (intent === "delete")
    return Number.isInteger(id) && (await deleteAdapter(user, id))
      ? { ok: true }
      : { ok: false, error: t("pages.adapters.notFound") };
  if (intent === "create") return saveAdapter(user, null, form);
  if (intent === "update")
    return Number.isInteger(id)
      ? saveAdapter(user, id, form)
      : { ok: false, error: t("pages.adapters.notFound") };
  return { ok: false, error: t("pages.adapters.unknownAction") };
}

export default function Adapters({ loaderData }: Route.ComponentProps) {
  return (
    <EntityPageView
      page={{
        ...page,
        records: loaderData.records,
        fields: page.fields.map((field) => ({
          ...field,
          options:
            field.key === "platformId"
              ? loaderData.adapterOptions
              : field.key === "authId"
                ? loaderData.authOptions
                : field.options,
        })),
      }}
    />
  );
}
