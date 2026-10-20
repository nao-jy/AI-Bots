import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createTeamsAdapter } from "@chat-adapter/teams";
import { createGoogleChatAdapter } from "@chat-adapter/gchat";
import { createDiscordAdapter } from "@chat-adapter/discord";
import { createXAdapter } from "@chat-adapter/x";
import { createLineAdapter } from "chat-adapter-line";
import { createMemoryState } from "@chat-adapter/state-memory";

interface ChatAdapterFactory {
  adapterName: string;
  displayName: string;
  url: string;
  getBot: (botName: string, adapterConfig: Record<string, string>) => Chat;
}

function getState() {
  return createMemoryState();
}

const FACTORIES: ChatAdapterFactory[] = [
  {
    adapterName: "slack",
    displayName: "Slack",
    url: "https://chat-sdk.dev/adapters/official/slack",
    getBot: (botName, adapterConfig) => {
      return new Chat({
        userName: botName,
        adapters: {
          slack: createSlackAdapter(adapterConfig),
        },
        state: getState(),
      });
    },
  },
  {
    adapterName: "teams",
    displayName: "Microsoft Teams",
    url: "https://chat-sdk.dev/adapters/official/teams",
    getBot: (botName, adapterConfig) => {
      return new Chat({
        userName: botName,
        adapters: {
          slack: createTeamsAdapter(adapterConfig),
        },
        state: getState(),
      });
    },
  },
  {
    adapterName: "gchat",
    displayName: "Google Chat",
    url: "https://chat-sdk.dev/adapters/official/gchat",
    getBot: (botName, adapterConfig) => {
      return new Chat({
        userName: botName,
        adapters: {
          slack: createGoogleChatAdapter(adapterConfig),
        },
        state: getState(),
      });
    },
  },
  {
    adapterName: "discord",
    displayName: "Discord",
    url: "https://chat-sdk.dev/adapters/official/discord",
    getBot: (botName, adapterConfig) => {
      return new Chat({
        userName: botName,
        adapters: {
          slack: createDiscordAdapter(adapterConfig),
        },
        state: getState(),
      });
    },
  },
  {
    adapterName: "x",
    displayName: "X",
    url: "https://chat-sdk.dev/adapters/official/x",
    getBot: (botName, adapterConfig) => {
      return new Chat({
        userName: botName,
        adapters: {
          slack: createXAdapter(adapterConfig),
        },
        state: getState(),
      });
    },
  },
  {
    adapterName: "line",
    displayName: "LINE",
    url: "https://chat-sdk.dev/adapters/community/line",
    getBot: (botName, adapterConfig) => {
      return new Chat({
        userName: botName,
        adapters: {
          slack: createLineAdapter(adapterConfig),
        },
        state: getState(),
      });
    },
  },
];

export function getBotInfo(
  adapterName: string,
  botName: string,
  adapterConfig: Record<string, string>,
) {
  const factory = FACTORIES.find(
    (v) => v.adapterName.toLowerCase() === adapterName.toLowerCase(),
  );
  if (factory) {
    return {
      displayName: factory.displayName,
      bot: factory.getBot(botName, adapterConfig),
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
