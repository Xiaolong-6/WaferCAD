// Offline, dependency-free diagnostics for Playwright RGB/RGBA PNG artifacts.
// A single differing decoded pixel is a failing scientific parity gate.
import { readFile } from 'node:fs/promises';
import { compareScreenshotPngPixels } from './test-helpers/png-pixel-diff.mjs';

const [referencePath, candidatePath] = process.argv.slice(2);
if (!referencePath || !candidatePath) {
  console.error('Usage: node scripts/renderer-png-diff.mjs <reference.png> <candidate.png>');
  process.exitCode = 2;
} else {
  const [reference, candidate] = await Promise.all([
    readFile(referencePath),
    readFile(candidatePath),
  ]);
  const result = compareScreenshotPngPixels(reference, candidate);
  console.log(
    JSON.stringify(
      {
        referencePath,
        candidatePath,
        pngBytesIdentical: reference.equals(candidate),
        ...result,
      },
      null,
      2,
    ),
  );
  if (!result.pixelIdentical) process.exitCode = 1;
}
