import { ConvexHttpClient } from "convex/browser";
import { tool } from "ai";
import { z } from "zod";
import { selectModelForTask, type Framework } from "@/agents/types";
import { ANGULAR_PROMPT, NEXTJS_PROMPT, REACT_PROMPT, SVELTE_PROMPT, VUE_PROMPT } from "@/prompt";

export const FRAMEWORK_PROMPTS: Record<Framework, string> = {
  nextjs: NEXTJS_PROMPT,
  angular: ANGULAR_PROMPT,
  react: REACT_PROMPT,
  vue: VUE_PROMPT,
  svelte: SVELTE_PROMPT,
};

export const WEB_CONTAINER_PREVIEW_URL = "webcontainer://local";

let convexClient: ConvexHttpClient | null = null;

export const getConvexClient = (): ConvexHttpClient => {
  if (convexClient) return convexClient;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL environment variable is not set");
  convexClient = new ConvexHttpClient(convexUrl);
  return convexClient;
};

export const toText = (value: unknown): string => {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
};

export const truncate = (value: string, maxLength: number = 20_000): string => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n...[truncated]`;
};

const SUMMARY_TAG_REGEX = /<task_summary>([\s\S]*?)<\/task_summary>/i;

export const extractSummaryText = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed.length) return "";
  const match = SUMMARY_TAG_REGEX.exec(trimmed);
  if (match && typeof match[1] === "string") return match[1].trim();
  return "";
};

export const getModelForTask = (
  requestedModel: string | undefined,
  prompt: string,
  framework: Framework
): string => {
  if (requestedModel && requestedModel !== "auto") return requestedModel;
  return selectModelForTask(prompt, framework);
};

export function buildInMemoryTools(files: Record<string, string>) {
  const terminal = tool({
    description:
      "Terminal commands are not available in this in-memory environment. Use createOrUpdateFiles to write or modify files.",
    inputSchema: z.object({ command: z.string() }),
    execute: async (_input: { command: string }) =>
      "Terminal is not available. Files are written in-memory and previewed via WebContainer. Use the createOrUpdateFiles tool to make code changes.",
  });

  const createOrUpdateFiles = tool({
    description: "Create or update files in the in-memory workspace.",
    inputSchema: z.object({
      files: z.array(z.object({ path: z.string(), content: z.string() })),
    }),
    execute: async ({ files: incoming }: { files: { path: string; content: string }[] }) => {
      for (const file of incoming) {
        files[file.path] = file.content;
      }
      return `Updated ${incoming.length} file(s).`;
    },
  });

  const readFiles = tool({
    description: "Read files from the in-memory workspace.",
    inputSchema: z.object({ files: z.array(z.string()) }),
    execute: async ({ files: paths }: { files: string[] }) =>
      JSON.stringify(paths.map((p: string) => ({ path: p, content: files[p] ?? null }))),
  });

  return { terminal, createOrUpdateFiles, readFiles };
}
