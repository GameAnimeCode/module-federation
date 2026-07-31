# Dynamic Vue Module Federation with .NET

An educational proof-of-concept: a Vue 3 host app that loads two independently
built "extensions" via Module Federation, demonstrating side by side
**two different ways an extension's code can reach the host**, with two very
different trade-offs:

|                                             | Extension A                                          | Extension B                                                                                                                                                    |
| ------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Approach**                                | Declarative (static remote)                          | Dynamic (runtime discovery)                                                                                                                                    |
| **Host knows about it at build time?**      | Yes, named in `vite.config.js`                       | No, discovered from the backend at runtime                                                                                                                     |
| **Live HMR while editing?**                 | **Yes**, verified: edits patch in place, zero reload | No, see "rebuild + swap" below                                                                                                                                 |
| **What happens when you edit + save (dev)** | Patches in place immediately                         | Rebuilds (`vite build --watch`), then the host detects the change and swaps the mounted component in. A few seconds, not instant, but no manual refresh needed |
| **Adding a new one requires**               | A host code change (name it, add a route)            | Nothing, drop a built folder in place                                                                                                                          |

Neither approach is objectively better. This is a real trade-off, verified
empirically rather than inferred from docs, and this project deliberately
keeps both running so you can compare them directly. See "The two approaches,
in depth" below.

## Architecture

```
src/
  backend/                  .NET 10 Minimal API
    Program.cs               static file server + discovery API (extension B)
                              + SSE watcher (add/remove/rebuild notifications)
    wwwroot/                  populated by scripts/build.sh at build time
      index.html, assets/...  <- compiled host
      apps/extensions/
        extension-a/           <- compiled extension-a (remoteEntry.js at root)
        extension-b/           <- compiled extension-b (remoteEntry.js at root)

  host/                     Vue 3 + Vite, Module Federation *consumer*
    vite.config.js            statically declares extension-a as a remote;
                               extension-b is NOT declared here at all
    src/
      config.js               API base URL (empty in prod, cross-origin in dev)
      router.js                "/" and extension A's route are static;
                                extension B's route is added at runtime
      extensions/
        declarativeExtensionA.js  extension A's metadata (label, Pinia store
                                    hook), NOT the rendered component, see below
        loadExtensions.js       talks to the federation runtime directly,
                                  extension B only
        useExtensionRegistry.js  reactive state for extension B: fetch
                                  manifest, load/unload/hot-swap,
                                  SSE subscription, router.addRoute/removeRoute
      views/                   HomeView, ExtensionUnavailableView (stale-route fallback)

  extensions/
    extension-a/              Vue 3 + Vite, the *declarative* remote
    extension-b/              Vue 3 + Vite, the *dynamic* remote
      src/
        ExtensionApp.vue        the actual widget UI (reads/writes the store)
        store.js                 Pinia store: state + a `summary` getter
        extension.js             the exposed `./Extension` descriptor:
                                  { id, label, routePath, component, useStore }

scripts/
  build.sh                  builds host + both extensions, assembles wwwroot,
                             builds the backend (production, single origin)
  dev.sh                    backend (dev) + host (vite dev) + extension-a
                             (its own vite dev server) + extension-b
                             (vite build --watch into wwwroot)
```

Both extensions are independently buildable, independently deployable Vite
projects. Neither imports from the other, and neither imports from host
source. The _host_, however, is asymmetric on purpose: it has zero
build-time knowledge of extension B, and real build-time knowledge of
extension A, deliberately, as the one exception in this whole project.

## Cross-remote state with Pinia

Both extensions keep their state (Extension A: a click counter, Extension B:
a task list) in their own Pinia store (`store.js`). The host's sidebar shows
a live "Extension State" panel summarizing both, e.g. "Extension A: 3
clicks", "Extension B: 1 to-do", updating in real time as you interact with
either extension, even when that extension isn't currently mounted in
`<router-view>`.

This works because **Pinia is shared as a Module Federation singleton**,
exactly like `vue` (`shared: { pinia: { singleton: true } }` in all three
`vite.config.js` files). The host is the only place that calls
`createPinia()` (`host/src/main.js`); every extension only calls
`useXStore()`, which resolves the _host's_ active Pinia instance rather than
creating its own. Without the singleton share, each extension would bundle
its own separate copy of the `pinia` package, a distinct module instance
with its own internal injection `Symbol`, and `useXStore()` inside an
extension would fail with "no active Pinia".

**The host stays generic where it can.** The status panel never reads
`store.count` or `store.tasks` directly. Every store exposes a `summary`
getter (a plain string), and the host only ever reads
`ext.useStore().summary`. Adding a third _dynamic_ extension with entirely
different state requires no host changes as long as its store exposes a
`summary` getter too.

**State genuinely crosses the boundary, not just visually.** Navigate to
Extension A, click its counter to increment it, then navigate to Home
(unmounting Extension A's component entirely): the sidebar's "3 clicks"
stays put, because the count lives in the shared Pinia store, not in the
component. Verified with a headless-browser test.

## The two approaches, in depth

### Extension B: dynamic discovery (the "no build-time knowledge" path)

1. `GET /api/extensions` (backend `Program.cs`) scans
   `wwwroot/apps/extensions/*/` for any folder containing a `remoteEntry.js`
   and returns `[{ name, entryUrl, lastModifiedUnixMs }, ...]`. Adding a new
   folder makes it discoverable with **zero backend code changes**.
2. The host (`useExtensionRegistry.js`) fetches that manifest on startup,
   and for each _new_ entry calls `loadExtensions.js`, which:
   - registers the remote's URL with `@module-federation/runtime`'s
     `registerRemotes()`
   - imports its exposed `./Extension` module via `loadRemote()`
   - unwraps the descriptor and hands it back
3. For each loaded descriptor, the host adds a sidebar entry and calls
   `router.addRoute({ path: descriptor.routePath, component: descriptor.component })`.
4. `GET /api/extensions/stream` is a Server-Sent Events endpoint. The backend
   watches `wwwroot/apps/extensions` with a `FileSystemWatcher` (debounced
   400ms) and pushes an `extensions-changed` event on any add/remove/rewrite.
   The host's `EventSource` listener re-runs the fetch-and-reconcile step.
5. **In-place hot-swap**: each manifest entry's `lastModifiedUnixMs` lets
   `useExtensionRegistry.js` tell "never seen" apart from "seen, but rebuilt
   since" apart from "unchanged." On a rebuild (e.g. `npm run dev:watch`'s
   `vite build --watch` writing straight into `wwwroot/apps/extensions/`),
   it re-imports the remote with a cache-busted URL (`?t=<mtime>`, since the
   runtime's caches, including the browser's own `import()` cache, are keyed
   by exact URL string, and `remoteEntry.js` isn't content-hashed like
   everything it references is) and mutates the existing descriptor in
   place. **The subtle part**: `router.addRoute()` only affects _future_
   navigations. It does not retroactively refresh the `route.matched` that
   `<router-view>` is currently rendering from. If the user is sitting on
   that exact route, the swap is invisible without also forcing a same-URL
   `router.replace()`, since the underlying state updates correctly without
   it, but the page silently keeps rendering the old component.
6. On removal, the host drops the sidebar entry and calls
   `router.removeRoute(id)`. Module Federation has no supported "unload a
   remote" API, so the already-fetched JS module stays cached in the tab,
   but it's no longer reachable through the UI, and a stale deep link
   resolves to the app's catch-all `ExtensionUnavailableView` instead of a
   router error or a blank page.

Because extension B's state lives in Pinia, not the component, a full
component remount (a "swap" is a remount, not a granular DOM patch) is
invisible in practice: verified by clicking the task list, editing the
source, and watching the edit appear with the checkbox state intact.

### Extension A: declarative (the "real live HMR" path)

The host's `vite.config.js` statically declares extension A as a remote:

```js
federation({
  name: "host",
  remotes: {
    "extension-a": {
      type: "module",
      name: "extension-a",
      entry:
        command === "serve"
          ? "http://localhost:5174/remoteEntry.js" // its own dev server
          : "/apps/extensions/extension-a/remoteEntry.js", // built, same-origin
    },
  },
  dev: { remoteHmr: true },
  // ...
});
```

`router.js` then loads it via a **literal** `import()` call site, the exact
shape `@module-federation/vite`'s import-resolver rewrites at build time:

```js
{
  path: '/ext/extension-a',
  name: 'extension-a',
  component: () => import('extension-a/Extension').then((mod) => (mod.default ?? mod).component),
}
```

`dev.remoteHmr: true` is a documented, first-class option (see this plugin's
own `.d.ts`) with explicit Vue support: when this remote's code changes, the
plugin clears the federation module cache and guards the host's
`__VUE_HMR_RUNTIME__` so the freshly-loaded module hot-swaps in place. This
was verified directly, not inferred from docs: edited the mounted
component's heading text while its click counter read 5, watched the
heading update **with zero page navigations and the counter still at 5**,
proof it's a real in-place patch, not a disguised reload.

**This is a real trade, not a free win.** Two consequences of being
declarative:

- `declarativeExtensionA.js` (metadata: label, the Pinia store hook) has to
  use the _same_ literal `import('extension-a/Extension')` shape as
  router.js, **not** the standalone `loadRemote()` function from
  `@module-federation/runtime`. A `loadRemote()` runtime call is invisible
  to the plugin's static-analysis transform (it only sees literal
  `import(...)` expressions), so it looks up the literal string
  `'extension-a'`. But the plugin registers a _statically declared_ remote
  under an internal prefixed alias
  (`__mfe_internal__host__mf_owner__1__extension-a` in the compiled output),
  not the plain name. Calling `loadRemote('extension-a/Extension')` throws
  `[ Federation Runtime ]: Failed to locate remote (#RUNTIME-004)`.
- The host now hardcodes extension A's identity. Adding a fourth extension
  the _declarative_ way means editing `vite.config.js` and `router.js`; the
  dynamic path (extension B's) is what stays truly zero-touch.

**Why not use this for both extensions?** It's the tension the earlier
investigation (see "How this project got here" below) landed on:
`@module-federation/vite`'s automatic HMR patching requires the host to know
its remotes at dev-server startup, so its import resolver can rewrite the
call site. Tried directly with a fully dynamic host (no static `remotes`
entry at all), the literal `import('extension-a/Extension')` call threw
`Failed to resolve import` before the app even started. A fully dynamic host
and automatic live-patching are mutually exclusive with this plugin's
current API, so this project keeps one of each to show the trade-off rather
than hide it.

## How this project got here (the short version)

This started as a single fully-dynamic host using
`@originjs/vite-plugin-federation`, which works but is stale (no release
past `1.4.1`) and pins the whole project to Vite 5. Its dev-mode "expose"
and "shared" plugins are empty stubs with no server middleware, so it has no
way to serve a real federation container from a `vite dev` server at all.
Swapping to `@module-federation/vite` (actively maintained, explicit Vite 8
support, a real `dev.remoteHmr` implementation) both unblocked the Vite
upgrade and made true live HMR possible, for the one case (declarative) its
API actually supports.

Two non-obvious things worth knowing if you're reading the source:

- **`registerRemotes()` defaults to `type: 'var'`** (load `remoteEntry.js`
  as a classic script exposing a global), but every `remoteEntry.js` this
  project's Vite builds produce is a real ES module. Loading it as a
  classic script throws `Cannot use import statement outside a module`,
  fixed by passing `type: 'module'` explicitly (see `loadExtensions.js`).
- **Re-registering an already-registered remote (extension B's swap) logs a
  benign console warning**: `The remote "extension-b" is already
registered. Please note that overriding it may cause unexpected errors.`
  It doesn't: `{ force: true }` is passed explicitly and the swap completes
  correctly regardless. This is just the runtime being cautious.

## CORS

- **Production** (after `scripts/build.sh`): the host, the API, and every
  extension bundle are served by the same `dotnet` process on the same
  origin. CORS is never exercised.
- **Dev** (`scripts/dev.sh`, or `npm run dev` inside `src/host` on its own):
  the host runs on Vite's dev server (`:5173`) while the backend runs on
  `:5080`, different origins. `host/.env.development` points the dev host
  at `http://localhost:5080`, and the backend's `DevClients` CORS policy
  (`src/backend/Program.cs`, active only when `ASPNETCORE_ENVIRONMENT=Development`)
  allows that origin for both the `GET /api/extensions` fetch and the SSE
  `EventSource` connection (extension B's discovery path). Extension A's dev
  loading doesn't go through the backend at all: the host's browser tab
  talks directly to `http://localhost:5174`, which is why its
  `vite.config.js` sets `cors: true` and a fixed `origin`.

## Running it

### Release build (recommended way to see the whole system working)

```bash
./scripts/build.sh
dotnet run --project src/backend --urls http://localhost:5080
```

Open `http://localhost:5080/`. The sidebar shows "Extension A" (badged
`declarative`) and "Extension B" (badged `dynamic`), both loaded at runtime.

### Developing against both extensions at once

```bash
./scripts/dev.sh
```

This starts, and cleans up together on Ctrl+C:

- the backend in `Development` mode on `:5080`
- the host's own Vite dev server on `:5173`
- `extension-a` on its own `vite dev` server (`:5174`). Edit
  `src/extensions/extension-a/src/ExtensionApp.vue` and watch the host patch
  it live, no reload
- `extension-b` in `vite build --watch` mode, writing straight into
  `src/backend/wwwroot/apps/extensions/extension-b/`. Edit
  `src/extensions/extension-b/src/ExtensionApp.vue`; give it a few seconds
  (rebuild, SSE, swap; not instant, but automatic) and the host swaps in the
  new component with its Pinia state untouched

### Iterating on an extension in isolation

```bash
cd src/extensions/extension-a && npm run dev   # http://localhost:5174
cd src/extensions/extension-b && npm run dev   # http://localhost:5175
```

Both render `ExtensionApp.vue` directly (via each project's `App.vue`
standalone preview harness), without the host or backend running at all.
Full HMR works here too: it's ordinary Vite/Vue HMR, unrelated to the
federation-specific mechanisms above.

## Adding a third extension

**The dynamic way (recommended default, no host code changes):**

1. Copy `src/extensions/extension-b` to `src/extensions/extension-c` (or
   scaffold a fresh Vite + Vue project matching its `vite.config.js`
   pattern: no `remotes`, no host awareness).
2. In its `vite.config.js`, change the federation `name` to `'extension-c'`.
3. In `src/extension.js`, change `id`, `label`, and `routePath` to unique
   values. If it has its own state, give it its own `store.js`
   (`defineStore('extension-c', {...})`; the store id must also be unique)
   with a `summary` getter, and point `useStore` at it; the host's status
   panel picks it up automatically.
4. Build it (`npm run build`) and copy its `dist/` contents into
   `src/backend/wwwroot/apps/extensions/extension-c/`, or just re-run
   `./scripts/build.sh`, which picks up any folder under `src/extensions/`
   automatically.
5. With the backend already running, the `FileSystemWatcher` notices the new
   folder and pushes an SSE event. The sidebar gains "Extension C" without a
   page reload.
6. For the `dev.sh`-style watch-build workflow, add a
   `"dev:watch": "vite build --watch --outDir ../../backend/wwwroot/apps/extensions/extension-c"`
   script to its `package.json` and add it to `scripts/dev.sh`'s process
   list.

**The declarative way (only if you specifically want live HMR for it):**

1. Same steps 1–3 above, but also fix its dev port in `vite.config.js`
   (e.g. `5176`).
2. Add it to the host's `vite.config.js` `remotes` map, switching dev/prod
   URL by `command` the same way extension A does.
3. Add a static route to `router.js` using the same
   `component: () => import('extension-c/Extension').then(...)` pattern.
4. Give it its own metadata module (copy `declarativeExtensionA.js`), and
   include it in `App.vue`'s `allExtensions` computed.
5. `dev: { remoteHmr: true }` is already set globally on the host, so no
   further config is needed there.

## Known deviations from a from-scratch spec

- **.NET 10, not .NET 8**: this dev container only has the .NET 10 SDK/
  runtime installed. The Minimal API code is unaffected, since nothing here
  uses a .NET 8-only feature.
- **In-code comments favor "why" over "what"** throughout, per this
  project's own conventions. The non-obvious discoveries above (the
  `type: 'module'` default, the literal-import-vs-loadRemote() split, the
  router-race fix) are documented at the exact line they matter, not just
  here.
