import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { loadGeometryKernel } from './process-benchmarks.mjs';
import { transmonValueHash } from './transmon-process-checkpoints.mjs';

await loadGeometryKernel();
const api = await import('../site/model.js');
const { applyArrayOperation } = await import('../site/model-array-process.js');
const { arrayParts } = await import('../site/model-array.js');
const { cropContext } = await import('../site/model-array-context.js');
const { intersection } = await import('../site/material-process-boolean.js');
const { materialOwnerCoverage, partitionMaterialProcess } =
  await import('../site/material-process-partition.js');
const { validateProcessModel } = await import('../site/project-schema.js');

function computeJob(job) {
  const { entry, hasDopantRegions } = job;
  const context = JSON.parse(entry.key.slice(0, entry.key.lastIndexOf('|')));
  const coverage =
    job.ownerCoverage ?? intersection(materialOwnerCoverage(context), entry.boundary);
  const result = api.applyOperation(context, entry.params);
  if (
    !result.changed &&
    result.error &&
    !/No ray-visible|No material remains|not exposed/i.test(result.error)
  )
    throw Error(result.error);
  const leaf = result.changed
    ? cropContext(context, entry.boundary, { intersect: intersection })
    : null;
  if (leaf) {
    leaf.regions = partitionMaterialProcess(leaf, coverage);
    if (hasDopantRegions) leaf.dopantRegions = [];
    else delete leaf.dopantRegions;
  }
  return { result, leaf, addedDopants: [] };
}

if (!isMainThread) {
  parentPort.on('message', ({ id, file }) => {
    try {
      const job = JSON.parse(
        gunzipSync(readFileSync(file), { maxOutputLength: 512 * 1024 * 1024 }),
      );
      const value = computeJob(job);
      parentPort.postMessage({ id, value });
    } catch (error) {
      parentPort.postMessage({ id, error: error.stack || error.message });
    }
  });
}

/** Node-only orchestration. Independent, immutable halo inputs are calculated
 * in bounded workers; the existing array owner validates and commits once.
 * Stored leaf results are identical to the ordinary sequential operation.
 */
export async function applyParallelMaterialDeposition(
  model,
  params,
  {
    workers = 2,
    jobDirectory,
    hasWorkingSet = () => false,
    restoreWorkingSet,
    saveWorkingSet,
    onProgress = () => {},
  } = {},
) {
  if (
    !isMainThread ||
    !model.array ||
    !params.incidence?.materialGeometry ||
    params.type !== 'add' ||
    !Number.isInteger(workers) ||
    workers < 1 ||
    workers > 4 ||
    !jobDirectory ||
    typeof restoreWorkingSet !== 'function' ||
    typeof saveWorkingSet !== 'function'
  )
    throw Error(
      'Parallel deposition needs a native array, material Direct, bounded workers and a checkpoint cache.',
    );
  if (
    [model, ...model.array.templates.map((t) => t.model)].some((m) =>
      ['dopantRegions', 'implants', 'electricalRegions'].some((key) => m[key]?.length),
    )
  )
    throw Error('Parallel Transmon deposition does not accept annotation-bearing models.');
  const directory = resolve(jobDirectory);
  mkdirSync(directory, { recursive: true });
  const jobs = [];
  const parts = new Map(arrayParts(model).map((p) => [p.id, p]));
  let currentPart;
  const unchanged = () => ({ result: { changed: false }, leaf: null, addedDopants: [] });
  applyArrayOperation(model, params, () => ({ changed: false }), {
    onWorkingSet: (set) => {
      currentPart = parts.get(set.partId);
    },
    restoreWorkingSet: (entry) => (hasWorkingSet(entry) ? unchanged() : null),
    saveWorkingSet: (entry) => {
      const id = transmonValueHash(entry),
        file = join(directory, `${id}.job.json.gz`);
      const temporary = `${file}.${process.pid}.tmp`;
      writeFileSync(
        temporary,
        gzipSync(
          JSON.stringify({
            entry,
            hasDopantRegions: Object.hasOwn(currentPart.model, 'dopantRegions'),
            instance: { id: currentPart.id, xUm: currentPart.x, yUm: currentPart.y },
            ownerCoverage: materialOwnerCoverage(currentPart.model),
          }),
          { level: 1 },
        ),
      );
      renameSync(temporary, file);
      jobs.push({ id, file });
    },
  });
  globalThis.gc?.();
  onProgress({ phase: 'planned', pending: jobs.length, workers });
  const active = [],
    failures = [];
  let cursor = 0,
    completed = 0;
  try {
    if (jobs.length)
      await new Promise((resolveJobs, rejectJobs) => {
        let settled = false;
        const fail = (error) => {
          if (!settled) {
            settled = true;
            rejectJobs(error);
          }
        };
        const dispatch = (worker) => {
          if (settled || cursor >= jobs.length) return;
          worker.postMessage(jobs[cursor++]);
        };
        for (let i = 0; i < Math.min(workers, jobs.length); i++) {
          const worker = new Worker(new URL(import.meta.url), {
            execArgv: [],
            resourceLimits: { maxOldGenerationSizeMb: 768 },
          });
          active.push(worker);
          worker.on('error', fail);
          worker.on('exit', (code) => {
            if (!settled) fail(Error(`Deposition worker exited before completion (${code}).`));
          });
          worker.on('message', (message) => {
            if (settled) return;
            try {
              const job = jobs.find((j) => j.id === message.id);
              if (!job) throw Error('Unknown parallel deposition job.');
              if (message.error) {
                // Checkpoint other independent cells even when this stage
                // cannot commit. Infrastructure and cache failures still abort.
                failures.push(Error(`Material working set ${message.id}: ${message.error}`));
                onProgress({
                  phase: 'working-set-failed',
                  workingSetId: message.id,
                  error: message.error,
                });
              } else {
                const { entry } = JSON.parse(gunzipSync(readFileSync(job.file)));
                if (transmonValueHash(entry) !== message.id)
                  throw Error('Parallel deposition input changed.');
                if (message.value.leaf) validateProcessModel(message.value.leaf);
                saveWorkingSet(entry, message.value);
                completed++;
              }
              onProgress({
                phase: 'computed',
                completed,
                failed: failures.length,
                pending: jobs.length,
                workers,
              });
              if (completed + failures.length === jobs.length) {
                settled = true;
                resolveJobs();
              } else dispatch(worker);
            } catch (error) {
              fail(error);
            }
          });
          dispatch(worker);
        }
      });
  } finally {
    await Promise.all(active.map((worker) => worker.terminate()));
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      `${failures.length} material working sets failed. ${failures[0].message}`,
    );
  return applyArrayOperation(
    model,
    params,
    () => {
      throw Error('Missing precomputed deposition working set.');
    },
    {
      restoreWorkingSet: (entry) => {
        const value = restoreWorkingSet(entry);
        if (!value) throw Error('Missing validated deposition checkpoint.');
        return value;
      },
      validateWorkingSet: validateProcessModel,
    },
  );
}
