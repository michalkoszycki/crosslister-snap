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

import { fitWithin, JPEG_QUALITY, MAX_EDGE } from "./core.js?v=1.16.0";

const SHRINK_TRIES = 3;

/**
 * @param {Blob} file
 * @returns {Promise<Blob>} image/jpeg
 */
export async function shrinkPhoto(file) {
    const source = await decode(file);
    try {
        let { width, height } = fitWithin(source.width, source.height, MAX_EDGE);
        for (let attempt = 0; attempt < SHRINK_TRIES; attempt += 1) {
            const blob = await draw(source.image, width, height);
            if (blob) return blob;
            // no JPEG came back: too much for this phone at that size; try smaller
            width = Math.max(1, Math.round(width / 2));
            height = Math.max(1, Math.round(height / 2));
        }
        throw new Error(`could not make a JPEG of it (${describe(file)})`);
    } finally {
        source.release();
    }
}

/** A JPEG of `image` at width x height, or null when the canvas gave none. */
async function draw(image, width, height) {
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
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    canvas.width = 0; // let the phone have the memory back now
    return blob;
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
