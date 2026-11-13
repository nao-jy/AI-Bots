import { describe, expect, it } from "vitest";
import {
  getMemoryDirectory,
  isDataPersistenceScope,
} from "./data-persistence-scope";

describe("data persistence scope", () => {
  const directory = (
    scope: "nopersistence" | "thread" | "bot",
    organizationId = "organization-a",
    chatbotId = "bot-a",
    adapterId = "adapter-a",
    threadId = "thread-a",
  ) =>
    getMemoryDirectory(
      "/tmp/memory",
      organizationId,
      chatbotId,
      scope,
      adapterId,
      threadId,
    );

  it("disables memory for nopersistence", () => {
    expect(directory("nopersistence")).toBeNull();
  });

  it("isolates thread memory by adapter and thread", () => {
    const first = directory("thread");
    expect(first).toBe(directory("thread"));
    expect(first).not.toBe(
      directory("thread", "organization-a", "bot-a", "adapter-b"),
    );
    expect(first).not.toBe(
      directory("thread", "organization-a", "bot-a", "adapter-a", "thread-b"),
    );
  });

  it("shares bot memory across adapters and threads but not bots or organizations", () => {
    const first = directory("bot");
    expect(first).toBe(
      directory("bot", "organization-a", "bot-a", "adapter-b", "thread-b"),
    );
    expect(first).not.toBe(directory("bot", "organization-a", "bot-b"));
    expect(first).not.toBe(directory("bot", "organization-b", "bot-a"));
    expect(first).not.toBe(directory("thread"));
  });

  it("rejects unknown configuration values", () => {
    expect(isDataPersistenceScope("nopersistence")).toBe(true);
    expect(isDataPersistenceScope("thread")).toBe(true);
    expect(isDataPersistenceScope("bot")).toBe(true);
    expect(isDataPersistenceScope("shared")).toBe(false);
  });
});
