import { t } from "~/i18n";
import type { Route } from "./+types/users";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  deleteUser,
  findUserByEmail,
  findUserById,
  forceLogoutUser,
  listUsers,
  resetUserMfa,
  unlockUserLogin,
  saveUser,
  setUserAdmin,
} from "../.server/repository/entities";
import { getAppSettings } from "../.server/repository/app-settings";
import {
  isEmailVerificationEnabled,
  sendEmailVerification,
} from "../.server/features/email-verification";
import { requireAdmin } from "../.server/auth";
import { appLogger } from "../.server/logger/app-logger";
import { APP_NAME } from "~/const";

const page: Omit<EntityPageDefinition, "records"> = {
  title: t("pages.users.title"),
  description: t("pages.users.description"),
  icon: "users",
  tableFeatures: {
    expandableActions: true,
    forceLogout: true,
    emailVerification: true,
    mfaReset: true,
    loginUnlock: true,
  },
  columns: [
    { key: "name", label: t("pages.users.title") },
    { key: "email", label: t("pages.users.emailLabel") },
    {
      key: "emailVerification",
      label: t("pages.users.emailVerificationLabel"),
      presentation: "verification-status",
    },
    { key: "mfaStatus", label: t("pages.users.mfaLabel"), presentation: "mfa-status" },
    { key: "isAdmin", label: t("pages.users.roleLabel"), presentation: "admin-toggle" },
    { key: "loginLockStatus", label: t("pages.users.loginLockLabel") },
    { key: "loginStatus", label: t("pages.users.loginStatusLabel") },
    { key: "lastLogin", label: t("pages.users.lastLoginLabel") },
    { key: "updated", label: t("pages.users.updatedLabel") },
  ],
  fields: [
    { key: "name", label: t("pages.users.displayNameLabel"), placeholder: t("pages.users.displayNamePlaceholder") },
    {
      key: "email",
      label: t("pages.users.emailLabel"),
      type: "email",
      placeholder: t("pages.users.emailPlaceholder"),
    },
    {
      key: "password",
      label: t("pages.users.passwordLabel"),
      type: "password",
      required: true,
      placeholder: t("pages.users.passwordHint"),
    },
  ],
};

export function meta() {
  return [{ title: t("pages.users.documentTitle", { 0: APP_NAME }) }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUser = await requireAdmin(request);
  const settings = await getAppSettings();
  return {
    users: await listUsers(
      isEmailVerificationEnabled(),
      settings.maxLoginAttempts,
    ),
    currentUserId: currentUser.id,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "delete") {
    return Number.isInteger(id)
      ? deleteUser(id, actor.id)
      : { ok: false, error: t("pages.users.notFound") };
  }
  if (intent === "toggle-admin") {
    const isAdminValue = String(form.get("isAdmin") ?? "");
    if (!Number.isInteger(id) || !["true", "false"].includes(isAdminValue))
      return { ok: false, error: t("pages.users.invalidChanges") };
    return setUserAdmin(id, isAdminValue === "true", actor.id);
  }
  if (intent === "force-logout") {
    return Number.isInteger(id)
      ? forceLogoutUser(id, actor.id)
      : { ok: false, error: t("pages.users.notFound") };
  }
  if (intent === "reset-mfa")
    return Number.isInteger(id)
      ? resetUserMfa(id)
      : { ok: false, error: t("pages.users.notFound") };
  if (intent === "unlock-login")
    return Number.isInteger(id)
      ? unlockUserLogin(id)
      : { ok: false, error: t("pages.users.notFound") };
  if (intent === "send-verification") {
    if (!Number.isInteger(id))
      return { ok: false, error: t("pages.users.notFound") };
    const user = await findUserById(id);
    if (!user) return { ok: false, error: t("pages.users.notFound") };
    if (user.emailVerified)
      return { ok: false, error: t("pages.users.emailAlreadyVerified") };
    try {
      const sent = await sendEmailVerification(user, request.url);
      return sent
        ? { ok: true }
        : { ok: false, error: t("pages.users.emailProviderUnavailable") };
    } catch (error) {
      appLogger.error("Failed to send user verification email", {
        userId: user.id,
        error:
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return {
        ok: false,
        error:
          t("pages.users.verificationEmailSendFailed"),
      };
    }
  }
  if (intent === "create") {
    const result = await saveUser(null, form, isEmailVerificationEnabled());
    if ("error" in result || !result.verificationRequired) return result;
    return sendNewUserVerification(
      String(form.get("email") ?? "")
        .trim()
        .toLowerCase(),
      request.url,
    );
  }
  if (intent === "update") {
    if (!Number.isInteger(id))
      return { ok: false, error: t("pages.users.notFound") };
    const result = await saveUser(id, form, isEmailVerificationEnabled());
    if ("error" in result || !result.verificationRequired) return result;
    return sendNewUserVerification(
      String(form.get("email") ?? "")
        .trim()
        .toLowerCase(),
      request.url,
    );
  }
  return { ok: false, error: t("pages.users.unknownAction") };
}

async function sendNewUserVerification(email: string, requestUrl: string) {
  const user = await findUserByEmail(email);
  if (!user)
    return {
      ok: false,
      notification: "verification-email" as const,
      error:
        t("pages.users.savedButEmailFailed"),
    };
  try {
    await sendEmailVerification(user, requestUrl);
    return { ok: true, notification: "verification-email" as const };
  } catch (error) {
    appLogger.error("Failed to send user verification email", {
      userId: user.id,
      error:
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return {
      ok: false,
      notification: "verification-email" as const,
      error:
        t("pages.users.savedButEmailFailed"),
    };
  }
}

export default function Users({ loaderData }: Route.ComponentProps) {
  return (
    <EntityPageView
      page={{
        ...page,
        records: loaderData.users,
        protectedRecordId: loaderData.currentUserId,
      }}
    />
  );
}
