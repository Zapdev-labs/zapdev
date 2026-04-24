import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth } from "./helpers";
import type { Id } from "./_generated/dataModel";
import { frameworkEnum } from "./schema";

/**
 * WebContainer Files Storage
 * 
 * Stores code files in Convex for WebContainer browser preview.
 * This enables:
 * - Persistent file storage across sessions
 * - Real-time file synchronization
 * - Multiple preview instances sharing the same files
 */

/**
 * Save files to WebContainer storage
 */
export const saveFiles = mutation({
  args: {
    projectId: v.id("projects"),
    files: v.record(v.string(), v.string()),
    fragmentId: v.optional(v.id("fragments")),
    messageId: v.optional(v.id("messages")),
    framework: v.optional(frameworkEnum),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<Id<"webcontainerFiles">> => {
    const userId = await requireAuth(ctx);

    // Verify project ownership
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized: Cannot save files to this project");
    }

    // Validate files - ensure all paths and contents are strings
    const validatedFiles: Record<string, string> = {};
    for (const [path, content] of Object.entries(args.files)) {
      if (typeof path === "string" && typeof content === "string") {
        validatedFiles[path] = content;
      }
    }

    const now = Date.now();

    // Check if there's an existing entry for this fragment/message
    let existingId: Id<"webcontainerFiles"> | null = null;
    
    if (args.fragmentId) {
      const existing = await ctx.db
        .query("webcontainerFiles")
        .withIndex("by_fragmentId", (q) => q.eq("fragmentId", args.fragmentId))
        .first();
      if (existing) existingId = existing._id;
    } else if (args.messageId) {
      const existing = await ctx.db
        .query("webcontainerFiles")
        .withIndex("by_messageId", (q) => q.eq("messageId", args.messageId))
        .first();
      if (existing) existingId = existing._id;
    }

    // Update existing or create new
    if (existingId) {
      await ctx.db.patch(existingId, {
        files: validatedFiles,
        framework: args.framework,
        metadata: args.metadata,
        updatedAt: now,
      });
      return existingId;
    } else {
      return await ctx.db.insert("webcontainerFiles", {
        projectId: args.projectId,
        fragmentId: args.fragmentId,
        messageId: args.messageId,
        files: validatedFiles,
        framework: args.framework,
        metadata: args.metadata,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

/**
 * Get files for a project (latest first)
 */
export const getLatestFiles = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const files = await ctx.db
      .query("webcontainerFiles")
      .withIndex("by_projectId_createdAt", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(1);

    return files[0] ?? null;
  },
});

/**
 * Get latest files for a specific user (for use from background jobs/Inngest).
 */
export const getLatestFilesForUser = query({
  args: {
    userId: v.string(),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== args.userId) {
      throw new Error("Unauthorized");
    }

    const files = await ctx.db
      .query("webcontainerFiles")
      .withIndex("by_projectId_createdAt", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(1);

    return files[0] ?? null;
  },
});

/**
 * Get files by fragment ID
 */
export const getFilesByFragment = query({
  args: {
    fragmentId: v.id("fragments"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    // Get fragment to check ownership
    const fragment = await ctx.db.get(args.fragmentId);
    if (!fragment) return null;

    const message = await ctx.db.get(fragment.messageId);
    if (!message) return null;

    const project = await ctx.db.get(message.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    return await ctx.db
      .query("webcontainerFiles")
      .withIndex("by_fragmentId", (q) => q.eq("fragmentId", args.fragmentId))
      .first();
  },
});

/**
 * Get files by message ID
 */
export const getFilesByMessage = query({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const message = await ctx.db.get(args.messageId);
    if (!message) return null;

    const project = await ctx.db.get(message.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    return await ctx.db
      .query("webcontainerFiles")
      .withIndex("by_messageId", (q) => q.eq("messageId", args.messageId))
      .first();
  },
});

/**
 * List all file snapshots for a project
 */
export const listFilesHistory = query({
  args: {
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    return await ctx.db
      .query("webcontainerFiles")
      .withIndex("by_projectId_createdAt", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

/**
 * Delete files from WebContainer storage
 */
export const deleteFiles = mutation({
  args: {
    filesId: v.id("webcontainerFiles"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const files = await ctx.db.get(args.filesId);
    if (!files) throw new Error("Files not found");

    const project = await ctx.db.get(files.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.delete(args.filesId);
    return true;
  },
});

/**
 * Sync files from fragment to WebContainer storage
 * Call this when a fragment is created/updated
 */
export const syncFromFragment = mutation({
  args: {
    fragmentId: v.id("fragments"),
  },
  handler: async (ctx, args): Promise<Id<"webcontainerFiles"> | null> => {
    const userId = await requireAuth(ctx);

    const fragment = await ctx.db.get(args.fragmentId);
    if (!fragment) throw new Error("Fragment not found");

    const message = await ctx.db.get(fragment.messageId);
    if (!message) throw new Error("Message not found");

    const project = await ctx.db.get(message.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    // Normalize files to string record
    const files: Record<string, string> = {};
    if (typeof fragment.files === "object" && fragment.files !== null) {
      for (const [path, content] of Object.entries(fragment.files as Record<string, unknown>)) {
        if (typeof content === "string") {
          files[path] = content;
        }
      }
    }

    if (Object.keys(files).length === 0) {
      return null;
    }

    const now = Date.now();

    // Check for existing
    const existing = await ctx.db
      .query("webcontainerFiles")
      .withIndex("by_fragmentId", (q) => q.eq("fragmentId", args.fragmentId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        files,
        framework: fragment.framework,
        updatedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("webcontainerFiles", {
        projectId: message.projectId,
        fragmentId: args.fragmentId,
        messageId: fragment.messageId,
        files,
        framework: fragment.framework,
        metadata: { source: "fragment-sync" },
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});
