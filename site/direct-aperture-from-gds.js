import { isEmpty, transformMulti, unionGeometries } from './vector-geometry.js';

/**
 * Translate explicit GDS exposure selectors into a Z-resolved Direct aperture.
 * The caller establishes datatype-to-resist semantics and absolute Z heights;
 * GDS itself contains no resist thickness, undercut or material information.
 * Input elements must already be flattened into one source-cell XY frame.
 */
export function directApertureStackFromGds(elements, stages, { transformPoint = (p) => p } = {}) {
  if (!Array.isArray(elements) || !Array.isArray(stages) || !stages.length)
    throw new RangeError('Direct GDS apertures require flattened elements and physical-Z stages.');
  if (typeof transformPoint !== 'function')
    throw new TypeError('Invalid GDS coordinate transform.');
  let previousTop = null;
  return stages.map((stage, index) => {
    const { bottomZUm, topZUm, selectors } = stage || {};
    if (
      !Number.isFinite(bottomZUm) ||
      !Number.isFinite(topZUm) ||
      topZUm <= bottomZUm ||
      (previousTop !== null && Math.abs(previousTop - bottomZUm) > 1e-9)
    )
      throw new RangeError(
        `Direct GDS aperture stage ${index} must be a contiguous physical-Z interval.`,
      );
    if (
      !Array.isArray(selectors) ||
      !selectors.length ||
      selectors.some(
        (selector) =>
          !Number.isInteger(selector?.layer) ||
          selector.layer < 0 ||
          !Number.isInteger(selector?.datatype) ||
          selector.datatype < 0,
      )
    )
      throw new RangeError(
        `Direct GDS aperture stage ${index} needs explicit layer/datatype selectors.`,
      );
    const selected = [];
    for (const { layer, datatype } of selectors) {
      const polygons = elements.filter(
        (element) =>
          element.kind === 'polygon' && element.layer === layer && element.datatype === datatype,
      );
      if (!polygons.length)
        throw new RangeError(`Direct GDS aperture selector ${layer}/${datatype} has no polygons.`);
      for (const element of polygons) {
        if (!Array.isArray(element.points) || element.points.length < 3)
          throw new RangeError(
            `Direct GDS aperture ${layer}/${datatype} contains an invalid polygon.`,
          );
        const geom = transformMulti([[element.points]], (xy) => {
          const transformed = transformPoint(xy);
          if (
            !Array.isArray(transformed) ||
            transformed.length !== 2 ||
            !transformed.every(Number.isFinite)
          )
            throw new RangeError(
              'Direct GDS aperture transform must produce finite XY coordinates.',
            );
          return transformed;
        });
        if (!isEmpty(geom)) selected.push(geom);
      }
    }
    const opening = unionGeometries(selected);
    if (isEmpty(opening)) throw new RangeError(`Direct GDS aperture stage ${index} is empty.`);
    previousTop = topZUm;
    return { bottomZUm, topZUm, opening };
  });
}
