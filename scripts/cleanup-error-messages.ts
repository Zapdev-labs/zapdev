/**
 * Clean up old ERROR messages that contain debug details
 * 
 * Usage:
 *   bun run scripts/cleanup-error-messages.ts
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!CONVEX_URL) {
  console.error("Error: NEXT_PUBLIC_CONVEX_URL environment variable is not set");
  process.exit(1);
}

const convex = new ConvexHttpClient(CONVEX_URL);

async function cleanup() {
  console.log("Starting cleanup of old error messages...");
  
  try {
    const updatedCount = await convex.mutation(api.messages.cleanupOldErrorMessages, {});
    console.log(`✅ Cleanup complete! Updated ${updatedCount} messages.`);
  } catch (error) {
    console.error("❌ Cleanup failed:", error);
    process.exit(1);
  }
}

cleanup();
