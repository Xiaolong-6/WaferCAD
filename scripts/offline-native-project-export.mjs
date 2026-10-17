#!/usr/bin/env node
// Validate a real .wafercad project with the production reader before offline
// native Three.js inspection. This is not an application state or Recovery load.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const MAX_DIAGNOSTIC_BYTES = 8 * 1024 * 1024;

export async function exportValidatedModel(inputPath, outputPath) {
  const source = await readFile(inputPath);
  if (source.length > MAX_DIAGNOSTIC_BYTES) {
    throw new Error('Offline model diagnostic exceeds the 8 MiB synchronous safety limit.');
  }
  // The production reader's strict geometry validation uses the same local
  // polygon-clipping vendor that app.html loads before its modules.
  if (!globalThis.polygonClipping) {
    const vendor = await readFile(resolve(here, '../site/vendor/polygon-clipping.umd.js'), 'utf8');
    const commonjs = { exports: {} };
    new Function('module', 'exports', vendor)(commonjs, commonjs.exports);
    globalThis.polygonClipping = commonjs.exports;
  }
  const { readProjectFile } = await import('../site/project-io.js');
  const project = await readProjectFile({
    size: source.length,
    name: inputPath.split(/[\\/]/).at(-1),
    text: async () => source.toString('utf8'),
  });
  const model = project.model;
  if (!model || typeof model !== 'object') throw new Error('Validated project has no model.');
  const evidence = {
    schema: 'wafercad-offline-native-model-v1',
    inputSha256: createHash('sha256').update(source).digest('hex'),
    inputBytes: source.length,
    modelLayerCount: model.layers?.length || 0,
    modelRegionCount: model.regions?.length || 0,
    reader: 'readProjectFile: storage expansion, migration, strict schema validation',
    nativeApplicationStateLoaded: false,
    model,
  };
  await writeFile(outputPath, JSON.stringify(evidence));
  return { ...evidence, model: undefined };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) {
    console.error(
      'Usage: node scripts/offline-native-project-export.mjs INPUT.wafercad OUTPUT.json',
    );
    process.exitCode = 2;
  } else {
    exportValidatedModel(resolve(process.argv[2]), resolve(process.argv[3]))
      .then((result) => console.log(JSON.stringify(result)))
      .catch((error) => {
        console.error(error.stack || String(error));
        process.exitCode = 1;
      });
  }
}
