// Copy partial RTX 3060 evidence before interpreting JSON. An aborted GPU
// trial can still contain useful screenshots, traces, and diagnostics.
import { cp, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function preserveRendererHardwareEvidence(source, target) {
  let artifactsCopied = false;
  let report = null;
  const warnings = [];
  try {
    await cp(source, target, { recursive: true });
    artifactsCopied = true;
  } catch (error) {
    warnings.push('evidence copy failed: ' + String(error));
  }
  if (artifactsCopied) {
    try {
      report = JSON.parse(await readFile(join(target, 'report.json'), 'utf8'));
    } catch (error) {
      warnings.push('report unavailable or incomplete: ' + String(error));
    }
  }
  return { artifactsCopied, report, warnings };
}
