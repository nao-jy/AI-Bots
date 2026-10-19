import { db } from "./db";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { CodecTypes } from "../../src/prisma/contract.d.ts";
import { hashPassword, type AuthUser } from "./auth";
import type { EntityRecord } from "../types/entities";

const jsonb = (value: unknown) => value as CodecTypes["pg/jsonb@1"]["input"];

const platforms: Record<string, string> = {
  slack: "Slack",
  discord: "Discord",
  teams: "Microsoft Teams",
  line: "LINE",
};

const transports: Record<string, string> = {
  "streamable-http": "Streamable HTTP",
};

function timestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString("ja-JP");
}

function idList(value: string | null) {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .filter((item) => item.trim() !== "")
        .map(Number)
        .filter(Number.isInteger),
    ),
  ];
}

function record(
  id: number,
  updatedAt: string,
  fields: Record<string, string | number>,
): EntityRecord {
  return { id, updated: timestamp(updatedAt), ...fields };
}

export async function listBots(user: AuthUser) {
  const bots = await db.orm.public.Chatbot.where({ ownerId: user.id })
    .include("agent")
    .include("adapters", (links) => links.include("adapter"))
    .orderBy((bot) => bot.updatedAt.desc())
    .all();
  const agents = await db.orm.public.AgentDefinition.include("chatbot")
    .include("provider")
    .all();
  const adapters = await db.orm.public.ChatAdapter.where({
    ownerId: user.id,
  }).all();
  return {
    records: bots.map((bot) =>
      record(bot.id, bot.updatedAt, {
        name: bot.name,
        description: bot.description ?? "",
        agent: bot.agent?.name ?? "—",
        agentId: bot.agentId ?? "",
        adapterIds: bot.adapters.map((link) => link.adapterId).join(","),
        adapters:
          bot.adapters.map((link) => link.adapter.name).join("、") || "—",
        status: bot.isEnabled ? "稼働中" : "停止中",
      }),
    ),
    agentOptions: agents
      .filter(
        (agent) =>
          agent.provider.ownerId === user.id &&
          (!agent.chatbot ||
            (agent.chatbot.ownerId === user.id &&
              bots.some((bot) => bot.id === agent.chatbot!.id))),
      )
      .map((agent) => ({ label: agent.name, value: String(agent.id) })),
    adapterOptions: adapters.map((adapter) => ({
      label: adapter.name,
      value: String(adapter.id),
    })),
  };
}

export async function saveBot(
  user: AuthUser,
  id: number | null,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  const description = String(values.get("description") ?? "").trim();
  const agentValue = String(values.get("agentId") ?? "").trim();
  const agentId = agentValue ? Number(agentValue) : null;
  const adapterIds = idList(values.get("adapterIds")?.toString() ?? null);
  if (!name) return { error: "ボット名を入力してください。" };
  if (agentId !== null && !Number.isInteger(agentId))
    return { error: "エージェントを選択してください。" };
  if (agentId !== null) {
    const agent = await db.orm.public.AgentDefinition.where({ id: agentId })
      .include("provider")
      .first();
    if (!agent || agent.provider.ownerId !== user.id)
      return { error: "選択したエージェントが見つかりません。" };
  }
  if (agentId !== null) {
    const assignedBot = await db.orm.public.Chatbot.first({ agentId });
    if (
      assignedBot &&
      (assignedBot.ownerId !== user.id || assignedBot.id !== id)
    )
      return { error: "選択したエージェントは別のボットで使用されています。" };
  }
  const adapters = await db.orm.public.ChatAdapter.where({
    ownerId: user.id,
  }).all();
  const allowedAdapterIds = new Set(adapters.map((adapter) => adapter.id));
  if (adapterIds.some((adapterId) => !allowedAdapterIds.has(adapterId))) {
    return { error: "選択したアダプタを使用できません。" };
  }
  if (
    id !== null &&
    !(await db.orm.public.Chatbot.first({ id, ownerId: user.id }))
  )
    return { error: "ボットが見つかりません。" };

  await db.transaction(async (tx) => {
    let botId = id;
    if (botId === null) {
      const created = await tx.orm.public.Chatbot.create({
        name,
        description: description || null,
        agentId,
        ownerId: user.id,
      });
      botId = created.id;
    } else {
      await tx.orm.public.Chatbot.where({ id: botId, ownerId: user.id }).update(
        {
          name,
          description: description || null,
          agentId,
        },
      );
    }
    await tx.orm.public.ChatbotAdapter.where({ chatbotId: botId! }).delete();
    for (const adapterId of adapterIds) {
      await tx.orm.public.ChatbotAdapter.create({
        chatbotId: botId!,
        adapterId,
      });
    }
  });
  return { ok: true };
}

export async function deleteBot(user: AuthUser, id: number) {
  const bot = await db.orm.public.Chatbot.first({ id, ownerId: user.id });
  if (!bot) return false;
  await db.orm.public.Chatbot.where({ id, ownerId: user.id }).delete();
  return true;
}

export async function setBotEnabled(
  user: AuthUser,
  id: number,
  isEnabled: boolean,
) {
  if (!(await db.orm.public.Chatbot.first({ id, ownerId: user.id })))
    return false;
  await db.orm.public.Chatbot.where({ id, ownerId: user.id }).update({
    isEnabled,
  });
  return true;
}

export async function listAdapters(user: AuthUser) {
  const adapters = await db.orm.public.ChatAdapter.where({
    ownerId: user.id,
  }).all();
  return {
    records: adapters.map((adapter) => {
      const envs = decryptAdapterEnvs(adapter.envs);
      return record(adapter.id, adapter.updatedAt, {
        name: adapter.name,
        platform: platforms[adapter.platform] ?? adapter.platform,
        platformId: adapter.platform,
        envs: JSON.stringify(envs),
        envsConfigured: Object.keys(envs).length ? "設定済み" : "未設定",
      });
    }),
  };
}

function encryptCredential(credential: string) {
  const keyValue = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!keyValue)
    throw new Error(
      "認証情報を暗号化するには CREDENTIALS_ENCRYPTION_KEY を設定してください。",
    );
  const key = Buffer.from(keyValue, "base64");
  if (key.length !== 32)
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY は32バイトのbase64値にしてください。",
    );
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(credential, "utf8"),
    cipher.final(),
  ]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

function decryptCredential(value: string) {
  const keyValue = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!keyValue)
    throw new Error(
      "認証情報を復号するには CREDENTIALS_ENCRYPTION_KEY を設定してください。",
    );
  const key = Buffer.from(keyValue, "base64");
  if (key.length !== 32)
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY は32バイトのbase64値にしてください。",
    );
  const [ivValue, authTagValue, ciphertextValue] = value.split(".");
  if (!ivValue || !authTagValue || ciphertextValue === undefined)
    throw new Error("保存された認証情報を読み込めません。");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function encryptStringMap(values: Record<string, string>) {
  const encryptedValues: Record<string, string> = {};
  for (const [key, value] of Object.entries(values))
    if (key.trim()) encryptedValues[key.trim()] = encryptCredential(value);
  return { version: 1, encryptedValues };
}

function decryptEncryptedStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const envelope = value as {
    version?: number;
    encryptedValues?: Record<string, unknown>;
  };
  if (envelope.version !== 1 || !envelope.encryptedValues) return {};
  const decrypted: Record<string, string> = {};
  for (const [key, ciphertext] of Object.entries(envelope.encryptedValues))
    if (typeof ciphertext === "string")
      decrypted[key] = decryptCredential(ciphertext);
  return decrypted;
}

function decryptAdapterEnvs(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const envs = value as {
    version?: number;
    encryptedValues?: Record<string, unknown>;
    credentialCiphertext?: unknown;
  };
  if (envs.version === 1) return decryptEncryptedStringMap(value);
  if (typeof envs.credentialCiphertext === "string")
    return { ACCESS_TOKEN: decryptCredential(envs.credentialCiphertext) };
  return {};
}

function decryptMcpHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const recordValue = value as Record<string, unknown>;
  if (recordValue.version === 1 && "encryptedValues" in recordValue)
    return decryptEncryptedStringMap(value);
  return Object.fromEntries(
    Object.entries(recordValue).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

type ConnectionTestResult =
  | { ok: true; intent: "test"; message: string }
  | { ok: false; intent: "test"; error: string };

function testSuccess(message: string): ConnectionTestResult {
  return { ok: true, intent: "test", message };
}

function testFailure(error: string): ConnectionTestResult {
  return { ok: false, intent: "test", error };
}

function parseStringMap(value: FormDataEntryValue | null, label: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value ?? "{}").trim() || "{}");
  } catch {
    throw new Error(`${label}のJSON形式を確認してください。`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error(`${label}はキー・値のオブジェクトで入力してください。`);
  if (Object.values(parsed).some((item) => typeof item !== "string"))
    throw new Error(`${label}の値は文字列で入力してください。`);
  return parsed as Record<string, string>;
}

function parseObject(value: FormDataEntryValue | null, label: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value ?? "{}").trim() || "{}");
  } catch {
    throw new Error(`${label}のJSON形式を確認してください。`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error(`${label}にはオブジェクトを入力してください。`);
  return parsed as Record<string, unknown>;
}

async function requestTest(url: string, init?: RequestInit) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("接続先URLの形式を確認してください。");
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:")
    throw new Error("接続先URLにはHTTPまたはHTTPSを指定してください。");
  const response = await fetch(parsedUrl, {
    ...init,
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.text();
  if (!response.ok) {
    let detail = "";
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === "object") {
        const recordValue = parsed as Record<string, unknown>;
        const nested = recordValue.error;
        detail =
          typeof nested === "string"
            ? nested
            : nested &&
                typeof nested === "object" &&
                typeof (nested as Record<string, unknown>).message === "string"
              ? String((nested as Record<string, unknown>).message)
              : "";
      }
    } catch {
      // Keep the status based message when a server does not return JSON.
    }
    throw new Error(
      `接続先からHTTP ${response.status}が返されました。${detail ? ` ${detail}` : ""}`,
    );
  }
  return { response, body };
}

export async function testAdapter(user: AuthUser, values: FormData) {
  try {
    const platform = String(values.get("platformId") ?? "").trim();
    const envs = parseStringMap(values.get("envs"), "環境変数");
    const tokenByPlatform: Record<
      string,
      { key: string; url: string; auth: (token: string) => string }
    > = {
      slack: {
        key: "SLACK_BOT_TOKEN",
        url: "https://slack.com/api/auth.test",
        auth: (token) => `Bearer ${token}`,
      },
      discord: {
        key: "DISCORD_BOT_TOKEN",
        url: "https://discord.com/api/v10/users/@me",
        auth: (token) => `Bot ${token}`,
      },
      teams: {
        key: "MICROSOFT_GRAPH_ACCESS_TOKEN",
        url: "https://graph.microsoft.com/v1.0/me",
        auth: (token) => `Bearer ${token}`,
      },
      line: {
        key: "LINE_CHANNEL_ACCESS_TOKEN",
        url: "https://api.line.me/v2/bot/info",
        auth: (token) => `Bearer ${token}`,
      },
    };
    const config = tokenByPlatform[platform];
    if (!config) return testFailure("対応していないプラットフォームです。");
    const token = envs[config.key] ?? envs.ACCESS_TOKEN ?? envs.BOT_TOKEN;
    if (!token)
      return testFailure(
        `環境変数「${config.key}」に認証トークンを入力してください。`,
      );
    const { body } = await requestTest(config.url, {
      headers: { Authorization: config.auth(token) },
    });
    if (platform === "slack") {
      const result: unknown = JSON.parse(body);
      if (
        !result ||
        typeof result !== "object" ||
        (result as { ok?: boolean }).ok !== true
      )
        return testFailure(
          `Slack認証に失敗しました: ${String((result as { error?: string })?.error ?? "不明なエラー")}`,
        );
    }
    return testSuccess(`${platforms[platform]}への接続と認証に成功しました。`);
  } catch (error) {
    return testFailure(
      error instanceof Error
        ? error.message
        : "アダプタへの接続に失敗しました。",
    );
  }
}

function providerBaseUrl(providerName: string, args: Record<string, unknown>) {
  const configured = args.baseURL ?? args.baseUrl ?? args.endpoint ?? args.url;
  if (typeof configured === "string" && configured.trim())
    return configured.trim();
  const defaults: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    groq: "https://api.groq.com/openai/v1",
    openrouter: "https://openrouter.ai/api/v1",
    xai: "https://api.x.ai/v1",
    togetherai: "https://api.together.xyz/v1",
    deepseek: "https://api.deepseek.com",
  };
  return defaults[providerName.toLowerCase()];
}

function authHeaders(headers: Record<string, string>) {
  return { ...headers };
}

async function runProviderTest(
  providerName: string,
  args: Record<string, unknown>,
  headers: Record<string, string>,
) {
  const baseUrl = providerBaseUrl(providerName, args);
  if (!baseUrl)
    throw new Error(
      "このプロバイダーの接続先が特定できません。プロバイダー引数に baseURL を設定してください。",
    );
  const url = `${baseUrl.replace(/\/$/, "")}/models`;
  await requestTest(url, { headers: authHeaders(headers) });
}

export async function testProvider(user: AuthUser, values: FormData) {
  try {
    const name = String(values.get("name") ?? "").trim();
    const providerName = String(values.get("providerName") ?? "").trim();
    if (!name || !providerName)
      return testFailure("接続名とプロバイダーを入力してください。");
    const args = parseObject(values.get("args"), "プロバイダー引数");
    const headers = parseStringMap(values.get("headers"), "HTTPヘッダー");
    await runProviderTest(providerName, args, headers);
    return testSuccess(`${name}への接続に成功しました。`);
  } catch (error) {
    return testFailure(
      error instanceof Error
        ? error.message
        : "プロバイダーへの接続に失敗しました。",
    );
  }
}

export async function testAgent(user: AuthUser, values: FormData) {
  try {
    const name = String(values.get("name") ?? "").trim();
    const providerId = Number(values.get("providerId"));
    const modelId = String(values.get("model_id") ?? "").trim();
    if (!Number.isInteger(providerId) || !modelId)
      return testFailure("プロバイダーとモデルIDを入力してください。");
    const provider = await db.orm.public.Provider.first({
      id: providerId,
      ownerId: user.id,
    });
    if (!provider) return testFailure("選択したプロバイダーが見つかりません。");
    const args = (
      provider.args && typeof provider.args === "object" ? provider.args : {}
    ) as Record<string, unknown>;
    const headers = decryptMcpHeaders(provider.headers);
    const options = parseObject(values.get("options"), "オプション");
    const baseUrl = providerBaseUrl(provider.providerName, args);
    if (!baseUrl)
      return testFailure(
        "このプロバイダーの接続先が特定できません。プロバイダー引数に baseURL を設定してください。",
      );
    await requestTest(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(headers) },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "Reply with OK." }],
        max_tokens: 8,
        ...options,
      }),
    });
    return testSuccess(
      `${name || "エージェント"}のモデル「${modelId}」に接続できました。`,
    );
  } catch (error) {
    return testFailure(
      error instanceof Error
        ? error.message
        : "エージェントの接続テストに失敗しました。",
    );
  }
}

export async function testMcpServer(user: AuthUser, values: FormData) {
  try {
    const name = String(values.get("name") ?? "").trim();
    const endpoint = String(values.get("endpoint") ?? "").trim();
    const transport = String(values.get("transportId") ?? "").trim();
    if (!endpoint) return testFailure("エンドポイントを入力してください。");
    if (transport !== "streamable-http")
      return testFailure(
        "このトランスポートの接続テストには対応していません。",
      );
    const headers = parseStringMap(values.get("headers"), "HTTPヘッダー");
    const { body } = await requestTest(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "bot-manager", version: "1.0.0" },
        },
      }),
    });
    const payload = body.match(/^data:\s*(.+)$/m)?.[1] ?? body;
    const result: unknown = JSON.parse(payload);
    if (
      !result ||
      typeof result !== "object" ||
      "error" in result ||
      !(result as { result?: unknown }).result
    )
      return testFailure(
        "MCPサーバーから有効なinitialize応答がありませんでした。",
      );
    return testSuccess(`${name || "MCPサーバー"}とのMCP接続に成功しました。`);
  } catch (error) {
    return testFailure(
      error instanceof Error
        ? error.message
        : "MCPサーバーへの接続に失敗しました。",
    );
  }
}

export async function saveAdapter(
  user: AuthUser,
  id: number | null,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  const platform = String(values.get("platformId") ?? "").trim();
  const envsValue = String(values.get("envs") ?? "{}").trim();
  if (!name || !platform)
    return { error: "接続名とプラットフォームを入力してください。" };
  let envs: Record<string, string>;
  try {
    const parsed: unknown = JSON.parse(envsValue || "{}");
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.values(parsed).some((value) => typeof value !== "string")
    )
      return { error: "環境変数は文字列のキー・値ペアで入力してください。" };
    envs = parsed as Record<string, string>;
  } catch {
    return { error: "環境変数の形式を確認してください。" };
  }
  if (id !== null) {
    if (!(await db.orm.public.ChatAdapter.first({ id, ownerId: user.id })))
      return { error: "アダプタが見つかりません。" };
  }
  let encryptedEnvs: ReturnType<typeof encryptStringMap>;
  try {
    encryptedEnvs = encryptStringMap(envs);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "環境変数を暗号化できませんでした。",
    };
  }
  const storedEnvs = jsonb(encryptedEnvs);
  if (id === null) {
    await db.orm.public.ChatAdapter.create({
      name,
      platform,
      ownerId: user.id,
      envs: storedEnvs,
    });
  } else {
    await db.orm.public.ChatAdapter.where({ id, ownerId: user.id }).update({
      name,
      platform,
      envs: storedEnvs,
    });
  }
  return { ok: true };
}

export async function deleteAdapter(user: AuthUser, id: number) {
  if (!(await db.orm.public.ChatAdapter.first({ id, ownerId: user.id })))
    return false;
  await db.orm.public.ChatAdapter.where({ id, ownerId: user.id }).delete();
  return true;
}

export async function listProviders(user: AuthUser) {
  const providers = await db.orm.public.Provider.where({ ownerId: user.id })
    .orderBy((provider) => provider.updatedAt.desc())
    .all();
  return {
    records: providers.map((provider) => {
      const headers = decryptMcpHeaders(provider.headers);
      return record(provider.id, provider.updatedAt, {
        name: provider.name,
        providerName: provider.providerName,
        args: JSON.stringify(provider.args ?? {}, null, 2),
        headers: JSON.stringify(headers, null, 2),
        headersConfigured: Object.keys(headers).length ? "設定済み" : "未設定",
      });
    }),
  };
}

export async function saveProvider(
  user: AuthUser,
  id: number | null,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  const providerName = String(values.get("providerName") ?? "").trim();
  const argsValue = String(values.get("args") ?? "{}").trim();
  const headersValue = String(values.get("headers") ?? "{}").trim();
  if (!name || !providerName)
    return { error: "接続名とプロバイダーを入力してください。" };
  let args: unknown;
  let headers: Record<string, string>;
  try {
    args = JSON.parse(argsValue || "{}");
    if (!args || typeof args !== "object" || Array.isArray(args))
      return { error: "プロバイダー引数にはオブジェクトを入力してください。" };
  } catch {
    return { error: "プロバイダー引数JSONの形式を確認してください。" };
  }
  try {
    const parsed: unknown = JSON.parse(headersValue || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return { error: "HTTPヘッダーにはオブジェクトを入力してください。" };
    if (Object.values(parsed).some((value) => typeof value !== "string"))
      return { error: "HTTPヘッダーの値は文字列で入力してください。" };
    headers = parsed as Record<string, string>;
  } catch {
    return { error: "HTTPヘッダーJSONの形式を確認してください。" };
  }
  if (
    id !== null &&
    !(await db.orm.public.Provider.first({ id, ownerId: user.id }))
  )
    return { error: "プロバイダーが見つかりません。" };
  const duplicate = await db.orm.public.Provider.first({
    ownerId: user.id,
    name,
  });
  if (duplicate && duplicate.id !== id)
    return { error: "同じ接続名のプロバイダーが既にあります。" };
  let encryptedHeaders: ReturnType<typeof encryptStringMap>;
  try {
    encryptedHeaders = encryptStringMap(headers);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "HTTPヘッダーを暗号化できませんでした。",
    };
  }
  const saved = {
    name,
    providerName,
    args: jsonb(args),
    headers: jsonb(encryptedHeaders),
  };
  if (id === null) {
    await db.orm.public.Provider.create({
      ...saved,
      ownerId: user.id,
    });
  } else {
    await db.orm.public.Provider.where({ id, ownerId: user.id }).update(saved);
  }
  return { ok: true };
}

export async function deleteProvider(user: AuthUser, id: number) {
  if (!(await db.orm.public.Provider.first({ id, ownerId: user.id })))
    return false;
  if (await db.orm.public.AgentDefinition.first({ providerId: id }))
    return false;
  await db.orm.public.Provider.where({ id, ownerId: user.id }).delete();
  return true;
}

export async function listAgents(user: AuthUser) {
  const agents = await db.orm.public.AgentDefinition.include(
    "mcpServers",
    (links) => links.include("mcpServer"),
  )
    .include("chatbot")
    .include("provider")
    .all();
  const ownedBots = await db.orm.public.Chatbot.where({
    ownerId: user.id,
  }).all();
  const ownedAgentIds = new Set(ownedBots.map((bot) => bot.agentId));
  const servers = await db.orm.public.McpServer.where({
    ownerId: user.id,
  }).all();
  const availableServerIds = new Set(servers.map((server) => server.id));
  return {
    records: agents
      .filter(
        (agent) =>
          agent.provider.ownerId === user.id &&
          (!agent.chatbot || ownedAgentIds.has(agent.id)),
      )
      .map((agent) => {
        const ownedLinks = agent.mcpServers.filter((link) =>
          availableServerIds.has(link.mcpServerId),
        );
        return record(agent.id, agent.updatedAt, {
          name: agent.name,
          model: agent.model_id,
          provider: agent.provider.name,
          mcpServerIds: ownedLinks.map((link) => link.mcpServerId).join(","),
          servers:
            ownedLinks.map((link) => link.mcpServer.name).join("、") || "—",
          options: JSON.stringify(agent.options ?? {}, null, 2),
          status: agent.chatbot
            ? `ボット「${agent.chatbot.name}」で利用中`
            : "未使用",
        });
      }),
    serverOptions: servers.map((server) => ({
      label: server.name,
      value: String(server.id),
    })),
    providerOptions: (
      await db.orm.public.Provider.where({ ownerId: user.id }).all()
    ).map((provider) => ({
      label: `${provider.name} (${provider.providerName})`,
      value: String(provider.id),
    })),
  };
}

export async function saveAgent(
  user: AuthUser,
  id: number | null,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  const providerId = Number(values.get("providerId"));
  const modelId = String(values.get("model_id") ?? "").trim();
  const optionsValue = String(values.get("options") ?? "{}").trim();
  const serverIds = idList(values.get("mcpServerIds")?.toString() ?? null);
  if (!name) return { error: "エージェント名を入力してください。" };
  if (!Number.isInteger(providerId) || !modelId)
    return { error: "プロバイダーとモデルIDを入力してください。" };
  if (
    !(await db.orm.public.Provider.first({
      id: providerId,
      ownerId: user.id,
    }))
  )
    return { error: "選択したプロバイダーが見つかりません。" };
  let options: unknown;
  try {
    options = JSON.parse(optionsValue || "{}");
    if (!options || typeof options !== "object" || Array.isArray(options))
      return { error: "オプションにはJSONオブジェクトを入力してください。" };
  } catch {
    return { error: "オプションJSONの形式を確認してください。" };
  }
  const servers = await db.orm.public.McpServer.where({
    ownerId: user.id,
  }).all();
  const ownedBots = await db.orm.public.Chatbot.where({
    ownerId: user.id,
  }).all();
  const allowedIds = new Set(servers.map((server) => server.id));
  if (serverIds.some((serverId) => !allowedIds.has(serverId)))
    return { error: "選択したMCPサーバーを使用できません。" };
  if (id !== null) {
    const existing = await db.orm.public.AgentDefinition.where({ id })
      .include("provider")
      .first();
    if (!existing || existing.provider.ownerId !== user.id)
      return { error: "エージェントが見つかりません。" };
  }
  if (id !== null) {
    const assignedBot = await db.orm.public.Chatbot.first({ agentId: id });
    if (assignedBot && !ownedBots.some((bot) => bot.id === assignedBot.id))
      return { error: "このエージェントを編集する権限がありません。" };
  }
  const valuesToSave = {
    name,
    providerId,
    model_id: modelId,
    options: jsonb(options),
  };
  await db.transaction(async (tx) => {
    const agentId =
      id === null
        ? (await tx.orm.public.AgentDefinition.create(valuesToSave)).id
        : id;
    if (id !== null)
      await tx.orm.public.AgentDefinition.where({ id }).update(valuesToSave);
    const links = await tx.orm.public.AgentMcpServer.where({ agentId }).all();
    for (const link of links) {
      if (!serverIds.includes(link.mcpServerId))
        await tx.orm.public.AgentMcpServer.where({
          agentId,
          mcpServerId: link.mcpServerId,
        }).delete();
    }
    for (const serverId of serverIds) {
      if (!links.some((link) => link.mcpServerId === serverId))
        await tx.orm.public.AgentMcpServer.create({
          agentId,
          mcpServerId: serverId,
        });
    }
  });
  return { ok: true };
}

export async function deleteAgent(user: AuthUser, id: number) {
  const agent = await db.orm.public.AgentDefinition.where({ id })
    .include("provider")
    .first();
  if (!agent || agent.provider.ownerId !== user.id) return false;
  const bot = await db.orm.public.Chatbot.first({ agentId: id });
  if (bot) return false;
  const ownServers = await db.orm.public.McpServer.where({
    ownerId: user.id,
  }).all();
  const links = await db.orm.public.AgentMcpServer.where({ agentId: id }).all();
  if (
    links.some(
      (link) => !ownServers.some((server) => server.id === link.mcpServerId),
    )
  )
    return false;
  await db.orm.public.AgentDefinition.where({ id }).delete();
  return true;
}

export async function listMcpServers(user: AuthUser) {
  const servers = await db.orm.public.McpServer.where({ ownerId: user.id })
    .orderBy((server) => server.updatedAt.desc())
    .all();
  return {
    records: servers.map((server) => {
      return record(server.id, server.updatedAt, {
        name: server.name,
        description: server.description ?? "",
        transport: transports[server.transport] ?? server.transport,
        transportId: server.transport,
        endpoint: server.endpoint ?? "",
        headers: JSON.stringify(decryptMcpHeaders(server.headers), null, 2),
        status: server.endpoint ? "接続先登録済み" : "接続先未設定",
      });
    }),
  };
}

export async function saveMcpServer(
  user: AuthUser,
  id: number | null,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  const description = String(values.get("description") ?? "").trim();
  const transport = String(values.get("transportId") ?? "").trim();
  const endpoint = String(values.get("endpoint") ?? "").trim();
  const headersValue = String(values.get("headers") ?? "{}").trim();
  if (!name || !transport)
    return { error: "サーバー名とトランスポートを入力してください。" };
  let headers: Record<string, string>;
  try {
    const parsed: unknown = JSON.parse(headersValue || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return { error: "ヘッダーJSONにはオブジェクトを入力してください。" };
    if (Object.values(parsed).some((value) => typeof value !== "string"))
      return { error: "ヘッダーの値は文字列で入力してください。" };
    headers = parsed as Record<string, string>;
  } catch {
    return { error: "ヘッダーJSONの形式を確認してください。" };
  }
  if (
    id !== null &&
    !(await db.orm.public.McpServer.first({ id, ownerId: user.id }))
  )
    return { error: "MCPサーバーが見つかりません。" };
  let encryptedHeaders: ReturnType<typeof encryptStringMap>;
  try {
    encryptedHeaders = encryptStringMap(headers);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "HTTPヘッダーを暗号化できませんでした。",
    };
  }
  const saved = {
    name,
    description: description || null,
    transport,
    endpoint: endpoint || null,
    headers: jsonb(encryptedHeaders),
  };
  if (id === null)
    await db.orm.public.McpServer.create({ ...saved, ownerId: user.id });
  else
    await db.orm.public.McpServer.where({ id, ownerId: user.id }).update(saved);
  return { ok: true };
}

export async function deleteMcpServer(user: AuthUser, id: number) {
  if (!(await db.orm.public.McpServer.first({ id, ownerId: user.id })))
    return false;
  await db.orm.public.McpServer.where({ id, ownerId: user.id }).delete();
  return true;
}

export async function listUsers() {
  const users = await db.orm.public.User.orderBy((user) =>
    user.createdAt.asc(),
  ).all();
  return users.map((user) =>
    record(user.id, user.updatedAt, {
      name: user.name ?? "",
      email: user.email,
    }),
  );
}

export async function saveUser(id: number | null, values: FormData) {
  const name = String(values.get("name") ?? "").trim();
  const email = String(values.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(values.get("password") ?? "");
  if (!name || !/^\S+@\S+\.\S+$/.test(email))
    return { error: "表示名と有効なメールアドレスを入力してください。" };
  if (id === null) {
    if (password.length < 12)
      return { error: "パスワードは12文字以上で入力してください。" };
    await db.orm.public.User.create({
      name,
      email,
      passwordHash: await hashPassword(password),
    });
  } else {
    if (!(await db.orm.public.User.first({ id })))
      return { error: "ユーザーが見つかりません。" };
    if (password && password.length < 12)
      return { error: "パスワードは12文字以上で入力してください。" };
    await db.orm.public.User.where({ id }).update({
      name,
      email,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    });
  }
  return { ok: true };
}

export async function deleteUser(id: number, currentUserId: number) {
  if (id === currentUserId) return false;
  if (!(await db.orm.public.User.first({ id }))) return false;
  await db.orm.public.User.where({ id }).delete();
  return true;
}
