import { createMCPClient } from "@ai-sdk/mcp";
import { generateText, stepCountIs, type ToolSet } from "ai";
import { createChatTools, toAiMessages } from "chat/ai";
import type { Chat, Message, Thread } from "chat";
import {
  createPersistentSandboxInstance,
  getChatbotSandbox,
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
import { logger } from "../logger";
import { insertUsage } from "../repository/agents";
import { SearXNGWebSearch } from "./toolsets/tools/web/search-searxng";

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
  chatbotId: number,
  adapterId: number,
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
  ownerId: number,
  chatbotId: number,
  adapterId: number,
  threadId: string,
) {
  const sandbox = await getChatbotSandbox(chatbotId, ownerId);
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

export function registerBotHandlers(
  chat: Chat,
  botId: number,
  adapterId: number,
  adapterPlatform: string,
) {
  const process = async (
    thread: Thread<Record<string, unknown>, unknown>,
    message: Message<unknown>,
  ) => {
    const mcpClients: Array<Awaited<ReturnType<typeof createMCPClient>>> = [];
    let turnSandbox: Awaited<ReturnType<typeof getBotSandbox>> = null;
    let replied = false;
    let onFailedMessage = "Sorry, we could not generate an answer.";
    try {
      const chatbot = await getAvailableBot(botId);
      const agent = chatbot?.agent;

      if (!chatbot || !agent || agent.provider.ownerId !== chatbot.ownerId) {
        await thread.post("Service Unavailable");
        return;
      }
      onFailedMessage = chatbot.onFailedMessage;

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

      const tools = {
        ...createChatTools({
          chat,
          preset: "messenger",
          requireApproval: false,
          scope: thread,
          strictScope: true,
        }),
        ...getFileParseTools(chat, adapterPlatform, thread.id),
        searchWeb: SearXNGWebSearch,
      } as ToolSet;

      turnSandbox = await getBotSandbox(
        chatbot.ownerId,
        chatbot.id,
        adapterId,
        thread.id,
      );
      if (turnSandbox) {
        Object.assign(
          tools,
          await getSandboxTools(turnSandbox.bashSandbox, chat, thread.id),
        );
      }

      for (const link of chatbot.mcpServers) {
        const server = link.mcpServer;
        if (server.ownerId !== chatbot.ownerId) continue;
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
        for (const [name, tool] of Object.entries(mcpTools)) {
          tools[`mcp_${server.id}_${safeToolName(name)}`] = tool;
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
          logger.warn(
            `Failed to fetch message history for chatbot ${botId}`,
            error,
          );
        }
      }
      const result = await generateText({
        model: modelInfo.model,
        providerOptions: modelInfo.options,
        system: chatbot.instruction,
        prompt: [
          ...(await toAiMessages([...history, message])),
          {
            role: "user",
            content: `[実行時補足情報]\n現在のスレッドID: ${thread.id}\n現在日時 (UTC, ISO 8601): ${currentDateTime}`,
          },
        ],
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

      await insertUsage(chatbot.id, agent.id, result.usage, result.toolResults);

      if (!replied && result.text.trim()) {
        await thread.post(result.text);
        replied = true;
      }
    } catch (error) {
      logger.error(`Failed to handle mention for chatbot ${botId}`, error);
      if (!replied) {
        try {
          await thread.post(onFailedMessage);
        } catch (replyError) {
          logger.error(
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
          logger.error(
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
            logger.error(
              `Failed to close MCP client for chatbot ${botId}`,
              error,
            );
          }
        }),
      );
    }
  };
  chat.onDirectMessage(async (thread, message) => {
    logger.info("[ON_DIRECT_MESSAGE]");
    return await process(thread, message);
  });
  chat.onNewMention(async (thread, message) => {
    logger.info("[ON_NEW_MENTION]");
    return await process(thread, message);
  });
}
