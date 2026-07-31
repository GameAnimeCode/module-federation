// These are Prettier's own defaults, written out explicitly rather than
// left as an empty config — this project's editors were already producing
// double-quote/semicolon output before this file existed (format-on-save
// with Prettier's defaults), so matching that instead of this project's
// earlier no-semicolon/single-quote style avoids fighting anyone's existing
// editor setup.
export default {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  tabWidth: 2,
  printWidth: 80,
};
