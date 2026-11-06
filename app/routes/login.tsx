import { t } from "~/i18n";
import { Alert, Button, PasswordInput, TextInput } from "@mantine/core";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { data, Form, Link, redirect, useActionData } from "react-router";
import type { Route } from "./+types/login";
import { appendSetCookies } from "~/cookie";
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
  recordFailedLoginAttempt,
  resetLoginAttemptsForLogin,
} from "../.server/repository/users";
import {
  isEmailVerificationEnabled,
  sendEmailVerification,
} from "../.server/features/email-verification";
import { isPasswordResetEnabled } from "../.server/features/password-reset";
import { appLogger } from "../.server/logger/app-logger";
import { logAuditEvent } from "../.server/logger/audit-logger";
import { APP_NAME } from "~/const";
import { LanguageSwitcher } from "~/components/language-switcher";

export function meta() {
  return [
    { title: t("pages.login.documentTitle", { 0: APP_NAME }) },
    {
      name: "description",
      content: t("pages.login.workspaceTitle", { 0: APP_NAME }),
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (await getSessionUser(request)) throw redirect("/");
  return {
    setupRequired: !(await hasUsers()),
    passwordResetEnabled: isPasswordResetEnabled(),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const organizationName = String(form.get("organizationName") ?? "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email) || !password) {
    logAuditEvent("auth.login.rejected", "account", email || null);
    return data({ error: t("pages.login.loginInstructions") }, { status: 400 });
  }

  let user = await findUserByEmail(email);
  if (!user) {
    if (await hasUsers()) {
      logAuditEvent("auth.login.rejected", "account", email);
      return data(
        { error: t("pages.login.invalidCredentials") },
        { status: 401 },
      );
    }
    if (name.length < 1 || organizationName.length < 1 || password.length < 12) {
      return data(
        { error: t("pages.login.firstAccountRequirements") },
        { status: 400 },
      );
    }
    try {
      const emailVerified = !isEmailVerificationEnabled();
      user = await createUser({
        email,
        name,
        organizationName,
        passwordHash: await hashPassword(password),
        isAdmin: true,
        emailVerified,
      });
    } catch (error) {
      appLogger.error("Failed to create initial organization administrator", {
        email,
        error,
      });
      return data(
        {
          error: t("pages.login.firstAccountCreationFailed"),
        },
        { status: 400 },
      );
    }
    if (!user.emailVerified) {
      try {
        await sendEmailVerification(user, request.url);
      } catch (error) {
        appLogger.error(
          "Failed to send initial administrator verification email",
          {
            userId: user.id,
            error,
          },
        );
        return data(
          {
            error: t("pages.login.verificationEmailSendFailedAfterSignup"),
          },
          { status: 502 },
        );
      }
    }
  } else {
    const maxLoginAttempts = (
      await getAppSettings(user.organizationId)
    ).maxLoginAttempts;
    if (user.loginAttempts >= maxLoginAttempts) {
      logAuditEvent("auth.login.rejected", "user", user.id);
      return data(
        {
          error: t("pages.login.loginAttemptsLocked"),
        },
        { status: 423 },
      );
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
      const result = await recordFailedLoginAttempt(user.id, maxLoginAttempts);
      return data(
        {
          error:
            result === "locked"
              ? t("pages.login.loginAttemptsLocked")
              : t("pages.login.invalidCredentials"),
        },
        { status: result === "locked" ? 423 : 401 },
      );
    }

    if (!(await resetLoginAttemptsForLogin(user.id, maxLoginAttempts))) {
      logAuditEvent("auth.login.rejected", "user", user.id);
      return data(
        {
          error: t("pages.login.loginAttemptsLocked"),
        },
        { status: 423 },
      );
    }
  }

  if ((await getAppSettings(user.organizationId)).mfaEnabled) {
    const challenge = await createMfaLoginChallenge(
      user.id,
      user.mfaSecret ? undefined : createMfaSecret(),
    );
    const headers = new Headers();
    appendSetCookies(
      headers,
      sessionCookie(challenge.token, challenge.expiresAt),
      ...challenge.setupCookies,
    );
    return redirect("/mfa", { headers });
  }

  const session = await createSession(user.id, user.organizationId);
  logAuditEvent("auth.login.succeeded", "user", user.id, user.id);
  return redirect("/", {
    headers: {
      "Set-Cookie": sessionCookie(session.token, session.expiresAt),
    },
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
          <img src="/logo.png" alt={APP_NAME} />
        </Link>
        <LanguageSwitcher />
      </div>
      <div className="login-card-wrap">
        <section className="login-card">
          <div className="login-welcome-mark">
            <img src="/logo.png" alt={APP_NAME} />
          </div>
          <h1>
            {setupRequired
              ? t("pages.login.createFirstAccount")
              : t("pages.login.welcomeBack")}
          </h1>
          <p className="login-subtitle">
            {setupRequired
              ? t("pages.login.firstAccountIntroduction")
              : t("pages.login.loginIntroduction")}
          </p>
          <Form method="post" className="login-form">
            {setupRequired && (
              <>
                <TextInput
                  name="organizationName"
                  label={t("pages.login.organizationNameLabel")}
                  placeholder={t("pages.login.organizationNamePlaceholder")}
                  autoComplete="organization"
                  required
                />
                <TextInput
                  name="name"
                  label={t("pages.login.displayNameLabel")}
                  autoComplete="name"
                  required
                />
              </>
            )}
            <TextInput
              name="email"
              label={t("pages.login.emailLabel")}
              placeholder={t("pages.login.emailPlaceholder")}
              type="email"
              autoComplete="email"
              required
            />
            <PasswordInput
              name="password"
              label={
                setupRequired
                  ? t("pages.login.passwordMinimumLabel")
                  : t("pages.login.passwordLabel")
              }
              autoComplete={setupRequired ? "new-password" : "current-password"}
              minLength={setupRequired ? 12 : undefined}
              required
            />
            {actionData?.error && <Alert color="red">{actionData.error}</Alert>}
            {loaderData.passwordResetEnabled && !setupRequired && (
              <Link to="/forgot-password" className="forgot-password-link">
                {t("pages.login.forgotPasswordLink")}
              </Link>
            )}
            <Button
              type="submit"
              fullWidth
              rightSection={<ArrowRightIcon size={16} aria-hidden="true" />}
            >
              {setupRequired
                ? t("pages.login.createAccount")
                : t("pages.login.submitLogin")}
            </Button>
          </Form>
        </section>
      </div>
    </main>
  );
}
