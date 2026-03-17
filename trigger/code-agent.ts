import { task } from "@trigger.dev/sdk/v3";
import { generateText, stepCountIs } from "ai";
import { getModel } from "@/agents/client";
import { frameworkToConvexEnum, type Framework } from "@/agents/types";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { sanitizeTextForDatabase } from "@/lib/utils";
import { filterAIGeneratedFiles } from "@/lib/filter-ai-files";
import {
  FRAMEWORK_PROMPTS,
  WEB_CONTAINER_PREVIEW_URL,
  getConvexClient,
  getModelForTask,
  toText,
  truncate,
  extractSummaryText,
  buildInMemoryTools,
} from "./utils";

export const runCodeAgentTask = task({
  id: "run-code-agent",
  maxDuration: 300,
  run: async (payload: {
    projectId: string;
    value: string;
    model?: string;
    framework?: Framework;
  }) => {
    const framework: Framework = payload.framework ?? "nextjs";
    const userPrompt = payload.value;
    const selectedModel = getModelForTask(payload.model, userPrompt, framework);
    const writtenFiles: Record<string, string> = {};

    const tools = buildInMemoryTools(writtenFiles);

    const result = await generateText({
      model: getModel(selectedModel),
      system: `${FRAMEWORK_PROMPTS[framework]}

You are running inside a background task. Files are stored in-memory and previewed via WebContainer in the browser.
Always implement the user's request using the available tools.
After finishing, return a concise summary wrapped in <task_summary> tags.`,
      prompt: userPrompt,
      tools,
      stopWhen: stepCountIs(8),
      temperature: 0.2,
    });

    const resultText = truncate(toText(result.text));
    const convex = getConvexClient();
    const projectId = payload.projectId as Id<"projects">;
    const project = await convex.query(api.projects.getForSystem, { projectId });

    const summaryText =
      extractSummaryText(resultText) ||
      `Generated ${Object.keys(writtenFiles).length} file(s).`;

    const filteredFiles = filterAIGeneratedFiles(writtenFiles);

    const messageId = await convex.mutation(api.messages.createForUser, {
      userId: project.userId,
      projectId,
      content: sanitizeTextForDatabase(summaryText) || "Generated code is ready.",
      role: "ASSISTANT",
      type: "RESULT",
      status: "COMPLETE",
    });

    await convex.mutation(api.messages.createFragmentForUser, {
      userId: project.userId,
      messageId: messageId as Id<"messages">,
      sandboxUrl: WEB_CONTAINER_PREVIEW_URL,
      title: sanitizeTextForDatabase(summaryText.slice(0, 80)) || "In-Memory Result",
      files: filteredFiles,
      metadata: { source: "trigger-dev", model: selectedModel },
      framework: frameworkToConvexEnum(framework),
    });

    return {
      ok: true,
      filesUpdated: Object.keys(filteredFiles).length,
    };
  },
});
