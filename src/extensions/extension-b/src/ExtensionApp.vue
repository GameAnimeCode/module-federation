<script setup>
// A deliberately different widget (list state, not a counter), proving the
// host's loading logic and status panel don't special-case extension state.
import { useExtensionBStore } from "./store.js";

const store = useExtensionBStore();
</script>

<template>
  <div class="extension-b">
    <h2>Extension B: Task List Widget</h2>
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
/* scoped: remotes share the host's DOM, so unscoped styles would collide.
   Colours come from the host's tokens through the cascade; the fallbacks keep
   the standalone preview readable (see /docs/theming.md). */
.extension-b {
  border: 1px solid var(--color-border, #d8dee4);
  border-left: 3px solid #3178c6;
  border-radius: 8px;
  padding: 1.25rem;
  background: var(--color-surface, #ffffff);
  color: var(--color-text, #1f2328);
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
  color: var(--color-text-muted, #59636e);
}
</style>
