# Z-collapse front/back scale handoff — 2026-10-06

## Revision

- Repository: `Xiaolong-6/WaferCAD`
- Working branch: `fix/z-collapse-front-back-scale`
- Base branch/revision: `fix/3d-conformal-annulus-cap` @ `dbf1fc6a27d50c5694c65a7110bdc4b850e1bce0`
- Product revision covered by this handoff: `7aebd4489dc0b7e1ba558e793146a98ddbad8dfb`
- The earlier provisional branch `fix/z-collapse-surface-scale` was created before the annulus branch history was rewritten and is superseded. Do not merge it.

## Behavior changed

Section Auto previously assigned a fixed 80/20 pixel split to the retained upper/lower Z spans. That gave the front and back different pixels-per-micrometre values, so equal physical pyramid/roughness heights could appear at very different amplitudes.

The default Z-collapse contract is now:

- front/back retained spans use the same physical display scale;
- `Front / Back Z ratio` is locked at 1:1 by default;
- unlocking the ratio enables independent front/back weights from 0.1× to 10×;
- the ratio is display-only and is persisted with the view state;
- Section SVG export uses the same ratio;
- 3D consumes the same ratio. Its translation-only fast path is retained for the 1:1 case, while unlocked non-unit sides are vertex-mapped so the requested ratio actually changes geometry display;
- canonical process geometry, process operations, and GLB geometry remain in physical micrometres.

The Z-collapse editor exposes the ratio next to the existing collapse controls. In locked mode both numeric fields are disabled and fixed to 1×, avoiding a misleading common multiplier that Auto-fit would cancel.

## Tests and validation added

Node coverage was added for linked Section scaling, unlocked Section ratios, unlocked 3D ratios, and project-schema validation. Product-layout browser coverage checks the default 1:1 lock, unlock/edit/relock behavior, Section pixel-scale ratio, and the 3D display diagnostics.

In the ChatGPT connector environment there was no usable local checkout, so standard repository commands were not executed. The changed JavaScript modules/tests were syntax-compiled in a V8 validation harness after import stripping, and the real `site/section-z-collapse.js` math was executed directly:

- linked front/back Section ratio: 1;
- unlocked front=2 / back=0.5 Section ratio: 4;
- unlocked front=2 / back=0.5 3D ratio: 4;
- locked metadata with arbitrary stored values normalizes back to 1:1.

## Required local/CI follow-up

Run from a normal checkout with pinned dependencies:

```bash
npm ci
npm run check
npm run test:ui:product
npm run test:ui:examples
```

Then load the bundled fully textured perovskite/silicon tandem example and visually verify that equal front/back pyramid settings have equal Section amplitude with `Lock 1:1`, that 3D no longer gives the back face an artificial Z advantage, and that unlocking the ratio changes both Section and 3D consistently without changing exported physical geometry.
