// Extension A is the *declarative* half of this project's side-by-side demo
// — see /README.md and vite.config.js for the full story. This module only
// covers metadata (the sidebar label and the Pinia store hook for the
// "Extension State" panel); the actual *rendered* component is a completely
// separate `import('extension-a/Extension')` call site in router.js — that
// split is deliberate (see the comment there for why).
//
// This file must use a literal `import('extension-a/Extension')` too,
// rather than the standalone `loadRemote()` function from
// `@module-federation/runtime` — found the hard way, by running it, not by
// reading the types: for a *statically declared* remote, this plugin's
// build-time transform rewrites the exact string `'extension-a'` inside a
// literal `import(...)` call to the internal alias it actually registered
// the remote under (`__mfe_internal__host__mf_owner__1__extension-a` in the
// compiled output). A `loadRemote('extension-a/Extension')` runtime call is
// invisible to that transform — it's just a function call with a string
// argument as far as the bundler's static analysis is concerned — so it
// looks up the literal, never-registered name `'extension-a'` and throws
// "[ Federation Runtime ]: Failed to locate remote" (#RUNTIME-004).
// Extension B's loadExtensions.js is the opposite case: it's dynamic, has
// no static declaration to rewrite against, so the standalone `loadRemote()`
// call there is correct as-is.
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
