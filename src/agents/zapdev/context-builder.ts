import type { AgentPlan, ResearchArtifact } from "./types";

const SKIP_EXA_SUMMARIES = new Set([
  "No external research performed.",
  "External search returned no results.",
  "External research synthesis failed.",
]);

/**
 * Build an enriched system prompt by layering plan + research artifacts
 * on top of a base framework system prompt.
 */
export function buildEnrichedSystemPrompt(options: {
  basePrompt: string;
  plan: AgentPlan;
  repoResearch: ResearchArtifact | null;
  exaResearch: ResearchArtifact | null;
}): string {
  const { basePrompt, plan, repoResearch, exaResearch } = options;
  let prompt = basePrompt;

  if (repoResearch?.summary) {
    prompt += `\n\n<repo_research>\n${repoResearch.summary}`;
    if (repoResearch.relevantFiles?.length) {
      prompt += `\n\nRelevant files:\n${repoResearch.relevantFiles
        .map((f) => `- ${f.name}: ${f.snippet}`)
        .join("\n")}`;
    }
    prompt += `\n</repo_research>`;
  }

  if (exaResearch?.summary && !SKIP_EXA_SUMMARIES.has(exaResearch.summary)) {
    prompt += `\n\n<external_research>\n${exaResearch.summary}`;
    if (exaResearch.citations?.length) {
      prompt += `\n\nSources:\n${exaResearch.citations
        .map((c) => `- [${c.title}](${c.url})`)
        .join("\n")}`;
    }
    prompt += `\n</external_research>`;
  }

  const hasPlanContent =
    plan.implementationHints ||
    plan.steps?.length ||
    plan.potentialIssues?.length ||
    plan.filesToModify?.length;

  if (hasPlanContent) {
    prompt += `\n\n<implementation_plan>`;
    if (plan.implementationHints) {
      prompt += `\n\n## Approach\n${plan.implementationHints}`;
    }
    if (plan.steps?.length) {
      prompt += `\n\n## Implementation Steps\n${plan.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
    }
    if (plan.filesToModify?.length) {
      prompt += `\n\n## Files to Create / Modify\n${plan.filesToModify.map((f) => `- ${f}`).join("\n")}`;
    }
    if (plan.potentialIssues?.length) {
      prompt += `\n\n## Watch Out For\n${plan.potentialIssues.map((p) => `- ${p}`).join("\n")}`;
    }
    prompt += `\n</implementation_plan>`;
  }

  return prompt;
}
