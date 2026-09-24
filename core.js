// core.js -- pure logic for crosslister snap.
// No DOM, no network, no browser globals. Everything here is unit tested
// by `node --test`.

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

/** The most photos one job may carry (the service refuses more). */
export const MAX_PHOTOS = 24;

/** How often a running job is asked for its status. */
export const POLL_MS = 3000;

/** The header the key travels in. */
export const KEY_HEADER = "X-Crosslister-Key";

/**
 * What one press of a venue button sends.
 *
 * A new item: venue, note, ai (the 0-based positions of the marked photos, in
 * the order the photos are sent) and every photo. The second button for the
 * same item: venue and sku only -- the PC reuses the row it saved, so there
 * is no second upload and no second model call.
 *
 * @param {object} o
 * @param {string} o.venue
 * @param {string} [o.sku]          known once the first job has saved the row
 * @param {string} [o.note]
 * @param {{id:string, ai:boolean}[]} [o.photos]  in strip order
 * @returns {{fields:[string,string][], photoIds:string[], sendsNote:boolean}}
 */
export function jobRequest({ venue, sku = "", note = "", photos = [] }) {
    if (!VENUES.includes(venue)) throw new RangeError(`unknown venue ${venue}`);
    if (sku) {
        return { fields: [["venue", venue], ["sku", sku]], photoIds: [], sendsNote: false };
    }
    const ai = photos.flatMap((p, i) => (p.ai ? [String(i)] : [])).join(",");
    return {
        fields: [
            ["venue", venue],
            ["note", note.trim()],
            ["ai", ai],
        ],
        photoIds: photos.map((p) => p.id),
        sendsNote: true,
    };
}

/**
 * The one line an error from the PC is shown as.
 * The service answers errors as JSON {"detail": "..."}: 400 with a message,
 * 401 for a missing or wrong key, 404 for a job it does not know.
 *
 * @param {number} status HTTP status, 0 when the PC could not be reached
 * @param {unknown} [detail] the `detail` field of the answer, if any
 * @returns {string}
 */
export function errorText(status, detail) {
    if (status === 0) return "cannot reach the PC";
    if (status === 401) return "wrong key - check Settings";
    if (typeof detail === "string" && detail) return detail;
    if (status === 404) return "the PC does not know this job";
    return `the PC answered ${status}`;
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
 * @property {number} n     1-based number within the item
 * @property {boolean} ai   sent to the model when true; every photo goes to the listing
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
 * @property {Photo[]} photos
 * @property {boolean} online
 * @property {{text:string, sentText:(string|null)}} note
 * @property {string} sku   the saved row, once the first job reports it
 * @property {Record<string, VenueJob>} jobs
 */

/** @returns {VenueJob} */
export function idleJob() {
    return { phase: "idle", jobId: "", step: "", ahead: 0, link: "", error: "", trouble: "" };
}

/** @returns {SnapState} */
export function initialState(itemName = "") {
    return {
        itemName,
        photos: [],
        online: true,
        note: { text: "", sentText: null },
        sku: "",
        jobs: Object.fromEntries(VENUES.map((v) => [v, idleJob()])),
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
 * Once a job has the photos (it is on its way, on the PC, or has saved the
 * row) the strip is what was sent: no more snapping, deleting or marking for
 * this item. A job that failed before the row was saved unlocks it again.
 */
export function photosLocked(state) {
    return !!state.sku || anyActive(state);
}

/**
 * The one reducer. Pure: returns a new state, never mutates.
 * Actions:
 *   {type:"setItem", itemName}
 *   {type:"add", id, name, n}
 *   {type:"remove", id}
 *   {type:"toggleAi", id}
 *   {type:"online", online}
 *   {type:"noteText", text}
 *   {type:"reset"}                        DONE: the next item
 *   {type:"jobSending", venue, step}
 *   {type:"jobAccepted", venue, job, ahead, sentNote?}
 *   {type:"jobRefused", venue, error}     the POST did not become a job
 *   {type:"jobStatus", venue, status}     an answer to GET /jobs/<id>
 *   {type:"pollTrouble", venue, error}    that GET failed; keep asking
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
            return {
                ...state,
                photos: [
                    ...state.photos,
                    { id: action.id, name: action.name, n: action.n, ai: false },
                ],
            };
        case "remove": {
            const photos = state.photos.filter((p) => p.id !== action.id);
            return photos.length === state.photos.length ? state : { ...state, photos };
        }
        case "toggleAi": {
            let hit = false;
            const photos = state.photos.map((p) => {
                if (p.id !== action.id) return p;
                hit = true;
                return { ...p, ai: !p.ai };
            });
            return hit ? { ...state, photos } : state;
        }
        case "online":
            return { ...state, online: !!action.online };
        case "noteText":
            return {
                ...state,
                note: { ...state.note, text: typeof action.text === "string" ? action.text : "" },
            };
        case "reset":
            return { ...initialState(""), online: state.online };

        case "jobSending":
            return withJob(state, action.venue, () => ({
                ...idleJob(),
                phase: "sending",
                step: action.step || "sending",
            }));
        case "jobAccepted": {
            const next = withJob(state, action.venue, () => ({
                ...idleJob(),
                phase: "queued",
                jobId: String(action.job),
                ahead: toCount(action.ahead),
            }));
            return typeof action.sentNote === "string"
                ? { ...next, note: { ...next.note, sentText: action.sentNote } }
                : next;
        }
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
        default:
            return state;
    }
}

function withJob(state, venue, fn) {
    if (!state.jobs[venue]) return state;
    return { ...state, jobs: { ...state.jobs, [venue]: fn(state.jobs[venue]) } };
}

function toCount(x) {
    return Number.isInteger(x) && x > 0 ? x : 0;
}

// --- what the screen says ------------------------------------------------------

/**
 * The line under a venue button, and the link when there is one.
 * @param {VenueJob} job
 * @returns {{text:string, link:string, kind:""|"busy"|"ok"|"bad"}}
 */
export function venueLine(job) {
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
            return { text: "", link: "", kind: "" };
    }
}

export const SETTINGS_HINT = "Set the PC address and key in Settings";

/**
 * Whether a venue button can be pressed, and if not, the one-line reason.
 * @param {SnapState} state
 * @param {string} venue
 * @param {boolean} settingsOk
 * @returns {{enabled:boolean, hint:string}}
 */
export function venueButton(state, venue, settingsOk) {
    const job = state.jobs[venue];
    // pressed already: on its way, or posted (the link is right there)
    if (isActive(job) || job.phase === "done") return { enabled: false, hint: "" };
    if (!settingsOk) return { enabled: false, hint: SETTINGS_HINT };
    // the second button: the row is saved, nothing more is needed
    if (state.sku) return { enabled: true, hint: "" };
    // the other button's job has the photos but has not saved the row yet
    if (anyActive(state)) {
        return { enabled: false, hint: "The other button goes first; this one opens when it has saved the item" };
    }
    const n = state.photos.length;
    if (n === 0) return { enabled: false, hint: "Snap a photo first" };
    if (n > MAX_PHOTOS) return { enabled: false, hint: `At most ${MAX_PHOTOS} photos - delete ${n - MAX_PHOTOS}` };
    if (!state.photos.some((p) => p.ai)) {
        return { enabled: false, hint: "Mark at least one photo AI (bottom right of the photo)" };
    }
    return { enabled: true, hint: "" };
}

/**
 * DONE: needs a photo (as before), and waits while a job for this item is on
 * its way or on the PC.
 * @returns {{enabled:boolean, hint:string}}
 */
export function doneButton(state) {
    if (anyActive(state)) {
        return { enabled: false, hint: "DONE waits until the listing is finished" };
    }
    return { enabled: state.photos.length > 0, hint: "" };
}

/**
 * The quiet word next to the notes label. The note goes with the first button
 * only; the second button reuses the saved row, so a later edit goes nowhere.
 * @param {{text:string, sentText:(string|null)}} note
 * @returns {string}
 */
export function noteStatusText(note) {
    if (note.sentText === null) return "";
    return note.text.trim() === note.sentText ? "sent" : "changed after sending - not sent";
}

/**
 * The running line above the strip: "4 photos, 2 for the AI".
 * @param {SnapState} state
 * @returns {string}
 */
export function progressLine(state) {
    const total = state.photos.length;
    if (total === 0) return "No photos yet.";
    const ai = state.photos.filter((p) => p.ai).length;
    const photos = total === 1 ? "1 photo" : `${total} photos`;
    return `${photos}, ${ai} for the AI${photosLocked(state) ? " - sent" : ""}`;
}

/** Leaving the page now would lose something: photos not yet sent, or a job in flight. */
export function leaveWarning(state) {
    if (anyActive(state)) return true;
    const sent = !!state.sku || VENUES.some((v) => state.jobs[v].phase === "done");
    return state.photos.length > 0 && !sent;
}
