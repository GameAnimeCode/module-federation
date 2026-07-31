import { defineStore } from "pinia";

// Same singleton-Pinia mechanism as extension-a/src/store.js.
export const useExtensionBStore = defineStore("extension-b", {
  state: () => ({
    tasks: [
      { id: 1, text: "Wire up dynamic discovery", done: true },
      { id: 2, text: "Load remotes at runtime", done: true },
      { id: 3, text: "React to hot-add / hot-remove", done: false },
    ],
  }),
  getters: {
    uncheckedCount: (state) => state.tasks.filter((task) => !task.done).length,
    // Same contract as extension-a's `summary` getter.
    summary() {
      return `${this.uncheckedCount} to-do${this.uncheckedCount === 1 ? "" : "s"}`;
    },
  },
  actions: {
    toggle(taskId) {
      const task = this.tasks.find((t) => t.id === taskId);
      if (task) task.done = !task.done;
    },
  },
});
