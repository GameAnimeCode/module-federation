import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import federation from '@originjs/vite-plugin-federation'

// The host is configured as a Module Federation *consumer* with zero
// statically declared `remotes`. That's the crux of "dynamic" federation:
// a normal federated host hardcodes `remotes: { extensionA: 'http://...' }`
// at build time, which means adding a new extension requires rebuilding the
// host. Declaring the federation plugin at all — even with no static
// remotes — is enough for it to inject the runtime helpers
// (`__federation_method_setRemote` / `__federation_method_getRemote`) that
// src/extensions/loadExtensions.js uses to register and import remotes by
// URL *after* the app has already booted, once it learns their URLs from
// GET /api/extensions.
export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: 'host',
      // A single unused placeholder entry is required here, not optional —
      // this is the one hardcoded-looking line in an otherwise fully dynamic
      // setup, and it exists purely to work around a quirk of
      // @originjs/vite-plugin-federation's build: it only classifies this
      // build as a federation "host" (and only then runs the code-generation
      // pass that makes `virtual:__federation__` actually work — see
      // loadExtensions.js) when `remotes` has at least one entry. An empty
      // `{}` satisfies the plugin's "were remotes configured at all" check
      // but fails its internal `remotes.length > 0` host-detection check,
      // silently leaving the generated runtime broken. The URL below is
      // never fetched — every real remote is registered at runtime via
      // __federation_method_setRemote in loadExtensions.js instead.
      remotes: {
        __unused_placeholder__: 'https://unused.invalid/remoteEntry.js',
      },
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
    }),
  ],
  build: {
    target: 'esnext', // federation's runtime relies on native dynamic import()
    modulePreload: false, // avoids Vite injecting a preload polyfill that fights federation's own loading
  },
  server: {
    port: 5173,
  },
})
