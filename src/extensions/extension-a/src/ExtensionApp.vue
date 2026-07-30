<script setup>
// This is the real UI shipped inside the federated bundle. It's plain Vue —
// no knowledge of the host's router — proving that a remote can be built
// and tested in complete isolation and still slot into any host. State
// *does* now cross the federation boundary, though: useExtensionAStore()
// attaches to the host's shared Pinia instance (see vite.config.js), so the
// host's status panel reflects clicks made here without any prop/event
// wiring between the two.
import { useExtensionAStore } from './store.js'

const store = useExtensionAStore()
</script>

<template>
  <div class="extension-a">
    <h2>Extension A — Counter Widget</h2>
    <p>
      This entire component was compiled into
      <code>extension-a</code>'s own <code>remoteEntry.js</code> and loaded
      by the host at runtime — the host's source code never imports this
      file.
    </p>
    <button type="button" @click="store.increment()">Clicks: {{ store.count }}</button>
  </div>
</template>

<style scoped>
/* `scoped` keeps this CSS from leaking onto the host page or other
   extensions once this component's styles are injected into the host's
   document — remotes share the DOM, so unscoped styles would collide. */
.extension-a {
  border: 1px solid #42b883;
  border-radius: 8px;
  padding: 1.25rem;
  font-family: system-ui, sans-serif;
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
