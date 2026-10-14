// Transport-only framing for exact Process Geometry Kernel surface plans.
// Stream bounded collections; never round coordinates or publish partial plans.
const CAP_BATCH = 24;
const POLYGON_BATCH = 12;
const POINT_BUDGET = 4096;
const SIDEWALL_BATCH = 64;
const BORDER_BATCH = 128;

export function shouldStreamSurfacePlan(plan) {
  if (!plan || !Array.isArray(plan.caps) || !Array.isArray(plan.sidewalls)) return false;
  const partCount = plan.caps.length + plan.sidewalls.length + (plan.borderLines?.length || 0);
  if (partCount >= 128) return true;
  let points = 0;
  for (const cap of plan.caps) {
    for (const poly of cap.polys || []) {
      for (const ring of poly || []) {
        points += ring.length;
        if (points >= POINT_BUDGET) return true;
      }
    }
  }
  return false;
}

export function* surfacePlanStreamPackets(plan) {
  const { caps, sidewalls, borderLines = [], ...meta } = plan;
  if (!Array.isArray(caps) || !Array.isArray(sidewalls) || !Array.isArray(borderLines)) {
    throw new Error('Invalid surface plan for streamed transport');
  }
  const polygonCounts = caps.map((cap) => (Array.isArray(cap.polys) ? cap.polys.length : 0));
  yield {
    id: 1,
    type: 'stream-start',
    meta,
    counts: { caps: caps.length, sidewalls: sidewalls.length, borderLines: borderLines.length },
    polygonCounts,
  };

  for (let startIndex = 0; startIndex < caps.length; startIndex += CAP_BATCH) {
    const batch = caps.slice(startIndex, startIndex + CAP_BATCH).map((cap) => {
      if (!Array.isArray(cap.polys)) return { ...cap };
      return { ...cap, polys: [] };
    });
    yield { id: 1, type: 'stream-caps', startIndex, items: batch };
  }

  for (let capIndex = 0; capIndex < caps.length; capIndex++) {
    const polygons = caps[capIndex].polys;
    if (!Array.isArray(polygons)) continue;
    let batch = [];
    let pointCount = 0;
    for (let polyIndex = 0; polyIndex < polygons.length; polyIndex++) {
      const poly = polygons[polyIndex];
      const polyPoints = (poly || []).reduce((sum, ring) => sum + (ring?.length || 0), 0);
      if (polyPoints > POINT_BUDGET) {
        // Never send an oversized polygon in one structured-clone message.
        // A polygon may contain a single enormous ring or many hole rings;
        // both must preserve original point order and exact numeric values.
        if (batch.length) yield { id: 1, type: 'stream-cap-polys', capIndex, polys: batch };
        batch = [];
        pointCount = 0;
        yield { id: 1, type: 'stream-big-poly-start', capIndex, polyIndex, ringCount: poly.length };
        for (let ringIndex = 0; ringIndex < poly.length; ringIndex++) {
          const ring = poly[ringIndex];
          yield {
            id: 1,
            type: 'stream-big-ring-start',
            capIndex,
            polyIndex,
            ringIndex,
            pointCount: ring.length,
          };
          for (let startIndex = 0; startIndex < ring.length; startIndex += POINT_BUDGET) {
            yield {
              id: 1,
              type: 'stream-big-ring-points',
              capIndex,
              polyIndex,
              ringIndex,
              startIndex,
              points: ring.slice(startIndex, startIndex + POINT_BUDGET),
            };
          }
        }
        yield { id: 1, type: 'stream-big-poly-done', capIndex, polyIndex };
        continue;
      }
      if (
        batch.length &&
        (batch.length >= POLYGON_BATCH || pointCount + polyPoints > POINT_BUDGET)
      ) {
        yield { id: 1, type: 'stream-cap-polys', capIndex, polys: batch };
        batch = [];
        pointCount = 0;
      }
      batch.push(poly);
      pointCount += polyPoints;
    }
    if (batch.length) yield { id: 1, type: 'stream-cap-polys', capIndex, polys: batch };
  }

  for (const [key, items, batchSize] of [
    ['sidewalls', sidewalls, SIDEWALL_BATCH],
    ['borderLines', borderLines, BORDER_BATCH],
  ]) {
    for (let startIndex = 0; startIndex < items.length; startIndex += batchSize) {
      yield {
        id: 1,
        type: 'stream-items',
        key,
        startIndex,
        items: items.slice(startIndex, startIndex + batchSize),
      };
    }
  }
  yield { id: 1, type: 'stream-done' };
}

// A transaction is invisible to consumers until every expected part arrives.
// Reject malformed ordering/counts rather than accepting a truncated scene.
export function createSurfacePlanStreamReceiver() {
  let state = null;
  let bigPolygon = null;
  return {
    accept(packet) {
      if (packet?.type === 'stream-start') {
        if (state) throw new Error('Duplicate surface-plan stream start');
        const counts = packet.counts;
        if (
          !counts ||
          !['caps', 'sidewalls', 'borderLines'].every(
            (key) => Number.isSafeInteger(counts[key]) && counts[key] >= 0,
          ) ||
          !Array.isArray(packet.polygonCounts) ||
          packet.polygonCounts.length !== counts.caps ||
          !packet.polygonCounts.every((n) => Number.isSafeInteger(n) && n >= 0)
        ) {
          throw new Error('Invalid surface-plan stream header');
        }
        state = {
          counts,
          polygonCounts: packet.polygonCounts,
          plan: { ...packet.meta, caps: [], sidewalls: [], borderLines: [] },
        };
        return null;
      }
      if (!state) throw new Error('Surface-plan packet without stream header');
      const { counts, plan } = state;
      if (packet.type === 'stream-caps') {
        if (
          bigPolygon ||
          packet.startIndex !== plan.caps.length ||
          !Array.isArray(packet.items) ||
          plan.caps.length + packet.items.length > counts.caps
        ) {
          throw new Error('Out-of-order surface-plan caps');
        }
        plan.caps.push(...packet.items);
      } else if (packet.type === 'stream-cap-polys') {
        const cap = plan.caps[packet.capIndex];
        if (
          bigPolygon ||
          !cap ||
          !Array.isArray(cap.polys) ||
          !Array.isArray(packet.polys) ||
          cap.polys.length + packet.polys.length > state.polygonCounts[packet.capIndex]
        ) {
          throw new Error('Invalid surface-plan cap polygons');
        }
        cap.polys.push(...packet.polys);
      } else if (packet.type === 'stream-big-poly-start') {
        const cap = plan.caps[packet.capIndex];
        if (
          bigPolygon ||
          !Array.isArray(cap?.polys) ||
          !Number.isSafeInteger(packet.polyIndex) ||
          packet.polyIndex !== cap.polys.length ||
          cap.polys.length >= state.polygonCounts[packet.capIndex] ||
          !Number.isSafeInteger(packet.ringCount) ||
          packet.ringCount < 1
        ) {
          throw new Error('Invalid large polygon stream start');
        }
        cap.polys.push([]);
        bigPolygon = {
          capIndex: packet.capIndex,
          polyIndex: packet.polyIndex,
          ringCount: packet.ringCount,
          ringsFinished: 0,
          ringOpen: false,
          expectedPoints: 0,
        };
      } else if (packet.type === 'stream-big-ring-start') {
        if (
          !bigPolygon ||
          packet.capIndex !== bigPolygon.capIndex ||
          packet.polyIndex !== bigPolygon.polyIndex ||
          packet.ringIndex !== bigPolygon.ringsFinished ||
          bigPolygon.ringOpen ||
          packet.ringIndex >= bigPolygon.ringCount ||
          !Number.isSafeInteger(packet.pointCount) ||
          packet.pointCount < 0
        ) {
          throw new Error('Out-of-order large polygon ring start');
        }
        const poly = plan.caps[bigPolygon.capIndex].polys[bigPolygon.polyIndex];
        poly.push([]);
        bigPolygon.expectedPoints = packet.pointCount;
        bigPolygon.ringOpen = packet.pointCount > 0;
        if (!bigPolygon.ringOpen) bigPolygon.ringsFinished++;
      } else if (packet.type === 'stream-big-ring-points') {
        if (
          !bigPolygon ||
          !bigPolygon.ringOpen ||
          packet.capIndex !== bigPolygon.capIndex ||
          packet.polyIndex !== bigPolygon.polyIndex ||
          packet.ringIndex !== bigPolygon.ringsFinished ||
          !Array.isArray(packet.points) ||
          !packet.points.length ||
          packet.points.length > POINT_BUDGET
        ) {
          throw new Error('Invalid large polygon point batch');
        }
        const ring =
          plan.caps[bigPolygon.capIndex].polys[bigPolygon.polyIndex][packet.ringIndex];
        if (
          packet.startIndex !== ring.length ||
          ring.length + packet.points.length > bigPolygon.expectedPoints
        ) {
          throw new Error('Out-of-order large polygon points');
        }
        ring.push(...packet.points);
        if (ring.length === bigPolygon.expectedPoints) {
          bigPolygon.ringOpen = false;
          bigPolygon.ringsFinished++;
        }
      } else if (packet.type === 'stream-big-poly-done') {
        if (
          !bigPolygon ||
          packet.capIndex !== bigPolygon.capIndex ||
          packet.polyIndex !== bigPolygon.polyIndex ||
          bigPolygon.ringOpen ||
          bigPolygon.ringsFinished !== bigPolygon.ringCount
        ) {
          throw new Error('Incomplete large polygon stream');
        }
        bigPolygon = null;
      } else if (packet.type === 'stream-items') {
        if (
          bigPolygon ||
          !['sidewalls', 'borderLines'].includes(packet.key) ||
          !Array.isArray(packet.items)
        ) {
          throw new Error('Invalid surface-plan item batch');
        }
        const target = plan[packet.key];
        if (
          packet.startIndex !== target.length ||
          target.length + packet.items.length > counts[packet.key]
        ) {
          throw new Error('Out-of-order surface-plan item batch');
        }
        target.push(...packet.items);
      } else if (packet.type === 'stream-done') {
        if (
          bigPolygon ||
          ['caps', 'sidewalls', 'borderLines'].some((key) => plan[key].length !== counts[key]) ||
          plan.caps.some(
            (cap, index) =>
              (Array.isArray(cap.polys) ? cap.polys.length : 0) !== state.polygonCounts[index],
          )
        ) {
          throw new Error('Incomplete surface-plan stream');
        }
        state = null;
        return plan;
      } else throw new Error('Unknown surface-plan stream packet');
      return null;
    },
  };
}
