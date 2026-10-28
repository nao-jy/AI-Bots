import type { Tool } from "ai";
import { z } from "zod";
import { SandboxToolSet } from "./sandbox";

export interface ToolSet {
  name: string;
  getToolSetContextSchema: () => z.core.ZodStandardJSONSchemaPayload<unknown>;
  getTools: (
    toolSetCtx: Record<string, unknown>,
  ) => Promise<Record<string, Tool>>;
}

const TOOLSETS: ToolSet[] = [SandboxToolSet];

export function listToolSetNames() {
  return TOOLSETS.map((toolSet) => toolSet.name);
}
