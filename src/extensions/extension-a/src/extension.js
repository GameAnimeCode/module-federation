import ExtensionApp from "./ExtensionApp.vue";
import { useExtensionAStore } from "./store.js";

// The descriptor contract every extension exposes as `./Extension`, so the
// host can build a sidebar entry and route without per-extension special-casing.
export default {
  id: "extension-a",
  label: "Extension A",
  routePath: "/ext/extension-a",
  component: ExtensionApp,
  useStore: useExtensionAStore,
};
