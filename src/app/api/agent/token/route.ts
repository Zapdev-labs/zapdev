import { getUser } from "@/lib/auth-server";
import { getSubscriptionToken } from "@inngest/realtime";
import { inngest } from "@/inngest/client";

export async function POST() {
  try {
    const user = await getUser();
    
    if (!user) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if Inngest realtime is properly configured
    const hasSigningKey = !!process.env.INNGEST_SIGNING_KEY;
    
    if (!hasSigningKey) {
      return Response.json(
        { 
          error: "Inngest realtime not configured",
          code: "INNGEST_REALTIME_NOT_CONFIGURED",
          suggestions: [
            "Set INNGEST_SIGNING_KEY environment variable",
            "Get your signing key from https://app.inngest.com",
            "Add INNGEST_EVENT_KEY for event sending",
            "Or use the standard agent run without realtime streaming",
          ],
          fallbackAvailable: true,
        },
        { status: 503 }
      );
    }

    const token = await getSubscriptionToken(inngest, {
      channel: `user:${user.id}`,
      topics: ["agent_stream"],
    });

    return Response.json({ token });
  } catch (error) {
    console.error("[ERROR] Failed to generate realtime token:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Provide specific error guidance based on error type
    if (errorMessage.includes("signing key") || errorMessage.includes("INNGEST_SIGNING_KEY")) {
      return Response.json(
        { 
          error: "Inngest signing key is missing or invalid",
          code: "INNGEST_SIGNING_KEY_ERROR",
          suggestions: [
            "Check that INNGEST_SIGNING_KEY is set in your environment",
            "Get your signing key from Inngest Cloud dashboard",
            "Make sure you're using the correct signing key for your environment",
          ],
          fallbackAvailable: true,
        },
        { status: 500 }
      );
    }
    
    return Response.json(
      { 
        error: "Failed to generate token",
        details: errorMessage,
        fallbackAvailable: true,
      },
      { status: 500 }
    );
  }
}
