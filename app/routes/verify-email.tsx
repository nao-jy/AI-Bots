import { Alert, Button, Title } from "@mantine/core";
import { Form, Link, useActionData } from "react-router";
import type { Route } from "./+types/verify-email";
import {
  inspectEmailVerification,
  verifyEmail,
} from "../.server/features/email-verification";
import { APP_NAME } from "~/const";

export function meta() {
  return [{ title: `メールアドレスの確認 | ${APP_NAME}` }];
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
      title: "メールアドレスを確認",
      message: "検証を完了するには、以下のボタンを押してください。",
      color: "blue",
    },
    verified: {
      title: "メールアドレスを確認しました",
      message: "メールアドレスの検証が完了しました。",
      color: "green",
    },
    "already-verified": {
      title: "検証済みです",
      message: "このメールアドレスはすでに検証されています。",
      color: "green",
    },
    expired: {
      title: "リンクの有効期限が切れています",
      message: "管理者に検証メールの再送を依頼してください。",
      color: "yellow",
    },
    invalid: {
      title: "リンクを確認できません",
      message: "検証リンクが無効です。管理者に再送を依頼してください。",
      color: "red",
    },
  }[status];

  return (
    <main className="login-page">
      <div className="login-card-wrap">
        <section className="login-card">
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
                検証を完了する
              </Button>
            </Form>
          ) : (
            <Button component={Link} to="/login" fullWidth>
              ログイン画面へ
            </Button>
          )}
        </section>
      </div>
    </main>
  );
}
