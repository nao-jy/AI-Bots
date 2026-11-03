import { Alert, Button, Image, PasswordInput, Text, Title } from "@mantine/core";
import QRCode from "qrcode";
import { data, Form, redirect, useActionData } from "react-router";
import type { Route } from "./+types/mfa";
import {
  clearMfaSetupCookie,
  finishMfaLogin,
  finishMfaSetup,
  getMfaChallenge,
  getMfaSetupUri,
  recordMfaFailure,
  verifyMfaCode,
} from "../.server/features/mfa";
import {
  clearSessionCookie,
  getSessionToken,
  sessionCookie,
} from "../.server/auth";
import { APP_NAME } from "~/const";

export function meta() {
  return [{ title: `多要素認証 | ${APP_NAME}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const challenge = await getMfaChallenge(request);
  if (!challenge) {
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", clearSessionCookie());
    headers.append("Set-Cookie", clearMfaSetupCookie());
    throw redirect("/login", { headers });
  }

  return data(
    {
      stage: challenge.stage,
      email: challenge.user.email,
      qrCode:
        challenge.stage === "setup"
          ? await QRCode.toDataURL(
              await getMfaSetupUri(challenge.secret, challenge.user.email),
            )
          : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function action({ request }: Route.ActionArgs) {
  const challenge = await getMfaChallenge(request);
  if (!challenge) {
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", clearSessionCookie());
    headers.append("Set-Cookie", clearMfaSetupCookie());
    return data(
      { error: "認証手続きの有効期限が切れました。もう一度ログインしてください。" },
      { status: 401, headers },
    );
  }

  const form = await request.formData();
  const code = String(form.get("code") ?? "").trim();
  if (!(await verifyMfaCode(challenge.secret, code))) {
    const locked = await recordMfaFailure(request);
    const headers = new Headers({ "Cache-Control": "no-store" });
    if (locked) {
      headers.append("Set-Cookie", clearSessionCookie());
      headers.append("Set-Cookie", clearMfaSetupCookie());
    }
    return data(
      {
        error: locked
          ? "認証に複数回失敗したため、もう一度ログインしてください。"
          : "認証コードが正しくありません。",
      },
      { status: locked ? 429 : 400, headers },
    );
  }

  const token = getSessionToken(request);
  if (!token) throw redirect("/login");
  const completed =
    challenge.stage === "setup"
      ? await finishMfaSetup(request, challenge.user.id, challenge.secret)
      : await finishMfaLogin(token, challenge.user.id);
  if (!completed)
    return data(
      { error: "認証状態が変更されました。もう一度ログインしてください。" },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );

  const headers = new Headers();
  headers.append("Cache-Control", "no-store");
  headers.append("Set-Cookie", sessionCookie(token, completed.expiresAt));
  headers.append("Set-Cookie", clearMfaSetupCookie());
  return redirect("/bots", { headers });
}

export default function Mfa({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const isSetup = loaderData.stage === "setup";

  return (
    <main className="login-page">
      <div className="login-card-wrap">
        <section className="login-card">
          <div className="eyebrow">{APP_NAME}</div>
          <Title order={1}>
            {isSetup ? "多要素認証を設定" : "追加認証"}
          </Title>
          <Text className="login-subtitle">
            {isSetup
              ? "認証アプリでQRコードを読み取り、表示された6桁のコードを入力してください。設定を完了するまでログインできません。"
              : "認証アプリに表示された6桁のコードを入力してください。"}
          </Text>
          {isSetup && loaderData.qrCode && (
            <Image
              src={loaderData.qrCode}
              alt="認証アプリで読み取るためのQRコード"
              maw={220}
              mx="auto"
            />
          )}
          {actionData?.error && (
            <Alert color="red" role="alert">
              {actionData.error}
            </Alert>
          )}
          <Form method="post" className="login-form">
            <PasswordInput
              name="code"
              label="認証コード"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
            />
            <Button type="submit" fullWidth>
              {isSetup ? "設定してログイン" : "認証してログイン"}
            </Button>
          </Form>
        </section>
      </div>
    </main>
  );
}
