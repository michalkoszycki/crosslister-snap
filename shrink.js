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

import { fitWithin, JPEG_QUALITY, MAX_EDGE } from "./core.js?v=1.3.0";

/**
 * @param {Blob} file
 * @returns {Promise<Blob>} image/jpeg
 */
export async function shrinkPhoto(file) {
    const source = await decode(file);
    try {
        const { width, height } = fitWithin(source.width, source.height, MAX_EDGE);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(source.image, 0, 0, width, height);
        const blob = await new Promise((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
        );
        canvas.width = 0; // let the phone have the memory back now
        if (!blob) throw new Error("could not make a JPEG of it");
        return blob;
    } finally {
        source.release();
    }
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
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.src = url;
        try {
            await img.decode();
        } catch {
            URL.revokeObjectURL(url);
            throw new Error("could not read the photo");
        }
        return {
            image: img,
            width: img.naturalWidth,
            height: img.naturalHeight,
            release: () => URL.revokeObjectURL(url),
        };
    }
}
