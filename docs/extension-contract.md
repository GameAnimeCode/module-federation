# The extension contract

Back to the [README](../README.md).

Everything an extension must agree to, and what breaks when it does not.

This project runs two extensions written by one author, so the conventions hold
by inspection. A real platform has neither luxury. Extensions arrive from teams
you do not control, built against a host you shipped months ago, and **nothing
in Module Federation validates any of this**. The failures below are all
silent or misleading, which is what makes them worth writing down before the
third extension exists rather than after.

## The five contracts

|                  | Carried by                                                             | Enforced by |
| ---------------- | ---------------------------------------------------------------------- | ----------- |
| **Module**       | `./Extension` exposing `{ id, label, routePath, component, useStore }` | Nothing     |
| **Identity**     | Folder name, federation `name`, `id`, `routePath`, store id            | Nothing     |
| **State**        | A Pinia store exposing a `summary` getter                              | Nothing     |
| **Styling**      | The host's `--color-*` custom properties                               | Nothing     |
| **Dependencies** | The `shared` singleton set, and the versions behind it                 | Nothing     |

"Enforced by: nothing" is the whole point of this page. Module Federation
resolves modules; it does not type-check them, validate their shape, or notice
that two of them claim the same name.

## Identity, and how collisions actually fail

Five names travel together for each extension, and this project keeps them
identical on purpose:

```
src/extensions/extension-b/     folder name
  vite.config.js  name:         'extension-b'   federation container
  src/extension.js  id:         'extension-b'   sidebar key + vue-router route name
                    routePath:  '/ext/extension-b'
  src/store.js    defineStore:  'extension-b'   Pinia registry key
```

The backend discovers extensions by folder name
([dynamic discovery](./dynamic-discovery.md)), so the folder is the de facto
primary key. Everything else is convention.

Collisions do not announce themselves. Verified against this repo's own
`vue-router` 4.6.4 and `pinia` 4.0.2:

**Duplicate Pinia store id.** The second `defineStore` never takes effect.
`useExtensionBStore()` returns extension A's store, and reads come back with
A's state:

```js
const useA = defineStore("shared-id", {
  state: () => ({ who: "extension-a" }),
});
const useB = defineStore("shared-id", {
  state: () => ({ who: "extension-b" }),
});
useA() === useB(); // true
useB().who; // "extension-a"
```

No warning. Extension B appears to work, shows the wrong data, and writes into
A's state.

**Duplicate route name.** `router.addRoute` treats the name as a key and
removes the existing route:

```js
router.addRoute({ path: "/ext/one", name: "dup", component: First });
router.addRoute({ path: "/ext/two", name: "dup", component: Second });
router.getRoutes(); // only /ext/two survives
router.resolve("/ext/one"); // no match
```

Because this host passes `descriptor.id` as the route name, two extensions
sharing an `id` delete each other's routes. Whichever loads last wins, and
load order comes from the backend's directory listing, so the casualty can
change between deployments.

**Duplicate route path under different names.** Both routes register and the
first one always resolves. The second extension is loaded, listed in the
sidebar, and unreachable.

**What to standardize.** Pick one primary key, derive the rest, and reject
duplicates at publish time rather than at load time. Namespacing store ids
(`acme.billing` rather than `billing`) costs nothing and removes an entire
class of these. The host can also refuse to register a second extension
claiming a taken `id` or `routePath`, which turns a silent collision into a
console error naming both parties.

## State

Extensions own their stores. The host reads exactly one thing from them:

```js
const store = ext.useStore();
return { id: ext.id, label: ext.label, summary: store.summary };
```

`summary` returns a plain string. That is the entire read surface, which is why
adding an extension with completely different state needs no host change (see
[keeping the host generic](./dynamic-discovery.md#keeping-the-host-generic)).

Standardize three things a platform will otherwise get wrong:

- **Who calls `createPinia()`.** Exactly one place, the host. An extension that
  creates its own gets an instance nothing else can see.
- **Which packages are singletons.** `vue`, `vue-router`, and `pinia` must be
  declared `singleton: true` in _every_ config. A remote that omits `pinia`
  bundles its own copy, and `useStore()` fails with "no active Pinia" because
  the injection `Symbol` differs (see
  [why the shared singleton matters](./module-federation.md#why-the-shared-singleton-matters)).
- **What the read surface is.** If `summary` grows into `summary`, `status`,
  and `badgeCount`, that is a versioned interface now. Treat it like one.

## Dependency versions

Declaring `vue`, `vue-router`, and `pinia` as singletons settles how many
copies load. It does not settle _which version wins_, and this repo leaves that
unspecified: the configs say `{ singleton: true }` and nothing more, so each
build infers versions from its own `package.json`. The host and both extensions
have separate `node_modules` that currently agree by coincidence of being
installed from one commit.

For a platform, standardize three things:

- **A supported range per shared package**, expressed as `requiredVersion`, so
  a remote states what it needs rather than assuming.
- **Whether a mismatch is fatal**, via `strictVersion`. Silent version drift is
  the failure mode described in [costs](./module-federation.md#costs), and this is
  the switch that makes it loud.
- **A compatibility policy for already-deployed remotes.** The host upgrades on
  its own schedule; remotes built against the previous major stay deployed.
  Decide whether the host supports N-1, and how it detects and refuses N-2.

See [version negotiation](./module-federation.md#version-negotiation-and-what-this-repo-leaves-unset).

## Styling

The host publishes semantic tokens; extensions consume them with fallbacks and
keep only their own brand accent. Full detail in [theming](./theming.md).

The caveat worth repeating here: **tokens are a public API**. Once a remote you
do not rebuild depends on `--color-surface`, renaming it breaks that remote at
runtime with no error, just wrong colours. A platform should version the token
vocabulary and treat removals as breaking changes, exactly as it would for the
descriptor shape.

## What this project deliberately does not do

Called out so the demo is not mistaken for a template:

- **No descriptor validation.** The host trusts the shape. A missing
  `routePath` throws inside `addRoute`, which the per-extension `try`/`catch`
  in `useExtensionRegistry.js` catches and logs, so the shell survives and that
  one extension silently does not appear. A real platform should validate the
  descriptor and surface a specific error.
- **No duplicate detection.** Nothing checks `id`, `routePath`, or store id
  against what is already registered.
- **No version negotiation beyond the packages in `shared`.** The descriptor
  contract itself carries no version field. Adding one, and having the host
  refuse incompatible majors, is the obvious next step for anything real.
- **No integrity or provenance checks.** The host executes whatever
  `remoteEntry.js` the manifest points at, with its own privileges. Federation
  is not a sandbox.
- **No isolation between extensions.** They share a DOM, a router, and a Pinia
  instance. One extension can read and mutate another's store.
- **No render-time error boundary.** The `try`/`catch` in
  `useExtensionRegistry.js` covers loading. An extension that loads and then
  throws while rendering is uncontained, and takes the view with it. A platform
  wants `onErrorCaptured` around `<router-view>`, per extension.
- **No `requiredVersion` or `strictVersion`** on any shared package.
- **mtime as the version token.** Fine for a single server, wrong across a CDN
  or multiple instances.

## Also worth standardizing, not shown here

These do not arise with two first-party widgets, and all of them arise with ten
from four teams:

- **Asset base paths.** Images and fonts inside a remote resolve against the
  remote's own base, not the host's. Get this wrong and assets 404 only in
  production.
- **Cross-cutting context.** Auth tokens, locale, feature flags, and tenant id
  all need a defined channel. The theme answers this for styling; everything
  else is undecided here.
- **Route guards.** Whether an extension may register navigation guards, and
  what happens when two disagree.
- **Duplicate non-shared dependencies.** Anything outside `shared` ships once
  per remote. Three remotes bundling their own date library is three copies on
  the wire.
- **Teardown.** Removing an extension drops its route, not its timers, event
  listeners, or subscriptions. A long-lived session leaks them.
- **Focus management.** Route changes between extensions should move focus for
  keyboard and screen-reader users; nothing here does.
- **Testing across the boundary.** Contract tests that assert a remote's
  descriptor shape against the host's expectations, run in the remote's own CI,
  catch these breaks before deployment rather than in a user's browser.

## Checklist for a platform team

- [ ] One primary key per extension, everything else derived from it
- [ ] Namespaced store ids
- [ ] Duplicate `id`, `routePath`, and store id rejected before publish
- [ ] Descriptor shape validated at load, with a named error on failure
- [ ] A version field on the descriptor, and a host that enforces it
- [ ] The singleton set identical across host and every remote
- [ ] Token vocabulary versioned, removals treated as breaking
- [ ] `requiredVersion` and `strictVersion` set on every shared package
- [ ] A stated compatibility policy for remotes built against older hosts
- [ ] Content-hashed or explicitly versioned remote entry files
- [ ] A per-extension `try`/`catch` around loading, plus an error boundary
      around rendering
