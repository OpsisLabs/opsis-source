# Robinhood Chain AI Explorer

Read-only AI explorer for Robinhood Chain with source-linked explanations, saved sessions, entity views, and a responsive web interface.

Requires Node.js 22 LTS. The repository includes a `.node-version` file for compatible version managers.

## Stack

- API: Node.js, Fastify, Zod, Prisma, PostgreSQL, Redis caching/rate limiting, Argon2id auth.
- Chain data: Blockscout and Alchemy provider abstractions.
- AI: local Ollama, OpenAI Responses API, or deterministic fallback.
- Web: React 19, Vite, TypeScript, Tailwind, react-router v7, viem (MetaMask, read-only). See [apps/web/README.md](apps/web/README.md) for how the dashboard is wired to the API.

## Local Setup

```bash
corepack enable
corepack prepare pnpm@8.15.9 --activate
pnpm install
cp .env.example .env
pnpm db:generate
pnpm dev
```

API: `http://localhost:4000`
Web: `http://localhost:5173`
OpenAPI UI: `http://localhost:4000/docs`
Prometheus metrics: `http://localhost:4000/metrics`

The example leaves `DATABASE_URL` and `REDIS_URL` blank so the minimal local flow uses in-memory storage and caching. Configure Postgres and Redis when persistence and distributed limits are needed.

## Local AI With Ollama

Ollama runs models on your computer and does not require an API key. Install Ollama, start it, and pull the default compact model:

```bash
brew install ollama
brew services start ollama
ollama pull qwen3:4b
```

The checked-in `.env.example` selects Ollama for local setup. These values are sufficient:

```bash
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b
```

Run `pnpm dev`, create or sign in to a local account, paste a wallet or token address, enter a question, and select **Ask AI with citations**. Set `AI_PROVIDER=auto` to use OpenAI when `OPENAI_API_KEY` exists and the deterministic fallback otherwise. Set `AI_PROVIDER=fallback` to disable generative AI explicitly.

Verify the installed model directly with the opt-in integration test:

```bash
TEST_OLLAMA_URL=http://127.0.0.1:11434 pnpm --filter @rh-chain/api test -- ollama.integration.test.ts
```

## Browser Tests

The browser suite uses the installed Google Chrome application. The deterministic test starts the frontend automatically and mocks API responses:

```bash
pnpm test:e2e
pnpm test:e2e:headed
```

The live test starts the API and frontend, then registers a user and sends a real wallet question through Blockscout and local Ollama. Complete the local setup above first, including `.env`, Ollama, and `qwen3:4b`:

```bash
pnpm test:e2e:live
pnpm test:e2e:live:headed
```

Override the live wallet when needed:

```bash
E2E_WALLET_ADDRESS=0x... pnpm test:e2e:live
```

Failure traces and screenshots are written to `test-results`. View the latest HTML report with `pnpm test:e2e:report`.

Production requires unique JWT secrets plus `SMTP_HOST` and `EMAIL_FROM`. Registration requires email verification in production; non-production responses expose one-time verification/reset tokens for local testing only.

## Safety Boundary

This app is informational and non-custodial. It must not ask for seed phrases, private keys, transaction signatures, token approvals, transfers, or transaction submission. Wallet sign-in may request one explicit plain-text ownership message that cannot move funds. Scout Swap may explain a short-lived quote and link to the official Uniswap app, but ChainScout never signs, broadcasts, executes, or routes a trade. Provider keys stay server-side.

## Useful Commands

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm db:migrate
pnpm --filter @rh-chain/api ops:retention
```

See `docs/deployment.md` for container startup, production configuration, backups, first-admin assignment, acceptance, and rollback guidance.

See `docs/spec-traceability.md` for page-level PDF compliance and `docs/final-acceptance-report.md` for final local acceptance results and remaining external launch inputs.
