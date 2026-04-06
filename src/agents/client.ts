import { createOpenAI } from "@ai-sdk/openai";
import { createCerebras } from "@ai-sdk/cerebras";
import { createGateway } from "ai";
import { createFireworks } from "@ai-sdk/fireworks";

export const openrouter = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: "https://openrouter.ai/api/v1",
  headers: {
    "HTTP-Referer": "https://zapdev.link",
    "X-Title": "zapdev",
  },
});

export const cerebras = createCerebras({
  apiKey: process.env.CEREBRAS_API_KEY || "",
});

export const fireworks = createFireworks({
  apiKey: process.env.FIREWORKS_API_KEY || "",
  baseURL: "https://api.fireworks.ai/inference/v1",
});

export const gateway = createGateway({
  apiKey: process.env.VERCEL_AI_GATEWAY_API_KEY || "",
});

// Cerebras model IDs (direct API)
const CEREBRAS_MODELS: string[] = [];

// Fireworks Firepass model IDs
const FIREWORKS_MODELS: string[] = ["accounts/fireworks/routers/kimi-k2p5-turbo"];

const GATEWAY_MODEL_ID_MAP: Record<string, string> = {};

const getGatewayModelId = (modelId: string): string =>
  GATEWAY_MODEL_ID_MAP[modelId] ?? modelId;

export function isCerebrasModel(modelId: string): boolean {
  return CEREBRAS_MODELS.includes(modelId);
}

export function isFireworksModel(modelId: string): boolean {
  return FIREWORKS_MODELS.includes(modelId);
}

export interface ClientOptions {
  useGatewayFallback?: boolean;
}

export function getModel(modelId: string, options?: ClientOptions) {
  if (isCerebrasModel(modelId) && options?.useGatewayFallback) {
    return gateway(getGatewayModelId(modelId));
  }
  if (isCerebrasModel(modelId)) {
    return cerebras(modelId);
  }
  if (isFireworksModel(modelId)) {
    return fireworks(modelId);
  }
  return openrouter(modelId);
}

export function getClientForModel(modelId: string, options?: ClientOptions) {
  if (isCerebrasModel(modelId) && options?.useGatewayFallback) {
    const gatewayModelId = getGatewayModelId(modelId);
    return {
      chat: (_modelId: string) => gateway(gatewayModelId),
    };
  }
  if (isCerebrasModel(modelId)) {
    return {
      chat: (_modelId: string) => cerebras(modelId),
    };
  }
  if (isFireworksModel(modelId)) {
    return {
      chat: (_modelId: string) => fireworks(modelId),
    };
  }
  return openrouter;
}
