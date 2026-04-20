import { buildEnrichedSystemPrompt } from "@/agents/zapdev/context-builder";
import { FALLBACK_PLAN } from "@/agents/zapdev/planner";
import type { AgentPlan, ResearchArtifact } from "@/agents/zapdev/types";

const BASE = "BASE_SYSTEM";

describe("buildEnrichedSystemPrompt", () => {
  it("returns the base prompt unchanged when there is nothing to inject", () => {
    const out = buildEnrichedSystemPrompt({
      basePrompt: BASE,
      plan: FALLBACK_PLAN,
      repoResearch: null,
      exaResearch: null,
    });
    expect(out).toBe(BASE);
  });

  it("injects repo research summary and relevant files", () => {
    const repo: ResearchArtifact = {
      summary: "Next.js 16 project with Convex",
      relevantFiles: [{ name: "next.config.ts", snippet: "turbopack" }],
    };
    const out = buildEnrichedSystemPrompt({
      basePrompt: BASE,
      plan: FALLBACK_PLAN,
      repoResearch: repo,
      exaResearch: null,
    });
    expect(out).toContain("<repo_research>");
    expect(out).toContain("Next.js 16 project with Convex");
    expect(out).toContain("next.config.ts: turbopack");
  });

  it("skips exa research when the sentinel summary says nothing was found", () => {
    const out = buildEnrichedSystemPrompt({
      basePrompt: BASE,
      plan: FALLBACK_PLAN,
      repoResearch: null,
      exaResearch: { summary: "No external research performed.", citations: [] },
    });
    expect(out).not.toContain("<external_research>");
    expect(out).toBe(BASE);
  });

  it("injects exa research citations when present", () => {
    const exa: ResearchArtifact = {
      summary: "React 19 stable usage patterns",
      citations: [{ url: "https://react.dev", title: "React Docs", content: "" }],
    };
    const out = buildEnrichedSystemPrompt({
      basePrompt: BASE,
      plan: FALLBACK_PLAN,
      repoResearch: null,
      exaResearch: exa,
    });
    expect(out).toContain("<external_research>");
    expect(out).toContain("React 19 stable usage patterns");
    expect(out).toContain("[React Docs](https://react.dev)");
  });

  it("injects the implementation plan sections when they have content", () => {
    const plan: AgentPlan = {
      ...FALLBACK_PLAN,
      implementationHints: "Use a server component",
      steps: ["Add route", "Wire form"],
      filesToModify: ["src/app/page.tsx"],
      potentialIssues: ["Avoid double-submits"],
    };
    const out = buildEnrichedSystemPrompt({
      basePrompt: BASE,
      plan,
      repoResearch: null,
      exaResearch: null,
    });
    expect(out).toContain("<implementation_plan>");
    expect(out).toContain("## Approach");
    expect(out).toContain("Use a server component");
    expect(out).toContain("1. Add route");
    expect(out).toContain("2. Wire form");
    expect(out).toContain("- src/app/page.tsx");
    expect(out).toContain("- Avoid double-submits");
  });
});
