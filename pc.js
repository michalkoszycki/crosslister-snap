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
//   GET    <pc>/items/<id>/photos/<n>  -> the JPEG itself (image/jpeg), for the thumbnail of a
//                                      photo read back; 404 for one the item does not hold
// (DELETE <pc>/items/<id> removes the folder whole; the page called it from NEXT on an item
//  nothing was posted from until 2026-10-03, when Michal asked for every item to be kept.)
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
//   DELETE <pc>/jobs/<id>             a pressed job button tapped again (any job, Admin's action
//                                      jobs too, since 2026-10-07) -> {"job", "state": "cancelled" |
//                                      "stopping"}: a queued job is dropped (nothing paid), the
//                                      running one stops at its next step and keeps its draft
//                                      unpublished; 409 once done or failed
//   GET    <pc>/jobs?limit=1          the Settings check: answers only to a right key
// Admin's inventory (Michal, 2026-10-06):
//   GET    <pc>/inventory?q=<t>&venue=<v>&status=<s>&limit=200&sort=age|price&order=desc|asc
//                                      -> {"rows": [summary...]}; venue and status "" for All,
//                                         age desc (newest first) by default, a row with no price
//                                         last when sorted by price (inventoryQuery in core.js)
//   GET    <pc>/inventory/<sku>       -> the summary's keys plus the description, the condition
//                                         note and details, the aspects, the package, craigslist's
//                                         overrides and "photos": [{"n", "name"}...]; 404 unknown sku.
//                                         The summary too carries "pricing" (1|2|3|null, the grade
//                                         the price follows) and "prices" ({"quick", "market",
//                                         "high"}, the first model call's three, cached; nulls)
//   GET    <pc>/inventory/<sku>/photos/<n>
//                                      -> the image itself (jpeg, png or webp); 404 when missing
//   PATCH  <pc>/inventory/<sku>       a card's Save: only the fields changed, any of "title",
//                                      "price" ("24.50"), "description", "note",
//                                      "condition_note", "craigslist": {"title", "price",
//                                      "description", "category"} ("" clears an override);
//                                      customize's Save: any of "quantity", "pickup_only" and
//                                      "pricing" (1|2|3: the PC sets the price to that grade's
//                                      cached one) (customizeChanges in core.js)
//                                      -> the whole row, as GET; 400 {"detail"} names a bad field
//                                         (or the grade with no cached price)
//   POST   <pc>/inventory/<sku>/venues/<venue>
//                                      an empty card's Add -> the whole row, the venue in "venues"
//   POST   <pc>/jobs                  a card's End listing / Refresh status: {"action": "end" |
//                                      "refresh", "sku", "venue"}; the sync bar: {"action": "sync",
//                                      "direction": "from" | "to"}; customize's Sync to eBay:
//                                      {"action": "push", "sku", "venue": "ebay"} (actionJob in core.js)
//                                      -> {"job", "state": "queued", "ahead"}; 400 {"detail"} when
//                                         refused (Craigslist cannot be ended from here). GET
//                                         /jobs/<id> adds "action", "direction" and, once done,
//                                         "summary" ("3 listings updated, 10 unchanged, 0 failed")
//
// Every call carries the key in the X-Crosslister-Key header. Errors come back
// as JSON {"detail": "..."}; errorText() in core.js turns them into one line.

import { errorText, inventoryQuery, KEY_HEADER } from "./core.js?v=2.6.0";

/** An error with the HTTP status (0 = the PC could not be reached). */
export class PcError extends Error {
    constructor(status, detail) {
        super(errorText(status, detail));
        this.name = "PcError";
        this.status = status;
    }
}

/** One request with the key; a PC that cannot be reached is a PcError(0). */
async function request(url, key, { method = "GET", headers = {}, body } = {}) {
    try {
        return await fetch(url, {
            method,
            headers: { [KEY_HEADER]: key, ...headers },
            body,
            cache: "no-store",
            referrerPolicy: "no-referrer",
        });
    } catch {
        throw new PcError(0);
    }
}

/** The response's JSON, or null when it has none. */
async function parsed(res) {
    try {
        return await res.json();
    } catch {
        return null;
    }
}

/** The error a refused response is: its status and its {"detail"} when it has one. */
async function refused(res) {
    const answer = await parsed(res);
    return new PcError(res.status, answer && answer.detail);
}

async function call(url, key, { method = "GET", json, body, type } = {}) {
    const headers = {};
    let payload = body;
    if (json !== undefined) {
        headers["Content-Type"] = "application/json";
        payload = JSON.stringify(json);
    } else if (type) {
        headers["Content-Type"] = type;
    }
    const res = await request(url, key, { method, headers, body: payload });
    if (!res.ok) throw await refused(res);
    const answer = await parsed(res);
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

/**
 * Photo number n of an item read back (a reload, back): the JPEG itself, as a
 * Blob for its thumbnail. 404 for a photo the item does not hold.
 * @param {{pc:string, key:string}} settings
 * @param {string} item
 * @param {number} n
 * @returns {Promise<Blob>}
 */
export async function getPhoto({ pc, key }, item, n) {
    const res = await request(`${itemUrl(pc, item)}/photos/${n}`, key);
    if (!res.ok) throw await refused(res);
    return res.blob();
}

/** Photo number n off the PC too (the x). */
export function deletePhoto({ pc, key }, item, n) {
    return call(`${itemUrl(pc, item)}/photos/${n}`, key, { method: "DELETE" });
}

/** The cancel button, once the job is the PC's: dropped if still queued, stopped at its next step if running. */
export function cancelJob({ pc, key }, job) {
    return call(`${pc}/jobs/${encodeURIComponent(job)}`, key, { method: "DELETE" });
}

/** The whole item off the PC, folder and all: NEXT on one nothing was posted from. */
export function deleteItem({ pc, key }, item) {
    return call(itemUrl(pc, item), key, { method: "DELETE" });
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
 * @param {object} body from jobRequest() in core.js, or actionJob() for an action job
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

/**
 * Admin's inventory list: the rows matching the search and the two filters, in the sort chosen.
 * @param {{pc:string, key:string}} settings
 * @param {{q?:string, venue?:string, status?:string, sort?:string}} filters "" is All; sort a chip's key
 * @returns {Promise<{rows: Record<string, any>[]}>}
 */
export function getInventory({ pc, key }, filters) {
    return call(`${pc}/inventory?${inventoryQuery(filters)}`, key);
}

function rowUrl(pc, sku) {
    return `${pc}/inventory/${encodeURIComponent(sku)}`;
}

/**
 * One row whole, for its detail: every field each venue's card shows, and its photos by number.
 * @param {{pc:string, key:string}} settings
 * @param {string} sku
 */
export function getRow({ pc, key }, sku) {
    return call(rowUrl(pc, sku), key);
}

/**
 * A card's Save: the fields changed (patchBody in core.js), in one PATCH.
 * @param {{pc:string, key:string}} settings
 * @param {string} sku
 * @param {Record<string, any>} fields
 * @returns {Promise<Record<string, any>>} the whole row, as getRow gives it
 */
export function patchRow({ pc, key }, sku, fields) {
    return call(rowUrl(pc, sku), key, { method: "PATCH", json: fields });
}

/**
 * An empty card's Add: the row goes on that venue too (nothing is posted yet).
 * @param {{pc:string, key:string}} settings
 * @param {string} sku
 * @param {string} venue
 * @returns {Promise<Record<string, any>>} the whole row, as getRow gives it
 */
export function addVenue({ pc, key }, sku, venue) {
    return call(`${rowUrl(pc, sku)}/venues/${encodeURIComponent(venue)}`, key, { method: "POST" });
}

/**
 * Photo number n of a row: the image itself, as a Blob for a thumbnail and
 * the full-size view. 404 for a photo the row does not hold.
 * @param {{pc:string, key:string}} settings
 * @param {string} sku
 * @param {number} n
 * @returns {Promise<Blob>}
 */
export async function getRowPhoto({ pc, key }, sku, n) {
    const res = await request(`${rowUrl(pc, sku)}/photos/${n}`, key);
    if (!res.ok) throw await refused(res);
    return res.blob();
}
