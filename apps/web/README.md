# Robinhood Chain AI Explorer

Read-only AI explorer for **Robinhood Chain** (EVM Arbitrum L2, chain ID **4663**). Paste a wallet, transaction hash, token, or contract and get plain-English answers grounded in on-chain sources, with citations.

## What's in this repo

- **Landing site** (`/`) — marketing site with product overview, provider architecture, comparison, safety/compliance, insights, FAQ, and legal pages (`/privacy`, `/terms`).
- **Dashboard** (`/app`) — chat-based explorer with:
  - email sign-in/register (demo auth, browser-local in this build)
  - sessions, usage meters (AI messages / chain lookups)
  - entity search (wallet / tx / token / contract classification)
  - answer cards with confirmed facts, inference labels, severity-coded risk notes, and clickable Blockscout citations
  - entity summary panel (balances, active approvals, risk signals)
- **MetaMask connect** (`viem` + EIP-1193) — MetaMask-only detection, auto switch/add Robinhood Chain 4663, read-only (no signing, no transactions).

## Stack

React 19 · TypeScript · Vite · Tailwind CSS · react-router v7 · viem · lucide-react

## Run

From the repository root (starts this app and `@rh-chain/api` together):

```bash
pnpm dev
```

Or this workspace alone, against an API already running on port 4000:

```bash
pnpm --filter @rh-chain/web dev
```

## How it talks to the API

The mock layer is gone. The dashboard now calls the real Fastify backend, and
the UI was not reshaped to do it — `src/dashboard/api.ts` exports exactly the
surface `mockApi.ts` did (`login`, `listSessions`, `sendMessage`,
`getEntitySummary`, …) and returns the same view models, so the components
import it and are otherwise untouched.

| Module | Responsibility |
| --- | --- |
| `src/dashboard/http.ts` | `fetch` wrapper: stores the JWT pair, attaches the bearer token, rotates it once on a 401 via `/v1/auth/refresh`, maps API error codes to readable sentences. |
| `src/dashboard/adapters.ts` | Pure mapping from API shapes to view models — `NormalizedEntity` → `EntitySummary`, backend `AiExplorerAnswer` → the answer-card shape. |
| `src/dashboard/api.ts` | The endpoint calls themselves, in `mockApi`'s shape. |

Three details worth knowing, all handled in `adapters.ts`, because real
responses differ from the mock fixtures in ways the fixed-width UI notices:

- **Citation ids** arrive as UUIDs and are rendered inline beside every fact.
  They are aliased to `src_1`, `src_2`, … and all references rewritten to match.
- **Facts** from the deterministic (no-LLM) provider are `key: <raw JSON>`
  serialized then cut at 500 characters — unbreakable ~1200px tokens that
  stretch the chat grid. They are collapsed to a description of the value.
- **Balances** carry full wei precision; they are trimmed for display, and
  never rounded down to zero.

Requests go to the same origin and Vite proxies `/v1` to the API, so there is
no CORS preflight in development. Point `API_PROXY_TARGET` elsewhere to develop
against a deployed API, or set `VITE_API_BASE_URL` to call one directly.

### Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_PROXY_TARGET` | `http://127.0.0.1:4000` | Where the dev server proxies `/v1`. |
| `VITE_API_BASE_URL` | *(empty — same origin)* | Absolute API base, bypassing the proxy. |
| `VITE_BUILD_SHA` | Railway Git SHA or `local` | Full source commit exposed as a public, non-secret release-verification marker. |
| `VITE_PUBLIC_SITE_URL` | Railway public domain | Canonical URL used by social-preview metadata; set this when a custom domain launches. |
| `VITE_CHAIN_ID` | `4663` | Chain id shown in the UI. |
| `VITE_EXPLORER_URL` | `https://robinhoodchain.blockscout.com` | Explorer used for entity links. |
| `VITE_SAMPLE_WALLET` / `VITE_SAMPLE_TX` | sample values | Seed the SAMPLE WALLET / SAMPLE TX buttons. |

## Notes

- Read-only by design: the product never asks for keys, seed phrases, or signatures.
- Informational only, not financial advice.
