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
  let longName: string | null = null;

  while (offset + HEADER_SIZE <= buffer.length) {
    if (isZeroBlock(buffer, offset)) break;

    let name = readString(buffer, offset, 100);
    const size = readOctal(buffer, offset + 124, 12);
    const typeFlag = buffer[offset + 156];
    const prefix = readString(buffer, offset + 345, 155);
    const dataBlocks = Math.ceil(size / HEADER_SIZE) * HEADER_SIZE;

    if (prefix) name = `${prefix}/${name}`;

    // Normalize: strip leading ./ and /
    name = name.replace(/^\.\//, "").replace(/^\//, "");

    offset += HEADER_SIZE;

    // GNU long-name extension (type 'L' = 0x4C): data block contains the real filename
    if (typeFlag === 0x4c) {
      longName = readString(buffer, offset, size).replace(/^\.\//, "").replace(/^\//, "");
      offset += dataBlocks;
      continue;
    }

    // POSIX pax extended header (type 'x' = 0x78): may contain path= keyword
    if (typeFlag === 0x78) {
      const paxData = readString(buffer, offset, size);
      const pathMatch = paxData.match(/\d+ path=(.+)\n/);
      if (pathMatch) {
        longName = pathMatch[1].replace(/^\.\//, "").replace(/^\//, "");
      }
      offset += dataBlocks;
      continue;
    }

    // Apply long name from preceding extension header
    if (longName) {
      name = longName;
      longName = null;
    }

    // Skip directories (type flag '5' or name ending with '/')
    if (typeFlag === 53 || name.endsWith("/")) {
      offset += dataBlocks;
      continue;
    }

    // Skip empty names
    if (!name) {
      offset += dataBlocks;
      continue;
    }

    // Skip macOS resource fork metadata files
    if (name.startsWith("._") || name.includes("/._")) {
      offset += dataBlocks;
      continue;
    }

    const data = buffer.subarray(offset, offset + size);
    entries.push({ name, size, data });

    // Advance past data, padded to 512-byte boundary
    offset += dataBlocks;
  }

  return entries;
}
