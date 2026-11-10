import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiFileSystem } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const opened = (id: string) =>
  new Response(JSON.stringify({ sessionId: id }), { status: 201 });

describe("filesystem API client", () => {
  it("opens with the supplied configuration, sends scoped paths and restores relative list paths", async () => {
    vi.stubEnv("FILESYSTEM_API_URL", "http://files.example/base/");
    vi.stubEnv("FILESYSTEM_API_TOKEN", "secret-1");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(opened("session-a"))
      .mockResolvedValueOnce(new Response(Buffer.from([0, 255])))
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
    const fs = new ApiFileSystem(
      { service: "fs", config: { root: "custom" } },
      "org/bot",
    );
    expect(await fs.readBytes("notes/a")).toEqual(Buffer.from([0, 255]));
    const [openUrl, openOptions] = fetchMock.mock.calls[0] as [
      URL,
      RequestInit,
    ];
    expect(openUrl.pathname).toBe("/base/v1/filesystems");
    expect(JSON.parse(openOptions.body as string)).toEqual({
      service: "fs",
      config: { root: "custom" },
    });
    const [url, options] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(url.pathname).toBe("/base/v1/filesystems/session-a/file");
    expect(url.searchParams.get("path")).toBe("org/bot/notes/a");
    expect(new Headers(options.headers).get("Authorization")).toBe(
      "Bearer secret-1",
    );
    expect((await fs.list("notes/"))[0]).toEqual({
      path: "notes/a",
      size: 2,
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });
    await expect(fs.read("../other")).rejects.toThrow("Invalid storage path");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reopens an expired session but treats a missing file as null", async () => {
    vi.stubEnv("FILESYSTEM_API_URL", "http://files.example");
    vi.stubEnv("FILESYSTEM_API_TOKEN", "secret-2");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(opened("old"))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 404,
          headers: { "X-Filesystem-Session": "missing" },
        }),
      )
      .mockResolvedValueOnce(opened("new"))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const fs = new ApiFileSystem({ service: "s3", config: { bucket: "test" } });
    expect(await fs.read("missing")).toBeNull();
    await expect(fs.read("error")).rejects.toThrow("HTTP 500");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
