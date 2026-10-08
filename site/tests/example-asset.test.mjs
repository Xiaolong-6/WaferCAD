import assert from 'node:assert/strict';
import test from 'node:test';
import { bufferBackedProjectFile, versionedExampleAssetPath } from '../example-asset.js';

test('bundled asset cache URL changes with deployment and handles existing query', () => {
  const path = './examples/example.wafercad';
  assert.equal(versionedExampleAssetPath(path), path);
  assert.equal(versionedExampleAssetPath(path, 'a1b2'), './examples/example.wafercad?v=a1b2');
  assert.equal(
    versionedExampleAssetPath(path + '?lang=en', 'new/commit'),
    './examples/example.wafercad?lang=en&v=new%2Fcommit',
  );
  assert.notEqual(
    versionedExampleAssetPath(path, 'old'),
    versionedExampleAssetPath(path, 'new'),
  );
});

test('fetched example adapts to project IO without allocating another File buffer', async () => {
  const bytes = new TextEncoder().encode('{"format":"WaferCAD-vector"}');
  const file = bufferBackedProjectFile(bytes.buffer, 'sample.wafercad');
  assert.equal(file.name, 'sample.wafercad');
  assert.equal(file.size, bytes.byteLength);
  assert.strictEqual(await file.arrayBuffer(), bytes.buffer);
  assert.equal(await file.text(), '{"format":"WaferCAD-vector"}');
});
