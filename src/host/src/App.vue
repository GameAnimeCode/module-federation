<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useExtensionRegistry } from './extensions/useExtensionRegistry.js'

const router = useRouter()
// Kicks off the initial GET /api/extensions fetch + SSE subscription the
// first time the host mounts. See useExtensionRegistry.js for the full
// load/hot-add/hot-remove lifecycle.
const registry = useExtensionRegistry(router)

// Every loaded extension's descriptor carries a `useStore` composable (see
// extension.js in each extension) attached to the single Pinia instance
// created in main.js and shared across the federation boundary — calling it
// here reads live state from whichever extension is or isn't currently
// mounted via router-view. This computed only ever reads `store.summary`,
// never an extension-specific field like `count` or `tasks`, so adding a
// third extension with its own state shape needs no change here.
const extensionStates = computed(() =>
  registry.extensions
    .filter((ext) => typeof ext.useStore === 'function')
    .map((ext) => {
      const store = ext.useStore()
      return { id: ext.id, label: ext.label, summary: store.summary }
    }),
)
</script>

<template>
  <div class="layout">
    <nav class="sidebar">
      <h1>MF Host</h1>
      <router-link to="/" class="nav-link">Home</router-link>

      <p v-if="registry.loading" class="status">Discovering extensions…</p>
      <p v-else-if="registry.error" class="status status--error">{{ registry.error }}</p>
      <p v-else-if="registry.extensions.length === 0" class="status">
        No extensions found under wwwroot/apps/extensions.
      </p>

      <router-link
        v-for="ext in registry.extensions"
        :key="ext.id"
        :to="ext.routePath"
        class="nav-link"
      >
        {{ ext.label }}
      </router-link>

      <section v-if="extensionStates.length > 0" class="state-panel">
        <h2>Extension State</h2>
        <p v-for="ext in extensionStates" :key="ext.id" class="state-row">
          <span class="state-label">{{ ext.label }}</span>
          <span class="state-summary">{{ ext.summary }}</span>
        </p>
      </section>
    </nav>
    <main class="content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  min-height: 100vh;
  font-family: system-ui, sans-serif;
}

.sidebar {
  width: 220px;
  flex-shrink: 0;
  padding: 1.5rem 1rem;
  background: #1e293b;
  color: #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.sidebar h1 {
  font-size: 1.1rem;
  margin: 0 0 1rem;
}

.nav-link {
  color: #cbd5e1;
  text-decoration: none;
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
}

.nav-link:hover,
.nav-link.router-link-active {
  background: #334155;
  color: white;
}

.status {
  font-size: 0.85rem;
  color: #94a3b8;
  padding: 0.4rem 0.6rem;
}

.status--error {
  color: #f87171;
}

.state-panel {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #334155;
}

.state-panel h2 {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
  margin: 0 0 0.5rem;
  padding: 0 0.6rem;
}

.state-row {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0;
  padding: 0.3rem 0.6rem;
  font-size: 0.85rem;
}

.state-label {
  color: #cbd5e1;
}

.state-summary {
  color: #7dd3fc;
  font-variant-numeric: tabular-nums;
}

.content {
  flex: 1;
  padding: 2rem;
}
</style>
