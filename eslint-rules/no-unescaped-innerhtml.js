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
 * The rule resolves ONE hop of same-scope `const` initializers (see
 * resolveConstInit below) — e.g. `const stationLbl = status.stationKey ? esc(...)
 * : null` used later as `${stationLbl}` is recognized as safe because its
 * initializer is. This is deliberately not general data-flow analysis: only a
 * bare Identifier whose nearest-scope declaration is a `const` with a directly
 * inspectable initializer gets resolved (chained through further Identifiers up
 * to a small hop limit); `let`/`var`, reassignment, destructuring, and
 * initializers built from anything else (e.g. a `.map().join()` call chain, or
 * string concatenation) are left unresolved. Where a value is nonetheless safe
 * for a reason the resolver can't see, silence that one spot with an
 * eslint-disable comment that says why — placed inside the `${ }` slot on its
 * own line if the interpolation sits inside a multi-line template (a comment
 * cannot be placed directly in template-literal text without becoming part of
 * the rendered HTML, but `${ }` is a real expression position, so a comment
 * there is safe and reformatting an expression onto its own line does not
 * change the interpolated value).
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

// Chained Identifier -> Identifier resolution stops here, so a runaway/cyclic
// chain (which valid JS `const` can't actually produce, but defend anyway)
// can't hang the linter.
const MAX_RESOLVE_HOPS = 5;

/**
 * If `node` is an Identifier whose nearest-scope declaration is a `const`
 * with an initializer, return that initializer's AST node. Otherwise null.
 * Single scope hop only — no attempt to model reassignment, destructuring,
 * or which branch of control flow actually ran.
 */
function resolveConstInit(sourceCode, node) {
  if (node.type !== "Identifier") return null;
  let scope = sourceCode.getScope(node);
  while (scope) {
    const variable = scope.variables.find((v) => v.name === node.name);
    if (variable) {
      const def = variable.defs[0];
      const isConst = def && def.type === "Variable" && def.parent.kind === "const";
      return isConst && def.node.init ? def.node.init : null;
    }
    scope = scope.upper;
  }
  return null;
}

/** Is `node` an expression that cannot inject markup into innerHTML? */
function isSafe(sourceCode, node, hops = 0) {
  if (!node) return false;
  switch (node.type) {
    case "Literal":
      return true;
    case "TemplateLiteral":
      // A nested template is safe iff all of ITS interpolations are safe.
      return node.expressions.every((e) => isSafe(sourceCode, e, hops));
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
      return isSafe(sourceCode, node.consequent, hops) && isSafe(sourceCode, node.alternate, hops);
    case "LogicalExpression":
      return isSafe(sourceCode, node.left, hops) && isSafe(sourceCode, node.right, hops);
    case "Identifier": {
      if (hops >= MAX_RESOLVE_HOPS) return false;
      const init = resolveConstInit(sourceCode, node);
      return init ? isSafe(sourceCode, init, hops + 1) : false;
    }
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
    const sourceCode = context.sourceCode;
    return {
      AssignmentExpression(node) {
        if (node.operator !== "=") return;
        if (!isInnerHTMLTarget(node.left)) return;
        if (node.right.type !== "TemplateLiteral") return;
        for (const expr of node.right.expressions) {
          if (!isSafe(sourceCode, expr)) {
            context.report({ node: expr, messageId: "unescaped" });
          }
        }
      },
    };
  },
};
