import { selectModelForTask, MODEL_CONFIGS } from '../src/agents/types';
import type { Framework } from '../src/agents/types';

describe('Model Selection Logic', () => {
  const defaultModel = 'moonshotai/kimi-k2.5:nitro' as const;

  it('defaults to Kimi K2.5 Nitro when no special indicators exist', () => {
    const prompt = 'Build a marketing page with testimonials.';
    const result = selectModelForTask(prompt);

    expect(result).toBe(defaultModel);
    expect(MODEL_CONFIGS[result]).toBeDefined();
  });

  it('prefers Kimi K2.5 for coding-focused refinements when explicitly requested', () => {
    const prompt = 'Use Kimi to refactor this component to improve readability.';
    const result = selectModelForTask(prompt);

    expect(result).toBe('moonshotai/kimi-k2.5');
  });

  it('defaults to Kimi K2.5 Nitro for speed-focused prompts', () => {
    const prompt = 'Need a quick prototype landing page mockup.';
    const result = selectModelForTask(prompt);

    expect(result).toBe('moonshotai/kimi-k2.5:nitro');
  });

  it('uses Kimi K2.5 Nitro when complexity indicators are present', () => {
    const prompt = 'Need a quick enterprise architecture overview with detailed security notes.';
    const result = selectModelForTask(prompt);

    expect(result).toBe(defaultModel);
  });

  it('defaults to Kimi K2.5 Nitro for very long prompts', () => {
    const prompt = 'refactor '.repeat(100) + 'a'.repeat(1100);
    const result = selectModelForTask(prompt);

    expect(result).toBe(defaultModel);
  });

  it('defaults to Kimi K2.5 Nitro for Angular enterprise work', () => {
    const prompt = 'Design an enterprise dashboard with advanced reporting.';
    const angularFramework: Framework = 'angular';
    const result = selectModelForTask(prompt, angularFramework);

    expect(result).toBe(defaultModel);
  });

  it('moonshot config has correct provider field', () => {
    const moonshotConfig = MODEL_CONFIGS['moonshotai/kimi-k2.5'];
    expect(moonshotConfig).toBeDefined();
    expect(moonshotConfig.provider).toBe('moonshot');
  });
});
