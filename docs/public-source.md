# Public-source publication and identity policy

This is a source mirror with a separate Git history. It is not a Git `--mirror`
remote, a backup of the private repository, or a deployment trigger.

## What is copied

`public-source-policy.json` selects application source, shared contracts, tests,
build/dependency configuration, notices, a small documentation set, and maintenance
scripts. Selected files are copied byte-for-byte from a **clean committed** source
tree. A generated digest manifest records the exact published file hashes without
embedding private authors, commit hashes, repository URLs, or local machine paths.

Internal release evidence, founder instructions, operational runbooks, private CI,
recordings, backups, environment secrets, caches, and Git history are excluded.
An existing privacy regression test reads a marketing-sourcebook path. The public
mirror supplies a small reviewed claim-boundary counterpart at that path, rather
than exporting internal marketing plans.
Public CI is a separate verification-only workflow with no deployment credentials.

## Identity setup: required in every clone

Git does not activate repository hooks on clone. Run:

```bash
git config --local user.name ChainScout
git config --local user.email source@chainscout.invalid
git config --local user.useConfigOnly true
git config --local commit.gpgsign false
git config --local core.hooksPath .githooks
git config --local chainscout.repositoryRole public
git config --local chainscout.allowedPushUrl "$(git remote get-url --push origin)"
node scripts/identity-guard.mjs commit
```

Inspect the remote yourself before approving it. In the private development clone,
use role `private` and approve **only its private origin**. Do not add a public push
URL to the private clone. This keeps private ancestry from being sent to the public
repository by an ordinary mistaken push.

The hooks check effective author **and committer**, attribution trailers, and the
approved destination. A public push checks every ancestor and accepts only `main`;
it rejects personal commit signatures and remote deletion. GitHub's web editor,
automatic merge/squash commits, and personal signing keys can reintroduce identity
metadata. Avoid them for mirror updates. Review externally submitted code privately
and republish a reviewed change under the project identity without misrepresenting
copyright or authorship; obtain the contributor's permission where necessary.

This is an accident-prevention guard, not access control against a determined
maintainer. Hooks can be bypassed and CI runs after publication. GitHub can still
show the authenticated account in activity/events, issue and PR authorship, admin
actions, or organization membership. Never promise anonymity. The `.invalid`
address is intentionally not a personal, verified GitHub email or contact mailbox.

## Initial publication

1. Review and commit the source changes in logical groups with real timestamps.
2. Run the applicable release gate and publication-policy tests.
3. Export into a **new, separate, empty directory**:

   ```bash
   node scripts/export-public.mjs /absolute/path/to/chainscout-public
   ```

4. Inspect the exported file list. Scan **the exported tree** with an independently
   maintained secret scanner (for example Gitleaks), review findings, and check for
   personal identifiers, local paths, embedded image metadata, and internal URLs.
   An allowlist and a scanner reduce risk; neither proves absence of secrets.
5. Initialize fresh Git history on `main`. Configure the identity guard before
   making commits. Use small, logical source-publication commits; do not falsify
   dates or pretend they are the original development history.
6. Verify all published commits and the exact source snapshot:

   ```bash
   node scripts/identity-guard.mjs history HEAD
   # From the private source clone:
   node scripts/export-public.mjs /absolute/path/to/chainscout-public --check
   ```

7. Audit the complete new Git history for secrets, then push only public `main`.
   Never change the private repository's visibility or push its tags/branches.

## Subsequent updates

1. Finish and test a change in the private source clone. Commit it there.
2. In the public clone, fetch and fast-forward `main`. Stop for unrelated local
   work or unexpected upstream changes; do not overwrite them.
3. Run the same exporter from the private clone against the public clone. It
   refuses a dirty source, dirty public destination, or a non-`main` public branch.
   Only obsolete files named in the previous managed manifest may be removed.
4. Review the public diff and rerun the secret/identity checks. Commit the actual
   change with a descriptive message; an unchanged snapshot needs no commit.
5. Push public `main`. This **does not deploy** ChainScout. Follow the private
   release process separately for production.

The exporter itself never commits, pushes, changes remotes, creates repositories,
or reads ignored environment files. `--check` is read-only. Keep the two clones
separate even if both ultimately publish equivalent application code.
