// book.js -- pure logic for the book mode: the ISBN, the price, the condition,
// and what the book card and the lines around it say. No DOM, no network, no
// browser globals; core.js keeps the book's state and imports these rules.
//
// A book is not described by a model looking at photos, as goods are: the ISBN
// names it exactly, the PC looks it up in the catalogues (GET /books/<isbn13>)
// and prices it from eBay's own listings. So the phone's job is to get a right
// ISBN (from the barcode, or typed), a condition and a price, and the photos.

/**
 * The four conditions eBay's book category takes, in the order the chips show
 * them. The value is what the PC is sent; the label is what the chip says.
 */
export const CONDITIONS = [
    { value: "like_new", label: "Like new" },
    { value: "very_good", label: "Very good" },
    { value: "good", label: "Good" },
    { value: "acceptable", label: "Acceptable" },
];

/** Most used books he sells are read once and shelved: "good" is the honest default. */
export const DEFAULT_CONDITION = "good";

/** A price under this is hardly worth a listing of its own. */
export const LOW_PRICE = 5;

/**
 * How long after the last keystroke in the ISBN box the book is looked up:
 * long enough not to ask about every half-typed number, short enough to feel
 * instant once the last digit is in.
 */
export const ISBN_DEBOUNCE_MS = 400;

/** What the line above Scan adds: the scan is for the number, not for the listing. */
export const SCAN_IS_NOT_A_PHOTO = "A close-up of the barcode is enough; it is not a listing photo.";

// --- the ISBN ------------------------------------------------------------------

/** The EAN-13 check digit of the first twelve digits. */
function ean13Check(twelve) {
    let sum = 0;
    for (let i = 0; i < 12; i += 1) sum += Number(twelve[i]) * (i % 2 === 0 ? 1 : 3);
    return String((10 - (sum % 10)) % 10);
}

/** The ISBN-10 check character of the first nine digits ("X" stands for 10). */
function isbn10Check(nine) {
    let sum = 0;
    for (let i = 0; i < 9; i += 1) sum += Number(nine[i]) * (10 - i);
    const c = (11 - (sum % 11)) % 11;
    return c === 10 ? "X" : String(c);
}

/**
 * What was typed (or read off the barcode) as an ISBN-13, or "" when it is not
 * a valid ISBN. The PC is always asked by ISBN-13, so the one book has one
 * name whichever of its numbers was typed.
 *
 * - spaces and hyphens are dropped, and a leading "ISBN", "ISBN-10:" or
 *   "ISBN-13:" (what is printed above the barcode)
 * - 13 digits: must start 978 or 979 (a bookland EAN; any other barcode on the
 *   back cover, a price add-on say, is not the book) and carry the right check digit
 * - 10 characters: nine digits and a check digit or X, checked, then turned
 *   into the 978 ISBN-13 the same way the publishers do
 *
 * @param {unknown} text
 * @returns {string} 13 digits, or ""
 */
export function normalizeIsbn(text) {
    if (typeof text !== "string") return "";
    const bare = text
        .trim()
        .replace(/^isbn(?:-1[03])?\s*:?\s*/i, "")
        .replace(/[\s-]/g, "");
    if (/^\d{13}$/.test(bare)) {
        if (!/^97[89]/.test(bare)) return "";
        return ean13Check(bare.slice(0, 12)) === bare[12] ? bare : "";
    }
    if (/^\d{9}[\dXx]$/.test(bare)) {
        if (isbn10Check(bare.slice(0, 9)) !== bare[9].toUpperCase()) return "";
        const body = `978${bare.slice(0, 9)}`;
        return body + ean13Check(body);
    }
    return "";
}

// --- the price -----------------------------------------------------------------

/**
 * The price typed into the box as the string the PC is sent, or "" when it is
 * not a price above zero. Whole dollars are the usual thing ("12"); cents are
 * kept to two places ("7.5" -> "7.50"); a "$" in front and a decimal comma
 * (what some phone keyboards offer) are accepted.
 * @param {unknown} text
 * @returns {string}
 */
export function bookPriceValue(text) {
    if (typeof text !== "string") return "";
    const bare = text.trim().replace(/^\$\s*/, "").replace(",", ".");
    if (!/^\d{1,5}(\.\d{1,2})?$/.test(bare)) return "";
    const value = Number(bare);
    if (!(value > 0)) return "";
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** "$6" for "6.00", "$24.50" for "24.5"; "" for anything that is not a number. */
export function money(text) {
    if (text === null || text === undefined || text === "") return "";
    const value = Number(text);
    if (!Number.isFinite(value) || value < 0) return "";
    return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

/**
 * The small line under the price box, from the PC's look at eBay:
 * "eBay: 12 listings, $6–$24 · suggested $11", or "no eBay listings found —
 * set a price"; with "under $5: a lot or a buyback site may be better" added
 * when the suggestion is that low, because a single cheap book costs more in
 * time and fees than it brings.
 * @param {{phase:string, price:string, listings:(null|{count:number, low:string, high:string})}} lookup
 * @returns {string}
 */
export function priceNote(lookup) {
    if (!lookup || lookup.phase !== "found") return "";
    const parts = [];
    const l = lookup.listings;
    if (l && l.count > 0) {
        let seen = `eBay: ${l.count === 1 ? "1 listing" : `${l.count} listings`}`;
        const low = money(l.low);
        const high = money(l.high);
        if (low && high) seen += low === high ? `, ${low}` : `, ${low}–${high}`;
        parts.push(seen);
        if (lookup.price) parts.push(`suggested ${money(lookup.price)}`);
    } else {
        parts.push("no eBay listings found — set a price");
    }
    if (lookup.price && Number(lookup.price) < LOW_PRICE) {
        parts.push(`under $${LOW_PRICE}: a lot or a buyback site may be better`);
    }
    return parts.join(" · ");
}

// --- the PC's answer --------------------------------------------------------------

function text(v) {
    if (typeof v === "string") return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return "";
}

/**
 * The book as the card shows it, from GET /books/<isbn13>. Anything missing or
 * of the wrong kind becomes "" (or [] / 0), so the card never prints "undefined".
 * @param {Record<string, unknown>} answer
 * @returns {{title:string, subtitle:string, authors:string[], publisher:string, year:string, format:string, pages:number}}
 */
export function bookRecord(answer) {
    const a = answer && typeof answer === "object" ? answer : {};
    return {
        title: text(a.title),
        subtitle: text(a.subtitle),
        authors: Array.isArray(a.authors) ? a.authors.map(text).filter(Boolean) : [],
        publisher: text(a.publisher),
        year: text(a.year),
        format: text(a.format),
        pages: Number.isInteger(a.pages) && a.pages > 0 ? a.pages : 0,
    };
}

/**
 * eBay's listings as the PC counted them, or null when it found none or said nothing.
 * @param {unknown} listings
 * @returns {null|{count:number, low:string, high:string}}
 */
export function bookListings(listings) {
    if (!listings || typeof listings !== "object") return null;
    const count = Number.isInteger(listings.count) && listings.count > 0 ? listings.count : 0;
    return { count, low: text(listings.low), high: text(listings.high) };
}

/**
 * The book card: hidden until there is an ISBN; then "looking up", the book
 * (title in bold, the authors, "publisher · year · format · pages"), "not in
 * the catalogues", or the PC's own words for why it could not look.
 * @param {{isbn:string, lookup:{phase:string, record:(null|ReturnType<typeof bookRecord>), error:string}}} book
 * @returns {{hidden:boolean, status:string, kind:""|"busy"|"bad", title:string, authors:string, details:string}}
 */
export function bookCard(book) {
    const empty = { hidden: false, status: "", kind: "", title: "", authors: "", details: "" };
    if (!book.isbn) return { ...empty, hidden: true };
    const { lookup } = book;
    switch (lookup.phase) {
        case "found": {
            const r = lookup.record || bookRecord({});
            return {
                ...empty,
                title: r.subtitle ? `${r.title}: ${r.subtitle}` : r.title || `ISBN ${book.isbn}`,
                authors: r.authors.join(", "),
                details: [r.publisher, r.year, r.format, r.pages ? `${r.pages} pages` : ""]
                    .filter(Boolean)
                    .join(" · "),
            };
        }
        case "missing":
            return { ...empty, status: "Not in the catalogues. Post it as goods instead.", kind: "bad" };
        case "failed":
            return { ...empty, status: lookup.error || "the book was not looked up", kind: "bad" };
        default:
            // idle with an ISBN is the moment before the lookup goes
            return { ...empty, status: `Looking up ${book.isbn}…`, kind: "busy" };
    }
}

/**
 * The one line above Scan: what to do first, or why Scan is not there.
 *
 * The Scan picture is only read for its barcode and then dropped: it never
 * joins the listing's photos (Michal, 2026-09-27: "it's just a closeup of the
 * barcode"). So the line says a close-up is enough, and a miss changes nothing
 * but this line.
 * @param {object} o
 * @param {boolean} o.canScan   the phone can read a barcode from a photo (scan.js)
 * @param {""|"reading"|"missed"} o.scan  the last scan: being read, or nothing readable in it
 * @param {boolean} o.hasItem   the book's folder is made on the PC: its ISBN is fixed
 * @param {boolean} o.locked    the listing went: the photos are its
 * @param {boolean} o.restoring the book is being read back after a reload
 * @returns {string} "" when there is nothing to say
 */
export function scanHint({ canScan, scan, hasItem, locked, restoring }) {
    if (restoring) return "Reading this book back from the PC...";
    if (locked) return "These photos went with the listing. DONE starts the next book.";
    if (scan === "reading") return "Reading the barcode...";
    if (scan === "missed") return "No barcode found — try again closer, or type the ISBN under the barcode";
    if (hasItem) return "";
    if (!canScan) return "This phone cannot read barcodes; type the ISBN";
    return `Scan the barcode on the back cover, or type the ISBN. ${SCAN_IS_NOT_A_PHOTO}`;
}
