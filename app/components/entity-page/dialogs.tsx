import { useEffect } from "react";
import {
  Alert,
  Button,
  Modal,
  MultiSelect,
  PasswordInput,
  Select,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { useFetcher } from "react-router";
import type { EntityRecord } from "../../types/entities";
import type { EntityDialogMode, EntityPageDefinition } from "./types";

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
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) onClose();
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
            value={mode === "edit" ? "update" : "create"}
          />
          {selected && <input type="hidden" name="id" value={selected.id} />}
          <Text className="modal-intro">
            {page.description} 必要な情報を入力してください。
          </Text>
          {fetcher.data?.error && (
            <Alert color="red" mb="md">
              {fetcher.data.error}
            </Alert>
          )}
          <div className="form-grid">
            {page.fields.map((field) => (
              <div className={field.wide ? "field-wide" : ""} key={field.key}>
                {field.type === "textarea" ? (
                  <Textarea
                    name={field.key}
                    label={field.label}
                    placeholder={field.placeholder}
                    minRows={3}
                    defaultValue={String(selected?.[field.key] ?? "")}
                  />
                ) : field.type === "select" ? (
                  <Select
                    name={field.key}
                    label={field.label}
                    placeholder={field.placeholder ?? "選択してください"}
                    data={field.options ?? []}
                    defaultValue={String(selected?.[field.key] ?? "") || null}
                    clearable={field.key === "agentId"}
                  />
                ) : field.type === "multiselect" ? (
                  <MultiSelect
                    name={field.key}
                    label={field.label}
                    placeholder={field.placeholder ?? "選択してください"}
                    data={field.options ?? []}
                    defaultValue={String(selected?.[field.key] ?? "")
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean)}
                    hiddenInputValuesDivider=", "
                    searchable
                    clearable
                    nothingFoundMessage="該当するアダプタがありません"
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
                    type={field.type === "email" ? "email" : "text"}
                    label={field.label}
                    placeholder={field.placeholder}
                    defaultValue={String(selected?.[field.key] ?? "")}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="modal-actions">
            <Button variant="default" type="button" onClick={onClose}>
              キャンセル
            </Button>
            <Button
              type="submit"
              className="primary-button"
              disabled={fetcher.state !== "idle"}
            >
              {fetcher.state !== "idle"
                ? "保存中..."
                : mode === "edit"
                  ? "変更を保存"
                  : "作成する"}
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
            <Button type="submit" className="primary-button" disabled={fetcher.state !== "idle"}>
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
          「{selected?.[page.columns[0].key]}」を削除します。この操作は取り消せません。
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
