#!/usr/bin/env python3
"""
merge_special_descriptions.py
Merges a batch of curated satellite descriptions into index.html's DESCS
data (the <script id="d-descriptions"> tag) and reclassifies matching
satellites in SAT_DATA (the <script id="d-sats"> tag) based on a "type"
field, using the same string/escape-aware delimiter-matching approach as
update_tles.py's patch_html() — not a lazy regex — since satellite names
and description text can contain literal brackets/braces.

Input format (one or more objects, keyed by satellite name):
    {
      "OBJECT NAME": {
        "norad": "21949",
        "description": "...",
        "agency": "NRO / US",
        "launched": 1992,
        "type": "Classified Military (NRO Polar Orbit)"
      },
      ...
    }

Usage:
    python3 scripts/merge_special_descriptions.py scripts/data/special_10.json
    python3 scripts/merge_special_descriptions.py scripts/data/special_10.json --html index.html
"""

import argparse
import json
import re
import sys

# ---------------------------------------------------------------------------
# type -> category rule table (case-insensitive substring match, first wins)
# ---------------------------------------------------------------------------
ISS_RELEASED_KEYWORDS = ("hardware", "experiment")
SCIENCE_KEYWORDS = (
    "weather", "maritime", "aviation", "imaging", "cubesat", "university",
    "propulsion", "technology demonstrator", "science hardware", "experiment",
)
OTHER_KEYWORDS = ("military", "classified", "reconnaissance", "intelligence", "nro")


def classify_type(type_str: str):
    """Map a free-text 'type' field to an existing app category, or None
    if it doesn't match any rule (caller should flag it for manual review)."""
    t = type_str.lower()
    # ISS-released hardware/experiments are decommissioned debris, not active
    # science payloads — checked first so it takes priority over the
    # "Science Hardware" / "Experiment" science keywords below.
    if "iss-released" in t and any(k in t for k in ISS_RELEASED_KEYWORDS):
        return "debris"
    if any(k in t for k in SCIENCE_KEYWORDS):
        return "science"
    if any(k in t for k in OTHER_KEYWORDS):
        return "other"
    return None


# ---------------------------------------------------------------------------
# string/escape-aware delimiter matching (mirrors update_tles.py's
# _find_matching_bracket, generalized to both [] and {} pairs)
# ---------------------------------------------------------------------------
def _find_matching_delim(text: str, open_idx: int, open_ch: str, close_ch: str) -> int:
    depth = 0
    in_string = False
    escape = False
    for i in range(open_idx, len(text)):
        c = text[i]
        if escape:
            escape = False
            continue
        if in_string:
            if c == "\\":
                escape = True
            elif c == '"':
                in_string = False
            continue
        if c == '"':
            in_string = True
        elif c == open_ch:
            depth += 1
        elif c == close_ch:
            depth -= 1
            if depth == 0:
                return i
    return -1


def _locate_script_json(html: str, tag_id: str):
    """Return (content_start, content_end) for the JSON payload inside
    <script type="application/json" id="{tag_id}">...</script>, using
    bracket/brace-depth-aware matching so embedded '[' ']' '{' '}' inside
    string values (e.g. "STARLINK-11075 [DTC]") can't truncate it early."""
    m = re.search(rf'<script type="application/json" id="{re.escape(tag_id)}">', html)
    if not m:
        raise RuntimeError(f'Could not find <script id="{tag_id}"> in index.html.')
    start = m.end()
    open_ch = html[start]
    if open_ch not in "[{":
        raise RuntimeError(f'd-{tag_id} content does not start with "[" or "{{".')
    close_ch = "]" if open_ch == "[" else "}"
    end = _find_matching_delim(html, start, open_ch, close_ch)
    if end == -1:
        raise RuntimeError(f'Could not find matching "{close_ch}" for <script id="{tag_id}">.')
    return start, end + 1  # slice is html[start:end+1], inclusive of close_ch


def _dump_compact(obj) -> str:
    """Serialize like the existing data islands (no whitespace), with
    forward slashes in '</script' escaped so descriptions containing that
    literal substring can never prematurely close the script tag."""
    text = json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
    return text.replace("</script", "<\\/script").replace("</SCRIPT", "<\\/SCRIPT")


def norad_from_l1(l1: str) -> str:
    return l1[2:7].strip()


def normalize_norad(value) -> str:
    s = str(value).strip()
    return s.zfill(5) if s.isdigit() else s


# ---------------------------------------------------------------------------
# core merge logic
# ---------------------------------------------------------------------------
def merge(html: str, batch: dict):
    sat_start, sat_end = _locate_script_json(html, "d-sats")
    sat_data = json.loads(html[sat_start:sat_end])

    desc_start, desc_end = _locate_script_json(html, "d-descriptions")
    descs = json.loads(html[desc_start:desc_end])

    sat_index_by_id = {}
    for i, s in enumerate(sat_data):
        sat_index_by_id[norad_from_l1(s["l1"])] = i

    rows = []       # (name, norad, old_cat, new_cat, kind)
    unmatched = []  # objects with no entry in SAT_DATA
    review = []     # objects whose "type" didn't match any rule

    for name, entry in batch.items():
        norad = normalize_norad(entry["norad"])
        new_cat = classify_type(entry.get("type", ""))
        if new_cat is None:
            review.append((name, norad, entry.get("type", "")))

        existing_desc = descs.get(norad, {})
        descs[norad] = {
            **existing_desc,
            "d": entry["description"],
            "a": entry["agency"],
            "t": entry.get("type", ""),
        }

        sat_idx = sat_index_by_id.get(norad)
        if sat_idx is None:
            unmatched.append((name, norad))
            rows.append((name, norad, "(not tracked)", new_cat or "(manual review)", "description-only"))
            continue

        old_cat = sat_data[sat_idx]["cat"]
        if new_cat and new_cat != old_cat:
            sat_data[sat_idx]["cat"] = new_cat
            rows.append((name, norad, old_cat, new_cat, "description + reclassification"))
        else:
            rows.append((name, norad, old_cat, new_cat or old_cat, "description-only"))

    sat_json = _dump_compact(sat_data)
    desc_json = _dump_compact(descs)

    # Splice from the end backwards so earlier offsets stay valid.
    if desc_start > sat_start:
        html = html[:desc_start] + desc_json + html[desc_end:]
        html = html[:sat_start] + sat_json + html[sat_end:]
    else:
        html = html[:sat_start] + sat_json + html[sat_end:]
        html = html[:desc_start] + desc_json + html[desc_end:]

    return html, rows, unmatched, review


def print_report(rows, unmatched, review):
    print("\n=== Merge summary ===")
    print(f"{'Name':<24} {'NORAD':<8} {'Old cat':<14} {'New cat':<14} Update type")
    print("-" * 90)
    for name, norad, old_cat, new_cat, kind in rows:
        print(f"{name:<24} {norad:<8} {old_cat:<14} {new_cat:<14} {kind}")

    if unmatched:
        print(f"\n{len(unmatched)} object(s) not currently tracked in SAT_DATA (description added, no reclassification possible):")
        for name, norad in unmatched:
            print(f"  - {name} ({norad})")

    if review:
        print(f"\n{len(review)} object(s) flagged for MANUAL CATEGORY REVIEW (no rule matched their 'type'):")
        for name, norad, type_str in review:
            print(f"  - {name} ({norad}): {type_str!r}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("batch_file", help="Path to a special-descriptions batch JSON file")
    ap.add_argument("--html", default="index.html", help="Path to index.html (default: index.html)")
    args = ap.parse_args()

    with open(args.batch_file, "r", encoding="utf-8") as f:
        batch = json.load(f)

    with open(args.html, "r", encoding="utf-8") as f:
        html = f.read()

    new_html, rows, unmatched, review = merge(html, batch)

    with open(args.html, "w", encoding="utf-8") as f:
        f.write(new_html)

    print_report(rows, unmatched, review)
    print(f"\n✓ Wrote {args.html}")


if __name__ == "__main__":
    main()
