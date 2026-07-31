// Loads dynamically discovered extensions (extension B only) via the
// standalone @module-federation/runtime API. Extension A is unrelated,
// see declarativeExtensionA.js.
import { registerRemotes, loadRemote } from "@module-federation/runtime";
import { API_BASE_URL } from "../config.js";

/**
 * Registers one remote with the federation runtime by URL and imports its
 * exposed `./Extension` descriptor module.
 * @param {{ name: string, entryUrl: string }} manifestEntry - one entry from GET /api/extensions
 * @param {{ bust?: number | string }} [options] - pass a changed value (e.g.
 *   `lastModifiedUnixMs`) to force a fresh fetch instead of a cached module.
 * @returns {Promise<{ id: string, label: string, routePath: string, component: object }>}
 */
export async function loadExtension(manifestEntry, { bust } = {}) {
  const absoluteEntryUrl = manifestEntry.entryUrl.startsWith("http")
    ? manifestEntry.entryUrl
    : `${API_BASE_URL}${manifestEntry.entryUrl}`;
  // Cache-busting query param forces both the runtime and the browser to
  // re-fetch instead of returning the already-loaded module.
  const url =
    bust === undefined ? absoluteEntryUrl : `${absoluteEntryUrl}?t=${bust}`;

  // `type: 'module'` is required: the runtime's default (`'var'`) loads
  // remoteEntry.js as a classic script, but ours are real ES modules.
  registerRemotes(
    [
      {
        name: manifestEntry.name,
        entry: url,
        type: "module",
      },
    ],
    { force: true },
  );

  const remoteModule = await loadRemote(`${manifestEntry.name}/Extension`);
  return remoteModule.default ?? remoteModule;
}
