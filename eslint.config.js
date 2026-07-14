// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.wrangler/**", "**/node_modules/**", "**/worker-configuration.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Standards: keep comments lean; enforce no-unused etc. via recommended.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // React hooks correctness (frontend only): rules-of-hooks catches real bugs (error);
    // exhaustive-deps is advisory (warn) — components intentionally suppress it per-line.
    files: ["apps/frontend/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Node scripts (e.g. prerender) — provide Node/runtime globals.
    files: ["**/*.mjs"],
    languageOptions: {
      globals: { URL: "readonly", console: "readonly", process: "readonly", setTimeout: "readonly" },
    },
  },
);
