import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  enqueueWebContainerRunFunction,
  runCodeAgentKitFunction,
  runFigmaImportFunction,
  runFixErrorsFunction,
} from "@/inngest/functions";

// Force Node.js runtime - Inngest requires Node.js APIs
export const runtime = "nodejs";

// Prevent caching of this route (critical for Cloudflare+Vercel)
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    runCodeAgentKitFunction,
    runFixErrorsFunction,
    runFigmaImportFunction,
    enqueueWebContainerRunFunction,
  ],
});
import { inngest } from "@/inngest/client";
import {
  enqueueWebContainerRunFunction,
  runCodeAgentKitFunction,
  runFigmaImportFunction,
  runFixErrorsFunction,
} from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    runCodeAgentKitFunction,
    runFixErrorsFunction,
    runFigmaImportFunction,
    enqueueWebContainerRunFunction,
  ],
});
