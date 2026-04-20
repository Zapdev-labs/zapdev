import {
  extractJSONFromMarkdown,
  safeParseAIJSON,
  truncate,
} from "@/agents/zapdev/utils";

describe("zapdev/utils", () => {
  describe("extractJSONFromMarkdown", () => {
    it("extracts JSON from a json code fence", () => {
      const input = 'prelude\n```json\n{"complexity":"simple"}\n```\ntrailing';
      expect(extractJSONFromMarkdown(input)).toBe('{"complexity":"simple"}');
    });

    it("extracts JSON from an unlabeled code fence", () => {
      const input = '```\n{"foo":1}\n```';
      expect(extractJSONFromMarkdown(input)).toBe('{"foo":1}');
    });

    it("prefers an object fence over a plain text fence", () => {
      const input = '```\nlook at this\n```\n```json\n{"ok":true}\n```';
      expect(extractJSONFromMarkdown(input)).toBe('{"ok":true}');
    });

    it("falls back to the full string when no fence is present", () => {
      expect(extractJSONFromMarkdown("  plain text  ")).toBe("plain text");
    });
  });

  describe("safeParseAIJSON", () => {
    it("parses object responses", () => {
      const parsed = safeParseAIJSON<{ ok: boolean }>('```json\n{"ok":true}\n```');
      expect(parsed).toEqual({ ok: true });
    });

    it("returns null for invalid JSON instead of throwing", () => {
      expect(safeParseAIJSON("not json at all")).toBeNull();
    });

    it("returns null for an empty string", () => {
      expect(safeParseAIJSON("")).toBeNull();
    });
  });

  describe("truncate", () => {
    it("returns the input unchanged when under the limit", () => {
      expect(truncate("hello", 100)).toBe("hello");
    });

    it("appends a truncation marker when over the limit", () => {
      const result = truncate("abcdefghij", 5);
      expect(result.startsWith("abcde")).toBe(true);
      expect(result.endsWith("...[truncated]")).toBe(true);
    });
  });
});
