import z from "zod";
import type { ToolSet } from ".";
import { createBashTool } from "bash-tool";
import { getSandboxInstance } from "~/.server/repository/sandboxes";
import { jsonbToStringRecord } from "~/.server/utils";
import { getSandbox } from "./sandboxes";

const Context = z.object({
  sandboxInstanceId: z.string().readonly(),
});

function getSchema() {
  return z.toJSONSchema(Context);
}

export const SandboxToolSet: ToolSet = {
  name: "sandbox",
  getToolSetContextSchema: () => {
    return getSchema();
  },
  getTools: async (toolSetCtx: Record<string, unknown>) => {
    const schema = Context.parse(toolSetCtx);
    const instance = await getSandboxInstance(schema.sandboxInstanceId);
    if (instance === null) {
      throw new Error(`instance ${schema.sandboxInstanceId} not found`);
    }
    const sbx = getSandbox(instance.sandbox.sandboxType);
    if (sbx === null) {
      throw new Error(`sandbox type ${instance.sandbox.sandboxType} not found`);
    }
    const info = await sbx.getBashSandbox(
      instance.instanceId,
      jsonbToStringRecord(instance.sandbox.envs),
      [...instance.sandbox.allowedDomainList],
      [...instance.sandbox.deniedDomainList],
    );
    const { tools } = await createBashTool({
      sandbox: info.sandbox,
    });
    return tools;
  },
};
