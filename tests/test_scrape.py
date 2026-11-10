import json
import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest import mock
from zoneinfo import ZoneInfo

import scrape

from snapshot import (
    DEFENSE_KNOWN,
    DEFENSE_NONE,
    DEFENSE_UNAVAILABLE,
    DefenseLookup,
    RecordedPageFetcher,
    build_snapshot,
    parse_defense_from_matches,
)


class ParseLastDefenseFromMatchesTests(unittest.TestCase):
    def test_returns_the_date_when_current_reign_has_one_defense(self):
        html = """
        <table>
          <tr><th>No.</th><th>Date</th><th>Match</th></tr>
          <tr><td>1</td><td>11.09.2026</td><td></td><td>WWE Women's Title: Chelsea Green (c) defeats Nia Jax</td></tr>
        </table>
        """

        self.assertEqual(parse_defense_from_matches(html), DefenseLookup(DEFENSE_KNOWN, "September 11, 2026"))

    def test_recorded_upstream_match_table_preserves_latest_defense(self):
        path = Path(__file__).parent / "fixtures" / "cagematch-sami-reign155.html"
        self.assertEqual(
            parse_defense_from_matches(path.read_text(encoding="utf-8")),
            DefenseLookup(DEFENSE_KNOWN, "September 18, 2026"),
        )

    def test_does_not_count_the_current_reign_title_change_as_a_defense(self):
        html = """
        <table>
          <tr><th>No.</th><th>Date</th><th>Match</th></tr>
          <tr><td>1</td><td>10.10.2026</td><td></td><td>Women's World Title: Liv Morgan defeats Becky Lynch (c) - TITLE CHANGE !!!</td></tr>
        </table>
        """

        self.assertEqual(parse_defense_from_matches(html), DefenseLookup(DEFENSE_NONE))

    def test_uses_the_latest_defense_and_skips_the_reign_start(self):
        html = """
        <table>
          <tr><th>No.</th><th>Date</th><th>Match</th></tr>
          <tr><td>1</td><td>18.09.2026</td><td></td><td>Undisputed WWE Title: Sami Zayn (c) defeats Kevin Owens</td></tr>
          <tr><td>2</td><td>11.09.2026</td><td></td><td>Undisputed WWE Title: Sami Zayn defeats CM Punk (c) - TITLE CHANGE !!!</td></tr>
        </table>
        """

        self.assertEqual(parse_defense_from_matches(html), DefenseLookup(DEFENSE_KNOWN, "September 18, 2026"))

    def test_unrelated_tables_do_not_hide_the_current_reign_match_table(self):
        for description, expected in [
            ("Title: A (c) defeats B", DefenseLookup(DEFENSE_KNOWN, "September 18, 2026")),
            ("Title: A defeats B (c) - TITLE CHANGE", DefenseLookup(DEFENSE_NONE)),
        ]:
            html = f"""
            <table><tr><td>Sidebar</td><td>Navigation</td></tr></table>
            <table>
              <tr><td>No.</td><td>Date</td><td>Match</td></tr>
              <tr><td>1</td><td>18.09.2026</td><td>{description}</td></tr>
            </table>
            <table><tr><td>1</td><td>Pagination</td></tr></table>
            """
            with self.subTest(expected=expected):
                self.assertEqual(parse_defense_from_matches(html), expected)

    def test_empty_or_blocked_listing_is_unavailable_not_none(self):
        for html in [
            "",
            "<html><body>Just a moment...</body></html>",
            "<table><tr><th>No.</th><th>Date</th><th>Match</th></tr></table>",
        ]:
            with self.subTest(html=html):
                self.assertEqual(parse_defense_from_matches(html), DefenseLookup(DEFENSE_UNAVAILABLE))

    def test_defense_with_unparseable_date_is_unavailable(self):
        html = """
        <table>
          <tr><th>No.</th><th>Date</th><th>Match</th></tr>
          <tr><td>1</td><td>soon</td><td></td><td>Title: A (c) defeats B</td></tr>
          <tr><td>2</td><td>11.09.2026</td><td></td><td>Title: A defeats C (c) - TITLE CHANGE !!!</td></tr>
        </table>
        """

        self.assertEqual(parse_defense_from_matches(html), DefenseLookup(DEFENSE_UNAVAILABLE))

    def test_truncated_or_undated_rows_do_not_prove_no_defenses(self):
        for rows in [
            "<tr><td>1</td></tr>",
            "<tr><td>1</td><td>unknown</td><td>TITLE CHANGE</td></tr>",
            "<tr><td>1</td><td>10.10.2026</td><td>TITLE CHANGE</td></tr><tr><td>2</td></tr>",
        ]:
            with self.subTest(rows=rows):
                html = f"<table><tr><th>No.</th><th>Date</th><th>Match</th></tr>{rows}</table>"
                self.assertEqual(parse_defense_from_matches(html).status, DEFENSE_UNAVAILABLE)

    def test_missing_ordinals_or_incomplete_numbering_never_confirm_none(self):
        for rows in [
            "<tr><td></td><td>11.10.2026</td><td>Title defense</td></tr><tr><td>2</td><td>10.10.2026</td><td>TITLE CHANGE</td></tr>",
            "<tr><td>2</td><td>10.10.2026</td><td>TITLE CHANGE</td></tr>",
        ]:
            with self.subTest(rows=rows):
                html = f"<table><tr><th>No.</th><th>Date</th><th>Match</th></tr>{rows}</table>"
                self.assertEqual(parse_defense_from_matches(html).status, DEFENSE_UNAVAILABLE)


class BuildSnapshotTests(unittest.IsolatedAsyncioTestCase):
    title_index_url = "https://www.cagematch.net/?id=8&nr=1&page=9"
    title_url = "https://www.cagematch.net/?id=5&nr=20"
    matches_url = "https://www.cagematch.net/?id=5&nr=20&page=5&reign=155"
    wwe_url = "https://www.wwe.com/superstars"

    def pages(self, *, title_index_available: bool = True) -> dict[str, str]:
        fixtures = Path(__file__).parent / "fixtures"
        pages = {
            self.title_url: (fixtures / "cagematch-title-detail.html").read_text(encoding="utf-8"),
            self.matches_url: (fixtures / "cagematch-sami-reign155.html").read_text(encoding="utf-8"),
            self.wwe_url: (fixtures / "wwe-superstars.html").read_text(encoding="utf-8"),
        }
        if title_index_available:
            pages[self.title_index_url] = (fixtures / "cagematch-titles.html").read_text(encoding="utf-8")
        return pages

    def current_record(self) -> dict:
        return {
            "titleName": "Undisputed WWE Champion",
            "championName": "Sami Zayn",
            "championshipDate": "September 11, 2026",
            "daysAsChampion": 58,
            "source": {
                "wweUrl": "https://www.wwe.com/superstars/sami-zayn",
                "cagematchUrl": self.title_url,
            },
        }

    def second_title_record(self) -> dict:
        return {
            "titleName": "WWE Women’s Champion",
            "championName": "Tiffany Stratton",
            "championshipDate": "November 7, 2026",
            "daysAsChampion": 0,
            "defenseStatus": "none",
            "source": {
                "wweUrl": "https://www.wwe.com/superstars/tiffany-stratton",
                "cagematchUrl": "https://www.cagematch.net/?id=5&nr=2906",
            },
        }

    async def test_builds_champion_record_and_normalizes_defense(self):
        result = await build_snapshot(
            RecordedPageFetcher(self.pages()),
            [],
            date(2026, 11, 7),
        )

        self.assertIsNotNone(result.snapshot)
        self.assertEqual(result.fallbacks, [])
        self.assertEqual(len(result.snapshot), 1)
        record = result.snapshot[0]
        self.assertEqual(record["titleName"], "Undisputed WWE Champion")
        self.assertEqual(record["championName"], "Sami Zayn")
        self.assertEqual(record["championshipDate"], "September 11, 2026")
        self.assertEqual(record["daysAsChampion"], 57)
        self.assertEqual(record["defenseStatus"], DEFENSE_KNOWN)
        self.assertEqual(record["lastDefenseDate"], "September 18, 2026")
        self.assertEqual(record["daysSinceLastDefense"], 50)
        self.assertEqual(record["source"]["cagematchUrl"], self.title_url)
        self.assertEqual(record["source"]["wweUrl"], "https://www.wwe.com/superstars/sami-zayn")

    async def test_unavailable_title_index_uses_current_snapshot_as_titles(self):
        result = await build_snapshot(
            RecordedPageFetcher(self.pages(title_index_available=False)),
            [self.current_record()],
            date(2026, 11, 7),
        )

        self.assertIsNotNone(result.snapshot)
        self.assertEqual(len(result.snapshot), 1)
        self.assertEqual(result.snapshot[0]["titleName"], "Undisputed WWE Champion")
        self.assertEqual(result.snapshot[0]["championName"], "Sami Zayn")
        self.assertTrue(result.fallbacks)
        self.assertTrue(any("cagematch" in message.casefold() for message in result.fallbacks))

    async def test_cache_fallback_recounts_reign_length_from_the_reign_start_date(self):
        record = self.current_record()
        record["championshipDate"] = "August 2, 2026"
        record["daysAsChampion"] = 80
        result = await build_snapshot(
            RecordedPageFetcher(self.pages(title_index_available=False)),
            [record],
            date(2026, 11, 7),
        )

        self.assertEqual(result.snapshot[0]["championshipDate"], "August 2, 2026")
        self.assertEqual(result.snapshot[0]["daysAsChampion"], 97)

    async def test_missing_match_page_leaves_defense_unavailable(self):
        pages = self.pages()
        del pages[self.matches_url]
        result = await build_snapshot(RecordedPageFetcher(pages), [], date(2026, 11, 7))

        self.assertEqual(result.snapshot[0]["defenseStatus"], DEFENSE_UNAVAILABLE)
        self.assertIsNone(result.snapshot[0]["lastDefenseDate"])
        self.assertIsNone(result.snapshot[0]["daysSinceLastDefense"])

    async def test_current_snapshot_defense_facts_are_normalized(self):
        cases = [
            (None, "September 18, 2026", DEFENSE_KNOWN, "September 18, 2026", 50),
            (DEFENSE_NONE, None, DEFENSE_NONE, None, None),
            (DEFENSE_NONE, "September 18, 2026", DEFENSE_UNAVAILABLE, None, None),
            (DEFENSE_KNOWN, "No Title Defenses Yet", DEFENSE_UNAVAILABLE, None, None),
            (DEFENSE_KNOWN, "November 7, 2026", DEFENSE_KNOWN, "November 7, 2026", 0),
        ]
        for status, defense_date, expected_status, expected_date, expected_days in cases:
            with self.subTest(status=status, defense_date=defense_date):
                record = self.current_record()
                record["lastDefenseDate"] = defense_date
                if status is not None:
                    record["defenseStatus"] = status
                result = await build_snapshot(
                    RecordedPageFetcher(self.pages(title_index_available=False)),
                    [record],
                    date(2026, 11, 7),
                )

                built = result.snapshot[0]
                self.assertEqual(built["defenseStatus"], expected_status)
                self.assertEqual(built["lastDefenseDate"], expected_date)
                self.assertEqual(built["daysSinceLastDefense"], expected_days)

    async def test_empty_or_unavailable_wwe_listing_is_a_refusal_naming_every_current_title(self):
        current_snapshot = [self.current_record(), self.second_title_record()]
        for description, wwe_html in [
            ("interstitial", "<html><body>Just a moment...</body></html>"),
            ("unavailable", None),
        ]:
            with self.subTest(description):
                pages = self.pages()
                if wwe_html is None:
                    del pages[self.wwe_url]
                else:
                    pages[self.wwe_url] = wwe_html
                result = await build_snapshot(RecordedPageFetcher(pages), current_snapshot, date(2026, 11, 7))

                self.assertIsNone(result.snapshot)
                self.assertEqual(result.refusal.missing_titles, ["Undisputed WWE Champion", "WWE Women’s Champion"])
                self.assertIn("WWE Women’s Champion", result.refusal.message)

    async def test_empty_wwe_listing_is_a_refusal_even_without_a_current_snapshot(self):
        pages = self.pages()
        pages[self.wwe_url] = "<html><body>Just a moment...</body></html>"
        result = await build_snapshot(RecordedPageFetcher(pages), [], date(2026, 11, 7))

        self.assertIsNone(result.snapshot)
        self.assertIsNotNone(result.refusal)
        self.assertEqual(result.refusal.missing_titles, [])

    async def test_listing_missing_a_current_title_is_a_refusal_naming_exactly_it(self):
        result = await build_snapshot(
            RecordedPageFetcher(self.pages()),
            [self.current_record(), self.second_title_record()],
            date(2026, 11, 7),
        )

        self.assertIsNone(result.snapshot)
        self.assertEqual(result.refusal.missing_titles, ["WWE Women’s Champion"])
        self.assertIn("WWE Women’s Champion", result.refusal.message)
        self.assertNotIn("Undisputed", result.refusal.message)

    async def test_accepted_retired_title_is_left_out_of_the_new_snapshot(self):
        result = await build_snapshot(
            RecordedPageFetcher(self.pages()),
            [self.current_record(), self.second_title_record()],
            date(2026, 11, 7),
            accepted_titles=["WWE Women's Champion"],
        )

        self.assertIsNone(result.refusal)
        self.assertEqual([record["titleName"] for record in result.snapshot], ["Undisputed WWE Champion"])


class EveningRefreshClock(datetime):
    """A refresh at 20:30 on November 7 in Los Angeles, which is already November 8 in UTC."""

    instant = datetime(2026, 11, 8, 4, 30, tzinfo=timezone.utc)

    @classmethod
    def now(cls, tz=None):
        if tz is None:
            return cls.instant.astimezone(ZoneInfo("America/Los_Angeles")).replace(tzinfo=None)
        return cls.instant.astimezone(tz)

    @classmethod
    def today(cls):
        return cls.now()


class FakePlaywright:
    """Stands in for the browser so the refresh reads recorded pages instead."""

    def __init__(self):
        self.chromium = self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return False

    async def launch(self, **options):
        return self

    async def close(self):
        pass


class RefreshClockTests(unittest.IsolatedAsyncioTestCase):
    async def test_evening_refresh_counts_days_to_the_utc_date_matching_the_refresh_metadata(self):
        pages = BuildSnapshotTests().pages()
        with tempfile.TemporaryDirectory() as directory:
            output_path = Path(directory) / "public" / "champions.json"
            metadata_path = Path(directory) / "public" / "metadata.json"
            with mock.patch.object(scrape, "datetime", EveningRefreshClock), \
                    mock.patch.object(scrape, "async_playwright", FakePlaywright), \
                    mock.patch.object(scrape, "LivePageFetcher", lambda browser: RecordedPageFetcher(pages)), \
                    mock.patch.object(scrape, "OUTPUT_PATH", output_path), \
                    mock.patch.object(scrape, "METADATA_PATH", metadata_path), \
                    mock.patch.object(scrape, "INDEX_PATH", Path(directory) / "index.html"):
                await scrape.main()

            record = json.loads(output_path.read_text(encoding="utf-8"))[0]
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))

        self.assertEqual(metadata["generatedAt"], "2026-11-08T04:30:00Z")
        self.assertEqual(record["championshipDate"], "September 11, 2026")
        self.assertEqual(record["daysAsChampion"], 58)
        self.assertEqual(record["lastDefenseDate"], "September 18, 2026")
        self.assertEqual(record["daysSinceLastDefense"], 51)



if __name__ == "__main__":
    unittest.main()
