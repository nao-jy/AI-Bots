import { t } from "~/i18n";
import {
  Alert,
  Button,
  NumberInput,
  Select,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { Form, useActionData } from "react-router";
import type { Route } from "./+types/settings";
import { requireAdmin } from "../.server/auth";
import {
  getAppSettings,
  saveAppSettings,
} from "../.server/repository/app-settings";
import { APP_NAME } from "~/const";

export function meta() {
  return [{ title: t("pages.settings.documentTitle", { 0: APP_NAME }) }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const settings = await getAppSettings(user.organizationId);
  return {
    organizationName: settings.organizationName,
    mfaEnabled: settings.mfaEnabled,
    sessionDurationDays: settings.sessionDurationSeconds / 86400,
    maxLoginAttempts: settings.maxLoginAttempts,
    minimumPasswordStrength: settings.minimumPasswordStrength,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireAdmin(request);
  const form = await request.formData();
  const organizationName = String(form.get("organizationName") ?? "").trim();
  if (!organizationName || organizationName.length > 120)
    return { error: t("pages.settings.invalidOrganizationName") };
  const durationDays = Number(form.get("sessionDurationDays"));
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365)
    return { error: t("pages.settings.invalidSessionDuration") };
  const maxLoginAttempts = Number(form.get("maxLoginAttempts"));
  if (!Number.isSafeInteger(maxLoginAttempts) || maxLoginAttempts < 1)
    return { error: t("pages.settings.invalidLoginAttemptLimit") };
  const minimumPasswordStrengthInput = form.get("minimumPasswordStrength");
  const minimumPasswordStrength =
    typeof minimumPasswordStrengthInput === "string" &&
    minimumPasswordStrengthInput.trim() !== ""
      ? Number(minimumPasswordStrengthInput)
      : Number.NaN;
  if (
    !Number.isSafeInteger(minimumPasswordStrength) ||
    minimumPasswordStrength < 0 ||
    minimumPasswordStrength > 4
  )
    return { error: t("pages.settings.invalidPasswordStrength") };

  await saveAppSettings({
    organizationId: user.organizationId,
    organizationName,
    mfaEnabled: form.get("mfaEnabled") === "on",
    sessionDurationSeconds: durationDays * 86400,
    maxLoginAttempts,
    minimumPasswordStrength,
  });
  return { ok: true };
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <div className="entity-page">
      <header className="page-header">
        <div>
          <h1>{t("pages.settings.title")}</h1>
        </div>
      </header>
      <section className="entity-panel" style={{ padding: 24, maxWidth: 680 }}>
        <Form method="post">
          {actionData?.error && (
            <Alert color="red" role="alert" mb="md">
              {actionData.error}
            </Alert>
          )}
          {actionData?.ok && (
            <Alert color="green" role="status" mb="md">
              {t("pages.settings.saved")}
            </Alert>
          )}
          <TextInput
            name="organizationName"
            label={t("pages.settings.organizationNameLabel")}
            description={t("pages.settings.organizationNameHelp")}
            defaultValue={loaderData.organizationName}
            maxLength={120}
            required
            mb="lg"
          />
          <Switch
            name="mfaEnabled"
            label={t("pages.settings.requireMfaLabel")}
            description={t("pages.settings.requireMfaHelp")}
            defaultChecked={loaderData.mfaEnabled}
            mb="lg"
          />
          <NumberInput
            name="sessionDurationDays"
            label={t("pages.settings.sessionDurationLabel")}
            description={t("pages.settings.sessionDurationHelp")}
            min={1}
            max={365}
            step={1}
            defaultValue={loaderData.sessionDurationDays}
            allowDecimal={false}
            required
            mb="lg"
          />
          <Select
            name="minimumPasswordStrength"
            label={t("pages.settings.minimumPasswordStrengthLabel")}
            description={t("pages.settings.minimumPasswordStrengthHelp")}
            data={[
              { value: "0", label: t("components.passwordStrength.noMinimum") },
              { value: "1", label: t("components.passwordStrength.weak") },
              { value: "2", label: t("components.passwordStrength.fair") },
              { value: "3", label: t("components.passwordStrength.strong") },
              {
                value: "4",
                label: t("components.passwordStrength.veryStrong"),
              },
            ]}
            defaultValue={String(loaderData.minimumPasswordStrength)}
            allowDeselect={false}
            required
            mb="lg"
          />
          <NumberInput
            name="maxLoginAttempts"
            label={t("pages.settings.loginAttemptLimitLabel")}
            description={t("pages.settings.loginAttemptLimitHelp")}
            min={1}
            step={1}
            defaultValue={loaderData.maxLoginAttempts}
            allowDecimal={false}
            required
            mb="lg"
          />
          <Text size="xs" c="dimmed" mb="md">
            {t("pages.settings.mfaSettingsPreservedHelp")}
          </Text>
          <Button type="submit">{t("pages.settings.save")}</Button>
        </Form>
      </section>
    </div>
  );
}
