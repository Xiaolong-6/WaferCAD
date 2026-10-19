/**
 * Hu et al., Nature Communications 16, 331 (2025), DOI 10.1038/s41467-024-55528-9
 * FIRST PASS: Fig. S8a TOP-VIEW TOPOLOGY, read together with Fig. 1c and S6/S7/S9.
 * In physical Âµm, X transverse / Y actuation. Inferred XY routing is never author GDS.
 * This replaces, rather than tweaks, the rejected ring/stacked-comb mask concept.
 * Stage 1: 220nm Si only. Cr/Au, BOX release and any conformal shared contour deferred.
 */
export const SWX_S8_PROVENANCE = Object.freeze({
  source: 'main Fig1c, supplemental S1/S2/S6-S9; topology from S8a top view',
  dimensionsFromPaperUm: {
    silicon: 0.22,
    box: 2,
    shuttleWidth: 6,
    offAirGap: 0.9,
    onAirGap: 0.015,
    swtPeriod: 0.29,
    swtDepth: 0.3,
    combFingerLength: 3.2,
    combFingerWidth: 0.5,
    combLateralGap: 0.3,
    springLong: 30,
    springShort: 22,
    springBeam: 0.2,
    springGap: 1.5,
    meanderWidth: 0.4,
    meanderR1: 5,
    meanderR2: 3,
    meanderStraight: 15,
    structuralAlignerLength: 7,
    structuralAlignerWidth: 0.1,
    stationaryCombHandleWidth: 6,
    movingCombHandleWidth: 3,
    mmiLength: 19.54,
    mmiWidth: 2.68,
    opticalTaperLength: 6,
    singleModeWidth: 0.4,
  },
  inferred: [
    'all global XY coordinates',
    'teeth count and starting phase',
    'spring station separation',
    'comb-to-shuttle link locations',
    'optical taper contour',
    'individual release holes',
    'pad metal boundaries',
    'mechanical stopper locations and width; travel derived from source gaps',
    'grating coupler pitch, duty, aperture, radius and groove count; optical design unvalidated',
    'anchor pad extent and BOX pedestal retention; release time not calibrated',
  ],
  excludedUntilSiliconVisualAcceptance: [
    'large yellow perimeter as Au',
    'conformal deposited CrAu',
    'BOX cavity undercut',
    '64x64 full Benes array',
    'claimed author-equivalent 95x100um mask',
  ],
});

export function buildSwxS8SiliconMask() {
  const elements = [],
    parts = new Set([
      'rigidOptical',
      'movableOptical',
      'shuttle',
      'spring',
      'fixedComb',
      'movableComb',
      'anchor',
      'aligner',
      'gratingSupport',
      'gratingGroove',
    ]);
  const add = (name, part, points, evidence = 'inferred FigS8a', layer = 1) => {
    if (
      !parts.has(part) ||
      points.length < 3 ||
      points.some((q) => q.length !== 2 || q.some((x) => !Number.isFinite(x)))
    )
      throw Error('Invalid SWX polygon ' + name);
    elements.push({
      name,
      part,
      kind: 'polygon',
      layer,
      datatype: 0,
      points: points.map((p) => p.map((v) => Math.round(v * 1e6) / 1e6)),
      evidence,
    });
  };
  const rect = (name, part, x, y, w, h, evidence) => {
    if (!(w > 0 && h > 0)) throw Error('Non-positive rectangle ' + name);
    add(
      name,
      part,
      [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ],
      evidence,
    );
  };
  const route = (name, part, points, width, evidence = 'FigS8a topology; XY inferred') => {
    const tangent = points.slice(1).map((q, i) => {
      const p = points[i],
        dx = q[0] - p[0],
        dy = q[1] - p[1],
        length = Math.hypot(dx, dy);
      if (length < 1e-7) throw Error('Zero segment ' + name);
      return [dx / length, dy / length];
    });
    const offsets = points.map((_, i) => {
      const a = tangent[Math.max(0, i - 1)],
        b = tangent[Math.min(i, tangent.length - 1)];
      const nx = -a[1] - b[1],
        ny = a[0] + b[0],
        den = nx * -b[1] + ny * b[0];
      if (Math.abs(den) < 1e-8) throw Error('Reversing stroke ' + name);
      return [(nx * width) / (2 * den), (ny * width) / (2 * den)];
    });
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1],
        q = points[i],
        a = offsets[i - 1],
        b = offsets[i];
      // Mitered joins preserve the optical width. A 0.1nm overlap only at
      // internal joints makes adjacent convex tiles one physical network.
      // End caps are flush: a 1.2um joint must not protrude into SWT valleys.
      const t = tangent[i - 1],
        e0 = i > 1 ? 0.0001 : 0,
        e1 = i < points.length - 1 ? 0.0001 : 0;
      add(
        name + '_' + i,
        part,
        [
          [p[0] + a[0] - e0 * t[0], p[1] + a[1] - e0 * t[1]],
          [q[0] + b[0] + e1 * t[0], q[1] + b[1] + e1 * t[1]],
          [q[0] - b[0] + e1 * t[0], q[1] - b[1] + e1 * t[1]],
          [p[0] - a[0] - e0 * t[0], p[1] - a[1] - e0 * t[1]],
        ],
        evidence,
      );
    }
  };
  const arc = (cx, cy, r, a, b, n = 20) =>
    Array.from({ length: n + 1 }, (_, i) => {
      const t = a + ((b - a) * i) / n;
      return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
    });

  const gratingPort = (label, origin, angle) => {
    const localToWorld = ([x, y]) => [
      origin[0] + x * Math.cos(angle) - y * Math.sin(angle),
      origin[1] + x * Math.sin(angle) + y * Math.cos(angle),
    ];
    const halfAngle = (18 * Math.PI) / 180,
      radius = 22;
    const fan = [[-0.001, -0.2], ...arc(0, 0, radius, -halfAngle, halfAngle, 48), [-0.001, 0.2]];
    add(
      'GRATING_SUPPORT_' + label,
      'gratingSupport',
      fan.map(localToWorld),
      'Fig1c fan topology. Radius 22um and aperture 36deg are unvalidated engineering assumptions',
    );
    for (let i = 0; i < 12; i++) {
      const r = 14 + i * 0.64,
        halfWidth = 0.16;
      const outer = arc(0, 0, r + halfWidth, -halfAngle, halfAngle, 48);
      const inner = arc(0, 0, r - halfWidth, halfAngle, -halfAngle, 48);
      add(
        'GRATING_GROOVE_' + label + '_' + i,
        'gratingGroove',
        [...outer, ...inner].map(localToWorld),
        'Illustrative GC trenches: pitch 640nm, 50% duty, 12 grooves. NOT specified by paper; etch depth unassigned',
        2,
      );
    }
  };

  // S2/S6/S8: open chevrons, not solid diamonds. Facet span and tooth
  // count remain inferred; taper widths/length are from S1 (not author CAD).
  rect(
    'SWX_FIXED_HALF',
    'rigidOptical',
    -1.8,
    38.3,
    3.6,
    0.2,
    'S2 open stationary chevron; facet span inferred',
  );
  rect(
    'SWX_MOVABLE_HALF',
    'movableOptical',
    -1.8,
    36.6,
    3.6,
    0.2,
    'S6 open moving chevron; facet span inferred',
  );
  for (let i = 0; i < 11; i++) {
    const x = (i - 5) * 0.29;
    add(
      'SWT_FIXED_' + i,
      'rigidOptical',
      [
        [x - 0.145, 38.31],
        [x + 0.145, 38.31],
        [x, 38],
      ],
      '290nm period / 300nm depth; count and phase inferred',
    );
    add(
      'SWT_MOVING_' + i,
      'movableOptical',
      [
        [x - 0.145, 36.79],
        [x + 0.145, 36.79],
        [x, 37.1],
      ],
      '290nm period / 300nm depth; count and phase inferred',
    );
  }
  for (const side of [-1, 1]) {
    const label = side < 0 ? 'L' : 'R',
      mirror = (pts) => pts.map(([x, y]) => [side * x, y]);
    // Separate taper polygons keep an open V interior; no triangular fill.
    const shoulder = (name, part, start, end, w0, w1) => {
      const dx = end[0] - start[0],
        dy = end[1] - start[1],
        l = Math.hypot(dx, dy);
      const nx = -dy / l,
        ny = dx / l,
        joint = 0.0002;
      start = [start[0] - (joint * dx) / l, start[1] - (joint * dy) / l];
      end = [end[0] + (joint * dx) / l, end[1] + (joint * dy) / l];
      add(
        name,
        part,
        mirror([
          [start[0] + (nx * w0) / 2, start[1] + (ny * w0) / 2],
          [end[0] + (nx * w1) / 2, end[1] + (ny * w1) / 2],
          [end[0] - (nx * w1) / 2, end[1] - (ny * w1) / 2],
          [start[0] - (nx * w0) / 2, start[1] - (ny * w0) / 2],
        ]),
        'S1: 2.68um multimode width, 6um taper to 0.4um; placement inferred',
      );
    };
    // S1 L2 spans the entire MMI: each half is L2/2, not a guessed
    // shoulder displaced by 2.8um. Rotate the regular cross 45deg and clip
    // its two multimode strips at the reflecting plane.
    const mm = 19.54 / (2 * Math.sqrt(2)),
      taper = 6 / Math.sqrt(2);
    const clip = (poly, y, upper) => {
      const result = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i],
          b = poly[(i + 1) % poly.length];
        const ain = upper ? a[1] >= y : a[1] <= y,
          bin = upper ? b[1] >= y : b[1] <= y;
        if (ain) result.push(a);
        if (ain !== bin) {
          const t = (y - a[1]) / (b[1] - a[1]);
          result.push([a[0] + t * (b[0] - a[0]), y]);
        }
      }
      return result;
    };
    const mmArm = (name, part, y, upper) => {
      const dy = upper ? 1 : -1,
        n = 2.68 / (2 * Math.sqrt(2));
      const start = [-2, y - 2 * dy],
        end = [mm, y + mm * dy];
      add(
        name,
        part,
        mirror(
          clip(
            [
              [start[0] - dy * n, start[1] + n],
              [end[0] - dy * n, end[1] + n],
              [end[0] + dy * n, end[1] - n],
              [start[0] + dy * n, start[1] - n],
            ],
            y,
            upper,
          ),
        ),
        'S1: L2=19.54um full regular crossing, w2=2.68um; split-plane placement inferred',
      );
    };
    mmArm('FIXED_MM_' + label, 'rigidOptical', 38.3, true);
    mmArm('MOVING_MM_' + label, 'movableOptical', 36.8, false);
    shoulder(
      'FIXED_TAPER_' + label,
      'rigidOptical',
      [mm, 38.3 + mm],
      [mm + taper, 38.3 + mm + taper],
      2.68,
      0.4,
    );
    shoulder(
      'MOVING_TAPER_' + label,
      'movableOptical',
      [mm, 36.8 - mm],
      [mm + taper, 36.8 - mm - taper],
      2.68,
      0.4,
    );
    // A declared 0.2nm overlap at taper joints joins convex tiles; the
    // nominal optical taper length remains 6um, width 2.68 to 0.4um.
    const fixedEnd = [mm + taper, 38.3 + mm + taper];
    route('FIXED_WAVEGUIDE_' + label, 'rigidOptical', mirror([fixedEnd, [20.5, 58.8]]), 0.4);
    gratingPort('FIXED_' + label, [side * 20.5, 58.8], side < 0 ? (3 * Math.PI) / 4 : Math.PI / 4);
    // S6: R1 is the 45-degree transition at the reflector shoulder.
    // The outer U faces outwards, the inner U inwards; straight between U's=15um.
    const r1cx = mm + taper + 5 / Math.sqrt(2),
      r1cy = 36.8 - mm - taper + 5 / Math.sqrt(2),
      top = r1cy - 5;
    const transition = arc(r1cx, r1cy, 5, (-3 * Math.PI) / 4, -Math.PI / 2, 24);
    const outerX = 22.5781746,
      innerX = outerX - 15;
    const outer = arc(outerX, top - 3, 3, Math.PI / 2, -Math.PI / 2, 48);
    const inner = arc(innerX, top - 9, 3, Math.PI / 2, (3 * Math.PI) / 2, 48);
    route(
      'S6_R1_' + label,
      'movableOptical',
      mirror(transition),
      0.4,
      'S6 R1=5um tangent 45-degree transition',
    );
    const points = [
      [r1cx, top],
      [outerX, top],
      ...outer.slice(1),
      [innerX, top - 6],
      ...inner.slice(1),
      [38, top - 12],
    ];
    route(
      'S6_MEANDER_' + label,
      'movableOptical',
      mirror(points),
      0.4,
      'S6: two opposite 180deg bends R2=3um, 15um middle straight, w=0.4um',
    );
    gratingPort('MOVING_' + label, [side * 38, top - 12], side < 0 ? Math.PI : 0);
    // S7 aligner: paired 7um horizontal 100nm beams and 1um end truss.
    rect(
      'ALIGNER_UPPER_' + label,
      'aligner',
      side < 0 ? -8.75 : 1.75,
      38.45,
      7,
      0.1,
      'S7 Lb=7um, wb=0.1um; global endpoints inferred',
    );
    rect(
      'ALIGNER_LOWER_' + label,
      'aligner',
      side < 0 ? -8.75 : 1.75,
      36.55,
      7,
      0.1,
      'S7 Lb=7um, wb=0.1um; global endpoints inferred',
    );
    rect(
      'ALIGNER_TRUSS_' + label,
      'aligner',
      side < 0 ? -9.65 : 8.65,
      36.55,
      1,
      2,
      'S7 wt=1um; truss height inferred from reflector OFF position',
    );
  }

  // S8a / SEM3a: a tapered, open triangular nose, closed lattice ends,
  // and comb handles meeting the rails directly. Preserve the central holes.
  const shuttleBottom = -42.8,
    shuttleTop = 33.5;
  rect('SHUTTLE_LEFT_RAIL', 'shuttle', -3, shuttleBottom, 0.55, shuttleTop - shuttleBottom);
  rect('SHUTTLE_RIGHT_RAIL', 'shuttle', 2.45, shuttleBottom, 0.55, shuttleTop - shuttleBottom);
  const lattice = (label, bottom, top, bays) => {
    const pitch = (top - bottom) / bays;
    for (let i = 0; i <= bays; i++) {
      const y = bottom + i * pitch;
      rect('SHUTTLE_BRIDGE_' + label + '_' + i, 'shuttle', -2.75, y, 5.5, 0.5);
      if (i === bays) continue;
      route(
        'SHUTTLE_X_BRACE_' + label + '_' + i,
        'shuttle',
        [
          [-2.725, y + 0.25],
          [2.725, y + pitch + 0.25],
        ],
        0.45,
        'S8a/SEM3a X-braced open bays; lattice pitch inferred',
      );
      route(
        'SHUTTLE_CROSS_BRACE_' + label + '_' + i,
        'shuttle',
        [
          [-2.725, y + pitch + 0.25],
          [2.725, y + 0.25],
        ],
        0.45,
        'S8a/SEM3a X-braced open bays; lattice pitch inferred',
      );
    }
  };
  lattice('BODY', shuttleBottom, 33, 16);
  for (const side of [-1, 1])
    route(
      'SHUTTLE_NOSE_' + (side < 0 ? 'L' : 'R'),
      'shuttle',
      [
        [0, 36.5],
        [side * 2.725, 33.25],
      ],
      0.55,
      'Fig1c/S8a triangular transition from moving reflector into shuttle rails; no solid central post',
    );
  // Two spring stations, BEFORE and AFTER the single paired comb actuator.
  // Four lateral folded spring members link mobile shuttle to anchored frame.
  for (const station of [2, -41]) {
    for (const side of [-1, 1]) {
      const label = side < 0 ? 'L' : 'R',
        mirror = (pts) => pts.map(([x, y]) => [side * x, y]);
      // S7 four parallel beams: two long 30um members, two short 22um
      // returns. A rigid outboard 1um truss closes the folded pair.
      for (const [tag, y, x0, length] of [
        ['LONG_UP', station, 3, 30],
        ['LONG_DOWN', station - 1.7, 3, 30],
        ['SHORT_UP', station + 1.7, 11, 22],
        ['SHORT_DOWN', station - 3.4, 11, 22],
      ]) {
        add(
          'FOLDED_' + station + '_' + label + '_' + tag,
          'spring',
          mirror([
            [x0, y - 0.1],
            [x0 + length, y - 0.1],
            [x0 + length, y + 0.1],
            [x0, y + 0.1],
          ]),
          'S7: 30/22um beam, wb=0.2um, clear gb=1.5um',
        );
      }
      add(
        'FOLDED_TRUSS_' + station + '_' + label,
        'spring',
        mirror([
          [32.9, station - 3.5],
          [33.9, station - 3.5],
          [33.9, station + 1.8],
          [32.9, station + 1.8],
        ]),
        'S7 rigid return truss wt=1um',
      );
      // Separate supported short-beam tips avoid bridging the flexible beams.
      for (const [tag, y] of [
        ['UP', station + 1.7],
        ['DOWN', station - 3.4],
      ]) {
        add(
          'SPRING_ANCHOR_' + station + '_' + label + '_' + tag,
          'anchor',
          mirror([
            [5, y + (tag === 'UP' ? -0.1 : -5.9)],
            [11.05, y + (tag === 'UP' ? -0.1 : -5.9)],
            [11.05, y + (tag === 'UP' ? 5.9 : 0.1)],
            [5, y + (tag === 'UP' ? 5.9 : 0.1)],
          ]),
          'Fig1c/SEM3a anchor land outside the folded-beam channels; 6um support size inferred, not author CAD',
        );
      }
      for (const [tag, y] of [
        ['UP', station],
        ['DOWN', station - 1.7],
      ])
        route(
          'SHUTTLE_SPRING_JOINT_' + station + '_' + label + '_' + tag,
          'spring',
          mirror([
            [2.5, y],
            [3.1, y],
          ]),
          0.2,
        );
    }
  }

  // Fig S8a/S9: ONE actuator station; LEFT and RIGHT mirrored interdigitated
  // comb banks on opposite sides of the central shuttle, between springs.
  // +Y translation INCREASES overlap; 20 sites per bank = 40 total.
  const period = 1.6;
  for (const side of [-1, 1]) {
    const label = side < 0 ? 'L' : 'R';
    const r = (name, part, x, y, w, h, evidence) =>
      rect(name, part, side < 0 ? -x - w : x, y, w, h, evidence);
    r(
      'MOVING_COMB_HANDLE_' + label,
      'movableComb',
      2.75,
      -25.1,
      36.95,
      3,
      'Main Fig2f: moving handle width 3um, fully released',
    );
    r(
      'FIXED_COMB_HANDLE_' + label,
      'fixedComb',
      7.7,
      -16.7,
      32,
      6,
      'Main Fig2f: stationary handle width 6um, BOX retained',
    );
    for (let i = 0; i < 20; i++) {
      const x = 8 + i * period;
      r(
        'MOVING_FINGER_' + label + '_' + i,
        'movableComb',
        x + 0.8,
        -22.4,
        0.5,
        3.2,
        '3.2x0.5um; both neighboring lateral gaps 300nm',
      );
      r(
        'FIXED_FINGER_' + label + '_' + i,
        'fixedComb',
        x,
        -19.4,
        0.5,
        3.2,
        'S9: Lc=3.2um, bc=0.5um, dc1=dc2=0.3um, ac=3um',
      );
    }
    // S2 requires mechanical stops. This inferred placement reaches contact
    // after 0.885um travel, leaving 15nm between the optical tooth tips.
    r(
      'STOP_FIXED_' + label,
      'rigidOptical',
      1.75,
      38,
      0.12,
      0.32,
      'S2 stopper function; location and 120nm width inferred, travel derived',
    );
    r(
      'STOP_MOVING_' + label,
      'movableOptical',
      1.75,
      36.78,
      0.12,
      0.335,
      'S2 stopper function; location/width inferred, root overlaps moving facet',
    );
  }

  const bounds = elements.reduce(
    (r, e) => {
      for (const p of e.points)
        r = [
          Math.min(r[0], p[0]),
          Math.min(r[1], p[1]),
          Math.max(r[2], p[0]),
          Math.max(r[3], p[1]),
        ];
      return r;
    },
    [Infinity, Infinity, -Infinity, -Infinity],
  );
  return {
    root: 'SWX_S8_SILICON_P0',
    name: 'SWX single-cell Fig S8a primary-silicon reconstruction',
    units: { xy: 'Âµm', dbuToMicron: 1, hasPhysicalUnits: true },
    stage: 'SILICON_PLUS_UNVALIDATED_IO__RECONSTRUCTION_DRAFT',
    contours: { outerYellowMetal: null, release: null },
    masks: [
      { name: 'TOP_SI_KEEP_220NM', layer: 1, datatype: 0 },
      { name: 'GC_TRENCH_XY__DEPTH_UNSPECIFIED__UNVALIDATED', layer: 2, datatype: 0 },
    ],
    elements,
    ioAssumptions: {
      radius: 22,
      apertureDegrees: 36,
      pitch: 0.64,
      duty: 0.5,
      grooves: 12,
      etchDepth: null,
      validated: false,
    },
    bounds: {
      minX: bounds[0],
      minY: bounds[1],
      maxX: bounds[2],
      maxY: bounds[3],
      width: bounds[2] - bounds[0],
      height: bounds[3] - bounds[1],
    },
    provenance: SWX_S8_PROVENANCE,
    expectedTopology: {
      shuttleOrientation: 'longitudinal_Y',
      combBanks: ['LEFT', 'RIGHT'],
      combStations: 1,
      springStations: [2, -41],
      opticalFront: 'positive_Y',
      deferred: ['BOX release', 'Cr/Au metallurgy', 'yellow perimeter'],
    },
  };
}
