export type Framework = "nextjs" | "angular" | "react" | "vue" | "svelte";

export interface AgentState {
  summary: string;
  files: Record<string, string>;
  selectedFramework?: Framework;
  summaryRetryCount: number;
}

export interface AgentRunInput {
  projectId: string;
  value: string;
  model?: ModelId;
  userId?: string;
}

export interface AgentRunResult {
  url: string;
  title: string;
  files: Record<string, string>;
  summary: string;
  framework: Framework;
}

export const MODEL_CONFIGS = {
  "anthropic/claude-haiku-4.5": {
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    description: "Fast and efficient for most coding tasks",
    temperature: 0.7,
    supportsFrequencyPenalty: true,
    frequencyPenalty: 0.5,
    supportsSubagents: false,
    isSpeedOptimized: false,
    maxTokens: undefined,
    isFree: false,
  },
  "openai/gpt-5.1-codex": {
    name: "GPT-5.1 Codex",
    provider: "openai",
    description: "OpenAI's flagship model for complex tasks",
    temperature: 0.7,
    supportsFrequencyPenalty: true,
    frequencyPenalty: 0.5,
    supportsSubagents: false,
    isSpeedOptimized: false,
    maxTokens: undefined,
    isFree: false,
  },
  "z-ai/glm-5": {
    name: "Z-AI GLM 5",
    provider: "openrouter",
    description: "Ultra-fast inference with subagent research capabilities",
    temperature: 0.7,
    supportsFrequencyPenalty: false,
    supportsSubagents: true,
    isSpeedOptimized: true,
    maxTokens: 4096,
    isFree: false,
  },
  "moonshotai/kimi-k2.5:nitro": {
    name: "Kimi K2.5 Nitro",
    provider: "moonshot",
    description: "Fast Kimi K2.5 with nitro routing for speed-optimized inference",
    temperature: 0.7,
    supportsFrequencyPenalty: true,
    frequencyPenalty: 0.5,
    supportsSubagents: false,
    isSpeedOptimized: true,
    maxTokens: undefined,
    isFree: false,
  },
  "moonshotai/kimi-k2-0905": {
    name: "Kimi K2",
    provider: "moonshot",
    description: "Specialized for coding tasks",
    temperature: 0.7,
    supportsFrequencyPenalty: true,
    frequencyPenalty: 0.5,
    supportsSubagents: false,
    isSpeedOptimized: false,
    maxTokens: undefined,
    isFree: false,
  },
  "moonshotai/kimi-k2.5": {
    name: "Kimi K2.5",
    provider: "moonshot",
    description: "Moonshot's advanced reasoning model for complex development tasks",
    temperature: 0.7,
    supportsFrequencyPenalty: true,
    frequencyPenalty: 0.5,
    supportsSubagents: false,
    isSpeedOptimized: false,
    maxTokens: undefined,
    isFree: false,
  },
  "qwen/qwen3.6-plus:free": {
    name: "Qwen 3.6 Plus",
    provider: "openrouter",
    description: "Alibaba's Qwen 3.6 Plus via OpenRouter — free tier model",
    temperature: 0.7,
    supportsFrequencyPenalty: false,
    supportsSubagents: false,
    isSpeedOptimized: false,
    maxTokens: undefined,
    isFree: true,
  },
  "accounts/fireworks/routers/kimi-k2p5-turbo": {
    name: "Kimi on Crack (Firepass)",
    provider: "fireworks",
    description: "Kimi K2.5 Turbo via Fireworks Firepass — ultra-fast inference with extended context",
    temperature: 0.7,
    supportsFrequencyPenalty: true,
    frequencyPenalty: 0.5,
    supportsSubagents: false,
    isSpeedOptimized: true,
    maxTokens: undefined,
    isFree: false,
  },
  "morph/morph-v3-large": {
    name: "Morph V3 Large",
    provider: "openrouter",
    description: "Fast research subagent for documentation lookup and web search",
    temperature: 0.5,
    supportsFrequencyPenalty: false,
    supportsSubagents: false,
    isSpeedOptimized: true,
    maxTokens: 2048,
    isSubagentOnly: true,
    isFree: false,
  },
  "x-ai/grok-4.1-fast": {
    name: "Grok 4.1 Fast",
    provider: "xai",
    description: "xAI's Grok 4.1 Fast — used internally for the research agent with Exa",
    temperature: 0.2,
    supportsFrequencyPenalty: false,
    supportsSubagents: false,
    isSpeedOptimized: true,
    maxTokens: 4096,
    isSubagentOnly: true,
    isFree: false,
  },
} as const;

export type ModelId = keyof typeof MODEL_CONFIGS | "auto";

export function selectModelForTask(
  prompt: string,
  _framework?: Framework
): keyof typeof MODEL_CONFIGS {
  const lowercasePrompt = prompt.toLowerCase();

  const defaultModel: keyof typeof MODEL_CONFIGS = "moonshotai/kimi-k2.5:nitro";

  const userExplicitlyRequestsGPT = lowercasePrompt.includes("gpt-5") || lowercasePrompt.includes("gpt5");
  const userExplicitlyRequestsGemini = lowercasePrompt.includes("gemini");
  const userExplicitlyRequestsKimi = lowercasePrompt.includes("kimi");

  if (userExplicitlyRequestsGPT) {
    return "openai/gpt-5.1-codex";
  }

  if (userExplicitlyRequestsGemini) {
    return "qwen/qwen3.6-plus:free";
  }

  if (userExplicitlyRequestsKimi) {
    return "moonshotai/kimi-k2.5:nitro";
  }

  return defaultModel;
}

export function frameworkToConvexEnum(
  framework: Framework
): "NEXTJS" | "ANGULAR" | "REACT" | "VUE" | "SVELTE" {
  const mapping: Record<
    Framework,
    "NEXTJS" | "ANGULAR" | "REACT" | "VUE" | "SVELTE"
  > = {
    nextjs: "NEXTJS",
    angular: "ANGULAR",
    react: "REACT",
    vue: "VUE",
    svelte: "SVELTE",
  };
  return mapping[framework];
}

/**
 * List of free models that don't consume credits
 */
export const FREE_MODELS: ModelId[] = [
  "qwen/qwen3.6-plus:free",
];

/**
 * Check if a model is free (doesn't consume credits)
 */
export function isFreeModel(modelId: ModelId): boolean {
  if (modelId === "auto") return false;
  return FREE_MODELS.includes(modelId);
}
