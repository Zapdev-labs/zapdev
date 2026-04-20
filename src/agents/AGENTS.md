# AI Agents Orchestration

**Generated**: 2026-04-20
**Parent**: [AGENTS.md](../AGENTS.md)

## OVERVIEW

Zapdev agent orchestration for code generation, executed through
Inngest. The pipeline is **enhance → plan → (repo+exa research) → code → review**.
Execution happens inside E2B sandboxes.

## WHERE TO LOOK

| Path | Role |
|------|------|
| `zapdev/orchestrator.ts` | **Preflight + post-review.** Composes the whole pipeline. |
| `zapdev/planner.ts` | **Plan + enhancer.** JSON plan (kimi-k2.5:nitro) + UI prompt enhancer. |
| `zapdev/workers/repo-research.ts` | **Codebase research.** Summarises project files (grok-4.1-fast). |
| `zapdev/workers/exa-research.ts` | **External research.** Exa searches + synthesis (grok-4.1-fast). |
| `zapdev/workers/review.ts` | **Post-impl review.** Flags issues on generated files (claude-haiku-4.5). |
| `zapdev/context-builder.ts` | **Prompt layering.** Injects plan + research into the system prompt. |
| `zapdev/prompts.ts` | **Prompt templates** for planner/research/review/enhance. |
| `zapdev/utils.ts` | **JSON extraction** helpers shared across workers. |
| `client.ts` | **LLM Client.** OpenRouter (+ Cerebras/Fireworks) configuration. |
| `sandbox-utils.ts` | **E2B Bridge.** Sandbox lifecycle, batch file writes, dev server ping. |
| `types.ts` | **Configuration.** Framework mappings, model tiers, user-facing model IDs. |
| `timeout-manager.ts` | **Budgets.** Per-complexity timeout helpers. |
| `../inngest/functions.ts` | **Wiring.** The `code-agent` Inngest function calls `runPreflight` / `runPostReview`. |

## CONVENTIONS

- **Pipeline order**: Planner decides `needsResearch` + `complexity`. Research
  only fires when `needsResearch=true`. Review only fires when
  `complexity !== "simple"`.
- **Plan schema**: Workers consume the `AgentPlan` shape from
  `zapdev/types.ts`. When a worker returns JSON, it must match the
  artifact type in the same file.
- **Prompt enrichment**: Always produce the final system prompt through
  `buildEnrichedSystemPrompt`. Never concatenate plan / research manually.
- **Sandbox safety**: All file writes go through the E2B sandbox via
  `sandbox-utils`. Never touch the local filesystem from an agent.

## ANTI-PATTERNS

- **NEVER** call a worker directly from a UI route — they belong to the
  Inngest function or downstream server actions.
- **NEVER** nest `network.run()` inside `step.run()`; AgentKit calls
  `step.*` internally and you'll trigger NESTING_STEPS.
- **NEVER** add a new subagent without giving it an entry in `prompts.ts`
  and a plain artifact type in `types.ts` — parsing is the contract.
- **NEVER** reintroduce the deprecated `code-agent.ts` / `subagent.ts` /
  `brave-tools.ts` modules; they were removed with the zapdev port.
