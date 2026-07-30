import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import federation from '@originjs/vite-plugin-federation'

// This project builds as a Module Federation *remote*. It knows nothing
// about the host that will eventually load it — no host URL, no host name
// anywhere in this config. That's what makes the host's discovery dynamic:
// this bundle just has to exist at a known path with a known exposed module
// name, and any host can pick it up at runtime.
export default defineConfig({
  plugins: [
    vue(),
    federation({
      // Must be unique across every remote the host will ever load.
      name: 'extensionA',
      // The manifest entry file the host script-injects. Its name
      // (remoteEntry.js) is the one hardcoded convention the backend's
      // /api/extensions scanner relies on — see backend Program.cs.
      filename: 'remoteEntry.js',
      exposes: {
        // Single expose: a small "extension descriptor" module (see
        // src/extension.js) rather than the raw .vue component directly, so
        // the host gets id/label/routePath metadata alongside the component
        // without having to hardcode any of it per-extension.
        './Extension': './src/extension.js',
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
    }),
  ],
  build: {
    target: 'esnext', // federation's runtime relies on native dynamic import()
    minify: false, // keep readable output for this educational PoC
    cssCodeSplit: false, // one predictable CSS file per remote, not per-chunk
    modulePreload: false, // avoids Vite injecting a preload polyfill the host doesn't need
    // Flatten output so remoteEntry.js lands at dist/remoteEntry.js instead
    // of dist/assets/remoteEntry.js — the backend's discovery scan
    // (GET /api/extensions) looks for it directly inside each extension's
    // own folder, and this extension gets its own isolated directory when
    // copied into wwwroot/apps/extensions/<name>/ anyway, so a flat layout
    // costs nothing.
    assetsDir: '',
  },
  server: {
    port: 5174, // fixed so it never collides with the host's 5173
    cors: true, // lets the host's browser tab fetch this origin's assets during isolated dev
  },
})
