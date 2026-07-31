import { createRouter, createWebHistory } from "vue-router";
import HomeView from "./views/HomeView.vue";
import ExtensionUnavailableView from "./views/ExtensionUnavailableView.vue";

// "/" and extension A's route are the only ones known up front — extension
// B's route is added later at runtime by useExtensionRegistry.js via
// router.addRoute() once the host has discovered and loaded it (see that
// file). vue-router ranks statically registered paths above the wildcard
// below regardless of registration order, so a later-added
// `/ext/extension-b` route still wins over this catch-all.
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: HomeView },
    {
      path: "/ext/extension-a",
      name: "extension-a",
      // Extension A is the *declarative* half of this project's two-approach
      // demo (see vite.config.js and declarativeExtensionA.js) — this literal
      // `import('extension-a/Extension')` call site, not a component object
      // captured once elsewhere, is what @module-federation/vite's
      // `dev.remoteHmr` patches in place: vue-router re-resolves this
      // function on every navigation, so in dev it always returns whatever
      // is currently being edited. Being a *static* route also means this
      // one path never needed the "await extension discovery before
      // installing the router" fix in main.js — it exists in the route
      // table from t=0, same as "/".
      component: () =>
        import("extension-a/Extension").then(
          (mod) => (mod.default ?? mod).component,
        ),
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: ExtensionUnavailableView,
    },
  ],
});
