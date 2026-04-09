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

// ============================================
// MODEL TIER SYSTEM
// Easy to configure which models go in which tier
// ============================================

export type ModelTier = "cheap" | "pro" | "best";

export interface ModelTierConfig {
  id: ModelTier;
  name: string;
  description: string;
  emoji: string;
  creditMultiplier: number; // 0.5 = half cost, 2 = double cost
  color: string;
  features: string[];
}

// Tier configurations - EASY TO MODIFY
export const TIER_CONFIGS: Record<ModelTier, ModelTierConfig> = {
  cheap: {
    id: "cheap",
    name: "Cheap",
    description: "Fast & affordable for quick prototypes",
    emoji: "🟢",
    creditMultiplier: 0.5, // 2x generations
    color: "#22c55e",
    features: ["Fast generation", "Good for simple tasks", "2x more generations"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "Balanced speed and quality",
    emoji: "🔵",
    creditMultiplier: 1, // Standard cost
    color: "#3b82f6",
    features: ["Optimal balance", "Great for most apps", "Standard credits"],
  },
  best: {
    id: "best",
    name: "Best",
    description: "Maximum quality for complex tasks",
    emoji: "🟣",
    creditMultiplier: 2, // Half the generations
    color: "#8b5cf6",
    features: ["Best reasoning", "Complex architecture", "Premium quality"],
  },
};

// ============================================
// MODEL CONFIGURATIONS
// ============================================

export interface ModelConfig {
  name: string;
  provider: string;
  description: string;
  temperature: number;
  supportsFrequencyPenalty: boolean;
  frequencyPenalty?: number;
  supportsSubagents: boolean;
  isSpeedOptimized: boolean;
  maxTokens?: number;
  isFree: boolean;
  isSubagentOnly?: boolean;
  tier: ModelTier; // Which tier this model belongs to
  isDefaultForTier?: boolean; // Is this the default model for its tier?
}

// ============================================
// EASY TO MODIFY: Assign models to tiers here
// Just change the 'tier' and 'isDefaultForTier' fields
// ============================================
export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  // CHEAP TIER MODELS
  "moonshotai/kimi-k2.5": {
    name: "Kimi K2.5",
    provider: "moonshot",
    description: "Moonshot's efficient model for quick tasks",
    temperature: 0.7,
    supportsFrequencyPenalty: true,
    frequencyPenalty: 0.5,
    supportsSubagents: false,
    isSpeedOptimized: false,
    maxTokens: undefined,
    isFree: false,
    tier: "cheap",
    isDefaultForTier: true,
  },
  "z-ai/glm-5.1": {
    name: "GLM 5.1",
    provider: "z-ai",
    description: "Ultra-fast inference for speed-critical tasks",
    temperature: 0.7,
    supportsFrequencyPenalty: false,
    supportsSubagents: true,
    isSpeedOptimized: true,
    maxTokens: 4096,
    isFree: false,
    tier: "cheap",
    isDefaultForTier: false,
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
    tier: "cheap",
    isDefaultForTier: false,
  },

  // PRO TIER MODELS
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
    tier: "pro",
    isDefaultForTier: true,
  },
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
    tier: "pro",
    isDefaultForTier: false,
  },
  "accounts/fireworks/routers/kimi-k2p5-turbo": {
    name: "Kimi Turbo",
    provider: "fireworks",
    description: "Kimi K2.5 Turbo via Fireworks — ultra-fast inference",
    temperature: 0.7,
    supportsFrequencyPenalty: true,
    frequencyPenalty: 0.5,
    supportsSubagents: false,
    isSpeedOptimized: true,
    maxTokens: undefined,
    isFree: false,
    tier: "pro",
    isDefaultForTier: false,
  },

  // BEST TIER MODELS
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
    tier: "best",
    isDefaultForTier: true,
  },
  "anthropic/claude-sonnet-4.5": {
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    description: "Advanced reasoning for complex architecture",
    temperature: 0.7,
    supportsFrequencyPenalty: true,
    frequencyPenalty: 0.5,
    supportsSubagents: false,
    isSpeedOptimized: false,
    maxTokens: undefined,
    isFree: false,
    tier: "best",
    isDefaultForTier: false,
  },
  "openai/o3": {
    name: "o3",
    provider: "openai",
    description: "OpenAI's reasoning model for edge cases",
    temperature: 0.7,
    supportsFrequencyPenalty: true,
    frequencyPenalty: 0.5,
    supportsSubagents: false,
    isSpeedOptimized: false,
    maxTokens: undefined,
    isFree: false,
    tier: "best",
    isDefaultForTier: false,
  },

  // INTERNAL/SUBAGENT ONLY MODELS (not user-selectable)
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
    tier: "cheap",
    isSubagentOnly: true,
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
    tier: "cheap",
    isSubagentOnly: true,
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
    isFree: false,
    tier: "cheap",
    isSubagentOnly: true,
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
    isFree: false,
    tier: "cheap",
    isSubagentOnly: true,
  },
};

export type ModelId = keyof typeof MODEL_CONFIGS | "auto" | ModelTier;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get all models for a specific tier
 */
export function getModelsForTier(tier: ModelTier): string[] {
  return Object.entries(MODEL_CONFIGS)
    .filter(([_, config]) => config.tier === tier && !config.isSubagentOnly)
    .map(([id]) => id);
}

/**
 * Get the default model for a tier
 */
export function getDefaultModelForTier(tier: ModelTier): string {
  const tierModels = Object.entries(MODEL_CONFIGS).filter(
    ([_, config]) => config.tier === tier && config.isDefaultForTier && !config.isSubagentOnly
  );
  
  if (tierModels.length > 0) {
    return tierModels[0][0];
  }
  
  // Fallback to first available model in tier
  const firstInTier = Object.entries(MODEL_CONFIGS).find(
    ([_, config]) => config.tier === tier && !config.isSubagentOnly
  );
  
  return firstInTier?.[0] || "moonshotai/kimi-k2.5:nitro";
}

/**
 * Resolve a tier or model ID to an actual model ID
 * - "cheap" -> default cheap model
 * - "pro" -> default pro model  
 * - "best" -> default best model
 * - "auto" -> auto-select based on prompt
 * - model ID -> return as-is
 */
export function resolveModel(modelId: ModelId, prompt?: string): string {
  // Handle tier shortcuts
  if (modelId === "cheap") {
    return getDefaultModelForTier("cheap");
  }
  if (modelId === "pro") {
    return getDefaultModelForTier("pro");
  }
  if (modelId === "best") {
    return getDefaultModelForTier("best");
  }
  if (modelId === "auto") {
    return selectModelForTask(prompt || "");
  }
  
  // It's already a specific model ID
  return modelId;
}

/**
 * Get credit multiplier for a model or tier
 */
export function getCreditMultiplier(modelId: ModelId): number {
  // If it's a tier, return the tier's multiplier
  if (modelId === "cheap") return TIER_CONFIGS.cheap.creditMultiplier;
  if (modelId === "pro") return TIER_CONFIGS.pro.creditMultiplier;
  if (modelId === "best") return TIER_CONFIGS.best.creditMultiplier;
  
  // If it's a specific model, look up its tier
  const config = MODEL_CONFIGS[modelId];
  if (config) {
    return TIER_CONFIGS[config.tier].creditMultiplier;
  }
  
  return 1; // Default
}

/**
 * Get tier for a model
 */
export function getModelTier(modelId: string): ModelTier | null {
  const config = MODEL_CONFIGS[modelId];
  return config?.tier || null;
}

/**
 * Check if a model is user-selectable (not subagent-only)
 */
export function isUserSelectableModel(modelId: string): boolean {
  const config = MODEL_CONFIGS[modelId];
  return !!config && !config.isSubagentOnly;
}

/**
 * Get all user-selectable models
 */
export function getUserSelectableModels(): Array<{ id: string; config: ModelConfig }> {
  return Object.entries(MODEL_CONFIGS)
    .filter(([_, config]) => !config.isSubagentOnly)
    .map(([id, config]) => ({ id, config }));
}

/**
 * Legacy: Auto-select model based on prompt keywords
 * Used when model is "auto" or for backward compatibility
 */
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
  if (modelId === "cheap" || modelId === "pro" || modelId === "best") {
    // Check if the default model for this tier is free
    const resolvedModel = resolveModel(modelId);
    return FREE_MODELS.includes(resolvedModel as ModelId);
  }
  return FREE_MODELS.includes(modelId);
}

/**
 * Check if a tier's default model is free
 */
export function isTierFree(tier: ModelTier): boolean {
  const defaultModel = getDefaultModelForTier(tier);
  return FREE_MODELS.includes(defaultModel as ModelId);
}
