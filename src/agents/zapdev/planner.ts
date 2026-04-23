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

    const parsed = safeParseAIJSON<AgentPlan>(text);
    if (parsed && typeof parsed.complexity === "string") {
      const validComplexities: AgentPlan["complexity"][] = ["simple", "moderate", "complex"];
      const normalizedComplexity = validComplexities.includes(parsed.complexity as AgentPlan["complexity"])
        ? (parsed.complexity as AgentPlan["complexity"])
        : FALLBACK_PLAN.complexity;

      const toBool = (v: unknown): boolean =>
        v === true || v === 1 || (typeof v === "string" && v.toLowerCase() === "true");

      const toArray = (v: unknown): string[] => {
        if (Array.isArray(v)) return v.filter((i): i is string => typeof i === "string");
        if (typeof v === "string") return v ? [v] : [];
        return [];
      };

      return {
        ...FALLBACK_PLAN,
        ...parsed,
        needsResearch: toBool(parsed.needsResearch),
        complexity: normalizedComplexity,
        searchQueries: toArray(parsed.searchQueries),
        focusAreas: toArray(parsed.focusAreas),
        steps: toArray(parsed.steps),
        potentialIssues: toArray(parsed.potentialIssues),
        filesToModify: toArray(parsed.filesToModify),
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
