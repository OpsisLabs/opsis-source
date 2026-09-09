# ChainScout parallel preparation and sequential release train

The release order lives in [`release-train.json`](../release-train.json). It is the single source of truth for branch names, status, outcomes, and ship gates.

## Non-negotiable rules

1. `main` is production and is never the feature-development branch.
2. Exactly one release is active for shipping. Registered queued releases may be implemented on private preparation branches.
3. `pnpm release:prepare <release-id>` creates a queued branch from clean main or the active branch without switching branches, advancing release status or publishing anything.
4. Preparation branches may start from a common foundation. Before activation they must include updated main and be reverified. Record dependencies; never pull a later feature into an earlier release just to obtain shared code.
5. Production follows only `main`. Preview environments must be isolated from production and access-restricted; do not reuse a service that serves a public production domain.
6. RC tags are immutable. Fixes receive a new number; an existing tag is never moved.
7. New vendor spend is capped at $0. Adapters cache, degrade, then disable before free-tier overage.
8. The selected provider path cannot have a publicly stated KYB/KYC requirement.
9. ChainScout explains and prepares. The official Uniswap app owns transaction signing and execution.

## Daily workflow

```bash
pnpm release:status
pnpm release:check
```

Work on the active branch or a registered queued preparation branch. Keep each release vertically complete: implementation, failure states, tests, copy, observability, and feature flags belong to that branch. `release:check` permits preparation; `release:candidate` still rejects queued branches.

Before asking anyone to test staging:

```bash
pnpm release:gate
```

This runs lint, type checks, unit tests, the production build, and mock browser E2E. Do not point Railway staging at the branch until it passes.

## Private previews

A passing queued branch may be tested on an explicitly authorized private preview,
but is not eligible for a shipping RC or merge into production. Use test-only data,
separate storage and configuration, and frontend/backend flags that default off.
Hidden slugs and greyed-out buttons are not access control. Verify anonymous
requests cannot access the preview's protected pages or APIs. Never copy production
Vault contents or credentials into a preview. Check Railway resource costs before
creating services; the $0 incremental recurring-vendor constraint remains in force.

Before release, merge updated main into the prepared branch using ordinary merges,
resolve conflicts, advance in order, and rerun the full candidate gate and live
checks on the exact integrated SHA. Preparation tests do not certify a later merge.
Public publication uses the reviewed identity-guarded history exporter, never a
raw private-history merge into the public repository.

## Candidate and release

1. Commit the release branch so the working tree is clean.
2. Run `pnpm release:candidate`.
3. Tag the exact reported SHA using the suggested `rc/<release>/<n>` tag.
4. Deploy that exact tag/commit to Railway staging.
5. Record the deployed SHA and complete the release-specific evidence checklist.
6. Merge the exact approved RC commit to `main`.
7. Verify production health and retain the prior Railway deployment for rollback.

Tagging, merging, pushing, and Railway changes remain explicit actions. The scripts verify readiness but do not publish anything.

## Starting the next release

Only after the current RC tag is merged into `main`:

```bash
git switch main
git pull --ff-only
pnpm release:advance 02-privacy-foundation
```

`release:advance` refuses to skip an item, refuses a dirty tree and requires the prior merged RC tag. It creates the immediate next branch if absent, or activates its existing local preparation branch only if that branch already includes current main. Commit the manifest update normally. It never auto-merges, resets or rebases a prepared branch.

Queued branches can be prepared together; activation and production publication remain sequential. This policy change does not itself authorize a deployment, paid hosting, or public publication.
