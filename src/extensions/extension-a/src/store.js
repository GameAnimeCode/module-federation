import { defineStore } from 'pinia'

// Attaches to the single Pinia instance the host creates in its main.js —
// see vite.config.js's `shared.pinia` for why that's what makes this work
// across the federation boundary at all. The store id ('extension-a') must
// be unique across every extension the host might ever load, same
// requirement as the routePath in extension.js.
//
// `summary` exists so the host's status panel (see host/src/App.vue) can
// display this extension's state without knowing its shape — it only ever
// reads `store.summary`, never `store.count` directly.
export const useExtensionAStore = defineStore('extension-a', {
  state: () => ({ count: 0 }),
  getters: {
    summary: (state) => `${state.count} click${state.count === 1 ? '' : 's'}`,
  },
  actions: {
    increment() {
      this.count++
    },
  },
})
