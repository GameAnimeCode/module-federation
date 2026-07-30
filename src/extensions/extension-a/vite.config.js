import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@module-federation/vite'

// Self-registers this dev server's URL with the backend on startup — see
// backend Program.cs's DevServerRegistry — so the host can discover and
// load from a running `vite dev` server without either side hardcoding a
// port. Deliberately duplicated in extension-b's vite.config.js rather than
// shared, matching how the rest of this config is duplicated (each
// extension is independently buildable/deployable). `apply: 'serve'` means
// this never runs during `vite build` — production is unaffected.
function devServerRegistrationPlugin({ name, backendUrl }) {
  return {
    name: 'dev-server-registration',
    apply: 'serve',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const devUrl = `http://localhost:${server.config.server.port}`
        fetch(`${backendUrl}/api/extensions/dev-register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, devUrl }),
        }).catch((err) => {
          console.warn(`[dev-register] could not reach backend at ${backendUrl} (${err.message}) — is it running?`)
        })
      })
      // No unregister-on-shutdown hook: Node's process exit events don't
      // reliably allow an async fetch() to complete before the process is
      // gone. DELETE /api/extensions/dev-register/:name exists on the
      // backend for manual cleanup if a stale registration matters.
    },
  }
}

// This project builds as a Module Federation *remote*. It knows nothing
// about the host that will eventually load it — no host URL, no host name
// anywhere in this config. That's what makes the host's discovery dynamic:
// this bundle just has to exist at a known path with a known exposed module
// name, and any host can pick it up at runtime.
//
// Branch hmr/latest-vite-federation: swapped @originjs/vite-plugin-federation
// for @module-federation/vite (see host/vite.config.js for the full
// rationale — Vite 8 support and, critically, a real `dev.remoteHmr`
// implementation). `name` here is set to match this extension's folder name
// exactly ('extension-a'), because that's also the name the host registers
// this remote under at runtime (see loadExtensions.js) — keeping those in
// sync avoids any alias mismatch between how this remote identifies itself
// and how the host refers to it.
export default defineConfig({
  plugins: [
    vue(),
    devServerRegistrationPlugin({ name: 'extension-a', backendUrl: 'http://localhost:5080' }),
    federation({
      name: 'extension-a',
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
      // This is a plain JS project (no tsconfig.json) — the plugin's
      // TypeScript declaration generation for exposed modules is a
      // TS-consumers-only feature and errors loudly (though non-fatally)
      // without a tsconfig to read.
      dts: false,
    }),
  ],
  server: {
    port: 5174, // fixed so it never collides with the host's 5173
    cors: true, // lets the host's browser tab fetch this origin's assets during isolated dev
    origin: 'http://localhost:5174', // @module-federation/vite uses this to build absolute dev-mode remote URLs
  },
})
