import { createRouter, createWebHistory } from "vue-router";
import HomeView from "./views/HomeView.vue";
import ExtensionUnavailableView from "./views/ExtensionUnavailableView.vue";

// "/" and extension A's route are known up front. Extension B's route is
// added later at runtime (see useExtensionRegistry.js).
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: HomeView },
    {
      path: "/ext/extension-a",
      name: "extension-a",
      // This literal import() call site is what dev.remoteHmr patches live
      // (see vite.config.js). A static route, so it exists from t=0.
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
