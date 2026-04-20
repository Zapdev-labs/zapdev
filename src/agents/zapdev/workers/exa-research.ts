import { generateText } from "ai";
import Exa from "exa-js";

import { openrouter } from "../../client";
import { EXA_RESEARCH_PROMPT } from "../prompts";
import { safeParseAIJSON } from "../utils";
import type { ExaResearchInput, ResearchArtifact } from "../types";

const EXA_MODEL = "x-ai/grok-4.1-fast";
const MAX_RESULTS_PER_QUERY = 3;
const MAX_CONTENT_LENGTH = 800;

export async function runExaResearch(
  input: ExaResearchInput
): Promise<ResearchArtifact> {
  const { userMessage, searchQueries } = input;
  const exaKey = process.env.EXA_API_KEY;

  if (!exaKey || searchQueries.length === 0) {
    return { summary: "No external research performed.", citations: [] };
  }

  const exa = new Exa(exaKey);
  const allResults: { url: string; title: string; text: string }[] = [];

  for (const query of searchQueries.slice(0, 3)) {
    try {
      const response = await exa.searchAndContents(query, {
        type: "auto",
        numResults: MAX_RESULTS_PER_QUERY,
        text: { maxCharacters: MAX_CONTENT_LENGTH },
      });
      for (const result of response.results) {
        allResults.push({
          url: result.url,
          title: result.title ?? query,
          text: (result.text ?? "").slice(0, MAX_CONTENT_LENGTH),
        });
      }
    } catch (err) {
      console.error(`[EXA] search failed for "${query}":`, err);
    }
  }

  if (allResults.length === 0) {
    return { summary: "External search returned no results.", citations: [] };
  }

  const searchContext = allResults
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.text}`)
    .join("\n\n---\n\n");

  try {
    const { text } = await generateText({
      model: openrouter(EXA_MODEL),
      prompt: `${EXA_RESEARCH_PROMPT}

User request: "${userMessage}"
Search queries used: ${searchQueries.join(", ")}

Search results:
${searchContext}`,
      temperature: 0.2,
      maxOutputTokens: 2048,
    });

    const parsed = safeParseAIJSON<ResearchArtifact>(text);
    if (parsed?.summary) {
      return {
        summary: parsed.summary,
        citations: parsed.citations ?? allResults.map((r) => ({
          url: r.url,
          title: r.title,
          content: r.text,
        })),
      };
    }
    return {
      summary: text,
      citations: allResults.map((r) => ({ url: r.url, title: r.title, content: r.text })),
    };
  } catch (error) {
    console.error("[EXA_RESEARCH] Error:", error);
    return {
      summary: "External research synthesis failed.",
      citations: allResults.map((r) => ({ url: r.url, title: r.title, content: r.text })),
    };
  }
}
