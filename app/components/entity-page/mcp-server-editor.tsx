import { useState } from "react";
import { Button, Group, Select, Stack, Text } from "@mantine/core";
import type { EntityOption } from "../../types/entities";

type McpConnection = { serverId: string; authId: string | null };

function parseConnections(
  initialConnections: unknown,
  initialServerIds: unknown,
  initialAuthenticationIds: unknown,
): McpConnection[] {
  if (typeof initialConnections === "string" && initialConnections) {
    try {
      const parsed: unknown = JSON.parse(initialConnections);
      if (Array.isArray(parsed))
        return parsed.flatMap((connection) =>
          connection &&
          typeof connection === "object" &&
          "serverId" in connection &&
          (typeof connection.serverId === "string" ||
            typeof connection.serverId === "number") &&
          ("authId" in connection
            ? connection.authId === null ||
              typeof connection.authId === "string" ||
              typeof connection.authId === "number"
            : true)
            ? [
                {
                  serverId: String(connection.serverId),
                  authId:
                    connection.authId === null ||
                    connection.authId === undefined
                      ? null
                      : String(connection.authId),
                },
              ]
            : [],
        );
    } catch {
      return [];
    }
  }

  const authenticationIds: Record<string, string> = {};
  if (typeof initialAuthenticationIds === "string") {
    try {
      const parsed: unknown = JSON.parse(initialAuthenticationIds);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        for (const [serverId, authId] of Object.entries(parsed))
          if (typeof authId === "string" || typeof authId === "number")
            authenticationIds[serverId] = String(authId);
    } catch {
      // Older records use server IDs and authentication IDs as separate fields.
    }
  }

  return String(initialServerIds ?? "")
    .split(",")
    .map((serverId) => serverId.trim())
    .filter(Boolean)
    .map((serverId) => ({
      serverId,
      authId: authenticationIds[serverId] ?? null,
    }));
}

export function McpServerEditor({
  label,
  serverOptions,
  authenticationOptions,
  initialConnections,
  initialServerIds,
  initialAuthenticationIds,
  placeholder,
}: {
  label: string;
  serverOptions: string[] | EntityOption[];
  authenticationOptions: EntityOption[];
  initialConnections: unknown;
  initialServerIds: unknown;
  initialAuthenticationIds: unknown;
  placeholder?: string;
}) {
  const [connections, setConnections] = useState(() =>
    parseConnections(
      initialConnections,
      initialServerIds,
      initialAuthenticationIds,
    ),
  );
  const serverData = serverOptions.map((option) =>
    typeof option === "string" ? { label: option, value: option } : option,
  );

  return (
    <Stack gap="sm">
      <Text size="sm" fw={500}>
        {label}
      </Text>
      <input
        type="hidden"
        name="mcpConnections"
        value={JSON.stringify(
          connections.filter(({ serverId }) => serverId.trim()),
        )}
      />
      {connections.map((connection, index) => (
        <Group key={index} align="flex-end" wrap="nowrap">
          <Select
            label={`接続 ${index + 1} のMCPサーバー`}
            placeholder={placeholder}
            data={serverData}
            value={connection.serverId || null}
            onChange={(serverId) =>
              setConnections((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, serverId: serverId ?? "" }
                    : item,
                ),
              )
            }
            searchable
            clearable
            nothingFoundMessage="該当するオプションがありません"
            style={{ flex: 1 }}
          />
          <Select
            label="OAuth認証"
            placeholder="使用しない"
            data={authenticationOptions}
            value={connection.authId}
            onChange={(authId) =>
              setConnections((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, authId } : item,
                ),
              )
            }
            searchable
            clearable
            nothingFoundMessage="該当するオプションがありません"
            style={{ flex: 1 }}
          />
          <Button
            type="button"
            variant="subtle"
            color="red"
            onClick={() =>
              setConnections((current) =>
                current.filter((_, itemIndex) => itemIndex !== index),
              )
            }
          >
            削除
          </Button>
        </Group>
      ))}
      <Button
        type="button"
        variant="light"
        size="xs"
        onClick={() =>
          setConnections((current) => [
            ...current,
            { serverId: "", authId: null },
          ])
        }
      >
        ＋ 接続を追加
      </Button>
    </Stack>
  );
}
