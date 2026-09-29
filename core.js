// core.js -- pure logic for crosslister snap.
// No DOM, no network, no browser globals. Everything here is unit tested
// by `node --test`. The upload queue's own rules (what goes next, how long
// to wait) are in queue.js; the state they act on is reduced here.

import { noteDirty, unsent } from "./queue.js?v=1.10.0";
import {
    bookListings,
    bookPriceValue,
    bookRecord,
    bookSearch,
    CONDITIONS,
    DEFAULT_CONDITION,
    DEFAULT_FORMAT,
    FORMATS,
    formatOf,
} from "./book.js?v=1.10.0";

// --- the item name and photo file names ------------------------------------

/** Characters Windows refuses in a file name. */
const FORBIDDEN = /["*:<>?/\\|]/g;

/** Maximum length of the item name. */
export const MAX_ITEM_NAME = 60;

/**
 * Clean a typed item name into something a file name can carry.
 * - drops " * : < > ? / \ |
 * - drops control characters
 * - collapses runs of whitespace to a single space
 * - trims leading/trailing spaces and dots
 * - caps at MAX_ITEM_NAME characters (then trims again)
 *
 * @param {string} raw
 * @returns {string} cleaned name, possibly ""
 */
export function cleanItemName(raw) {
    if (typeof raw !== "string") return "";
    let s = raw.replace(FORBIDDEN, "");
    // control characters, but not tab / newline / carriage return: those are
    // whitespace and get collapsed into a single space on the next line.
    // eslint-disable-next-line no-control-regex
    s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
    s = s.replace(/\s+/g, " ");
    s = trimEdges(s);
    if (s.length > MAX_ITEM_NAME) s = trimEdges(s.slice(0, MAX_ITEM_NAME));
    return s;
}

function trimEdges(s) {
    return s.replace(/^[\s.]+/, "").replace(/[\s.]+$/, "");
}

/**
 * True when the cleaned name differs from what was typed, i.e. worth showing.
 * @param {string} raw
 * @returns {boolean}
 */
export function nameWasChanged(raw) {
    return typeof raw === "string" && raw.length > 0 && cleanItemName(raw) !== raw;
}

/**
 * The name of photo number `n` of an item. Every photo is sent as a JPEG (see
 * shrink.js), so the extension is always .jpg.
 * @param {string} itemName already cleaned
 * @param {number} n 1-based
 * @returns {string}
 */
export function buildFileName(itemName, n) {
    return `${itemName}-${n}.jpg`;
}

/**
 * Highest photo number used so far for an item, so numbering continues
 * after DONE and a reload. Counters come from sessionStorage as a plain object.
 * @param {Record<string, number>} counters
 * @param {string} itemName
 * @returns {number}
 */
export function currentCount(counters, itemName) {
    const v = counters ? counters[itemName] : 0;
    return Number.isInteger(v) && v > 0 ? v : 0;
}

/**
 * Take the next photo number for an item and return the updated counters.
 * @param {Record<string, number>} counters
 * @param {string} itemName
 * @returns {{n:number, counters:Record<string,number>}}
 */
export function nextNumber(counters, itemName) {
    const n = currentCount(counters, itemName) + 1;
    return { n, counters: { ...(counters || {}), [itemName]: n } };
}

// --- settings: the PC address and the key ----------------------------------

/**
 * Hosts the page may call. They must match connect-src in index.html's
 * Content-Security-Policy, or the browser blocks the call without a word.
 * A Tailscale Funnel address is https://<pc>.<tailnet>.ts.net; the loopback
 * hosts are for trying the page on the PC itself.
 */
const LOOPBACK = new Set(["127.0.0.1", "localhost"]);

/**
 * Check what was typed into Settings.
 *
 * @param {string} pcRaw  e.g. "https://pc.tail1234.ts.net"
 * @param {string} keyRaw one of the keys in CROSSLISTER_KEYS on the PC
 * @returns {{ok:true, pc:string, key:string} | {ok:false, error:string}}
 *          pc is the bare origin: scheme, host and port, no trailing slash
 */
export function checkSettings(pcRaw, keyRaw) {
    const pcText = typeof pcRaw === "string" ? pcRaw.trim() : "";
    const key = typeof keyRaw === "string" ? keyRaw.trim() : "";
    if (!pcText) return { ok: false, error: "Enter the PC address." };
    let url;
    try {
        url = new URL(pcText);
    } catch {
        return { ok: false, error: "The PC address is not a web address (https://...)." };
    }
    const loopback = LOOPBACK.has(url.hostname);
    if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
        return { ok: false, error: "The PC address must start with https://" };
    }
    if (!loopback && !url.hostname.endsWith(".ts.net")) {
        return {
            ok: false,
            error: "The page may only call a Tailscale address: https://<pc>.<tailnet>.ts.net",
        };
    }
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
        return { ok: false, error: "Give the address only, with nothing after the name." };
    }
    if (!key) return { ok: false, error: "Enter the key." };
    // a header value: visible ASCII only, so no spaces, accents or line breaks
    if (!/^[\x21-\x7e]+$/.test(key)) {
        return { ok: false, error: "The key has a space or an unusual character in it." };
    }
    return { ok: true, pc: url.origin, key };
}

// --- shrinking a photo before it is sent -----------------------------------

/** The long edge a photo is shrunk to before it is sent. */
export const MAX_EDGE = 2000;

/** JPEG quality of the shrunk photo. */
export const JPEG_QUALITY = 0.85;

/**
 * The size to draw a width x height photo at so its long edge is at most
 * `max`. Never enlarges; keeps the aspect ratio; never returns a 0 side.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} [max]
 * @returns {{width:number, height:number}}
 */
export function fitWithin(width, height, max = MAX_EDGE) {
    for (const [name, v] of [
        ["width", width],
        ["height", height],
        ["max", max],
    ]) {
        if (!Number.isInteger(v) || v <= 0) {
            throw new RangeError(`${name} must be a positive integer`);
        }
    }
    const long = Math.max(width, height);
    if (long <= max) return { width, height };
    const scale = max / long;
    return width >= height
        ? { width: max, height: Math.max(1, Math.round(height * scale)) }
        : { width: Math.max(1, Math.round(width * scale)), height: max };
}

// --- the service contract ----------------------------------------------------

/** The venues the two buttons send. */
export const VENUES = ["ebay", "craigslist"];

/** The most photos one item may carry (the service refuses more). */
export const MAX_PHOTOS = 24;

/** How often a running job is asked for its status. */
export const POLL_MS = 3000;

/** The header the key travels in. */
export const KEY_HEADER = "X-Crosslister-Key";

/**
 * The JSON body one press of a venue button sends to POST /jobs.
 *
 * A new item: the item (its folder on the PC, where every photo already is),
 * the venue, and the numbers of the photos marked AI. The second button for
 * the same item: the sku and the venue only -- the PC reuses the row it saved,
 * so there is no second model call.
 *
 * @param {object} o
 * @param {string} o.venue
 * @param {string} [o.sku]    known once the first job has saved the row
 * @param {string} [o.item]   the item's id on the PC
 * A book: the item (its photos) and the book itself -- the ISBN (or, with no
 * ISBN, the title, author, year and format he typed), the condition chip, the
 * price box and the number of the photo marked main. No AI marks: the
 * catalogue says what the book is, so there is no model call, and a book goes
 * to eBay only.
 *
 * @param {{n:number, ai:boolean}[]} [o.photos]
 * @param {BookJob} [o.book]  from bookForm()
 * @param {Customize} [o.customize]  from customizeOf(): the quantity and pickup only ride
 *        along, top-level, in every one of the three bodies -- the sku's too, since the PC
 *        updates the saved row before it posts it again (customizeBody says when)
 * @returns {({sku:string, venue:string} | {item:string, venue:string, ai:number[]}
 *          | {item:string, venue:string, book:BookJob}) & {quantity?:number, pickup_only?:true}}
 */
export function jobRequest({ venue, sku = "", item = "", photos = [], book = undefined, customize = undefined }) {
    if (!VENUES.includes(venue)) throw new RangeError(`unknown venue ${venue}`);
    const extra = customizeBody(customize);
    if (book) return { item, venue, book: { ...book }, ...extra };
    if (sku) return { sku, venue, ...extra };
    return { item, venue, ai: photos.filter((p) => p.ai).map((p) => p.n), ...extra };
}

// --- customize: the quantity and pickup only -----------------------------------
// Michal, 2026-09-28: "Before the eBay and Craigslist buttons I would like to
// have a little arrow with the word customize. If clicked I want to be able to
// edit quantity. Also I want to be able to check pickup only. And it would be a
// pickup only item on eBay then." Nearly everything he lists is one of a kind
// and shipped, so both sit folded away, and left alone they send nothing new:
// the body is exactly what it was before customize existed.

/**
 * What customize holds, per item (goods: state.customize; a book: state.book.customize).
 * @typedef {Object} Customize
 * @property {string} quantity   the box as typed ("1" until he changes it); quantityValue() reads it
 * @property {boolean} pickupOnly  no shipping on eBay: the buyer collects it
 */

/** @returns {Customize} */
export function initialCustomize() {
    return { quantity: "1", pickupOnly: false };
}

/**
 * The quantity box as a number: a whole number, 1 or more; 0 when it is not
 * one ("", "0", "1.5", "two"), which keeps the venue buttons shut. Kept as
 * typed in the state (as the book's price is) so a half-typed box is not
 * rewritten under his thumb.
 * @param {unknown} text
 * @returns {number}
 */
export function quantityValue(text) {
    const bare = typeof text === "number" ? String(text) : typeof text === "string" ? text.trim() : "";
    if (!/^\d+$/.test(bare)) return 0;
    const n = Number(bare);
    return Number.isSafeInteger(n) && n >= 1 ? n : 0;
}

/** The line under the buttons while the quantity is not a quantity. */
export const QUANTITY_HINT = "Quantity (under customize) must be a whole number, 1 or more";

/** The quiet word under ebay, before the press, once pickup only is ticked: he sees it took. */
export const PICKUP_NOTE = "pickup only";

/**
 * This item's customize: a book keeps its own in the book slice, goods at the top.
 * @param {SnapState} state
 * @returns {Customize}
 */
export function customizeOf(state) {
    return state.mode === "book" ? state.book.customize : state.customize;
}

/**
 * What customize adds to a job's body: `quantity` only when it is not 1 and
 * `pickup_only` only when ticked, so an item left alone sends the same body
 * as ever (and the PC's defaults, 1 and shipped, apply).
 * @param {Customize} [customize]
 * @returns {{quantity?:number, pickup_only?:true}}
 */
export function customizeBody(customize) {
    if (!customize) return {};
    const out = {};
    const quantity = quantityValue(customize.quantity);
    if (quantity > 1) out.quantity = quantity;
    if (customize.pickupOnly === true) out.pickup_only = true;
    return out;
}

/**
 * The line under a venue button before it is pressed: "pickup only" under
 * ebay once ticked (craigslist is pickup anyway), else nothing.
 * @param {SnapState} state
 * @param {string} venue
 * @returns {string}
 */
export function venueIdleNote(state, venue) {
    return venue === "ebay" && customizeOf(state).pickupOnly ? PICKUP_NOTE : "";
}

/** Customize read back from storage after a reload; anything odd is the default. */
function recoveredCustomize(saved) {
    const c = initialCustomize();
    if (!saved || typeof saved !== "object") return c;
    if (typeof saved.quantity === "string") c.quantity = saved.quantity;
    else if (typeof saved.quantity === "number") c.quantity = String(saved.quantity);
    c.pickupOnly = saved.pickupOnly === true;
    return c;
}

/** Customize as savedItem keeps it: nothing at all while it is the default. */
function savedCustomize(c) {
    return c.quantity === "1" && !c.pickupOnly ? {} : { customize: { quantity: c.quantity, pickupOnly: c.pickupOnly } };
}

/** Customize changed, in the right place for the item's kind; fixed while a job is on its way. */
function withCustomize(state, fn) {
    if (anyActive(state)) return state;
    if (state.mode === "book") {
        return { ...state, book: { ...state.book, customize: fn(state.book.customize) } };
    }
    return { ...state, customize: fn(state.customize) };
}

/**
 * The one line an error from the PC is shown as.
 * The service answers errors as JSON {"detail": "..."}: 400 with a message,
 * 401 for a missing or wrong key, 404 for an item or job it does not know.
 *
 * @param {number} status HTTP status, 0 when the PC could not be reached
 * @param {unknown} [detail] the `detail` field of the answer, if any
 * @returns {string}
 */
export function errorText(status, detail) {
    if (status === 0) return "cannot reach the PC";
    if (status === 401) return "wrong key - check Settings";
    if (typeof detail === "string" && detail) return detail;
    if (status === 404) return "the PC does not know this item or job";
    return `the PC answered ${status}`;
}

/** How often the page asks the PC whether it is there, while the page is on screen. */
export const HEALTH_MS = 30000;

/**
 * The server word in the header and in Settings, from the last check the page
 * made by itself (GET /jobs?limit=1: the PC answers and knows the key).
 * @param {boolean} settingsOk a PC address and key are saved
 * @param {number|null} status null: not checked yet; 200: fine; else the PcError status (0 = no answer)
 * @returns {{text:string, kind:"ok"|"bad"|""}}
 */
export function serverLine(settingsOk, status) {
    if (!settingsOk) return { text: "server not set", kind: "" };
    if (status === null) return { text: "checking server...", kind: "" };
    if (status === 200) return { text: "server ok", kind: "ok" };
    if (status === 401) return { text: "wrong key", kind: "bad" };
    return { text: "server off", kind: "bad" };
}

/**
 * Only an http(s) address becomes a tappable link.
 * @param {unknown} url
 * @returns {string} the url, or "" when it is not one
 */
export function safeLink(url) {
    if (typeof url !== "string") return "";
    try {
        const u = new URL(url);
        return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
    } catch {
        return "";
    }
}

// --- page state --------------------------------------------------------------

/**
 * @typedef {Object} Photo
 * @property {string} id
 * @property {string} name  e.g. "Boots-3.jpg"
 * @property {number} n     1-based number within the item; the file on the PC is nn.jpg
 * @property {boolean} ai   sent to the model when true; every photo goes to the listing
 * @property {"waiting"|"sending"|"sent"|"failed"} status  on its way to the PC, or there
 * @property {string} error why the PC refused it
 * @property {boolean} tried a PUT was started, so the PC may hold it (the x then deletes it there)
 * @property {boolean} local the page holds the picture; false for one read back from the PC
 */

/**
 * One venue button's job.
 * @typedef {Object} VenueJob
 * @property {"idle"|"sending"|"queued"|"running"|"done"|"failed"} phase
 * @property {string} jobId
 * @property {string} step     what the PC says it is doing, or what the page is doing
 * @property {number} ahead    jobs in front of this one
 * @property {string} link     the posting, once done
 * @property {string} error    why it failed
 * @property {string} trouble  a status poll that failed; the job itself may be fine
 */

/**
 * @typedef {Object} SnapState
 * @property {string} itemName
 * @property {string} itemId      the item's folder on the PC, once made; kept until DONE
 * @property {Photo[]} photos
 * @property {number[]} deletes   photo numbers still to delete on the PC
 * @property {boolean} online
 * @property {{text:string, sentText:(string|null), due:boolean}} note
 *           sentText: what the PC has (null: nothing sent yet); due: send it now
 * @property {null|{kind:string}} busy  the one request in flight (queue.js)
 * @property {boolean} stalled    the PC could not be reached; waiting to try again
 * @property {number} failures    failed tries in a row, for the wait before the next
 * @property {string} problem     the last failure, shown while stalled
 * @property {string} sku   the saved row, once the first job reports it
 * @property {Record<string, VenueJob>} jobs
 * @property {"goods"|"book"} mode  which kind of item this is; the page keeps one of each
 * @property {BookSlice} book       the book's own fields (untouched in goods mode)
 * @property {Customize} customize  goods' quantity and pickup only (a book's is in its slice)
 */

/**
 * The book mode's own fields. The item name of a book is "Book <isbn13>", so
 * the PC's folder is "Book 9780306406157 <date>" and the same book scanned
 * twice the same day is the same folder, as with goods. A book with no ISBN is
 * named by its title instead, "Book <cleaned title>", so the folder on the PC
 * still says which book it is.
 * @typedef {Object} BookSlice
 * @property {string} isbn       13 digits once a valid ISBN was scanned or typed, else ""
 * @property {boolean} isbnMiss  the PC answered 404 for that ISBN: no catalogue knows it. No ISBN
 *                               then keeps it (it still names the folder and goes on the listing)
 *                               and the typed fields describe the book; a new ISBN clears it
 * @property {BookLookup} lookup the PC's answer to GET /books/<isbn> (or /books/search)
 * @property {string} condition  one of CONDITIONS' values
 * @property {string} price      the price box as typed (bookPriceValue() reads it)
 * @property {string} autoPrice  the price the page itself put in the box (a suggestion), ""
 *                               once he typed one: a later answer may replace only this
 * @property {number} main       the number n of the photo that leads the listing; 0 while
 *                               there is no photo. Always one of the photos once there is
 *                               one: the first by default (settleMain keeps it so)
 * @property {boolean} manual    No ISBN is open: the book is looked up by the fields below, and
 *                               the ISBN box is ignored (a valid ISBN closes it again); it is
 *                               named by them too, unless it has an ISBN no catalogue knows
 * @property {string} title      the fields under No ISBN, as typed
 * @property {string} author
 * @property {string} year
 * @property {string} format     one of FORMATS' values, paperback by default
 * @property {boolean} formatChosen  he tapped a format chip: a catalogue match no longer sets it
 * @property {Customize} customize   the book's quantity and pickup only
 */

/**
 * @typedef {Object} BookLookup
 * @property {"idle"|"looking"|"found"|"missing"|"failed"} phase
 *           missing: not in the catalogues (404, by ISBN only); failed: the PC could not look
 *           (its words in error)
 * @property {""|"isbn"|"title"} by  what the book was looked up by
 * @property {boolean} matched   a catalogue knows it (always, when found by ISBN); a book found
 *                               by title that none knows is listed as typed
 * @property {null|ReturnType<typeof bookRecord>} record  the book, once found
 * @property {string} price      the PC's suggested price, "" when it has none
 * @property {null|{count:number, low:string, high:string}} listings  eBay's listings as the PC saw them
 * @property {string} route      "list", "lot or buyback" or "unknown"
 * @property {string} error
 */

/**
 * What a book's job carries (POST /jobs "book"). With an ISBN the four typed
 * fields are ""; without one the ISBN is "" and the title is what he typed;
 * with an ISBN no catalogue knows, both: the ISBN, and the title he typed.
 * @typedef {Object} BookJob
 * @property {string} isbn
 * @property {string} title
 * @property {string} author
 * @property {string} year
 * @property {""|"paperback"|"hardcover"} format
 * @property {string} condition
 * @property {string} price
 * @property {number} main
 */

/** The kinds of item the switch at the top chooses between. */
export const MODES = ["goods", "book"];

/** @returns {BookLookup} */
function idleLookup() {
    return { phase: "idle", by: "", matched: false, record: null, price: "", listings: null, route: "", error: "" };
}

/** The fields under No ISBN, empty. */
function blankManual() {
    return { manual: false, title: "", author: "", year: "", format: DEFAULT_FORMAT, formatChosen: false };
}

/** @returns {BookSlice} */
function initialBook() {
    return {
        isbn: "",
        isbnMiss: false,
        lookup: idleLookup(),
        condition: DEFAULT_CONDITION,
        price: "",
        autoPrice: "",
        main: 0,
        ...blankManual(),
        customize: initialCustomize(),
    };
}

/** @returns {VenueJob} */
export function idleJob() {
    return { phase: "idle", jobId: "", step: "", ahead: 0, link: "", error: "", trouble: "" };
}

/**
 * @param {string} [itemName]
 * @param {"goods"|"book"} [mode]
 * @returns {SnapState}
 */
export function initialState(itemName = "", mode = "goods") {
    return {
        mode: MODES.includes(mode) ? mode : "goods",
        book: initialBook(),
        itemName,
        itemId: "",
        photos: [],
        deletes: [],
        online: true,
        note: { text: "", sentText: null, due: false },
        busy: null,
        stalled: false,
        failures: 0,
        problem: "",
        sku: "",
        jobs: Object.fromEntries(VENUES.map((v) => [v, idleJob()])),
        customize: initialCustomize(),
    };
}

const ACTIVE = new Set(["sending", "queued", "running"]);

/** @param {VenueJob} job */
export function isActive(job) {
    return ACTIVE.has(job.phase);
}

/** True while any button's job is on its way or on the PC. */
export function anyActive(state) {
    return VENUES.some((v) => isActive(state.jobs[v]));
}

/**
 * Once a job is on its way or has saved the row, the strip is what was
 * posted: no more snapping, deleting or marking for this item. A job that
 * failed before the row was saved unlocks it again.
 */
export function photosLocked(state) {
    return !!state.sku || anyActive(state);
}

/**
 * The one reducer. Pure: returns a new state, never mutates.
 * Actions:
 *   {type:"setItem", itemName}
 *   {type:"add", id, name, n}             a photo taken; it waits for the upload queue
 *   {type:"remove", id}                   the x; a photo the PC may hold is deleted there too
 *   {type:"toggleAi", id}
 *   {type:"retry", id}                    tap on a failed photo
 *   {type:"online", online}
 *   {type:"noteText", text}
 *   {type:"noteDue"}                      he stopped typing: send the note
 *   {type:"reset"}                        DONE: the next item
 *   {type:"taskStart", task}              the upload queue (queue.js) sends a request
 *   {type:"taskDone", task, answer}
 *   {type:"taskFailed", task, status, error}  status 0: the PC could not be reached
 *   {type:"resume"}                       try the stalled queue again
 *   {type:"recovered", itemName, itemId, ai, answer}  a reload, read back from GET /items/<id>
 *   {type:"jobSending", venue, step}
 *   {type:"jobAccepted", venue, job, ahead}
 *   {type:"jobRefused", venue, error}     the POST did not become a job
 *   {type:"jobStatus", venue, status}     an answer to GET /jobs/<id>
 *   {type:"pollTrouble", venue, error}    that GET failed; keep asking
 *   {type:"setQuantity", text}            the quantity box under customize, as typed
 *   {type:"setPickupOnly", on}            the pickup only box under customize
 *                                         (both: this item's kind's own; fixed while a job is on its way)
 * The book mode:
 *   {type:"setMode", mode}                "goods" or "book": what kind of item this state holds
 *   {type:"bookIsbn", isbn}               a valid ISBN-13 scanned or typed, or "" (fixed once the item is on the PC)
 *   {type:"bookManual", open}             No ISBN: open the title fields, or close and clear them
 *                                         (after an ISBN miss the ISBN is kept either way)
 *   {type:"bookField", field, text}       "title", "author" or "year" under No ISBN, as typed
 *   {type:"bookFormat", format}           the paperback | hardcover chip
 *   {type:"bookName"}                     he stopped typing: the title names the book's folder
 *   {type:"bookLookupStart", key}         GET /books/<isbn> (or /books/search) goes; key is
 *                                         lookupKey(book) when it went (an ISBN also as `isbn`)
 *   {type:"bookLookupDone", key, answer}  the PC answered
 *   {type:"bookLookupFailed", key, status, error}  404 by ISBN: not in the catalogues (and
 *                                         isbnMiss, so No ISBN keeps the ISBN); else the PC's words
 *   {type:"bookCondition", condition}     a condition chip
 *   {type:"bookPrice", text}              the price box, as typed
 *   {type:"bookMain", id}                 the "main" mark on a photo: it leads the listing
 *
 * A book always has exactly one main photo once it has any: the first by
 * default, so doing nothing keeps the order the photos were taken in. Every
 * action that adds, drops or renumbers photos ends in settleMain().
 *
 * @param {SnapState} state
 * @param {{type:string}&Record<string,any>} action
 * @returns {SnapState}
 */
export function reduce(state, action) {
    switch (action.type) {
        case "setItem":
            return { ...state, itemName: action.itemName };
        case "add":
            return settleMain({
                ...state,
                photos: [
                    ...state.photos,
                    {
                        id: action.id,
                        name: action.name,
                        n: action.n,
                        ai: false,
                        status: "waiting",
                        error: "",
                        tried: false,
                        local: true,
                    },
                ],
            });
        case "remove": {
            const gone = state.photos.find((p) => p.id === action.id);
            if (!gone) return state;
            const photos = state.photos.filter((p) => p !== gone);
            const deletes =
                gone.tried && !state.deletes.includes(gone.n)
                    ? [...state.deletes, gone.n]
                    : state.deletes;
            // the main photo gone: the mark goes back to the first one left
            return settleMain({ ...state, photos, deletes });
        }
        case "toggleAi":
            return patchPhoto(state, action.id, (p) => ({ ...p, ai: !p.ai }));
        case "retry":
            return patchPhoto(state, action.id, (p) =>
                p.status === "failed" ? { ...p, status: "waiting", error: "" } : p
            );
        case "online":
            // back online: the stalled queue goes again at once
            return action.online
                ? { ...state, online: true, stalled: false }
                : { ...state, online: false };
        case "noteText":
            return {
                ...state,
                note: {
                    ...state.note,
                    text: typeof action.text === "string" ? action.text : "",
                    due: false,
                },
            };
        case "noteDue":
            return { ...state, note: { ...state.note, due: true } };
        case "reset":
            // the next item is of the same kind: DONE on a book starts the next book
            return { ...initialState("", state.mode), online: state.online };

        case "taskStart": {
            const next = { ...state, busy: action.task };
            if (action.task.kind !== "photo") return next;
            return patchPhoto(next, action.task.id, (p) => ({
                ...p,
                status: "sending",
                tried: true,
                error: "",
            }));
        }
        case "taskDone":
            // the item made on the PC may renumber the photos (adoptItem)
            return settleMain(
                taskDone(
                    { ...state, busy: null, stalled: false, failures: 0, problem: "" },
                    action.task,
                    action.answer || {}
                )
            );
        case "taskFailed":
            return taskFailed({ ...state, busy: null }, action.task, action.status, action.error);
        case "resume":
            return { ...state, stalled: false };
        case "recovered":
            return settleMain(recovered(state, action));

        case "jobSending":
            return withJob(state, action.venue, () => ({
                ...idleJob(),
                phase: "sending",
                step: action.step || "sending",
            }));
        case "jobAccepted":
            return withJob(state, action.venue, () => ({
                ...idleJob(),
                phase: "queued",
                jobId: String(action.job),
                ahead: toCount(action.ahead),
            }));
        case "jobRefused":
            return withJob(state, action.venue, () => ({
                ...idleJob(),
                phase: "failed",
                error: action.error || "not sent",
            }));
        case "jobStatus": {
            const s = action.status || {};
            const phase = ["queued", "running", "done", "failed"].includes(s.state)
                ? s.state
                : "running";
            const next = withJob(state, action.venue, (job) => ({
                ...job,
                phase,
                step: typeof s.step === "string" ? s.step : "",
                ahead: toCount(s.ahead),
                link: safeLink(s.links ? s.links[action.venue] : ""),
                error: phase === "failed" ? String(s.error || "failed") : "",
                trouble: "",
            }));
            const sku = typeof s.sku === "string" ? s.sku : "";
            return sku && !state.sku ? { ...next, sku } : next;
        }
        case "pollTrouble":
            return withJob(state, action.venue, (job) => ({
                ...job,
                trouble: action.error || "cannot reach the PC",
            }));
        case "setQuantity": {
            const quantity = typeof action.text === "string" ? action.text : String(action.text ?? "");
            return withCustomize(state, (c) => ({ ...c, quantity }));
        }
        case "setPickupOnly":
            return withCustomize(state, (c) => ({ ...c, pickupOnly: action.on === true }));

        case "setMode":
            return MODES.includes(action.mode) ? { ...state, mode: action.mode } : state;
        case "bookIsbn":
            return bookIsbn(state, typeof action.isbn === "string" ? action.isbn : "");
        case "bookManual":
            return bookManual(state, !!action.open);
        case "bookField":
            return bookField(state, action.field, typeof action.text === "string" ? action.text : "");
        case "bookFormat":
            if (!state.book.manual || !FORMATS.some((f) => f.value === action.format)) return state;
            return { ...state, book: { ...state.book, format: action.format, formatChosen: true } };
        case "bookName":
            return bookName(state);
        case "bookLookupStart":
            return withLookup(state, action.key ?? action.isbn, (book) => ({
                ...idleLookup(),
                phase: "looking",
                by: lookupBy(book),
            }));
        case "bookLookupDone":
            return bookFound(state, action.key ?? action.isbn, action.answer || {});
        case "bookLookupFailed": {
            const next = withLookup(state, action.key ?? action.isbn, (book) => ({
                ...idleLookup(),
                by: lookupBy(book),
                // a title no catalogue knows is not a dead end: only an ISBN can be "missing"
                phase: action.status === 404 && !book.manual ? "missing" : "failed",
                error: action.error || "the book was not looked up",
            }));
            // remembered past the card: No ISBN keeps this ISBN for the listing
            if (next === state || next.book.lookup.phase !== "missing") return next;
            return { ...next, book: { ...next.book, isbnMiss: true } };
        }
        case "bookCondition":
            return CONDITIONS.some((c) => c.value === action.condition)
                ? { ...state, book: { ...state.book, condition: action.condition } }
                : state;
        case "bookPrice":
            // typed by him: his from now on, whatever a later lookup suggests
            return {
                ...state,
                book: { ...state.book, price: typeof action.text === "string" ? action.text : "", autoPrice: "" },
            };
        case "bookMain": {
            // like the AI marks, fixed once the listing is on its way
            const photo = state.photos.find((p) => p.id === action.id);
            if (state.mode !== "book" || !photo || photosLocked(state) || photo.n === state.book.main) {
                return state;
            }
            return { ...state, book: { ...state.book, main: photo.n } };
        }
        default:
            return state;
    }
}

/**
 * A book's main photo is always one of its photos: the one he marked while it
 * is there, else the first. No photos, no main (0). Returns the same state when
 * nothing needs to change, so a no-op action stays a no-op.
 * @param {SnapState} state
 * @returns {SnapState}
 */
function settleMain(state) {
    if (state.mode !== "book") return state;
    const { main } = state.book;
    if (state.photos.some((p) => p.n === main)) return state;
    const first = state.photos.length > 0 ? state.photos[0].n : 0;
    return first === main ? state : { ...state, book: { ...state.book, main: first } };
}

/**
 * A new ISBN names the book, and so its folder on the PC: "Book <isbn13>".
 * Once that folder is made the ISBN is fixed until DONE, as the goods item name
 * is. Before that, photos taken meanwhile (a cover snapped before the barcode
 * was scanned or the ISBN typed) wait on the page for the name and are
 * relabelled with it; a different book starts its lookup and price afresh.
 */
function bookIsbn(state, isbn) {
    if (state.itemId) return state;
    let s = state;
    if (s.book.manual) {
        // No ISBN is open: the ISBN box is ignored, until a valid ISBN is in it
        // after all -- then that is the book, and the typed title goes (the
        // ISBN kept after a miss is already the book's: it changes nothing)
        if (!isbn || isbn === s.book.isbn) return state;
        s = bookManual(s, false);
    }
    if (isbn === s.book.isbn) return s;
    return renamed(
        { ...s, book: { ...s.book, isbn, isbnMiss: false, lookup: idleLookup(), price: "", autoPrice: "" } },
        isbn ? `Book ${isbn}` : ""
    );
}

/**
 * The book's item name, and the photos waiting for it relabelled with it
 * ("Book-1.jpg" while there is none).
 */
function renamed(state, itemName) {
    return {
        ...state,
        itemName,
        photos: state.photos.map((p) => ({ ...p, name: buildFileName(itemName || "Book", p.n) })),
    };
}

/**
 * No ISBN, tapped: the title fields open, and the ISBN (if any) is set aside;
 * tapped again: they close and what was typed in them goes. Either way the
 * book is a different book now, so its lookup starts afresh and a price the
 * page suggested goes with the old one (a price he typed stays). Once the
 * book's folder is on the PC, what names it is fixed until DONE.
 *
 * After an ISBN no catalogue knows the ISBN is not set aside: it goes on the
 * listing, and it still names the folder, so the fields open (and close) even
 * once the folder is on the PC -- they only describe the book. Closed again,
 * the ISBN is asked about afresh (the lookup is idle).
 */
function bookManual(state, open) {
    if (open === state.book.manual) return state;
    const { book } = state;
    if (state.itemId && !book.isbnMiss) return state;
    const suggested = book.autoPrice && book.price === book.autoPrice;
    const next = {
        ...book,
        ...blankManual(),
        manual: open,
        lookup: idleLookup(),
        price: suggested ? "" : book.price,
        autoPrice: "",
    };
    if (book.isbnMiss) return { ...state, book: next };
    return renamed({ ...state, book: { ...next, isbn: "" } }, "");
}

const TYPED_FIELDS = ["title", "author", "year"];

/**
 * A keystroke in the title, author or year. When it changes what the PC would
 * be asked, the last answer no longer describes the book: the lookup goes back
 * to idle (the card says it is about to look) until the search goes again.
 */
function bookField(state, field, text) {
    if (!state.book.manual || !TYPED_FIELDS.includes(field) || state.book[field] === text) return state;
    const before = lookupKey(state.book);
    const book = { ...state.book, [field]: text };
    if (lookupKey(book) !== before) book.lookup = idleLookup();
    return { ...state, book };
}

/**
 * He stopped typing: the title names the book's folder on the PC,
 * "Book <cleaned title>", capped as a goods name is. The photos that waited
 * for a name go with it. Fixed once the folder is made, as an ISBN is. A kept
 * ISBN (one no catalogue knows) goes on naming it.
 */
function bookName(state) {
    if (state.itemId || !state.book.manual || state.book.isbnMiss) return state;
    const title = cleanItemName(bookSearch(state.book).title);
    const itemName = title ? cleanItemName(`Book ${title}`) : "";
    return itemName === state.itemName ? state : renamed(state, itemName);
}

/**
 * What the book is looked up by, as one string: the ISBN, or (No ISBN) the
 * title, author and year as they would be sent. "" while there is nothing to
 * look up. An answer is kept only while this is still the same.
 * @param {BookSlice} book
 * @returns {string}
 */
export function lookupKey(book) {
    if (!book.manual) return book.isbn;
    const q = bookSearch(book);
    return q.title ? JSON.stringify([q.title, q.author, q.year]) : "";
}

/** @param {BookSlice} book */
function lookupBy(book) {
    return book.manual ? "title" : "isbn";
}

/** The PC's answer about a book, kept only while it is still the book in the box. */
function withLookup(state, key, fn) {
    if (!key || key !== lookupKey(state.book)) return state;
    return { ...state, book: { ...state.book, lookup: fn(state.book) } };
}

/**
 * Found: the card, the listings, and the price box filled with the suggestion
 * unless he typed one (a suggestion of an earlier answer is replaced: he typed
 * more of the title and the PC found a better match). A book found by title
 * that a catalogue matched sets the format chip too, until he taps one himself.
 */
function bookFound(state, key, answer) {
    const price = bookPriceValue(typeof answer.price === "string" ? answer.price : String(answer.price ?? ""));
    const next = withLookup(state, key, (book) => ({
        ...idleLookup(),
        phase: "found",
        by: lookupBy(book),
        // by ISBN the catalogue always knows it; by title only when the PC says so
        matched: !book.manual || answer.found === true,
        record: bookRecord(answer),
        price,
        listings: bookListings(answer.listings),
        route: typeof answer.route === "string" ? answer.route : "",
    }));
    if (next === state) return next;
    const book = { ...next.book };
    // found by its ISBN after all (asked again): a catalogue knows it now
    if (!book.manual) book.isbnMiss = false;
    const typed = book.price.trim() !== "" && book.price !== book.autoPrice;
    if (!typed && (price || book.autoPrice)) {
        book.price = price;
        book.autoPrice = price;
    }
    const format = book.lookup.matched ? formatOf(book.lookup.record.format) : "";
    if (book.manual && !book.formatChosen && format) book.format = format;
    return { ...next, book };
}

/**
 * What a book's job carries besides the item: the ISBN -- or, with No ISBN,
 * the title, author, year and format he typed (the PC searches and lists by
 * them) -- the condition chip, the price as the PC should list it, and the
 * number of the main photo (always sent: the ebay button needs a photo, so
 * there is always one). The fields that do not apply are sent as "".
 *
 * An ISBN no catalogue knows, with No ISBN opened after it, sends both: the
 * ISBN (the PC keeps it on the listing) and the typed fields (the PC takes the
 * title and the rest from them, since the catalogues have nothing).
 * @param {SnapState} state
 * @returns {BookJob}
 */
export function bookForm(state) {
    const { book } = state;
    const typed = book.manual ? bookSearch(book) : { title: "", author: "", year: "" };
    return {
        isbn: book.manual && !book.isbnMiss ? "" : book.isbn,
        title: typed.title,
        author: typed.author,
        year: typed.year,
        format: book.manual ? book.format : "",
        condition: book.condition,
        price: bookPriceValue(book.price),
        main: book.main,
    };
}

function taskDone(state, task, answer) {
    switch (task.kind) {
        case "item":
            return adoptItem(state, answer);
        case "photo":
            return patchPhoto(state, task.id, (p) => ({ ...p, status: "sent", error: "" }));
        case "delete":
            return { ...state, deletes: state.deletes.filter((n) => n !== task.n) };
        case "note":
            return { ...state, note: { ...state.note, sentText: task.text } };
        default:
            return state;
    }
}

function taskFailed(state, task, status, error) {
    const why = error || "not sent";
    if (status !== 0) {
        // the PC answered and refused: a photo shows it (tap to retry); a
        // delete of something already gone is done; the rest is tried again
        if (task.kind === "photo") {
            return patchPhoto(state, task.id, (p) => ({ ...p, status: "failed", error: why }));
        }
        if (task.kind === "delete" && status === 404) {
            return { ...state, deletes: state.deletes.filter((n) => n !== task.n) };
        }
    }
    const stalled = { ...state, stalled: true, failures: state.failures + 1, problem: why };
    if (task.kind !== "photo") return stalled;
    return patchPhoto(stalled, task.id, (p) =>
        p.status === "sending" ? { ...p, status: "waiting" } : p
    );
}

/**
 * The item exists on the PC. The same name the same day is the same item
 * there, so it may already hold photos: they join the strip as sent, and the
 * photos waiting here are numbered on after them so nothing is overwritten.
 */
function adoptItem(state, answer) {
    const itemId = typeof answer.item === "string" ? answer.item : "";
    if (!itemId) {
        return {
            ...state,
            stalled: true,
            failures: state.failures + 1,
            problem: "the PC gave no item",
        };
    }
    const existing = numbers(answer.photos);
    if (existing.length === 0) return { ...state, itemId };
    let next = Math.max(...existing);
    let { main } = state.book;
    const waiting = state.photos.map((p) => {
        next += 1;
        // a book's main mark follows its photo to the new number
        if (p.n === state.book.main) main = next;
        return { ...p, n: next, name: buildFileName(state.itemName, next) };
    });
    const there = existing.map((n) => photoOnPc(state.itemName, n, false));
    return { ...state, itemId, photos: [...there, ...waiting], book: { ...state.book, main } };
}

/**
 * A reloaded page takes the item back as the PC has it. A book also takes back
 * what only the phone knew (action.book, from savedItem): the ISBN or the typed
 * title, the condition, the price box and the book the lookup found. Without a found
 * book the page simply asks the PC again.
 */
function recovered(state, action) {
    const answer = action.answer || {};
    const marked = new Set(numbers(action.ai));
    const note = typeof answer.note === "string" ? answer.note : "";
    const mode = MODES.includes(action.mode) ? action.mode : state.mode;
    let next = {
        ...initialState(action.itemName, mode),
        book: mode === "book" ? recoveredBook(action.book) : initialBook(),
        online: state.online,
        itemId: action.itemId,
        photos: numbers(answer.photos).map((n) => photoOnPc(action.itemName, n, marked.has(n))),
        note: { text: note, sentText: note, due: false },
        sku: typeof answer.sku === "string" ? answer.sku : "",
        // only the phone knows it until a button is pressed (a book's is in its slice)
        customize: mode === "goods" ? recoveredCustomize(action.customize) : initialCustomize(),
    };
    for (const job of Array.isArray(answer.jobs) ? answer.jobs : []) {
        if (!job || !VENUES.includes(job.venue)) continue;
        next = withJob(next, job.venue, () => ({ ...idleJob(), jobId: String(job.job) }));
        next = reduce(next, { type: "jobStatus", venue: job.venue, status: job });
    }
    return next;
}

function recoveredBook(saved) {
    const s = saved && typeof saved === "object" ? saved : {};
    const book = initialBook();
    const isbn = typeof s.isbn === "string" && /^\d{13}$/.test(s.isbn) ? s.isbn : "";
    if (s.manual === true) {
        // a book with no ISBN: its title (and the rest) is what names it
        book.manual = true;
        for (const field of TYPED_FIELDS) if (typeof s[field] === "string") book[field] = s[field];
        if (FORMATS.some((f) => f.value === s.format)) book.format = s.format;
        // ... or one whose ISBN no catalogue knows: that ISBN is kept for the listing
        if (isbn && s.isbnMiss === true) Object.assign(book, { isbn, isbnMiss: true });
    } else if (isbn) {
        book.isbn = isbn;
        book.isbnMiss = s.isbnMiss === true;
    }
    if (CONDITIONS.some((c) => c.value === s.condition)) book.condition = s.condition;
    if (typeof s.price === "string") book.price = s.price;
    book.customize = recoveredCustomize(s.customize);
    // settleMain() then checks it is still one of the photos the PC has
    if (Number.isInteger(s.main) && s.main > 0) book.main = s.main;
    const found = s.lookup && typeof s.lookup === "object" ? s.lookup : null;
    if (lookupKey(book) && found && found.record) {
        book.lookup = {
            ...idleLookup(),
            phase: "found",
            by: lookupBy(book),
            matched: !book.manual || found.matched === true,
            record: bookRecord(found.record),
            price: bookPriceValue(typeof found.price === "string" ? found.price : ""),
            listings: bookListings(found.listings),
            route: typeof found.route === "string" ? found.route : "",
        };
        // the box still holding the suggestion: a later answer may replace it, as before the reload
        if (book.lookup.price && book.price === book.lookup.price) book.autoPrice = book.price;
    }
    return book;
}

function photoOnPc(itemName, n, ai) {
    return {
        id: `pc#${n}`,
        name: buildFileName(itemName, n),
        n,
        ai,
        status: "sent",
        error: "",
        tried: true,
        local: false,
    };
}

function numbers(list) {
    return Array.isArray(list)
        ? [...new Set(list.filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b)
        : [];
}

function patchPhoto(state, id, fn) {
    let hit = false;
    const photos = state.photos.map((p) => {
        if (p.id !== id) return p;
        hit = true;
        return fn(p);
    });
    return hit ? { ...state, photos } : state;
}

function withJob(state, venue, fn) {
    if (!state.jobs[venue]) return state;
    return { ...state, jobs: { ...state.jobs, [venue]: fn(state.jobs[venue]) } };
}

function toCount(x) {
    return Number.isInteger(x) && x > 0 ? x : 0;
}

/** The highest photo number the item has, so a new photo never reuses one. */
export function highestNumber(state) {
    return state.photos.reduce((top, p) => Math.max(top, p.n), 0);
}

/**
 * Counters with the item's count raised to at least `n`.
 * @param {Record<string, number>} counters
 * @param {string} itemName
 * @param {number} n
 * @returns {Record<string, number>}
 */
export function raiseCount(counters, itemName, n) {
    if (currentCount(counters, itemName) >= n) return counters || {};
    return { ...(counters || {}), [itemName]: n };
}

/**
 * What the page keeps in localStorage so a reload can read the item back
 * from the PC: the name, the id, and which photos are marked AI (the PC does
 * not know the marks until a button is pressed).
 *
 * A book keeps, besides, what only the phone knows: the ISBN (or, with No
 * ISBN, the title, author, year and format he typed; after an ISBN no
 * catalogue knows, both, and that it was a miss), the condition chip, the
 * price box, the main photo and the book the lookup found (so a reload does
 * not even have to ask the catalogues again). It has no AI marks.
 *
 * Either kind also keeps customize (the quantity and pickup only), but only
 * once it is not the default: an item left alone is saved as it always was.
 * @returns {null|{itemName:string, itemId:string, ai:number[], customize?:Customize}
 *          |{mode:"book", itemName:string, itemId:string, isbn:string, isbnMiss:boolean, manual:boolean, title:string,
 *            author:string, year:string, format:string, condition:string, price:string,
 *            main:number, lookup:(null|object), customize?:Customize}}
 */
export function savedItem(state) {
    if (!state.itemId) return null;
    if (state.mode === "book") {
        const { isbn, isbnMiss, manual, title, author, year, format, condition, price, main, lookup, customize } =
            state.book;
        return {
            mode: "book",
            itemName: state.itemName,
            itemId: state.itemId,
            isbn,
            isbnMiss,
            manual,
            title,
            author,
            year,
            format,
            condition,
            price,
            main,
            lookup:
                lookup.phase === "found"
                    ? {
                          by: lookup.by,
                          matched: lookup.matched,
                          record: lookup.record,
                          price: lookup.price,
                          listings: lookup.listings,
                          route: lookup.route,
                      }
                    : null,
            ...savedCustomize(customize),
        };
    }
    return {
        itemName: state.itemName,
        itemId: state.itemId,
        ai: state.photos.filter((p) => p.ai).map((p) => p.n),
        ...savedCustomize(state.customize),
    };
}

// --- what the screen says ------------------------------------------------------

/**
 * The line under a venue button, and the link when there is one. Before the
 * press it says `idle`, if anything (venueIdleNote: "pickup only").
 * @param {VenueJob} job
 * @param {string} [idle]
 * @returns {{text:string, link:string, kind:""|"busy"|"ok"|"bad"}}
 */
export function venueLine(job, idle = "") {
    switch (job.phase) {
        case "sending":
            return { text: job.step || "sending", link: "", kind: "busy" };
        case "queued": {
            if (job.trouble) return { text: `${job.trouble}, still trying`, link: "", kind: "busy" };
            const text = job.ahead > 0 ? `queued, ${job.ahead} ahead` : "queued";
            return { text, link: "", kind: "busy" };
        }
        case "running":
            if (job.trouble) return { text: `${job.trouble}, still trying`, link: "", kind: "busy" };
            return { text: job.step || "working", link: "", kind: "busy" };
        case "done":
            return job.link
                ? { text: "", link: job.link, kind: "ok" }
                : { text: "done", link: "", kind: "ok" };
        case "failed":
            return { text: job.error || "failed", link: "", kind: "bad" };
        default:
            return { text: idle, link: "", kind: "" };
    }
}

export const SETTINGS_HINT = "Set the PC address and key in Settings";

/**
 * Whether a venue button can be pressed, and if not, the one-line reason.
 * A new item goes once every photo is on the PC and at least one is marked AI.
 * @param {SnapState} state
 * @param {string} venue
 * @param {boolean} settingsOk
 * @returns {{enabled:boolean, hint:string}}
 */
export function venueButton(state, venue, settingsOk) {
    if (state.mode === "book") return bookVenueButton(state, venue, settingsOk);
    const job = state.jobs[venue];
    // pressed already: on its way, or posted (the link is right there)
    if (isActive(job) || job.phase === "done") return { enabled: false, hint: "" };
    if (!settingsOk) return { enabled: false, hint: SETTINGS_HINT };
    // a quantity he typed wrong is his to fix first: it goes with either button
    if (!quantityValue(state.customize.quantity)) return { enabled: false, hint: QUANTITY_HINT };
    // the second button: the row is saved, nothing more is needed
    if (state.sku) return { enabled: true, hint: "" };
    // the other button's job is on its way but has not saved the row yet
    if (anyActive(state)) {
        return { enabled: false, hint: "The other button goes first; this one opens when it has saved the item" };
    }
    const n = state.photos.length;
    if (n === 0) return { enabled: false, hint: "Snap a photo first" };
    if (n > MAX_PHOTOS) return { enabled: false, hint: `At most ${MAX_PHOTOS} photos - delete ${n - MAX_PHOTOS}` };
    if (!state.photos.some((p) => p.ai)) {
        return { enabled: false, hint: "Mark at least one photo AI (bottom right of the photo)" };
    }
    if (state.photos.some((p) => p.status === "failed")) {
        return { enabled: false, hint: "A photo did not reach the PC - tap its 'failed' to try again" };
    }
    if (unsent(state) || !state.itemId) {
        const sent = state.photos.filter((p) => p.status === "sent").length;
        return { enabled: false, hint: `Waiting for the photos to reach the PC (${sent} of ${n} sent)` };
    }
    return { enabled: true, hint: "" };
}

/**
 * A book's photos are on the page but nothing names it yet: the cover was
 * snapped before the barcode was scanned, the ISBN typed or (No ISBN) the
 * title typed (the ISBN button's picture itself is never one of them). Its
 * folder on the PC is named by the ISBN or the title, so they cannot go until
 * there is one: what blocks them is the ISBN or the title, not the PC, and the
 * lines under ebay and DONE say so.
 */
export function waitsForIsbn(state) {
    return state.mode === "book" && !state.itemName && state.photos.length > 0;
}

/** The first thing a book needs, said where nothing else is to be said yet. */
export const NO_BOOK_HINT = "Scan the ISBN, or tap No ISBN and type the title";

export const ISBN_WAIT_HINT =
    "Scan the ISBN, or tap No ISBN and type the title, so the photos can go to the PC; or remove them with their x";

export const TITLE_WAIT_HINT = "Type the title so the photos can go to the PC, or remove them with their x";

/** The line under ebay and DONE while the photos wait for a name. */
function waitHint(state) {
    return state.book.manual ? TITLE_WAIT_HINT : ISBN_WAIT_HINT;
}

/** The book has what names it: an ISBN (one kept after a miss too), or (No ISBN) a title. */
function bookNamed(book) {
    return !!book.isbn || (book.manual && !!bookSearch(book).title);
}

/** The ebay line after an ISBN no catalogue knows, while No ISBN is closed: the next step. */
export const ISBN_MISS_HINT = "Tap No ISBN and type the title";

/**
 * The book's one button, ebay. It opens once the book is found in the
 * catalogues (by its ISBN; by its title the PC's answer is enough, matched or
 * not), at least one photo is taken and every photo is on the PC, and
 * the price box holds a price. A book goes by its catalogue record, not a
 * model, so there is no AI mark to wait for -- and no second venue: a book
 * that failed after the PC saved its row is simply sent again whole.
 * @param {SnapState} state
 * @param {string} venue
 * @param {boolean} settingsOk
 * @returns {{enabled:boolean, hint:string}}
 */
function bookVenueButton(state, venue, settingsOk) {
    const job = state.jobs[venue];
    if (venue !== "ebay" || !job) return { enabled: false, hint: "" };
    if (isActive(job) || job.phase === "done") return { enabled: false, hint: "" };
    if (!settingsOk) return { enabled: false, hint: SETTINGS_HINT };
    const { book } = state;
    if (!quantityValue(book.customize.quantity)) return { enabled: false, hint: QUANTITY_HINT };
    if (waitsForIsbn(state)) return { enabled: false, hint: waitHint(state) };
    // under No ISBN the title is what is looked up, even with an ISBN kept after a miss
    if (book.manual ? !bookSearch(book).title : !book.isbn) {
        return { enabled: false, hint: book.manual ? "Type the book's title first" : NO_BOOK_HINT };
    }
    switch (book.lookup.phase) {
        case "found":
            break;
        case "missing":
            return { enabled: false, hint: ISBN_MISS_HINT };
        case "failed":
            return {
                enabled: false,
                hint: `The book was not looked up - edit the ${book.manual ? "title" : "ISBN"} to try again`,
            };
        default:
            return { enabled: false, hint: "Looking the book up..." };
    }
    const n = state.photos.length;
    if (n === 0) return { enabled: false, hint: "Snap the cover first" };
    if (n > MAX_PHOTOS) return { enabled: false, hint: `At most ${MAX_PHOTOS} photos - delete ${n - MAX_PHOTOS}` };
    if (!bookPriceValue(book.price)) return { enabled: false, hint: "Set a price (whole dollars are fine)" };
    if (state.photos.some((p) => p.status === "failed")) {
        return { enabled: false, hint: "A photo did not reach the PC - tap its 'failed' to try again" };
    }
    if (unsent(state) || !state.itemId) {
        const sent = state.photos.filter((p) => p.status === "sent").length;
        return { enabled: false, hint: `Waiting for the photos to reach the PC (${sent} of ${n} sent)` };
    }
    return { enabled: true, hint: "" };
}

/**
 * DONE: needs a photo (as before), waits while a job for this item is on its
 * way or on the PC, and while a photo or a delete has not reached the PC.
 * A book also opens it with an ISBN (or a typed title) and no photo yet, so a
 * book that is not in the catalogues can be cleared without taking a picture of it.
 * @returns {{enabled:boolean, hint:string}}
 */
export function doneButton(state) {
    if (anyActive(state)) {
        return { enabled: false, hint: "DONE waits until the listing is finished" };
    }
    // a book's photos waiting for its ISBN or title are not waiting for the PC
    if (waitsForIsbn(state)) return { enabled: false, hint: waitHint(state) };
    if (unsent(state)) {
        return { enabled: false, hint: "DONE waits until the photos are on the PC" };
    }
    const something = state.photos.length > 0 || (state.mode === "book" && bookNamed(state.book));
    return { enabled: something, hint: "" };
}

/**
 * The quiet word next to the notes label. The note goes to the PC as he
 * types (note.txt beside the photos), a moment after he stops.
 * @param {SnapState} state
 * @returns {string}
 */
export function noteStatusText(state) {
    const { note } = state;
    if (!noteDirty(state)) return note.sentText ? "sent" : "";
    if (!state.itemId) return note.text.trim() ? "goes with the first photo" : "";
    if (state.busy && state.busy.kind === "note") return "sending...";
    if (state.stalled || !state.online) return "not sent (offline), will retry";
    return note.due ? "sending..." : "";
}

/**
 * The running line above the strip: "4 photos, 2 for the AI, 3 on the PC".
 * A book's photos never go to a model, so its line leaves the AI out:
 * "2 photos, all on the PC"; or "1 photo, waiting for the ISBN or the title"
 * while nothing names its folder, which is not the PC being slow.
 * @param {SnapState} state
 * @returns {string}
 */
export function progressLine(state) {
    const total = state.photos.length;
    if (total === 0) return "No photos yet.";
    const ai = state.photos.filter((p) => p.ai).length;
    const sent = state.photos.filter((p) => p.status === "sent").length;
    const photos = total === 1 ? "1 photo" : `${total} photos`;
    if (waitsForIsbn(state)) {
        return `${photos}, waiting for ${state.book.manual ? "the title" : "the ISBN or the title"}`;
    }
    const where = `${sent === total ? "all" : sent} on the PC`;
    if (state.mode === "book") return `${photos}, ${where}`;
    return `${photos}, ${ai} for the AI, ${where}`;
}

/**
 * Leaving the page now would lose something: a photo, a delete or the note
 * not yet on the PC, or a job on its way. A book adds nothing of its own: its
 * ISBN, condition and price are kept for a reload once its item is on the PC,
 * and before that there is no photo on the PC to lose them from.
 */
export function leaveWarning(state) {
    return anyActive(state) || unsent(state) || (!!state.itemId && noteDirty(state));
}

/**
 * The banner at the top: offline, or the PC not answering. The photos wait on
 * the page meanwhile and the queue carries on by itself.
 * @param {SnapState} state
 * @returns {string} "" when all is well
 */
export function bannerText(state) {
    if (!state.online) {
        return "You are offline. Photos wait on this page and go to the PC when you are back.";
    }
    if (state.stalled) {
        const why = state.problem || "cannot reach the PC";
        return `${why[0].toUpperCase()}${why.slice(1)}. Photos wait on this page and go to the PC as soon as it answers.`;
    }
    return "";
}
