import type { Tool } from "ai";
import { z } from "zod";
import type { FileHandleReaderMap } from "./file-handle";
import { FACTORY as REMOTE_FILES_FACTORY } from "./remote-files";

export interface ToolSet {
  getTools: (
    toolSetCtx: Record<string, unknown>,
  ) => Promise<Record<string, Tool>>;
}

export interface ToolSetFactory {
  name: string;
  getToolSetContextSchema: () => z.core.ZodStandardJSONSchemaPayload<unknown>;
  validateContext: (value: unknown) => boolean;
  getToolSet: (fileHandles: FileHandleReaderMap) => ToolSet;
}

const TOOLSET_FACTORIES: ToolSetFactory[] = [REMOTE_FILES_FACTORY];

export function listToolSetNames() {
  return TOOLSET_FACTORIES.map((factory) => factory.name);
}

export function listToolSetSchemas() {
  return TOOLSET_FACTORIES.map((factory) => ({
    name: factory.name,
    schema: factory.getToolSetContextSchema(),
  }));
}

export function validateToolSetContext(name: string, value: unknown) {
  const factory = TOOLSET_FACTORIES.find(
    (candidate) => candidate.name === name,
  );
  return factory
    ? factory.validateContext(value)
    : `利用できない ToolSet です: ${name}`;
}
