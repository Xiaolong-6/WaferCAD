// Transport-only protocol for exact 3D topology. Chunking separates main-
// thread structured-clone deliveries into distinct browser tasks; it never
// changes polygon ownership, ordering, vertex coordinates, or view geometry.
export const SURFACE_PLAN_MESSAGE_BATCH = 8;

export function sendSurfacePlanChunks(plan, send, batchSize = SURFACE_PLAN_MESSAGE_BATCH) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new RangeError('Invalid surface plan batch size');
  }
  const { caps, sidewalls, ...metadata } = plan;
  if (!Array.isArray(caps) || !Array.isArray(sidewalls)) {
    throw new TypeError('Surface plan must contain cap and sidewall arrays');
  }
  send({ type: 'start', metadata, capsLength: caps.length, sidewallsLength: sidewalls.length });
  for (const key of ['caps', 'sidewalls']) {
    const parts = key === 'caps' ? caps : sidewalls;
    for (let offset = 0; offset < parts.length; offset += batchSize) {
      send({ type: 'chunk', key, offset, parts: parts.slice(offset, offset + batchSize) });
    }
  }
  send({ type: 'done' });
}

export function createSurfacePlanAssembler() {
  let current = null;
  return {
    accept(message) {
      if (message.type === 'done' && message.plan) {
        if (current) throw new Error('Mixed surface plan worker protocols');
        return message.plan; // Compatibility with existing single-message workers.
      }
      if (message.type === 'start') {
        if (current) throw new Error('Duplicate surface plan start');
        const { metadata, capsLength, sidewallsLength } = message;
        if (
          !metadata ||
          typeof metadata !== 'object' ||
          Array.isArray(metadata) ||
          !Number.isSafeInteger(capsLength) ||
          !Number.isSafeInteger(sidewallsLength) ||
          capsLength < 0 ||
          sidewallsLength < 0 ||
          Object.hasOwn(metadata, 'caps') ||
          Object.hasOwn(metadata, 'sidewalls')
        ) {
          throw new Error('Invalid surface plan metadata');
        }
        current = { metadata, caps: [], sidewalls: [], capsLength, sidewallsLength };
        return null;
      }
      if (message.type === 'chunk') {
        if (!current) throw new Error('Surface plan chunk before start');
        const { key, offset, parts } = message;
        if (
          !['caps', 'sidewalls'].includes(key) ||
          !Array.isArray(parts) ||
          !parts.length ||
          offset !== current[key].length ||
          offset + parts.length > current[`${key}Length`]
        ) {
          throw new Error('Invalid surface plan chunk order or count');
        }
        current[key].push(...parts);
        return null;
      }
      if (message.type === 'done') {
        if (
          !current ||
          current.caps.length !== current.capsLength ||
          current.sidewalls.length !== current.sidewallsLength
        ) {
          throw new Error('Incomplete surface plan from worker');
        }
        return { ...current.metadata, caps: current.caps, sidewalls: current.sidewalls };
      }
      throw new Error('Unknown surface plan worker message');
    },
  };
}
