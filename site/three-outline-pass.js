// Keep the translucent color pass intact, then rebuild only structural depth.
// Reusing each surface material preserves GPU morphology, instancing and clipping;
// a generic depth override would silently flatten shader-displaced surfaces.
export function renderDepthAwareOutlines(
  renderer,
  scene,
  camera,
  { occluders = [], outlines = [] } = {},
) {
  const activeOutlines = outlines.filter((object) => object?.visible !== false);
  if (!activeOutlines.length) {
    renderer.render(scene, camera);
    return false;
  }
  const outlineSet = new Set(activeOutlines),
    occluderSet = new Set(occluders),
    renderables = [],
    materialStates = new Map(),
    uniformStates = new Map(),
    background = scene.background,
    autoClear = renderer.autoClear,
    infoAutoReset = renderer.info?.autoReset;
  scene.traverse((object) => {
    if (object.isMesh || object.isLine || object.isPoints || object.isSprite) {
      renderables.push([object, object.visible]);
    }
  });
  const restoreMaterials = () => {
    for (const [material, state] of materialStates) Object.assign(material, state);
    for (const [uniform, value] of uniformStates) uniform.value = value;
  };
  try {
    if (renderer.info) {
      renderer.info.autoReset = false;
      if (infoAutoReset) renderer.info.reset();
    }
    for (const [object, visible] of renderables) {
      object.visible = visible && !outlineSet.has(object);
    }
    renderer.render(scene, camera);
    renderer.autoClear = false;
    scene.background = null;
    renderer.clearDepth();
    for (const [object, visible] of renderables) {
      object.visible = visible && occluderSet.has(object);
      if (!object.visible) continue;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material || materialStates.has(material)) continue;
        materialStates.set(material, {
          colorWrite: material.colorWrite,
          depthWrite: material.depthWrite,
          depthTest: material.depthTest,
          forceSinglePass: material.forceSinglePass,
          polygonOffset: material.polygonOffset,
          polygonOffsetFactor: material.polygonOffsetFactor,
          polygonOffsetUnits: material.polygonOffsetUnits,
        });
        material.colorWrite = false;
        material.depthWrite = true;
        material.depthTest = true;
        // Both triangle orientations write the same nearest structural depth.
        // Three's separate front/back transparency draws cannot add information
        // here because this pass writes no color and keeps depth testing enabled.
        material.forceSinglePass = true;
        const normalStrength =
          material.userData?.waferCadGpuRough?.uniforms?.waferCadRoughNormalStrength;
        if (normalStrength && !uniformStates.has(normalStrength)) {
          uniformStates.set(normalStrength, normalStrength.value);
          // Micro-normal shading affects lighting only. Structural depth needs
          // the original displaced vertices and no fragment profile derivatives.
          normalStrength.value = 0;
        }
        // Bias surface depth away from its coincident physical contour. This
        // resolves raster precision only; hidden lines still require GreaterDepth.
        material.polygonOffset = true;
        material.polygonOffsetFactor = 1;
        material.polygonOffsetUnits = 1;
      }
    }
    renderer.render(scene, camera);
    restoreMaterials();
    for (const [object, visible] of renderables) {
      object.visible = visible && outlineSet.has(object);
    }
    renderer.render(scene, camera);
    return true;
  } finally {
    restoreMaterials();
    for (const [object, visible] of renderables) object.visible = visible;
    scene.background = background;
    renderer.autoClear = autoClear;
    if (renderer.info) renderer.info.autoReset = infoAutoReset;
  }
}
