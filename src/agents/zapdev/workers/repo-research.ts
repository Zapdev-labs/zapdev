import { generateText } from "ai";

import { openrouter } from "../../client";
import { REPO_RESEARCH_PROMPT } from "../prompts";
import { safeParseAIJSON } from "../utils";
import type { RepoResearchInput, ResearchArtifact } from "../types";

const REPO_MODEL = "x-ai/grok-4.1-fast";
const MAX_SNIPPET = 600;

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

function isRelevantFile(value: unknown): value is { name: string; snippet: string } {
  if (value == null || typeof value !== "object") return false;
  const candidate = value;

  return (
    "name" in candidate &&
    "snippet" in candidate &&
    typeof candidate.name === "string" &&
    typeof candidate.snippet === "string"
  );
}

/**
 * For zapdev, repo research operates over a seed of project files
 * (framework boilerplate or prior-session files). The caller provides
 * `projectFiles` so we don't couple this to a specific storage backend.
 */
export async function runRepoResearch(
  input: RepoResearchInput & { projectFiles?: Record<string, string> }
): Promise<ResearchArtifact> {
  const { userMessage, focusAreas, projectFiles = {} } = input;

  const fileEntries = Object.entries(projectFiles).filter(
    ([name]) => !isSensitivePath(name)
  );
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
      let relevantFiles = parsed.relevantFiles;
      if (Array.isArray(relevantFiles)) {
        relevantFiles = relevantFiles.filter(isRelevantFile);
      } else if (typeof relevantFiles === "string") {
        try {
          const parsedArr = JSON.parse(relevantFiles);
          relevantFiles = Array.isArray(parsedArr) ? parsedArr.filter(isRelevantFile) : [];
        } catch {
          relevantFiles = [];
        }
      } else if (isRelevantFile(relevantFiles)) {
        relevantFiles = [relevantFiles];
      } else {
        relevantFiles = [];
      }
      return {
        summary: parsed.summary,
        relevantFiles,
      };
    }
    return { summary: text, relevantFiles: [] };
  } catch (error) {
    console.error("[REPO_RESEARCH] Error:", error);
    return { summary: "", relevantFiles: [] };
  }
}
