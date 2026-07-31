// Extension A's metadata only (label, store hook); router.js renders the
// component. Must use this same literal `import('extension-a/Extension')`,
// not `loadRemote()`: the plugin only rewrites literal import() call sites
// for statically declared remotes, so loadRemote() throws RUNTIME-004
// (see /README.md for the full story).
export const declarativeExtensionAMetadata =
  import("extension-a/Extension").then((mod) => {
    const descriptor = mod.default ?? mod;
    return {
      id: descriptor.id,
      label: descriptor.label,
      routePath: descriptor.routePath,
      useStore: descriptor.useStore,
    };
  });
