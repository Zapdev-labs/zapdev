export { openrouter, getModel } from "./client";
export {
  type Framework,
  type AgentState,
  type AgentRunInput,
  type AgentRunResult,
  type ModelId,
  MODEL_CONFIGS,
  selectModelForTask,
  frameworkToConvexEnum,
} from "./types";
export { type ToolContext } from "./tools";
export { type StreamEvent } from "./code-agent";

export {
  runSchemaProposalAgent,
  parseSchemaProposal,
  type SchemaProposalResult,
} from "./schema-proposal-agent";

export {
  runBackendImplementerAgent,
  type BackendAgentResult,
} from "./backend-agent";

export { wantsConvexBackend } from "./wants-backend";
