#!/usr/bin/env python3
"""Refresh public/champions.json from WWE.com and Cagematch."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import re
import sys
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Collection

from playwright.async_api import Browser, Error as PlaywrightError, TimeoutError, async_playwright

from snapshot import CAGEMATCH_TITLES_URL, PageFetcher, build_snapshot

OUTPUT_PATH = Path("public/champions.json")
METADATA_PATH = Path("public/metadata.json")
INDEX_PATH = Path("index.html")
USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
]



class LivePageFetcher:
    """Fetch pages with Playwright, handling upstream retries and interstitials."""

    def __init__(self, browser: Browser):
        self.browser = browser

    async def fetch(self, url: str) -> str | None:
        for attempt in range(3):
            context = None
            try:
                context = await self.browser.new_context(
                    user_agent=random.choice(USER_AGENTS),
                    viewport={"width": 1440, "height": 1200},
                    locale="en-US",
                    timezone_id="America/New_York",
                )
                page = await context.new_page()
                page.set_default_timeout(30_000)
                await page.goto(url, wait_until="domcontentloaded", timeout=60_000)
                proceed = page.get_by_text("Click to Proceed to Page")
                if await proceed.count():
                    await proceed.click(timeout=5_000)
                    await page.wait_for_load_state("domcontentloaded", timeout=20_000)
                    await page.wait_for_timeout(random.randint(900, 1600))
                await page.wait_for_timeout(random.randint(250, 700))
                html = await page.content()
                if url == CAGEMATCH_TITLES_URL and "Active Titles" not in html:
                    if attempt == 2:
                        return None
                    await asyncio.sleep(1)
                    continue
                return html
            except (PlaywrightError, TimeoutError):
                if attempt == 2:
                    return None
                await asyncio.sleep(1)
            finally:
                if context is not None:
                    await context.close()
        return None


async def refresh(page_fetcher: PageFetcher, accepted_titles: Collection[str] = ()) -> int:
    """Run one refresh: write a new snapshot and return 0, or report a refusal and return 1."""
    try:
        current_snapshot = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
        if not isinstance(current_snapshot, list):
            current_snapshot = []
    except (OSError, json.JSONDecodeError):
        current_snapshot = []

    result = await build_snapshot(page_fetcher, current_snapshot, date.today(), accepted_titles)

    for fallback in result.fallbacks:
        print(fallback)
    if result.refusal is not None:
        print(result.refusal.message, file=sys.stderr)
        print("Nothing was written; the current snapshot stays exactly as it was.", file=sys.stderr)
        if result.refusal.missing_titles:
            print("If a title was genuinely retired, accept its absence for one run with --accept-title (repeatable):", file=sys.stderr)
            for title in result.refusal.missing_titles:
                print(f'  python scrape.py --accept-title "{title}"', file=sys.stderr)
        return 1

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    write_atomically(OUTPUT_PATH, json.dumps(result.snapshot, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {len(result.snapshot)} champion records to {OUTPUT_PATH}")
    if result.snapshot[0].get("imageUrl"):
        update_og_image(result.snapshot[0]["imageUrl"])
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    write_atomically(METADATA_PATH, json.dumps({"generatedAt": generated_at}, indent=2) + "\n")
    print(f"Wrote refresh metadata to {METADATA_PATH}")
    return 0


async def main(accepted_titles: Collection[str] = ()) -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            return await refresh(LivePageFetcher(browser), accepted_titles)
        finally:
            await browser.close()


def write_atomically(path: Path, text: str) -> None:
    """Replace path with text so readers see either the old file or the complete new one."""
    handle = tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.", suffix=".tmp", delete=False)
    try:
        with handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(handle.name, 0o644)
        os.replace(handle.name, path)
    except BaseException:
        Path(handle.name).unlink(missing_ok=True)
        raise


def update_og_image(image_url: str) -> None:
    if not INDEX_PATH.exists():
        return
    html = INDEX_PATH.read_text(encoding="utf-8")
    updated = re.sub(
        r'(<meta\s+(?:property="og:image"|name="twitter:image")\s+content=")[^"]*(")',
        lambda match: match.group(1) + image_url + match.group(2),
        html,
    )
    if updated != html:
        write_atomically(INDEX_PATH, updated)
        print(f"Updated og:image to {image_url}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--accept-title",
        action="append",
        default=[],
        metavar="TITLE",
        help="Accept that a genuinely retired title is absent from the WWE.com listing for this run (repeatable).",
    )
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.accept_title)))
