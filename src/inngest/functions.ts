import { z } from "zod";
import { generateText } from "ai";
import Exa from "exa-js";
import * as Sentry from "@sentry/nextjs";
import {
  openai,
  createAgent,
  createTool,
  createNetwork,
  type Tool,
  type Message,
  createState,
  type State,
} from "@inngest/agent-kit";
import { ConvexHttpClient } from "convex/browser";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ANGULAR_PROMPT,
  NEXTJS_PROMPT,
  REACT_PROMPT,
  SVELTE_PROMPT,
  VUE_PROMPT,
} from "@/prompt";
import { PLANNING_AGENT_PROMPT } from "@/prompts/planning";
import { RESEARCH_AGENT_PROMPT } from "@/prompts/research";
import {
  selectModelForTask,
  resolveModel,
  frameworkToConvexEnum,
  type Framework,
  type ModelId,
} from "@/agents/types";
import { openrouter } from "@/agents/client";
import {
  createSandbox,
  getSandbox,
  getSandboxUrl,
  isValidFilePath,
  readFileWithTimeout,
  writeFilesBatch,
} from "@/agents/sandbox-utils";
import type { Sandbox } from "@e2b/code-interpreter";

import { inngest } from "./client";
import { lastAssistantTextMessageContent, parseXmlToolCalls, executeToolCalls } from "./utils";
import { estimateComplexity } from "@/agents/timeout-manager";
import { resolveCodingModelPlan } from "./model-routing";
import { isProviderReturnedError } from "./provider-errors";

const FRAMEWORK_PROMPTS: Record<Framework, string> = {
  nextjs: NEXTJS_PROMPT,
  angular: ANGULAR_PROMPT,
  react: REACT_PROMPT,
  vue: VUE_PROMPT,
  svelte: SVELTE_PROMPT,
};

// Internal agent models — not user-selectable
const PLANNING_MODEL = "moonshotai/kimi-k2.6:nitro";
const RESEARCH_MODEL = "x-ai/grok-4.1-fast";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const openrouterAgentModel = (
  model: string,
  defaultParameters?: Record<string, unknown>
) => {
  return openai({
    model,
    baseUrl: OPENROUTER_BASE_URL,
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultParameters,
  });
};

function getErrorField(error: unknown, field: string): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  return (error as Record<string, unknown>)[field];
}

function toResponsePreview(value: unknown): unknown {
  if (typeof value === "string") return truncate(value, 4000);
  if (typeof value !== "object" || value === null) return value;

  try {
    return truncate(JSON.stringify(value), 4000);
  } catch {
    return "[unserializable response body]";
  }
}

function toErrorDetails(error: unknown, depth = 0): Record<string, unknown> {
  const details: Record<string, unknown> = {};

  if (error instanceof Error) {
    details.name = error.name;
    details.message = error.message;
    details.stack = error.stack;
  } else {
    details.value = error;
  }

  const status = getErrorField(error, "status") ?? getErrorField(error, "statusCode");
  const code = getErrorField(error, "code");
  const type = getErrorField(error, "type");
  const requestId =
    getErrorField(error, "requestId") ?? getErrorField(error, "request_id");
  const responseHeaders =
    getErrorField(error, "headers") ?? getErrorField(error, "responseHeaders");
  const responseBody =
    getErrorField(error, "body") ??
    getErrorField(error, "data") ??
    getErrorField(error, "responseBody") ??
    getErrorField(error, "response");

  if (status !== undefined) details.status = status;
  if (code !== undefined) details.code = code;
  if (type !== undefined) details.type = type;
  if (requestId !== undefined) details.requestId = requestId;
  if (responseHeaders !== undefined) details.responseHeaders = responseHeaders;
  if (responseBody !== undefined) details.responseBody = toResponsePreview(responseBody);

  const cause = getErrorField(error, "cause");
  if (cause && depth < 3) {
    details.cause = toErrorDetails(cause, depth + 1);
  }

  return details;
}

function logProviderDebug(context: string, details: Record<string, unknown>): void {
  console.error(`[PROVIDER_DEBUG] ${context}`, {
    timestamp: new Date().toISOString(),
    hasOpenRouterApiKey: Boolean(process.env.OPENROUTER_API_KEY),
    ...details,
  });
}

function isMessageArray(value: unknown): value is Message[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "type" in item &&
        "content" in item,
    )
  );
}

function getConvexClient(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

function shouldRunPlanning(
  prompt: string,
  complexity: "simple" | "medium" | "complex"
): boolean {
  if (complexity === "complex") return true;
  if (complexity === "simple") return false;

  const normalized = prompt.toLowerCase();
  return [
    "refactor",
    "architecture",
    "schema",
    "auth",
    "authentication",
    "authorization",
    "payment",
    "webhook",
    "integration",
    "multi-step",
  ].some((term) => normalized.includes(term));
}

function getMaxAgentIterations(
  complexity: "simple" | "medium" | "complex"
): number {
  if (complexity === "simple") return 3;
  if (complexity === "medium") return 5;
  return 8;
}

function stripTaskSummaryTags(summary: string): string {
  return summary
    .replace(/<\/?task_summary>/g, "")
    .trim();
}

function buildFragmentTitle(userPrompt: string, summary: string): string {
  const source = stripTaskSummaryTags(summary) || userPrompt;
  const firstLine = source
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return "Fragment";

  return firstLine.length > 60 ? `${firstLine.slice(0, 57).trimEnd()}...` : firstLine;
}

function buildAssistantResponse(summary: string): string {
  const cleaned = stripTaskSummaryTags(summary);
  return cleaned || "Completed the requested changes.";
}

const truncate = (value: string, maxLength = 20_000): string => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n...[truncated]`;
};

function convexFrameworkToAgent(
  fw: "NEXTJS" | "ANGULAR" | "REACT" | "VUE" | "SVELTE"
): Framework {
  const map: Record<
    "NEXTJS" | "ANGULAR" | "REACT" | "VUE" | "SVELTE",
    Framework
  > = {
    NEXTJS: "nextjs",
    ANGULAR: "angular",
    REACT: "react",
    VUE: "vue",
    SVELTE: "svelte",
  };
  return map[fw] ?? "nextjs";
}

const getModelForAgent = (
  requestedModel: string | undefined,
  prompt: string
): string => {
  if (!requestedModel || requestedModel === "auto") {
    return selectModelForTask(prompt);
  }
  return resolveModel(requestedModel as ModelId, prompt);
};

interface AgentState {
  summary: string;
  files: { [path: string]: string };
}

interface ConversationContextMessage {
  role: "USER" | "ASSISTANT";
  type: string;
  status: string;
  content: string;
  createdAt?: number;
}

const MAX_CONTEXT_MESSAGES = 8;
const RECENT_MESSAGE_COUNT = 2;
const MAX_CONTEXT_MESSAGE_CHARS = 1_200;
const MAX_CONTEXT_SUMMARY_CHARS = 3_500;
const MAX_PLAN_CONTEXT_CHARS = 4_000;
const MAX_RESEARCH_CONTEXT_CHARS = 6_000;

function trimPromptBlock(value: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}\n...[truncated for context budget]`;
}

function toMessageRole(role: "USER" | "ASSISTANT"): "user" | "assistant" {
  return role === "ASSISTANT" ? "assistant" : "user";
}

function isConversationContextMessage(value: unknown): value is ConversationContextMessage {
  if (typeof value !== "object" || value === null) return false;
  return (
    "role" in value &&
    "type" in value &&
    "status" in value &&
    "content" in value &&
    (value.role === "USER" || value.role === "ASSISTANT") &&
    typeof value.type === "string" &&
    typeof value.status === "string" &&
    typeof value.content === "string" &&
    (!("createdAt" in value) || typeof value.createdAt === "number")
  );
}

function toConversationContextMessages(value: unknown): ConversationContextMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isConversationContextMessage);
}

function formatConversationContext(messages: ConversationContextMessage[]): {
  recentMessages: Message[];
  conversationSummary: string;
} {
  if (messages.length === 0) {
    return { recentMessages: [], conversationSummary: "No prior conversation." };
  }

  const normalized = messages.map((message) => ({
    ...message,
    content: trimPromptBlock(message.content, MAX_CONTEXT_MESSAGE_CHARS),
  }));

  const recentSource = normalized.slice(-RECENT_MESSAGE_COUNT);
  const olderSource = normalized.slice(0, -RECENT_MESSAGE_COUNT);

  const recentMessages: Message[] = recentSource.map((message) => ({
    type: "text",
    role: toMessageRole(message.role),
    content: message.content,
  }));

  if (olderSource.length === 0) {
    return {
      recentMessages,
      conversationSummary: "No earlier conversation beyond the most recent turns.",
    };
  }

  const summary = olderSource
    .map((message, index) => {
      const turnNumber = index + 1;
      return `${turnNumber}. ${message.role}: ${message.content}`;
    })
    .join("\n");

  return {
    recentMessages,
    conversationSummary: trimPromptBlock(summary, MAX_CONTEXT_SUMMARY_CHARS),
  };
}

function buildCodingSystemPrompt(input: {
  frameworkPrompt: string;
  conversationSummary: string;
  plan: string;
  research: string;
}): string {
  const sections = [input.frameworkPrompt.trim()];

  sections.push(`You are running inside an Inngest workflow with tool access to an E2B sandbox.
Always implement the user's current request using the available tools.
Treat the conversation summary, implementation plan, and research as reference context for the current turn.
After finishing, return a concise summary wrapped in <task_summary> tags.`);

  sections.push(`<conversation_summary>\n${input.conversationSummary || "No prior conversation."}\n</conversation_summary>`);

  if (input.plan.trim()) {
    sections.push(
      `<implementation_plan>\n${trimPromptBlock(input.plan, MAX_PLAN_CONTEXT_CHARS)}\n</implementation_plan>`
    );
  }

  if (input.research.trim()) {
    sections.push(
      `<research_findings>\n${trimPromptBlock(input.research, MAX_RESEARCH_CONTEXT_CHARS)}\n</research_findings>`
    );
  }

  sections.push(`⚠️ CRITICAL INSTRUCTION - DO NOT IGNORE:
You have access to the "/createOrUpdateFiles" tool. You MUST use this tool to write ALL code files.
- NEVER output code directly in your response text
- NEVER wrap code in markdown code blocks (\`\`\`)
- ALWAYS call the createOrUpdateFiles tool with the complete file contents
- If you output code as text instead of using the tool, the task will FAIL

Your response should ONLY contain:
1. Tool calls to createOrUpdateFiles (with all necessary files)
2. Any terminal commands if needed (npm install, npm run build)
3. The <task_summary> tag at the very end

DO NOT explain your code. DO NOT provide commentary. Just use the tools and output the summary.`);

  return sections.join("\n\n");
}

function toWorkspacePath(filePath: string): string {
  const trimmed = filePath.trim();
  if (trimmed.startsWith("/")) return trimmed;
  return `/home/user/${trimmed.replace(/^\.\//, "")}`;
}

// ─── Planning Agent ───────────────────────────────────────────────────────────
async function runPlanningAgent(userPrompt: string): Promise<string> {
  console.log("[PLANNING] Starting with kimi-k2.6...");
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
    logProviderDebug("planning-agent.generateText.failed", {
      provider: "openrouter",
      model: PLANNING_MODEL,
      promptLength: userPrompt.length,
      error: toErrorDetails(error),
    });
    console.error("[PLANNING] Error:", error);
    return "";
  }
}

// ─── Research Agent ───────────────────────────────────────────────────────────
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
        logProviderDebug("research-agent.generateText.no-exa.failed", {
          provider: "openrouter",
          model: RESEARCH_MODEL,
          hasExaApiKey: Boolean(exaApiKey),
          promptLength: researchPrompt.length,
          error: toErrorDetails(grokError),
        });
        console.error("[RESEARCH] Grok API failed, falling back to Kimi:", grokError);
        const { text } = await generateText({
          model: openrouter("moonshotai/kimi-k2.6"),
          system: RESEARCH_AGENT_PROMPT,
          prompt: researchPrompt,
          temperature: 0.2,
          maxOutputTokens: 2048,
        });
        console.log(`[RESEARCH] Done with fallback — ${text.length} chars`);
        return text;
      }
    }

    try {
      const searchQueriesPrompt = `${researchPrompt}\n\nGenerate 3-5 specific search queries to find relevant documentation and examples. Return them as a JSON array of strings.`;

      const { text: queriesText } = await generateText({
        model: openrouter(RESEARCH_MODEL),
        system: RESEARCH_AGENT_PROMPT,
        prompt: searchQueriesPrompt,
        temperature: 0.2,
        maxOutputTokens: 500,
      });

      let searchResults: string[] = [];
      try {
        const queries = queriesText
          .replace(/^[\s\S]*?\[/, "[")
          .replace(/\][\s\S]*$/, "]")
          .split("\n")
          .map((q) => q.replace(/^["']|["']$/g, "").trim())
          .filter((q) => q.length > 10);

        for (const query of queries.slice(0, 3)) {
          try {
            console.log(`[RESEARCH] Exa: "${query}"`);
            const exa = new Exa(exaApiKey);
            const results = await exa.searchAndContents(query, {
              type: "auto",
              numResults: 3,
              text: { maxCharacters: 800 },
            });
            const formatted = results.results.map(
              (r) =>
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

      const finalPrompt =
        searchResults.length > 0
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
      logProviderDebug("research-agent.generateText.with-tools.failed", {
        provider: "openrouter",
        model: RESEARCH_MODEL,
        hasExaApiKey: Boolean(exaApiKey),
        promptLength: researchPrompt.length,
        error: toErrorDetails(grokError),
      });
      console.error(
        "[RESEARCH] Grok API with tools failed, falling back to simple mode:",
        grokError
      );
      const { text } = await generateText({
        model: openrouter("moonshotai/kimi-k2.6"),
        system: RESEARCH_AGENT_PROMPT,
        prompt: researchPrompt,
        temperature: 0.2,
        maxOutputTokens: 2048,
      });
      console.log(`[RESEARCH] Done with fallback — ${text.length} chars`);
      return text;
    }
  } catch (error) {
    logProviderDebug("research-agent.all-methods.failed", {
      provider: "openrouter",
      model: RESEARCH_MODEL,
      hasExaApiKey: Boolean(exaApiKey),
      promptLength: researchPrompt.length,
      error: toErrorDetails(error),
    });
    console.error("[RESEARCH] All research methods failed:", error);
    return "";
  }
}

/**
 * E2B + agent network must not run inside Inngest `step.run`: `network.run()` calls
 * `step.run("generate-network-id")`, which triggers NESTING_STEPS when nested.
 */
async function runE2bCodingAgent(input: {
  framework: Framework;
  augmentedPrompt: string;
  complexity: "simple" | "medium" | "complex";
  state: State<AgentState>;
  selectedModel: string;
  codeSystem: string;
  sandbox?: Sandbox;
}): Promise<{
  summary: string;
  files: Record<string, string>;
  sandboxUrl: string;
  sandboxId: string;
  framework: Framework;
}> {
  const { framework, augmentedPrompt, complexity, state, selectedModel, codeSystem } =
    input;

  const sandbox = input.sandbox ?? (await createSandbox(framework));
  const sandboxId = sandbox.sandboxId;
  const writtenFiles: Record<string, string> = {};

  const terminalTool = createTool({
    name: "terminal",
    description: "Run shell commands inside the E2B sandbox.",
    parameters: z.object({
      command: z.string(),
    }),
    handler: async ({ command }) => {
      const connectedSandbox = await getSandbox(sandboxId);
      const buffers = {
        stdout: "",
        stderr: "",
      };

      const result = await connectedSandbox.commands.run(command, {
        timeoutMs: 60_000,
        onStdout: (chunk: string) => {
          buffers.stdout += chunk;
        },
        onStderr: (chunk: string) => {
          buffers.stderr += chunk;
        },
      });

      const combined = `${result.stdout || buffers.stdout}${buffers.stderr ? `\n${buffers.stderr}` : ""}`;
      return truncate(combined);
    },
  });

  const createOrUpdateFilesTool = createTool({
    name: "createOrUpdateFiles",
    description:
      "REQUIRED: Create or update files in the E2B sandbox. This is the ONLY way to write code.",
    parameters: z.object({
      files: z.array(
        z.object({
          path: z.string(),
          content: z.string(),
        })
      ),
    }),
    handler: async (
      { files },
      { network }: Tool.Options<AgentState>
    ) => {
      const connectedSandbox = await getSandbox(sandboxId);
      const filesToWrite: Record<string, string> = {};

      for (const file of files) {
        if (!isValidFilePath(file.path)) {
          throw new Error(`Invalid file path: ${file.path}`);
        }
        filesToWrite[file.path] = file.content;
        writtenFiles[file.path] = file.content;
      }

      const updated = { ...(network.state.data.files || {}) };
      for (const file of files) {
        updated[file.path] = file.content;
      }
      network.state.data.files = updated;

      await writeFilesBatch(connectedSandbox, filesToWrite);
      return `Updated ${files.length} file(s).`;
    },
  });

  const readFilesTool = createTool({
    name: "readFiles",
    description: "Read one or more files from the E2B sandbox.",
    parameters: z.object({
      files: z.array(z.string()),
    }),
    handler: async ({ files }) => {
      const connectedSandbox = await getSandbox(sandboxId);
      const results: Array<{ path: string; content: string | null }> = [];

      for (const filePath of files) {
        if (!isValidFilePath(filePath)) {
          results.push({ path: filePath, content: null });
          continue;
        }
        const fullPath = toWorkspacePath(filePath);
        const content = await readFileWithTimeout(connectedSandbox, fullPath);
        results.push({ path: filePath, content });
      }

      return JSON.stringify(results);
    },
  });

  const codeAgent = createAgent<AgentState>({
    name: "code-agent",
    description: "An expert coding agent",
    system: codeSystem,
    model: openrouterAgentModel(
      selectedModel,
      { temperature: 0.1 }
    ),
    tools: [terminalTool, createOrUpdateFilesTool, readFilesTool],
    lifecycle: {
      onResponse: async ({ result, network }) => {
        const lastAssistantMessageText =
          lastAssistantTextMessageContent(result);
        const fileCount = Object.keys(network?.state?.data?.files || {}).length;
        console.log(
          `[CODING] Agent response received, messages: ${result.output.length}, text length: ${lastAssistantMessageText?.length || 0}, files: ${fileCount}`
        );

        if (lastAssistantMessageText && network) {
          if (lastAssistantMessageText.includes("<task_summary>")) {
            network.state.data.summary = lastAssistantMessageText;
            console.log("[CODING] Task summary captured");
          }

          // Parse XML tool calls for models that don't use native function calling
          if (lastAssistantMessageText.includes("<tool_call>")) {
            const xmlToolCalls = parseXmlToolCalls(lastAssistantMessageText);
            if (xmlToolCalls.length > 0) {
              console.log(`[CODING] Found ${xmlToolCalls.length} XML tool call(s) in response`);
              await executeToolCalls(xmlToolCalls, network);
            }
          }
        }
        return result;
      },
    },
  });

  const maxIter = getMaxAgentIterations(complexity);
  console.log(`[AGENT] maxIter=${maxIter} for ${complexity} task`);

  const network = createNetwork<AgentState>({
    name: "coding-agent-network",
    agents: [codeAgent],
    maxIter,
    defaultState: state,
    router: async ({ network: net }) => {
      if (Boolean(net.state.data.summary)) return;
      return codeAgent;
    },
  });

  const result = await network.run(augmentedPrompt, { state });
  console.log(`[CODING] Network run completed`);

  // Fallback: if no files were written via native tool calls, check if XML tool calls
  // captured files in state and write them to the sandbox
  if (Object.keys(writtenFiles).length === 0 && result.state.data.files) {
    const xmlFiles = result.state.data.files as Record<string, string>;
    const xmlFileCount = Object.keys(xmlFiles).length;
    if (xmlFileCount > 0) {
      console.log(`[CODING] Writing ${xmlFileCount} file(s) from XML tool calls to sandbox`);
      const connectedSandbox = await getSandbox(sandboxId);
      const filesToWrite: Record<string, string> = {};
      for (const [path, content] of Object.entries(xmlFiles)) {
        if (isValidFilePath(path)) {
          filesToWrite[path] = content;
          writtenFiles[path] = content;
        }
      }
      await writeFilesBatch(connectedSandbox, filesToWrite);
      console.log(`[CODING] Wrote ${Object.keys(filesToWrite).length} file(s) to sandbox`);
    }
  }

  const fileCount = Object.keys(result.state.data.files || {}).length;
  const hasSummary = Boolean(result.state.data.summary);

  const results = result.state.results;
  const lastResult = results.length > 0 ? results[results.length - 1] : null;
  const output = lastResult?.output || [];
  console.log(
    `[CODING] Agent finished — hasSummary=${hasSummary}, fileCount=${fileCount}, iterations used: ${results.length}`
  );

  // Report to Sentry if no files were generated
  if (fileCount === 0) {
    Sentry.captureMessage("Code agent completed with no files generated", {
      level: "warning",
      tags: {
        component: "code-agent",
        framework,
        complexity,
      },
      extra: {
        sandboxId,
        iterations: results.length,
        hasSummary,
        lastOutputLength: output.length,
      },
    });
  }

  if (!result.state.data.summary && fileCount > 0) {
    result.state.data.summary = `<task_summary>Generated ${fileCount} file(s): ${Object.keys(result.state.data.files).join(", ")}</task_summary>`;
    console.log("[CODING] Created fallback summary for files");
  }

  if (!result.state.data.summary && output.length > 0) {
    const lastMsg = output[output.length - 1];
    if (lastMsg?.type === "text") {
      const tm = lastMsg as { type: "text"; content?: unknown };
      const content =
        typeof tm.content === "string"
          ? tm.content
          : JSON.stringify(tm.content ?? "");
      const summaryMatch = content?.match(/<task_summary>[\s\S]*?<\/task_summary>/);
      if (summaryMatch) {
        result.state.data.summary = summaryMatch[0];
        console.log("[CODING] Extracted summary from last message");
      }
    }
  }

  if (!result.state.data.summary) {
    console.warn("[CODING] No <task_summary> found in any response, creating summary");

    const fileList = Object.keys(writtenFiles);
    const fileSummary =
      fileList.length > 0
        ? `Created ${fileList.length} file(s): ${fileList.join(", ")}`
        : "No files were generated";

    result.state.data.summary = `<task_summary>\nAll done! 🎉\n\nI've built your site — take a look at the preview to see it in action.\n\n${fileSummary}\n</task_summary>`;
    console.log("[CODING] Created summary as final fallback");
  }

  const filesOut =
    Object.keys(writtenFiles).length > 0
      ? writtenFiles
      : (result.state.data.files || {});

  const sandboxUrl = await getSandboxUrl(sandbox, framework);

  return {
    summary: result.state.data.summary,
    files: filesOut,
    sandboxUrl,
    sandboxId,
    framework,
  };
}

type CodingAgentRunResult = Awaited<ReturnType<typeof runE2bCodingAgent>> & {
  managerModel: string;
  attemptedModels: string[];
  attemptCount: number;
};

async function runE2bCodingAgentWithFallbacks(input: {
  framework: Framework;
  augmentedPrompt: string;
  complexity: "simple" | "medium" | "complex";
  previousMessages: Message[];
  requestedModel: string;
  retryModels: string[];
  codeSystem: string;
  sandbox?: Sandbox;
}): Promise<CodingAgentRunResult> {
  let lastError: unknown;

  // Create ONE sandbox and reuse it across all retry attempts
  console.log(`[DEBUG] Preparing sandbox for coding agent (will reuse across ${input.retryModels.length} retry models)...`);
  const sandbox = input.sandbox ?? (await createSandbox(input.framework));
  console.log(`[DEBUG] Created sandbox ${sandbox.sandboxId} for reuse across retries`);

  for (const [index, attemptModel] of input.retryModels.entries()) {
    try {
      if (index > 0) {
        console.warn("[PROVIDER_DEBUG] Retrying coding agent with fallback model", {
          requestedModel: input.requestedModel,
          attemptModel,
          attempt: index + 1,
          totalAttempts: input.retryModels.length,
          sandboxId: sandbox.sandboxId,
        });
      }

      const result = await runE2bCodingAgent({
        framework: input.framework,
        augmentedPrompt: input.augmentedPrompt,
        complexity: input.complexity,
        state: createState<AgentState>(
          { summary: "", files: {} },
          { messages: input.previousMessages }
        ),
        selectedModel: attemptModel,
        codeSystem: input.codeSystem,
        sandbox,
      });
      return {
        ...result,
        managerModel: attemptModel,
        attemptedModels: input.retryModels,
        attemptCount: index + 1,
      };
    } catch (error) {
      lastError = error;

      logProviderDebug("coding-agent.network.run.attempt.failed", {
        provider: "openrouter",
        requestedModel: input.requestedModel,
        attemptModel,
        attempt: index + 1,
        totalAttempts: input.retryModels.length,
        providerReturnedError: isProviderReturnedError(error),
        sandboxId: sandbox.sandboxId,
        error: toErrorDetails(error),
      });

      if (!isProviderReturnedError(error) || index === input.retryModels.length - 1) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Coding agent failed without returning an error");
}

async function persistAgentFailure(input: {
  userId: string;
  projectId: Id<"projects">;
  framework: Framework;
  requestedModel: string;
  toolCallingModel: string;
  retryModels: string[];
  complexity: "simple" | "medium" | "complex";
  error: unknown;
}) {
  const convex = getConvexClient();

  const userMessage = "Sorry, I encountered an error while generating code. Please try again.";

  try {
    await convex.mutation(api.messages.createForUser, {
      userId: input.userId,
      projectId: input.projectId,
      content: userMessage,
      role: "ASSISTANT",
      type: "ERROR",
      status: "COMPLETE",
    });
  } catch (saveError) {
    console.error("[PROVIDER_DEBUG] Failed to persist agent failure message", {
      userId: input.userId,
      projectId: input.projectId,
      saveError: toErrorDetails(saveError),
    });
  }
}

// ─── Main Inngest Function ────────────────────────────────────────────────────
export const codeAgentFunction = inngest.createFunction(
  {
    id: "code-agent",
    retries: 0,
    concurrency: {
      limit: 3,
      key: "event.data.userId",
    },
    triggers: [{ event: "agent/code-agent-kit.run" }],
  },
  async ({ event, step }) => {
    const userPrompt = event.data.value as string;
    const complexity = estimateComplexity(userPrompt);
    console.log(`[AGENT] Task complexity: ${complexity}`);

    const shouldPlan = shouldRunPlanning(userPrompt, complexity);

    const [plan, previousMessages, project] = await Promise.all([
      !shouldPlan
        ? Promise.resolve("")
        : step.run("planning-agent", () => runPlanningAgent(userPrompt)),
      step.run("get-conversation-context", async () => {
        try {
          const convex = getConvexClient();
          const messages = await convex.query(api.messages.listContextForUser, {
            userId: event.data.userId as string,
            projectId: event.data.projectId as Id<"projects">,
            limit: MAX_CONTEXT_MESSAGES,
          });
          return messages;
        } catch (error) {
          console.error("[get-conversation-context] Failed to fetch messages:", error);
          return [];
        }
      }),
      step.run("load-project", async () => {
        const convex = getConvexClient();
        return convex.query(api.projects.getForUser, {
          userId: event.data.userId as string,
          projectId: event.data.projectId as Id<"projects">,
        });
      }),
    ]);

    const { recentMessages, conversationSummary } = formatConversationContext(
      toConversationContextMessages(previousMessages)
    );

    const framework = convexFrameworkToAgent(project.framework);
    const sandboxPromise = createSandbox(framework);
    const researchPromise =
      complexity === "complex" && plan
        ? step.run("research-agent", () => runResearchAgent(userPrompt, plan))
        : Promise.resolve("");

    const [research, sandbox] = await Promise.all([researchPromise, sandboxPromise]);

    const selectedModel = getModelForAgent(
      event.data.model as string | undefined,
      userPrompt
    );
    const codingPlan = resolveCodingModelPlan(selectedModel);
    const codingModel = codingPlan.managerModel;
    console.log(`[CODING] Starting with ${codingModel} (${framework})...`);
    console.log("[PROVIDER_DEBUG] Inngest model/provider config", {
      selectedModel,
      toolCallingModel: codingPlan.toolCallingModel,
      codingModel,
      retryModels: codingPlan.retryModels,
      usesDedicatedManager: codingPlan.usesDedicatedManager,
      framework,
      openRouterBaseUrl: OPENROUTER_BASE_URL,
      hasOpenRouterApiKey: Boolean(process.env.OPENROUTER_API_KEY),
      hasExaApiKey: Boolean(process.env.EXA_API_KEY),
      userPromptLength: userPrompt.length,
      planLength: plan.length,
      researchLength: research.length,
      previousMessagesCount: recentMessages.length,
      conversationSummaryLength: conversationSummary.length,
    });
    if (codingPlan.toolCallingModel !== selectedModel) {
      console.warn("[PROVIDER_DEBUG] Normalized tool-calling model selection", {
        selectedModel,
        toolCallingModel: codingPlan.toolCallingModel,
      });
    }
    if (codingPlan.usesDedicatedManager) {
      console.warn("[PROVIDER_DEBUG] Using dedicated manager model for AgentKit", {
        selectedModel,
        toolCallingModel: codingPlan.toolCallingModel,
        managerModel: codingPlan.managerModel,
      });
    }

    const codeSystem = buildCodingSystemPrompt({
      frameworkPrompt: FRAMEWORK_PROMPTS[framework],
      conversationSummary,
      plan,
      research,
    });

    let e2bResult: CodingAgentRunResult;
    try {
      e2bResult = await runE2bCodingAgentWithFallbacks({
        framework,
        augmentedPrompt: userPrompt,
        complexity,
        previousMessages: recentMessages,
        requestedModel: selectedModel,
        retryModels: codingPlan.retryModels,
        codeSystem,
        sandbox,
      });
    } catch (error) {
      logProviderDebug("coding-agent.network.run.failed", {
        provider: "openrouter",
        model: selectedModel,
        toolCallingModel: codingPlan.toolCallingModel,
        codingModel,
        retryModels: codingPlan.retryModels,
        providerReturnedError: isProviderReturnedError(error),
        framework,
        complexity,
        augmentedPromptLength: userPrompt.length,
        codeSystemLength: codeSystem.length,
        previousMessagesCount: recentMessages.length,
        error: toErrorDetails(error),
      });

      Sentry.captureException(error, {
        tags: {
          component: "code-agent",
          framework,
          complexity,
          model: selectedModel,
          toolCallingModel: codingPlan.toolCallingModel,
        },
        extra: {
          userId: event.data.userId,
          projectId: event.data.projectId,
          retryModels: codingPlan.retryModels,
          providerReturnedError: isProviderReturnedError(error),
        },
      });

      await persistAgentFailure({
        userId: event.data.userId as string,
        projectId: event.data.projectId as Id<"projects">,
        framework,
        requestedModel: selectedModel,
        toolCallingModel: codingPlan.toolCallingModel,
        retryModels: codingPlan.retryModels,
        complexity,
        error,
      });

      const fallbackSummary =
        "Sorry, I encountered an error while generating code. Please try again.";
      return {
        url: "",
        title: "Generation failed",
        files: {},
        summary: fallbackSummary,
      };
    }

    const fragmentTitle = buildFragmentTitle(userPrompt, e2bResult.summary);
    const responseContent = buildAssistantResponse(e2bResult.summary);

    await step.run("save-result", async () => {
      const convex = getConvexClient();
      const userId = event.data.userId as string;
      const projectId = event.data.projectId as Id<"projects">;

      const messageId = await convex.mutation(api.messages.createForUser, {
        userId,
        projectId,
        content: responseContent,
        role: "ASSISTANT",
        type: "RESULT",
      });

      await convex.mutation(api.messages.createFragmentForUser, {
        userId,
        messageId: messageId as Id<"messages">,
        sandboxId: e2bResult.sandboxId,
        sandboxUrl: e2bResult.sandboxUrl,
        title: fragmentTitle,
        files: e2bResult.files,
        metadata: {
          source: "inngest-agent-kit",
          model: selectedModel,
          toolCallingModel: codingPlan.toolCallingModel,
          managerModel: e2bResult.managerModel,
          retryModels: e2bResult.attemptedModels,
          attemptCount: e2bResult.attemptCount,
          complexity,
        },
        framework: frameworkToConvexEnum(e2bResult.framework),
      });

      return messageId;
    });

    return {
      url: e2bResult.sandboxUrl,
      title: fragmentTitle,
      files: e2bResult.files,
      summary: e2bResult.summary,
    };
  }
);
