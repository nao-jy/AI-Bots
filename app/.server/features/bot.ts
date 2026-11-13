import { createMCPClient } from "@ai-sdk/mcp";
import { generateText, stepCountIs, type ModelMessage, type ToolSet } from "ai";
import { toAiMessages } from "chat/ai";
import { Message, parseMarkdown, type Chat, type Thread } from "chat";
import { randomUUID } from "node:crypto";
import {
  createPersistentSandboxInstance,
  getChatBotSandbox,
  getPersistentSandboxInstance,
} from "../repository/sandboxes";
import type { DataPersistenceScope } from "./data-persistence-scope";
import {
  decryptMcpContext,
  decryptMcpHeaders,
  jsonbToStringRecord,
} from "../utils";
import { getModelInfo } from "./provider";
import { getAvailableBot } from "../repository/bots";
import { getMcpClient } from "./mcp";
import {
  getMcpCredential,
  resolveMcpCredentials,
  usesUpstreamOAuth,
} from "./mcp-credentials";
import { registerMcpFile } from "./mcp-file";
import { getMcpContextSchema } from "./mcp-schema";
import { getSandboxTools } from "./toolsets/sandbox";
import { getSandbox } from "./sandboxes";
import { getFileParseTools } from "./toolsets/file-parse";
import { appLogger } from "../logger/app-logger";
import { conversationLogger } from "../logger/conversation-logger";
import { insertUsage } from "../repository/agents";
import { getExceededRateLimit } from "../repository/rate-limits";
import { getChatTools } from "./toolsets/chat-tools";
import type { FileHandleReaderMap } from "./toolsets/helpers/file-handle";
import { getThreadOAuthTools } from "./toolsets/thread-oauth";
import { getThreadOAuthAuthentication } from "../repository/thread-oauth";
import { getOwnedOAuthClient } from "../repository/oauth";
import { ApiFileSystem } from "./filesystem/api";
import { storageConfig } from "./filesystem/config";
import { db } from "../repository/db";
import { buildMemoryPrompt, getMemoryTools } from "./toolsets/memory";
import { getMemoryDirectory } from "./data-persistence-scope";
import { t } from "~/.server/i18n";
import {
  beginExecution,
  finishExecution,
  type ExecutionOutcome,
  type ExecutionSource,
} from "../repository/executions";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeToolName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getScopedIds(
  scope: DataPersistenceScope,
  chatbotId: string,
  adapterId: string,
  threadId: string,
) {
  switch (scope) {
    case "bot": {
      return {
        chatbotId: chatbotId,
        adapterId: null,
        threadId: null,
      };
    }
    case "thread": {
      return {
        chatbotId: chatbotId,
        adapterId: adapterId,
        threadId: threadId,
      };
    }
  }
  return null;
}

async function getBotSandbox(
  organizationId: string,
  chatbotId: string,
  chatbotScope: DataPersistenceScope,
  adapterId: string,
  threadId: string,
) {
  const sandbox = await getChatBotSandbox(chatbotId, organizationId);
  if (!sandbox) return null;

  const scopedIds = getScopedIds(
    chatbotScope,
    chatbotId,
    adapterId,
    threadId,
  );

  const sandboxProvider = await getSandbox(sandbox.apiId);
  if (!sandboxProvider) return null;

  if (scopedIds !== null) {
    const persistentInstance = await getPersistentSandboxInstance(
      sandbox.id,
      chatbotScope,
      scopedIds.threadId,
      scopedIds.adapterId,
      scopedIds.chatbotId,
    );
    if (persistentInstance) {
      const info = await sandboxProvider.getBashSandbox(
        persistentInstance.instanceId,
        jsonbToStringRecord(sandbox.envs),
        [...sandbox.allowedDomainList],
        [...sandbox.initCommands],
      );
      return {
        instanceId: persistentInstance.instanceId,
        isTurnScoped: false,
        sandboxProvider,
        bashSandbox: info.sandbox,
      };
    }
  }
  const info = await sandboxProvider.getBashSandbox(
    null,
    jsonbToStringRecord(sandbox.envs),
    [...sandbox.allowedDomainList],
    [...sandbox.initCommands],
  );
  if (!info.createdInstanceId) {
    throw new Error(`failed to create sandbox for chatbot ${chatbotId}`);
  }

  try {
    if (scopedIds !== null) {
      await createPersistentSandboxInstance({
        instanceId: info.createdInstanceId,
        sandboxId: sandbox.id,
        chatbotId: scopedIds.chatbotId,
        adapterId: scopedIds.adapterId,
        threadId: scopedIds.threadId,
      });
    }
  } catch (error) {
    await sandboxProvider.destroySandbox(info.createdInstanceId);
    throw error;
  }

  return {
    instanceId: info.createdInstanceId,
    isTurnScoped: chatbotScope === "nopersistence",
    sandboxProvider,
    bashSandbox: info.sandbox,
  };
}

async function processBotMessage(
  chat: Chat,
  botId: string,
  adapterId: string,
  adapterPlatform: string,
  thread: Thread<Record<string, unknown>, unknown>,
  message: Message<unknown>,
  source: ExecutionSource,
  scheduledExecutionId: string | null = null,
  publicOrigin?: string,
) {
  const mcpClients: Array<Awaited<ReturnType<typeof createMCPClient>>> = [];
  let turnSandbox: Awaited<ReturnType<typeof getBotSandbox>> = null;
  let replied = false;
  let onFailedMessage = "Sorry, we could not generate an answer.";
  let executionId = scheduledExecutionId;
  let usageId: number | null = null;
  let phase: "configuration" | "processing" | "delivery" = "configuration";
  let outcome: ExecutionOutcome = {
    status: "failed",
    errorCode: "processing_error",
  };
  try {
    const chatbot = await getAvailableBot(botId);
    const agent = chatbot?.agent;

    if (chatbot && !executionId && source !== "schedule") {
      executionId = await beginExecution({
        organizationId: chatbot.organizationId,
        chatbotId: chatbot.id,
        agentId: agent?.id,
        adapterId,
        source,
        threadId: thread.id,
      });
    }

    if (
      !chatbot ||
      !agent ||
      agent.provider.organizationId !== chatbot.organizationId
    ) {
      outcome = { status: "failed", errorCode: "configuration_error" };
      await thread.post("Service Unavailable");
      return outcome;
    }
    onFailedMessage = chatbot.onFailedMessage;
    const exceededMessage = await getExceededRateLimit(
      chatbot.organizationId,
      chatbot.id,
      agent.id,
      agent.providerId,
      thread.id,
    );
    if (exceededMessage) {
      phase = "delivery";
      await thread.post(exceededMessage);
      replied = true;
      outcome = { status: "skipped", errorCode: "rate_limited" };
      return outcome;
    }

    const modelInfo = getModelInfo(
      agent.provider.providerName,
      asRecord(agent.provider.args),
      decryptMcpHeaders(agent.provider.headers),
      asRecord(agent.options),
      agent.modelId,
    );
    if (!modelInfo) {
      throw new Error(
        `Unsupported model provider: ${agent.provider.providerName}`,
      );
    }

    const oauthClientIds = new Set<string>();
    for (const link of chatbot.mcpServers)
      if (link.oauthClientId) oauthClientIds.add(link.oauthClientId);
    const oauthClients = new Map<string, string>();
    for (const id of oauthClientIds) {
      const client = await getOwnedOAuthClient(id, chatbot.organizationId);
      if (client) oauthClients.set(id, client.name);
    }
    const oauthScope = {
      organizationId: chatbot.organizationId,
      chatbotId: chatbot.id,
      adapterId,
      authorId: message.author.userId,
    };
    const missingOAuth = new Set<string>();
    const resolveThreadAuth = async (clientId: string) => {
      if (source === "schedule" || !oauthScope.authorId) {
        missingOAuth.add(clientId);
        return null;
      }
      const authentication = await getThreadOAuthAuthentication({
        ...oauthScope,
        oauthClientId: clientId,
      });
      if (authentication) {
        try {
          await getMcpCredential(authentication.id);
          return authentication.id;
        } catch {
          // The configured account needs reconnecting; allow other tools to run.
        }
      }
      missingOAuth.add(clientId);
      return null;
    };
    const fileHandles: FileHandleReaderMap = new Map();
    const memoryDirectory = getMemoryDirectory(
      "/",
      chatbot.organizationId,
      chatbot.id,
      chatbot.dataPersistenceScope,
      adapterId,
      thread.id,
    );
    const fsLink = await db.orm.aibot.ChatBotFileSystem.first({
      chatbotId: chatbot.id,
      organizationId: chatbot.organizationId,
    });
    const fileSystemApi = fsLink
      ? await db.orm.aibot.FileSystemAPI.first({
          id: fsLink.sandboxId,
          organizationId: chatbot.organizationId,
        })
      : null;
    const fsContext = fileSystemApi
      ? decryptMcpContext(fileSystemApi.context)
      : null;
    const memoryFs = memoryDirectory
      ? new ApiFileSystem(
          fsContext
            ? (fsContext as unknown as import("./filesystem/api").FileSystemConfig)
            : storageConfig("MEMORY", ""),
          `memory/${memoryDirectory.slice(1)}`,
          fileSystemApi
            ? {
                endpoint: fileSystemApi.endpoint,
                headers: decryptMcpHeaders(fileSystemApi.headers),
              }
            : undefined,
        )
      : null;
    const tools = {
      ...getChatTools(
        chat,
        adapterPlatform,
        thread,
        fileHandles,
        publicOrigin,
        chatbot.organizationId,
      ),
      ...getFileParseTools(fileHandles),
      ...(memoryFs
        ? getMemoryTools(memoryFs, {
            onUnexpectedError: (error, toolName) =>
              appLogger.error(
                `Memory tool ${toolName} failed for chatbot ${botId}`,
                error,
              ),
          })
        : {}),
      ...(oauthClients.size && source !== "schedule" && oauthScope.authorId
        ? getThreadOAuthTools(thread, oauthScope, oauthClients)
        : {}),
    } as ToolSet;

    turnSandbox = await getBotSandbox(
      chatbot.organizationId,
      chatbot.id,
      chatbot.dataPersistenceScope,
      adapterId,
      thread.id,
    );
    if (turnSandbox) {
      Object.assign(
        tools,
        await getSandboxTools(turnSandbox.bashSandbox, fileHandles),
      );
    }

    for (const link of chatbot.mcpServers) {
      const server = link.mcpServer;
      if (server.organizationId !== chatbot.organizationId) continue;
      if (!server.endpoint) {
        throw new Error(`MCP server "${server.name}" has no endpoint`);
      }
      if (server.transport !== "http") {
        throw new Error(
          `Unsupported MCP transport "${server.transport}" for "${server.name}"`,
        );
      }

      const authId = link.oauthClientId
        ? await resolveThreadAuth(link.oauthClientId)
        : link.authId;
      if (link.oauthClientId && !authId) continue;
      const headers = decryptMcpHeaders(server.headers);
      const schema =
        authId && server.contextEndpoint
          ? await getMcpContextSchema(
              server.contextEndpoint,
              headers,
              server.endpoint,
            )
          : null;
      const upstreamOAuth = usesUpstreamOAuth(schema);
      const client = await getMcpClient(
        server.transport,
        server.endpoint,
        headers,
        authId,
        decryptMcpContext(link.context),
        upstreamOAuth,
      );
      mcpClients.push(client);

      const mcpTools = await client.tools();
      const authName = link.oauthClientId
        ? `_thread_${link.oauthClientId}`
        : link.authentication
          ? `_${link.authentication.name}`
          : "";
      for (const [name, tool] of Object.entries(mcpTools)) {
        const execute = tool.execute;
        tools[`mcp${authName}_${server.id}_${safeToolName(name)}`] = execute
          ? {
              ...tool,
              execute: async (input, options) =>
                registerMcpFile(
                  await execute(input, options),
                  fileHandles,
                  server.endpoint!,
                  async () =>
                    (
                      await resolveMcpCredentials(
                        authId,
                        headers,
                        upstreamOAuth,
                      )
                    ).headers,
                ),
            }
          : tool;
      }
    }

    const currentDateTime = new Date().toISOString();
    let history: Message<unknown>[] = [];
    if (chatbot.lookbackMessages > 0) {
      try {
        const recentMessages = await thread.adapter.fetchMessages(thread.id, {
          limit: chatbot.lookbackMessages + 1,
        });
        history = recentMessages.messages
          .filter((historicalMessage) => historicalMessage.id !== message.id)
          .slice(-chatbot.lookbackMessages);
      } catch (error) {
        appLogger.warn(
          `Failed to fetch message history for chatbot ${botId}`,
          error,
        );
      }
    }
    const inputMessages: ModelMessage[] = [
      ...(await toAiMessages([...history, message])),
      {
        role: "user",
        content: t("server.runtimeThreadContext", {
          0: thread.id,
          1: currentDateTime,
        }),
      },
    ];
    phase = "processing";
    let maxStepsReached = false;
    const stepLimit = stepCountIs(chatbot.maxAgentSteps);
    const result = await generateText({
      model: modelInfo.model,
      providerOptions: modelInfo.options,
      system: [
        chatbot.instruction,
        memoryFs ? await buildMemoryPrompt(memoryFs) : "",
        missingOAuth.size
          ? `Some configured tools require OAuth before they can be used: ${[...missingOAuth].map((id) => `${oauthClients.get(id) ?? id} (${id})`).join(", ")}. ${source === "schedule" || !oauthScope.authorId ? "OAuth is unavailable because this execution has no invoking user." : "If needed for the user's request, use startThreadOAuth to post an authorization link and ask the user to retry after authorizing."}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      prompt: inputMessages,
      tools,
      stopWhen: (context) => {
        maxStepsReached = stepLimit(context) === true;
        return maxStepsReached;
      },
      onStepFinish: ({ toolResults }) => {
        if (
          toolResults.some(
            (toolResult) => toolResult.toolName === "postMessage",
          )
        ) {
          replied = true;
        }
      },
    });

    try {
      usageId = await insertUsage(
        chatbot.id,
        agent.id,
        agent.providerId,
        result.usage,
        result.toolResults,
        adapterPlatform,
        thread.id,
      );
    } catch (error) {
      appLogger.error(`Failed to insert usage for chatbot ${botId}`, error);
    }

    const postUsageExceededMessage = maxStepsReached
      ? null
      : await getExceededRateLimit(
          chatbot.organizationId,
          chatbot.id,
          agent.id,
          agent.providerId,
          thread.id,
        );
    if (postUsageExceededMessage && !replied) {
      phase = "delivery";
      await thread.post(postUsageExceededMessage);
      replied = true;
      outcome = { status: "skipped", errorCode: "rate_limited", usageId };
    }

    conversationLogger.info("conversation completed", {
      executionId,
      input: inputMessages,
      output: result.text,
      toolResults: result.toolResults.map(({ toolName, input, output }) => ({
        toolName,
        input,
        output,
      })),
      usageId: usageId,
      threadId: thread.id,
      adapterPlatform,
      chatbot: {
        id: chatbot.id,
        name: chatbot.name,
      },
      agent: {
        id: agent.id,
        name: agent.name,
        options: agent.options,
      },
      provider: {
        id: agent.provider.id,
        name: agent.provider.name,
        providerName: agent.provider.providerName,
      },
    });

    if (maxStepsReached) {
      outcome = { status: "failed", errorCode: "max_agent_steps", usageId };
      if (!replied && result.text.trim()) {
        try {
          await thread.post(result.text);
        } catch (error) {
          appLogger.error(
            `Failed to post partial response for execution ${executionId}`,
            error,
          );
        }
      }
      try {
        await thread.post(
          t("server.maxAgentStepsReached", { 0: chatbot.maxAgentSteps }),
        );
      } catch (error) {
        appLogger.error(
          `Failed to post step limit notice for execution ${executionId}`,
          error,
        );
      }
      return outcome;
    }

    if (!replied && result.text.trim()) {
      phase = "delivery";
      await thread.post(result.text);
      replied = true;
    }
    if (outcome.status !== "skipped") {
      outcome = replied
        ? { status: "succeeded", usageId }
        : { status: "failed", errorCode: "empty_response", usageId };
      if (!replied) {
        phase = "delivery";
        await thread.post(onFailedMessage);
      }
    }
  } catch (error) {
    outcome = {
      status: "failed",
      errorCode:
        phase === "delivery"
          ? "delivery_error"
          : phase === "configuration"
            ? "configuration_error"
            : "processing_error",
      usageId,
    };
    appLogger.error(
      `Failed to handle execution ${executionId ?? "unrecorded"} for chatbot ${botId}`,
      error,
    );
    if (!replied) {
      try {
        await thread.post(onFailedMessage);
      } catch (replyError) {
        appLogger.error(
          `Failed to post mention error for chatbot ${botId}`,
          replyError,
        );
      }
    }
  } finally {
    if (turnSandbox?.isTurnScoped && turnSandbox.sandboxProvider) {
      try {
        await turnSandbox.sandboxProvider.destroySandbox(
          turnSandbox.instanceId,
        );
      } catch (error) {
        appLogger.error(
          `Failed to destroy turn sandbox for chatbot ${botId}`,
          error,
        );
      }
    }
    await Promise.all(
      mcpClients.map(async (client) => {
        try {
          await client.close();
        } catch (error) {
          appLogger.error(
            `Failed to close MCP client for chatbot ${botId}`,
            error,
          );
        }
      }),
    );
    await finishExecution(executionId, outcome);
  }
  return outcome;
}

export async function runScheduledPrompt(
  chat: Chat,
  botId: string,
  adapterId: string,
  adapterPlatform: string,
  threadId: string,
  prompt: string,
  executionId: string | null,
) {
  const message = new Message({
    id: `scheduled-${randomUUID()}`,
    threadId,
    text: prompt,
    formatted: parseMarkdown(prompt),
    raw: { scheduled: true },
    author: {
      userId: "scheduled-task",
      userName: "schedule",
      fullName: t("server.schedule"),
      isBot: false,
      isMe: false,
    },
    metadata: { dateSent: new Date(), edited: false },
    attachments: [],
  });
  return processBotMessage(
    chat,
    botId,
    adapterId,
    adapterPlatform,
    chat.thread(threadId),
    message,
    "schedule",
    executionId,
  );
}

export function registerBotHandlers(
  chat: Chat,
  botId: string,
  adapterId: string,
  adapterPlatform: string,
  publicOrigin?: string,
) {
  const process = (
    thread: Thread<Record<string, unknown>, unknown>,
    message: Message<unknown>,
    source: ExecutionSource,
  ) =>
    processBotMessage(
      chat,
      botId,
      adapterId,
      adapterPlatform,
      thread,
      message,
      source,
      null,
      publicOrigin,
    );

  chat.onDirectMessage(async (thread, message) => {
    appLogger.info("[ON_DIRECT_MESSAGE]");
    await process(thread, message, "direct_message");
  });
  chat.onNewMention(async (thread, message) => {
    appLogger.info("[ON_NEW_MENTION]");
    await process(thread, message, "mention");
  });
}
