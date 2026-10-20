import type { LanguageModelV4 } from "@ai-sdk/provider";
import { createOpenAI } from "@ai-sdk/openai";
import { createAzure } from "@ai-sdk/azure";
import { createAnthropic } from "@ai-sdk/anthropic";
import {
  createOpenAICompatible,
  type OpenAICompatibleProviderSettings,
} from "@ai-sdk/openai-compatible";

interface ModelFactory {
  providerName: string;
  getModel: (
    providerArgs: Record<string, unknown>,
    providerHeaders: Record<string, string>,
    modelId: string,
  ) => LanguageModelV4;
}

const factries: ModelFactory[] = [
  {
    providerName: "openai",
    getModel: (args, headers, modelId) => {
      const provider = createOpenAI({
        ...args,
        headers: headers,
      });
      return provider(modelId);
    },
  },
  {
    providerName: "azure",
    getModel: (args, headers, modelId) => {
      const provider = createAzure({
        ...args,
        headers: headers,
      });
      return provider(modelId);
    },
  },
  {
    providerName: "anthropic",
    getModel: (args, headers, modelId) => {
      const provider = createAnthropic({
        ...args,
        headers: headers,
      });
      return provider(modelId);
    },
  },
  {
    providerName: "openai-compatible",
    getModel: (args, headers, modelId) => {
      const provider = createOpenAICompatible({
        ...(args as unknown as OpenAICompatibleProviderSettings),
        headers: headers,
      });
      return provider(modelId);
    },
  },
];

export function getModel(
  providerName: string,
  providerArgs: Record<string, unknown>,
  providerHeaders: Record<string, string>,
  modelId: string,
) {
  const factory = factries.find(
    (v) => v.providerName.toLowerCase() === providerName.toLowerCase(),
  );
  return factory?.getModel(providerArgs, providerHeaders, modelId);
}

export function listProviderNames() {
  return factries.map((v) => v.providerName);
}
