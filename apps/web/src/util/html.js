/**
 * Escape text before it is interpolated into an innerHTML template string or
 * an HTML attribute value. Escapes the five characters that can break out of
 * either context (& < > " '), so untrusted or semi-trusted text — live feed
 * data, catalog metadata, unrecognized lookup-table values — can never inject
 * markup. Use this at every innerHTML/attribute interpolation that carries a
 * value not fully controlled by our own source.
 */
export function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
