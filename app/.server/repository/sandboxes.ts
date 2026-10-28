import { db } from "./db";

export async function getSandboxInstance(instanceId: string) {
  const instance = await db.orm.aibot.SandboxInstance.whereUnique({
    instanceId,
  })
    .include("sandbox")
    .first();
  return instance;
}
