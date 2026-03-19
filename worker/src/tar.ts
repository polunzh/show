export interface TarEntry {
  name: string;
  size: number;
  data: Uint8Array;
}

const HEADER_SIZE = 512;

function readString(buf: Uint8Array, offset: number, length: number): string {
  let end = offset;
  const max = offset + length;
  while (end < max && buf[end] !== 0) end++;
  return new TextDecoder().decode(buf.subarray(offset, end));
}

function readOctal(buf: Uint8Array, offset: number, length: number): number {
  const str = readString(buf, offset, length).trim();
  return str ? parseInt(str, 8) : 0;
}

function isZeroBlock(buf: Uint8Array, offset: number): boolean {
  for (let i = offset; i < offset + HEADER_SIZE && i < buf.length; i++) {
    if (buf[i] !== 0) return false;
  }
  return true;
}

export function parseTar(buffer: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;

  while (offset + HEADER_SIZE <= buffer.length) {
    if (isZeroBlock(buffer, offset)) break;

    let name = readString(buffer, offset, 100);
    const size = readOctal(buffer, offset + 124, 12);
    const typeFlag = buffer[offset + 156];
    const prefix = readString(buffer, offset + 345, 155);

    if (prefix) name = `${prefix}/${name}`;

    // Normalize: strip leading ./ and /
    name = name.replace(/^\.\//, "").replace(/^\//, "");

    offset += HEADER_SIZE;

    // Skip directories (type flag '5' or name ending with '/')
    if (typeFlag === 53 || name.endsWith("/")) {
      offset += Math.ceil(size / HEADER_SIZE) * HEADER_SIZE;
      continue;
    }

    // Skip empty names
    if (!name) {
      offset += Math.ceil(size / HEADER_SIZE) * HEADER_SIZE;
      continue;
    }

    // Skip macOS resource fork metadata files
    if (name.startsWith("._") || name.includes("/._")) {
      offset += Math.ceil(size / HEADER_SIZE) * HEADER_SIZE;
      continue;
    }

    const data = buffer.subarray(offset, offset + size);
    entries.push({ name, size, data });

    // Advance past data, padded to 512-byte boundary
    offset += Math.ceil(size / HEADER_SIZE) * HEADER_SIZE;
  }

  return entries;
}
