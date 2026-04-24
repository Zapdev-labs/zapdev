# ZapDev - AI-Powered Code Generation Platform

**Generated**: 2026-01-04  
**Tech**: Next.js 15 (App Router), React 19, Convex, tRPC, Tailwind v4, Bun

## STRUCTURE

```
./
├── src/
│   ├── app/              # Next.js 15 App Router (pages, layouts, API routes)
│   ├── modules/          # Feature-based: home, projects, messages, usage
│   │   └── [feature]/
│   │       ├── ui/       # React components for this feature
│   │       └── server/   # tRPC procedures for this feature
│   ├── agents/           # AI agent orchestration (primary SSE path)
│   ├── inngest/          # Inngest + Agent Kit background workflows
│   ├── prompts/          # Framework-specific LLM system prompts
│   ├── components/ui/    # Shadcn/ui (copy/paste components, not npm package)
│   ├── lib/              # Utilities, framework config, Convex client
│   └── trpc/             # Type-safe API (routers/, client.ts, server.ts)
├── convex/               # Real-time database (schema, queries, mutations, actions)
├── sandbox-templates/    # E2B sandbox configs (nextjs template with compile_page.sh)
└── tests/                # Jest suite with centralized mocks
```

## ESSENTIAL COMMANDS

```bash
# ALWAYS use bun (never npm/pnpm/yarn)
bun install              # Install dependencies
bun run dev              # Next.js dev server (Turbopack, port 3000)
bun run convex:dev       # Convex backend (separate terminal, REQUIRED)
bun run build            # Production build with Turbopack
bun run lint             # ESLint (flat config)
bun run test             # Jest (Node environment, tests/ directory)

# Database
bun run convex:deploy    # Deploy Convex to production
```

## CONVENTIONS

**Package Management**: Bun exclusively. Both `bun.lock` and `pnpm-lock.yaml` exist (debt) — ignore pnpm.

**TypeScript**: Strict mode, `@typescript-eslint/no-explicit-any` = warn (not error).  
**Path Aliases**: `@/*` → `src/*`, `@/convex/*` → `convex/*`

**Framework**: Next.js 15 App Router ONLY. No pages router (except `src/pages/404.tsx` as fallback).

**Styling**: Tailwind CSS v4 (no separate config file, uses CSS-based config). Shadcn/ui components live in `src/components/ui/` as copy/paste source, NOT imported from npm.

**Auth**: Clerk with JWT. In Convex functions: `const userId = await requireAuth(ctx)` from `convex/helpers.ts`.

## ANTI-PATTERNS (HIGH SIGNAL)

- **NEVER** use `npm` or `pnpm` — Bun only
- **NEVER** use `.filter()` in Convex queries — use `.withIndex()` to avoid O(N) scans
- **NEVER** expose Clerk user IDs in public APIs
- **NEVER** add stray documentation `.md` files unless the user asks — keep `README.md`, `AGENTS.md`, and `CLAUDE.md` as the main references
- **NEVER** use absolute paths in AI-generated code (e.g., `/home/user/...`)
- **NEVER** load Tailwind as external stylesheet (use compiled CSS)
- **NEVER** use `as` or `any` to suppress TypeScript errors (warns allowed, errors not)
- **NEVER** run `bun convex:dev` without user permission (ask first)

## ARCHITECTURE NOTES

**Dual Agent Execution**:
- **Primary**: Custom SSE agents in `src/agents/` (streaming, real-time)
- **Background**: Inngest + Agent Kit in `src/inngest/` (batch processing)

**Feature-Based Modules**: Each module (`src/modules/[name]/`) has parallel structure:
- `ui/` — React components, hooks, client logic
- `server/` — tRPC procedures, server utilities

**Testing**: Jest with Node environment (not DOM). Centralized mocks in `tests/mocks/` for:
- `@/convex/_generated/api` and `/dataModel`
- `@inngest/agent-kit`, `@e2b/code-interpreter`, `convex/browser`

**E2B Sandboxes**: 
- Template at `sandbox-templates/nextjs/` with `compile_page.sh`
- Pre-warmed: starts Next.js dev server inside sandbox, pings until ready
- Template name configured in `src/inngest/functions.ts`

**Database**: Convex (Prisma/PostgreSQL fully migrated away).  
**Query Pattern**: Use indexes — `ctx.db.query("table").withIndex("indexName", q => q.eq("field", value))`

## FILE PATTERNS

| Task | Location |
|------|----------|
| Database schema | `convex/schema.ts` |
| Auth helper | `convex/helpers.ts` (requireAuth) |
| tRPC root router | `src/trpc/routers/_app.ts` |
| Main code agent | `src/agents/code-agent.ts` |
| Framework prompts | `src/prompts/framework-selector.ts` |
| Usage/credits | `convex/usage.ts` (24hr rolling window) |
| Webhooks | `convex/http.ts` (Polar, Clerk) |

## IMPORTANT CONSTRAINTS

- **Lockfiles**: Both `bun.lock` and `pnpm-lock.yaml` exist — Bun is source of truth
- **Convex migrations**: Use `bun run migrate:convex` for data migrations (rarely needed)
- **Credit system**: Free tier (5/day), Pro (100/day), tracked in `usage.ts`
- **Agent retries**: Auto-fix on build/lint failures up to 2 times
- **Security**: Zod validation on all inputs, OAuth tokens encrypted in Convex
