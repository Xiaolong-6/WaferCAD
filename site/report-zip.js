// Portable ZIP (STORE method). No runtime dependency or server is required.
const encoder = new TextEncoder();
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function put16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function put32(view, offset, value) {
  view.setUint32(offset, value, true);
}

export function buildReportZip(files) {
  if (!Array.isArray(files) || files.length > 65535) {
    throw new Error('Invalid report file count.');
  }
  const entries = [];
  const names = new Set();
  let position = 0;
  let totalBytes = 0;
  for (const file of files) {
    const name = String(file.path || '');
    if (
      !name ||
      name.startsWith('/') ||
      name.includes('\\') ||
      name.split('/').some((part) => part === '..' || part === '' || part === '.')
    ) {
      throw new Error('Invalid report resource path.');
    }
    if (names.has(name)) throw new Error('Duplicate report resource path.');
    names.add(name);
    const path = encoder.encode(name);
    const data =
      typeof file.content === 'string'
        ? encoder.encode(file.content)
        : file.content instanceof Uint8Array
          ? file.content
          : null;
    if (!data || path.length > 65535) throw new Error('Invalid report resource.');
    totalBytes += data.byteLength;
    if (totalBytes > MAX_ARCHIVE_BYTES) {
      throw new Error('Report exceeds the 128 MB export limit. Use fewer images.');
    }
    const header = new Uint8Array(30);
    const view = new DataView(header.buffer);
    put32(view, 0, 0x04034b50);
    put16(view, 4, 20);
    put16(view, 6, 0x0800);
    put16(view, 8, 0);
    put16(view, 10, 0);
    put16(view, 12, 33);
    put32(view, 14, crc32(data));
    put32(view, 18, data.byteLength);
    put32(view, 22, data.byteLength);
    put16(view, 26, path.length);
    put16(view, 28, 0);
    entries.push({ path, data, header, offset: position, crc: crc32(data) });
    position += header.length + path.length + data.length;
  }
  if (position > MAX_ARCHIVE_BYTES + files.length * 200) {
    throw new Error('Report ZIP metadata exceeds the safety limit.');
  }
  const parts = [];
  for (const entry of entries) parts.push(entry.header, entry.path, entry.data);
  const centralStart = position;
  for (const entry of entries) {
    const header = new Uint8Array(46);
    const view = new DataView(header.buffer);
    put32(view, 0, 0x02014b50);
    put16(view, 4, 20);
    put16(view, 6, 20);
    put16(view, 8, 0x0800);
    put16(view, 10, 0);
    put16(view, 12, 0);
    put16(view, 14, 33);
    put32(view, 16, entry.crc);
    put32(view, 20, entry.data.length);
    put32(view, 24, entry.data.length);
    put16(view, 28, entry.path.length);
    put32(view, 42, entry.offset);
    parts.push(header, entry.path);
    position += header.length + entry.path.length;
  }
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  put32(view, 0, 0x06054b50);
  put16(view, 8, entries.length);
  put16(view, 10, entries.length);
  put32(view, 12, position - centralStart);
  put32(view, 16, centralStart);
  parts.push(end);
  return new Blob(parts, { type: 'application/zip' });
}
