import * as satellite from "satellite.js";
import { catColorHex, CATS, WORKER_BASE } from "../config.js";
import { state, $ } from "../state.js";
import { DATA } from "../data/store.js";
import { safeProp } from "../astro/propagation.js";
import { orbital, orbitClass, sunlit } from "../astro/orbital.js";
import { regionName } from "../geo/regions.js";
import { EARTH_R } from "../config.js";
import { geoToVec, subDot } from "../scene/earth.js";
import { buildTrail, clearTrail } from "../scene/trail.js";
import { frameSelected } from "../scene/core.js";
import { favs, saveFavs, updateFavBtn } from "./favorites.js";
import { describe } from "./describe.js";
import { figureHTML } from "./figures.js";
import { fetchAndRenderCrew } from "./crew.js";
import { toast } from "./status.js";
import { esc } from "../util/html.js";
import { collapseLegend } from "./legend.js";
import { normalizeVehicleName } from "@orbital-traffic/catalog";

// =====================================================================
// MOBILE — swipe-to-collapse detail card
// =====================================================================
const isMobileLayout = () => window.matchMedia("(max-width:768px)").matches;
let cardDrag = null,
  cardAnimGen = 0;
let infoCard, miniCard;

function onCardTouchStart(e) {
  if (!isMobileLayout() || !state.selected || state.cardCollapsed) return;
  cardDrag = { startY: e.touches[0].clientY, dragging: false };
}
function onCardTouchMove(e) {
  if (!cardDrag) return;
  const y = e.touches[0].clientY;
  if (!cardDrag.dragging) {
    const dy0 = y - cardDrag.startY;
    if (dy0 > 6 && infoCard.scrollTop <= 0) {
      cardDrag.dragging = true;
      cardDrag.dragStartY = y;
      cardDrag.dragStartTime = performance.now();
      infoCard.style.transition = "none";
    } else if (dy0 < -6) {
      cardDrag = null;
      return;
    } else return;
  }
  cardDrag.lastY = y;
  e.preventDefault();
  infoCard.style.transform = `translateY(${Math.max(0, y - cardDrag.dragStartY)}px)`;
}
function onCardTouchEnd() {
  if (!cardDrag || !cardDrag.dragging) {
    cardDrag = null;
    return;
  }
  const dy = Math.max(0, cardDrag.lastY - cardDrag.dragStartY);
  const elapsed = Math.max(1, performance.now() - cardDrag.dragStartTime);
  cardDrag = null;
  infoCard.style.transition = "";
  if (dy > 80 || dy / elapsed > 0.5) collapseCard();
  else snapCardOpen();
}
function onCardTouchCancel() {
  if (!cardDrag) return;
  const wasDragging = cardDrag.dragging;
  cardDrag = null;
  infoCard.style.transition = "";
  if (wasDragging) snapCardOpen();
}

// collapsing never deselects — state.selected, the orbit ring, subDot and
// selMarker all stay exactly as they were, so the highlighted object
// remains visible on the globe while collapsed
function collapseCard() {
  state.cardCollapsed = true;
  const gen = ++cardAnimGen;
  infoCard.style.transition = "transform .3s cubic-bezier(.32,.72,0,1)";
  infoCard.style.transform = "translateY(110%)";
  setTimeout(() => {
    if (cardAnimGen !== gen) return;
    infoCard.classList.remove("show");
    infoCard.style.transition = "";
    infoCard.style.transform = "";
  }, 300);
  updateMiniCard(state.selected);
  miniCard.classList.add("show");
}
function expandCard() {
  if (!state.selected) return;
  cardAnimGen++; // invalidate any pending collapse/snap-back timeout
  state.cardCollapsed = false;
  miniCard.classList.remove("show");
  infoCard.style.transition = "";
  infoCard.style.transform = "";
  infoCard.classList.add("show"); // retriggers the slideup keyframe
}
function snapCardOpen() {
  const gen = ++cardAnimGen;
  infoCard.style.transition = "transform .32s cubic-bezier(.34,1.56,.64,1)";
  infoCard.style.transform = "translateY(0)";
  setTimeout(() => {
    if (cardAnimGen !== gen) return;
    infoCard.style.transition = "";
    infoCard.style.transform = "";
  }, 320);
}
function updateMiniCard(s) {
  if (!s) return;
  const hex = catColorHex(s.cat);
  miniCard.querySelector(".d").style.cssText = `background:${hex};color:${hex}`;
  miniCard.querySelector(".nm").textContent = s.name;
}

// =====================================================================
// SELECTION + INFO
// =====================================================================
export function select(s) {
  state.selected = s;
  const info = $("#info");
  // a fresh selection always opens the full card — clear any leftover
  // swipe-collapse state (and the mini-card) from a previous object first
  cardAnimGen++;
  state.cardCollapsed = false;
  miniCard.classList.remove("show");
  info.style.transition = "";
  info.style.transform = "";
  if (!s) {
    info.classList.remove("show");
    subDot.visible = false;
    state.tracking = false;
    $("#info-track").style.color = "";
    clearTrail();
    return;
  }
  teleOpen = true; // start each newly selected object with telemetry detail expanded
  collapseLegend(); // hand screen space to the info card; user must reopen it manually
  fetchAndRenderCrew(s);
  info.classList.add("show");
  info.scrollTop = 0;
  updateFavBtn(s);
  // objects with no curated description get a frosted veil over the detail
  // sections (see #info-veil in index.html) — header, figure and flag stay
  // visible. Content-based, not category-based: plenty of "other" objects
  // (CubeSats, imaging sats) have real descriptions and shouldn't be veiled.
  info.classList.toggle("veiled", !s._neo && !(DATA.descs[s.id] && DATA.descs[s.id].d));
  const hex = catColorHex(s.cat);
  $("#info-cat").querySelector(".d").style.cssText = `background:${hex};color:${hex}`;
  $("#info-cat").querySelector("span:last-child").textContent = (CATS[s.cat] || CATS.other).label;
  $("#info-nm").textContent = s.name;
  $("#info-figure").innerHTML = figureHTML(s);
  const li = launchInfo(s.rec);
  $("#info-nid").textContent = "NORAD " + s.id + (li.desig !== "—" ? "  ·  INT'L " + li.desig : "");
  setLaunchLine(s, li);
  setFlagLine(s);
  $("#info-lead").textContent = describe(s);
  buildTrail(s, new Date(state.simNow));
  refreshInfo();
  enrichSatcat(s);
}

function launchInfo(rec) {
  const d = ((rec && rec.intldesg) || "").trim();
  let year = null,
    desig = "—";
  if (/^\d{5}/.test(d)) {
    const yy = parseInt(d.slice(0, 2), 10);
    year = yy < 57 ? 2000 + yy : 1900 + yy;
    desig = year + "-" + d.slice(2);
  } else if (d) {
    desig = d;
  }
  return { year, desig };
}

const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? parseInt(m[3], 10) + " " + MON3[+m[2] - 1] + " " + m[1] : iso;
}
function yearsSince(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return Math.max(0, Math.floor((Date.now() - Date.UTC(+m[1], +m[2] - 1, +m[3])) / 3.1557e10));
}
function setLaunchLine(s, li) {
  const el = $("#info-launch");
  if (!el) return;
  if (s.launchDate) {
    const yrs = yearsSince(s.launchDate);
    let t = "Launched " + fmtDate(s.launchDate);
    if (s.launchSite) t += " from " + s.launchSite;
    if (yrs != null) t += "  ·  " + yrs + " yr" + (yrs === 1 ? "" : "s") + " in orbit";
    el.textContent = t;
    el.style.display = "block";
  } else if (li.year) {
    el.textContent = "Launched " + li.year;
    el.style.display = "block";
  } else {
    el.style.display = "none";
  }
}

const OWNERS = {
  US: "United States", PRC: "China", CIS: "Russia", UR: "Russia", ESA: "Europe (ESA)",
  EUME: "EUMETSAT", FR: "France", IT: "Italy", UK: "United Kingdom", JPN: "Japan",
  IND: "India", CA: "Canada", GER: "Germany", SES: "SES", ISS: "ISS Partners",
  GLOB: "Globalstar", O3B: "O3b Networks", LUXE: "Luxembourg", NOR: "Norway", SPN: "Spain",
};
const SITES = {
  TYMSC: "Baikonur", AFETR: "Cape Canaveral", CCAFS: "Cape Canaveral",
  KSCUT: "Kennedy Space Center", AFWTR: "Vandenberg", VAFB: "Vandenberg", JSC: "Jiuquan",
  TSC: "Taiyuan", XSC: "Xichang", WSC: "Wenchang", FRGUI: "Kourou", PLMSC: "Plesetsk",
  SRILR: "Sriharikota", TANSC: "Tanegashima", VOSTO: "Vostochny", SEAL: "Sea Launch",
};
const FLAGS = {
  US: "\u{1F1FA}\u{1F1F8}", PRC: "\u{1F1E8}\u{1F1F3}", CIS: "\u{1F1F7}\u{1F1FA}",
  UR: "\u{1F1F7}\u{1F1FA}", ESA: "\u{1F1EA}\u{1F1FA}", EUME: "\u{1F1EA}\u{1F1FA}",
  FR: "\u{1F1EB}\u{1F1F7}", IT: "\u{1F1EE}\u{1F1F9}", UK: "\u{1F1EC}\u{1F1E7}",
  JPN: "\u{1F1EF}\u{1F1F5}", IND: "\u{1F1EE}\u{1F1F3}", CA: "\u{1F1E8}\u{1F1E6}",
  GER: "\u{1F1E9}\u{1F1EA}", SES: "\u{1F1F1}\u{1F1FA}", LUXE: "\u{1F1F1}\u{1F1FA}",
  GLOB: "\u{1F1FA}\u{1F1F8}", NOR: "\u{1F1F3}\u{1F1F4}", SPN: "\u{1F1EA}\u{1F1F8}",
  O3B: "\u{1F1EC}\u{1F1E7}", GBR: "\u{1F1EC}\u{1F1E7}",
  ISS: "\u{1F1FA}\u{1F1F8}\u{1F1F7}\u{1F1FA}\u{1F1EF}\u{1F1F5}\u{1F1EA}\u{1F1FA}\u{1F1E8}\u{1F1E6}",
  CHBZ: "\u{1F1E8}\u{1F1F3}\u{1F1E7}\u{1F1F7}",
  // Added 2026-07-17 — countries with curated descriptions (apps/web/public/
  // data/descriptions.json's "a" field) that previously had no FLAGS entry
  // at all, so agencyFlag() fell through to the generic satellite-icon
  // fallback for them regardless of how well its keyword matching worked.
  ALG: "\u{1F1E9}\u{1F1FF}", ARG: "\u{1F1E6}\u{1F1F7}", AUS: "\u{1F1E6}\u{1F1FA}",
  AUT: "\u{1F1E6}\u{1F1F9}", AZE: "\u{1F1E6}\u{1F1FF}", BEL: "\u{1F1E7}\u{1F1EA}",
  BGD: "\u{1F1E7}\u{1F1E9}", BLR: "\u{1F1E7}\u{1F1FE}", BOL: "\u{1F1E7}\u{1F1F4}",
  BR: "\u{1F1E7}\u{1F1F7}", BUL: "\u{1F1E7}\u{1F1EC}", EGY: "\u{1F1EA}\u{1F1EC}",
  FIN: "\u{1F1EB}\u{1F1EE}", GRC: "\u{1F1EC}\u{1F1F7}", HKG: "\u{1F1ED}\u{1F1F0}",
  IDN: "\u{1F1EE}\u{1F1E9}", IRN: "\u{1F1EE}\u{1F1F7}", ISR: "\u{1F1EE}\u{1F1F1}",
  KAZ: "\u{1F1F0}\u{1F1FF}", KOR: "\u{1F1F0}\u{1F1F7}", LAO: "\u{1F1F1}\u{1F1E6}",
  MAR: "\u{1F1F2}\u{1F1E6}", MEX: "\u{1F1F2}\u{1F1FD}", MNG: "\u{1F1F2}\u{1F1F3}",
  MYS: "\u{1F1F2}\u{1F1FE}", NGA: "\u{1F1F3}\u{1F1EC}", PAK: "\u{1F1F5}\u{1F1F0}",
  PHL: "\u{1F1F5}\u{1F1ED}", POL: "\u{1F1F5}\u{1F1F1}", QAT: "\u{1F1F6}\u{1F1E6}",
  SAU: "\u{1F1F8}\u{1F1E6}", SGP: "\u{1F1F8}\u{1F1EC}", SUI: "\u{1F1E8}\u{1F1ED}",
  SVN: "\u{1F1F8}\u{1F1EE}", SWE: "\u{1F1F8}\u{1F1EA}", THA: "\u{1F1F9}\u{1F1ED}",
  TKM: "\u{1F1F9}\u{1F1F2}", TUR: "\u{1F1F9}\u{1F1F7}", TWN: "\u{1F1F9}\u{1F1FC}", UAE: "\u{1F1E6}\u{1F1EA}",
  VNM: "\u{1F1FB}\u{1F1F3}", AGO: "\u{1F1E6}\u{1F1F4}",
};

function inferOwner(s) {
  const n = " " + s.name.toUpperCase() + " ";
  // Catalogs hyphenate these inconsistently ("SHENZHOU-23 (SZ-23)", "BEIDOU-2
  // G1", "GSAT0101 (GALILEO-PFM)") — matched against the shared normalized
  // form + \b instead of space padding.
  const vn = normalizeVehicleName(s.name);
  // Classified satellites get their operating agency, not just a country —
  // checked first so it isn't shadowed by the generic country lines below
  // (YAOGAN, for instance, would otherwise match the generic China line).
  if (/\bUSA\s+\d+\b/.test(n) || /\bNROL\b/.test(n))
    return { code: "US", name: "National Reconnaissance Office" };
  if (/\bYAOGAN\b/.test(n) || /\bSHIJIAN[-\s]*\d+[A-Z]?\b/.test(n))
    return { code: "PRC", name: "People's Liberation Army" };
  if (/\bPRAETORIAN\b/.test(n)) return { code: "US", name: "US Space Development Agency" };
  // Real catalog names are hyphenated ("STARLINK-30042", "ONEWEB-0012") — like
  // the BEIDOU/GALILEO checks below, matched against vn + \b, not space padding
  // (a space-padded pattern here would silently match zero real objects).
  if (/\bSTARLINK\b/.test(vn)) return { code: "US", name: "United States" };
  if (/\bONEWEB\b/.test(vn)) return { code: "GBR", name: "OneWeb (Eutelsat)" };
  if (/ GLONASS | SOYUZ | PROGRESS | COSMOS | METEOR | RESURS /.test(n))
    return { code: "CIS", name: "Russia" };
  if (/\bBEIDOU\b|\bFENGYUN\b|\bTIANGONG\b|\bTIANZHOU\b|\bSHENZHOU\b|\bYAOGAN\b|\bCHANGGUANG\b/.test(vn))
    return { code: "PRC", name: "China" };
  if (/\bGALILEO\b/.test(vn)) return { code: "ESA", name: "European Space Agency" };
  if (/ GPS | NAVSTAR /.test(n)) return { code: "US", name: "United States" };
  if (/ GOES | NOAA | LANDSAT | TERRA | AQUA | TESS | KEPLER | DSCOVR | HUBBLE | CHANDRA | FERMI /.test(n))
    return { code: "US", name: "United States" };
  if (/ ZARYA | ISS /.test(n) || s.id === "25544") return { code: "ISS", name: "ISS Partners" };
  if (/ HIMAWARI | ALOS | HAYABUSA /.test(n)) return { code: "JPN", name: "Japan" };
  if (/ INSAT | CARTOSAT | RESOURCESAT | IRNSS | GSAT /.test(n)) return { code: "IND", name: "India" };
  if (/ AEOLUS | ENVISAT | CRYOSAT | SWARM /.test(n))
    return { code: "ESA", name: "European Space Agency" };
  if (s.cat === "starlink") return { code: "US", name: "United States" };
  if (s.cat === "navigation") return null;
  return null;
}

// Keyword → FLAGS code lookup for agencyFlag(), checked in order (first
// match wins). Every result comes from FLAGS — no raw emoji duplicated here
// (previously Canada/France/Germany/Korea/Brazil/Algeria/Sweden/Italy each
// hardcoded their own copy of a flag that already existed in FLAGS).
// Short/ambiguous keywords (asi, uae, uk, ses, pla, usa, cast, rscc...) are
// \b-bounded so they can't match as a substring of an unrelated word — e.g.
// bare "asi" previously matched "Asia Broadcast Satellite" and wrongly
// showed the Italy flag, and "cast" matched "Broadcast". Same \b convention
// normalizeVehicleName() callers use elsewhere in this codebase (see
// packages/catalog/src/classify.js).
//
// Compiled from a full audit of every unique agency ("a" field) string in
// apps/web/public/data/descriptions.json (2026-07-17) — 1,461 of 1,472
// curated objects now resolve to a real flag; the 11 that don't have no
// single-country agency to show ("Commercial", "RASCOM / Africa",
// "Unidentified / Launch Debris", "Unspecified (Rideshare Payload)", the
// multinational "Asia Broadcast Satellite" / "AsiaSat / AMOS" operators).
const AGENCY_KEYWORDS = [
  ["nasa", "US"], ["\\busaf\\b", "US"], ["us air", "US"], ["us space", "US"],
  ["us navy", "US"], ["us coast", "US"], ["us government", "US"],
  ["us intelligence", "US"], ["\\bnro\\b", "US"], ["\\bplanet\\b", "US"],
  ["hawkeye", "US"], ["terrestar", "US"], ["worldspace", "US"], ["ligado", "US"],
  ["capella", "US"], ["digitalglobe", "US"], ["geoeye", "US"], ["globalstar", "US"],
  ["echostar", "US"], ["hughes", "US"], ["\\bico\\b", "US"], ["nuview", "US"],
  ["iridium", "US"], ["lincoln laboratory", "US"], ["northrop", "US"],
  ["orbcomm", "US"], ["siriusxm", "US"], ["spacequest", "US"], ["spire", "US"],
  ["aerospace corporation", "US"], ["viasat", "US"], ["at&t", "US"],
  ["directv", "US"], ["\\busa\\b", "US"],
  ["esa", "ESA"], ["european space", "ESA"], ["eumetsat", "ESA"],
  ["jaxa", "JPN"], ["japan", "JPN"], ["nasda", "JPN"], ["tokyo", "JPN"],
  ["jsat", "JPN"], ["sky perfect", "JPN"],
  ["isro", "IND"], ["india", "IND"], ["indian", "IND"],
  ["cnsa", "PRC"], ["china", "PRC"], ["chinese", "PRC"], ["casc", "PRC"],
  ["\\bcma\\b", "PRC"], ["cgstl", "PRC"], ["chang guang", "PRC"], ["\\bpla\\b", "PRC"],
  ["\\bmws\\b", "PRC"], ["head aerospace", "PRC"], ["\\bcast\\b", "PRC"],
  ["roscosmos", "CIS"], ["russia", "CIS"], ["russian", "CIS"], ["soviet", "CIS"],
  ["gazprom", "CIS"], ["rosto", "CIS"], ["\\brscc\\b", "CIS"],
  ["canadian", "CA"], ["canada", "CA"], ["csa/mda", "CA"], ["csa /", "CA"],
  ["cnes", "FR"], ["france", "FR"], ["french", "FR"], ["eutelsat", "FR"],
  ["dlr", "GER"], ["german", "GER"], ["bundeswehr", "GER"], ["tu berlin", "GER"],
  ["stuttgart", "GER"],
  ["vienna", "AUT"], ["\\bgraz\\b", "AUT"],
  ["kari", "KOR"], ["korea", "KOR"],
  ["inpe", "BR"], ["brazil", "BR"], ["embratel", "BR"], ["telebras", "BR"],
  ["asal", "ALG"], ["algeria", "ALG"],
  ["swedish", "SWE"], ["sweden", "SWE"], ["ovzon", "SWE"],
  ["telenor", "NOR"],
  ["\\basi\\b", "IT"], ["italy", "IT"], ["italian", "IT"], ["sapienza", "IT"],
  ["\\buk\\b", "GBR"], ["britain", "GBR"], ["british", "GBR"], ["sstl", "GBR"],
  ["surrey", "GBR"], ["avanti", "GBR"], ["inmarsat", "GBR"],
  ["spain", "SPN"], ["spanish", "SPN"], ["hispasat", "SPN"], ["deimos imaging", "SPN"],
  ["argentina", "ARG"],
  ["bolivia", "BOL"],
  ["mongolia", "MNG"],
  ["angola", "AGO"],
  ["\\buae\\b", "UAE"], ["mbrsc", "UAE"], ["thuraya", "UAE"],
  ["azerbaijan", "AZE"], ["azercosmos", "AZE"],
  ["bangladesh", "BGD"],
  ["indonesia", "IDN"], ["lapan", "IDN"],
  ["belarus", "BLR"],
  ["bulgaria", "BUL"],
  ["switzerland", "SUI"], ["epfl", "SUI"],
  ["egypt", "EGY"], ["egyptian", "EGY"], ["nilesat", "EGY"],
  ["israel", "ISR"], ["dror satellite", "ISR"], ["spacecom", "ISR"], ["technion", "ISR"],
  ["kazakhstan", "KAZ"], ["kazcosmos", "KAZ"],
  ["thailand", "THA"], ["thaicom", "THA"], ["gistda", "THA"],
  ["singapore", "SGP"],
  ["laos", "LAO"],
  ["mexico", "MEX"], ["méxico", "MEX"], ["quetzsat", "MEX"],
  ["malaysia", "MYS"], ["measat", "MYS"],
  ["morocco", "MAR"],
  ["nigeria", "NGA"],
  ["pakistan", "PAK"], ["suparco", "PAK"],
  ["philippines", "PHL"],
  ["poland", "POL"],
  ["qatar", "QAT"],
  ["saudi", "SAU"], ["kacst", "SAU"], ["arabsat", "SAU"],
  ["slovenia", "SVN"],
  ["taiwan", "TWN"], ["nspo", "TWN"], ["chunghwa", "TWN"],
  ["turkey", "TUR"], ["turkish", "TUR"], ["turksat", "TUR"], ["tubitak", "TUR"],
  ["tübi", "TUR"],
  ["turkmen", "TKM"],
  ["vietnam", "VNM"],
  ["australia", "AUS"], ["nbn co", "AUS"], ["optus", "AUS"],
  ["greece", "GRC"], ["hellas-sat", "GRC"],
  ["finland", "FIN"], ["iceye", "FIN"],
  ["belgium", "BEL"],
  ["hong kong", "HKG"],
  ["iran", "IRN"],
  ["\\bses\\b", "SES"], ["intelsat", "SES"],
  // Generic pan-European fallback — Airbus SE has no single national
  // affiliation; the more specific matches above (dlr/cnes/uk/etc.) win
  // first whenever an Airbus entry names a particular country.
  ["airbus", "ESA"],
].map(([kw, code]) => [new RegExp(kw, "i"), code]);

function agencyFlag(a) {
  for (const [re, code] of AGENCY_KEYWORDS) {
    if (re.test(a)) return FLAGS[code] || "\u{1F6F0}";
  }
  return "\u{1F6F0}";
}

function setFlagLine(s) {
  const el = $("#info-flag");
  if (!el) return;
  const desc = !s._neo && DATA.descs[s.id];
  const owner = s.ownerName ? { code: s.ownerCode, name: s.ownerName } : inferOwner(s);
  if (desc && desc.a) {
    const flg = agencyFlag(desc.a);
    el.innerHTML = `<span class="fl">${flg}</span>${esc(desc.a)}`;
    el.style.display = "flex";
  } else if (owner) {
    // eslint-disable-next-line orbital/no-unescaped-innerhtml -- FLAGS[] is a fixed emoji lookup with a literal fallback; the untrusted owner name goes through esc().
    el.innerHTML = `<span class="fl">${FLAGS[owner.code] || "\u{1F6F0}"}</span>${esc(owner.name)}`;
    el.style.display = "flex";
  } else {
    el.style.display = "none";
  }
}

/** Lazily enrich a selected object with CelesTrak SATCAT metadata. */
function enrichSatcat(s) {
  if (s._neo || !s.rec) return; // skip NEOs and objects without TLE
  if (s.satcatDone || s._satcatTry) return;
  s._satcatTry = true;
  fetch(`${WORKER_BASE}/satcat?id=${encodeURIComponent(s.id)}`, {
    cache: "force-cache",
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((r) => {
      if (!r) return;
      s.satcatDone = true;
      if (r.LAUNCH_DATE) s.launchDate = r.LAUNCH_DATE;
      if (r.OBJECT_TYPE) s.objType = r.OBJECT_TYPE;
      if (r.OWNER) {
        s.ownerCode = r.OWNER;
        s.ownerName = OWNERS[r.OWNER] || r.OWNER;
      }
      if (r.LAUNCH_SITE) s.launchSite = SITES[r.LAUNCH_SITE] || null;
      if (state.selected === s) {
        setLaunchLine(s, launchInfo(s.rec));
        setFlagLine(s);
        $("#info-lead").textContent = describe(s);
        $("#info-figure").innerHTML = figureHTML(s);
        refreshInfo();
      }
    })
    .catch(() => {});
}

let teleOpen = true; // persists the "more"/"less" telemetry state across refreshInfo() re-renders

export function refreshInfo() {
  const s = state.selected;
  if (!s) return;
  // NEO objects have no TLE — show orbital elements instead
  if (s._neo) {
    const n = s._neo,
      chips = $("#info-chips"),
      grid = $("#info-grid");
    chips.innerHTML = `<span class="chip">Heliocentric Orbit</span><span class="chip" style="color:var(--bad)">Potentially Hazardous</span>`;
    grid.className = "grid";
    grid.innerHTML = `
      <div class="stat"><div class="k">Semi-major axis</div><div class="v">${n.a.toFixed(3)} <small>AU</small></div></div>
      <div class="stat"><div class="k">Eccentricity</div><div class="v">${n.e.toFixed(4)}</div></div>
      <div class="stat"><div class="k">Inclination</div><div class="v">${n.i.toFixed(1)}<small>°</small></div></div>
      <div class="stat"><div class="k">Orbital period</div><div class="v">${(Math.sqrt(Math.pow(n.a, 3)) * 365.25).toFixed(0)} <small>days</small></div></div>`;
    subDot.visible = false;
    return;
  }
  const date = new Date(state.simNow),
    p = safeProp(s.rec, date);
  const chips = $("#info-chips"),
    grid = $("#info-grid");
  if (!p) {
    chips.innerHTML = "";
    grid.className = "grid full";
    grid.innerHTML = `<div class="stat"><div class="k">Status</div><div class="v" style="color:var(--bad);font-size:13px">No current position — this object may have re-entered the atmosphere.</div></div>`;
    subDot.visible = false;
    return;
  }
  const gmst = satellite.gstime(date),
    geo = satellite.eciToGeodetic(p, gmst);
  const lat = satellite.degreesLat(geo.latitude),
    lon = satellite.degreesLong(geo.longitude),
    alt = geo.height;
  const vel = satellite.propagate(s.rec, date).velocity;
  const spd = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
  const ob = orbital(s.rec),
    oc = orbitClass(alt, ob.e),
    lit = sunlit(p, date),
    orbits = 1440 / ob.periodMin;
  subDot.position.copy(geoToVec(lat, lon, EARTH_R * 1.004));
  subDot.visible = true;
  chips.innerHTML =
    `<span class="chip" title="${oc.note}">${oc.name}</span>` +
    `<span class="chip ${lit ? "lit" : "shad"}"><i></i>${lit ? "In sunlight" : "In Earth&rsquo;s shadow"}</span>` +
    `<span class="chip">Over ${regionName(lat, lon)}</span>` +
    (s.ownerName ? `<span class="chip">${esc(s.ownerName)}</span>` : ``) +
    `<span class="chip">&asymp;${orbits.toFixed(1)} orbits / day</span>`;
  const ns = lat >= 0 ? "N" : "S",
    ew = lon >= 0 ? "E" : "W",
    MI = 0.621371;
  grid.className = "grid";
  grid.innerHTML = `
    <div class="stat"><div class="k">Altitude</div><div class="v">${fmt(alt * MI, 0)} <small>mi up</small></div></div>
    <div class="stat"><div class="k">Speed</div><div class="v">${fmt(spd * 3600 * MI, 0)} <small>mph</small></div></div>
    <div id="tele-more" style="display:${teleOpen ? "contents" : "none"}">
      <div class="stat"><div class="k">Tilt of orbit</div><div class="v">${ob.inc.toFixed(1)}<small>° incl.</small></div></div>
      <div class="stat"><div class="k">Lap time</div><div class="v">${ob.periodMin.toFixed(0)} <small>min/orbit</small></div></div>
      <div class="stat"><div class="k">Ground point</div><div class="v">${Math.abs(lat).toFixed(1)}°${ns} ${Math.abs(lon).toFixed(1)}°${ew}</div></div>
      <div class="stat"><div class="k">High / low point</div><div class="v">${fmt(ob.apo * MI, 0)}<small>/</small>${fmt(ob.per * MI, 0)} <small>mi</small></div></div>
    </div>
    <div class="stat" style="grid-column:1/-1;padding:0">
      <button id="tele-toggle" style="background:none;border:none;cursor:pointer;font-family:var(--mono);font-size:9px;letter-spacing:0.14em;color:${teleOpen ? "var(--ink-dim)" : "var(--signal)"};padding:6px 0;text-align:left;width:100%;touch-action:manipulation">${teleOpen ? "▲ less" : "▼ more"}</button>
    </div>`;
  // Single click listener only (no separate touchstart/touchend) — touch-action:
  // manipulation above removes the tap delay without needing duplicate handlers.
  // teleOpen is module-level state so it survives the periodic refreshInfo()
  // re-renders driven by the live telemetry update loop; without that, the
  // panel would flip back to closed within ~150ms of the user opening it.
  $("#tele-toggle").onclick = () => {
    teleOpen = !teleOpen;
    $("#tele-more").style.display = teleOpen ? "contents" : "none";
    const b = $("#tele-toggle");
    b.textContent = teleOpen ? "▲ less" : "▼ more";
    b.style.color = teleOpen ? "var(--ink-dim)" : "var(--signal)";
  };
}

function fmt(n, d) {
  return n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
}

/** Wire the static info-card controls. Call once at boot. */
export function initInfoCard() {
  infoCard = $("#info");
  miniCard = $("#mini-card");
  infoCard.addEventListener("touchstart", onCardTouchStart, { passive: true });
  infoCard.addEventListener("touchmove", onCardTouchMove, { passive: false });
  infoCard.addEventListener("touchend", onCardTouchEnd);
  infoCard.addEventListener("touchcancel", onCardTouchCancel);
  miniCard.addEventListener("click", expandCard);

  document.getElementById("fav-btn").onclick = () => {
    const s = state.selected;
    if (!s) return;
    if (favs.has(s.id)) favs.delete(s.id);
    else favs.add(s.id);
    saveFavs();
    updateFavBtn(s);
    toast(favs.has(s.id) ? "★ Saved to favourites" : "Removed from favourites");
  };
  // Single listener only — do not also bind touchend here, the browser's
  // synthesized click already fires on tap and a second listener would close
  // then immediately re-trigger on the same gesture.
  $("#info-x").onclick = (e) => {
    e.stopPropagation();
    select(null);
  };
  $("#info-track").onclick = () => {
    state.tracking = !state.tracking;
    $("#info-track").style.color = state.tracking ? "var(--signal)" : "";
    if (state.selected && state.selected._p) frameSelected();
  };
}
