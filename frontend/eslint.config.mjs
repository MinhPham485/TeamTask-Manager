import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  js.configs.recommended,

  ...tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },

  {
    files: ["**/*.{jsx,tsx}"],

    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooks,
    },

    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
    },

    settings: {
      react: {
        version: "detect",
      },
    },
  },
];