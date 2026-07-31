import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { federation } from "@module-federation/vite";

// This is the *dynamic* extension in this project's side-by-side demo of
// two ways an extension's code can reach the host (see /README.md and
// extension-a/vite.config.js, the *declarative* one, for the full
// comparison). Nothing here knows about the host: no host URL, no host
// name, no static remotes anywhere. This bundle just has to exist at a
// known path with a known exposed module name (see backend Program.cs's
// discovery scan), and the host picks it up at runtime via
// host/src/extensions/loadExtensions.js.
//
// In exchange, editing this extension's source doesn't patch live in the
// host the way extension A's does. See `npm run dev:watch` below and
// useExtensionRegistry.js's swapExtension(): rebuild on save, detect the
// change, and hot-swap the mounted component. That's a full remount, not a
// granular patch, but since state lives in Pinia, not the component, it's
// invisible in practice.
export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: "extension-b",
      filename: "remoteEntry.js",
      exposes: {
        "./Extension": "./src/extension.js",
      },
      shared: {
        vue: { singleton: true },
        // Must match the host's pinia share, see extension-a/vite.config.js
        // and host/vite.config.js for why.
        pinia: { singleton: true },
      },
      dts: false, // plain JS project, no tsconfig, see extension-a for why
    }),
  ],
  server: {
    port: 5175, // fixed so it never collides with the host (5173) or extension-a (5174)
    cors: true,
    origin: "http://localhost:5175",
  },
});
