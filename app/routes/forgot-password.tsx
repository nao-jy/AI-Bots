import { Alert, Button, TextInput, Title } from "@mantine/core";
import { data, Form, Link, useActionData } from "react-router";
import type { Route } from "./+types/forgot-password";
import { logger } from "../.server/logger";
import {
  isPasswordResetEnabled,
  sendPasswordResetEmail,
} from "../.server/features/password-reset";
import { APP_NAME } from "~/const";

const REQUEST_MESSAGE =
  "該当するアカウントがあり、メールを送信できる場合は、再設定用のメールをお送りします。";

export function meta() {
  return [{ title: `パスワード再設定 | ${APP_NAME}` }];
}

export async function loader() {
  return { enabled: isPasswordResetEnabled() };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email))
    return data({ message: REQUEST_MESSAGE });

  try {
    await sendPasswordResetEmail(email, request.url);
  } catch (error) {
    logger.error("Failed to send password reset email", { error });
  }
  return data({ message: REQUEST_MESSAGE });
}

export default function ForgotPassword({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <main className="login-page">
      <div className="login-card-wrap">
        <section className="login-card">
          <div className="eyebrow">{APP_NAME}</div>
          <Title order={1}>パスワードを再設定</Title>
          <p className="login-subtitle">
            登録したメールアドレスを入力してください。
          </p>
          {actionData?.message ? (
            <Alert color="blue" role="status">
              {actionData.message}
            </Alert>
          ) : loaderData.enabled ? (
            <Form method="post" className="login-form">
              <TextInput
                name="email"
                label="メールアドレス"
                type="email"
                autoComplete="email"
                required
              />
              <Button type="submit" fullWidth>
                再設定メールを送信
              </Button>
            </Form>
          ) : (
            <Alert color="yellow" role="status">
              メール送信が利用できません。管理者にお問い合わせください。
            </Alert>
          )}
          <Button component={Link} to="/login" variant="subtle" fullWidth mt="sm">
            ログイン画面へ戻る
          </Button>
        </section>
      </div>
    </main>
  );
}
