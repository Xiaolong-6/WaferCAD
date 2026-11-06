import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  readdirSync,
  openSync,
  closeSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const transmonValueHash = (value) => sha(JSON.stringify(value));

export function transmonProcessFingerprint() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const files = [
    'scripts/build-transmon-process.mjs',
    'scripts/transmon-process-checkpoints.mjs',
    'scripts/process-benchmarks.mjs',
    'scripts/material-array-compaction.mjs',
    'scripts/transmon-parallel-deposition.mjs',
    'package-lock.json',
  ];
  const walk = (directory) => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (path === 'site/tests') continue;
      if (entry.isDirectory()) walk(path);
      else if (/\.(?:js|mjs|wasm)$/.test(entry.name)) files.push(path);
    }
  };
  walk('site');
  return transmonValueHash(files.sort().map((path) => [path, sha(readFileSync(join(root, path)))]));
}

function atomicWrite(path, bytes) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, bytes);
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

/** A stage is committed only after its complete compressed model exists.
 * Resume checks source, options, input, parameters and every stored byte.
 * The journal keeps models separate, avoiding a growing monolithic JSON file.
 */
export function createTransmonCheckpointStore({
  directory,
  sourceProjectSha256,
  options,
  codeFingerprint,
}) {
  const root = resolve(directory);
  mkdirSync(root, { recursive: true });
  const manifestPath = join(root, 'manifest.json'),
    lockPath = join(root, 'writer.lock');
  if (existsSync(lockPath)) {
    const previous = JSON.parse(readFileSync(lockPath, 'utf8'));
    let alive = true;
    try {
      process.kill(previous.pid, 0);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
      alive = false;
    }
    if (alive)
      throw Error(`A Transmon checkpoint writer is already running (PID ${previous.pid}).`);
    unlinkSync(lockPath);
  }
  const nonce = randomUUID(),
    fd = openSync(lockPath, 'wx');
  try {
    writeFileSync(fd, JSON.stringify({ pid: process.pid, nonce }));
  } finally {
    closeSync(fd);
  }
  const release = () => {
    if (existsSync(lockPath) && JSON.parse(readFileSync(lockPath, 'utf8')).nonce === nonce)
      unlinkSync(lockPath);
  };
  process.once('exit', release);
  const close = () => {
    process.removeListener('exit', release);
    release();
  };
  try {
    const optionsHash = transmonValueHash(options);
    const manifest = existsSync(manifestPath)
      ? JSON.parse(readFileSync(manifestPath, 'utf8'))
      : {
          format: 'WaferCAD-transmon-checkpoints',
          version: 1,
          sourceProjectSha256,
          codeFingerprint,
          optionsHash,
          options,
          createdAt: new Date().toISOString(),
          stages: [],
        };
    if (
      manifest.format !== 'WaferCAD-transmon-checkpoints' ||
      manifest.version !== 1 ||
      manifest.sourceProjectSha256 !== sourceProjectSha256 ||
      manifest.codeFingerprint !== codeFingerprint ||
      manifest.optionsHash !== optionsHash ||
      !Array.isArray(manifest.stages)
    )
      throw Error('Transmon checkpoint source or process options changed; refuse stale resume.');
    const match = (entry, index, label, inputHash, parametersHash) => {
      if (
        entry.index !== index ||
        entry.label !== label ||
        entry.inputHash !== inputHash ||
        entry.parametersHash !== parametersHash
      )
        throw Error(`Transmon checkpoint ${index} does not match its process input.`);
    };
    const workingPath = (stage, key) => {
      if (!Number.isInteger(stage) || stage < 0 || !/^[0-9a-f]{64}$/.test(key))
        throw Error('Invalid Transmon working-set checkpoint key.');
      return join(root, 'working', String(stage), `${key}.json.gz`);
    };
    return {
      createdAt: manifest.createdAt,
      codeFingerprint,
      close,
      restoreWorkingSet({ stage, key }) {
        const path = workingPath(stage, key);
        if (!existsSync(path)) return null;
        const entry = JSON.parse(
          gunzipSync(readFileSync(path), { maxOutputLength: 512 * 1024 * 1024 }),
        );
        if (
          entry.stage !== stage ||
          entry.key !== key ||
          entry.codeFingerprint !== codeFingerprint ||
          entry.sourceProjectSha256 !== sourceProjectSha256 ||
          transmonValueHash(entry.value) !== entry.sha256
        )
          throw Error('Transmon working-set checkpoint is corrupt or stale.');
        return entry.value;
      },
      saveWorkingSet({ stage, key, value }) {
        const path = workingPath(stage, key);
        mkdirSync(join(root, 'working', String(stage)), { recursive: true });
        atomicWrite(
          path,
          gzipSync(
            JSON.stringify({
              stage,
              key,
              codeFingerprint,
              sourceProjectSha256,
              sha256: transmonValueHash(value),
              value,
            }),
          ),
        );
      },
      restore({ index, label, inputHash, parametersHash }) {
        const entry = manifest.stages[index];
        if (!entry) return null;
        match(entry, index, label, inputHash, parametersHash);
        const path = join(root, `${String(index).padStart(3, '0')}.model.json.gz`);
        const bytes = readFileSync(path);
        if (sha(bytes) !== entry.fileSha256)
          throw Error(`Transmon checkpoint ${index} is corrupt.`);
        const model = JSON.parse(gunzipSync(bytes, { maxOutputLength: 512 * 1024 * 1024 }));
        if (transmonValueHash(model) !== entry.outputHash)
          throw Error(`Transmon checkpoint ${index} model hash mismatch.`);
        return { model, outcome: entry.outcome, provenance: entry.provenance };
      },
      save({
        index,
        label,
        inputHash = null,
        parametersHash = null,
        model,
        outcome = null,
        provenance = null,
      }) {
        const outputHash = transmonValueHash(model),
          previous = manifest.stages[index];
        if (previous) {
          match(previous, index, label, inputHash, parametersHash);
          if (previous.outputHash !== outputHash)
            throw Error(`Transmon checkpoint ${index} changed during resume.`);
          return;
        }
        if (index !== manifest.stages.length) throw Error('Out-of-order Transmon checkpoint.');
        const path = join(root, `${String(index).padStart(3, '0')}.model.json.gz`);
        const bytes = gzipSync(JSON.stringify(model));
        atomicWrite(path, bytes);
        manifest.stages.push({
          index,
          label,
          inputHash,
          parametersHash,
          outputHash,
          fileSha256: sha(bytes),
          outcome,
          provenance,
        });
        atomicWrite(manifestPath, JSON.stringify(manifest, null, 2));
      },
    };
  } catch (error) {
    close();
    throw error;
  }
}
