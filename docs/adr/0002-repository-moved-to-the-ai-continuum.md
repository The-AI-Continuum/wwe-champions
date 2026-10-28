# ADR 0002 — Repository moved to The-AI-Continuum

- **Status:** Accepted
- **Date:** 2026-10-28
- **Decision owner:** Josh Muthumani
- **Issues:** [JOS-734](https://linear.app/josh-muthumani/issue/JOS-734) (verdict approver variable), [JOS-735](https://linear.app/josh-muthumani/issue/JOS-735) (this verify PR), part of JOS-727

## Context

The repository moved from `joshmuthumani/wwe-champions` to `The-AI-Continuum/wwe-champions` as part of the
CI runner migration (JOS-727). The workflows already ran on `ubuntu-latest` (public repository), so no
runner change was needed.

## Decision

- The `.github/` approver in `pr-verdict.yml` comes from the org variable `OWNER_APPROVER_LOGIN`
  (fallback: the repo owner), because an organization account cannot review.
- Branch protection is the repository ruleset `wwe-champions-required-checks`: the seven checks that the
  old branch protection required (strict mode kept on), plus the org ruleset `main-protection` for review rules.
  The old branch protection was deleted after its settings were backed up outside the repo.
- The Vercel project keeps deploying from the org repository.

## Consequences

Old links to `joshmuthumani/wwe-champions` redirect. Existing documents that name the old path
(for example the JOS-610 plan) stay as written.
