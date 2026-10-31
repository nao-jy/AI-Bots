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
  title: "OAuthクライアント",
  description: "OAuth認可サーバーのクライアント設定を管理します。",
  icon: "oauth",
  columns: [
    { key: "name", label: "クライアント名" },
    { key: "clientId", label: "クライアントID" },
    { key: "authorizationEndpoint", label: "認可エンドポイント" },
    { key: "secretConfigured", label: "シークレット" },
    { key: "updated", label: "最終更新" },
  ],
  fields: [
    { key: "name", label: "クライアント名", required: true },
    { key: "clientId", label: "クライアントID", required: true },
    {
      key: "clientSecret",
      label: "クライアントシークレット",
      type: "password",
      placeholder: "編集時は空欄で現在の値を維持",
    },
    {
      key: "authorizationEndpoint",
      label: "認可エンドポイント",
      placeholder: "https://example.com/oauth/authorize",
      required: true,
      wide: true,
    },
    {
      key: "tokenEndpoint",
      label: "トークンエンドポイント",
      placeholder: "https://example.com/oauth/token",
      required: true,
      wide: true,
    },
    {
      key: "refreshEndpoint",
      label: "トークン更新エンドポイント",
      placeholder: "未指定の場合はトークンエンドポイントを使用",
      wide: true,
    },
    {
      key: "revocationEndpoint",
      label: "トークン失効エンドポイント",
      wide: true,
    },
    {
      key: "scopes",
      label: "スコープ",
      placeholder: "openid profile email",
      type: "tags",
      wide: true,
    },
  ],
};

export function meta() {
  return [{ title: `OAuthクライアント | ${APP_NAME}` }];
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
      : { ok: false, error: "OAuthクライアントが見つかりません。" };
  if (intent === "create") return saveOAuthClient(user, null, form);
  if (intent === "update")
    return Number.isInteger(id)
      ? saveOAuthClient(user, id, form)
      : { ok: false, error: "OAuthクライアントが見つかりません。" };
  return { ok: false, error: "操作を判定できませんでした。" };
}

export default function OAuthClients({ loaderData }: Route.ComponentProps) {
  return <EntityPageView page={{ ...page, records: loaderData.records }} />;
}
