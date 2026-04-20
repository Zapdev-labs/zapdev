import { jest } from "@jest/globals";

const mockGenerateText = jest.fn();

jest.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

jest.mock("@/agents/client", () => ({
  openrouter: (modelId: string) => ({ modelId }),
}));

import { runPlanner, runEnhancer, FALLBACK_PLAN } from "@/agents/zapdev/planner";

describe("zapdev/planner", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  describe("runPlanner", () => {
    it("parses a well-formed JSON plan", async () => {
      mockGenerateText.mockResolvedValueOnce({
        text: '```json\n{"needsResearch":true,"searchQueries":["a"],"focusAreas":["b"],"implementationHints":"do it","steps":["s1"],"potentialIssues":[],"filesToModify":[],"complexity":"moderate"}\n```',
      });

      const plan = await runPlanner("build a thing");

      expect(plan.complexity).toBe("moderate");
      expect(plan.needsResearch).toBe(true);
      expect(plan.searchQueries).toEqual(["a"]);
      expect(plan.steps).toEqual(["s1"]);
    });

    it("falls back to FALLBACK_PLAN when the model returns non-JSON", async () => {
      mockGenerateText.mockResolvedValueOnce({ text: "totally not json" });
      const plan = await runPlanner("prompt");

      expect(plan.complexity).toBe(FALLBACK_PLAN.complexity);
      expect(plan.implementationHints).toBe("totally not json");
    });

    it("returns FALLBACK_PLAN if generateText throws", async () => {
      mockGenerateText.mockRejectedValueOnce(new Error("boom"));
      const plan = await runPlanner("prompt");
      expect(plan).toEqual(FALLBACK_PLAN);
    });

    it("backfills missing array fields on partial plans", async () => {
      mockGenerateText.mockResolvedValueOnce({
        text: '{"complexity":"simple","needsResearch":false,"implementationHints":"x"}',
      });
      const plan = await runPlanner("prompt");
      expect(plan.searchQueries).toEqual([]);
      expect(plan.steps).toEqual([]);
      expect(plan.potentialIssues).toEqual([]);
      expect(plan.filesToModify).toEqual([]);
    });
  });

  describe("runEnhancer", () => {
    it("returns null for non-UI prompts without calling the model", async () => {
      const result = await runEnhancer("refactor this function");
      expect(result).toBeNull();
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it("returns the trimmed enhanced text for UI prompts", async () => {
      mockGenerateText.mockResolvedValueOnce({ text: "  enhanced brief  " });
      const result = await runEnhancer("build a landing page");
      expect(result).toBe("enhanced brief");
    });

    it("returns null when the model returns only whitespace", async () => {
      mockGenerateText.mockResolvedValueOnce({ text: "   " });
      const result = await runEnhancer("build a landing page");
      expect(result).toBeNull();
    });
  });
});
