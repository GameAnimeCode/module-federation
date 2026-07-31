import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";

// Standalone entry point, only used when this extension runs on its own dev
// server (`npm run dev`) for isolated preview. See extension-a/src/main.js
// for why createPinia() belongs here rather than in store.js or
// extension.js.
createApp(App).use(createPinia()).mount("#app");
