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
import type { EntityRecord } from "../../types/entities";
import type { EntityDialogMode, EntityPageDefinition } from "./types";
import { InfoIcon } from "@phosphor-icons/react";
import { ToolSetContextEditor } from "./toolset-context-editor";
import { McpServerEditor } from "./mcp-server-editor";
import { CronScheduleEditor } from "./cron-schedule-editor";
import { ScheduleTargetsEditor } from "./schedule-targets-editor";

type KeyValuePair = { key: string; value: string };

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
            aria-label={`${label}のキー ${index + 1}`}
            placeholder="キー"
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
            aria-label={`${label}の値 ${index + 1}`}
            placeholder="値"
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
            aria-label={`${label}の行 ${index + 1} を削除`}
          >
            削除
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
        ＋ ペアを追加
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
  mode,
  selected,
  nextEnabled,
  onClose,
}: {
  page: EntityPageDefinition;
  mode: EntityDialogMode;
  selected: EntityRecord | null;
  nextEnabled: boolean;
  onClose: () => void;
}) {
  const canTest = ["adapters", "agents", "mcp"].includes(page.icon);
  const fetcher = useFetcher<{
    ok?: boolean;
    error?: string;
    message?: string;
    intent?: string;
  }>();

  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data?.ok &&
      !fetcher.data.message &&
      fetcher.data.intent !== "test"
    )
      onClose();
  }, [fetcher.state, fetcher.data, onClose]);

  return (
    <>
      <Modal
        opened={mode === "create" || mode === "edit"}
        onClose={onClose}
        title={
          <div>
            <Text className="modal-kicker">
              {mode === "edit" ? "設定を更新" : "新しい設定"}
            </Text>
            <Title order={3}>
              {mode === "edit" ? `${page.title}を編集` : `${page.title}を作成`}
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
        <fetcher.Form method="post" key={`${mode}-${selected?.id ?? "new"}`}>
          <input
            type="hidden"
            name="_intent"
            value={mode === "edit" ? "update" : (page.createIntent ?? "create")}
          />
          {selected && <input type="hidden" name="id" value={selected.id} />}
          <Text className="modal-intro">
            {page.description} 必要な情報を入力してください。
          </Text>
          {(fetcher.data?.error || fetcher.data?.message) && (
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
              {fetcher.data.message ?? fetcher.data.error}
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
                  ) : field.type === "select" ? (
                    <Select
                      name={field.key}
                      label={field.label}
                      placeholder={field.placeholder ?? "選択してください"}
                      data={field.options ?? []}
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
                      placeholder={field.placeholder ?? "選択してください"}
                      data={field.options ?? []}
                      required={field.required}
                      defaultValue={String(selected?.[field.key] ?? "")
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean)}
                      hiddenInputValuesDivider=", "
                      searchable
                      clearable
                      nothingFoundMessage="該当するオプションがありません"
                    />
                  ) : field.type === "password" ? (
                    <PasswordInput
                      name={field.key}
                      label={field.label}
                      placeholder={field.placeholder}
                      autoComplete="new-password"
                      required={field.required && mode === "create"}
                    />
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
                      {field.help.text}{" "}
                      <Anchor
                        href={field.help.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {field.help.linkText}
                      </Anchor>
                    </Text>
                  )}
                </div>
              ))}
          </div>
          <div className="modal-actions">
            <Button variant="default" type="button" onClick={onClose}>
              キャンセル
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
                  ? "テスト中..."
                  : "テスト"}
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
                  fetcher.submit(data, { method: "post" });
                }}
              >
                {page.launchLabel ?? "認証を開始"}
              </Button>
            )}
            <Button
              type="submit"
              className="primary-button"
              disabled={fetcher.state !== "idle"}
            >
              {fetcher.state !== "idle"
                ? "保存中..."
                : mode === "edit"
                  ? "変更を保存"
                  : (page.createSubmitLabel ?? "作成する")}
            </Button>
          </div>
        </fetcher.Form>
      </Modal>

      <Modal
        opened={mode === "status-change"}
        onClose={onClose}
        title="ステータス変更の確認"
        centered
        size="sm"
        radius="lg"
      >
        <Text className="delete-copy">
          「{selected?.[page.columns[0].key]}」を
          {nextEnabled ? "稼働中" : "停止中"}に変更しますか？
        </Text>
        {fetcher.data?.error && (
          <Alert color="red" mt="md">
            {fetcher.data.error}
          </Alert>
        )}
        <fetcher.Form method="post">
          <input type="hidden" name="_intent" value="toggle-status" />
          {selected && <input type="hidden" name="id" value={selected.id} />}
          <input type="hidden" name="enabled" value={String(nextEnabled)} />
          <div className="modal-actions">
            <Button variant="default" type="button" onClick={onClose}>
              キャンセル
            </Button>
            <Button
              type="submit"
              className="primary-button"
              disabled={fetcher.state !== "idle"}
            >
              {fetcher.state !== "idle" ? "変更中..." : "変更する"}
            </Button>
          </div>
        </fetcher.Form>
      </Modal>

      <Modal
        opened={mode === "delete"}
        onClose={onClose}
        title="削除の確認"
        centered
        size="sm"
        radius="lg"
      >
        <Text className="delete-copy">
          「{selected?.[page.columns[0].key]}
          」を削除します。この操作は取り消せません。
        </Text>
        {fetcher.data?.error && (
          <Alert color="red" mt="md">
            {fetcher.data.error}
          </Alert>
        )}
        <fetcher.Form method="post">
          <input type="hidden" name="_intent" value="delete" />
          {selected && <input type="hidden" name="id" value={selected.id} />}
          <div className="modal-actions">
            <Button variant="default" type="button" onClick={onClose}>
              キャンセル
            </Button>
            <Button
              type="submit"
              color="red"
              disabled={fetcher.state !== "idle"}
            >
              {fetcher.state !== "idle" ? "削除中..." : "削除する"}
            </Button>
          </div>
        </fetcher.Form>
      </Modal>
    </>
  );
}
