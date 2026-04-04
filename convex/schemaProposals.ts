import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { schemaProposalStatusEnum } from "./schema";

export const createForUser = mutation({
  args: {
    userId: v.string(),
    projectId: v.id("projects"),
    messageId: v.id("messages"),
    proposal: v.string(),
    parsedTables: v.optional(
      v.array(
        v.object({
          name: v.string(),
          purpose: v.string(),
          fields: v.array(v.string()),
          indexes: v.array(v.string()),
        })
      )
    ),
    parsedRelationships: v.optional(v.array(v.string())),
    status: schemaProposalStatusEnum,
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== args.userId) {
      throw new Error("Unauthorized");
    }
    const message = await ctx.db.get(args.messageId);
    if (!message || message.projectId !== args.projectId) {
      throw new Error("Message not found");
    }
    const now = Date.now();
    return await ctx.db.insert("schemaProposals", {
      projectId: args.projectId,
      messageId: args.messageId,
      userId: args.userId,
      proposal: args.proposal,
      status: args.status,
      parsedTables: args.parsedTables,
      parsedRelationships: args.parsedRelationships,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const markImplementedForUser = mutation({
  args: {
    userId: v.string(),
    schemaProposalId: v.id("schemaProposals"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.schemaProposalId);
    if (!row || row.userId !== args.userId) {
      throw new Error("Unauthorized");
    }
    const now = Date.now();
    await ctx.db.patch(args.schemaProposalId, {
      status: "IMPLEMENTED",
      approvedAt: row.approvedAt ?? now,
      implementedAt: now,
      updatedAt: now,
    });
  },
});
