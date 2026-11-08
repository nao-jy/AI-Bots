import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createTeamsAdapter } from "@chat-adapter/teams";
import { createGoogleChatAdapter } from "@chat-adapter/gchat";
import { createDiscordAdapter } from "@chat-adapter/discord";
import { createXAdapter } from "@chat-adapter/x";
import { createLineAdapter } from "chat-adapter-line";
import { createPostgresState } from "@chat-adapter/state-pg";
import pg from "pg";
import { STATE_SCHEMA_NAME } from "~/const";
import { getAdapterOAuthInfo } from "../repository/oauth";
import { parseAdapterArgs } from "./adapter-args";
import type z from "zod";
import {
  createChatworkAdapter,
  getChatworkConfigSchema,
} from "./adapters/chatwork";

interface ChatAdapterFactory {
  adapterName: string;
  displayName: string;
  url: string;
  getConfigSchema?: () => Promise<z.core.ZodStandardJSONSchemaPayload<unknown>>;
  getBot: (
    botName: string,
    adapterConfig: Record<string, string>,
    authId: string | null,
  ) => Promise<Chat>;
}

let statePromise: ReturnType<typeof initializeState> | undefined;

function initializeState() {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL must be set to initialize chat state");
  }

  const client = new pg.Pool({
    connectionString,
    options: `-c search_path=${STATE_SCHEMA_NAME}`,
  });

  return (async () => {
    try {
      const quotedSchemaName = `"${STATE_SCHEMA_NAME.replaceAll('"', '""')}"`;
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${quotedSchemaName}`);
      return createPostgresState({ client });
    } catch (error) {
      await client.end();
      throw error;
    }
  })();
}

function getState() {
  if (!statePromise) {
    statePromise = initializeState().catch((error) => {
      statePromise = undefined;
      throw error;
    });
  }
  return statePromise;
}

async function getCommonAdapterArgs<T extends object>(
  config: Record<string, string>,
  authId: string | null,
): Promise<T> {
  const info = authId === null ? null : await getAdapterOAuthInfo(authId);
  return { ...parseAdapterArgs(config), ...info } as T;
}

const FACTORIES: ChatAdapterFactory[] = [
  {
    adapterName: "slack",
    displayName: "Slack",
    url: "https://chat-sdk.dev/adapters/official/slack",
    getBot: async (botName, adapterConfig, authId) => {
      return new Chat({
        userName: botName,
        adapters: {
          slack: createSlackAdapter(
            await getCommonAdapterArgs(adapterConfig, authId),
          ),
        },
        state: await getState(),
      });
    },
  },
  {
    adapterName: "teams",
    displayName: "Microsoft Teams",
    url: "https://chat-sdk.dev/adapters/official/teams",
    getBot: async (botName, adapterConfig, authId) => {
      return new Chat({
        userName: botName,
        adapters: {
          teams: createTeamsAdapter(
            await getCommonAdapterArgs(adapterConfig, authId),
          ),
        },
        state: await getState(),
      });
    },
  },
  {
    adapterName: "gchat",
    displayName: "Google Chat",
    url: "https://chat-sdk.dev/adapters/official/gchat",
    getBot: async (botName, adapterConfig, authId) => {
      return new Chat({
        userName: botName,
        adapters: {
          gchat: createGoogleChatAdapter(
            await getCommonAdapterArgs(adapterConfig, authId),
          ),
        },
        state: await getState(),
      });
    },
  },
  {
    adapterName: "discord",
    displayName: "Discord",
    url: "https://chat-sdk.dev/adapters/official/discord",
    getBot: async (botName, adapterConfig, authId) => {
      return new Chat({
        userName: botName,
        adapters: {
          discord: createDiscordAdapter(
            await getCommonAdapterArgs(adapterConfig, authId),
          ),
        },
        state: await getState(),
      });
    },
  },
  {
    adapterName: "x",
    displayName: "X",
    url: "https://chat-sdk.dev/adapters/official/x",
    getBot: async (botName, adapterConfig, authId) => {
      return new Chat({
        userName: botName,
        adapters: {
          x: createXAdapter(await getCommonAdapterArgs(adapterConfig, authId)),
        },
        state: await getState(),
      });
    },
  },
  {
    adapterName: "line",
    displayName: "LINE",
    url: "https://chat-sdk.dev/adapters/community/line",
    getBot: async (botName, adapterConfig, authId) => {
      return new Chat({
        userName: botName,
        adapters: {
          line: createLineAdapter(
            await getCommonAdapterArgs(adapterConfig, authId),
          ),
        },
        state: await getState(),
      });
    },
  },
  {
    adapterName: "chatwork",
    displayName: "Chatwork",
    url: "https://developer.chatwork.com/docs/getting-started",
    getConfigSchema: async () => {
      return getChatworkConfigSchema().toJSONSchema({ target: "draft-7" });
    },
    getBot: async (botName, adapterConfig, authId) => {
      const args = getChatworkConfigSchema().parse(adapterConfig);
      const auth = authId === null ? null : await getAdapterOAuthInfo(authId);
      if (
        args.apiToken === undefined &&
        args.accessToken === undefined &&
        auth !== null
      ) {
        args.accessToken = auth.accessToken;
      }
      return new Chat({
        userName: botName,
        adapters: {
          chatwork: createChatworkAdapter(args),
        },
        state: await getState(),
      });
    },
  },
];

export async function getBotInfo(
  adapterName: string,
  botName: string,
  adapterConfig: Record<string, string>,
  authId: string | null,
) {
  const factory = FACTORIES.find(
    (v) => v.adapterName.toLowerCase() === adapterName.toLowerCase(),
  );
  if (factory) {
    return {
      displayName: factory.displayName,
      bot: await factory.getBot(botName, adapterConfig, authId),
      url: factory.url,
    };
  }
}

export function toDisplayNameAdapter(adapterName: string) {
  return FACTORIES.find(
    (v) => v.adapterName.toLowerCase() === adapterName.toLowerCase(),
  )?.displayName;
}

export function listAdapterNames() {
  return FACTORIES.map((v) => ({
    id: v.adapterName,
    displayName: v.displayName,
    url: v.url,
  }));
}

/** Return the schemas in the current request's locale. */
export async function listAdapterConfigSchemas() {
  const entries = await Promise.all(
    FACTORIES.filter((factory) => factory.getConfigSchema).map(async (factory) => ({
      id: factory.adapterName,
      schema: await factory.getConfigSchema!(),
    })),
  );
  return entries;
}
