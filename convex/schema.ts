import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const frameworkEnum = v.union(
  v.literal("NEXTJS"),
  v.literal("ANGULAR"),
  v.literal("REACT"),
  v.literal("VUE"),
  v.literal("SVELTE")
);

export const messageRoleEnum = v.union(
  v.literal("USER"),
  v.literal("ASSISTANT")
);

export const messageTypeEnum = v.union(
  v.literal("RESULT"),
  v.literal("ERROR"),
  v.literal("STREAMING")
);

export const messageStatusEnum = v.union(
  v.literal("PENDING"),
  v.literal("STREAMING"),
  v.literal("COMPLETE")
);

export const attachmentTypeEnum = v.union(
  v.literal("IMAGE"),
  v.literal("FIGMA_FILE"),
  v.literal("GITHUB_REPO")
);

export const importSourceEnum = v.union(
  v.literal("FIGMA"),
  v.literal("GITHUB")
);

export const oauthProviderEnum = v.union(
  v.literal("figma"),
  v.literal("github")
);

export const importStatusEnum = v.union(
  v.literal("PENDING"),
  v.literal("PROCESSING"),
  v.literal("COMPLETE"),
  v.literal("FAILED")
);

export const agentRunStatusEnum = v.union(
  v.literal("PENDING"),
  v.literal("RUNNING"),
  v.literal("COMPLETED"),
  v.literal("FAILED")
);

export const agentRunSourceEnum = v.union(
  v.literal("WEBCONTAINER"),
  v.literal("INNGEST")
);

export const webhookEventStatusEnum = v.union(
  v.literal("received"),
  v.literal("processed"),
  v.literal("failed"),
  v.literal("retrying")
);

export const subscriptionStatusEnum = v.union(
  v.literal("active"),
  v.literal("past_due"),
  v.literal("canceled"),
  v.literal("unpaid"),
  v.literal("trialing")
);

export const subscriptionIntervalEnum = v.union(
  v.literal("monthly"),
  v.literal("yearly")
);

const polarCustomers = defineTable({
  userId: v.string(),
  polarCustomerId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_userId", ["userId"])
  .index("by_polarCustomerId", ["polarCustomerId"]);

export default defineSchema({
  projects: defineTable({
    name: v.string(),
    userId: v.string(),
    framework: frameworkEnum,
    modelPreference: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  messages: defineTable({
    content: v.string(),
    role: messageRoleEnum,
    type: messageTypeEnum,
    status: messageStatusEnum,
    projectId: v.id("projects"),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_createdAt", ["projectId", "createdAt"]),

  fragments: defineTable({
    messageId: v.id("messages"),
    sandboxUrl: v.string(),
    sandboxId: v.optional(v.string()),
    title: v.string(),
    files: v.any(),
    metadata: v.optional(v.any()),
    framework: frameworkEnum,
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_messageId", ["messageId"]),

  fragmentDrafts: defineTable({
    projectId: v.id("projects"),
    files: v.any(),
    framework: frameworkEnum,
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_projectId", ["projectId"]),

  attachments: defineTable({
    type: attachmentTypeEnum,
    url: v.string(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    size: v.number(),
    messageId: v.id("messages"),
    importId: v.optional(v.id("imports")),
    sourceMetadata: v.optional(v.any()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_messageId", ["messageId"]),

  oauthConnections: defineTable({
    userId: v.string(),
    provider: oauthProviderEnum,
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    scope: v.string(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_provider", ["userId", "provider"]),

  imports: defineTable({
    userId: v.string(),
    projectId: v.id("projects"),
    messageId: v.optional(v.id("messages")),
    source: importSourceEnum,
    sourceId: v.string(),
    sourceName: v.string(),
    sourceUrl: v.string(),
    status: importStatusEnum,
    metadata: v.optional(v.any()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_projectId", ["projectId"])
    .index("by_status", ["status"]),

  usage: defineTable({
    userId: v.string(),
    points: v.number(),
    expire: v.optional(v.number()),
    planType: v.optional(v.union(v.literal("free"), v.literal("pro"), v.literal("unlimited"))),
  })
    .index("by_userId", ["userId"])
    .index("by_expire", ["expire"]),

  rateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    windowStart: v.number(),
    limit: v.number(),
    windowMs: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_windowStart", ["windowStart"]),

  subscriptions: defineTable({
    userId: v.string(),
    polarSubscriptionId: v.string(),
    customerId: v.string(),
    productId: v.string(),
    priceId: v.string(),
    status: subscriptionStatusEnum,
    interval: subscriptionIntervalEnum,
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.boolean(),
    canceledAt: v.optional(v.number()),
    trialStart: v.optional(v.number()),
    trialEnd: v.optional(v.number()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_polarSubscriptionId", ["polarSubscriptionId"])
    .index("by_customerId", ["customerId"])
    .index("by_status", ["status"]),

  polarCustomers,

  webhookEvents: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    status: webhookEventStatusEnum,
    payload: v.any(),
    error: v.optional(v.string()),
    processedAt: v.optional(v.number()),
    retryCount: v.number(),
    createdAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_status", ["status"])
    .index("by_eventType", ["eventType"])
    .index("by_createdAt", ["createdAt"]),

  pendingSubscriptions: defineTable({
    polarSubscriptionId: v.string(),
    customerId: v.string(),
    eventData: v.any(),
    status: v.union(v.literal("pending"), v.literal("resolved"), v.literal("failed")),
    resolvedUserId: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_polarSubscriptionId", ["polarSubscriptionId"])
    .index("by_customerId", ["customerId"])
    .index("by_status", ["status"]),

  agentRuns: defineTable({
    projectId: v.id("projects"),
    value: v.string(),
    model: v.optional(v.string()),
    framework: v.optional(v.string()),
    status: agentRunStatusEnum,
    runSource: agentRunSourceEnum,
    claimedBy: v.optional(v.string()),
    messageId: v.optional(v.id("messages")),
    fragmentId: v.optional(v.id("fragments")),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_status", ["projectId", "status"])
    .index("by_status", ["status"])
    .index("by_projectId_createdAt", ["projectId", "createdAt"]),
});
