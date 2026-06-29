#!/usr/bin/env python3
"""
update_tles.py
Fetches fresh TLE data from CelesTrak and patches index.html in-place.
Run locally or via GitHub Actions.
"""

import re
import json
import sys
import time
import urllib.request
from datetime import datetime, timezone

# Correct CelesTrak GP data endpoints (gp.php format)
CELESTRAK = {
    "stations":      "https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP=stations",
    "navigation":    "https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP=gps-ops",
    "science":       "https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP=science",
    "geostationary": "https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP=geo",
    "starlink":      "https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP=starlink",
}

HEADERS = {
    "User-Agent": "OrbitalTraffic/1.0 (https://ianlewis101.github.io/orbital-traffic/)",
    "Accept": "text/plain",
}

# Primary crewed-station modules that may carry "stations". CelesTrak's
# GROUP=stations dump includes everything from debris to cubesats to cargo
# vehicles (Dragon CRS, Progress, Cygnus, Tianzhou) -- only these core
# module IDs, plus currently-docked crewed vehicles (matched by name),
# should keep the "stations" category. Everything else gets "other".
STATION_CORE_IDS = {"25544", "49044", "48274", "53239", "54216"}
CREW_VEHICLE_RE = re.compile(r"\bCREW\b|SOYUZ[- ]MS|SHENZHOU", re.IGNORECASE)


def correct_station_cat(norad_id: str, name: str, cat: str) -> str:
    if cat != "stations":
        return cat
    if norad_id in STATION_CORE_IDS:
        return "stations"
    if CREW_VEHICLE_RE.search(name):
        return "stations"
    return "other"


def fetch_tles(group: str, url: str) -> list:
    """Fetch TLE text from a URL and parse into sat objects."""
    print(f"  Fetching {group}...", end=" ", flush=True)
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"FAILED ({e})")
        return []

    lines = [l.strip() for l in text.splitlines() if l.strip()]
    sats = []
    i = 0
    while i + 2 < len(lines):
        name = lines[i]
        l1   = lines[i + 1]
        l2   = lines[i + 2]
        if l1.startswith("1 ") and l2.startswith("2 "):
            norad_id = l1[2:7].strip()
            cat = correct_station_cat(norad_id, name, group)
            sats.append({"name": name, "l1": l1, "l2": l2, "cat": cat})
            i += 3
        else:
            i += 1

    print(f"{len(sats)} satellites")
    return sats


def build_sat_json() -> str:
    """Fetch all groups and return a compact JSON array string."""
    all_sats = []
    for group, url in CELESTRAK.items():
        all_sats.extend(fetch_tles(group, url))
        time.sleep(1)  # be polite to CelesTrak between requests

    if not all_sats:
        raise RuntimeError("No satellites fetched — aborting to avoid wiping good data.")

    print(f"  Total: {len(all_sats)} satellites")
    return json.dumps(all_sats, separators=(",", ":"))


def patch_html(html_path: str, sat_json: str) -> bool:
    """
    Replace the satellite data array inside index.html.
    Tries three strategies in order:
      1. Sentinel comments  /* SATS_DATA_START */ [...] /* SATS_DATA_END */
      2. Original build marker  /*__SATS__*/[...]
      3. Pattern-match on TLE field signatures
    """
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()

    original = html

    # Strategy 1 — sentinel comments (most reliable after first run)
    s1 = re.compile(r"/\* SATS_DATA_START \*/\[.*?\]/\* SATS_DATA_END \*/", re.DOTALL)
    if s1.search(html):
        html = s1.sub(f"/* SATS_DATA_START */{sat_json}/* SATS_DATA_END */", html)
        print("  Patched via sentinel comments.")

    # Strategy 2 — original build-script marker preserved in file
    elif re.search(r"/\*__SATS__\*/\[", html):
        s2 = re.compile(r"/\*__SATS__\*/\[.*?\]", re.DOTALL)
        html = s2.sub(f"/*__SATS__*/{sat_json}", html)
        print("  Patched via __SATS__ build marker.")

    # Strategy 3 — locate the TLE array by distinctive field signatures
    else:
        s3 = re.compile(
            r'(\[\{"name":"[^"]+","l1":"1 \d[^"]*","l2":"2 \d[^"]*","cat":"[^"]+"\}.*?\])',
            re.DOTALL
        )
        m = s3.search(html)
        if m:
            html = html[:m.start()] + sat_json + html[m.end():]
            print("  Patched via TLE array pattern match.")
        else:
            print("ERROR: Could not locate satellite data in index.html.")
            print("See README for how to add sentinel comments manually.")
            return False

    if html == original:
        print("  Data unchanged — nothing to commit.")
        return True

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)

    return True


def main():
    html_path = "index.html"
    print(f"\n=== Orbital Traffic TLE Update — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} ===\n")
    print("Fetching TLE data from CelesTrak:")
    sat_json = build_sat_json()
    print(f"\nPatching {html_path}:")
    ok = patch_html(html_path, sat_json)
    if ok:
        print("\n✓ Done.")
    else:
        print("\n✗ Patch failed — index.html unchanged.")
        sys.exit(1)


if __name__ == "__main__":
    main()
