import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSandboxApiProvider } from "./api";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubEnv("SANDBOX_API_URL", "http://sandbox.test");
  vi.stubEnv("SANDBOX_API_TOKEN", "secret");
});

describe("sandbox API client", () => {
  it("uses stateless operations and binary HTTP for files", async () => {
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (target: URL, options: RequestInit) => {
        requests.push({
          url: target.href,
          method: options.method ?? "GET",
          body: options.body,
        });
        if (target.pathname === "/v1/instances" && options.method === "POST")
          return Response.json({ instanceId: "instance" });
        if (target.pathname.endsWith("/commands"))
          return Response.json({ stdout: "ok", stderr: "", exitCode: 0 });
        if (target.pathname.endsWith("/file") && options.method !== "PUT")
          return new Response(new Uint8Array([0, 255]));
        return new Response(null, { status: 204 });
      }),
    );
    const backend = createSandboxApiProvider("OpenSandbox", {
      baseUrl: "http://sandbox.test",
      headers: { Authorization: "Bearer secret" },
    });
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
    expect(
      requests.some(
        (entry) => entry.method === "PUT" && Buffer.isBuffer(entry.body),
      ),
    ).toBe(true);
    expect(
      requests.find((entry) => entry.url.endsWith("/commands")),
    ).toMatchObject({
      method: "POST",
      url: "http://sandbox.test/v1/instances/instance/commands",
      body: JSON.stringify({
        envs: {},
        allowedDomains: [],
        command: "echo ok",
      }),
    });
    expect(requests.some((entry) => entry.url.includes("/sessions"))).toBe(
      false,
    );
    expect(requests.at(-1)?.url).not.toContain("provider=");
  });

  it("uses each provider's own base URL and token", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const first = createSandboxApiProvider("first", {
      baseUrl: "https://first.example/api/",
      headers: { Authorization: "Bearer first-secret" },
    });
    const second = createSandboxApiProvider("second", {
      baseUrl: "https://second.example/other",
      headers: { Authorization: "Bearer second-secret" },
    });
    await first.destroySandbox("same/id");
    await second.destroySandbox("same/id");
    const calls = fetch.mock.calls as unknown as [URL, RequestInit][];
    expect(calls.map(([target]) => target.href)).toEqual([
      "https://first.example/api/v1/instances/same%2Fid",
      "https://second.example/other/v1/instances/same%2Fid",
    ]);
    expect(
      calls.map(([, options]) =>
        new Headers(options.headers).get("Authorization"),
      ),
    ).toEqual(["Bearer first-secret", "Bearer second-secret"]);
    expect(
      calls.every(
        ([, options]) => options.method === "DELETE" && !options.body,
      ),
    ).toBe(true);
  });

  it("configures an existing instance without creating another one", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const backend = createSandboxApiProvider("OpenSandbox", {
      baseUrl: "http://sandbox.test",
      headers: { Authorization: "Bearer secret" },
    });
    const { createdInstanceId } = await backend.getBashSandbox(
      "existing",
      { LANG: "ja" },
      ["example.com"],
      ["setup"],
    );
    expect(createdInstanceId).toBeNull();
    const [target, options] = fetch.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(target.pathname).toBe("/v1/instances/existing/configure");
    expect(JSON.parse(options.body as string)).toEqual({
      envs: { LANG: "ja" },
      allowedDomains: ["example.com"],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
