import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

// One flat config for the whole repo — host, extension-a, extension-b all
// share it rather than each carrying its own copy, even though each project
// builds and runs independently (see each vite.config.js for why *that*
// stays duplicated). Linting doesn't have the same "must be independently
// deployable" constraint, so one shared config is less to keep in sync.
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
      // Every top-level component in this project (App.vue, ExtensionApp.vue)
      // is deliberately single-word by Vue SFC convention; multi-word
      // enforcement exists to avoid clashing with native HTML elements, which
      // isn't a real risk for files that are never used as custom elements.
      "vue/multi-word-component-names": "off",
    },
  },
  {
    // vite.config.js runs under Node during the build/dev-server, not in a
    // browser — it needs Node globals (e.g. `process`), not browser ones.
    files: ["**/vite.config.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // Must be last: turns off every core/plugin stylistic rule Prettier would
  // otherwise disagree with, so ESLint and Prettier never fight over the
  // same line.
  eslintConfigPrettier,
];
