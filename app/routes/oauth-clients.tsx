import { t } from "~/i18n";
import type { Route } from "./+types/oauth-clients";
import { requireUser } from "../.server/auth";
import {
  deleteOAuthClient,
  listOAuthClients,
  saveOAuthClient,
} from "../.server/repository/entities";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import { APP_NAME } from "~/const";

const page: Omit<EntityPageDefinition, "records"> = {
  title: t("pages.oauthClients.title"),
  description: t("pages.oauthClients.description"),
  icon: "oauth_clients",
  columns: [
    { key: "name", label: t("pages.oauthClients.nameLabel") },
    { key: "clientId", label: t("pages.oauthClients.clientIdLabel") },
    { key: "authorizationEndpoint", label: t("pages.oauthClients.authorizationEndpointLabel") },
    { key: "secretConfigured", label: t("pages.oauthClients.secretLabel") },
    { key: "updated", label: t("pages.oauthClients.updatedLabel") },
  ],
  fields: [
    { key: "name", label: t("pages.oauthClients.nameLabel"), required: true },
    { key: "clientId", label: t("pages.oauthClients.clientIdLabel"), required: true },
    {
      key: "clientSecret",
      label: t("pages.oauthClients.clientSecretLabel"),
      type: "password",
      placeholder: t("pages.oauthClients.secretKeepCurrentHint"),
    },
    {
      key: "authorizationEndpoint",
      label: t("pages.oauthClients.authorizationEndpointLabel"),
      placeholder: t("pages.oauthClients.authorizationEndpointPlaceholder"),
      required: true,
      wide: true,
    },
    {
      key: "tokenEndpoint",
      label: t("pages.oauthClients.tokenEndpointLabel"),
      placeholder: t("pages.oauthClients.tokenEndpointPlaceholder"),
      required: true,
      wide: true,
    },
    {
      key: "refreshEndpoint",
      label: t("pages.oauthClients.refreshEndpointLabel"),
      placeholder: t("pages.oauthClients.refreshEndpointHint"),
      wide: true,
    },
    {
      key: "revocationEndpoint",
      label: t("pages.oauthClients.revokeEndpointLabel"),
      wide: true,
    },
    {
      key: "scopes",
      label: t("pages.oauthClients.scopesLabel"),
      placeholder: t("pages.oauthClients.scopesPlaceholder"),
      type: "tags",
      wide: true,
    },
  ],
};

export function meta() {
  return [{ title: t("pages.oauthClients.documentTitle", { 0: APP_NAME }) }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return listOAuthClients(await requireUser(request));
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "delete")
    return Number.isInteger(id) && (await deleteOAuthClient(user, id))
      ? { ok: true }
      : { ok: false, error: t("pages.oauthClients.notFound") };
  if (intent === "create") return saveOAuthClient(user, null, form);
  if (intent === "update")
    return Number.isInteger(id)
      ? saveOAuthClient(user, id, form)
      : { ok: false, error: t("pages.oauthClients.notFound") };
  return { ok: false, error: t("pages.oauthClients.unknownAction") };
}

export default function OAuthClients({ loaderData }: Route.ComponentProps) {
  return <EntityPageView page={{ ...page, records: loaderData.records }} />;
}
