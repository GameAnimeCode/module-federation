import { createApp } from "vue";
import { createPinia } from "pinia";
import "./style.css";
import App from "./App.vue";
import { router } from "./router.js";
import { startThemeSync } from "./stores/theme.js";
import { initExtensionRegistry } from "./extensions/useExtensionRegistry.js";

async function bootstrap() {
  const app = createApp(App);
  // The one Pinia instance for the whole app, shared with every extension
  // via Module Federation's `pinia` singleton (see vite.config.js).
  app.use(createPinia());
  startThemeSync();

  // Must resolve before app.use(router), or the router's initial navigation
  // can resolve against an incomplete route table (see initExtensionRegistry()).
  await initExtensionRegistry(router);

  app.use(router);
  app.mount("#app");
}

bootstrap();
