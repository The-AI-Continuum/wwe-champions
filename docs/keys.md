# GitHub and local bot credentials

This inventory records credential names and consumers only. Secret values belong in Phase and are not stored in this repository.

## GitHub Actions

| Name | Consumer | Delivery target | Status |
|---|---|---|---|
| `OPENROUTER_CODE_REVIEW_KEY` | `.github/workflows/ci.yml` — mandatory OCR review | Repository Actions secret | Present in the Actions secret list per owner screenshot; successful review unverified |
| `OPENROUTER_PR_APPROVER_KEY` | `.github/workflows/ci.yml` and `.github/workflows/independent-review.yml` — PR-Agent reviews | Repository Actions secret | Present in the Actions secret list per owner screenshot; successful review unverified |
| `CODE_REVIEW_AND_PR_BOT_APP_PRIVATE_KEY_B64` | `.github/workflows/pr-verdict.yml` — binding approval | `binding-approval` environment secret | Present in the `binding-approval` secret list per owner screenshot; value validity and environment restriction unverified |
| `CODE_REVIEW_AND_PR_BOT_REVIEW_APP_ID` | `.github/workflows/pr-verdict.yml` — binding approval App identity | `binding-approval` environment secret | Present in the `binding-approval` secret list per owner screenshot; App installation unverified |

Phase is the intended source of Actions secret values. The project's exact Phase path and GitHub sync state have not been verified. Keep the App ID as an Actions secret; do not duplicate it as a repository variable. The `binding-approval` environment must be restricted to the default branch so pull-request workflows cannot access the reviewer private key.

## Local OMP authoring bot

| Name | Consumer | Delivery target | Status |
|---|---|---|---|
| `APP_ID` | `~/.omp/bin/gh-omp-token` | `~/.omp/secrets/gh-omp.env` | OMP App ID exists in Phase metadata; local helper config not provisioned |
| GH-OMP App private key | `~/.omp/bin/gh-omp-token` | `~/.omp/secrets/gh-omp.pem` (mode `600`) | Private-key secret exists in Phase metadata; local PEM not provisioned |
| `OMP_GH_APP_INSTALLATION_ID` | GH-OMP installation | Phase `operations` / Production / `/github-apps/omp` | Phase metadata entry exists; installation on this repository not verified |

Phase metadata lists `OMP_GH_APP_ID`, `OMP_GH_APP_PRIVATE_KEY_B64`, and `OMP_GH_APP_INSTALLATION_ID` at `operations` / Production / `/github-apps/omp`. No values were read or copied. The local helper still requires `APP_ID` in `gh-omp.env` and the PEM in `gh-omp.pem`; those local files are absent.

Install GH-OMP on the target repository before using the helper. `gh-omp-push` disables Git credential helpers and fails closed; it never falls back to Josh's GitHub login. Do not put local App credentials in the repository or chat.

## Built-in token

`GITHUB_TOKEN` is supplied by GitHub Actions and is used only by the workflow steps that call GitHub. It is not a Phase-managed secret.
