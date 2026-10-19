# Public-source publication and identity policy

This is a source mirror with a filtered reconstruction of Git history. It is not a Git `--mirror`
remote, a backup of the private repository, or a deployment trigger.

## Source license

New licensed revisions include the unmodified [PolyForm Noncommercial 1.0.0](../LICENSE)
text. The README summarizes permitted purposes and the separate-permission boundary
for commercial use. This is source-available software, not a permissive open-source
release. Preserve the license and third-party notices when synchronizing or sharing
copies; the project license does not replace dependency licenses or grant rights to
provider data, third-party artwork, or trademarks. Earlier revisions retain their
original terms.

## What is copied

`public-source-policy.json` selects application source, shared contracts, tests,
build/dependency configuration, notices, a small documentation set, and maintenance
scripts. Selected files are copied byte-for-byte from a **clean committed** source
tree. A generated digest manifest records the exact published file hashes without
embedding private authors, commit hashes, repository URLs, or local machine paths.

Internal release evidence, founder instructions, operational runbooks, private CI,
recordings, backups, environment secrets, caches, and original identity metadata are excluded.
A privacy regression test reads `docs/opsis/30-marketing.md`. The public mirror
supplies a small reviewed claim-boundary counterpart at that path, rather than
exporting internal marketing plans.
Public CI is a separate verification-only workflow with no deployment credentials.

## Identity setup: required in every clone

Git does not activate repository hooks on clone. Run:

```bash
git config --local user.name Opsis
git config --local user.email source@opsis.invalid
git config --local user.useConfigOnly true
git config --local commit.gpgsign false
git config --local core.hooksPath .githooks
git config --local opsis.repositoryRole public
git config --local opsis.allowedPushUrl "$(git remote get-url --push origin)"
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
3. Export filtered history into a **new, separate, empty directory**:

   ```bash
   node scripts/export-public-history.mjs /absolute/path/to/opsis-public
   ```

4. Inspect the exported file list. Scan **the exported tree** with an independently
   maintained secret scanner (for example Gitleaks), review findings, and check for
   personal identifiers, local paths, embedded image metadata, and internal URLs.
   An allowlist and a scanner reduce risk; neither proves absence of secrets.
5. The exporter initializes guarded `main`, normalizes author/committer identities,
   removes attribution trailers from commit messages, and preserves **every original
   author date, committer date, commit and parent relationship**. Private-only
   changes become labeled empty checkpoints, not invented source changes. The
   resulting history is explicitly disclosed as a reconstruction; commit dates
   are upstream dates, not publication dates. Original source copyright notices
   and third-party licensing obligations remain applicable. The private source
   repository is never rewritten.
6. Verify all published commits and the exact source snapshot:

   ```bash
   node scripts/identity-guard.mjs history HEAD
   # From the private source clone:
   node scripts/export-public.mjs /absolute/path/to/opsis-public --check
   node scripts/export-public-history.mjs /absolute/path/to/opsis-public --verify
   ```

7. Audit the complete new Git history for secrets, then push only public `main`.
   Never change the private repository's visibility or push its tags/branches.

## Subsequent updates

1. Finish and test a change in the private source clone. Commit it there.
2. In the public clone, fetch and fast-forward `main`. Stop for unrelated local
   work or unexpected upstream changes; do not overwrite them.
3. Run `node scripts/export-public-history.mjs /absolute/path/to/opsis-public --sync`
   from the private clone against the public clone. It
   refuses a dirty source, dirty public destination, or a non-`main` public branch.
   Existing commits are never rewritten. Each new source commit becomes one
   filtered public commit with its real dates, even when its private-only change
   produces an explicitly labeled empty checkpoint. New public tip files exactly
   match the current reviewed source selection.
4. Review the appended commits and rerun the full-history secret/identity checks.
   Verify dates/count/topology with `--verify` and current file parity with the
   snapshot exporter's `--check`. An unchanged source history creates no commits.
5. Push public `main`. This **does not deploy** Opsis. Follow the private
   release process separately for production.

The snapshot exporter never commits or pushes; the history exporter creates local
commits but never pushes, configures a remote, or creates a GitHub repository.
Neither reads ignored environment files. `--check` and `--verify` are read-only.

## Activity and CI

The repository's **Commit history** is the development timeline. GitHub's
**Activity** view records authenticated pushes, merges and branch operations.
Importing hundreds of commits creates one publication event, and commit dates
do not set the dates of those events. Existing Activity actors cannot be changed
by editing commit metadata.

Public CI always runs identity, tree-integrity and publication-policy checks.
README, license and artwork-only updates skip dependency installation, application
builds and browser tests. Code, dependency, workflow, claim-boundary or unrecognized
changes run the existing application/browser checks. Missing comparison data also
selects full checks. A manual run can select either mode. Superseded runs on the
same branch are cancelled; no scheduled polling or uploaded artifacts are used.

Standard GitHub-hosted runners on a public repository have free execution minutes.
Private-repository jobs, larger runners and stored artifacts have separate billing
rules; keep publication checks here on a standard runner.

A custom Activity actor such as `opsis-bot[bot]` requires a GitHub App with that
name/slug, installed on this repository, and an **installation** access token for
the push. The built-in `GITHUB_TOKEN` acts as GitHub Actions; setting `git user.name`
does not rename that authenticated actor. Keep commit metadata under the existing
Opsis identity policy even when a bot performs the push.

The minimal setup is an organization-owned GitHub App, installed only on this
public repository, with Contents read/write and no webhooks or user authorization.
Publishing changes to workflow files additionally requires Workflows write.
Store its private key in GitHub Actions secrets, never in the source tree or chat.
Use `actions/create-github-app-token`, restrict the issued token to this repository,
and leave automatic token revocation enabled. The push must use that token, not
the checkout's default credentials. Existing Activity records keep their actors.

A bot-authenticated local push through the same identity and manifest hooks also
works and consumes no Actions minutes. CI is optional for the publishing identity;
it does not supply a custom bot account automatically.

References: [GitHub Activity](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/using-the-activity-view-to-see-changes-to-a-repository),
[Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions),
[GitHub App registration](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app),
[installation-token action](https://github.com/actions/create-github-app-token).
The source/public hash mapping stays only in the public clone's
`.git/opsis-history-map.json`; retain it privately for future synchronization.
Do not commit it or export the `.git` directory. A new clone without that ledger
must stop for reviewed recovery, not guess a mapping or force-push.
Keep the two clones separate. Set the approved public push URL explicitly after
reviewing the newly created repository, and never push private origin to it.
