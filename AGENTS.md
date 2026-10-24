# AGENTS.md

This repository may be worked on by interchangeable coding agents, including Claude Code,
Codex, OMP, and other compatible agents.

The repository is the authoritative source of truth.

Do not assume previous conversations, agent memory, or external context are correct unless
confirmed against the current repository.

## Brain Project Page Updates

> After a major commit that materially changes delivered functionality, settled scope, a durable
> product decision, roadmap, current status, or known limitations, update the project's Brain page
> in `~/Brain/Projects/` before handing off the work. Follow `~/Brain/System/templates/project.md`
> and its update rules in `~/Brain/System/brain-information-architecture.md`. Update the relevant
> section with confirmed facts and the current date; link to the repository or tracker for detail.
> Do not duplicate technical documentation or routine task state. For minor changes that do not
> alter these facts, no Brain page update is needed.

If Brain is unavailable in the working environment, include the project-page update in the
handoff for an environment with access.

## Development Workflow

Work generally follows four modes. These are modes, not mandatory stage gates.

### 1. Shape

Use when the problem or desired behavior is not sufficiently defined.

Typical activities:

- clarify the user problem
- understand constraints
- explore UX or architectural approaches
- identify tradeoffs
- define success criteria
- determine what should explicitly not be built

For substantial new features, use the Superpowers brainstorming workflow when available.

Small and obvious changes may skip this mode.

### 2. Plan

Use when implementation requires multiple meaningful steps or architectural decisions.

A useful plan
...