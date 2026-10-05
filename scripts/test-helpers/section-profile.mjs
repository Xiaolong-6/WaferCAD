import assert from 'node:assert/strict';

// Exercise the production Section renderer in Chromium, including its Detail
// transform. Capture actual canvas paths/gradients to measure registration
// independently of screenshots, palettes and antialiasing.
export async function checkRoughSectionDetail(
  page,
  project,
  rendererSource = null,
  sidewallProbe = false,
) {
  const observations = await page.evaluate(
    async ({ project, rendererSource, sidewallProbe }) => {
      const { expandProjectStorage } = await import('/project-io.js');
      expandProjectStorage(project);
      const moduleUrl = rendererSource
        ? URL.createObjectURL(
            new Blob(
              [
                rendererSource.replace(
                  /from '\.\/([^']+)'/g,
                  (_, path) => `from '${location.origin}/${path}'`,
                ),
              ],
              { type: 'text/javascript' },
            ),
          )
        : '/plan-renderers.js';
      const { createPlanRenderers } = await import(moduleUrl);
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 240;
      canvas.style.cssText = 'width:600px;height:240px';
      document.body.append(canvas);
      const ctx = canvas.getContext('2d'),
        fills = [],
        clips = [],
        columns = [],
        gradients = new WeakMap();
      let path = [];
      const begin = ctx.beginPath.bind(ctx),
        move = ctx.moveTo.bind(ctx),
        line = ctx.lineTo.bind(ctx),
        fill = ctx.fill.bind(ctx),
        clip = ctx.clip.bind(ctx),
        rect = ctx.fillRect.bind(ctx),
        gradient = ctx.createLinearGradient.bind(ctx);
      ctx.beginPath = () => {
        path = [];
        begin();
      };
      ctx.moveTo = (x, y) => {
        path.push([x, y]);
        move(x, y);
      };
      ctx.lineTo = (x, y) => {
        path.push([x, y]);
        line(x, y);
      };
      ctx.fill = (...args) => {
        fills.push({ color: String(ctx.fillStyle), path: [...path] });
        fill(...args);
      };
      ctx.clip = (...args) => {
        clips.push([...path]);
        clip(...args);
      };
      ctx.createLinearGradient = (x0, y0, x1, y1) => {
        const value = gradient(x0, y0, x1, y1);
        gradients.set(value, { y0, y1 });
        return value;
      };
      ctx.fillRect = (x, y, w, h) => {
        if (gradients.has(ctx.fillStyle))
          columns.push({ x, width: w, ...gradients.get(ctx.fillStyle) });
        rect(x, y, w, h);
      };
      const renderer = createPlanRenderers({
        getState: () => ({
          model: project.model,
          section: project.section,
          sectionScaleMode: 'auto',
          sectionShowBorders: false,
          sectionCollapse: project.display.sectionCollapse,
        }),
        setupCanvas: () => ({ ctx, w: 600, h: 240 }),
      });
      renderer.renderSectionDetail(canvas, { x: 0.89, y: 0.02, width: 0.08, height: 0.35 });
      const base = fills.find(
          (f) =>
            f.color === project.model.layers.find((l) => l.id === 'base').color.toLowerCase() &&
            f.path.length > 30,
        ),
        coat = fills.find(
          (f) =>
            f.color === project.model.layers.find((l) => l.id === 'layer-2').color.toLowerCase() &&
            f.path.length > 30,
        ),
        implant =
          clips.find((p) => p.length > 30) ||
          fills.find((f) => f.color === '[object CanvasGradient]' && f.path.length > 30)?.path;
      const walls = fills.filter(
          (f) =>
            f.color === project.model.layers.find((l) => l.id === 'layer-2').color.toLowerCase() &&
            f.path.length === 4,
        ),
        wallWidths = walls.map(
          (f) => Math.max(...f.path.map((p) => p[0])) - Math.min(...f.path.map((p) => p[0])),
        ),
        aid = walls[wallWidths.findIndex((width) => Math.abs(width - 3) < 1e-6)],
        source = walls[wallWidths.findIndex((width) => width < 2 && width > 1)];
      const result = {
        base: base?.path,
        coat: coat?.path,
        implant,
        columns,
        image: canvas.toDataURL(),
        wallAid: aid?.path,
        wallSource: source?.path,
      };
      canvas.remove();
      if (rendererSource) URL.revokeObjectURL(moduleUrl);
      return result;
    },
    { project, rendererSource, sidewallProbe },
  );
  assert.ok(
    observations.base && observations.coat && observations.implant,
    'Detail must contain rough Si, ALD and Implant',
  );
  const half = (points) => points.length / 2,
    baseTop = observations.base.slice(half(observations.base)).toReversed(),
    coatBottom = observations.coat.slice(0, half(observations.coat)),
    coatTop = observations.coat.slice(half(observations.coat)).toReversed(),
    implantTop = observations.implant.slice(0, half(observations.implant));
  assert.ok(
    baseTop.length > 100,
    'Detail must spend its sampling budget on the visible rough surface',
  );
  const interior = (points) => points.slice(1, -1),
    byX = (points) => new Map(interior(points).map(([x, y]) => [x.toFixed(6), y])),
    baseYs = byX(baseTop),
    distances = interior(coatBottom).map(([x, y]) => {
      const hostY = baseYs.get(x.toFixed(6));
      assert.ok(Number.isFinite(hostY), 'ALD and Si must share every interior sample X');
      assert.ok(Math.abs(hostY - y) < 1e-7, 'ALD lower surface must follow Si exactly');
      return y - coatTop.find(([tx]) => Math.abs(tx - x) < 1e-7)[1];
    });
  assert.ok(Math.min(...distances) > 0, 'ALD must retain its thickness');
  assert.ok(
    Math.max(...distances) - Math.min(...distances) < 1e-7,
    'ALD top and bottom must have identical relief',
  );
  for (const [x, y] of interior(implantTop)) {
    assert.ok(
      Math.abs(baseYs.get(x.toFixed(6)) - y) < 1e-7,
      'Implant boundary must follow the Si surface',
    );
  }
  assert.ok(
    observations.columns.length > 100,
    'Rough Implant needs locally varying depth gradients',
  );
  let compared = 0;
  for (const { x, y0 } of observations.columns) {
    const index = implantTop.findIndex(([px]) => px > x + 0.5);
    if (index < 1) continue;
    const [lx, ly] = implantTop[index - 1],
      [rx, ry] = implantTop[index],
      expected = ly + ((ry - ly) * (x + 0.5 - lx)) / (rx - lx);
    assert.ok(
      Math.abs(expected - y0) < 1e-7,
      `Implant concentration depth must follow the local relief: x=${x} expected=${expected} actual=${y0}`,
    );
    compared++;
  }
  assert.ok(compared > 100);
  if (sidewallProbe) {
    assert.ok(
      observations.wallAid && observations.wallSource,
      'Thin rough sidewall requires a visibility aid',
    );
    for (const index of [0, 1]) {
      assert.ok(
        Math.abs(observations.wallAid[index][1] - observations.wallSource[index][1]) < 1e-7,
        'The widened ALD wall must stop at the actual rough Si floor',
      );
    }
  }
  return { samples: baseTop.length, gradientColumns: compared, image: observations.image };
}
