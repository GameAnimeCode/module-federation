// Reactive registry of dynamically discovered extensions, i.e. extension B,
// kept in sync with the backend's GET /api/extensions manifest. Extension A
// (the declarative one, see router.js and declarativeExtensionA.js) is
// deliberately excluded: it already has a static route and doesn't need
// discovering, loading, or swapping through this mechanism. Module-level
// (not per-component) state is intentional: there is exactly one host app
// instance per page, so a singleton registry avoids threading this through
// provide/inject for a PoC of this size.
//
// Each manifest entry carries `lastModifiedUnixMs` (the remoteEntry.js
// file's mtime). An already-loaded extension whose mtime has changed since
// we loaded it gets re-imported (via a cache-busted URL, see
// loadExtensions.js) and hot-swapped in place rather than ignored. Paired
// with `npm run dev:watch` in extension-b (vite build --watch straight into
// wwwroot/apps/extensions/), this is what makes "save extension B's file,
// see it update in the running host" work without a host reload. See
// README.md's HMR section for why this rebuild-and-swap approach was chosen
// for this extension instead of the declarative one's live in-place patching.
import { reactive, readonly } from "vue";
import { API_BASE_URL } from "../config.js";
import { loadExtension } from "./loadExtensions.js";

// The backend's discovery scan finds every built extension, including
// extension A: it has no reason to special-case anything, and its
// "discoverable" property is still useful (the sidebar could show it from
// here too). The host is what draws the line: names in this set are handled
// declaratively elsewhere and must never be loaded or routed through this
// dynamic path, or they'd fight the static route already registered for
// them in router.js.
const DECLARATIVE_EXTENSION_NAMES = new Set(["extension-a"]);

const state = reactive({
  extensions: [], // [{ id, label, routePath, component, useStore, _manifestName, _lastModified }]
  loading: true,
  error: null,
});

let router = null;
let eventSource = null;
// manifest name -> lastModifiedUnixMs recorded at last successful load, so
// reconcile() can tell "never seen" from "seen, but changed since" from
// "seen, unchanged".
const loadedVersions = new Map();

async function fetchManifest() {
  const response = await fetch(`${API_BASE_URL}/api/extensions`);
  if (!response.ok) {
    throw new Error(
      `GET /api/extensions failed: ${response.status} ${response.statusText}`,
    );
  }
  return response.json();
}

function addExtension(entry, descriptor) {
  loadedVersions.set(entry.name, entry.lastModifiedUnixMs);
  state.extensions.push({
    ...descriptor,
    _manifestName: entry.name,
    _lastModified: entry.lastModifiedUnixMs,
  });
  router.addRoute({
    path: descriptor.routePath,
    name: descriptor.id,
    component: descriptor.component,
  });
}

function removeExtension(extension) {
  loadedVersions.delete(extension._manifestName);
  state.extensions = state.extensions.filter((entry) => entry !== extension);
  // Module Federation has no supported "unload this remote" API, so the
  // already-fetched JS stays cached in the tab. Dropping the vue-router
  // route and sidebar entry is enough to make the extension unreachable: a
  // stale deep link to it now resolves via the app's catch-all route (see
  // router.js) instead of a router error.
  router.removeRoute(extension.id);
}

/**
 * Re-imports an already-loaded extension whose underlying file changed and
 * replaces its descriptor fields in place (mutating the existing reactive
 * array entry, not removing + re-adding it, so App.vue's status panel and
 * sidebar link update reactively without flicker).
 */
function swapExtension(existing, entry, descriptor) {
  loadedVersions.set(entry.name, entry.lastModifiedUnixMs);
  Object.assign(existing, descriptor, {
    _lastModified: entry.lastModifiedUnixMs,
  });
  router.addRoute({
    path: descriptor.routePath,
    name: descriptor.id,
    component: descriptor.component,
  });
  // router.addRoute() only updates the route table used to resolve future
  // navigations; it does not retroactively refresh the already-resolved
  // `route.matched` that <router-view> is currently rendering from. If the
  // user is sitting on this exact extension's route right now, a plain
  // addRoute() call is invisible and the page keeps rendering the stale
  // component. Re-resolving the current path in place (a same-URL
  // router.replace) is what makes <router-view> pick up the freshly
  // registered component.
  if (router.currentRoute.value.path === descriptor.routePath) {
    router.replace(router.currentRoute.value.fullPath);
  }
}

/** Reconciles dynamically-loaded extensions against the current backend manifest: loads new ones, drops missing ones, hot-swaps changed ones. */
async function reconcile() {
  let manifest;
  try {
    manifest = (await fetchManifest()).filter(
      (entry) => !DECLARATIVE_EXTENSION_NAMES.has(entry.name),
    );
    state.error = null;
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
    state.loading = false;
    return;
  }

  const manifestNames = new Set(manifest.map((entry) => entry.name));

  for (const extension of [...state.extensions]) {
    if (!manifestNames.has(extension._manifestName)) {
      removeExtension(extension);
    }
  }

  for (const entry of manifest) {
    const knownVersion = loadedVersions.get(entry.name);

    if (knownVersion === undefined) {
      try {
        const descriptor = await loadExtension(entry);
        addExtension(entry, descriptor);
      } catch (err) {
        // One bad extension shouldn't take down the whole host: log and move on.
        console.error(`[extensions] failed to load "${entry.name}":`, err);
      }
      continue;
    }

    if (knownVersion !== entry.lastModifiedUnixMs) {
      const existing = state.extensions.find(
        (ext) => ext._manifestName === entry.name,
      );
      try {
        const descriptor = await loadExtension(entry, {
          bust: entry.lastModifiedUnixMs,
        });
        swapExtension(existing, entry, descriptor);
      } catch (err) {
        console.error(`[extensions] failed to hot-swap "${entry.name}":`, err);
      }
    }
  }

  state.loading = false;
}

function connectToChangeStream() {
  eventSource?.close();
  eventSource = new EventSource(`${API_BASE_URL}/api/extensions/stream`);
  eventSource.addEventListener("extensions-changed", () => {
    reconcile();
  });
  // EventSource retries transient connection drops on its own; nothing else
  // to wire up here for this PoC.
}

let initialized = false;

/**
 * Fetches the manifest and registers every currently-known dynamic
 * extension's route, then starts the SSE subscription. Callers (main.js)
 * must await this, and must call it before `app.use(router)` installs the
 * router, so every dynamic route already exists by the time vue-router
 * resolves the page's initial URL.
 *
 * Getting this ordering wrong is why a hard refresh or direct link to e.g.
 * /ext/extension-b used to land on the "Extension unavailable" catch-all:
 * router.addRoute() only affects future navigations, and vue-router's very
 * first navigation, to whatever URL the page loaded with, starts as soon as
 * the router is installed. If that happens before this function's fetch has
 * resolved, the initial navigation resolves against an incomplete route
 * table and never gets a second chance, even after the route shows up
 * moments later; the user had to manually re-navigate to trigger a new
 * navigation that finds it. Extension A's static route in router.js doesn't
 * have this problem, since it's never affected by this async registration.
 * @param {import('vue-router').Router} activeRouter
 * @returns {Promise<void>}
 */
export function initExtensionRegistry(activeRouter) {
  if (initialized) return Promise.resolve();
  initialized = true;
  router = activeRouter;
  return reconcile().then(connectToChangeStream);
}

/**
 * Returns the read-only dynamic-extension registry state. Assumes
 * initExtensionRegistry() has already been called and awaited (see
 * main.js), but calls it defensively if not, degrading gracefully instead
 * of throwing if used some other way.
 * @param {import('vue-router').Router} activeRouter
 */
export function useExtensionRegistry(activeRouter) {
  if (!initialized) {
    initExtensionRegistry(activeRouter);
  }
  return readonly(state);
}
