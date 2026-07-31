<script setup>
const isDev = import.meta.env.DEV;
</script>

<!-- The one route that must always exist, so it can't depend on useExtensionRegistry.js. -->
<template>
  <div>
    <h2>Welcome</h2>
    <p v-if="isDev">
      This is the dev build. Extension A is a statically declared remote, which
      is what lets Vite patch its code live as you edit it. Everything else in
      the sidebar was discovered by calling <code>GET /api/extensions</code> and
      loaded at runtime.
    </p>
    <p v-else>
      This is the production build. The host has no build-time knowledge of any
      extension. Every entry in the sidebar was discovered by calling
      <code>GET /api/extensions</code> and loaded at runtime via Module
      Federation.
    </p>
  </div>
</template>

<style scoped>
code {
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  font-size: 0.9em;
}
</style>
