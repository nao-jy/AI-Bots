import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatInstance } from "chat";
import { getChatworkConfigSchema, createChatworkAdapter } from "./chatwork";
import { localeStorage } from "~/.server/request-context";

const token = Buffer.from("webhook secret").toString("base64");
const event = { message_id: "123", room_id: 42, account_id: 9, body: "[To:7] hello", send_time: 100, update_time: 0 };

function request(body: string, valid = true) {
  const signature = createHmac("sha256", valid ? Buffer.from(token, "base64") : "wrong").update(body).digest("base64");
  return new Request("https://example.com/webhook", { method: "POST", body, headers: { "x-chatworkwebhooksignature": signature } });
}

afterEach(() => vi.unstubAllGlobals());

describe("Chatwork adapter", () => {
  it("verifies webhooks and dispatches normalized messages and updates", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ account_id: 7 }))).mockResolvedValueOnce(new Response(JSON.stringify({ name: "Direct", type: "direct" }))));
    const processMessage = vi.fn().mockResolvedValue(undefined);
    const processMessageUpdated = vi.fn().mockResolvedValue(undefined);
    const chat = { processMessage, processMessageUpdated, getState: () => ({ get: vi.fn().mockResolvedValue(null) }) } as unknown as ChatInstance;
    const adapter = createChatworkAdapter({ apiToken: "api", webhookToken: token });
    await adapter.initialize(chat);
    const body = JSON.stringify({ webhook_event_type: "message_created", webhook_event: event });
    expect((await adapter.handleWebhook(request(body, false))).status).toBe(401);
    expect(processMessage).not.toHaveBeenCalled();
    expect((await adapter.handleWebhook(request(body))).status).toBe(200);
    const parsed = await processMessage.mock.calls[0][2]();
    expect(parsed).toMatchObject({ id: "123", threadId: "chatwork:42", isMention: true, author: { userId: "9", isMe: false } });
    expect(parsed.metadata.dateSent).toEqual(new Date(100000));
    await adapter.handleWebhook(request(JSON.stringify({ webhook_event_type: "message_updated", webhook_event: { ...event, update_time: 110 } })));
    expect(processMessageUpdated).toHaveBeenCalledOnce();
  });

  it("uses the proper authentication and form data for posting", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ account_id: 7 }))).mockResolvedValueOnce(new Response(JSON.stringify({ message_id: "456" })));
    vi.stubGlobal("fetch", fetchMock);
    const set = vi.fn().mockResolvedValue(undefined);
    const adapter = createChatworkAdapter({ accessToken: "oauth", webhookToken: token });
    await adapter.initialize({ getState: () => ({ set }) } as unknown as ChatInstance);
    const sent = await adapter.postMessage("chatwork:42", "hello & goodbye");
    expect(sent.id).toBe("456");
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe("https://api.chatwork.com/v2/rooms/42/messages");
    expect(options.headers.get("Authorization")).toBe("Bearer oauth");
    expect(options.body.get("body")).toBe("hello & goodbye");
    expect(set).toHaveBeenCalledOnce();
  });
});


describe("Chatwork configuration schema", () => {
  it("requires a valid webhook token and localizes field metadata per request", () => {
    const schema = localeStorage.run("en", getChatworkConfigSchema);
    expect(schema.safeParse({ webhookToken: token }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ webhookToken: "not base64!" }).success).toBe(false);
    const english = schema.toJSONSchema({ target: "draft-7" });
    const japanese = localeStorage.run("ja", () => getChatworkConfigSchema().toJSONSchema({ target: "draft-7" }));
    expect(english).toMatchObject({ properties: { webhookToken: { title: "Chatwork webhook token" } } });
    expect(japanese).toMatchObject({ properties: { webhookToken: { title: "Chatwork Webhookトークン" } } });
    expect(english.required).toEqual(["webhookToken"]);
  });
});
