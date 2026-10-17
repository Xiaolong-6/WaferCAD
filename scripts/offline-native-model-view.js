// Playwright page.evaluate expression. Independent production Three.js instance.
// It does not assign live Workstation state, bypass Recovery or replace Worker.
async ({ model: providedModel, demo = false, roiBounds = null, zBreak = null }) => {
  const [{ createThreeView }, { buildRenderSurfacePlan, rememberRenderSurfacePlan }] =
    await Promise.all([
      import('https://wafercad.local/three-view.js'),
      import('https://wafercad.local/renderer-geometry.js'),
    ]);
  let model = providedModel;
  if (demo) {
    const [{ createModel }, { rectMulti, difference, unionGeometries }] = await Promise.all([
      import('https://wafercad.local/model.js'),
      import('https://wafercad.local/vector-geometry.js'),
    ]);
    model = createModel({ shape: 'rect', width: 200, height: 120, thickness: 10 });
    const metal = rectMulti(72, 60, -48, 0);
    const oxide = rectMulti(50, 50, 46, 13);
    const base = model.regions[0].stack[0];
    model.layers.push({ id: 'offline-metal', name: 'Metal', color: '#d18c27', visible: true });
    model.layers.push({ id: 'offline-oxide', name: 'Oxide', color: '#508bbf', visible: true });
    model.regions = [
      { id: 'base', geom: difference(model.boundary, unionGeometries([metal, oxide])), stack: [base] },
      { id: 'metal-pad', geom: metal, stack: [base, { layerId: 'offline-metal', z0: 5, z1: 17 }] },
      { id: 'oxide-pad', geom: oxide, stack: [base, { layerId: 'offline-oxide', z0: 5, z1: 12 }] },
    ];
    model.revision++;
  }
  if (!model || !Array.isArray(model.regions)) throw Error('No validated model was provided.');

  // Diagnostic-only XY crop and Z break expose sub-micron texture that is
  // unresolvable in the 7000-um-wide, 350-um-thick full-device overview.
  const clip = roiBounds
    ? (await import('https://wafercad.local/vector-geometry.js')).rectMulti(
        roiBounds[2] - roiBounds[0], roiBounds[3] - roiBounds[1],
        (roiBounds[2] + roiBounds[0]) / 2, (roiBounds[3] + roiBounds[1]) / 2)
    : null;
  const collapse = zBreak ? { enabled: true, top: zBreak[0], bottom: zBreak[1] } : null;
  const plan = buildRenderSurfacePlan(model, clip);
  if (!plan.caps?.length && !plan.sidewalls?.length) throw Error('No visible material geometry.');
  rememberRenderSurfacePlan(model, clip, plan);

  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:40px 60px 40px 270px;z-index:9999;background:#f5f7f9;' +
    'border:3px solid #555;border-radius:12px;box-shadow:0 5px 40px #777;';
  const title = document.createElement('div');
  title.textContent = demo
    ? 'WaferCAD production Three.js — in-memory three-material demo'
    : 'WaferCAD production Three.js — validated project model (isolated viewport)';
  title.style.cssText = 'padding:10px 18px;color:#2a3035;font:600 18px sans-serif;';
  const host = document.createElement('div');
  host.style.cssText = 'position:relative;width:100%;height:calc(100% - 70px);';
  const stats = document.createElement('div');
  stats.style.cssText = 'position:absolute;bottom:12px;left:12px;z-index:1;font:14px sans-serif;';
  overlay.append(title, host);
  host.append(stats);
  document.body.append(overlay);
  const renderer = createThreeView({
    host,
    stats,
    getModel: () => model,
    getClipGeometry: () => clip,
    getZCollapse: () => collapse,
    getInspection: () => ({ opacity: 1, borders: true, fast: true }),
  });
  const initialized = await renderer.init();
  // init() already schedules a full native scene build; another render()
  // during that build supersedes the rough-mesh refinement.
  window.__wafercadOfflineModel = { model, host, renderer };
  return {
    initialized,
    roiBounds,
    zBreak,
    roughCaps: plan.caps.filter((cap) => cap.appearance?.kind === 'rough').length,
    exposedRoughCaps: plan.caps.filter((cap) => !cap.buried && cap.appearance?.kind === 'rough').length,
    layers: model.layers.length,
    regions: model.regions.length,
    caps: plan.caps.length,
    sidewalls: plan.sidewalls.length,
    isolatedViewport: true,
    workstationStateLoaded: false,
  };
}
