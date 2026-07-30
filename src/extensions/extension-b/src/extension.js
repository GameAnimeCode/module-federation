import ExtensionApp from './ExtensionApp.vue'
import { useExtensionBStore } from './store.js'

// Same descriptor contract as extension-a's extension.js — this is what
// makes the two extensions interchangeable from the host's point of view.
export default {
  id: 'extension-b',
  label: 'Extension B',
  routePath: '/ext/extension-b',
  component: ExtensionApp,
  useStore: useExtensionBStore,
}
