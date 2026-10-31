import { useState } from "react";
import { useFetcher } from "react-router";
import {
  ActionIcon,
  Badge,
  CopyButton,
  Group,
  Switch,
  Table,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CaretRightIcon,
  CheckIcon,
  CopySimpleIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import type { EntityRecord, PublicIdSlot } from "../../types/entities";
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
  const fetcher = useFetcher();
  const cannotDelete = record.id === page.protectedRecordId;
  const recordName = record[page.columns[0].key];
  const supportsPublicIdRegeneration =
    page.icon === "bots" || page.icon === "adapters";
  const [expanded, setExpanded] = useState(false);
  const publicIds = parsePublicIds(record.publicIds);
  const webhookEndpoints =
    page.icon === "bots" ? parseWebhookEndpoints(record.webhooks) : [];

  return (
    <>
      <Table.Tr>
        <Table.Td>
          <div className="entity-name-cell">
            {supportsPublicIdRegeneration && (
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label={`${recordName}のパブリックIDを${expanded ? "閉じる" : "表示"}`}
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
      {supportsPublicIdRegeneration && expanded && (
        <Table.Tr className="entity-details-row">
          <Table.Td colSpan={page.columns.length + 1}>
            <div className="entity-details">
              <strong className="entity-details-title">パブリックID</strong>
              <div className="public-id-grid">
                {(["first", "second"] as const).map((slot, index) => {
                  const publicId = publicIds.find((item) => item.slot === slot)?.id;
                  return (
                    <div className="public-id-card" key={slot}>
                      <div className="public-id-label">{index + 1}つ目</div>
                      <div className="public-id-value">
                        <code>{publicId ?? "未発行"}</code>
                        {publicId && (
                          <CopyButton value={publicId} timeout={1500}>
                            {({ copied, copy }) => (
                              <Tooltip label={copied ? "コピーしました" : "IDをコピー"}>
                                <ActionIcon
                                  variant="subtle"
                                  color={copied ? "teal" : "gray"}
                                  aria-label={`${index + 1}つ目のパブリックIDをコピー`}
                                  onClick={copy}
                                >
                                  {copied ? (
                                    <CheckIcon size={15} />
                                  ) : (
                                    <CopySimpleIcon size={15} />
                                  )}
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </CopyButton>
                        )}
                      </div>
                      <fetcher.Form method="post">
                        <input
                          type="hidden"
                          name="_intent"
                          value="regenerate-public-ids"
                        />
                        <input type="hidden" name="id" value={record.id} />
                        <input type="hidden" name="slot" value={slot} />
                        <button
                          className="public-id-regenerate"
                          type="submit"
                          disabled={fetcher.state !== "idle"}
                          onClick={(event) => {
                            if (
                              !window.confirm(
                                `${index + 1}つ目のパブリックIDを再生成すると、このIDを使うWebhook URLは使えなくなります。続けますか？`,
                              )
                            ) {
                              event.preventDefault();
                            }
                          }}
                        >
                          <ArrowsClockwiseIcon size={15} aria-hidden="true" />
                          {index + 1}つ目を再生成
                        </button>
                      </fetcher.Form>
                    </div>
                  );
                })}
              </div>
              {fetcher.data?.error && (
                <span className="public-id-error" role="alert">
                  {fetcher.data.error}
                </span>
              )}
              {page.icon === "bots" && (
                <div className="webhook-details">
                  <strong className="entity-details-title">Webhook URL</strong>
                  {webhookEndpoints.length > 0 ? (
                    <div className="webhook-endpoints">
                      {webhookEndpoints.map(({ adapterName, url }) => (
                        <div
                          className="webhook-endpoint"
                          key={`${adapterName}-${url}`}
                        >
                          <span className="webhook-adapter-name">{adapterName}</span>
                          <code>{url}</code>
                          <CopyButton value={url} timeout={1500}>
                            {({ copied, copy }) => (
                              <Tooltip label={copied ? "コピーしました" : "URLをコピー"}>
                                <ActionIcon
                                  variant="subtle"
                                  color={copied ? "teal" : "gray"}
                                  aria-label={`${adapterName} の Webhook URL をコピー`}
                                  onClick={copy}
                                >
                                  {copied ? (
                                    <CheckIcon size={15} />
                                  ) : (
                                    <CopySimpleIcon size={15} />
                                  )}
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </CopyButton>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="table-text">Webhook URLはありません</span>
                  )}
                </div>
              )}
            </div>
          </Table.Td>
        </Table.Tr>
      )}
    </>
  );
}

function parsePublicIds(value: string | number | undefined) {
  try {
    const parsed: unknown = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is { slot: PublicIdSlot; id: string } =>
        item &&
        typeof item === "object" &&
        (item.slot === "first" || item.slot === "second") &&
        typeof item.id === "string",
    );
  } catch {
    return [];
  }
}

function parseWebhookEndpoints(value: string | number | undefined) {
  try {
    const parsed: unknown = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is { adapterName: string; url: string } =>
        item &&
        typeof item === "object" &&
        typeof item.adapterName === "string" &&
        typeof item.url === "string",
    );
  } catch {
    return [];
  }
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
  if (columnKey === "webhooks" && page.icon === "bots") {
    const endpoints = parseWebhookEndpoints(value);
    if (endpoints.length === 0) return <span className="table-text">—</span>;
    return <span className="table-text">{endpoints.length} 件（展開）</span>;
  }

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
