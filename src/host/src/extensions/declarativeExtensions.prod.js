// Production stand-in for declarativeExtensions.js, swapped in by vite.config.js.
// Nothing is declarative in a production build, so the dynamic registry owns
// every extension.
export const DECLARATIVE_EXTENSION_NAMES = [];
export const declarativeRoutes = [];
export const declarativeExtensionsMetadata = Promise.resolve([]);
