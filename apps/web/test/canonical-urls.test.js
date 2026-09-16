import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Each HTML entry point declares its own address three times — <link rel=
 * "canonical">, og:url, and a <loc> in sitemap.xml — and nothing checked that
 * the three agreed. They drifted: index.html carried no canonical at all, and
 * its og:url said "https://orbitaltraffic.app" while the sitemap said
 * "https://orbitaltraffic.app/". A trailing slash is a different URL to a
 * crawler, so that mismatch invites Google to treat the two as separate pages
 * and pick its own canonical.
 *
 * Found while investigating a Search Console "Page with redirect" notice
 * (2026-09-16). The notice itself was benign — GitHub Pages' http→https and
 * www→apex 301s, working correctly — but the drift it surfaced was real.
 *
 * The host is read from CNAME rather than hardcoded, so a domain move fails
 * here (naming every file to update) instead of silently pointing the whole
 * site's canonicals at a domain it no longer serves.
 */

const root = new URL("../../../", import.meta.url);
const read = (p) => readFileSync(fileURLToPath(new URL(p, root)), "utf8");

const ORIGIN = `https://${read("CNAME").trim()}`;
const ENTRY_POINTS = ["apps/web/index.html", "apps/web/welcome.html"];

const canonicalOf = (html) => html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
const ogUrlOf = (html) => html.match(/<meta\s+property="og:url"\s+content="([^"]+)"/i)?.[1];
const sitemapLocs = () => [...read("apps/web/public/sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

describe("entry points agree with the sitemap on their own URL", () => {
  it.each(ENTRY_POINTS)("%s declares a canonical URL on the live origin", (file) => {
    const canonical = canonicalOf(read(file));

    expect(canonical, `${file} has no <link rel="canonical"> — a crawler is left to guess`).toBeDefined();
    expect(
      canonical,
      `${file}'s canonical must be absolute and on ${ORIGIN} (the domain in CNAME); ` +
        `a relative, http:// or www. form points crawlers at a URL that only redirects`
    ).toMatch(new RegExp(`^${ORIGIN}/`));
  });

  it.each(ENTRY_POINTS)("%s's og:url matches its canonical exactly", (file) => {
    const html = read(file);
    expect(
      ogUrlOf(html),
      `${file}'s og:url and canonical disagree — they are the same page's address, ` +
        `and a trailing slash is enough to make them two URLs`
    ).toBe(canonicalOf(html));
  });

  it.each(ENTRY_POINTS)("%s's canonical is listed in sitemap.xml", (file) => {
    const canonical = canonicalOf(read(file));
    expect(
      sitemapLocs(),
      `sitemap.xml does not list ${canonical} — submitting one spelling while the ` +
        `page claims another is what makes a page get filed as a duplicate`
    ).toContain(canonical);
  });

  it("sitemap.xml lists nothing beyond the entry points", () => {
    // The other direction: a <loc> with no page behind it (a renamed or deleted
    // route) submits a crawler straight to a 404 or a redirect.
    const canonicals = ENTRY_POINTS.map((f) => canonicalOf(read(f)));
    expect([...sitemapLocs()].sort()).toEqual([...canonicals].sort());
  });
});
