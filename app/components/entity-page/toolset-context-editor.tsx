import { useState } from "react";
import {
  Button,
  Collapse,
  Group,
  Input,
  Select,
  Stack,
  Text,
} from "@mantine/core";
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
    authId: {
      "ui:enumNames": authIdEnumNames,
      "ui:options": { clearable: true },
    },
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
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
  const schemaByName = new Map(
    schemas.map((toolSet) => [toolSet.name, toolSet]),
  );

  return (
    <Stack gap="sm">
      <strong className="entity-details-title">ツールセット</strong>
      <input
        type="hidden"
        name={name}
        value={JSON.stringify(
          contexts
            .filter(({ toolSetName }) => toolSetName)
            .map(({ toolSetName, context }) => ({ toolSetName, context })),
        )}
      />
      {contexts.map((instance, index) => {
        const toolSet = schemaByName.get(instance.toolSetName);
        const expanded = expandedIds.has(instance.id);
        const panelId = `toolset-context-${instance.id}`;
        return (
          <div key={instance.id}>
            <Group align="flex-end" wrap="nowrap">
              <Select
                label={`ツールセット ${index + 1}`}
                placeholder="ツールセットを選択"
                data={schemas.map(({ name: value, displayName: label }) => ({
                  value,
                  label,
                }))}
                value={instance.toolSetName || null}
                onChange={(toolSetName) =>
                  setContexts((current) =>
                    current.map((entry) =>
                      entry.id === instance.id
                        ? {
                            ...entry,
                            toolSetName: toolSetName ?? "",
                            context:
                              toolSetName === entry.toolSetName
                                ? entry.context
                                : {},
                          }
                        : entry,
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
                variant="light"
                disabled={!toolSet}
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() =>
                  setExpandedIds((current) => {
                    const next = new Set(current);
                    if (next.has(instance.id)) next.delete(instance.id);
                    else next.add(instance.id);
                    return next;
                  })
                }
              >
                {expanded ? "コンテクストを閉じる" : "コンテクストを設定"}
              </Button>
              <Button
                type="button"
                variant="subtle"
                color="red"
                onClick={() => {
                  setContexts((current) =>
                    current.filter((entry) => entry.id !== instance.id),
                  );
                  setExpandedIds((current) => {
                    const next = new Set(current);
                    next.delete(instance.id);
                    return next;
                  });
                }}
              >
                削除
              </Button>
            </Group>
            {toolSet && (
              <Collapse id={panelId} expanded={expanded}>
                <div className="toolset-context-form">
                  <Form
                    key={toolSet.name}
                    schema={toolSet.schema as RJSFSchema}
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
                    liveValidate="onBlur"
                    noHtml5Validate
                    tagName="div"
                    uiSchema={getToolSetUiSchema(toolSet.schema)}
                  />
                </div>
              </Collapse>
            )}
          </div>
        );
      })}
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
              toolSetName: "",
              context: {},
            },
          ])
        }
      >
        ＋ ツールセットを追加
      </Button>
      {schemas.length === 0 && (
        <Text size="sm" c="dimmed">
          利用可能な ToolSet がありません。
        </Text>
      )}
    </Stack>
  );
}
