import { createMCPClient } from "@ai-sdk/mcp";
import { generateText, stepCountIs, type ModelMessage, type ToolSet } from "ai";
import { toAiMessages } from "chat/ai";
import { Message, parseMarkdown, type Chat, type Thread } from "chat";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import {
  createPersistentSandboxInstance,
  getChatBotSandbox,
  getPersistentSandboxInstance,
  type SandboxScope,
} from "../repository/sandboxes";
import { decryptMcpHeaders, jsonbToStringRecord } from "../utils";
import { getModelInfo } from "./provider";
import { getAvailableBot } from "../repository/bots";
import { getMcpClient } from "./mcp";
import { getSandboxTools } from "./toolsets/sandbox";
import { getSandbox } from "./toolsets/sandboxes";
import { getFileParseTools } from "./toolsets/file-parse";
import { appLogger } from "../logger/app-logger";
import { conversationLogger } from "../logger/conversation-logger";
import { insertUsage } from "../repository/agents";
import { getExceededRateLimit } from "../repository/rate-limits";
import { getSearXNGWebSearch } from "./toolsets/tools/web/search-searxng";
import { getChatTools } from "./toolsets/chat-tools";
import type { FileHandleReaderMap } from "./toolsets/helpers/file-handle";
import { ToolSetFactoryRegistry } from "./toolsets";
import { LocalFileSystem } from "./filesystem/local";
import { buildMemoryPrompt, getMemoryTools } from "./toolsets/memory";
import { t } from "~/.server/i18n";

const MAX_AGENT_STEPS = 8;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeToolName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getScopedIds(
  scope: SandboxScope,
  chatbotId: string,
  adapterId: string,
  threadId: string,
) {
  switch (scope) {
    case "all": {
      return {
        chatbotId: null,
        adapterId: null,
        threadId: null,
      };
    }
    case "bot": {
      return {
        chatbotId: chatbotId,
        adapterId: null,
        threadId: null,
      };
    }
    case "adapter": {
      return {
        chatbotId: chatbotId,
        adapterId: adapterId,
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
  adapterId: string,
  threadId: string,
) {
  const sandbox = await getChatBotSandbox(chatbotId, organizationId);
  if (!sandbox) return null;

  const scopedIds = getScopedIds(
    sandbox.sandboxScope,
    chatbotId,
    adapterId,
    threadId,
  );

  const sandboxProvider = getSandbox(sandbox.sandboxType);
  if (!sandboxProvider) return null;

  if (scopedIds !== null) {
    const persistentInstance = await getPersistentSandboxInstance(
      sandbox.id,
      sandbox.sandboxScope,
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
    isTurnScoped: sandbox.sandboxScope === "turn",
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
) {
  const mcpClients: Array<Awaited<ReturnType<typeof createMCPClient>>> = [];
  let turnSandbox: Awaited<ReturnType<typeof getBotSandbox>> = null;
  let replied = false;
  let onFailedMessage = "Sorry, we could not generate an answer.";
  try {
    const chatbot = await getAvailableBot(botId);
    const agent = chatbot?.agent;

    if (!chatbot || !agent || agent.provider.organizationId !== chatbot.organizationId) {
      await thread.post("Service Unavailable");
      return;
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
      await thread.post(exceededMessage);
      replied = true;
      return;
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

    const fileHandles: FileHandleReaderMap = new Map();
    const memoryScope = createHash("sha256")
      .update(adapterId)
      .update("\0")
      .update(thread.id)
      .digest("hex");
    const memoryFs = new LocalFileSystem(
      resolve(
        process.env.MEMORY_DIR || "data/memory",
        chatbot.organizationId,
        chatbot.id,
        memoryScope,
      ),
    );
    const tools = {
      ...getChatTools(chat, adapterPlatform, thread, fileHandles),
      ...getFileParseTools(fileHandles),
      ...getMemoryTools(memoryFs, {
        onUnexpectedError: (error, toolName) =>
          appLogger.error(`Memory tool ${toolName} failed for chatbot ${botId}`, error),
      }),
      searchWeb: getSearXNGWebSearch(),
    } as ToolSet;

    turnSandbox = await getBotSandbox(
      chatbot.organizationId,
      chatbot.id,
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

      const client = await getMcpClient(
        server.transport,
        server.endpoint,
        decryptMcpHeaders(server.headers),
        link.authId,
      );
      mcpClients.push(client);

      const mcpTools = await client.tools();
      const authName = link.authentication
        ? `_${link.authentication.name}`
        : "";
      for (const [name, tool] of Object.entries(mcpTools)) {
        tools[`mcp${authName}_${server.id}_${safeToolName(name)}`] = tool;
      }
    }

    const toolSetContexts = new Map<string, unknown[]>();
    chatbot.toolSets.forEach((toolSet) => {
      if (!toolSetContexts.has(toolSet.toolSetName)) {
        toolSetContexts.set(toolSet.toolSetName, []);
      }
      toolSetContexts
        .get(toolSet.toolSetName)
        ?.push(asRecord(toolSet.toolSetContext));
    });
    const registry = new ToolSetFactoryRegistry(chatbot.organizationId);
    for (const [toolSetName, contexts] of toolSetContexts.entries()) {
      for (const context of contexts) {
        const t = await registry.getTools(toolSetName, context, fileHandles);
        if (t) {
          Object.assign(tools, t);
        }
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
    const result = await generateText({
      model: modelInfo.model,
      providerOptions: modelInfo.options,
      system: `${chatbot.instruction}\n\n${await buildMemoryPrompt(memoryFs)}`,
      prompt: inputMessages,
      tools,
      stopWhen: stepCountIs(MAX_AGENT_STEPS),
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

    let usageId = null;
    try {
      await insertUsage(
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

    const postUsageExceededMessage = await getExceededRateLimit(
      chatbot.organizationId,
      chatbot.id,
      agent.id,
      agent.providerId,
      thread.id,
    );
    if (postUsageExceededMessage && !replied) {
      await thread.post(postUsageExceededMessage);
      replied = true;
    }

    conversationLogger.info("conversation completed", {
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

    if (!replied && result.text.trim()) {
      await thread.post(result.text);
      replied = true;
    }
  } catch (error) {
    appLogger.error(`Failed to handle mention for chatbot ${botId}`, error);
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
  }
}

export async function runScheduledPrompt(
  chat: Chat,
  botId: string,
  adapterId: string,
  adapterPlatform: string,
  threadId: string,
  prompt: string,
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
  await processBotMessage(
    chat,
    botId,
    adapterId,
    adapterPlatform,
    chat.thread(threadId),
    message,
  );
}

export function registerBotHandlers(
  chat: Chat,
  botId: string,
  adapterId: string,
  adapterPlatform: string,
) {
  const process = (
    thread: Thread<Record<string, unknown>, unknown>,
    message: Message<unknown>,
  ) =>
    processBotMessage(chat, botId, adapterId, adapterPlatform, thread, message);

  chat.onDirectMessage(async (thread, message) => {
    appLogger.info("[ON_DIRECT_MESSAGE]");
    return await process(thread, message);
  });
  chat.onNewMention(async (thread, message) => {
    appLogger.info("[ON_NEW_MENTION]");
    return await process(thread, message);
  });
}
