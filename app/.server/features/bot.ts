import { createMCPClient } from "@ai-sdk/mcp";
import { generateText, stepCountIs, type ToolSet } from "ai";
import { createChatTools } from "chat/ai";
import type { Chat } from "chat";
import {
  createPersistentSandboxInstance,
  deleteSandboxInstance,
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

  const info = await sandboxProvider.getBashSandbox(
    null,
    jsonbToStringRecord(sandbox.envs),
    [...sandbox.allowedDomainList],
  );
  if (!info.createdInstanceId) {
    throw new Error(`failed to create sandbox for chatbot ${chatbotId}`);
  }

  if (scopedIds !== null) {
    const persistentInstance = await getPersistentSandboxInstance(
      sandbox.id,
      sandbox.sandboxScope,
      scopedIds.threadId,
      scopedIds.adapterId,
      scopedIds.chatbotId,
    );
    if (persistentInstance) {
      return {
        instanceId: persistentInstance.instanceId,
        isTurnScoped: false,
        sandboxProvider,
        bashSandbox: info.sandbox,
      };
    }
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
) {
  chat.onNewMention(async (thread, message) => {
    const mcpClients: Array<Awaited<ReturnType<typeof createMCPClient>>> = [];
    let turnSandbox: Awaited<ReturnType<typeof getBotSandbox>> = null;
    let replied = false;

    try {
      const chatbot = await getAvailableBot(botId);
      const agent = chatbot?.agent;

      if (!chatbot || !agent || agent.provider.ownerId !== chatbot.ownerId) {
        await thread.post(
          "このボットには利用可能な AI エージェントが設定されていません。",
        );
        return;
      }

      const modelInfo = getModelInfo(
        agent.provider.providerName,
        asRecord(agent.provider.args),
        decryptMcpHeaders(agent.provider.headers),
        asRecord(agent.options),
        agent.model_id,
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

      for (const link of agent.mcpServers) {
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

      const result = await generateText({
        model: modelInfo.model,
        providerOptions: modelInfo.options,
        system: chatbot.instruction,
        prompt: message.text,
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

      if (!replied && result.text.trim()) {
        await thread.post(result.text);
        replied = true;
      }
    } catch (error) {
      console.error(`Failed to handle mention for chatbot ${botId}`, error);
      if (!replied) {
        try {
          await thread.post("すみません。現在、回答を作成できませんでした。");
        } catch (replyError) {
          console.error(
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
          await deleteSandboxInstance(turnSandbox.instanceId);
        } catch (error) {
          console.error(
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
            console.error(
              `Failed to close MCP client for chatbot ${botId}`,
              error,
            );
          }
        }),
      );
    }
  });
}
