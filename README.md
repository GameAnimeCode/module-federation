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
  dev.sh                    (branch hmr/latest-vite-federation) backend +
                             host dev server + both extensions each on their
                             own `vite dev` server, self-registering with
                             the backend
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

> **This is branch `hmr/latest-vite-federation`.** It replaces
> `@originjs/vite-plugin-federation` with `@module-federation/vite` (and
> upgrades to Vite 8, the actual latest) specifically to investigate whether
> a different, actively-maintained plugin could achieve true dev-to-dev
> HMR — see "Swapping the federation plugin" further down for what that
> plugin swap actually required and what it did and didn't solve. This
> section (the gotchas below) describes `master`'s plugin, not this
> branch's; skip to "Swapping the federation plugin" for this branch's own
> gotchas.

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

## Swapping the federation plugin: `@module-federation/vite`

`master`'s `@originjs/vite-plugin-federation` is pinned to `vite@^5` and its
dev-mode "expose"/"shared" plugins are empty stubs (see `hmr/dev-federation`'s
notes) — it hasn't shipped a release past `1.4.1`. `@module-federation/vite`
is the actively-maintained plugin from the Module Federation team itself,
explicitly declares `peerDependencies: { vite: "^5 || ^6 || ^7 || ^8" }`, and
its own `.d.ts` documents a `dev.remoteHmr` option with explicit Vue support.
This branch upgrades host + both extensions to Vite 8.2.0 (the actual
latest, not a compatibility-workaround pin) and swaps the plugin, to find
out whether that changes the HMR answer from `hmr/dev-federation`.

**What changed and worked immediately, verified in the production build:**

- Vite 8 (Rolldown-based) works with this plugin with **no bundler
  workaround** — none of the `__rf_placeholder__` class of bug from
  `@originjs/vite-plugin-federation` shows up here.
- The host has **zero static `remotes` config** — not even the one
  `__unused_placeholder__` entry `master` needs. Fully dynamic loading goes
  through the standalone `@module-federation/runtime` package
  (`registerRemotes` + `loadRemote`, see `loadExtensions.js`), which needs
  nothing declared in `vite.config.js` at all.
- Pinia's cross-remote singleton sharing (see above) works identically —
  verified with the same click-then-navigate-away test.

**One real gotcha, found the same way as the `__rf_placeholder__` one — by
running it, not reading the types**: `registerRemotes` defaults to
`type: 'var'` (load `remoteEntry.js` as a classic script exposing a global),
but every `remoteEntry.js` this project's Vite builds produce is a real ES
module. Loading it as a classic script throws `Cannot use import statement
outside a module` — the fix is passing `type: 'module'` explicitly on every
registration (see `loadExtensions.js`).

### The actual HMR investigation

This is the part that mattered. Three findings, each verified directly
rather than inferred from docs:

**1. Dev-mode remote serving is real here — unlike `@originjs/vite-plugin-federation`.**
`curl http://localhost:5174/remoteEntry.js` while `extension-a` runs
`vite dev` (no build at all) returns a genuine, functional ES module: real
`@module-federation/runtime` `init`/`loadRemote` wiring, plus an explicit
comment-documented shim for `__VUE_HMR_RUNTIME__`. This is the mechanism
`hmr/dev-federation` found completely absent in the older plugin
(`devExposePlugin`/`devSharedPlugin` were empty stubs there).

**2. The host's page opens separate HMR WebSocket connections to every
remote's dev server, automatically.** With host + both extensions running
`vite dev`, the browser console shows **three** independent
`[vite] connecting... connected.` pairs on a single page load — one for the
host's own dev server, one each for extension-a's and extension-b's. This
is exactly the "multiple HMR client" capability a naive assumption (mine,
in the earlier investigation) said would be the hard, unsolved part of true
cross-remote dev HMR. It's solved, automatically, by this plugin.

**3. Despite both of the above, editing a mounted extension's source does
not visually update the host without a manual reload — and the reason is
now precise, not "the feature doesn't exist."** Editing
`extension-a/src/ExtensionApp.vue` while it was mounted in the host
produced a real `[vite] hot updated: /src/ExtensionApp.vue` console line
(proof the update genuinely arrived and Vue's own HMR handling ran) — but
the DOM never changed, confirmed by watching for over 20 seconds, not a
timing issue. Digging further:

- `dev.remoteHmr`'s automatic patching is wired through the plugin's own
  import-transform, which recognizes the **literal call-site shape**
  `import('remoteName/exposedPath')` — the pattern in this plugin's own
  docs (`defineAsyncComponent(() => import("remote/remote-app"))`).
- Tried directly: `import('extension-a/Extension')` from host source threw
  `Failed to resolve import "extension-a/Extension"` at the Vite dev-server
  level — because that bare-specifier resolution requires the remote to be
  **statically declared** in the host's `federation({ remotes: {...} })`
  config, so the plugin's resolver knows about it at dev-server startup.
- This project's host has **zero static remotes** by design — everything
  goes through the runtime `registerRemotes`/`loadRemote` API instead, which
  is invisible to that transform. `import.meta.hot.on('vite:afterUpdate', …)`
  registered in the host's own component confirmed this directly: it never
  fired for a remote's update, because that update is being handled entirely
  inside the remote's own isolated HMR client instance, with no visible hook
  back into host-side code for a dynamically-registered remote.

**The conclusion this branch lands on**: `@module-federation/vite`'s
automatic HMR is real and works well for the officially-documented usage —
a host with statically-known remotes. It's fundamentally in tension with
*this* project's core design goal (a host with zero build-time knowledge of
any extension), not merely unimplemented for that case. A fully-dynamic
host and zero-effort in-place HMR patching are, with this plugin's current
API surface, mutually exclusive.

### What this branch actually ships instead

Given (3) above, this branch still gets a real, verified improvement over
`master` — just not full live-patching:

- Each extension's `vite.config.js` gained the same
  `devServerRegistrationPlugin` as `hmr/dev-federation` (self-registers its
  dev URL with the backend's `DevServerRegistry` on `vite dev` startup —
  see backend `Program.cs`).
- Unlike `hmr/dev-federation` (where this was display-only),
  `loadExtensions.js` here actually **loads from the registered `devUrl`**
  when one exists, via the same real `registerRemotes`/`loadRemote` API
  used for production.
- Net effect, verified: edit `extension-a/src/ExtensionApp.vue`, then just
  refresh the host tab (or load `/ext/extension-a` fresh, no reload of
  anything else needed) — the change is there immediately. **No build
  step at all** — not even the `vite build --watch` `hmr/rebuild-and-swap`
  needs — since the host is always fetching straight from the dev server's
  live module graph. What you don't get is the page updating itself while
  you're looking at it without that refresh.

## Development on this branch (`hmr/latest-vite-federation`)

```bash
./scripts/build.sh   # at least once, so extensions have something built to fall back to
./scripts/dev.sh
```

`dev.sh` starts, and cleans up together on Ctrl+C: the backend
(`Development`, `:5080`), the host's own Vite dev server (`:5173`), and
`extension-a` (`:5174`) / `extension-b` (`:5175`) each on their own
`vite dev` server. Open `http://localhost:5173/` — extensions with a
detected dev server show a `dev` badge in the sidebar (hover it for the
URL). Edit an extension's source, then refresh the host tab (or navigate to
its route fresh) to see the change — no rebuild needed.

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

> **This is branch `hmr/latest-vite-federation`.** Points 1 and 2 below
> (host's own HMR, an extension's own standalone HMR) are unaffected by the
> plugin swap and still true here. Point 3 (an extension loaded into the
> host) is superseded on this branch — see "Swapping the federation plugin"
> above for the full investigation with a different, actively-maintained
> plugin: still no full in-place patching, but for a much more precise
> reason, plus a genuine "edit and refresh, zero build step" improvement
> `master` doesn't have.

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
