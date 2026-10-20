import type { Route } from "./+types/oauth-authentications";
import { requireUser } from "../.server/auth";
import {
  deleteOAuthAuthentication,
  listOAuthAuthentications,
  renameOAuthAuthentication,
} from "../.server/models/entities";
import { startOAuthAuthorization } from "../.server/features/oauth";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import { APP_NAME } from "~/const";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "OAuth認証情報",
  description: "OAuthクライアントを選択して認証し、取得したトークンを保存します。",
  icon: "oauth",
  createIntent: "authorize",
  createSubmitLabel: "OAuth認証を開始",
  launchIntent: "authorize",
  launchLabel: "OAuth認証をやり直す",
  columns: [
    { key: "name", label: "認証情報名" },
    { key: "oauthName", label: "OAuthクライアント" },
    { key: "expiresAt", label: "有効期限" },
    { key: "refreshTokenConfigured", label: "更新トークン" },
    { key: "updated", label: "最終更新" },
  ],
  fields: [
    { key: "name", label: "認証情報名", required: true },
    {
      key: "oauthId",
      label: "OAuthクライアント",
      type: "select",
      placeholder: "クライアントを選択",
      options: [],
      required: true,
      createOnly: true,
    },
  ],
};

export function meta() {
  return [{ title: `OAuth認証情報 | ${APP_NAME}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const result = await listOAuthAuthentications(await requireUser(request));
  const oauthStatus = new URL(request.url).searchParams.get("oauth");
  return {
    ...result,
    oauthMessage:
      oauthStatus === "success"
        ? "OAuth認証が完了し、認証情報を保存しました。"
        : oauthStatus === "denied"
          ? "OAuth認証がキャンセルされました。"
          : oauthStatus === "error"
            ? "OAuth認証に失敗しました。クライアント設定とコールバックURLを確認してください。"
            : null,
    oauthMessageType: oauthStatus === "success" ? "success" : "error",
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "authorize")
    return startOAuthAuthorization(user, request, form);
  if (intent === "delete")
    return Number.isInteger(id) &&
      (await deleteOAuthAuthentication(user, id))
      ? { ok: true }
      : { ok: false, error: "OAuth認証情報が見つかりません。" };
  if (intent === "update")
    return Number.isInteger(id)
      ? renameOAuthAuthentication(user, id, form)
      : { ok: false, error: "OAuth認証情報が見つかりません。" };
  if (intent === "create")
    return { ok: false, error: "OAuth認証はOAuth認証を開始から実行してください。" };
  return { ok: false, error: "操作を判定できませんでした。" };
}

export default function OAuthAuthentications({
  loaderData,
}: Route.ComponentProps) {
  return (
    <>
      {loaderData.oauthMessage && (
        <div className={`oauth-notice ${loaderData.oauthMessageType}`} role="status">
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
