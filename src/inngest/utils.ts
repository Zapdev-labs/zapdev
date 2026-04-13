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
