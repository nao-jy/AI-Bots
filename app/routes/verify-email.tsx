import { t } from "~/i18n";
import { Alert, Button, Title } from "@mantine/core";
import { Form, Link, useActionData } from "react-router";
import type { Route } from "./+types/verify-email";
import {
  inspectEmailVerification,
  verifyEmail,
} from "../.server/features/email-verification";
import { APP_NAME } from "~/const";

export function meta() {
  return [{ title: t("pages.verifyEmail.documentTitle", { 0: APP_NAME }) }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return { status: "invalid" as const, token: "" };
  return { status: await inspectEmailVerification(token), token };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  return { status: await verifyEmail(token) };
}

export default function VerifyEmail({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const status = actionData?.status ?? loaderData.status;
  const messages = {
    ready: {
      title: t("pages.verifyEmail.title"),
      message: t("pages.verifyEmail.instructions"),
      color: "blue",
    },
    verified: {
      title: t("pages.verifyEmail.successTitle"),
      message: t("pages.verifyEmail.successMessage"),
      color: "green",
    },
    "already-verified": {
      title: t("pages.verifyEmail.alreadyVerifiedTitle"),
      message: t("pages.verifyEmail.alreadyVerifiedMessage"),
      color: "green",
    },
    expired: {
      title: t("pages.verifyEmail.expiredLinkTitle"),
      message: t("pages.verifyEmail.expiredLinkInstructions"),
      color: "yellow",
    },
    invalid: {
      title: t("pages.verifyEmail.invalidLinkTitle"),
      message: t("pages.verifyEmail.invalidLinkInstructions"),
      color: "red",
    },
  }[status];

  return (
    <main className="login-page">
      <div className="login-card-wrap">
        <section className="login-card verify-email-card">
          <div className="eyebrow">{APP_NAME}</div>
          <Title order={1}>{messages.title}</Title>
          <Alert color={messages.color} role="status">
            {messages.message}
          </Alert>
          {status === "ready" ? (
            <Form method="post">
              <input
                type="hidden"
                name="token"
                value={loaderData.token}
              />
              <Button type="submit" fullWidth>
                {t("pages.verifyEmail.submit")}</Button>
            </Form>
          ) : (
            <Button component={Link} to="/login" fullWidth>
              {t("pages.verifyEmail.backToLogin")}</Button>
          )}
        </section>
      </div>
    </main>
  );
}
