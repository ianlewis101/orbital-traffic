// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Astronaut profile accordion in the crew card: tapping a roster avatar
 * expands that person's LL2 profile (photo, bio, flight stats) into a single
 * shared panel below the avatar grid, fetched from the Worker's /astronaut
 * route.
 *
 * These run against a real DOM because the behaviour under test *is* DOM
 * behaviour — button wiring, aria-expanded state, and which request is
 * allowed to paint. The sibling crew.test.js covers the markup-level caveats
 * with a plain object stub.
 *
 * Selections use the CSS/Tiangong hub (48274) rather than the ISS (25544) so
 * no /today fetch has to be stubbed, matching crew.test.js.
 */
import { fetchAndRenderCrew, formatDuration } from "../src/ui/crew.js";
import { state } from "../src/state.js";

const CSS_HUB = { id: "48274", name: "CSS (TIANHE)", cat: "stations" };

let el;
beforeEach(() => {
  el = document.createElement("div");
  el.id = "info-crew";
  document.body.appendChild(el);
  vi.stubGlobal("fetch", vi.fn());
  state.selected = CSS_HUB;
  state.capsulesData = null;
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  state.selected = null;
  state.capsulesData = null;
});

const PROFILE = {
  id: 916,
  name: "Zhang Zhiyuan",
  nationality: "Chinese",
  agency: "China National Space Administration",
  bio: "Zhang Zhiyuan is a Chinese astronaut selected as part of the Shenzhou program.",
  image: "https://example.test/zhang.jpg",
  wiki: null,
  twitter: null,
  instagram: null,
  flights: 1,
  spacewalks: 0,
  timeInSpace: "P42DT3H",
  evaTime: null,
};

// Fetched profiles are cached for the life of the page (a roster barely
// changes, and the Worker caches for a day anyway), which means the cache is
// module-level and deliberately outlives a single render — so tests that
// exercise fetching must each use their own astronaut id rather than relying
// on a reset between them.
function roster(id, extra = {}) {
  return [{ name: "Zhang Zhiyuan", craft: "Tiangong", id, role: "Commander", ...extra }];
}

// Routes the two fetches fetchAndRenderCrew() + the accordion make: the
// roster, then the per-astronaut profile.
function mockCrewAndProfile(people, profile = PROFILE) {
  fetch.mockImplementation((url) => {
    if (url.includes("/crew"))
      return Promise.resolve(
        new Response(JSON.stringify({ people, number: people.length, ok: true }))
      );
    if (url.includes("/astronaut")) return Promise.resolve(new Response(JSON.stringify(profile)));
    throw new Error("unexpected URL " + url);
  });
}

describe("crew avatar → astronaut profile accordion", () => {
  it("renders avatars with an id as real buttons, collapsed by default", async () => {
    mockCrewAndProfile(roster(916));
    await fetchAndRenderCrew(CSS_HUB);

    const btn = el.querySelector(".crew-av");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(btn.dataset.aid).toBe("916");
    expect(el.querySelector(".crew-bio").hidden).toBe(true);
  });

  it("expands the profile on click and collapses it on a second click", async () => {
    mockCrewAndProfile(roster(916));
    await fetchAndRenderCrew(CSS_HUB);
    const btn = el.querySelector(".crew-av");
    const panel = el.querySelector(".crew-bio");

    await btn.onclick();

    expect(panel.hidden).toBe(false);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(panel.textContent).toContain("Chinese");
    expect(panel.textContent).toContain("Shenzhou program");
    // Counts read naturally at 1 and at 0/many.
    expect(panel.textContent).toContain("1 flight");
    expect(panel.textContent).not.toContain("1 flights");
    expect(panel.textContent).toContain("0 EVAs");
    expect(panel.querySelector("img").getAttribute("src")).toBe("https://example.test/zhang.jpg");
    // "P42DT3H" → days + hours, not a raw ISO duration.
    expect(panel.textContent).toContain("42d 3h");
    expect(panel.textContent).not.toContain("P42DT3H");

    await btn.onclick();

    expect(panel.hidden).toBe(true);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("only fetches a given profile once, even across open/close cycles", async () => {
    mockCrewAndProfile(roster(9001));
    await fetchAndRenderCrew(CSS_HUB);
    const btn = el.querySelector(".crew-av");

    await btn.onclick();
    await btn.onclick();
    await btn.onclick();

    const profileCalls = fetch.mock.calls.filter(([u]) => u.includes("/astronaut"));
    expect(profileCalls).toHaveLength(1);
  });

  it("keeps only one person open at a time", async () => {
    mockCrewAndProfile([
      ...roster(9002),
      { name: "Lai Ka-ying", craft: "Tiangong", id: 9003, role: "Flight Engineer" },
    ]);
    await fetchAndRenderCrew(CSS_HUB);
    const [first, second] = el.querySelectorAll(".crew-av");

    await first.onclick();
    await second.onclick();

    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(second.getAttribute("aria-expanded")).toBe("true");
  });

  it("shows an unavailable message rather than an empty panel when the profile fetch fails", async () => {
    fetch.mockImplementation((url) => {
      if (url.includes("/crew"))
        return Promise.resolve(new Response(JSON.stringify({ people: roster(9004), ok: true })));
      return Promise.reject(new Error("down"));
    });
    await fetchAndRenderCrew(CSS_HUB);
    const btn = el.querySelector(".crew-av");

    await btn.onclick();

    expect(el.querySelector(".crew-bio").textContent).toContain("Profile unavailable");
  });

  it("leaves a crew member with no id as a non-interactive avatar", async () => {
    // A roster served from an edge cache filled before ids were added.
    mockCrewAndProfile([{ name: "Solo", craft: "Tiangong" }]);
    await fetchAndRenderCrew(CSS_HUB);

    const av = el.querySelector(".crew-av");
    expect(av.tagName).toBe("DIV");
    expect(av.dataset.aid).toBeUndefined();
  });

  it("marks the real commander rather than whoever is listed first", async () => {
    mockCrewAndProfile([
      { name: "Flight Engineer", craft: "Tiangong", id: 1, role: "Flight Engineer" },
      { name: "The Boss", craft: "Tiangong", id: 2, role: "Commander" },
    ]);
    await fetchAndRenderCrew(CSS_HUB);

    const faces = el.querySelectorAll(".crew-av-c");
    expect(faces[0].classList.contains("cmd")).toBe(false);
    expect(faces[1].classList.contains("cmd")).toBe(true);
  });

  it("falls back to the first-listed person when no roles are present at all", async () => {
    mockCrewAndProfile([
      { name: "First", craft: "Tiangong", id: 1 },
      { name: "Second", craft: "Tiangong", id: 2 },
    ]);
    await fetchAndRenderCrew(CSS_HUB);

    const faces = el.querySelectorAll(".crew-av-c");
    expect(faces[0].classList.contains("cmd")).toBe(true);
    expect(faces[1].classList.contains("cmd")).toBe(false);
  });

  it("does not paint a slow profile response after the user collapsed it", async () => {
    let release;
    const pending = new Promise((r) => (release = r));
    fetch.mockImplementation((url) => {
      if (url.includes("/crew"))
        return Promise.resolve(new Response(JSON.stringify({ people: roster(9005), ok: true })));
      return pending.then(() => new Response(JSON.stringify(PROFILE)));
    });
    await fetchAndRenderCrew(CSS_HUB);
    const btn = el.querySelector(".crew-av");
    const panel = el.querySelector(".crew-bio");

    const opening = btn.onclick(); // starts the fetch, shows "Loading profile…"
    await btn.onclick(); // collapse before it lands
    release();
    await opening;

    expect(panel.hidden).toBe(true);
    expect(panel.textContent).not.toContain("Shenzhou program");
  });
});

describe("formatDuration", () => {
  it("formats LL2's ISO 8601 durations", () => {
    expect(formatDuration("P369DT6H45M59S")).toBe("369d 6h");
    expect(formatDuration("P1DT5H4M")).toBe("1d 5h");
    expect(formatDuration("P42D")).toBe("42d");
  });

  it("keeps minutes for sub-day durations but drops them once it spans days", () => {
    expect(formatDuration("PT45M")).toBe("45m");
    expect(formatDuration("PT6H30M")).toBe("6h 30m");
    expect(formatDuration("P1DT5H4M")).toBe("1d 5h");
  });

  it("folds years and months into days when LL2 sends them", () => {
    expect(formatDuration("P1Y2M3D")).toBe("428d");
  });

  it("returns null for anything unparseable rather than a raw duration", () => {
    expect(formatDuration("")).toBeNull();
    expect(formatDuration("nonsense")).toBeNull();
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration("PT0S")).toBeNull();
  });
});
