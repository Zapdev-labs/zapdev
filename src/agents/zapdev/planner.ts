import { generateText } from "ai";

import { openrouter } from "../client";
import { PLAN_STEP_PROMPT, ENHANCE_SYSTEM_PROMPT, isUIGenerationRequest } from "./prompts";
import { safeParseAIJSON } from "./utils";
import type { AgentPlan } from "./types";

const PLANNER_MODEL = "moonshotai/kimi-k2.6:nitro";
const ENHANCE_MODEL = "moonshotai/kimi-k2.6:nitro";

export const FALLBACK_PLAN: AgentPlan = {
  needsResearch: false,
  searchQueries: [],
  focusAreas: [],
  implementationHints: "",
  steps: [],
  potentialIssues: [],
  filesToModify: [],
  complexity: "moderate",
};

export async function runPlanner(
  userMessage: string,
  contextSummary = "No prior conversation."
): Promise<AgentPlan> {
  try {
    const { text } = await generateText({
      model: openrouter(PLANNER_MODEL),
      prompt: `${PLAN_STEP_PROMPT}\n\nUser request: "${userMessage}"\n\nRecent context:\n${contextSummary}`,
      temperature: 0.3,
      maxOutputTokens: 4096,
    });

    const parsed = safeParseAIJSON<Partial<AgentPlan>>(text);
    if (parsed && typeof parsed === "object") {
      const isComplexity = (value: unknown): value is AgentPlan["complexity"] =>
        value === "simple" || value === "moderate" || value === "complex";

      const toBool = (value: unknown): boolean =>
        value === true ||
        value === 1 ||
        (typeof value === "string" && value.toLowerCase() === "true");

      const toArray = (value: unknown): string[] => {
        if (Array.isArray(value)) {
          return value.filter((item): item is string => typeof item === "string");
        }
        if (typeof value === "string") return value ? [value] : [];
        return [];
      };

      return {
        needsResearch: toBool(parsed.needsResearch),
        searchQueries: toArray(parsed.searchQueries),
        focusAreas: toArray(parsed.focusAreas),
        implementationHints:
          typeof parsed.implementationHints === "string"
            ? parsed.implementationHints
            : FALLBACK_PLAN.implementationHints,
        steps: toArray(parsed.steps),
        potentialIssues: toArray(parsed.potentialIssues),
        filesToModify: toArray(parsed.filesToModify),
        complexity: isComplexity(parsed.complexity)
          ? parsed.complexity
          : FALLBACK_PLAN.complexity,
      };
    }

    return { ...FALLBACK_PLAN, implementationHints: text };
  } catch (error) {
    console.error("[PLANNER] Error:", error);
    return FALLBACK_PLAN;
  }
}

export async function runEnhancer(userMessage: string): Promise<string | null> {
  if (!isUIGenerationRequest(userMessage)) return null;

  try {
    const { text } = await generateText({
      model: openrouter(ENHANCE_MODEL),
      system: ENHANCE_SYSTEM_PROMPT,
      prompt: `Here is the user's prompt to enhance:\n\n${userMessage}`,
      temperature: 0.7,
      maxOutputTokens: 4096,
    });
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (error) {
    console.error("[ENHANCER] Error:", error);
    return null;
  }
}
