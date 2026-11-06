import { isUuid } from "../.server/utils";
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
  title: "pages.oauthClients.title",
  description: "pages.oauthClients.description",
  icon: "oauth_clients",
  tableFeatures: { resourceGrants: true },
  columns: [
    { key: "name", label: "pages.oauthClients.nameLabel" },
    { key: "clientId", label: "pages.oauthClients.clientIdLabel" },
    { key: "authorizationEndpoint", label: "pages.oauthClients.authorizationEndpointLabel" },
    { key: "secretConfigured", label: "pages.oauthClients.secretLabel" },
    { key: "updated", label: "pages.oauthClients.updatedLabel" },
  ],
  fields: [
    { key: "name", label: "pages.oauthClients.nameLabel", required: true },
    { key: "clientId", label: "pages.oauthClients.clientIdLabel", required: true },
    {
      key: "clientSecret",
      label: "pages.oauthClients.clientSecretLabel",
      type: "password",
      placeholder: "pages.oauthClients.secretKeepCurrentHint",
    },
    {
      key: "authorizationEndpoint",
      label: "pages.oauthClients.authorizationEndpointLabel",
      placeholder: "pages.oauthClients.authorizationEndpointPlaceholder",
      required: true,
      wide: true,
    },
    {
      key: "tokenEndpoint",
      label: "pages.oauthClients.tokenEndpointLabel",
      placeholder: "pages.oauthClients.tokenEndpointPlaceholder",
      required: true,
      wide: true,
    },
    {
      key: "refreshEndpoint",
      label: "pages.oauthClients.refreshEndpointLabel",
      placeholder: "pages.oauthClients.refreshEndpointHint",
      wide: true,
    },
    {
      key: "revocationEndpoint",
      label: "pages.oauthClients.revokeEndpointLabel",
      wide: true,
    },
    {
      key: "scopes",
      label: "pages.oauthClients.scopesLabel",
      placeholder: "pages.oauthClients.scopesPlaceholder",
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
  const id = String(form.get("id") ?? "");
  if (intent === "delete") {
    if (!isUuid(id))
      return { ok: false, error: t("pages.oauthClients.notFound") };
    try {
      return (await deleteOAuthClient(user, id))
        ? { ok: true }
        : { ok: false, error: t("pages.oauthClients.notFound") };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "server.oauthTokenRevocationFailed",
      };
    }
  }
  if (intent === "create") return saveOAuthClient(user, null, form);
  if (intent === "update")
    return isUuid(id)
      ? saveOAuthClient(user, id, form)
      : { ok: false, error: t("pages.oauthClients.notFound") };
  return { ok: false, error: t("pages.oauthClients.unknownAction") };
}

export default function OAuthClients({ loaderData }: Route.ComponentProps) {
  return <EntityPageView page={{ ...page, records: loaderData.records }} />;
}
