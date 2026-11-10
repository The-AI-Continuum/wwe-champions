# Project Keys and Delivery Map

Project: `wwe-champions` (`The-AI-Continuum/wwe-champions`)
Maintainer: Josh Muthumani (`joshmuthumani`)
Last verified: 2026-11-07 — consumer references re-read from `.github/workflows/*.yml` and `README.md`; GitHub destination metadata (names only, never values) read with read-only `gh api` calls for repository Actions secrets/variables, organization secrets/variables visible to this repository, the `binding-approval` and `refresh-data` environments, and the `binding-approval` branch policy. Phase contents, org-secret repository visibility, and GitHub App permissions were not re-checked this session; entries that depend on them say Unverified or cite the earlier check.

This inventory records credential names and consumers only. Never record secret values; values belong in Phase and are not stored in this repository.

## Scope: Only Keys Used by This Project

This lists the credentials and configuration that this repository's retained workflows and actively used local tools read. It is not a registry of everything in Operations, Phase, or GitHub. Review model IDs are pinned workflow configuration, not credentials; no retained consumer reads `OCR_MODEL` or `PR_AGENT_MODEL`. Retirement history lives in the decision records under `docs/adr/`.

## Active Dependencies

| Name actually read by consumer | Type | Active consumer: file / job / function | Required when | Minimum permissions |
|---|---|---|---|---|
| `OPENROUTER_CODE_REVIEW_KEY` | secret | `.github/workflows/ci.yml` — `Code review (OCR)` job (credential check and `llm_auth_token`) | Mandatory on every non-draft pull request | OpenRouter inference key for the OCR review model; scope Unverified |
| `OPENROUTER_PR_APPROVER_KEY` | secret | `.github/workflows/independent-review.yml` — external PR-Agent review (`PRA_KEY`, `OPENROUTER__KEY`) | Mandatory for the external review after the required checks finish | OpenRouter inference key for the external review model, separate from the OCR key; scope Unverified |
| `CODE_REVIEW_AND_PR_BOT_APP_PRIVATE_KEY_B64` | secret | `.github/workflows/pr-verdict.yml` — verdict job (`environment: binding-approval`), decoded to mint the App token | Mandatory for binding approval | Private key of the Code Review and PR Bot GitHub App; App permissions Unverified this session |
| `CODE_REVIEW_AND_PR_BOT_REVIEW_APP_ID` | secret (public App ID delivered as a secret) | `.github/workflows/pr-verdict.yml` — verdict job, `app-id` for the App token | Mandatory for binding approval | Public App identifier; no permissions of its own |
| `LINEAR_CI_READ_KEY` | secret | `.github/workflows/work-item-link.yml` — Linear work-item validation | Mandatory on pull requests (`work-item-link` required check) | Read-only Linear API key; scope Unverified |
| `OWNER_APPROVER_LOGIN` | public configuration (Actions variable) | `.github/workflows/pr-verdict.yml` — `.github/` approver check, and the approver check for a verified empty PR-Agent review of a PR that touches or renames from a dependency lockfile; both require a current-head approval by a human `User` (`vars.OWNER_APPROVER_LOGIN`; falls back to the repository owner login when unset) | Optional; needed whenever the repository owner is an organization, which cannot review (see ADR 0002) | None; a GitHub login name. Value is `joshmuthumani` (organization variable, verified 2026-11-07) |
| `GITHUB_TOKEN` | platform-managed credential | `independent-review.yml` and `pr-verdict.yml` (`secrets.GITHUB_TOKEN` for GitHub API calls and PR-Agent) | Always, in those jobs | Job-level `permissions:` blocks in the workflow files |
| `OMP_GH_APP_ID`, `OMP_GH_APP_PRIVATE_KEY_B64` | secret (local, Phase-injected) | `~/.omp/bin/gh-omp-token` and `gh-omp-push`, used by the local weekly refresh task (README "Generate Champion Data") | When the weekly refresh runs on Josh's Mac | GitHub App `gh-omp`; installation token limited to this repository; see Local OMP authoring bot |
| `OPENCODE_GH_APP_ID`, `OPENCODE_GH_APP_PRIVATE_KEY`, `OPENCODE_GH_APP_PRIVATE_KEY_B64` | secret (local, Phase-injected) | `~/.local/bin/gh-opencode-token`, `gh-opencode-pr` | When raising PRs from the OpenCode harness | GitHub App `gh-opencode`; see Local OpenCode authoring bot |

No workflow reads any other `secrets.*` or `vars.*` name. The scheduled data refresh no longer runs in GitHub Actions, so no workflow consumes any `OMP_*` credential.

## Where to Deliver / Sync Each Key

Phase is the canonical source; GitHub Actions and the local runtime are delivery destinations. "Delivery configured / verified?" distinguishes what was read from GitHub metadata this session from what is carried from earlier checks.

| Destination platform | Account / repo / app / project | Destination environment / scope | Setting type and exact destination name | Consumer reference | Delivery needed? | Delivery configured / verified? |
|---|---|---|---|---|---|---|
| GitHub Actions | org `The-AI-Continuum`, visible to `wwe-champions` | Organization secret | secret: `OPENROUTER_CODE_REVIEW_KEY` | `ci.yml` / `Code review (OCR)` | Yes | Verified present as an organization secret available to this repository on 2026-11-07 (name only). Org-secret visibility policy and Phase-to-GitHub sync path Unverified. Earlier evidence: OCR review passed on PR #16 |
| GitHub Actions | org `The-AI-Continuum`, visible to `wwe-champions` | Organization secret | secret: `OPENROUTER_PR_APPROVER_KEY` | `independent-review.yml` | Yes | Verified present as above on 2026-11-07. Visibility policy and sync path Unverified. Earlier evidence: external review passed on PR #16 |
| GitHub Actions | org `The-AI-Continuum`, visible to `wwe-champions` | Organization secret | secret: `LINEAR_CI_READ_KEY` | `work-item-link.yml` | Yes | Verified present as above on 2026-11-07. Visibility policy and sync path Unverified. Earlier evidence: `work-item-link` passed on PR #16 |
| GitHub Actions | `The-AI-Continuum/wwe-champions` | Environment `binding-approval` (deployment branches limited to `main`) | secret: `CODE_REVIEW_AND_PR_BOT_APP_PRIVATE_KEY_B64` | `pr-verdict.yml` / verdict job | Yes | Verified present and branch policy `main` on 2026-11-07. Earlier evidence: Binding approval succeeded on PRs #18 and #19 |
| GitHub Actions | `The-AI-Continuum/wwe-champions` | Environment `binding-approval` (deployment branches limited to `main`) | secret: `CODE_REVIEW_AND_PR_BOT_REVIEW_APP_ID` | `pr-verdict.yml` / verdict job | Yes | Verified present on 2026-11-07, same evidence as above |
| GitHub Actions | org `The-AI-Continuum`, visible to `wwe-champions` | Organization variable | variable: `OWNER_APPROVER_LOGIN` (value `joshmuthumani`) | `pr-verdict.yml` | Optional (fallback: repository owner) | Verified present with that value on 2026-11-07. Manually managed variable, not synced from Phase |
| GitHub Actions | `The-AI-Continuum/wwe-champions` | Per run | `GITHUB_TOKEN` | `independent-review.yml`, `pr-verdict.yml` | No: platform-managed | Automatically provided by GitHub Actions; no Phase sync needed |
| Local via Phase | Josh's Mac | `phase run` injection, `operations` / Production / `/github-apps/omp` | secrets: `OMP_GH_APP_ID`, `OMP_GH_APP_PRIVATE_KEY_B64` | local weekly refresh task via `gh-omp-token` / `gh-omp-push` | Yes (local only; no GitHub delivery) | Phase injection used by the helpers per the earlier check; not re-checked 2026-11-07. Local `gh-omp.env` / `gh-omp.pem` not provisioned |
| Local via Phase | Josh's Mac | `phase run` injection, `operations` / Production / `/github-apps/opencode` | secrets: `OPENCODE_GH_APP_ID`, `OPENCODE_GH_APP_PRIVATE_KEY`, `OPENCODE_GH_APP_PRIVATE_KEY_B64` | `gh-opencode-token`, `gh-opencode-pr` | Yes (local only; no GitHub delivery) | Verified 2026-10-25 by a throwaway PR authored by the bot; not re-checked 2026-11-07 |

Repository-scoped Actions secrets and variables for `wwe-champions` are empty as of 2026-11-07; the Actions secrets above are delivered at organization level.

## Canonical Sources and Project References

| Consumer / destination name | Canonical Phase source: app name/ID / environment / folder / key | Project Phase reference | Delivery method / selected sync target |
|---|---|---|---|
| `OPENROUTER_CODE_REVIEW_KEY` | Phase `Operations` / Production / `/openrouter` (carried from the earlier inventory; Unverified this session) | Unverified | GitHub organization secret on `The-AI-Continuum`; sync path Unverified |
| `OPENROUTER_PR_APPROVER_KEY` | Phase `Operations` / Production / `/openrouter` (carried from the earlier inventory; Unverified this session) | Unverified | GitHub organization secret on `The-AI-Continuum`; sync path Unverified |
| `LINEAR_CI_READ_KEY` | Unverified | Unverified | GitHub organization secret on `The-AI-Continuum`; earlier inventory recorded it synced to repository Actions on 2026-10-21; sync path Unverified |
| `CODE_REVIEW_AND_PR_BOT_APP_PRIVATE_KEY_B64`, `CODE_REVIEW_AND_PR_BOT_REVIEW_APP_ID` | Unverified (Phase location not recorded in this repository) | Unverified | `binding-approval` environment secrets; delivery method Unverified |
| `OWNER_APPROVER_LOGIN` | N/A: public configuration, not a Phase entry | N/A | Manually managed organization Actions variable |
| `GITHUB_TOKEN` | N/A: platform-managed | N/A | Provided by GitHub Actions |
| `OMP_GH_APP_ID`, `OMP_GH_APP_PRIVATE_KEY_B64` | Phase `operations` / Production / `/github-apps/omp` | Unverified | Approved runtime injection with `phase run`; no GitHub delivery |
| `OPENCODE_GH_APP_ID`, `OPENCODE_GH_APP_PRIVATE_KEY`, `OPENCODE_GH_APP_PRIVATE_KEY_B64` | Phase `operations` / Production / `/github-apps/opencode` | Unverified | Approved runtime injection with `phase run`; no GitHub delivery |

## Local OMP authoring bot

| Name | Consumer | Delivery target | Status |
|---|---|---|---|
| `OMP_GH_APP_ID` | `~/.omp/bin/gh-omp-token` | Phase `operations` / Production / `/github-apps/omp` or optional local `gh-omp.env` | Phase injection used; local config not provisioned |
| `OMP_GH_APP_PRIVATE_KEY_B64` | `~/.omp/bin/gh-omp-token` | Phase `operations` / Production / `/github-apps/omp` or optional local `gh-omp.pem` | Phase-backed installation token successfully accessed this repository; no local PEM |
| `OMP_GH_APP_INSTALLATION_ID` | GH-OMP installation metadata | Phase `operations` / Production / `/github-apps/omp` | Metadata entry present; repository access verified by the token check |

The helper accepts Phase-injected `OMP_GH_APP_ID` and `OMP_GH_APP_PRIVATE_KEY_B64`; it decodes the key into a mode-600 temporary file and removes it on exit. It also supports optional local files for standalone use. It emits a token only when GitHub returns the `ghs_` installation-token format.

Install GH-OMP on the target repository before using the helper. `gh-omp-push` disables Git credential helpers and fails closed; it never falls back to Josh's GitHub login. Do not put local App credentials in the repository or chat.

The weekly refresh is a local scheduled task that generates its own helper script and uses these Phase-injected credentials with `gh-omp-token` and `gh-omp-push`; the steps are in the README under "Generate Champion Data". GitHub holds no GH-OMP credentials for it and no GitHub Actions workflow runs the refresh.

## Local OpenCode authoring bot

| Name | Consumer | Delivery target | Status |
|---|---|---|---|
| `OPENCODE_GH_APP_ID` | `~/.local/bin/gh-opencode-token` | Phase `operations` / Production / `/github-apps/opencode` or optional local `opencode.env` | Used on every helper call; App `gh-opencode` is installed on the repository owner |
| `OPENCODE_GH_APP_PRIVATE_KEY` | `~/.local/bin/gh-opencode-token` | Phase `operations` / Production / `/github-apps/opencode` or optional `opencode.pem` | PEM key; the helper's primary path |
| `OPENCODE_GH_APP_PRIVATE_KEY_B64` | `~/.local/bin/gh-opencode-token` | Phase `operations` / Production / `/github-apps/opencode` | Base64 fallback; used when the PEM key is absent |

The helpers raise pull requests from the OpenCode harness as `gh-opencode[bot]` rather than as Josh. `gh-opencode-token` re-enters Phase with `phase run` when credentials are not already injected, requests a token limited to the target repository, decodes keys into mode-600 temporary files removed on exit, and emits a token only when GitHub returns the `ghs_` installation-token format and the installation reports `pull_requests: write`. The App holds `pull_requests: write`, `contents: write`, `actions: write`, and `metadata: read`.

`gh-opencode-pr` requires the branch to exist on the remote, creates the pull request with the bot token only, then re-reads it through REST and exits non-zero unless the author is `gh-opencode[bot]` with type `Bot` and the head/base refs match. `--dry-run` authenticates and validates without creating anything. Neither helper falls back to a saved user login.

Install `gh-opencode` on the target repository before use. Authoring was verified on 2026-10-25 by a throwaway pull request authored by the bot and then closed; both helpers pass `shellcheck -S warning`. Do not put local App credentials in the repository or chat.

## Review and merge flow

Refresh PRs and all other PRs run the required checks, the external review, and binding approval. For a PR that modifies `.github/`, `pr-verdict.yml` requires approval from the login in `OWNER_APPROVER_LOGIN` (the repository owner if the variable is unset). It requires the same approval when PR-Agent's review is verified empty and the PR touches a dependency lockfile or renames a file from one. In both cases the approval must come from a human `User` (not a bot) on the PR's current head. The external review installs the reviewed PR-Agent runtime (`.github/scripts/pr-agent-runtime`, hash-locked and verified against `MANIFEST.sha256`) from the trusted default-branch checkout; it needs no new key and keeps using `OPENROUTER_PR_APPROVER_KEY`. Until that runtime is on the default branch, the introducing PR's external review fails closed and needs the owner's one-time bootstrap merge (see the README "Verification" section). Josh merges manually after all required checks pass. The `binding-approval` environment is restricted to `main`, which prevents PR-triggered workflows from reading the reviewer private key.

## Verification and Open Issues

| Active entry and destination | Evidence / check performed | Date | Result / next action |
|---|---|---|---|
| Organization secrets `OPENROUTER_CODE_REVIEW_KEY`, `OPENROUTER_PR_APPROVER_KEY`, `LINEAR_CI_READ_KEY` (GitHub Actions) | Names listed from the repository's organization-secrets endpoint; consumers read from workflow files | 2026-11-07 | Present and consumed. Unverified: org-secret visibility scope, Phase source, sync path |
| `binding-approval` environment secrets (GitHub Actions) | Environment secret names and branch policy read via `gh api`; consumer read from `pr-verdict.yml` | 2026-11-07 | Verified present; branch policy is `main` only |
| `OWNER_APPROVER_LOGIN` (GitHub Actions variable) | Organization variable name and value read via `gh api`; consumer read from `pr-verdict.yml` | 2026-11-07 | Verified: `joshmuthumani` |
| Repository-scoped Actions secrets and variables | `gh api` listing | 2026-11-07 | Both empty; delivery is organization-level |
| `refresh-data` environment | `gh api` listing of environments and environment secrets | 2026-11-07 | Environment still exists and still holds `OMP_GH_APP_ID`, `OMP_GH_APP_PRIVATE_KEY`, `OMP_GH_APP_PRIVATE_KEY_B64`, which contradicts the README ("GitHub holds no GH-OMP credentials"). No workflow consumes them once `refresh-data.yml` is deleted. Next action: owner deletes those environment secrets (and the environment) after the workflow deletion merges; do not delete the Phase entries, which the local task uses |
| GitHub App permissions for the Code Review and PR Bot | Not checked | Unverified | Record the verified permission set when next inspected |
| Local OMP / OpenCode helpers | Carried from earlier checks (see sections above) | Unverified this session | Re-verify on next use |

## Maintenance Rules

- Keep this inventory limited to current project consumers; remove rows after confirming the consumer was retired, and preserve history in the decision records.
- Operations owns actual shared credentials; this repository records only the names it consumes.
- Deliver each key only to the platforms and environments with confirmed consumers. Local-only Phase entries stay outside GitHub sync selections.
- Native Phase-to-GitHub sync delivers entries as secrets, including the non-sensitive App ID; consumers use the `secrets` context. Manually managed non-sensitive settings such as `OWNER_APPROVER_LOGIN` are Actions variables.
- Update this inventory when a consumer, name, source, destination, or delivery changes. Removing a row here does not authorize deleting the credential from Phase or any provider.
- Verify without displaying values; distinguish delivery required from delivery verified.
