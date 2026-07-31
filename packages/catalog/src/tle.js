import { categorize } from "./classify.js";

/**
 * Alpha-5 alphabet. The TLE satellite-number field is five characters wide,
 * so catalog numbers above 99999 encode their leading digits as a letter:
 * 100057 → "A0057". "I" and "O" are excluded so they can't be misread as
 * 1 and 0, giving A=10 … Z=33 and a ceiling of 339999.
 */
const ALPHA5 = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Decode an Alpha-5 satellite number ("A0057") to its numeric form ("100057"). */
export function decodeAlpha5(satnum) {
  const s = String(satnum).trim();
  const idx = ALPHA5.indexOf(s[0]);
  if (idx < 0) return s;
  const rest = Number(s.slice(1));
  if (!Number.isFinite(rest)) return s;
  return String((idx + 10) * 10000 + rest);
}

/** Encode a numeric catalog number into the 5-character TLE satellite field. */
export function encodeAlpha5(id) {
  const n = Number(id);
  if (!Number.isFinite(n)) return String(id).slice(0, 5).padStart(5, "0");
  if (n < 100000) return String(n).padStart(5, "0");
  const letter = ALPHA5[Math.floor(n / 10000) - 10];
  if (!letter) return String(n).slice(0, 5);
  return letter + String(n % 10000).padStart(4, "0");
}

/**
 * NORAD catalog number from TLE line 1, decoding Alpha-5 so the ID is always
 * the canonical numeric string SATCAT, capsule-status.json and
 * descriptions.json are keyed by. Purely numeric fields are returned
 * untouched — including their leading zeros ("00900"), which downstream data
 * files already key on.
 */
export function noradId(l1) {
  const raw = l1.slice(2, 7).trim();
  return /^[A-Z]/.test(raw) ? decodeAlpha5(raw) : raw;
}

const DAY_MS = 86400000;

/** Two-digit TLE years pivot at 57 (Sputnik): 57-99 → 19xx, 00-56 → 20xx. */
function epochYearToFull(yy) {
  return yy < 57 ? 2000 + yy : 1900 + yy;
}

/**
 * Epoch timestamp from TLE line 1 (columns 19-32, YYDDD.DDDDDDDD, day 1 =
 * Jan 1 UTC), or null if the field doesn't parse. This is how stale — and
 * therefore how trustworthy — a record is: a TLE that has stopped being
 * re-fit usually means the object de-orbited.
 */
export function tleEpochDate(l1) {
  if (typeof l1 !== "string" || l1.length < 32) return null;
  const yy = Number(l1.slice(18, 20));
  const doy = Number(l1.slice(20, 32));
  if (!Number.isFinite(yy) || !Number.isFinite(doy) || doy <= 0) return null;
  return new Date(Date.UTC(epochYearToFull(yy), 0, 1) + (doy - 1) * DAY_MS);
}

/** Age of a TLE in (fractional) days at `at`, or null if the epoch doesn't parse. */
export function tleAgeDays(l1, at = new Date()) {
  const epoch = tleEpochDate(l1);
  return epoch ? (at.getTime() - epoch.getTime()) / DAY_MS : null;
}

/**
 * Same epoch, read from an already-parsed satellite.js satrec
 * (epochyr/epochdays) — for callers like the web app that keep only the
 * satrec, not the source lines.
 */
export function satrecEpochDate(rec) {
  if (!rec || !Number.isFinite(rec.epochyr) || !Number.isFinite(rec.epochdays)) return null;
  return new Date(Date.UTC(epochYearToFull(rec.epochyr), 0, 1) + (rec.epochdays - 1) * DAY_MS);
}

/** Age of a satrec's epoch in (fractional) days at `at`, or null if unavailable. */
export function satrecAgeDays(rec, at = new Date()) {
  const epoch = satrecEpochDate(rec);
  return epoch ? (at.getTime() - epoch.getTime()) / DAY_MS : null;
}

/**
 * Parse three-line-element text into records, applying the canonical
 * classification to each. Resynchronizes on malformed input (stray blank
 * or truncated lines) instead of silently dropping the rest of the file.
 *
 * @param {string} text  raw TLE text (name / line1 / line2 triplets)
 * @param {string} cat   category to assign records from this feed
 * @returns {{name: string, l1: string, l2: string, cat: string}[]}
 */
export function parseTle(text, cat) {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const recs = [];
  let i = 0;
  while (i + 2 < lines.length) {
    const l1 = lines[i + 1];
    const l2 = lines[i + 2];
    if (l1.startsWith("1 ") && l2.startsWith("2 ")) {
      const name = lines[i];
      const id = noradId(l1);
      recs.push({ name, l1, l2, cat: categorize(id, name, cat) });
      i += 3;
    } else {
      i += 1;
    }
  }
  return recs;
}

/**
 * Merge per-group record arrays in priority order: a NORAD ID already
 * claimed by an earlier (more specific) group is never overwritten by a
 * later, more generic one.
 *
 * @param {Array<Array<{name,l1,l2,cat}>>} groups  arrays in priority order
 * @returns {Array<{name,l1,l2,cat}>}
 */
export function mergeRecords(groups) {
  const merged = new Map();
  for (const recs of groups) {
    for (const rec of recs) {
      const id = noradId(rec.l1);
      if (!merged.has(id)) merged.set(id, rec);
    }
  }
  return Array.from(merged.values());
}

/* ------------------------------------------------------------------ *
 * CelesTrak GP (CSV) → TLE
 *
 * The fixed-width TLE text feed has no way to express a catalog number
 * wider than five characters, so CelesTrak omits those objects from
 * FORMAT=tle *entirely* — they don't appear truncated or malformed, they
 * simply aren't in the response. That silently hid Soyuz MS-29 (100057)
 * and will hide every object catalogued from 100000 on.
 *
 * The CSV feed carries the full numeric NORAD_CAT_ID, so we read that and
 * synthesize the TLE lines ourselves, Alpha-5 encoding the satellite
 * number the same way satellite.js expects. Everything downstream keeps
 * receiving the {name, l1, l2, cat} records it already understands.
 * ------------------------------------------------------------------ */

/** Split one CSV row, honouring RFC 4180 quoting (object names contain commas). */
function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch !== '"') cur += ch;
      else if (line[i + 1] === '"') (cur += '"'), i++;
      else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") (out.push(cur), (cur = ""));
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const EPOCH_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/;

/** ISO epoch → TLE columns 19-32 (YYDDD.DDDDDDDD), or null if unparseable. */
function fmtEpoch(iso) {
  const m = EPOCH_RE.exec(String(iso ?? "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const doy = Math.round((Date.UTC(year, Number(m[2]) - 1, Number(m[3])) - Date.UTC(year, 0, 1)) / DAY_MS) + 1;
  const frac = (Number(m[4]) * 3600 + Number(m[5]) * 60 + Number(m[6])) / 86400;
  if (!Number.isFinite(doy) || !Number.isFinite(frac)) return null;
  return String(year % 100).padStart(2, "0") + (doy + frac).toFixed(8).padStart(12, "0");
}

/**
 * Round a digit string to `n` digits, half-up, as text. Returns carry=1 when
 * rounding overflowed (".99999|5" → ".10000" one exponent higher).
 */
function roundDigits(digits, n) {
  if (digits.length <= n) return { digits: digits.padEnd(n, "0"), carry: 0 };
  const head = digits.slice(0, n);
  if (digits.charCodeAt(n) < 53) return { digits: head, carry: 0 };
  const bumped = String(Number(head) + 1);
  return bumped.length > n
    ? { digits: bumped.slice(0, n), carry: 1 }
    : { digits: bumped.padStart(n, "0"), carry: 0 };
}

/**
 * TLE exponent notation (BSTAR, mean-motion second derivative): " 17005-3".
 *
 * CelesTrak writes these as a normalized decimal with an explicit exponent
 * (".948345E-5") — already the mantissa/exponent shape this field wants — so
 * the digits are rounded as text. Going through a float would decide .5 ties
 * by binary-representation happenstance rather than by value.
 *
 * Exact ties are not always reproducible even so: CelesTrak generates its own
 * TLEs from a higher-precision source than the CSV exposes, so ".948345"
 * rounds up while ".483315" rounds down. Those cases differ by one unit in
 * BSTAR's 5th digit, which is far below SGP4's own error (measured at under
 * 20 m of position across the full catalog).
 */
function fmtExp(value) {
  const s = String(value ?? "").trim();
  const m = /^([+-]?)0*\.(\d+)[Ee]([+-]?\d+)$/.exec(s);
  if (m) {
    const { digits, carry } = roundDigits(m[2], 5);
    const exp = Number(m[3]) + carry;
    if (!Number.isFinite(exp) || exp < -9 || /^0+$/.test(digits)) return " 00000+0";
    const e = exp > 9 ? 9 : exp;
    return (m[1] === "-" ? "-" : " ") + digits + (e < 0 ? "-" : "+") + Math.abs(e);
  }
  const v = Number(value);
  if (!Number.isFinite(v) || v === 0) return " 00000+0";
  const sign = v < 0 ? "-" : " ";
  let a = Math.abs(v);
  let exp = 0;
  while (a >= 1) (a /= 10), exp++;
  while (a < 0.1) (a *= 10), exp--;
  let mant = Math.round(a * 1e5);
  if (mant >= 1e5) (mant = Math.round(mant / 10)), exp++;
  if (exp < -9) return " 00000+0";
  if (exp > 9) exp = 9;
  return sign + String(mant).padStart(5, "0") + (exp < 0 ? "-" : "+") + Math.abs(exp);
}

/** First derivative of mean motion, TLE columns 34-43: " .00009023". */
function fmtDot(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return " .00000000";
  const sign = v < 0 ? "-" : " ";
  const a = Math.abs(v);
  return sign + (a >= 1 ? a.toFixed(8).slice(0, 9) : a.toFixed(8).slice(1));
}

/** Right-justified fixed-point field. */
function fmtNum(value, width, decimals) {
  const v = Number(value);
  return (Number.isFinite(v) ? v : 0).toFixed(decimals).padStart(width, " ");
}

/**
 * Eccentricity as 7 digits with an implied leading decimal point.
 *
 * Truncates the decimal string rather than rounding the float. CelesTrak's
 * CSV carries 8 digits (".09049659") where the TLE field holds 7, and its
 * own TLE output truncates the extra digit rather than rounding it — so
 * truncating here keeps synthesized lines byte-identical to the feed this
 * replaces. Going via the float would also introduce representation error:
 * 0.0007096 * 1e7 is 7095.999…, which floors to the wrong digit.
 */
function fmtEcc(value) {
  const s = String(value ?? "").trim();
  const m = /^\+?0*\.(\d+)$/.exec(s);
  if (m) return (m[1] + "0000000").slice(0, 7);
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return "0000000";
  if (v >= 1) return "9999999";
  return (v.toFixed(9).split(".")[1] + "0000000").slice(0, 7);
}

/** OBJECT_ID "1998-067A" → the TLE's 8-column international designator. */
function fmtDesignator(objectId) {
  const s = String(objectId ?? "").trim();
  const m = /^(\d{4})-(.+)$/.exec(s);
  return (m ? m[1].slice(2) + m[2] : s).replace(/\s+/g, "").slice(0, 8).padEnd(8, " ");
}

/** TLE checksum: digits sum, minus signs count 1, mod 10. */
function checksum(line) {
  let sum = 0;
  for (const ch of line) {
    if (ch >= "0" && ch <= "9") sum += Number(ch);
    else if (ch === "-") sum += 1;
  }
  return sum % 10;
}

/**
 * Build the two TLE lines for one GP record. Returns null if the record is
 * missing anything required to produce well-formed fixed-width lines —
 * a malformed record is dropped rather than propagated as a satrec that
 * would propagate to garbage coordinates.
 *
 * @param {Record<string, string>} gp  one GP row, keyed by CSV column name
 * @returns {{l1: string, l2: string} | null}
 */
export function gpToTleLines(gp) {
  const epoch = fmtEpoch(gp.EPOCH);
  const satnum = encodeAlpha5(gp.NORAD_CAT_ID);
  if (!epoch || satnum.length !== 5) return null;

  const cls = /^[A-Z]$/.test(String(gp.CLASSIFICATION_TYPE ?? "").trim())
    ? String(gp.CLASSIFICATION_TYPE).trim()
    : "U";
  const ephem = /^\d$/.test(String(gp.EPHEMERIS_TYPE ?? "").trim())
    ? String(gp.EPHEMERIS_TYPE).trim()
    : "0";

  const l1 =
    `1 ${satnum}${cls} ${fmtDesignator(gp.OBJECT_ID)} ${epoch} ` +
    `${fmtDot(gp.MEAN_MOTION_DOT)} ${fmtExp(gp.MEAN_MOTION_DDOT)} ${fmtExp(gp.BSTAR)} ` +
    `${ephem} ${String(Math.trunc(Number(gp.ELEMENT_SET_NO) || 0) % 10000).padStart(4, " ")}`;

  const l2 =
    `2 ${satnum} ${fmtNum(gp.INCLINATION, 8, 4)} ${fmtNum(gp.RA_OF_ASC_NODE, 8, 4)} ` +
    `${fmtEcc(gp.ECCENTRICITY)} ${fmtNum(gp.ARG_OF_PERICENTER, 8, 4)} ` +
    `${fmtNum(gp.MEAN_ANOMALY, 8, 4)} ${fmtNum(gp.MEAN_MOTION, 11, 8)}` +
    `${String(Math.trunc(Number(gp.REV_AT_EPOCH) || 0) % 100000).padStart(5, " ")}`;

  if (l1.length !== 68 || l2.length !== 68) return null;
  return { l1: l1 + checksum(l1), l2: l2 + checksum(l2) };
}

/**
 * Parse CelesTrak GP CSV into the same records parseTle() produces, applying
 * the canonical classification to each. Malformed rows are skipped
 * individually rather than aborting the feed.
 *
 * @param {string} text  raw CSV (header row + one row per object)
 * @param {string} cat   category to assign records from this feed
 * @returns {{name: string, l1: string, l2: string, cat: string}[]}
 */
export function parseGp(text, cat) {
  const rows = String(text || "").split(/\r?\n/);
  const recs = [];
  let header = null;
  for (const row of rows) {
    if (!row.trim()) continue;
    const fields = splitCsvLine(row);
    if (!header) {
      header = fields.map((f) => f.trim().toUpperCase());
      continue;
    }
    if (fields.length < header.length) continue;
    const gp = {};
    for (let i = 0; i < header.length; i++) gp[header[i]] = fields[i];
    const lines = gpToTleLines(gp);
    if (!lines) continue;
    const name = (gp.OBJECT_NAME || "").trim() || `NORAD ${gp.NORAD_CAT_ID}`;
    // Derive the ID from the synthesized line rather than the CSV column so
    // categorize() sees exactly the string noradId() will return downstream
    // (including TLE-style leading zeros for low catalog numbers).
    recs.push({ name, l1: lines.l1, l2: lines.l2, cat: categorize(noradId(lines.l1), name, cat) });
  }
  return recs;
}
