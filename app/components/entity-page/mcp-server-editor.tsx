import { useState } from "react";
import {
  Button,
  Collapse,
  Group,
  MultiSelect,
  Select,
  Text,
} from "@mantine/core";
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import type { EntityOption } from "../../types/entities";

function parseAuthenticationIds(value: unknown): Record<string, string> {
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([serverId, authId]) =>
        typeof authId === "string" || typeof authId === "number"
          ? [[serverId, String(authId)]]
          : [],
      ),
    );
  } catch {
    return {};
  }
}

function getOptionLabel(
  options: string[] | EntityOption[],
  value: string,
) {
  const option = options.find((item) =>
    typeof item === "string" ? item === value : item.value === value,
  );
  return typeof option === "string" ? option : (option?.label ?? value);
}

export function McpServerEditor({
  label,
  serverOptions,
  authenticationOptions,
  initialServerIds,
  initialAuthenticationIds,
  placeholder,
}: {
  label: string;
  serverOptions: string[] | EntityOption[];
  authenticationOptions: EntityOption[];
  initialServerIds: unknown;
  initialAuthenticationIds: unknown;
  placeholder?: string;
}) {
  const [serverIds, setServerIds] = useState(() =>
    String(initialServerIds ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const [authenticationIds, setAuthenticationIds] = useState(() =>
    parseAuthenticationIds(initialAuthenticationIds),
  );
  const [expanded, setExpanded] = useState(false);
  const configuredCount = serverIds.filter(
    (serverId) => authenticationIds[serverId],
  ).length;
  const selectedAuthenticationIds = Object.fromEntries(
    serverIds.flatMap((serverId) =>
      authenticationIds[serverId]
        ? [[serverId, authenticationIds[serverId]]]
        : [],
    ),
  );

  return (
    <div>
      <MultiSelect
        label={label}
        placeholder={placeholder}
        data={serverOptions}
        value={serverIds}
        onChange={setServerIds}
        searchable
        clearable
        nothingFoundMessage="該当するオプションがありません"
      />
      <input
        type="hidden"
        name="mcpServerIds"
        value={serverIds.join(",")}
      />
      <input
        type="hidden"
        name="mcpAuthIds"
        value={JSON.stringify(selectedAuthenticationIds)}
      />
      {serverIds.length > 0 && (
        <div>
          <Button
            type="button"
            variant="subtle"
            size="sm"
            px={0}
            mt="xs"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            aria-controls="mcp-authentication-settings"
          >
            <Group gap="xs">
              {expanded ? (
                <CaretDownIcon size={16} aria-hidden="true" />
              ) : (
                <CaretRightIcon size={16} aria-hidden="true" />
              )}
              <span>
                接続ごとのOAuth認証
                {configuredCount > 0 &&
                  `（${configuredCount}件設定済み）`}
              </span>
            </Group>
          </Button>
          <Collapse
            id="mcp-authentication-settings"
            expanded={expanded}
            mt="xs"
          >
            <Text size="xs" c="dimmed" mb="sm">
              OAuth認証が必要なサーバーだけ設定してください。
            </Text>
            {serverIds.map((serverId) => (
              <Select
                key={serverId}
                label={getOptionLabel(serverOptions, serverId)}
                placeholder="使用しない"
                data={authenticationOptions}
                value={authenticationIds[serverId] ?? null}
                onChange={(authId) =>
                  setAuthenticationIds((current) => {
                    const next = { ...current };
                    if (authId === null) delete next[serverId];
                    else next[serverId] = authId;
                    return next;
                  })
                }
                searchable
                clearable
                mb="sm"
                nothingFoundMessage="該当するオプションがありません"
              />
            ))}
          </Collapse>
        </div>
      )}
    </div>
  );
}
