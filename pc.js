// pc.js -- every call the page makes to the home PC (`crosslister serve`).
//
// The item, while the photos are taken (it is a folder in the PC's inbox):
//   POST   <pc>/items                 {"name"} -> {"item": id, "photos": [n...]}; {"name": ""} (goods
//                                      snapped with the box empty, 2.15.0) -> {"item", "name":
//                                      "Unnamed 2026-10-08 1701", "unnamed": true}, a new folder;
//                                      an older server answers that 400, and the name is needed again
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
//   GET    <pc>/jobs/<id>             -> {"state", "step", "sku", "links", "error", "ahead", "price",
//                                          "title"}: the row's price and title once drafted, "" before
//                                          (the title names an unnamed item on the phone)
//   DELETE <pc>/jobs/<id>             a paused job button's reset (any job, Admin's action
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
//   GET    <pc>/inventory/<sku>/conditions
//                                      the eBay card's Edit (Michal, 2026-10-08) -> {"current",
//                                         "allowed": [enum...] (what eBay allows the row's
//                                         category), "labels": {enum: words}, "error" (why, only
//                                         when allowed is empty)}; an older server's 404: the
//                                         chips offer every condition the page knows
//   PATCH  <pc>/inventory/<sku>       a card's Save: only the fields changed, any of "condition"
//                                      (eBay's enum; 400 names the accepted ones, an older server
//                                      refuses the field), "title",
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
// The account and Admin's last two foldouts (Michal, 2026-10-08):
//   GET    <pc>/me                    -> {"user", "admin": bool, "craigslist": bool, "venues": [...]};
//                                         404 from an older server: everything as before
//   POST   <pc>/feedback              {"text", "screen": "goods"|"book"|"admin"|"card", "version",
//                                      "job" (only when ticked and known)} -> 201 {"id"}
//   GET    <pc>/stats?since=7d|30d|all -> {"since", "jobs": {"total", "done", "failed", "cancelled",
//                                          "queued", "running"}, "posted": {venue: n}, "drafted",
//                                          "ended", "pushed", "model_cost", "per_user": [{"user",
//                                          "jobs", "posted", "model_cost"}], "per_day", "first",
//                                          "last"}; 403 for anyone but an admin
// Sign-in, on the product's own server (DEFAULT_SERVER in core.js), with no key or session:
//   POST   <pc>/auth/link             {"email", "remember": bool} -> 202 {"sent": true}; the link
//                                      opens this page as #login=<token>
//   POST   <pc>/auth/session          {"token"} -> {"session", "user", "remember"}
//   (a server without the sign-in lane answers both with a 404)
//   DELETE <pc>/auth/session          Sign out, with the session header -> 204: the server forgets it
// The Account block in Settings (Michal, 2026-10-08: three free postings per person, then
// prepaid postings bought through Stripe; Connect eBay from the phone for another seller):
//   GET /me adds "credits": {"unlimited": true} | {"free_left", "bought_left"}, "packs":
//                                      [{"id", "postings", "price"}] and "ebay": {"connected",
//                                      "user", "policies": "ready"|"pending"|"failed: <why>"}
//   POST   <pc>/jobs                  a posting with no postings left -> 402 {"detail"}
//   POST   <pc>/pay/checkout          {"pack": "<id>"} -> {"url": Stripe's checkout page}; 503 while
//                                      payments are not set up. Stripe sends the browser back to
//                                      this page as #paid=<postings> or #paid=cancelled
//   GET    <pc>/ebay/connect          -> {"url": eBay's consent page}; eBay sends the browser to the
//                                      server, which sends it here as #ebay=connected or #ebay=failed
//   (a server without them answers a 404: not available yet)
// Many sellers (Michal, 2026-10-08: "What else do we need for the multi tenant? Let's continue."):
//   GET    <pc>/auth/signup           no key, no session, on the landing -> {"open": bool}: anyone
//                                      with an email may make an account by asking for a link
//   GET    <pc>/me/seller             Settings opened -> {"address": {"line1", "city", "state",
//                                      "postal_code"}, "complete": bool, "ebay": {"connected",
//                                      "user", "policies": "ready"|"pending"|"failed: <why>"|"none"}}
//   PATCH  <pc>/me/seller             Save address: {"address": {"line1", "city", "state",
//                                      "postal_code"}} -> the same body; 400 names a bad field,
//                                      409 for the admin (his address is in the server's .env)
//   (404 from a server without them: no change to the words, no Seller address foldout)
// Archive, the Feedback inbox, sign-up's two steps (Michal, 2026-10-08):
//   PATCH  <pc>/inventory/<sku>       a list row swiped off (or Undo, or Unarchive): {"archived":
//                                      true | false} -> the whole row; rows carry "archived", and
//                                      GET /inventory?status=archived lists only those
//   GET    <pc>/feedback?new=1        the admin's inbox -> {"entries": [{"id", "user", "created",
//                                      "text", "screen", "version", "user_agent", "job": {"id",
//                                      "action", "venue", "state", "step", "error", "summary"} |
//                                      null, "reviewed"}]}, newest first; 403 for anyone else
//   PATCH  <pc>/feedback/<id>         Reviewed: {"reviewed": true} (an admin's only)
//   GET /me adds "pending" and "registered" (and "email" while pending): a pending account
//                                      (signed in by email, eBay not connected) is answered 403
//                                      {"detail": "Connect eBay to finish signing up."} on every
//                                      keyed route but /me, GET /ebay/connect and DELETE
//                                      /auth/session; GET /ebay/connect answers 503 with its detail
//                                      while the server cannot connect eBay yet
//   (404 from a server without them: not available)
//
// Every call carries the key in the X-Crosslister-Key header, or, on a phone signed in
// with no key, its session in X-Crosslister-Session (authHeaders in core.js). Errors come
// back as JSON {"detail": "..."}; errorText() in core.js turns them into one line.

import { authHeaders, errorText, inventoryQuery, statsQuery } from "./core.js?v=2.16.1";

/**
 * Where calls go and who makes them: the server's origin, and the key or the session.
 * @typedef {{pc:string, key?:string, session?:string}} Settings
 */

/**
 * An error with the HTTP status (0 = the PC could not be reached), and the server's own
 * detail as it said it ("" when none): a wrong sign-in code's 401 is said in its words,
 * where errorText would say a key was wrong.
 */
export class PcError extends Error {
    constructor(status, detail) {
        super(errorText(status, detail));
        this.name = "PcError";
        this.status = status;
        this.detail = typeof detail === "string" ? detail : "";
    }
}

/** One request with the key or the session; a PC that cannot be reached is a PcError(0). */
async function request(url, auth, { method = "GET", headers = {}, body } = {}) {
    try {
        return await fetch(url, {
            method,
            headers: { ...authHeaders(auth), ...headers },
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

async function call(url, auth, { method = "GET", json, body, type } = {}) {
    const headers = {};
    let payload = body;
    if (json !== undefined) {
        headers["Content-Type"] = "application/json";
        payload = JSON.stringify(json);
    } else if (type) {
        headers["Content-Type"] = type;
    }
    const res = await request(url, auth, { method, headers, body: payload });
    if (!res.ok) throw await refused(res);
    const answer = await parsed(res);
    if (!answer || typeof answer !== "object") throw new PcError(res.status, "the server gave no answer");
    return answer;
}

function itemUrl(pc, item) {
    return `${pc}/items/${encodeURIComponent(item)}`;
}

/**
 * Make (or find) today's item folder for this name; "" makes a new unnamed one.
 * @param {Settings} settings
 * @param {string} name the cleaned item name, or ""
 * @returns {Promise<{item:string, photos:number[], name?:string, unnamed?:boolean}>}
 */
export function createItem({ pc, ...auth }, name) {
    return call(`${pc}/items`, auth, { method: "POST", json: { name } });
}

/**
 * Photo number n of the item, as the shrunk JPEG.
 * @param {Settings} settings
 * @param {string} item
 * @param {number} n
 * @param {Blob} jpeg
 */
export function putPhoto({ pc, ...auth }, item, n, jpeg) {
    return call(`${itemUrl(pc, item)}/photos/${n}`, auth, {
        method: "PUT",
        body: jpeg,
        type: "image/jpeg",
    });
}

/**
 * Photo number n of an item read back (a reload, back): the JPEG itself, as a
 * Blob for its thumbnail. 404 for a photo the item does not hold.
 * @param {Settings} settings
 * @param {string} item
 * @param {number} n
 * @returns {Promise<Blob>}
 */
export async function getPhoto({ pc, ...auth }, item, n) {
    const res = await request(`${itemUrl(pc, item)}/photos/${n}`, auth);
    if (!res.ok) throw await refused(res);
    return res.blob();
}

/** Photo number n off the PC too (the x). */
export function deletePhoto({ pc, ...auth }, item, n) {
    return call(`${itemUrl(pc, item)}/photos/${n}`, auth, { method: "DELETE" });
}

/** reset, once the job is the PC's: dropped if still queued, stopped at its next step if running. */
export function cancelJob({ pc, ...auth }, job) {
    return call(`${pc}/jobs/${encodeURIComponent(job)}`, auth, { method: "DELETE" });
}

/** The whole item off the PC, folder and all: NEXT on one nothing was posted from. */
export function deleteItem({ pc, ...auth }, item) {
    return call(itemUrl(pc, item), auth, { method: "DELETE" });
}

/** The note, as note.txt beside the photos ("" removes it). */
export function putNote({ pc, ...auth }, item, note) {
    return call(`${itemUrl(pc, item)}/note`, auth, { method: "PUT", json: { note } });
}

/** The item as the PC has it: photo numbers, note, sku, jobs. */
export function getItem({ pc, ...auth }, item) {
    return call(itemUrl(pc, item), auth);
}

/**
 * A book from the catalogues, with eBay's prices for it. Costs no model call.
 * @param {Settings} settings
 * @param {string} isbn 13 digits (normalizeIsbn in book.js)
 * @returns {Promise<Record<string, unknown>>}
 */
export function getBook({ pc, ...auth }, isbn) {
    return call(`${pc}/books/${encodeURIComponent(isbn)}`, auth);
}

/**
 * A book with no ISBN, found by what he typed: the same answer as getBook(),
 * plus "found" (false: no catalogue knows it, and it is listed as typed). The
 * blanks are sent too, as "", so the PC sees one shape of question.
 * @param {Settings} settings
 * @param {{title:string, author:string, year:string}} query  from bookSearch() in core.js
 * @returns {Promise<Record<string, unknown>>}
 */
export function searchBook({ pc, ...auth }, { title, author, year }) {
    // encodeURIComponent, not URLSearchParams: a space is %20, never a "+" a server might keep
    const q = Object.entries({ title, author, year })
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("&");
    return call(`${pc}/books/search?${q}`, auth);
}

/**
 * Send one job.
 * @param {Settings} settings
 * @param {object} body from jobRequest() in core.js, or actionJob() for an action job
 * @returns {Promise<{job:string, state:string, ahead:number}>}
 */
export function postJob({ pc, ...auth }, body) {
    return call(`${pc}/jobs`, auth, { method: "POST", json: body });
}

/**
 * One job's status.
 * @param {Settings} settings
 * @param {string} jobId
 */
export function getJob({ pc, ...auth }, jobId) {
    return call(`${pc}/jobs/${encodeURIComponent(jobId)}`, auth);
}

/**
 * The Settings check: does the PC answer, and does it know this key?
 * Reads the newest job only; no model call, nothing published.
 * @param {Settings} settings
 */
export function checkPc({ pc, ...auth }) {
    return call(`${pc}/jobs?limit=1`, auth);
}

/**
 * Admin's inventory list: the rows matching the search and the two filters, in the sort chosen.
 * @param {Settings} settings
 * @param {{q?:string, venue?:string, status?:string, sort?:string}} filters "" is All; sort a chip's key
 * @returns {Promise<{rows: Record<string, any>[]}>}
 */
export function getInventory({ pc, ...auth }, filters) {
    return call(`${pc}/inventory?${inventoryQuery(filters)}`, auth);
}

function rowUrl(pc, sku) {
    return `${pc}/inventory/${encodeURIComponent(sku)}`;
}

/**
 * One row whole, for its detail: every field each venue's card shows, and its photos by number.
 * @param {Settings} settings
 * @param {string} sku
 */
export function getRow({ pc, ...auth }, sku) {
    return call(rowUrl(pc, sku), auth);
}

/**
 * The conditions eBay allows the row's category, for the eBay card's Edit (conditionChoices
 * in core.js). 404 from a server that cannot say.
 * @param {Settings} settings
 * @param {string} sku
 * @returns {Promise<{current?:string, allowed?:string[], labels?:Record<string, string>, error?:string}>}
 */
export function getConditions({ pc, ...auth }, sku) {
    return call(`${rowUrl(pc, sku)}/conditions`, auth);
}

/**
 * A card's Save: the fields changed (patchBody in core.js), in one PATCH.
 * @param {Settings} settings
 * @param {string} sku
 * @param {Record<string, any>} fields
 * @returns {Promise<Record<string, any>>} the whole row, as getRow gives it
 */
export function patchRow({ pc, ...auth }, sku, fields) {
    return call(rowUrl(pc, sku), auth, { method: "PATCH", json: fields });
}

/**
 * A list row archived (swiped off the list) or back (Undo, Unarchive): it ends no listing.
 * @param {Settings} settings
 * @param {string} sku
 * @param {boolean} archived
 * @returns {Promise<Record<string, any>>} the whole row, as getRow gives it
 */
export function archiveRow(settings, sku, archived) {
    return patchRow(settings, sku, { archived });
}

/**
 * An empty card's Add: the row goes on that venue too (nothing is posted yet).
 * @param {Settings} settings
 * @param {string} sku
 * @param {string} venue
 * @returns {Promise<Record<string, any>>} the whole row, as getRow gives it
 */
export function addVenue({ pc, ...auth }, sku, venue) {
    return call(`${rowUrl(pc, sku)}/venues/${encodeURIComponent(venue)}`, auth, { method: "POST" });
}

/**
 * Photo number n of a row: the image itself, as a Blob for a thumbnail and
 * the full-size view. 404 for a photo the row does not hold.
 * @param {Settings} settings
 * @param {string} sku
 * @param {number} n
 * @returns {Promise<Blob>}
 */
export async function getRowPhoto({ pc, ...auth }, sku, n) {
    const res = await request(`${rowUrl(pc, sku)}/photos/${n}`, auth);
    if (!res.ok) throw await refused(res);
    return res.blob();
}

/**
 * Who this key or session is, and what the account may do (craigslist, admin).
 * @param {Settings} settings
 * @returns {Promise<Record<string, unknown>>}
 */
export function getMe({ pc, ...auth }) {
    return call(`${pc}/me`, auth);
}

/**
 * Admin's Feedback, sent.
 * @param {Settings} settings
 * @param {{text:string, screen:string, version:string, job?:string}} body from feedbackBody() in core.js
 * @returns {Promise<{id:string}>}
 */
export function postFeedback({ pc, ...auth }, body) {
    return call(`${pc}/feedback`, auth, { method: "POST", json: body });
}

/**
 * The admin's Feedback inbox: the entries not yet reviewed, newest first (403 for anyone else).
 * @param {Settings} settings
 * @returns {Promise<{entries?:unknown}>}
 */
export function getFeedbackInbox({ pc, ...auth }) {
    return call(`${pc}/feedback?new=1`, auth);
}

/**
 * An inbox entry's Reviewed: it leaves the inbox. Whatever the server answers with, if
 * anything, is not needed.
 * @param {Settings} settings
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function reviewFeedback({ pc, ...auth }, id) {
    const res = await request(`${pc}/feedback/${encodeURIComponent(id)}`, auth, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewed: true }),
    });
    if (!res.ok) throw await refused(res);
}

/**
 * Admin's Stats (an admin's only: 403 for anyone else).
 * @param {Settings} settings
 * @param {string} since "7d", "30d" or "all"
 * @returns {Promise<Record<string, unknown>>}
 */
export function getStats({ pc, ...auth }, since) {
    return call(`${pc}/stats?${statsQuery(since)}`, auth);
}

/**
 * Sign in: the server emails a link to this page (`#login=<token>`). No key, no session.
 * @param {string} pc the product's server (DEFAULT_SERVER)
 * @param {{email:string, remember:boolean}} body
 * @returns {Promise<{sent:boolean}>}
 */
export function askLink(pc, body) {
    return call(`${pc}/auth/link`, {}, { method: "POST", json: body });
}

/**
 * The link's token for a session, kept on the phone in place of a key.
 * @param {string} pc the product's server (DEFAULT_SERVER)
 * @param {string} token
 * @returns {Promise<{session:string, user:string, remember:boolean}>}
 */
export function startSession(pc, token) {
    return call(`${pc}/auth/session`, {}, { method: "POST", json: { token } });
}

/**
 * The mail's six-digit code for a session, as the link's token is (Michal, 2026-10-08: the
 * installed app on an iPhone, which a mailed link never opens). No key, no session.
 * @param {string} pc the product's server (DEFAULT_SERVER)
 * @param {{email:string, code:string}} body
 * @returns {Promise<{session:string, user:string, remember:boolean}>}
 */
export function codeSession(pc, body) {
    return call(`${pc}/auth/session`, {}, { method: "POST", json: body });
}

/**
 * Sign out: the server forgets the session (204, no body).
 * @param {Settings} settings the session's
 * @returns {Promise<void>}
 */
export async function endSession({ pc, ...auth }) {
    const res = await request(`${pc}/auth/session`, auth, { method: "DELETE" });
    if (!res.ok) throw await refused(res);
}

/**
 * Buy postings: Stripe's checkout page for a pack, where the page sends the browser.
 * @param {Settings} settings
 * @param {string} pack the pack's id, as /me's "packs" give it
 * @returns {Promise<{url:string}>}
 */
export function checkout({ pc, ...auth }, pack) {
    return call(`${pc}/pay/checkout`, auth, { method: "POST", json: { pack } });
}

/**
 * Connect eBay: eBay's consent page for this account, where the page sends the browser.
 * @param {Settings} settings
 * @returns {Promise<{url:string}>}
 */
export function ebayConnect({ pc, ...auth }) {
    return call(`${pc}/ebay/connect`, auth);
}

/**
 * Whether the product's server lets anyone with an email make an account (the landing's
 * words). No key, no session.
 * @param {string} pc the product's server (DEFAULT_SERVER)
 * @returns {Promise<{open?:boolean}>}
 */
export function getSignup(pc) {
    return call(`${pc}/auth/signup`, {});
}

/**
 * The seller's address and her eBay, for Settings' Seller address.
 * @param {Settings} settings
 * @returns {Promise<Record<string, unknown>>}
 */
export function getSeller({ pc, ...auth }) {
    return call(`${pc}/me/seller`, auth);
}

/**
 * Save address: the four fields (addressBody in core.js), answered as getSeller.
 * @param {Settings} settings
 * @param {{address:{line1:string, city:string, state:string, postal_code:string}}} body
 * @returns {Promise<Record<string, unknown>>}
 */
export function patchSeller({ pc, ...auth }, body) {
    return call(`${pc}/me/seller`, auth, { method: "PATCH", json: body });
}
