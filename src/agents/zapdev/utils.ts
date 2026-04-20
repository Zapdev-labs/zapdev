const MARKDOWN_CODE_FENCE_REGEX = /```[ \t]*([^\r\n`]*)\r?\n([\s\S]*?)```/g;

export function extractJSONFromMarkdown(text: string): string {
  const matches = Array.from(text.matchAll(MARKDOWN_CODE_FENCE_REGEX)).map(
    (m) => ({
      language: m[1]?.trim().toLowerCase() ?? "",
      content: m[2]?.trim() ?? "",
    })
  );

  for (const { content } of matches) {
    if (content && (content.startsWith("{") || content.startsWith("["))) {
      return content;
    }
  }

  return matches[0]?.content ?? text.trim();
}

export function safeParseAIJSON<T>(text: string): T | null {
  const cleaned = extractJSONFromMarkdown(text);
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

export function truncate(value: string, maxLength = 20_000): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n...[truncated]`;
}
