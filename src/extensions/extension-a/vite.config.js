import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { federation } from "@module-federation/vite";

// This is the *declarative* extension in this project's side-by-side demo
// of two ways an extension's code can reach the host — see /README.md for
// the full comparison and when to reach for which. Extension B (see its own
// vite.config.js) is the *dynamic* one.
//
// Being declarative means: the host's vite.config.js statically lists this
// extension as a remote (fixed name, fixed dev port below). That's a real
// trade against this project's usual "host has zero build-time knowledge of
// any extension" goal — but it's what @module-federation/vite's automatic
// `dev.remoteHmr` patching requires: its import resolver can only rewrite a
// literal `import('extension-a/Extension')` call site when it knows about
// this remote at dev-server startup. In exchange, editing this extension's
// source while it's mounted in the host patches in place, live, with no
// reload and no rebuild step — verified directly, not inferred from docs.
//
// `name` here must match the string the host's vite.config.js `remotes` map
// and its `import('extension-a/Extension')` call site both use — this is
// the "known to each other by a fixed name" contract that makes it
// declarative in the first place.
export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: "extension-a",
      // The manifest entry file the backend's discovery scan looks for
      // (see backend Program.cs) — extension A is still discoverable there
      // too, purely so the host's sidebar can show it without special-casing
      // its metadata; the host's actual *loading* of extension A's code
      // never goes through that manifest, only through the static
      // declaration above.
      filename: "remoteEntry.js",
      exposes: {
        // Single expose: a small "extension descriptor" module (see
        // src/extension.js) rather than the raw .vue component directly —
        // used here only for `label` and `useStore` (see
        // host/src/extensions/declarativeExtensionA.js); the `component`
        // field is intentionally NOT what gets rendered — see that file for
        // why a *second*, separate `import()` is what actually gets patched
        // live.
        "./Extension": "./src/extension.js",
      },
      shared: {
        // Loaded once by the host; this remote consumes the host's copy
        // instead of bundling/instantiating its own Vue runtime. Without
        // this, host and extension would each run their own Vue instance
        // and components silently wouldn't share reactivity/context.
        vue: { singleton: true },
        // Must match the host's pinia share (see host/vite.config.js for
        // why) so this extension's useExtensionAStore() attaches to the
        // host's single Pinia instance instead of throwing "no active
        // Pinia" against a phantom instance of its own.
        pinia: { singleton: true },
      },
      // This is a plain JS project (no tsconfig.json) — the plugin's
      // TypeScript declaration generation for exposed modules is a
      // TS-consumers-only feature and errors loudly (though non-fatally)
      // without a tsconfig to read.
      dts: false,
    }),
  ],
  server: {
    port: 5174, // fixed, not incidental — the host's static `remotes` entry points here in dev
    cors: true, // lets the host's browser tab fetch this origin's assets during isolated dev
    origin: "http://localhost:5174", // @module-federation/vite uses this to build absolute dev-mode remote URLs
  },
});
