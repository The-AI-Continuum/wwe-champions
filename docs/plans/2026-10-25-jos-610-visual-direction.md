# Plan — JOS-610: explore a championship-reference visual direction

- **Issue:** [JOS-610](https://linear.app/josh-muthumani/issue/JOS-610/wwe-champions-explore-a-distinctive-championship-reference-visual-direction) (Backlog, priority Low, `area: design`, `type: task`)
- **Repository:** joshmuthumani/wwe-champions
- **Status:** discovery / decision gate — no production redesign is approved
- **Timebox:** ~4 hours of agent work plus one human selection session
- **Date:** 2026-10-25
- **Reviewed against:** `origin/main` at `6c053fe`

## Outcome

Produce two or three comparable, content-identical visual directions for the dashboard, captured at desktop and mobile, so Josh can select one (or reject all) with evidence. Selection and constraints are recorded in Linear. **No selected direction is implemented under this ticket.**

## Why this is still open

The original review (commit `ae13694`, 18-record cache) raised three findings. The follow-up decision recorded on 2026-10-20 kept this as an optional future direction decision, and the usability work it deferred to is now Done (JOS-602, 603, 605, 606, 607, 608, 609, 612). Two of the three findings have since moved:

1. **Freshness before identity** — still live. The `Last updated …` row renders above the `<h1>` (`src/App.tsx:190-214`).
2. **Uniform card styling / generic type** — still live. Every card is the same `rounded-lg border border-white/10 bg-ink-850`, the app font is system Inter, and gold appears only on two small icons.
3. **Fixed 4:3 top crop** — **stale**. Portraits are now `h-20 w-16` mobile and `h-24 w-20` desktop with `object-top` (`src/ChampionCard.tsx:11-33`) against 540×640 sources, so the crop removes about 1% of the frame rather than a 4:3 slice. The remaining crop question is portrait *treatment*, not clipping.

Stale line references in the issue: `App.tsx#L210` (header, now `190-214`) and `App.tsx#L73` (crop, now `ChampionCard.tsx:11-33`); `styles.css#L5` is still approximately right (font stack at line 7).

## Constraints

- Keep the dark canvas and recognizable portraits; belts and photographs carry the visual richness.
- Freshness stays truthful and secondary — it never precedes the product name or the champion data.
- Preserve the checked-in 18-record cache as the only content. No scraper, data-shape, or search-behaviour changes.
- No new runtime dependencies; optional self-hosted display font is a decision, not an assumption.
- No horizontal page scrolling at 375px; focus states visible; reduced-motion behaviour unchanged.
- Tag-team records carry **one** image per team (`The Vision`, `The MFTs`, `The Vanity Project`, `Alexa Bliss & Tatum Paxley`) — no composite imagery exists, so no direction may depend on it.
- Long-content probes: `Women's Intercontinental Champion` (33 chars), `Alexa Bliss & Tatum Paxley` (26 chars), and `Zaria` (5 chars) in a 35-character title.
- Directions are exploration artifacts: they are deleted, not merged, once a direction is selected.

## Phase 0 — Baseline (30 min)

1. `npm run dev`; capture 1280 and 375 screenshots of the header, the first card row, the directory/filter row, and a no-match result.
2. Capture the same probes for the three long-content records above and for one tag-team record.
3. Record `document.scrollWidth` vs `window.innerWidth` at 375, 768, and 1280 as the no-scroll baseline.
4. Note current contrast pairs in use: `text-zinc-400` on `#18181b`, `text-gold-300` on `#09090a`, `text-white` on `#18181b`.

**Artifact:** baseline screenshot set attached to JOS-610.

## Phase 1 — Levers (30 min)

Write a short inventory, no visuals yet, covering:

- **Hierarchy:** placement of freshness, product name, champion count, and controls; what earns the largest type.
- **Typography:** display face for champion names vs tracked uppercase titles vs tabular metrics. Decide whether one self-hosted display face is worth it or whether size/weight/tracking alone can carry identity.
- **Portrait treatment:** frame, aspect, alignment, duotone/vignette; how a team photo and an initials fallback read at the same size.
- **Density:** card anatomy and metric placement; whether roster families become visible bands rather than a filter dropdown.
- **Chrome:** whether gold becomes an authored accent or stays utilitarian.

**Artifact:** one-page brief, pasted into JOS-610 before building.

## Phase 2 — Build directions (2 h)

Implement all directions on one throwaway branch (`explore/jos-610`), driven by a single switch so the same 18 records render under each:

- Add `data-direction="a|b|c"` to the page wrapper, read from `?direction=` only when `import.meta.env.DEV`; the default (no query parameter) is today's UI.
- Put direction-specific rules in a new `src/directions.css`, loaded next to `styles.css`.
- Prefer CSS-only differences (order, type scale, rules, frames, spacing). If a direction needs markup (e.g. roster bands), record it as an explicit cost rather than refactoring now.
- Never let a direction change production markup or default CSS.

Proposed directions — deliberately different hypotheses, not decoration variants:

- **A. Editorial title card.** Champion name is the hero in a tightly tracked display setting; title is a small uppercase kicker over a gold hairline; portrait keeps its 5:6 frame, larger and right-anchored on desktop with a soft bottom vignette; metrics sit in a two-column rule grid; freshness drops beneath the name in small caps.
- **B. Broadcast control.** Network-style bug in the header, roster families promoted to labelled bands with counts, denser cards with a three-cell metric strip, gold reserved for title-adjacent accents; strongest scan speed at 375.
- **C. Record book.** Archival treatment: serif champion names, small-caps titles, monospaced numerals, hairline separators, square portrait plates with a thin frame, freshness reduced to a footnote.

For each direction capture, with identical content:

- 1280 and 375 full-page screenshots.
- Long title, long champion name, short name.
- Tag-team record and the image-failure fallback (block `wwe.com` images once).
- Search-no-match state and keyboard focus ring.
- `scrollWidth` at 375/768/1280.

**Artifact:** `docs/plans/jos-610/directions/` screenshots (or Linear attachments) — one folder per direction.

## Phase 3 — Compare and decide (45 min)

1. Build a comparison table: identity strength, scan speed at 375, long-name behaviour, team-photo behaviour, implementation cost, risk.
2. Present A/B/C side by side with the baseline.
3. Decision gate with Josh: **select A, B, or C — or reject all.** Questions to resolve at the gate: display-face budget, whether roster bands are worth a structural change, how much gold is acceptable.
4. Record in JOS-610: selected direction, rejected alternatives, constraints carried into implementation. If the choice changes product identity materially, add an ADR under `docs/adr/` per `docs/agents/domain.md`.
5. If Josh rejects all, record that outcome and leave JOS-610 in Backlog — the item explicitly does not get closed or reprioritised by producing previews.

## Phase 4 — Handoff

- Open a new bounded implementation ticket for the selected direction (scope, files, acceptance criteria, verification). JOS-610's outcome is the recorded decision.
- Delete the preview branch and `directions.css`, or keep screenshots only.
- Implementation is out of scope here.

## Acceptance-criteria mapping

| AC | How it is satisfied |
|---|---|
| Comparable directions, same real content, mobile/desktop, long names, tag-team imagery | Phase 2 matrix: identical 18-record cache, 375 + 1280, three named probes, one team record |
| Each direction explains typography, layout/density, hierarchy, rationale | Phase 1 brief plus a per-direction note in Phase 3 comparison |
| Product identity and championship data precede freshness chrome | Every direction moves the freshness line below the `<h1>`; verified in the 375 and 1280 captures |
| Portrait crops preserve intentional compositions for individuals and teams | Portrait treatment documented per direction; team records and initials fallback captured |
| Josh's selected direction and constraints recorded before implementation; alternatives not approved scope | Phase 3 decision gate recorded in JOS-610 (and ADR if consequential); Phase 4 handoff ticket |

## Verification

- `npm run build` and `npm test` pass on the preview branch (no production behaviour changed).
- `python -m unittest discover -s tests -p 'test_*.py'` remains green (untouched).
- At 375px, `scrollWidth === innerWidth` on every direction and probe.
- Every direction keeps keyboard focus visible on search, roster select, reload, and source links.
- Text contrast meets 4.5:1 for body copy; any new gold-on-ink pairing is measured, not assumed.
- Freshness copy still matches what the snapshot actually knows (no claim of live data).
- No live WWE requests are added to tests or CI.

## Risks

- **Scope creep:** exploration can turn into a half-built redesign. Timebox and CSS-only bias are the guard; structural costs are estimated, not paid.
- **External portraits:** `wwe.com` image URLs can be slow or block; capture one fallback run so a direction is never judged on a missing photo.
- **Stale issue text:** the 4:3 crop finding no longer holds; the ticket must not carry it into implementation.
- **Decision ambiguity:** a preferred direction is not an approval. Only the recorded selection authorises implementation.

## Out of scope

- Implementing the selected direction.
- Scraper, cache schema, search/filter behaviour, or state handling.
- A design-token library, light theme, new pages, or navigation changes.
- Composite tag-team imagery or any new data field.
