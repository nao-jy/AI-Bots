import { useCallback, useState } from "react";
import { Table, TextInput } from "@mantine/core";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import type { EntityRecord } from "../../types/entities";
import type { EntityPageDefinition } from "./types";
import { EntityRow } from "./entity-row";
import {
  parsePersistentInstances,
  SandboxShell,
  type SandboxShellInstance,
} from "./sandbox-shell";

export function EntityTable({
  page,
  onEdit,
  onDelete,
  onForceLogout,
  onStatusChange,
}: {
  page: EntityPageDefinition;
  onEdit: (record: EntityRecord) => void;
  onDelete: (record: EntityRecord) => void;
  onForceLogout: (record: EntityRecord) => void;
  onStatusChange: (record: EntityRecord, enabled: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [shellOpen, setShellOpen] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    null,
  );
  const handleOpenShell = useCallback((instanceId: string) => {
    setSelectedInstanceId(instanceId);
    setShellOpen(true);
  }, []);
  const handleDeleteInstance = useCallback(
    (instanceId: string) => {
      if (selectedInstanceId === instanceId) {
        setSelectedInstanceId(null);
        setShellOpen(false);
      }
    },
    [selectedInstanceId],
  );
  const shellInstances: SandboxShellInstance[] = page.tableFeatures?.sandboxShell
    ? page.records.flatMap((record) =>
        parsePersistentInstances(record.instances).map((instance) => ({
          ...instance,
          sandboxId: record.id,
          sandboxName: String(record.name ?? "名称未設定"),
        })),
      )
    : [];
  const visibleRecords = page.records.filter((record) =>
    Object.entries(record)
      .filter(([key]) => key !== "instances")
      .map(([, value]) => value)
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <>
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
                  onForceLogout={() => onForceLogout(record)}
                  onStatusChange={(enabled) =>
                    onStatusChange(record, enabled)
                  }
                  onOpenShell={handleOpenShell}
                  onDeleteInstance={handleDeleteInstance}
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
            {visibleRecords.length} 件中{" "}
            <strong>1–{visibleRecords.length}</strong> 件を表示
          </span>
        </div>
      </section>
      {page.tableFeatures?.sandboxShell && shellOpen && (
        <SandboxShell
          instances={shellInstances}
          selectedInstanceId={selectedInstanceId}
          onSelectInstance={setSelectedInstanceId}
          onClose={() => setShellOpen(false)}
        />
      )}
    </>
  );
}
