import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from scrape import (
    DEFENSE_KNOWN,
    DEFENSE_NONE,
    DEFENSE_UNAVAILABLE,
    CagematchTitle,
    DefenseLookup,
    WweChampion,
    combine_records,
    existing_cache_as_cagematch_titles,
    normalize_defense,
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
                self.assertEqual(parse_defense_from_matches(f"<table>{rows}</table>").status, DEFENSE_UNAVAILABLE)


def wwe(title: str = "Intercontinental Champion", champion: str = "Penta") -> WweChampion:
    return WweChampion(champion, title, "https://www.wwe.com/superstars/penta", "")


def cagematch(**overrides) -> CagematchTitle:
    fields = {
        "title_name": "Intercontinental Championship",
        "champion_name": "Penta",
        "championship_date": "August 2, 2026",
        "days_as_champion": 80,
        "cagematch_url": "https://www.cagematch.net/?id=5&nr=16",
    }
    return CagematchTitle(**{**fields, **overrides})


class CombineRecordsDefenseTests(unittest.TestCase):
    def setUp(self):
        class SnapshotDate(date):
            @classmethod
            def today(cls):
                return cls(2026, 10, 21)
        clock = patch("scrape.date", SnapshotDate)
        clock.start()
        self.addCleanup(clock.stop)

    def record(self, titles: list[CagematchTitle]) -> dict:
        return combine_records([wwe()], titles)[0]

    def test_known_defense_keeps_date_and_days(self):
        record = self.record([cagematch(defense_status=DEFENSE_KNOWN, last_defense_date="September 18, 2026")])

        self.assertEqual(record["defenseStatus"], DEFENSE_KNOWN)
        self.assertEqual(record["lastDefenseDate"], "September 18, 2026")
        self.assertGreater(record["daysSinceLastDefense"], 0)

    def test_defense_today_preserves_numeric_zero_days(self):
        today = "October 21, 2026"
        record = self.record([cagematch(defense_status=DEFENSE_KNOWN, last_defense_date=today)])

        self.assertEqual(record["daysSinceLastDefense"], 0)

    def test_confirmed_none_has_no_date_or_days(self):
        record = self.record([cagematch(defense_status=DEFENSE_NONE)])

        self.assertEqual(record["defenseStatus"], DEFENSE_NONE)
        self.assertIsNone(record["lastDefenseDate"])
        self.assertIsNone(record["daysSinceLastDefense"])

    def test_failed_lookup_is_unavailable(self):
        record = self.record([cagematch()])

        self.assertEqual(record["defenseStatus"], DEFENSE_UNAVAILABLE)
        self.assertIsNone(record["lastDefenseDate"])
        self.assertIsNone(record["daysSinceLastDefense"])

    def test_unmatched_title_is_unavailable_without_a_cagematch_source(self):
        record = self.record([cagematch(title_name="Completely Different Championship", champion_name="Someone Else")])

        self.assertEqual(record["defenseStatus"], DEFENSE_UNAVAILABLE)
        self.assertIsNone(record["lastDefenseDate"])
        self.assertEqual(record["source"]["cagematchUrl"], "")

    def test_inconsistent_status_and_date_never_becomes_none(self):
        self.assertEqual(normalize_defense(DEFENSE_NONE, "September 18, 2026"), DefenseLookup(DEFENSE_UNAVAILABLE))
        self.assertEqual(normalize_defense(DEFENSE_KNOWN, None), DefenseLookup(DEFENSE_UNAVAILABLE))
        self.assertEqual(normalize_defense("bogus", "September 18, 2026"), DefenseLookup(DEFENSE_UNAVAILABLE))


class ExistingCacheDefenseTests(unittest.TestCase):
    def read_cache(self, records: list[dict]) -> list[CagematchTitle]:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "champions.json"
            path.write_text(json.dumps(records), encoding="utf-8")
            return existing_cache_as_cagematch_titles(path)

    def item(self, **overrides) -> dict:
        record = {
            "titleName": "Intercontinental Champion",
            "championName": "Penta",
            "championshipDate": "August 2, 2026",
            "daysAsChampion": 80,
            "source": {"wweUrl": "https://www.wwe.com/superstars/penta", "cagematchUrl": "https://www.cagematch.net/?id=5&nr=16"},
        }
        return {**record, **overrides}

    def test_legacy_no_defense_text_is_ambiguous_and_reads_back_unavailable(self):
        titles = self.read_cache([self.item(lastDefenseDate="No Title Defenses Yet", daysSinceLastDefense=None)])

        self.assertEqual(titles[0].defense_status, DEFENSE_UNAVAILABLE)
        self.assertIsNone(titles[0].last_defense_date)

    def test_legacy_defense_date_without_status_is_known(self):
        titles = self.read_cache([self.item(lastDefenseDate="September 18, 2026", daysSinceLastDefense=33)])

        self.assertEqual(titles[0].defense_status, DEFENSE_KNOWN)
        self.assertEqual(titles[0].last_defense_date, "September 18, 2026")

    def test_explicit_none_survives_a_cache_round_trip(self):
        titles = self.read_cache([self.item(defenseStatus="none", lastDefenseDate=None, daysSinceLastDefense=None)])

        self.assertEqual(titles[0].defense_status, DEFENSE_NONE)
        self.assertIsNone(titles[0].last_defense_date)

    def test_checked_in_cache_records_without_a_status_never_read_back_as_none(self):
        path = Path("public/champions.json")
        legacy = [
            item
            for item in json.loads(path.read_text(encoding="utf-8"))
            if "defenseStatus" not in item and item["source"].get("cagematchUrl")
        ]
        titles = existing_cache_as_cagematch_titles(path)
        statuses = {title.defense_status for title in titles if title.cagematch_url in {i["source"]["cagematchUrl"] for i in legacy}}

        self.assertNotIn(DEFENSE_NONE, statuses)


if __name__ == "__main__":
    unittest.main()
