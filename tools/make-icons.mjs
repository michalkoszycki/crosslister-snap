// tools/make-icons.mjs -- writes icon-192.png, icon-512.png,
// icon-maskable-192.png and icon-maskable-512.png.
// Run with: node tools/make-icons.mjs
// No dependencies: it rasterises the same shapes as icon.svg by hand (4 x 4
// samples a pixel, so the edges are smooth) and deflates them with Node's
// built-in zlib. Android's "Add to Home screen" wants PNGs, so we ship them
// alongside the SVG.
//
// The drawing is the A2 mark (Michal, 2026-10-05: "A2 implement"): the camera
// of the header's logo, light variant, on yellow. The mark is authored on its
// own 132 grid (as in index.html). The $ in the lens is drawn as two arcs and
// a bar here, since there is no font to set it in.
//
// The ground is a whole yellow circle, the camera as large as the circle
// allows (Michal, 2026-10-18: "the entire circle should be yellow ... the
// circle that is the shape of the icon will just be a crop round the camera";
// the old rounded square sat inside the launcher's own white circle). Two
// shapes of it:
// - icon-<size>.png ("any"): the circle, transparent around it.
// - icon-maskable-<size>.png ("maskable", and the iPhone's apple-touch-icon):
//   the yellow fills the square edge to edge; the launcher crops it to its own
//   circle or squircle, and iOS paints a transparent pixel black.
// The camera stays inside the maskable safe zone, the centred circle of radius
// 40% of the width: its farthest points (the body's bottom corners) are 74.8
// grid units from (66, 72), and 74.8 x 2.67 = 200 px of the 205 px allowed.

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const YELLOW = [0xff, 0xfc, 0x00];
const INK = [0x0b, 0x0b, 0x0b];
const WHITE = [0xff, 0xff, 0xff];

// the mark's 132 grid onto the 512 tile, (66, 72) on the tile's centre
const K = 2.67;
const SHIFT_X = 256 - 66 * K;
const SHIFT_Y = 256 - 72 * K;

// the $: the same numbers as the path in icon.svg
const S_TOP = { cx: 66, cy: 70.5, from: 90, to: 340 }; // round the left, over the top
const S_BOTTOM = { cx: 66, cy: 81.5, from: -90, to: 160 }; // round the right, under the bottom
const S_R = 5.5;
const S_W = 4.6;
const BAR = { x: 66, y0: 60.5, y1: 91.5, w: 3.2 };

/** The colour at a point of the 512 tile, or null outside the ground (transparent). */
function colourAt(X, Y, maskable) {
    if (!maskable && (X - 256) ** 2 + (Y - 256) ** 2 > 256 * 256) return null;
    const x = (X - SHIFT_X) / K;
    const y = (Y - SHIFT_Y) / K;
    let c = YELLOW;
    // the viewfinder bump, then the body over it: white with an 8-wide ink outline
    if (insideRoundRect(x, y, 36, 2, 60, 38, 14)) c = INK;
    if (insideRoundRect(x, y, 44, 10, 44, 22, 6)) c = WHITE;
    if (insideRoundRect(x, y, 0, 22, 132, 108, 32)) c = INK;
    if (insideRoundRect(x, y, 8, 30, 116, 92, 24)) c = WHITE;
    // the lens: ink ring, yellow glass, the $ in ink
    const d2 = (x - 66) ** 2 + (y - 76) ** 2;
    if (d2 <= 32 * 32) c = INK;
    if (d2 <= 23 * 23) c = YELLOW;
    if (onArc(x, y, S_TOP) || onArc(x, y, S_BOTTOM)) c = INK;
    if (Math.abs(x - BAR.x) <= BAR.w / 2 && y >= BAR.y0 && y <= BAR.y1) c = INK;
    // the flash dot
    if ((x - 106) ** 2 + (y - 46) ** 2 <= 5 * 5) c = INK;
    return c;
}

/** On the $'s stroke: within S_W / 2 of an arc of radius S_R, round at its ends. */
function onArc(x, y, { cx, cy, from, to }) {
    let a = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
    while (a < from) a += 360;
    if (a <= to) return Math.abs(Math.hypot(x - cx, y - cy) - S_R) <= S_W / 2;
    return [from, to].some((deg) => {
        const t = (deg * Math.PI) / 180;
        return Math.hypot(x - (cx + S_R * Math.cos(t)), y - (cy + S_R * Math.sin(t))) <= S_W / 2;
    });
}

function render(size, maskable) {
    const s = size / 512;
    const N = 4; // samples per side of a pixel
    const raw = Buffer.alloc((size * 4 + 1) * size);
    let o = 0;
    for (let py = 0; py < size; py += 1) {
        raw[o] = 0; // filter: none
        o += 1;
        for (let px = 0; px < size; px += 1) {
            let r = 0;
            let g = 0;
            let b = 0;
            let hits = 0;
            for (let j = 0; j < N; j += 1) {
                for (let i = 0; i < N; i += 1) {
                    const c = colourAt((px + (i + 0.5) / N) / s, (py + (j + 0.5) / N) / s, maskable);
                    if (c === null) continue;
                    r += c[0];
                    g += c[1];
                    b += c[2];
                    hits += 1;
                }
            }
            if (hits > 0) {
                raw[o] = Math.round(r / hits);
                raw[o + 1] = Math.round(g / hits);
                raw[o + 2] = Math.round(b / hits);
                raw[o + 3] = Math.round((255 * hits) / (N * N));
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
    for (const [name, maskable] of [[`icon-${size}.png`, false], [`icon-maskable-${size}.png`, true]]) {
        const file = join(here, "..", name);
        writeFileSync(file, render(size, maskable));
        console.log(`wrote ${file}`);
    }
}
