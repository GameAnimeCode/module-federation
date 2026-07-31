import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";

// Standalone entry point for isolated preview only. See extension-a/src/main.js.
createApp(App).use(createPinia()).mount("#app");
