import { task } from "@trigger.dev/sdk/v3";
import { generateText, stepCountIs } from "ai";
import { getModel } from "@/agents/client";
import { frameworkToConvexEnum, type Framework } from "@/agents/types";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  FRAMEWORK_PROMPTS,
  getConvexClient,
  toText,
  truncate,
  extractSummaryText,
  buildInMemoryTools,
} from "./utils";

export const runFixErrorsTask = task({
  id: "run-fix-errors",
  maxDuration: 300,
  run: async (payload: { fragmentId: string }) => {
    const fragmentId = payload.fragmentId as Id<"fragments">;
    const convex = getConvexClient();

    const fragment = await convex.query(api.messages.getFragmentById, { fragmentId });
    if (!fragment) throw new Error("Fragment not found");

    const message = await convex.query(api.messages.get, {
      messageId: fragment.messageId as Id<"messages">,
    });
    if (!message) throw new Error("Message not found");

    const project = await convex.query(api.projects.getForSystem, {
      projectId: message.projectId as Id<"projects">,
    });
    if (!project) throw new Error("Project not found");

    const fragmentFramework = (fragment.framework?.toLowerCase() || "nextjs") as Framework;
    const fragmentMetadata =
      typeof fragment.metadata === "object" && fragment.metadata !== null
        ? (fragment.metadata as Record<string, unknown>)
        : {};

    const fragmentModel = (fragmentMetadata.model as string) || "anthropic/claude-haiku-4.5";

    const currentFiles: Record<string, string> =
      typeof fragment.files === "object" && fragment.files !== null
        ? Object.fromEntries(
            Object.entries(fragment.files as Record<string, unknown>)
              .filter(([, v]) => typeof v === "string")
              .map(([k, v]) => [k, v as string])
          )
        : {};

    const fixedFiles = { ...currentFiles };
    const tools = buildInMemoryTools(fixedFiles);

    const filesSummary = Object.entries(currentFiles)
      .slice(0, 8)
      .map(([path, content]) => `### ${path}\n\`\`\`\n${content.slice(0, 500)}\n\`\`\``)
      .join("\n\n");

    const fixPrompt = `Review the following code files and fix any TypeScript errors, import issues, missing dependencies, or obvious bugs. Apply all fixes using the createOrUpdateFiles tool. When done, provide a <task_summary> of what was fixed.

Current files:
${filesSummary}`;

    const result = await generateText({
      model: getModel(fragmentModel),
      system: FRAMEWORK_PROMPTS[fragmentFramework],
      prompt: fixPrompt,
      tools,
      stopWhen: stepCountIs(8),
      temperature: 0.2,
    });

    const resultText = truncate(toText(result.text));
    const summaryText = extractSummaryText(resultText) || "Applied code fixes.";

    await convex.mutation(api.messages.createFragmentForUser, {
      userId: project.userId,
      messageId: fragment.messageId,
      sandboxUrl: fragment.sandboxUrl,
      title: fragment.title,
      files: fixedFiles,
      framework: frameworkToConvexEnum(fragmentFramework),
      metadata: {
        ...fragmentMetadata,
        previousFiles: fragment.files,
        fixedAt: new Date().toISOString(),
      },
    });

    return { ok: true, summary: summaryText };
  },
});
