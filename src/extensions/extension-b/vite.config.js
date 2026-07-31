import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { federation } from "@module-federation/vite";

// The *dynamic* extension (see /README.md): no static remote, discovered
// and loaded at runtime by the host (loadExtensions.js).
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
        pinia: { singleton: true },
      },
      dts: false, // plain JS project, no tsconfig.json
    }),
  ],
  server: {
    port: 5175, // fixed so it never collides with the host (5173) or extension-a (5174)
    cors: true,
    origin: "http://localhost:5175",
  },
});
