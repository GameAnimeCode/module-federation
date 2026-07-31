import { createRouter, createWebHistory } from "vue-router";
import HomeView from "./views/HomeView.vue";
import ExtensionUnavailableView from "./views/ExtensionUnavailableView.vue";
import { declarativeRoutes } from "@declarative-extensions";

// declarativeRoutes is empty outside dev; every other extension route is added
// at runtime (see useExtensionRegistry.js).
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: HomeView },
    ...declarativeRoutes,
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: ExtensionUnavailableView,
    },
  ],
});
