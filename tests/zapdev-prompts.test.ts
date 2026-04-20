import { isUIGenerationRequest } from "@/agents/zapdev/prompts";

describe("zapdev/prompts.isUIGenerationRequest", () => {
  it("detects UI-flavoured prompts", () => {
    expect(isUIGenerationRequest("Build me a landing page")).toBe(true);
    expect(isUIGenerationRequest("Create a dashboard with tailwind")).toBe(true);
    expect(isUIGenerationRequest("Design a sleek login form")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(isUIGenerationRequest("WEBSITE FOR CATS")).toBe(true);
  });

  it("ignores backend-only requests", () => {
    expect(isUIGenerationRequest("Add a cron that rotates API keys")).toBe(false);
    expect(isUIGenerationRequest("Refactor this function")).toBe(false);
  });
});
