import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { applyOperation, createModel } = await import('../model.js');
const { rectMulti, unionGeometries } = await import('../vector-geometry.js');
const { validateProcessModel } = await import('../project-schema.js');

const packageRoot = new URL('../../examples/projects/m3d-selfpowered-2026-candidate/', import.meta.url);

async function text(relative) {
  return readFile(new URL(relative, packageRoot), 'utf8');
}

function rects(svg) {
  return [...svg.matchAll(/<rect\s([^>]+)>?/g)].map((match) => {
    const attrs = Object.fromEntries(
      [...match[1].matchAll(/([\w]+)="([^"]*)"/g)].map((item) => [item[1], item[2]]),
    );
    return {
      x: Number(attrs.x),
      y: Number(attrs.y),
      w: Number(attrs.width),
      h: Number(attrs.height),
    };
  });
}

function overlap(a, b) {
  return (
    Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) &&
    Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y)
  );
}

function contains(a, b, epsilon = 1e-9) {
  return (
    a.x <= b.x + epsilon &&
    a.y <= b.y + epsilon &&
    a.x + a.w >= b.x + b.w - epsilon &&
    a.y + a.h >= b.y + b.h - epsilon
  );
}

function areaFromRects(items) {
  return unionGeometries(
    items.map(({ x, y, w, h }) => rectMulti(w, h, x + w / 2 - 14, y + h / 2 - 9)),
  );
}

async function maskArea(name) {
  return areaFromRects(rects(await text(`masks/${name}`)));
}

test('M3D v2 masks keep published channels and corrected electrical landings', async () => {
  const [pvm, rail, via, gate, open, wse, mos, wseSd, bridge, via2, graphene] =
    await Promise.all([
      text('masks/PVM_M01_Si_channel_etch.svg'),
      text('masks/M3D_M04_power_rail.svg'),
      text('masks/M3D_M05_power_via_open_ILD1.svg'),
      text('masks/M3D_M06_local_back_gate.svg'),
      text('masks/M3D_M07_HfO2_open.svg'),
      text('masks/M3D_M08_WSe2_channel.svg'),
      text('masks/M3D_M11_MoS2_channel.svg'),
      text('masks/M3D_M09_WSe2_SD.svg'),
      text('masks/M3D_M12_MoS2_SD_bridge.svg'),
      text('masks/M3D_M13_ILD2_data_power_via_open.svg'),
      text('masks/M3D_M15_graphene_SD_via_connect.svg'),
    ]);

  const pvmRects = rects(pvm),
    rails = rects(rail),
    vias = rects(via),
    gates = rects(gate),
    openings = rects(open),
    wseChannels = rects(wse),
    mosChannels = rects(mos),
    wseMetal = rects(wseSd),
    bridgeMetal = rects(bridge),
    tier3Vias = rects(via2),
    grapheneMetal = rects(graphene);

  assert.equal(pvmRects.length, 4, 'PVM M01 must describe the removable frame, not the island');
  for (const viaRect of vias) {
    assert.ok(
      rails.some((railRect) => contains(railRect, viaRect)),
      'each 5 x 5 um power via needs a full Pt landing',
    );
  }
  for (const opening of openings.slice(2)) {
    assert.ok(
      gates.some((gateRect) => contains(gateRect, opening)),
      'HfO2 gate-pad openings must stay inside gate metal',
    );
  }
  for (const channel of [...wseChannels, ...mosChannels]) {
    assert.equal(channel.w, 0.2);
    assert.equal(channel.h, 0.5);
  }
  assert.ok(
    bridgeMetal.some((a) => wseMetal.some((b) => overlap(a, b))),
    'bridge must overlap WSe2 landing metal',
  );
  assert.ok(
    bridgeMetal.some((a) => vias.some((b) => overlap(a, b))),
    'bridge must overlap a tier-1 power-via footprint',
  );
  assert.ok(
    bridgeMetal.some((a) => overlap(a, tier3Vias[0])),
    'bridge must overlap the central data-via footprint',
  );
  assert.ok(
    grapheneMetal.some((a) => overlap(a, tier3Vias[0])),
    'graphene metal must overlap the central data via',
  );
  assert.ok(
    grapheneMetal.some((a) => overlap(a, tier3Vias[1])),
    'graphene metal must overlap the lower power via',
  );
  assert.ok(
    grapheneMetal.some((a) => overlap(a, tier3Vias[2])),
    'graphene metal must overlap the upper power via',
  );
});

test('representative M3D stack reaches the final 70 nm conformal Al2O3 step', async () => {
  const [
      powerRail,
      via1,
      gates,
      hfOpen,
      wseChannel,
      wseMetal,
      wseCap,
      mosChannel,
      mosBridge,
      via2,
      grapheneChannel,
      grapheneMetal,
    ] = await Promise.all([
      maskArea('M3D_M04_power_rail.svg'),
      maskArea('M3D_M05_power_via_open_ILD1.svg'),
      maskArea('M3D_M06_local_back_gate.svg'),
      maskArea('M3D_M07_HfO2_open.svg'),
      maskArea('M3D_M08_WSe2_channel.svg'),
      maskArea('M3D_M09_WSe2_SD.svg'),
      maskArea('M3D_M10_WSe2_cap.svg'),
      maskArea('M3D_M11_MoS2_channel.svg'),
      maskArea('M3D_M12_MoS2_SD_bridge.svg'),
      maskArea('M3D_M13_ILD2_data_power_via_open.svg'),
      maskArea('M3D_M14_graphene_channel.svg'),
      maskArea('M3D_M15_graphene_SD_via_connect.svg'),
    ]),
    model = createModel({ shape: 'rect', width: 28, height: 18, thickness: 1 });

  applyOperation(model, {
    type: 'add',
    name: 'Pt power rail',
    thickness: 0.07,
    face: 'front',
    area: powerRail,
    growth: 'direct',
  });
  const ild1 = applyOperation(model, {
    type: 'add',
    name: 'ILD1',
    thickness: 0.1,
    face: 'front',
    area: model.boundary,
    growth: 'conformal',
  });
  applyOperation(model, {
    type: 'etch',
    thickness: 0.2,
    face: 'front',
    area: via1,
    etchTargetLayerIds: [ild1.layerId],
    etchProfile: 'directional',
  });
  applyOperation(model, {
    type: 'add',
    name: 'Ti via 1',
    thickness: 0.12,
    face: 'front',
    area: via1,
    growth: 'direct',
  });
  applyOperation(model, {
    type: 'add',
    name: 'Local gates',
    thickness: 0.02,
    face: 'front',
    area: gates,
    growth: 'direct',
  });
  const hfo2 = applyOperation(model, {
    type: 'add',
    name: 'HfO2',
    thickness: 0.01,
    face: 'front',
    area: model.boundary,
    growth: 'conformal',
  });
  applyOperation(model, {
    type: 'etch',
    thickness: 0.02,
    face: 'front',
    area: hfOpen,
    etchTargetLayerIds: [hfo2.layerId],
    etchProfile: 'directional',
  });
  applyOperation(model, {
    type: 'add',
    name: 'WSe2',
    thickness: 0.0007,
    face: 'front',
    area: wseChannel,
    growth: 'transfer',
    transferMode: 'follow',
  });
  applyOperation(model, {
    type: 'add',
    name: 'WSe2 metal',
    thickness: 0.04,
    face: 'front',
    area: wseMetal,
    growth: 'direct',
  });
  applyOperation(model, {
    type: 'add',
    name: 'WSe2 cap',
    thickness: 0.02,
    face: 'front',
    area: wseCap,
    growth: 'direct',
  });
  applyOperation(model, {
    type: 'add',
    name: 'MoS2',
    thickness: 0.0007,
    face: 'front',
    area: mosChannel,
    growth: 'transfer',
    transferMode: 'follow',
  });
  applyOperation(model, {
    type: 'add',
    name: 'MoS2 bridge',
    thickness: 0.04,
    face: 'front',
    area: mosBridge,
    growth: 'direct',
  });
  const ild2 = applyOperation(model, {
    type: 'add',
    name: 'ILD2',
    thickness: 0.05,
    face: 'front',
    area: model.boundary,
    growth: 'conformal',
  });
  applyOperation(model, {
    type: 'etch',
    thickness: 0.1,
    face: 'front',
    area: via2,
    etchTargetLayerIds: [ild2.layerId],
    etchProfile: 'directional',
  });
  applyOperation(model, {
    type: 'add',
    name: 'Tier 3 vias',
    thickness: 0.06,
    face: 'front',
    area: via2,
    growth: 'direct',
  });
  applyOperation(model, {
    type: 'add',
    name: 'Graphene',
    thickness: 0.00035,
    face: 'front',
    area: grapheneChannel,
    growth: 'transfer',
    transferMode: 'follow',
  });
  applyOperation(model, {
    type: 'add',
    name: 'Graphene metal',
    thickness: 0.06,
    face: 'front',
    area: grapheneMetal,
    growth: 'direct',
  });

  validateProcessModel(model);
  const finalCap = applyOperation(model, {
    type: 'add',
    name: 'Final Al2O3',
    thickness: 0.07,
    face: 'front',
    area: model.boundary,
    growth: 'conformal',
  });
  assert.equal(finalCap.changed, true, finalCap.error);
  validateProcessModel(model);
});
