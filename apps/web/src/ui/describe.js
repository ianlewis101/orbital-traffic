import {
  isDebrisName,
  NAV_NAME_RE,
  WEATHER_NAME_RE,
  EO_NAME_RE,
} from "@orbital-traffic/catalog";
import { DATA } from "../data/store.js";

/** Fine-grained display type used to choose descriptions and artwork. */
export function classify(s) {
  const n = " " + s.name.toUpperCase() + " ",
    id = s.id,
    t = s.objType || "";
  if (t === "DEB" || t === "R/B" || isDebrisName(s.name)) return "debris";
  if (/ OBJECT | TBA | UNIDENTIFIED | UNKNOWN /.test(n)) return "unknown";
  if (s.cat === "cool") return "telescope"; // hero objects — described individually
  if (s.cat === "classified") return "classified";
  if (id === "25544" || / ZARYA | TIANHE | TIANGONG | WENTIAN | MENGTIAN /.test(n))
    return "station";
  if (
    / SOYUZ | PROGRESS | DRAGON | CYGNUS | SHENZHOU | TIANZHOU | STARLINER | ENDEAVOUR | ENDURANCE | RESILIENCE | FREEDOM /.test(
      n
    )
  )
    return "capsule";
  if (/ STARLINK | ONEWEB /.test(n)) return "starlink";
  if (
    id === "20580" ||
    / HUBBLE | HST | KEPLER | SPITZER | TESS | WEBB | JWST | CHANDRA | CXO | FERMI | FGRST | GLAST /.test(
      n
    )
  )
    return "telescope";
  if (NAV_NAME_RE.test(n) || s.cat === "navigation") return "navigation";
  if (WEATHER_NAME_RE.test(n)) return "weather";
  if (EO_NAME_RE.test(n)) return "eo";
  if (s.cat === "geostationary") return "geo";
  if (s.cat === "starlink") return "starlink";
  if (s.cat === "science") return "telescope"; // science satellites without specific name match
  return "generic";
}

export function describe(s) {
  const n = s.name.toUpperCase(),
    c = classify(s);
  // File descriptions take priority (curated text for specific satellites)
  if (!s._neo && DATA.descs[s.id] && DATA.descs[s.id].d) return DATA.descs[s.id].d;
  // NEO curated descriptions
  if (s._neo && DATA.neoDescs[s.name] && DATA.neoDescs[s.name].description)
    return DATA.neoDescs[s.name].description;
  // NEO objects — rich description from SBDB data
  if (s._neo) {
    const neo = s._neo;
    const cls = neo.orbit_class || "Apollo";
    const diam = neo.diameter
      ? `${parseFloat(neo.diameter) < 1 ? (parseFloat(neo.diameter) * 1000).toFixed(0) + " metres" : parseFloat(neo.diameter).toFixed(1) + " km"} wide`
      : "size unknown";
    const disc = neo.discovered ? `, discovered in ${neo.discovered}` : "";
    const fname = neo.full_name || s.name;
    let approach = "";
    if (neo.next_date && neo.next_dist_ld) {
      const d = new Date(neo.next_date.replace(/-/g, " "));
      const mon = d.toLocaleString("en-US", { month: "short", year: "numeric" });
      const ld = parseFloat(neo.next_dist_ld);
      const close = ld < 10 ? "remarkably close" : ld < 30 ? "close" : "passing";
      approach = ` Its next approach is ${mon} at ${ld} lunar distances — ${close} by astronomical standards.`;
    }
    // Named asteroid specific descriptions
    if (/GEOGRAPHOS/.test(n))
      return `Geographos is a large Apollo-class asteroid ${diam}${disc}. It has one of the most elongated shapes of any known asteroid — nearly 5:1 length-to-width. Radar observations in 1994 revealed its dramatic cigar-like form.${approach}`;
    if (/TOUTATIS/.test(n))
      return `Toutatis is a large Apollo-class asteroid ${diam}${disc}. China's Chang'e 2 spacecraft flew past it in 2012 at just 3.2 km distance, returning the closest images ever taken of a PHA. It tumbles chaotically rather than spinning.${approach}`;
    if (/PHAETHON/.test(n))
      return `Phaethon is a ${cls}-class asteroid ${diam}${disc} and the parent body of the annual Geminid meteor shower. Unusually, it behaves like a comet near perihelion, releasing dust as it heats up. Japan's DESTINY+ mission will fly past it.${approach}`;
    if (/FLORENCE/.test(n))
      return `Florence is an Amor-class asteroid ${diam}${disc}. When it passed Earth in 2017 at 7 million km, radar revealed it has two small moons orbiting it — a rare triple system among near-Earth asteroids.${approach}`;
    if (/APOLLO/.test(n) && s.name.toUpperCase() === "APOLLO")
      return `Apollo is the namesake of the entire Apollo class of Earth-crossing asteroids ${diam}${disc}. Discovered in 1932, lost, and rediscovered in 1973, it was the first asteroid known to cross Earth's orbit.${approach}`;
    if (/ICARUS/.test(n))
      return `Icarus is an Apollo-class asteroid ${diam}${disc}. With a perihelion closer to the Sun than Mercury, it gets scorching hot on approach. It made a famous close pass of just 6.4 million km in 1968.${approach}`;
    if (/HATHOR/.test(n))
      return `Hathor is a tiny Aten-class asteroid ${diam}${disc}. It belongs to the rare Aten group whose orbits lie mostly inside Earth's. Despite its small size it qualifies as potentially hazardous due to its orbital geometry.${approach}`;
    if (/GOLEVKA/.test(n))
      return `Golevka is an Apollo-class asteroid ${diam}${disc} with an unusually angular, blocky shape — almost pyramidal. It was the first asteroid where the Yarkovsky effect (solar heating slowly changing an orbit) was directly measured.${approach}`;
    if (/CASTALIA/.test(n))
      return `Castalia is an Apollo-class asteroid ${diam}${disc} shaped like two lobes joined together — a contact binary. It was the first asteroid ever to have its shape modelled, using Arecibo radar data from its 1989 flyby.${approach}`;
    // Generic rich description
    return `${fname} is a ${cls}-class asteroid${disc}, ${diam}. Its orbit crosses Earth's and brings it within 0.05 AU — classifying it as potentially hazardous.${approach}`;
  }
  // --- hero objects with specific descriptions ---
  if (s.id === "25544" || n.includes("ZARYA"))
    return "The International Space Station — humanity's permanent foothold in space. 109 metres wide, six rooms, six crew. Has been continuously occupied since November 2000.";
  if (s.id === "49044")
    return "Russia's Nauka laboratory module — the largest Russian contribution to the ISS. Launched in July 2021 after a 14-year delay, it docked autonomously and provides additional research facilities, a European robotic arm, and a second toilet for the Russian segment.";
  if (s.id === "27386")
    return "Node 1 — the first US-built ISS module, launched December 1998. Unity connects the Russian and American segments and has six docking ports.";
  if (s.id === "28654")
    return "Node 2 — the primary docking hub for visiting spacecraft including Dragon and HTV. Launched October 2007, it connects the US, European and Japanese lab modules.";
  if (s.id === "37224")
    return "Node 3 — houses the life support systems that recycle air and water for the crew. Also home to the Cupola — the seven-window observatory with the best view in the solar system.";
  if (/CSS|TIANHE|TIANGONG|WENTIAN|MENGTIAN/.test(n))
    return "China's Tiangong space station — completed in 2022 and permanently crewed. At roughly one-fifth the size of the ISS, it is the world's second active crewed station.";
  if (s.id === "20580" || /HUBBLE|HST/.test(n))
    return "The Hubble Space Telescope — launched in 1990 and still operating. Orbits 340 miles up, above the atmosphere's blur, and has produced some of the most iconic images in the history of astronomy.";
  if (/WEBB|JWST/.test(n))
    return "The James Webb Space Telescope — located 1 million miles away at the Sun-Earth L2 point. Its 21-foot gold mirror sees the universe in infrared, peering back to the first galaxies formed after the Big Bang.";
  if (/CHANDRA|CXO/.test(n))
    return "The Chandra X-Ray Observatory — launched in 1999, it sees the universe in X-rays invisible to the human eye. Its highly elliptical orbit takes it one-third of the way to the Moon every 64 hours.";
  if (/FERMI|FGRST|GLAST/.test(n))
    return "The Fermi Gamma-Ray Space Telescope — launched in 2008 to study the most violent events in the universe: gamma-ray bursts, supermassive black holes, and the mystery of dark matter.";
  if (/TESS/.test(n))
    return "TESS — the Transiting Exoplanet Survey Satellite, launched 2018. Watching over 200,000 nearby stars for the tiny dimming that signals a planet crossing in front. Has discovered thousands of exoplanet candidates.";
  if (/KEPLER/.test(n))
    return "Kepler — NASA's planet-hunting telescope, launched in 2009 and retired in 2018. Discovered over 2,600 confirmed exoplanets by staring at a single patch of sky for nine years. Drifting silently in a heliocentric orbit.";
  if (/LANDSAT 9|LANDSAT-9/.test(n))
    return "Landsat 9 — the latest in a 50-year series of Earth-imaging satellites. Captures the planet's changing land surface in stunning detail every 16 days, tracking deforestation, glacial retreat, and urban growth.";
  if (/\bTERRA\b/.test(n))
    return "Terra — NASA's flagship Earth observer, launched 1999. Carries five instruments scanning the entire planet every one to two days, building a continuous record of Earth's land, oceans, and atmosphere.";
  if (/\bAQUA\b/.test(n))
    return "Aqua — NASA's water-cycle satellite, launched 2002. Measures precipitation, evaporation, ocean temperatures, sea ice, and water vapour to understand how water moves through the Earth system.";
  if (/DSCOVR/.test(n))
    return "DSCOVR — the Deep Space Climate Observatory, sitting at the Sun-Earth L1 point 1 million miles away. Monitors the solar wind 15–60 minutes before it hits Earth and returns the iconic 'EPIC' daily images of the full sunlit Earth.";
  // --- Starlink / OneWeb ---
  if (n.includes("STARLINK"))
    return "One of SpaceX's Starlink broadband satellites — part of a constellation now numbering over 6,000 spacecraft, the largest active satellite fleet ever assembled.";
  if (n.includes("ONEWEB"))
    return "A OneWeb satellite — part of a 648-satellite constellation delivering global broadband internet, particularly to remote and polar regions.";
  // --- Soyuz / Dragon / Cygnus ---
  if (/SOYUZ/.test(n))
    return "A Soyuz spacecraft — Russia's workhorse crew vehicle, in continuous service since 1967. Each one flies a crew to and from the ISS before being deorbited.";
  if (/PROGRESS/.test(n))
    return "A Progress cargo spacecraft — the uncrewed resupply ship that keeps the ISS stocked with food, fuel, and equipment.";
  if (/DRAGON/.test(n))
    return "A SpaceX Dragon — the first commercial spacecraft to carry astronauts to the ISS. Reusable and autonomous, it docks itself using cameras and computer vision.";
  if (/CYGNUS/.test(n))
    return "A Cygnus cargo vehicle built by Northrop Grumman — a disposable resupply ship that burns up on re-entry after delivering its cargo to the ISS.";
  // --- Classified military/intelligence satellites — the mystery is the appeal ---
  if (/\bUSA\s+\d+\b/.test(n))
    return "A classified National Reconnaissance Office or US Space Force payload. Its mission, capabilities, and operators are officially undisclosed. Tracked by civilian surveillance networks as part of the open space catalog — the US government acknowledges its existence but nothing else.";
  if (/\bNROL\b/.test(n))
    return "A National Reconnaissance Office launch — the agency that operates America's spy satellites. What this spacecraft does, where it points, and what it sees are state secrets. The NRO's motto: 'Nothing is beyond our reach.'";
  if (/\bYAOGAN\b/.test(n))
    return "A Chinese military remote sensing satellite. Yaogan means 'remote sensing' — a deliberately vague designation covering a constellation believed to include optical reconnaissance, radar imaging, and signals intelligence assets. China has never officially described their capabilities.";
  if (/\bPRAETORIAN\b/.test(n))
    return "A US Space Development Agency experimental military satellite, part of a new generation of Pentagon space assets being built faster and cheaper than traditional defense programs. Praetorians were the elite guards of Roman emperors — the name was chosen deliberately.";
  if (/\bSHIJIAN[-\s]*\d+[A-Z]?\b/.test(n))
    return "A Chinese experimental satellite — 'Shijian' means 'practice' or 'experiment', a designation that covers everything from genuine technology demonstrators to some of China's most sensitive military space programs. Shijian-21 captured and moved a dead satellite in 2022, demonstrating capabilities that alarmed Western space agencies.";
  if (/\bCHANGGUANG\b/.test(n))
    return "A Chang Guang Satellite Technology spacecraft. Nominally a commercial Earth-imaging operator behind the Jilin-1 constellation, the state-linked company is also believed to support Chinese military reconnaissance — the line between commercial and military space in China is deliberately blurred.";
  // --- generic by type ---
  switch (c) {
    case "station":
      return "A crewed space station — a permanently inhabited outpost in orbit.";
    case "capsule":
      return "A crew or cargo spacecraft — ferrying astronauts and supplies to and from the space station.";
    case "navigation":
      return "A navigation satellite broadcasting the precise timing signals that GPS, Galileo, GLONASS or BeiDou receivers use to pinpoint a location anywhere on Earth.";
    case "weather":
      return "A weather satellite imaging Earth's clouds, storms and atmospheric conditions to feed forecasts and climate models.";
    case "eo":
      return "An Earth-observation satellite mapping the planet's land, oceans and changing environment.";
    case "telescope":
      return "A space telescope — studying the cosmos from above the blur and filtering of Earth's atmosphere.";
    case "geo":
      return "A geostationary satellite — locked in orbit at 22,236 miles up, hovering motionless over one fixed point above the equator.";
    case "classified":
      return "A classified military or intelligence satellite. Its mission, capabilities, and operator are officially undisclosed.";
    case "debris":
      return "A piece of orbital debris — either a spent rocket body (the discarded upper stage of a launch vehicle) or a fragment from a past collision or breakup, tracked by space-surveillance networks.";
    case "unknown":
      return "An object tracked by space-surveillance networks, not yet publicly identified.";
    default:
      return "A satellite in Earth orbit, catalogued by the world's space-surveillance networks.";
  }
}

export const GALLERIES = {
  "HUBBLE SPACE TELESCOPE": "https://hubblesite.org/images/gallery",
  "JAMES WEBB SPACE TELESCOPE": "https://webbtelescope.org/news/webb-releases",
  "CHANDRA X-RAY OBSERVATORY": "https://chandra.harvard.edu/photo/",
  "FERMI GAMMA-RAY TELESCOPE": "https://fermi.gsfc.nasa.gov/science/",
  TESS: "https://tess.mit.edu/publications/",
  KEPLER: "https://science.nasa.gov/mission/kepler/",
  TERRA: "https://terra.nasa.gov/gallery",
  AQUA: "https://aqua.nasa.gov/content/gallery",
  "LANDSAT 9": "https://landsat.visibleearth.nasa.gov/",
  DSCOVR: "https://epic.gsfc.nasa.gov/",
};

export function galleryUrl(s) {
  return GALLERIES[s.name.toUpperCase()] || null;
}
