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
    // Scripts Node CommonJS avulsos (nao fazem parte do bundle da aplicacao) —
    // regras voltadas a codigo de app/TS (ex.: no-require-imports) nao se aplicam aqui.
    "scripts/**",
  ]),
]);

export default eslintConfig;
