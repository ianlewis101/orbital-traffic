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
    languageOptions: {
      globals: {
        ...globals.browser,
        // Build-time constants injected by apps/web/vite.config.js's `define`.
        __OBJECT_COUNT__: "readonly",
        __APP_VERSION__: "readonly",
        __TICKER_NAMES__: "readonly",
      },
    },
  },
  {
    // Local safety-net rule: forbid unescaped interpolation into .innerHTML.
    files: ["apps/web/src/**/*.js"],
    plugins: { orbital: { rules: { "no-unescaped-innerhtml": noUnescapedInnerhtml } } },
    rules: { "orbital/no-unescaped-innerhtml": "error" },
  },
  {
    // design/social/ — the social layout kit. Browser ES modules, loaded by
    // design/social/index.html and by tools/render-social.mjs's headless page.
    files: ["design/**/*.js"],
    languageOptions: { globals: { ...globals.browser } },
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
