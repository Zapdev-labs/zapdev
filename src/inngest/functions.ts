import { z } from "zod";
import { generateText, tool, stepCountIs } from "ai";
import Exa from "exa-js";
import {
  openai,
  createAgent,
  createTool,
  createNetwork,
  type Tool,
  type Message,
  createState,
} from "@inngest/agent-kit";
import { ConvexHttpClient } from "convex/browser";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  FRAGMENT_TITLE_PROMPT,
  FULLSTACK_PROMPT,
  PROMPT,
  RESPONSE_PROMPT,
} from "@/prompt";
import { PLANNING_AGENT_PROMPT } from "@/prompts/planning";
import { RESEARCH_AGENT_PROMPT } from "@/prompts/research";
import {
  parseSchemaProposal,
  runBackendImplementerAgent,
  runSchemaProposalAgent,
  wantsConvexBackend,
} from "@/agents";
import { selectModelForTask } from "@/agents/types";
import { openrouter } from "@/agents/client";

import { inngest } from "./client";
import {
  lastAssistantTextMessageContent,
  parseAgentOutput,
} from "./utils";
import { estimateComplexity } from "@/agents/timeout-manager";

// Internal agent models — not user-selectable
const PLANNING_MODEL = "moonshotai/kimi-k2.5:nitro";
const RESEARCH_MODEL = "x-ai/grok-4.1-fast";

function getConvexClient(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

const getModelForAgent = (
  requestedModel: string | undefined,
  prompt: string
): string => {
  if (requestedModel && requestedModel !== "auto") return requestedModel;
  return selectModelForTask(prompt);
};

interface AgentState {
  summary: string;
  files: { [path: string]: string };
}

// ─── Planning Agent ───────────────────────────────────────────────────────────
// Uses kimi-k2.5 to produce a comprehensive implementation plan.
async function runPlanningAgent(userPrompt: string): Promise<string> {
  console.log("[PLANNING] Starting with kimi-k2.5...");
  try {
    const { text } = await generateText({
      model: openrouter(PLANNING_MODEL),
      system: PLANNING_AGENT_PROMPT,
      prompt: userPrompt,
      temperature: 0.3,
      maxOutputTokens: 4096,
    });
    console.log(`[PLANNING] Done — ${text.length} chars`);
    return text;
  } catch (error) {
    console.error("[PLANNING] Error:", error);
    return "";
  }
}

// ─── Research Agent ───────────────────────────────────────────────────────────
// Uses grok-4.1-fast + Exa to find relevant docs, examples, and best practices.
async function runResearchAgent(
  userPrompt: string,
  plan: string
): Promise<string> {
  console.log("[RESEARCH] Starting with grok-4.1-fast + Exa...");

  const exaApiKey = process.env.EXA_API_KEY;

  const researchPrompt = [
    "## User Request",
    userPrompt,
    "",
    "## Implementation Plan",
    plan,
    "",
    "Search for documentation and code examples for the key technologies in this plan. Focus on anything version-specific, non-trivial, or easy to get wrong.",
  ].join("\n");

  try {
    // First try: Use Grok through OpenRouter with standard chat completions
    // Note: We avoid 'tools' and 'stopWhen' to prevent AI SDK from using Responses API
    // which isn't fully supported by OpenRouter for all models
    if (!exaApiKey) {
      console.warn("[RESEARCH] EXA_API_KEY not set — running without web search");
      try {
        const { text } = await generateText({
          model: openrouter(RESEARCH_MODEL),
          system: RESEARCH_AGENT_PROMPT,
          prompt: researchPrompt,
          temperature: 0.2,
          maxOutputTokens: 2048,
        });
        console.log(`[RESEARCH] Done — ${text.length} chars (no Exa)`);
        return text;
      } catch (grokError) {
        console.error("[RESEARCH] Grok API failed, falling back to Kimi:", grokError);
        const { text } = await generateText({
          model: openrouter("moonshotai/kimi-k2.5"),
          system: RESEARCH_AGENT_PROMPT,
          prompt: researchPrompt,
          temperature: 0.2,
          maxOutputTokens: 2048,
        });
        console.log(`[RESEARCH] Done with fallback — ${text.length} chars`);
        return text;
      }
    }

    // With Exa: Run search first, then generate research summary
    // We do this in two steps to avoid the Responses API issue
    try {
      // Step 1: Generate search queries using the research model
      const searchQueriesPrompt = `${researchPrompt}\n\nGenerate 3-5 specific search queries to find relevant documentation and examples. Return them as a JSON array of strings.`;
      
      const { text: queriesText } = await generateText({
        model: openrouter(RESEARCH_MODEL),
        system: RESEARCH_AGENT_PROMPT,
        prompt: searchQueriesPrompt,
        temperature: 0.2,
        maxOutputTokens: 500,
      });

      // Parse queries and run Exa searches
      let searchResults: string[] = [];
      try {
        // Extract queries (handle both JSON array and plain text)
        const queries = queriesText
          .replace(/^[\s\S]*?\[/, '[') // Find start of array
          .replace(/\][\s\S]*$/, ']')  // Find end of array
          .split('\n')
          .map(q => q.replace(/^["']|["']$/g, '').trim())
          .filter(q => q.length > 10);

        for (const query of queries.slice(0, 3)) {
          try {
            console.log(`[RESEARCH] Exa: "${query}"`);
            const exa = new Exa(exaApiKey);
            const results = await exa.searchAndContents(query, {
              type: "auto",
              numResults: 3,
              text: { maxCharacters: 800 },
            });
            const formatted = results.results.map((r) => 
              `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.text?.slice(0, 600) ?? "No content"}`
            );
            searchResults.push(...formatted);
          } catch (exaErr) {
            console.error(`[RESEARCH] Exa search failed for "${query}":`, exaErr);
          }
        }
      } catch (parseErr) {
        console.error("[RESEARCH] Failed to parse search queries:", parseErr);
      }

      // Step 2: Generate final research summary with search results
      const finalPrompt = searchResults.length > 0
        ? `${researchPrompt}\n\n## Search Results\n${searchResults.join("\n\n---\n\n")}\n\nSynthesize these findings into actionable implementation guidance.`
        : researchPrompt;

      const { text } = await generateText({
        model: openrouter(RESEARCH_MODEL),
        system: RESEARCH_AGENT_PROMPT,
        prompt: finalPrompt,
        temperature: 0.2,
        maxOutputTokens: 4096,
      });

      console.log(`[RESEARCH] Done — ${text.length} chars`);
      return text;
    } catch (grokError) {
      console.error("[RESEARCH] Grok API with tools failed, falling back to simple mode:", grokError);
      // Fallback: Run without tools
      const { text } = await generateText({
        model: openrouter("moonshotai/kimi-k2.5"),
        system: RESEARCH_AGENT_PROMPT,
        prompt: researchPrompt,
        temperature: 0.2,
        maxOutputTokens: 2048,
      });
      console.log(`[RESEARCH] Done with fallback — ${text.length} chars`);
      return text;
    }
  } catch (error) {
    console.error("[RESEARCH] All research methods failed:", error);
    return ""; // Return empty to allow code agent to proceed without research
  }
}

// ─── Main Inngest Function ────────────────────────────────────────────────────
export const codeAgentFunction = inngest.createFunction(
  {
    id: "code-agent",
    concurrency: {
      limit: 3,
      key: "event.data.userId",
    },
  },
  { event: "agent/code-agent-kit.run" },
  async ({ event, step }) => {
    const userPrompt = event.data.value as string;
    const complexity = estimateComplexity(userPrompt);
    console.log(`[AGENT] Task complexity: ${complexity}`);

    // ── Steps 1 + 3: Planning Agent + Previous Messages (in parallel) ───────
    // Message loading doesn't depend on planning, so run both at once.
    // For simple tasks, skip planning entirely to save 20-40s.
    const [plan, previousMessages] = await Promise.all([
      complexity === "simple"
        ? Promise.resolve("")
        : step.run("planning-agent", () => runPlanningAgent(userPrompt)),
      step.run("get-previous-messages", async () => {
        try {
          const formattedMessages: Message[] = [];
          const convex = getConvexClient();
          const messages = await convex.query(api.messages.listForUser, {
            userId: event.data.userId as string,
            projectId: event.data.projectId as Id<"projects">,
          });
          const recentMessages = messages.slice(-5);
          for (const message of recentMessages) {
            formattedMessages.push({
              type: "text",
              role: message.role === "ASSISTANT" ? "assistant" : "user",
              content: message.content,
            });
          }
          return formattedMessages;
        } catch (error) {
          console.error("[get-previous-messages] Failed to fetch messages:", error);
          return [];
        }
      }),
    ]);

    // ── Step 2: Research Agent (only for complex tasks) ──────────────────────
    // Simple/medium tasks don't need web research — saves 20-45s.
    const research =
      complexity === "complex" && plan
        ? await step.run("research-agent", () =>
            runResearchAgent(userPrompt, plan)
          )
        : "";

    const projectId = event.data.projectId as Id<"projects">;
    const userId = event.data.userId as string;

    const project = await step.run("get-project-for-agent", async () => {
      const convex = getConvexClient();
      return await convex.query(api.projects.getForUser, { userId, projectId });
    });

    let backendPreload: Record<string, string> = {};
    let schemaProposalText: string | undefined;

    const needsBackendBootstrap =
      Boolean(project && !project.hasBackend && wantsConvexBackend(userPrompt));

    if (needsBackendBootstrap) {
      const triggerMessageId = await step.run("resolve-trigger-message", async () => {
        const explicit = event.data.messageId as string | undefined;
        if (explicit && explicit.length > 0) {
          return explicit as Id<"messages">;
        }
        const convex = getConvexClient();
        const messages = await convex.query(api.messages.listForUser, {
          userId,
          projectId,
        });
        const lastUser = [...messages].reverse().find((m) => m.role === "USER");
        return lastUser?._id ?? null;
      });

      if (triggerMessageId) {
        const schemaProposalResult = await step.run("schema-proposal-agent", () =>
          runSchemaProposalAgent(userPrompt, plan || undefined, research || undefined)
        );

        if (schemaProposalResult.success) {
          schemaProposalText = schemaProposalResult.schemaProposal;
          const parsed = parseSchemaProposal(schemaProposalResult.schemaProposal);
          const schemaProposalRowId = await step.run("persist-schema-proposal", async () => {
            const convex = getConvexClient();
            return await convex.mutation(api.schemaProposals.createForUser, {
              userId,
              projectId,
              messageId: triggerMessageId,
              proposal: schemaProposalResult.schemaProposal,
              parsedTables:
                parsed.tables.length > 0
                  ? parsed.tables.map((t) => ({
                      name: t.name,
                      purpose: t.purpose,
                      fields: t.fields,
                      indexes: t.indexes,
                    }))
                  : undefined,
              parsedRelationships:
                parsed.relationships.length > 0 ? parsed.relationships : undefined,
              status: "PENDING",
            });
          });

          const backendResult = await step.run("backend-implementer", () =>
            runBackendImplementerAgent(
              userPrompt,
              schemaProposalResult.schemaProposal,
              plan || undefined
            )
          );

          if (backendResult.success && Object.keys(backendResult.files).length > 0) {
            backendPreload = backendResult.files;
            await step.run("finalize-backend-bootstrap", async () => {
              const convex = getConvexClient();
              await convex.mutation(api.schemaProposals.markImplementedForUser, {
                userId,
                schemaProposalId: schemaProposalRowId,
              });
              await convex.mutation(api.projects.setHasBackendForUser, {
                userId,
                projectId,
                hasBackend: true,
              });
            });
          }
        }
      }
    }

    const useFullstackPrompt =
      Boolean(project?.hasBackend) ||
      wantsConvexBackend(userPrompt) ||
      Object.keys(backendPreload).length > 0;

    const state = createState<AgentState>(
      { summary: "", files: { ...backendPreload } },
      { messages: previousMessages }
    );

    // ── Build augmented prompt ───────────────────────────────────────────────
    // Inject plan + research so the code agent has full context.
    const planBlock = plan
      ? `\n\n<implementation_plan>\n${plan}\n</implementation_plan>`
      : "";
    const researchBlock = research
      ? `\n\n<research_findings>\n${research}\n</research_findings>`
      : "";
    const contextNote =
      planBlock || researchBlock
        ? "\n\nUse the implementation plan and research findings above as your blueprint. Follow the plan precisely and apply the research insights to ensure accuracy."
        : "";

    const convexBlock =
      schemaProposalText || Object.keys(backendPreload).length > 0
        ? `\n\n<convex_context>\n${
            schemaProposalText
              ? `Schema design (approved):\n${schemaProposalText}\n\n`
              : ""
          }${
            Object.keys(backendPreload).length > 0
              ? `Convex backend files are already present in the workspace: ${Object.keys(
                  backendPreload
                ).join(", ")}. Extend them only if needed; do not discard them.\n`
              : ""
          }</convex_context>`
        : "";

    const augmentedPrompt = `${userPrompt}${planBlock}${researchBlock}${convexBlock}${contextNote}`;

    // ── Step 5: Code Agent (user-selected model) ─────────────────────────────
    const selectedModel = getModelForAgent(
      event.data.model as string | undefined,
      userPrompt
    );
    console.log(
      `[CODING] Starting with ${selectedModel} (fullstack=${useFullstackPrompt})...`
    );

    const codeAgent = createAgent<AgentState>({
      name: "code-agent",
      description: "An expert coding agent",
      system: useFullstackPrompt ? FULLSTACK_PROMPT : PROMPT,
      system: PROMPT,
      tool_choice: "auto",
      model: openai({
        model: selectedModel,
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: process.env.OPENROUTER_API_KEY,
        defaultParameters: { temperature: 0.1 },
      }),
      tools: [
        createTool({
          name: "terminal",
          description: "Use the terminal to run commands",
          parameters: z.object({ command: z.string() }),
          handler: async ({ command }) => {
            console.log(`[TERMINAL] Simulated: ${command}`);
            return "Command completed with exit code 0.";
          },
        }),
        createTool({
          name: "createOrUpdateFiles",
          description: "MANDATORY: Use this tool to write files to the sandbox. You MUST call this tool with an array of files to create or update. Each file needs a relative path and content string. ALWAYS use this tool instead of printing file contents in your response.",
          parameters: z.object({
            files: z.array(
              z.object({ path: z.string().describe("Relative file path, e.g., app/page.tsx"), content: z.string().describe("Full file content") })
            ).describe("Array of files to create or update"),
          }),
          handler: async (
            { files },
            { network }: Tool.Options<AgentState>
          ) => {
            const updatedFiles = network.state.data.files || {};
            for (const file of files) {
              updatedFiles[file.path] = file.content;
            }
            network.state.data.files = updatedFiles;
            const fileList = Object.keys(updatedFiles);
            console.log(`[CODING] Files saved: ${fileList.join(", ")}`);
            return `Successfully saved ${files.length} file(s): ${files.map(f => f.path).join(", ")}. Total files in workspace: ${fileList.length}`;
          },
        }),
        createTool({
          name: "readFiles",
          description: "Read files from the sandbox",
          parameters: z.object({ files: z.array(z.string()) }),
          handler: async ({ files }, { network }: Tool.Options<AgentState>) => {
            const storedFiles = network.state.data.files || {};
            const contents = files.map((f) => ({ path: f, content: storedFiles[f] ?? null }));
            return JSON.stringify(contents);
          },
        }),
      ],
      lifecycle: {
        onResponse: async ({ result, network }) => {
          const lastAssistantMessageText =
            lastAssistantTextMessageContent(result);
          console.log(`[CODING] Agent response received, messages: ${result.output.length}, text length: ${lastAssistantMessageText?.length || 0}`);
          
          if (lastAssistantMessageText && network) {
            if (lastAssistantMessageText.includes("<task_summary>")) {
              network.state.data.summary = lastAssistantMessageText;
              console.log("[CODING] Task summary captured");
            }
          }
          return result;
        },
      },
    });

    const maxIter =
      complexity === "simple" ? 6 : complexity === "medium" ? 10 : 15;
    console.log(`[AGENT] maxIter=${maxIter} for ${complexity} task`);

    const network = createNetwork<AgentState>({
      name: "coding-agent-network",
      agents: [codeAgent],
      maxIter,
      defaultState: state,
      router: async ({ network }) => {
        if (network.state.data.summary) return;
        return codeAgent;
      },
    });

    const result = await network.run(augmentedPrompt, { state });
    console.log(`[CODING] Network run completed`);

    // ── Resolve summary & error state ────────────────────────────────────────
    const fileCount = Object.keys(result.state.data.files || {}).length;
    // If agent hit maxIter without a summary but did write files, use fallback
    if (!result.state.data.summary && fileCount > 0) {
      result.state.data.summary = `<task_summary>Generated ${fileCount} file(s): ${Object.keys(result.state.data.files).join(", ")}</task_summary>`;
    }
    const hasSummary = Boolean(result.state.data.summary);
    const isError = !hasSummary && fileCount === 0;

    console.log(`[CODING] Agent finished — hasSummary=${hasSummary}, fileCount=${fileCount}, isError=${isError}`);
    if (!hasSummary) console.error("[CODING] No <task_summary> produced — agent may have hit maxIter or build kept failing");
    if (fileCount === 0) console.error("[CODING] No files written — createOrUpdateFiles may have silently failed");

    const sandboxUrl = "__WEBCONTAINER_PREVIEW__";

    if (isError) {
      await step.run("save-error", async () => {
        const convex = getConvexClient();
        return await convex.mutation(api.messages.createForUser, {
          userId: event.data.userId as string,
          projectId: event.data.projectId as Id<"projects">,
          content: "Something went wrong. Please try again.",
          role: "ASSISTANT",
          type: "ERROR",
        });
      });

      // Throw error to mark Inngest run as failed
      throw new Error(
        `Agent failed: no summary and no files written (hasSummary=${hasSummary}, fileCount=${fileCount})`
      );
    } else {
      // Generate title + response from the summary
      const fragmentTitleGenerator = createAgent({
        name: "fragment-title-generator",
        description: "A fragment title generator",
        system: FRAGMENT_TITLE_PROMPT,
        model: openai({
          model: "anthropic/claude-haiku-4.5",
          baseUrl: "https://openrouter.ai/api/v1",
          apiKey: process.env.OPENROUTER_API_KEY,
        }),
      });

      const responseGenerator = createAgent({
        name: "response-generator",
        description: "A response generator",
        system: RESPONSE_PROMPT,
        model: openai({
          model: "anthropic/claude-haiku-4.5",
          baseUrl: "https://openrouter.ai/api/v1",
          apiKey: process.env.OPENROUTER_API_KEY,
        }),
      });

      const [{ output: fragmentTitleOutput }, { output: responseOutput }] =
        await Promise.all([
          fragmentTitleGenerator.run(result.state.data.summary),
          responseGenerator.run(result.state.data.summary),
        ]);

      await step.run("save-result", async () => {
        const convex = getConvexClient();

        const messageId = await convex.mutation(api.messages.createForUser, {
          userId,
          projectId,
          content: parseAgentOutput(responseOutput),
          role: "ASSISTANT",
          type: "RESULT",
        });

        const backendKeys = Object.keys(backendPreload);
        const hasBackendFiles = backendKeys.length > 0;

        await convex.mutation(api.messages.createFragmentForUser, {
          userId,
          messageId: messageId as Id<"messages">,
          sandboxUrl,
          title: parseAgentOutput(fragmentTitleOutput),
          files: result.state.data.files,
          framework: "NEXTJS",
          ...(hasBackendFiles && {
            hasBackend: true,
            backendFiles: backendPreload,
          }),
        });

        return messageId;
      });
    }

    return {
      url: sandboxUrl,
      title: "Fragment",
      files: result.state.data.files,
      summary: result.state.data.summary,
    };
  }
);
