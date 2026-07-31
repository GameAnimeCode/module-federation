// Extension A is the declarative half of this project's side-by-side demo
// (see /README.md and vite.config.js). This module only covers metadata
// (the sidebar label and the Pinia store hook for the "Extension State"
// panel); the rendered component is a separate `import('extension-a/Extension')`
// call site in router.js (see the comment there for why).
//
// This file must use a literal `import('extension-a/Extension')` too,
// rather than the standalone `loadRemote()` function from
// `@module-federation/runtime`. For a statically declared remote, the
// plugin's build-time transform rewrites the exact string `'extension-a'`
// inside a literal `import(...)` call to the internal alias the remote is
// actually registered under. A `loadRemote('extension-a/Extension')`
// runtime call is invisible to that transform, since it's just a function
// call with a string argument as far as static analysis is concerned, so it
// looks up the never-registered literal name and throws "[ Federation
// Runtime ]: Failed to locate remote" (#RUNTIME-004). Extension B's
// loadExtensions.js is the opposite case: dynamic, with no static
// declaration to rewrite against, so its `loadRemote()` call is correct
// as-is.
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
