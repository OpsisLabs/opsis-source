# ChainScout sequential release train

The release order lives in [`release-train.json`](../release-train.json). It is the single source of truth for branch names, status, outcomes, and ship gates.

## Non-negotiable rules

1. `main` is production and is never the feature-development branch.
2. Exactly one `release/*` branch is active.
3. A later release branch must not exist before the active release is tagged and merged into `main`.
4. Every next release is created from the updated `main`, making it a cumulative snapshot.
5. One Railway staging service follows the active release branch. Production follows only `main`.
6. RC tags are immutable. Fixes receive a new number; an existing tag is never moved.
7. New vendor spend is capped at $0. Adapters cache, degrade, then disable before free-tier overage.
8. The selected provider path cannot have a publicly stated KYB/KYC requirement.
9. ChainScout explains and prepares. The official Uniswap app owns transaction signing and execution.

## Daily workflow

```bash
pnpm release:status
pnpm release:check
```

Work only on the branch printed as active. Keep the release vertically complete: implementation, failure states, tests, copy, observability, and feature flag belong to the same branch.

Before asking anyone to test staging:

```bash
pnpm release:gate
```

This runs lint, type checks, unit tests, the production build, and mock browser E2E. Do not point Railway staging at the branch until it passes.

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
pnpm release:advance 02-approval-guard
```

`release:advance` refuses to skip an item, refuses a dirty tree, requires the prior merged RC tag, creates only the immediate next branch, and updates the manifest. Commit the manifest update as the first commit on the new branch.

Never create releases 02–06 in advance. Their absence is an intentional safety property.
