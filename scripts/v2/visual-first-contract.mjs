// Pure configuration and provenance for actual-app Chromium visual evidence.
// No scientific geometry, renderer or application state is reimplemented here.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const VIEW_SCOPES = Object.freeze({
  all: ['main', 'mask', 'three', 'section'],
  '2d-ui': ['main', 'mask', 'section'],
  '3d': ['three'],
});
const VIEWS = new Set(VIEW_SCOPES.all);
const DEFAULT_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];
const FINGERPRINTS = [
  'app.html',
  'plan-renderers.js',
  'three-view.js',
  'renderer-geometry.js',
  'ui-v2/workstation-entry.js',
  'ui-v2/workstation-v2.js',
  'ui-v2/workstation-v2.css',
  'ui-v2/mobile-workstation.css',
  'ui-v2/desktop-shell.css',
];

export function parseVisualCaptureSettings(env = process.env) {
  const example = env.WAFERCAD_VISUAL_EXAMPLE || 'jlfet';
  if (!/^[a-z0-9-]+$/.test(example)) throw Error('Invalid bundled example slug');
  const start = env.WAFERCAD_VISUAL_START || 'example';
  if (!['empty', 'example'].includes(start))
    throw Error('WAFERCAD_VISUAL_START must be empty or example');
  const scope = env.WAFERCAD_VISUAL_SCOPE || 'all';
  if (!Object.hasOwn(VIEW_SCOPES, scope)) throw Error('Invalid WAFERCAD_VISUAL_SCOPE');
  const views = env.WAFERCAD_VISUAL_VIEWS
    ? env.WAFERCAD_VISUAL_VIEWS.split(',').map((s) => s.trim())
    : [...VIEW_SCOPES[scope]];
  if (
    !views.length ||
    views.some((view) => !VIEWS.has(view)) ||
    new Set(views).size !== views.length
  )
    throw Error('Invalid or duplicate WAFERCAD_VISUAL_VIEWS');
  if (views.some((view) => !VIEW_SCOPES[scope].includes(view)))
    throw Error('WAFERCAD_VISUAL_VIEWS must remain within the selected scope');
  const viewports = env.WAFERCAD_VISUAL_VIEWPORTS
    ? env.WAFERCAD_VISUAL_VIEWPORTS.split(',').map((entry) => {
        const match = /^(\d{3,4})x(\d{3,4})$/.exec(entry.trim());
        if (!match) throw Error('Invalid WAFERCAD_VISUAL_VIEWPORTS entry');
        return { width: Number(match[1]), height: Number(match[2]) };
      })
    : [
        ...DEFAULT_VIEWPORTS,
        ...(env.WAFERCAD_VISUAL_SMALL === '1' ? [{ width: 360, height: 640 }] : []),
      ];
  if (
    !viewports.length ||
    viewports.length > 6 ||
    viewports.some(
      ({ width, height }) => width < 320 || width > 4096 || height < 320 || height > 2160,
    ) ||
    new Set(viewports.map(({ width }) => width)).size !== viewports.length
  ) {
    throw Error('Invalid, duplicate-width or excessive visual capture viewport');
  }
  if (env.WAFERCAD_VISUAL_SWIFTSHADER && !['0', '1'].includes(env.WAFERCAD_VISUAL_SWIFTSHADER))
    throw Error('WAFERCAD_VISUAL_SWIFTSHADER must be 0 or 1');
  return {
    example,
    start,
    scope,
    views,
    untestedViews: VIEW_SCOPES.all.filter((view) => !views.includes(view)),
    requiresWebgl: views.includes('three'),
    viewports,
    softwareWebgl: env.WAFERCAD_VISUAL_SWIFTSHADER === '1',
  };
}

export async function sourceEvidence(root) {
  let revision = null;
  let dirty = null;
  try {
    const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (resolve(gitRoot) !== resolve(root))
      throw Error('Source folder is not the Git checkout root');
    revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    dirty = Boolean(
      execFileSync('git', ['status', '--porcelain'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim(),
    );
  } catch {
    // An uploaded Main source archive lacks .git: do not fabricate its SHA.
  }
  const hashes = {};
  for (const path of FINGERPRINTS) {
    const bytes = await readFile(join(root, 'site', path));
    hashes[`site/${path}`] = createHash('sha256').update(bytes).digest('hex');
  }
  return {
    revision,
    dirty,
    sourceHashes: hashes,
    provenance: revision ? 'git-checkout' : 'source-files-no-git',
  };
}

export async function resolvePinnedThree(root, override = '') {
  const folder = resolve(override || join(root, 'node_modules/three'));
  try {
    const info = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'));
    if (info.version !== '0.179.1')
      throw Error(`Pinned Three.js 0.179.1 required; found ${info.version}`);
    if (!(await stat(join(folder, 'build/three.module.js'))).isFile())
      throw Error('Missing pinned Three.js ESM bundle');
  } catch (error) {
    if (override || error.code !== 'ENOENT') throw error;
    return null;
  }
  return folder;
}
