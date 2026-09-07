import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // KK-UI-GOVERNOR is a standalone Node ESM package with its own tooling, and its DESIGN-VAULT
    // holds vendored upstream sources that must never be linted or type-checked as app code.
    "kk-ui-governor/**",
  ]),
]);

export default eslintConfig;
