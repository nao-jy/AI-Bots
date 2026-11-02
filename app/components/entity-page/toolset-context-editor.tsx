import { useState } from "react";
import { Button, Divider, Group, Stack, Text, Input } from "@mantine/core";
import Form from "@rjsf/mantine";
import type { RJSFSchema, UiSchema } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";

type ToolSetSchema = {
  name: string;
  displayName: string;
  schema: unknown;
};
type ToolSetContextEntry = {
  id: number;
  toolSetName: string;
  context: unknown;
};

function parseContexts(value: unknown): ToolSetContextEntry[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed))
      return parsed.flatMap((entry, id) =>
        entry &&
        typeof entry === "object" &&
        "toolSetName" in entry &&
        typeof entry.toolSetName === "string" &&
        "context" in entry &&
        entry.context &&
        typeof entry.context === "object" &&
        !Array.isArray(entry.context)
          ? [{ id, toolSetName: entry.toolSetName, context: entry.context }]
          : [],
      );
    if (!parsed || typeof parsed !== "object") return [];
    return Object.entries(parsed).map(([toolSetName, context], id) => ({
      id,
      toolSetName,
      context:
        context && typeof context === "object" && !Array.isArray(context)
          ? context
          : {},
    }));
  } catch {
    return [];
  }
}

const uiSchema: UiSchema = {
  "ui:submitButtonOptions": { norender: true },
};

function getToolSetUiSchema(schema: unknown): UiSchema {
  const authIdSchema = (schema as RJSFSchema).properties?.authId;
  const authIdEnumNames =
    authIdSchema && typeof authIdSchema === "object"
      ? (authIdSchema as RJSFSchema).enumNames
      : undefined;
  return {
    ...uiSchema,
    authId: { "ui:enumNames": authIdEnumNames },
  };
}

export function ToolSetContextEditor({
  name,
  schemas,
  initialValue,
}: {
  name: string;
  schemas: ToolSetSchema[];
  initialValue: unknown;
}) {
  const [contexts, setContexts] = useState(() => parseContexts(initialValue));

  return (
    <Stack gap="sm">
      <Input.Wrapper size="sm" label="ツールセット" />
      <input
        type="hidden"
        name={name}
        value={JSON.stringify(
          contexts.map(({ toolSetName, context }) => ({
            toolSetName,
            context,
          })),
        )}
      />
      {schemas.map(({ name: toolSetName, displayName, schema }) => {
        const instances = contexts.filter(
          (entry) => entry.toolSetName === toolSetName,
        );
        return (
          <div key={toolSetName}>
            <Input.Wrapper size="sm" label={displayName} />
            {instances.map((instance, index) => (
              <div className="toolset-context-form" key={instance.id}>
                <Group justify="space-between" mb="xs">
                  <Text size="xs" c="dimmed">
                    context {index + 1}
                  </Text>
                  <Button
                    type="button"
                    variant="subtle"
                    color="red"
                    size="xs"
                    onClick={() =>
                      setContexts((current) =>
                        current.filter((entry) => entry.id !== instance.id),
                      )
                    }
                  >
                    削除
                  </Button>
                </Group>
                <Form
                  schema={schema as RJSFSchema}
                  validator={validator}
                  formData={instance.context}
                  onChange={({ formData }) =>
                    setContexts((current) =>
                      current.map((entry) =>
                        entry.id === instance.id
                          ? { ...entry, context: formData ?? {} }
                          : entry,
                      ),
                    )
                  }
                  liveValidate="onChange"
                  noHtml5Validate
                  tagName="div"
                  uiSchema={getToolSetUiSchema(schema)}
                />
              </div>
            ))}
            <Button
              type="button"
              variant="light"
              size="xs"
              onClick={() =>
                setContexts((current) => [
                  ...current,
                  {
                    id: current.reduce(
                      (nextId, entry) => Math.max(nextId, entry.id + 1),
                      0,
                    ),
                    toolSetName,
                    context: {},
                  },
                ])
              }
            >
              ＋ {instances.length === 0 ? "有効にする" : "contextを追加"}
            </Button>
            <Divider mt="sm" />
          </div>
        );
      })}
      {schemas.length === 0 && (
        <Text size="sm" c="dimmed">
          利用可能な ToolSet がありません。
        </Text>
      )}
    </Stack>
  );
}
