import { useState } from "react";
import { ActionIcon, Badge, Group, Switch, Table, TextInput } from "@mantine/core";
import {
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import type { EntityRecord } from "../../types/entities";
import type { EntityPageDefinition } from "./types";
import { SectionIcon } from "./section-icon";

export function EntityTable({
  page,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  page: EntityPageDefinition;
  onEdit: (record: EntityRecord) => void;
  onDelete: (record: EntityRecord) => void;
  onStatusChange: (record: EntityRecord, enabled: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const visibleRecords = page.records.filter((record) =>
    Object.values(record).join(" ").toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <section className="entity-panel">
      <div className="entity-toolbar">
        <TextInput
          className="search-field"
          placeholder={`${page.title}を検索...`}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          leftSection={<MagnifyingGlassIcon size={16} aria-hidden="true" />}
          aria-label={`${page.title}を検索`}
        />
        <span className="record-count">{page.records.length} 件</span>
      </div>

      <div className="table-wrap">
        <Table
          className="entity-table"
          verticalSpacing="md"
          horizontalSpacing="md"
        >
          <Table.Thead>
            <Table.Tr>
              {page.columns.map((column) => (
                <Table.Th key={column.key}>{column.label}</Table.Th>
              ))}
              <Table.Th className="actions-header">操作</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visibleRecords.map((record) => (
              <EntityRow
                key={record.id}
                page={page}
                record={record}
                onEdit={() => onEdit(record)}
                onDelete={() => onDelete(record)}
                onStatusChange={(enabled) => onStatusChange(record, enabled)}
              />
            ))}
            {visibleRecords.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={page.columns.length + 1}>
                  <div className="empty-state">
                    <MagnifyingGlassIcon size={22} aria-hidden="true" />
                    <strong>該当するデータがありません</strong>
                    <small>
                      検索条件を変えるか、新しく作成してください。
                    </small>
                  </div>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </div>
      <div className="table-footer">
        <span>
          {visibleRecords.length} 件中 <strong>1–{visibleRecords.length}</strong> 件を表示
        </span>
      </div>
    </section>
  );
}

function EntityRow({
  page,
  record,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  page: EntityPageDefinition;
  record: EntityRecord;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (enabled: boolean) => void;
}) {
  const cannotDelete = record.id === page.protectedRecordId;
  const recordName = record[page.columns[0].key];

  return (
    <Table.Tr>
      <Table.Td>
        <div className="entity-name-cell">
          <span className={`entity-symbol ${page.icon}`}>
            <SectionIcon section={page.icon} size={17} />
          </span>
          <div>
            <strong>{recordName ?? "名称未設定"}</strong>
            {(page.icon === "bots" || page.icon === "mcp") && (
              <small>{record.description ?? record.endpoint ?? ""}</small>
            )}
          </div>
        </div>
      </Table.Td>
      {page.columns.slice(1).map((column) => (
        <Table.Td key={column.key}>
          <EntityCell
            page={page}
            record={record}
            columnKey={column.key}
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
              cannotDelete ? "自分のアカウントは削除できません" : `${recordName}を削除`
            }
            title={cannotDelete ? "自分のアカウントは削除できません" : undefined}
            disabled={cannotDelete}
            onClick={onDelete}
          >
            <TrashIcon size={16} aria-hidden="true" />
          </ActionIcon>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

function EntityCell({
  page,
  record,
  columnKey,
  value,
  onStatusChange,
}: {
  page: EntityPageDefinition;
  record: EntityRecord;
  columnKey: string;
  value: string | number;
  onStatusChange: (enabled: boolean) => void;
}) {
  if (columnKey === "status" && page.icon === "bots")
    return (
      <Group gap="xs">
        <Switch
          checked={String(value) === "稼働中"}
          onChange={(event) => onStatusChange(event.currentTarget.checked)}
          aria-label={`${record[page.columns[0].key]}の稼働状態を変更`}
        />
        <span className="table-text">{value}</span>
      </Group>
    );
  if (columnKey === "status") return <Status value={String(value ?? "")} />;
  if (columnKey === "provider") {
    const provider = String(value ?? "");
    return (
      <span className="provider-pill">
        <span className="provider-dot">{provider.slice(0, 1)}</span>
        {provider}
      </span>
    );
  }

  return (
    <span className={columnKey === "endpoint" ? "mono" : "table-text"}>
      {value || "—"}
    </span>
  );
}

function Status({ value }: { value: string }) {
  const active = ["稼働中", "接続済み", "接続先登録済み", "有効"].includes(value);
  const pending = ["招待中", "未接続", "接続先未設定"].includes(value);

  return (
    <Badge
      className={`status-badge ${active ? "success" : pending ? "pending" : "muted"}`}
      variant="light"
      radius="sm"
      leftSection={<span className="status-dot" />}
    >
      {value}
    </Badge>
  );
}
