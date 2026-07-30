import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import ExtensionUnavailableView from './views/ExtensionUnavailableView.vue'

// Only "/" is known up front. Extension routes are added later at runtime
// by useExtensionRegistry.js via router.addRoute() once the host has
// discovered and loaded them — see that file. vue-router ranks statically
// registered paths above the wildcard below regardless of registration
// order, so a later-added `/ext/extension-a` route still wins over this
// catch-all.
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: ExtensionUnavailableView },
  ],
})
