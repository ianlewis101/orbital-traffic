import js from "@eslint/js";
import globals from "globals";
import noUnescapedInnerhtml from "./eslint-rules/no-unescaped-innerhtml.js";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.wrangler/**",
      "coverage/**",
      "docs/archive/**",
      "**/ios/**",
    ],
  },
  js.configs.recommended,
  {
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["apps/web/**/*.js"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Local safety-net rule: forbid unescaped interpolation into .innerHTML.
    files: ["apps/web/src/**/*.js"],
    plugins: { orbital: { rules: { "no-unescaped-innerhtml": noUnescapedInnerhtml } } },
    rules: { "orbital/no-unescaped-innerhtml": "error" },
  },
  {
    files: ["apps/web/public/sw.js"],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ["worker/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        caches: "readonly",
      },
    },
  },
  {
    files: ["tools/**/*.mjs", "*.config.js", "**/vite.config.js", "**/vitest.config.js"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["**/*.test.js"],
    languageOptions: { globals: { ...globals.node } },
  },
];
