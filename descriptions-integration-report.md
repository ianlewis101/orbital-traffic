# Descriptions Integration Report — Batch 2

**Integrated: 208 new descriptions | Conflicts: 7 | Skipped (other category): 0 | Skipped (identical): silent**

Source files: `batch3_descriptions.json`, `geo_all_descriptions.json` — treated as one combined dataset (591 unique NORAD IDs).

> Note: this repo no longer has an `index.html` data island or `scripts/update_tles.py` —
> since the July 2026 monorepo rebuild (PR #35), curated descriptions live in
> `apps/web/public/data/descriptions.json`. New entries were merged into that JSON file
> via a proper JSON parse/serialize (no regex, no hand-patching), matching the existing
> `{"<norad>": {"d", "a", "t"}}` schema. Object categories were computed with the app's
> own `categorize()` pipeline from `packages/catalog/src/classify.js`.

## Section 1 — Conflicts

### Same NORAD ID appears more than once in the attached dataset with different descriptions

#### 35496 — catalog name: TERRESTAR-1

**Version A — entry `FM-6` in `geo_all_descriptions.json`:**

> Part of the original O3b MEO broadband constellation. The O3b orbit at 8,000 km provides a middle ground between LEO's low latency and GEO's wide coverage — O3b satellites travel around Earth every 6 hours but move slowly enough that large antennas can track them, providing 150 ms latency and gigabit throughput to customers as each satellite passes overhead. Ships in the middle of the Pacific can stream video because of satellites like FM-6.

**Version B — entry `TERRESTAR-1` in `geo_all_descriptions.json`:**

> An ambitious but ultimately unsuccessful attempt to provide direct-to-smartphone mobile satellite service in North America. TerreStar-1 was one of the largest commercial GEO satellites ever built at launch — nearly 7 tons — designed to use an enormous 18-meter antenna to communicate directly with LTE smartphones without special satellite hardware. The company went bankrupt before the service launched, but the technical concept TerreStar proved has since been revived by Starlink, AST SpaceMobile, and Lynk in LEO approaches.

The app already carries a description for 35496 that is identical to Version B (`TERRESTAR-1`), under the catalog name above — the other version likely has a wrong NORAD ID. The app was left unchanged.

#### 41191 — catalog name: EXPRESS-AMU1

**Version A — entry `EXPRESS AMU-1` in `geo_all_descriptions.json`:**

> Russia's Express-AMU1 provides direct-to-home TV broadcasting across Russia — the backbone of Russian national television distribution. It replaced older Soviet-era satellites that had sustained the national broadcasting network through economic chaos and carried Russian state channels to all 11 time zones. Control of satellite TV distribution gives the Russian government a powerful tool for national information management across its vast territory.

**Version B — entry `EXPRESS-AMU1` in `geo_all_descriptions.json`:**

> Russia's first high-throughput Ka-band satellite, designed to provide broadband internet across Russia and Eastern Europe. Express-AMU1 was built by Airbus Defence and Space before Western sanctions cut off satellite component access — one of the last examples of European-Russian commercial satellite cooperation. The satellite demonstrates the broadband capabilities that Russia aimed to deliver to underserved rural populations before geopolitical isolation restricted access to Western satellite manufacturing.

The app already carries a description for 41191 that is identical to Version A (`EXPRESS AMU-1`), under the catalog name above — the other version likely has a wrong NORAD ID. The app was left unchanged.

#### 28158 — catalog name: USA 176 (DSP 22)

**Version A — entry `USA 158 (DSP 22)` in `geo_all_descriptions.json`:**

> One of the last Defense Support Program satellites, overlapping with the SBIRS system that replaced it. DSP-22 represents the culmination of 40 years of infrared missile warning technology development. Its scanning sensors can distinguish missile launches from other infrared events like wildfires and industrial explosions — a detection discrimination capability refined through thousands of hours of operational monitoring.

**Version B — entry `USA 176 (DSP 22)` in `geo_all_descriptions.json`:**

> The final satellite in America's Defense Support Program — the 40-year infrared surveillance network that served as the foundation of US nuclear deterrence. Every ballistic missile launch anywhere on Earth since 1970 was detected by a DSP satellite within seconds. DSP-22 closes a program that watched the Cold War, the Gulf War, and every missile test by every nuclear-armed nation on Earth. It now operates alongside its far more capable SBIRS successors, a proven backup to America's most critical early warning system.

The app already carries a description for 28158 that is identical to Version A (`USA 158 (DSP 22)`), under the catalog name above — the other version likely has a wrong NORAD ID. The app was left unchanged.

### Existing description differs from new

#### 36411 — EWS-G2 (GOES 15)

**EXISTING (currently in the app):**

> Originally GOES-15, this satellite was transferred to the US Space Force and repurposed as Enhanced Weather System-G2 for military Pacific coverage — watching weather across the vast Pacific theater from Alaska and Hawaii to the South Pacific. One satellite's retirement became another mission's foundation.

**NEW (from attached file):**

> Originally NASA's GOES-15 weather satellite, transferred to the US Space Force after operational weather retirement and repurposed as Enhanced Weather System-G2 for military Pacific theater coverage. The repurposing extends an operationally functional satellite's life by switching from civilian weather monitoring to military tactical weather support — providing US Indo-Pacific Command with enhanced weather data for operations across the Pacific theater from its geostationary position.

The existing description was left untouched.

#### 36744 — COMS 1

**EXISTING (currently in the app):**

> South Korea's first geostationary satellite combined three missions: weather observation, ocean monitoring, and communications. It covered Asia-Pacific with half-hourly weather imagery while simultaneously monitoring ocean color and supporting maritime communications — three jobs from one spacecraft parked 36,000 km up.

**NEW (from attached file):**

> South Korea's first geostationary satellite, combining three missions — weather observation, ocean color monitoring, and Ka-band communications — in a single spacecraft. COMS-1's meteorological imager provided the operational experience that South Korea leveraged when developing the far more capable GEO-KOMPSAT-2A and 2B pair. As Korea's first foray into geostationary satellite operations, COMS-1 was as much a training program for Korean satellite operators and scientists as it was an operational service platform.

The existing description was left untouched.

#### 41105 — ELEKTRO-L 2

**EXISTING (currently in the app):**

> Russia's Elektro-L No.2 is among the world's highest-resolution geostationary weather satellites, with full-disk images at 1 km visible resolution. Stationed at 76°E over Siberia, it covers Russia's vast territory from a fixed point — the only practical way to watch weather across 5 time zones from a single geostationary position.

**NEW (from attached file):**

> Russia's second-generation geostationary weather satellite, featuring one of the highest-resolution full-disk imaging systems of any weather satellite. Elektro-L 2 produces full-disk visible and infrared imagery at 1 km resolution — among the sharpest Earth views from geostationary orbit. Stationed over Russia at 76°E, it monitors the vast Siberian territory and the Arctic Ocean from a fixed vantage point, feeding Russia's weather forecast models for a country spanning 11 time zones.

The existing description was left untouched.

#### 41194 — GAOFEN-4

**EXISTING (currently in the app):**

> China's first geostationary high-resolution optical satellite, the most powerful geostationary imager ever built at launch. Unlike polar satellites that pass once daily, Gaofen-4 watches continuously from 36,000 km — achieving 50-meter resolution while staring at a typhoon for hours. The satellite that gave China a geostationary eye that never blinks.

**NEW (from attached file):**

> China's revolutionary geostationary imaging satellite — the world's most powerful civilian GEO optical telescope. Unlike polar-orbiting satellites that image any point on Earth once daily, Gaofen-4 stares continuously from 36,000 km, achieving 50-meter resolution while watching any chosen location for hours. It provides China with persistent surveillance of specific regions impossible from LEO — monitoring a developing typhoon, a border incident, or an overseas military deployment with unbroken coverage that no other nation's satellite can match.

The existing description was left untouched.

## Section 2 — Other Category Objects

No other-category objects found.

## Appendix — Not in the app catalog

These 3 NORAD IDs from the attached files are not in the app's current satellite catalog (`apps/web/public/data/satellites.json`), so their app category could not be determined. They were **not** integrated — flagging for review rather than guessing:

| NORAD ID | Name (attached file) |
|---|---|
| 33153 | INTELSAT 25 (IS-25) |
| 49496 | CZ-4C R/B |
| 60753 | CZ-6A DEB |

