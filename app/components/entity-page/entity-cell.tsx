import { t, tMessage } from "~/i18n";
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
    if (endpoints.length === 0)
      return (
        <span className="table-text">
          {t("components.entityPage.entityCell.emptyValue")}
        </span>
      );
    return (
      <span className="table-text">
        {endpoints.length} {t("components.entityPage.entityCell.countUnit")}
      </span>
    );
  }

  if (column.presentation === "verification-status") {
    const verified = String(value) === "server.verified";
    return (
      <Badge
        className={`status-badge ${verified ? "success" : "pending"}`}
        variant="light"
        radius="sm"
        leftSection={<span className="status-dot" />}
      >
        {tMessage(String(value))}
      </Badge>
    );
  }

  if (column.presentation === "mfa-status") {
    const configured = String(value) === "server.configured";
    return (
      <Badge
        className={`status-badge ${configured ? "success" : "pending"}`}
        variant="light"
        radius="sm"
        leftSection={<span className="status-dot" />}
      >
        {tMessage(String(value))}
      </Badge>
    );
  }

  if (column.presentation === "status-toggle")
    return (
      <Group gap="xs">
        <Switch
          checked={String(value) === "server.active"}
          onChange={(event) => onStatusChange(event.currentTarget.checked)}
          aria-label={t(
            "components.entityPage.entityCell.toggleStatusAriaLabel",
            { 0: recordName },
          )}
        />
        <span className="table-text">{tMessage(String(value))}</span>
      </Group>
    );
  if (column.presentation === "admin-toggle")
    return (
      <Group gap="xs">
        <Switch
          checked={String(value) === "server.administrator"}
          disabled={disabled}
          onChange={(event) => onStatusChange(event.currentTarget.checked)}
          aria-label={t(
            "components.entityPage.entityCell.toggleAdminAriaLabel",
            { 0: recordName },
          )}
        />
        <span className="table-text">{tMessage(String(value))}</span>
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
      {value || t("components.entityPage.entityCell.emptyValue")}
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
  const active = [
    "server.active",
    "server.endpointConfigured",
    "server.configured",
  ].includes(value);
  const pending = ["server.endpointMissing", "招待中", "未接続"].includes(
    value,
  );

  return (
    <Badge
      className={`status-badge ${active ? "success" : pending ? "pending" : "muted"}`}
      variant="light"
      radius="sm"
      leftSection={<span className="status-dot" />}
    >
      {tMessage(String(value))}
    </Badge>
  );
}
