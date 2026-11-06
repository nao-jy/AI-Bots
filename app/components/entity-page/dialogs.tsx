import { t, tMessage, type TranslationMessage } from "~/i18n";
import { useEffect, useState } from "react";
import {
  Alert,
  Anchor,
  Button,
  Group,
  Modal,
  MultiSelect,
  PasswordInput,
  Select,
  Text,
  TextInput,
  Textarea,
  TagsInput,
  Title,
} from "@mantine/core";
import { useFetcher } from "react-router";
import { notifications } from "@mantine/notifications";
import type { EntityRecord } from "../../types/entities";
import type { EntityDialogMode, EntityPageDefinition } from "./types";
import { InfoIcon } from "@phosphor-icons/react";
import { ToolSetContextEditor } from "./toolset-context-editor";
import { McpServerEditor } from "./mcp-server-editor";
import { CronScheduleEditor } from "./cron-schedule-editor";
import { ScheduleTargetsEditor } from "./schedule-targets-editor";
import { PasswordStrengthInput } from "~/components/password-strength-input";

type KeyValuePair = { key: string; value: string };

function localizedOptions(
  options: NonNullable<EntityPageDefinition["fields"][number]["options"]>,
) {
  return options.map((option) =>
    typeof option === "string"
      ? { value: option, label: tMessage(option) }
      : { ...option, label: tMessage(option.label) },
  );
}

function DependentSelectEditor({
  name,
  label,
  dependentKey,
  dependentLabel,
  options,
  dependentOptions,
  initialValue,
  initialDependentValue,
  placeholder,
}: {
  name: string;
  label: string;
  dependentKey: string;
  dependentLabel: string;
  options: NonNullable<EntityPageDefinition["fields"][number]["options"]>;
  dependentOptions: NonNullable<
    EntityPageDefinition["fields"][number]["dependentOptions"]
  >;
  initialValue: unknown;
  initialDependentValue: unknown;
  placeholder?: string;
}) {
  const [value, setValue] = useState(
    typeof initialValue === "string" || typeof initialValue === "number"
      ? String(initialValue)
      : "",
  );
  const [dependentValue, setDependentValue] = useState(
    typeof initialDependentValue === "string" ||
      typeof initialDependentValue === "number"
      ? String(initialDependentValue)
      : "",
  );
  const availableOptions = (dependentOptions[value] ?? []).map((option) => ({
    ...option,
    label: tMessage(option.label),
  }));
  const validDependentValue = availableOptions.some(
    (option) => option.value === dependentValue,
  )
    ? dependentValue
    : "";
  return (
    <div className="dependent-select-grid">
      <Select
        name={name}
        label={label}
        placeholder={
          placeholder ?? t("components.entityPage.dialogs.selectOption")
        }
        data={localizedOptions(options)}
        value={value || null}
        onChange={(nextValue) => {
          setValue(nextValue ?? "");
          setDependentValue("");
        }}
        required
        style={{ width: "100%" }}
      />
      <input type="hidden" name={dependentKey} value={validDependentValue} />
      <Select
        label={dependentLabel}
        placeholder={
          value
            ? t("components.entityPage.dialogs.selectTarget")
            : t("components.entityPage.dialogs.selectTargetTypeFirst")
        }
        data={availableOptions}
        value={validDependentValue || null}
        onChange={(nextValue) => setDependentValue(nextValue ?? "")}
        disabled={!value || availableOptions.length === 0}
        required
        style={{ width: "100%" }}
      />
    </div>
  );
}

function MetricCoefficientsEditor({
  name,
  label,
  options,
  initialValue,
}: {
  name: string;
  label: string;
  options: NonNullable<EntityPageDefinition["fields"][number]["options"]>;
  initialValue: unknown;
}) {
  const metricOptions = options.map((option) =>
    typeof option === "string"
      ? { value: option, label: tMessage(option) }
      : { ...option, label: tMessage(option.label) },
  );
  const [pairs, setPairs] = useState<KeyValuePair[]>(() => {
    if (typeof initialValue !== "string" || !initialValue) return [];
    try {
      const parsed: unknown = JSON.parse(initialValue);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        return [];
      return Object.entries(parsed).map(([key, value]) => ({
        key,
        value: String(value),
      }));
    } catch {
      return [];
    }
  });
  const selectedMetrics = new Set(
    pairs.map((pair) => pair.key).filter(Boolean),
  );
  const availableMetrics = metricOptions.filter(
    (option) => !selectedMetrics.has(option.value),
  );
  const serialized = JSON.stringify(
    Object.fromEntries(
      pairs
        .filter((pair) => pair.key && pair.value !== "")
        .map((pair) => [pair.key, Number(pair.value)]),
    ),
  );

  return (
    <div>
      <Text size="sm" fw={500} mb={6}>
        {label}
      </Text>
      <input type="hidden" name={name} value={serialized} />
      {pairs.map((pair, index) => {
        const optionsForPair = [
          ...metricOptions.filter(
            (option) =>
              option.value === pair.key || !selectedMetrics.has(option.value),
          ),
        ];
        return (
          <Group key={index} align="flex-end" wrap="nowrap" mb="xs">
            <Select
              aria-label={t("components.entityPage.dialogs.usageItemLabel", {
                0: label,
                1: index + 1,
              })}
              placeholder={t("components.entityPage.dialogs.selectUsageItem")}
              data={optionsForPair}
              value={pair.key || null}
              onChange={(value) =>
                setPairs((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, key: value ?? "" } : item,
                  ),
                )
              }
              required
              style={{ flex: 1 }}
            />
            <TextInput
              aria-label={t(
                "components.entityPage.dialogs.usageMultiplierLabel",
                { 0: label, 1: index + 1 },
              )}
              type="number"
              min={0}
              step="any"
              value={pair.value}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setPairs((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, value } : item,
                  ),
                );
              }}
              required
              style={{ width: 120 }}
            />
            <Button
              type="button"
              variant="subtle"
              color="red"
              size="xs"
              onClick={() =>
                setPairs((current) => current.filter((_, i) => i !== index))
              }
              aria-label={t("components.entityPage.dialogs.deleteRowLabel", {
                0: label,
                1: index + 1,
              })}
            >
              {t("components.entityPage.dialogs.delete")}
            </Button>
          </Group>
        );
      })}
      <Button
        type="button"
        variant="light"
        size="xs"
        disabled={availableMetrics.length === 0}
        onClick={() => {
          const nextMetric = availableMetrics[0];
          if (nextMetric)
            setPairs((current) => [
              ...current,
              { key: nextMetric.value, value: "1" },
            ]);
        }}
      >
        {t("components.entityPage.dialogs.addUsageItem")}
      </Button>
    </div>
  );
}

function parsePairs(value: unknown): KeyValuePair[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return [];
    return Object.entries(parsed).map(([key, item]) => ({
      key,
      value: typeof item === "string" ? item : (JSON.stringify(item) ?? ""),
    }));
  } catch {
    return [];
  }
}

function serializePairs(
  pairs: KeyValuePair[],
  valueType: "string" | "json-scalar",
) {
  return JSON.stringify(
    Object.fromEntries(
      pairs
        .filter(({ key }) => key.trim())
        .map(({ key, value }) => {
          if (valueType === "string") return [key.trim(), value];
          try {
            const parsed: unknown = JSON.parse(value);
            return [
              key.trim(),
              parsed === null ||
              ["string", "number", "boolean"].includes(typeof parsed)
                ? parsed
                : value,
            ];
          } catch {
            return [key.trim(), value];
          }
        }),
    ),
  );
}

function submitFormInNewTab(sourceForm: HTMLFormElement, data: FormData) {
  const target = `oauth-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const popup = window.open("", target);
  if (!popup) return false;

  const form = document.createElement("form");
  form.method = "post";
  form.action = sourceForm.action;
  form.target = target;
  form.style.display = "none";
  for (const [name, value] of data.entries()) {
    if (typeof value !== "string") continue;
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
  form.remove();
  return true;
}

function KeyValueEditor({
  name,
  label,
  initialValue,
  valueType = "string",
}: {
  name: string;
  label: string;
  initialValue: unknown;
  valueType?: "string" | "json-scalar";
}) {
  const [pairs, setPairs] = useState(() => parsePairs(initialValue));
  return (
    <div>
      <Text size="sm" fw={500} mb={6}>
        {label}
      </Text>
      <input
        type="hidden"
        name={name}
        value={serializePairs(pairs, valueType)}
      />
      {pairs.map((pair, index) => (
        <Group key={index} align="flex-end" wrap="nowrap" mb="xs">
          <TextInput
            aria-label={t("components.entityPage.dialogs.keyLabel", {
              0: label,
              1: index + 1,
            })}
            placeholder={t("components.entityPage.dialogs.key")}
            value={pair.key}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setPairs((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, key: value } : item,
                ),
              );
            }}
            style={{ flex: 1 }}
          />
          <TextInput
            aria-label={t("components.entityPage.dialogs.valueLabel", {
              0: label,
              1: index + 1,
            })}
            placeholder={t("components.entityPage.dialogs.value")}
            value={pair.value}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setPairs((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, value: value } : item,
                ),
              );
            }}
            style={{ flex: 1 }}
          />
          <Button
            type="button"
            variant="subtle"
            color="red"
            size="xs"
            onClick={() =>
              setPairs((current) => current.filter((_, i) => i !== index))
            }
            aria-label={t("components.entityPage.dialogs.deleteRowLabel", {
              0: label,
              1: index + 1,
            })}
          >
            {t("components.entityPage.dialogs.delete")}
          </Button>
        </Group>
      ))}
      <Button
        type="button"
        variant="light"
        size="xs"
        onClick={() =>
          setPairs((current) => [...current, { key: "", value: "" }])
        }
      >
        {t("components.entityPage.dialogs.addPair")}
      </Button>
    </div>
  );
}

function StringListEditor({
  name,
  label,
  initialValue,
  placeholder,
}: {
  name: string;
  label: string;
  initialValue: unknown;
  placeholder?: string;
}) {
  const [value, setValue] = useState<string[]>(() => {
    if (typeof initialValue !== "string") return [];
    try {
      const parsed: unknown = JSON.parse(initialValue);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  });

  return (
    <>
      <TagsInput
        label={label}
        placeholder={placeholder}
        value={value}
        onChange={(items) =>
          setValue(items.map((item) => item.trim()).filter(Boolean))
        }
        splitChars={[","]}
        clearable
      />
      <input type="hidden" name={name} value={JSON.stringify(value)} />
    </>
  );
}

export function EntityPageDialogs({
  page,
  minimumPasswordStrength,
  mode,
  selected,
  nextEnabled,
  onClose,
}: {
  page: EntityPageDefinition;
  minimumPasswordStrength?: number;
  mode: EntityDialogMode;
  selected: EntityRecord | null;
  nextEnabled: boolean;
  onClose: () => void;
}) {
  const canTest = ["adapters", "agents", "mcp"].includes(page.icon);
  const changesAdmin = page.columns.some(
    (column) => column.presentation === "admin-toggle",
  ) || page.tableFeatures?.adminToggle === true;
  const fetcher = useFetcher<{
    ok?: boolean;
    error?: string | TranslationMessage;
    message?: string | TranslationMessage;
    intent?: string;
    notification?: "verification-email";
  }>();

  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data?.ok &&
      !fetcher.data.message &&
      fetcher.data.intent !== "test" &&
      fetcher.data.notification !== "verification-email"
    )
      onClose();
  }, [fetcher.state, fetcher.data, onClose]);

  useEffect(() => {
    if (
      page.icon !== "users" ||
      fetcher.state !== "idle" ||
      fetcher.data?.notification !== "verification-email"
    )
      return;

    notifications.show({
      title: fetcher.data.ok
        ? t("components.entityPage.dialogs.verificationEmailSent")
        : t("components.entityPage.dialogs.verificationEmailSendFailed"),
      message: fetcher.data.ok
        ? t("components.entityPage.dialogs.userSavedAndEmailSent")
        : tMessage(
            fetcher.data.error ??
              t(
                "components.entityPage.dialogs.verificationEmailCouldNotBeSent",
              ),
          ),
      color: fetcher.data.ok ? "green" : "red",
    });
    onClose();
  }, [page.icon, fetcher.state, fetcher.data, onClose]);

  return (
    <>
      <Modal
        opened={mode === "create" || mode === "edit"}
        onClose={onClose}
        title={
          <div>
            <Text className="modal-kicker">
              {mode === "edit"
                ? t("components.entityPage.dialogs.updateSettings")
                : t("components.entityPage.dialogs.newSettings")}
            </Text>
            <Title order={3}>
              {mode === "edit"
                ? t("components.entityPage.dialogs.editRecord", {
                    0: page.title,
                  })
                : t("components.entityPage.dialogs.createRecord", {
                    0: page.title,
                  })}
            </Title>
          </div>
        }
        centered
        size="lg"
        radius="lg"
        classNames={{
          title: "editor-modal-title",
          content: "editor-modal-content",
        }}
      >
        <fetcher.Form
          method="post"
          key={`${mode}-${selected?.id ?? "new"}`}
          onSubmit={(event) => {
            if (!page.authorizationInNewTab || mode !== "create") return;
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            if (!submitFormInNewTab(event.currentTarget, data))
              fetcher.submit(data, { method: "post" });
          }}
        >
          <input
            type="hidden"
            name="_intent"
            value={mode === "edit" ? "update" : (page.createIntent ?? "create")}
          />
          {selected && <input type="hidden" name="id" value={selected.id} />}
          <Text className="modal-intro">
            {page.description}{" "}
            {t("components.entityPage.dialogs.requiredDetails")}
          </Text>
          {fetcher.data?.notification !== "verification-email" &&
            (fetcher.data?.error || fetcher.data?.message) && (
              <Alert
                color={
                  fetcher.data.ok
                    ? fetcher.data.message
                      ? "yellow"
                      : "green"
                    : "red"
                }
                role="status"
                icon={<InfoIcon />}
              >
                {tMessage(fetcher.data.message ?? fetcher.data.error ?? "")}
              </Alert>
            )}
          <div className="form-grid">
            {page.fields
              .filter((field) => !field.createOnly || mode === "create")
              .map((field) => (
                <div className={field.wide ? "field-wide" : ""} key={field.key}>
                  {field.type === "toolset-contexts" ? (
                    <ToolSetContextEditor
                      name={field.key}
                      schemas={page.toolSetSchemas ?? []}
                      initialValue={selected?.[field.key]}
                    />
                  ) : field.type === "cron" ? (
                    <CronScheduleEditor
                      name={field.key}
                      label={field.label}
                      initialValue={selected?.[field.key]}
                      timezoneDescription={field.timezoneDescription}
                    />
                  ) : field.type === "schedule-targets" ? (
                    <ScheduleTargetsEditor
                      name="targets"
                      label={field.label}
                      options={field.options ?? []}
                      initialValue={selected?.[field.key]}
                    />
                  ) : field.type === "mcp-servers" ? (
                    <McpServerEditor
                      label={field.label}
                      serverOptions={field.options ?? []}
                      authenticationOptions={
                        page.mcpAuthenticationOptions ?? []
                      }
                      initialConnections={selected?.mcpConnections}
                      initialServerIds={selected?.mcpServerIds}
                      initialAuthenticationIds={selected?.mcpAuthIds}
                      placeholder={field.placeholder}
                    />
                  ) : field.type === "tags" ? (
                    <StringListEditor
                      name={field.key}
                      label={field.label}
                      placeholder={field.placeholder}
                      initialValue={selected?.[field.key]}
                    />
                  ) : field.type === "textarea" ? (
                    <Textarea
                      name={field.key}
                      label={field.label}
                      placeholder={field.placeholder}
                      minRows={3}
                      defaultValue={String(selected?.[field.key] ?? "")}
                      required={field.required}
                    />
                  ) : field.type === "key-value" ? (
                    <KeyValueEditor
                      name={field.key}
                      label={field.label}
                      initialValue={selected?.[field.key]}
                      valueType={field.valueType}
                    />
                  ) : field.type === "metric-coefficients" ? (
                    <MetricCoefficientsEditor
                      name={field.key}
                      label={field.label}
                      options={field.options ?? []}
                      initialValue={selected?.[field.key]}
                    />
                  ) : field.type === "dependent-select" &&
                    field.dependentKey &&
                    field.dependentLabel &&
                    field.dependentOptions ? (
                    <DependentSelectEditor
                      name={field.key}
                      label={field.label}
                      placeholder={field.placeholder}
                      dependentKey={field.dependentKey}
                      dependentLabel={field.dependentLabel}
                      options={field.options ?? []}
                      dependentOptions={field.dependentOptions}
                      initialValue={selected?.[field.key]}
                      initialDependentValue={selected?.[field.dependentKey]}
                    />
                  ) : field.type === "select" ? (
                    <Select
                      name={field.key}
                      label={field.label}
                      placeholder={
                        field.placeholder ??
                        t("components.entityPage.dialogs.selectOption")
                      }
                      data={localizedOptions(field.options ?? [])}
                      defaultValue={
                        String(
                          selected?.[field.key] ?? field.defaultValue ?? "",
                        ) || null
                      }
                      required={field.required}
                      clearable={
                        field.key === "agentId" || field.key === "authId"
                      }
                    />
                  ) : field.type === "multiselect" ? (
                    <MultiSelect
                      name={field.key}
                      label={field.label}
                      placeholder={
                        field.placeholder ??
                        t("components.entityPage.dialogs.selectOption")
                      }
                      data={localizedOptions(field.options ?? [])}
                      required={field.required}
                      defaultValue={String(selected?.[field.key] ?? "")
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean)}
                      hiddenInputValuesDivider=", "
                      searchable
                      clearable
                      nothingFoundMessage={t(
                        "components.entityPage.dialogs.noOptions",
                      )}
                    />
                  ) : field.type === "password" ? (
                    field.key === "password" ? (
                      <PasswordStrengthInput
                        name={field.key}
                        label={field.label}
                        placeholder={field.placeholder}
                        autoComplete="new-password"
                        minimumStrength={minimumPasswordStrength}
                        required={field.required && mode === "create"}
                      />
                    ) : (
                      <PasswordInput
                        name={field.key}
                        label={field.label}
                        placeholder={field.placeholder}
                        autoComplete="new-password"
                        required={field.required && mode === "create"}
                      />
                    )
                  ) : (
                    <TextInput
                      name={field.key}
                      type={
                        field.type === "email" || field.type === "number"
                          ? field.type
                          : "text"
                      }
                      label={field.label}
                      placeholder={field.placeholder}
                      defaultValue={String(selected?.[field.key] ?? "")}
                      required={field.required}
                    />
                  )}
                  {field.help && (
                    <Text size="xs" c="dimmed" mt={6}>
                      {field.help.text}
                      {t("components.entityPage.dialogs.spacing")}
                      {field.help.href && field.help.linkText && (
                        <>
                          {t("components.entityPage.dialogs.spacing")}
                          <Anchor
                            href={field.help.href}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {field.help.linkText}
                          </Anchor>
                        </>
                      )}
                    </Text>
                  )}
                </div>
              ))}
          </div>
          <div className="modal-actions">
            <Button variant="default" type="button" onClick={onClose}>
              {t("components.entityPage.dialogs.cancel")}
            </Button>
            {canTest && (
              <Button
                type="button"
                variant="light"
                disabled={fetcher.state !== "idle"}
                onClick={(event) => {
                  const form = event.currentTarget.form;
                  if (!form) return;
                  const data = new FormData(form);
                  data.set("_intent", "test");
                  fetcher.submit(data, { method: "post" });
                }}
              >
                {fetcher.state !== "idle" &&
                fetcher.formData?.get("_intent") === "test"
                  ? t("components.entityPage.dialogs.testing")
                  : t("components.entityPage.dialogs.test")}
              </Button>
            )}
            {page.launchIntent && mode === "edit" && (
              <Button
                type="button"
                variant="light"
                disabled={fetcher.state !== "idle"}
                onClick={(event) => {
                  const form = event.currentTarget.form;
                  if (!form) return;
                  const data = new FormData(form);
                  data.set("_intent", page.launchIntent!);
                  if (
                    !page.authorizationInNewTab ||
                    !submitFormInNewTab(form, data)
                  )
                    fetcher.submit(data, { method: "post" });
                }}
              >
                {page.launchLabel ??
                  t("components.entityPage.dialogs.startAuthentication")}
              </Button>
            )}
            <Button
              type="submit"
              className="primary-button"
              disabled={fetcher.state !== "idle"}
            >
              {fetcher.state !== "idle"
                ? t("components.entityPage.dialogs.saving")
                : mode === "edit"
                  ? t("components.entityPage.dialogs.saveChanges")
                  : (page.createSubmitLabel ??
                    t("components.entityPage.dialogs.create"))}
            </Button>
          </div>
        </fetcher.Form>
      </Modal>

      <Modal
        opened={mode === "status-change"}
        onClose={onClose}
        title={
          changesAdmin
            ? t("components.entityPage.dialogs.confirmAdminChange")
            : t("components.entityPage.dialogs.confirmStatusChange")
        }
        centered
        size="sm"
        radius="lg"
      >
        <Text className="delete-copy">
          {t("components.entityPage.dialogs.quoteOpen")}
          {selected?.[page.columns[0].key]}
          {t("components.entityPage.dialogs.quoteAction")}
          {changesAdmin
            ? nextEnabled
              ? t("components.entityPage.dialogs.confirmGrantAdmin")
              : t("components.entityPage.dialogs.confirmRevokeAdmin")
            : t("components.entityPage.dialogs.confirmStatusValue", {
                0: nextEnabled
                  ? t("components.entityPage.dialogs.activeStatus")
                  : t("components.entityPage.dialogs.inactiveStatus"),
              })}
        </Text>
        {fetcher.data?.error && (
          <Alert color="red" mt="md">
            {tMessage(fetcher.data.error)}
          </Alert>
        )}
        <fetcher.Form method="post">
          <input
            type="hidden"
            name="_intent"
            value={changesAdmin ? "toggle-admin" : "toggle-status"}
          />
          {selected && <input type="hidden" name="id" value={selected.id} />}
          <input
            type="hidden"
            name={changesAdmin ? "isAdmin" : "enabled"}
            value={String(nextEnabled)}
          />
          <div className="modal-actions">
            <Button variant="default" type="button" onClick={onClose}>
              {t("components.entityPage.dialogs.cancel")}
            </Button>
            <Button
              type="submit"
              className="primary-button"
              disabled={fetcher.state !== "idle"}
            >
              {fetcher.state !== "idle"
                ? t("components.entityPage.dialogs.changing")
                : t("components.entityPage.dialogs.applyChange")}
            </Button>
          </div>
        </fetcher.Form>
      </Modal>

      <Modal
        opened={mode === "force-logout"}
        onClose={onClose}
        title={t("components.entityPage.dialogs.confirmForceLogout")}
        centered
        size="sm"
        radius="lg"
      >
        <Text className="delete-copy">
          {t("components.entityPage.dialogs.quoteOpen")}
          {selected?.[page.columns[0].key]}
          {t("components.entityPage.dialogs.confirmEndSessions")}
        </Text>
        {fetcher.data?.error && (
          <Alert color="red" mt="md">
            {tMessage(fetcher.data.error)}
          </Alert>
        )}
        <fetcher.Form method="post">
          <input type="hidden" name="_intent" value="force-logout" />
          {selected && <input type="hidden" name="id" value={selected.id} />}
          <div className="modal-actions">
            <Button variant="default" type="button" onClick={onClose}>
              {t("components.entityPage.dialogs.cancel")}
            </Button>
            <Button
              type="submit"
              color="orange"
              disabled={fetcher.state !== "idle"}
            >
              {fetcher.state !== "idle"
                ? t("components.entityPage.dialogs.loggingOut")
                : t("components.entityPage.dialogs.forceLogout")}
            </Button>
          </div>
        </fetcher.Form>
      </Modal>

      <Modal
        opened={mode === "delete"}
        onClose={onClose}
        title={t("components.entityPage.dialogs.confirmDelete")}
        centered
        size="sm"
        radius="lg"
      >
        <Text className="delete-copy">
          {t("components.entityPage.dialogs.quoteOpen")}
          {selected?.[page.columns[0].key]}
          {t("components.entityPage.dialogs.confirmIrreversibleDelete")}
        </Text>
        {page.deleteWarning && <Text size="sm" c="orange" mt="sm">{page.deleteWarning}</Text>}
        {fetcher.data?.error && (
          <Alert color="red" mt="md">
            {tMessage(fetcher.data.error)}
          </Alert>
        )}
        <fetcher.Form method="post">
          <input type="hidden" name="_intent" value="delete" />
          {selected && <input type="hidden" name="id" value={selected.id} />}
          <div className="modal-actions">
            <Button variant="default" type="button" onClick={onClose}>
              {t("components.entityPage.dialogs.cancel")}
            </Button>
            <Button
              type="submit"
              color="red"
              disabled={fetcher.state !== "idle"}
            >
              {fetcher.state !== "idle"
                ? t("components.entityPage.dialogs.deleting")
                : t("components.entityPage.dialogs.deleteAction")}
            </Button>
          </div>
        </fetcher.Form>
      </Modal>
    </>
  );
}
