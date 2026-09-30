# Third-party notices

WaferCAD uses the following third-party software in the active browser application.

## polygon-clipping 0.15.7

- License: MIT
- Upstream: https://github.com/mfogel/polygon-clipping
- Package: https://www.npmjs.com/package/polygon-clipping
- Vendored bundle: `site/vendor/polygon-clipping.umd.js`

The bundle is vendored because WaferCAD is deployed as a static site with no build step.

## three 0.179.1

- License: MIT
- Upstream: https://github.com/mrdoob/three.js
- Package: https://www.npmjs.com/package/three

Three.js is loaded as an ES module from jsDelivr by the workspace page, `site/app.html`.
