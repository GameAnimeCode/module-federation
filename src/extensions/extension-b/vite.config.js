import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import federation from '@originjs/vite-plugin-federation'

// Same remote pattern as extension-a (see that project's vite.config.js for
// the full rationale on each option) — deliberately duplicated rather than
// shared, since each extension is meant to be an independently buildable,
// independently deployable unit that doesn't depend on its sibling
// extensions or on host source at all.
export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: 'extensionB',
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
    }),
  ],
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
    modulePreload: false,
    assetsDir: '', // keeps remoteEntry.js at dist root — see extension-a for why
  },
  server: {
    port: 5175, // fixed so it never collides with the host (5173) or extension-a (5174)
    cors: true,
  },
})
