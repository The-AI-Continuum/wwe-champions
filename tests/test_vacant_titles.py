import unittest
from datetime import date
from pathlib import Path

from snapshot import CAGEMATCH_TITLES_URL, WWE_SUPERSTARS_URL, RecordedPageFetcher, build_snapshot

FIXTURES = Path(__file__).parent / "fixtures"
SPEED_URL = "https://www.cagematch.net/?id=5&nr=6760"
REFRESH_DATE = date(2026, 11, 8)


def pages(*, inactive=True, speed_holder=None, wwe_speed_holder=False):
    index_fixture = "cagematch-titles-vacant.html" if inactive else "cagematch-titles.html"
    titles = (FIXTURES / index_fixture).read_text(encoding="utf-8")
    if speed_holder:
        titles = titles.replace(
            "</tbody></table>",
            f'<tr><td>2</td><td><a href="?id=5&amp;nr=6760">WWE Speed Championship</a></td>'
            f'<td>{speed_holder}</td><td>01.11.2026</td></tr></tbody></table>',
            1,
        )
    wwe = (FIXTURES / "wwe-superstars.html").read_text(encoding="utf-8")
    if wwe_speed_holder:
        wwe += (
            '<div><a href="/superstars/a-town-down-under">'
            '<h1>A-Town Down Under</h1><p>WWE Speed Champion</p></a></div>'
        )
    return {CAGEMATCH_TITLES_URL: titles, WWE_SUPERSTARS_URL: wwe}


def speed_record():
    return {
        "titleName": "WWE Speed Champion",
        "championName": "A-Town Down Under",
        "championshipDate": "September 1, 2026",
        "daysAsChampion": 68,
        "source": {"wweUrl": "https://www.wwe.com/superstars/a-town-down-under", "cagematchUrl": SPEED_URL},
    }


class VacantTitleTests(unittest.IsolatedAsyncioTestCase):
    async def build(self, source_pages, current=()):
        return await build_snapshot(RecordedPageFetcher(source_pages), list(current), REFRESH_DATE)

    async def test_inactive_omitted_title_publishes_exact_vacant_shape(self):
        result = await self.build(pages(), [speed_record()])
        self.assertIsNone(result.refusal)
        vacant = next(record for record in result.snapshot if record["titleName"] == "WWE Speed Champion")
        self.assertEqual(vacant, {
            "titleName": "WWE Speed Champion", "championName": None, "vacant": True,
            "imageUrl": None, "championshipDate": None, "daysAsChampion": None,
            "lastDefenseDate": None, "daysSinceLastDefense": None,
            "source": {"wweUrl": "", "cagematchUrl": SPEED_URL},
        })

    async def test_omitted_held_title_is_still_refused(self):
        result = await self.build(pages(inactive=False, speed_holder="A-Town Down Under"), [speed_record()])
        self.assertIsNone(result.snapshot)
        self.assertEqual(result.refusal.missing_titles, ["WWE Speed Champion"])

    async def test_cagematch_outage_does_not_confirm_vacancy(self):
        source_pages = pages(inactive=False)
        source_pages.pop(CAGEMATCH_TITLES_URL)
        result = await self.build(source_pages, [speed_record()])
        self.assertIsNone(result.snapshot)
        self.assertIn("WWE Speed Champion", result.refusal.missing_titles)

    async def test_current_vacant_title_stays_vacant_when_still_omitted(self):
        current = {"titleName": "WWE Speed Champion", "championName": None, "vacant": True,
                   "source": {"wweUrl": "", "cagematchUrl": SPEED_URL}}
        result = await self.build(pages(), [current])
        self.assertIsNotNone(result.snapshot)
        self.assertEqual([record for record in result.snapshot if record["titleName"] == "WWE Speed Champion"][0]["vacant"], True)

    async def test_legacy_record_without_vacant_key_remains_a_normal_record(self):
        result = await self.build(pages(inactive=False), [])
        record = next(record for record in result.snapshot if record["titleName"] == "Undisputed WWE Champion")
        self.assertNotIn("vacant", record)
        self.assertEqual(record["championName"], "Sami Zayn")

    async def test_legacy_snapshot_entry_survives_cagematch_outage_unchanged_in_shape(self):
        source_pages = pages(inactive=False)
        source_pages.pop(CAGEMATCH_TITLES_URL)
        legacy = {
            "titleName": "Undisputed WWE Champion",
            "championName": "Sami Zayn",
            "championshipDate": "September 11, 2026",
            "source": {"wweUrl": "https://www.wwe.com/superstars/sami-zayn",
                       "cagematchUrl": "https://www.cagematch.net/?id=5&nr=20"},
        }
        result = await self.build(source_pages, [legacy])
        self.assertIsNotNone(result.snapshot)
        record = result.snapshot[0]
        self.assertNotIn("vacant", record)
        self.assertEqual(record["championName"], "Sami Zayn")
        self.assertEqual(record["daysAsChampion"], 58)

    async def test_current_vacancy_survives_cagematch_outage_but_held_omission_refuses(self):
        source_pages = pages(inactive=False)
        source_pages.pop(CAGEMATCH_TITLES_URL)
        vacant = {"titleName": "WWE Speed Champion", "championName": None, "vacant": True,
                  "imageUrl": None, "championshipDate": None, "daysAsChampion": None,
                  "lastDefenseDate": None, "daysSinceLastDefense": None,
                  "source": {"wweUrl": "", "cagematchUrl": SPEED_URL}}
        result = await self.build(source_pages, [vacant])
        self.assertIsNotNone(result.snapshot)
        self.assertEqual(result.snapshot[0], vacant)
        held_result = await self.build(source_pages, [speed_record()])
        self.assertIsNone(held_result.snapshot)
        self.assertEqual(held_result.refusal.missing_titles, ["WWE Speed Champion"])

    async def test_refill_during_cagematch_outage_is_refused(self):
        source_pages = pages(inactive=False, wwe_speed_holder=True)
        source_pages.pop(CAGEMATCH_TITLES_URL)
        vacant = {"titleName": "WWE Speed Champion", "championName": None, "vacant": True,
                  "source": {"wweUrl": "", "cagematchUrl": SPEED_URL}}
        result = await self.build(source_pages, [vacant])
        self.assertIsNone(result.snapshot)
        self.assertTrue(result.refusal.disagreements)

    async def test_inactive_titles_not_in_current_snapshot_are_not_added(self):
        source_pages = pages()
        source_pages[CAGEMATCH_TITLES_URL] += (
            '<div class="Caption">Inactive Titles</div><table><tbody>'
            '<tr><td>2</td><td><a href="?id=5&amp;nr=99999">Archived Division Championship</a></td>'
            '<td>INACTIVE</td><td>01.01.2000</td></tr></tbody></table>'
        )
        result = await self.build(source_pages, [speed_record()])
        self.assertIsNotNone(result.snapshot)
        self.assertNotIn("Archived Division Championship", [record["titleName"] for record in result.snapshot])

    async def test_refilled_title_uses_active_holder_and_reign_dates(self):
        source_pages = pages(speed_holder="A-Town Down Under", wwe_speed_holder=True)
        current = {"titleName": "WWE Speed Champion", "championName": None, "vacant": True,
                   "source": {"wweUrl": "", "cagematchUrl": SPEED_URL}}
        result = await self.build(source_pages, [current])
        self.assertIsNotNone(result.snapshot)
        held = next(record for record in result.snapshot if record["titleName"] == "WWE Speed Champion")
        self.assertNotIn("vacant", held)
        self.assertEqual(held["championName"], "A-Town Down Under")
        self.assertEqual(held["championshipDate"], "November 1, 2026")
        self.assertEqual(held["daysAsChampion"], 7)

    async def test_refill_on_wwe_while_cagematch_still_lists_the_title_inactive_is_refused(self):
        current = {"titleName": "WWE Speed Champion", "championName": None, "vacant": True,
                   "source": {"wweUrl": "", "cagematchUrl": SPEED_URL}}
        result = await self.build(pages(wwe_speed_holder=True), [current])

        self.assertIsNone(result.snapshot)
        self.assertEqual([item.title for item in result.refusal.disagreements], ["WWE Speed Champion"])
        self.assertIn("A-Town Down Under", result.refusal.message)

    async def test_vacancy_uses_the_inactive_row_for_the_records_own_cagematch_title(self):
        source_pages = pages()
        source_pages[CAGEMATCH_TITLES_URL] = source_pages[CAGEMATCH_TITLES_URL].replace(
            "</tbody></table></div></div>\n</div>",
            '<tr><td>22</td><td><a href="?id=5&amp;nr=1234">Speed Championship</a></td>'
            "<td>INACTIVE</td><td>01.01.2001</td></tr></tbody></table></div></div>\n</div>",
        )
        result = await self.build(source_pages, [speed_record()])

        vacant = next(record for record in result.snapshot if record["titleName"] == "WWE Speed Champion")
        self.assertEqual(vacant["source"]["cagematchUrl"], SPEED_URL)


if __name__ == "__main__":
    unittest.main()
