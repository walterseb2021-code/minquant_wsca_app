// eslint.config.mjs
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  // Carga las reglas base de Next + TS
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Capa de overrides: ignores + reglas que relajamos
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
    rules: {
      // No tumbar el build por “any” y similares
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unused-vars": "warn",

      // Evitar que “prefer-const” falle el build
      "prefer-const": "off",

      // Solo advertencia para <img> (Next sugiere <Image/>)
      "@next/next/no-img-element": "warn",
    },
  },
];
