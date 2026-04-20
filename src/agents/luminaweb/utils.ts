const MARKDOWN_JSON_REGEX = /```(?:json)?\s*([\s\S]*?)```/g;

export function extractJSONFromMarkdown(text: string): string {
  const matches = Array.from(text.matchAll(MARKDOWN_JSON_REGEX));

  for (const match of matches) {
    const content = match[1]?.trim();
    if (content && (content.startsWith("{") || content.startsWith("["))) {
      return content;
    }
  }

  if (matches.length > 0) {
    return matches[0][1]?.trim() ?? text.trim();
  }

  return text.trim();
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
