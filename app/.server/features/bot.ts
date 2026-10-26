import { createMCPClient } from "@ai-sdk/mcp";
import { generateText, stepCountIs, type ToolSet } from "ai";
import { createChatTools } from "chat/ai";
import type { Chat } from "chat";
import { decryptMcpHeaders } from "../utils";
import { getModelInfo } from "./provider";
import { getAvailableBot } from "../repository/bots";
import { getMcpClient } from "./mcp";

const MAX_AGENT_STEPS = 8;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeToolName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function registerBotHandlers(chat: Chat, botId: number) {
  chat.onNewMention(async (thread, message) => {
    const mcpClients: Array<Awaited<ReturnType<typeof createMCPClient>>> = [];
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
