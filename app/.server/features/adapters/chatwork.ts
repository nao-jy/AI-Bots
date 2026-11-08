import { createHmac, timingSafeEqual } from "node:crypto";
import {
  BaseFormatConverter,
  Message,
  NotImplementedError,
  toPlainText,
} from "chat";
import type {
  Adapter,
  AdapterPostableMessage,
  ChatInstance,
  FetchOptions,
  FetchResult,
  FormattedContent,
  RawMessage,
  ThreadInfo,
  WebhookOptions,
} from "chat";
import z from "zod";
import { t } from "~/.server/i18n";

export interface ChatworkAdapterConfig {
  /** A Chatwork API token, or an OAuth access token. */
  apiToken?: string;
  accessToken?: string;
  /** Base64-encoded token from the Chatwork webhook settings. */
  webhookToken: string;
  userName?: string;
}

export interface ChatworkThreadId {
  roomId: string;
}

export interface ChatworkMessage {
  message_id: string;
  room_id: number | string;
  account_id?: number;
  from_account_id?: number;
  to_account_id?: number;
  account?: { account_id: number; name: string };
  body: string;
  send_time: number;
  update_time: number;
}

class ChatworkFormatConverter extends BaseFormatConverter {
  fromAst(ast: FormattedContent): string {
    return toPlainText(ast);
  }
  toAst(text: string): FormattedContent {
    return {
      type: "root",
      children: [
        { type: "paragraph", children: [{ type: "text", value: text }] },
      ],
    };
  }
}

export class ChatworkAdapter implements Adapter<
  ChatworkThreadId,
  ChatworkMessage
> {
  readonly name = "chatwork";
  readonly userName: string;
  botUserId?: string;
  private chat?: ChatInstance;
  private readonly converter = new ChatworkFormatConverter();
  private readonly sent = new Set<string>();
  private readonly roomTypes = new Map<string, string>();

  constructor(private readonly config: ChatworkAdapterConfig) {
    if (!config.apiToken && !config.accessToken)
      throw new Error("Chatwork apiToken or accessToken is required");
    if (config.apiToken && config.accessToken)
      throw new Error("Specify either apiToken or accessToken");
    if (
      !config.webhookToken ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        config.webhookToken,
      )
    ) {
      throw new Error("Chatwork webhookToken must be a Base64-encoded token");
    }
    this.userName = config.userName ?? "chatwork";
  }

  private async api<T>(
    path: string,
    method = "GET",
    body?: URLSearchParams,
  ): Promise<T> {
    const headers = new Headers({ Accept: "application/json" });
    if (this.config.apiToken)
      headers.set("X-ChatWorkToken", this.config.apiToken);
    else headers.set("Authorization", `Bearer ${this.config.accessToken}`);
    if (body) headers.set("Content-Type", "application/x-www-form-urlencoded");
    const response = await fetch(`https://api.chatwork.com/v2${path}`, {
      method,
      headers,
      body,
    });
    if (!response.ok)
      throw new Error(
        `Chatwork API ${method} ${path} failed (${response.status})`,
      );
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async initialize(chat: ChatInstance): Promise<void> {
    const me = await this.api<{ account_id: number }>("/me");
    this.botUserId = String(me.account_id);
    this.chat = chat;
  }

  encodeThreadId({ roomId }: ChatworkThreadId): string {
    if (!/^\d+$/.test(roomId)) throw new Error("Invalid Chatwork room ID");
    return `chatwork:${roomId}`;
  }
  decodeThreadId(threadId: string): ChatworkThreadId {
    const match = /^chatwork:(\d+)$/.exec(threadId);
    if (!match) throw new Error(`Invalid Chatwork thread ID: ${threadId}`);
    return { roomId: match[1] };
  }
  channelIdFromThreadId(threadId: string): string {
    return this.encodeThreadId(this.decodeThreadId(threadId));
  }

  parseMessage(raw: ChatworkMessage): Message<ChatworkMessage> {
    const userId = String(
      raw.account?.account_id ?? raw.account_id ?? raw.from_account_id,
    );
    const isMe = this.sent.has(`${raw.room_id}:${raw.message_id}`);
    const name = raw.account?.name ?? userId;
    const text = raw.body;
    return new Message({
      id: String(raw.message_id),
      threadId: this.encodeThreadId({ roomId: String(raw.room_id) }),
      text,
      formatted: this.converter.toAst(text),
      raw,
      author: {
        userId,
        userName: name,
        fullName: name,
        isBot: isMe ? true : "unknown",
        isMe,
      },
      metadata: {
        dateSent: new Date(raw.send_time * 1000),
        edited: !!raw.update_time,
        ...(raw.update_time
          ? { editedAt: new Date(raw.update_time * 1000) }
          : {}),
      },
      attachments: [],
      ...(raw.to_account_id !== undefined
        ? { isMention: String(raw.to_account_id) === this.botUserId }
        : {}),
    });
  }

  async handleWebhook(
    request: Request,
    options?: WebhookOptions,
  ): Promise<Response> {
    const body = await request.text();
    const signature =
      request.headers.get("x-chatworkwebhooksignature") ??
      new URL(request.url).searchParams.get("chatwork_webhook_signature");
    const expected = createHmac(
      "sha256",
      Buffer.from(this.config.webhookToken, "base64"),
    )
      .update(body)
      .digest();
    const actual = Buffer.from(signature ?? "", "base64");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return new Response("Invalid signature", { status: 401 });
    let payload: { webhook_event_type: string; webhook_event: ChatworkMessage };
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    if (!this.chat)
      return new Response("Adapter not initialized", { status: 503 });
    const type = payload?.webhook_event_type;
    if (
      type !== "message_created" &&
      type !== "mention_to_me" &&
      type !== "message_updated"
    )
      return new Response("OK");
    const event = payload.webhook_event;
    if (
      !event ||
      !/^\d+$/.test(String(event.room_id)) ||
      typeof event.message_id !== "string" ||
      typeof event.body !== "string" ||
      typeof event.send_time !== "number" ||
      typeof (event.account_id ?? event.from_account_id) !== "number"
    )
      return new Response("Invalid event", { status: 400 });
    const threadId = this.encodeThreadId({ roomId: String(event.room_id) });
    const factory = async () => {
      if (!this.roomTypes.has(String(event.room_id)))
        await this.fetchThread(threadId);
      const message = this.parseMessage(event);
      if (
        await this.chat!.getState().get<boolean>(
          this.sentKey(threadId, event.message_id),
        )
      ) {
        message.author.isMe = true;
        message.author.isBot = true;
      }
      if (type === "mention_to_me")
        message.isMention = String(event.to_account_id) === this.botUserId;
      else if (this.botUserId)
        message.isMention = new RegExp(`\\[To:${this.botUserId}\\]`, "i").test(
          event.body,
        );
      return message;
    };
    if (type === "message_updated")
      void this.chat.processMessageUpdated(
        { adapter: this, threadId, message: factory },
        options,
      );
    else void this.chat.processMessage(this, threadId, factory, options);
    return new Response("OK");
  }

  private sentKey(threadId: string, messageId: string): string {
    return `chatwork:sent:${this.botUserId}:${threadId}:${messageId}`;
  }
  private messagePath(threadId: string, messageId?: string): string {
    const { roomId } = this.decodeThreadId(threadId);
    if (messageId !== undefined && !/^\d+$/.test(messageId))
      throw new Error("Invalid Chatwork message ID");
    return `/rooms/${roomId}/messages${messageId === undefined ? "" : `/${messageId}`}`;
  }
  async postMessage(
    threadId: string,
    message: AdapterPostableMessage,
  ): Promise<RawMessage<ChatworkMessage>> {
    const text = this.converter.renderPostable(message);
    const result = await this.api<{ message_id: string }>(
      this.messagePath(threadId),
      "POST",
      new URLSearchParams({ body: text }),
    );
    this.sent.add(
      `${this.decodeThreadId(threadId).roomId}:${result.message_id}`,
    );
    await this.chat
      ?.getState()
      .set(
        this.sentKey(threadId, result.message_id),
        true,
        30 * 24 * 60 * 60 * 1000,
      );
    return {
      id: result.message_id,
      threadId,
      raw: {
        ...result,
        room_id: this.decodeThreadId(threadId).roomId,
        body: text,
        send_time: Math.floor(Date.now() / 1000),
        update_time: 0,
      },
    };
  }
  async editMessage(
    threadId: string,
    messageId: string,
    message: AdapterPostableMessage,
  ): Promise<RawMessage<ChatworkMessage>> {
    const text = this.converter.renderPostable(message);
    await this.api(
      this.messagePath(threadId, messageId),
      "PUT",
      new URLSearchParams({ body: text }),
    );
    return {
      id: messageId,
      threadId,
      raw: {
        message_id: messageId,
        room_id: this.decodeThreadId(threadId).roomId,
        body: text,
        send_time: Math.floor(Date.now() / 1000),
        update_time: Math.floor(Date.now() / 1000),
      },
    };
  }
  async deleteMessage(threadId: string, messageId: string): Promise<void> {
    await this.api(this.messagePath(threadId, messageId), "DELETE");
  }
  async fetchMessages(
    threadId: string,
    options: FetchOptions = {},
  ): Promise<FetchResult<ChatworkMessage>> {
    if (options.cursor)
      throw new Error("Chatwork does not support message history pagination");
    const roomId = this.decodeThreadId(threadId).roomId;
    const data = await this.api<Omit<ChatworkMessage, "room_id">[] | undefined>(
      `${this.messagePath(threadId)}?force=1`,
    );
    const messages = (data ?? [])
      .map((raw) => this.parseMessage({ ...raw, room_id: roomId }))
      .sort(
        (a, b) => a.metadata.dateSent.getTime() - b.metadata.dateSent.getTime(),
      );
    const limit = options.limit ?? 100;
    return {
      messages:
        options.direction === "forward"
          ? messages.slice(0, limit)
          : messages.slice(-limit),
    };
  }
  async fetchThread(threadId: string): Promise<ThreadInfo> {
    const { roomId } = this.decodeThreadId(threadId);
    const room = await this.api<{ name: string; type: string }>(
      `/rooms/${roomId}`,
    );
    this.roomTypes.set(roomId, room.type);
    return {
      id: threadId,
      channelId: threadId,
      channelName: room.name,
      isDM: room.type === "direct",
      metadata: { ...room },
    };
  }
  isDM(threadId: string): boolean {
    return (
      this.roomTypes.get(this.decodeThreadId(threadId).roomId) === "direct"
    );
  }
  renderFormatted(content: FormattedContent): string {
    return this.converter.fromAst(content);
  }
  async startTyping(): Promise<void> {
    /* Chatwork has no typing indicator API. */
  }
  async addReaction(): Promise<void> {
    throw new NotImplementedError(
      "Chatwork does not support reactions via its API",
      "addReaction",
    );
  }
  async removeReaction(): Promise<void> {
    throw new NotImplementedError(
      "Chatwork does not support reactions via its API",
      "removeReaction",
    );
  }
}

export function createChatworkAdapter(
  config: ChatworkAdapterConfig,
): ChatworkAdapter {
  return new ChatworkAdapter(config);
}

/** Build the schema per request so field labels use the active locale. */
export function getChatworkConfigSchema() {
  return z.object({
    apiToken: z
      .string()
      .min(1)
      .optional()
      .meta({
        title: t("server.chatworkApiToken"),
        description: t("server.chatworkApiTokenDescription"),
      }),
    accessToken: z
      .string()
      .min(1)
      .optional()
      .meta({
        title: t("server.chatworkAccessToken"),
        description: t("server.chatworkAccessTokenDescription"),
      }),
    webhookToken: z
      .string()
      .min(1)
      .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
      .meta({
        title: t("server.chatworkWebhookToken"),
        description: t("server.chatworkWebhookTokenDescription"),
      }),
    userName: z
      .string()
      .optional()
      .meta({
        title: t("server.chatworkUserName"),
        description: t("server.chatworkUserNameDescription"),
      }),
  });
}
