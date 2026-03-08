import { EventSchemas, Inngest } from "inngest";
import { realtimeMiddleware } from "@inngest/realtime/middleware";

type CodeAgentRunEvent = {
  data: {
    projectId: string;
    value: string;
    model?: string;
  };
};

type AgentKitRunEvent = {
  data: {
    projectId: string;
    value: string;
    model?: string;
    framework?: "nextjs" | "angular" | "react" | "vue" | "svelte";
  };
};

type WebContainerRunEvent = {
  data: {
    projectId: string;
    value: string;
    model?: string;
    framework?: "nextjs" | "angular" | "react" | "vue" | "svelte";
  };
};

type FixErrorsRunEvent = {
  data: {
    fragmentId: string;
  };
};

type FigmaImportRunEvent = {
  data: {
    projectId: string;
    importId: string;
    fileKey?: string;
    accessToken?: string;
    figmaUrl?: string;
    fileBase64?: string;
    fileName?: string;
  };
};

// Build middleware array conditionally
// Realtime middleware requires INNGEST_SIGNING_KEY to be set
// If not configured, we skip it to avoid initialization errors
const middleware = [];
try {
  // Only add realtime middleware if we have the required environment
  if (process.env.INNGEST_SIGNING_KEY || process.env.NODE_ENV === "development") {
    middleware.push(realtimeMiddleware());
  }
} catch (error) {
  console.warn("[Inngest] Realtime middleware not available:", error instanceof Error ? error.message : "Unknown error");
}

export const inngest = new Inngest({
  id: "zapdev",
  middleware,
  schemas: new EventSchemas().fromRecord<{
    "agent/code.run": CodeAgentRunEvent;
    "agent/code-agent-kit.run": AgentKitRunEvent;
    "agent/code-webcontainer.run": WebContainerRunEvent;
    "agent/fix-errors.run": FixErrorsRunEvent;
    "agent/figma-import.run": FigmaImportRunEvent;
  }>(),
});
