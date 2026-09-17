import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * What a crawler can learn about this site without executing JavaScript.
 *
 * index.html renders into a WebGL canvas: strip the scripts and there is not
 * one sentence in it. That is fine for Googlebot, which renders — and not fine
 * for everything else, which is most crawlers, including the AI assistants a
 * growing share of people search through. Two things carry the page for those:
 * the JSON-LD entity graph in <head>, and the <noscript> block at the end of
 * <body>. Both are invisible in normal use, so nothing about running the app
 * would ever reveal that one had been broken or dropped.
 *
 * Added 2026-09-17 after a competitor with a semantically adjacent name
 * (orbitalradar.com) was outranking this site on its own brand name. The cause
 * was not that competitor targeting the brand; it was that "Orbital Traffic"
 * had almost no machine-readable brand identity to outrank — two indexable
 * URLs, no entity markup, and a root URL that read as blank.
 *
 * These assert the invariants, not the prose: that the markup parses, that it
 * names the right entity, and — for the FAQ — that the copy duplicated into
 * JSON-LD still matches the copy a visitor actually sees, which is the
 * condition Google requires for the markup to be eligible at all.
 */

const root = new URL("../../../", import.meta.url);
const read = (p) => readFileSync(fileURLToPath(new URL(p, root)), "utf8");

const ORIGIN = `https://${read("CNAME").trim()}`;
const INDEX = read("apps/web/index.html");
const WELCOME = read("apps/web/welcome.html");

/** Every application/ld+json block in a document, parsed. */
function jsonLd(html, file) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return blocks.map((m, i) => {
    try {
      return JSON.parse(m[1]);
    } catch (err) {
      throw new Error(
        `${file}'s JSON-LD block #${i + 1} is not valid JSON, so every crawler ` +
          `silently discards it: ${err.message}`
      );
    }
  });
}

/** Flattens an @graph wrapper so a lookup works the same either way. */
const nodesOf = (docs) => docs.flatMap((d) => (Array.isArray(d["@graph"]) ? d["@graph"] : [d]));
const byType = (nodes, type) => nodes.find((n) => n["@type"] === type);

describe("index.html carries a brand entity crawlers can read without JS", () => {
  const nodes = nodesOf(jsonLd(INDEX, "apps/web/index.html"));

  it("declares a WebSite node naming the brand", () => {
    const site = byType(nodes, "WebSite");
    expect(site, "index.html has no WebSite JSON-LD — nothing states what this domain is").toBeDefined();
    expect(site.name).toBe("Orbital Traffic");
    expect(site.url).toBe(`${ORIGIN}/`);
  });

  it("lists the alternate spellings people actually type", () => {
    const site = byType(nodes, "WebSite");
    // A brand query is lost to a similarly-named competitor when the brand has
    // no entity behind it. alternateName is the cheapest signal that there is.
    expect(Array.isArray(site.alternateName), "alternateName should be a list of spellings").toBe(true);
    expect(site.alternateName.length).toBeGreaterThan(0);
  });

  it("declares a WebApplication node tied to that WebSite", () => {
    const app = byType(nodes, "WebApplication");
    expect(app, "index.html has no WebApplication JSON-LD").toBeDefined();
    expect(app.name).toBe("Orbital Traffic");
    expect(
      app.isPartOf?.["@id"],
      "the app node must point at the WebSite node's @id, or the two read as unrelated entities"
    ).toBe(byType(nodes, "WebSite")["@id"]);
  });

  it("ties the domain to the App Store listing and the public repo", () => {
    const app = byType(nodes, "WebApplication");
    // sameAs is what makes three separate mentions of a common phrase resolve
    // to one thing. Dropping either link costs a corroborating signal.
    expect(app.sameAs.join(" ")).toMatch(/apps\.apple\.com/);
    expect(app.sameAs.join(" ")).toMatch(/github\.com/);
  });

  it("hand-writes no object count in its structured data", () => {
    // Same rule as the rest of the file: the figure is derived, never typed.
    // object-count-sync.test.js asserts this for the document as a whole; this
    // is here so a future edit to the JSON-LD gets the reason, not just a fail.
    expect(INDEX).toContain("{{OBJECT_COUNT}}");
  });
});

describe("index.html says something to a crawler that never runs the app", () => {
  const noscript = INDEX.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1];

  it("has a noscript block with real prose in it", () => {
    expect(noscript, "index.html has no <noscript> — the page reads as blank without JS").toBeDefined();
    const words = noscript
      .replace(/<style>[\s\S]*?<\/style>/g, "")
      .replace(/<[^>]*>/g, " ")
      .trim()
      .split(/\s+/).length;
    expect(
      words,
      "the noscript block is too short to describe the site to a non-rendering crawler"
    ).toBeGreaterThan(120);
  });

  it("carries its own styles, because app.css never loads without JS", () => {
    // app.css is imported from main.js. With scripting off there is no
    // stylesheet at all, so a rule added to app.css for this block would never
    // apply — it has to be inline here.
    expect(
      noscript,
      "noscript content would render unstyled: app.css is imported from main.js, which never runs here"
    ).toMatch(/<style>/);
  });

  it("links to welcome.html, which nothing else on the site does", () => {
    // welcome.html is the only page on the domain with substantive content and
    // the app never linked to it, leaving it an orphan in the sitemap. This is
    // the one internal link to it; removing it re-orphans the page silently.
    expect(
      noscript,
      "the only internal link to welcome.html is gone — it is an orphan page again"
    ).toMatch(/href="\/welcome\.html"/);
  });
});

describe("welcome.html's FAQ markup matches the FAQ a visitor sees", () => {
  const faqDoc = jsonLd(WELCOME, "apps/web/welcome.html").find((d) => d["@type"] === "FAQPage");

  /** The visible <details class="faq-item"> pairs, in document order. */
  const visible = [...WELCOME.matchAll(/<details class="faq-item">\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)].map(
    (m) => ({ q: m[1].trim(), a: m[2].trim() })
  );

  it("has an FAQPage block", () => {
    expect(faqDoc, "welcome.html has no FAQPage JSON-LD").toBeDefined();
  });

  it("finds the visible FAQ items it is supposed to mirror", () => {
    // Guards the guard: a markup change to the <details> blocks that stopped
    // this regex matching would make every comparison below vacuously pass.
    expect(visible.length, "no .faq-item <details> matched — this test stopped checking anything").toBeGreaterThan(0);
  });

  it("states exactly the visible questions, in the same order", () => {
    // Google requires the marked-up Q&A to be present on the page. Extra or
    // missing entries are a manual action, not a silent downgrade.
    expect(faqDoc.mainEntity.map((q) => q.name)).toEqual(visible.map((v) => v.q));
  });

  it("states exactly the visible answers", () => {
    const marked = faqDoc.mainEntity.map((q) => q.acceptedAnswer.text);
    expect(marked).toEqual(visible.map((v) => v.a));
  });
});

describe("both entry points are shareable", () => {
  it.each([
    ["apps/web/index.html", INDEX],
    ["apps/web/welcome.html", WELCOME],
  ])("%s declares an og:image on the live origin", (file, html) => {
    // Without one, every share of the URL renders as a blank card. index.html
    // had no og:image at all, which is the URL most people actually paste.
    const img = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    expect(img, `${file} has no og:image — links to it share as an empty card`).toBeDefined();
    expect(img).toMatch(new RegExp(`^${ORIGIN}/`));
  });

  it.each([
    ["apps/web/index.html", INDEX],
    ["apps/web/welcome.html", WELCOME],
  ])("%s names the site in og:site_name", (file, html) => {
    expect(html).toMatch(/<meta property="og:site_name" content="Orbital Traffic">/);
  });
});
