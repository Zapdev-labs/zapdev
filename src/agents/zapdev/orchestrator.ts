import { runPlanner, runEnhancer } from "./planner";
import { runRepoResearch } from "./workers/repo-research";
import { runExaResearch } from "./workers/exa-research";
import { runReview } from "./workers/review";
import { buildEnrichedSystemPrompt } from "./context-builder";
import { isUIGenerationRequest } from "./prompts";
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

  const enrichedSystemPrompt = buildEnrichedSystemPrompt({
    basePrompt: baseSystemPrompt,
    plan,
    repoResearch,
    exaResearch,
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

export function appendReviewNotes(
  summary: string,
  review: ReviewArtifact | null
): string {
  if (!review) return summary;
  if (review.quality !== "critical_issues") return summary;
  if (review.issues.length === 0) return summary;

  return `${summary}\n\n---\n**Review Notes:**\n${review.issues
    .map((i) => `- ${i}`)
    .join("\n")}`;
}
