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

/**
 * Initializes (once) and returns the read-only extension registry state.
 * @param {import('vue-router').Router} activeRouter
 */
export function useExtensionRegistry(activeRouter) {
  if (!router) {
    router = activeRouter
    reconcile().then(connectToChangeStream)
  }
  return readonly(state)
}
