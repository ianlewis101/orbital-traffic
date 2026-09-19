/**
 * Famous spacecraft people search for that this app can never plot.
 *
 * Orbital Traffic renders Earth-orbiting objects propagated with SGP4 from
 * TLEs. Everything in this table has left Earth orbit (or never entered one),
 * so no TLE exists and none ever will — CelesTrak's SATCAT carries most of
 * them with DATA_STATUS_CODE "NEA" (no elements available) and an ORBIT_CENTER
 * that isn't Earth. Searching for one used to return a bare "No matches
 * found", which reads identically to a broken search; these entries turn that
 * dead end into an answer.
 *
 * DELIBERATELY NOT A CATEGORY. There is no CATS entry, no classify.js path, no
 * legend row and nothing on the globe — these objects are never ingested, so
 * adding one would be an enum entry with no assignment path behind it (the
 * mistake the removed "cool" category was). This table is read by ui/search.js
 * and nothing else.
 *
 * TRAJECTORY DATA is baked from JPL Horizons (ssd.jpl.nasa.gov/api/horizons.api)
 * at the shared epoch below — never estimated. Three motion models, because
 * these objects do genuinely different things:
 *
 *   "escape" — on a hyperbolic escape trajectory, effectively coasting. `p`/`v`
 *     are the heliocentric ecliptic state vector (AU, AU/day), linearly
 *     extrapolated. Solar gravity at 60+ AU is ~1e-8 AU/day², so the quadratic
 *     term this drops is under a tenth of an AU per decade — far below the
 *     precision displayed. These cannot use the NEO propagator: their orbits
 *     are hyperbolic (a < 0, e > 1), and solveKepler()'s elliptical form
 *     returns NaN for them.
 *
 *   "orbit" — a bound heliocentric ellipse, propagated by the existing NEO
 *     two-body solver. `el` matches neos.json's field names exactly so it can
 *     be handed straight to neoGeocentric(). Osculating elements drift under
 *     planetary perturbations, so `el.epoch` is the refresh handle — see
 *     test/deep-space.test.js, which pins the model against Horizons.
 *
 *   "fixed" — parked at a libration point. `distKm` is the NOMINAL distance and
 *     is deliberately not a live reading: a halo orbit around L2 is wide enough
 *     that Webb's true range runs about 1.2-1.7 million km (measured against
 *     Horizons), and it is held there by periodic station-keeping burns, so
 *     there is no closed-form ephemeris to propagate. The UI renders these with
 *     a "~" and no live-distance styling. Don't "upgrade" this into a precise
 *     readout without a real ephemeris source behind it — a number that looks
 *     live and is 20% out is worse than an honest round one.
 *
 * `id` is the NORAD catalog number where one exists. The Pioneers predate the
 * SATCAT's surviving records and genuinely have none (verified: CATNR 05860
 * and 05861 both return "No SATCAT records found"), so they carry only an
 * international designator.
 */

/** Julian Day of the baked state vectors and elements: 2026-09-16T00:00 TDB. */
export const DEEP_SPACE_EPOCH = 2461299.5;

export const DEEP_SPACE = [
  {
    key: "voyager1",
    name: "Voyager 1",
    id: "10321",
    desig: "1977-084A",
    launched: "1977-09-05",
    alt: ["voyager1"],
    kind: "escape",
    epoch: DEEP_SPACE_EPOCH,
    p: [-32.14508984731544, -136.7066805403532, 98.91005536571363],
    v: [-1.195559989130945e-3, -7.861193314424112e-3, 5.678514868801633e-3],
    blurb:
      "The most distant human-made object. Launched in 1977, it flew past Jupiter and Saturn, then kept going — crossing into interstellar space in 2012. It still calls home, heading for the constellation Ophiuchus.",
    why: "Voyager 1 left Earth's gravity in 1977 and now coasts out of the solar system entirely. It has no orbit around Earth to draw.",
  },
  {
    key: "voyager2",
    name: "Voyager 2",
    id: "10271",
    desig: "1977-076A",
    launched: "1977-08-20",
    alt: ["voyager2"],
    kind: "escape",
    epoch: DEEP_SPACE_EPOCH,
    p: [39.85385708921728, -105.3834308200682, -89.60527182196429],
    v: [2.427682511868528e-3, -5.394533730412325e-3, -6.536123794897596e-3],
    blurb:
      "Launched 16 days before Voyager 1, and still the only spacecraft ever to visit Uranus and Neptune. It reached interstellar space in 2018 and is heading south, out of the plane of the planets.",
    why: "Voyager 2 is on an escape trajectory out of the solar system. Nothing about its path is an Earth orbit.",
  },
  {
    key: "newhorizons",
    name: "New Horizons",
    id: "28928",
    desig: "2006-001A",
    launched: "2006-01-19",
    alt: ["pluto"],
    kind: "escape",
    epoch: DEEP_SPACE_EPOCH,
    p: [20.80118699843457, -62.16764510800611, 2.286261409543811],
    v: [3.065764020045201e-3, -7.214093375262293e-3, 2.839096541472775e-4],
    blurb:
      "The fastest spacecraft ever launched from Earth. It gave us the first close-up of Pluto in 2015, then flew past the Kuiper Belt object Arrokoth on New Year's Day 2019, and is still taking data on its way out.",
    why: "New Horizons is climbing out of the solar system through the Kuiper Belt. It has no Earth orbit and no TLE.",
  },
  {
    key: "pioneer10",
    name: "Pioneer 10",
    desig: "1972-012A",
    launched: "1972-03-02",
    kind: "escape",
    epoch: DEEP_SPACE_EPOCH,
    p: [24.0604374595127, 139.5751705863336, 7.387197006456844],
    v: [7.085942400933997e-4, 6.798464717896589e-3, 3.482919064509768e-4],
    blurb:
      "The first spacecraft to cross the asteroid belt and the first to fly past Jupiter. It carries the famous engraved plaque. The last faint signal was heard in January 2003 — this position is a projection of its trajectory, not a live track.",
    why: "Pioneer 10 left Earth's gravity in 1972 and is now silent, coasting toward the star Aldebaran. There is nothing to receive and no Earth orbit to plot.",
  },
  {
    key: "pioneer11",
    name: "Pioneer 11",
    desig: "1973-019A",
    launched: "1973-04-06",
    kind: "escape",
    epoch: DEEP_SPACE_EPOCH,
    p: [29.05202975677115, -110.6810143693046, 28.20815004405002],
    v: [2.331847477237736e-3, -5.831074045026386e-3, 1.404313331427815e-3],
    blurb:
      "The first spacecraft to visit Saturn, using Jupiter's gravity to get there. Contact was lost in 1995 — like its twin, the position shown is a trajectory projection rather than a live measurement.",
    why: "Pioneer 11 is on an escape trajectory and has been out of contact since 1995. It does not orbit Earth.",
  },
  {
    key: "jwst",
    name: "James Webb Space Telescope",
    id: "50463",
    desig: "2021-130A",
    launched: "2021-12-25",
    alt: ["jwst", "webb"],
    kind: "fixed",
    distKm: 1.5e6,
    blurb:
      "Not in orbit around Earth at all — Webb loops around the Sun-Earth L2 point, roughly four times further away than the Moon, with its sunshield permanently between its mirrors and the Sun.",
    why: "Webb orbits a gravitational balance point 930,000 miles beyond Earth, not Earth itself. CelesTrak lists it with an orbit centre of EL2 and no elements.",
  },
  {
    key: "parker",
    name: "Parker Solar Probe",
    id: "43592",
    desig: "2018-065A",
    launched: "2018-08-12",
    alt: ["sun probe"],
    kind: "orbit",
    el: {
      a: 0.3884314997282561,
      e: 0.8820270127547112,
      i: 3.391136157176899,
      om: 76.48337234592751,
      w: 68.63871822214949,
      ma: 46.38401620283646,
      epoch: DEEP_SPACE_EPOCH,
    },
    blurb:
      "The fastest object humans have ever built, and the closest to the Sun. At its record perihelion it passed 3.8 million miles above the surface at about 430,000 mph, protected by a carbon-composite heat shield.",
    why: "Parker orbits the Sun on a steep 88-day ellipse, dipping inside Mercury's orbit. Its orbit is heliocentric, so there is no Earth-relative track to draw.",
  },
  {
    key: "roadster",
    name: "Tesla Roadster (Starman)",
    id: "43205",
    desig: "2018-017A",
    launched: "2018-02-06",
    alt: ["tesla", "starman", "car"],
    kind: "orbit",
    el: {
      a: 1.325283540246444,
      e: 0.2559423664559152,
      i: 1.074792914785627,
      om: 316.8730460190207,
      w: 177.7858257446624,
      ma: 232.6232954795962,
      epoch: DEEP_SPACE_EPOCH,
    },
    blurb:
      "The dummy payload from the first Falcon Heavy launch: a cherry-red Roadster with a mannequin in the driver's seat, now on a long lap of the Sun that carries it out past Mars and back.",
    why: "The Roadster was thrown clear of Earth on its launch day and now orbits the Sun on a roughly 557-day ellipse.",
  },
];

/**
 * Deep-space entries matching a lowercased query, by name or alias.
 *
 * Substring matching on the name mirrors searchCatalog()'s rule so behaviour is
 * predictable across both lists. The alias list exists for names the catalog
 * spelling doesn't cover — "jwst" and "webb" for the James Webb Space
 * Telescope, "starman" for the Roadster.
 */
export function matchDeepSpace(query) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return [];
  return DEEP_SPACE.filter(
    (e) => e.name.toLowerCase().includes(q) || (e.alt || []).some((a) => a.includes(q))
  );
}
