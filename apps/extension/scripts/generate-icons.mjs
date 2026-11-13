// Generates the extension icons (16/32/48/128 PNG) with Node built-ins only.
// Design: rounded square with a diagonal violet→blue gradient and a bold white "V".
// Anti-aliased by supersampling. Idempotent: rerunning rewrites identical files.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'icons');
const SIZES = [16, 32, 48, 128];
const SUPERSAMPLE = 4;

const VIOLET = [124, 58, 237];
const BLUE = [37, 99, 235];

// CRC-32 (IEEE 802.3), table computed once.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([length, typeBuf, data, crc]);
}

/** RGBA 8-bit PNG from a flat Uint8Array (width * height * 4). */
function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Each scanline is prefixed with filter type 0 (None).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Distance from point (px, py) to segment (ax, ay)-(bx, by). */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return Math.hypot(cx, cy);
}

// Glyph geometry in unit coordinates (0..1). Two strokes meeting at the bottom centre.
const V_STROKES = [
  [0.27, 0.27, 0.5, 0.76],
  [0.73, 0.27, 0.5, 0.76],
];
const V_HALF_WIDTH = 0.085;

function insideRoundedSquare(x, y, radius) {
  const cx = Math.min(Math.max(x, radius), 1 - radius);
  const cy = Math.min(Math.max(y, radius), 1 - radius);
  return Math.hypot(x - cx, y - cy) <= radius;
}

function inGlyph(x, y) {
  return V_STROKES.some(([ax, ay, bx, by]) => distanceToSegment(x, y, ax, ay, bx, by) <= V_HALF_WIDTH);
}

function renderIcon(size) {
  const out = new Uint8Array(size * size * 4);
  const radius = 0.22;
  const samples = SUPERSAMPLE * SUPERSAMPLE;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let inside = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = (px + (sx + 0.5) / SUPERSAMPLE) / size;
          const y = (py + (sy + 0.5) / SUPERSAMPLE) / size;
          if (!insideRoundedSquare(x, y, radius)) continue;
          inside++;
          if (inGlyph(x, y)) {
            r += 255;
            g += 255;
            b += 255;
          } else {
            const t = (x + y) / 2;
            r += VIOLET[0] + (BLUE[0] - VIOLET[0]) * t;
            g += VIOLET[1] + (BLUE[1] - VIOLET[1]) * t;
            b += VIOLET[2] + (BLUE[2] - VIOLET[2]) * t;
          }
        }
      }
      const i = (py * size + px) * 4;
      if (inside > 0) {
        out[i] = Math.round(r / inside);
        out[i + 1] = Math.round(g / inside);
        out[i + 2] = Math.round(b / inside);
      }
      out[i + 3] = Math.round((inside / samples) * 255);
    }
  }
  return out;
}

mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  const file = join(outDir, `icon-${size}.png`);
  writeFileSync(file, encodePng(size, size, renderIcon(size)));
  console.log(`wrote ${file}`);
}
