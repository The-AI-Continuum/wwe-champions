# GitHub and local bot credentials

This inventory records credential names and consumers only. Secret values belong in Phase and are not stored in this repository.

## GitHub Actions

| Name | Consumer | Delivery target | Status |
|---|---|---|---|
| `OPENROUTER_CODE_REVIEW_KEY` | `.github/workflows/ci.yml` — mandatory OCR review | Repository Actions secret | Present in Phase Operations / Production / `/openrouter` and repository Actions; OCR review passed on PR #16 |
| `OPENROUTER_PR_APPROVER_KEY` | `.github/workflows/independent-review.yml` — external PR-Agent review | Repository Actions secret | Present in Phase Operations / Production / `/openrouter` and repository Actions; external review passed on PR #16 |
| `CODE_REVIEW_AND_PR_BOT_APP_PRIVATE_KEY_B64` | `.github/workflows/pr-verdict.yml` — binding approval | `binding-approval` environment secret | Value and App installation validated by successful Binding approval on PRs #18 and #19; environment policy verified main-only on 2026-10-21 |
| `CODE_REVIEW_AND_PR_BOT_REVIEW_APP_ID` | `.github/workflows/pr-verdict.yml` — binding approval App identity | `binding-approval` environment secret | App identity and installation validated by successful Binding approval on PRs #18 and #19; environment policy verified main-only on 2026-10-21 |
| `OMP_GH_APP_ID` | `.github/workflows/refresh-data.yml` — weekly GH-OMP refresh PR | `refresh-data` environment secret | Synced from Phase `operations` / Production / `/github-apps/omp`; validated by successful workflow dispatch run 39548132010 and GH-OMP PR #19 |
| `OMP_GH_APP_PRIVATE_KEY_B64` | `.github/workflows/refresh-data.yml` — weekly GH-OMP refresh PR | `refresh-data` environment secret | Synced from Phase `operations` / Production / `/github-apps/omp`; validated by successful workflow dispatch run 39548132010 and GH-OMP PR #19 |
| `LINEAR_CI_READ_KEY` | `.github/workflows/work-item-link.yml` — Linear work-item validation | Repository Actions secret | Synced to repository Actions on 2026-10-21; `work-item-link` passed on PR #16 |

Phase is the intended source of Actions secret values. The OpenRouter review keys are present in Phase and repository Actions, and both review checks passed on PR #16. The `binding-approval` App secrets were validated by successful Binding approval on PRs #18 and #19; that environment is restricted to `main`. `LINEAR_CI_READ_KEY` is synced to repository Actions and validation passed on PR #16. The weekly refresh workflow uses the shared GH-OMP App credentials only through the `refresh-data` environment, also restricted to `main`. The OMP App ID and base64 private key are synced there from Phase `operations` / Production / `/github-apps/omp`; dispatch run 39548132010 successfully minted the repository-scoped token and opened PR #19 as `app/gh-omp`. Refresh PRs run the required external reviews and binding approval; the repository owner must approve PRs that modify `.github/`, and Josh manually merges after all required checks pass. Keep the App ID as an Actions secret; do not duplicate it as a repository variable. The `binding-approval` environment restriction prevents PR-triggered workflows from accessing the reviewer private key.

## Local OMP authoring bot

| Name | Consumer | Delivery target | Status |
|---|---|---|---|
| `OMP_GH_APP_ID` | `~/.omp/bin/gh-omp-token` | Phase `operations` / Production / `/github-apps/omp` or optional local `gh-omp.env` | Phase injection used; local config not provisioned |
| `OMP_GH_APP_PRIVATE_KEY_B64` | `~/.omp/bin/gh-omp-token` | Phase `operations` / Production / `/github-apps/omp` or optional local `gh-omp.pem` | Phase-backed installation token successfully accessed this repository; no local PEM |
| `OMP_GH_APP_INSTALLATION_ID` | GH-OMP installation metadata | Phase `operations` / Production / `/github-apps/omp` | Metadata entry present; repository access verified by the token check |

The helper accepts Phase-injected `OMP_GH_APP_ID` and `OMP_GH_APP_PRIVATE_KEY_B64`; it decodes the key into a mode-600 temporary file and removes it on exit. It also supports optional local files for standalone use. It emits a token only when GitHub returns the `ghs_` installation-token format.

Install GH-OMP on the target repository before using the helper. `gh-omp-push` disables Git credential helpers and fails closed; it never falls back to Josh's GitHub login. Do not put local App credentials in the repository or chat.

## Local OpenCode authoring bot

| Name | Consumer | Delivery target | Status |
|---|---|---|---|
| `OPENCODE_GH_APP_ID` | `~/.local/bin/gh-opencode-token` | Phase `operations` / Production / `/github-apps/opencode` or optional local `opencode.env` | Used on every helper call; App `gh-opencode` is installed on the repository owner |
| `OPENCODE_GH_APP_PRIVATE_KEY` | `~/.local/bin/gh-opencode-token` | Phase `operations` / Production / `/github-apps/opencode` or optional `opencode.pem` | PEM key; the helper's primary path |
| `OPENCODE_GH_APP_PRIVATE_KEY_B64GH` | `~/.local/bin/gh-opencode-token` | Phase `operations` / Production / `/github-apps/opencode` | Base64 fallback; the stored name keeps its `GH` suffix, and `_B64` is also accepted |

The helpers raise pull requests from the OpenCode harness as `gh-opencode[bot]` rather than as Josh. `gh-opencode-token` re-enters Phase with `phase run` when credentials are not already injected, requests a token limited to the target repository, decodes keys into mode-600 temporary files removed on exit, and emits a token only when GitHub returns the `ghs_` installation-token format and the installation reports `pull_requests: write`. The App holds `pull_requests: write`, `contents: write`, `actions: write`, and `metadata: read`.

`gh-opencode-pr` requires the branch to exist on the remote, creates the pull request with the bot token only, then re-reads it through REST and exits non-zero unless the author is `gh-opencode[bot]` with type `Bot` and the head/base refs match. `--dry-run` authenticates and validates without creating anything. Neither helper falls back to a saved user login.

Install `gh-opencode` on the target repository before use. Authoring was verified on 2026-10-25 by a throwaway pull request authored by the bot and then closed; both helpers pass `shellcheck -S warning`. Do not put local App credentials in the repository or chat.

## Built-in token

`GITHUB_TOKEN` is supplied by GitHub Actions and is used only by the workflow steps that call GitHub. It is not a Phase-managed secret.
