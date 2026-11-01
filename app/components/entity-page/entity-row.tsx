import { useState } from "react";
import { ActionIcon, Group, Table } from "@mantine/core";
import {
  CaretDownIcon,
  CaretRightIcon,
  PencilSimpleIcon,
  TerminalWindowIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import type { EntityRecord } from "../../types/entities";
import type { EntityPageDefinition } from "./types";
import { EntityCell } from "./entity-cell";
import { PublicIdDetails } from "./public-id-details";
import { SectionIcon } from "./section-icon";

export function EntityRow({
  page,
  record,
  onEdit,
  onDelete,
  onStatusChange,
  onOpenShell,
  shellOpen,
}: {
  page: EntityPageDefinition;
  record: EntityRecord;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (enabled: boolean) => void;
  onOpenShell: () => void;
  shellOpen: boolean;
}) {
  const cannotDelete = record.id === page.protectedRecordId;
  const recordName = record[page.columns[0].key];
  const supportsPublicIds = page.tableFeatures?.publicIds ?? false;
  const supportsSandboxShell = page.tableFeatures?.sandboxShell ?? false;
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
                    ? `${recordName}のシェルを${shellOpen ? "閉じる" : "開く"}`
                    : `${recordName}のパブリックIDを${expanded ? "閉じる" : "表示"}`
                }
                aria-expanded={supportsSandboxShell ? shellOpen : expanded}
                onClick={
                  supportsSandboxShell
                    ? onOpenShell
                    : () => setExpanded((current) => !current)
                }
              >
                {supportsSandboxShell ? (
                  <TerminalWindowIcon size={16} aria-hidden="true" />
                ) : expanded ? (
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
            />
          </Table.Td>
        ))}
        <Table.Td>
          <Group gap={5} justify="flex-end">
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
      {supportsPublicIds && expanded && (
        <Table.Tr className="entity-details-row">
          <Table.Td colSpan={page.columns.length + 1}>
            <PublicIdDetails
              recordId={record.id}
              publicIdsValue={record.publicIds}
              webhookEndpointsValue={record.webhooks}
              showWebhooks={page.tableFeatures?.webhookDetails ?? false}
            />
          </Table.Td>
        </Table.Tr>
      )}
    </>
  );
}
