import ExtensionApp from './ExtensionApp.vue'
import { useExtensionAStore } from './store.js'

// The contract every extension exposes as its federated `./Extension`
// module. The host imports this descriptor — not the raw .vue file — so it
// can build a sidebar entry and a vue-router route without any per-extension
// special-casing: `id` for a stable key, `label` for the nav text,
// `routePath` for where it mounts, `component` for what to render, and now
// `useStore` for what the host's status panel reads (always via
// `useStore().summary` — see host/src/App.vue — so the host never needs to
// know this extension keeps a `count`, only that `summary` exists).
export default {
  id: 'extension-a',
  label: 'Extension A',
  routePath: '/ext/extension-a',
  component: ExtensionApp,
  useStore: useExtensionAStore,
}
