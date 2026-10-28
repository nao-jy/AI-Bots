import { useState } from "react";
import { Divider, Stack, Switch, Text } from "@mantine/core";
import Form from "@rjsf/mantine";
import type { RJSFSchema, UiSchema } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";

type ToolSetSchema = { name: string; schema: unknown };

function parseContexts(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

const uiSchema: UiSchema = {
  "ui:submitButtonOptions": { norender: true },
};

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

  function setEnabled(toolSetName: string, enabled: boolean) {
    setContexts((current) => {
      const next = { ...current };
      if (enabled) next[toolSetName] ??= {};
      else delete next[toolSetName];
      return next;
    });
  }

  return (
    <Stack gap="sm">
      <Text size="sm" fw={500}>ToolSet context</Text>
      <input type="hidden" name={name} value={JSON.stringify(contexts)} />
      {schemas.map(({ name: toolSetName, schema }) => {
        const enabled = Object.hasOwn(contexts, toolSetName);
        return (
          <div key={toolSetName}>
            <Switch
              label={`${toolSetName} を有効にする`}
              checked={enabled}
              onChange={(event) => setEnabled(toolSetName, event.currentTarget.checked)}
            />
            {enabled && (
              <div className="toolset-context-form">
                <Form
                  schema={schema as RJSFSchema}
                  validator={validator}
                  formData={contexts[toolSetName]}
                  onChange={({ formData }) =>
                    setContexts((current) => ({
                      ...current,
                      [toolSetName]: formData ?? {},
                    }))
                  }
                  liveValidate="onChange"
                  noHtml5Validate
                  tagName="div"
                  uiSchema={uiSchema}
                />
              </div>
            )}
            <Divider mt="sm" />
          </div>
        );
      })}
      {schemas.length === 0 && (
        <Text size="sm" c="dimmed">利用可能な ToolSet がありません。</Text>
      )}
    </Stack>
  );
}
