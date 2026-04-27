import { runPlanner, runEnhancer } from "./planner";
import { runRepoResearch } from "./workers/repo-research";
import { runExaResearch } from "./workers/exa-research";
import { runReview } from "./workers/review";
import { buildEnrichedSystemPrompt } from "./context-builder";
import { isUIGenerationRequest } from "./prompts";
import { aiPickTasteSkill, fetchTasteSkill } from "./taste-router";
import type { AgentPlan, ResearchArtifact, ReviewArtifact } from "./types";

export interface OrchestrationInput {
  userMessage: string;
  userId?: string;
  projectId?: string;
  baseSystemPrompt: string;
  projectFiles?: Record<string, string>;
  contextSummary?: string;
  /** If true, skips the prompt enhancer even for UI requests (for tests). */
  skipEnhance?: boolean;
}

export interface OrchestrationPreResult {
  workingMessage: string;
  enhancedPrompt: string | null;
  plan: AgentPlan;
  repoResearch: ResearchArtifact | null;
  exaResearch: ResearchArtifact | null;
  enrichedSystemPrompt: string;
}

/**
 * Stage 1-4: enhance, plan, research fan-out, build enriched system prompt.
 * The caller then hands enrichedSystemPrompt + workingMessage to the E2B
 * coding agent (Stage 5). Stage 6 (review) runs via {@link runPostReview}.
 */
export async function runPreflight(
  input: OrchestrationInput
): Promise<OrchestrationPreResult> {
  const { userMessage, baseSystemPrompt, projectFiles, contextSummary, skipEnhance } =
    input;

  const enhancedPrompt =
    !skipEnhance && isUIGenerationRequest(userMessage)
      ? await runEnhancer(userMessage)
      : null;

  const workingMessage = enhancedPrompt ?? userMessage;

  const plan = await runPlanner(workingMessage, contextSummary);

  let repoResearch: ResearchArtifact | null = null;
  let exaResearch: ResearchArtifact | null = null;

  if (plan.needsResearch) {
    const base = {
      userMessage: workingMessage,
      userId: input.userId,
      projectId: input.projectId,
    };

    const [repoResult, exaResult] = await Promise.all([
      runRepoResearch({ ...base, focusAreas: plan.focusAreas, projectFiles }),
      runExaResearch({ ...base, searchQueries: plan.searchQueries }),
    ]);

    repoResearch = repoResult;
    exaResearch = exaResult;
  }

  const tasteSkill = await aiPickTasteSkill(workingMessage);
  const tasteSkillContent = tasteSkill
    ? await fetchTasteSkill(tasteSkill.id)
    : null;

  const enrichedSystemPrompt = buildEnrichedSystemPrompt({
    basePrompt: baseSystemPrompt,
    plan,
    repoResearch,
    exaResearch,
    tasteSkillContent,
  });

  return {
    workingMessage,
    enhancedPrompt,
    plan,
    repoResearch,
    exaResearch,
    enrichedSystemPrompt,
  };
}

export interface PostReviewInput {
  plan: AgentPlan;
  userMessage: string;
  implementationSummary: string;
  files: Record<string, string>;
}

export async function runPostReview(
  input: PostReviewInput
): Promise<ReviewArtifact | null> {
  if (input.plan.complexity === "simple") return null;
  return await runReview({
    userMessage: input.userMessage,
    implementationSummary: input.implementationSummary,
    files: input.files,
  });
}

/**
 * Appends review notes to the implementation summary when a review exists.
 * Surfaces critical issues, needs-improvement items, and suggestions.
 */
export function appendReviewNotes(
  summary: string,
  review: ReviewArtifact | null
): string {
  if (!review) return summary;

  const sections: string[] = [];

  if (review.quality === "critical_issues" && review.issues.length > 0) {
    sections.push(
      `**Critical Issues:**\n${review.issues.map((i) => `- ${i}`).join("\n")}`
    );
  }

  if (review.quality === "needs_improvement" && review.issues.length > 0) {
    sections.push(
      `**Needs Improvement:**\n${review.issues.map((i) => `- ${i}`).join("\n")}`
    );
  }

  if (review.suggestions.length > 0) {
    sections.push(
      `**Suggestions:**\n${review.suggestions.map((s) => `- ${s}`).join("\n")}`
    );
  }

  if (sections.length === 0) return summary;

  return `${summary}\n\n---\n**Review Notes:**\n${sections.join("\n\n")}`;
}
