import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

// One shared flat config for the whole repo (host + both extensions).
export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "src/backend/bin/**",
      "src/backend/obj/**",
      "src/backend/wwwroot/**",
      "**/package-lock.json",
      ".claude/**",
      ".claude-flow/**",
      ".agents/**",
      ".swarm/**",
    ],
  },
  js.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // App.vue/ExtensionApp.vue are single-word by convention; not a risk here.
      "vue/multi-word-component-names": "off",
    },
  },
  {
    // vite.config.js runs under Node, not a browser.
    files: ["**/vite.config.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // Must be last: disables stylistic rules Prettier already handles.
  eslintConfigPrettier,
];
