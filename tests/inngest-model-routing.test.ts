import { describe, expect, it } from "@jest/globals";

import {
  getToolCallingModelForAgent,
  resolveCodingModelPlan,
} from "../src/inngest/model-routing";

describe("Inngest model routing", () => {
  it("strips :nitro before AgentKit tool calls", () => {
    expect(getToolCallingModelForAgent("moonshotai/kimi-k2.6:nitro")).toBe(
      "moonshotai/kimi-k2.6"
    );
  });

  it("uses a dedicated manager for risky tool-calling defaults", () => {
    const plan = resolveCodingModelPlan(
      "moonshotai/kimi-k2.6:nitro",
      "deepseek/deepseek-v4-pro"
    );

    expect(plan.toolCallingModel).toBe("moonshotai/kimi-k2.6");
    expect(plan.managerModel).toBe("deepseek/deepseek-v4-pro");
    expect(plan.usesDedicatedManager).toBe(true);
    expect(plan.retryModels).toEqual([
      "deepseek/deepseek-v4-pro",
      "moonshotai/kimi-k2.6",
      "anthropic/claude-haiku-4.5",
    ]);
  });

  it("keeps stable tool-capable models as the primary manager", () => {
    const plan = resolveCodingModelPlan(
      "anthropic/claude-sonnet-4.6",
      "deepseek/deepseek-v4-pro"
    );

    expect(plan.toolCallingModel).toBe("anthropic/claude-sonnet-4.6");
    expect(plan.managerModel).toBe("anthropic/claude-sonnet-4.6");
    expect(plan.usesDedicatedManager).toBe(false);
    expect(plan.retryModels[0]).toBe("anthropic/claude-sonnet-4.6");
  });
});

