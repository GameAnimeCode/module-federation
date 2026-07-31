import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";

// Standalone entry point, only used when this extension runs on its own dev
// server (`npm run dev`) for isolated preview. The host never executes this
// file; it imports the `./Extension` module (src/extension.js) directly.
// That's also why createPinia() lives here rather than in store.js or
// extension.js: in the federated path, only the host ever calls
// createPinia(). This instance exists just so ExtensionApp.vue's
// useExtensionAStore() has an active Pinia to attach to when previewed alone.
createApp(App).use(createPinia()).mount("#app");
