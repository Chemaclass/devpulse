import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      // The two classic hooks rules. (react-hooks v7 also ships newer,
      // compiler-aligned opinions like set-state-in-effect/static-components;
      // those flag valid patterns here and are out of scope for this pass.)
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Project convention: every type alias is T-prefixed PascalCase.
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "typeAlias",
          format: ["PascalCase"],
          custom: { regex: "^T[A-Z]", match: true },
        },
      ],
      // Project convention: no `interface` — use `type` aliases. The one
      // exception (global `Window` augmentation) is overridden below.
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSInterfaceDeclaration",
          message: "Use a `type` alias instead of `interface`.",
        },
      ],
    },
  },
  {
    // Global augmentation must be an interface; exempt just that file.
    files: ["**/cronitor.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    files: ["**/*.test.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
