# ZapDev

AI-powered development platform that lets you create web applications by chatting with AI agents in real-time sandboxes.

## Features

- 🤖 AI-powered code generation with AI agents
- 💻 Real-time Next.js application development in E2B sandboxes
- 🔄 Live preview & code preview with split-pane interface
- 📁 File explorer with syntax highlighting and code theme
- 💬 Conversational project development with message history
- 🎯 Smart usage tracking and rate limiting
- 💳 Subscription management with pro features
- 🔐 Authentication with Clerk
- ⚙️ Background job processing with Inngest + Agent Kit
- 🗃️ Project management and persistence

## Tech Stack

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS v4
- Shadcn/ui
- tRPC
- Prisma ORM
- PostgreSQL
- Vercel AI Gateway (supports OpenAI, Anthropic, Grok, and more)
- E2B Code Interpreter
- Clerk Authentication
- Inngest
- Prisma
- Radix UI
- Lucide React

## Building E2B Template (REQUIRED)

Before running the application, you must build the E2B template that the AI agents use to create sandboxes.

**Prerequisites:**
- Docker must be installed and running (the template build command uses Docker CLI)

```bash
# Install E2B CLI
npm i -g @e2b/cli
# or
brew install e2b

# Login to E2B
e2b auth login

# Navigate to the sandbox template directory
cd sandbox-templates/nextjs

# Build the template (replace 'your-template-name' with your desired name)
e2b template build --name your-template-name --cmd "/compile_page.sh"
```

After building the template, update the template name in `src/inngest/functions.ts`:

```typescript
// Replace "zapdev" with your template name (line 22)
const sandbox = await Sandbox.create("your-template-name");
```

## Development

```bash
# Install dependencies
npm install

# Set up environment variables
cp env.example .env
# Fill in your API keys and database URL

# Set up database
npx prisma migrate dev # Enter name "init" for migration

# Start development server
npm run dev
```

### Setting Up Inngest for AI Code Generation

You have two options for running Inngest:

#### Option 1: Inngest Cloud (Recommended for Vercel Deployment)
1. Create an account at [Inngest Cloud](https://app.inngest.com)
2. Create a new app and get your Event Key and Signing Key
3. Add these to your `.env` file:
   ```bash
   INNGEST_EVENT_KEY="your-event-key"
   INNGEST_SIGNING_KEY="your-signing-key"
   ```
4. For local development with cloud, use ngrok/localtunnel:
   ```bash
   npx localtunnel --port 3000
   # Then sync your tunnel URL with Inngest Cloud
   ```

#### Option 2: Local Inngest Dev Server (Development Only)
```bash
# In a second terminal:
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```
- Inngest Dev UI will be available at `http://localhost:8288`
- Note: This won't work for Vercel deployments

## Setting Up Vercel AI Gateway

1. **Create a Vercel Account**: Go to [Vercel](https://vercel.com) and sign up or log in
2. **Navigate to AI Gateway**: Go to the [AI Gateway Dashboard](https://vercel.com/dashboard/ai-gateway)
3. **Create API Key**: Generate a new API key from the dashboard
4. **Choose Your Model**: The configuration uses OpenAI models by default, but you can switch to other providers like Anthropic, xAI, etc.

### Migrating from Direct OpenAI

If you're upgrading from a previous version that used OpenAI directly:
1. Remove `OPENAI_API_KEY` from your `.env.local`
2. Add `OPENROUTER_API_KEY` and `OPENROUTER_BASE_URL` as shown below
3. The application now routes all AI requests through Vercel AI Gateway for better monitoring and reliability

### Testing the Connection

Run the included test script to verify your Vercel AI Gateway setup:
```bash
node test-vercel-ai-gateway.js
```

## Environment Variables

Create a `.env` file with the following variables:

```bash
DATABASE_URL=""
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Vercel AI Gateway (replaces OpenAI)
OPENROUTER_API_KEY=""
OPENROUTER_BASE_URL="https://openrouter.ai/api/v1"

# E2B
E2B_API_KEY=""

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
CLERK_SECRET_KEY=""
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL="/"
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL="/"

# Inngest (for background job processing)
INNGEST_EVENT_KEY=""
INNGEST_SIGNING_KEY=""
```

## Deployment to Vercel

Quick overview:
1. Set up Inngest Cloud account and get your keys
2. Deploy to Vercel with all required environment variables
3. Sync your app with Inngest Cloud (`https://your-app.vercel.app/api/inngest`)
4. Run database migrations on your production database

## Additional Commands

```bash
# Database
npm run postinstall        # Generate Prisma client
npx prisma studio          # Open database studio
npx prisma migrate dev     # Migrate schema changes
npx prisma migrate reset   # Reset database (Only for development)

# Build
npm run build          # Build for production
npm run start          # Start production server
npm run lint           # Run ESLint
```

## Project Structure

- `src/app/` - Next.js app router pages and layouts
- `src/components/` - Reusable UI components and file explorer
- `src/modules/` - Feature-specific modules (projects, messages, usage)
- `src/inngest/` - Inngest clients, triggers, and Agent Kit workflows
- `src/lib/` - Utilities and database client
- `src/trpc/` - tRPC router and client setup
- `prisma/` - Database schema and migrations
- `sandbox-templates/` - E2B sandbox configuration

## How It Works

1. **Project Creation**: Users create projects and describe what they want to build
2. **AI Processing**: Interactive runs stream via `/api/agent/run` (AI SDK), with optional background execution via `/api/inngest` (Inngest + Agent Kit)
3. **Code Generation**: AI agents use E2B sandboxes to generate and test Next.js applications
4. **Real-time Updates**: Generated code and previews are displayed in split-pane interface
5. **File Management**: Users can browse generated files with syntax highlighting
6. **Iteration**: Conversational development allows for refinements and additions

---

Created by [CodeWithAntonio](https://codewithantonio.com)
