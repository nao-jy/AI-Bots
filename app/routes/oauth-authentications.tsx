import { t } from "~/i18n";
import type { Route } from "./+types/oauth-authentications";
import { requireUser } from "../.server/auth";
import {
  deleteOAuthAuthentication,
  listOAuthAuthentications,
  renameOAuthAuthentication,
} from "../.server/repository/entities";
import { startOAuthAuthorization } from "../.server/features/oauth";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import { APP_NAME } from "~/const";

const page: Omit<EntityPageDefinition, "records"> = {
  title: t("pages.oauthAuthentications.title"),
  description:
    t("pages.oauthAuthentications.description"),
  icon: "oauth_authentications",
  createIntent: "authorize",
  createSubmitLabel: t("pages.oauthAuthentications.createSubmitLabel"),
  launchIntent: "authorize",
  launchLabel: t("pages.oauthAuthentications.launchLabel"),
  columns: [
    { key: "name", label: t("pages.oauthAuthentications.nameLabel") },
    { key: "oauthName", label: t("pages.oauthAuthentications.oauthClientLabel") },
    { key: "expiresAt", label: t("pages.oauthAuthentications.expiresAtLabel") },
    { key: "refreshTokenConfigured", label: t("pages.oauthAuthentications.refreshTokenLabel") },
    { key: "updated", label: t("pages.oauthAuthentications.updatedLabel") },
  ],
  fields: [
    { key: "name", label: t("pages.oauthAuthentications.nameLabel"), required: true },
    {
      key: "oauthId",
      label: t("pages.oauthAuthentications.oauthClientLabel"),
      type: "select",
      placeholder: t("pages.oauthAuthentications.oauthClientPlaceholder"),
      options: [],
      required: true,
      createOnly: true,
    },
  ],
};

export function meta() {
  return [{ title: t("pages.oauthAuthentications.documentTitle", { 0: APP_NAME }) }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const result = await listOAuthAuthentications(await requireUser(request));
  const oauthStatus = new URL(request.url).searchParams.get("oauth");
  return {
    ...result,
    oauthMessage:
      oauthStatus === "success"
        ? t("pages.oauthAuthentications.authorizationSucceeded")
        : oauthStatus === "denied"
          ? t("pages.oauthAuthentications.authorizationCanceled")
          : oauthStatus === "error"
            ? t("pages.oauthAuthentications.authorizationFailed")
            : null,
    oauthMessageType: oauthStatus === "success" ? "success" : "error",
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "authorize") return startOAuthAuthorization(user, form);
  if (intent === "delete")
    return Number.isInteger(id) && (await deleteOAuthAuthentication(user, id))
      ? { ok: true }
      : { ok: false, error: t("pages.oauthAuthentications.notFound") };
  if (intent === "update")
    return Number.isInteger(id)
      ? renameOAuthAuthentication(user, id, form)
      : { ok: false, error: t("pages.oauthAuthentications.notFound") };
  if (intent === "create")
    return {
      ok: false,
      error: t("pages.oauthAuthentications.invalidLaunch"),
    };
  return { ok: false, error: t("pages.oauthAuthentications.unknownAction") };
}

export default function OAuthAuthentications({
  loaderData,
}: Route.ComponentProps) {
  return (
    <>
      {loaderData.oauthMessage && (
        <div
          className={`oauth-notice ${loaderData.oauthMessageType}`}
          role="status"
        >
          {loaderData.oauthMessage}
        </div>
      )}
      <EntityPageView
        page={{
          ...page,
          records: loaderData.records,
          fields: page.fields.map((field) =>
            field.key === "oauthId"
              ? { ...field, options: loaderData.clientOptions }
              : field,
          ),
        }}
      />
    </>
  );
}
