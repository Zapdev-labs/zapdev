import { appendReviewNotes } from "@/agents/zapdev/orchestrator";
import type { ReviewArtifact } from "@/agents/zapdev/types";

describe("zapdev/orchestrator.appendReviewNotes", () => {
  it("returns the summary untouched when review is null", () => {
    expect(appendReviewNotes("summary", null)).toBe("summary");
  });

  it("returns the summary untouched for good quality reviews", () => {
    const review: ReviewArtifact = {
      issues: ["minor nit"],
      suggestions: [],
      quality: "good",
    };
    expect(appendReviewNotes("summary", review)).toBe("summary");
  });

  it("returns the summary untouched when quality is critical but issues are empty", () => {
    const review: ReviewArtifact = {
      issues: [],
      suggestions: [],
      quality: "critical_issues",
    };
    expect(appendReviewNotes("summary", review)).toBe("summary");
  });

  it("appends bullet-pointed issues when the review flags critical problems", () => {
    const review: ReviewArtifact = {
      issues: ["Missing import for useState", "Broken JSX"],
      suggestions: [],
      quality: "critical_issues",
    };
    const out = appendReviewNotes("done", review);
    expect(out).toContain("**Review Notes:**");
    expect(out).toContain("- Missing import for useState");
    expect(out).toContain("- Broken JSX");
    expect(out.startsWith("done")).toBe(true);
  });
});
