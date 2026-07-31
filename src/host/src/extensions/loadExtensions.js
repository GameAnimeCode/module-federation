// This module is the one place that talks to the Module Federation runtime
// directly for *dynamically* discovered extensions — i.e. extension B. It
// deliberately has nothing to do with extension A, the declarative one (see
// router.js and declarativeExtensionA.js for that path) — this is the
// "no build-time knowledge" loading mechanism the rest of this project is
// about.
//
// `registerRemotes`/`loadRemote` are a real, standalone runtime API from
// `@module-federation/runtime` — usable exactly the same way whether this
// code is running from a `vite build` output or a `vite dev` server. The
// host's `federation()` plugin call (vite.config.js) auto-injects the
// one-time `init()` call for this runtime instance; we only ever call
// registerRemotes/loadRemote.
import { registerRemotes, loadRemote } from '@module-federation/runtime'
import { API_BASE_URL } from '../config.js'

/**
 * Registers one remote with the federation runtime by URL and imports its
 * exposed `./Extension` descriptor module.
 * @param {{ name: string, entryUrl: string }} manifestEntry - one entry from GET /api/extensions
 * @param {{ bust?: number | string }} [options] - pass a value that changes
 *   whenever the extension's underlying file changed (its manifest
 *   `lastModifiedUnixMs`) to force a fresh fetch + re-evaluation instead of
 *   getting the previously-loaded module back — see
 *   useExtensionRegistry.js's swapExtension().
 * @returns {Promise<{ id: string, label: string, routePath: string, component: object }>}
 */
export async function loadExtension(manifestEntry, { bust } = {}) {
  const absoluteEntryUrl = manifestEntry.entryUrl.startsWith('http')
    ? manifestEntry.entryUrl
    : `${API_BASE_URL}${manifestEntry.entryUrl}`
  // The federation runtime's internal caches (the browser's import() cache
  // included) are keyed by the exact URL string. Re-registering the same
  // remote name with an unchanged URL just returns the already-loaded
  // module; appending a cache-busting query param makes a genuinely new URL,
  // so both the runtime and the browser treat it as something to actually
  // (re-)fetch.
  const url = bust === undefined ? absoluteEntryUrl : `${absoluteEntryUrl}?t=${bust}`

  // `force: true` lets a manifest entry we've already registered be
  // re-registered instead of the runtime silently keeping the first
  // registration. `type: 'module'` is required, not optional — the
  // runtime's own default is `type: 'var'` (load remoteEntry.js as a
  // classic script exposing a global), but every remoteEntry.js this
  // project's Vite builds produce is a real ES module (`import`/`export`
  // statements); loading it as a classic script throws "Cannot use import
  // statement outside a module". Found empirically — the runtime's error
  // message names the resource but not this option.
  registerRemotes(
    [
      {
        name: manifestEntry.name,
        entry: url,
        type: 'module',
      },
    ],
    { force: true },
  )

  // The `remoteName/exposedPath` id format mirrors webpack Module
  // Federation's convention — `exposes: { './Extension': ... }` in the
  // remote's vite.config.js is reached here as `extension-b/Extension`
  // (leading `./` dropped).
  const remoteModule = await loadRemote(`${manifestEntry.name}/Extension`)

  // Federation wraps a plain `export default {...}` as `{ default: {...} }`;
  // callers only care about the descriptor itself.
  return remoteModule.default ?? remoteModule
}
