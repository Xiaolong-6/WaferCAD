// Create a portable ZIP without the Windows PowerShell Archive module.
// Stores UTF-8 names and DEFLATE-compressed bytes using standard ZIP headers.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

async function listFiles(root, folder = root) {
  const names = await readdir(folder, { withFileTypes: true });
  const files = [];
  for (const item of names.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(folder, item.name);
    if (item.isDirectory()) files.push(...(await listFiles(root, full)));
    else if (item.isFile()) files.push({ full, name: relative(root, full).split(sep).join('/') });
    else throw new Error('Refusing to archive non-regular evidence path: ' + full);
  }
  return files;
}

export async function writeRendererHardwareZip(folder, output) {
  const prefix = basename(folder);
  const files = await listFiles(folder);
  if (files.length === 0) throw new Error('Cannot archive an empty evidence directory');
  if (files.length > 65535) throw new Error('Too many evidence files for standard ZIP');
  const localEntries = [];
  const directoryEntries = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(prefix + '/' + file.name, 'utf8');
    const source = await readFile(file.full);
    const compressed = deflateRawSync(source);
    if ([name.length, source.length, compressed.length, offset].some((n) => n > 0xffffffff)) {
      throw new Error('Evidence exceeds standard ZIP size bounds');
    }
    const checksum = crc32(source) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(source.length, 22);
    local.writeUInt16LE(name.length, 26);
    localEntries.push(local, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(source.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    directoryEntries.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const directorySize = directoryEntries.reduce((sum, item) => sum + item.length, 0);
  if (offset + directorySize > 0xffffffff) {
    throw new Error('Evidence exceeds standard ZIP directory bounds');
  }
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(files.length, 8);
  footer.writeUInt16LE(files.length, 10);
  footer.writeUInt32LE(directorySize, 12);
  footer.writeUInt32LE(offset, 16);
  await writeFile(output, Buffer.concat([...localEntries, ...directoryEntries, footer]));
  return { output, files: files.length };
}
