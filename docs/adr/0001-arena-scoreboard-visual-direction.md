# ADR 0001 — Adopt the Arena Scoreboard visual direction

- **Status:** Accepted
- **Date:** 2026-10-25
- **Decision owner:** Josh Muthumani
- **Issues:** [JOS-610](https://linear.app/josh-muthumani/issue/JOS-610/wwe-champions-explore-a-distinctive-championship-reference-visual) (exploration and decision), [JOS-719](https://linear.app/josh-muthumani/issue/JOS-719/wwe-champions-adopt-the-arena-scoreboard-visual-direction) (implementation)
- **Amends:** JOS-605 for champion cards — cross-card metric alignment is released in this direction

## Context

JOS-610 produced five comparable visual directions from the same 18-record cache and the
same markup, captured at 1280, 768 and 375. All five passed the hard constraints: dark canvas,
real portraits, freshness below the product name, no horizontal scroll at 375, visible keyboard
focus, unchanged reduced-motion behaviour, no new runtime dependency. The comparison and
screenshots are attached to JOS-610.

Josh selected **E, Arena Scoreboard** (called "Arena Scorecard" in the selection). The direction
changes the card's hierarchy materially: it leads with reign length and treats the champion's
name as the caption. That is a product-identity decision, not a styling preference, so it is
recorded here before implementation.

## Decision

Adopt the Arena Scoreboard direction for the champion list:

- **Reign length is the hero value** in every card: 34px, 800 weight, tabular numerals, with a
  small gold uppercase label. The championship title is a 10px uppercase muted kicker; the
  champion's name is 17px at 700.
- **Dates follow the figure**: champion since and last defended side by side, then since defense
  or the defense-history state as a full-width row.
- **Portraits are 72×72 squares without a frame**, keeping the 5:6 source and `object-top` crop.
  Tag teams keep their single image. The image-failure fallback occupies the same 72×72 box.
- **Card chrome is flat**: canvas `#0a0a0c`, card `#141419`, 4px radius, 1px white/8% border, no
  shadow.
- **Gold is limited** to a 2px underline beneath the uppercase masthead, the reign-length label
  and focus rings. No other gold surface or accent is added without revisiting this record.
- **Freshness is last in the identity block** and follows the product name in DOM order as well
  as visually. It stays small, grey and truthful.

The visual reference for parity is the JOS-610 preview (`directions/e/`); intentional deviations
must be called out in the implementation PR.

## Consequences

**Positive**

- The card answers the first comparison question — how long has this reign lasted — without a
  click, and gives the page a specific arena-scoreboard identity with no font download and no new
  dependency.
- The hierarchy is data-driven and rank-free: it needs no new fields, no likes, no ordering.
- Moving the hero value also fixes a reading-order problem: implementation must reorder the
  description list in the DOM, so screen readers hear the same order sighted users see.

**Negative, accepted**

- The champion's name is no longer the card's hero. Finding a specific person by scan is slower
  at 375 than in the editorial (A) and record-book (C) directions. Search remains the fast path.
- **JOS-605's cross-card metric alignment is released for champion cards.** With a full-width
  hero row and variable presence of the since-defense row, neighbouring cards no longer share
  metric rows. Alignment inside a card is preserved; alignment across cards is not. This is a
  deliberate trade for the scoreboard hierarchy.
- A long reign receives visual prominence disproportionate to its importance. The page is a
  directory, not a ranking; the figure is a fact, not a league table.
- Portrait recognition depends on a 72px thumbnail. It is smaller than the incumbent card and
  much smaller than direction A; the belt and face must carry recognition at that size.

**Neutral**

- No display face is required. The direction relies on scale, weight, tracking and tabular
  numerals.
- The dark canvas, content model, search/filter behaviour and the 18-record cache are unchanged.

## Alternatives considered

| Direction | Why it was not selected |
|---|---|
| A. Editorial title card | Best portrait legibility and balance, and the recommended option, but the name-led hierarchy is closer to the incumbent identity. |
| B. Broadcast control | Fastest scan, but its strongest idea (roster bands) was unbuilt and it reads as a generic sports grid. |
| C. Record book | Most distinctive, but the slowest mobile read and dependent on an OS serif. |
| D. Belt plate | Most literal championship reference, but spends portrait space and turns gold into a surface. |
| Reject all five | Not chosen; the current page has no authored identity. |

## Constraints carried into implementation

Checked-in 18-record cache only; dark canvas; recognisable portraits and one image per tag team;
no horizontal page scroll at 375; visible focus states; reduced-motion behaviour unchanged; no new
runtime dependency; no scraper, data-shape or search-behaviour change; freshness truthful and
secondary.

## Links

- [JOS-610](https://linear.app/josh-muthumani/issue/JOS-610/wwe-champions-explore-a-distinctive-championship-reference-visual) — comparison, screenshots and the selection comment.
- [JOS-719](https://linear.app/josh-muthumani/issue/JOS-719/wwe-champions-adopt-the-arena-scoreboard-visual-direction) — bounded implementation ticket.
- Preview artifacts: local branch `explore/jos-610` at commit `8fb6e20`, `docs/plans/jos-610/`. The branch is not merged and is deleted once implementation lands.
