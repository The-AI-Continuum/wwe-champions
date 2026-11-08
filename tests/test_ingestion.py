"""Ingestion paths of a refresh, exercised with recorded upstream pages.

Fixtures are trimmed from a live refresh recorded on 2026-11-07:
- wwe-superstars-listing.html: six champion cards from the WWE and NXT sections.
- cagematch-titles-index.html: seven Active Titles rows and two Inactive Titles rows.
"""

import unittest
from datetime import date
from pathlib import Path

from snapshot import (
    CAGEMATCH_TITLES_URL,
    DEFENSE_KNOWN,
    DEFENSE_UNAVAILABLE,
    WWE_SUPERSTARS_URL,
    RecordedPageFetcher,
    build_snapshot,
)

FIXTURES = Path(__file__).parent / "fixtures"
REFRESH_DATE = date(2026, 11, 7)


def recorded_pages(*, title_index_available: bool = True) -> dict[str, str]:
    pages = {WWE_SUPERSTARS_URL: (FIXTURES / "wwe-superstars-listing.html").read_text(encoding="utf-8")}
    if title_index_available:
        pages[CAGEMATCH_TITLES_URL] = (FIXTURES / "cagematch-titles-index.html").read_text(encoding="utf-8")
    return pages


async def refresh(pages: dict[str, str], current_snapshot: list[dict] | None = None) -> list[dict]:
    result = await build_snapshot(RecordedPageFetcher(pages), current_snapshot or [], REFRESH_DATE)
    return result.snapshot


def by_champion(snapshot: list[dict]) -> dict[str, dict]:
    return {record["championName"]: record for record in snapshot}


class WweListingTests(unittest.IsolatedAsyncioTestCase):
    async def test_recorded_listing_yields_champion_title_pairs_in_listing_order(self):
        snapshot = await refresh(recorded_pages())

        self.assertEqual(
            [(record["championName"], record["titleName"]) for record in snapshot],
            [
                ("Sami Zayn", "Undisputed WWE Champion"),
                ("Roman Reigns", "World Heavyweight Champion"),
                ("Tiffany Stratton", "WWE Women’s Champion"),
                ("Penta & Je'Von Evans", "World Tag Team Champions"),
                ("Grayson Waller", "NXT Champion"),
                ("Harlem Lewis", "Evolve Men’s Champion"),
            ],
        )

    async def test_tag_team_card_keeps_its_profile_link_and_listing_image(self):
        tag_team = by_champion(await refresh(recorded_pages()))["Penta & Je'Von Evans"]

        self.assertEqual(tag_team["source"]["wweUrl"], "https://www.wwe.com/superstars/penta")
        self.assertEqual(tag_team["imageUrl"], "https://www.wwe.com/f/styles/wwe_1_1_540/public/2026/11/20261107_PentaJevon.png")


class CagematchTitlesIndexTests(unittest.IsolatedAsyncioTestCase):
    async def test_recorded_titles_index_gives_each_champion_record_its_active_title(self):
        snapshot = await refresh(recorded_pages())

        self.assertEqual(
            [(record["championName"], record["source"]["cagematchUrl"], record["championshipDate"]) for record in snapshot],
            [
                ("Sami Zayn", "https://www.cagematch.net/?id=5&nr=20", "September 11, 2026"),
                ("Roman Reigns", "https://www.cagematch.net/?id=5&nr=6069", "April 19, 2026"),
                ("Tiffany Stratton", "https://www.cagematch.net/?id=5&nr=2906", "November 7, 2026"),
                ("Penta & Je'Von Evans", "https://www.cagematch.net/?id=5&nr=61", "November 7, 2026"),
                ("Grayson Waller", "", None),
                ("Harlem Lewis", "https://www.cagematch.net/?id=5&nr=7436", "June 19, 2026"),
            ],
        )

    async def test_inactive_titles_are_skipped_even_when_their_name_matches_exactly(self):
        # Inactive "World Heavyweight Championship" and "World Tag Team Championship" are exact
        # name matches for these WWE cards; only the active WWE-branded titles may be used.
        records = by_champion(await refresh(recorded_pages()))

        self.assertEqual(records["Roman Reigns"]["source"]["cagematchUrl"], "https://www.cagematch.net/?id=5&nr=6069")
        self.assertEqual(records["Penta & Je'Von Evans"]["source"]["cagematchUrl"], "https://www.cagematch.net/?id=5&nr=61")

    async def test_unreadable_since_date_leaves_the_reign_start_date_empty(self):
        pages = recorded_pages()
        pages[CAGEMATCH_TITLES_URL] = pages[CAGEMATCH_TITLES_URL].replace(
            "19.04.2026&nbsp;&nbsp;(203&nbsp;Tage)", "xx.xx.xxxx"
        )
        roman = by_champion(await refresh(pages))["Roman Reigns"]

        self.assertEqual(roman["source"]["cagematchUrl"], "https://www.cagematch.net/?id=5&nr=6069")
        self.assertIsNone(roman["championshipDate"])


class TitleMatchingTests(unittest.IsolatedAsyncioTestCase):
    async def test_exact_title_match_after_normalization(self):
        records = by_champion(await refresh(recorded_pages()))

        # "Undisputed WWE Champion" -> "Undisputed WWE Championship"; curly apostrophe normalized.
        self.assertEqual(records["Sami Zayn"]["source"]["cagematchUrl"], "https://www.cagematch.net/?id=5&nr=20")
        self.assertEqual(records["Tiffany Stratton"]["source"]["cagematchUrl"], "https://www.cagematch.net/?id=5&nr=2906")

    async def test_exact_title_match_holds_when_cagematch_still_shows_the_previous_champion(self):
        # WWE.com shows a title change days before Cagematch: Cagematch still lists Chelsea Green.
        # The exact title match must win over the fuzzy lookalike "WWE NXT Women's Championship".
        # Since JOS-854 that disagreement is a refusal, so the title change is accepted for this run.
        pages = recorded_pages()
        pages[CAGEMATCH_TITLES_URL] = pages[CAGEMATCH_TITLES_URL].replace(
            "Tiffany Stratton</a> (2)", "Chelsea Green</a>"
        )
        result = await build_snapshot(RecordedPageFetcher(pages), [], REFRESH_DATE, accepted_titles=["WWE Women’s Champion"])
        tiffany = by_champion(result.snapshot)["Tiffany Stratton"]

        self.assertEqual(tiffany["source"]["cagematchUrl"], "https://www.cagematch.net/?id=5&nr=2906")

    async def test_cagematch_still_showing_the_previous_champion_is_a_refusal_naming_both_holders(self):
        pages = recorded_pages()
        pages[CAGEMATCH_TITLES_URL] = pages[CAGEMATCH_TITLES_URL].replace(
            "Tiffany Stratton</a> (2)", "Chelsea Green</a>"
        )
        result = await build_snapshot(RecordedPageFetcher(pages), [], REFRESH_DATE)

        self.assertIsNone(result.snapshot)
        for text in ["WWE Women’s Champion", "Tiffany Stratton", "Chelsea Green"]:
            self.assertIn(text, result.refusal.message)

    async def test_fuzzy_fallback_uses_the_champion_to_pick_between_similar_titles(self):
        # "Evolve Men's Champion" has no exact counterpart and reads closer to
        # "WWE EVOLVE Women's Championship"; the champion's name decides for "WWE EVOLVE Championship".
        records = by_champion(await refresh(recorded_pages()))

        self.assertEqual(records["Harlem Lewis"]["source"]["cagematchUrl"], "https://www.cagematch.net/?id=5&nr=7436")
        self.assertEqual(records["Harlem Lewis"]["championshipDate"], "June 19, 2026")

    async def test_title_without_a_cagematch_counterpart_is_unmatched(self):
        grayson = by_champion(await refresh(recorded_pages()))["Grayson Waller"]

        self.assertEqual(grayson["source"]["cagematchUrl"], "")
        self.assertIsNone(grayson["championshipDate"])
        self.assertEqual(grayson["defenseStatus"], DEFENSE_UNAVAILABLE)
        self.assertIsNone(grayson["lastDefenseDate"])


class CurrentSnapshotDefenseDateTests(unittest.IsolatedAsyncioTestCase):
    """When the Cagematch titles index is unavailable, defense facts come from the current snapshot."""

    def current_record(self, **defense) -> dict:
        return {
            "titleName": "Undisputed WWE Champion",
            "championName": "Sami Zayn",
            "championshipDate": "September 11, 2026",
            "source": {
                "wweUrl": "https://www.wwe.com/superstars/sami-zayn",
                "cagematchUrl": "https://www.cagematch.net/?id=5&nr=20",
            },
            **defense,
        }

    async def test_legacy_no_defense_marker_without_a_status_is_unavailable(self):
        sami = by_champion(await refresh(
            recorded_pages(title_index_available=False),
            [self.current_record(lastDefenseDate="No Title Defenses Yet")],
        ))["Sami Zayn"]

        self.assertEqual(sami["defenseStatus"], DEFENSE_UNAVAILABLE)
        self.assertIsNone(sami["lastDefenseDate"])
        self.assertIsNone(sami["daysSinceLastDefense"])

    async def test_unreadable_defense_date_is_unavailable(self):
        for status in (None, DEFENSE_KNOWN):
            with self.subTest(status=status):
                defense = {"lastDefenseDate": "xx.xx.xxxx"}
                if status is not None:
                    defense["defenseStatus"] = status
                sami = by_champion(await refresh(
                    recorded_pages(title_index_available=False),
                    [self.current_record(**defense)],
                ))["Sami Zayn"]

                self.assertEqual(sami["defenseStatus"], DEFENSE_UNAVAILABLE)
                self.assertIsNone(sami["lastDefenseDate"])
                self.assertIsNone(sami["daysSinceLastDefense"])


if __name__ == "__main__":
    unittest.main()
