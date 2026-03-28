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
import { FRAGMENT_TITLE_PROMPT, PROMPT, RESPONSE_PROMPT } from "@/prompt";
import { PLANNING_AGENT_PROMPT } from "@/prompts/planning";
import { RESEARCH_AGENT_PROMPT } from "@/prompts/research";
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
    if (!exaApiKey) {
      console.warn("[RESEARCH] EXA_API_KEY not set — running without web search");
      const { text } = await generateText({
        model: openrouter(RESEARCH_MODEL),
        system: RESEARCH_AGENT_PROMPT,
        prompt: researchPrompt,
        temperature: 0.2,
        maxOutputTokens: 2048,
      });
      return text;
    }

    const { text } = await generateText({
      model: openrouter(RESEARCH_MODEL),
      system: RESEARCH_AGENT_PROMPT,
      prompt: researchPrompt,
      temperature: 0.2,
      maxOutputTokens: 4096,
      tools: {
        exa_search: tool({
          description:
            "Search the web for technical documentation, code examples, and best practices. Use specific, targeted queries.",
          inputSchema: z.object({
            query: z
              .string()
              .describe(
                "Specific technical search query (e.g. 'shadcn/ui combobox example 2024', 'next.js 15 server actions form')"
              ),
            numResults: z
              .number()
              .optional()
              .describe("Number of results to return (1–8, default 5)"),
          }),
          execute: async ({ query, numResults = 5 }) => {
            try {
              console.log(`[RESEARCH] Exa: "${query}"`);
              const exa = new Exa(exaApiKey);
              const results = await exa.searchAndContents(query, {
                type: "auto",
                numResults: Math.min(numResults ?? 3, 5),
                text: { maxCharacters: 800 },
              });
              const formatted = results.results.map((r) => ({
                title: r.title,
                url: r.url,
                content: r.text?.slice(0, 600) ?? "",
              }));
              console.log(`[RESEARCH] Exa returned ${formatted.length} results`);
              return JSON.stringify(formatted);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error("[RESEARCH] Exa error:", msg);
              return `Search failed: ${msg}`;
            }
          },
        }),
      },
      stopWhen: stepCountIs(3),
    });

    console.log(`[RESEARCH] Done — ${text.length} chars`);
    return text;
  } catch (error) {
    console.error("[RESEARCH] Error:", error);
    return "";
  }
}

// ─── Main Inngest Function ────────────────────────────────────────────────────
export const codeAgentFunction = inngest.createFunction(
  { id: "code-agent" },
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

    const state = createState<AgentState>(
      { summary: "", files: {} },
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

    const augmentedPrompt = `${userPrompt}${planBlock}${researchBlock}${contextNote}`;

    // ── Step 5: Code Agent (user-selected model) ─────────────────────────────
    const selectedModel = getModelForAgent(
      event.data.model as string | undefined,
      userPrompt
    );
    console.log(`[CODING] Starting with ${selectedModel}...`);

    const codeAgent = createAgent<AgentState>({
      name: "code-agent",
      description: "An expert coding agent",
      system: PROMPT,
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
          description: "Create or update files in the sandbox",
          parameters: z.object({
            files: z.array(
              z.object({ path: z.string(), content: z.string() })
            ),
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
            console.log(`[CODING] Files saved: ${Object.keys(updatedFiles).join(", ")}`);
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
          if (lastAssistantMessageText && network) {
            if (lastAssistantMessageText.includes("<task_summary>")) {
              network.state.data.summary = lastAssistantMessageText;
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
        const userId = event.data.userId as string;
        const projectId = event.data.projectId as Id<"projects">;

        const messageId = await convex.mutation(api.messages.createForUser, {
          userId,
          projectId,
          content: parseAgentOutput(responseOutput),
          role: "ASSISTANT",
          type: "RESULT",
        });

        await convex.mutation(api.messages.createFragmentForUser, {
          userId,
          messageId: messageId as Id<"messages">,
          sandboxUrl,
          title: parseAgentOutput(fragmentTitleOutput),
          files: result.state.data.files,
          framework: "NEXTJS",
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
