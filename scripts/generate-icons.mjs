// Generates the PWA icons (192 & 512) as valid PNGs with no external deps.
// Design: dark background with a centered rounded "key" square in accent green —
// enough to be installable and recognisable; replace with real art any time.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BG = [0x0a, 0x0a, 0x0a];
const FG = [0x4a, 0xde, 0x80];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(size) {
  // Build RGB pixels: rounded-square motif centred in the canvas.
  const inset = Math.round(size * 0.18);
  const radius = Math.round(size * 0.12);
  const lo = inset;
  const hi = size - inset;
  const stride = size * 3 + 1; // +1 filter byte per scanline
  const raw = Buffer.alloc(stride * size);

  const inRoundedSquare = (x, y) => {
    if (x < lo || x >= hi || y < lo || y >= hi) return false;
    // round only the corners
    const corners = [
      [lo + radius, lo + radius],
      [hi - radius, lo + radius],
      [lo + radius, hi - radius],
      [hi - radius, hi - radius],
    ];
    const nearCornerX = x < lo + radius || x >= hi - radius;
    const nearCornerY = y < lo + radius || y >= hi - radius;
    if (nearCornerX && nearCornerY) {
      return corners.some(([cx, cy]) => {
        const dx = x - cx;
        const dy = y - cy;
        return dx * dx + dy * dy <= radius * radius;
      });
    }
    return true;
  };

  // a darker "keyhole" notch in the centre to read as a lock
  const cx = size / 2;
  const holeR = Math.round(size * 0.06);

  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter type 0 (none)
    for (let x = 0; x < size; x++) {
      let color = BG;
      if (inRoundedSquare(x, y)) {
        const dx = x - cx;
        const dy = y - cx;
        color = dx * dx + dy * dy <= holeR * holeR ? BG : FG;
      }
      const off = y * stride + 1 + x * 3;
      raw[off] = color[0];
      raw[off + 1] = color[1];
      raw[off + 2] = color[2];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Wrap a PNG into a single-image .ico container (PNG-in-ICO, supported by all
// modern browsers) so the favicon.ico reference in index.html resolves.
function ico(pngBuf, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count
  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size; // width (0 means 256)
  entry[1] = size >= 256 ? 0 : size; // height
  entry[2] = 0; // palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBuf.length, 8); // bytes in resource
  entry.writeUInt32LE(6 + 16, 12); // offset to image data
  return Buffer.concat([header, entry, pngBuf]);
}

mkdirSync(OUT, { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(join(OUT, `icon-${size}.png`), png(size));
  console.log(`wrote icon-${size}.png`);
}

const PUBLIC = join(OUT, '..');
writeFileSync(join(PUBLIC, 'favicon.ico'), ico(png(32), 32));
console.log('wrote favicon.ico');
