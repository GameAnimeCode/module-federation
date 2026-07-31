import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { federation } from "@module-federation/vite";

// This host demos two ways of loading a Module Federation extension side by
// side (see /README.md for the full comparison):
//
//   - Extension A: declarative. Statically declared below in `remotes`,
//     loaded via a literal `import('extension-a/Extension')` call site (see
//     router.js). This is the one config on the whole host that hardcodes
//     an extension's identity, a deliberate trade for real, verified,
//     zero-reload live HMR when editing extension-a's source. Its dev URL
//     points at extension-a's fixed dev port (5174); its production URL
//     points at the same same-origin path every extension is built into
//     (`/apps/extensions/extension-a/remoteEntry.js`), decided by Vite's own
//     `command` ('serve' vs 'build'), no environment variables needed.
//   - Extension B: fully dynamic, no static remotes entry, no build-time
//     knowledge at all. Discovered from GET /api/extensions and loaded via
//     the standalone `@module-federation/runtime` API (`registerRemotes` +
//     `loadRemote`, see src/extensions/loadExtensions.js) purely at
//     runtime, the pattern the rest of this project is about.
//
// `dev.remoteHmr: true` is what makes extension A's live patching work: a
// documented, first-class option with explicit Vue support. When a
// statically declared remote's code changes, the plugin clears the
// federation module cache and guards the host's `__VUE_HMR_RUNTIME__` so
// the freshly-loaded module hot-swaps without a page reload. It does
// nothing for extension B, which useExtensionRegistry.js instead hot-swaps
// manually by noticing its `lastModifiedUnixMs` changed and forcing a
// cache-busted reload (see that file for the full mechanism).
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
        // Both instantiated exactly once by the host; every extension that
        // declares them as shared (see extensions' vite.config.js) reuses
        // these instances instead of bundling its own copies. For vue this
        // is required for reactivity/provide-inject to work across the
        // host/extension boundary; for vue-router it means an extension
        // could call useRouter() and get the host's actual router.
        vue: { singleton: true },
        "vue-router": { singleton: true },
        // Same requirement as vue: Pinia's `useXStore()` composables resolve
        // the active Pinia instance via `inject(piniaSymbol)`, a plain
        // module-scoped Symbol, not `Symbol.for(...)`. If an extension
        // bundled its own separate copy of the pinia package, its copy of
        // that Symbol would be a different object than the host's,
        // injection would silently miss, and every `useXStore()` call
        // inside an extension would throw "no active Pinia". Sharing the
        // module means extensions attach to the exact same Pinia instance
        // the host creates in main.js.
        pinia: { singleton: true },
      },
      dev: {
        remoteHmr: true,
      },
      dts: false, // plain JS project, no tsconfig, see extensions' vite.config.js
    }),
  ],
  server: {
    port: 5173,
  },
}));
