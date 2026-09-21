// core.js -- pure logic for crosslister snap.
// No DOM, no network, no browser globals. Everything here is unit tested
// by `node --test tests/`.

/** Characters OneDrive / Windows refuse in a file or folder name. */
const FORBIDDEN = /["*:<>?/\\|]/g;

/** Maximum length of the item folder name. */
export const MAX_ITEM_NAME = 60;

/**
 * Clean a typed item name into something OneDrive and Windows both accept.
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
 * Extension for an uploaded photo, from the original file name / mime type.
 * Defaults to .jpg because that is what a Pixel camera hands over.
 * @param {string} originalName
 * @param {string} [mimeType]
 * @returns {string} extension including the dot, lowercase
 */
export function photoExtension(originalName, mimeType = "") {
    const m = /\.([A-Za-z0-9]{1,5})$/.exec(originalName || "");
    if (m) return "." + m[1].toLowerCase();
    const byMime = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/heic": ".heic",
        "image/heif": ".heif",
    };
    return byMime[(mimeType || "").toLowerCase()] || ".jpg";
}

/**
 * Build the OneDrive file name for photo number `n` of an item.
 * @param {string} itemName already cleaned
 * @param {number} n 1-based
 * @param {string} [ext] extension including the dot
 * @returns {string}
 */
export function buildFileName(itemName, n, ext = ".jpg") {
    return `${itemName}-${n}${ext}`;
}

/**
 * Percent-encode a path segment for a Graph `root:/a/b:` address.
 * Graph wants the path url-encoded but keeps "/" as the separator.
 * @param {string} segment
 * @returns {string}
 */
export function encodePathSegment(segment) {
    return encodeURIComponent(segment);
}

/**
 * The Graph URL that creates an upload session for a file, addressed by path.
 * The folders in the path are created implicitly by the upload.
 * @param {string} basePath e.g. "Pictures/Uploads"
 * @param {string} itemName cleaned folder name
 * @param {string} fileName
 * @param {string} [graphRoot]
 * @returns {string}
 */
export function uploadSessionUrl(
    basePath,
    itemName,
    fileName,
    graphRoot = "https://graph.microsoft.com/v1.0"
) {
    return `${itemPathAddress(basePath, itemName, fileName, graphRoot)}:/createUploadSession`;
}

/**
 * The Graph URL that PUTs the whole content of a small file, addressed by path.
 * Used for note.txt; see graph.js for the doc link and the 250 MB limit.
 * @param {string} basePath
 * @param {string} itemName
 * @param {string} fileName
 * @param {string} [graphRoot]
 * @returns {string}
 */
export function fileContentUrl(
    basePath,
    itemName,
    fileName,
    graphRoot = "https://graph.microsoft.com/v1.0"
) {
    return `${itemPathAddress(basePath, itemName, fileName, graphRoot)}:/content`;
}

/** ".../me/drive/root:/Pictures/Uploads/<item>/<file>" -- no trailing action. */
function itemPathAddress(basePath, itemName, fileName, graphRoot) {
    const parts = String(basePath)
        .split("/")
        .map((p) => p.trim())
        .filter(Boolean)
        .concat([itemName, fileName])
        .map(encodePathSegment);
    return `${graphRoot}/me/drive/root:/${parts.join("/")}`;
}

/**
 * The Graph URL for one drive item by id (DELETE lands here).
 * @param {string} itemId
 * @param {string} [graphRoot]
 * @returns {string}
 */
export function driveItemUrl(itemId, graphRoot = "https://graph.microsoft.com/v1.0") {
    return `${graphRoot}/me/drive/items/${encodeURIComponent(itemId)}`;
}

/** 320 KiB -- Graph requires every non-final range to be a multiple of this. */
export const RANGE_MULTIPLE = 327680;

/** 10 MiB, a multiple of 320 KiB; Microsoft's recommended range size. */
export const DEFAULT_CHUNK_SIZE = 32 * RANGE_MULTIPLE;

/**
 * Split a file of `size` bytes into the byte ranges to PUT at the upload URL.
 * Every range but the last is a multiple of 320 KiB, as Graph requires.
 *
 * @param {number} size total bytes
 * @param {number} [chunkSize]
 * @returns {{start:number,end:number,length:number,contentRange:string}[]}
 */
export function planRanges(size, chunkSize = DEFAULT_CHUNK_SIZE) {
    if (!Number.isInteger(size) || size < 0) {
        throw new RangeError("size must be a non-negative integer");
    }
    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
        throw new RangeError("chunkSize must be a positive integer");
    }
    if (chunkSize % RANGE_MULTIPLE !== 0) {
        throw new RangeError("chunkSize must be a multiple of 320 KiB");
    }
    if (size === 0) return [];
    const ranges = [];
    for (let start = 0; start < size; start += chunkSize) {
        const end = Math.min(start + chunkSize, size) - 1;
        ranges.push({
            start,
            end,
            length: end - start + 1,
            contentRange: `bytes ${start}-${end}/${size}`,
        });
    }
    return ranges;
}

/** How many times a single photo is attempted in total. */
export const MAX_ATTEMPTS = 3;

/**
 * Backoff before attempt number `attempt` (1-based; attempt 1 waits 0).
 * 0 ms, 1000 ms, 3000 ms, then capped at 30000 ms.
 * @param {number} attempt
 * @returns {number} milliseconds
 */
export function retryDelayMs(attempt) {
    if (attempt <= 1) return 0;
    return Math.min(1000 * Math.pow(3, attempt - 2), 30000);
}

/**
 * Whether a failed attempt is worth repeating.
 * Network errors (status 0) and 5xx / 429 are transient; 4xx is not.
 * @param {number} attempt attempts made so far
 * @param {number} status HTTP status, 0 for a network failure
 * @returns {boolean}
 */
export function shouldRetry(attempt, status) {
    if (attempt >= MAX_ATTEMPTS) return false;
    if (status === 0) return true;
    if (status === 429) return true;
    return status >= 500 && status < 600;
}

// --- photo list state ------------------------------------------------------

/**
 * @typedef {Object} Photo
 * @property {string} id
 * @property {string} name        file name in OneDrive
 * @property {number} n           1-based number within the item
 * @property {"queued"|"uploading"|"done"|"failed"|"deleting"|"delete-failed"} status
 * @property {number} progress    0..1
 * @property {number} attempts
 * @property {string} [driveItemId]  the OneDrive id, known once the upload finished
 * @property {string} [error]
 */

/**
 * The note for the current item.
 * - text       what is in the box right now
 * - savedText  what OneDrive holds (empty string = nothing up there)
 * - uploaded   true once a note.txt exists for this item in this session
 * @typedef {Object} NoteState
 * @property {string} text
 * @property {string} savedText
 * @property {"clean"|"dirty"|"saving"|"saved"|"failed"} status
 * @property {boolean} uploaded
 * @property {string} [driveItemId]
 * @property {string} [error]
 */

/**
 * @typedef {Object} SnapState
 * @property {string} itemName    cleaned item name
 * @property {Photo[]} photos
 * @property {boolean} online
 * @property {NoteState} note
 */

/** @returns {NoteState} */
export function initialNote(text = "") {
    return {
        text,
        savedText: "",
        status: text ? "dirty" : "clean",
        uploaded: false,
        driveItemId: undefined,
        error: undefined,
    };
}

/** @returns {SnapState} */
export function initialState(itemName = "") {
    return { itemName, photos: [], online: true, note: initialNote("") };
}

/**
 * The one reducer for the photo list. Pure: returns a new state, never mutates.
 * Actions:
 *   {type:"setItem", itemName}
 *   {type:"add", id, name, n}
 *   {type:"start", id}
 *   {type:"progress", id, progress}
 *   {type:"done", id, driveItemId?}
 *   {type:"fail", id, error}
 *   {type:"deleting", id}
 *   {type:"deleteFailed", id, error}
 *   {type:"remove", id}            drops the photo from the list for good
 *   {type:"online", online}
 *   {type:"reset", itemName?, note?}
 *   {type:"noteText", text}
 *   {type:"noteReset", text}
 *   {type:"noteSaving"}
 *   {type:"noteSaved", text, uploaded, driveItemId?}
 *   {type:"noteFailed", error}
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
                        status: "queued",
                        progress: 0,
                        attempts: 0,
                    },
                ],
            };
        case "start":
            return patch(state, action.id, (p) => ({
                ...p,
                status: "uploading",
                progress: 0,
                attempts: p.attempts + 1,
                error: undefined,
            }));
        case "progress":
            return patch(state, action.id, (p) => ({
                ...p,
                progress: clamp01(action.progress),
            }));
        case "done":
            return patch(state, action.id, (p) => ({
                ...p,
                status: "done",
                progress: 1,
                driveItemId: action.driveItemId ?? p.driveItemId,
                error: undefined,
            }));
        case "fail":
            return patch(state, action.id, (p) => ({
                ...p,
                status: "failed",
                error: action.error || "upload failed",
            }));
        case "deleting":
            return patch(state, action.id, (p) => ({
                ...p,
                status: "deleting",
                error: undefined,
            }));
        case "deleteFailed":
            return patch(state, action.id, (p) => ({
                ...p,
                status: "delete-failed",
                error: action.error || "delete failed",
            }));
        case "remove": {
            const photos = state.photos.filter((p) => p.id !== action.id);
            return photos.length === state.photos.length ? state : { ...state, photos };
        }
        case "online":
            return { ...state, online: !!action.online };
        case "reset":
            return {
                ...state,
                itemName: action.itemName ?? "",
                photos: [],
                note: initialNote(action.note ?? ""),
            };

        // --- the note ------------------------------------------------------
        case "noteText": {
            const text = typeof action.text === "string" ? action.text : "";
            return {
                ...state,
                note: {
                    ...state.note,
                    text,
                    status: text === state.note.savedText ? "clean" : "dirty",
                    error: undefined,
                },
            };
        }
        case "noteReset":
            // a different item folder: nothing of the old note's saved state
            // can be true of the new one.
            return { ...state, note: initialNote(action.text ?? "") };
        case "noteSaving":
            return { ...state, note: { ...state.note, status: "saving", error: undefined } };
        case "noteSaved": {
            const savedText = typeof action.text === "string" ? action.text : "";
            return {
                ...state,
                note: {
                    ...state.note,
                    savedText,
                    uploaded: !!action.uploaded,
                    // nothing up there any more means no id to remember
                    driveItemId: action.uploaded
                        ? (action.driveItemId ?? state.note.driveItemId)
                        : undefined,
                    // he may have typed on while the save was in flight
                    status: state.note.text === savedText ? "saved" : "dirty",
                    error: undefined,
                },
            };
        }
        case "noteFailed":
            return {
                ...state,
                note: {
                    ...state.note,
                    status: "failed",
                    error: action.error || "could not save the note",
                },
            };
        default:
            return state;
    }
}

/**
 * Is there anything to send for the note? Only when the text differs from
 * what OneDrive already has and there is a folder to put it in.
 * @param {SnapState} state
 * @returns {boolean}
 */
export function noteNeedsSave(state) {
    if (!state.itemName) return false;
    if (state.note.text === state.note.savedText) return false;
    // an empty note with nothing uploaded has nothing to do
    if (state.note.text.trim() === "" && !state.note.uploaded) return false;
    return true;
}

/**
 * The quiet line next to the note box. Empty string = show nothing.
 * @param {NoteState} note
 * @param {boolean} online
 * @returns {string}
 */
export function noteStatusText(note, online = true) {
    switch (note.status) {
        case "saving":
            return "saving...";
        case "saved":
            return "saved";
        case "failed":
            return online ? "not saved, will retry" : "not saved (offline), will retry";
        default:
            return "";
    }
}

/** How long after the last keystroke the note is sent. */
export const NOTE_DEBOUNCE_MS = 1500;

/**
 * A one-slot debouncer. The timer functions are arguments so tests can drive it
 * without waiting for real time.
 *
 * @param {number} ms
 * @param {{setTimer?:Function, clearTimer?:Function}} [timers]
 * @returns {{schedule:(fn:Function)=>void, flush:()=>void, cancel:()=>void, pending:()=>boolean}}
 */
export function makeDebouncer(ms, timers = {}) {
    const setTimer = timers.setTimer || ((fn, d) => setTimeout(fn, d));
    const clearTimer = timers.clearTimer || ((h) => clearTimeout(h));
    let handle = null;
    let held = null;

    function cancel() {
        if (handle !== null) clearTimer(handle);
        handle = null;
        held = null;
    }
    return {
        schedule(fn) {
            if (handle !== null) clearTimer(handle);
            held = fn;
            handle = setTimer(() => {
                handle = null;
                const f = held;
                held = null;
                if (f) f();
            }, ms);
        },
        /** Run the waiting call now (used on "Next item" and on page hide). */
        flush() {
            const f = held;
            cancel();
            if (f) f();
        },
        cancel,
        pending() {
            return handle !== null;
        },
    };
}

function patch(state, id, fn) {
    let hit = false;
    const photos = state.photos.map((p) => {
        if (p.id !== id) return p;
        hit = true;
        return fn(p);
    });
    return hit ? { ...state, photos } : state;
}

function clamp01(x) {
    if (typeof x !== "number" || Number.isNaN(x)) return 0;
    return Math.min(1, Math.max(0, x));
}

/**
 * The running line under the strip: "3 of 4 uploaded".
 * @param {SnapState} state
 * @returns {string}
 */
export function progressLine(state) {
    const total = state.photos.length;
    if (total === 0) return "No photos yet.";
    const done = state.photos.filter((p) => p.status === "done").length;
    const failed = state.photos.filter((p) => p.status === "failed").length;
    let line = `${done} of ${total} uploaded`;
    if (failed > 0) line += ` - ${failed} failed`;
    return line;
}

/**
 * Highest photo number used so far for an item, so numbering continues
 * after a reload. Counters come from sessionStorage as a plain object.
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
