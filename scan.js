// scan.js -- the ISBN off a photo of a book's barcode.
//
// Chrome on Android reads barcodes itself (the Shape Detection API,
// BarcodeDetector), so no library and no network are needed: the photo from
// Scan is handed to it and the EAN-13 under the bars comes back. iPhones and
// desktop browsers have no BarcodeDetector; there the answer is simply "" and
// the page asks for the ISBN to be typed, which is what canScan() lets it say
// up front. Nothing here throws: an unreadable photo is "", not an error; the
// page then asks for another try or the typed number. The photo is only read
// here, never kept: the barcode close-up is not a listing photo.

import { normalizeIsbn } from "./book.js?v=1.20.0";

/** True when this browser can read a barcode from a photo. */
export function canScan() {
    return typeof globalThis.BarcodeDetector === "function";
}

/**
 * The ISBN-13 printed as the barcode in this photo, or "".
 * Only a bookland EAN (978/979, right check digit) counts: the small price
 * add-on beside it, or a shop's own sticker, is not the book.
 * @param {Blob} file
 * @returns {Promise<string>}
 */
export async function readIsbn(file) {
    if (!canScan()) return "";
    let bitmap = null;
    try {
        const detector = new globalThis.BarcodeDetector({ formats: ["ean_13"] });
        bitmap = await createImageBitmap(file);
        const found = await detector.detect(bitmap);
        for (const code of Array.isArray(found) ? found : []) {
            const isbn = normalizeIsbn(code && typeof code.rawValue === "string" ? code.rawValue : "");
            if (isbn) return isbn;
        }
        return "";
    } catch {
        // an unsupported format, a photo it cannot decode: nothing readable
        return "";
    } finally {
        if (bitmap && typeof bitmap.close === "function") bitmap.close();
    }
}
