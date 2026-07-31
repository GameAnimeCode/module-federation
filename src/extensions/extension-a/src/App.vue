<script setup>
// Standalone preview harness: lets a developer run `npm run dev` inside
// this project and see the widget exactly as the host will render it,
// without needing the backend or the host running at all.
import ExtensionApp from "./ExtensionApp.vue";
</script>

<template>
  <div style="padding: 2rem; font-family: system-ui, sans-serif">
    <p style="color: #888">
      Standalone preview of Extension A (as loaded by the host):
    </p>
    <ExtensionApp />
  </div>
</template>
