import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { requireAuth, getCurrentUserClerkId } from "./helpers";
import { frameworkEnum } from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * Create a new project
 */
export const create = mutation({
  args: {
    name: v.string(),
    framework: frameworkEnum,
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const now = Date.now();

    const projectId = await ctx.db.insert("projects", {
      name: args.name,
      userId,
      framework: args.framework,
      createdAt: now,
      updatedAt: now,
    });

    return projectId;
  },
});

/**
 * Create a project with initial message (for new project flow)
 * This replaces the tRPC create procedure
 */
export const createWithMessage = action({
  args: {
    value: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get the authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) {
      throw new Error("Unauthorized");
    }
    const userId = identity.subject;

    // Check if model is free - if so, skip credit check
    const isFreeModel = args.model?.endsWith(":free") ?? false;

    // Check and consume credit first (only for non-free models)
    if (!isFreeModel) {
      const creditResult = await ctx.runQuery(api.usage.getUsageForUser, { userId });
      if (creditResult.creditsRemaining <= 0) {
        throw new Error("You have run out of credits");
      }

      // Consume the credit
      await ctx.runMutation(api.usage.checkAndConsumeCreditForUser, { userId });
    }

    // Generate a random project name (mimicking generateSlug from random-word-slugs)
    const adjectives = ["happy", "sunny", "clever", "bright", "swift", "bold", "calm", "eager"];
    const nouns = ["project", "app", "site", "tool", "platform", "system", "portal", "hub"];
    const randomName = `${adjectives[Math.floor(Math.random() * adjectives.length)]}-${nouns[Math.floor(Math.random() * nouns.length)]}`;

    // Create the project (we'll default to nextjs, framework detection can be added later)
    const projectId = await ctx.runMutation(api.projects.createForUser, {
      userId,
      name: randomName,
      framework: "NEXTJS",
    }) as Id<"projects">;

    // Create the initial message
    const messageId = await ctx.runMutation(api.messages.createForUser, {
      userId,
      projectId,
      content: args.value,
      role: "USER",
      type: "RESULT",
      status: "COMPLETE",
    });

    // Get the project to return
    const project = await ctx.runQuery(api.projects.get, { projectId });

    return {
      id: projectId,
      ...project,
      messageId,
      value: args.value
    };
  },
}) as ReturnType<typeof action>;

/**
 * Create a project with initial message and attachments (for new project flow from home page)
 */
export const createWithMessageAndAttachments = action({
  args: {
    value: v.string(),
    model: v.optional(v.string()),
    attachments: v.optional(
      v.array(
        v.object({
          url: v.string(),
          size: v.number(),
          width: v.optional(v.number()),
          height: v.optional(v.number()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    // Get the authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) {
      throw new Error("Unauthorized");
    }
    const userId = identity.subject;

    // Check if model is free - if so, skip credit check
    const isFreeModel = args.model?.endsWith(":free") ?? false;

    // Check and consume credit first (only for non-free models)
    if (!isFreeModel) {
      const creditResult = await ctx.runQuery(api.usage.getUsageForUser, { userId });
      if (creditResult.creditsRemaining <= 0) {
        throw new Error("You have run out of credits");
      }

      // Consume the credit
      await ctx.runMutation(api.usage.checkAndConsumeCreditForUser, { userId });
    }

    // Generate a random project name (mimicking generateSlug from random-word-slugs)
    const adjectives = ["happy", "sunny", "clever", "bright", "swift", "bold", "calm", "eager"];
    const nouns = ["project", "app", "site", "tool", "platform", "system", "portal", "hub"];
    const randomName = `${adjectives[Math.floor(Math.random() * adjectives.length)]}-${nouns[Math.floor(Math.random() * nouns.length)]}`;

    // Create the project (we'll default to nextjs, framework detection can be added later)
    const projectId = await ctx.runMutation(api.projects.createForUser, {
      userId,
      name: randomName,
      framework: "NEXTJS",
    }) as Id<"projects">;

    // Create the initial message
    const messageId = await ctx.runMutation(api.messages.createForUser, {
      userId,
      projectId,
      content: args.value,
      role: "USER",
      type: "RESULT",
      status: "COMPLETE",
    }) as Id<"messages">;

    // Add attachments if provided
    if (args.attachments && args.attachments.length > 0) {
      for (const attachment of args.attachments) {
        await ctx.runMutation(api.messages.addAttachment, {
          messageId,
          type: "IMAGE",
          url: attachment.url,
          size: attachment.size,
          width: attachment.width,
          height: attachment.height,
        });
      }
    }

    // Get the project to return
    const project = await ctx.runQuery(api.projects.get, { projectId });

    return {
      id: projectId,
      ...project,
      messageId,
      value: args.value
    };
  },
}) as ReturnType<typeof action>;

/**
 * Get all projects for the current user with preview attachment
 * Returns empty array if user is not authenticated
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getCurrentUserClerkId(ctx);
    
    if (!userId) {
      return [];
    }

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    // For each project, get the latest message and its preview attachment
    const projectsWithPreview = await Promise.all(
      projects.map(async (project) => {
        // Get latest message for this project
        const latestMessage = await ctx.db
          .query("messages")
          .withIndex("by_projectId_createdAt", (q) => q.eq("projectId", project._id))
          .order("desc")
          .first();

        let previewAttachment = null;
        if (latestMessage) {
          // Get image attachments for the latest message
          const attachments = await ctx.db
            .query("attachments")
            .withIndex("by_messageId", (q) => q.eq("messageId", latestMessage._id))
            .collect();

          // Find the most recent IMAGE attachment
          const imageAttachments = attachments
            .filter(att => att.type === "IMAGE")
            .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

          previewAttachment = imageAttachments[0] ?? null;
        }

        return {
          ...project,
          previewAttachment,
        };
      })
    );

    return projectsWithPreview;
  },
});

/**
 * Get showcase projects - public query for projects with fragments
 * Returns up to 12 projects that have at least one message with a fragment
 */
export const listShowcase = query({
  args: {},
  handler: async (ctx) => {
    const allProjects = await ctx.db
      .query("projects")
      .order("desc")
      .collect();

    const projectsWithFragments = await Promise.all(
      allProjects.map(async (project) => {
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
          .collect();

        const messageCount = messages.length;

        let hasFragment = false;
        for (const message of messages) {
          const fragment = await ctx.db
            .query("fragments")
            .withIndex("by_messageId", (q) => q.eq("messageId", message._id))
            .first();
          if (fragment) {
            hasFragment = true;
            break;
          }
        }

        return {
          ...project,
          messageCount,
          hasFragment,
        };
      })
    );

    const filteredProjects = projectsWithFragments
      .filter((project) => project.hasFragment)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, 12);

    return filteredProjects;
  },
});

/**
 * Get a single project by ID
 */
export const get = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Ensure user owns the project
    if (project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    return project;
  },
});

/**
 * Update a project
 */
export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    framework: v.optional(frameworkEnum),
    modelPreference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Ensure user owns the project
    if (project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.projectId, {
      ...(args.name && { name: args.name }),
      ...(args.framework && { framework: args.framework }),
      ...(args.modelPreference !== undefined && { modelPreference: args.modelPreference }),
      updatedAt: Date.now(),
    });

    return args.projectId;
  },
});

/**
 * Delete a project and all associated data (messages, fragments, etc.)
 */
export const deleteProject = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Ensure user owns the project
    if (project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    // Delete all messages for this project (and cascade to fragments/attachments)
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const message of messages) {
      // Delete fragments for this message
      const fragment = await ctx.db
        .query("fragments")
        .withIndex("by_messageId", (q) => q.eq("messageId", message._id))
        .first();
      if (fragment) {
        await ctx.db.delete(fragment._id);
      }

      // Delete attachments for this message
      const attachments = await ctx.db
        .query("attachments")
        .withIndex("by_messageId", (q) => q.eq("messageId", message._id))
        .collect();
      for (const attachment of attachments) {
        await ctx.db.delete(attachment._id);
      }

      // Delete the message
      await ctx.db.delete(message._id);
    }

    // Delete fragment draft for this project
    const fragmentDraft = await ctx.db
      .query("fragmentDrafts")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .first();
    if (fragmentDraft) {
      await ctx.db.delete(fragmentDraft._id);
    }

    // Finally, delete the project
    await ctx.db.delete(args.projectId);

    return { success: true };
  },
});

/**
 * Get or create fragment draft for a project
 */
export const getOrCreateFragmentDraft = mutation({
  args: {
    projectId: v.id("projects"),
    framework: frameworkEnum,
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const existingDraft = await ctx.db
      .query("fragmentDrafts")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .first();

    if (existingDraft) {
      return existingDraft;
    }

    const now = Date.now();
    const draftId = await ctx.db.insert("fragmentDrafts", {
      projectId: args.projectId,
      files: {},
      framework: args.framework,
      createdAt: now,
      updatedAt: now,
    });

    return await ctx.db.get(draftId);
  },
});

/**
 * Internal: Get a project for a specific user (for use from actions/background jobs)
 */
export const getInternal = async (
  ctx: any,
  userId: string,
  projectId: string
): Promise<any> => {
  const project = await ctx.db.get(projectId as any);
  if (!project) {
    throw new Error("Project not found");
  }

  // Ensure user owns the project
  if (project.userId !== userId) {
    throw new Error("Unauthorized");
  }

  return project;
};

/**
 * Wrapper mutation for creating a project with explicit user ID (for use from actions)
 */
export const createForUser = mutation({
  args: {
    userId: v.string(),
    name: v.string(),
    framework: frameworkEnum,
  },
  handler: async (ctx, args) => {
    return createInternal(ctx, args.userId, args.name, args.framework);
  },
});

export const setHasBackendForUser = mutation({
  args: {
    userId: v.string(),
    projectId: v.id("projects"),
    hasBackend: v.boolean(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== args.userId) {
      throw new Error("Unauthorized");
    }
    await ctx.db.patch(args.projectId, {
      hasBackend: args.hasBackend,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Create a project for a specific user (for use from actions/background jobs)
 */
export const createInternal = async (
  ctx: any,
  userId: string,
  name: string,
  framework: string
): Promise<string> => {
  const now = Date.now();

  const projectId = await ctx.db.insert("projects", {
    name,
    userId,
    framework,
    createdAt: now,
    updatedAt: now,
  });

  return projectId;
};

/**
 * System-level query to get any project by ID (for Inngest background jobs only)
 * This bypasses authentication since Inngest is a trusted system
 */
export const getForSystem = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    return project;
  },
});

/**
 * Get a project for a specific user (for use from background jobs/Inngest)
 */
export const getForUser = query({
  args: {
    userId: v.string(),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Ensure user owns the project
    if (project.userId !== args.userId) {
      throw new Error("Unauthorized");
    }

    return project;
  },
});

/**
 * Update a project for a specific user (for use from background jobs/Inngest)
 */
export const updateForUser = mutation({
  args: {
    userId: v.string(),
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    framework: v.optional(frameworkEnum),
    modelPreference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Ensure user owns the project
    if (project.userId !== args.userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.projectId, {
      ...(args.name && { name: args.name }),
      ...(args.framework && { framework: args.framework }),
      ...(args.modelPreference !== undefined && { modelPreference: args.modelPreference }),
      updatedAt: Date.now(),
    });

    return args.projectId;
  },
});
