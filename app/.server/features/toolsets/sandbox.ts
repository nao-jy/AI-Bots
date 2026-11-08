import { createBashTool } from "bash-tool";
import { tool } from "ai";
import { z } from "zod";
import { basename } from "node:path";
import { type BashSandboxExtended } from "../sandboxes";
import {
  generateFileHandle,
  toBuffer,
  type FileHandleReaderMap,
} from "./helpers/file-handle";

export async function getSandboxTools(
  bashSandbox: BashSandboxExtended,
  fileHandles: FileHandleReaderMap,
) {
  const { tools } = await createBashTool({
    sandbox: bashSandbox,
    destination: ".",
  });

  return {
    sandboxBash: tools.bash,
    sandboxReadFileAsText: tools.readFile,
    sandboxWriteFileAsText: tools.writeFile,
    sandboxReadFile: tool({
      description: "read file from sandbox and return file handle",
      inputSchema: z.object({
        srcPath: z.string().describe("filepath in sandbox"),
      }),
      execute: async ({ srcPath }) => {
        try {
          const handle = generateFileHandle();
          fileHandles.set(handle, {
            stream: () => bashSandbox.readFileBinaryStream(srcPath),
            filename: basename(srcPath),
          });
          return {
            success: true,
            fileHandle: handle,
            filename: basename(srcPath),
          };
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),
    sandboxWriteFile: tool({
      description: "write file from file handle to sandbox",
      inputSchema: z.object({
        dstPath: z.string().describe("destination in sandbox"),
        fileHandle: z.string().describe("file handle to write"),
      }),
      execute: async ({ dstPath, fileHandle }) => {
        try {
          const fileInfo = fileHandles.get(fileHandle);
          if (fileInfo === undefined) {
            return { success: false, message: "file not registered" };
          }
          const content = await toBuffer(fileInfo.stream());
          await bashSandbox.writeFiles([{ path: dstPath, content }]);
          return { success: true, path: dstPath, bytesWritten: content.length };
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),
  };
}
