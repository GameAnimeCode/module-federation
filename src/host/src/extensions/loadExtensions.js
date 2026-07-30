// This module is the one place that talks to the Module Federation runtime
// directly. Everything else deals with plain extension descriptor objects.
//
// 'virtual:__federation__' is a module @originjs/vite-plugin-federation
// generates at build time (it doesn't exist on disk). Importing setRemote
// and getRemote from it is the plugin's documented mechanism for loading a
// remote whose URL is only known at runtime, as opposed to its default
// `remotes: { name: 'buildTimeUrl' }` static map — the plugin's compiler
// recognizes this exact import and rewrites it to reach its injected
// runtime.
import { __federation_method_setRemote, __federation_method_getRemote } from 'virtual:__federation__'
import { API_BASE_URL } from '../config.js'

/**
 * Registers one remote with the federation runtime by URL and imports its
 * exposed `./Extension` descriptor module.
 * @param {{ name: string, entryUrl: string }} manifestEntry - one entry from GET /api/extensions
 * @returns {Promise<{ id: string, label: string, routePath: string, component: object }>}
 */
export async function loadExtension(manifestEntry) {
  const absoluteEntryUrl = manifestEntry.entryUrl.startsWith('http')
    ? manifestEntry.entryUrl
    : `${API_BASE_URL}${manifestEntry.entryUrl}`

  await __federation_method_setRemote(manifestEntry.name, {
    url: absoluteEntryUrl,
    format: 'esm',
    from: 'vite',
  })

  const remoteModule = await __federation_method_getRemote(manifestEntry.name, './Extension')

  // Federation wraps a plain `export default {...}` as `{ default: {...} }`;
  // callers only care about the descriptor itself.
  return remoteModule.default ?? remoteModule
}
