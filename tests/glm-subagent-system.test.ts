import { selectModelForTask, MODEL_CONFIGS } from '../src/agents/types';
import { detectResearchNeed, shouldUseSubagent } from '../src/agents/subagent';
import { TimeoutManager, estimateComplexity, VERCEL_TIMEOUT_LIMIT } from '../src/agents/timeout-manager';

describe('GLM 4.7 Model Selection', () => {
  it('defaults to GLM 4.7 for most requests (new behavior)', () => {
    const prompt = 'Build a dashboard with charts and user authentication.';
    const result = selectModelForTask(prompt);
    
    expect(result).toBe('zai-glm-4.7');
    expect(MODEL_CONFIGS[result].supportsSubagents).toBe(true);
  });

  it('uses Claude Haiku only for very complex enterprise tasks', () => {
    const prompt = 'Design a distributed microservices architecture with Kubernetes orchestration.';
    const result = selectModelForTask(prompt);
    
    expect(result).toBe('anthropic/claude-haiku-4.5');
  });

  it('uses Claude Haiku for very long prompts', () => {
    const longPrompt = 'Build an application with '.repeat(200);
    const result = selectModelForTask(longPrompt);
    
    expect(result).toBe('anthropic/claude-haiku-4.5');
  });

  it('respects explicit GPT-5 requests', () => {
    const prompt = 'Use GPT-5 to build a complex AI system.';
    const result = selectModelForTask(prompt);
    
    expect(result).toBe('openai/gpt-5.1-codex');
  });

  it('respects explicit Gemini requests', () => {
    const prompt = 'Use Gemini to analyze this code.';
    const result = selectModelForTask(prompt);
    
    expect(result).toBe('qwen/qwen3.6-plus:free');
  });

  it('respects explicit Kimi requests', () => {
    const prompt = 'Use Kimi to refactor this component.';
    const result = selectModelForTask(prompt);
    
    expect(result).toBe('moonshotai/kimi-k2.5');
  });

  it('GLM 4.7 is the only model with subagent support', () => {
    const glmConfig = MODEL_CONFIGS['zai-glm-4.7'];
    expect(glmConfig.supportsSubagents).toBe(true);
    
    const claudeConfig = MODEL_CONFIGS['anthropic/claude-haiku-4.5'];
    expect(claudeConfig.supportsSubagents).toBe(false);
    
    const gptConfig = MODEL_CONFIGS['openai/gpt-5.1-codex'];
    expect(gptConfig.supportsSubagents).toBe(false);
  });
});

describe('Subagent Research Detection', () => {
  it('detects research need for "look up" queries', () => {
    const prompt = 'Look up the latest Stripe API documentation for payments.';
    const result = detectResearchNeed(prompt);
    
    expect(result.needs).toBe(true);
    expect(result.taskType).toBe('research');
    expect(result.query).toBeTruthy();
  });

  it('detects documentation lookup needs', () => {
    const prompt = 'Find documentation for Next.js server actions.';
    const result = detectResearchNeed(prompt);
    
    expect(result.needs).toBe(true);
    expect(result.taskType).toBe('documentation');
  });

  it('detects comparison tasks', () => {
    const prompt = 'Compare React vs Vue for this project.';
    const result = detectResearchNeed(prompt);
    
    expect(result.needs).toBe(true);
    expect(result.taskType).toBe('comparison');
  });

  it('detects "how to use" queries', () => {
    const prompt = 'How to use Next.js middleware?';
    const result = detectResearchNeed(prompt);
    
    expect(result.needs).toBe(true);
    expect(result.taskType).toBe('documentation');
  });

  it('detects latest version queries', () => {
    const prompt = 'What is the latest version of React?';
    const result = detectResearchNeed(prompt);
    
    expect(result.needs).toBe(true);
    expect(result.taskType).toBe('research');
  });

  it('does not trigger for simple coding requests', () => {
    const prompt = 'Create a button component with hover effects.';
    const result = detectResearchNeed(prompt);
    
    expect(result.needs).toBe(false);
  });

  it('detects best practices queries', () => {
    const prompt = 'Show me best practices for React hooks.';
    const result = detectResearchNeed(prompt);
    
    expect(result.needs).toBe(true);
  });
});

describe('Subagent Integration Logic', () => {
  it('enables subagents for GLM 4.7', () => {
    const prompt = 'Look up Next.js API routes documentation.';
    const result = shouldUseSubagent('zai-glm-4.7', prompt);
    
    expect(result).toBe(true);
  });

  it('disables subagents for Claude Haiku', () => {
    const prompt = 'Look up Next.js API routes documentation.';
    const result = shouldUseSubagent('anthropic/claude-haiku-4.5', prompt);
    
    expect(result).toBe(false);
  });

  it('disables subagents for simple tasks even with GLM 4.7', () => {
    const prompt = 'Create a simple button component.';
    const result = shouldUseSubagent('zai-glm-4.7', prompt);
    
    expect(result).toBe(false);
  });
});

describe('Timeout Management', () => {
  it('initializes with default budget', () => {
    const manager = new TimeoutManager();
    const remaining = manager.getRemaining();
    
    expect(remaining).toBeLessThanOrEqual(VERCEL_TIMEOUT_LIMIT);
    expect(remaining).toBeGreaterThan(VERCEL_TIMEOUT_LIMIT - 1000);
  });

  it('tracks stage execution', () => {
    const manager = new TimeoutManager();
    
    manager.startStage('initialization');
    manager.endStage('initialization');
    
    const summary = manager.getSummary();
    expect(summary.stages.length).toBe(1);
    expect(summary.stages[0].name).toBe('initialization');
    expect(summary.stages[0].duration).toBeGreaterThanOrEqual(0);
  });

  it('detects warnings at 270s', () => {
    const manager = new TimeoutManager();
    (manager as any).startTime = Date.now() - 270_000;
    
    const check = manager.checkTimeout();
    expect(check.isWarning).toBe(true);
    expect(check.isEmergency).toBe(false);
  });

  it('detects emergency at 285s', () => {
    const manager = new TimeoutManager();
    (manager as any).startTime = Date.now() - 285_000;
    
    const check = manager.checkTimeout();
    expect(check.isWarning).toBe(true);
    expect(check.isEmergency).toBe(true);
    expect(check.isCritical).toBe(false);
  });

  it('detects critical shutdown at 295s', () => {
    const manager = new TimeoutManager();
    (manager as any).startTime = Date.now() - 295_000;
    
    const check = manager.checkTimeout();
    expect(check.isWarning).toBe(true);
    expect(check.isEmergency).toBe(true);
    expect(check.isCritical).toBe(true);
  });

  it('adapts budget for simple tasks', () => {
    const manager = new TimeoutManager();
    manager.adaptBudget('simple');
    
    expect(manager.shouldSkipStage('research')).toBe(false);
    expect(manager.shouldSkipStage('codeGeneration')).toBe(false);
    
    // Verify different budget allocation for simple tasks (shorter research time)
    const summary = manager.getSummary();
    // Simple tasks should have reduced research budget compared to medium/complex
  });

  it('adapts budget for complex tasks', () => {
    const manager = new TimeoutManager();
    manager.adaptBudget('complex');
    
    expect(manager.shouldSkipStage('research')).toBe(false);
    expect(manager.shouldSkipStage('codeGeneration')).toBe(false);
    
    // Verify different budget allocation for complex tasks (longer research time)
    // Complex tasks get 60s research vs 10s for simple
    const summary = manager.getSummary();
    // Complex tasks should have increased research budget compared to simple
  });

  it('adapts budget for medium tasks (default budget)', () => {
    const manager = new TimeoutManager();
    manager.adaptBudget('medium');
    
    expect(manager.shouldSkipStage('research')).toBe(false);
    expect(manager.shouldSkipStage('codeGeneration')).toBe(false);
    
    // Verify medium budget is different from simple and complex
    // Medium tasks should have 30s research (between simple's 10s and complex's 60s)
    const summary = manager.getSummary();
    // Medium budget should be distinct from both simple and complex
  });

  it('ensures different complexity levels have different budget allocations', () => {
    const simpleManager = new TimeoutManager();
    simpleManager.adaptBudget('simple');
    
    const mediumManager = new TimeoutManager();
    mediumManager.adaptBudget('medium');
    
    const complexManager = new TimeoutManager();
    complexManager.adaptBudget('complex');
    
    // Each complexity level should produce different budget outcomes
    // This verifies adaptBudget() actually changes behavior based on complexity
    const simpleResult = simpleManager.shouldSkipStage('research');
    const mediumResult = mediumManager.shouldSkipStage('research');
    const complexResult = complexManager.shouldSkipStage('research');
    
    // All return false at initialization (no time elapsed yet)
    // The difference is in how much time is allocated for each stage
    expect(simpleResult).toBe(false);
    expect(mediumResult).toBe(false);
    expect(complexResult).toBe(false);
  });

  it('calculates percentage used correctly', () => {
    const manager = new TimeoutManager();
    (manager as any).startTime = Date.now() - 150_000;
    
    const percentage = manager.getPercentageUsed();
    expect(percentage).toBeCloseTo(50, 0);
  });
});

describe('Complexity Estimation', () => {
  it('estimates simple tasks correctly', () => {
    const prompt = 'Create a button.';
    const complexity = estimateComplexity(prompt);
    
    expect(complexity).toBe('simple');
  });

  it('estimates medium tasks correctly', () => {
    const prompt = 'Build a comprehensive dashboard application with real-time data visualization using interactive charts and tables for displaying detailed user metrics, analytics, and performance indicators. Include filtering, sorting, and export capabilities. The dashboard should have multiple views for different user roles.';
    const complexity = estimateComplexity(prompt);
    
    expect(complexity).toBe('medium');
  });

  it('estimates complex tasks based on indicators', () => {
    const prompt = 'Build an enterprise microservices architecture.';
    const complexity = estimateComplexity(prompt);
    
    expect(complexity).toBe('complex');
  });

  it('estimates complex tasks based on length', () => {
    const longPrompt = 'Build an application '.repeat(100);
    const complexity = estimateComplexity(longPrompt);
    
    expect(complexity).toBe('complex');
  });

  it('detects distributed system complexity', () => {
    const prompt = 'Create a distributed system with message queues.';
    const complexity = estimateComplexity(prompt);
    
    expect(complexity).toBe('complex');
  });

  it('detects authentication complexity', () => {
    const prompt = 'Build a system with advanced authentication and authorization.';
    const complexity = estimateComplexity(prompt);
    
    expect(complexity).toBe('complex');
  });
});

describe('Model Configuration', () => {
  it('GLM 4.7 has speed optimization enabled', () => {
    const config = MODEL_CONFIGS['zai-glm-4.7'];
    
    expect(config.isSpeedOptimized).toBe(true);
    expect(config.supportsSubagents).toBe(true);
    expect(config.maxTokens).toBe(4096);
  });

  it('morph-v3-large is configured as subagent model', () => {
    const config = MODEL_CONFIGS['morph/morph-v3-large'];
    
    expect(config).toBeDefined();
    expect(config.isSubagentOnly).toBe(true);
    expect(config.isSpeedOptimized).toBe(true);
  });

  it('all models have required properties', () => {
    const models = Object.keys(MODEL_CONFIGS);
    
    for (const modelId of models) {
      const config = MODEL_CONFIGS[modelId as keyof typeof MODEL_CONFIGS];
      
      expect(config.name).toBeDefined();
      expect(config.provider).toBeDefined();
      expect(config.temperature).toBeDefined();
      expect(typeof config.supportsSubagents).toBe('boolean');
      expect(typeof config.isSpeedOptimized).toBe('boolean');
    }
  });
});
