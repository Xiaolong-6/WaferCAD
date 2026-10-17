// World-aligned decorative canvas grid shared by the Main and Mask plan views.
export function niceGridStep(scale, minimumPixels = 26) {
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const targetWorld = minimumPixels / scale;
  const decade = 10 ** Math.floor(Math.log10(targetWorld));
  const factor = [1, 2, 5, 10].find((value) => value * decade >= targetWorld * (1 - 1e-12));
  return factor * decade;
}

export function drawPlanGrid(ctx, view, width, height, worldToCanvas, palette) {
  const stepWorld = niceGridStep(view.s);
  if (!stepWorld || !(width > 0 && height > 0)) return;
  const stepPx = stepWorld * view.s;
  const [originX, originY] = worldToCanvas([0, 0], view, false);
  if (!Number.isFinite(originX) || !Number.isFinite(originY)) return;

  const paths = { minor: [], major: [], axis: [] };
  const collect = (origin, extent, vertical) => {
    const first = Math.ceil((0 - origin) / stepPx);
    const last = Math.floor((extent - origin) / stepPx);
    for (let offset = 0; offset < Math.min(last - first + 1, 200); offset++) {
      const index = first + offset;
      const pixel = Math.round(origin + index * stepPx) + 0.5;
      const kind = index === 0 ? 'axis' : index % 5 === 0 ? 'major' : 'minor';
      paths[kind].push(vertical ? [pixel, 0, pixel, height] : [0, pixel, width, pixel]);
    }
  };
  collect(originX, width, true);
  collect(originY, height, false);

  ctx.save();
  for (const kind of ['minor', 'major', 'axis']) {
    if (!paths[kind].length) continue;
    ctx.beginPath();
    for (const [x0, y0, x1, y1] of paths[kind]) {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = palette[kind];
    ctx.stroke();
  }
  ctx.restore();
}
