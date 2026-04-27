import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { requireAuth } from "./helpers";
import {
  messageRoleEnum,
  messageTypeEnum,
  messageStatusEnum,
  frameworkEnum,
  attachmentTypeEnum,
} from "./schema";
import type { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";

/**
 * Create a new message
 */
export const create = mutation({
  args: {
    projectId: v.id("projects"),
    content: v.string(),
    role: messageRoleEnum,
    type: messageTypeEnum,
    status: v.optional(messageStatusEnum),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    // Verify project ownership
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const now = Date.now();

    const messageId = await ctx.db.insert("messages", {
      projectId: args.projectId,
      content: args.content,
      role: args.role,
      type: args.type,
      status: args.status || "COMPLETE",
      createdAt: now,
      updatedAt: now,
    });

    return messageId;
  },
});

/**
 * Create a message with attachments (for message form flow)
 * This replaces the tRPC messages.create procedure
 */
export const createWithAttachments = action({
  args: {
    value: v.string(),
    projectId: v.string(),
    model: v.optional(v.string()),
    attachments: v.optional(
      v.array(
        v.object({
          url: v.string(),
          size: v.number(),
          width: v.optional(v.number()),
          height: v.optional(v.number()),
          type: v.optional(attachmentTypeEnum),
          importId: v.optional(v.id("imports")),
          sourceMetadata: v.optional(v.any()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    // Validate project ID format (Convex ID)
    const projectId = args.projectId as Id<"projects">;

    // Check if model/tier is free - if so, skip credit check
    const isFreeModel = args.model?.endsWith(":free") ?? false;

    // Check and consume credit with tier multiplier support (only for non-free models)
    if (!isFreeModel) {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity || !identity.subject) {
        throw new Error("Unauthorized");
      }
      const userId = identity.subject;
      
      const creditResult = await ctx.runMutation(api.usage.checkAndConsumeCreditWithTier, { 
        userId,
        tierOrModel: args.model ?? "pro", // Default to pro tier
      });
      
      if (!creditResult.success) {
        throw new Error(creditResult.message || "You have run out of credits");
      }
    }

    // Create the message
    const messageId = await ctx.runMutation(api.messages.create, {
      projectId,
      content: args.value,
      role: "USER",
      type: "RESULT",
      status: "COMPLETE",
    });

    // Add attachments if provided
    if (args.attachments && args.attachments.length > 0) {
      for (const attachment of args.attachments) {
        await ctx.runMutation(api.messages.addAttachment, {
          messageId,
          type: attachment.type ?? "IMAGE",
          url: attachment.url,
          size: attachment.size,
          width: attachment.width,
          height: attachment.height,
          importId: attachment.importId,
          sourceMetadata: attachment.sourceMetadata,
        });
      }
    }

    return {
      messageId,
      projectId,
      value: args.value,
    };
  },
}) as ReturnType<typeof action>;

/**
 * Get all messages for a project with fragments and attachments
 */
export const list = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    // Verify project ownership
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_projectId_createdAt", (q) => q.eq("projectId", args.projectId))
      .order("asc")
      .collect();

    // For each message, get fragment and attachments
    const messagesWithRelations = await Promise.all(
      messages.map(async (message) => {
        const fragment = await ctx.db
          .query("fragments")
          .withIndex("by_messageId", (q) => q.eq("messageId", message._id))
          .first();

        const attachments = await ctx.db
          .query("attachments")
          .withIndex("by_messageId", (q) => q.eq("messageId", message._id))
          .collect();

        return {
          ...message,
          Fragment: fragment || null,
          Attachment: attachments,
        };
      })
    );

    return messagesWithRelations;
  },
});

/**
 * Get a single message by ID
 */
export const get = query({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    // Verify project ownership
    const project = await ctx.db.get(message.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    return message;
  },
});

/**
 * Update message status
 */
export const updateStatus = mutation({
  args: {
    messageId: v.id("messages"),
    status: messageStatusEnum,
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    // Verify project ownership
    const project = await ctx.db.get(message.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.messageId, {
      status: args.status,
      updatedAt: Date.now(),
    });

    return args.messageId;
  },
});

/**
 * Update message content and optionally status (for API route)
 */
export const updateMessage = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
    status: v.optional(messageStatusEnum),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    // Verify project ownership
    const project = await ctx.db.get(message.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.messageId, {
      content: args.content,
      ...(args.status && { status: args.status }),
      updatedAt: Date.now(),
    });

    return await ctx.db.get(args.messageId);
  },
});

/**
 * Create or update a fragment for a message
 */
export const createFragment = mutation({
  args: {
    messageId: v.id("messages"),
    sandboxUrl: v.string(),
    title: v.string(),
    files: v.any(),
    metadata: v.optional(v.any()),
    framework: frameworkEnum,
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    const project = await ctx.db.get(message.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const existingFragment = await ctx.db
      .query("fragments")
      .withIndex("by_messageId", (q) => q.eq("messageId", args.messageId))
      .first();

    const now = Date.now();

    if (existingFragment) {
      await ctx.db.patch(existingFragment._id, {
        sandboxUrl: args.sandboxUrl,
        title: args.title,
        files: args.files,
        metadata: args.metadata,
        framework: args.framework,
        updatedAt: now,
      });
      return existingFragment._id;
    } else {
      const fragmentId = await ctx.db.insert("fragments", {
        messageId: args.messageId,
        sandboxUrl: args.sandboxUrl,
        title: args.title,
        files: args.files,
        metadata: args.metadata,
        framework: args.framework,
        createdAt: now,
        updatedAt: now,
      });
      return fragmentId;
    }
  },
});

/**
 * Get fragment for a message
 */
export const getFragment = query({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    // Verify project ownership
    const project = await ctx.db.get(message.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const fragment = await ctx.db
      .query("fragments")
      .withIndex("by_messageId", (q) => q.eq("messageId", args.messageId))
      .first();

    return fragment;
  },
});

/**
 * Add attachment to a message
 */
export const addAttachment = mutation({
  args: {
    messageId: v.id("messages"),
    type: attachmentTypeEnum,
    url: v.string(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    size: v.number(),
    importId: v.optional(v.id("imports")),
    sourceMetadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    // Verify project ownership
    const project = await ctx.db.get(message.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const now = Date.now();

    const attachmentId = await ctx.db.insert("attachments", {
      messageId: args.messageId,
      type: args.type,
      url: args.url,
      width: args.width,
      height: args.height,
      size: args.size,
      importId: args.importId,
      sourceMetadata: args.sourceMetadata,
      createdAt: now,
      updatedAt: now,
    });

    return attachmentId;
  },
});

/**
 * Get attachments for a message
 */
export const getAttachments = query({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    // Verify project ownership
    const project = await ctx.db.get(message.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const attachments = await ctx.db
      .query("attachments")
      .withIndex("by_messageId", (q) => q.eq("messageId", args.messageId))
      .collect();

    return attachments;
  },
});

/**
 * Get fragment by ID (for public API access)
 */
export const getFragmentById = query({
  args: {
    fragmentId: v.id("fragments"),
  },
  handler: async (ctx, args) => {
    const fragment = await ctx.db.get(args.fragmentId);
    if (!fragment) {
      throw new Error("Fragment not found");
    }
    return fragment;
  },
});

/**
 * Get fragment by ID with authorization check
 */
export const getFragmentByIdAuth = query({
  args: {
    fragmentId: v.id("fragments"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const fragment = await ctx.db.get(args.fragmentId);
    if (!fragment) {
      throw new Error("Fragment not found");
    }

    // Get message to check project ownership
    const message = await ctx.db.get(fragment.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    const project = await ctx.db.get(message.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Unauthorized");
    }

    return { fragment, message, project };
  },
});

/**
 * Wrapper mutation for creating a message with explicit user ID (for use from actions)
 */
export const createForUser = mutation({
  args: {
    userId: v.string(),
    projectId: v.id("projects"),
    content: v.string(),
    role: messageRoleEnum,
    type: messageTypeEnum,
    status: v.optional(messageStatusEnum),
  },
  handler: async (ctx, args) => {
    return createInternal(ctx, args.userId, args.projectId, args.content, args.role, args.type, args.status);
  },
});

/**
 * Internal: Create a message for a specific user (for use from actions/background jobs)
 */
export const createInternal = async (
  ctx: any,
  userId: string,
  projectId: string,
  content: string,
  role: string,
  type: string,
  status?: string
): Promise<string> => {
  // Verify project ownership
  const project = await ctx.db.get(projectId as any);
  if (!project || project.userId !== userId) {
    throw new Error("Unauthorized");
  }

  const now = Date.now();

  const messageId = await ctx.db.insert("messages", {
    projectId: projectId as any,
    content,
    role,
    type,
    status: status || "COMPLETE",
    createdAt: now,
    updatedAt: now,
  });

  return messageId;
};

/**
 * Internal: Create a fragment for a specific user (for use from actions/background jobs)
 */
/**
 * List messages for a specific user (for use from background jobs/Inngest)
 */
export const listForUser = query({
  args: {
    userId: v.string(),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    // Verify project ownership
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== args.userId) {
      throw new Error("Unauthorized");
    }
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_projectId_createdAt", (q) => q.eq("projectId", args.projectId))
      .order("asc")
      .collect();

    // For each message, get fragment and attachments
    const messagesWithRelations = await Promise.all(
      messages.map(async (message) => {
        const fragment = await ctx.db
          .query("fragments")
          .withIndex("by_messageId", (q: any) => q.eq("messageId", message._id))
          .first();

        const attachments = await ctx.db
          .query("attachments")
          .withIndex("by_messageId", (q: any) => q.eq("messageId", message._id))
          .collect();

        return {
          ...message,
          fragment,
          attachments,
        };
      })
    );

    return messagesWithRelations;
  },
});

/**
 * Create a fragment for a specific user (for use from background jobs/Inngest)
 */
export const createFragmentForUser = mutation({
  args: {
    userId: v.string(),
    messageId: v.id("messages"),
    sandboxId: v.optional(v.string()),
    sandboxUrl: v.string(),
    title: v.string(),
    files: v.any(),
    metadata: v.optional(v.any()),
    framework: frameworkEnum,
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    const project = await ctx.db.get(message.projectId);
    if (!project || project.userId !== args.userId) throw new Error("Unauthorized");

    const now = Date.now();

    const existingFragment = await ctx.db
      .query("fragments")
      .withIndex("by_messageId", (q) => q.eq("messageId", args.messageId))
      .first();

    if (existingFragment) {
      await ctx.db.patch(existingFragment._id, {
        ...(args.sandboxId !== undefined && { sandboxId: args.sandboxId }),
        sandboxUrl: args.sandboxUrl,
        title: args.title,
        files: args.files,
        metadata: args.metadata,
        framework: args.framework,
        updatedAt: now,
      });
      return existingFragment._id;
    }

    return await ctx.db.insert("fragments", {
      messageId: args.messageId,
      ...(args.sandboxId !== undefined && { sandboxId: args.sandboxId }),
      sandboxUrl: args.sandboxUrl,
      title: args.title,
      files: args.files,
      metadata: args.metadata,
      framework: args.framework,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Clean up old ERROR messages that contain debug details
 * One-time migration to remove debug info from user-facing messages
 */
export const cleanupOldErrorMessages = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    
    // Get all projects for this user
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    let updatedCount = 0;
    const userMessage = "Sorry, I encountered an error while generating code. Please try again.";

    for (const project of projects) {
      // Get messages for this project
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
        .collect();

      for (const message of messages) {
        // Only process ERROR messages with old debug text
        if (message.type === "ERROR" && message.role === "ASSISTANT" &&
            (message.content.includes("The background coding agent failed") ||
             message.content.includes("Requested model:") ||
             message.content.includes("Provider details:"))) {
          
          await ctx.db.patch(message._id, {
            content: userMessage,
            updatedAt: Date.now(),
          });
          updatedCount++;
        }
      }
    }

    return updatedCount;
  },
});
