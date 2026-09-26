// core.js -- pure logic for crosslister snap.
// No DOM, no network, no browser globals. Everything here is unit tested
// by `node --test`. The upload queue's own rules (what goes next, how long
// to wait) are in queue.js; the state they act on is reduced here.

import { noteDirty, unsent } from "./queue.js?v=1.4.0";

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
 * @param {{n:number, ai:boolean}[]} [o.photos]
 * @returns {{sku:string, venue:string} | {item:string, venue:string, ai:number[]}}
 */
export function jobRequest({ venue, sku = "", item = "", photos = [] }) {
    if (!VENUES.includes(venue)) throw new RangeError(`unknown venue ${venue}`);
    if (sku) return { sku, venue };
    return { item, venue, ai: photos.filter((p) => p.ai).map((p) => p.n) };
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
 */

/** @returns {VenueJob} */
export function idleJob() {
    return { phase: "idle", jobId: "", step: "", ahead: 0, link: "", error: "", trouble: "" };
}

/** @returns {SnapState} */
export function initialState(itemName = "") {
    return {
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
            };
        case "remove": {
            const gone = state.photos.find((p) => p.id === action.id);
            if (!gone) return state;
            const photos = state.photos.filter((p) => p !== gone);
            const deletes =
                gone.tried && !state.deletes.includes(gone.n)
                    ? [...state.deletes, gone.n]
                    : state.deletes;
            return { ...state, photos, deletes };
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
            return { ...initialState(""), online: state.online };

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
            return taskDone(
                { ...state, busy: null, stalled: false, failures: 0, problem: "" },
                action.task,
                action.answer || {}
            );
        case "taskFailed":
            return taskFailed({ ...state, busy: null }, action.task, action.status, action.error);
        case "resume":
            return { ...state, stalled: false };
        case "recovered":
            return recovered(state, action);

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
        default:
            return state;
    }
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
    const waiting = state.photos.map((p) => {
        next += 1;
        return { ...p, n: next, name: buildFileName(state.itemName, next) };
    });
    const there = existing.map((n) => photoOnPc(state.itemName, n, false));
    return { ...state, itemId, photos: [...there, ...waiting] };
}

/** A reloaded page takes the item back as the PC has it. */
function recovered(state, action) {
    const answer = action.answer || {};
    const marked = new Set(numbers(action.ai));
    const note = typeof answer.note === "string" ? answer.note : "";
    let next = {
        ...initialState(action.itemName),
        online: state.online,
        itemId: action.itemId,
        photos: numbers(answer.photos).map((n) => photoOnPc(action.itemName, n, marked.has(n))),
        note: { text: note, sentText: note, due: false },
        sku: typeof answer.sku === "string" ? answer.sku : "",
    };
    for (const job of Array.isArray(answer.jobs) ? answer.jobs : []) {
        if (!job || !VENUES.includes(job.venue)) continue;
        next = withJob(next, job.venue, () => ({ ...idleJob(), jobId: String(job.job) }));
        next = reduce(next, { type: "jobStatus", venue: job.venue, status: job });
    }
    return next;
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
 * @returns {null|{itemName:string, itemId:string, ai:number[]}}
 */
export function savedItem(state) {
    if (!state.itemId) return null;
    return {
        itemName: state.itemName,
        itemId: state.itemId,
        ai: state.photos.filter((p) => p.ai).map((p) => p.n),
    };
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
 * A new item goes once every photo is on the PC and at least one is marked AI.
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
 * DONE: needs a photo (as before), waits while a job for this item is on its
 * way or on the PC, and while a photo or a delete has not reached the PC.
 * @returns {{enabled:boolean, hint:string}}
 */
export function doneButton(state) {
    if (anyActive(state)) {
        return { enabled: false, hint: "DONE waits until the listing is finished" };
    }
    if (unsent(state)) {
        return { enabled: false, hint: "DONE waits until the photos are on the PC" };
    }
    return { enabled: state.photos.length > 0, hint: "" };
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
 * @param {SnapState} state
 * @returns {string}
 */
export function progressLine(state) {
    const total = state.photos.length;
    if (total === 0) return "No photos yet.";
    const ai = state.photos.filter((p) => p.ai).length;
    const sent = state.photos.filter((p) => p.status === "sent").length;
    const photos = total === 1 ? "1 photo" : `${total} photos`;
    return `${photos}, ${ai} for the AI, ${sent === total ? "all" : sent} on the PC`;
}

/**
 * Leaving the page now would lose something: a photo, a delete or the note
 * not yet on the PC, or a job on its way.
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
