import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,

  {
    files: ["src/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      sourceType: "commonjs",
    },
  },

  {
    files: ["src/**/*.test.js", "src/**/__tests__/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
];