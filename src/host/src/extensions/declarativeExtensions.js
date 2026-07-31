// Dev-only. vite.config.js aliases @declarative-extensions to
// declarativeExtensions.prod.js for production builds (see /docs/hmr-approaches.md).
//
// Both import() calls must stay literal and must not become loadRemote(): the
// plugin only rewrites literal call sites for declared remotes, so loadRemote()
// throws RUNTIME-004. The specifier is repeated rather than hoisted into a
// helper for the same reason.

// Skipped by the dynamic registry, or the two paths fight over one name.
export const DECLARATIVE_EXTENSION_NAMES = ["extension-a"];

// Re-resolves on every navigation, which is what lets dev.remoteHmr patch the
// mounted component in place.
export const declarativeRoutes = [
  {
    path: "/ext/extension-a",
    name: "extension-a",
    component: () =>
      import("extension-a/Extension").then(
        (mod) => (mod.default ?? mod).component,
      ),
  },
];

// Sidebar and status-panel metadata; declarativeRoutes renders the component.
export const declarativeExtensionsMetadata = Promise.all([
  import("extension-a/Extension").then((mod) => {
    const descriptor = mod.default ?? mod;
    return {
      id: descriptor.id,
      label: descriptor.label,
      routePath: descriptor.routePath,
      useStore: descriptor.useStore,
      approach: "declarative",
    };
  }),
]);
