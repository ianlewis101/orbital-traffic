import { afterAll, describe, it } from "vitest";
import { RuleTester } from "eslint";
import rule from "./no-unescaped-innerhtml.js";

// Wire ESLint's RuleTester into vitest's runner so its cases show up as tests.
RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-unescaped-innerhtml", rule, {
  valid: [
    // The core "correct" pattern this rule must NOT flag: esc()-wrapped value.
    "el.innerHTML = `<span>${esc(s.name)}</span>`;",
    // Plain literals carry no attacker-controlled shape.
    'el.innerHTML = `<b>${1}</b><i>${"x"}</i>`;',
    "el.innerHTML = `<span>static markup only</span>`;",
    // Enumerated internal formatters (fixed-shape output).
    "el.innerHTML = `<b>${timeAgo(s.since)}</b>`;",
    'el.innerHTML = `<span style="background:${catColorHex(s.cat)}"></span>`;',
    "el.innerHTML = `<b>${fmt(alt, 0)}</b>`;",
    // Number-formatting method calls.
    "el.innerHTML = `<b>${n.a.toFixed(3)}</b>`;",
    "el.innerHTML = `<b>${count.toLocaleString()}</b>`;",
    // Ternary / logical / nested-template where every branch is safe.
    'el.innerHTML = `<b>${cond ? esc(a) : "x"}</b>`;',
    'el.innerHTML = `<b>${lit ? "N" : "S"}</b>`;',
    'el.innerHTML = `<b>${cond ? `<i>${esc(a)}</i>` : ""}</b>`;',
    // No interpolation at all.
    'el.innerHTML = "";',
    // Not an innerHTML sink — out of scope.
    "el.textContent = `${rawUntrusted}`;",
    // Non-template right-hand side — out of scope.
    "el.innerHTML = figureHTML(s);",
    // Resolver: a same-scope const whose initializer is itself safe (a call
    // to an enumerated formatter) is recognized when interpolated by name.
    'function f(s) { const hex = catColorHex(s.cat); el.innerHTML = `<span style="background:${hex}"></span>`; }',
    // Resolver: a const initialized from a ternary of safe branches (the
    // "escaped/assembled earlier" pattern from capsule-status.js).
    "function f(status) { const lbl = status.k ? esc(status.k) : null; el.innerHTML = `<b>${lbl}</b>`; }",
    // Resolver: chains through more than one const hop.
    "function f(x) { const a = esc(x); const b = a; el.innerHTML = `<b>${b}</b>`; }",
  ],
  invalid: [
    // The regression this rule exists to catch: a raw property interpolation.
    {
      code: "el.innerHTML = `<span>${s.name}</span>`;",
      errors: [{ messageId: "unescaped" }],
    },
    // A bare identifier.
    {
      code: "el.innerHTML = `<span>${name}</span>`;",
      errors: [{ messageId: "unescaped" }],
    },
    // An un-enumerated function call is not trusted.
    {
      code: "el.innerHTML = `<span>${format(x)}</span>`;",
      errors: [{ messageId: "unescaped" }],
    },
    // A ternary with one unsafe branch fails.
    {
      code: "el.innerHTML = `<span>${cond ? esc(a) : b}</span>`;",
      errors: [{ messageId: "unescaped" }],
    },
    // String concatenation inside an interpolation is not safe.
    {
      code: 'el.innerHTML = `<span>${"a" + b}</span>`;',
      errors: [{ messageId: "unescaped" }],
    },
    // Computed ["innerHTML"] target is still checked; two bad interps → two errors.
    {
      code: 'el["innerHTML"] = `<a>${x}</a><b>${y}</b>`;',
      errors: [{ messageId: "unescaped" }, { messageId: "unescaped" }],
    },
    // Resolver deliberately does not resolve `let` — reassignment means the
    // initializer isn't the only possible value.
    {
      code: "function f(c) { let hex = catColorHex(c); el.innerHTML = `<span>${hex}</span>`; }",
      errors: [{ messageId: "unescaped" }],
    },
    // Resolver resolves the const, but its initializer is itself unsafe
    // (a MemberExpression operand in a LogicalExpression) — stays flagged.
    {
      code: 'function f(crew) { const count = crew.length || "?"; el.innerHTML = `<b>${count}</b>`; }',
      errors: [{ messageId: "unescaped" }],
    },
    // Resolver resolves the const, but a .join() call isn't an enumerated
    // safe method — stays flagged even though every piece joined was esc()'d.
    {
      code: 'function f(parts) { const html = parts.map((p) => esc(p)).join(""); el.innerHTML = `<b>${html}</b>`; }',
      errors: [{ messageId: "unescaped" }],
    },
  ],
});
