# Dynamic Vue Module Federation with .NET

An educational proof-of-concept: a Vue 3 host app that discovers and loads
"extensions" it has **zero build-time knowledge of**. Adding, removing, or
replacing an extension never requires rebuilding the host — you drop a
compiled bundle into a folder and the running app picks it up.

## Architecture

```
src/
  backend/                  .NET 10 Minimal API
    Program.cs               static file server + discovery API + SSE watcher
    wwwroot/                  populated by scripts/build.sh at build time
      index.html, assets/...  <- compiled host
      apps/extensions/
        extension-a/           <- compiled extension-a (remoteEntry.js at root)
        extension-b/           <- compiled extension-b (remoteEntry.js at root)

  host/                     Vue 3 + Vite, Module Federation *consumer*
    src/
      config.js               API base URL (empty in prod, cross-origin in dev)
      router.js                only "/" is known ahead of time
      extensions/
        loadExtensions.js       talks to the federation runtime directly
        useExtensionRegistry.js  reactive state: fetch manifest, load/unload,
                                  SSE subscription, router.addRoute/removeRoute
      views/                   HomeView, ExtensionUnavailableView (stale-route fallback)

  extensions/
    extension-a/              Vue 3 + Vite, Module Federation *remote* #1
    extension-b/              Vue 3 + Vite, Module Federation *remote* #2
      src/
        ExtensionApp.vue        the actual widget UI (reads/writes the store)
        store.js                 Pinia store: state + a `summary` getter
        extension.js             the exposed `./Extension` descriptor:
                                  { id, label, routePath, component, useStore }

scripts/
  build.sh                  builds host + both extensions, assembles wwwroot,
                             builds the backend
```

Each extension is an independently buildable, independently deployable Vite
project. It knows nothing about the host or about the other extension. The
host knows nothing about either extension's existence at build time — only
the shape of the descriptor object every extension is expected to expose.

## How dynamic discovery works

1. `GET /api/extensions` (backend `Program.cs`) scans
   `wwwroot/apps/extensions/*/` for any folder containing a `remoteEntry.js`
   and returns `[{ name, entryUrl }, ...]`. Adding a new folder makes it
   discoverable with **zero backend code changes**.
2. The host (`useExtensionRegistry.js`) fetches that manifest on startup,
   and for each entry calls `loadExtensions.js`, which:
   - registers the remote's URL with the Module Federation runtime
     (`__federation_method_setRemote`)
   - imports its exposed `./Extension` module
     (`__federation_method_getRemote`)
   - unwraps the descriptor and hands it back
3. For each loaded descriptor, the host adds a sidebar entry and calls
   `router.addRoute({ path: descriptor.routePath, component: descriptor.component })`.
4. `GET /api/extensions/stream` is a Server-Sent Events endpoint. The backend
   watches `wwwroot/apps/extensions` with a `FileSystemWatcher` (debounced
   400ms) and pushes an `extensions-changed` event on any add/remove/rename.
   The host's `EventSource` listener re-runs the fetch-and-reconcile step —
   no polling, no manual refresh.
5. On removal, the host drops the sidebar entry and calls
   `router.removeRoute(id)`. Module Federation has no supported "unload a
   remote" API, so the already-fetched JS module stays cached in the tab —
   but it's no longer reachable through the UI, and a stale deep link
   resolves to the app's catch-all `ExtensionUnavailableView` instead of a
   router error or a blank page.

## Cross-remote state with Pinia

Each extension keeps its state (Extension A: a click counter, Extension B: a
task list) in its own Pinia store (`store.js`), and the host's sidebar shows
a live "Extension State" panel summarizing both — e.g. "Extension A: 3
clicks", "Extension B: 1 to-do" — that updates in real time as you interact
with either extension, even when that extension isn't the one currently
mounted in `<router-view>`.

This works because **Pinia is shared as a Module Federation singleton**,
exactly like `vue` (`shared: { pinia: { singleton: true } }` in all three
`vite.config.js` files). The host is the only place that calls
`createPinia()` (`host/src/main.js`); every extension only calls
`useXStore()`, which resolves the *host's* active Pinia instance rather than
creating its own. Without the singleton share, each extension would bundle
its own separate copy of the `pinia` package — a distinct module instance
with its own internal injection `Symbol` — and `useXStore()` inside an
extension would fail with "no active Pinia" (same failure class as *not*
sharing `vue`, documented below).

**The host stays generic, not extension-specific**: `App.vue`'s status panel
never reads `store.count` or `store.tasks` directly. Every store exposes a
`summary` getter (a plain string), and the host only ever reads
`ext.useStore().summary`. `extension.js`'s descriptor gained one field —
`useStore` — alongside the existing `id`/`label`/`routePath`/`component`.
Adding a third extension with entirely different state (see "Adding a third
extension manually" below) requires no host changes as long as its store
exposes a `summary` getter too.

**Proof state genuinely crosses the boundary, not just visually**: navigate
to Extension A, click its counter to increment it, then navigate to Home
(unmounting Extension A's component entirely) — the sidebar's "3 clicks"
stays put, because the count lives in the shared Pinia store, not in the
component. Toggling a task on Extension B updates its unchecked count in the
panel the same way. This was verified with a headless-browser test, not just
inferred from the code.

## A non-obvious Module Federation gotcha (and why the host has one hardcoded string)

`@originjs/vite-plugin-federation`'s dynamic-remote mechanism is: import
`__federation_method_setRemote` / `__federation_method_getRemote` from the
virtual module `'virtual:__federation__'` (see `loadExtensions.js`), then
call `setRemote` with a URL discovered at runtime instead of relying on the
plugin's normal build-time `remotes: { name: 'url' }` map.

Getting this working reliably required two fixes discovered by actually
running the built output in a browser, not just inspecting `vite build`
output:

- **Bundler**: this project pins `vite@^5` (classic Rollup-based) rather
  than the newer default. Vite 8's bundler (Rolldown) doesn't run this
  plugin's code-generation pass the way it expects, and the symptom is subtle
  — the build succeeds, but the shared-module runtime throws
  `ReferenceError: __rf_placeholder__shareScope is not defined` at runtime.
- **Host `remotes` config**: `host/vite.config.js` declares one *unused*
  placeholder remote (`__unused_placeholder__`, pointing at an invalid URL
  that's never fetched). This looks like it defeats the "fully dynamic, no
  hardcoding" goal, but it doesn't — every real remote is still registered
  entirely at runtime via `setRemote`. It exists only because the plugin
  decides internally whether a build is a federation "host" by checking
  `remotes.length > 0`; an empty `remotes: {}` satisfies the plugin's
  earlier "were remotes configured at all" check but fails this length
  check, which silently skips the code-generation pass that makes
  `virtual:__federation__` work at all (same
  `__rf_placeholder__shareScope` error, this time from a different chunk).

Both are documented with inline comments at the point they matter
(`host/vite.config.js`, `host/src/extensions/loadExtensions.js`).

## CORS

- **Production** (after `scripts/build.sh`): the host, the API, and every
  extension bundle are served by the same `dotnet` process on the same
  origin. CORS is never exercised.
- **Dev** (`npm run dev` inside `src/host`, separately from `dotnet run`):
  the host runs on Vite's dev server (`:5173`) while the backend runs on
  `:5080` — different origins. `host/.env.development` points the dev host
  at `http://localhost:5080`, and the backend's `DevClients` CORS policy
  (`src/backend/Program.cs`, active only when `ASPNETCORE_ENVIRONMENT=Development`)
  allows that origin for both the `GET /api/extensions` fetch and the SSE
  `EventSource` connection. Extensions are *not* run from their own dev
  servers in this flow — they still need to be built into
  `wwwroot/apps/extensions/` for the discovery scan to find them; only the
  host benefits from its own dev server for UI iteration.

## HMR: what actually works, verified empirically

Short answer: **the host has full HMR for its own code, and each extension
has full HMR when run on its own dev server — but an extension loaded *into*
the host via Module Federation does not currently get live HMR.** This was
tested directly (edit a file, watch the running browser tab, no reload)
rather than inferred from the plugin's docs, because the earlier
`__rf_placeholder__shareScope` bug was proof that this plugin's actual
behavior and its apparent/documented behavior can diverge.

**1. Host's own code — HMR works.** With `cd src/host && npm run dev`,
editing `App.vue`, `router.js`, a view, etc. patches the running page in
place. Verified: edited `App.vue`'s `<h1>` while a Playwright-controlled tab
was open, watched the DOM text update with **zero page navigations** and a
`[vite] hot updated: /src/App.vue` console line.

**2. An extension's own code, run standalone — HMR works, and Pinia state
survives the patch.** With `cd src/extensions/extension-a && npm run dev`,
editing `ExtensionApp.vue` patches the running preview in place. Verified
more strongly than the host case: clicked the counter to 3, edited the
`<h2>` heading text, and after the HMR patch the heading showed the new text
**while the counter still read "Clicks: 3"** — proof it was a real HMR
module patch (which only replaces the changed module, `ExtensionApp.vue`,
leaving `store.js`'s in-memory state untouched) rather than a full reload
(which would have reset Pinia's state to 0).

**3. An extension's code, as loaded by the host via federation — no HMR,
and not even a plain reload picks it up.** This is the case that matters for
the actual dynamic-loading feature, and it's the one with a real limitation.
Verified directly: with the host's dev server running and Extension A
mounted (loaded from the backend's manifest, i.e. from the *built*
`wwwroot/apps/extensions/extension-a/remoteEntry.js`), editing
`extension-a/src/ExtensionApp.vue` had **no effect** on the running host tab
— not immediately (no HMR), and not even after a full `page.reload()` of the
host. The reload result is the important data point: it proves this isn't
"HMR doesn't propagate but a refresh would work" — the host genuinely has no
connection to extension-a's live source at all in this flow. It re-reads the
manifest and re-fetches `remoteEntry.js`, but that file on disk is still the
old build until you rebuild extension-a.

Why: our dynamic-discovery design is deliberately "discover and load
*built* bundles from a folder" (that's what makes `GET /api/extensions`
possible at all — it scans `wwwroot/apps/extensions/*/remoteEntry.js`, real
files on disk). `@originjs/vite-plugin-federation` does ship a separate
dev-mode code path (visible in its source as `originjs:remote-development`)
intended for a host to consume a remote straight from *another* Vite dev
server rather than a static build — but confirmed by directly `curl`-ing it,
an extension's own dev server (`:5174`) doesn't serve anything at
`/remoteEntry.js` in dev mode (Vite's SPA fallback returns `index.html`
there instead); reaching that dev-mode path requires the host to reference a
different, internal dev-server URL shape than the one our manifest-driven
`setRemote(url)` calls use. Wiring that up would mean the host's dynamic
remote registration would need to special-case "is this extension currently
running its own dev server" — a real architecture change, not a config
tweak, and one that would only help local development, since production
always loads built bundles anyway. Given the core ask here was **dynamic
discovery of built extensions**, this project doesn't build that wiring, but
happy to if you want live cross-remote HMR for extension development — it's
a legitimate, separate feature.

**Practical dev workflow this implies**: iterate on an extension using its
own `npm run dev` (full HMR, fast). When you want to see it inside the host,
run `npm run build` for that extension and either restart the backend or,
if it's already running, let the `FileSystemWatcher`'s SSE push (or a
manual browser refresh) pick up the new build.

## Running it

### Release build (recommended way to see the whole system working)

```bash
./scripts/build.sh
dotnet run --project src/backend --urls http://localhost:5080
```

Open `http://localhost:5080/` — the sidebar should show "Extension A" and
"Extension B", both loaded at runtime from `wwwroot/apps/extensions/`.

### Iterating on the host UI against a pre-built backend

```bash
./scripts/build.sh                                    # at least once, so extensions exist
dotnet run --project src/backend --urls http://localhost:5080 &
cd src/host && npm run dev                             # http://localhost:5173
```

### Iterating on an extension in isolation

```bash
cd src/extensions/extension-a && npm run dev            # http://localhost:5174
```

This renders the extension's `ExtensionApp.vue` directly (via `App.vue`'s
standalone preview harness), without the host or backend running at all.

## Adding a third extension manually

No code changes to the host or backend are required.

1. Copy `src/extensions/extension-a` to `src/extensions/extension-c` (or
   scaffold a fresh Vite + Vue project).
2. In its `vite.config.js`, change the federation `name` to something unique
   (e.g. `extensionC`) — everything else (`exposes`, `shared`, `build`
   options) can stay identical.
3. In `src/extension.js`, change `id`, `label`, and `routePath` to unique
   values (a `routePath` collision with an existing extension will silently
   shadow one of them in vue-router). If it has its own state, give it its
   own `store.js` (`defineStore('extension-c', {...})` — the store id must
   also be unique) with a `summary` getter, and point `useStore` at it; the
   host's status panel will pick it up automatically. If it has no state
   worth showing, just omit `useStore` from the descriptor — the panel
   filters those out.
4. Build it (`npm run build`) and copy its `dist/` contents into
   `src/backend/wwwroot/apps/extensions/extension-c/` — or just re-run
   `./scripts/build.sh`, which picks up any folder under `src/extensions/`
   automatically.
5. With the backend already running, the `FileSystemWatcher` notices the new
   folder and pushes an SSE event — the sidebar gains "Extension C" without a
   page reload. (If the backend isn't running yet, it'll appear as soon as
   you start it, no code change needed either way.)

## Known deviations from a from-scratch spec

- **.NET 10, not .NET 8**: this dev container only has the .NET 10 SDK/
  runtime installed. The Minimal API code is unaffected — nothing here uses
  a .NET 8-only feature.
- **`npm audit` flags a moderate/high advisory** in `vite@5.4.21`'s bundled
  `esbuild` (a dev-server-only issue: a malicious website can read responses
  from Vite's dev server if you visit it while `npm run dev` is running).
  It doesn't affect the production build/backend at all. The fix
  (`npm audit fix --force`) upgrades to Vite 8, which is exactly the
  bundler-compatibility problem documented above — this is a deliberate
  tradeoff for a local educational PoC, not something to carry into a real
  deployment without revisiting.
