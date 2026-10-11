import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync, crc32 } from 'node:zlib';
import { startRendererHardwareSite } from '../test-helpers/renderer-hardware-site.mjs';
import { writeRendererHardwareZip } from '../test-helpers/renderer-hardware-zip.mjs';

test('isolated server preflight serves actual app.html and rejects path escape', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'wafercad-http-test-'));
  const diagnostics = [];
  let server;
  try {
    await mkdir(join(temp, 'site'));
    const app = '<!doctype html><html><body>' + 'x'.repeat(1200) + '</body></html>';
    await writeFile(join(temp, 'site', 'app.html'), app);
    await writeFile(join(temp, 'site', 'index.html'), app);
    server = await startRendererHardwareSite(temp, (value) => diagnostics.push(value));
    await server.verify();
    const response = await fetch(server.url + '/app.html?rendererV3RoiTrace=1');
    assert.equal(response.status, 200);
    assert.equal(await response.text(), app);
    assert.equal((await fetch(server.url + '/%5cprivate')).status, 403);
    assert.equal((await fetch(server.url + '/missing.js')).status, 404);
    assert.ok(diagnostics.some((value) => value.status === 200));
    assert.ok(diagnostics.some((value) => value.status === 404 && value.error));
  } finally {
    if (server) await server.close();
    await rm(temp, { recursive: true, force: true });
  }
});

test('portable hardware ZIP preserves binary screenshot and report with valid CRC', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'wafercad-zip-test-'));
  try {
    const folder = join(temp, 'evidence');
    await mkdir(join(folder, 'v3'), { recursive: true });
    const png = Buffer.from([137, 80, 78, 71, 0, 1, 2, 3]);
    await writeFile(join(folder, 'v3', '1-OFF.png'), png);
    await writeFile(join(folder, 'summary.json'), '{"passed":false}\n');
    const zip = join(temp, 'output.zip');
    const result = await writeRendererHardwareZip(folder, zip);
    assert.equal(result.files, 2);
    const data = await readFile(zip);
    const end = data.length - 22;
    assert.equal(data.readUInt32LE(end), 0x06054b50);
    assert.equal(data.readUInt16LE(end + 10), 2);
    const centralOffset = data.readUInt32LE(end + 16);
    let at = centralOffset;
    const extracted = new Map();
    for (let index = 0; index < 2; index++) {
      assert.equal(data.readUInt32LE(at), 0x02014b50);
      const crc = data.readUInt32LE(at + 16);
      const compressedSize = data.readUInt32LE(at + 20);
      const fileNameSize = data.readUInt16LE(at + 28);
      const localOffset = data.readUInt32LE(at + 42);
      const name = data.subarray(at + 46, at + 46 + fileNameSize).toString('utf8');
      assert.equal(data.readUInt32LE(localOffset), 0x04034b50);
      const localNameSize = data.readUInt16LE(localOffset + 26);
      const compressedStart = localOffset + 30 + localNameSize;
      const contents = inflateRawSync(data.subarray(compressedStart, compressedStart + compressedSize));
      assert.equal(crc32(contents) >>> 0, crc);
      extracted.set(name, contents);
      at += 46 + fileNameSize;
    }
    assert.deepEqual(extracted.get('evidence/v3/1-OFF.png'), png);
    assert.equal(extracted.get('evidence/summary.json').toString(), '{"passed":false}\n');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
