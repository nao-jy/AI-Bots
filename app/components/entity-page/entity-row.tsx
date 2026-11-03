import { useState } from "react";
import { ActionIcon, Group, Table, Text } from "@mantine/core";
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
  const supportsEmailVerification =
    page.tableFeatures?.emailVerification ?? false;
  const instances: PersistentInstance[] = parsePersistentInstances(
    record.instances,
  );
  const [expanded, setExpanded] = useState(false);
  const subtitle = page.tableFeatures?.subtitleKeys
    ?.map((key) => record[key])
    .find((value) => value !== undefined && value !== null && value !== "");

  return (
    <>
      <Table.Tr>
        <Table.Td>
          <div className="entity-name-cell">
            {(supportsPublicIds || supportsSandboxShell) && (
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label={
                  supportsSandboxShell
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
          <Group gap={5} justify="flex-end">
            {page.tableFeatures?.forceLogout && (
              <ActionIcon
                variant="subtle"
                color="orange"
                aria-label={
                  cannotDelete
                    ? "自分自身は強制ログアウトできません"
                    : `${recordName}を強制ログアウト`
                }
                title={
                  cannotDelete
                    ? "自分自身は強制ログアウトできません"
                    : record.loginStatus !== "ログイン中"
                      ? "このユーザーはログインしていません"
                      : "すべてのセッションを終了"
                }
                disabled={
                  cannotDelete || record.loginStatus !== "ログイン中"
                }
                onClick={onForceLogout}
              >
                <SignOutIcon size={16} aria-hidden="true" />
              </ActionIcon>
            )}
            {supportsEmailVerification &&
              record.emailVerification !== "検証済み" && (
                <EmailVerificationAction
                  recordId={record.id}
                  recordName={String(recordName ?? "")}
                />
              )}
            {page.tableFeatures?.mfaReset &&
              record.mfaStatus === "設定済み" && (
                <MfaResetAction
                  recordId={record.id}
                  recordName={String(recordName ?? "")}
                />
              )}
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label={`${recordName}を編集`}
              onClick={onEdit}
            >
              <PencilSimpleIcon size={16} aria-hidden="true" />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label={
                cannotDelete
                  ? "自分のアカウントは削除できません"
                  : `${recordName}を削除`
              }
              title={
                cannotDelete ? "自分のアカウントは削除できません" : undefined
              }
              disabled={cannotDelete}
              onClick={onDelete}
            >
              <TrashIcon size={16} aria-hidden="true" />
            </ActionIcon>
          </Group>
        </Table.Td>
      </Table.Tr>
      {((supportsPublicIds || supportsSandboxShell) && expanded) && (
        <Table.Tr className="entity-details-row">
          <Table.Td colSpan={page.columns.length + 1}>
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

  return (
    <>
      <fetcher.Form method="post" action="/users">
        <input type="hidden" name="_intent" value="send-verification" />
        <input type="hidden" name="id" value={recordId} />
        <ActionIcon
          variant="subtle"
          color="blue"
          type="submit"
          aria-label={`${recordName}に検証メールを送信`}
          title="検証メールを送信"
          disabled={fetcher.state !== "idle"}
        >
          <EnvelopeSimpleIcon size={16} aria-hidden="true" />
        </ActionIcon>
      </fetcher.Form>
      {fetcher.data?.error && (
        <Text c="red" size="xs" role="alert">
          {fetcher.data.error}
        </Text>
      )}
      {fetcher.data?.ok && (
        <Text c="green" size="xs" role="status">
          検証メールを送信しました。
        </Text>
      )}
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
        <ActionIcon
          variant="subtle"
          color="orange"
          type="submit"
          aria-label={`${recordName}のMFAをリセット`}
          title="MFAをリセット"
          disabled={fetcher.state !== "idle"}
        >
          <ArrowCounterClockwiseIcon size={16} aria-hidden="true" />
        </ActionIcon>
      </fetcher.Form>
      {fetcher.data?.error && (
        <Text c="red" size="xs" role="alert">
          {fetcher.data.error}
        </Text>
      )}
      {fetcher.data?.ok && (
        <Text c="green" size="xs" role="status">
          MFAをリセットしました。
        </Text>
      )}
    </>
  );
}
