from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date
from difflib import SequenceMatcher
from typing import Collection, Protocol
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from dateutil import parser as date_parser

WWE_SUPERSTARS_URL = "https://www.wwe.com/superstars"
CAGEMATCH_TITLES_URL = "https://www.cagematch.net/?id=8&nr=1&page=9"
DEFENSE_KNOWN = "known"
DEFENSE_NONE = "none"
DEFENSE_UNAVAILABLE = "unavailable"
LEGACY_NO_DEFENSE_MARKER = "No Title Defenses Yet"
TITLE_SUFFIXES = [
    "Undisputed WWE Champion",
    "World Heavyweight Champion",
    "Women's World Champion",
    "WWE Women’s Champion",
    "WWE Women's Champion",
    "Intercontinental Champion",
    "United States Champion",
    "Women's Intercontinental Champion",
    "Women's United States Champion",
    "World Tag Team Champions",
    "WWE Tag Team Champions",
    "WWE Women's Tag Team Champions",
    "NXT Women's North American Champion",
    "NXT Women’s North American Champion",
    "NXT North American Champion",
    "NXT Women's Champion",
    "NXT Champion",
    "NXT Tag Team Champions",
    "WWE Women's Speed Champion",
    "WWE Speed Champion",
    "Evolve Men’s Champion",
    "Evolve Men's Champion",
    "Evolve Women’s Champion",
    "Evolve Women's Champion",
    "NXT Heritage Cup",
]


@dataclass
class WweChampion:
    champion_name: str
    title_name: str
    wwe_url: str
    image_url: str = ""


@dataclass
class CagematchTitle:
    title_name: str
    champion_name: str = ""
    championship_date: str | None = None
    days_as_champion: int | None = None
    last_defense_date: str | None = None
    cagematch_url: str = ""
    defense_status: str = DEFENSE_UNAVAILABLE


@dataclass
class DefenseLookup:
    status: str = DEFENSE_UNAVAILABLE
    date: str | None = None


@dataclass
class Refusal:
    """A refresh outcome that leaves the current snapshot exactly as it was."""

    missing_titles: list[str]

    @property
    def message(self) -> str:
        if not self.missing_titles:
            return "Refusal: the WWE.com champion listing was unavailable or listed no champions."
        return "Refusal: the WWE.com champion listing is missing current titles: " + "; ".join(self.missing_titles) + "."

    def __str__(self) -> str:
        return self.message


@dataclass
class RefreshResult:
    snapshot: list[dict] | None
    fallbacks: list[str] = field(default_factory=list)
    refusal: Refusal | None = None


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.replace("’", "'").replace("‘", "'").replace("&", " and ")
    value = re.sub(r"[^a-zA-Z0-9\s]", " ", value)
    value = re.sub(r"\bchampions\b", "champion", value, flags=re.IGNORECASE)
    value = re.sub(r"\btitle\b", "championship", value, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", value).strip().lower()


def title_to_championship(value: str) -> str:
    if normalize_text(value) == "nxt heritage cup":
        return "NXT Heritage Cup Championship"
    value = value.replace("Champions", "Championship").replace("Champion", "Championship")
    return re.sub(r"\s+", " ", value).strip()


def title_to_display(value: str) -> str:
    value = re.sub(r"\s+\d{4}\s*-\s*(Present|\d{4}).*$", "", value, flags=re.IGNORECASE)
    value = value.replace("Title", "Championship")
    return re.sub(r"\s+", " ", value).strip()


def similarity(left: str, right: str) -> float:
    return SequenceMatcher(None, normalize_text(left), normalize_text(right)).ratio()


def parse_date(value: str | None) -> date | None:
    if not value or value == LEGACY_NO_DEFENSE_MARKER:
        return None
    try:
        european_date = re.search(r"\b\d{1,2}\.\d{1,2}\.\d{4}\b", value)
        if european_date:
            return date_parser.parse(european_date.group(0), dayfirst=True).date()
        return date_parser.parse(value, fuzzy=True).date()
    except (ValueError, OverflowError):
        return None


def display_date(value: str | None) -> str | None:
    parsed = parse_date(value)
    return parsed.strftime("%B %-d, %Y") if parsed else None


def days_between(start: date | None, end: date) -> int | None:
    return max((end - start).days, 0) if start else None


def split_champion_title(text: str) -> tuple[str, str] | None:
    text = re.sub(r"\s+", " ", text).strip()
    for suffix in sorted(TITLE_SUFFIXES, key=len, reverse=True):
        if normalize_text(text).endswith(normalize_text(suffix)):
            champion = text[:-len(suffix)].strip()
            if champion:
                return champion, suffix
    return None


def absolute_wwe_url(url: str) -> str:
    return urljoin(WWE_SUPERSTARS_URL, url)


def extract_profile_image(soup: BeautifulSoup) -> str:
    for selector in [('meta', {'property': 'og:image'}), ('meta', {'name': 'twitter:image'})]:
        tag = soup.find(*selector)
        content = tag.get("content") if tag else ""
        if content:
            return str(content)
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        if src and not src.startswith("data:"):
            return absolute_wwe_url(src)
    return ""


def extract_listing_image(anchor) -> str:
    parent = anchor
    for _ in range(4):
        parent = parent.parent if parent else None
        if not parent:
            break
        if set(parent.get("class") or []).intersection({"talent-details", "championship-details", "field__item"}):
            image = parent.find("img")
            src = (image.get("src") or image.get("data-src")) if image else ""
            if src and not src.startswith("data:"):
                return absolute_wwe_url(src)
    return ""


def parse_wwe_champions(html: str) -> list[WweChampion]:
    soup = BeautifulSoup(html, "html.parser")
    champions: list[WweChampion] = []
    seen: set[tuple[str, str]] = set()
    for anchor in soup.find_all("a", href=True):
        parsed = split_champion_title(anchor.get_text(" ", strip=True))
        if not parsed:
            continue
        champion_name, title_name = parsed
        key = (normalize_text(champion_name), normalize_text(title_name))
        if key in seen:
            continue
        seen.add(key)
        champions.append(WweChampion(champion_name, title_name, absolute_wwe_url(anchor["href"]), extract_listing_image(anchor)))
    return champions


def find_current_reign_matches_url(html: str, title_url: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for anchor in soup.find_all("a", href=True):
        href = anchor["href"]
        if "id=5" in href and "page=5" in href and "reign=" in href:
            return urljoin(title_url, href)
    return ""


def parse_defense_from_matches(html: str) -> DefenseLookup:
    """Classify a current-reign match listing as known, confirmed none, or unavailable."""
    soup = BeautifulSoup(html, "html.parser")
    match_tables = []
    for table in soup.find_all("table"):
        rows = [row for row in table.find_all("tr") if row.find_parent("table") is table]
        for header in rows:
            labels = [cell.get_text(" ", strip=True).lower().rstrip(".") for cell in header.find_all(["th", "td"], recursive=False)]
            if len(labels) >= 2 and labels[0] in ("no", "nr", "#") and labels[1] in ("date", "datum"):
                match_tables.append((rows, header))
                break
    if len(match_tables) != 1:
        return DefenseLookup()
    rows, header = match_tables[0]
    data_rows = [[cell.get_text(" ", strip=True) for cell in row.find_all("td", recursive=False)] for row in rows if row is not header and row.find("td", recursive=False)]
    if (not data_rows or [row[0] for row in data_rows] != [str(index) for index in range(1, len(data_rows) + 1)]
            or any(len(row) < 3 or not parse_date(row[1]) or not " ".join(row[2:]).strip() for row in data_rows)):
        return DefenseLookup()
    defense_rows = [row for row in data_rows if not re.search(r"\bTITLE CHANGE\b", " ".join(row[2:]), re.IGNORECASE)]
    if not defense_rows:
        return DefenseLookup(DEFENSE_NONE) if len(data_rows) == 1 else DefenseLookup()
    defense_date = display_date(defense_rows[0][1])
    return DefenseLookup(DEFENSE_KNOWN, defense_date) if defense_date else DefenseLookup()


def extract_table_rows(soup: BeautifulSoup) -> list[list[str]]:
    rows = []
    for tr in soup.find_all("tr"):
        cells = [cell.get_text(" ", strip=True) for cell in tr.find_all(["th", "td"])]
        if any(cells):
            rows.append(cells)
    return rows


def find_title_url(soup: BeautifulSoup, title_name: str) -> str:
    target = normalize_text(title_name)
    for anchor in soup.find_all("a", href=True):
        if "id=5" in anchor["href"] and "nr=" in anchor["href"] and normalize_text(anchor.get_text(" ", strip=True)) == target:
            return urljoin("https://www.cagematch.net/", anchor["href"])
    return ""


def extract_active_cagematch_titles(soup: BeautifulSoup, refresh_date: date) -> list[CagematchTitle]:
    titles = []
    for row in extract_table_rows(soup):
        if len(row) < 4 or not row[0].isdigit():
            continue
        title_name = title_to_display(row[1])
        champion_name = re.sub(r"\s*\(\d+\)\s*$", "", row[2]).strip()
        since_text = row[3]
        since_date = display_date(since_text)
        days_match = re.search(r"\((\d+)\s*(?:Tage|days?)\)", since_text, flags=re.IGNORECASE)
        days_as_champion = int(days_match.group(1)) if days_match else days_between(parse_date(since_text), refresh_date)
        cagematch_url = find_title_url(soup, title_name)
        if title_name and champion_name and champion_name.upper() != "INACTIVE" and cagematch_url:
            titles.append(CagematchTitle(title_name, champion_name, since_date, days_as_champion, cagematch_url=cagematch_url))
    return titles


def match_cagematch(wwe: WweChampion, cagematch_titles: list[CagematchTitle]) -> CagematchTitle | None:
    wwe_title = title_to_championship(wwe.title_name)
    exact = [title for title in cagematch_titles if normalize_text(title.title_name) == normalize_text(wwe_title) or normalize_text(title.title_name) == normalize_text(wwe.title_name)]
    if exact:
        return best_champion_match(wwe, exact)
    scored = []
    for title in cagematch_titles:
        title_score = max(similarity(wwe.title_name, title.title_name), similarity(wwe_title, title.title_name))
        champion_score = similarity(wwe.champion_name, title.champion_name) if title.champion_name else 0.5
        score = title_score * 0.75 + champion_score * 0.25
        if title_score >= 0.74:
            scored.append((score, title))
    if not scored:
        return None
    scored.sort(key=lambda item: item[0], reverse=True)
    return scored[0][1] if scored[0][0] >= 0.68 else None


def best_champion_match(wwe: WweChampion, titles: list[CagematchTitle]) -> CagematchTitle:
    return max(titles, key=lambda title: similarity(wwe.champion_name, title.champion_name) if title.champion_name else 0)


def normalize_defense(status: object, date_text: object) -> DefenseLookup:
    defense_date = display_date(date_text) if isinstance(date_text, str) else None
    if status == DEFENSE_NONE:
        return DefenseLookup(DEFENSE_NONE) if not date_text else DefenseLookup()
    if status in (DEFENSE_KNOWN, None) and defense_date:
        return DefenseLookup(DEFENSE_KNOWN, defense_date)
    return DefenseLookup()


def current_snapshot_as_titles(current_snapshot: list[dict]) -> list[CagematchTitle]:
    titles = []
    for item in current_snapshot:
        source = item.get("source") if isinstance(item, dict) else {}
        if not isinstance(source, dict) or not source.get("cagematchUrl"):
            continue
        defense = normalize_defense(item.get("defenseStatus"), item.get("lastDefenseDate"))
        titles.append(CagematchTitle(
            title_name=title_to_championship(str(item.get("titleName") or "")),
            champion_name=str(item.get("championName") or ""),
            championship_date=item.get("championshipDate"),
            days_as_champion=item.get("daysAsChampion"),
            last_defense_date=defense.date,
            cagematch_url=str(source.get("cagematchUrl") or ""),
            defense_status=defense.status,
        ))
    return titles


def combine_records(wwe_champions: list[WweChampion], cagematch_titles: list[CagematchTitle], refresh_date: date) -> list[dict]:
    records = []
    for champion in wwe_champions:
        matched = match_cagematch(champion, cagematch_titles)
        championship_date = matched.championship_date if matched else None
        defense = normalize_defense(matched.defense_status, matched.last_defense_date) if matched else DefenseLookup()
        defense_date = parse_date(defense.date)
        reign_start = parse_date(championship_date)
        records.append({
            "titleName": champion.title_name,
            "championName": champion.champion_name,
            "imageUrl": champion.image_url,
            "championshipDate": championship_date,
            "daysAsChampion": matched.days_as_champion if matched and matched.days_as_champion is not None else days_between(reign_start, refresh_date),
            "defenseStatus": defense.status,
            "lastDefenseDate": defense.date,
            "daysSinceLastDefense": days_between(defense_date, refresh_date) if defense_date else None,
            "source": {"wweUrl": champion.wwe_url, "cagematchUrl": matched.cagematch_url if matched else ""},
        })
    return records



class PageFetcher(Protocol):
    async def fetch(self, url: str) -> str | None: ...


class RecordedPageFetcher:
    """Serve pages from an exact URL-to-HTML recording."""

    def __init__(self, pages: dict[str, str]):
        self.pages = pages

    async def fetch(self, url: str) -> str | None:
        return self.pages.get(url)


async def build_snapshot(page_fetcher: PageFetcher, current_snapshot: list[dict], refresh_date: date, accepted_titles: Collection[str] = ()) -> RefreshResult:
    fallbacks: list[str] = []
    cagematch_html = await page_fetcher.fetch(CAGEMATCH_TITLES_URL)
    titles: list[CagematchTitle] = []
    if cagematch_html:
        soup = BeautifulSoup(cagematch_html, "html.parser")
        if "Active Titles" in soup.get_text("\n", strip=True):
            titles = extract_active_cagematch_titles(soup, refresh_date)
    scraped_titles_found = bool(titles)
    if not scraped_titles_found:
        titles = current_snapshot_as_titles(current_snapshot)
        fallbacks.append("Cagematch title index was unavailable or empty; using champion records from the current snapshot for Cagematch metadata.")
    if scraped_titles_found:
        for title in titles:
            if not title.cagematch_url:
                continue
            detail_html = await page_fetcher.fetch(title.cagematch_url)
            if not detail_html:
                continue
            matches_url = find_current_reign_matches_url(detail_html, title.cagematch_url)
            if not matches_url:
                continue
            matches_html = await page_fetcher.fetch(matches_url)
            if matches_html:
                lookup = parse_defense_from_matches(matches_html)
                title.defense_status, title.last_defense_date = lookup.status, lookup.date
    wwe_html = await page_fetcher.fetch(WWE_SUPERSTARS_URL)
    champions = parse_wwe_champions(wwe_html) if wwe_html is not None else []
    listed = {normalize_text(champion.title_name) for champion in champions}
    accepted = {normalize_text(title) for title in accepted_titles}
    missing_titles = [
        str(item["titleName"]) for item in current_snapshot
        if isinstance(item, dict) and item.get("titleName") and normalize_text(str(item["titleName"])) not in listed | accepted
    ]
    if not champions or missing_titles:
        return RefreshResult(None, fallbacks, Refusal(missing_titles))
    for champion in champions:
        if champion.image_url:
            continue
        profile_html = await page_fetcher.fetch(champion.wwe_url)
        if profile_html:
            champion.image_url = extract_profile_image(BeautifulSoup(profile_html, "html.parser"))
    return RefreshResult(combine_records(champions, titles, refresh_date), fallbacks)
