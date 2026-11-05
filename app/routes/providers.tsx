import { t } from "~/i18n";
import type { Route } from "./+types/providers";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  deleteProvider,
  listProviders,
  saveProvider,
} from "../.server/repository/entities";
import { requireUser } from "../.server/auth";
import { APP_NAME } from "~/const";
import { listProviderNames } from "~/.server/features/provider";

const page: Omit<EntityPageDefinition, "records"> = {
  title: t("pages.providers.title"),
  description: t("pages.providers.description"),
  icon: "providers",
  columns: [
    { key: "name", label: t("pages.providers.connectionNameLabel") },
    { key: "providerName", label: t("pages.providers.providerNameLabel") },
    { key: "headersConfigured", label: t("pages.providers.httpHeadersLabel") },
    { key: "updated", label: t("pages.providers.updatedLabel") },
  ],
  fields: [
    {
      key: "name",
      label: t("pages.providers.connectionNameLabel"),
      placeholder: t("pages.providers.connectionNamePlaceholder"),
    },
    {
      key: "providerName",
      label: t("pages.providers.providerIdLabel"),
      type: "select",
      placeholder: t("pages.providers.providerPlaceholder"),
      help: {
        text: t("pages.providers.documentationHelp"),
        linkText: t("pages.providers.documentationLink"),
        href: "https://ai-sdk.dev/providers/ai-sdk-providers",
      },
    },
    {
      key: "args",
      label: t("pages.providers.providerArgumentsLabel"),
      type: "key-value",
      valueType: "json-scalar",
      wide: true,
    },
    {
      key: "headers",
      label: t("pages.providers.httpHeadersLabel"),
      type: "key-value",
      valueType: "string",
      wide: true,
    },
  ],
};

export function meta() {
  return [{ title: t("pages.providers.documentTitle", { 0: APP_NAME }) }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [providers, providerNames] = await Promise.all([
    listProviders(await requireUser(request)),
    Promise.resolve(listProviderNames()),
  ]);
  return {
    ...providers,
    providerOptions: providerNames.map(({ id, displayName }) => ({
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
  if (intent === "delete") {
    const deleted = Number.isInteger(id) && (await deleteProvider(user, id));
    return deleted
      ? { ok: true }
      : {
          ok: false,
          error: t("pages.providers.inUseOrNotFound"),
        };
  }
  if (intent === "create") return saveProvider(user, null, form);
  if (intent === "update")
    return Number.isInteger(id)
      ? saveProvider(user, id, form)
      : { ok: false, error: t("pages.providers.notFound") };
  return { ok: false, error: t("pages.providers.unknownAction") };
}

export default function Models({ loaderData }: Route.ComponentProps) {
  return (
    <EntityPageView
      page={{
        ...page,
        records: loaderData.records,
        fields: page.fields.map((field) => ({
          ...field,
          options:
            field.key === "providerName"
              ? loaderData.providerOptions
              : field.options,
        })),
      }}
    />
  );
}
