# Module Federation: what it is and when to reach for it

Back to the [README](../README.md).

## The problem it solves

A large frontend built by several teams usually ends up in one of two shapes,
and both have a cost.

**One bundle, one repo.** Everything is type-checked and tree-shaken together,
but every team ships on the same release train. A one-line change in a rarely
used screen means rebuilding and redeploying the entire application.

**Many bundles, one iframe or one page reload per team.** Teams deploy
independently, but the boundary is a hard one: separate DOM, separate
JavaScript realm, no shared component state, and duplicated framework code in
every bundle.

Module Federation is a third option. It lets one running application import a
JavaScript module that **some other build compiled and deployed**, then run it
inside the same page, the same DOM, and the same JavaScript realm. The bundles
stay separate all the way through deployment and only meet in the browser.

## The three concepts

| Term                  | What it means                                            | In this repo                                                                                   |
| --------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Host** (consumer)   | The app that loads modules it did not compile            | [`src/host`](../src/host)                                                                      |
| **Remote** (producer) | A separately built app that publishes modules            | [`extension-a`](../src/extensions/extension-a), [`extension-b`](../src/extensions/extension-b) |
| **Shared**            | Packages the host and remotes agree to load exactly once | `vue`, `vue-router`, `pinia`                                                                   |

Each remote publishes a small manifest file, `remoteEntry.js`, describing what
it exposes and which shared dependencies it expects. The host fetches that
file, negotiates shared versions with the runtime, then imports the exposed
module like any other ES module.

The negotiation step is what separates Module Federation from "load a script
tag and hope." If the host already has `vue` loaded and the remote declares
`vue` as a singleton, the remote is handed the host's instance instead of
loading its own.

## Why the shared singleton matters

This is the part that most often bites people, and it is worth understanding
before writing any config.

Vue's reactivity, `provide`/`inject`, and Pinia's store registry all key off
module-level state, some of it stored on `Symbol` instances created when the
module first evaluates. Two copies of `pinia` in one page means two distinct
injection symbols. `useMyStore()` inside a remote then fails with _"no active
Pinia"_, because it is looking up a symbol the host's `app.use(createPinia())`
never registered.

Declaring the package as a singleton is what prevents the second copy:

```js
// identical in all three vite.config.js files
shared: {
  vue: { singleton: true },
  "vue-router": { singleton: true },
  pinia: { singleton: true },
}
```

In this repo the payoff is visible in the host's sidebar: both extensions keep
their state in their own Pinia store, and the host reads a `summary` getter
from each. See [`extension-a/src/store.js`](../src/extensions/extension-a/src/store.js)
and [`host/src/App.vue`](../src/host/src/App.vue). The count survives navigating
away from the extension, because the state lives in the shared store rather
than in the unmounted component.

## Benefits

- **Independent deploy cadence.** A remote ships on its own schedule. The host
  does not rebuild, and in this repo's dynamic path it does not even restart.
- **No duplicated framework code.** Shared singletons mean one copy of Vue on
  the wire and in memory, unlike an iframe or a bundled-per-team approach.
- **Remotes live inside the host's DOM.** They render into it directly, use the
  host's router, and read its stores, so focus management and modals behave the
  way they would in a single bundle. The CSS cascade reaches them too, which is
  how this repo themes its extensions (see [theming](./theming.md)). An iframe
  gives up all of that.
- **Runtime extensibility.** Because the remote's URL is just a string, the set
  of loadable modules can be decided at runtime. This is what makes a plugin
  architecture possible, and it is the core of [dynamic discovery](./dynamic-discovery.md).
- **Incremental adoption.** A monolith can expose one route as a remote without
  restructuring anything else.

## Costs

These are real, and they are the reason Module Federation is not a default.

- **Version skew escapes the build entirely.** If a remote is built against Vue
  3.5 APIs and the host supplies 3.3, nothing catches it until the component
  renders in a user's browser. Declaring a package a singleton is what makes
  this possible, and it leaves the version contract implicit, so it can break
  without anything failing loudly.
- **No cross-bundle type checking.** The host imports `extension-a/Extension`
  and gets whatever that build happens to export. The descriptor contract in
  this repo (`{ id, label, routePath, component, useStore }`) is enforced by
  convention and by the code reading it, nothing more.
- **Debugging spans builds.** A stack trace can cross from host source into a
  remote's compiled chunk. Source maps help; deploying host and remote from
  different commits still makes bisecting harder.
- **Operational surface grows.** Each remote becomes its own build, its own
  deployment, and its own set of cache headers and CORS rules, with a failure
  mode to match. This repo's host wraps every load in a `try`/`catch` so one
  broken remote cannot take down the shell
  ([`useExtensionRegistry.js`](../src/host/src/extensions/useExtensionRegistry.js)).
- **Tooling maturity varies.** The Vite ecosystem in particular has churned:
  see [How this project got here](#how-this-project-got-here) below.
- **There is no sandbox.** A remote runs in the same realm with the host's full
  privileges, which makes federation suitable only for code you already trust.
  Untrusted third-party plugins need an iframe or a worker.

## When to use it

**Good fit:**

- Several teams own separate sections of one application and need to ship on
  separate schedules.
- A product needs a plugin or extension model where the set of installed
  modules varies per customer, per tenant, or per environment.
- A large legacy frontend is being strangled route by route, and both old and
  new need to coexist in one page for a while.
- The same widget must be embedded in several applications without publishing
  and version-bumping an npm package for every change.

**Poor fit:**

- One team, one release cadence. A monorepo with a shared component library
  gives you the same code reuse with compile-time safety and none of the
  runtime negotiation.
- The modules come from parties you do not trust.
- The application is small enough that the total bundle already loads fast. The
  federation runtime is overhead you would be paying for nothing.
- Strict end-to-end type safety across the boundary is a hard requirement.

**Rule of thumb:** reach for Module Federation when _independent deployment_ is
the actual requirement. If you only want code reuse, use a package.

## How this project got here

This repo started on `@originjs/vite-plugin-federation`. It works, but its
latest published release is `1.4.1` from April 2025, and its own devDependency
on Vite is `^4.0.5` with no peer range declared for newer majors. Trying to
move the project onto a current Vite meant taking that on faith. A second
problem was decisive: its dev-mode plugins could not serve a real federation
container from a `vite dev` server, so remotes had to be pre-built even during
development.

`@module-federation/vite` fixed both. It declares
`vite: ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0` as a peer range, so the Vite 8
upgrade was supported rather than assumed, and its `dev.remoteHmr` option
implements cross-federation HMR with a documented Vue path: it pins the
host's `__VUE_HMR_RUNTIME__` so remote-loaded Vue copies cannot overwrite it,
and clears the federation `moduleCache` on `vite:beforeUpdate`.

That option also introduced the constraint shaping this whole demo. Automatic
HMR patching requires the host to know its remotes at dev-server startup, which
is why the declarative path here is confined to the dev server. See
[HMR approaches](./hmr-approaches.md).

## Further reading

- [The two approaches to HMR](./hmr-approaches.md), the trade-off this repo exists to show
- [Dynamic discovery](./dynamic-discovery.md), loading remotes the host was never built against
- [Theming](./theming.md), styling that crosses the boundary without federation
- [The extension contract](./extension-contract.md), what to standardize before a second team joins
- [Build a federated app](./build-a-federated-app.md), the step-by-step
- [module-federation.io](https://module-federation.io/), upstream docs
