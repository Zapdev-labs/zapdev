import { task } from "@trigger.dev/sdk/v3";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getConvexClient } from "./utils";

export const enqueueWebContainerRunTask = task({
  id: "enqueue-webcontainer-run",
  maxDuration: 30,
  run: async (payload: {
    projectId: string;
    value: string;
    model?: string;
    framework?: string;
  }) => {
    const convex = getConvexClient();
    const projectId = payload.projectId as Id<"projects">;

    await convex.query(api.projects.getForSystem, { projectId });

    const runId = await convex.mutation(api.agentRuns.enqueueForSystem, {
      projectId,
      value: payload.value,
      model: payload.model,
      framework: payload.framework,
    });

    return {
      ok: true,
      runId,
      projectId,
    };
  },
});
