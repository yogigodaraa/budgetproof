import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    ".vercel/**", // local `vercel build` output — not source
    "next-env.d.ts",
  ]),
  // Demote forward-compat React Compiler advisories + style strictness to WARN
  // (no runtime effect). Real ERRORS still fail CI. Mirrors the CCS repo.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
]);

export default eslintConfig;
