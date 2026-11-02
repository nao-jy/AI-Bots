import type { Tool } from "ai";
import { z } from "zod";
import type { FileHandleReaderMap } from "./helpers/file-handle";
import { getToolSetFactory as getRemoteFilesToolSetFactory } from "./remote-files";

export interface ToolSetFactory {
  name: string;
  displayName: string;
  getToolSetContextSchema: () => z.core.ZodStandardJSONSchemaPayload<unknown>;
  validateContext: (value: unknown) => boolean;
  getTools: (
    fileHandles: FileHandleReaderMap,
    context: unknown,
  ) => Promise<Record<string, Tool>>;
}

export class ToolSetFactoryRegistry {
  private userId: number;
  constructor(userId: number) {
    this.userId = userId;
  }
  private async getToolSetFactories() {
    const remoteFilesFactory = await getRemoteFilesToolSetFactory(this.userId);
    return [remoteFilesFactory];
  }

  async listToolSetNames() {
    const factories = await this.getToolSetFactories();
    return factories.map((factory) => factory.name);
  }

  async listToolSetSchemas() {
    const factories = await this.getToolSetFactories();
    return factories.map((factory) => ({
      name: factory.name,
      displayName: factory.displayName,
      schema: factory.getToolSetContextSchema(),
    }));
  }

  async validateToolSetContext(name: string, value: unknown) {
    const factories = await this.getToolSetFactories();
    const factory = factories.find((candidate) => candidate.name === name);
    return factory?.validateContext(value);
  }

  async getTools(
    name: string,
    context: unknown,
    fileHandles: FileHandleReaderMap,
  ) {
    const factories = await this.getToolSetFactories();
    const factory = factories.find((candidate) => candidate.name === name);
    return factory?.getTools(fileHandles, context);
  }
}
