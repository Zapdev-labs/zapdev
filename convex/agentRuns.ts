import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireAuth } from "./helpers";
import { frameworkEnum, messageStatusEnum, messageTypeEnum } from "./schema";
import type { Id } from "./_generated/dataModel";

const WEB_CONTAINER_PREVIEW_URL = "__WEBCONTAINER_PREVIEW__";

export const enqueueForSystem = mutation({
  args: {
    projectId: v.id("projects"),
    value: v.string(),
    model: v.optional(v.string()),
    framework: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const now = Date.now();
    return await ctx.db.insert("agentRuns", {
      projectId: args.projectId,
      value: args.value,
      model: args.model,
      framework: args.framework,
      status: "PENDING",
      runSource: "WEBCONTAINER",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listPendingForProject = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    return await ctx.db
      .query("agentRuns")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", args.projectId).eq("status", "PENDING"))
      .order("asc")
      .collect();
  },
});

type BaseFilesResult = {
  files: Record<string, string>;
  framework: "NEXTJS" | "ANGULAR" | "REACT" | "VUE" | "SVELTE";
};

const getLatestBaseFiles = async (
  ctx: MutationCtx,
  projectId: Id<"projects">,
  fallbackFramework: BaseFilesResult["framework"]
): Promise<BaseFilesResult> => {
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_projectId_createdAt", (q) => q.eq("projectId", projectId))
    .order("desc")
    .take(25);

  for (const message of messages) {
    const fragment = await ctx.db
      .query("fragments")
      .withIndex("by_messageId", (q) => q.eq("messageId", message._id))
      .first();

    if (!fragment || typeof fragment.files !== "object" || fragment.files === null) {
      continue;
    }

    const normalizedFiles = Object.entries(fragment.files as Record<string, unknown>).reduce<Record<string, string>>(
      (acc, [path, content]) => {
        if (typeof content === "string") {
          acc[path] = content;
        }
        return acc;
      },
      {}
    );

    if (Object.keys(normalizedFiles).length > 0) {
      return {
        files: normalizedFiles,
        framework: fragment.framework,
      };
    }
  }

  return {
    files: {},
    framework: fallbackFramework,
  };
};

export const claimRun = mutation({
  args: {
    runId: v.id("agentRuns"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Run not found");
    }

    const project = await ctx.db.get(run.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    if (run.status !== "PENDING") {
      throw new Error("Run already claimed");
    }

    const now = Date.now();
    await ctx.db.patch(run._id, {
      status: "RUNNING",
      claimedBy: userId,
      updatedAt: now,
    });

    const base = await getLatestBaseFiles(ctx, run.projectId, project.framework);
    return {
      runId: run._id,
      projectId: run.projectId,
      value: run.value,
      model: run.model,
      framework: base.framework,
      baseFiles: base.files,
    };
  },
});

export const completeRun = mutation({
  args: {
    runId: v.id("agentRuns"),
    summary: v.string(),
    files: v.record(v.string(), v.string()),
    framework: frameworkEnum,
    messageType: v.optional(messageTypeEnum),
    messageStatus: v.optional(messageStatusEnum),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Run not found");
    }

    const project = await ctx.db.get(run.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    if (run.status !== "RUNNING") {
      throw new Error("Run is not currently running");
    }

    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      projectId: run.projectId,
      content: args.summary,
      role: "ASSISTANT",
      type: args.messageType ?? "RESULT",
      status: args.messageStatus ?? "COMPLETE",
      createdAt: now,
      updatedAt: now,
    });

    const fragmentId = await ctx.db.insert("fragments", {
      messageId,
      sandboxUrl: WEB_CONTAINER_PREVIEW_URL,
      title: "WebContainer Run Result",
      files: args.files,
      metadata: {
        source: "webcontainer-runner",
        model: run.model,
        ...(args.metadata ?? {}),
      },
      framework: args.framework,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(run._id, {
      status: "COMPLETED",
      messageId,
      fragmentId,
      completedAt: now,
      updatedAt: now,
    });

    return {
      messageId,
      fragmentId,
    };
  },
});

export const failRun = mutation({
  args: {
    runId: v.id("agentRuns"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Run not found");
    }

    const project = await ctx.db.get(run.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(run._id, {
      status: "FAILED",
      error: args.error,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return run._id;
  },
});
