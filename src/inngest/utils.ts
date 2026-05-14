import { AgentResult, Message, TextMessage } from "@inngest/agent-kit";

export function lastAssistantTextMessageContent(result: AgentResult) {
  const lastAssistantTextMessageIndex = result.output.findLastIndex(
    (message) => message.role === "assistant",
  );

  const message = result.output[lastAssistantTextMessageIndex] as
    | TextMessage
    | undefined;

  return message?.content
    ? typeof message.content === "string"
      ? message.content
      : message.content.map((c) => c.text).join("")
    : undefined;
};

export const parseAgentOutput = (value: Message[]) => {
  const output = value[0];

  if (output.type !== "text") {
    return "Fragment";
  }

  if (Array.isArray(output.content)) {
    return output.content.map((txt) => txt).join("")
  } else {
    return output.content
  }
};

// XML Tool Call Parsing for models that output tool calls as XML text
export interface XmlToolCall {
  name: string;
  parameters: Record<string, unknown>;
}

export function parseXmlToolCalls(content: string): XmlToolCall[] {
  const toolCalls: XmlToolCall[] = [];
  
  // Match <tool_call>...</tool_call> blocks
  const toolCallRegex = /<tool_call>[\s\S]*?<\/tool_call>/g;
  const toolCallMatches = content.match(toolCallRegex);
  
  if (!toolCallMatches) return toolCalls;
  
  for (const toolCallBlock of toolCallMatches) {
    // Extract function name: <function=name>
    const functionMatch = toolCallBlock.match(/<function=(\w+)>/);
    if (!functionMatch) continue;
    
    const functionName = functionMatch[1];
    const parameters: Record<string, unknown> = {};
    
    // Extract parameters: <parameter=name>...</parameter>
    const paramRegex = /<parameter=(\w+)>\s*([\s\S]*?)\s*<\/parameter>/g;
    let paramMatch;
    
    while ((paramMatch = paramRegex.exec(toolCallBlock)) !== null) {
      const paramName = paramMatch[1];
      const paramValue = paramMatch[2].trim();
      
      // Try to parse as JSON, otherwise use as string
      try {
        parameters[paramName] = JSON.parse(paramValue);
      } catch {
        parameters[paramName] = paramValue;
      }
    }
    
    toolCalls.push({ name: functionName, parameters });
  }
  
  return toolCalls;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeToolCalls(
  toolCalls: XmlToolCall[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  network: any
): Promise<void> {
  for (const toolCall of toolCalls) {
    console.log(`[TOOL] Executing ${toolCall.name}...`);
    
    try {
      switch (toolCall.name) {
        case "createOrUpdateFiles": {
          const files = toolCall.parameters.files as Array<{ path: string; content: string }>;
          if (files && Array.isArray(files)) {
            const updatedFiles = network?.state?.data?.files || {};
            for (const file of files) {
              updatedFiles[file.path] = file.content;
              console.log(`[TOOL] Written: ${file.path} (${file.content.length} chars)`);
            }
            if (network?.state?.data) {
              network.state.data.files = updatedFiles;
            }
            console.log(`[TOOL] createOrUpdateFiles: saved ${files.length} file(s)`);
          }
          break;
        }
        
        case "terminal": {
          const command = toolCall.parameters.command as string;
          console.log(`[TOOL] terminal: ${command}`);
          // Terminal is simulated, just log it
          break;
        }
        
        case "readFiles": {
          const files = toolCall.parameters.files as string[];
          console.log(`[TOOL] readFiles: ${files?.join(", ") || "none"}`);
          // Files are already in state, no action needed
          break;
        }
        
        default:
          console.warn(`[TOOL] Unknown tool: ${toolCall.name}`);
      }
    } catch (error) {
      console.error(`[TOOL] Error executing ${toolCall.name}:`, error);
    }
  }
}

export interface ExtractedFile {
  path: string;
  content: string;
}

/**
 * Extract files from markdown code blocks in the model's text response.
 * Handles formats like:
 * ```tsx filename.tsx
 * // content
 * ```
 * 
 * Or:
 * ```tsx
 * // filename.tsx
 * // content
 * ```
 */
export function extractFilesFromMarkdown(content: string): ExtractedFile[] {
  const files: ExtractedFile[] = [];
  const seenPaths = new Set<string>();
  
  // Match markdown code fences: ```lang filename\ncontent```
  const codeFenceRegex = /```[ \t]*(\w+)?[ \t]*([^\r\n`]*)\r?\n([\s\S]*?)```/g;
  
  let match;
  while ((match = codeFenceRegex.exec(content)) !== null) {
    const lang = match[1]?.trim().toLowerCase() ?? "";
    const afterLang = match[2]?.trim() ?? "";
    let codeContent = match[3]?.trim() ?? "";
    
    // Skip if it looks like a data block (JSON, etc.)
    if (lang === "json" && !afterLang.includes(".")) continue;
    
    let filePath: string | null = null;
    
    // Pattern 1: filename after language tag: ```tsx app/page.tsx
    if (afterLang && afterLang.includes("/") || afterLang.includes(".")) {
      filePath = afterLang;
    }
    
    // Pattern 2: comment at start of code: // app/page.tsx or /* app/page.tsx */
    if (!filePath) {
      const commentMatch = codeContent.match(/^(?:\/\/\s*([^\r\n]+)|\/\*\s*([^*]+)\*\/)/);
      if (commentMatch) {
        const potentialPath = (commentMatch[1] || commentMatch[2])?.trim() ?? "";
        if (potentialPath.includes("/") || potentialPath.includes(".")) {
          filePath = potentialPath;
          // Remove the comment from the code content
          codeContent = codeContent.replace(commentMatch[0], "").trimStart();
        }
      }
    }
    
    // Pattern 3: look for file path patterns in the first few lines
    if (!filePath) {
      const lines = codeContent.split("\n");
      for (let i = 0; i < Math.min(5, lines.length); i++) {
        const line = lines[i].trim();
        // Match patterns like: app/page.tsx, src/components/Button.tsx, etc.
        const pathMatch = line.match(/^\s*(?:\/\/\s*)?([\w-]+\/[\w/.-]+\.(tsx?|jsx?|vue|svelte|css|scss|html|json|md|ts|js))/);
        if (pathMatch) {
          filePath = pathMatch[1];
          // Remove this line from content
          codeContent = lines.slice(0, i).concat(lines.slice(i + 1)).join("\n").trimStart();
          break;
        }
      }
    }
    
    if (filePath && codeContent) {
      // Normalize path
      filePath = filePath.replace(/^["']|["']$/g, "").trim();
      
      // Skip if we've seen this path
      if (seenPaths.has(filePath)) continue;
      seenPaths.add(filePath);
      
      files.push({ path: filePath, content: codeContent });
      console.log(`[MARKDOWN_EXTRACT] Found file: ${filePath} (${codeContent.length} chars)`);
    }
  }
  
  return files;
}
