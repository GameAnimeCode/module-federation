import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@module-federation/vite'

// Same remote pattern as extension-a (see that project's vite.config.js for
// the full rationale on each option) — deliberately duplicated rather than
// shared, since each extension is meant to be an independently buildable,
// independently deployable unit that doesn't depend on its sibling
// extensions or on host source at all.
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
    },
  }
}

export default defineConfig({
  plugins: [
    vue(),
    devServerRegistrationPlugin({ name: 'extension-b', backendUrl: 'http://localhost:5080' }),
    federation({
      name: 'extension-b',
      filename: 'remoteEntry.js',
      exposes: {
        './Extension': './src/extension.js',
      },
      shared: {
        vue: { singleton: true },
        // Must match the host's pinia share — see extension-a/vite.config.js
        // and host/vite.config.js for why.
        pinia: { singleton: true },
      },
      dts: false, // plain JS project, no tsconfig — see extension-a for why
    }),
  ],
  server: {
    port: 5175, // fixed so it never collides with the host (5173) or extension-a (5174)
    cors: true,
    origin: 'http://localhost:5175',
  },
})
