// shrink.js -- a photo from the camera, shrunk to at most MAX_EDGE px on the
// long edge and re-encoded as a JPEG, before it is sent to the PC.
//
// A 12 MP phone photo is several MB; 2000 px is more than eBay shows and keeps
// a 24-photo item quick to send over a phone connection. Re-encoding also drops
// the camera's metadata (GPS included) from what leaves the phone.
//
// Orientation: the camera stores "rotate me" in EXIF. createImageBitmap with
// imageOrientation "from-image" applies it, and so does drawing an <img>, which
// is the fallback for a browser that cannot make a bitmap from the file.
// The size math is fitWithin() in core.js, which is tested; this stays thin.
//
// What can go wrong on a phone, and what is done about it (Michal, 2026-10-02:
// several photos from the camera roll at once, the first went, the rest showed
// failed however often he tapped them): a browser may refuse to decode a very
// large picture (iPhone Safari's image memory is finite, and a 48 MP shot is
// 200 MB decoded), or refuse `img.decode()` while the picture still loads and
// draws; and a canvas may give no JPEG back. So: the <img> fallback waits for
// `load` and treats `decode()` as a hint, an empty JPEG is tried again at half
// the size, and every failure names the file's type and size, so the page can
// say which photo and why.
//
// Dark photos (Michal, 2026-10-08: "Can we add auto exposure correction on the photos
// (non-AI)? Some of mine are quite dark."): after the resize and before the JPEG, the
// resized picture's brightness is measured (luminanceStats); a dark one is stretched
// between its own black and white and lifted a little (levelsTable), through one
// 256-entry table applied in a single pass (applyTable). A picture that is not dark is
// never touched. The three are pure and tested on plain pixel arrays.

import { fitWithin, JPEG_QUALITY, MAX_EDGE } from "./core.js?v=2.15.0";

const SHRINK_TRIES = 3;

/** Dark: the middle of its brightness under this (of 255)... */
export const DARK_MEDIAN = 90;
/** ... or its bright end (the 95th percentile) under this. */
export const DARK_P95 = 170;
/** The stretch never makes the picture's range more than this many times wider. */
export const MAX_STRETCH = 2.5;
/** The lift: a very dark picture (its median under DARK_DEEP) gets the stronger one. */
export const DARK_DEEP = 60;
export const GAMMA_DEEP = 0.8;
export const GAMMA = 0.9;

/**
 * @typedef {{count:number, p1:number, median:number, p95:number, p99:number}} LuminanceStats
 *          luminance (0..255) percentiles of the pixels sampled; count 0 for no pixels
 */

/**
 * @param {Blob} file
 * @param {{fixDark?:boolean}} [options] fixDark: brighten a dark picture (Fix dark photos)
 * @returns {Promise<{jpeg:Blob, original:(Blob|null)}>} image/jpeg; `original` is the
 *          picture before the brightening, only when it was brightened
 */
export async function shrinkPhoto(file, { fixDark = false } = {}) {
    const source = await decode(file);
    try {
        let { width, height } = fitWithin(source.width, source.height, MAX_EDGE);
        for (let attempt = 0; attempt < SHRINK_TRIES; attempt += 1) {
            const made = await draw(source.image, width, height, fixDark);
            if (made) return made;
            // no JPEG came back: too much for this phone at that size; try smaller
            width = Math.max(1, Math.round(width / 2));
            height = Math.max(1, Math.round(height / 2));
        }
        throw new Error(`could not make a JPEG of it (${describe(file)})`);
    } finally {
        source.release();
    }
}

/** A JPEG of `image` at width x height (brightened when dark and asked to), or null when the canvas gave none. */
async function draw(image, width, height, fixDark) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    try {
        context.drawImage(image, 0, 0, width, height);
    } catch {
        canvas.width = 0;
        return null;
    }
    const original = fixDark ? await brighten(canvas, context) : null;
    const jpeg = await jpegOf(canvas);
    canvas.width = 0; // let the phone have the memory back now
    return jpeg ? { jpeg, original } : null;
}

/**
 * The canvas brightened in place when its picture is dark; returns the JPEG of it as it
 * was, for the before/after look, or null when nothing was changed. A canvas whose pixels
 * cannot be read (no memory for them), or whose before-JPEG does not come, goes as it is.
 */
async function brighten(canvas, context) {
    let pixels;
    try {
        pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    } catch {
        return null;
    }
    const table = levelsTable(luminanceStats(pixels.data));
    if (!table) return null;
    const original = await jpegOf(canvas);
    if (!original) return null;
    applyTable(pixels.data, table);
    context.putImageData(pixels, 0, 0);
    return original;
}

function jpegOf(canvas) {
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
}

/**
 * How bright a picture is: the luminance (Rec. 601: 0.299 R + 0.587 G + 0.114 B) of every
 * 4th pixel of RGBA `data`, as the percentiles levelsTable needs.
 * @param {ArrayLike<number>} data RGBA bytes, as getImageData gives them
 * @returns {LuminanceStats}
 */
export function luminanceStats(data) {
    const counts = new Array(256).fill(0);
    let count = 0;
    // every 4th pixel: 4 pixels of 4 bytes apart
    for (let i = 0; i + 2 < data.length; i += 16) {
        const y = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        counts[Math.min(255, Math.max(0, y))] += 1;
        count += 1;
    }
    /** The smallest luminance with at least share `q` of the samples at or under it. */
    const at = (q) => {
        const need = Math.max(1, Math.ceil(q * count));
        let seen = 0;
        for (let v = 0; v < 256; v += 1) {
            seen += counts[v];
            if (seen >= need) return v;
        }
        return 255;
    };
    if (count === 0) return { count, p1: 0, median: 0, p95: 0, p99: 0 };
    return { count, p1: at(0.01), median: at(0.5), p95: at(0.95), p99: at(0.99) };
}

/**
 * The 256-entry table that brightens a dark picture, or null for one that is not dark (the
 * median under DARK_MEDIAN, or the 95th percentile under DARK_P95): never touched. The
 * stretch puts black at the 1st percentile and white at the 99th, widened when need be so
 * it is at most MAX_STRETCH; then a gamma lift, GAMMA_DEEP for a median under DARK_DEEP,
 * else GAMMA. Monotone, and every entry within 0..255.
 * @param {LuminanceStats} stats
 * @returns {null|Uint8ClampedArray}
 */
export function levelsTable(stats) {
    if (!stats || !(stats.count > 0)) return null;
    if (!(stats.median < DARK_MEDIAN || stats.p95 < DARK_P95)) return null;
    const least = 255 / MAX_STRETCH;
    let black = stats.p1;
    let white = Math.max(stats.p99, black + least);
    if (white > 255) {
        white = 255;
        black = 255 - least;
    }
    const gamma = stats.median < DARK_DEEP ? GAMMA_DEEP : GAMMA;
    const table = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v += 1) {
        const x = Math.min(1, Math.max(0, (v - black) / (white - black)));
        table[v] = Math.round(255 * x ** gamma);
    }
    return table;
}

/**
 * `table` applied to the red, green and blue of every pixel of RGBA `data`, in place, in one
 * pass; alpha is left as it is.
 * @param {Uint8ClampedArray|number[]} data
 * @param {ArrayLike<number>} table 256 entries
 * @returns {Uint8ClampedArray|number[]} data
 */
export function applyTable(data, table) {
    for (let i = 0; i + 2 < data.length; i += 4) {
        data[i] = table[data[i]];
        data[i + 1] = table[data[i + 1]];
        data[i + 2] = table[data[i + 2]];
    }
    return data;
}

/** "image/heic, 4.2 MB": what the failed photo was, for the line that says so. */
export function describe(file) {
    const kind = (file && file.type) || "unknown type";
    const bytes = (file && file.size) || 0;
    return `${kind}, ${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function decode(file) {
    try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        return {
            image: bitmap,
            width: bitmap.width,
            height: bitmap.height,
            release: () => bitmap.close(),
        };
    } catch {
        // fall through to the <img> route
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    try {
        await new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("the browser could not read it"));
            img.src = url;
        });
    } catch {
        URL.revokeObjectURL(url);
        throw new Error(`could not read the photo (${describe(file)})`);
    }
    // decode() can refuse a picture that loaded and draws fine (Safari, large pictures)
    try {
        await img.decode();
    } catch {
        // drawn from the loaded <img> all the same
    }
    if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) {
        URL.revokeObjectURL(url);
        throw new Error(`could not read the photo (${describe(file)})`);
    }
    return {
        image: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        release: () => URL.revokeObjectURL(url),
    };
}
