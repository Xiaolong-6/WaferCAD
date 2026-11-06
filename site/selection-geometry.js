import { selectedMaskInstanceIndex, deferredArrayMaskArea } from './mask-instance-index.js';
import { isArrayModel } from './model-array.js';
import { fullFaceGeometry } from './model.js';
import { drawMaskGeometry, normalizeDrawShape } from './draw-mask-geometry.js';
import {
  drawShapeMayIntersectRoi,
  maskElementMayDefineArea,
  maskElementMayIntersectRoi,
  maskRoiLocalBounds,
} from './mask-roi-culling.js';
import { maskRoiWorldGeometry } from './mask-roi-geometry.js';
import { sectorBoundaryPoints } from './roi-editor.js';
import {
  bufferPolyline,
  circleMulti,
  difference,
  intersection,
  isEmpty,
  rectMulti,
  unionGeometries,
} from './vector-geometry.js';

export function createSelectionGeometry({ getState, selectedElement, maskPoint }) {
  function selectedFileMaskGeometry(localRoiBounds = null) {
    const { layout, maskTransform } = getState(),
      geoms = [];
    for (const element of layout.elements || []) {
      if (!selectedElement(element)) continue;
      if (localRoiBounds && !maskElementMayIntersectRoi(element, localRoiBounds)) continue;
      if (element.kind === 'polygon') {
        geoms.push([[element.points.map(maskPoint)]]);
      } else if (element.kind === 'path' && element.width > 0) {
        geoms.push(
          bufferPolyline(
            element.points.map(maskPoint),
            (element.width * maskTransform.scale) / 2,
            28,
            false,
          ),
        );
      }
    }
    const merged = unionGeometries(geoms);
    return isEmpty(merged) ? [] : merged;
  }

  function activeMaskGeometry(localRoiBounds = null) {
    const { model, maskSourceMode, drawMask } = getState();
    const selected =
      maskSourceMode === 'draw'
        ? drawMaskGeometry(
            localRoiBounds
              ? {
                  ...drawMask,
                  shapes: (drawMask?.shapes || []).filter((shape) =>
                    drawShapeMayIntersectRoi(shape, localRoiBounds),
                  ),
                }
              : drawMask,
          )
        : selectedFileMaskGeometry(localRoiBounds);
    return isEmpty(selected) ? [] : intersection(selected, model.boundary);
  }

  function maskRoiGeometry() {
    const { maskRoi, maskSourceMode, maskTransform } = getState();
    if (!maskRoi) return null;
    const transform =
      maskSourceMode === 'file' ? maskTransform : { x: 0, y: 0, scale: 1, rotation: 0 };
    return maskRoiWorldGeometry(maskRoi, transform, 96);
  }

  function operationAreaGeometry(mode) {
    const { model, layout, maskTransform, maskSourceMode, maskRoi, drawMask } = getState();
    const limiter = maskRoiGeometry();
    const localRoiBounds = limiter ? maskRoiLocalBounds(maskRoi) : null;
    if (isArrayModel(model) && maskSourceMode === 'file') {
      return deferredArrayMaskArea(
        {
          boundary: model.boundary,
          index:
            mode === 'full'
              ? null
              : selectedMaskInstanceIndex(layout, selectedElement, maskTransform),
          mode,
          limiter,
        },
        { intersection, isEmpty },
      );
    }
    let area;
    if (mode === 'full') {
      area = fullFaceGeometry(model);
    } else {
      const selected = activeMaskGeometry(localRoiBounds);
      if (isEmpty(selected)) {
        // An existing mask entirely outside the ROI inverts to the ROI itself.
        // A truly empty mask must still reject both mask and invert.
        const hasMaskArea =
          maskSourceMode === 'draw'
            ? (drawMask?.shapes || []).some((shape) => Boolean(normalizeDrawShape(shape)))
            : (layout.elements || []).some(
                (element) => selectedElement(element) && maskElementMayDefineArea(element),
              );
        if (mode !== 'invert' || !localRoiBounds || !hasMaskArea) return [];
        area = fullFaceGeometry(model);
      } else {
        area = mode === 'invert' ? difference(model.boundary, selected) : selected;
      }
    }
    return limiter ? intersection(area, limiter) : area;
  }

  function roiGeometry() {
    const { roi } = getState();
    if (!roi) return null;
    if (roi.type === 'rect') {
      const x0 = Math.min(roi.a[0], roi.b[0]),
        x1 = Math.max(roi.a[0], roi.b[0]),
        y0 = Math.min(roi.a[1], roi.b[1]),
        y1 = Math.max(roi.a[1], roi.b[1]);
      return rectMulti(x1 - x0, y1 - y0, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    if (roi.type === 'circle') {
      return circleMulti(roi.r * 2, roi.r * 2, 96, roi.c[0], roi.c[1]);
    }
    if (roi.type === 'sector') {
      const ring = sectorBoundaryPoints(roi, 96);
      return ring.length ? [[ring]] : null;
    }
    return null;
  }

  return {
    activeMaskGeometry,
    maskRoiGeometry,
    operationAreaGeometry,
    roiGeometry,
    selectedFileMaskGeometry,
  };
}
