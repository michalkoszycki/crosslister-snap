// app.js -- the screen. All the thinking lives in core.js and queue.js; the
// calls to the PC live in pc.js; shrinking a photo lives in shrink.js. This
// file only wires them to buttons, runs the upload queue's requests, and
// paints the result.

import { VERSION } from "./version.js?v=1.3.0";
import {
    anyActive,
    bannerText,
    buildFileName,
    checkSettings,
    cleanItemName,
    doneButton,
    highestNumber,
    initialState,
    isActive,
    jobRequest,
    leaveWarning,
    nextNumber,
    noteStatusText,
    photosLocked,
    POLL_MS,
    progressLine,
    raiseCount,
    reduce,
    savedItem,
    venueButton,
    venueLine,
    VENUES,
} from "./core.js?v=1.3.0";
import { badgeText, NOTE_DEBOUNCE_MS, nextTask, noteDirty, retryDelayMs } from "./queue.js?v=1.3.0";
import {
    checkPc,
    createItem,
    deletePhoto,
    getItem,
    getJob,
    PcError,
    postJob,
    putNote,
    putPhoto,
} from "./pc.js?v=1.3.0";
import { shrinkPhoto } from "./shrink.js?v=1.3.0";

const COUNTER_KEY = "snap.counters";
const PC_KEY = "snap.pc";
const KEY_KEY = "snap.key";
const ITEM_KEY = "snap.item";

/** @type {import("./core.js").SnapState} */
let state = initialState("");

/** id -> { file: File, url: string } -- the pictures taken on this page, until DONE. */
const blobs = new Map();

/** venue -> the timer of its next status poll */
const polls = new Map();

/** Bumped on DONE, so a late answer for the previous item is dropped. */
let generation = 0;

/** The upload queue: one request at a time (queue.js decides which). */
let pumping = false;
let resumeTimer = null;
let noteTimer = null;

/** Resolved on every state change: how an async step waits for the queue. */
const waiters = [];

/** A saved item is being read back from the PC: no snapping until it is. */
let restoring = false;
/** The saved item could not be read back: leave it in storage until a new item starts. */
let keepSaved = false;
let lastSaved = null;

const el = {};

function $(id) {
    return document.getElementById(id);
}

// --- storage helpers ---------------------------------------------------------
// Every read and write may throw (private mode, blocked site data, a full
// quota), and in some browsers so does merely touching `localStorage`, so the
// store is looked up by name inside the try.

function readText(store, key) {
    try {
        return globalThis[store].getItem(key) || "";
    } catch {
        return "";
    }
}

function writeText(store, key, value) {
    try {
        globalThis[store].setItem(key, value);
    } catch {
        /* nothing is remembered; the page still works for this visit */
    }
}

function removeText(store, key) {
    try {
        globalThis[store].removeItem(key);
    } catch {
        /* nothing was remembered */
    }
}

function readJson(store, key, fallback) {
    try {
        const raw = readText(store, key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function writeJson(store, key, value) {
    writeText(store, key, JSON.stringify(value));
}

function takeNumber(itemName) {
    const counters = readJson("sessionStorage", COUNTER_KEY, {});
    const { n, counters: updated } = nextNumber(counters, itemName);
    writeJson("sessionStorage", COUNTER_KEY, updated);
    return n;
}

/** After the PC told us its photo numbers: never hand one of them out again. */
function syncCounter() {
    const counters = readJson("sessionStorage", COUNTER_KEY, {});
    writeJson("sessionStorage", COUNTER_KEY, raiseCount(counters, state.itemName, highestNumber(state)));
}

/** The item id and the AI marks, so a reload can read the item back from the PC. */
function persist() {
    if (restoring || keepSaved) return;
    const saved = savedItem(state);
    const text = saved ? JSON.stringify(saved) : "";
    if (text === lastSaved) return;
    lastSaved = text;
    if (saved) writeText("localStorage", ITEM_KEY, text);
    else removeText("localStorage", ITEM_KEY);
}

/** The saved PC address and key, checked; null when either is missing or wrong. */
function settings() {
    const s = checkSettings(readText("localStorage", PC_KEY), readText("localStorage", KEY_KEY));
    return s.ok ? { pc: s.pc, key: s.key } : null;
}

// --- rendering -------------------------------------------------------------

function setState(next) {
    state = next;
    render();
    persist();
    for (const wake of waiters.splice(0)) wake();
}

function changed() {
    return new Promise((resolve) => waiters.push(resolve));
}

function render() {
    el.cleaned.hidden = !state.itemName || state.itemName === el.itemInput.value;
    el.cleaned.textContent = state.itemName ? `Item: ${state.itemName}` : "";
    // the item's folder on the PC is named once, with the first photo
    el.itemInput.readOnly = restoring || !!state.itemId || state.photos.length > 0;

    const locked = photosLocked(state);
    const ready = !!state.itemName && !locked && !restoring;
    el.snapLabel.classList.toggle("disabled", !ready);
    el.galleryLabel.classList.toggle("disabled", !ready);
    el.snapInput.disabled = !ready;
    el.galleryInput.disabled = !ready;
    el.hint.hidden = ready;
    if (restoring) el.hint.textContent = "Reading this item back from the PC...";
    else if (locked) el.hint.textContent = "These photos went with the listing. DONE starts the next item.";
    else el.hint.textContent = "Type the item name to start snapping.";

    el.noteStatus.textContent = noteStatusText(state);
    el.progress.textContent = progressLine(state);
    renderStrip(locked);
    renderVenues();

    const done = doneButton(state);
    el.nextBtn.disabled = !done.enabled;
    el.doneHint.textContent = done.hint;
    el.doneHint.hidden = !done.hint;

    const banner = bannerText(state);
    el.offline.textContent = banner;
    el.offline.hidden = !banner;
}

function renderVenues() {
    const ok = !!settings();
    let hint = "";
    for (const venue of VENUES) {
        const button = venueButton(state, venue, ok);
        el[`${venue}Btn`].disabled = !button.enabled;
        hint ||= button.hint;

        const line = venueLine(state.jobs[venue]);
        const status = el[`${venue}Status`];
        status.textContent = line.text;
        status.className = `venue-status ${line.kind}`;
        status.hidden = !line.text;
        const link = el[`${venue}Link`];
        link.hidden = !line.link;
        link.textContent = line.link;
        if (line.link) link.href = line.link;
    }
    el.venueHint.textContent = hint;
    el.venueHint.hidden = !hint;
}

function renderStrip(locked) {
    el.strip.replaceChildren();
    for (const p of state.photos) {
        const card = document.createElement("li");
        card.className = p.ai ? "shot shot-ai" : "shot";

        const held = blobs.get(p.id);
        if (held) {
            const img = document.createElement("img");
            img.src = held.url;
            img.alt = p.name;
            card.append(img);
        } else {
            // read back from the PC after a reload: the picture itself is there, not here
            const there = document.createElement("span");
            there.className = "shot-remote";
            there.textContent = "on the PC";
            card.append(there);
        }

        // waiting / sent / failed, top left; a failed one is tapped to try again
        const word = badgeText(p);
        if (word === "failed") {
            const retry = document.createElement("button");
            retry.type = "button";
            retry.className = "badge failed";
            retry.textContent = "failed";
            retry.title = p.error;
            retry.setAttribute("aria-label", `${p.name} did not reach the PC (${p.error}); try again`);
            retry.addEventListener("click", () => {
                setState(reduce(state, { type: "retry", id: p.id }));
                pump();
            });
            card.append(retry);
        } else {
            const badge = document.createElement("span");
            badge.className = `badge ${word}`;
            badge.textContent = word;
            card.append(badge);
        }

        if (!locked) {
            // the x: no confirmation; the photo leaves the page, and the PC too
            const x = document.createElement("button");
            x.type = "button";
            x.className = "kill";
            x.textContent = "×";
            x.setAttribute("aria-label", `Delete ${p.name}`);
            x.addEventListener("click", () => removePhoto(p.id));
            card.append(x);
        }

        // the AI mark, bottom right of the photo: off by default, filled when on
        const ai = document.createElement("button");
        ai.type = "button";
        ai.className = p.ai ? "ai-mark on" : "ai-mark";
        ai.textContent = "AI";
        ai.disabled = locked;
        ai.setAttribute("aria-pressed", p.ai ? "true" : "false");
        ai.setAttribute("aria-label", `Send ${p.name} to the AI`);
        ai.addEventListener("click", () => setState(reduce(state, { type: "toggleAi", id: p.id })));
        card.append(ai);

        const label = document.createElement("span");
        label.className = "shot-name";
        label.textContent = p.name;
        card.append(label);

        el.strip.append(card);
    }
}

function say(message, kind = "info") {
    el.message.textContent = message || "";
    el.message.className = `message ${kind}`;
    el.message.hidden = !message;
}

// --- photos ----------------------------------------------------------------

function onItemNameChanged() {
    if (el.itemInput.readOnly) return;
    const cleaned = cleanItemName(el.itemInput.value);
    if (cleaned !== state.itemName) setState(reduce(state, { type: "setItem", itemName: cleaned }));
    else render();
}

function acceptFiles(fileList) {
    const item = state.itemName;
    if (!item || restoring) {
        say("Type an item name first.", "warn");
        return;
    }
    keepSaved = false; // a new item starts: it is the one to remember now
    let next = state;
    for (const file of fileList) {
        const n = takeNumber(item);
        const id = `${item}#${n}#${Date.now()}#${Math.random().toString(36).slice(2, 8)}`;
        blobs.set(id, { file, url: URL.createObjectURL(file) });
        next = reduce(next, { type: "add", id, name: buildFileName(item, n), n });
    }
    setState(next);
    pump();
}

/** The x on a thumbnail: off the page, and off the PC when it may be there. */
function removePhoto(id) {
    const held = blobs.get(id);
    if (held) {
        URL.revokeObjectURL(held.url);
        blobs.delete(id);
    }
    setState(reduce(state, { type: "remove", id }));
    pump();
}

// --- the upload queue --------------------------------------------------------

async function runTask(pc, task) {
    switch (task.kind) {
        case "item":
            return createItem(pc, task.name);
        case "photo": {
            const held = blobs.get(task.id);
            if (!held) throw new Error("the photo is no longer on this page");
            // shrunk right before it goes: one decoded photo in memory at a time
            return putPhoto(pc, state.itemId, task.n, await shrinkPhoto(held.file));
        }
        case "delete":
            return deletePhoto(pc, state.itemId, task.n);
        case "note":
            return putNote(pc, state.itemId, task.text);
        default:
            throw new Error(`unknown task ${task.kind}`);
    }
}

/** Send what queue.js says is next, one request at a time, until nothing is. */
async function pump() {
    if (pumping) return;
    pumping = true;
    try {
        for (;;) {
            const pc = settings();
            const task = pc ? nextTask(state) : null;
            if (!task) return;
            const mine = generation;
            setState(reduce(state, { type: "taskStart", task }));
            let answer = null;
            let failure = null;
            try {
                answer = await runTask(pc, task);
            } catch (e) {
                failure = e;
            }
            if (mine !== generation) continue; // DONE was pressed meanwhile
            if (failure) {
                // PcError carries the HTTP status (0: no answer); anything else
                // (a photo that would not shrink) is this photo's own failure
                const status = failure instanceof PcError ? failure.status : -1;
                const error = failure.message || "not sent";
                setState(reduce(state, { type: "taskFailed", task, status, error }));
                if (state.stalled) {
                    scheduleResume();
                    return;
                }
            } else {
                setState(reduce(state, { type: "taskDone", task, answer }));
                if (task.kind === "item") syncCounter();
            }
        }
    } finally {
        pumping = false;
    }
}

/** The PC did not answer: try again after a growing pause (or when back online). */
function scheduleResume() {
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
        resumeTimer = null;
        setState(reduce(state, { type: "resume" }));
        pump();
    }, retryDelayMs(state.failures));
}

// --- the note ----------------------------------------------------------------

function onNoteInput() {
    setState(reduce(state, { type: "noteText", text: el.note.value }));
    clearTimeout(noteTimer);
    noteTimer = setTimeout(noteDue, NOTE_DEBOUNCE_MS);
}

/** He stopped typing (or left the box, or pressed a button): send the note. */
function noteDue() {
    clearTimeout(noteTimer);
    noteTimer = null;
    if (!noteDirty(state) || state.note.due) return;
    setState(reduce(state, { type: "noteDue" }));
    pump();
}

/** The note on the PC before a job reads it, or before DONE clears the page. */
async function noteReady() {
    noteDue();
    while (noteDirty(state)) {
        if (state.stalled || !state.online || !settings()) return false;
        // eslint-disable-next-line no-await-in-loop
        await changed();
    }
    return true;
}

// --- the two buttons -------------------------------------------------------

async function send(venue) {
    const pc = settings();
    if (!pc || !venueButton(state, venue, true).enabled) return;
    const mine = generation;
    const reuse = !!state.sku;
    setState(reduce(state, { type: "jobSending", venue, step: "sending" }));
    if (!reuse && !(await noteReady())) {
        if (mine !== generation) return;
        setState(
            reduce(state, { type: "jobRefused", venue, error: "the note has not reached the PC" })
        );
        return;
    }
    if (mine !== generation) return;
    const body = jobRequest({ venue, sku: state.sku, item: state.itemId, photos: state.photos });
    try {
        const answer = await postJob(pc, body);
        if (mine !== generation) return;
        setState(reduce(state, { type: "jobAccepted", venue, job: answer.job, ahead: answer.ahead }));
        schedulePoll(venue, mine);
    } catch (e) {
        if (mine !== generation) return;
        setState(reduce(state, { type: "jobRefused", venue, error: e.message }));
    }
}

function schedulePoll(venue, mine) {
    clearTimeout(polls.get(venue));
    polls.set(
        venue,
        setTimeout(() => {
            poll(venue, mine).catch(() => {});
        }, POLL_MS)
    );
}

async function poll(venue, mine) {
    const pc = settings();
    const jobId = state.jobs[venue].jobId;
    if (mine !== generation || !pc || !jobId) return;
    try {
        const status = await getJob(pc, jobId);
        if (mine !== generation) return;
        setState(reduce(state, { type: "jobStatus", venue, status }));
    } catch (e) {
        if (mine !== generation) return;
        if (e.status === 0) {
            // the phone or the PC is off the network for a moment; the job
            // itself is safe on the PC's disk, so keep asking
            setState(reduce(state, { type: "pollTrouble", venue, error: e.message }));
        } else {
            setState(
                reduce(state, {
                    type: "jobStatus",
                    venue,
                    status: { state: "failed", error: e.message },
                })
            );
        }
    }
    if (isActive(state.jobs[venue])) schedulePoll(venue, mine);
}

// --- settings --------------------------------------------------------------

function toggleSettings() {
    const open = el.settings.hidden;
    el.settings.hidden = !open;
    el.settingsToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
        el.pcAddress.value = readText("localStorage", PC_KEY);
        el.pcKey.value = readText("localStorage", KEY_KEY);
        el.settingsStatus.textContent = "";
    }
}

async function saveSettings() {
    const s = checkSettings(el.pcAddress.value, el.pcKey.value);
    if (!s.ok) {
        el.settingsStatus.textContent = s.error;
        return;
    }
    writeText("localStorage", PC_KEY, s.pc);
    writeText("localStorage", KEY_KEY, s.key);
    el.pcAddress.value = s.pc;
    render();
    if (!settings()) {
        el.settingsStatus.textContent =
            "Could not save on this phone (private mode?). The buttons need it saved.";
        return;
    }
    el.settingsStatus.textContent = "Saved. Checking the PC...";
    try {
        await checkPc(s);
        el.settingsStatus.textContent = "Saved. The PC answers and knows this key.";
    } catch (e) {
        el.settingsStatus.textContent = `Saved, but: ${e.message}.`;
    }
    // photos taken before the settings were right go now
    setState(reduce(state, { type: "resume" }));
    pump();
}

// --- a reload: the item back from the PC -----------------------------------------

async function restore() {
    const saved = readJson("localStorage", ITEM_KEY, null);
    if (!saved || typeof saved.itemId !== "string" || !saved.itemId) return;
    const itemName = typeof saved.itemName === "string" ? saved.itemName : "";
    const pc = settings();
    if (!pc || !itemName) {
        keepSaved = true; // read it back once Settings are right and the page is reloaded
        return;
    }
    restoring = true;
    el.itemInput.value = itemName;
    setState(reduce(state, { type: "setItem", itemName }));
    try {
        const answer = await getItem(pc, saved.itemId);
        restoring = false;
        const ai = Array.isArray(saved.ai) ? saved.ai : [];
        setState(reduce(state, { type: "recovered", itemName, itemId: saved.itemId, ai, answer }));
        el.note.value = state.note.text;
        syncCounter();
        for (const venue of VENUES) {
            if (isActive(state.jobs[venue])) schedulePoll(venue, generation);
        }
    } catch (e) {
        restoring = false;
        el.itemInput.value = "";
        if (e.status === 404) {
            say(`${itemName} is no longer on the PC.`, "warn");
            setState(reduce(state, { type: "reset" }));
        } else {
            // leave the saved item alone: a reload once the PC answers brings it back
            keepSaved = true;
            say(`Could not read ${itemName} back from the PC (${e.message}). Its photos are safe there; reload when the PC answers.`, "warn");
            setState(reduce(state, { type: "reset" }));
        }
    }
}

// --- wiring ----------------------------------------------------------------

async function nextItem() {
    if (!doneButton(state).enabled) return;
    if (state.itemId && !(await noteReady())) {
        say("The note has not reached the PC yet. DONE again once it has.", "warn");
        return;
    }
    generation += 1;
    for (const t of polls.values()) clearTimeout(t);
    polls.clear();
    clearTimeout(resumeTimer);
    clearTimeout(noteTimer);
    for (const held of blobs.values()) URL.revokeObjectURL(held.url);
    blobs.clear();
    el.itemInput.value = "";
    el.note.value = "";
    say("");
    keepSaved = false;
    setState(reduce(state, { type: "reset" }));
    el.itemInput.focus();
}

function main() {
    Object.assign(el, {
        settingsToggle: $("settings-toggle"),
        settings: $("settings"),
        pcAddress: $("pc-address"),
        pcKey: $("pc-key"),
        settingsSave: $("settings-save"),
        settingsStatus: $("settings-status"),
        itemInput: $("item-name"),
        cleaned: $("cleaned"),
        hint: $("hint"),
        snapInput: $("snap-input"),
        snapLabel: $("snap-label"),
        galleryInput: $("gallery-input"),
        galleryLabel: $("gallery-label"),
        progress: $("progress"),
        strip: $("strip"),
        note: $("note"),
        noteStatus: $("note-status"),
        ebayBtn: $("ebay-btn"),
        ebayStatus: $("ebay-status"),
        ebayLink: $("ebay-link"),
        craigslistBtn: $("craigslist-btn"),
        craigslistStatus: $("craigslist-status"),
        craigslistLink: $("craigslist-link"),
        venueHint: $("venue-hint"),
        doneHint: $("done-hint"),
        nextBtn: $("next-item"),
        offline: $("offline"),
        message: $("message"),
        version: $("version"),
    });

    el.version.textContent = VERSION;
    state = reduce(initialState(""), { type: "online", online: navigator.onLine });
    render();

    el.settingsToggle.addEventListener("click", toggleSettings);
    el.settingsSave.addEventListener("click", () => {
        saveSettings().catch(() => {});
    });
    el.itemInput.addEventListener("input", onItemNameChanged);
    el.note.addEventListener("input", onNoteInput);
    el.note.addEventListener("blur", noteDue);
    el.snapInput.addEventListener("change", (e) => {
        acceptFiles(e.target.files);
        e.target.value = "";
    });
    el.galleryInput.addEventListener("change", (e) => {
        acceptFiles(e.target.files);
        e.target.value = "";
    });
    for (const venue of VENUES) {
        el[`${venue}Btn`].addEventListener("click", () => {
            send(venue).catch(() => {});
        });
    }
    el.nextBtn.addEventListener("click", () => {
        nextItem().catch(() => {});
    });

    window.addEventListener("online", () => {
        setState(reduce(state, { type: "online", online: true }));
        pump();
    });
    window.addEventListener("offline", () =>
        setState(reduce(state, { type: "online", online: false }))
    );
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") noteDue();
    });
    window.addEventListener("beforeunload", (e) => {
        if (leaveWarning(state)) {
            e.preventDefault();
            e.returnValue = "";
        }
    });

    restore().catch(() => {});
}

main();
