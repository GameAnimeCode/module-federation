// Reactive registry of currently-loaded extensions, kept in sync with the
// backend's GET /api/extensions manifest. Module-level (not per-component)
// state is intentional: there is exactly one host app instance per page, so
// a singleton registry avoids threading this through provide/inject for a
// PoC of this size.
import { reactive, readonly } from 'vue'
import { API_BASE_URL } from '../config.js'
import { loadExtension } from './loadExtensions.js'

const state = reactive({
  extensions: [], // [{ id, label, routePath, component, _manifestName }]
  loading: true,
  error: null,
})

let router = null
let eventSource = null
const loadedManifestNames = new Set()

async function fetchManifest() {
  const response = await fetch(`${API_BASE_URL}/api/extensions`)
  if (!response.ok) {
    throw new Error(`GET /api/extensions failed: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

function addExtension(manifestName, descriptor) {
  loadedManifestNames.add(manifestName)
  state.extensions.push({ ...descriptor, _manifestName: manifestName })
  router.addRoute({
    path: descriptor.routePath,
    name: descriptor.id,
    component: descriptor.component,
  })
}

function removeExtension(extension) {
  loadedManifestNames.delete(extension._manifestName)
  state.extensions = state.extensions.filter((entry) => entry !== extension)
  // Module Federation has no supported "unload this remote" API — the
  // already-fetched JS stays cached in the tab. Dropping the vue-router
  // route and the sidebar entry is enough to make the extension
  // unreachable, which is what "the UI adapts without crashing" means here;
  // a stale deep link to it now resolves via the app's catch-all route
  // (see router.js) instead of a router error.
  router.removeRoute(extension.id)
}

/** Reconciles loaded extensions against the current backend manifest: loads new ones, drops missing ones. */
async function reconcile() {
  let manifest
  try {
    manifest = await fetchManifest()
    state.error = null
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err)
    state.loading = false
    return
  }

  const manifestNames = new Set(manifest.map((entry) => entry.name))

  for (const extension of [...state.extensions]) {
    if (!manifestNames.has(extension._manifestName)) {
      removeExtension(extension)
    }
  }

  for (const entry of manifest) {
    if (loadedManifestNames.has(entry.name)) continue
    try {
      const descriptor = await loadExtension(entry)
      addExtension(entry.name, descriptor)
    } catch (err) {
      // One bad extension shouldn't take down the whole host — log and move on.
      console.error(`[extensions] failed to load "${entry.name}":`, err)
    }
  }

  state.loading = false
}

function connectToChangeStream() {
  eventSource?.close()
  eventSource = new EventSource(`${API_BASE_URL}/api/extensions/stream`)
  eventSource.addEventListener('extensions-changed', () => {
    reconcile()
  })
  // EventSource retries transient connection drops on its own; nothing else
  // to wire up here for this PoC.
}

let initialized = false

/**
 * Fetches the manifest and registers every currently-known extension's
 * route, then starts the SSE subscription. Callers (main.js) MUST await
 * this — and must call it before `app.use(router)` installs the router —
 * so that every dynamic route already exists by the time vue-router
 * resolves the page's initial URL.
 *
 * Getting this ordering wrong is why a hard refresh (or a direct link) to
 * e.g. /ext/extension-a used to land on the "Extension unavailable"
 * catch-all: router.addRoute() only affects *future* navigations, and
 * vue-router's very first navigation — to whatever URL the page loaded
 * with — starts as soon as the router is installed. If that happens before
 * this function's fetch has resolved, the initial navigation resolves
 * against an incomplete route table and never gets a second chance, even
 * after the route shows up moments later; the user had to manually
 * re-navigate (e.g. click the sidebar link) to trigger a *new* navigation
 * that finds it. Found via a direct-navigation test, not by inspection —
 * everything still "worked" as long as you only ever arrived at extension
 * routes by clicking a nav link after the app had already booted.
 * @param {import('vue-router').Router} activeRouter
 * @returns {Promise<void>}
 */
export function initExtensionRegistry(activeRouter) {
  if (initialized) return Promise.resolve()
  initialized = true
  router = activeRouter
  return reconcile().then(connectToChangeStream)
}

/**
 * Returns the read-only extension registry state. Assumes
 * initExtensionRegistry() has already been called (and awaited) — see
 * main.js — but calls it defensively if not, so this still degrades
 * gracefully (just without the ordering guarantee above) rather than
 * throwing if used some other way.
 * @param {import('vue-router').Router} activeRouter
 */
export function useExtensionRegistry(activeRouter) {
  if (!initialized) {
    initExtensionRegistry(activeRouter)
  }
  return readonly(state)
}
