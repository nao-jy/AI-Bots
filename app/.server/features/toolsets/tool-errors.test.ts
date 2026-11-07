import { describe, expect, it, vi } from "vitest";
import type { Chat, Thread } from "chat";
import { getChatTools } from "./chat-tools";
import { getFileParseTools } from "./file-parse";
import type { FileHandleReaderMap } from "./helpers/file-handle";

vi.mock("chat/ai", () => ({ createChatTools: () => ({}) }));

type ToolWithExecute = {
  execute: (input: Record<string, unknown>, options: {
    toolCallId: string;
    messages: never[];
    context: undefined;
  }) => Promise<unknown>;
};

function runTool(tool: unknown, input: Record<string, unknown>) {
  return (tool as ToolWithExecute).execute(input, {
    toolCallId: "test",
    messages: [],
    context: undefined,
  });
}

describe("tool error results", () => {
  it("returns a result when uploading a file fails", async () => {
    const post = vi.fn().mockRejectedValue(new Error("upload rejected"));
    const chat = {
      getAdapter: () => ({}),
      thread: () => ({ post }),
    } as unknown as Chat;
    const thread = { id: "test-thread" } as Thread<Record<string, unknown>, unknown>;
    const fileHandles: FileHandleReaderMap = new Map([
      ["file", { stream: async function* () { yield Buffer.from("content"); } }],
    ]);

    const result = await runTool(
      getChatTools(chat, "gchat", thread, fileHandles).uploadFileToChat,
      { fileHandle: "file", filename: "test.txt" },
    );

    expect(result).toMatchObject({ error: expect.stringContaining("upload rejected") });
    expect(post).toHaveBeenCalledOnce();
  });

  it("returns an error result for an unknown upload handle", async () => {
    const post = vi.fn();
    const chat = {
      getAdapter: () => ({}),
      thread: () => ({ post }),
    } as unknown as Chat;
    const thread = { id: "test-thread" } as Thread<Record<string, unknown>, unknown>;

    const result = await runTool(
      getChatTools(chat, "gchat", thread, new Map()).uploadFileToChat,
      { fileHandle: "missing", filename: "test.txt" },
    );

    expect(result).toMatchObject({ error: expect.any(String) });
    expect(post).not.toHaveBeenCalled();
  });

  it("returns a result when fetching an attachment fails", async () => {
    const chat = {
      getAdapter: () => ({ fetchMessage: vi.fn().mockRejectedValue(new Error("fetch rejected")) }),
    } as unknown as Chat;
    const thread = { id: "test-thread" } as Thread<Record<string, unknown>, unknown>;

    const result = await runTool(
      getChatTools(chat, "gchat", thread, new Map()).getFileHandleFromAttachment,
      { messageId: "message", attachmentIndex: 0 },
    );

    expect(result).toMatchObject({ error: expect.stringContaining("fetch rejected") });
  });

  it("returns a result for an unknown file handle", async () => {
    const result = await runTool(
      getFileParseTools(new Map()).parseFileFromHandle,
      { fileHandle: "missing", ocrLanguages: [] },
    );

    expect(result).toMatchObject({ error: expect.any(String) });
  });
});
