import zlib from "node:zlib";
import type { ImageGenerateInput, ImageGenerateResult, ImageProvider } from "../types.js";

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createSolidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowSize = 1 + width * 3;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const i = rowStart + 1 + x * 3;
      const shade = ((x + y) % 32) * 2;
      raw[i] = Math.min(255, rgb[0] + shade);
      raw[i + 1] = Math.min(255, rgb[1] + shade);
      raw[i + 2] = Math.min(255, rgb[2] + shade);
    }
  }

  const compressed = zlib.deflateSync(raw);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function colorFromPrompt(prompt: string): [number, number, number] {
  let hash = 0;
  for (let i = 0; i < prompt.length; i += 1) {
    hash = (hash * 31 + prompt.charCodeAt(i)) >>> 0;
  }
  return [(hash >> 16) & 255, (hash >> 8) & 255, hash & 255];
}

export class MockImageProvider implements ImageProvider {
  readonly name = "mock-image";

  async generate(input: ImageGenerateInput): Promise<ImageGenerateResult> {
    const rgb = colorFromPrompt(input.prompt);
    return {
      imageBytes: createSolidPng(512, 512, rgb),
      mimeType: "image/png",
      model: "mock-image",
    };
  }
}
