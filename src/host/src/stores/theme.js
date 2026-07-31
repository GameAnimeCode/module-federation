import { watchEffect } from "vue";
import { defineStore } from "pinia";

// Only the user's choice is stored. "system" is a distinct third state, not a
// synonym for light, so clearing it returns control to the OS.
const STORAGE_KEY = "theme-preference";
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function storedPreference() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export const useThemeStore = defineStore("theme", {
  state: () => ({
    preference: storedPreference(),
    systemPrefersDark: darkQuery.matches,
  }),
  getters: {
    // The theme actually applied, after resolving "system".
    resolved: (state) =>
      state.preference === "system"
        ? state.systemPrefersDark
          ? "dark"
          : "light"
        : state.preference,
    summary() {
      return this.preference === "system"
        ? `system (${this.resolved})`
        : this.resolved;
    },
  },
  actions: {
    setPreference(preference) {
      this.preference = preference;
      if (preference === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, preference);
    },
  },
});

/**
 * Mirrors the resolved theme onto <html data-theme>, which is what carries it
 * across the federation boundary. Call once, after Pinia is installed.
 */
export function startThemeSync() {
  const theme = useThemeStore();
  darkQuery.addEventListener("change", (event) => {
    theme.systemPrefersDark = event.matches;
  });
  watchEffect(() => {
    document.documentElement.dataset.theme = theme.resolved;
  });
}
