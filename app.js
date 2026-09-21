// app.js -- the screen. All the thinking lives in core.js; the network calls
// live in graph.js; sign-in lives in auth.js. This file only wires them to
// buttons and paints the result.

import { config } from "./config.js?v=1.2.0";
import { VERSION } from "./version.js?v=1.2.0";
import {
    buildFileName,
    cleanItemName,
    initialState,
    makeDebouncer,
    MAX_ATTEMPTS,
    nextNumber,
    noteNeedsSave,
    NOTE_DEBOUNCE_MS,
    noteStatusText,
    photoExtension,
    progressLine,
    reduce,
    retryDelayMs,
    shouldRetry,
} from "./core.js?v=1.2.0";
import { deleteDriveItem, uploadPhoto, uploadTextFile } from "./graph.js?v=1.2.0";
import {
    clientIdMissing,
    currentAccount,
    getAccessToken,
    initAuth,
    signIn,
    signOut,
} from "./auth.js?v=1.2.0";

const COUNTER_KEY = "snap.counters";
const NOTES_KEY = "snap.notes";

/** @type {import("./core.js").SnapState} */
let state = initialState("");

/** id -> { file: File, url: string } -- the bytes never leave memory until done. */
const blobs = new Map();

/** id -> AbortController, so the x on a thumbnail can cancel a live upload. */
const controllers = new Map();

let queueRunning = false;
const queue = [];

const el = {};

const noteSaver = makeDebouncer(NOTE_DEBOUNCE_MS);
/** The folder the note in the box belongs to, so a rename cannot misfile it. */
let noteItemName = "";

function $(id) {
    return document.getElementById(id);
}

// --- storage helpers -------------------------------------------------------

function readJson(store, key, fallback) {
    try {
        const raw = store.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function writeJson(store, key, value) {
    try {
        store.setItem(key, JSON.stringify(value));
    } catch {
        /* private mode / full quota: numbering restarts, nothing breaks */
    }
}

function takeNumber(itemName) {
    const counters = readJson(sessionStorage, COUNTER_KEY, {});
    const { n, counters: updated } = nextNumber(counters, itemName);
    writeJson(sessionStorage, COUNTER_KEY, updated);
    return n;
}

/** Notes live in sessionStorage per item, so reopening one today brings it back. */
function rememberNote(itemName, text) {
    if (!itemName) return;
    const notes = readJson(sessionStorage, NOTES_KEY, {});
    if (text) notes[itemName] = text;
    else delete notes[itemName];
    writeJson(sessionStorage, NOTES_KEY, notes);
}

function recallNote(itemName) {
    const notes = readJson(sessionStorage, NOTES_KEY, {});
    const v = itemName ? notes[itemName] : "";
    return typeof v === "string" ? v : "";
}

// --- rendering -------------------------------------------------------------

function setState(next) {
    state = next;
    render();
}

function render() {
    const signedIn = !!currentAccount();
    el.signinBox.hidden = signedIn;
    el.workBox.hidden = !signedIn;
    el.signoutLink.hidden = !signedIn;
    el.who.textContent = signedIn
        ? currentAccount().username || currentAccount().name || ""
        : "";

    el.cleaned.hidden = !state.itemName || state.itemName === el.itemInput.value;
    el.cleaned.textContent = state.itemName
        ? `Folder: ${config.basePath}/${state.itemName}/`
        : "";

    const ready = !!state.itemName;
    el.snapLabel.classList.toggle("disabled", !ready);
    el.galleryLabel.classList.toggle("disabled", !ready);
    el.snapInput.disabled = !ready;
    el.galleryInput.disabled = !ready;
    el.hint.hidden = ready;
    el.noteStatus.textContent = noteStatusText(state.note, state.online);

    el.progress.textContent = progressLine(state);
    renderStrip();
    renderOffline();
}

function renderOffline() {
    el.offline.hidden = state.online;
}

function renderStrip() {
    el.strip.replaceChildren();
    for (const p of state.photos) {
        const card = document.createElement("li");
        card.className = `shot shot-${p.status}`;

        const img = document.createElement("img");
        const held = blobs.get(p.id);
        if (held) img.src = held.url;
        img.alt = p.name;
        card.append(img);

        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = badgeText(p);
        card.append(badge);

        // the x: no confirmation, straight to OneDrive. 44 px touch target.
        const x = document.createElement("button");
        x.type = "button";
        x.className = "kill";
        x.textContent = "×";
        x.setAttribute("aria-label", `Delete ${p.name}`);
        x.addEventListener("click", () => removePhoto(p.id));
        card.append(x);

        const label = document.createElement("span");
        label.className = "shot-name";
        label.textContent = p.name;
        card.append(label);

        if (p.status === "failed") {
            const retry = document.createElement("button");
            retry.type = "button";
            retry.className = "retry";
            retry.textContent = "Retry";
            retry.addEventListener("click", () => {
                setState(reduce(state, { type: "progress", id: p.id, progress: 0 }));
                enqueue(p.id, true);
            });
            card.append(retry);
        }
        if (p.error) card.title = p.error;
        el.strip.append(card);
    }
}

function badgeText(p) {
    switch (p.status) {
        case "done":
            return "done";
        case "failed":
            return "failed";
        case "uploading":
            return `${Math.round(p.progress * 100)}%`;
        case "deleting":
            return "deleting";
        case "delete-failed":
            return "delete failed";
        default:
            return "waiting";
    }
}

function say(message, kind = "info") {
    el.message.textContent = message || "";
    el.message.className = `message ${kind}`;
    el.message.hidden = !message;
}

// --- photo intake ----------------------------------------------------------

function onItemNameChanged() {
    const cleaned = cleanItemName(el.itemInput.value);
    if (cleaned !== state.itemName) {
        setState(reduce(state, { type: "setItem", itemName: cleaned }));
        adoptNoteFor(cleaned);
    } else {
        render();
    }
}

/**
 * Keep the note box pointing at the right folder.
 * - reopening an item this session already has a note for: bring the text back;
 * - still typing the name with a note already written: the text follows along,
 *   unsaved, so it lands in the folder he ends up with.
 */
function adoptNoteFor(itemName) {
    noteItemName = itemName;
    if (!itemName) return;
    const stored = recallNote(itemName);
    const text = stored || state.note.text;
    if (el.note.value !== text) el.note.value = text;
    setState(reduce(state, { type: "noteReset", text }));
    if (text) rememberNote(itemName, text);
}

function acceptFiles(fileList) {
    const item = state.itemName;
    if (!item) {
        say("Type an item name first.", "warn");
        return;
    }
    let next = state;
    for (const file of fileList) {
        const n = takeNumber(item);
        const name = buildFileName(item, n, photoExtension(file.name, file.type));
        const id = `${item}#${n}#${Date.now()}#${Math.random().toString(36).slice(2, 8)}`;
        blobs.set(id, { file, url: URL.createObjectURL(file), itemName: item });
        next = reduce(next, { type: "add", id, name, n });
        queue.push(id);
    }
    setState(next);
    runQueue();
}

function enqueue(id, front = false) {
    if (front) queue.unshift(id);
    else queue.push(id);
    runQueue();
}

// --- deleting a photo ------------------------------------------------------

/**
 * The x on a thumbnail. No "are you sure": the card goes at once and the
 * DELETE follows. If Graph says no, the card comes back marked so, with the x
 * still there to try again. OneDrive keeps the file in its recycle bin either
 * way, so nothing here is truly final.
 */
async function removePhoto(id) {
    const photo = photoById(id);
    if (!photo || photo.status === "deleting") return;

    // never let it upload (again) once he has struck it out
    const at = queue.indexOf(id);
    if (at >= 0) queue.splice(at, 1);

    const controller = controllers.get(id);
    if (controller) {
        // mid-upload: abort the PUT. A half-written upload session expires on
        // its own and leaves no file, so there is nothing to delete.
        controller.abort();
        controllers.delete(id);
    }

    if (!photo.driveItemId) {
        // queued, failed, or just cancelled: nothing of it reached OneDrive.
        // The one odd case is an upload that finished without handing back an
        // id; say so rather than pretend the file is gone.
        if (photo.status === "done") {
            say(
                `${photo.name} is off this page, but OneDrive gave no id for it - delete it there if it matters.`,
                "warn"
            );
        }
        forgetPhoto(id);
        return;
    }

    setState(reduce(state, { type: "deleting", id }));
    try {
        const token = await getAccessToken();
        await deleteDriveItem({
            accessToken: token,
            itemId: photo.driveItemId,
            graphRoot: config.graphRoot,
        });
        forgetPhoto(id);
    } catch (e) {
        const status = typeof e?.status === "number" ? e.status : 0;
        setState(reduce(state, { type: "deleteFailed", id, error: describe(e, status) }));
        say(`${photo.name}: could not delete - ${describe(e, status)}`, "warn");
    }
}

/** Drop a photo from the strip and free its preview. */
function forgetPhoto(id) {
    const held = blobs.get(id);
    if (held) {
        URL.revokeObjectURL(held.url);
        blobs.delete(id);
    }
    controllers.delete(id);
    setState(reduce(state, { type: "remove", id }));
}

// --- the note --------------------------------------------------------------

function onNoteInput() {
    const text = el.note.value;
    setState(reduce(state, { type: "noteText", text }));
    rememberNote(noteItemName || state.itemName, text);
    noteSaver.schedule(() => {
        saveNote().catch(() => {});
    });
}

/**
 * Send the note, if there is anything to send. Empty text deletes the note.txt
 * this session uploaded; empty text with nothing uploaded does nothing at all.
 */
async function saveNote() {
    const item = state.itemName;
    if (!noteNeedsSave(state)) return;
    const text = state.note.text;
    const isEmpty = text.trim() === "";

    setState(reduce(state, { type: "noteSaving" }));
    try {
        const token = await getAccessToken();
        if (isEmpty) {
            if (state.note.driveItemId) {
                await deleteDriveItem({
                    accessToken: token,
                    itemId: state.note.driveItemId,
                    graphRoot: config.graphRoot,
                });
            }
            if (state.itemName !== item) return; // he moved on mid-flight
            setState(reduce(state, { type: "noteSaved", text: "", uploaded: false }));
            return;
        }
        const driveItem = await uploadTextFile({
            accessToken: token,
            basePath: config.basePath,
            itemName: item,
            fileName: config.noteFileName,
            text,
            graphRoot: config.graphRoot,
        });
        if (state.itemName !== item) return;
        setState(
            reduce(state, {
                type: "noteSaved",
                text,
                uploaded: true,
                driveItemId: driveItem && driveItem.id ? driveItem.id : undefined,
            })
        );
    } catch (e) {
        const status = typeof e?.status === "number" ? e.status : 0;
        setState(reduce(state, { type: "noteFailed", error: describe(e, status) }));
    }
}

/** Run a waiting note save now, e.g. on DONE or when the page hides. */
function flushNote() {
    noteSaver.cancel();
    return saveNote().catch(() => {});
}

// --- the upload queue ------------------------------------------------------

async function runQueue() {
    if (queueRunning) return;
    queueRunning = true;
    try {
        while (queue.length > 0) {
            const id = queue.shift();
            // eslint-disable-next-line no-await-in-loop
            await uploadOne(id);
        }
    } finally {
        queueRunning = false;
    }
}

function photoById(id) {
    return state.photos.find((p) => p.id === id);
}

async function uploadOne(id) {
    const held = blobs.get(id);
    const photo = photoById(id);
    if (!held || !photo || photo.status === "done") return;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        if (!navigator.onLine) {
            setState(reduce(state, { type: "online", online: false }));
            setState(
                reduce(state, {
                    type: "fail",
                    id,
                    error: "no connection - press Retry when you are back online",
                })
            );
            return;
        }
        const wait = retryDelayMs(attempt);
        // eslint-disable-next-line no-await-in-loop
        if (wait > 0) await sleep(wait);

        setState(reduce(state, { type: "start", id }));
        const controller = new AbortController();
        controllers.set(id, controller);
        try {
            // eslint-disable-next-line no-await-in-loop
            const token = await getAccessToken();
            // eslint-disable-next-line no-await-in-loop
            let shown = 0;
            const driveItem = await uploadPhoto({
                accessToken: token,
                basePath: config.basePath,
                itemName: held.itemName,
                fileName: photo.name,
                file: held.file,
                graphRoot: config.graphRoot,
                signal: controller.signal,
                onProgress: (fraction) => {
                    // repaint at most every 5% -- the strip is rebuilt on each render
                    if (fraction - shown < 0.05 && fraction < 1) return;
                    shown = fraction;
                    setState(reduce(state, { type: "progress", id, progress: fraction }));
                },
            });
            controllers.delete(id);
            // the last range's answer is the created driveItem; its id is what
            // a delete needs later.
            setState(
                reduce(state, {
                    type: "done",
                    id,
                    driveItemId: driveItem && driveItem.id ? driveItem.id : undefined,
                })
            );
            setState(reduce(state, { type: "online", online: true }));
            say("");
            return;
        } catch (e) {
            controllers.delete(id);
            // he pressed the x while this was in flight: the photo is already
            // gone from the list, and an abandoned upload session leaves no file.
            if (e && e.cancelled) return;
            const status = typeof e?.status === "number" ? e.status : 0;
            if (status === 0) setState(reduce(state, { type: "online", online: navigator.onLine }));
            if (!shouldRetry(attempt, status)) {
                setState(reduce(state, { type: "fail", id, error: describe(e, status) }));
                say(`${photo.name}: ${describe(e, status)}`, "warn");
                return;
            }
        }
    }
    setState(reduce(state, { type: "fail", id, error: "gave up after 3 tries" }));
}

function describe(e, status) {
    if (status === 0) return "network problem";
    if (status === 401 || status === 403) return "sign-in expired - sign in again";
    if (status === 507) return "OneDrive is full";
    return (e && e.message) || `error ${status}`;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// --- wiring ----------------------------------------------------------------

async function nextItem() {
    await flushNote(); // the note he just typed belongs to the item he is leaving
    for (const held of blobs.values()) URL.revokeObjectURL(held.url);
    blobs.clear();
    controllers.clear();
    queue.length = 0;
    el.itemInput.value = "";
    el.note.value = "";
    noteItemName = "";
    setState(reduce(state, { type: "reset", itemName: "", note: "" }));
    el.itemInput.focus();
}

function retryAllFailed() {
    for (const p of state.photos) {
        if (p.status === "failed") enqueue(p.id);
    }
    if (state.note.status === "failed") saveNote().catch(() => {});
}

async function main() {
    Object.assign(el, {
        signinBox: $("signin-box"),
        signinBtn: $("signin"),
        signoutLink: $("signout"),
        who: $("who"),
        workBox: $("work"),
        itemInput: $("item-name"),
        cleaned: $("cleaned"),
        snapInput: $("snap-input"),
        snapLabel: $("snap-label"),
        galleryInput: $("gallery-input"),
        galleryLabel: $("gallery-label"),
        hint: $("hint"),
        strip: $("strip"),
        progress: $("progress"),
        nextBtn: $("next-item"),
        offline: $("offline"),
        message: $("message"),
        note: $("note"),
        noteStatus: $("note-status"),
        version: $("version"),
    });

    el.version.textContent = VERSION;
    state = reduce(initialState(""), { type: "online", online: navigator.onLine });
    render();

    el.itemInput.addEventListener("input", onItemNameChanged);
    el.note.addEventListener("input", onNoteInput);
    el.note.addEventListener("blur", () => flushNote());
    el.snapInput.addEventListener("change", (e) => {
        acceptFiles(e.target.files);
        e.target.value = "";
    });
    el.galleryInput.addEventListener("change", (e) => {
        acceptFiles(e.target.files);
        e.target.value = "";
    });
    el.nextBtn.addEventListener("click", () => {
        nextItem().catch(() => {});
    });
    el.signinBtn.addEventListener("click", () => signIn().catch((e) => say(String(e), "warn")));
    el.signoutLink.addEventListener("click", (e) => {
        e.preventDefault();
        signOut().catch((err) => say(String(err), "warn"));
    });

    // Leaving the page: get the note out before it can be lost.
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flushNote();
    });

    window.addEventListener("online", () => {
        setState(reduce(state, { type: "online", online: true }));
        say("Back online - picking up where we left off.");
        retryAllFailed();
    });
    window.addEventListener("offline", () => {
        setState(reduce(state, { type: "online", online: false }));
    });
    window.addEventListener("beforeunload", (e) => {
        const unfinished =
            state.photos.some((p) => p.status !== "done") || noteNeedsSave(state);
        if (unfinished) {
            e.preventDefault();
            e.returnValue = "";
        }
    });

    if (clientIdMissing()) {
        say(
            "This app has no client id yet. Follow docs/SETUP.md step 1 and paste it into config.js.",
            "warn"
        );
        el.signinBtn.disabled = true;
        return;
    }

    try {
        await initAuth();
    } catch (e) {
        say(`Sign-in could not start: ${e.message}`, "warn");
    }
    render();
}

main();
