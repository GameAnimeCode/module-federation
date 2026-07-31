# Dynamic discovery

Back to the [README](../README.md).

This is how the application actually loads extensions: the host has no
build-time reference to them at all. No `remotes` entry, no `import()`, no
route. It learns an extension exists by asking the backend, and learns it
changed by being told.

In production every extension comes in this way. In the dev server, everything
except the one declarative remote does. See
[HMR approaches](./hmr-approaches.md) for why that exception exists.

![Dynamic discovery and hot-swap sequence](./assets/dynamic-discovery.svg)

## 1. The backend publishes a manifest

[`GET /api/extensions`](../src/backend/Program.cs) scans
`wwwroot/apps/extensions/*/` for any folder containing a `remoteEntry.js`:

```json
[
  {
    "name": "extension-b",
    "entryUrl": "/apps/extensions/extension-b/remoteEntry.js",
    "lastModifiedUnixMs": 1753900000000
  }
]
```

The rule is "a folder with a `remoteEntry.js` in it." Adding a new extension
requires **zero backend code changes**; the API discovers it by convention.

`lastModifiedUnixMs` is the `remoteEntry.js` file's mtime. It is the version
token that makes hot-swap possible (step 5).

## 2. The host loads each entry

[`useExtensionRegistry.js`](../src/host/src/extensions/useExtensionRegistry.js)
fetches the manifest at startup and hands each new entry to
[`loadExtensions.js`](../src/host/src/extensions/loadExtensions.js), which
registers the remote by URL and imports its exposed module:

```js
registerRemotes([{ name: manifestEntry.name, entry: url, type: "module" }], {
  force: true,
});

const remoteModule = await loadRemote(`${manifestEntry.name}/Extension`);
return remoteModule.default ?? remoteModule;
```

`type: 'module'` is required. The runtime's default is `'var'`, which loads
`remoteEntry.js` as a classic script and throws
`Cannot use import statement outside a module` against a real ES module.

## 3. The host installs a route

Each loaded module returns the descriptor contract every extension exposes:

```
{ id, label, routePath, component, useStore }
```

The host adds a sidebar entry and a route, without knowing anything specific
about this extension:

```js
router.addRoute({
  path: descriptor.routePath,
  name: descriptor.id,
  component: descriptor.component,
});
```

`initExtensionRegistry()` is awaited **before** `app.use(router)` in
[`main.js`](../src/host/src/main.js). Otherwise the router's initial navigation
can resolve against an incomplete route table and land on the catch-all.

## 4. The backend pushes changes

`GET /api/extensions/stream` is a Server-Sent Events endpoint. The backend
watches `wwwroot/apps/extensions` with a `FileSystemWatcher`, debounced 400 ms
so a multi-file rebuild fires one event, and emits `extensions-changed` on any
add, remove, rename, or rewrite. A comment-only keep-alive goes out every 15
seconds so idle connections are not dropped by intermediate proxies.

The host's `EventSource` listener re-runs the same reconcile step used at
startup. `EventSource` retries dropped connections on its own.

## 5. Reconcile: add, remove, hot-swap

`reconcile()` compares the manifest against what is already loaded and sorts
each entry into one of three cases, using `lastModifiedUnixMs` to tell
"never seen" from "seen but rebuilt since" from "unchanged."

**New.** Load it, add the route, add the sidebar entry.

**Gone.** Drop the sidebar entry and call `router.removeRoute(id)`. Module
Federation has no supported "unload a remote" API, so the already-fetched JS
stays cached in the tab, but it is no longer reachable through the UI. A stale
deep link resolves to the router's catch-all
[`ExtensionUnavailableView`](../src/host/src/views/ExtensionUnavailableView.vue)
rather than a router error or a blank page.

**Changed.** Re-import with a cache-busting query string and mutate the
existing descriptor in place:

```js
const url =
  bust === undefined ? absoluteEntryUrl : `${absoluteEntryUrl}?t=${bust}`;
```

The query string is necessary because the federation runtime's caches, and the
browser's own `import()` cache, are keyed by the exact URL string, and
`remoteEntry.js` is **not** content-hashed the way the chunks it references
are. Same URL, same cached module, no matter what changed on disk.

A load failure is caught per extension and logged, so one bad remote cannot
take down the host shell.

## The subtle part: `addRoute()` does not refresh what is rendered

`router.addRoute()` only affects _future_ navigations. It does not
retroactively refresh the `route.matched` that `<router-view>` is currently
rendering from.

If the user is sitting on the swapped extension's route, the underlying state
updates correctly but the page silently keeps rendering the old component. Two
things fix it together:

```js
// useExtensionRegistry.js: force a re-resolve of the current route
if (router.currentRoute.value.path === descriptor.routePath) {
  router.replace(router.currentRoute.value.fullPath);
}
```

```vue
<!-- App.vue: key the view on the version so Vue actually remounts -->
<router-view :key="routeViewKey" />
```

where `routeViewKey` is `` `${active.id}:${active._lastModified}` `` for the
active dynamic extension. See [`App.vue`](../src/host/src/App.vue).

## Keeping the host generic

The host's status panel never reads `store.count` or `store.tasks`. Every
extension's store exposes a `summary` getter returning a plain string, and the
host only ever reads `ext.useStore().summary`:

```js
const extensionStates = computed(() =>
  allExtensions.value
    .filter((ext) => typeof ext.useStore === "function")
    .map((ext) => {
      const store = ext.useStore();
      return { id: ext.id, label: ext.label, summary: store.summary };
    }),
);
```

A third dynamic extension with entirely different state needs no host change,
as long as its store exposes a `summary` getter too, and as long as its `id`,
`routePath`, and store id collide with nothing already loaded. Nothing checks
that second part; see [the extension contract](./extension-contract.md).

## Trade-offs of this design

- **Manifest lag.** The host sees a change only once the backend's watcher
  fires. Treat the 400 ms debounce as a tuning knob rather than a bound.
- **mtime as a version token** is fine for a single-server demo and wrong for a
  CDN or multi-instance deployment, where two servers can disagree about a
  file's timestamp. Production wants a content hash in the `remoteEntry.js`
  filename, or an explicit version field in the manifest.
- **No unload.** `router.removeRoute()` reclaims the route. The extension's
  already-fetched JavaScript stays in the tab, so a long-lived session that has
  seen many extensions keeps accumulating their code.
- **No integrity checking.** The host executes whatever `remoteEntry.js` the
  manifest points at, with its own full privileges. That is fine for
  first-party bundles and unacceptable for untrusted plugins, which need an
  iframe or a worker instead.
- **SSE holds a connection per tab.** At scale, polling behind a cache header
  or multiplexing over one shared WebSocket may be cheaper.

## Adding a third extension, dynamically

No host code changes are required. See
[Build a federated app](./build-a-federated-app.md#adding-a-third-extension).
