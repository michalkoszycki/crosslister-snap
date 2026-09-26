// queue.js -- the upload queue: what goes to the PC next, one request at a time.
//
// Every photo goes to the PC right after it is taken, as the first version of
// this page did with its cloud folder: the item folder is made on the PC with the first photo (POST /items),
// then each photo is PUT as its own request, a photo struck out with the x is
// DELETEd there too, and the note follows a moment after he stops typing.
//
// Pure: no DOM, no network, no timers. app.js asks nextTask() what to send,
// sends it, and reports back to core.js's reducer (taskStart, taskDone,
// taskFailed); the rules for what happens then live in the reducer. Order:
//   1. the item itself, before anything can go into it
//   2. deletes, so a photo struck out never lingers in the listing
//   3. photos, in the order they were taken
//   4. the note, once he has stopped typing (or pressed a venue button)
// Nothing goes while a request is in flight, while the phone says it is
// offline, or while the queue is stalled after the PC could not be reached;
// app.js lifts the stall on a timer (retryDelayMs) and when the phone comes
// back online, and the queue carries on where it stopped.

/** How long after the last keystroke the note is sent. */
export const NOTE_DEBOUNCE_MS = 1500;

/** The longest wait between two tries while the PC cannot be reached. */
export const MAX_RETRY_MS = 30000;

/**
 * How long to wait before trying again after `failures` failures in a row:
 * 1 s, 3 s, 9 s, 27 s, then every 30 s.
 * @param {number} failures
 * @returns {number} milliseconds
 */
export function retryDelayMs(failures) {
    if (!Number.isInteger(failures) || failures <= 0) return 0;
    return Math.min(1000 * 3 ** (failures - 1), MAX_RETRY_MS);
}

/**
 * The note in the box differs from what the PC has ("" when it has none).
 * @param {{note:{text:string, sentText:(string|null)}}} state
 */
export function noteDirty(state) {
    return state.note.text.trim() !== (state.note.sentText ?? "");
}

/**
 * The one request to send now, or null.
 * @param {import("./core.js").SnapState} state
 * @returns {null
 *   | {kind:"item", name:string}
 *   | {kind:"delete", n:number}
 *   | {kind:"photo", id:string, n:number}
 *   | {kind:"note", text:string}}
 */
export function nextTask(state) {
    if (state.busy || state.stalled || !state.online) return null;
    if (!state.itemId) {
        const waiting = state.photos.some((p) => p.status === "waiting");
        return waiting && state.itemName ? { kind: "item", name: state.itemName } : null;
    }
    if (state.deletes.length > 0) return { kind: "delete", n: state.deletes[0] };
    const photo = state.photos.find((p) => p.status === "waiting");
    if (photo) return { kind: "photo", id: photo.id, n: photo.n };
    if (state.note.due && noteDirty(state)) return { kind: "note", text: state.note.text.trim() };
    return null;
}

/** A photo or a delete the PC does not have yet (the note is noteDirty). */
export function unsent(state) {
    return state.photos.some((p) => p.status !== "sent") || state.deletes.length > 0;
}

/**
 * The small word on a photo.
 * @param {{status:string}} photo
 * @returns {"waiting"|"sent"|"failed"}
 */
export function badgeText(photo) {
    if (photo.status === "sent") return "sent";
    if (photo.status === "failed") return "failed";
    return "waiting";
}
