<script setup>
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useExtensionRegistry } from "./extensions/useExtensionRegistry.js";
import { useThemeStore } from "./stores/theme.js";
import ExtensionBoundary from "./components/ExtensionBoundary.vue";
import { declarativeExtensionsMetadata } from "@declarative-extensions";

const route = useRoute();
const router = useRouter();
const theme = useThemeStore();
const themeOptions = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
// Every runtime-discovered extension: all of them in production, all but the
// declarative ones in dev. See useExtensionRegistry.js.
const registry = useExtensionRegistry(router);

// Resolves once, asynchronously; always empty outside dev.
const declarativeExtensions = ref([]);
declarativeExtensionsMetadata.then((list) => {
  declarativeExtensions.value = list;
});

// One combined list so the sidebar and state panel don't need two templates.
const allExtensions = computed(() => [
  ...declarativeExtensions.value,
  ...registry.extensions,
]);

// Forces a full remount when useExtensionRegistry.js hot-swaps an extension
// (router.replace alone doesn't refresh an already-mounted <router-view>).
// Declarative routes don't need this: they re-resolve on every navigation.
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
        <!-- Set by whichever module produced it, so no extension is named here. -->
        <span class="approach-badge" :class="`approach-badge--${ext.approach}`">
          {{ ext.approach }}
        </span>
      </router-link>

      <section class="sidebar-footer">
        <h2>Theme</h2>
        <div class="theme-control" role="group" aria-label="Colour theme">
          <button
            v-for="option in themeOptions"
            :key="option.value"
            type="button"
            class="theme-button"
            :class="{
              'theme-button--active': theme.preference === option.value,
            }"
            :aria-pressed="theme.preference === option.value"
            @click="theme.setPreference(option.value)"
          >
            {{ option.label }}
          </button>
        </div>

        <template v-if="extensionStates.length > 0">
          <h2>Extension State</h2>
          <p v-for="ext in extensionStates" :key="ext.id" class="state-row">
            <span class="state-label">{{ ext.label }}</span>
            <span class="state-summary">{{ ext.summary }}</span>
          </p>
        </template>
      </section>
    </nav>
    <main class="content">
      <ExtensionBoundary>
        <router-view :key="routeViewKey" />
      </ExtensionBoundary>
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.sidebar {
  width: 220px;
  flex-shrink: 0;
  padding: 1.25rem 0.75rem;
  background: var(--color-sidebar-bg);
  color: var(--color-sidebar-text);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  overflow-y: auto;
}

.sidebar h1 {
  font-size: 0.95rem;
  letter-spacing: 0.02em;
  color: var(--color-sidebar-text-strong);
  margin: 0 0 0.75rem;
  padding: 0 0.6rem;
}

.nav-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  color: var(--color-sidebar-text);
  text-decoration: none;
  padding: 0.45rem 0.6rem;
  border-radius: 4px;
  font-size: 0.9rem;
}

.nav-link:hover {
  background: var(--color-sidebar-hover);
  color: var(--color-sidebar-text-strong);
}

.nav-link.router-link-active {
  background: var(--color-sidebar-active);
  color: var(--color-sidebar-text-strong);
}

.approach-badge {
  flex-shrink: 0;
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--badge-text);
  border-radius: 3px;
  padding: 0.1rem 0.3rem;
}

.approach-badge--declarative {
  background: var(--badge-declarative-bg);
}

.approach-badge--dynamic {
  background: var(--badge-dynamic-bg);
}

.status {
  font-size: 0.85rem;
  color: var(--color-sidebar-text);
  padding: 0.4rem 0.6rem;
}

.status--error {
  color: #f87171;
}

/* auto pins the footer to the bottom of the sidebar. */
.sidebar-footer {
  margin-top: auto;
  padding-top: 1rem;
  border-top: 1px solid var(--color-sidebar-border);
}

.sidebar-footer h2 {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-sidebar-text);
  margin: 0 0 0.5rem;
  padding: 0 0.6rem;
}

.sidebar-footer h2 ~ h2 {
  margin-top: 1rem;
}

.theme-control {
  display: flex;
  gap: 0.25rem;
  padding: 0 0.6rem;
}

.theme-button {
  flex: 1;
  padding: 0.3rem 0;
  font: inherit;
  font-size: 0.75rem;
  color: var(--color-sidebar-text);
  background: var(--color-sidebar-hover);
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
}

.theme-button:hover {
  color: var(--color-sidebar-text-strong);
}

.theme-button--active {
  background: var(--color-sidebar-active);
  border-color: var(--color-sidebar-text);
  color: var(--color-sidebar-text-strong);
}

.theme-button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
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
  color: var(--color-sidebar-text);
}

.state-summary {
  color: var(--badge-declarative-bg);
  font-variant-numeric: tabular-nums;
}

.content {
  flex: 1;
  min-width: 0;
  padding: 2rem;
  overflow-y: auto;
  background: var(--color-bg);
  color: var(--color-text);
}
</style>
