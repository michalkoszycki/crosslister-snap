// app.js -- the screen. All the thinking lives in core.js; the network calls
// live in graph.js; sign-in lives in auth.js. This file only wires them to
// buttons and paints the result.

import { config } from "./config.js";
import {
    addRecent,
    buildFileName,
    cleanItemName,
    initialState,
    MAX_ATTEMPTS,
    nextNumber,
    photoExtension,
    progressLine,
    reduce,
    retryDelayMs,
    shouldRetry,
} from "./core.js";
import { uploadPhoto } from "./graph.js";
import {
    clientIdMissing,
    currentAccount,
    getAccessToken,
    initAuth,
    signIn,
    signOut,
} from "./auth.js";

const COUNTER_KEY = "snap.counters";
const RECENTS_KEY = "snap.recents";

/** @type {import("./core.js").SnapState} */
let state = initialState("");

/** id -> { file: File, url: string } -- the bytes never leave memory until done. */
const blobs = new Map();

let queueRunning = false;
const queue = [];

const el = {};

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

function rememberItem(itemName) {
    const recents = addRecent(readJson(localStorage, RECENTS_KEY, []), itemName);
    writeJson(localStorage, RECENTS_KEY, recents);
    renderRecents();
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
        badge.textContent =
            p.status === "done"
                ? "done"
                : p.status === "failed"
                  ? "failed"
                  : p.status === "uploading"
                    ? `${Math.round(p.progress * 100)}%`
                    : "waiting";
        card.append(badge);

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
            if (p.error) card.title = p.error;
        }
        el.strip.append(card);
    }
}

function renderRecents() {
    const recents = readJson(localStorage, RECENTS_KEY, []);
    el.recents.replaceChildren();
    el.recentsBox.hidden = recents.length === 0;
    for (const name of recents) {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.className = "recent";
        b.textContent = name;
        b.addEventListener("click", () => {
            el.itemInput.value = name;
            onItemNameChanged();
        });
        li.append(b);
        el.recents.append(li);
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
    } else {
        render();
    }
}

function acceptFiles(fileList) {
    const item = state.itemName;
    if (!item) {
        say("Type an item name first.", "warn");
        return;
    }
    rememberItem(item);
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
        try {
            // eslint-disable-next-line no-await-in-loop
            const token = await getAccessToken();
            // eslint-disable-next-line no-await-in-loop
            let shown = 0;
            await uploadPhoto({
                accessToken: token,
                basePath: config.basePath,
                itemName: held.itemName,
                fileName: photo.name,
                file: held.file,
                graphRoot: config.graphRoot,
                onProgress: (fraction) => {
                    // repaint at most every 5% -- the strip is rebuilt on each render
                    if (fraction - shown < 0.05 && fraction < 1) return;
                    shown = fraction;
                    setState(reduce(state, { type: "progress", id, progress: fraction }));
                },
            });
            setState(reduce(state, { type: "done", id }));
            setState(reduce(state, { type: "online", online: true }));
            say("");
            return;
        } catch (e) {
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

function nextItem() {
    for (const held of blobs.values()) URL.revokeObjectURL(held.url);
    blobs.clear();
    queue.length = 0;
    el.itemInput.value = "";
    setState(reduce(state, { type: "reset", itemName: "" }));
    el.itemInput.focus();
}

function retryAllFailed() {
    for (const p of state.photos) {
        if (p.status === "failed") enqueue(p.id);
    }
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
        recents: $("recents"),
        recentsBox: $("recents-box"),
        nextBtn: $("next-item"),
        offline: $("offline"),
        message: $("message"),
    });

    state = reduce(initialState(""), { type: "online", online: navigator.onLine });
    renderRecents();
    render();

    el.itemInput.addEventListener("input", onItemNameChanged);
    el.snapInput.addEventListener("change", (e) => {
        acceptFiles(e.target.files);
        e.target.value = "";
    });
    el.galleryInput.addEventListener("change", (e) => {
        acceptFiles(e.target.files);
        e.target.value = "";
    });
    el.nextBtn.addEventListener("click", nextItem);
    el.signinBtn.addEventListener("click", () => signIn().catch((e) => say(String(e), "warn")));
    el.signoutLink.addEventListener("click", (e) => {
        e.preventDefault();
        signOut().catch((err) => say(String(err), "warn"));
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
        const unfinished = state.photos.some((p) => p.status !== "done");
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
