// Conservative screen culling for imported Mask polygons and linework.
// Cached bounds are presentation-only: all source vertices and export paths
// retain their original exact geometry. Every transformed AABB corner is
// considered, including rotated and mirrored file-mask transforms.
export function createMaskViewportCuller(transformPoint) {
  const boundsByElement = new WeakMap();

  return function intersectsViewport(element, view, width, height, transformKey, margin = 4) {
    if (!element || !Array.isArray(element.points) || !element.points.length) return false;
    let cached = boundsByElement.get(element);
    if (!cached || cached.points !== element.points || cached.count !== element.points.length) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const point of element.points) {
        minX = Math.min(minX, point[0]);
        maxX = Math.max(maxX, point[0]);
        minY = Math.min(minY, point[1]);
        maxY = Math.max(maxY, point[1]);
      }
      if (![minX, minY, maxX, maxY].every(Number.isFinite)) return false;
      cached = {
        points: element.points,
        count: element.points.length,
        local: { minX, minY, maxX, maxY },
        transformKey: null,
      };
      boundsByElement.set(element, cached);
    }
    if (cached.transformKey !== transformKey) {
      const { minX, minY, maxX, maxY } = cached.local;
      const corners = [
        [minX, minY],
        [minX, maxY],
        [maxX, minY],
        [maxX, maxY],
      ].map(transformPoint);
      cached.world = {
        minX: Math.min(...corners.map((point) => point[0])),
        minY: Math.min(...corners.map((point) => point[1])),
        maxX: Math.max(...corners.map((point) => point[0])),
        maxY: Math.max(...corners.map((point) => point[1])),
      };
      cached.transformKey = transformKey;
    }
    const box = cached.world;
    const left = view.cx + box.minX * view.s;
    const right = view.cx + box.maxX * view.s;
    const top = view.cy - box.maxY * view.s;
    const bottom = view.cy - box.minY * view.s;
    return (
      right >= -margin && left <= width + margin && bottom >= -margin && top <= height + margin
    );
  };
}
