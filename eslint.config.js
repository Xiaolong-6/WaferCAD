const globals = {
  Array: "readonly",
  Blob: "readonly",
  DataView: "readonly",
  Error: "readonly",
  Infinity: "readonly",
  JSON: "readonly",
  Map: "readonly",
  Math: "readonly",
  Number: "readonly",
  Object: "readonly",
  Option: "readonly",
  Promise: "readonly",
  ResizeObserver: "readonly",
  Set: "readonly",
  String: "readonly",
  TextDecoder: "readonly",
  TextEncoder: "readonly",
  Uint8Array: "readonly",
  URL: "readonly",
  console: "readonly",
  devicePixelRatio: "readonly",
  document: "readonly",
  globalThis: "readonly",
  parseInt: "readonly",
  requestAnimationFrame: "readonly",
  structuredClone: "readonly",
  window: "readonly"
};

export default [
  {
    ignores: ["legacy/**", "site/vendor/**"]
  },
  {
    files: ["site/**/*.js", "site/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals
    },
    rules: {
      "no-constant-binary-expression": "error",
      "no-dupe-keys": "error",
      "no-redeclare": "error",
      "no-unreachable": "error",
      "no-var": "error"
    }
  }
];
