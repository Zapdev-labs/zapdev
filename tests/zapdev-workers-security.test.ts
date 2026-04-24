import { jest } from "@jest/globals";

const mockGenerateText = jest.fn();

jest.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

jest.mock("@/agents/client", () => ({
  openrouter: (modelId: string) => ({ modelId }),
}));

import { runRepoResearch } from "@/agents/zapdev/workers/repo-research";
import { runReview } from "@/agents/zapdev/workers/review";

describe("zapdev worker security filters", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("excludes hidden directories and key files from repo research prompts", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: '{"summary":"ok","relevantFiles":[]}',
    });

    await runRepoResearch({
      userMessage: "inspect files",
      focusAreas: [],
      projectFiles: {
        "src/app/page.tsx": "safe content",
        ".ssh/id_rsa": "private key",
        "src/.config/token.json": "secret token",
        "certs/prod.pem": "certificate",
      },
    });

    const prompt = mockGenerateText.mock.calls[0]?.[0]?.prompt as string;
    expect(prompt).toContain("src/app/page.tsx");
    expect(prompt).toContain("safe content");
    expect(prompt).not.toContain("private key");
    expect(prompt).not.toContain("secret token");
    expect(prompt).not.toContain("certificate");
  });

  it("excludes sensitive paths and normalizes review quality", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: '{"quality":"critical","issues":"bad","suggestions":[]}',
    });

    const review = await runReview({
      userMessage: "review it",
      implementationSummary: "summary",
      files: {
        "src/app/page.tsx": "safe content",
        ".ssh/id_rsa": "private key",
        "secrets/prod.key": "secret key",
      },
    });

    const prompt = mockGenerateText.mock.calls[0]?.[0]?.prompt as string;
    expect(prompt).toContain("safe content");
    expect(prompt).not.toContain("private key");
    expect(prompt).not.toContain("secret key");
    expect(review.quality).toBe("needs_improvement");
    expect(review.issues).toEqual(["bad"]);
  });
});
