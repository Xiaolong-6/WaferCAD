import { fullFaceGeometry } from './model.js';
import { drawMaskGeometry } from './draw-mask-geometry.js';
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
  function selectedFileMaskGeometry() {
    const { layout, maskTransform } = getState(),
      geoms = [];
    for (const element of layout.elements || []) {
      if (!selectedElement(element)) continue;
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

  function activeMaskGeometry() {
    const { model, maskSourceMode, drawMask } = getState(),
      selected =
        maskSourceMode === 'draw' ? drawMaskGeometry(drawMask) : selectedFileMaskGeometry();
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
    const { model } = getState();
    let area;
    if (mode === 'full') {
      area = fullFaceGeometry(model);
    } else {
      const selected = activeMaskGeometry();
      if (isEmpty(selected)) return [];
      area = mode === 'invert' ? difference(model.boundary, selected) : selected;
    }

    const limiter = maskRoiGeometry();
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
