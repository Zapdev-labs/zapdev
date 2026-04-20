import { generateText } from "ai";

import { openrouter } from "../../client";
import { REPO_RESEARCH_PROMPT } from "../prompts";
import { safeParseAIJSON } from "../utils";
import type { RepoResearchInput, ResearchArtifact } from "../types";

const REPO_MODEL = "x-ai/grok-4.1-fast";
const MAX_SNIPPET = 600;

/**
 * For zapdev, repo research operates over a seed of project files
 * (framework boilerplate or prior-session files). The caller provides
 * `projectFiles` so we don't couple this to a specific storage backend.
 */
export async function runRepoResearch(
  input: RepoResearchInput & { projectFiles?: Record<string, string> }
): Promise<ResearchArtifact> {
  const { userMessage, focusAreas, projectFiles = {} } = input;

  const fileEntries = Object.entries(projectFiles);
  const fileTree = fileEntries.map(([name]) => `[file] ${name}`).join("\n");
  const keySnippets = fileEntries
    .slice(0, 8)
    .map(([name, content]) => `--- ${name} ---\n${content.slice(0, MAX_SNIPPET)}`)
    .join("\n\n");

  const focusLine = focusAreas.length > 0 ? focusAreas.join(", ") : "general";

  try {
    const { text } = await generateText({
      model: openrouter(REPO_MODEL),
      prompt: `${REPO_RESEARCH_PROMPT}

User request: "${userMessage}"
Focus areas: ${focusLine}

Project files:
${fileTree || "(empty project — fresh generation)"}

Key file contents:
${keySnippets || "(no existing files)"}`,
      temperature: 0.2,
      maxOutputTokens: 2048,
    });

    const parsed = safeParseAIJSON<ResearchArtifact>(text);
    if (parsed?.summary) {
      return {
        summary: parsed.summary,
        relevantFiles: parsed.relevantFiles ?? [],
      };
    }
    return { summary: text, relevantFiles: [] };
  } catch (error) {
    console.error("[REPO_RESEARCH] Error:", error);
    return { summary: "", relevantFiles: [] };
  }
}
