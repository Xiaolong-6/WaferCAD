// Check real filesystem artifacts before a completed GPU report is trusted.
// A serializable four-arm JSON report is not proof that PNG/trace files were kept.
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const FOUR_ARM_IDS = new Set(['v4-focused-draws', 'v4-phase-window', 'v4-preserved-msaa']);
const FOUR_ARM_LABELS = ['1-OFF', '2-OFF', '3-ON', '4-ON'];

export async function checkRendererHardwareEvidenceInventory(stepId, folder, report) {
  if (!FOUR_ARM_IDS.has(stepId)) return { valid: true, missing: [] };
  const missing = [];
  const required = [
    'report.json',
    ...FOUR_ARM_LABELS.flatMap((label) => [label + '.png', label + '-trace.json']),
  ];
  if (
    !report ||
    !Array.isArray(report.trials) ||
    report.trials.length !== 4 ||
    report.trials.some((trial, index) => trial?.label !== FOUR_ARM_LABELS[index])
  ) {
    missing.push('four-arm-report-contract');
  }
  for (const filename of required) {
    try {
      const full = join(folder, filename);
      const details = await stat(full);
      if (!details.isFile() || details.size === 0) {
        missing.push(filename);
        continue;
      }
      if (filename.endsWith('.png')) {
        const bytes = await readFile(full);
        if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
          missing.push(filename + ':invalid-png');
        }
      } else if (filename.endsWith('-trace.json')) {
        const trace = JSON.parse(await readFile(full, 'utf8'));
        if (trace?.label !== filename.slice(0, -'-trace.json'.length)) {
          missing.push(filename + ':invalid-trace');
        }
      }
    } catch {
      missing.push(filename);
    }
  }
  return { valid: missing.length === 0, missing };
}
