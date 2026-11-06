import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const rendererSource = readFileSync(new URL('../three-view.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../ui-v2/workstation-views.css', import.meta.url), 'utf8');

test('3D viewport and PNG export share an opaque pure-white WebGL background', () => {
  assert.match(rendererSource, /const THREE_VIEW_BACKGROUND_COLOR = 0xffffff;/);
  assert.equal(
    (rendererSource.match(/\.setClearColor\(THREE_VIEW_BACKGROUND_COLOR\)/g) || []).length,
    2,
    'Both the interactive renderer and the temporary PNG renderer must use the shared color',
  );
  assert.match(rendererSource, /renderer\.setClearColor\(THREE_VIEW_BACKGROUND_COLOR\)/);
  assert.match(rendererSource, /captureRenderer\.setClearColor\(THREE_VIEW_BACKGROUND_COLOR\)/);
  assert.match(styles, /\.v2-three-host\s*\{[^}]*background:\s*#fff;/);
});
