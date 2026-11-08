import { useState } from "react";
import { Input } from "@mantine/core";
import Form from "@rjsf/mantine";
import type { RJSFSchema } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";

/** Adapter configuration is stored as a map of strings, even for structured values. */
export function decodeAdapterConfig(
  value: unknown,
  schema: RJSFSchema,
): Record<string, unknown> {
  let stored: unknown;
  try {
    stored = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return {};
  }
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
  return Object.fromEntries(
    Object.entries(stored).map(([key, item]) => {
      const property = schema.properties?.[key];
      const type =
        property && typeof property === "object" ? property.type : undefined;
      const types = Array.isArray(type) ? type : [type];
      if (
        typeof item === "string" &&
        types.some(
          (t) =>
            t === "object" ||
            t === "array" ||
            t === "number" ||
            t === "integer" ||
            t === "boolean" ||
            t === "null",
        )
      ) {
        try {
          return [key, JSON.parse(item)];
        } catch {
          /* Keep invalid values visible. */
        }
      }
      return [key, item];
    }),
  );
}

export function encodeAdapterConfig(value: Record<string, unknown>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [
          key,
          typeof item === "string" ? item : JSON.stringify(item),
        ]),
    ),
  );
}

export function AdapterConfigEditor({
  name,
  label,
  schema,
  initialValue,
}: {
  name: string;
  label: string;
  schema: RJSFSchema;
  initialValue: unknown;
}) {
  const [data, setData] = useState(() =>
    decodeAdapterConfig(initialValue, schema),
  );
  return (
    <Input.Wrapper label={label}>
      <input type="hidden" name={name} value={encodeAdapterConfig(data)} />
      <div className="toolset-context-form">
        <Form
          schema={schema}
          validator={validator}
          formData={data}
          onChange={({ formData }) => setData(formData ?? {})}
          liveValidate="onBlur"
          noHtml5Validate
          tagName="div"
          uiSchema={{ "ui:submitButtonOptions": { norender: true } }}
        />
      </div>
    </Input.Wrapper>
  );
}
