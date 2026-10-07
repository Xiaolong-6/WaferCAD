// Renderer-only budgets. Physical polygons, material ownership, process results
// and morphology parameters remain shared by every quality level.
const POLICIES = Object.freeze({
  quality: Object.freeze({
    mode: 'quality',
    triangleBudget: 1,
    roughnessDetail: 1,
    interfaceDetail: 1,
    maxDepth: 10,
    sidewallSegments: 512,
    maxPixelRatio: 2,
    transparencySortInterval: 0,
    analyticNormals: true,
  }),
  fast: Object.freeze({
    mode: 'fast',
    triangleBudget: 0.2,
    roughnessDetail: 0.25,
    interfaceDetail: 0.4,
    maxDepth: 8,
    sidewallSegments: 128,
    maxPixelRatio: 1,
    transparencySortInterval: 100,
    analyticNormals: false,
  }),
  interactive: Object.freeze({
    mode: 'interactive',
    triangleBudget: 0.05,
    roughnessDetail: 0.08,
    interfaceDetail: 0.15,
    maxDepth: 3,
    sidewallSegments: 48,
    maxPixelRatio: 0.85,
    transparencySortInterval: 180,
    analyticNormals: false,
  }),
});

export function threeRenderPolicy({ fast = true, interactive = false } = {}) {
  return POLICIES[interactive ? 'interactive' : fast ? 'fast' : 'quality'];
}
