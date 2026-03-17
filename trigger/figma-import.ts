import { task } from "@trigger.dev/sdk/v3";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { getModel } from "@/agents/client";
import { frameworkToConvexEnum } from "@/agents/types";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { sanitizeTextForDatabase } from "@/lib/utils";
import { filterAIGeneratedFiles } from "@/lib/filter-ai-files";
import { parseFigmaFigFile, extractDesignSystem, generateFigmaCodePrompt } from "@/lib/figma-processor";
import { NEXTJS_PROMPT } from "@/prompt";
import {
  WEB_CONTAINER_PREVIEW_URL,
  getConvexClient,
  toText,
  truncate,
  extractSummaryText,
} from "./utils";

export const runFigmaImportTask = task({
  id: "run-figma-import",
  maxDuration: 300,
  run: async (payload: {
    projectId: string;
    importId: string;
    fileKey?: string;
    accessToken?: string;
    figmaUrl?: string;
    fileBase64?: string;
    fileName?: string;
  }) => {
    const { projectId, importId, fileBase64, fileName } = payload;
    const convex = getConvexClient();

    if (!fileBase64) {
      throw new Error("No .fig file provided");
    }

    let designPrompt = "";
    try {
      const fileBuffer = Buffer.from(fileBase64, "base64");
      const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
      const figmaFileData = await parseFigmaFigFile(arrayBuffer);
      const designSystem = extractDesignSystem(figmaFileData);
      designPrompt = generateFigmaCodePrompt(figmaFileData, designSystem);
    } catch (parseError) {
      console.error("Error parsing .fig file:", parseError);
      designPrompt = `Import and recreate the Figma design from the uploaded file: ${fileName ?? "figma-upload"}.
The file could not be fully parsed, but please create a complete Next.js implementation based on typical design patterns with:
1. Accurate layout and spacing
2. Proper color scheme and typography
3. Responsive design for mobile and desktop
4. Interactive elements with hover/focus states
5. Use Shadcn UI components from @/components/ui/
6. Follow Next.js best practices
After finishing, return a concise summary wrapped in <task_summary> tags.`;
    }

    const writtenFiles: Record<string, string> = {};

    const createOrUpdateFiles = tool({
      description: "Create or update files in the in-memory workspace.",
      inputSchema: z.object({
        files: z.array(z.object({ path: z.string(), content: z.string() })),
      }),
      execute: async ({ files }: { files: { path: string; content: string }[] }) => {
        for (const file of files) writtenFiles[file.path] = file.content;
        return `Updated ${files.length} file(s).`;
      },
    });

    const readFiles = tool({
      description: "Read files from the in-memory workspace.",
      inputSchema: z.object({ files: z.array(z.string()) }),
      execute: async ({ files }: { files: string[] }) =>
        JSON.stringify(files.map((p: string) => ({ path: p, content: writtenFiles[p] ?? null }))),
    });

    const prompt = designPrompt || `Import and recreate the Figma design from the uploaded file: ${fileName ?? "figma-upload"}.

Create a complete Next.js implementation with:
1. Accurate layout and spacing
2. Proper color scheme and typography
3. Responsive design for mobile and desktop
4. Interactive elements with hover/focus states
5. Use Shadcn UI components from @/components/ui/
6. Follow Next.js best practices

After finishing, return a concise summary wrapped in <task_summary> tags.`;

    const result = await generateText({
      model: getModel("anthropic/claude-haiku-4.5"),
      system: `${NEXTJS_PROMPT}

You are implementing a design imported from Figma. Create a faithful implementation using Next.js and Shadcn UI components.

${designPrompt}`,
      prompt,
      tools: { createOrUpdateFiles, readFiles },
      stopWhen: stepCountIs(8),
      temperature: 0.2,
    });

    const resultText = truncate(toText(result.text));
    const summaryText = extractSummaryText(resultText) || `Figma import: generated ${Object.keys(writtenFiles).length} file(s).`;
    const filteredFiles = filterAIGeneratedFiles(writtenFiles);

    const project = await convex.query(api.projects.getForSystem, {
      projectId: projectId as Id<"projects">,
    });

    const messageId = await convex.mutation(api.messages.createForUser, {
      userId: project.userId,
      projectId: projectId as Id<"projects">,
      content: sanitizeTextForDatabase(summaryText) || "Figma import complete.",
      role: "ASSISTANT",
      type: "RESULT",
      status: "COMPLETE",
    });

    await convex.mutation(api.messages.createFragmentForUser, {
      userId: project.userId,
      messageId: messageId as Id<"messages">,
      sandboxUrl: WEB_CONTAINER_PREVIEW_URL,
      title: sanitizeTextForDatabase(summaryText.slice(0, 80)) || "Figma Import Result",
      files: filteredFiles,
      metadata: { source: "figma-import", importId, model: "anthropic/claude-haiku-4.5" },
      framework: frameworkToConvexEnum("nextjs"),
    });

    return { ok: true, filesUpdated: Object.keys(filteredFiles).length };
  },
});
