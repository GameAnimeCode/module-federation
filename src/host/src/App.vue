<script setup>
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useExtensionRegistry } from "./extensions/useExtensionRegistry.js";
import { declarativeExtensionAMetadata } from "./extensions/declarativeExtensionA.js";

const route = useRoute();
const router = useRouter();
// Reads extension B's reactive state; see useExtensionRegistry.js. Extension
// A (declarative) isn't in here, see below.
const registry = useExtensionRegistry(router);

// Extension A's metadata resolves once, asynchronously (see
// declarativeExtensionA.js). `null` until then.
const declarativeExtension = ref(null);
declarativeExtensionAMetadata.then((meta) => {
  declarativeExtension.value = meta;
});

// One combined list so the sidebar and state panel don't need two templates.
const allExtensions = computed(() =>
  [declarativeExtension.value, ...registry.extensions].filter(Boolean),
);

// Forces a full remount when useExtensionRegistry.js hot-swaps extension B
// (router.replace alone doesn't refresh an already-mounted <router-view>).
// Extension A doesn't need this: its route re-resolves on every navigation.
const routeViewKey = computed(() => {
  const active = registry.extensions.find(
    (ext) => ext.routePath === route.path,
  );
  return active ? `${active.id}:${active._lastModified}` : route.fullPath;
});

// Reads `store.summary` only, never an extension-specific field, so a third
// extension needs no change here.
const extensionStates = computed(() =>
  allExtensions.value
    .filter((ext) => typeof ext.useStore === "function")
    .map((ext) => {
      const store = ext.useStore();
      return { id: ext.id, label: ext.label, summary: store.summary };
    }),
);
</script>

<template>
  <div class="layout">
    <nav class="sidebar">
      <h1>MF Host</h1>
      <router-link to="/" class="nav-link">Home</router-link>

      <p v-if="registry.loading" class="status">Discovering extensions…</p>
      <p v-else-if="registry.error" class="status status--error">
        {{ registry.error }}
      </p>

      <router-link
        v-for="ext in allExtensions"
        :key="ext.id"
        :to="ext.routePath"
        class="nav-link"
      >
        {{ ext.label }}
        <!-- Shows which loading strategy is behind this extension. -->
        <span
          class="approach-badge"
          :class="
            ext.id === 'extension-a'
              ? 'approach-badge--declarative'
              : 'approach-badge--dynamic'
          "
        >
          {{ ext.id === "extension-a" ? "declarative" : "dynamic" }}
        </span>
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
      <router-view :key="routeViewKey" />
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

.approach-badge {
  margin-left: 0.4rem;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #1e293b;
  border-radius: 3px;
  padding: 0.05rem 0.3rem;
  vertical-align: middle;
}

.approach-badge--declarative {
  background: #7dd3fc;
}

.approach-badge--dynamic {
  background: #fcd34d;
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
