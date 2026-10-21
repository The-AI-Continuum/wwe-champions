# GitHub and local bot credentials

This inventory records credential names and consumers only. Secret values belong in Phase and are not stored in this repository.

## GitHub Actions

| Name | Consumer | Delivery target | Status |
|---|---|---|---|
| `OPENROUTER_CODE_REVIEW_KEY` | `.github/workflows/ci.yml` — mandatory OCR review | Repository Actions secret | Present in Phase Operations / Production / `/openrouter` and repository Actions; OCR review passed on PR #16 |
| `OPENROUTER_PR_APPROVER_KEY` | `.github/workflows/independent-review.yml` — external PR-Agent review | Repository Actions secret | Present in Phase Operations / Production / `/openrouter` and repository Actions; external review passed on PR #16 |
| `CODE_REVIEW_AND_PR_BOT_APP_PRIVATE_KEY_B64` | `.github/workflows/pr-verdict.yml` — binding approval | `binding-approval` environment secret | Present in the `binding-approval` secret list per owner screenshot; value validity and environment restriction unverified |
| `CODE_REVIEW_AND_PR_BOT_REVIEW_APP_ID` | `.github/workflows/pr-verdict.yml` — binding approval App identity | `binding-approval` environment secret | Present in the `binding-approval` secret list per owner screenshot; App installation unverified |
| `OMP_GH_APP_ID` | `.github/workflows/refresh-data.yml` — weekly GH-OMP refresh PR | `refresh-data` environment secret | Required; environment is restricted to the `main` branch; Phase-to-Actions secret sync pending |
| `OMP_GH_APP_PRIVATE_KEY_B64` | `.github/workflows/refresh-data.yml` — weekly GH-OMP refresh PR | `refresh-data` environment secret | Required; environment is restricted to the `main` branch; Phase-to-Actions secret sync pending |
| `LINEAR_CI_READ_KEY` | `.github/workflows/work-item-link.yml` — Linear work-item validation | Repository Actions secret | Synced to repository Actions on 2026-10-21; `work-item-link` passed on PR #16 |

Phase is the intended source of Actions secret values. The OpenRouter review keys are present in Phase and repository Actions, and both review checks passed on PR #16. The `binding-approval` App secrets are present per the owner screenshot, but their value validity, App installation, and environment restriction remain unverified. `LINEAR_CI_READ_KEY` is synced to repository Actions and validation passed on PR #16. The weekly refresh workflow uses the shared GH-OMP App credentials only through the `refresh-data` environment, whose deployment policy is restricted to the `main` branch. Sync `OMP_GH_APP_ID` and `OMP_GH_APP_PRIVATE_KEY_B64` from Phase `operations` / Production / `/github-apps/omp` into that environment before the scheduled workflow can run. Keep the App ID as an Actions secret; do not duplicate it as a repository variable. Restrict the `binding-approval` environment to the default branch so pull-request workflows cannot access the reviewer private key.


## Local OMP authoring bot

| Name | Consumer | Delivery target | Status |
|---|---|---|---|
| `OMP_GH_APP_ID` | `~/.omp/bin/gh-omp-token` | Phase `operations` / Production / `/github-apps/omp` or optional local `gh-omp.env` | Phase injection used; local config not provisioned |
| `OMP_GH_APP_PRIVATE_KEY_B64` | `~/.omp/bin/gh-omp-token` | Phase `operations` / Production / `/github-apps/omp` or optional local `gh-omp.pem` | Phase-backed installation token successfully accessed this repository; no local PEM |
| `OMP_GH_APP_INSTALLATION_ID` | GH-OMP installation metadata | Phase `operations` / Production / `/github-apps/omp` | Metadata entry present; repository access verified by the token check |

The helper accepts Phase-injected `OMP_GH_APP_ID` and `OMP_GH_APP_PRIVATE_KEY_B64`; it decodes the key into a mode-600 temporary file and removes it on exit. It also supports optional local files for standalone use. It emits a token only when GitHub returns the `ghs_` installation-token format.

Install GH-OMP on the target repository before using the helper. `gh-omp-push` disables Git credential helpers and fails closed; it never falls back to Josh's GitHub login. Do not put local App credentials in the repository or chat.

## Built-in token

`GITHUB_TOKEN` is supplied by GitHub Actions and is used only by the workflow steps that call GitHub. It is not a Phase-managed secret.
