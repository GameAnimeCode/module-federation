import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { federation } from "@module-federation/vite";

// This is the *declarative* extension in this project's side-by-side demo of
// two ways an extension's code can reach the host (see /README.md for the
// full comparison). Extension B is the *dynamic* one.
//
// Being declarative means the host's vite.config.js statically lists this
// extension as a remote (fixed name, fixed dev port below), trading away
// this project's usual "zero build-time knowledge" goal. In exchange,
// @module-federation/vite's `dev.remoteHmr` can patch a literal
// `import('extension-a/Extension')` call site live, with no reload and no
// rebuild step, because it knows about this remote at dev-server startup.
//
// `name` here must match the string the host's vite.config.js `remotes` map
// and its `import('extension-a/Extension')` call site both use: that fixed
// name is the contract that makes this declarative.
export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: "extension-a",
      // Also read by the backend's discovery scan (see Program.cs) so the
      // host's sidebar can show this extension without special-casing it,
      // though the host's actual loading still goes through the static
      // declaration above, not this manifest.
      filename: "remoteEntry.js",
      exposes: {
        // A small "extension descriptor" module (src/extension.js), not the
        // raw .vue component. Used here only for `label` and `useStore` (see
        // host/src/extensions/declarativeExtensionA.js); `component` is
        // intentionally not what gets rendered, see that file for why a
        // second, separate `import()` is what actually gets patched live.
        "./Extension": "./src/extension.js",
      },
      shared: {
        // Loaded once by the host; this remote consumes the host's copy
        // instead of bundling its own Vue runtime. Without this, host and
        // extension would each run their own Vue instance and components
        // wouldn't share reactivity/context.
        vue: { singleton: true },
        // Must match the host's pinia share (see host/vite.config.js) so
        // useExtensionAStore() attaches to the host's single Pinia instance
        // instead of throwing "no active Pinia" against a phantom one.
        pinia: { singleton: true },
      },
      // Plain JS project, no tsconfig.json. The plugin's TypeScript
      // declaration generation is a TS-consumers-only feature and errors
      // loudly (though non-fatally) without a tsconfig to read.
      dts: false,
    }),
  ],
  server: {
    port: 5174, // fixed: the host's static `remotes` entry points here in dev
    cors: true, // lets the host's browser tab fetch this origin's assets during isolated dev
    origin: "http://localhost:5174", // used to build absolute dev-mode remote URLs
  },
});
