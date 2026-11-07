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
import { entityListPage } from "../.server/repository/list-pages";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "pages.users.title",
  description: "pages.users.description",
  icon: "users",
  tableFeatures: {
    expandableActions: true,
    adminToggle: true,
    forceLogout: true,
    emailVerification: true,
    mfaReset: true,
    loginUnlock: true,
  },
  columns: [
    { key: "name", label: "pages.users.title" },
    { key: "email", label: "pages.users.emailLabel" },
    {
      key: "emailVerification",
      label: "pages.users.emailVerificationLabel",
      presentation: "verification-status",
    },
    {
      key: "mfaStatus",
      label: "pages.users.mfaLabel",
      presentation: "mfa-status",
    },
    { key: "loginLockStatus", label: "pages.users.loginLockLabel" },
    { key: "loginStatus", label: "pages.users.loginStatusLabel" },
    { key: "lastLogin", label: "pages.users.lastLoginLabel" },
    { key: "updated", label: "pages.users.updatedLabel" },
  ],
  fields: [
    {
      key: "name",
      label: "pages.users.displayNameLabel",
      placeholder: "pages.users.displayNamePlaceholder",
    },
    {
      key: "email",
      label: "pages.users.emailLabel",
      type: "email",
      placeholder: "pages.users.emailPlaceholder",
    },
    {
      key: "password",
      label: "pages.users.passwordLabel",
      type: "password",
      required: true,
      placeholder: "pages.users.passwordHint",
    },
  ],
};

export function meta() {
  return [{ title: t("pages.users.documentTitle", { 0: APP_NAME }) }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUser = await requireAdmin(request);
  const pagination = await entityListPage(currentUser, "users", request);
  const settings = await getAppSettings(currentUser.organizationId);
  return {
    users: await listUsers(
      isEmailVerificationEnabled(),
      settings.maxLoginAttempts,
      currentUser.organizationId,
      pagination.ids,
    ),
    pagination,
    currentUserId: currentUser.id,
    minimumPasswordStrength: settings.minimumPasswordStrength,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = String(form.get("id") ?? "");
  const validId = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id);
  if (intent === "delete") {
    return validId
      ? deleteUser(id, actor.id, actor.organizationId)
      : { ok: false, error: t("pages.users.notFound") };
  }
  if (intent === "toggle-admin") {
    const isAdminValue = String(form.get("isAdmin") ?? "");
    if (!validId || !["true", "false"].includes(isAdminValue))
      return { ok: false, error: t("pages.users.invalidChanges") };
    return setUserAdmin(
      id,
      isAdminValue === "true",
      actor.id,
      actor.organizationId,
    );
  }
  if (intent === "force-logout") {
    return validId
      ? forceLogoutUser(id, actor.id, actor.organizationId)
      : { ok: false, error: t("pages.users.notFound") };
  }
  if (intent === "reset-mfa")
    return validId
      ? resetUserMfa(id, actor.organizationId)
      : { ok: false, error: t("pages.users.notFound") };
  if (intent === "unlock-login")
    return validId
      ? unlockUserLogin(id, actor.organizationId)
      : { ok: false, error: t("pages.users.notFound") };
  if (intent === "send-verification") {
    if (!validId) return { ok: false, error: t("pages.users.notFound") };
    const user = await findUserById(id);
    if (!user || user.organizationId !== actor.organizationId)
      return { ok: false, error: t("pages.users.notFound") };
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
        error: t("pages.users.verificationEmailSendFailed"),
      };
    }
  }
  if (intent === "create") {
    const result = await saveUser(
      null,
      form,
      isEmailVerificationEnabled(),
      actor.organizationId,
    );
    if ("error" in result || !result.verificationRequired) return result;
    return sendNewUserVerification(
      String(form.get("email") ?? "")
        .trim()
        .toLowerCase(),
      request.url,
    );
  }
  if (intent === "update") {
    if (!validId) return { ok: false, error: t("pages.users.notFound") };
    const result = await saveUser(
      id,
      form,
      isEmailVerificationEnabled(),
      actor.organizationId,
    );
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
      error: t("pages.users.savedButEmailFailed"),
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
      error: t("pages.users.savedButEmailFailed"),
    };
  }
}

export default function Users({ loaderData }: Route.ComponentProps) {
  return (
    <EntityPageView
      page={{
        ...page,
        records: loaderData.users,
        pagination: loaderData.pagination,
        protectedRecordId: loaderData.currentUserId,
      }}
      minimumPasswordStrength={loaderData.minimumPasswordStrength}
    />
  );
}
