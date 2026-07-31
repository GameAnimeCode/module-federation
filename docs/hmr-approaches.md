# Two approaches to HMR

Back to the [README](../README.md).

A federated host can reach a remote in two ways, and the choice determines what
happens when a developer saves a file. This repo runs both so they can be
compared directly rather than argued about.

The two are not peers. **Dynamic discovery is how this application actually
works.** The declarative path exists only in the dev server, and only because
it is the one thing that buys true live HMR. A production build declares no
remotes at all and discovers every extension at runtime, Extension A included.

![Declarative vs dynamic load paths](./assets/load-paths.svg)

|                        | Declarative                    | Dynamic                       |
| ---------------------- | ------------------------------ | ----------------------------- |
| Applies to             | Extension A, dev server only   | Everything, always            |
| Host knows it at build | Yes, named in `vite.config.js` | No                            |
| Edit + save            | Patched in place, no reload    | Rebuild, then automatic swap  |
| Latency                | Instant                        | A few seconds                 |
| Adding another one     | Host code change               | Drop a built folder in place  |
| Load failure surfaces  | Dev server startup             | Runtime, caught per extension |

Read the left column as a development tool, like a source map: valuable while
you work, absent from what you ship.

## Why split them this way

Automatic HMR patching requires the host to know its remotes at dev-server
startup, so `@module-federation/vite`'s import resolver can rewrite the call
site. Without a declared remote there is nothing to rewrite against, and the
literal specifier simply does not resolve. Forcing the declarative module into
a production build reproduces it:

```
[vite]: Rolldown failed to resolve import "extension-a/Extension"
from "/workspace/src/host/src/extensions/declarativeExtensions.js".
```

So the fast inner loop and a fully runtime-driven host cannot both be had from
one build. Rather than pick one, this project takes the fast loop where it
costs nothing (dev) and the runtime flexibility where it matters (production).

That split is only honest if the declarative wiring genuinely does not survive
into the production bundle. It does not, and the next section is how.

## How the declarative path is kept out of production

[`host/vite.config.js`](../src/host/vite.config.js) declares the remote only
when Vite is running as a dev server:

```js
const isDev = command === "serve";

federation({
  name: "host",
  remotes: isDev
    ? {
        "extension-a": {
          type: "module",
          name: "extension-a",
          entry: "http://localhost:5174/remoteEntry.js",
        },
      }
    : {},
  dev: { remoteHmr: true },
});
```

That alone is not enough. The literal `import('extension-a/Extension')` still
sits in the source, and with no declared remote to resolve it against, a
production build fails outright. So the module holding it is swapped at the
resolver level:

```js
resolve: {
  alias: {
    "@declarative-extensions": isDev
      ? ".../src/extensions/declarativeExtensions.js"
      : ".../src/extensions/declarativeExtensions.prod.js",
  },
},
```

[`declarativeExtensions.js`](../src/host/src/extensions/declarativeExtensions.js)
holds the literal imports, the static route, and the metadata.
[`declarativeExtensions.prod.js`](../src/host/src/extensions/declarativeExtensions.prod.js)
is the inert stub:

```js
export const DECLARATIVE_EXTENSION_NAMES = [];
export const declarativeRoutes = [];
export const declarativeExtensionsMetadata = Promise.resolve([]);
```

Three consumers import from `@declarative-extensions` and neither knows nor
cares which one they got: [`router.js`](../src/host/src/router.js) spreads
`declarativeRoutes` into its route table,
[`App.vue`](../src/host/src/App.vue) merges the metadata into its sidebar list,
and [`useExtensionRegistry.js`](../src/host/src/extensions/useExtensionRegistry.js)
skips `DECLARATIVE_EXTENSION_NAMES` when reconciling the manifest. In
production all three get empty values, so the dynamic registry ends up owning
every extension.

**Why an alias rather than `if (import.meta.env.DEV)`.** A dead-branch guard
would rely on the define replacement running before import analysis, and on
tree-shaking dropping the branch before Rolldown tries to resolve the specifier
inside it. Neither ordering is a documented guarantee, so the build would be
relying on an optimisation happening to fire. Aliasing the whole module keeps
the unresolvable specifier out of the production module graph in the first
place, which is a property of how the graph is built.

Verified against a real build. The compiled host bundle contains no occurrence
of the string `extension-a`, and no `__mfe_internal__host__mf_owner__1__extension-a`
remote alias. The `__mfe_internal__host__mf_owner__1` prefix does still appear
in three chunk names, but only for shared-module plumbing
(`localSharedImportMap`, `loadShare__pinia`, `loadShare__vue_mf_2_router`),
which is the singleton machinery from `shared` and unrelated to remotes.

Point the alias at the dev module instead and the build fails outright, with
the resolution error shown [above](#why-split-them-this-way).

## The declarative path, in dev

`dev.remoteHmr: true` is a documented option with a Vue-specific path. Its type
definition describes two mechanisms working together: the plugin injects a
`__VUE_HMR_RUNTIME__` guard into the host page, pinning the first-loaded Vue
runtime so remote-loaded copies cannot overwrite it, and it clears the
federation `moduleCache` on `vite:beforeUpdate` so later `loadRemote()` calls
return the freshly patched module.

Verified end to end rather than inferred. With the mounted component's click
counter at 3, editing its heading text in
`extension-a/src/ExtensionApp.vue` produced:

- the heading updated to the new text
- the counter still reading 3
- zero top-level navigations
- no console errors

A reload would have reset that counter to 0. It survived, so the module was
genuinely patched in place.

### The literal-import constraint

Both `import()` calls in `declarativeExtensions.js` must stay literal, and must
not become `loadRemote()` from `@module-federation/runtime`.

A `loadRemote()` call is invisible to the plugin's static analysis, which only
sees literal `import(...)` expressions. `loadRemote()` therefore looks up the
plain string `'extension-a'`, but the plugin registers a statically declared
remote under an internal prefixed alias
(`__mfe_internal__host__mf_owner__1__extension-a` in the compiled output). The
call fails with:

```
[ Federation Runtime ]: Failed to locate remote (#RUNTIME-004)
```

For the same reason the specifier is written out twice in that file rather than
hoisted into a shared helper. Hoisting it hides it from the transform.

## The dynamic path

The host discovers each extension from the backend at runtime, loads it through
`@module-federation/runtime`, and installs its route with `router.addRoute()`.
The full mechanism is in [dynamic discovery](./dynamic-discovery.md).

On edit and save, `vite build --watch` writes into the backend's wwwroot, the
backend's `FileSystemWatcher` pushes an SSE event, and the host re-imports the
remote and swaps the mounted component. A few seconds, but no manual refresh.

Because state lives in Pinia rather than in the component, the remount is
invisible in practice. Verified the same way as above: toggling a task, editing
the heading, then confirming the new heading appeared with the checkbox state
intact and zero navigations.

### Two gotchas worth knowing

**`registerRemotes()` defaults to `type: 'var'`**, meaning it loads
`remoteEntry.js` as a classic script exposing a global. Every `remoteEntry.js`
these Vite builds produce is a real ES module, so the default throws
`Cannot use import statement outside a module`. Passing `type: 'module'`
explicitly is required. See
[`loadExtensions.js`](../src/host/src/extensions/loadExtensions.js).

**Re-registering an already-registered remote logs a warning that is benign:**

```
The remote "extension-b" is already registered. Please note that
overriding it may cause unexpected errors.
```

`{ force: true }` is passed explicitly and the swap completes correctly. This
is the runtime being cautious, not a real problem.

## Choosing, in your own project

This repo's split is one reasonable answer, not the only one.

**Dev-only declarative, dynamic in production** (what this repo does) fits when
the extension set must stay a runtime concern but you still want a fast inner
loop on the extensions you actively develop. The cost is the alias indirection
above, plus two code paths to keep behaviourally identical.

**Declarative everywhere** fits when the set of remotes is genuinely fixed at
build time and the operational simplicity of one code path is worth more than
runtime flexibility.

**Dynamic everywhere, including dev** is the simplest thing that works. You
give up in-place patching and accept the rebuild-and-swap loop, which this repo
measures at a few seconds. For many teams that is a fine trade, and it removes
the dev/production divergence entirely.

The one combination unavailable here is declarative HMR on a host that has no
build-time knowledge of its remotes, for the reason in
[Why split them this way](#why-split-them-this-way).
