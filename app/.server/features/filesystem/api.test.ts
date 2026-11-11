import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiFileSystem } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("filesystem API client", () => {
  it("sends context on every request and preserves binary file data", async () => {
    vi.stubEnv("FILESYSTEM_API_URL", "http://files.example/base/");
    vi.stubEnv("FILESYSTEM_API_TOKEN", "secret");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(Buffer.from([0, 255])))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            entries: [
              {
                path: "org/bot/notes/a",
                size: 2,
                updatedAt: "2026-01-01T00:00:00Z",
              },
            ],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const context = { service: "fs", config: { root: "custom" } };
    const fs = new ApiFileSystem(context, "org/bot");
    expect(await fs.readBytes("notes/a")).toEqual(Buffer.from([0, 255]));
    await fs.writeBytes("notes/a", Buffer.from([0, 255]));
    const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/base/v1/read");
    expect(JSON.parse(options.body as string)).toEqual({
      context,
      path: "org/bot/notes/a",
    });
    expect(new Headers(options.headers).get("Authorization")).toBe(
      "Bearer secret",
    );
    const [writeUrl, writeOptions] = fetchMock.mock.calls[1] as [
      URL,
      RequestInit,
    ];
    expect(writeUrl.pathname).toBe("/base/v1/write");
    const form = writeOptions.body as FormData;
    expect(JSON.parse(form.get("context") as string)).toEqual(context);
    expect(form.get("path")).toBe("org/bot/notes/a");
    expect(Buffer.from(await (form.get("file") as File).arrayBuffer())).toEqual(
      Buffer.from([0, 255]),
    );
    expect((await fs.list("notes/"))[0]).toEqual({
      path: "notes/a",
      size: 2,
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const [, listOptions] = fetchMock.mock.calls[2] as [URL, RequestInit];
    expect(JSON.parse(listOptions.body as string)).toEqual({
      context,
      prefix: "org/bot/notes/",
    });
    await expect(fs.read("../other")).rejects.toThrow("Invalid storage path");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("uses the selected API endpoint and headers", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    const fs = new ApiFileSystem({ service: "fs", config: { root: "" } }, "", {
      endpoint: "https://selected.example/base",
      headers: { Authorization: "Bearer selected" },
    });
    await fs.read("a");
    const [target, options] = fetch.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(target.href).toBe("https://selected.example/base/v1/read");
    expect(new Headers(options.headers).get("Authorization")).toBe(
      "Bearer selected",
    );
  });

  it("requests immediate directory entries and rejects paths outside the directory", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          entries: [
            {
              path: "folder/empty/",
              type: "directory",
              size: null,
              updatedAt: null,
            },
            {
              path: "folder/a.txt",
              type: "file",
              size: 3,
              updatedAt: "2026-01-01T00:00:00Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          entries: [
            {
              path: "folder/child/escape.txt",
              type: "file",
              size: 2,
              updatedAt: null,
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const context = { service: "fs", config: { root: "" } };
    const fs = new ApiFileSystem(context, "", {
      endpoint: "http://files.test/api",
      headers: { Authorization: "Bearer secret" },
    });
    expect(await fs.listDirectory("folder/")).toHaveLength(2);
    const [target, options] = fetch.mock.calls[0] as [URL, RequestInit];
    expect(target.pathname).toBe("/api/v1/list");
    expect(JSON.parse(options.body as string)).toEqual({
      context,
      prefix: "folder/",
      mode: "directory",
    });
    await expect(fs.listDirectory("folder/")).rejects.toThrow(
      "Invalid filesystem API response",
    );
    await expect(fs.listDirectory("../")).rejects.toThrow(
      "Invalid storage path",
    );
  });

  it("treats a missing file as null and propagates other errors", async () => {
    vi.stubEnv("FILESYSTEM_API_URL", "http://files.example");
    vi.stubEnv("FILESYSTEM_API_TOKEN", "secret");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 404 }))
        .mockResolvedValueOnce(new Response(null, { status: 500 })),
    );
    const fs = new ApiFileSystem({ service: "s3", config: { bucket: "test" } });
    expect(await fs.read("missing")).toBeNull();
    await expect(fs.read("error")).rejects.toThrow("HTTP 500");
  });
});
