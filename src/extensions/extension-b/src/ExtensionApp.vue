<script setup>
// A second, deliberately different widget (list state instead of a counter)
// to prove the host's loading logic — and now its status panel — is
// generic and doesn't special-case what an extension's state looks like.
// See extension-a/src/ExtensionApp.vue for why useExtensionBStore() reaches
// the host's shared Pinia instance across the federation boundary.
import { useExtensionBStore } from "./store.js";

const store = useExtensionBStore();
</script>

<template>
  <div class="extension-b">
    <h2>Extension B — Task List Widget (MR)</h2>
    <p>
      Loaded from <code>extension-b</code>'s own <code>remoteEntry.js</code>,
      independently built and deployed from Extension A and the host.
    </p>
    <ul>
      <li v-for="task in store.tasks" :key="task.id">
        <label>
          <input
            type="checkbox"
            :checked="task.done"
            @change="store.toggle(task.id)"
          />
          <span :class="{ done: task.done }">{{ task.text }}</span>
        </label>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* `scoped` keeps this CSS from leaking onto the host page or other
   extensions once this component's styles are injected into the host's
   document — remotes share the DOM, so unscoped styles would collide. */
.extension-b {
  border: 1px solid #3178c6;
  border-radius: 8px;
  padding: 1.25rem;
  font-family: system-ui, sans-serif;
}

ul {
  list-style: none;
  padding: 0;
}

li {
  padding: 0.25rem 0;
}

.done {
  text-decoration: line-through;
  color: #888;
}
</style>
