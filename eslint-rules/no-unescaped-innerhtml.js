/**
 * ESLint rule: no-unescaped-innerhtml
 *
 * CI safety net for the F12 escaping work (PR #83). Every value interpolated
 * into an `X.innerHTML = `...${expr}...`` template must be provably safe —
 * escaped with esc() (apps/web/src/util/html.js), a literal, or the output of a
 * known fixed-shape formatter — otherwise it is reported so it fails `npm run
 * lint`.
 *
 * An interpolated `${expr}` is treated as SAFE when it is:
 *   1. A call to esc(...)                              — the escape helper.
 *   2. A string / number / boolean / null literal      — no markup shape.
 *   3. A call to an enumerated internal formatter       (SAFE_FUNCTIONS) or a
 *      numeric-formatting method call                   (SAFE_METHODS); both
 *      always yield a fixed, non-attacker-controlled string.
 *   4. A ternary / logical / nested template literal whose every branch is
 *      itself one of the above safe forms.
 *
 * Anything else — a bare variable (`${hex}`), a property access (`${s.name}`),
 * a string concatenation, or an un-enumerated call — is reported.
 *
 * The rule deliberately does NOT trace variables (no data-flow analysis), to
 * stay small and readable. When an interpolation is nonetheless safe because
 * the value was escaped or assembled from esc() earlier in the same function
 * (e.g. `const stationLbl = status.stationKey ? esc(...) : null`, later used as
 * `${stationLbl}`), silence that one spot with an eslint-disable comment that
 * says why it is safe.
 *
 * SCOPE: only a direct `X.innerHTML = <TemplateLiteral>` assignment is
 * inspected. A right-hand side assembled by `+` string concatenation (e.g.
 * clock.js's clock, info.js's chips row) is out of scope — a documented gap,
 * not a covered case.
 */

// Internal formatters that always return a fixed, non-attacker-controlled
// string shape. Enumerated on purpose — NOT "any function call".
const SAFE_FUNCTIONS = new Set([
  "esc", // the HTML escaper itself
  "catColorHex", // category -> "#rrggbb" from the fixed CATS table (config.js)
  "agencyFlag", // agency string -> flag emoji from a fixed table (ui/info.js)
  "timeAgo", // -> "today" / "1 day" / "N days" (ui/capsule-status.js)
  "shortDate", // -> "Mon D" via toLocaleDateString (ui/capsule-status.js)
  "regionName", // ground point -> fixed region name (geo/regions.js)
  "fmt", // number -> localized number string (ui/info.js)
]);

// Number-formatting methods: the result is only digits / separators / sign,
// never an HTML metacharacter. (`fmtDate` is intentionally NOT in
// SAFE_FUNCTIONS: it falls back to returning its raw input unchanged.)
const SAFE_METHODS = new Set(["toFixed", "toLocaleString"]);

/** Is `node` an expression that cannot inject markup into innerHTML? */
function isSafe(node) {
  if (!node) return false;
  switch (node.type) {
    case "Literal":
      return true;
    case "TemplateLiteral":
      // A nested template is safe iff all of ITS interpolations are safe.
      return node.expressions.every(isSafe);
    case "CallExpression": {
      const callee = node.callee;
      if (callee.type === "Identifier") return SAFE_FUNCTIONS.has(callee.name);
      if (
        callee.type === "MemberExpression" &&
        !callee.computed &&
        callee.property.type === "Identifier"
      )
        return SAFE_METHODS.has(callee.property.name);
      return false;
    }
    case "ConditionalExpression":
      return isSafe(node.consequent) && isSafe(node.alternate);
    case "LogicalExpression":
      return isSafe(node.left) && isSafe(node.right);
    default:
      return false;
  }
}

/** Does the assignment target end in `.innerHTML` (dotted or computed)? */
function isInnerHTMLTarget(left) {
  if (left.type !== "MemberExpression") return false;
  const prop = left.property;
  if (!left.computed && prop.type === "Identifier") return prop.name === "innerHTML";
  if (left.computed && prop.type === "Literal") return prop.value === "innerHTML";
  return false;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require esc() (or a known-safe form) for every value interpolated into .innerHTML",
      recommended: true,
    },
    schema: [],
    messages: {
      unescaped:
        "Unescaped interpolation into .innerHTML. Wrap dynamic/untrusted values with esc() from util/html.js. If this value is provably safe (a formatter output, or a variable escaped earlier in the function), add an eslint-disable comment explaining why.",
    },
  },

  create(context) {
    return {
      AssignmentExpression(node) {
        if (node.operator !== "=") return;
        if (!isInnerHTMLTarget(node.left)) return;
        if (node.right.type !== "TemplateLiteral") return;
        for (const expr of node.right.expressions) {
          if (!isSafe(expr)) {
            context.report({ node: expr, messageId: "unescaped" });
          }
        }
      },
    };
  },
};
