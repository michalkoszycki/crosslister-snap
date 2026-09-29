// pc.js -- every call the page makes to the home PC (`crosslister serve`).
//
// The item, while the photos are taken (it is a folder in the PC's inbox):
//   POST   <pc>/items                 {"name"} -> {"item": id, "photos": [n...]}
//   PUT    <pc>/items/<id>/photos/<n>  the JPEG itself (Content-Type image/jpeg)
//                                      -> {"item", "n", "bytes"}; a retry overwrites
//   DELETE <pc>/items/<id>/photos/<n>  -> {"item", "n", "deleted"}; safe to repeat
//   PUT    <pc>/items/<id>/note        {"note"} -> note.txt beside the photos
//   GET    <pc>/items/<id>             -> {"item", "photos", "note", "sku", "jobs"}
//                                      (a reloaded page reads the item back)
// A book (the book mode), as soon as its ISBN is known:
//   GET    <pc>/books/<isbn13>        -> {"isbn", "title", "subtitle", "authors", "publisher",
//                                          "year", "format", "pages", "price" (or null),
//                                          "listings": {"count", "low", "high"} (or null), "route"}
//                                      404: not in the catalogues (its detail, which may name a
//                                      missing Google Books key, is the card's reason line);
//                                      502: they could not be reached
// A book with no ISBN (No ISBN, then the title typed), as he stops typing:
//   GET    <pc>/books/search?title=<t>&author=<a>&year=<y>
//                                      -> the same as /books/<isbn13>, plus "found": true|false
//                                         (false: no catalogue match; it is listed as typed, and
//                                          "price"/"listings" come from eBay's search by title)
//                                      400: no title; 502: the catalogues could not be reached
// A venue button:
//   POST   <pc>/jobs                  {"item", "venue", "ai": [n...]} or {"sku", "venue"}
//                                      or, a book: {"item", "venue": "ebay",
//                                                   "book": {"isbn", "title", "author", "year", "format",
//                                                            "condition", "price", "main"}}
//                                      (with an ISBN, title/author/year/format are ""; without
//                                       one, isbn is "", the title is what he typed, and format
//                                       is "paperback" or "hardcover"; after a 404 for the
//                                       ISBN and No ISBN, both: the ISBN and the typed fields.
//                                       main: the number n of the photo the listing leads with;
//                                       always sent, the first photo unless he moved the mark)
//                                      The barcode picture from Scan is never uploaded.
//                                      -> {"job": id, "state": "queued", "ahead": n}
//   GET    <pc>/jobs/<id>             -> {"state", "step", "sku", "links", "error", "ahead"}
//   GET    <pc>/jobs?limit=1          the Settings check: answers only to a right key
//
// Every call carries the key in the X-Crosslister-Key header. Errors come back
// as JSON {"detail": "..."}; errorText() in core.js turns them into one line.

import { errorText, KEY_HEADER } from "./core.js?v=1.11.0";

/** An error with the HTTP status (0 = the PC could not be reached). */
export class PcError extends Error {
    constructor(status, detail) {
        super(errorText(status, detail));
        this.name = "PcError";
        this.status = status;
    }
}

async function call(url, key, { method = "GET", json, body, type } = {}) {
    const headers = { [KEY_HEADER]: key };
    let payload = body;
    if (json !== undefined) {
        headers["Content-Type"] = "application/json";
        payload = JSON.stringify(json);
    } else if (type) {
        headers["Content-Type"] = type;
    }
    let res;
    try {
        res = await fetch(url, {
            method,
            headers,
            body: payload,
            cache: "no-store",
            referrerPolicy: "no-referrer",
        });
    } catch {
        throw new PcError(0);
    }
    let answer = null;
    try {
        answer = await res.json();
    } catch {
        answer = null;
    }
    if (!res.ok) throw new PcError(res.status, answer && answer.detail);
    if (!answer || typeof answer !== "object") throw new PcError(res.status, "the PC gave no answer");
    return answer;
}

function itemUrl(pc, item) {
    return `${pc}/items/${encodeURIComponent(item)}`;
}

/**
 * Make (or find) today's item folder for this name.
 * @param {{pc:string, key:string}} settings
 * @param {string} name the cleaned item name
 * @returns {Promise<{item:string, photos:number[]}>}
 */
export function createItem({ pc, key }, name) {
    return call(`${pc}/items`, key, { method: "POST", json: { name } });
}

/**
 * Photo number n of the item, as the shrunk JPEG.
 * @param {{pc:string, key:string}} settings
 * @param {string} item
 * @param {number} n
 * @param {Blob} jpeg
 */
export function putPhoto({ pc, key }, item, n, jpeg) {
    return call(`${itemUrl(pc, item)}/photos/${n}`, key, {
        method: "PUT",
        body: jpeg,
        type: "image/jpeg",
    });
}

/** Photo number n off the PC too (the x). */
export function deletePhoto({ pc, key }, item, n) {
    return call(`${itemUrl(pc, item)}/photos/${n}`, key, { method: "DELETE" });
}

/** The note, as note.txt beside the photos ("" removes it). */
export function putNote({ pc, key }, item, note) {
    return call(`${itemUrl(pc, item)}/note`, key, { method: "PUT", json: { note } });
}

/** The item as the PC has it: photo numbers, note, sku, jobs. */
export function getItem({ pc, key }, item) {
    return call(itemUrl(pc, item), key);
}

/**
 * A book from the catalogues, with eBay's prices for it. Costs no model call.
 * @param {{pc:string, key:string}} settings
 * @param {string} isbn 13 digits (normalizeIsbn in book.js)
 * @returns {Promise<Record<string, unknown>>}
 */
export function getBook({ pc, key }, isbn) {
    return call(`${pc}/books/${encodeURIComponent(isbn)}`, key);
}

/**
 * A book with no ISBN, found by what he typed: the same answer as getBook(),
 * plus "found" (false: no catalogue knows it, and it is listed as typed). The
 * blanks are sent too, as "", so the PC sees one shape of question.
 * @param {{pc:string, key:string}} settings
 * @param {{title:string, author:string, year:string}} query  from bookSearch() in core.js
 * @returns {Promise<Record<string, unknown>>}
 */
export function searchBook({ pc, key }, { title, author, year }) {
    // encodeURIComponent, not URLSearchParams: a space is %20, never a "+" a server might keep
    const q = Object.entries({ title, author, year })
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("&");
    return call(`${pc}/books/search?${q}`, key);
}

/**
 * Send one job.
 * @param {{pc:string, key:string}} settings
 * @param {object} body from jobRequest() in core.js
 * @returns {Promise<{job:string, state:string, ahead:number}>}
 */
export function postJob({ pc, key }, body) {
    return call(`${pc}/jobs`, key, { method: "POST", json: body });
}

/**
 * One job's status.
 * @param {{pc:string, key:string}} settings
 * @param {string} jobId
 */
export function getJob({ pc, key }, jobId) {
    return call(`${pc}/jobs/${encodeURIComponent(jobId)}`, key);
}

/**
 * The Settings check: does the PC answer, and does it know this key?
 * Reads the newest job only; no model call, nothing published.
 * @param {{pc:string, key:string}} settings
 */
export function checkPc({ pc, key }) {
    return call(`${pc}/jobs?limit=1`, key);
}
