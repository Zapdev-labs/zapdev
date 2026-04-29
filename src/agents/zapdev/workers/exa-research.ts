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
    return { summary: "No external research performed.", citations: [], skip: true };
  }

  const exa = new Exa(exaKey);
  const allResults: { url: string; title: string; text: string }[] = [];

  const searchResults = await Promise.all(
    searchQueries.slice(0, 3).map(async (query, i) => {
      try {
        const response = await exa.searchAndContents(query, {
          type: "auto",
          numResults: MAX_RESULTS_PER_QUERY,
          text: { maxCharacters: MAX_CONTENT_LENGTH },
        });
        return response.results.map((result) => ({
          url: result.url,
          title: result.title ?? query,
          text: (result.text ?? "").slice(0, MAX_CONTENT_LENGTH),
        }));
      } catch (err) {
        console.error(`[EXA] search failed for query #${i + 1}:`, err);
        return [];
      }
    })
  );

  allResults.push(...searchResults.flat());

  if (allResults.length === 0) {
    return { summary: "External search returned no results.", citations: [], skip: true };
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
      let citations = parsed.citations;
      const isValidCitation = (c: unknown): c is { url: string; title: string; content: string } =>
        c != null &&
        typeof (c as Record<string, unknown>).url === "string" &&
        typeof (c as Record<string, unknown>).title === "string" &&
        typeof (c as Record<string, unknown>).content === "string";

      if (!Array.isArray(citations) || !citations.every(isValidCitation)) {
        citations = allResults.map((r) => ({
          url: r.url,
          title: r.title,
          content: r.text,
        }));
      }
      return {
        summary: parsed.summary,
        citations,
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
      skip: true,
    };
  }
}
