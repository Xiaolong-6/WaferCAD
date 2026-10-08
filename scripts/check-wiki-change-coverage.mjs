import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';

// Runs for each main push. Warn if a user-visible public workflow changed
// without a documentation edit. Not every refactor needs a manual rewrite.
const before = process.env.PREVIOUS_MAIN_SHA || '';
const after = process.env.GITHUB_SHA || 'HEAD';
const sourcePatterns = [
  /^site\/app\.html$/,
  /^site\/controllers\/(?:process-panel|process-recipe|workspace-actions|mask-roi|draw-mask|project|history-mutation|base-controls|export|roi)-controller\.js$/,
  /^site\/(?:process-recipe|project-io|project-schema|selection-geometry|layout-export)\.js$/,
];
const docPattern = /^(docs\/wiki\/|site\/process-guide(?:-svg)?\.js$|site\/guide\/)/;

if (!/^[a-f0-9]{40}$/.test(before) || /^0+$/.test(before)) {
  console.log('Documentation change coverage: no valid previous main SHA; initial comparison skipped.');
  process.exit(0);
}
let changed;
try {
  changed = execFileSync('git', ['diff','--name-only',before,after,'--'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
} catch {
  console.log('::warning title=Documentation review::Could not compare to previous main commit; check whether relevant behavior changed.');
  process.exit(0);
}
const surface = changed.filter(name => sourcePatterns.some(pattern => pattern.test(name)));
const docs = changed.filter(name => docPattern.test(name));
if (surface.length && !docs.length) {
  const warning = 'User-facing WaferCAD behavior changed but docs/wiki and process guide were not updated. Review the product manual for possible drift.';
  console.log('::warning title=Product manual review required::' + warning);
  console.log('Changed public contracts: ' + surface.join(', '));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    '### Product manual change coverage\n\n⚠️ ' + warning + '\n\nChanged: ' + surface.join(', ') + '\n\n');
} else console.log('Product manual coverage check: ' + surface.length + ' public files, ' + docs.length + ' manual/guide files updated.');
