import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth, hasProAccess, hasUnlimitedAccess } from "./helpers";

// Constants matching the existing system
const FREE_POINTS = 5;
const PRO_POINTS = 100;
const UNLIMITED_POINTS = Number.MAX_SAFE_INTEGER;
const DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const BASE_GENERATION_COST = 1;

// ============================================
// CREDIT MULTIPLIER SYSTEM
// ============================================

// Tier multipliers - must match frontend TIER_CONFIGS
export const TIER_MULTIPLIERS: Record<string, number> = {
  cheap: 0.5,   // 2x generations (costs half)
  pro: 1,       // Standard
  best: 2,      // 2x cost
};

// Specific model multipliers (fallback for direct model IDs)
export const MODEL_MULTIPLIERS: Record<string, number> = {
  // Cheap tier models
  "arcee-ai/trinity-large-thinking": 0.5,
  "z-ai/glm-5.1": 0.5,
  
  // Pro tier models
  "moonshotai/kimi-k2.5": 1,
  "moonshotai/kimi-k2.5:nitro": 1,
  "anthropic/claude-haiku-4.5": 1,
  
  // Best tier models
  "anthropic/claude-sonnet-4.6": 2,
  "openai/gpt-5.1-codex": 2,
};

/**
 * Get credit multiplier for a tier or model
 */
export function getCreditMultiplier(modelOrTier: string): number {
  // First check if it's a tier
  if (TIER_MULTIPLIERS[modelOrTier] !== undefined) {
    return TIER_MULTIPLIERS[modelOrTier];
  }
  
  // Then check if it's a specific model
  if (MODEL_MULTIPLIERS[modelOrTier] !== undefined) {
    return MODEL_MULTIPLIERS[modelOrTier];
  }
  
  // Check if it contains tier keywords
  if (modelOrTier.includes("cheap")) return 0.5;
  if (modelOrTier.includes("best")) return 2;
  if (modelOrTier.includes("pro")) return 1;
  
  // Check if model ID contains free
  if (modelOrTier.endsWith(":free")) return 0;
  
  // Default
  return 1;
}

/**
 * Check and consume credits for a generation with tier/multiplier support
 */
export const checkAndConsumeCredit = mutation({
  args: {
    multiplier: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; remaining: number; message?: string; cost: number }> => {
    const userId = await requireAuth(ctx);
    
    const multiplier = args.multiplier ?? 1;
    const cost = Math.max(0.5, BASE_GENERATION_COST * multiplier); // Minimum 0.5 credits

    // Check user's plan
    const isPro = await hasProAccess(ctx);
    const isUnlimited = await hasUnlimitedAccess(ctx);
    const maxPoints = isUnlimited ? UNLIMITED_POINTS : isPro ? PRO_POINTS : FREE_POINTS;

    // Get current usage
    const usage = await ctx.db
      .query("usage")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    const now = Date.now();
    const expiryTime = now + DURATION_MS;

    // If no usage record or expired, create/reset with max points
    if (!usage || (usage.expire && usage.expire < now)) {
      const newPoints = Math.max(0, maxPoints - cost);
      if (usage) {
        // Reset expired usage
        await ctx.db.patch(usage._id, {
          points: newPoints,
          expire: expiryTime,
          planType: isUnlimited ? "unlimited" : isPro ? "pro" : "free",
        });
      } else {
        // Create new usage record
        await ctx.db.insert("usage", {
          userId,
          points: newPoints,
          expire: expiryTime,
          planType: isUnlimited ? "unlimited" : isPro ? "pro" : "free",
        });
      }
      return { success: true, remaining: newPoints, cost };
    }

    if (!isUnlimited && usage.points < cost) {
      const timeUntilReset = usage.expire ? Math.ceil((usage.expire - now) / 1000 / 60) : 0;
      return {
        success: false,
        remaining: usage.points,
        cost,
        message: `Insufficient credits. This generation costs ${cost} credits but you only have ${usage.points.toFixed(1)}. Your credits will reset in ${timeUntilReset} minutes.`
      };
    }

    // Consume the credit
    const newPoints = Math.max(0, usage.points - cost);
    await ctx.db.patch(usage._id, {
      points: newPoints,
    });

    return { success: true, remaining: newPoints, cost };
  },
});

/**
 * Check and consume credits for a specific user with tier support (for use from actions)
 */
export const checkAndConsumeCreditWithTier = mutation({
  args: {
    userId: v.string(),
    tierOrModel: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; remaining: number; message?: string; cost: number }> => {
    const multiplier = getCreditMultiplier(args.tierOrModel ?? "pro");
    const cost = multiplier === 0 ? 0 : Math.max(0.5, BASE_GENERATION_COST * multiplier);
    
    // If cost is 0 (free tier/model), skip credit check
    if (cost === 0) {
      return { success: true, remaining: 999999, cost: 0 };
    }
    
    return checkAndConsumeCreditInternalWithCost(ctx, args.userId, cost);
  },
});

/**
 * Get current usage stats for a user
 */
export const getUsage = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const isPro = await hasProAccess(ctx);
    const isUnlimited = await hasUnlimitedAccess(ctx);
    const maxPoints = isUnlimited ? UNLIMITED_POINTS : isPro ? PRO_POINTS : FREE_POINTS;

    const usage = await ctx.db
      .query("usage")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    const now = Date.now();

    // If no usage or expired, return max points
    if (!usage || (usage.expire && usage.expire < now)) {
      const expire = now + DURATION_MS;
      return {
        points: maxPoints,
        maxPoints,
        expire,
        planType: isUnlimited ? "unlimited" : isPro ? "pro" : "free",
        // Aliases for compatibility
        remainingPoints: maxPoints,
        creditsRemaining: maxPoints,
        msBeforeNext: DURATION_MS,
      };
    }

    const expire = usage.expire || now + DURATION_MS;
    return {
      points: usage.points,
      maxPoints,
      expire,
      planType: usage.planType || (isUnlimited ? "unlimited" : isPro ? "pro" : "free"),
      // Aliases for compatibility
      remainingPoints: usage.points,
      creditsRemaining: usage.points,
      msBeforeNext: expire - now,
    };
  },
});

/**
 * Admin function to reset usage for a user
 */
export const resetUsage = mutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    // In production, add admin authorization check here
    const usage = await ctx.db
      .query("usage")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    if (usage) {
      await ctx.db.delete(usage._id);
    }
  },
});

/**
 * Internal: Get usage for a specific user (for use from actions/background jobs)
 */
export const getUsageInternal = async (
  ctx: any,
  userId: string
): Promise<{
  points: number;
  maxPoints: number;
  expire: number;
  planType: string;
  remainingPoints: number;
  creditsRemaining: number;
  msBeforeNext: number;
}> => {
  const isPro = await hasProAccess(ctx).catch(() => false);
  const isUnlimited = await hasUnlimitedAccess(ctx).catch(() => false);
  const maxPoints = isUnlimited ? UNLIMITED_POINTS : isPro ? PRO_POINTS : FREE_POINTS;

  const usage = await ctx.db
    .query("usage")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .first();

  const now = Date.now();

  if (!usage || (usage.expire && usage.expire < now)) {
    const expire = now + DURATION_MS;
    return {
      points: maxPoints,
      maxPoints,
      expire,
      planType: isUnlimited ? "unlimited" : isPro ? "pro" : "free",
      remainingPoints: maxPoints,
      creditsRemaining: maxPoints,
      msBeforeNext: DURATION_MS,
    };
  }

  const expire = usage.expire || now + DURATION_MS;
  return {
    points: usage.points,
    maxPoints,
    expire,
    planType: usage.planType || (isUnlimited ? "unlimited" : isPro ? "pro" : "free"),
    remainingPoints: usage.points,
    creditsRemaining: usage.points,
    msBeforeNext: expire - now,
  };
};

/**
 * Wrapper query for getting usage with explicit user ID (for use from actions)
 */
export const getUsageForUser = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    return getUsageInternal(ctx, args.userId);
  },
});

/**
 * Internal: Check and consume credit for a specific user with specific cost
 */
export const checkAndConsumeCreditInternalWithCost = async (
  ctx: any,
  userId: string,
  cost: number
): Promise<{ success: boolean; remaining: number; message?: string; cost: number }> => {
  const isPro = await hasProAccess(ctx).catch(() => false);
  const isUnlimited = await hasUnlimitedAccess(ctx).catch(() => false);
  const maxPoints = isUnlimited ? UNLIMITED_POINTS : isPro ? PRO_POINTS : FREE_POINTS;

  const usage = await ctx.db
    .query("usage")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .first();

  const now = Date.now();
  const expiryTime = now + DURATION_MS;

  if (!usage || (usage.expire && usage.expire < now)) {
    const newPoints = Math.max(0, maxPoints - cost);
    if (usage) {
      await ctx.db.patch(usage._id, {
        points: newPoints,
        expire: expiryTime,
        planType: isUnlimited ? "unlimited" : isPro ? "pro" : "free",
      });
    } else {
      await ctx.db.insert("usage", {
        userId,
        points: newPoints,
        expire: expiryTime,
        planType: isUnlimited ? "unlimited" : isPro ? "pro" : "free",
      });
    }
    return { success: true, remaining: newPoints, cost };
  }

  if (!isUnlimited && usage.points < cost) {
    const timeUntilReset = usage.expire ? Math.ceil((usage.expire - now) / 1000 / 60) : 0;
    return {
      success: false,
      remaining: usage.points,
      cost,
      message: `Insufficient credits. This generation costs ${cost} credits but you only have ${usage.points.toFixed(1)}. Your credits will reset in ${timeUntilReset} minutes.`
    };
  }

  const newPoints = Math.max(0, usage.points - cost);
  await ctx.db.patch(usage._id, {
    points: newPoints,
  });

  return { success: true, remaining: newPoints, cost };
};

/**
 * Legacy: Check and consume credit for a specific user (for backward compatibility)
 */
export const checkAndConsumeCreditInternal = async (
  ctx: any,
  userId: string
): Promise<{ success: boolean; remaining: number; message?: string }> => {
  const result = await checkAndConsumeCreditInternalWithCost(ctx, userId, BASE_GENERATION_COST);
  return {
    success: result.success,
    remaining: result.remaining,
    message: result.message,
  };
};

/**
 * Wrapper mutation for checking and consuming credit with explicit user ID (for use from actions)
 * @deprecated Use checkAndConsumeCreditWithTier instead
 */
export const checkAndConsumeCreditForUser = mutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await checkAndConsumeCreditInternal(ctx, args.userId);
    return result;
  },
});
