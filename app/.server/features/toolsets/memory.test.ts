import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryFileSystem } from "../filesystem/in-memory";
import { LocalFileSystem } from "../filesystem/local";
import { buildMemoryPrompt, getMemoryTools, type MemoryToolResult } from "./memory";

async function callTool(
  tools: ReturnType<typeof getMemoryTools>,
  name: keyof ReturnType<typeof getMemoryTools>,
  input: Record<string, unknown>,
): Promise<MemoryToolResult> {
  const execute = tools[name].execute as unknown as
    | ((input: Record<string, unknown>, options: {
        toolCallId: string;
        messages: never[];
        context: undefined;
      }) => Promise<MemoryToolResult>)
    | undefined;
  if (!execute) throw new Error(`${name} has no execute handler`);
  return execute(input, { toolCallId: "test", messages: [], context: undefined });
}

describe("AI SDK memory tools", () => {
  it("reads, edits, searches, moves, and deletes persistent notes", async () => {
    const fs = new InMemoryFileSystem();
    const tools = getMemoryTools(fs);
    const call = (name: keyof typeof tools, input: Record<string, unknown>) =>
      callTool(tools, name, input);

    expect(Object.keys(tools)).toEqual([
      "memory_list", "memory_view", "memory_grep", "memory_create",
      "memory_str_replace", "memory_insert", "memory_append",
      "memory_delete", "memory_rename",
    ]);
    expect((await call("memory_create", {
      path: "/memories/INDEX.md",
      content: "profile.md: preferences",
    })).isError).toBe(false);
    expect((await buildMemoryPrompt(fs)).includes("memory_view")).toBe(true);
    expect((await call("memory_append", {
      path: "/memories/profile.md",
      text: "Favorite color: blue",
    })).isError).toBe(false);
    expect((await call("memory_str_replace", {
      path: "/memories/profile.md",
      old_str: "blue",
      new_str: "green",
    })).isError).toBe(false);
    expect((await call("memory_grep", { pattern: "ＧＲＥＥＮ" })).content)
      .toContain("/memories/profile.md:1:Favorite color: green");
    expect((await call("memory_view", { path: "/memories/profile.md" })).content)
      .toContain("1\tFavorite color: green");
    expect((await call("memory_rename", {
      old_path: "/memories/profile.md",
      new_path: "/memories/user/profile.md",
    })).isError).toBe(false);
    expect(await fs.read("user/profile.md")).toBe("Favorite color: green\n");
    expect((await call("memory_delete", { path: "/memories/user" })).isError)
      .toBe(false);
    expect(await fs.read("user/profile.md")).toBeNull();
  });

  it("rejects paths outside the root and writes over capacity", async () => {
    const fs = new InMemoryFileSystem();
    const tools = getMemoryTools(fs, { maxFileBytes: 12 });

    expect((await callTool(tools, "memory_create", { path: "/memories/../escape.md", content: "x" })).isError)
      .toBe(true);
    expect((await callTool(tools, "memory_create", { path: "/memories/large.md", content: "too much content" })).isError)
      .toBe(true);
    expect(await fs.list("")).toEqual([]);
  });

  it("persists files across filesystem instances without mixing scopes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bot-memory-"));
    try {
      const first = new LocalFileSystem(join(dir, "thread-a"));
      const second = new LocalFileSystem(join(dir, "thread-b"));
      expect((await callTool(getMemoryTools(first), "memory_create", {
        path: "/memories/note.md",
        content: "Saved preference",
      })).isError).toBe(false);
      expect(await new LocalFileSystem(join(dir, "thread-a")).read("note.md"))
        .toBe("Saved preference\n");
      expect(await second.read("note.md")).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
