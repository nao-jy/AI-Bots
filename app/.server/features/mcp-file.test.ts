import { describe, expect, it, vi } from "vitest";
import { registerMcpFile } from "./mcp-file";
import {
  toBuffer,
  type FileHandleReaderMap,
} from "./toolsets/helpers/file-handle";

const endpoint = "https://example.test/gdrive/mcp";
const token = "A".repeat(43);
const reference = `files/${token}`;
const resultFor = (url: string) => ({
  content: [{ type: "text", text: `private ${url}` }],
  structuredContent: {
    id: "file1",
    "bot_manager/file": { filename: "test.txt", mimeType: "text/plain", url },
  },
});

describe("MCP file bridge", () => {
  it("downloads a same-server URL and registers bytes without exposing the URL", async () => {
    const handles: FileHandleReaderMap = new Map();
    const download = vi.fn(async () => new Response("contents"));
    const result = (await registerMcpFile(
      resultFor(reference),
      handles,
      endpoint,
      async () => ({ Authorization: "Bearer mcp" }),
      download as typeof fetch,
    )) as {
      structuredContent: { fileHandle: string };
      content: unknown;
    };
    const file = handles.get(result.structuredContent.fileHandle);
    expect(file?.filename).toBe("test.txt");
    expect((await toBuffer(file!.stream())).toString()).toBe("contents");
    expect(download).toHaveBeenCalledWith(
      new URL(`https://example.test/gdrive/files/${token}`),
      expect.objectContaining({
        headers: { Authorization: "Bearer mcp" },
        redirect: "error",
      }),
    );
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it("rejects other origins, paths and redirects without exposing capability URLs", async () => {
    const download = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://attacker.test" },
        }),
    );
    for (const url of [
      `https://attacker.test/gdrive/files/${token}`,
      `../other/files/${token}`,
      `files/${token}?other=1`,
      "files/bad",
    ]) {
      const handles: FileHandleReaderMap = new Map();
      const result = await registerMcpFile(
        resultFor(url),
        handles,
        endpoint,
        async () => ({}),
        download as typeof fetch,
      );
      expect(result).toMatchObject({ isError: true });
      expect(JSON.stringify(result)).not.toContain(url);
      expect(handles.size).toBe(0);
    }
    expect(download).not.toHaveBeenCalled();
    const redirected = await registerMcpFile(
      resultFor(reference),
      new Map(),
      endpoint,
      async () => ({}),
      download as typeof fetch,
    );
    expect(redirected).toMatchObject({ isError: true });
  });

  it("rejects missing, expired and oversized downloads", async () => {
    const handles: FileHandleReaderMap = new Map();
    const expired = vi.fn(async () => new Response(null, { status: 404 }));
    expect(
      await registerMcpFile(
        resultFor(reference),
        handles,
        endpoint,
        async () => ({}),
        expired as typeof fetch,
      ),
    ).toMatchObject({ isError: true });
    const oversizedStream = vi.fn(async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(10 * 1024 * 1024 + 1));
            controller.close();
          },
        }),
      ),
    );
    expect(
      await registerMcpFile(
        resultFor(reference),
        handles,
        endpoint,
        async () => ({}),
        oversizedStream as typeof fetch,
      ),
    ).toMatchObject({ isError: true });
    const oversized = vi.fn(
      async () =>
        new Response("x", {
          headers: { "content-length": String(10 * 1024 * 1024 + 1) },
        }),
    );
    expect(
      await registerMcpFile(
        resultFor(reference),
        handles,
        endpoint,
        async () => ({}),
        oversized as typeof fetch,
      ),
    ).toMatchObject({ isError: true });
    expect(handles.size).toBe(0);
    const ordinary = { content: [{ type: "text", text: "ok" }] };
    expect(await registerMcpFile(ordinary, handles, endpoint)).toBe(ordinary);
  });
});
