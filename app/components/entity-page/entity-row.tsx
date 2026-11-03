import { useEffect, useState } from "react";
import { ActionIcon, Button, Group, Table, Tooltip } from "@mantine/core";
import {
  CaretDownIcon,
  CaretRightIcon,
  EnvelopeSimpleIcon,
  ArrowCounterClockwiseIcon,
  PencilSimpleIcon,
  SignOutIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useFetcher } from "react-router";
import { notifications } from "@mantine/notifications";
import type { EntityRecord } from "../../types/entities";
import type { EntityPageDefinition } from "./types";
import { EntityCell } from "./entity-cell";
import { PublicIdDetails } from "./public-id-details";
import { SectionIcon } from "./section-icon";
import {
  parsePersistentInstances,
  type PersistentInstance,
} from "./sandbox-shell";
import { SandboxInstanceDetails } from "./sandbox-instance-details";

export function EntityRow({
  page,
  record,
  onEdit,
  onDelete,
  onForceLogout,
  onStatusChange,
  onOpenShell,
  onDeleteInstance,
}: {
  page: EntityPageDefinition;
  record: EntityRecord;
  onEdit: () => void;
  onDelete: () => void;
  onForceLogout: () => void;
  onStatusChange: (enabled: boolean) => void;
  onOpenShell: (instanceId: string) => void;
  onDeleteInstance: (instanceId: string) => void;
}) {
  const cannotDelete = record.id === page.protectedRecordId;
  const recordName = record[page.columns[0].key];
  const supportsPublicIds = page.tableFeatures?.publicIds ?? false;
  const supportsSandboxShell = page.tableFeatures?.sandboxShell ?? false;
  const supportsActions = page.tableFeatures?.expandableActions ?? false;
  const hasExpandedContent =
    supportsPublicIds || supportsSandboxShell || supportsActions;
  const supportsEmailVerification =
    page.tableFeatures?.emailVerification ?? false;
  const supportsLoginUnlock = page.tableFeatures?.loginUnlock ?? false;
  const instances: PersistentInstance[] = parsePersistentInstances(
    record.instances,
  );
  const [expanded, setExpanded] = useState(false);
  const subtitle = page.tableFeatures?.subtitleKeys
    ?.map((key) => record[key])
    .find((value) => value !== undefined && value !== null && value !== "");

  const actions = supportsActions ? (
    <div className="entity-action-list">
      {page.tableFeatures?.forceLogout && (
        <Button
          variant="light"
          color="orange"
          size="xs"
          leftSection={<SignOutIcon size={15} aria-hidden="true" />}
          disabled={
            cannotDelete || record.loginStatus !== "ログイン中"
          }
          onClick={onForceLogout}
        >
          強制ログアウト
        </Button>
      )}
      {supportsEmailVerification &&
        record.emailVerification !== "検証済み" && (
          <EmailVerificationAction
            recordId={record.id}
            recordName={String(recordName ?? "")}
          />
        )}
      {page.tableFeatures?.mfaReset && record.mfaStatus === "設定済み" && (
        <MfaResetAction
          recordId={record.id}
          recordName={String(recordName ?? "")}
        />
      )}
      {supportsLoginUnlock && record.loginLockStatus === "ロック中" && (
        <LoginUnlockAction
          recordId={record.id}
          recordName={String(recordName ?? "")}
        />
      )}
    </div>
  ) : (
    <Group gap={5} justify="flex-end">
      {page.tableFeatures?.forceLogout && (
        <Tooltip
          label={
            cannotDelete
              ? "自分自身は強制ログアウトできません"
              : record.loginStatus !== "ログイン中"
                ? "このユーザーはログインしていません"
                : "すべてのセッションを終了"
          }
        >
          <span style={{ display: "inline-flex" }}>
            <ActionIcon
              variant="subtle"
              color="orange"
              aria-label={`${recordName}を強制ログアウト`}
              disabled={
                cannotDelete || record.loginStatus !== "ログイン中"
              }
              onClick={onForceLogout}
            >
              <SignOutIcon size={16} aria-hidden="true" />
            </ActionIcon>
          </span>
        </Tooltip>
      )}
      {supportsEmailVerification &&
        record.emailVerification !== "検証済み" && (
          <EmailVerificationAction
            recordId={record.id}
            recordName={String(recordName ?? "")}
          />
        )}
      {page.tableFeatures?.mfaReset && record.mfaStatus === "設定済み" && (
        <MfaResetAction
          recordId={record.id}
          recordName={String(recordName ?? "")}
        />
      )}
      {supportsLoginUnlock && record.loginLockStatus === "ロック中" && (
        <LoginUnlockAction
          recordId={record.id}
          recordName={String(recordName ?? "")}
        />
      )}
      <Tooltip label={`${recordName}を編集`}>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={`${recordName}を編集`}
          onClick={onEdit}
        >
          <PencilSimpleIcon size={16} aria-hidden="true" />
        </ActionIcon>
      </Tooltip>
      <Tooltip
        label={
          cannotDelete
            ? "自分のアカウントは削除できません"
            : `${recordName}を削除`
        }
      >
        <span style={{ display: "inline-flex" }}>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={
              cannotDelete
                ? "自分のアカウントは削除できません"
                : `${recordName}を削除`
            }
            disabled={cannotDelete}
            onClick={onDelete}
          >
            <TrashIcon size={16} aria-hidden="true" />
          </ActionIcon>
        </span>
      </Tooltip>
    </Group>
  );

  return (
    <>
      <Table.Tr>
        <Table.Td>
          <div className="entity-name-cell">
            {hasExpandedContent && (
              <Tooltip
                label={
                  supportsActions
                    ? `${recordName}の操作を${expanded ? "閉じる" : "表示"}`
                    : supportsSandboxShell
                      ? `${recordName}のPersistent Instanceを${expanded ? "閉じる" : "表示"}`
                      : `${recordName}のパブリックIDを${expanded ? "閉じる" : "表示"}`
                }
              >
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label={
                    supportsActions
                      ? `${recordName}の操作を${expanded ? "閉じる" : "表示"}`
                      : supportsSandboxShell
                        ? `${recordName}のPersistent Instanceを${expanded ? "閉じる" : "表示"}`
                        : `${recordName}のパブリックIDを${expanded ? "閉じる" : "表示"}`
                  }
                  aria-expanded={expanded}
                  onClick={() => setExpanded((current) => !current)}
                >
                  {expanded ? (
                    <CaretDownIcon size={16} aria-hidden="true" />
                  ) : (
                    <CaretRightIcon size={16} aria-hidden="true" />
                  )}
                </ActionIcon>
              </Tooltip>
            )}
            <span className={`entity-symbol ${page.icon}`}>
              <SectionIcon section={page.icon} size={17} />
            </span>
            <div>
              <strong>{recordName ?? "名称未設定"}</strong>
              {subtitle != null && <small>{String(subtitle)}</small>}
            </div>
          </div>
        </Table.Td>
        {page.columns.slice(1).map((column) => (
          <Table.Td key={column.key}>
            <EntityCell
              column={column}
              recordName={String(recordName ?? "")}
              value={record[column.key]}
              onStatusChange={onStatusChange}
              disabled={
                column.presentation === "admin-toggle" &&
                record.id === page.protectedRecordId
              }
            />
          </Table.Td>
        ))}
        <Table.Td>
          {supportsActions ? (
            <Group gap={5} justify="flex-end">
              <Tooltip label={`${recordName}を編集`}>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label={`${recordName}を編集`}
                  onClick={onEdit}
                >
                  <PencilSimpleIcon size={16} aria-hidden="true" />
                </ActionIcon>
              </Tooltip>
              <Tooltip
                label={
                  cannotDelete
                    ? "自分のアカウントは削除できません"
                    : `${recordName}を削除`
                }
              >
                <span style={{ display: "inline-flex" }}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label={
                      cannotDelete
                        ? "自分のアカウントは削除できません"
                        : `${recordName}を削除`
                    }
                    disabled={cannotDelete}
                    onClick={onDelete}
                  >
                    <TrashIcon size={16} aria-hidden="true" />
                  </ActionIcon>
                </span>
              </Tooltip>
            </Group>
          ) : (
            actions
          )}
        </Table.Td>
      </Table.Tr>
      {hasExpandedContent && expanded && (
        <Table.Tr className="entity-details-row">
          <Table.Td colSpan={page.columns.length + 1}>
            <div className="entity-details">
              {supportsPublicIds && (
                <PublicIdDetails
                  recordId={record.id}
                  publicIdsValue={record.publicIds}
                  webhookEndpointsValue={record.webhooks}
                  showWebhooks={page.tableFeatures?.webhookDetails ?? false}
                />
              )}
              {supportsSandboxShell && (
                <SandboxInstanceDetails
                  sandboxId={record.id}
                  instances={instances}
                  onOpenShell={onOpenShell}
                  onDeleted={onDeleteInstance}
                />
              )}
              {supportsActions && (
                <>
                  <strong className="entity-details-title">操作</strong>
                  {actions}
                </>
              )}
            </div>
          </Table.Td>
        </Table.Tr>
      )}
    </>
  );
}

function EmailVerificationAction({
  recordId,
  recordName,
}: {
  recordId: number;
  recordName: string;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();

  useEffect(() => {
    if (fetcher.data?.error) {
      notifications.show({
        title: "検証メールの送信に失敗しました",
        message: fetcher.data.error,
        color: "red",
      });
    } else if (fetcher.data?.ok) {
      notifications.show({
        title: "検証メールを送信しました",
        message: `${recordName}宛に検証メールを送信しました。`,
        color: "green",
      });
    }
  }, [fetcher.data, recordName]);

  return (
    <>
      <fetcher.Form method="post" action="/users">
        <input type="hidden" name="_intent" value="send-verification" />
        <input type="hidden" name="id" value={recordId} />
        <Button
          variant="light"
          color="blue"
          size="xs"
          type="submit"
          leftSection={<EnvelopeSimpleIcon size={15} aria-hidden="true" />}
          disabled={fetcher.state !== "idle"}
        >
          検証メールを再送
        </Button>
      </fetcher.Form>
    </>
  );
}

function MfaResetAction({
  recordId,
  recordName,
}: {
  recordId: number;
  recordName: string;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();

  useEffect(() => {
    if (fetcher.data?.error) {
      notifications.show({
        title: "MFAをリセットできませんでした",
        message: fetcher.data.error,
        color: "red",
      });
    } else if (fetcher.data?.ok) {
      notifications.show({
        title: "MFAをリセットしました",
        message: `${recordName}のMFA設定をリセットしました。`,
        color: "green",
      });
    }
  }, [fetcher.data, recordName]);

  return (
    <>
      <fetcher.Form
        method="post"
        action="/users"
        onSubmit={(event) => {
          if (!window.confirm(`${recordName}のMFA設定をリセットしますか？`))
            event.preventDefault();
        }}
      >
        <input type="hidden" name="_intent" value="reset-mfa" />
        <input type="hidden" name="id" value={recordId} />
        <Button
          variant="light"
          color="orange"
          size="xs"
          type="submit"
          leftSection={
            <ArrowCounterClockwiseIcon size={15} aria-hidden="true" />
          }
          disabled={fetcher.state !== "idle"}
        >
          MFAをリセット
        </Button>
      </fetcher.Form>
    </>
  );
}

function LoginUnlockAction({
  recordId,
  recordName,
}: {
  recordId: number;
  recordName: string;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();

  useEffect(() => {
    if (fetcher.data?.error) {
      notifications.show({
        title: "ログインロックを解除できませんでした",
        message: fetcher.data.error,
        color: "red",
      });
    } else if (fetcher.data?.ok) {
      notifications.show({
        title: "ログインロックを解除しました",
        message: `${recordName}がログインできるようになりました。`,
        color: "green",
      });
    }
  }, [fetcher.data, recordName]);

  return (
    <>
      <fetcher.Form method="post" action="/users">
        <input type="hidden" name="_intent" value="unlock-login" />
        <input type="hidden" name="id" value={recordId} />
        <Button
          variant="light"
          color="blue"
          size="xs"
          type="submit"
          leftSection={
            <ArrowCounterClockwiseIcon size={15} aria-hidden="true" />
          }
          disabled={fetcher.state !== "idle"}
        >
          ログインロックを解除
        </Button>
      </fetcher.Form>
    </>
  );
}
