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

const REVIEW_QUALITIES: ReviewArtifact["quality"][] = [
  "good",
  "needs_improvement",
  "critical_issues",
];
const SENSITIVE_SEGMENTS = new Set(["node_modules", "vendor"]);
const SENSITIVE_BASENAMES = new Set([
  "env",
  "credentials",
  "credentials.json",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "known_hosts",
]);
const SENSITIVE_SUFFIXES = [".env", ".key", ".pem", ".p12", ".pfx", ".crt", ".csr"];

function isSensitivePath(path: string): boolean {
  const segments = path.toLowerCase().split(/[/\\]/).filter(Boolean);
  const basename = segments.at(-1) ?? "";

  if (segments.some((segment) => segment.startsWith("."))) return true;
  if (segments.some((segment) => SENSITIVE_SEGMENTS.has(segment))) return true;
  if (SENSITIVE_BASENAMES.has(basename)) return true;
  return SENSITIVE_SUFFIXES.some(
    (suffix) => basename === suffix || basename.endsWith(suffix)
  );
}

function isReviewQuality(value: unknown): value is ReviewArtifact["quality"] {
  return REVIEW_QUALITIES.some((quality) => quality === value);
}

export async function runReview(input: ReviewInput): Promise<ReviewArtifact> {
  const { userMessage, implementationSummary, files } = input;

  const sourceEntries = Object.entries(files).filter(([name]) => {
    if (isSensitivePath(name)) return false;
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
      const toStringArray = (v: unknown): string[] => {
        if (Array.isArray(v)) return v.filter((i): i is string => typeof i === "string" && Boolean(i));
        if (typeof v === "string" && v) return [v];
        if (v != null && typeof v === "object") return [JSON.stringify(v)];
        return [];
      };

      return {
        issues: toStringArray(parsed.issues),
        suggestions: toStringArray(parsed.suggestions),
        quality: isReviewQuality(parsed.quality) ? parsed.quality : "needs_improvement",
      };
    }

    return { issues: [], suggestions: [text].filter(Boolean), quality: "good" };
  } catch (error) {
    console.error("[REVIEW] Error:", error);
    return { issues: [], suggestions: [], quality: "good" };
  }
}
