import { describe, expect, it, vi } from "vitest";
import type { Chat, Thread } from "chat";
import { getChatTools } from "./chat-tools";
import { getFileParseTools } from "./file-parse";
import type { FileHandleReaderMap } from "./helpers/file-handle";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("chat/ai", () => ({ createChatTools: () => ({}) }));

type ToolWithExecute = {
  execute: (
    input: Record<string, unknown>,
    options: {
      toolCallId: string;
      messages: never[];
      context: undefined;
    },
  ) => Promise<unknown>;
};

function runTool(tool: unknown, input: Record<string, unknown>) {
  return (tool as ToolWithExecute).execute(input, {
    toolCallId: "test",
    messages: [],
    context: undefined,
  });
}

describe("tool error results", () => {
  it("offers the same upload tool in Google Chat", () => {
    const chat = { getAdapter: () => ({}) } as unknown as Chat;
    const thread = { id: "test-thread" } as Thread<
      Record<string, unknown>,
      unknown
    >;
    const tools = getChatTools(chat, "gchat", thread, new Map());

    expect(tools).toHaveProperty("uploadFileToChat");
    expect(tools).not.toHaveProperty("createTemporaryFileLink");
  });

  it.each(["gchat", "line"])(
    "posts a temporary link on %s when direct upload fails",
    async (platform) => {
      const dir = await mkdtemp(join(tmpdir(), "bot-upload-fallback-"));
      vi.stubEnv("TEMP_FILE_DIR", dir);
      vi.stubEnv("PUBLIC_APP_URL", "https://example.test");
      const post = vi
        .fn()
        .mockRejectedValueOnce(new Error("upload rejected"))
        .mockResolvedValueOnce({});
      const chat = {
        getAdapter: () => ({}),
        thread: () => ({ post }),
      } as unknown as Chat;
      const thread = { id: "test-thread" } as Thread<
        Record<string, unknown>,
        unknown
      >;
      const fileHandles: FileHandleReaderMap = new Map([
        [
          "file",
          {
            stream: async function* () {
              yield Buffer.from("content");
            },
          },
        ],
      ]);

      try {
        const result = await runTool(
          getChatTools(chat, platform, thread, fileHandles).uploadFileToChat,
          { fileHandle: "file", filename: "test.txt" },
        );

        expect(result).toMatchObject({
          success: true,
          messagePosted: true,
        });
        expect(result).not.toHaveProperty("url");
        expect(post).toHaveBeenCalledTimes(2);
        expect(post).toHaveBeenLastCalledWith({
          raw: expect.stringMatching(
            /^test\.txt\nhttps:\/\/example\.test\/api\/files\//,
          ),
        });
      } finally {
        vi.unstubAllEnvs();
        await rm(dir, { recursive: true, force: true });
      }
    },
  );

  it("returns an error if posting the temporary link fails", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bot-upload-fallback-"));
    vi.stubEnv("TEMP_FILE_DIR", dir);
    vi.stubEnv("PUBLIC_APP_URL", "https://example.test");
    const post = vi
      .fn()
      .mockRejectedValueOnce(new Error("upload rejected"))
      .mockRejectedValueOnce(new Error("link post rejected"));
    const chat = {
      getAdapter: () => ({}),
      thread: () => ({ post }),
    } as unknown as Chat;
    const thread = { id: "test-thread" } as Thread<
      Record<string, unknown>,
      unknown
    >;
    const fileHandles: FileHandleReaderMap = new Map([
      [
        "file",
        {
          stream: async function* () {
            yield Buffer.from("content");
          },
        },
      ],
    ]);

    try {
      const result = await runTool(
        getChatTools(chat, "gchat", thread, fileHandles).uploadFileToChat,
        { fileHandle: "file", filename: "test.txt" },
      );
      expect(result).toMatchObject({
        error: expect.stringContaining("link post rejected"),
      });
      expect(post).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllEnvs();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps direct attachment delivery when it succeeds", async () => {
    const post = vi.fn().mockResolvedValue({});
    const chat = {
      getAdapter: () => ({}),
      thread: () => ({ post }),
    } as unknown as Chat;
    const thread = { id: "test-thread" } as Thread<
      Record<string, unknown>,
      unknown
    >;
    const fileHandles: FileHandleReaderMap = new Map([
      [
        "file",
        {
          stream: async function* () {
            yield Buffer.from("content");
          },
        },
      ],
    ]);

    const result = await runTool(
      getChatTools(chat, "slack", thread, fileHandles).uploadFileToChat,
      { fileHandle: "file", filename: "test.txt" },
    );

    expect(result).toMatchObject({
      success: true,
      messagePosted: true,
    });
    expect(post).toHaveBeenCalledOnce();
  });

  it("returns an error if the fallback cannot create a public link", async () => {
    vi.stubEnv("PUBLIC_APP_URL", "");
    const post = vi.fn().mockRejectedValue(new Error("upload rejected"));
    const chat = {
      getAdapter: () => ({}),
      thread: () => ({ post }),
    } as unknown as Chat;
    const thread = { id: "test-thread" } as Thread<
      Record<string, unknown>,
      unknown
    >;
    const fileHandles: FileHandleReaderMap = new Map([
      [
        "file",
        {
          stream: async function* () {
            yield Buffer.from("content");
          },
        },
      ],
    ]);

    try {
      const result = await runTool(
        getChatTools(chat, "gchat", thread, fileHandles).uploadFileToChat,
        { fileHandle: "file", filename: "test.txt" },
      );

      expect(result).toMatchObject({
        error: expect.stringContaining("upload rejected"),
      });
      expect(post).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("returns an error result for an unknown upload handle", async () => {
    const post = vi.fn();
    const chat = {
      getAdapter: () => ({}),
      thread: () => ({ post }),
    } as unknown as Chat;
    const thread = { id: "test-thread" } as Thread<
      Record<string, unknown>,
      unknown
    >;

    const result = await runTool(
      (
        getChatTools(chat, "slack", thread, new Map()) as Record<
          string,
          unknown
        >
      ).uploadFileToChat,
      { fileHandle: "missing", filename: "test.txt" },
    );

    expect(result).toMatchObject({ error: expect.any(String) });
    expect(post).not.toHaveBeenCalled();
  });

  it("returns a result when fetching an attachment fails", async () => {
    const chat = {
      getAdapter: () => ({
        fetchMessage: vi.fn().mockRejectedValue(new Error("fetch rejected")),
      }),
    } as unknown as Chat;
    const thread = { id: "test-thread" } as Thread<
      Record<string, unknown>,
      unknown
    >;

    const result = await runTool(
      getChatTools(chat, "gchat", thread, new Map())
        .getFileHandleFromAttachment,
      { messageId: "message", attachmentIndex: 0 },
    );

    expect(result).toMatchObject({
      error: expect.stringContaining("fetch rejected"),
    });
  });

  it("returns a result for an unknown file handle", async () => {
    const result = await runTool(
      getFileParseTools(new Map()).parseFileFromHandle,
      { fileHandle: "missing", ocrLanguages: [] },
    );

    expect(result).toMatchObject({ error: expect.any(String) });
  });
});
