import { z } from "zod";
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
  FRAGMENT_TITLE_PROMPT,
  NEXTJS_PROMPT,
  REACT_PROMPT,
  RESPONSE_PROMPT,
  SVELTE_PROMPT,
  VUE_PROMPT,
} from "@/prompt";
import {
  selectModelForTask,
  resolveModel,
  frameworkToConvexEnum,
  type Framework,
  type ModelId,
} from "@/agents/types";
import {
  createSandbox,
  getSandbox,
  getSandboxUrl,
  isValidFilePath,
  readFileWithTimeout,
  writeFilesBatch,
} from "@/agents/sandbox-utils";
import {
  runPreflight,
  runPostReview,
  appendReviewNotes,
  type AgentPlan,
} from "@/agents/zapdev";

import { inngest } from "./client";
import {
  lastAssistantTextMessageContent,
  parseAgentOutput,
} from "./utils";

const FRAMEWORK_PROMPTS: Record<Framework, string> = {
  nextjs: NEXTJS_PROMPT,
  angular: ANGULAR_PROMPT,
  react: REACT_PROMPT,
  vue: VUE_PROMPT,
  svelte: SVELTE_PROMPT,
};

function planComplexityToAgent(
  complexity: AgentPlan["complexity"]
): "simple" | "medium" | "complex" {
  if (complexity === "simple") return "simple";
  if (complexity === "complex") return "complex";
  return "medium";
}

function getConvexClient(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
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

function toWorkspacePath(filePath: string): string {
  const trimmed = filePath.trim();
  if (trimmed.startsWith("/")) return trimmed;
  return `/home/user/${trimmed.replace(/^\.\//, "")}`;
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
}): Promise<{
  summary: string;
  files: Record<string, string>;
  sandboxUrl: string;
  sandboxId: string;
  framework: Framework;
}> {
  const { framework, augmentedPrompt, complexity, state, selectedModel, codeSystem } =
    input;

  const sandbox = await createSandbox(framework);
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
    tool_choice: "required",
    model: openai({
      model: selectedModel,
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultParameters: { temperature: 0.1 },
    }),
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
    router: async ({ network: net }) => {
      if (Boolean(net.state.data.summary)) return;
      return codeAgent;
    },
  });

  const result = await network.run(augmentedPrompt, { state });
  console.log(`[CODING] Network run completed`);

  const fileCount = Object.keys(result.state.data.files || {}).length;
  const hasSummary = Boolean(result.state.data.summary);

  const results = result.state.results;
  const lastResult = results.length > 0 ? results[results.length - 1] : null;
  const output = lastResult?.output || [];
  console.log(
    `[CODING] Agent finished — hasSummary=${hasSummary}, fileCount=${fileCount}, iterations used: ${results.length}`
  );

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
    console.warn("[CODING] No <task_summary> found in any response, using mock summary");

    const fileList = Object.keys(writtenFiles);
    const fileSummary =
      fileList.length > 0
        ? `Created ${fileList.length} file(s): ${fileList.join(", ")}`
        : "No files were generated";

    result.state.data.summary = `<task_summary>\nMock Summary\n\nThe AI agent completed ${results.length} iteration(s) but did not provide a formal summary.\n\n${fileSummary}\n\nThe task may have completed successfully. Please review the output.\n</task_summary>`;
    console.log("[CODING] Created mock summary as final fallback");
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

// ─── Main Inngest Function ────────────────────────────────────────────────────
export const codeAgentFunction = inngest.createFunction(
  {
    id: "code-agent",
    concurrency: {
      limit: 3,
      key: "event.data.userId",
    },
    triggers: { event: "agent/code-agent-kit.run" },
  },
  async ({ event, step }) => {
    const userPrompt = event.data.value as string;

    const [previousMessages, project] = await Promise.all([
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
      step.run("load-project", async () => {
        const convex = getConvexClient();
        return convex.query(api.projects.getForUser, {
          userId: event.data.userId as string,
          projectId: event.data.projectId as Id<"projects">,
        });
      }),
    ]);

    const framework = convexFrameworkToAgent(project.framework);

    const baseSystemPrompt = `${FRAMEWORK_PROMPTS[framework]}

You are running inside an Inngest workflow with tool access to an E2B sandbox.
Always implement the user's request using the available tools.
After finishing, return a concise summary wrapped in <task_summary> tags.`;

    const contextSummary =
      previousMessages
        .slice(-3)
        .filter((m): m is Extract<typeof m, { type: "text" }> => m.type === "text")
        .map((m) => {
          const text =
            typeof m.content === "string"
              ? m.content
              : JSON.stringify(m.content ?? "");
          return `${m.role}: ${text.slice(0, 200)}`;
        })
        .join("\n") || "No prior conversation.";

    const preflight = await step.run("zapdev-preflight", async () => {
      const convex = getConvexClient();
      const latestFilesDoc = await convex.query(
        api.webcontainerFiles.getLatestFilesForUser,
        {
          userId: event.data.userId as string,
          projectId: event.data.projectId as Id<"projects">,
        }
      );
      const projectFiles = latestFilesDoc?.files ?? {};
      return runPreflight({
        userMessage: userPrompt,
        userId: event.data.userId as string,
        projectId: event.data.projectId as string,
        baseSystemPrompt,
        contextSummary,
        projectFiles,
      });
    });

    const { plan, workingMessage, enrichedSystemPrompt } = preflight;
    const complexity = planComplexityToAgent(plan.complexity);
    console.log(
      `[AGENT] plan.complexity=${plan.complexity} → agent=${complexity}, needsResearch=${plan.needsResearch}`
    );

    const state = createState<AgentState>(
      { summary: "", files: {} },
      { messages: previousMessages }
    );

    const forceToolUsage = `

⚠️ CRITICAL INSTRUCTION - DO NOT IGNORE:
You have access to the "/createOrUpdateFiles" tool. You MUST use this tool to write ALL code files.
- NEVER output code directly in your response text
- NEVER wrap code in markdown code blocks (\`\`\`)
- ALWAYS call the createOrUpdateFiles tool with the complete file contents
- If you output code as text instead of using the tool, the task will FAIL

Your response should ONLY contain:
1. Tool calls to createOrUpdateFiles (with all necessary files)
2. Any terminal commands if needed (npm install, npm run build)
3. The <task_summary> tag at the very end

DO NOT explain your code. DO NOT provide commentary. Just use the tools and output the summary.
`;

    const augmentedPrompt = `${workingMessage}${forceToolUsage}`;

    const selectedModel = getModelForAgent(
      event.data.model as string | undefined,
      userPrompt
    );
    console.log(`[CODING] Starting with ${selectedModel} (${framework})...`);

    const e2bResult = await runE2bCodingAgent({
      framework,
      augmentedPrompt,
      complexity,
      state,
      selectedModel,
      codeSystem: enrichedSystemPrompt,
    });

    let review = null;
    if (plan.complexity !== "simple") {
      review = await step.run("zapdev-review", () =>
        runPostReview({
          plan,
          userMessage: workingMessage,
          implementationSummary: e2bResult.summary,
          files: e2bResult.files,
        })
      );
    }

    e2bResult.summary = appendReviewNotes(e2bResult.summary, review);

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
        fragmentTitleGenerator.run(e2bResult.summary),
        responseGenerator.run(e2bResult.summary),
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
        sandboxId: e2bResult.sandboxId,
        sandboxUrl: e2bResult.sandboxUrl,
        title: parseAgentOutput(fragmentTitleOutput),
        files: e2bResult.files,
        metadata: {
          source: "inngest-agent-kit",
          model: selectedModel,
        },
        framework: frameworkToConvexEnum(e2bResult.framework),
      });

      return messageId;
    });

    return {
      url: e2bResult.sandboxUrl,
      title: "Fragment",
      files: e2bResult.files,
      summary: e2bResult.summary,
    };
  }
);
