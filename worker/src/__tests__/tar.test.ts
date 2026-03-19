import { describe, expect, it } from "vite-plus/test";
import { parseTar } from "../tar.ts";

function createTarHeader(name: string, size: number, typeFlag = 0x30): Uint8Array {
  const header = new Uint8Array(512);
  // Name (offset 0, 100 bytes)
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(name);
  header.set(nameBytes.subarray(0, 100), 0);
  // Size (offset 124, 12 bytes, octal)
  const sizeStr = size.toString(8).padStart(11, "0");
  header.set(encoder.encode(sizeStr), 124);
  // Type flag (offset 156)
  header[156] = typeFlag;
  return header;
}

function createTarEntry(name: string, content: string): Uint8Array {
  const data = new TextEncoder().encode(content);
  const header = createTarHeader(name, data.length);
  const paddedSize = Math.ceil(data.length / 512) * 512;
  const entry = new Uint8Array(512 + paddedSize);
  entry.set(header, 0);
  entry.set(data, 512);
  return entry;
}

function createTar(entries: Array<{ name: string; content: string }>): Uint8Array {
  const parts = entries.map((e) => createTarEntry(e.name, e.content));
  const totalSize = parts.reduce((sum, p) => sum + p.length, 0) + 1024; // + end-of-archive
  const tar = new Uint8Array(totalSize);
  let offset = 0;
  for (const part of parts) {
    tar.set(part, offset);
    offset += part.length;
  }
  return tar;
}

describe("parseTar", () => {
  it("parses a tar with multiple files", () => {
    const tar = createTar([
      { name: "index.html", content: "<h1>Hello</h1>" },
      { name: "style.css", content: "body {}" },
    ]);
    const entries = parseTar(tar);
    expect(entries).toHaveLength(2);
    expect(entries[0].name).toBe("index.html");
    expect(entries[1].name).toBe("style.css");
  });

  it("skips directory entries", () => {
    const dirHeader = createTarHeader("assets/", 0, 0x35); // type '5' = directory
    const fileEntry = createTarEntry("index.html", "<h1>Hi</h1>");
    const tar = new Uint8Array(dirHeader.length + fileEntry.length + 1024);
    tar.set(dirHeader, 0);
    tar.set(fileEntry, dirHeader.length);
    const entries = parseTar(tar);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("index.html");
  });

  it("strips leading ./ from names", () => {
    const tar = createTar([{ name: "./index.html", content: "<h1>Hi</h1>" }]);
    const entries = parseTar(tar);
    expect(entries[0].name).toBe("index.html");
  });

  it("skips macOS ._metadata files", () => {
    const tar = createTar([
      { name: "._index.html", content: "metadata" },
      { name: "index.html", content: "<h1>Hi</h1>" },
    ]);
    const entries = parseTar(tar);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("index.html");
  });

  it("returns empty array for empty tar", () => {
    const tar = new Uint8Array(1024); // two zero blocks
    const entries = parseTar(tar);
    expect(entries).toHaveLength(0);
  });

  it("preserves file data correctly", () => {
    const content = "<h1>Hello World!</h1>";
    const tar = createTar([{ name: "index.html", content }]);
    const entries = parseTar(tar);
    const decoded = new TextDecoder().decode(entries[0].data);
    expect(decoded).toBe(content);
  });
});
