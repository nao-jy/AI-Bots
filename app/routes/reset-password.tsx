import { t } from "~/i18n";
import { Alert, Button, PasswordInput, Title } from "@mantine/core";
import { data, Form, Link, useActionData } from "react-router";
import type { Route } from "./+types/reset-password";
import {
  completePasswordReset,
  inspectPasswordReset,
} from "../.server/features/password-reset";
import { APP_NAME } from "~/const";

type ResetStatus =
  | "ready"
  | "reset"
  | "expired"
  | "invalid"
  | "weak-password";

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
}

export function meta() {
  return [{ title: t("pages.resetPassword.documentTitle", { 0: APP_NAME }) }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  return data(
    { status: await inspectPasswordReset(token), token },
    { headers: noStoreHeaders() },
  );
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const result = await completePasswordReset(token, password);
  return data(result, {
    headers: noStoreHeaders(),
    status: result.status === "weak-password" ? 400 : 200,
  });
}

export default function ResetPassword({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const status: ResetStatus = actionData?.status ?? loaderData.status;
  const messages: Record<
    Exclude<ResetStatus, "ready" | "weak-password">,
    { title: string; message: string; color: string }
  > = {
    reset: {
      title: t("pages.resetPassword.successTitle"),
      message: t("pages.resetPassword.successInstructions"),
      color: "green",
    },
    expired: {
      title: t("pages.resetPassword.expiredLinkTitle"),
      message: t("pages.resetPassword.expiredLinkInstructions"),
      color: "yellow",
    },
    invalid: {
      title: t("pages.resetPassword.invalidLinkTitle"),
      message: t("pages.resetPassword.invalidLinkMessage"),
      color: "red",
    },
  };

  return (
    <main className="login-page">
      <div className="login-card-wrap">
        <section className="login-card">
          <div className="eyebrow">{APP_NAME}</div>
          {status === "ready" || status === "weak-password" ? (
            <>
              <Title order={1}>{t("pages.resetPassword.formTitle")}</Title>
              <p className="login-subtitle">{t("pages.resetPassword.passwordHint")}</p>
              {status === "weak-password" && (
                <Alert color="red" role="alert">
                  {t("pages.resetPassword.passwordValidationError")}</Alert>
              )}
              <Form method="post" className="login-form">
                <input
                  type="hidden"
                  name="token"
                  value={loaderData.token}
                />
                <PasswordInput
                  name="password"
                  label={t("pages.resetPassword.newPasswordLabel")}
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
                <Button type="submit" fullWidth>
                  {t("pages.resetPassword.submit")}</Button>
              </Form>
            </>
          ) : (
            <>
              <Title order={1}>{messages[status].title}</Title>
              <Alert color={messages[status].color} role="status">
                {messages[status].message}
              </Alert>
            </>
          )}
          <Button component={Link} to="/login" variant="subtle" fullWidth mt="sm">
            {t("pages.resetPassword.backToLogin")}</Button>
        </section>
      </div>
    </main>
  );
}
