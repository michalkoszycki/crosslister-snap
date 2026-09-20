// tools/make-icons.mjs -- writes icon-192.png and icon-512.png.
// Run with: node tools/make-icons.mjs
// No dependencies: it rasterises the same shapes as icon.svg by hand and
// deflates them with Node's built-in zlib. Android's "Add to Home screen"
// wants PNGs, so we ship them alongside the SVG.

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BLUE = [0x16, 0x67, 0xc8];
const WHITE = [0xff, 0xff, 0xff];

function render(size) {
    const s = size / 512; // shapes are authored on a 512 grid
    const px = (x, y) => {
        const X = x / s;
        const Y = y / s;
        // rounded-square background
        if (!insideRoundRect(X, Y, 0, 0, 512, 512, 112)) return null; // transparent
        let c = BLUE;
        // camera body
        if (insideRoundRect(X, Y, 148, 168, 364, 208, 28)) c = WHITE;
        // the bump on top of the body
        if (insideTrapezoid(X, Y)) c = WHITE;
        // lens
        const d2 = (X - 290) ** 2 + (Y - 272) ** 2;
        if (d2 <= 62 * 62) c = BLUE;
        if (d2 <= 34 * 34) c = WHITE;
        // viewfinder nub
        if (insideRoundRect(X, Y, 176, 196, 46, 22, 11)) c = BLUE;
        return c;
    };

    const raw = Buffer.alloc((size * 4 + 1) * size);
    let o = 0;
    for (let y = 0; y < size; y += 1) {
        raw[o] = 0; // filter: none
        o += 1;
        for (let x = 0; x < size; x += 1) {
            const c = px(x + 0.5, y + 0.5);
            if (c === null) {
                raw[o] = 0;
                raw[o + 1] = 0;
                raw[o + 2] = 0;
                raw[o + 3] = 0;
            } else {
                raw[o] = c[0];
                raw[o + 1] = c[1];
                raw[o + 2] = c[2];
                raw[o + 3] = 255;
            }
            o += 4;
        }
    }
    return png(size, size, deflateSync(raw, { level: 9 }));
}

function insideRoundRect(x, y, rx, ry, w, h, r) {
    if (x < rx || y < ry || x > rx + w || y > ry + h) return false;
    const cx = Math.min(Math.max(x, rx + r), rx + w - r);
    const cy = Math.min(Math.max(y, ry + r), ry + h - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r + 1e-9;
}

// the little raised part above the lens, between x=246 and x=314, y=134..168
function insideTrapezoid(x, y) {
    return y >= 134 && y <= 170 && x >= 246 && x <= 314;
}

function png(width, height, idatData) {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // colour type RGBA
    return Buffer.concat([
        sig,
        chunk("IHDR", ihdr),
        chunk("IDAT", idatData),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
}

const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return c ^ 0xffffffff;
}

const here = dirname(fileURLToPath(import.meta.url));
for (const size of [192, 512]) {
    const file = join(here, "..", `icon-${size}.png`);
    writeFileSync(file, render(size));
    console.log(`wrote ${file}`);
}
