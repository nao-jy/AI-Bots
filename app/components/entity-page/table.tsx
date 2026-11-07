import { t } from "~/i18n";
import { useCallback, useState } from "react";
import { Table, TextInput } from "@mantine/core";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Form, Link } from "react-router";
import { ENTITY_PAGE_SIZE } from "../../const";
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
  onManageGrants,
}: {
  page: EntityPageDefinition;
  onEdit: (record: EntityRecord) => void;
  onDelete: (record: EntityRecord) => void;
  onForceLogout: (record: EntityRecord) => void;
  onStatusChange: (record: EntityRecord, enabled: boolean) => void;
  onManageGrants: (record: EntityRecord) => void;
}) {
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
  const shellInstances: SandboxShellInstance[] = page.tableFeatures
    ?.sandboxShell
    ? page.records.flatMap((record) =>
        parsePersistentInstances(String(record.instances ?? "[]")).map(
          (instance) => ({
            ...instance,
            sandboxId: String(record.id),
            sandboxName: String(
              record.name ?? t("components.entityPage.table.unnamedRecord"),
            ),
          }),
        ),
      )
    : [];
  const pagination = page.pagination ?? {
    ids: page.records.map((record) => String(record.id)),
    query: "",
    page: 1,
    hasNext: false,
  };
  const order = new Map(pagination.ids.map((id, index) => [id, index]));
  const visibleRecords = [...page.records].sort(
    (left, right) =>
      (order.get(String(left.id)) ?? 0) - (order.get(String(right.id)) ?? 0),
  );
  const pageUrl = (number: number) => {
    const params = new URLSearchParams();
    if (pagination.query) params.set("q", pagination.query);
    params.set("page", String(number));
    return `?${params}`;
  };
  return (
    <>
      <section className="entity-panel">
        <div className="entity-toolbar">
          <Form method="get" className="entity-search-form">
            <TextInput
              key={pagination.query}
              name="q"
              className="search-field"
              placeholder={t("components.entityPage.table.searchPlaceholder", {
                0: page.title,
              })}
              defaultValue={pagination.query}
              leftSection={<MagnifyingGlassIcon size={16} aria-hidden="true" />}
              aria-label={t("components.entityPage.table.searchAriaLabel", {
                0: page.title,
              })}
            />
            <button type="submit">
              {t("components.entityPage.table.searchButton")}
            </button>
          </Form>
          <span className="record-count">
            {page.records.length} {t("components.entityPage.table.countUnit")}
          </span>
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
                <Table.Th className="actions-header">
                  {t("components.entityPage.table.actionsLabel")}
                </Table.Th>
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
                  onStatusChange={(enabled) => onStatusChange(record, enabled)}
                  onManageGrants={() => onManageGrants(record)}
                  onOpenShell={handleOpenShell}
                  onDeleteInstance={handleDeleteInstance}
                />
              ))}
              {visibleRecords.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={page.columns.length + 1}>
                    <div className="empty-state">
                      <MagnifyingGlassIcon size={22} aria-hidden="true" />
                      <strong>
                        {t("components.entityPage.table.emptyStateTitle")}
                      </strong>
                      <small>
                        {t("components.entityPage.table.emptyStateDescription")}
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
            {t("components.entityPage.table.showingPage", {
              start: visibleRecords.length
                ? (pagination.page - 1) * ENTITY_PAGE_SIZE + 1
                : 0,
              end: visibleRecords.length
                ? (pagination.page - 1) * ENTITY_PAGE_SIZE +
                  visibleRecords.length
                : 0,
            })}
          </span>
          <nav
            className="entity-pagination"
            aria-label={t("components.entityPage.table.paginationLabel")}
          >
            {pagination.page > 1 && (
              <Link to={pageUrl(pagination.page - 1)}>
                {t("components.entityPage.table.previousPage")}
              </Link>
            )}
            <span>
              {t("components.entityPage.table.pageNumber", {
                page: pagination.page,
              })}
            </span>
            {pagination.hasNext && (
              <Link to={pageUrl(pagination.page + 1)}>
                {t("components.entityPage.table.nextPage")}
              </Link>
            )}
          </nav>
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
