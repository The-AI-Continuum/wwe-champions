# CI credential inventory

This inventory records credential names and consumers only. Secret values belong in Phase and are not stored in this repository.

| Name | Consumer | Source and delivery | Status |
|---|---|---|---|
| `LINEAR_CI_READ_KEY` | `.github/workflows/work-item-link.yml` — read-only Linear issue validation | Phase Operations / Production / `/linear`; repository Actions secret | Present in Phase; repository Actions sync must be confirmed before requiring this check |

The workflow needs this key to verify PR references against the JOS Linear team. Keep it read-only and do not print, commit, or expose its value. The work-item workflow is introduced separately before any CI workflow makes its status required, because `pull_request_target` runs trusted base-branch code and cannot validate the first PR that adds the workflow itself.
