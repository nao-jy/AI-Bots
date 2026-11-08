import { describe, expect, it } from "vitest";
import {
  decodeAdapterConfig,
  encodeAdapterConfig,
} from "./adapter-config-editor";

describe("adapter configuration storage", () => {
  it("round trips schema-typed values while preserving string tokens", () => {
    const schema = {
      type: "object" as const,
      properties: {
        token: { type: "string" as const },
        count: { type: "integer" as const },
        enabled: { type: "boolean" as const },
        options: { type: "object" as const },
      },
    };
    const stored = JSON.stringify({
      token: "12345",
      count: "12",
      enabled: "false",
      options: '{"a":1}',
      extra: "kept",
    });
    const decoded = decodeAdapterConfig(stored, schema);
    expect(decoded).toEqual({
      token: "12345",
      count: 12,
      enabled: false,
      options: { a: 1 },
      extra: "kept",
    });
    expect(JSON.parse(encodeAdapterConfig(decoded))).toEqual(
      JSON.parse(stored),
    );
  });
  it("leaves invalid stored values available for correction", () => {
    expect(
      decodeAdapterConfig('{"count":"oops"}', {
        properties: { count: { type: "integer" } },
      }),
    ).toEqual({ count: "oops" });
  });
});
