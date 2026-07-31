import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { federation } from "@module-federation/vite";

// Extension A is a static remote here (gets live HMR); extension B has none
// and is discovered at runtime instead (see /README.md for the comparison).
export default defineConfig(({ command }) => ({
  plugins: [
    vue(),
    federation({
      name: "host",
      remotes: {
        "extension-a": {
          type: "module",
          name: "extension-a",
          entry:
            command === "serve"
              ? "http://localhost:5174/remoteEntry.js"
              : "/apps/extensions/extension-a/remoteEntry.js",
        },
      },
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
  server: {
    port: 5173,
  },
}));
