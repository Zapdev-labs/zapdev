import { generateText } from "ai";

import { openrouter } from "../client";
import { PLAN_STEP_PROMPT, ENHANCE_SYSTEM_PROMPT, isUIGenerationRequest } from "./prompts";
import { safeParseAIJSON } from "./utils";
import type { AgentPlan } from "./types";

const PLANNER_MODEL = "moonshotai/kimi-k2.5:nitro";
const ENHANCE_MODEL = "moonshotai/kimi-k2.5:nitro";

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
      return {
        ...FALLBACK_PLAN,
        ...parsed,
        searchQueries: parsed.searchQueries ?? [],
        focusAreas: parsed.focusAreas ?? [],
        steps: parsed.steps ?? [],
        potentialIssues: parsed.potentialIssues ?? [],
        filesToModify: parsed.filesToModify ?? [],
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
