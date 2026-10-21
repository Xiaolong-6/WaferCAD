import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const entry = readFileSync(new URL('../ui-v2/workstation-entry.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../ui-v2/workstation-v2.js', import.meta.url), 'utf8');

test('Workstation commit link uses validated deployment metadata and survives shell renders', () => {
  assert.match(entry, /fetch\('\.\/build-info\.json', \{ cache: 'no-store' \}\)/);
  assert.match(entry, /\^\[0-9a-f\]\{7,64\}\$/i);
  assert.match(entry, /versionCommit: commitSha/);
  assert.match(entry, /shell\.renderVersion\(\)/);
  assert.match(shell, /renderVersion\(info\)/);
  assert.match(shell, /href: `https:\/\/github\.com\/Xiaolong-6\/WaferCAD\/commit\/\$\{commit\}`/);
  assert.match(shell, /rel: 'noopener noreferrer'/);
  assert.match(shell, /target: '_blank'/);
  assert.match(shell, /window\.WaferCadV2Icons\.icon\('github'\)/);
  assert.match(shell, /window\.WaferCadV2Icons\.icon\('bookOpen'\)/);
  assert.match(shell, /commit\.slice\(0, 7\)/);
  assert.doesNotMatch(shell, /`commit \${commit\.slice/);
  assert.match(shell, /host\.textContent = info\.version \|\| ''/);
});
