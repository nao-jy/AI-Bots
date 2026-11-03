import { Alert, Button, PasswordInput, TextInput } from "@mantine/core";
import { ArrowRightIcon, SparkleIcon } from "@phosphor-icons/react";
import { data, Form, Link, redirect, useActionData } from "react-router";
import type { Route } from "./+types/login";
import {
  createSession,
  getSessionUser,
  hashPassword,
  sessionCookie,
  verifyPassword,
} from "../.server/auth";
import { getAppSettings } from "../.server/repository/app-settings";
import {
  createMfaLoginChallenge,
  createMfaSecret,
} from "../.server/features/mfa";
import {
  createUser,
  findUserByEmail,
  hasUsers,
} from "../.server/repository/users";
import {
  isEmailVerificationEnabled,
  sendEmailVerification,
} from "../.server/features/email-verification";
import { logger } from "../.server/logger";
import { APP_NAME } from "~/const";

export function meta() {
  return [
    { title: `ログイン | ${APP_NAME}` },
    { name: "description", content: `${APP_NAME} ワークスペースにログイン` },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (await getSessionUser(request)) throw redirect("/bots");
  return { setupRequired: !(await hasUsers()) };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email) || !password) {
    return data(
      { error: "メールアドレスとパスワードを入力してください。" },
      { status: 400 },
    );
  }

  let user = await findUserByEmail(email);
  if (!user) {
    if (await hasUsers()) {
      return data(
        { error: "メールアドレスまたはパスワードが正しくありません。" },
        { status: 401 },
      );
    }
    if (name.length < 1 || password.length < 12) {
      return data(
        { error: "初回登録では表示名と12文字以上のパスワードが必要です。" },
        { status: 400 },
      );
    }
    try {
      const emailVerified = !isEmailVerificationEnabled();
      user = await createUser({
        email,
        name,
        passwordHash: await hashPassword(password),
        isAdmin: true,
        emailVerified,
      });
    } catch {
      return data(
        {
          error:
            "初回アカウントを作成できませんでした。もう一度お試しください。",
        },
        { status: 400 },
      );
    }
    if (!user.emailVerified) {
      try {
        await sendEmailVerification(user, request.url);
      } catch (error) {
        logger.error("Failed to send initial administrator verification email", {
          userId: user.id,
          error,
        });
        return data(
          {
            error:
              "アカウントを作成しましたが、検証メールを送信できませんでした。ログイン後、ユーザー一覧から再送してください。",
          },
          { status: 502 },
        );
      }
    }
  } else if (!(await verifyPassword(password, user.passwordHash))) {
    return data(
      { error: "メールアドレスまたはパスワードが正しくありません。" },
      { status: 401 },
    );
  }

  if ((await getAppSettings()).mfaEnabled) {
    const challenge = await createMfaLoginChallenge(
      user.id,
      user.mfaSecret ? undefined : createMfaSecret(),
    );
    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      sessionCookie(challenge.token, challenge.expiresAt),
    );
    headers.append("Set-Cookie", challenge.setupCookie);
    return redirect("/mfa", { headers });
  }

  const session = await createSession(user.id);
  return redirect("/bots", {
    headers: { "Set-Cookie": sessionCookie(session.token, session.expiresAt) },
  });
}

export default function Login({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const setupRequired = loaderData.setupRequired;

  return (
    <main className="login-page">
      <div className="login-decoration decor-one" />
      <div className="login-decoration decor-two" />
      <div className="login-decoration decor-three" />
      <div className="login-top">
        <Link to="/login" className="brand">
          <span className="brand-mark">
            <SparkleIcon size={20} weight="fill" aria-hidden="true" />
          </span>
          <span>
            {APP_NAME}
            <span className="brand-dot">.</span>
            <small>AI WORKSPACE</small>
          </span>
        </Link>
      </div>
      <div className="login-card-wrap">
        <section className="login-card">
          <div className="login-welcome-mark">
            <SparkleIcon size={23} weight="fill" aria-hidden="true" />
          </div>
          <div className="eyebrow">YOUR AI WORKSPACE</div>
          <h1>{setupRequired ? "最初のアカウントを作成" : "おかえりなさい"}</h1>
          <p className="login-subtitle">
            {setupRequired
              ? "最初のアカウントを登録して、ワークスペースを始めましょう。"
              : "アカウントにログインして、ワークスペースを開きましょう。"}
          </p>
          <Form method="post" className="login-form">
            {setupRequired && (
              <TextInput
                name="name"
                label="表示名"
                autoComplete="name"
                required
              />
            )}
            <TextInput
              name="email"
              label="メールアドレス"
              placeholder="name@company.com"
              type="email"
              autoComplete="email"
              required
            />
            <PasswordInput
              name="password"
              label={setupRequired ? "パスワード（12文字以上）" : "パスワード"}
              autoComplete={setupRequired ? "new-password" : "current-password"}
              minLength={setupRequired ? 12 : undefined}
              required
            />
            {actionData?.error && <Alert color="red">{actionData.error}</Alert>}
            <Button
              type="submit"
              fullWidth
              rightSection={<ArrowRightIcon size={16} aria-hidden="true" />}
            >
              {setupRequired ? "アカウントを作成" : "ログイン"}
            </Button>
          </Form>
        </section>
      </div>
    </main>
  );
}
