// app.js -- the screen. All the thinking lives in core.js; the calls to the PC
// live in pc.js; shrinking a photo lives in shrink.js. This file only wires
// them to buttons and paints the result.

import { VERSION } from "./version.js?v=1.2.2";
import {
    anyActive,
    buildFileName,
    checkSettings,
    cleanItemName,
    doneButton,
    initialState,
    isActive,
    jobRequest,
    leaveWarning,
    nextNumber,
    noteStatusText,
    photosLocked,
    POLL_MS,
    progressLine,
    reduce,
    venueButton,
    venueLine,
    VENUES,
} from "./core.js?v=1.2.2";
import { buildJobForm, checkPc, getJob, postJob } from "./pc.js?v=1.2.2";
import { shrinkPhoto } from "./shrink.js?v=1.2.2";

const COUNTER_KEY = "snap.counters";
const PC_KEY = "snap.pc";
const KEY_KEY = "snap.key";

/** @type {import("./core.js").SnapState} */
let state = initialState("");

/** id -> { file: File, url: string } -- the photos live in memory until DONE. */
const blobs = new Map();

/** venue -> the timer of its next status poll */
const polls = new Map();

/** Bumped on DONE, so a late answer for the previous item is dropped. */
let generation = 0;

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

/** The saved PC address and key, checked; null when either is missing or wrong. */
function settings() {
    const s = checkSettings(readText("localStorage", PC_KEY), readText("localStorage", KEY_KEY));
    return s.ok ? { pc: s.pc, key: s.key } : null;
}

// --- rendering -------------------------------------------------------------

function setState(next) {
    state = next;
    render();
}

function render() {
    el.cleaned.hidden = !state.itemName || state.itemName === el.itemInput.value;
    el.cleaned.textContent = state.itemName ? `Item: ${state.itemName}` : "";

    const locked = photosLocked(state);
    const ready = !!state.itemName && !locked;
    el.snapLabel.classList.toggle("disabled", !ready);
    el.galleryLabel.classList.toggle("disabled", !ready);
    el.snapInput.disabled = !ready;
    el.galleryInput.disabled = !ready;
    el.hint.hidden = ready;
    el.hint.textContent = locked
        ? "These photos are sent. DONE starts the next item."
        : "Type the item name to start snapping.";

    el.noteStatus.textContent = noteStatusText(state.note);
    el.progress.textContent = progressLine(state);
    renderStrip(locked);
    renderVenues();

    const done = doneButton(state);
    el.nextBtn.disabled = !done.enabled;
    el.doneHint.textContent = done.hint;
    el.doneHint.hidden = !done.hint;

    el.offline.hidden = state.online;
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

        const img = document.createElement("img");
        const held = blobs.get(p.id);
        if (held) img.src = held.url;
        img.alt = p.name;
        card.append(img);

        if (!locked) {
            // the x: no confirmation, the photo just leaves the page. 44 px touch target.
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
    const cleaned = cleanItemName(el.itemInput.value);
    if (cleaned !== state.itemName) setState(reduce(state, { type: "setItem", itemName: cleaned }));
    else render();
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
        const id = `${item}#${n}#${Date.now()}#${Math.random().toString(36).slice(2, 8)}`;
        blobs.set(id, { file, url: URL.createObjectURL(file) });
        next = reduce(next, { type: "add", id, name: buildFileName(item, n), n });
    }
    setState(next);
}

/** The x on a thumbnail: the photo leaves the page. Nothing was sent yet. */
function removePhoto(id) {
    const held = blobs.get(id);
    if (held) {
        URL.revokeObjectURL(held.url);
        blobs.delete(id);
    }
    setState(reduce(state, { type: "remove", id }));
}

// --- the two buttons -------------------------------------------------------

async function send(venue) {
    const pc = settings();
    if (!pc || !venueButton(state, venue, true).enabled) return;
    const mine = generation;
    const req = jobRequest({
        venue,
        sku: state.sku,
        note: state.note.text,
        photos: state.photos,
    });

    const files = [];
    if (req.photoIds.length > 0) {
        setState(reduce(state, { type: "jobSending", venue, step: "getting the photos ready" }));
        for (const id of req.photoIds) {
            const photo = state.photos.find((p) => p.id === id);
            try {
                // one at a time: a phone has little memory for 24 decoded photos
                // eslint-disable-next-line no-await-in-loop
                files.push({ blob: await shrinkPhoto(blobs.get(id).file), name: photo.name });
            } catch (e) {
                if (mine !== generation) return;
                setState(
                    reduce(state, {
                        type: "jobRefused",
                        venue,
                        error: `${photo.name}: ${e.message || "could not read the photo"}`,
                    })
                );
                return;
            }
        }
    }
    const count = files.length;
    setState(
        reduce(state, {
            type: "jobSending",
            venue,
            step: count ? `sending ${count} photo${count === 1 ? "" : "s"}` : "sending",
        })
    );
    try {
        const answer = await postJob(pc, buildJobForm(req.fields, files));
        if (mine !== generation) return;
        setState(
            reduce(state, {
                type: "jobAccepted",
                venue,
                job: answer.job,
                ahead: answer.ahead,
                sentNote: req.sendsNote ? state.note.text.trim() : undefined,
            })
        );
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
}

// --- wiring ----------------------------------------------------------------

function nextItem() {
    if (anyActive(state)) return;
    generation += 1;
    for (const t of polls.values()) clearTimeout(t);
    polls.clear();
    for (const held of blobs.values()) URL.revokeObjectURL(held.url);
    blobs.clear();
    el.itemInput.value = "";
    el.note.value = "";
    say("");
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
    el.note.addEventListener("input", () =>
        setState(reduce(state, { type: "noteText", text: el.note.value }))
    );
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
    el.nextBtn.addEventListener("click", nextItem);

    window.addEventListener("online", () => setState(reduce(state, { type: "online", online: true })));
    window.addEventListener("offline", () =>
        setState(reduce(state, { type: "online", online: false }))
    );
    window.addEventListener("beforeunload", (e) => {
        if (leaveWarning(state)) {
            e.preventDefault();
            e.returnValue = "";
        }
    });
}

main();
