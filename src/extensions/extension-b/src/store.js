import { defineStore } from 'pinia'

// Same singleton-Pinia mechanism as extension-a/src/store.js — see that
// file and vite.config.js's `shared.pinia` for why this works across the
// federation boundary.
export const useExtensionBStore = defineStore('extension-b', {
  state: () => ({
    tasks: [
      { id: 1, text: 'Wire up dynamic discovery', done: true },
      { id: 2, text: 'Load remotes at runtime', done: true },
      { id: 3, text: 'React to hot-add / hot-remove', done: false },
    ],
  }),
  getters: {
    uncheckedCount: (state) => state.tasks.filter((task) => !task.done).length,
    // Same contract as extension-a's `summary` getter: the host's status
    // panel reads only this, never `tasks` directly, so it stays generic
    // across whatever shape of state a given extension actually keeps.
    summary() {
      return `${this.uncheckedCount} to-do${this.uncheckedCount === 1 ? '' : 's'}`
    },
  },
  actions: {
    toggle(taskId) {
      const task = this.tasks.find((t) => t.id === taskId)
      if (task) task.done = !task.done
    },
  },
})
