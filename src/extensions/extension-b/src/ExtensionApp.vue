<script setup>
// A deliberately different widget (list state, not a counter), proving the
// host's loading logic and status panel don't special-case extension state.
import { useExtensionBStore } from "./store.js";

const store = useExtensionBStore();
</script>

<template>
  <div class="extension-b">
    <h2>Extension B: Task List Widget (MR)</h2>
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
/* scoped: remotes share the host's DOM, so unscoped styles would collide. */
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
