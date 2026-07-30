import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router.js'

// Extension discovery/loading is NOT kicked off here — it starts inside
// App.vue's setup() (useExtensionRegistry(router)) so it has a live router
// instance to call addRoute()/removeRoute() on as extensions are discovered
// — see extensions/useExtensionRegistry.js. The Pinia instance created here
// IS relevant to that, though: it's the one and only Pinia instance for the
// whole app, shared with every extension via Module Federation's `pinia`
// singleton (see vite.config.js) — an extension's useXStore() call attaches
// to this exact instance instead of throwing "no active Pinia".
createApp(App).use(createPinia()).use(router).mount('#app')
