import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { POSTS, POST_IDS, ARTBOARD, SIZES, DEFAULT_SIZE } from "../../design/social/content.js";
import { ARCHETYPE_IDS } from "../../design/social/build.js";

/**
 * Structural guards for the social/marketing layout kit (design/social/).
 *
 * The kit only renders in a browser and only exports by hand, so none of it
 * runs in CI — which is exactly why the cheap invariants belong in a test.
 * Each case below is a failure that would otherwise surface as a broken or
 * silently wrong PNG, discovered while trying to publish a post:
 *
 *   - a typo'd archetype throws mid-render
 *   - a CSS/JS artboard mismatch fails every export with a confusing message
 *     about the .slide box, because tools/render-social.mjs asserts the PNG
 *     size against ARTBOARD while the actual box comes from the stylesheet
 *   - a missing screenshot renders as a blank hole
 *   - a hand-typed object count ships a stale figure
 */

const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(fileURLToPath(new URL(p, root)), "utf8");
const css = read("design/social/social-kit.css");

/** Pull one declaration out of a CSS rule block. */
function cssVar(selector, prop) {
  const block = css.slice(css.indexOf(selector) + selector.length);
  const body = block.slice(0, block.indexOf("}"));
  const m = body.match(new RegExp(`${prop}:\\s*(\\d+)px`));
  return m ? Number(m[1]) : null;
}

describe("social kit — post definitions", () => {
  it("defines at least one carousel and one single post", () => {
    const kinds = POST_IDS.map((id) => POSTS[id].kind);
    expect(kinds).toContain("carousel");
    expect(kinds).toContain("single");
  });

  it.each(POST_IDS)("%s uses a known kind, size and archetypes", (id) => {
    const post = POSTS[id];
    expect(["carousel", "single"]).toContain(post.kind);
    expect(SIZES).toContain(post.size || DEFAULT_SIZE);
    expect(post.slides.length).toBeGreaterThan(0);
    for (const slide of post.slides) {
      expect(ARCHETYPE_IDS, `${id}: unknown archetype "${slide.type}"`).toContain(slide.type);
    }
  });

  it("keeps carousels within the 10-image platform limit", () => {
    for (const id of POST_IDS) {
      expect(POSTS[id].slides.length, `${id} has too many slides`).toBeLessThanOrEqual(10);
    }
  });

  it("points every shot archetype at a screenshot that exists", () => {
    for (const id of POST_IDS) {
      for (const slide of POSTS[id].slides) {
        if (slide.type !== "shot") continue;
        expect(slide.image, `${id}: shot slide has no image`).toBeTruthy();
        const abs = fileURLToPath(new URL(slide.image, new URL("design/social/", root)));
        expect(existsSync(abs), `${id}: missing screenshot ${slide.image}`).toBe(true);
      }
    }
  });
});

describe("social kit — artboards", () => {
  // tools/render-social.mjs asserts each exported PNG against ARTBOARD, but
  // the pixel size actually comes from the stylesheet. If the two drift, every
  // render fails and the error blames the .slide box rather than the drift.
  it("declares the same width in CSS as in ARTBOARD", () => {
    expect(cssVar(".slide {", "--w")).toBe(ARTBOARD[DEFAULT_SIZE].w);
    for (const size of SIZES) {
      expect(ARTBOARD[size].w, `${size} is not 1080px wide`).toBe(1080);
    }
  });

  it("declares the same height in CSS as in ARTBOARD, for every size", () => {
    expect(cssVar(".slide {", "--h")).toBe(ARTBOARD.portrait.h);
    expect(cssVar('.slide[data-size="square"] {', "--h")).toBe(ARTBOARD.square.h);
    expect(cssVar('.slide[data-size="story"] {', "--h")).toBe(ARTBOARD.story.h);
  });

  it("keeps the box-sizing reset that holds the artboard to its declared size", () => {
    // Without it the outer margin is added to the fixed width/height and every
    // export ships at 1232x1502 — off-aspect on every platform.
    expect(css).toMatch(/box-sizing:\s*border-box/);
  });
});

describe("social kit — object count", () => {
  // CLAUDE.md's OBJECT COUNT convention: the figure has one derived source.
  // Marketing copy here must use the token so an export can never carry a
  // figure that went stale when the catalog crossed a thousand.
  it("uses the {{OBJECT_COUNT}} token, never a typed figure", () => {
    const content = read("design/social/content.js");
    // Rounded thousands only — that is the shape the derivation produces
    // (Math.floor(n / 1000) * 1000). Other marketing figures in this file,
    // like the "1,700+" written-profile count, are separate numbers that the
    // object-count convention does not cover and this test must not claim to.
    const literals = content.match(/\b\d{1,3},000\+/g) || [];
    expect(literals, `hand-typed object counts in content.js: ${literals.join(", ")}`).toEqual([]);
    expect(content).toContain("{{OBJECT_COUNT}}");
  });
});
