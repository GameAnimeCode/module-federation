# Build a federated app

Back to the [README](../README.md).

How this project is constructed, in the order you would build it. Every step
links to the file it describes, so this doubles as a source map.

Assumed stack: Vue 3, Vite 8, `@module-federation/vite`, a .NET Minimal API as
the static host and discovery service.

## Step 0: pick the boundary before writing config

The single most important decision is **what a remote exposes**. Exposing a
`.vue` component works, but the host then has to know the component's name, its
route, its label, and how to read its state, all of which forces host code
changes for every remote.

This project exposes a **descriptor object** instead:

```js
// src/extensions/extension-a/src/extension.js
import ExtensionApp from "./ExtensionApp.vue";
import { useExtensionAStore } from "./store.js";

export default {
  id: "extension-a",
  label: "Extension A",
  routePath: "/ext/extension-a",
  component: ExtensionApp,
  useStore: useExtensionAStore,
};
```

Both extensions expose exactly this shape
([extension-a](../src/extensions/extension-a/src/extension.js),
[extension-b](../src/extensions/extension-b/src/extension.js)), which is what
makes them interchangeable from the host's point of view. The remote carries
its own identity, its own route, and its own state accessor. The host stays
generic.

Design this contract first. Everything below follows from it.

## Step 1: the remote

Install the plugin and expose the descriptor. From
[`extension-b/vite.config.js`](../src/extensions/extension-b/vite.config.js):

```js
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { federation } from "@module-federation/vite";

export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: "extension-b",
      filename: "remoteEntry.js",
      exposes: {
        "./Extension": "./src/extension.js",
      },
      shared: {
        vue: { singleton: true },
        pinia: { singleton: true },
      },
      dts: false, // plain JS project, no tsconfig.json
    }),
  ],
  server: {
    port: 5175, // fixed, so it never collides with the host
    cors: true,
    origin: "http://localhost:5175",
  },
});
```

Three things to get right:

- **`name`** is the remote's identity in the federation runtime. For a
  declarative remote it must match the host's `remotes` key.
- **`shared`** must list every package whose module-level state crosses the
  boundary. Missing `pinia` here means the remote bundles its own copy and
  `useStore()` fails with _"no active Pinia"_.
- **`exposes`** points at the descriptor module, not the `.vue` file.

The remote's own `main.js` and `App.vue`
([example](../src/extensions/extension-a/src/App.vue)) exist only as a
standalone preview harness. The host never runs them, which is why
`createPinia()` lives in `main.js` and not in `store.js`: in the federated
path, Pinia comes from the host.

## Step 2: the store, with a generic read surface

```js
// src/extensions/extension-a/src/store.js
export const useExtensionAStore = defineStore("extension-a", {
  state: () => ({ count: 0 }),
  getters: {
    summary: (state) => `${state.count} click${state.count === 1 ? "" : "s"}`,
  },
  actions: {
    increment() {
      this.count++;
    },
  },
});
```

The `summary` getter is the second half of the descriptor contract. It lets the
host render a status line for any extension without knowing what that extension
stores. The store id must be unique across all extensions.

## Step 3: the host

Two jobs: create exactly one Pinia instance, and set up federation.

```js
// src/host/src/main.js
const app = createApp(App);
app.use(createPinia()); // the one instance, shared with every remote
await initExtensionRegistry(router); // must resolve before app.use(router)
app.use(router);
app.mount("#app");
```

The `await` matters. Dynamic routes are added inside
`initExtensionRegistry()`; if the router's initial navigation runs first, a
deep link to an extension resolves against an incomplete route table and lands
on the catch-all.

Host federation config, from [`host/vite.config.js`](../src/host/vite.config.js):

```js
federation({
  name: "host",
  remotes: {}, // empty in production, see step 4
  shared: {
    vue: { singleton: true },
    "vue-router": { singleton: true },
    pinia: { singleton: true },
  },
  dev: { remoteHmr: true },
  dts: false,
});
```

A host that loads **only** dynamic remotes still needs this block, for the
`shared` singletons. `remotes` can be empty, and in this project's production
build it is.

## Step 4: wire up a declarative remote (optional, for live HMR in dev)

Only worth doing for a remote you actively develop, and worth confining to the
dev server. This project declares one, and only when Vite runs as a dev server:

```js
const isDev = command === "serve";

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
```

Then load it through a **literal** `import()`, in
[`declarativeExtensions.js`](../src/host/src/extensions/declarativeExtensions.js):

```js
export const declarativeRoutes = [
  {
    path: "/ext/extension-a",
    name: "extension-a",
    component: () =>
      import("extension-a/Extension").then(
        (mod) => (mod.default ?? mod).component,
      ),
  },
];
```

The literal string is load-bearing. The plugin rewrites `import(...)` call
sites at build time; a `loadRemote()` call is invisible to that transform and
throws `#RUNTIME-004`.

**That literal is also why the module cannot simply be branched on.** With no
declared remote, the specifier does not resolve and a production build fails.
So the whole module is swapped at the resolver:

```js
resolve: {
  alias: {
    "@declarative-extensions": isDev
      ? ".../declarativeExtensions.js"
      : ".../declarativeExtensions.prod.js",
  },
},
```

The [stub](../src/host/src/extensions/declarativeExtensions.prod.js) exports
the same three names with empty values, so
[`router.js`](../src/host/src/router.js), [`App.vue`](../src/host/src/App.vue),
and [`useExtensionRegistry.js`](../src/host/src/extensions/useExtensionRegistry.js)
work unchanged and the dynamic registry ends up owning every extension. See
[HMR approaches](./hmr-approaches.md#how-the-declarative-path-is-kept-out-of-production)
for why an alias beats an `import.meta.env.DEV` guard here.

Skip this step entirely if you can live with the rebuild-and-swap loop. It is
the only part of this project that needs two code paths.

## Step 5: wire up dynamic loading

Register by URL and import by name, in
[`loadExtensions.js`](../src/host/src/extensions/loadExtensions.js):

```js
import { registerRemotes, loadRemote } from "@module-federation/runtime";

registerRemotes([{ name: manifestEntry.name, entry: url, type: "module" }], {
  force: true,
});
const remoteModule = await loadRemote(`${manifestEntry.name}/Extension`);
return remoteModule.default ?? remoteModule;
```

`type: 'module'` is required; the runtime default of `'var'` treats
`remoteEntry.js` as a classic script and throws.

Where the URL comes from, how changes are detected, and how a rebuilt remote is
swapped in are covered in [dynamic discovery](./dynamic-discovery.md).

## Step 6: the backend

A Minimal API doing three things
([`Program.cs`](../src/backend/Program.cs)):

```csharp
app.UseDefaultFiles();
app.UseStaticFiles();            // serves the host and every remoteEntry.js
app.MapGet("/api/extensions", ...);        // the manifest
app.MapGet("/api/extensions/stream", ...); // SSE change notifications
app.MapFallbackToFile("index.html");       // SPA fallback for vue-router
```

One ordering detail: `wwwroot` may not exist on a fresh checkout, and
`WebApplication` reads its `WebRootFileProvider` from disk at
`CreateBuilder()` time. The directory has to be created **before** the builder
runs, or static files stay broken even after the folder appears.

## Step 7: dev versus production origins

![dev.sh and build.sh](./assets/dev-and-build.svg)

In production, [`build.sh`](../scripts/build.sh) copies everything into
`wwwroot`, so host, API, and bundles share one origin and CORS is never
exercised.

In dev they do not. The host runs on `:5173`, the backend on `:5080`:

- [`host/.env.development`](../src/host/.env.development) sets
  `VITE_API_BASE_URL=http://localhost:5080`, read by
  [`config.js`](../src/host/src/config.js) and empty in production.
- The backend's `DevClients` CORS policy allows `:5173`, and is only applied
  when `ASPNETCORE_ENVIRONMENT=Development`.
- Extension A's dev loading never touches the backend. The host's browser tab
  fetches `http://localhost:5174` directly, which is why that project's
  `vite.config.js` sets `cors: true` and a fixed `origin`.

## Adding a third extension

### Dynamically (no host code changes)

1. Copy [`src/extensions/extension-b`](../src/extensions/extension-b) to
   `src/extensions/extension-c`.
2. In `vite.config.js`, change `name` to `'extension-c'` and pick a free dev
   `port`.
3. In `src/extension.js`, change `id`, `label`, and `routePath`. Give it its
   own `store.js` with a unique `defineStore` id and a `summary` getter.
4. Run `./scripts/build.sh`, which picks up any folder under `src/extensions/`
   automatically. Or build it alone and copy `dist/` into
   `src/backend/wwwroot/apps/extensions/extension-c/`.
5. With the backend running, the `FileSystemWatcher` fires, SSE pushes, and the
   sidebar gains "Extension C" without a page reload.
6. For the watch workflow, add to its `package.json`:
   ```json
   "dev:watch": "vite build --watch --outDir ../../backend/wwwroot/apps/extensions/extension-c"
   ```
   and add it to [`scripts/dev.sh`](../scripts/dev.sh)'s process list.

### Also giving it live HMR in dev (optional, additive)

The steps above already make it work everywhere. This adds the dev-only fast
loop on top, and changes nothing about production.

1. Fix its dev port in `vite.config.js` (e.g. `5176`).
2. Add it to the host's `vite.config.js` `remotes` map, inside the `isDev`
   branch, pointing at that port.
3. In [`declarativeExtensions.js`](../src/host/src/extensions/declarativeExtensions.js):
   add `'extension-c'` to `DECLARATIVE_EXTENSION_NAMES`, push a route onto
   `declarativeRoutes`, and add a metadata entry to
   `declarativeExtensionsMetadata`. Both `import()` calls must use the literal
   specifier `'extension-c/Extension'`.
4. Leave `declarativeExtensions.prod.js` alone. It stays empty, which is what
   keeps production dynamic.
5. Add its dev server to [`scripts/dev.sh`](../scripts/dev.sh).

`dev: { remoteHmr: true }` is already set on the host, so nothing further is
needed there. Adding the name to `DECLARATIVE_EXTENSION_NAMES` is what stops
the dynamic registry from also loading it in dev and fighting the static route.

## Before a second team writes an extension

The conventions above hold in this repo because one author wrote both
extensions. Once extensions arrive from teams you do not control, the naming,
store, and token contracts need enforcing, and the collision failure modes are
silent. See [the extension contract](./extension-contract.md).

## Checklist for a new federated project

- [ ] Descriptor contract designed before any config is written
- [ ] Every stateful package declared `singleton: true` in **all** configs
- [ ] Exactly one `createPinia()` (or equivalent), in the host
- [ ] Remotes expose the descriptor module, not raw components
- [ ] Store ids unique across remotes
- [ ] Scoped styles in remotes; they share the host's DOM
- [ ] Dynamic loads wrapped in `try`/`catch` per remote
- [ ] A catch-all route for deep links to removed remotes
- [ ] `type: 'module'` on every `registerRemotes()` call
- [ ] Cache busting for any entry file that is not content-hashed
- [ ] Dev CORS policy scoped to `Development` only
