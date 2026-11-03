import { Alert, Button, NumberInput, Switch, Text } from "@mantine/core";
import { Form, useActionData } from "react-router";
import type { Route } from "./+types/settings";
import { requireAdmin } from "../.server/auth";
import {
  getAppSettings,
  saveAppSettings,
} from "../.server/repository/app-settings";
import { APP_NAME } from "~/const";

export function meta() {
  return [{ title: `設定 | ${APP_NAME}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const settings = await getAppSettings();
  return {
    mfaEnabled: settings.mfaEnabled,
    sessionDurationDays: settings.sessionDurationSeconds / 86400,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const durationDays = Number(form.get("sessionDurationDays"));
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365)
    return { error: "セッション持続時間は1〜365日の整数で指定してください。" };

  await saveAppSettings({
    mfaEnabled: form.get("mfaEnabled") === "on",
    sessionDurationSeconds: durationDays * 86400,
  });
  return { ok: true };
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <div className="entity-page">
      <header className="page-header">
        <div>
          <h1>設定</h1>
          <p>ワークスペース全体の認証設定を管理します。</p>
        </div>
      </header>
      <section className="entity-panel" style={{ padding: 24, maxWidth: 680 }}>
        <Form method="post">
          {actionData?.error && (
            <Alert color="red" role="alert" mb="md">
              {actionData.error}
            </Alert>
          )}
          {actionData?.ok && (
            <Alert color="green" role="status" mb="md">
              設定を保存しました。
            </Alert>
          )}
          <Switch
            name="mfaEnabled"
            label="多要素認証を必須にする"
            description="有効にすると、次回ログイン時に認証アプリの設定または追加認証を求めます。"
            defaultChecked={loaderData.mfaEnabled}
            mb="lg"
          />
          <NumberInput
            name="sessionDurationDays"
            label="ログインセッション持続時間（日）"
            description="新規ログインに適用します。既存セッションの期限は変更しません。"
            min={1}
            max={365}
            step={1}
            defaultValue={loaderData.sessionDurationDays}
            allowDecimal={false}
            required
            mb="lg"
          />
          <Text size="xs" c="dimmed" mb="md">
            MFAを無効にしても、各ユーザーの認証アプリ設定は保持されます。
          </Text>
          <Button type="submit">設定を保存</Button>
        </Form>
      </section>
    </div>
  );
}
