import z from "zod";
import type { ToolSet } from ".";
import { createBashTool } from "bash-tool";
import { getSandboxInstance } from "~/.server/repository/sandboxes";
import { jsonbToStringRecord } from "~/.server/utils";
import { getSandbox } from "./sandboxes";

const Context = z.object({
  sandboxInstanceId: z.string().readonly().default("[RESERVED]"),
});

function getSchema() {
  return z.toJSONSchema(Context, { target: "draft-07" });
}

export const SandboxToolSet: ToolSet = {
  name: "sandbox",
  getToolSetContextSchema: () => {
    return getSchema();
  },
  validateContext: (value) => {
    const result = Context.safeParse(value);
    return result.success
      ? null
      : result.error.issues
          .map(
            (issue) => `${issue.path.join(".") || "context"}: ${issue.message}`,
          )
          .join("、");
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
    );
    const { tools } = await createBashTool({
      sandbox: info.sandbox,
    });
    return tools;
  },
};
