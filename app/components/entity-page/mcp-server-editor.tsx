import { t, tMessage } from "~/i18n";
import { useState } from "react";
import { Button, Group, Input, Select, Stack, Text } from "@mantine/core";
import type { EntityOption } from "../../types/entities";
import Form from "@rjsf/mantine";
import validator from "@rjsf/validator-ajv8";
import type { RJSFSchema, UiSchema } from "@rjsf/utils";

type McpConnection = {
  serverId: string;
  authId: string | null;
  context: Record<string, unknown>;
};
type ContextSchema = {
  serverId: string;
  schema: RJSFSchema | null;
  error: boolean;
};

export function contextUiSchema(
  schema: RJSFSchema,
  root = schema,
  seen = new Set<string>(),
): UiSchema {
  if (schema.$ref?.startsWith("#/$defs/")) {
    const name = schema.$ref.slice("#/$defs/".length);
    const resolved = root.$defs?.[name];
    if (!resolved || typeof resolved === "boolean" || seen.has(name)) return {};
    return contextUiSchema(resolved, root, new Set([...seen, name]));
  }
  const ui: UiSchema = { "ui:submitButtonOptions": { norender: true } };
  if (
    schema.items &&
    !Array.isArray(schema.items) &&
    typeof schema.items === "object"
  ) {
    ui.items = contextUiSchema(schema.items, root, seen);
  }
  for (const [name, field] of Object.entries(schema.properties ?? {})) {
    if (typeof field === "object" && field !== null) {
      ui[name] = field.writeOnly
        ? { "ui:widget": "password" }
        : contextUiSchema(field, root, seen);
    }
  }
  return ui;
}

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
                  context:
                    "context" in connection &&
                    connection.context &&
                    typeof connection.context === "object" &&
                    !Array.isArray(connection.context)
                      ? (connection.context as Record<string, unknown>)
                      : {},
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
      context: {},
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
  contextSchemas,
}: {
  label: string;
  serverOptions: string[] | EntityOption[];
  authenticationOptions: EntityOption[];
  initialConnections: unknown;
  initialServerIds: unknown;
  initialAuthenticationIds: unknown;
  placeholder?: string;
  contextSchemas: ContextSchema[];
}) {
  const [connections, setConnections] = useState(() =>
    parseConnections(
      initialConnections,
      initialServerIds,
      initialAuthenticationIds,
    ),
  );
  const serverData = serverOptions.map((option) =>
    typeof option === "string"
      ? { label: tMessage(option), value: option }
      : { ...option, label: tMessage(option.label) },
  );
  const authenticationData = authenticationOptions.map((option) => ({
    ...option,
    label: tMessage(option.label),
  }));

  return (
    <Stack gap="sm">
      <strong className="entity-details-title">{label}</strong>
      <input
        type="hidden"
        name="mcpConnections"
        value={JSON.stringify(
          connections.filter(({ serverId }) => serverId.trim()),
        )}
      />
      {connections.map((connection, index) => (
        <Stack key={index} gap="xs">
          <Group key={index} align="flex-end" wrap="nowrap">
            <Select
              label={t(
                "components.entityPage.mcpServerEditor.serverConnectionLabel",
                { 0: index + 1 },
              )}
              placeholder={placeholder}
              data={serverData}
              value={connection.serverId || null}
              onChange={(serverId) =>
                setConnections((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index
                      ? {
                          ...item,
                          serverId: serverId ?? "",
                          context:
                            serverId === item.serverId ? item.context : {},
                        }
                      : item,
                  ),
                )
              }
              searchable
              clearable
              nothingFoundMessage={t(
                "components.entityPage.mcpServerEditor.noOptions",
              )}
              style={{ flex: 1 }}
            />
            <Select
              label={t(
                "components.entityPage.mcpServerEditor.oauthAuthenticationLabel",
              )}
              placeholder={t(
                "components.entityPage.mcpServerEditor.noOauthOption",
              )}
              data={authenticationData}
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
              nothingFoundMessage={t(
                "components.entityPage.mcpServerEditor.noOptions",
              )}
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
              {t("components.entityPage.mcpServerEditor.delete")}
            </Button>
          </Group>
          {contextSchemas.find((item) => item.serverId === connection.serverId)
            ?.error && (
            <Text size="sm" c="red">
              {t(
                "components.entityPage.mcpServerEditor.contextSchemaUnavailable",
              )}
            </Text>
          )}
          {(() => {
            const schema = contextSchemas.find(
              (item) => item.serverId === connection.serverId,
            )?.schema;
            return schema && Object.keys(schema.properties ?? {}).length > 0 ? (
              <Form
                schema={schema}
                validator={validator}
                formData={connection.context}
                onChange={({ formData }) =>
                  setConnections((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, context: formData ?? {} }
                        : item,
                    ),
                  )
                }
                liveValidate="onBlur"
                noHtml5Validate
                tagName="div"
                uiSchema={contextUiSchema(schema)}
              />
            ) : null;
          })()}
        </Stack>
      ))}
      <Button
        type="button"
        variant="light"
        size="xs"
        onClick={() =>
          setConnections((current) => [
            ...current,
            { serverId: "", authId: null, context: {} },
          ])
        }
      >
        {t("components.entityPage.mcpServerEditor.addConnection")}
      </Button>
    </Stack>
  );
}
