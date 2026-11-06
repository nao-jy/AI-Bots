import { describe, expect, it } from "vitest";
import { getMemoryDirectory, isMemoryConfig } from "./memory-config";

describe("chatbot memory configuration", () => {
  const directory = (
    config: "nouse" | "thread" | "bot",
    organizationId = "organization-a",
    chatbotId = "bot-a",
    adapterId = "adapter-a",
    threadId = "thread-a",
  ) => getMemoryDirectory("/tmp/memory", organizationId, chatbotId, config, adapterId, threadId);

  it("disables memory for nouse", () => {
    expect(directory("nouse")).toBeNull();
  });

  it("isolates thread memory by adapter and thread", () => {
    const first = directory("thread");
    expect(first).toBe(directory("thread"));
    expect(first).not.toBe(directory("thread", "organization-a", "bot-a", "adapter-b"));
    expect(first).not.toBe(directory("thread", "organization-a", "bot-a", "adapter-a", "thread-b"));
  });

  it("shares bot memory across adapters and threads but not bots or organizations", () => {
    const first = directory("bot");
    expect(first).toBe(directory("bot", "organization-a", "bot-a", "adapter-b", "thread-b"));
    expect(first).not.toBe(directory("bot", "organization-a", "bot-b"));
    expect(first).not.toBe(directory("bot", "organization-b", "bot-a"));
    expect(first).not.toBe(directory("thread"));
  });

  it("rejects unknown configuration values", () => {
    expect(isMemoryConfig("nouse")).toBe(true);
    expect(isMemoryConfig("thread")).toBe(true);
    expect(isMemoryConfig("bot")).toBe(true);
    expect(isMemoryConfig("shared")).toBe(false);
  });
});
