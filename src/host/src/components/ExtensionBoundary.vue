<script setup>
// Contains a render-time throw from a federated extension so the shell
// survives. The try/catch in useExtensionRegistry.js only covers loading;
// once mounted, an extension's errors propagate like any other component's.
//
// Limits worth knowing: onErrorCaptured sees render, lifecycle, and watcher
// errors from descendants. Throws inside async event handlers and unhandled
// promise rejections escape the synchronous call stack and are not caught.
import { onErrorCaptured, ref, watch } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const failure = ref(null);

// Without this the fallback would outlive the route that produced it.
watch(
  () => route.fullPath,
  () => {
    failure.value = null;
  },
);

onErrorCaptured((error) => {
  failure.value = error;
  console.error("[extensions] render failed:", error);
  return false; // stop propagation; the shell keeps running
});
</script>

<template>
  <section v-if="failure" class="boundary" role="alert">
    <h2>This extension failed to render</h2>
    <p>
      The rest of the application is unaffected. Pick another item from the
      sidebar, or check the console for the full stack trace.
    </p>
    <pre>{{ failure.message }}</pre>
  </section>
  <slot v-else />
</template>

<style scoped>
.boundary {
  border: 1px solid var(--color-border);
  border-left: 3px solid #d1434b;
  border-radius: 8px;
  padding: 1.25rem;
  background: var(--color-surface);
  color: var(--color-text);
}

.boundary h2 {
  margin-top: 0;
}

pre {
  margin-bottom: 0;
  padding: 0.75rem;
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-text-muted);
  font-size: 0.85rem;
  overflow-x: auto;
}
</style>
