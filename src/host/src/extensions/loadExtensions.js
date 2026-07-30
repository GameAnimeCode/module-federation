// This module is the one place that talks to the Module Federation runtime
// directly. Everything else deals with plain extension descriptor objects.
//
// Branch hmr/latest-vite-federation: unlike the other branches'
// `virtual:__federation__` import (a build-time-only mechanism specific to
// @originjs/vite-plugin-federation), `registerRemotes`/`loadRemote` here are
// a real, standalone runtime API from `@module-federation/runtime` — usable
// exactly the same way whether this code is running from a `vite build`
// output or a `vite dev` server. The host's `federation()` plugin call
// (vite.config.js) auto-injects the one-time `init()` call for this runtime
// instance; we only ever call registerRemotes/loadRemote.
import { registerRemotes, loadRemote } from '@module-federation/runtime'
import { API_BASE_URL } from '../config.js'

/**
 * Registers one remote with the federation runtime by URL and imports its
 * exposed `./Extension` descriptor module. Prefers `devUrl` (a live `vite
 * dev` server, self-registered — see backend Program.cs's DevServerRegistry)
 * over `entryUrl` (a built file) when both are present, so an extension
 * being actively developed loads fresh code on every host page load with no
 * build step — see README.md's HMR section for what this does and doesn't
 * achieve versus true in-place hot patching.
 * @param {{ name: string, entryUrl: string | null, devUrl?: string | null }} manifestEntry - one entry from GET /api/extensions
 * @returns {Promise<{ id: string, label: string, routePath: string, component: object }>}
 */
export async function loadExtension(manifestEntry) {
  const sourceUrl = manifestEntry.devUrl ? `${manifestEntry.devUrl}/remoteEntry.js` : manifestEntry.entryUrl

  const absoluteEntryUrl = sourceUrl.startsWith('http') ? sourceUrl : `${API_BASE_URL}${sourceUrl}`

  // `force: true` lets a manifest entry we've already registered (e.g. its
  // URL changed) be re-registered instead of the runtime silently keeping
  // the first registration. `type: 'module'` is required, not optional —
  // the runtime's own default is `type: 'var'` (load remoteEntry.js as a
  // classic script exposing a global), but every remoteEntry.js this
  // project's Vite builds produce is a real ES module (`import`/`export`
  // statements); loading it as a classic script throws "Cannot use import
  // statement outside a module". Found empirically — the runtime's error
  // message names the resource but not this option.
  registerRemotes(
    [
      {
        name: manifestEntry.name,
        entry: absoluteEntryUrl,
        type: 'module',
      },
    ],
    { force: true },
  )

  // The `remoteName/exposedPath` id format mirrors webpack Module
  // Federation's convention — `exposes: { './Extension': ... }` in the
  // remote's vite.config.js is reached here as `extension-a/Extension`
  // (leading `./` dropped).
  const remoteModule = await loadRemote(`${manifestEntry.name}/Extension`)

  // Federation wraps a plain `export default {...}` as `{ default: {...} }`;
  // callers only care about the descriptor itself.
  return remoteModule.default ?? remoteModule
}
