import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    languageOptions: {
      globals: {
        ...globals.node, // Adds process, __dirname, module, etc.
        ...globals.jest  // <--- ADDED: Enables test, expect, describe, afterAll, etc.
      }
    }
  },
  { 
    files: ["**/*.{js,mjs,cjs}"], 
    plugins: { js }, 
    extends: ["js/recommended"], 
    languageOptions: { globals: globals.browser } 
  },
  { files: ["**/*.js"], languageOptions: { sourceType: "commonjs" } },
  {
    rules: {
      // Disable standard JS unused vars rule
      "no-unused-vars": "off",
      
      // If using TypeScript, disable the TS version of the rule too
      "@typescript-eslint/no-unused-vars": "off"
    }
  }
]);