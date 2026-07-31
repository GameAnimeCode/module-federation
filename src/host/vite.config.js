import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { federation } from "@module-federation/vite";

// Extension A is a static remote in dev only, to demonstrate live HMR.
// Production declares no remotes and discovers everything at runtime
// (see /docs/hmr-approaches.md).
const declarativeExtensionsModule = (isDev) =>
  fileURLToPath(
    new URL(
      isDev
        ? "./src/extensions/declarativeExtensions.js"
        : "./src/extensions/declarativeExtensions.prod.js",
      import.meta.url,
    ),
  );

export default defineConfig(({ command }) => {
  const isDev = command === "serve";

  return {
    plugins: [
      vue(),
      federation({
        name: "host",
        remotes: isDev
          ? {
              "extension-a": {
                type: "module",
                name: "extension-a",
                entry: "http://localhost:5174/remoteEntry.js",
              },
            }
          : {},
        shared: {
          // Singletons so every extension reuses the host's instances instead
          // of bundling its own; required for reactivity/injection to work
          // across the federation boundary.
          vue: { singleton: true },
          "vue-router": { singleton: true },
          pinia: { singleton: true },
        },
        dev: {
          remoteHmr: true,
        },
        dts: false, // plain JS project, no tsconfig.json
      }),
    ],
    resolve: {
      alias: {
        // The dev module's literal import('extension-a/Extension') only
        // resolves while that remote is declared. Aliasing to the stub keeps
        // it out of the production graph instead of relying on tree-shaking.
        "@declarative-extensions": declarativeExtensionsModule(isDev),
      },
    },
    server: {
      port: 5173,
    },
  };
});
