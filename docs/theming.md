# Theming across the federation boundary

Back to the [README](../README.md).

The host ships a light and a dark theme. Extensions restyle with it, and no
extension imports anything from the host to make that happen.

That is the point of this feature. Shared state needs federation machinery, a
`shared` singleton and a negotiated version. Shared **styling** needs none,
because remotes render into the host's DOM and the CSS cascade already reaches
them. This is a capability an iframe-based microfrontend gives up entirely.

## The split: Pinia owns the choice, CSS owns the presentation

Two mechanisms, deliberately not one.

|                             | Carried by                       | Consumed by                  |
| --------------------------- | -------------------------------- | ---------------------------- |
| Which theme the user picked | Pinia store, host only           | The host's own UI            |
| What that theme looks like  | CSS custom properties on `:root` | Host **and** every extension |

[`stores/theme.js`](../src/host/src/stores/theme.js) holds the preference and
resolves it. A `watchEffect` mirrors the result onto the document:

```js
watchEffect(() => {
  document.documentElement.dataset.theme = theme.resolved;
});
```

That single attribute is the whole transport. `style.css` keys its token sets
off it, and everything below inherits.

**Extensions never read the theme store.** They cannot: extensions do not
import host source, which is the architectural rule the rest of this project
holds to. Nor should they want to. An extension that read `theme.resolved` in
JavaScript to pick a colour would be reimplementing the cascade by hand, and
would restyle a frame late, after the host had already repainted.

## The token contract

Tokens are semantic, named for their role rather than their value:

```css
:root {
  color-scheme: light;
  --color-bg: #f6f8fa;
  --color-surface: #ffffff;
  --color-border: #d8dee4;
  --color-text: #1f2328;
  --color-text-muted: #59636e;
  --color-accent: #0969da;
  /* sidebar and badge tokens omitted */
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --color-bg: #0d1117;
  --color-surface: #161b22;
  /* ... */
}
```

An extension consumes them and keeps its own brand accent:

```css
/* extension-b/src/ExtensionApp.vue */
.extension-b {
  border: 1px solid var(--color-border, #d8dee4);
  border-left: 3px solid #3178c6; /* the extension's own identity */
  background: var(--color-surface, #ffffff);
  color: var(--color-text, #1f2328);
}
```

This is the same shape as the `summary` getter in
[dynamic discovery](./dynamic-discovery.md#keeping-the-host-generic). The host
publishes a small, stable vocabulary; extensions agree to speak it; neither
side hardcodes the other's specifics. Adding a third extension requires no
theming work in the host.

## Practices worth copying

**Treat "system" as a real third state.** The control offers Auto, Light, and
Dark. Auto is not a synonym for light: it defers to
`prefers-color-scheme` and follows the OS live, through a `matchMedia`
listener, with no reload. Choosing it clears the stored value rather than
writing `"system"`, so the OS stays authoritative.

**Persist only an explicit choice.** `localStorage` holds `light` or `dark` and
nothing else. Absence means Auto, which keeps the default honest across
devices.

**Set the theme before first paint.** A theme resolved after mount produces a
visible flash of the wrong one. [`index.html`](../src/host/index.html) carries a
synchronous snippet in `<head>` that reads the stored value and stamps
`data-theme` before the stylesheet is even requested. In the built output that
script sits at byte 588, the stylesheet at 965, and `<body>` at 1701, so the
first paint is already correct.

**Declare `color-scheme`.** Each token set sets `color-scheme: light` or
`dark`. Native controls follow it without any styling: extension B's checkboxes
render dark on dark, and scrollbars and form fields match. Skipping this is the
most common reason a "dark mode" still has a glaring white scrollbar.

**Give tokens fallbacks.** Extensions write `var(--color-surface, #ffffff)`.
The fallback is what keeps `npm run dev` inside an extension readable, since
the standalone preview harness runs with no host and therefore no tokens.
A remote that assumes the host's variables exist is a remote that cannot be
developed on its own.

**Respect reduced motion.** The colour transition on `body` is wrapped in
`@media (prefers-reduced-motion: no-preference)`.

**Make the control a real control.** Three `<button>` elements in a
`role="group"` with an `aria-label`, each carrying `aria-pressed`, plus a
visible `:focus-visible` outline. A `<div>` with a click handler would be
neither reachable by keyboard nor announced as a choice.

## Trade-offs

- **Tokens are a public API.** Once extensions depend on `--color-surface`,
  renaming it breaks bundles you may not rebuild. Version the vocabulary as
  deliberately as the descriptor contract, and see
  [the extension contract](./extension-contract.md).
- **No enforcement.** Nothing stops an extension hardcoding `#fff`, and it will
  look broken in dark mode. The failure is visual and silent, which is the
  styling equivalent of the missing type checking described in
  [Module Federation](./module-federation.md#costs).
- **Resolution lives in JS, in two places.** The store and the pre-paint
  snippet both know how to resolve a preference. The alternative, a
  `prefers-color-scheme` media query in CSS, duplicates the _token sets_
  instead, which is the larger and more error-prone thing to keep in sync. The
  app is a Vue SPA and renders nothing without JS, so a CSS-only fallback would
  buy nothing.
- **`localStorage` is per-origin.** In dev the host runs on `:5173` and an
  extension's standalone preview on `:5174`, so they do not share a stored
  preference. This is only a demo concern.

## Verifying it

The claim to test is that the theme reaches a _federated_ extension through CSS
alone. Flip the host's control, then read the computed style of an element
belonging to the extension:

```js
getComputedStyle(document.querySelector(".extension-a")).backgroundColor;
// light: rgb(255, 255, 255)
// dark:  rgb(22, 27, 34)
```

Both values come from `--color-surface`, which only the host defines.
