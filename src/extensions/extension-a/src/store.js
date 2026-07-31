import { defineStore } from "pinia";

// Attaches to the host's shared Pinia instance (see vite.config.js).
// `summary` lets the host's status panel read state generically, without
// knowing this extension keeps a `count`.
export const useExtensionAStore = defineStore("extension-a", {
  state: () => ({ count: 0 }),
  getters: {
    summary: (state) => `${state.count} click${state.count === 1 ? "" : "s"}`,
  },
  actions: {
    increment() {
      this.count++;
    },
  },
});
