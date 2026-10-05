import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const threeView = await readFile(new URL('../three-view.js', import.meta.url), 'utf8');
const annotationRendering = await readFile(
  new URL('../annotation-rendering.js', import.meta.url),
  'utf8',
);
const rendererGeometry = await readFile(
  new URL('../renderer-geometry.js', import.meta.url),
  'utf8',
);
const processTopology = await readFile(
  new URL('../process-topology.js', import.meta.url),
  'utf8',
);
const roughMeshGeometry = await readFile(
  new URL('../rough-mesh-geometry.js', import.meta.url),
  'utf8',
);
const morphologyMeshPolicy = await readFile(
  new URL('../morphology-mesh-policy.js', import.meta.url),
  'utf8',
);

test('3D inspection controls default to opaque layers with borders off', () => {
  assert.match(html, /id="threeOpacityRange"[^>]*value="1"/s);
  assert.match(html, /id="threeBorders" type="checkbox"/);
  assert.doesNotMatch(html, /id="threeBorders"[^>]*checked/);
  assert.match(app, /threeOpacity = 1/);
  assert.match(app, /threeShowBorders = false/);
  assert.match(threeView, /buildRenderSurfacePlan\(model, clip\)/);
  assert.match(rendererGeometry, /ownedMaterialSurfacesFromTopology/);
  assert.match(processTopology, /function ownHorizontalMaterialCaps\(/);
  assert.match(processTopology, /function ownVerticalMaterialSidewalls\(/);
  assert.match(processTopology, /function ownedMaterialBorderLines\(/);
  assert.match(rendererGeometry, /function capBoundaryIndex\(/);
  assert.match(rendererGeometry, /lowerSurface = sidewallBoundaryAppearance\(/);
  assert.match(rendererGeometry, /upperSurface = sidewallBoundaryAppearance\(/);
  assert.match(rendererGeometry, /sidewallBoundaryIntervals:/);
  assert.match(roughMeshGeometry, /hasPhysicalSidewallAt/);
  assert.match(threeView, /sidewallBoundaryIntervals: cap\.sidewallBoundaryIntervals/);
  assert.match(threeView, /roughProfileOffsetAtPoint\(/);
  assert.match(threeView, /part\.lowerSurface/);
  assert.match(threeView, /part\.upperSurface/);
  assert.doesNotMatch(threeView, /alphaHash/);
  assert.match(threeView, /transparent: translucent/);
  assert.match(threeView, /depthWrite: !translucent/);
  assert.match(threeView, /depthTest: true/);
  assert.match(threeView, /function updateTransparentOrder\(\)/);
  assert.match(threeView, /a\.depth - b\.depth \|\| a\.sortBias - b\.sortBias/);
  assert.match(roughMeshGeometry, /function geometryFromRoughCap\(/);
  assert.match(threeView, /adaptiveRoughMeshLod\(/);
  assert.match(threeView, /function prepareRoughSpatialZones\(/);
  assert.match(threeView, /task\.spatialZones = buildRoughSpatialZones\(THREE, task\.cap\)/);
  assert.match(morphologyMeshPolicy, /return \[\.\.\.buckets\.values\(\)\]\.map/);
  assert.match(threeView, /roughBaseTriangulationCount\+\+/);
  assert.match(morphologyMeshPolicy, /subdivideRoughBaseTriangles\(base\.triangles, depth\)/);
  assert.match(morphologyMeshPolicy, /roughBoundaryEdgesFromTriangles\(baseTriangles\)/);
  assert.doesNotMatch(threeView, /intersection\(cap\.polys/);
  assert.match(threeView, /function roughZonePriority\(/);
  assert.doesNotMatch(threeView, /function maybeRebuildAdaptiveGeometry\(/);
  assert.match(threeView, /function requestRoughGeometry\(/);
  assert.match(threeView, /new Worker\(workerUrl/);
  assert.match(threeView, /roughInteractionCache/);
  assert.match(threeView, /let sceneGeneration = 0/);
  assert.match(threeView, /let pendingRender = false/);
  assert.match(threeView, /if \(rendering\) \{\s*pendingRender = true;/);
  assert.match(threeView, /sceneGeneration: renderGeneration/);
  assert.match(threeView, /context\.sceneGeneration !== sceneToken/);
  assert.match(threeView, /host\.dataset\.modelRevision/);
  assert.match(threeView, /host\.dataset\.processRevision/);
  assert.match(threeView, /host\.dataset\.renderState = 'refining'/);
  assert.match(threeView, /roughMeshMode = mode/);
  assert.match(threeView, /controls\.addEventListener\('start'/);
  assert.match(threeView, /controls\.addEventListener\('end'/);
  assert.match(threeView, /return normalizedDistance <= 1\.75 \? 0\.28 : 0\.06/);
  assert.match(roughMeshGeometry, /function roughPointNormal\(/);
  assert.doesNotMatch(threeView, /function capRenderParts\(/);
  assert.match(threeView, /geometryFromRoughCap\(THREE,/);
  assert.doesNotMatch(threeView, /roughMeshTriangleBudget\(/);
  assert.match(threeView, /const showInternalImplants = materialState\.transparent/);
  assert.match(
    threeView,
    /if \(!showInternalImplants && !implant\.surfaceExposed && !implant\.viewClipped\) continue/,
  );
  assert.match(threeView, /if \(implant\.viewClipped\)/);
  assert.match(threeView, /if \(showInternalImplants\)/);
  assert.match(threeView, /opacity: opacity \* 0\.18/);
  assert.match(threeView, /IMPLANT_DEPTH_GRADIENT\.outerAlpha/);
  assert.match(threeView, /opacity: opacity \* 0\.3/);
  assert.match(threeView, /function createAnnotationGradientMaterial\(/);
  assert.match(threeView, /attribute float annotationDepth/);
  assert.match(threeView, /midScale = midAlpha \/ outerAlpha/);
  assert.match(threeView, /innerScale = innerAlpha \/ outerAlpha/);
  assert.match(annotationRendering, /outerAlpha: 0\.72/);
  assert.match(annotationRendering, /midDepth: 0\.48/);
  assert.match(annotationRendering, /midAlpha: 0\.4/);
  assert.match(annotationRendering, /innerAlpha: 0\.04/);
  assert.match(threeView, /function annotationSidewallParts\(/);
  assert.match(threeView, /displaySidewallParts\(annotationSidewallParts\(implant\)\)/);
  assert.match(threeView, /cutMaterial\.polygonOffset = true/);
  assert.match(threeView, /cutMaterial\.depthFunc = THREE\.LessEqualDepth/);
  assert.match(threeView, /capState = \{[\s\S]*?depthTest: true/);
  assert.match(threeView, /capMaterial\.polygonOffset = true/);
  assert.match(threeView, /capMaterial\.polygonOffsetFactor = -1/);
  assert.match(threeView, /if \(!state\?\.transparent\) return base/);
  assert.match(threeView, /part\.type === 'cap'/);
  assert.match(threeView, /part\.z0/);
  assert.match(threeView, /part\.z1/);
  assert.doesNotMatch(threeView, /forceSinglePass/);
  assert.doesNotMatch(threeView, /opacity: 0\.18/);
  assert.doesNotMatch(threeView, /opacity: 0\.3/);
  assert.match(roughMeshGeometry, /roughProfileOffsetAtPoint\(/);
  assert.match(threeView, /color: layer\?\.color \|\| '#999'/);
  assert.doesNotMatch(threeView, /0x24282c/);
  assert.doesNotMatch(threeView, /multiplyScalar\(0\.5\)/);
  assert.match(threeView, /async function exportGlb\(\{ signal = null, onProgress = null \} = \{\}\)/);
  assert.match(threeView, /buildExportRoughMeshData/);
  assert.match(threeView, /new Worker\(workerUrl\)/);
  assert.match(threeView, /GLB morphology worker failed; using synchronous fallback/);
  assert.match(threeView, /geometryFromRoughMeshData\(THREE, meshData\)/);
  assert.match(threeView, /async function capturePng\(scale = 3\)/);
  assert.match(threeView, /preserveDrawingBuffer: false/);
  assert.match(
    threeView,
    /captureRenderer = new THREE\.WebGLRenderer\(\{[\s\S]*?preserveDrawingBuffer: true/,
  );
  assert.match(
    threeView,
    /renderer\.setPixelRatio\(multiplier\)[\s\S]*?await requestRoughGeometry\('detailed', \{ force: true \}\);[\s\S]*?captureRenderer\.render\(scene, camera\)/,
  );
  assert.match(
    threeView,
    /captureRenderer\.dispose\(\)[\s\S]*?renderer\.setPixelRatio\(oldPixelRatio\)[\s\S]*?await requestRoughGeometry\('detailed', \{ force: true \}\);/,
  );
  assert.match(app, /createThreeView/);
});

test('3D renderer is event-driven and lazy-loads remote dependencies after app startup', () => {
  assert.doesNotMatch(threeView, /requestAnimationFrame\(animate\)/);
  assert.match(threeView, /function scheduleFrame\(\)/);
  assert.match(threeView, /function loadDependencies\(\)/);
  assert.match(threeView, /initPromise = loadDependencies\(\)\s*\.then/);
  assert.doesNotMatch(threeView, /try \{\s*THREE = await import\('three'\)/);
  assert.match(threeView, /function showUnavailable\(/);
  assert.match(threeView, /3D dependencies unavailable; continuing without the 3D view/);
  assert.match(threeView, /WebGL unavailable; continuing without the 3D view/);
  assert.match(threeView, /could not create a WebGL context/);
  assert.match(threeView, /host\.classList\.add\('three-unavailable'\)/);
});
