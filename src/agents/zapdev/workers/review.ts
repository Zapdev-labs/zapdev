import { generateText } from "ai";

import { openrouter } from "../../client";
import { REVIEW_PROMPT } from "../prompts";
import { safeParseAIJSON } from "../utils";
import type { ReviewArtifact, ReviewInput } from "../types";

const REVIEW_MODEL = "anthropic/claude-haiku-4.5";
const MAX_FILES = 10;
const MAX_FILE_CONTENT = 4000;

const REVIEWABLE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx", ".css", ".json", ".vue", ".svelte",
];

export async function runReview(input: ReviewInput): Promise<ReviewArtifact> {
  const { userMessage, implementationSummary, files } = input;

  const sourceEntries = Object.entries(files).filter(([name]) => {
    if (name.startsWith(".")) return false;
    if (name.includes("node_modules")) return false;
    return REVIEWABLE_EXTENSIONS.some((ext) => name.endsWith(ext));
  });

  const snippets = sourceEntries
    .slice(0, MAX_FILES)
    .map(([name, content]) => `--- ${name} ---\n${content.slice(0, MAX_FILE_CONTENT)}`)
    .join("\n\n");

  try {
    const { text } = await generateText({
      model: openrouter(REVIEW_MODEL),
      prompt: `${REVIEW_PROMPT}

User request: "${userMessage}"

Implementation summary from the coding agent:
${implementationSummary}

Current project files:
${snippets || "(no files)"}`,
      temperature: 0.2,
      maxOutputTokens: 2048,
    });

    const parsed = safeParseAIJSON<ReviewArtifact>(text);
    if (parsed?.quality) {
      return {
        issues: parsed.issues ?? [],
        suggestions: parsed.suggestions ?? [],
        quality: parsed.quality,
      };
    }

    return { issues: [], suggestions: [text].filter(Boolean), quality: "good" };
  } catch (error) {
    console.error("[REVIEW] Error:", error);
    return { issues: [], suggestions: [], quality: "good" };
  }
}
