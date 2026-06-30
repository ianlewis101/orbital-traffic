#!/usr/bin/env python3
"""
update_iss_today.py
Fetches the current ISS crew roster and the most recent ISS activity
headlines from NASA's space station blog, and writes iss-today.json
in the repo root. Run locally or via GitHub Actions.
"""

import html
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

ASTROS_URL = "http://api.open-notify.org/astros.json"
RSS_URL = "https://blogs.nasa.gov/spacestation/feed/"

HEADERS = {
    "User-Agent": "OrbitalTraffic/1.0 (https://ianlewis101.github.io/orbital-traffic/)",
    "Accept": "application/rss+xml, application/xml, text/xml, application/json;q=0.9, */*;q=0.8",
}

MAX_HEADLINES = 3
LOOKBACK_HOURS = 48


def fetch_iss_crew() -> list:
    """Fetch the current ISS crew roster. Informational only — never fatal."""
    req = urllib.request.Request(ASTROS_URL, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"  Crew lookup failed ({e}) — continuing without it.")
        return []

    crew = [p["name"] for p in data.get("people", []) if p.get("craft") == "ISS"]
    print(f"  ISS crew ({len(crew)}): {', '.join(crew) if crew else 'none reported'}")
    return crew


def fetch_recent_headlines(max_items: int = MAX_HEADLINES, lookback_hours: int = LOOKBACK_HOURS) -> list:
    """
    Fetch the NASA space station blog RSS feed and return the most recent
    headlines published within the lookback window (falling back to the
    single most recent post if nothing falls inside that window).
    Raises on any failure — callers must treat that as fatal so the
    existing iss-today.json is left untouched.
    """
    req = urllib.request.Request(RSS_URL, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        xml_bytes = resp.read()

    root = ET.fromstring(xml_bytes)
    channel = root.find("channel")
    items = channel.findall("item") if channel is not None else []
    if not items:
        raise RuntimeError("RSS feed returned no items")

    cutoff = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)
    parsed = []
    for item in items:
        title_el = item.find("title")
        if title_el is None or not title_el.text:
            continue
        title = html.unescape(title_el.text.strip())

        pub_dt = None
        date_el = item.find("pubDate")
        if date_el is not None and date_el.text:
            try:
                pub_dt = parsedate_to_datetime(date_el.text.strip())
                if pub_dt.tzinfo is None:
                    pub_dt = pub_dt.replace(tzinfo=timezone.utc)
            except Exception:
                pub_dt = None

        parsed.append((pub_dt, title))

    if not parsed:
        raise RuntimeError("RSS feed items had no usable titles")

    in_window = [title for pub_dt, title in parsed if pub_dt and pub_dt >= cutoff]
    chosen = in_window if in_window else [title for _, title in parsed]
    return chosen[:max_items]


def detect_expedition(headlines: list, fallback: str) -> str:
    """Look for an explicit 'Expedition NN' mention; otherwise carry forward."""
    for text in headlines:
        m = re.search(r"Expedition\s+(\d+)", text)
        if m:
            return f"Expedition {m.group(1)}"
    return fallback


def load_existing(path: str) -> dict:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def main():
    path = "apps/web/public/data/iss-today.json"
    print(f"\n=== ISS Today Update — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} ===\n")

    existing = load_existing(path)
    fallback_expedition = existing.get("expedition", "Expedition 74")

    print("Checking ISS crew roster:")
    fetch_iss_crew()

    print("\nFetching recent ISS activity from NASA blog feed:")
    try:
        headlines = fetch_recent_headlines()
    except Exception as e:
        print(f"  FAILED ({e})")
        print("  Leaving iss-today.json unchanged.")
        sys.exit(1)

    print(f"  Found {len(headlines)} headline(s):")
    for h in headlines:
        print(f"   - {h}")

    result = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "expedition": detect_expedition(headlines, fallback_expedition),
        "activities": headlines,
    }

    with open(path, "w", encoding="utf-8") as f:
        f.write(json.dumps(result, indent=2, ensure_ascii=False) + "\n")

    print(f"\n✓ Wrote {path}")


if __name__ == "__main__":
    main()
