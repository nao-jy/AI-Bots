import { Badge, Group, Switch } from "@mantine/core";
import type { EntityColumn } from "./types";

export function EntityCell({
  column,
  recordName,
  value,
  onStatusChange,
  disabled = false,
}: {
  column: EntityColumn;
  recordName: string | number;
  value: string | number;
  onStatusChange: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  if (column.presentation === "webhook-count") {
    const endpoints = parseWebhookEndpoints(value);
    if (endpoints.length === 0) return <span className="table-text">—</span>;
    return <span className="table-text">{endpoints.length} 件</span>;
  }

  if (column.presentation === "status-toggle")
    return (
      <Group gap="xs">
        <Switch
          checked={String(value) === "稼働中"}
          onChange={(event) => onStatusChange(event.currentTarget.checked)}
          aria-label={`${recordName}の稼働状態を変更`}
        />
        <span className="table-text">{value}</span>
      </Group>
    );
  if (column.presentation === "admin-toggle")
    return (
      <Group gap="xs">
        <Switch
          checked={String(value) === "管理者"}
          disabled={disabled}
          onChange={(event) => onStatusChange(event.currentTarget.checked)}
          aria-label={`${recordName}の管理者権限を変更`}
        />
        <span className="table-text">{value}</span>
      </Group>
    );
  if (column.key === "status") return <Status value={String(value ?? "")} />;
  if (column.key === "provider") {
    const provider = String(value ?? "");
    return (
      <span className="provider-pill">
        <span className="provider-dot">{provider.slice(0, 1)}</span>
        {provider}
      </span>
    );
  }

  return (
    <span className={column.key === "endpoint" ? "mono" : "table-text"}>
      {value || "—"}
    </span>
  );
}

function parseWebhookEndpoints(value: string | number) {
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

function Status({ value }: { value: string }) {
  const active = ["稼働中", "接続済み", "接続先登録済み", "有効"].includes(
    value,
  );
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
