<script setup>
// Plain Vue, no knowledge of the host's router. State still crosses the
// federation boundary via the shared Pinia instance (see vite.config.js).
import { useExtensionAStore } from "./store.js";

const store = useExtensionAStore();
</script>

<template>
  <div class="extension-a">
    <h2>Extension A: Counter Widget</h2>
    <p>
      This entire component was compiled into
      <code>extension-a</code>'s own <code>remoteEntry.js</code> and loaded by
      the host at runtime. The host's source code never imports this file.
    </p>
    <button type="button" @click="store.increment()">
      Clicks: {{ store.count }}
    </button>
  </div>
</template>

<style scoped>
/* scoped: remotes share the host's DOM, so unscoped styles would collide.
   Colours come from the host's tokens through the cascade; the fallbacks keep
   the standalone preview readable (see /docs/theming.md). */
.extension-a {
  border: 1px solid var(--color-border, #d8dee4);
  border-left: 3px solid #42b883;
  border-radius: 8px;
  padding: 1.25rem;
  background: var(--color-surface, #ffffff);
  color: var(--color-text, #1f2328);
}

button {
  background: #42b883;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-size: 1rem;
}

button:hover {
  background: #369870;
}
</style>
