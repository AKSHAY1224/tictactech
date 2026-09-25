// tools/make-icons.mjs — dependency-free Node script that writes PNG icons using node:zlib
// Usage: node tools/make-icons.mjs   → assets/icons/icon-192.png, icon-512.png, icon-maskable-512.png
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');
const C1 = [0x22, 0xd3, 0xee]; // cyan
const C2 = [0xf4, 0x72, 0xb6]; // magenta

/* ---------- PNG encoder ---------- */
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none (smallest output for this diagonal gradient)
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- Rasterizer ---------- */
const clamp01 = (v) => Math.max(0, Math.min(1, v));
/** Signed distance to a rounded rectangle centred at (cx, cy). */
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
/** Signed distance to a capsule (line segment with round caps). */
function sdSegment(px, py, ax, ay, bx, by, radius) {
  const abx = bx - ax; const aby = by - ay;
  const t = clamp01(((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t)) - radius;
}

/**
 * Render the icon. Maskable icons are full-bleed with the glyph inside the central safe zone.
 * @param {number} size
 * @param {boolean} maskable
 */
function render(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4);
  const pad = maskable ? 0 : size * 0.03;
  const radius = maskable ? 0 : size * 0.22;
  const box = maskable ? 0.5 : 0.56; // glyph box as a fraction of the size
  const g0 = size * (0.5 - box / 2); const g1 = size * (0.5 + box / 2);
  const third = (g1 - g0) / 3;
  const lineW = size * (maskable ? 0.055 : 0.065);
  const lines = [
    [g0 + third, g0, g0 + third, g1], [g0 + 2 * third, g0, g0 + 2 * third, g1],
    [g0, g0 + third, g1, g0 + third], [g0, g0 + 2 * third, g1, g0 + 2 * third],
  ];
  const SS = 3; // supersampling per axis
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS; const py = y + (sy + 0.5) / SS;
          const dBg = sdRoundRect(px, py, size / 2, size / 2, size / 2 - pad, size / 2 - pad, radius);
          const bgA = maskable ? 1 : clamp01(0.5 - dBg);
          if (bgA <= 0) continue;
          const t = clamp01((px + py) / (2 * size));
          let cr = C1[0] + (C2[0] - C1[0]) * t; let cg = C1[1] + (C2[1] - C1[1]) * t; let cb = C1[2] + (C2[2] - C1[2]) * t;
          let dG = Infinity;
          for (const [ax, ay, bx, by] of lines) dG = Math.min(dG, sdSegment(px, py, ax, ay, bx, by, lineW / 2));
          const glyphA = clamp01(0.5 - dG);
          cr = cr + (255 - cr) * glyphA; cg = cg + (255 - cg) * glyphA; cb = cb + (255 - cb) * glyphA;
          r += cr * bgA; g += cg * bgA; b += cb * bgA; a += bgA;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      if (a > 0) { rgba[i] = Math.round(r / a); rgba[i + 1] = Math.round(g / a); rgba[i + 2] = Math.round(b / a); }
      rgba[i + 3] = Math.round((a / n) * 255);
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync(OUT, { recursive: true });
const jobs = [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true]];
for (const [name, size, maskable] of jobs) {
  const png = render(size, maskable);
  writeFileSync(join(OUT, name), png);
  console.log(`wrote ${name} (${size}×${size}, ${(png.length / 1024).toFixed(1)} KB)`);
}
