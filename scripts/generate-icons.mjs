// Génère les icônes PNG de l'application (sans dépendance) : une assiette,
// une fourchette et un couteau sur fond vert. Usage : npm run icons
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const roundRect = (px, py, cx, cy, half, r) => {
  const qx = Math.abs(px - cx) - half + r;
  const qy = Math.abs(py - cy) - half + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const TOP = hex('#5CB85C');
const BOTTOM = hex('#2F7D32');
const PLATE = hex('#FFFDF7');
const RIM = hex('#E9E2D0');
const SHADOW = hex('#1F5A22');
const METAL = hex('#FFFFFF');
const SAUCE = hex('#E8590C');

const capsule = (u, v, x, y0, y1, r) => {
  const cy = Math.min(Math.max(v, y0), y1);
  return Math.hypot(u - x, v - cy) - r;
};

/** Couleur d'un point (coordonnées normalisées 0..1) : assiette, fourchette et couteau. */
function shade(u, v, { maskable, rounded }) {
  let col = mix(TOP, BOTTOM, v);
  let alpha = 1;
  if (rounded && roundRect(u, v, 0.5, 0.5, 0.5, 0.22) > 0) alpha = 0;
  const k = maskable ? 0.8 : 1; // zone de sécurité des icônes « maskable »
  const X = (x) => 0.5 + (x - 0.5) * k;
  const R = (r) => r * k;
  const cx = 0.5;
  const cy = 0.5;
  const d = Math.hypot(u - cx, v - cy);
  if (Math.hypot(u - cx - R(0.012), v - cy - R(0.025)) <= R(0.25)) col = mix(col, SHADOW, 0.5);
  if (d <= R(0.25)) col = RIM;
  if (d <= R(0.19)) col = PLATE;
  if (d <= R(0.085)) col = mix(PLATE, SAUCE, 0.85);
  // fourchette (à gauche)
  const fx = X(0.17);
  if (capsule(u, v, fx, X(0.42), X(0.8), R(0.018)) <= 0) col = METAL;
  if (Math.abs(u - fx) <= R(0.05) && v >= X(0.36) && v <= X(0.43)) col = METAL;
  for (const dx of [-0.04, 0, 0.04]) if (capsule(u, v, fx + R(dx), X(0.2), X(0.4), R(0.011)) <= 0) col = METAL;
  // couteau (à droite)
  const kx = X(0.83);
  if (capsule(u, v, kx, X(0.5), X(0.8), R(0.02)) <= 0) col = METAL;
  if (v >= X(0.2) && v <= X(0.52) && u >= kx - R(0.02) && u <= kx + R(0.03) - (X(0.52) - v) * 0) {
    const t = (v - X(0.2)) / (X(0.52) - X(0.2));
    if (u <= kx + R(0.035) * Math.min(1, t * 3)) col = METAL;
  }
  return [...col, alpha * 255];
}

function render(size, opts) {
  const N = 4; // suréchantillonnage 4×4 pour l'anticrénelage
  return png(size, (x, y) => {
    const acc = [0, 0, 0, 0];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const c = shade((x + (i + 0.5) / N) / size, (y + (j + 0.5) / N) / size, opts);
      const a = c[3] / 255;
      acc[0] += c[0] * a; acc[1] += c[1] * a; acc[2] += c[2] * a; acc[3] += a;
    }
    if (acc[3] === 0) return [0, 0, 0, 0];
    return [acc[0] / acc[3], acc[1] / acc[3], acc[2] / acc[3], (acc[3] / (N * N)) * 255].map(Math.round);
  });
}

mkdirSync('public/icons', { recursive: true });
const out = [
  ['icon-192.png', 192, { rounded: true }],
  ['icon-512.png', 512, { rounded: true }],
  ['maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, {}], // iOS arrondit lui-même ; pas de transparence
  ['favicon-32.png', 32, { rounded: true }],
];
for (const [name, size, opts] of out) {
  writeFileSync(`public/icons/${name}`, render(size, opts));
  console.log('écrit', name);
}
