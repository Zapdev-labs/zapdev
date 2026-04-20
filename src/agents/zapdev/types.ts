/** Map from file path to file contents. */
export type FileMap = Record<string, string>;

export interface RelevantFile {
  name: string;
  snippet: string;
}

export interface Citation {
  url: string;
  title: string;
  content: string;
}

export interface AgentPlan {
  needsResearch: boolean;
  searchQueries: string[];
  focusAreas: string[];
  implementationHints: string;
  steps: string[];
  potentialIssues: string[];
  filesToModify: string[];
  complexity: "simple" | "moderate" | "complex";
}

export interface ResearchArtifact {
  summary: string;
  relevantFiles?: RelevantFile[];
  citations?: Citation[];
}

export interface ReviewArtifact {
  issues: string[];
  suggestions: string[];
  quality: "good" | "needs_improvement" | "critical_issues";
}

export interface WorkerInput {
  userMessage: string;
  userId?: string;
  projectId?: string;
}

export interface RepoResearchInput extends WorkerInput {
  focusAreas: string[];
}

export interface ExaResearchInput extends WorkerInput {
  searchQueries: string[];
}

export interface ReviewInput extends WorkerInput {
  implementationSummary: string;
  files: FileMap;
}
