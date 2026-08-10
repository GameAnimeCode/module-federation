# Module Federation: what it is and when to reach for it

Back to the [README][readme].

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

| Term                  | What it means                                            | In this repo                                           |
| --------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| **Host** (consumer)   | The app that loads modules it did not compile            | [`src/host`][host-dir]                                 |
| **Remote** (producer) | A separately built app that publishes modules            | [`extension-a`][ext-a-dir], [`extension-b`][ext-b-dir] |
| **Shared**            | Packages the host and remotes agree to load exactly once | `vue`, `vue-router`, `pinia`                           |

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
from each. See [`extension-a/src/store.js`][ext-a-store]
and [`host/src/App.vue`][host-app-vue]. The count survives navigating
away from the extension, because the state lives in the shared store rather
than in the unmounted component.

## Version negotiation, and what this repo leaves unset

`singleton: true` answers "how many copies", not "which version". Those are
separate questions, and the second one has knobs this project does not use.

The plugin's `shared` entries accept more than a boolean:

```js
shared: {
  pinia: {
    singleton: true,
    requiredVersion: "^4.0.0",  // what this build needs
    strictVersion: true,        // fail loudly instead of proceeding
    version: "4.0.2",           // what this build provides
  },
}
```

This repo declares only `{ singleton: true }`. Every version is therefore
inferred from each project's own `package.json`, and **the host, extension A,
and extension B each have their own `node_modules`**. They are three separate
installs that happen to agree: all three currently resolve `vue` 3.5.40 and
`pinia` 4.0.2. Nothing at build time enforces that agreement, and nothing would
notice if a remote were rebuilt six months later against a newer minor.

That is fine for a demo where one author builds all three from one commit. It
is the wrong default for a platform, where remotes are built at different times
by different teams. `requiredVersion` plus `strictVersion` is what converts an
implicit assumption into a checked one.

Two caveats on this section, stated plainly. The option names and shapes above
come from the plugin's own type definitions. This project has never actually
run a version mismatch, so treat the precise runtime behavior on a conflict
as something to verify against your own setup rather than something this repo
demonstrates. The claim being made here is narrower: the knobs exist, this repo
leaves them unset, and a real platform should not.

## Benefits

- **Independent deploy cadence.** A remote ships on its own schedule. The host
  does not rebuild, and in this repo's dynamic path it does not even restart.
- **No duplicated framework code.** Shared singletons mean one copy of Vue on
  the wire and in memory, unlike an iframe or a bundled-per-team approach.
- **Remotes live inside the host's DOM.** They render into it directly, use the
  host's router, and read its stores, so focus management and modals behave the
  way they would in a single bundle. The CSS cascade reaches them too, which is
  how this repo themes its extensions (see [theming][theming]). An iframe
  gives up all of that.
- **Runtime extensibility.** Because the remote's URL is just a string, the set
  of loadable modules can be decided at runtime. This is what makes a plugin
  architecture possible, and it is the core of [dynamic discovery][dynamic-discovery].
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
  mode to match. This repo's host wraps every load in a `try`/`catch` so a remote that
  fails to load cannot take down the shell
  ([`useExtensionRegistry.js`][registry]).
  A remote that loads and then throws while rendering is caught separately, by
  an error boundary around the router view (see
  [the extension contract][contract-boundary]).
- **Tooling maturity varies.** The Vite ecosystem in particular has churned:
  see [Choosing a Vite plugin](#choosing-a-vite-plugin) below.
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

## Choosing a Vite plugin

Two plugins implement Module Federation for Vite, and the choice is not close
at the time of writing. This matters more than most tooling decisions, because
the plugin dictates what your dev loop can do (see
[HMR approaches][hmr-approaches]).

**`@originjs/vite-plugin-federation`** is the older and more widely blogged
about of the two. Its most recent release is `1.4.1` from April 2025, and its
own development dependency on Vite is `^4.0.5` with no peer range declared for
newer majors, so running it on a current Vite means taking compatibility on
faith. Its dev-mode plugins also cannot serve a real federation container from
a `vite dev` server, which forces you to pre-build every remote even while
developing it.

**`@module-federation/vite`** is maintained by the Module Federation project
itself. It declares `vite: ^5 || ^6 || ^7 || ^8` as a peer range, so a Vite
upgrade is supported rather than assumed, and its `dev.remoteHmr` option
implements cross-federation hot reloading with an explicit Vue path.

This repo uses the second, and switching to it is what made the live-HMR
comparison possible at all.

## Further reading

- [The two approaches to HMR][hmr-approaches], the trade-off this repo exists to show
- [Dynamic discovery][dynamic-discovery], loading remotes the host was never built against
- [Theming][theming], styling that crosses the boundary without federation
- [The extension contract][extension-contract], what to standardize before a second team joins
- [Build a federated app][build-guide], the step-by-step
- [module-federation.io][module-federation-docs], upstream docs

[build-guide]: ./build-a-federated-app.md
[contract-boundary]: ./extension-contract.md#containing-a-failing-extension
[dynamic-discovery]: ./dynamic-discovery.md
[ext-a-dir]: ../src/extensions/extension-a
[ext-a-store]: ../src/extensions/extension-a/src/store.js
[ext-b-dir]: ../src/extensions/extension-b
[extension-contract]: ./extension-contract.md
[hmr-approaches]: ./hmr-approaches.md
[host-app-vue]: ../src/host/src/App.vue
[host-dir]: ../src/host
[module-federation-docs]: https://module-federation.io/
[readme]: ../README.md
[registry]: ../src/host/src/extensions/useExtensionRegistry.js
[theming]: ./theming.md
