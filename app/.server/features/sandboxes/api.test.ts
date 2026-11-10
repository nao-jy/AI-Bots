import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSandboxApiProvider, listSandboxApiProviders } from "./api";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubEnv("SANDBOX_API_URL", "http://sandbox.test");
  vi.stubEnv("SANDBOX_API_TOKEN", "secret");
});

describe("sandbox API client", () => {
  it("discovers providers dynamically and keeps the API token in headers", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ providers: ["OpenSandbox", "NewProvider"] }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await listSandboxApiProviders()).toEqual([
      "OpenSandbox",
      "NewProvider",
    ]);
    const [url, options] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe("http://sandbox.test/v1/providers");
    expect(new Headers(options.headers).get("Authorization")).toBe(
      "Bearer secret",
    );
    expect(options.redirect).toBe("error");
  });

  it("uses binary HTTP for files and releases the session", async () => {
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (target: URL, options: RequestInit) => {
        requests.push({
          url: target.href,
          method: options.method ?? "GET",
          body: options.body,
        });
        if (target.pathname === "/v1/sessions" && options.method === "POST")
          return Response.json({
            sessionId: "session",
            createdInstanceId: "instance",
          });
        if (target.pathname.endsWith("/commands"))
          return Response.json({ stdout: "ok", stderr: "", exitCode: 0 });
        if (target.pathname.endsWith("/file") && options.method !== "PUT")
          return new Response(new Uint8Array([0, 255]));
        return new Response(null, { status: 204 });
      }),
    );
    const backend = createSandboxApiProvider("OpenSandbox");
    const { sandbox, createdInstanceId } = await backend.getBashSandbox(
      null,
      {},
      [],
      [],
    );
    expect(createdInstanceId).toBe("instance");
    expect((await sandbox.executeCommand("echo ok")).stdout).toBe("ok");
    await sandbox.writeFiles([
      { path: "/tmp/a", content: Buffer.from([0, 255]) },
    ]);
    const chunks = [];
    for await (const part of sandbox.readFileBinaryStream("/tmp/a"))
      chunks.push(part);
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([0, 255]));
    await sandbox.release();
    expect(
      requests.some(
        (entry) => entry.method === "PUT" && Buffer.isBuffer(entry.body),
      ),
    ).toBe(true);
    expect(requests.at(-1)).toMatchObject({
      method: "DELETE",
      url: "http://sandbox.test/v1/sessions/session",
    });
  });

  it("returns no providers when the API is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(await listSandboxApiProviders()).toEqual([]);
  });
});
