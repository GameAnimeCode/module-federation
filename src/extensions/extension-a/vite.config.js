import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { federation } from "@module-federation/vite";

// The *declarative* extension (see /README.md). `name` must match the
// host's `remotes` entry to get live HMR via dev.remoteHmr.
export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: "extension-a",
      filename: "remoteEntry.js",
      exposes: {
        // Descriptor module (src/extension.js), not the raw .vue component.
        "./Extension": "./src/extension.js",
      },
      shared: {
        // Reuses the host's instances so reactivity/context work across the boundary.
        vue: { singleton: true },
        pinia: { singleton: true },
      },
      dts: false, // plain JS project, no tsconfig.json
    }),
  ],
  server: {
    port: 5174, // fixed: the host's static `remotes` entry points here in dev
    cors: true, // lets the host's browser tab fetch this origin's assets during isolated dev
    origin: "http://localhost:5174", // used to build absolute dev-mode remote URLs
  },
});
