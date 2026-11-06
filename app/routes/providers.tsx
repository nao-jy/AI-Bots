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
  title: "pages.providers.title",
  description: "pages.providers.description",
  icon: "providers",
  tableFeatures: { resourceGrants: true },
  columns: [
    { key: "name", label: "pages.providers.connectionNameLabel" },
    { key: "providerName", label: "pages.providers.providerNameLabel" },
    { key: "headersConfigured", label: "pages.providers.httpHeadersLabel" },
    { key: "updated", label: "pages.providers.updatedLabel" },
  ],
  fields: [
    {
      key: "name",
      label: "pages.providers.connectionNameLabel",
      placeholder: "pages.providers.connectionNamePlaceholder",
    },
    {
      key: "providerName",
      label: "pages.providers.providerIdLabel",
      type: "select",
      placeholder: "pages.providers.providerPlaceholder",
      help: {
        text: "pages.providers.documentationHelp",
        linkText: "pages.providers.documentationLink",
        href: "https://ai-sdk.dev/providers/ai-sdk-providers",
      },
    },
    {
      key: "args",
      label: "pages.providers.providerArgumentsLabel",
      type: "key-value",
      valueType: "json-scalar",
      wide: true,
    },
    {
      key: "headers",
      label: "pages.providers.httpHeadersLabel",
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
  const id = String(form.get("id") ?? "");
  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  if (intent === "delete") {
    const deleted = validId && (await deleteProvider(user, id));
    return deleted
      ? { ok: true }
      : {
          ok: false,
          error: t("pages.providers.inUseOrNotFound"),
        };
  }
  if (intent === "create") return saveProvider(user, null, form);
  if (intent === "update")
    return validId
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
