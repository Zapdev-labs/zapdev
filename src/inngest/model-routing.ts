const TOOL_CALLING_FALLBACK_MODEL = "moonshotai/kimi-k2.6";
const DEFAULT_AGENTKIT_MANAGER_MODEL =
  process.env.ZAPDEV_AGENT_MANAGER_MODEL?.trim() || "moonshotai/kimi-k2.6";

const MODELS_WITH_UNRELIABLE_AGENTKIT_TOOLS = new Set([
  "arcee-ai/trinity-large-thinking",
]);

const STABLE_AGENTKIT_TOOL_MODELS = new Set([
  "deepseek/deepseek-v4-pro",
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-sonnet-4.6",
  "openai/gpt-5.1-codex",
]);

export const CODING_FALLBACK_CHAIN = [
  "moonshotai/kimi-k2.6",
  "anthropic/claude-haiku-4.5",
] as const;

const buildModelsFallback = (primary: string, chain: readonly string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const model of [primary, ...chain]) {
    if (seen.has(model)) continue;
    seen.add(model);
    out.push(model);
  }

  return out;
};

export const getToolCallingModelForAgent = (selectedModel: string): string => {
  let toolCallingModel = selectedModel;

  if (toolCallingModel.endsWith(":nitro")) {
    toolCallingModel = toolCallingModel.slice(0, -":nitro".length);
  }

  if (!MODELS_WITH_UNRELIABLE_AGENTKIT_TOOLS.has(toolCallingModel)) {
    return toolCallingModel;
  }

  return TOOL_CALLING_FALLBACK_MODEL;
};

export const resolveCodingModelPlan = (
  selectedModel: string,
  dedicatedManagerModel = DEFAULT_AGENTKIT_MANAGER_MODEL
) => {
  const toolCallingModel = getToolCallingModelForAgent(selectedModel);
  const usesDedicatedManager = !STABLE_AGENTKIT_TOOL_MODELS.has(toolCallingModel);
  const managerModel = usesDedicatedManager
    ? dedicatedManagerModel
    : toolCallingModel;

  return {
    toolCallingModel,
    managerModel,
    usesDedicatedManager,
    retryModels: buildModelsFallback(managerModel, [
      toolCallingModel,
      ...CODING_FALLBACK_CHAIN,
    ]),
  };
};
