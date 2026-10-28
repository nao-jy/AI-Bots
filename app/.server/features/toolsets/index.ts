import type { Tool } from "ai";
import { z } from "zod";
import { SandboxToolSet } from "./sandbox";

export interface ToolSet {
  name: string;
  getToolSetContextSchema: () => z.core.ZodStandardJSONSchemaPayload<unknown>;
  validateContext: (value: unknown) => string | null;
  getTools: (
    toolSetCtx: Record<string, unknown>,
  ) => Promise<Record<string, Tool>>;
}

const TOOLSETS: ToolSet[] = [SandboxToolSet];

export function listToolSetNames() {
  return TOOLSETS.map((toolSet) => toolSet.name);
}

export function listToolSetSchemas() {
  return TOOLSETS.map((toolSet) => ({
    name: toolSet.name,
    schema: toolSet.getToolSetContextSchema(),
  }));
}

export function validateToolSetContext(name: string, value: unknown) {
  const toolSet = TOOLSETS.find((candidate) => candidate.name === name);
  return toolSet
    ? toolSet.validateContext(value)
    : `利用できない ToolSet です: ${name}`;
}
