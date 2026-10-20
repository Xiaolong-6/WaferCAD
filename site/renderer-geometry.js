import { isArrayModel } from './model-array.js';
import { buildArrayRenderPlan } from './model-array-rendering.js';
import { canonicalLineInterval, lineIntervalKey, localParameterAtLineT } from './line-intervals.js';
import { ownedMaterialSurfacesFromTopology } from './process-topology.js';
import { visibleMaterialModel } from './model.js';

const SIDEWALL_APPEARANCE_EPSILON = 1e-10;
const surfacePlanCache = new WeakMap();

function zKey(value) {
  return Number(value).toPrecision(15);
}

function boundaryKey(layerId, z, line) {
  return `${layerId}\u0000${zKey(z)}\u0000${lineIntervalKey(line)}`;
}

function clipFingerprint(clip) {
  if (!clip) return 'full';
  let pointCount = 0,
    minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    hash = 2166136261;
  const mix = (value) => {
    const quantized = Math.round(Number(value) * 1e6);
    hash ^= quantized & 0xffffffff;
    hash = Math.imul(hash, 16777619) >>> 0;
  };
  for (const polygon of clip || []) {
    for (const ring of polygon || []) {
      for (const point of ring || []) {
        if (!Array.isArray(point) || point.length < 2) continue;
        const x = Number(point[0]),
          y = Number(point[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        pointCount++;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        mix(x);
        mix(y);
      }
    }
  }
  return Number.isFinite(minX) ? `${pointCount}:${minX}:${minY}:${maxX}:${maxY}:${hash}` : 'empty';
}

function modelVisibilityKey(model) {
  return (model?.layers || [])
    .map((layer) => `${layer.id}:${layer.visible === false ? 0 : 1}`)
    .join('|');
}

function surfacePlanCacheKey(model, clip) {
  return [
    Number(model?.revision) || 0,
    Number(model?.processRevision) || 0,
    modelVisibilityKey(model),
    clipFingerprint(clip),
  ].join('::');
}

function capBoundaryIndex(caps) {
  const index = new Map();
  (caps || []).forEach((cap, capIndex) => {
    if (cap.appearance?.kind !== 'rough') return;
    const layerIds = [...new Set([cap.layerId, cap.interfaceLayerId].filter(Boolean))];
    for (const poly of cap.polys || []) {
      for (const closed of poly || []) {
        const ring =
          closed.length > 1 &&
          closed[0][0] === closed.at(-1)[0] &&
          closed[0][1] === closed.at(-1)[1]
            ? closed.slice(0, -1)
            : closed.slice();
        for (let edgeIndex = 0; edgeIndex < ring.length; edgeIndex++) {
          const line = canonicalLineInterval(ring[edgeIndex], ring[(edgeIndex + 1) % ring.length]);
          if (!line) continue;
          for (const layerId of layerIds) {
            const key = boundaryKey(layerId, cap.z, line);
            if (!index.has(key)) index.set(key, []);
            index.get(key).push({
              capIndex,
              line,
              appearance: { ...cap.appearance },
              profileNormal: Number(cap.profileNormal) || Number(cap.normal) || 1,
            });
          }
        }
      }
    }
  });
  return index;
}

function sidewallBoundaryAppearance(index, part, z, preferredCapIndex = null) {
  const line = part.line || canonicalLineInterval(part.p, part.q);
  if (!line) return null;
  const candidates = index.get(boundaryKey(part.layerId, z, line)) || [];
  if (!candidates.length) return null;

  const contained = candidates.filter(
      (candidate) =>
        candidate.line.t0 <= line.t0 + SIDEWALL_APPEARANCE_EPSILON &&
        candidate.line.t1 >= line.t1 - SIDEWALL_APPEARANCE_EPSILON,
    ),
    match = contained.find((candidate) => candidate.capIndex === preferredCapIndex) || contained[0];
  if (!match) return null;
  return {
    appearance: { ...match.appearance },
    profileNormal: match.profileNormal,
    capIndex: match.capIndex,
  };
}

export function decorateRoughSurfaceBoundaries(caps, sidewalls) {
  if ((sidewalls || []).some((wall) => wall.parts?.length)) {
    const tagged = sidewalls.flatMap((wall, index) =>
        (wall.parts || [wall]).map((part) => ({
          ...part,
          roughBoundaryGroupIndex: index,
        })),
      ),
      decorated = decorateRoughSurfaceBoundaries(caps, tagged),
      groups = sidewalls.map(() => []);
    for (const part of decorated.sidewalls) {
      const { roughBoundaryGroupIndex, ...value } = part;
      groups[roughBoundaryGroupIndex].push(value);
    }
    return {
      caps: decorated.caps,
      sidewalls: sidewalls.flatMap((wall, index) =>
        wall.parts ? [{ ...wall, parts: groups[index] }] : groups[index],
      ),
    };
  }
  const index = capBoundaryIndex(caps);
  if (!index.size) return { caps, sidewalls };

  const sidewallIntervalsByCap = new Map(),
    splitSidewalls = (sidewalls || []).flatMap((part) => {
      const line = part.line || canonicalLineInterval(part.p, part.q);
      if (!line) return [part];
      const parameters = new Set([0, 1]);
      for (const z of [part.z0, part.z1]) {
        for (const candidate of index.get(boundaryKey(part.layerId, z, line)) || []) {
          for (const t of [candidate.line.t0, candidate.line.t1]) {
            if (
              t > line.t0 + SIDEWALL_APPEARANCE_EPSILON &&
              t < line.t1 - SIDEWALL_APPEARANCE_EPSILON
            ) {
              parameters.add(localParameterAtLineT(line, t));
            }
          }
        }
      }
      const ordered = [...parameters].sort((a, b) => a - b);
      if (ordered.length === 2) return [part];
      const pointAt = (t) => [
        part.p[0] + (part.q[0] - part.p[0]) * t,
        part.p[1] + (part.q[1] - part.p[1]) * t,
      ];
      return ordered.slice(0, -1).map((t, i) => {
        const p = pointAt(t),
          q = pointAt(ordered[i + 1]);
        return { ...part, p, q, line: canonicalLineInterval(p, q) };
      });
    }),
    decoratedSidewalls = splitSidewalls.map((part) => {
      const line = part.line || canonicalLineInterval(part.p, part.q),
        lowerSurface = sidewallBoundaryAppearance(
          index,
          part,
          part.z0,
          part.lowerSurface?.capIndex,
        ),
        upperSurface = sidewallBoundaryAppearance(
          index,
          part,
          part.z1,
          part.upperSurface?.capIndex,
        );

      for (const surface of [lowerSurface, upperSurface]) {
        if (!line || surface?.capIndex == null) continue;
        if (!sidewallIntervalsByCap.has(surface.capIndex)) {
          sidewallIntervalsByCap.set(surface.capIndex, []);
        }
        sidewallIntervalsByCap.get(surface.capIndex).push({
          key: lineIntervalKey(line),
          t0: line.t0,
          t1: line.t1,
        });
      }

      return {
        ...part,
        lowerSurface: lowerSurface
          ? {
              appearance: lowerSurface.appearance,
              profileNormal: lowerSurface.profileNormal,
              capIndex: lowerSurface.capIndex,
            }
          : null,
        upperSurface: upperSurface
          ? {
              appearance: upperSurface.appearance,
              profileNormal: upperSurface.profileNormal,
              capIndex: upperSurface.capIndex,
            }
          : null,
      };
    }),
    decoratedCaps = (caps || []).map((cap, capIndex) => ({
      ...cap,
      sidewallBoundaryIntervals: sidewallIntervalsByCap.get(capIndex) || [],
    }));

  return { caps: decoratedCaps, sidewalls: decoratedSidewalls };
}

// Renderer-facing adapter. Physical ownership is derived once by Process
// Geometry Kernel v2; this adapter only attaches the rough/Pyramid boundary
// metadata needed to make exposed/cut sidewalls follow the same deterministic
// profile as their horizontal caps. The ownership pass can be expensive for
// wafer-scale repeated arrays, so reuse it while model revision, visibility,
// and inspection clip are unchanged. Camera/opacity/border changes can then
// rebuild presentation meshes without re-running process topology.
export function buildRenderSurfacePlan(model, clip = null, precomputedSolids = null) {
  if (!model || typeof model !== 'object') {
    return ownedMaterialSurfacesFromTopology(visibleMaterialModel(model), clip);
  }

  const cached = cachedRenderSurfacePlan(model, clip);
  if (cached) return cached;

  const plan = isArrayModel(model)
      ? buildArrayRenderPlan(visibleMaterialModel(model), clip, buildRenderSurfacePlan)
      : ownedMaterialSurfacesFromTopology(visibleMaterialModel(model), clip, precomputedSolids),
    decorated = decorateRoughSurfaceBoundaries(plan.caps, plan.sidewalls),
    result = {
      ...plan,
      ...decorated,
    };
  rememberRenderSurfacePlan(model, clip, result);
  return result;
}

export function cachedRenderSurfacePlan(model, clip = null) {
  if (!model || typeof model !== 'object') return null;
  const cached = surfacePlanCache.get(model);
  return cached?.key === surfacePlanCacheKey(model, clip) ? cached.plan : null;
}

// A background worker returns the very same deterministic physical plan.
// Register it under the same revision/visibility/clip key used by the
// foreground and GLB exporter; no second geometry ownership implementation.
export function rememberRenderSurfacePlan(model, clip, plan) {
  if (model && typeof model === 'object') {
    surfacePlanCache.set(model, { key: surfacePlanCacheKey(model, clip), plan });
  }
  return plan;
}
