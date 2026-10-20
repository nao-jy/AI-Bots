import type {
  LanguageModelV4,
  SharedV4ProviderOptions,
} from "@ai-sdk/provider";
import { createOpenAI } from "@ai-sdk/openai";
import { createAzure } from "@ai-sdk/azure";
import { createAnthropic } from "@ai-sdk/anthropic";
import {
  createOpenAICompatible,
  type OpenAICompatibleProviderSettings,
} from "@ai-sdk/openai-compatible";
import type { JSONValue } from "ai";

interface ModelFactory {
  providerName: string;
  displayName: string;
  url: string;
  getModel: (
    providerArgs: Record<string, unknown>,
    providerHeaders: Record<string, string>,
    modelId: string,
  ) => LanguageModelV4;
  getProviderOptions: (
    options: Record<string, unknown>,
    providerArgs?: Record<string, unknown>,
  ) => SharedV4ProviderOptions;
}

const FACTORIES: ModelFactory[] = [
  {
    providerName: "openai",
    displayName: "OpenAI",
    url: "https://ai-sdk.dev/providers/ai-sdk-providers/openai",
    getModel: (args, headers, modelId) => {
      const provider = createOpenAI({
        ...args,
        headers: headers,
      });
      return provider(modelId);
    },
    getProviderOptions: (options) => {
      return {
        openai: options as Record<string, JSONValue>,
      };
    },
  },
  {
    providerName: "azure",
    displayName: "Azure OpenAI",
    url: "https://ai-sdk.dev/providers/ai-sdk-providers/azure",
    getModel: (args, headers, modelId) => {
      const provider = createAzure({
        ...args,
        headers: headers,
      });
      return provider(modelId);
    },
    getProviderOptions: (options) => {
      return {
        azure: options as Record<string, JSONValue>,
      };
    },
  },
  {
    providerName: "anthropic",
    displayName: "Anthropic",
    url: "https://ai-sdk.dev/providers/ai-sdk-providers/anthropic",
    getModel: (args, headers, modelId) => {
      const provider = createAnthropic({
        ...args,
        headers: headers,
      });
      return provider(modelId);
    },
    getProviderOptions: (options) => {
      return {
        anthropic: options as Record<string, JSONValue>,
      };
    },
  },
  {
    providerName: "openai-compatible",
    displayName: "OpenAI Compatible",
    url: "https://ai-sdk.dev/providers/openai-compatible-providers",
    getModel: (args, headers, modelId) => {
      if ("name" in args && "baseURL" in args) {
        const provider = createOpenAICompatible({
          ...args,
          headers: headers,
        } as OpenAICompatibleProviderSettings);
        return provider(modelId);
      }

      throw new Error("name and baseURL are required");
    },
    getProviderOptions: (options, providerArgs) => {
      const name = providerArgs!.name as string;
      return {
        [name]: options as Record<string, JSONValue>,
      };
    },
  },
];

export function getModelInfo(
  providerName: string,
  providerArgs: Record<string, unknown>,
  providerHeaders: Record<string, string>,
  providerOptions: Record<string, unknown>,
  modelId: string,
) {
  const factory = FACTORIES.find(
    (v) => v.providerName.toLowerCase() === providerName.toLowerCase(),
  );
  if (factory) {
    return {
      displayName: factory.displayName,
      url: factory.url,
      model: factory.getModel(providerArgs, providerHeaders, modelId),
      options: factory.getProviderOptions(providerOptions, providerArgs),
    };
  }
}

export function toDisplayNameProvider(providerName: string) {
  return FACTORIES.find(
    (v) => v.providerName.toLowerCase() === providerName.toLowerCase(),
  )?.displayName;
}

export function listProviderNames() {
  return FACTORIES.map((v) => ({
    id: v.providerName,
    displayName: v.displayName,
    url: v.url,
  }));
}
