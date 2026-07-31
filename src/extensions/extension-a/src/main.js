import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";

// Standalone entry point for isolated preview only; the host never runs
// this file. createPinia() lives here, not store.js, since the federated
// path always gets its Pinia instance from the host instead.
createApp(App).use(createPinia()).mount("#app");
