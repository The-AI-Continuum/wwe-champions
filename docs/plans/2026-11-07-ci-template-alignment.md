# Plan — align wwe-champions CI with the current Brain template

- **Repository:** The-AI-Continuum/wwe-champions
- **Status:** implemented locally on 2026-11-07 (steps 1-7); not pushed, no PR opened. Post-merge throwaway-PR check still open.
- **Date:** 2026-11-07
- **Compared against:** `~/Brain/System/templates/github-workflows/` at Brain HEAD (clean tree)
- **Last repo sync with the template:** `3f81cf0` (2026-10-25, OCR validator), `f041f66` (2026-10-28, `OWNER_APPROVER_LOGIN`) and Brain PR #202 / `d8fb9ab` (2026-11-07, JOS-849 SAST code-analysis rulesets)

## Outcome

The four template workflows and both helper scripts match Brain, except for the intentional repo differences listed below. A throwaway PR that touches only PR-Agent-filtered files still reaches `Binding approval`.

## Intentional differences (keep)

| Difference | Reason |
|---|---|
| `runs-on: ubuntu-latest`, no `RUNS_ON_HEAVY` / `RUNS_ON_LIGHT` | Public repo on free hosted runners (ADR 0002; Brain `ci-runner-migration.md` wwe-champions row). |
| Python detection and `requirements*.txt` install include `.github/requirements-scraper.txt` | The scraper requirements live under `.github/`. |
| Extra `Dependency audit` job; `work-item-link.yml` | Both are required checks in ruleset `wwe-champions-required-checks`. |
| No `PR review (PR-Agent)` job in `ci.yml` | One external review check, `PR-Agent (external)` in `independent-review.yml` (`3b7db7e`). The template still ships the second job; that is a Brain-side inconsistency. |
| `REQUIRED_REVIEW_CHECK_NAMES` differs from the template | The list must stay identical in `independent-review.yml` and `pr-verdict.yml`. |

## Changes

Dependencies: step 1 lands first, because `pr-verdict.yml` runs from the default branch. Steps 2 and 3 land together, because the producer (`independent-review.yml`) and verifier (`pr-verdict.yml`) must agree.

| # | Change | Files | Brain source | Verify |
|---|---|---|---|---|
| 1 | Add the empty-coverage classifier; sync the OCR validator's job-rerun artifact fallback. | `.github/scripts/pr-agent-coverage.cjs` (new), `.github/scripts/validate-ocr-result.cjs` | `9692ce9`, `3aedf3c` | `diff` each file against `System/templates/github-workflows/scripts/`: no output. `npm test`: all pass. |
| 2 | Port the coverage snapshot step, the `tee pr-agent-review.log` capture, and the Phase 2 `skipped` / `no-reviewable-files` branch. | `.github/workflows/independent-review.yml` | `9692ce9` | `diff` against the template shows only the intentional rows above. |
| 3 | Port `reviewStatus`, the `skipped` acceptance, the trusted `classifyPrFiles` recompute, and gate the comment validation on `completed`. Refresh the stale runner comment at line 26. | `.github/workflows/pr-verdict.yml` | `9692ce9`, `7c674f1` | Same `diff` check. |
| 4 | Verify the gitleaks download by SHA-256; pin the Semgrep image by digest. | `.github/workflows/ci.yml`, `.github/workflows/security.yml` | `fb0886c` | `grep -n 'sha256sum -c' .github/workflows/ci.yml`; `grep -n 'semgrep/semgrep@sha256' .github/workflows/security.yml`. |
| 5 | Pin every `uses:` to the template's commit SHA with a version comment. For `work-item-link.yml` use the template's `github-script` SHA. | `.github/workflows/{ci,independent-review,pr-verdict,security,work-item-link}.yml` | `fb0886c` | `grep -rnE 'uses: [^ ]+@v[0-9]' .github/workflows` returns nothing. |
| 6 | Remove the disabled refresh workflow. The README already says the refresh runs locally and GitHub holds no GH-OMP credentials. | `.github/workflows/refresh-data.yml` (delete) | README "Generate Champion Data" | `gh api repos/The-AI-Continuum/wwe-champions/actions/workflows --jq '.workflows[] \| select(.path \| endswith("refresh-data.yml"))'` returns nothing after merge. |
| 7 | Bring `docs/keys.md` current: add `OWNER_APPROVER_LOGIN`, replace "the repository owner must approve", add a last-verified date, and add destination and canonical-source tables. | `docs/keys.md` | `System/templates/keys.md` | Every variable read by a workflow (`grep -rhoE 'vars\.[A-Z_]+' .github/workflows \| sort -u`) appears in `docs/keys.md`. |
| 8 | SAST runs Semgrep code-analysis rules (`p/default`, `p/typescript`, `p/python`, `p/github-actions`) instead of `p/secrets` (JOS-849). Fix the regex finding in the OCR validator; suppress the two true false positives with targeted `nosemgrep` comments. | `.github/workflows/security.yml`, `.github/scripts/validate-ocr-result.cjs`, `.github/workflows/pr-verdict.yml` | Brain PR #202 (`d8fb9ab`) | `diff` each file against the template: only the intentional rows above. The local Semgrep run with the pinned image exits 0. |

Steps 1 to 3 together cover the "touches only filtered files" fix. Step 4 to 7 can ship in the same PR as step 2 and 3, or separately.

## Delivery

1. PR A: step 1. Push with `gh-omp-push`, open with `gh-omp-pr`.
2. PR B: steps 2 to 7. Every `.github/` change requires an approving review from `joshmuthumani` (`OWNER_APPROVER_LOGIN`) before `Binding approval` passes.
3. After PR B merges, open a throwaway PR that changes only `package-lock.json` or `.gitignore`. Expected: `PR-Agent (external)` finishes as skipped. For `.gitignore` alone, `Binding approval` passes with no human review. For a lockfile, `Binding approval` blocks until `joshmuthumani` approves the current head and Independent Review is re-run. Close it unmerged.
4. The no-reviewable-files path is intentional for OCR and PR-Agent when their pinned filters exclude every changed file. Verified 2026-11-08 on a throwaway PR (#51): before Brain's lockfile rule, a lockfile-only PR reached `CLEAN` / `APPROVED` with only `code-review-and-pr-bot[bot]` approving, because the org `main-protection` ruleset requires one approval and does not name the reviewer. Brain's lockfile rule (PR #200) now requires the human approver for a lockfile-only skipped review. A PR that mixes reviewable files with a lockfile is still `completed` and not covered. `Dependency audit` detects known advisories; it does not establish lockfile integrity or benign intent.

## Risks and edge cases

- **Producer and verifier skew.** If `independent-review.yml` emits `skipped` before `pr-verdict.yml` accepts it on the default branch, every PR blocks. Land steps 2 and 3 in one PR.
- **The verdict gate runs from `main`.** Changes to `pr-verdict.yml` are not exercised by the PR that introduces them. The post-merge throwaway PR is the real test.
- **Pinned SHAs.** Copy them from the template rather than resolving tags, so the repo and Brain stay identical.
- **Ruleset.** `wwe-champions-required-checks` does not list `Build & test`, although the review gates wait on it. Whether to add it is a decision for Josh; this plan does not change the ruleset.
- **`AGENTS.md` and `CLAUDE.md`.** The repo copies are short stubs, not the 27 KB template. Whether this repo should carry the full template is also Josh's call; excluded here.
- **Stale `keycheck.yml` registration.** GitHub lists a workflow whose file no longer exists. It is cosmetic and cannot be fixed from the repo.
- **Refresh cadence.** The weekly refresh is a local scheduled task. After a PLE, a manual run is needed, as done on 2026-11-07.
