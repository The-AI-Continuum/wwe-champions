"""A refresh is a refusal when WWE.com and Cagematch disagree about a title's holder (JOS-854).

Fixtures are trimmed from the live refresh recorded on 2026-11-07:
- holders-wwe-listing.html: seven verbatim WWE.com champion cards, four of them tag teams.
- holders-cagematch-index.html: the matching seven Active Titles rows plus two Inactive Titles rows.
On that date every title agreed; the tag teams differ only in member order or a member list.
"""

import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stderr
from datetime import date, datetime, timezone
from pathlib import Path
from unittest import mock

import scrape
from snapshot import (
    CAGEMATCH_TITLES_URL,
    WWE_SUPERSTARS_URL,
    HolderDisagreement,
    RecordedPageFetcher,
    build_snapshot,
)

FIXTURES = Path(__file__).parent / "fixtures"
REFRESH_DATE = date(2026, 11, 8)
IC_URL = "https://www.cagematch.net/?id=5&nr=16"


def recorded_pages(*, title_index_available: bool = True) -> dict[str, str]:
    pages = {WWE_SUPERSTARS_URL: (FIXTURES / "holders-wwe-listing.html").read_text(encoding="utf-8")}
    if title_index_available:
        pages[CAGEMATCH_TITLES_URL] = (FIXTURES / "holders-cagematch-index.html").read_text(encoding="utf-8")
    return pages


def with_wwe_holder(pages: dict[str, str], old: str, new: str) -> dict[str, str]:
    """WWE.com shows a title change: one card's holder name is replaced."""
    listing = pages[WWE_SUPERSTARS_URL]
    assert listing.count(f"<h1>{old}</h1>") == 1, old
    pages[WWE_SUPERSTARS_URL] = listing.replace(f"<h1>{old}</h1>", f"<h1>{new}</h1>")
    return pages


async def build(pages: dict[str, str], current_snapshot: list[dict] | None = None, accepted_titles=()):
    return await build_snapshot(RecordedPageFetcher(pages), current_snapshot or [], REFRESH_DATE, accepted_titles)


class HolderAgreementTests(unittest.IsolatedAsyncioTestCase):
    async def test_recorded_pages_agree_including_tag_team_naming_differences(self):
        result = await build(recorded_pages())

        self.assertIsNone(result.refusal)
        records = {record["championName"]: record for record in result.snapshot}
        # Member order and a trailing member list are naming differences, not title changes.
        self.assertEqual(records["Penta & Je'Von Evans"]["source"]["cagematchUrl"], "https://www.cagematch.net/?id=5&nr=61")
        self.assertEqual(records["The MFTs"]["source"]["cagematchUrl"], "https://www.cagematch.net/?id=5&nr=3117")
        self.assertEqual(records["Michin & B-Fab"]["source"]["cagematchUrl"], "https://www.cagematch.net/?id=5&nr=4066")
        self.assertEqual(records["The Vanity Project"]["source"]["cagematchUrl"], "https://www.cagematch.net/?id=5&nr=1912")
        self.assertEqual(records["Ethan Page"]["championshipDate"], "November 2, 2026")

    async def test_title_change_on_wwe_before_cagematch_is_a_refusal_naming_both_holders(self):
        result = await build(with_wwe_holder(recorded_pages(), "Ethan Page", "Dominik Mysterio"))

        self.assertIsNone(result.snapshot)
        self.assertEqual(result.refusal.missing_titles, [])
        self.assertEqual(
            result.refusal.disagreements,
            [HolderDisagreement("Intercontinental Champion", "Dominik Mysterio", "Ethan Page")],
        )
        for text in ["Intercontinental Champion", "Dominik Mysterio", "Ethan Page"]:
            self.assertIn(text, result.refusal.message)
        self.assertNotIn("Raquel Rodriguez", result.refusal.message)

    async def test_every_disagreeing_title_is_listed(self):
        pages = with_wwe_holder(recorded_pages(), "Ethan Page", "Dominik Mysterio")
        pages = with_wwe_holder(pages, "Sami Zayn", "Cody Rhodes")
        result = await build(pages)

        self.assertEqual(
            result.refusal.disagreements,
            [
                HolderDisagreement("Undisputed WWE Champion", "Cody Rhodes", "Sami Zayn"),
                HolderDisagreement("Intercontinental Champion", "Dominik Mysterio", "Ethan Page"),
            ],
        )

    async def test_womens_title_is_never_compared_with_the_mens_title(self):
        # The Intercontinental holder shown on the Women's Intercontinental card is a disagreement
        # with Cagematch's Women's Intercontinental holder, not an agreement with the men's title.
        result = await build(with_wwe_holder(recorded_pages(), "Raquel Rodriguez", "Ethan Page"))

        self.assertEqual(
            result.refusal.disagreements,
            [HolderDisagreement("Women's Intercontinental Champion", "Ethan Page", "Raquel Rodriguez")],
        )

    async def test_a_near_match_tag_team_is_still_a_title_change(self):
        result = await build(with_wwe_holder(recorded_pages(), "Penta &amp; Je'Von Evans", "Penta &amp; Rey Fenix"))

        self.assertEqual(
            result.refusal.disagreements,
            [HolderDisagreement("World Tag Team Champions", "Penta & Rey Fenix", "Je'Von Evans & Penta")],
        )

    async def test_title_change_during_a_cagematch_outage_is_compared_with_the_current_snapshot(self):
        current = (await build(recorded_pages())).snapshot
        pages = with_wwe_holder(recorded_pages(title_index_available=False), "Ethan Page", "Dominik Mysterio")
        result = await build(pages, current)

        self.assertIsNone(result.snapshot)
        self.assertTrue(result.fallbacks)
        self.assertEqual(
            result.refusal.disagreements,
            [HolderDisagreement("Intercontinental Champion", "Dominik Mysterio", "Ethan Page")],
        )

    async def test_unchanged_holders_during_a_cagematch_outage_refresh(self):
        current = (await build(recorded_pages())).snapshot
        result = await build(recorded_pages(title_index_available=False), current)

        self.assertIsNone(result.refusal)
        self.assertEqual([record["championName"] for record in result.snapshot], [record["championName"] for record in current])

    async def test_accepted_disagreeing_title_publishes_the_new_holder_for_one_run(self):
        result = await build(
            with_wwe_holder(recorded_pages(), "Ethan Page", "Dominik Mysterio"),
            accepted_titles=["Intercontinental Champion"],
        )

        self.assertIsNone(result.refusal)
        record = next(record for record in result.snapshot if record["titleName"] == "Intercontinental Champion")
        self.assertEqual(record["championName"], "Dominik Mysterio")
        self.assertEqual(record["source"]["cagematchUrl"], IC_URL)

    async def test_accepting_one_disagreeing_title_does_not_accept_another(self):
        pages = with_wwe_holder(recorded_pages(), "Ethan Page", "Dominik Mysterio")
        pages = with_wwe_holder(pages, "Sami Zayn", "Cody Rhodes")
        result = await build(pages, accepted_titles=["Intercontinental Champion"])

        self.assertEqual(result.refusal.disagreements, [HolderDisagreement("Undisputed WWE Champion", "Cody Rhodes", "Sami Zayn")])


class HolderRefusalRefreshTests(unittest.IsolatedAsyncioTestCase):
    """scrape.refresh on a disagreement: exit non-zero, name both holders, write nothing."""

    def setUp(self):
        self.previous_cwd = os.getcwd()
        self.workdir = tempfile.TemporaryDirectory()
        os.chdir(self.workdir.name)
        Path("public").mkdir()
        self.clock = mock.patch.object(scrape, "datetime", wraps=datetime)
        fake_datetime = self.clock.start()
        fake_datetime.now.return_value = datetime(2026, 11, 8, 9, 0, tzinfo=timezone.utc)

    def tearDown(self):
        self.clock.stop()
        os.chdir(self.previous_cwd)
        self.workdir.cleanup()

    async def write_current_snapshot(self) -> dict[str, bytes]:
        current = (await build(recorded_pages())).snapshot
        Path("public/champions.json").write_text(json.dumps(current, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        Path("public/metadata.json").write_text('{\n  "generatedAt": "2026-11-01T09:00:00Z"\n}\n', encoding="utf-8")
        return self.published_bytes()

    def published_bytes(self) -> dict[str, bytes]:
        return {path: Path(path).read_bytes() for path in ["public/champions.json", "public/metadata.json"]}

    async def test_disagreement_exits_non_zero_names_both_holders_and_writes_nothing(self):
        for description, title_index_available in [("cagematch available", True), ("cagematch outage", False)]:
            with self.subTest(description):
                before = await self.write_current_snapshot()
                pages = with_wwe_holder(recorded_pages(title_index_available=title_index_available), "Ethan Page", "Dominik Mysterio")
                stderr = io.StringIO()
                with redirect_stderr(stderr), redirect_stdout_quiet():
                    exit_code = await scrape.refresh(RecordedPageFetcher(pages))

                self.assertNotEqual(exit_code, 0)
                self.assertEqual(self.published_bytes(), before)
                self.assertEqual(sorted(os.listdir("public")), ["champions.json", "metadata.json"])
                for text in ["Intercontinental Champion", "Dominik Mysterio", "Ethan Page", '--accept-title "Intercontinental Champion"']:
                    self.assertIn(text, stderr.getvalue())

    async def test_accepting_the_disagreeing_title_writes_for_that_run(self):
        await self.write_current_snapshot()
        pages = with_wwe_holder(recorded_pages(), "Ethan Page", "Dominik Mysterio")
        with redirect_stdout_quiet():
            exit_code = await scrape.refresh(RecordedPageFetcher(pages), ["Intercontinental Champion"])

        self.assertEqual(exit_code, 0)
        snapshot = json.loads(Path("public/champions.json").read_text(encoding="utf-8"))
        self.assertIn("Dominik Mysterio", [record["championName"] for record in snapshot])


def redirect_stdout_quiet():
    from contextlib import redirect_stdout

    return redirect_stdout(io.StringIO())


if __name__ == "__main__":
    unittest.main()
