# Opsis parallel preparation and sequential release train

The release order lives in [`release-train.json`](../release-train.json). It is the single source of truth for branch names, status, outcomes, and ship gates.

## Non-negotiable rules

1. `main` is production and is never the feature-development branch.
2. Exactly one release is active for shipping. Registered queued releases may be implemented on private preparation branches.
3. `pnpm release:prepare <release-id>` creates a queued branch from clean main or the active branch without switching branches, advancing release status or publishing anything.
4. Preparation branches may start from a common foundation. Before activation they must include updated main and be reverified. Record dependencies; never pull a later feature into an earlier release just to obtain shared code.
5. Production follows only `main`. Preview environments must be isolated from production and access-restricted; do not reuse a service that serves a public production domain.
6. RC tags are immutable. Fixes receive a new number; an existing tag is never moved.
7. New vendor spend is capped at $0. Adapters cache, degrade, then disable before free-tier overage. Exception: the prepaid dRPC Robinhood Chain RPC admitted in Opsis decision D20, behind a fail-closed monthly compute-unit fuse.
8. The selected provider path cannot have a publicly stated KYB/KYC requirement. Exception: dRPC under D20, admitted only while it does not request identity or business verification.
9. Opsis explains and prepares. The official Uniswap app owns transaction signing and execution.

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

## Founder-authorized Opsis exception

D13 in `docs/opsis/decisions.md` authorizes password-free public access to the existing isolated Opsis preview and already-enabled tools. The access-restriction clauses below do not apply to that deployment. Release order, full-gate requirements, feature flags, quotas and Vault encryption remain in force.

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

## Maintaining a private preparation backlog

Register each approved update once in `release-train.json`, then prepare its branch
from the clean active branch with `pnpm release:prepare <release-id>`. Use a separate
Git worktree for each update so unfinished changes and test artifacts do not mix.
Branch privacy comes from the repository's visibility, not its name: verify the
destination is private before an authorized push. Never push preparation branches
to the public source repository or include them in a public export.

Keep implementation, focused tests and its release evidence on that update's
branch. The evidence records the base revision, scope, dependencies, gate result
and remaining activation conditions. A passing preparation gate does not advance
the release or authorize deployment. Avoid speculative branches for every idea;
register an update when implementation is authorized. Keep shared foundations
small and earlier in the train, and record a dependency instead of merging one
unfinished feature into another. Before activation, integrate current main and
run the full gate again on the resulting candidate.

Under D27, queued private preparation may reuse a completed passing browser run
when all relevant UI/shared source, fixtures, browser tests, dependency lockfiles,
configuration, flags and toolchain match exactly. Record the input comparison and
the browser-tested source revision in each release record. Run each branch's own
production dependency audit, lint, type checks, complete unit/policy tests and
build. Call this preparation verification with reused browser evidence, not a
separate full-gate pass. Unknown dependencies, changed inputs, failed or incomplete
evidence require the browser suites to run. Before staging or shipping, run the
unchanged full `pnpm release:gate` on the integrated candidate.
