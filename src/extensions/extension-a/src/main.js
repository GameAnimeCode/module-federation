import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";

// Standalone entry point — only used when this extension is run on its own
// dev server (`npm run dev`) for isolated development/preview. When the host
// loads this extension via Module Federation, it never executes this file;
// it imports the `./Extension` module (src/extension.js) directly, which is
// also why createPinia() is called here and NOT inside store.js or
// extension.js — in the federated path, the host is the only one that ever
// calls createPinia(); this instance only exists so ExtensionApp.vue's
// useExtensionAStore() has an active Pinia to attach to when previewed alone.
createApp(App).use(createPinia()).mount("#app");
