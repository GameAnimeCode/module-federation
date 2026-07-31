import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router.js";
import { initExtensionRegistry } from "./extensions/useExtensionRegistry.js";

async function bootstrap() {
  const app = createApp(App);
  // The one and only Pinia instance for the whole app, shared with every
  // extension via Module Federation's `pinia` singleton (see
  // vite.config.js) — an extension's useXStore() call attaches to this
  // exact instance instead of throwing "no active Pinia".
  app.use(createPinia());

  // Awaited *before* app.use(router): registers every currently-known
  // extension's route before the router performs its initial navigation
  // (which happens as soon as it's installed). Doing this after — e.g. from
  // inside App.vue's setup(), as this used to work — lets the initial
  // navigation to whatever URL the page loaded with resolve against an
  // incomplete route table; a direct link or a hard refresh on an
  // extension's route landed on the "Extension unavailable" catch-all until
  // the user manually navigated again. See useExtensionRegistry.js's
  // initExtensionRegistry() for the full explanation.
  await initExtensionRegistry(router);

  app.use(router);
  app.mount("#app");
}

bootstrap();
