import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest import mock

import scrape
from snapshot import CAGEMATCH_TITLES_URL, WWE_SUPERSTARS_URL, RecordedPageFetcher

FIXTURES = Path(__file__).parent / "fixtures"
TITLE_URL = "https://www.cagematch.net/?id=5&nr=20"
MATCHES_URL = "https://www.cagematch.net/?id=5&nr=20&page=5&reign=155"

SAMI_RECORD = {
    "titleName": "Undisputed WWE Champion",
    "championName": "Sami Zayn",
    "imageUrl": "https://www.wwe.com/f/styles/wwe_1_1_540/public/2026/10/Sami_Zayn_PROFILE.png",
    "championshipDate": "September 11, 2026",
    "daysAsChampion": 58,
    "defenseStatus": "known",
    "lastDefenseDate": "September 18, 2026",
    "daysSinceLastDefense": 50,
    "source": {"wweUrl": "https://www.wwe.com/superstars/sami-zayn", "cagematchUrl": TITLE_URL},
}
TIFFANY_RECORD = {
    "titleName": "WWE Women’s Champion",
    "championName": "Tiffany Stratton",
    "imageUrl": "https://www.wwe.com/f/styles/wwe_1_1_540/public/2026/08/Tiffany_Stratton_Profile.png",
    "championshipDate": "November 7, 2026",
    "daysAsChampion": 0,
    "defenseStatus": "none",
    "lastDefenseDate": None,
    "daysSinceLastDefense": None,
    "source": {"wweUrl": "https://www.wwe.com/superstars/tiffany-stratton", "cagematchUrl": "https://www.cagematch.net/?id=5&nr=2906"},
}
METADATA = '{\n  "generatedAt": "2026-10-31T09:00:00Z"\n}\n'
INDEX = '<meta property="og:image" content="https://www.wwe.com/old.png" />\n'


def recorded_pages() -> dict[str, str]:
    return {
        CAGEMATCH_TITLES_URL: (FIXTURES / "cagematch-titles.html").read_text(encoding="utf-8"),
        TITLE_URL: (FIXTURES / "cagematch-title-detail.html").read_text(encoding="utf-8"),
        MATCHES_URL: (FIXTURES / "cagematch-sami-reign155.html").read_text(encoding="utf-8"),
        WWE_SUPERSTARS_URL: (FIXTURES / "wwe-superstars.html").read_text(encoding="utf-8"),
    }


class RefreshTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.previous_cwd = os.getcwd()
        self.workdir = tempfile.TemporaryDirectory()
        os.chdir(self.workdir.name)
        Path("public").mkdir()

    def tearDown(self):
        os.chdir(self.previous_cwd)
        self.workdir.cleanup()

    def write_current_snapshot(self, records: list[dict]) -> dict[str, bytes]:
        Path("public/champions.json").write_text(json.dumps(records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        Path("public/metadata.json").write_text(METADATA, encoding="utf-8")
        Path("index.html").write_text(INDEX, encoding="utf-8")
        return self.published_bytes()

    def published_bytes(self) -> dict[str, bytes]:
        return {path: Path(path).read_bytes() for path in ["public/champions.json", "public/metadata.json", "index.html"]}

    async def test_refusal_exits_non_zero_names_missing_title_and_writes_nothing(self):
        before = self.write_current_snapshot([SAMI_RECORD, TIFFANY_RECORD])
        stderr = io.StringIO()
        with redirect_stderr(stderr):
            exit_code = await scrape.refresh(RecordedPageFetcher(recorded_pages()))

        self.assertNotEqual(exit_code, 0)
        self.assertEqual(self.published_bytes(), before)
        self.assertIn("WWE Women’s Champion", stderr.getvalue())
        self.assertIn('--accept-title "WWE Women’s Champion"', stderr.getvalue())

    async def test_empty_wwe_listing_exits_non_zero_and_writes_nothing(self):
        before = self.write_current_snapshot([SAMI_RECORD])
        pages = recorded_pages()
        pages[WWE_SUPERSTARS_URL] = "<html><body>Just a moment...</body></html>"
        with redirect_stderr(io.StringIO()):
            exit_code = await scrape.refresh(RecordedPageFetcher(pages))

        self.assertNotEqual(exit_code, 0)
        self.assertEqual(self.published_bytes(), before)

    async def test_accepted_retired_title_refresh_writes_snapshot_and_metadata(self):
        self.write_current_snapshot([SAMI_RECORD, TIFFANY_RECORD])
        exit_code = await scrape.refresh(RecordedPageFetcher(recorded_pages()), ["WWE Women’s Champion"])

        self.assertEqual(exit_code, 0)
        snapshot = json.loads(Path("public/champions.json").read_text(encoding="utf-8"))
        self.assertEqual([record["titleName"] for record in snapshot], ["Undisputed WWE Champion"])
        metadata = json.loads(Path("public/metadata.json").read_text(encoding="utf-8"))
        self.assertNotEqual(metadata["generatedAt"], "2026-10-31T09:00:00Z")
        self.assertEqual(sorted(os.listdir("public")), ["champions.json", "metadata.json"])

    async def test_interrupted_snapshot_write_leaves_snapshot_and_metadata_untouched(self):
        before = self.write_current_snapshot([SAMI_RECORD])
        real_replace = os.replace

        def failing_replace(source, target):
            if Path(target).name == "champions.json":
                raise OSError("disk full")
            real_replace(source, target)

        with mock.patch.object(scrape.os, "replace", failing_replace):
            with self.assertRaises(OSError):
                await scrape.refresh(RecordedPageFetcher(recorded_pages()))

        self.assertEqual(self.published_bytes(), before)
        self.assertEqual(sorted(os.listdir("public")), ["champions.json", "metadata.json"])


if __name__ == "__main__":
    unittest.main()
