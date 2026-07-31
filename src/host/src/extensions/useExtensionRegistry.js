// Reactive registry of dynamically discovered extensions, synced with the
// backend's GET /api/extensions manifest. In production this owns every
// extension; in dev it owns everything except the declarative ones.
// Module-level state, since there's exactly one host instance per page.
import { reactive, readonly } from "vue";
import { DECLARATIVE_EXTENSION_NAMES } from "@declarative-extensions";
import { API_BASE_URL } from "../config.js";
import { loadExtension } from "./loadExtensions.js";

// Already routed statically by router.js; loading them here would fight that
// route. Empty outside dev.
const declarativeNames = new Set(DECLARATIVE_EXTENSION_NAMES);

const state = reactive({
  extensions: [], // [{ id, label, routePath, component, useStore, approach, _manifestName, _lastModified }]
  loading: true,
  error: null,
});

let router = null;
let eventSource = null;
// manifest name -> lastModifiedUnixMs at last successful load.
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
    approach: "dynamic", // drives the sidebar badge, see App.vue
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
  // No "unload a remote" API exists; dropping the route is enough to make
  // it unreachable (a stale deep link falls through to router.js's catch-all).
  router.removeRoute(extension.id);
}

/** Re-imports a changed extension and mutates its descriptor in place (keeps reactivity, avoids flicker). */
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
  // addRoute() doesn't refresh an already-resolved route.matched, so force
  // a re-resolve if the user is currently on this extension's route.
  if (router.currentRoute.value.path === descriptor.routePath) {
    router.replace(router.currentRoute.value.fullPath);
  }
}

/** Reconciles dynamically-loaded extensions against the current backend manifest: loads new ones, drops missing ones, hot-swaps changed ones. */
async function reconcile() {
  let manifest;
  try {
    manifest = (await fetchManifest()).filter(
      (entry) => !declarativeNames.has(entry.name),
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
 * Fetches the manifest, registers every dynamic extension's route, then
 * starts the SSE subscription. Callers must await this before
 * `app.use(router)`, or the router's initial navigation can resolve against
 * an incomplete route table (see main.js).
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
 * Returns the read-only dynamic-extension registry state. Calls
 * initExtensionRegistry() defensively if it hasn't run yet (see main.js).
 * @param {import('vue-router').Router} activeRouter
 */
export function useExtensionRegistry(activeRouter) {
  if (!initialized) {
    initExtensionRegistry(activeRouter);
  }
  return readonly(state);
}
