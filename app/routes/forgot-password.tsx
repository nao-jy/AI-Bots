import { t } from "~/i18n";
import { Alert, Button, TextInput, Title } from "@mantine/core";
import { data, Form, Link, useActionData } from "react-router";
import type { Route } from "./+types/forgot-password";
import { appLogger } from "../.server/logger/app-logger";
import {
  isPasswordResetEnabled,
  sendPasswordResetEmail,
} from "../.server/features/password-reset";
import { APP_NAME } from "~/const";

export function meta() {
  return [{ title: t("pages.forgotPassword.documentTitle", { 0: APP_NAME }) }];
}

export async function loader() {
  return { enabled: isPasswordResetEnabled() };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const requestMessage = t("pages.forgotPassword.requestSentNotice");
  if (!/^\S+@\S+\.\S+$/.test(email)) return data({ message: requestMessage });

  try {
    await sendPasswordResetEmail(email, request.url);
  } catch (error) {
    appLogger.error("Failed to send password reset email", { error });
  }
  return data({ message: requestMessage });
}

export default function ForgotPassword({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <main className="login-page">
      <div className="login-card-wrap">
        <section className="login-card">
          <div className="eyebrow">{APP_NAME}</div>
          <Title order={1}>{t("pages.forgotPassword.title")}</Title>
          <p className="login-subtitle">
            {t("pages.forgotPassword.instructions")}</p>
          {actionData?.message ? (
            <Alert color="blue" role="status">
              {actionData.message}
            </Alert>
          ) : loaderData.enabled ? (
            <Form method="post" className="login-form">
              <TextInput
                name="email"
                label={t("pages.forgotPassword.emailLabel")}
                type="email"
                autoComplete="email"
                required
              />
              <Button type="submit" fullWidth>
                {t("pages.forgotPassword.submit")}</Button>
            </Form>
          ) : (
            <Alert color="yellow" role="status">
              {t("pages.forgotPassword.emailUnavailable")}</Alert>
          )}
          <Button
            component={Link}
            to="/login"
            variant="subtle"
            fullWidth
            mt="sm"
          >
            {t("pages.forgotPassword.backToLogin")}</Button>
        </section>
      </div>
    </main>
  );
}
