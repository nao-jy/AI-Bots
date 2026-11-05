import { t } from "~/i18n";
import { Alert, Button, Image, PasswordInput, Text, Title } from "@mantine/core";
import QRCode from "qrcode";
import { data, Form, redirect, useActionData } from "react-router";
import type { Route } from "./+types/mfa";
import {
  clearMfaSetupCookies,
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
  return [{ title: t("pages.mfa.documentTitle", { 0: APP_NAME }) }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const challenge = await getMfaChallenge(request);
  if (!challenge) {
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", clearSessionCookie());
    for (const cookie of clearMfaSetupCookies())
      headers.append("Set-Cookie", cookie);
    throw redirect("/login", { headers });
  }

  const headers = new Headers({ "Cache-Control": "no-store" });
  if ("setupCookies" in challenge)
    for (const cookie of challenge.setupCookies ?? [])
      headers.append("Set-Cookie", cookie);

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
    { headers },
  );
}

export async function action({ request }: Route.ActionArgs) {
  const challenge = await getMfaChallenge(request);
  if (!challenge) {
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", clearSessionCookie());
    for (const cookie of clearMfaSetupCookies())
      headers.append("Set-Cookie", cookie);
    return data(
      { error: t("pages.mfa.expiredSession") },
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
      for (const cookie of clearMfaSetupCookies())
        headers.append("Set-Cookie", cookie);
    }
    return data(
      {
        error: locked
          ? t("pages.mfa.tooManyFailures")
          : t("pages.mfa.invalidCode"),
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
      { error: t("pages.mfa.stateChanged") },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );

  const headers = new Headers();
  headers.append("Cache-Control", "no-store");
  headers.append("Set-Cookie", sessionCookie(token, completed.expiresAt));
  for (const cookie of clearMfaSetupCookies())
    headers.append("Set-Cookie", cookie);
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
            {isSetup ? t("pages.mfa.setupTitle") : t("pages.mfa.challengeTitle")}
          </Title>
          <Text className="login-subtitle">
            {isSetup
              ? t("pages.mfa.setupInstructions")
              : t("pages.mfa.challengeInstructions")}
          </Text>
          {isSetup && loaderData.qrCode && (
            <Image
              src={loaderData.qrCode}
              alt={t("pages.mfa.qrCodeAlt")}
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
              label={t("pages.mfa.codeLabel")}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
            />
            <Button type="submit" fullWidth>
              {isSetup ? t("pages.mfa.setupAndLogin") : t("pages.mfa.verifyAndLogin")}
            </Button>
          </Form>
        </section>
      </div>
    </main>
  );
}
