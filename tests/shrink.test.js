// tests/shrink.test.js -- Fix dark photos (Michal, 2026-10-08: "Can we add auto exposure
// correction on the photos (non-AI)? Some of mine are quite dark."): the brightness measured,
// the table that brightens a dark picture, and that table applied, on plain pixel arrays; then
// shrinkPhoto on a stub canvas, which brightens a dark picture and leaves any other alone.

import test from "node:test";
import assert from "node:assert/strict";

import {
    applyTable,
    DARK_MEDIAN,
    DARK_P95,
    GAMMA,
    GAMMA_DEEP,
    levelsTable,
    luminanceStats,
    MAX_STRETCH,
    shrinkPhoto,
} from "../shrink.js";

/** RGBA pixels, one per value of `levels`, each a grey of that value. */
function greys(levels) {
    return Uint8ClampedArray.from(levels.flatMap((v) => [v, v, v, 255]));
}

/** `n` values from `low` to `high`, evenly. */
function ramp(n, low, high) {
    return Array.from({ length: n }, (_, i) => Math.round(low + ((high - low) * i) / (n - 1)));
}

/** The mean luminance of RGBA `data`, every pixel. */
function mean(data) {
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    return sum / (data.length / 4);
}

const DARK = greys(ramp(400, 4, 80));
const NORMAL = greys(ramp(400, 20, 240));

test("luminanceStats samples every 4th pixel and reads its percentiles", () => {
    // 8 pixels, 0..70 in tens: the samples are pixels 0 and 4 (0 and 40)
    const stats = luminanceStats(greys([0, 10, 20, 30, 40, 50, 60, 70]));
    assert.equal(stats.count, 2);
    assert.equal(stats.p1, 0);
    assert.equal(stats.median, 0);
    assert.equal(stats.p99, 40);
    // the weights are luminance's: pure green is brighter than pure blue
    const green = luminanceStats(Uint8ClampedArray.from([0, 255, 0, 255]));
    const blue = luminanceStats(Uint8ClampedArray.from([0, 0, 255, 255]));
    assert.equal(green.median, 150);
    assert.equal(blue.median, 29);
    const gradient = luminanceStats(DARK);
    assert.equal(gradient.count, 100);
    assert.ok(gradient.median < DARK_MEDIAN && gradient.p95 < DARK_P95);
    assert.deepEqual(luminanceStats([]), { count: 0, p1: 0, median: 0, p95: 0, p99: 0 });
});

test("a dark gradient gets brighter: the table stretches it and lifts it", () => {
    const table = levelsTable(luminanceStats(DARK));
    assert.ok(table, "dark: a table");
    const data = Uint8ClampedArray.from(DARK);
    applyTable(data, table);
    assert.ok(mean(data) > mean(DARK) + 40, `brighter: ${mean(DARK)} -> ${mean(data)}`);
    // its brightest pixel far brighter (not quite white: 4..80 is too narrow to stretch whole),
    // its darkest still dark
    assert.ok(data[data.length - 4] > 180, `${data[data.length - 4]}`);
    assert.ok(data[data.length - 4] < 255);
    assert.ok(data[0] <= 10);
});

test("a picture that is not dark is never touched", () => {
    assert.equal(levelsTable(luminanceStats(NORMAL)), null);
    // bright in the middle and at the top
    assert.equal(levelsTable({ count: 10, p1: 5, median: DARK_MEDIAN, p95: DARK_P95, p99: 250 }), null);
    // dark by either measure is enough
    assert.ok(levelsTable({ count: 10, p1: 5, median: DARK_MEDIAN - 1, p95: 250, p99: 252 }));
    assert.ok(levelsTable({ count: 10, p1: 5, median: 120, p95: DARK_P95 - 1, p99: 180 }));
    assert.equal(levelsTable({ count: 0, p1: 0, median: 0, p95: 0, p99: 0 }), null, "no pixels: nothing to do");
    assert.equal(levelsTable(null), null);
});

test("the table is monotone, within 0..255, and clamps to 255 past the white point", () => {
    for (const stats of [
        luminanceStats(DARK),
        { count: 10, p1: 0, median: 30, p95: 60, p99: 70 },
        { count: 10, p1: 200, median: 210, p95: 160, p99: 220 },
        { count: 10, p1: 40, median: 42, p95: 44, p99: 45 },
    ]) {
        const table = levelsTable(stats);
        assert.equal(table.length, 256);
        for (let v = 1; v < 256; v += 1) assert.ok(table[v] >= table[v - 1], `monotone at ${v}`);
        assert.ok(table.every((x) => x >= 0 && x <= 255));
        assert.equal(table[255], 255);
    }
    // black at the 1st percentile, white at the 99th
    const table = levelsTable({ count: 10, p1: 10, median: 40, p95: 150, p99: 200 });
    assert.equal(table[10], 0);
    assert.equal(table[200], 255);
    assert.equal(table[230], 255, "clamped");
});

test("the stretch is at most 2.5x: a narrow dark range is not blown up", () => {
    // 40..45 would be 51x; the white point is pushed out so the range is 255 / 2.5 wide
    const table = levelsTable({ count: 10, p1: 40, median: 42, p95: 44, p99: 45 });
    const width = 255 / MAX_STRETCH;
    assert.equal(table[40], 0);
    assert.ok(table[45] < 60, `gently: ${table[45]}`);
    assert.equal(table[Math.ceil(40 + width)], 255);
    assert.ok(table[Math.floor(40 + width) - 1] < 255);
});

test("the lift: gamma 0.8 for a very dark picture (median under 60), else 0.9", () => {
    const full = { count: 10, p1: 0, p95: 150, p99: 255 };
    assert.equal(GAMMA_DEEP, 0.8);
    assert.equal(GAMMA, 0.9);
    assert.equal(levelsTable({ ...full, median: 59 })[128], Math.round(255 * (128 / 255) ** 0.8));
    assert.equal(levelsTable({ ...full, median: 60 })[128], Math.round(255 * (128 / 255) ** 0.9));
});

test("applyTable maps red, green and blue in place and leaves alpha alone", () => {
    const table = Uint8ClampedArray.from({ length: 256 }, (_, v) => 255 - v);
    const data = Uint8ClampedArray.from([0, 100, 200, 77, 255, 1, 2, 3]);
    assert.equal(applyTable(data, table), data);
    assert.deepEqual([...data], [255, 155, 55, 77, 0, 254, 253, 3]);
});

/** A canvas as shrink.js uses one, holding `pixels`: what it did is in `log`. */
function stubCanvas(pixels, log) {
    globalThis.createImageBitmap = async () => ({ width: 4000, height: 3000, close() {} });
    globalThis.document = {
        createElement: () => {
            const canvas = {
                width: 0,
                height: 0,
                lit: false,
                getContext: () => ({
                    drawImage() {},
                    getImageData: (x, y, w, h) => {
                        log.push(`read ${w}x${h}`);
                        return { data: Uint8ClampedArray.from(pixels) };
                    },
                    putImageData: (img) => {
                        log.push(`wrote ${mean(img.data) > mean(pixels) ? "brighter" : "same"}`);
                        canvas.lit = true;
                    },
                }),
                toBlob(cb, type) {
                    cb(new Blob([`jpeg ${canvas.width}x${canvas.height}${canvas.lit ? " lit" : ""}`], { type }));
                },
            };
            return canvas;
        },
    };
}

test("shrinkPhoto: a dark photo is brightened and its picture from before kept; any other goes as it is", async () => {
    const file = new Blob(["raw"], { type: "image/jpeg" });
    const log = [];
    stubCanvas(DARK, log);
    const dark = await shrinkPhoto(file, { fixDark: true });
    assert.equal(await dark.jpeg.text(), "jpeg 2000x1500 lit");
    assert.equal(await dark.original.text(), "jpeg 2000x1500", "the picture as taken, for the before/after look");
    assert.deepEqual(log, ["read 2000x1500", "wrote brighter"]);

    log.length = 0;
    stubCanvas(NORMAL, log);
    const normal = await shrinkPhoto(file, { fixDark: true });
    assert.equal(await normal.jpeg.text(), "jpeg 2000x1500");
    assert.equal(normal.original, null);
    assert.deepEqual(log, ["read 2000x1500"], "measured, never written");

    log.length = 0;
    stubCanvas(DARK, log);
    const off = await shrinkPhoto(file);
    assert.equal(await off.jpeg.text(), "jpeg 2000x1500");
    assert.equal(off.original, null);
    assert.deepEqual(log, [], "Fix dark photos unticked: not even measured");
    delete globalThis.document;
    delete globalThis.createImageBitmap;
});
