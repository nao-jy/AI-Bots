import { describe, expect, it } from "vitest";
import { registerMcpFile } from "./mcp-file";
import {
  toBuffer,
  type FileHandleReaderMap,
} from "./toolsets/helpers/file-handle";

describe("MCP file bridge", () => {
  it("registers bytes for the existing file tools without exposing them to the model", async () => {
    const handles: FileHandleReaderMap = new Map();
    const raw = {
      content: [{ type: "text", text: "secret-base64" }],
      structuredContent: {
        id: "file1",
        "bot_manager/file": {
          filename: "test.txt",
          mimeType: "text/plain",
          base64: Buffer.from("contents").toString("base64"),
        },
      },
    };
    const result = registerMcpFile(raw, handles) as {
      structuredContent: { fileHandle: string };
      content: unknown;
    };
    const file = handles.get(result.structuredContent.fileHandle);
    expect(file?.filename).toBe("test.txt");
    expect((await toBuffer(file!.stream())).toString()).toBe("contents");
    expect(JSON.stringify(result)).not.toContain("secret-base64");
    expect(JSON.stringify(result)).not.toContain(
      Buffer.from("contents").toString("base64"),
    );
  });

  it("rejects invalid payloads and leaves ordinary MCP results intact", () => {
    const handles: FileHandleReaderMap = new Map();
    const ordinary = { content: [{ type: "text", text: "ok" }] };
    expect(registerMcpFile(ordinary, handles)).toBe(ordinary);
    const result = registerMcpFile(
      {
        structuredContent: {
          "bot_manager/file": {
            filename: "test",
            mimeType: "text/plain",
            base64: "!invalid!",
          },
        },
      },
      handles,
    );
    expect(result).toMatchObject({ isError: true });
    expect(handles.size).toBe(0);
  });
});
