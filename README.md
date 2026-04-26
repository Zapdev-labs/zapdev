# ZapDev

ZapDev is an AI-powered app builder for generating and iterating on web projects with live sandboxes, streaming agents, and persistent project state.

## What It Does

- Generates app code from natural language prompts
- Streams agent progress in real time
- Runs generated projects inside isolated E2B sandboxes
- Persists projects, messages, usage, and billing state in Convex
- Supports background execution through Inngest workflows
- Uses Clerk for authentication and Polar for subscriptions

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS v4
- tRPC
- Convex
- Inngest
- E2B
- OpenRouter
- Clerk
- Polar

## Project Structure

```text
src/
  app/          Next.js App Router pages and API routes
  agents/       Primary agent orchestration and sandbox utilities
  inngest/      Background workflows
  modules/      Feature modules
  prompts/      Agent and framework prompts
  trpc/         API router and client wiring
convex/         Database schema, queries, mutations, actions
sandbox-templates/
  nextjs/
  react/
  vue/
  angular/
  svelte/
tests/          Jest tests and mocks
```

## Requirements

- Bun
- Node.js 20+
- A Convex deployment
- An E2B account and API key
- An OpenRouter API key
- Clerk and Polar credentials for full auth/billing flows

## Local Setup

1. Install dependencies:

```bash
bun install
```

2. Copy the environment template:

```bash
cp env.example .env.local
```

3. Fill in the required values in `.env.local`.

Minimum keys for meaningful local development:

- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_SITE_URL`
- `OPENROUTER_API_KEY`
- `E2B_API_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_JWT_ISSUER_DOMAIN`
- `POLAR_ACCESS_TOKEN`
- `POLAR_WEBHOOK_SECRET`

4. Start the frontend:

```bash
bun run dev
```

5. Start Convex in a second terminal:

```bash
bun run convex:dev
```

If you use Inngest locally, point it at `http://localhost:3000/api/inngest`.

## Available Commands

```bash
bun run dev
bun run build
bun run start
bun run lint
bun run convex:dev
bun run convex:deploy
bun run migrate:convex
```

## Environment Variables

The repo ships with [`env.example`](/home/dih/zapdev/env.example). Important groups:

- App: `NEXT_PUBLIC_APP_URL`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`
- Convex: `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`
- AI providers: `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `CEREBRAS_API_KEY`, `FIREWORKS_API_KEY`
- Sandbox: `E2B_API_KEY`
- Auth: Clerk keys and JWT settings
- Billing: Polar product, price, and webhook settings
- Optional integrations: Brave Search, Firecrawl, Sentry, UploadThing, OAuth providers

## E2B Sandbox Templates

ZapDev uses framework-specific E2B templates from `sandbox-templates/`.

Current template names used by the app:

- `zapdev`
- `zapdev-angular`
- `zapdev-react`
- `zapdev-vue`
- `zapdev-svelte`

The Next.js template includes local build scripts in [`sandbox-templates/nextjs`](/home/dih/zapdev/sandbox-templates/nextjs).

## Notes

- Use Bun, not npm or pnpm, for repo commands.
- Convex is the active database layer; Prisma-based setup instructions are obsolete here.
- Jest is configured under [`jest.config.js`](/home/dih/zapdev/jest.config.js), but there is currently no `test` script in `package.json`.
