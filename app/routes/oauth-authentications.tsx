import { isUuid } from "../.server/utils";
import { t } from "~/i18n";
import { useEffect, useState } from "react";
import { useRevalidator } from "react-router";
import type { Route } from "./+types/oauth-authentications";
import { requireUser } from "../.server/auth";
import {
  deleteOAuthAuthentication,
  listOAuthAuthentications,
  renameOAuthAuthentication,
} from "../.server/repository/entities";
import { prepareOAuthAuthorization } from "../.server/features/oauth";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import { APP_NAME } from "~/const";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "pages.oauthAuthentications.title",
  description: "pages.oauthAuthentications.description",
  icon: "oauth_authentications",
  createIntent: "authorize",
  createSubmitLabel: "pages.oauthAuthentications.createSubmitLabel",
  authorizationInNewTab: true,
  launchIntent: "authorize",
  launchLabel: "pages.oauthAuthentications.launchLabel",
  columns: [
    { key: "name", label: "pages.oauthAuthentications.nameLabel" },
    { key: "oauthName", label: "pages.oauthAuthentications.oauthClientLabel" },
    { key: "expiresAt", label: "pages.oauthAuthentications.expiresAtLabel" },
    {
      key: "refreshTokenConfigured",
      label: "pages.oauthAuthentications.refreshTokenLabel",
    },
    { key: "updated", label: "pages.oauthAuthentications.updatedLabel" },
  ],
  fields: [
    {
      key: "name",
      label: "pages.oauthAuthentications.nameLabel",
      required: true,
    },
    {
      key: "oauthId",
      label: "pages.oauthAuthentications.oauthClientLabel",
      type: "select",
      placeholder: "pages.oauthAuthentications.oauthClientPlaceholder",
      options: [],
      required: true,
      createOnly: true,
    },
  ],
};

export function meta() {
  return [
    { title: t("pages.oauthAuthentications.documentTitle", { 0: APP_NAME }) },
  ];
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
  const id = String(form.get("id") ?? "");
  if (intent === "authorize") return prepareOAuthAuthorization(user, form);
  if (intent === "delete") {
    if (!isUuid(id))
      return { ok: false, error: t("pages.oauthAuthentications.notFound") };
    try {
      return (await deleteOAuthAuthentication(user, id))
        ? { ok: true }
        : { ok: false, error: t("pages.oauthAuthentications.notFound") };
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
  if (intent === "update")
    return isUuid(id)
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
  const { revalidate } = useRevalidator();
  const [dialogResetKey, setDialogResetKey] = useState(0);

  useEffect(() => {
    function handleOAuthMessage(event: MessageEvent) {
      if (
        event.origin === window.location.origin &&
        event.data?.type === "oauth:complete"
      ) {
        revalidate();
        setDialogResetKey((key) => key + 1);
      }
    }
    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, [revalidate]);

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
        dialogResetKey={dialogResetKey}
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
