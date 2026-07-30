import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@module-federation/vite'

// Branch hmr/latest-vite-federation: swaps @originjs/vite-plugin-federation
// (which pinned this project to Vite 5 — see README.md's HMR section) for
// @module-federation/vite, the actively-maintained plugin from the Module
// Federation team, which explicitly supports Vite 8. Two changes from the
// other branches' host config worth calling out:
//
// 1. No `remotes` entry at all — not even an empty/placeholder one. This
//    plugin's own `remotes` option is purely for statically-known remotes;
//    fully-dynamic loading goes through the standalone `@module-federation/runtime`
//    package instead (`registerRemotes` + `loadRemote`, see
//    src/extensions/loadExtensions.js), which doesn't require anything
//    declared here at all. No @originjs-style "must have at least one
//    entry or a silent internal check fails" workaround needed.
// 2. `dev.remoteHmr: true` — this is the whole point of this branch. It's a
//    documented, first-class option (see this plugin's own .d.ts) with
//    explicit Vue support: when a remote's code changes, the plugin clears
//    the federation module cache and (for Vue) guards the host's
//    `__VUE_HMR_RUNTIME__` so the remote's freshly-loaded module can be
//    hot-swapped without a page reload. @originjs/vite-plugin-federation had
//    no equivalent — its dev-mode "expose"/"shared" plugins were empty
//    stubs (see README.md).
export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: 'host',
      shared: {
        // Both instantiated exactly once by the host; every extension that
        // declares them as shared (see extensions' vite.config.js) reuses
        // these instances instead of bundling/booting its own copies. For
        // vue this is required for reactivity/provide-inject to work across
        // the host/extension boundary; for vue-router it means an extension
        // could call useRouter() and get the host's actual router.
        vue: { singleton: true },
        'vue-router': { singleton: true },
        // Same requirement as vue: Pinia's `useXStore()` composables resolve
        // the active Pinia instance via `inject(piniaSymbol)`, where
        // `piniaSymbol` is a plain module-scoped Symbol — not
        // `Symbol.for(...)`. If an extension bundled its own separate copy
        // of the pinia package, its copy of that Symbol would be a
        // different object than the host's, injection would silently miss,
        // and every `useXStore()` call inside an extension would throw "no
        // active Pinia". Sharing the module means extensions attach to the
        // exact same Pinia instance the host creates in main.js.
        pinia: { singleton: true },
      },
      dev: {
        remoteHmr: true,
      },
      dts: false, // plain JS project, no tsconfig — see extensions' vite.config.js
    }),
  ],
  server: {
    port: 5173,
  },
})
