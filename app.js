// app.js -- the screen. All the thinking lives in core.js, queue.js and
// book.js; the calls to the PC live in pc.js; shrinking a photo lives in
// shrink.js and reading a barcode in scan.js. This file only wires them to
// buttons, runs the upload queue's requests, and paints the result.
//
// Two kinds of item, goods and books, each with its own screen (#work and
// #book) chosen by the switch at the top. The page keeps one item of each kind
// at once, in two independent states (`slots`): the switch only changes which
// one is on screen. So switching in the middle of an item asks nothing and
// loses nothing -- photos still waiting keep going to the PC (the one upload
// queue serves both, the shown item's requests first), and a job running for
// the hidden item keeps being polled, its link waiting when he switches back.

import { VERSION } from "./version.js?v=2.3.0";
import {
    anyActive,
    bannerText,
    bookForm,
    buildFileName,
    checkSettings,
    cleanItemName,
    customizeOf,
    doneButton,
    HEALTH_MS,
    highestNumber,
    initialState,
    isActive,
    jobRequest,
    leaveWarning,
    lookupKey,
    MODES,
    nextNote,
    nextNumber,
    noteStatusText,
    photosLocked,
    POLL_MS,
    PRICING,
    pricingOf,
    savedNotPosted,
    progressLine,
    raiseCount,
    reduce,
    savedItem,
    serverLine,
    SETTINGS_HINT,
    priceLine,
    titleLine,
    historyList,
    HISTORY_END,
    presentNote,
    recordKind,
    refreshed,
    remembered,
    walkNote,
    walkPosition,
    cancelButton,
    SEND_DELAY_MS,
    STOPPING_STEP,
    snapScrollTop,
    snapWord,
    itemIdFor,
    NAME_CHECK_MS,
    nameTakenHint,
    venueButton,
    venueIdleNote,
    venueLabel,
    venueLine,
    VENUES,
    INVENTORY_DEBOUNCE_MS,
    INVENTORY_SORTS,
    INVENTORY_STATUSES,
    INVENTORY_VENUES,
    actionJob,
    actionWord,
    cardLine,
    DERIVED,
    derivedFields,
    EDIT_FIELDS,
    editValues,
    endQuestion,
    inventoryCount,
    inventoryRows,
    jobRunning,
    patchBody,
    priceWord,
    rowBadges,
    rowHeading,
    rowPhotos,
    rowTitle,
    rowVenues,
    syncLine,
    venueActions,
    venueFacts,
    venueStatus,
} from "./core.js?v=2.3.0";
import { badgeText, NOTE_DEBOUNCE_MS, nextTask, noteDirty, retryDelayMs } from "./queue.js?v=2.3.0";
import {
    addVenue,
    cancelJob,
    checkPc,
    createItem,
    deletePhoto,
    getBook,
    getInventory,
    getItem,
    getJob,
    getPhoto,
    getRow,
    getRowPhoto,
    patchRow,
    PcError,
    postJob,
    putNote,
    putPhoto,
    searchBook,
} from "./pc.js?v=2.3.0";
import { shrinkPhoto } from "./shrink.js?v=2.3.0";
import {
    bookCard,
    bookPriceValue,
    bookSearch,
    CONDITIONS,
    FORMATS,
    ISBN_DEBOUNCE_MS,
    isbnKept,
    normalizeIsbn,
    priceNote,
    scanHint,
    SEARCH_DEBOUNCE_MS,
} from "./book.js?v=2.3.0";
import { canScan, readIsbn } from "./scan.js?v=2.3.0";

const COUNTER_KEY = "snap.counters";
const PC_KEY = "snap.pc";
const KEY_KEY = "snap.key";
const MODE_KEY = "snap.mode";
/** Where each kind of item is kept for a reload: the goods key is the one it always was. */
const SAVED_KEYS = { goods: "snap.item", book: "snap.book" };

/**
 * One item of each kind, both alive at once; `mode` is the one on screen.
 * @type {Record<"goods"|"book", import("./core.js").SnapState>}
 */
const slots = { goods: initialState(""), book: initialState("", "book") };
/** @type {"goods"|"book"} */
let mode = "goods";

/**
 * id -> { file, url, shrunk, ready } -- the pictures taken on this page, until NEXT.
 * `file` is the camera's original until the photo is shrunk, then null: only the
 * shrunk JPEG (`shrunk`) is kept, and `url` shows it. `ready` is the shrink in
 * progress, shared by the thumbnail and the upload.
 */
const blobs = new Map();

/** "<mode>:<venue>" -> the timer of its next status poll */
const polls = new Map();

/** Bumped on DONE, per kind, so a late answer for the previous item is dropped. */
const generation = { goods: 0, book: 0 };

/** The upload queue: one request at a time (queue.js decides which). */
let pumping = false;
const resumeTimers = { goods: null, book: null };
const noteTimers = { goods: null, book: null };

/** The ISBN box: its lookup waits for him to stop typing. */
let isbnTimer = null;
/** No ISBN's title, author and year: the name and the search wait for him to stop typing. */
let titleTimer = null;
/** The book's last scan: "" / "reading" (the barcode is being read) / "missed" (none found). */
let scan = "";

/**
 * customize, open or folded, per kind. Only the screen's business: it starts
 * folded on every load and every DONE; the values themselves live in the state.
 */
const customizeOpen = { goods: false, book: false };

/** The server check: what the PC last said (null: not asked yet), the next check, one at a time. */
let serverStatus = null;
let healthTimer = null;
let checking = false;

/**
 * Admin's screen state (only the screen's: nothing of it is stored). The filters
 * and the sort, the rows the PC last gave, and the row on screen with its cards.
 * `asked` and `shown` are bumped per query and per detail opened or left, so a
 * late answer for an older one is dropped.
 */
const admin = {
    inventoryOpen: false,
    venue: "",
    status: "",
    sort: INVENTORY_SORTS[0].key,
    rows: [],
    asked: 0,
    /** sku -> the 64 px tile its photo 1 goes into, while Show photos is on */
    tiles: new Map(),
    /** the list's object URLs, revoked when the list changes */
    thumbs: [],
    shown: 0,
    /** venue -> its card open (the venues the row is on, as it opens) or folded */
    folds: Object.fromEntries(VENUES.map((v) => [v, false])),
    /** venue -> its card's state (blankCard in the Admin section) */
    cards: Object.fromEntries(VENUES.map((v) => [v, blankCard()])),
    /** the row on screen, whole once the PC gave it; null on the list */
    row: null,
    /** the row button the detail was opened from, to come back to */
    from: null,
    /** a card changed the row (or a sync ended meanwhile): back asks for the list again */
    changed: false,
    /** the detail's photo number -> object URL, revoked when the detail closes */
    pictures: new Map(),
    /** the detail's photo number -> its 88 px tile */
    photoTiles: new Map(),
    /** the thumbnail the full-size view was opened from, focused again when it closes */
    opener: null,
};
/** The inventory's search box asks the PC once he stops typing. */
let searchTimer = null;

/** The sync bar: what is on its way, its job as last polled, what the PC refused, the next poll. */
const sync = { wait: "", job: null, note: null, timer: null };

/** Resolved on every state change: how an async step waits for the queue. */
const waiters = [];

/** A saved item is being read back from the PC: no snapping until it is. */
const restoring = { goods: false, book: false };
/** The saved item could not be read back: leave it in storage until a new item starts. */
const keepSaved = { goods: false, book: false };
const lastSaved = { goods: null, book: null };
/**
 * What each kind's screen shows: "" the item in hand, or the id of an item from
 * the history that back or forward brought up (kept current in its place there).
 */
const viewing = { goods: "", book: "" };
const HISTORY_KEY = "snap.history";
/** Where the walk is, as walkPosition counts: the items in hand until back is pressed. */
let cursor = 0;

const el = {};

function $(id) {
    return document.getElementById(id);
}

function other(m) {
    return m === "goods" ? "book" : "goods";
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

/**
 * The next photo number for an item. Never one the item already holds: a
 * book's photos can be taken before its ISBN names it, under a stand-in name,
 * so the count is first raised past what the strip has.
 * @param {string} itemName the counter's name
 * @param {import("./core.js").SnapState} s the item the photo joins
 */
function takeNumber(itemName, s) {
    const counters = raiseCount(readJson("sessionStorage", COUNTER_KEY, {}), itemName, highestNumber(s));
    const { n, counters: updated } = nextNumber(counters, itemName);
    writeJson("sessionStorage", COUNTER_KEY, updated);
    return n;
}

/** After the PC told us its photo numbers: never hand one of them out again. */
function syncCounter(m) {
    const s = slots[m];
    const counters = readJson("sessionStorage", COUNTER_KEY, {});
    writeJson("sessionStorage", COUNTER_KEY, raiseCount(counters, s.itemName, highestNumber(s)));
}

/** The item id and what only the phone knows, so a reload can read the item back from the PC. */
function persist(m) {
    if (restoring[m] || keepSaved[m]) return;
    const saved = savedItem(slots[m]);
    const text = saved ? JSON.stringify(saved) : "";
    if (text === lastSaved[m]) return;
    lastSaved[m] = text;
    // an item back brought up is kept current where it stands in the history;
    // the item in hand stays saved as it was left, for the walk to return to
    if (viewing[m]) {
        if (saved) writeJson("localStorage", HISTORY_KEY, refreshed(readHistory(), saved));
    } else if (saved) writeText("localStorage", SAVED_KEYS[m], text);
    else removeText("localStorage", SAVED_KEYS[m]);
}

/** The items NEXT left, oldest first: the walk back and forward goes through them. */
function readHistory() {
    return historyList(readJson("localStorage", HISTORY_KEY, []));
}

/** The item in hand of a kind, as saved for a reload (null: a fresh screen). */
function inHand(m) {
    return historyList([readJson("localStorage", SAVED_KEYS[m], null)])[0] || null;
}

/** The kind last chosen with the switch: the screen the items in hand come back on. */
function chosenMode() {
    return readText("localStorage", MODE_KEY) === "book" ? "book" : "goods";
}

/** The saved PC address and key, checked; null when either is missing or wrong. */
function settings() {
    const s = checkSettings(readText("localStorage", PC_KEY), readText("localStorage", KEY_KEY));
    return s.ok ? { pc: s.pc, key: s.key } : null;
}

// --- rendering -------------------------------------------------------------

function setState(m, next) {
    slots[m] = next;
    render();
    persist(m);
    for (const wake of waiters.splice(0)) wake();
}

function changed() {
    return new Promise((resolve) => waiters.push(resolve));
}

function render() {
    el.modeGoods.setAttribute("aria-pressed", mode === "goods" ? "true" : "false");
    el.modeBook.setAttribute("aria-pressed", mode === "book" ? "true" : "false");
    el.work.hidden = mode !== "goods";
    el.book.hidden = mode !== "book";

    renderGoods();
    renderBook();

    // both items talk to the same PC: the shown one's trouble first
    const banner = bannerText(slots[mode]) || bannerText(slots[other(mode)]);
    el.offline.textContent = banner;
    el.offline.hidden = !banner;
}

function renderGoods() {
    const state = slots.goods;
    el.cleaned.hidden = !state.itemName || state.itemName === el.itemInput.value;
    el.cleaned.textContent = state.itemName ? `Item: ${state.itemName}` : "";
    // the item's folder on the PC is named once, with the first photo
    el.itemInput.readOnly = restoring.goods || !!state.itemId || state.photos.length > 0;

    const locked = photosLocked(state);
    const taken = nameTakenHint(state);
    el.itemInput.classList.toggle("taken", !!taken);
    const ready = !!state.itemName && !locked && !restoring.goods && !taken;
    // the word only: the camera icon beside it in the label stays
    el.snapText.textContent = snapWord(state);
    el.snapLabel.classList.toggle("disabled", !ready);
    el.galleryLabel.classList.toggle("disabled", !ready);
    el.snapInput.disabled = !ready;
    el.galleryInput.disabled = !ready;
    el.hint.hidden = ready;
    if (restoring.goods) el.hint.textContent = "Reading this item back from the PC...";
    else if (locked) el.hint.textContent = "These photos went with the listing. NEXT starts the next item.";
    else if (taken) el.hint.textContent = taken;
    else el.hint.textContent = "Type the item name to start snapping.";

    el.noteStatus.textContent = noteStatusText(state);
    el.progress.textContent = progressLine(state);
    renderStrip("goods", el.strip, locked);
    renderCustomize("goods");

    const ok = !!settings();
    // the row's price, above both buttons: one job's answer serves the other too
    renderPriceLine(el.titleLine, titleLine(state));
    renderPriceLine(el.priceLine, priceLine(state));
    let hint = "";
    for (const venue of VENUES) {
        // painted first, then its hint taken: ||= alone would skip painting the second button
        const said = renderVenue(state, venue, ok, {
            btn: el[`${venue}Btn`],
            status: el[`${venue}Status`],
            cancel: el[`${venue}Cancel`],
            link: el[`${venue}Link`],
        });
        hint ||= said;
    }
    el.venueHint.textContent = hint;
    el.venueHint.hidden = !hint;

    renderNext(state, el.nextBtn, el.doneHint, el.nextNote);
}

/** NEXT, the line above it (why it waits) and the quiet one under it (a listing left posting). */
function renderNext(state, btn, hintNode, noteNode) {
    const done = doneButton(state);
    btn.disabled = !done.enabled;
    hintNode.textContent = done.hint;
    hintNode.hidden = !done.hint;
    const note = nextNote(state);
    noteNode.textContent = note;
    noteNode.hidden = !note;
}

function renderBook() {
    const state = slots.book;
    const { book } = state;
    const locked = photosLocked(state);
    const busy = restoring.book;
    const hasItem = !!state.itemId;

    // The ISBN button names the book, so it is there only while the ISBN may still
    // change, and only on a phone that can read the barcode: the picture is good for nothing else
    const scanReady = canScan() && !locked && !busy && !hasItem && scan !== "reading";
    el.bookScanLabel.classList.toggle("disabled", !scanReady);
    el.bookScanInput.disabled = !scanReady;
    const kept = isbnKept(book);
    const hint = scanHint({
        canScan: canScan(),
        scan,
        hasItem,
        locked,
        restoring: busy,
        manual: book.manual,
        kept: !!kept,
    });
    el.bookHint.textContent = hint;
    el.bookHint.hidden = !hint;
    el.bookIsbn.readOnly = busy || hasItem;
    // the ISBN kept after a miss stays in its box, looking set aside: a new one may still replace it
    el.bookIsbn.classList.toggle("kept", !!kept);

    // No ISBN: open or closed until the folder is named on the PC, like the ISBN --
    // except after an ISBN no catalogue knows: that ISBN goes on naming the folder,
    // the fields only describe the book, and No ISBN is the next step, lit up
    const sending = anyActive(state);
    el.bookNoIsbn.disabled = busy || locked || (hasItem && !book.isbnMiss);
    el.bookNoIsbn.classList.toggle("next", book.isbnMiss && !book.manual && !locked);
    el.bookNoIsbn.setAttribute("aria-expanded", book.manual ? "true" : "false");
    el.bookManual.hidden = !book.manual;
    el.bookIsbnKept.textContent = kept;
    el.bookIsbnKept.hidden = !kept;
    // the typed book may still be corrected (a typo) until it is being listed
    for (const node of [el.bookTitleInput, el.bookAuthor, el.bookYear]) node.readOnly = busy || sending;
    for (const { value, node } of el.formatChips) {
        node.setAttribute("aria-pressed", book.format === value ? "true" : "false");
        node.disabled = busy || sending;
    }

    const card = bookCard(book);
    el.bookFound.hidden = card.hidden;
    el.bookLookup.textContent = card.status;
    el.bookLookup.className = card.kind ? `book-lookup ${card.kind}` : "book-lookup";
    el.bookCardTitle.textContent = card.title;
    el.bookCardTitle.hidden = !card.title;
    el.bookAuthors.textContent = card.authors;
    el.bookAuthors.hidden = !card.authors;
    el.bookDetails.textContent = card.details;
    el.bookDetails.hidden = !card.details;
    el.bookMatch.textContent = card.note;
    el.bookMatch.hidden = !card.note;

    // the cover and more: any time until the listing goes (they wait for the ISBN if need be)
    const ready = !locked && !busy;
    el.bookSnapLabel.classList.toggle("disabled", !ready);
    el.bookGalleryLabel.classList.toggle("disabled", !ready);
    el.bookSnapInput.disabled = !ready;
    el.bookGalleryInput.disabled = !ready;
    el.bookProgress.textContent = progressLine(state);
    renderStrip("book", el.bookStrip, locked);

    // what the listing says stays put while it is being posted
    for (const { value, node } of el.chips) {
        node.setAttribute("aria-pressed", book.condition === value ? "true" : "false");
        node.disabled = sending;
    }
    el.bookPrice.readOnly = sending;
    const note = priceNote(book.lookup);
    el.bookPriceNote.textContent = note;
    el.bookPriceNote.hidden = !note;
    el.bookNoteStatus.textContent = noteStatusText(state);
    renderCustomize("book");

    // the price is typed on the page: above the button from the press, until the PC says its own
    renderPriceLine(el.bookTitleLine, titleLine(state));
    renderPriceLine(el.bookPriceLine, priceLine(state, bookPriceValue(book.price)));
    const venueHint = renderVenue(state, "ebay", !!settings(), {
        btn: el.bookEbayBtn,
        status: el.bookEbayStatus,
        cancel: el.bookEbayCancel,
        link: el.bookEbayLink,
    });
    el.bookVenueHint.textContent = venueHint;
    el.bookVenueHint.hidden = !venueHint;

    renderNext(state, el.bookNextBtn, el.bookDoneHint, el.bookNextNote);
}

/**
 * The customize nodes of a kind: the toggle, its card, the quantity box, the
 * pickup box, the price slider with its three words and its line, and the
 * post without asking box.
 */
function customizeNodes(m) {
    return m === "book"
        ? {
              toggle: el.bookCustomizeToggle,
              card: el.bookCustomize,
              quantity: el.bookQuantity,
              pickup: el.bookPickupOnly,
              pricing: el.bookPricing,
              pricingWords: el.bookPricingWords,
              pricingNote: el.bookPricingNote,
              autoPost: el.bookAutoPost,
          }
        : {
              toggle: el.customizeToggle,
              card: el.customize,
              quantity: el.quantity,
              pickup: el.pickupOnly,
              pricing: el.pricing,
              pricingWords: el.pricingWords,
              pricingNote: el.pricingNote,
              autoPost: el.autoPost,
          };
}

/**
 * customize: the arrow and the card follow the open flag; the boxes lock once a
 * job is on its way (as the photos do). The quantity box is not rewritten here,
 * so a half-typed number stays as typed; DONE and a reload fill it (fillCustomize).
 * The price slider's chosen word is bold and its line says what the grade means.
 */
function renderCustomize(m) {
    const nodes = customizeNodes(m);
    const open = customizeOpen[m];
    nodes.toggle.textContent = open ? "▾ customize" : "▸ customize";
    nodes.toggle.setAttribute("aria-expanded", open ? "true" : "false");
    nodes.card.hidden = !open;
    const fixed = restoring[m] || anyActive(slots[m]);
    const c = customizeOf(slots[m]);
    nodes.quantity.disabled = fixed;
    nodes.pickup.disabled = fixed;
    nodes.pickup.checked = c.pickupOnly;
    const grade = pricingOf(c.pricing);
    nodes.pricing.disabled = fixed;
    nodes.pricing.value = String(grade.grade);
    nodes.pricing.setAttribute("aria-valuetext", grade.word);
    PRICING.forEach((p, i) => nodes.pricingWords[i].classList.toggle("on", p.grade === grade.grade));
    nodes.pricingNote.textContent = grade.note;
    nodes.autoPost.disabled = fixed;
    nodes.autoPost.checked = c.autoPost;
}

/** The customize boxes show what the state holds (after a reload or a DONE). */
function fillCustomize(m) {
    customizeNodes(m).quantity.value = customizeOf(slots[m]).quantity;
}

/** The price line above the venue buttons: the price, or nothing. */
function renderPriceLine(node, text) {
    node.textContent = text;
    node.hidden = !text;
}

/**
 * One venue button, its status line and its link; returns the button's hint.
 * The button's word is always the venue; the price is the line above the buttons.
 */
function renderVenue(state, venue, ok, nodes) {
    const job = state.jobs[venue];
    const button = venueButton(state, venue, ok);
    nodes.btn.disabled = !button.enabled;
    // the ring in the button, from the press until the link or the error
    const active = isActive(job);
    nodes.btn.classList.toggle("busy", active);
    nodes.btn.setAttribute("aria-busy", active ? "true" : "false");
    nodes.btn.textContent = venue;
    nodes.btn.setAttribute("aria-label", venueLabel(job, venue));
    nodes.btn.classList.toggle("posted", job.phase === "done" && !savedNotPosted(job));
    // the red cancel under it, from the press until the link or the error
    nodes.cancel.hidden = !cancelButton(state, venue);
    nodes.cancel.disabled = job.step === STOPPING_STEP;

    // before the press, what customize changed ("pickup only · fair price"): he sees it took
    const line = venueLine(state.jobs[venue], venueIdleNote(state, venue));
    nodes.status.textContent = line.text;
    nodes.status.className = `venue-status ${line.kind}`;
    nodes.status.hidden = !line.text;
    nodes.link.hidden = !line.link;
    nodes.link.textContent = line.link;
    if (line.link) nodes.link.href = line.link;
    return button.hint;
}

/**
 * The photos. A book's carry no AI mark (its catalogue record says what it is);
 * in its place, "main": the photo the listing leads with.
 */
function renderStrip(m, strip, locked) {
    const state = slots[m];
    strip.replaceChildren();
    for (const p of state.photos) {
        const lead = m === "book" && p.n === state.book.main;
        const card = document.createElement("li");
        card.className = p.ai ? "shot shot-ai" : lead ? "shot shot-main" : "shot";

        const held = blobs.get(p.id);
        if (held) {
            // the shrunk picture, once there is one: a full-size original is never
            // shown, so the phone decodes one picture at a time, not every one
            const img = document.createElement("img");
            if (held.shrunk) img.src = held.url;
            img.alt = p.name;
            card.append(img);
        } else {
            // read back from the PC: its picture is on its way here (fetchPictures), or
            // the PC could not give it
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
                setState(m, reduce(slots[m], { type: "retry", id: p.id }));
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
            x.addEventListener("click", () => removePhoto(m, p.id));
            card.append(x);
        }

        if (m === "goods") {
            // the AI mark, bottom right of the photo: off by default, filled when on
            const ai = document.createElement("button");
            ai.type = "button";
            ai.className = p.ai ? "ai-mark on" : "ai-mark";
            ai.textContent = "AI";
            ai.disabled = locked;
            ai.setAttribute("aria-pressed", p.ai ? "true" : "false");
            ai.setAttribute("aria-label", `Send ${p.name} to the AI`);
            ai.addEventListener("click", () =>
                setState("goods", reduce(slots.goods, { type: "toggleAi", id: p.id }))
            );
            card.append(ai);
        } else {
            // the main mark, where goods have the AI mark and looking the same:
            // exactly one photo wears it (the first unless he moved it), a tap
            // moves it here, and after the ebay press it shows but stays put
            const main = document.createElement("button");
            main.type = "button";
            main.id = `book-main-${p.n}`;
            main.className = lead ? "main-mark on" : "main-mark";
            main.textContent = "main";
            main.disabled = locked;
            main.setAttribute("data-value", String(p.n));
            main.setAttribute("aria-pressed", lead ? "true" : "false");
            main.setAttribute("aria-label", `Lead the listing with ${p.name}`);
            main.addEventListener("click", () =>
                setState("book", reduce(slots.book, { type: "bookMain", id: p.id }))
            );
            card.append(main);
        }

        const label = document.createElement("span");
        label.className = "shot-name";
        label.textContent = p.name;
        card.append(label);

        strip.append(card);
    }
}

function say(message, kind = "info") {
    el.message.textContent = message || "";
    el.message.className = `message ${kind}`;
    el.message.hidden = !message;
}

// --- the mode switch -----------------------------------------------------------

/** goods | book, chosen with the switch: remembered, and where the items in hand come back. */
function setMode(m) {
    if (!MODES.includes(m)) return;
    writeText("localStorage", MODE_KEY, m);
    showMode(m);
}

/** Only which item is on screen changes; both carry on. */
function showMode(m) {
    if (m === mode) return;
    mode = m;
    render();
    pump(); // the shown item's photos go first from now on
}

// --- photos ----------------------------------------------------------------

function onItemNameChanged() {
    if (el.itemInput.readOnly) return;
    const cleaned = cleanItemName(el.itemInput.value);
    if (cleaned !== slots.goods.itemName) {
        setState("goods", reduce(slots.goods, { type: "setItem", itemName: cleaned }));
        scheduleNameCheck();
    } else render();
}

let nameCheck = 0;

/**
 * A moment after he stops typing, the PC is asked whether an item of that name
 * was already started today; if so the name is flagged and refused (Michal,
 * 2026-09-30: "just flag it and don't accept it"). No answer, or a 404, is a
 * free name as far as the page can tell. Nothing is asked once the item's
 * folder exists: the name is fixed then anyway.
 */
function scheduleNameCheck() {
    clearTimeout(nameCheck);
    const s = slots.goods;
    if (!s.itemName || s.itemId || s.photos.length > 0) return;
    nameCheck = setTimeout(() => {
        checkName(s.itemName).catch(() => {});
    }, NAME_CHECK_MS);
}

async function checkName(itemName) {
    const pc = settings();
    const s = slots.goods;
    if (!pc || s.itemName !== itemName || s.itemId || s.photos.length > 0) return;
    let answer;
    try {
        answer = await getItem(pc, itemIdFor(itemName, new Date()));
    } catch {
        return; // 404: the name is free; no answer: nothing to say
    }
    const photos = Array.isArray(answer.photos) ? answer.photos.length : 0;
    setState("goods", reduce(slots.goods, { type: "nameTaken", itemName, photos }));
}

/**
 * Back from the camera, the Snap button is scrolled to where the shutter was,
 * three quarters down the screen, so the next photo is one tap away. A browser
 * (or test) without the measurements is left alone.
 */
function snapUnderThumb() {
    const view = globalThis.window;
    if (!view || typeof view.scrollTo !== "function" || typeof el.snapLabel.getBoundingClientRect !== "function") return;
    if (!(view.innerHeight > 0)) return;
    const top = snapScrollTop({ scrollY: view.scrollY || 0, innerHeight: view.innerHeight }, el.snapLabel.getBoundingClientRect());
    view.scrollTo({ top, left: 0, behavior: "instant" });
}

/**
 * Photos taken or picked: onto the page at once, and into the upload queue.
 * A goods item needs its name first; a book's photos may come before its ISBN
 * (the cover snapped before the barcode is scanned or the ISBN typed) and wait
 * on the page until it names them.
 */
function acceptFiles(m, fileList) {
    const s = slots[m];
    if (m === "goods" && (!s.itemName || restoring.goods)) {
        say("Type an item name first.", "warn");
        return;
    }
    if (m === "goods" && s.nameTaken) {
        say(nameTakenHint(s), "warn");
        return;
    }
    if (restoring[m] || photosLocked(s)) return;
    keepSaved[m] = false; // a new item starts: it is the one to remember now
    const item = s.itemName || "Book";
    let next = s;
    const ids = [];
    for (const file of fileList) {
        const n = takeNumber(item, next);
        const id = `${item}#${n}#${Date.now()}#${Math.random().toString(36).slice(2, 8)}`;
        blobs.set(id, { file, url: "", shrunk: null, ready: null });
        ids.push(id);
        next = reduce(next, { type: "add", id, name: buildFileName(item, n), n });
    }
    setState(m, next);
    prepareAll(m, ids).catch(() => {});
    pump();
}

/**
 * Each new photo is shrunk right away, one after another, and only the shrunk
 * JPEG is kept: the phone then holds one decoded original at a time instead of
 * every full-size picture at once (Michal, 2026-10-02: several photos from the
 * camera roll, the first went, the rest showed failed however often he tapped
 * them). The thumbnail is the shrunk picture too. One that will not shrink
 * shows failed with the reason, here and in the line under the photos.
 */
async function prepareAll(m, ids) {
    for (const id of ids) {
        try {
            await prepared(id);
        } catch (e) {
            photoFailed(m, id, e.message || "could not read the photo");
        }
    }
}

/**
 * One shrink at a time, whoever asks: a second gallery pick while the first is
 * still being shrunk, or the upload reaching a photo before its turn, joins the
 * line instead of decoding a second original beside the first (Michal,
 * 2026-10-02: "definitely be prepared for a situation where many are dropped
 * from the phone camera gallery at once").
 */
let shrinking = Promise.resolve();

/** The photo's shrunk JPEG: made once, in turn, shared by the thumbnail and the upload. */
function prepared(id) {
    const held = blobs.get(id);
    if (!held) return Promise.reject(new Error("the photo is no longer on this page"));
    if (held.shrunk) return Promise.resolve(held.shrunk);
    if (!held.ready) {
        held.ready = shrinking
            .then(() => {
                if (!blobs.has(id)) throw new Error("the photo is no longer on this page");
                return shrinkPhoto(held.file);
            })
            .then(
            (blob) => {
                held.shrunk = blob;
                held.file = null; // the original is not needed any more: let it go
                if (held.url) URL.revokeObjectURL(held.url);
                held.url = URL.createObjectURL(blob);
                held.ready = null;
                render();
                return blob;
            },
            (e) => {
                held.ready = null;
                throw e;
            }
        );
        shrinking = held.ready.catch(() => {});
    }
    return held.ready;
}

/** A photo this phone could not shrink: failed on its card, and said once. */
function photoFailed(m, id, error) {
    const photo = slots[m].photos.find((p) => p.id === id);
    if (!photo || photo.status === "failed") return;
    setState(m, reduce(slots[m], { type: "taskFailed", task: { kind: "photo", id }, status: -1, error }));
    say(`${photo.name}: ${error}`, "warn");
}

/** The x on a thumbnail: off the page, and off the PC when it may be there. */
function removePhoto(m, id) {
    const held = blobs.get(id);
    if (held) {
        URL.revokeObjectURL(held.url);
        blobs.delete(id);
    }
    setState(m, reduce(slots[m], { type: "remove", id }));
    pump();
}

// --- the book: scan, ISBN, lookup ------------------------------------------------

/**
 * The ISBN button (it was called Scan): the picture is read for its barcode
 * and then dropped. It is a close-up of the bars, not a listing photo (Michal,
 * 2026-09-27), so it never joins the strip, never goes to the PC and is not
 * kept here. A barcode that would not read changes nothing but the line above
 * the button; one that reads closes No ISBN if it was open (takeIsbn).
 */
async function onScan(files) {
    const file = files && files[0];
    if (!file || restoring.book || slots.book.itemId) return;
    const mine = generation.book;
    scan = "reading";
    render();
    const isbn = await readIsbn(file);
    if (mine !== generation.book) return;
    scan = isbn ? "" : "missed";
    if (!isbn) {
        render();
        return;
    }
    el.bookIsbn.value = isbn;
    clearTimeout(isbnTimer);
    isbnTimer = null;
    takeIsbn(isbn);
    render(); // the same ISBN again changes no state, but "reading" is over
}

function onIsbnInput() {
    if (el.bookIsbn.readOnly) return;
    clearTimeout(isbnTimer);
    isbnTimer = setTimeout(() => {
        isbnTimer = null;
        takeIsbn(normalizeIsbn(el.bookIsbn.value));
    }, ISBN_DEBOUNCE_MS);
}

/**
 * A valid ISBN-13 (or "" for none) is now the book: it names the item, the
 * photos that waited for it go, and the PC is asked about it. The same ISBN
 * again asks again only when the last answer was a failure (editing the box
 * is how he retries).
 */
function takeIsbn(isbn) {
    const before = slots.book;
    if (isbn === before.book.isbn) {
        // the same ISBN again (or, under No ISBN, no valid one: ignored) asks again only after a
        // failure; under No ISBN the ISBN kept after a miss is not the question, the title is
        const again = isbn && !before.book.manual && ["idle", "failed"].includes(before.book.lookup.phase);
        if (again) lookupBook().catch(() => {});
        return;
    }
    setState("book", reduce(before, { type: "bookIsbn", isbn }));
    if (slots.book.book.isbn !== isbn) return; // fixed: the book's item is on the PC already
    if (before.book.manual) {
        // a valid ISBN after all: it is the book, and what was typed under No ISBN goes
        clearTimeout(titleTimer);
        titleTimer = null;
        fillManual();
    }
    if (isbn) scan = "";
    el.bookPrice.value = slots.book.book.price;
    // the book first (the card fills while the photos travel), then the waiting photos
    if (isbn) lookupBook().catch(() => {});
    pump();
}

/** The No ISBN fields show what the state holds (after a reload, a DONE, or closing them). */
function fillManual() {
    const { book } = slots.book;
    el.bookTitleInput.value = book.title;
    el.bookAuthor.value = book.author;
    el.bookYear.value = book.year;
}

/**
 * No ISBN, tapped: the title fields open and the ISBN box is set aside (and
 * emptied, so it cannot look like the book); tapped again, they close and
 * what was typed in them goes. Until the book's folder is on the PC.
 *
 * After an ISBN no catalogue knows, the box keeps that ISBN (it goes on the
 * listing, with the title typed now), and the fields open even with the
 * folder on the PC; closed again, the ISBN is asked about afresh.
 */
function onNoIsbn() {
    const s = slots.book;
    if (restoring.book || (s.itemId && !s.book.isbnMiss) || photosLocked(s)) return;
    const open = !s.book.manual;
    clearTimeout(isbnTimer);
    isbnTimer = null;
    clearTimeout(titleTimer);
    titleTimer = null;
    scan = "";
    setState("book", reduce(s, { type: "bookManual", open }));
    fillManual();
    el.bookIsbn.value = slots.book.book.isbn; // "" unless kept after a miss
    el.bookPrice.value = slots.book.book.price;
    if (open) el.bookTitleInput.focus();
    retryLookup(); // closed again after a miss: the kept ISBN is asked about afresh
}

/** A keystroke in the title, author or year: the name and the search wait for him to stop. */
function onManualInput(field, node) {
    if (node.readOnly) return;
    setState("book", reduce(slots.book, { type: "bookField", field, text: node.value }));
    clearTimeout(titleTimer);
    titleTimer = setTimeout(() => {
        titleTimer = null;
        takeTitle();
    }, SEARCH_DEBOUNCE_MS);
}

/**
 * He stopped typing: the title names the book's folder (the photos that
 * waited for it go), and the PC is asked about the book by what he typed --
 * unless it was asked that already and answered.
 */
function takeTitle() {
    setState("book", reduce(slots.book, { type: "bookName" }));
    const { book } = slots.book;
    if (lookupKey(book) && ["idle", "failed"].includes(book.lookup.phase)) lookupBook().catch(() => {});
    pump();
}

/**
 * GET /books/<isbn>, or /books/search for a book with no ISBN: the card, the
 * listings, the price box filled with the suggestion, and (by title) the
 * format chip. The answer counts only while the book is still what was asked.
 */
async function lookupBook() {
    const { book } = slots.book;
    const key = lookupKey(book);
    if (!key) return;
    const pc = settings();
    if (!pc) {
        setState("book", reduce(slots.book, { type: "bookLookupFailed", key, status: -1, error: SETTINGS_HINT }));
        return;
    }
    setState("book", reduce(slots.book, { type: "bookLookupStart", key }));
    try {
        const answer = book.manual ? await searchBook(pc, bookSearch(book)) : await getBook(pc, book.isbn);
        heard(200);
        const typed = slots.book.book.price;
        setState("book", reduce(slots.book, { type: "bookLookupDone", key, answer }));
        if (slots.book.book.price !== typed) el.bookPrice.value = slots.book.book.price;
    } catch (e) {
        const status = e instanceof PcError ? e.status : 0;
        if (status === 0 || status === 401) heard(status);
        setState("book", reduce(slots.book, { type: "bookLookupFailed", key, status, error: e.message }));
    }
}

/** Settings are right now, or the PC is back: a book not yet looked up is asked about again. */
function retryLookup() {
    const { book } = slots.book;
    if (lookupKey(book) && ["idle", "failed"].includes(book.lookup.phase)) {
        lookupBook().catch(() => {});
    }
}

// --- the upload queue --------------------------------------------------------

async function runTask(pc, m, task) {
    const itemId = slots[m].itemId;
    switch (task.kind) {
        case "item":
            return createItem(pc, task.name);
        case "photo": {
            // the shrunk JPEG, made when the photo was taken (or now, after a retry)
            return putPhoto(pc, itemId, task.n, await prepared(task.id));
        }
        case "delete":
            return deletePhoto(pc, itemId, task.n);
        case "note":
            return putNote(pc, itemId, task.text);
        default:
            throw new Error(`unknown task ${task.kind}`);
    }
}

/** The shown item's requests first, then the other's: both reach the PC, one request at a time. */
function pickTask() {
    for (const m of [mode, other(mode)]) {
        const task = nextTask(slots[m]);
        if (task) return { m, task };
    }
    return null;
}

/** Send what queue.js says is next, one request at a time, until nothing is. */
async function pump() {
    if (pumping) return;
    pumping = true;
    try {
        for (;;) {
            const pc = settings();
            const next = pc ? pickTask() : null;
            if (!next) return;
            const { m, task } = next;
            const mine = generation[m];
            setState(m, reduce(slots[m], { type: "taskStart", task }));
            let answer = null;
            let failure = null;
            try {
                answer = await runTask(pc, m, task);
            } catch (e) {
                failure = e;
            }
            if (mine !== generation[m]) continue; // DONE was pressed meanwhile
            if (failure) {
                // PcError carries the HTTP status (0: no answer); anything else
                // (a photo that would not shrink) is this photo's own failure
                const status = failure instanceof PcError ? failure.status : -1;
                if (status === 0 || status === 401) heard(status);
                const error = failure.message || "not sent";
                if (task.kind === "photo" && status !== 0) {
                    // the phone could not shrink it, or the PC refused it: say which and why
                    const photo = slots[m].photos.find((p) => p.id === task.id);
                    if (photo) say(`${photo.name}: ${error}`, "warn");
                }
                setState(m, reduce(slots[m], { type: "taskFailed", task, status, error }));
                // a stalled item waits out its pause; the other one may still go
                if (slots[m].stalled) scheduleResume(m);
            } else {
                heard(200);
                setState(m, reduce(slots[m], { type: "taskDone", task, answer }));
                if (task.kind === "item") syncCounter(m);
            }
        }
    } finally {
        pumping = false;
    }
}

/** The PC did not answer: try again after a growing pause (or when back online). */
function scheduleResume(m) {
    clearTimeout(resumeTimers[m]);
    resumeTimers[m] = setTimeout(() => {
        resumeTimers[m] = null;
        setState(m, reduce(slots[m], { type: "resume" }));
        pump();
    }, retryDelayMs(slots[m].failures));
}

// --- the note (a book's is its flaws) ------------------------------------------

function noteBox(m) {
    return m === "book" ? el.bookFlaws : el.note;
}

function onNoteInput(m) {
    setState(m, reduce(slots[m], { type: "noteText", text: noteBox(m).value }));
    clearTimeout(noteTimers[m]);
    noteTimers[m] = setTimeout(() => noteDue(m), NOTE_DEBOUNCE_MS);
}

/** He stopped typing (or left the box, or pressed a button): send the note. */
function noteDue(m) {
    clearTimeout(noteTimers[m]);
    noteTimers[m] = null;
    if (!noteDirty(slots[m]) || slots[m].note.due) return;
    setState(m, reduce(slots[m], { type: "noteDue" }));
    pump();
}

/** The note on the PC before a job reads it, or before DONE clears the page. */
async function noteReady(m) {
    noteDue(m);
    while (noteDirty(slots[m])) {
        if (slots[m].stalled || !slots[m].online || !settings()) return false;
        // eslint-disable-next-line no-await-in-loop
        await changed();
    }
    return true;
}

// --- the venue buttons -------------------------------------------------------

/** "<mode>:<venue>" -> the press on its way (a token) and the timer of its one-second wait */
const presses = new Map();
const sendTimers = new Map();

async function send(m, venue) {
    const pc = settings();
    if (!pc || !venueButton(slots[m], venue, true).enabled) return;
    const mine = generation[m];
    const key = `${m}:${venue}`;
    const press = {};
    presses.set(key, press);
    const taken = () => mine !== generation[m] || presses.get(key) !== press;
    // the second goods button reuses the saved row, and so does the press after
    // "saved, not posted" (a book's too); otherwise a book is always sent whole
    const reuse = !!slots[m].sku && (m === "goods" || savedNotPosted(slots[m].jobs[venue]));
    setState(m, reduce(slots[m], { type: "jobSending", venue, step: "sending" }));
    if (!reuse && !(await noteReady(m))) {
        if (taken()) return;
        setState(
            m,
            reduce(slots[m], { type: "jobRefused", venue, error: "the note has not reached the PC" })
        );
        return;
    }
    if (taken()) return;
    // the second he asked for: the ring turns, nothing has left the phone yet
    await new Promise((resolve) => {
        sendTimers.set(key, setTimeout(resolve, SEND_DELAY_MS));
    });
    if (taken()) return;
    const s = slots[m];
    const body = jobRequest({
        venue,
        sku: s.sku,
        item: s.itemId,
        photos: s.photos,
        // a sku job carries no book: the PC posts the row it saved
        book: m === "book" && !reuse ? bookForm(s) : undefined,
        // auto-post off: the press saves the row (held), and the one after posts it
        customize: { ...customizeOf(s), autoPost: !s.jobs[venue].held },
    });
    try {
        const answer = await postJob(pc, body);
        if (mine !== generation[m]) return;
        setState(m, reduce(slots[m], { type: "jobAccepted", venue, job: answer.job, ahead: answer.ahead }));
        schedulePoll(m, venue, mine);
    } catch (e) {
        if (mine !== generation[m]) return;
        setState(m, reduce(slots[m], { type: "jobRefused", venue, error: e.message }));
    }
}

/**
 * The red cancel under a pressed venue button (Michal, 2026-10-02). Within the
 * first second the press is simply taken back: nothing was sent, nothing paid.
 * After that the PC is told (DELETE /jobs/<id>): a job still queued is dropped
 * at once, the one in hand stops at its next step and saves the draft instead
 * of publishing; the status polls show which.
 */
async function cancelPress(m, venue) {
    const mine = generation[m];
    const key = `${m}:${venue}`;
    const job = slots[m].jobs[venue];
    if (job.phase === "sending") {
        presses.delete(key);
        clearTimeout(sendTimers.get(key));
        sendTimers.delete(key);
        setState(m, reduce(slots[m], { type: "jobCancelled", venue }));
        return;
    }
    if (!["queued", "running"].includes(job.phase) || !job.jobId) return;
    const pc = settings();
    if (!pc) return;
    setState(m, reduce(slots[m], { type: "jobStopping", venue }));
    try {
        const answer = await cancelJob(pc, job.jobId);
        if (mine !== generation[m]) return;
        if (answer.state === "cancelled") {
            setState(m, reduce(slots[m], { type: "jobCancelled", venue }));
        }
    } catch (e) {
        if (mine !== generation[m]) return;
        say(`Could not cancel: ${e.message}`, "warn");
    }
}

function schedulePoll(m, venue, mine) {
    const key = `${m}:${venue}`;
    clearTimeout(polls.get(key));
    polls.set(
        key,
        setTimeout(() => {
            poll(m, venue, mine).catch(() => {});
        }, POLL_MS)
    );
}

async function poll(m, venue, mine) {
    const pc = settings();
    const jobId = slots[m].jobs[venue].jobId;
    if (mine !== generation[m] || !pc || !jobId) return;
    try {
        const status = await getJob(pc, jobId);
        if (mine !== generation[m]) return;
        setState(m, reduce(slots[m], { type: "jobStatus", venue, status }));
    } catch (e) {
        if (mine !== generation[m]) return;
        if (e.status === 0) {
            // the phone or the PC is off the network for a moment; the job
            // itself is safe on the PC's disk, so keep asking
            setState(m, reduce(slots[m], { type: "pollTrouble", venue, error: e.message }));
        } else {
            setState(
                m,
                reduce(slots[m], {
                    type: "jobStatus",
                    venue,
                    status: { state: "failed", error: e.message },
                })
            );
        }
    }
    if (isActive(slots[m].jobs[venue])) schedulePoll(m, venue, mine);
}

// --- Admin: Settings, the inventory and the sync bar --------------------------------
//
// Michal, 2026-10-06: "After clicking Admin (where settings are now) a user would have
// access to inventory list, with search options / filtering options, etc. ... just like
// 'customize' now is a foldout - settings and inventory would be a foldout in the admin
// section. once you click on a listing probably all the cards are different foldouts".
// And later that day: "I want a clear sync to and sync from for overall syncing ... Add
// the per item actions you have proposed [post the other venue, end, refresh status, edit
// fields]. Also I think when I click on an item there should only be eBay or and
// Craigslist card." core.js decides what each card offers and says; this wires it.

/** The foldout's arrow and word: ▸ folded, ▾ open, as customize. */
function fold(toggle, word, open) {
    toggle.textContent = `${open ? "▾" : "▸"} ${word}`;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
}

/**
 * Admin on screen, or not. While it is, the goods | book switch is not (Michal,
 * 2026-10-06: "when we do admin we probably do not need goods vs book slider distinction").
 */
function adminShown(open) {
    el.admin.hidden = !open;
    el.adminToggle.setAttribute("aria-expanded", open ? "true" : "false");
    el.modes.hidden = open;
}

/**
 * Admin opens on Settings while they are missing or wrong, and otherwise on the
 * inventory, asked afresh. Closed, it lets go of the photos it fetched and opens
 * on the list next time.
 */
function showAdmin(open) {
    adminShown(open);
    if (!open) {
        // a search still waiting or an answer still on its way is for a list no longer shown
        clearTimeout(searchTimer);
        searchTimer = null;
        admin.asked += 1;
        showList();
        dropThumbs();
        return;
    }
    const ok = !!settings();
    showSettings(!ok);
    showInventory(ok);
}

function toggleAdmin() {
    showAdmin(el.admin.hidden);
}

/** Settings, inside Admin: opening them opens Admin too, for a caller that sends him there. */
function showSettings(open) {
    if (open && el.admin.hidden) adminShown(true);
    el.settings.hidden = !open;
    fold(el.settingsToggle, "Settings", open);
    if (open) {
        el.pcAddress.value = readText("localStorage", PC_KEY);
        el.pcKey.value = readText("localStorage", KEY_KEY);
        el.settingsStatus.textContent = "";
    }
}

function toggleSettings() {
    showSettings(el.settings.hidden);
}

/** The inventory foldout: opened, it shows the list and asks the PC for it. */
function showInventory(open) {
    admin.inventoryOpen = open;
    el.inventory.hidden = !open;
    fold(el.inventoryToggle, "Inventory", open);
    if (open) {
        showList();
        loadInventory().catch(() => {});
    }
}

/** The chips show the filters and the sort chosen. */
function renderFilters() {
    for (const { value, node } of el.inventoryVenues) node.setAttribute("aria-pressed", value === admin.venue ? "true" : "false");
    for (const { value, node } of el.inventoryStates) node.setAttribute("aria-pressed", value === admin.status ? "true" : "false");
    for (const { value, node } of el.inventorySorts) node.setAttribute("aria-pressed", value === admin.sort ? "true" : "false");
}

/**
 * Ask the PC for the rows that match the search and the filters, in the sort
 * chosen, and show them. A PC that does not answer says so on the line under
 * the search box; the list stays as it was.
 */
async function loadInventory() {
    clearTimeout(searchTimer);
    searchTimer = null;
    admin.asked += 1;
    const mine = admin.asked;
    const pc = settings();
    if (!pc) {
        el.inventoryStatus.textContent = "Set the PC address and key under Settings first.";
        return;
    }
    el.inventoryStatus.textContent = "Asking the PC...";
    let answer;
    try {
        answer = await getInventory(pc, {
            q: el.inventorySearch.value,
            venue: admin.venue,
            status: admin.status,
            sort: admin.sort,
        });
    } catch (e) {
        if (mine !== admin.asked) return;
        if (e.status === 0 || e.status === 401) heard(e.status);
        el.inventoryStatus.textContent = `Could not read the inventory: ${e.message}.`;
        // a key the PC does not know: Settings is where it is put right
        if (e.status === 401) showSettings(true);
        return;
    }
    if (mine !== admin.asked) return; // a later search or filter has its own answer coming
    heard(200);
    admin.rows = inventoryRows(answer);
    el.inventoryStatus.textContent = inventoryCount(admin.rows.length);
    renderRows();
    if (el.inventoryPhotos.checked) fetchThumbs(pc, mine).catch(() => {});
}

/** The list: one row per listing, with photo 1's tile on its left while Show photos is on. */
function renderRows() {
    dropThumbs();
    const photos = !!el.inventoryPhotos.checked;
    el.inventoryList.replaceChildren(...admin.rows.map((row) => rowNode(row, photos)));
}

/** An address opened in a new tab that hands nothing back to this page. */
function linkNode(url, className, word) {
    const a = document.createElement("a");
    a.className = className;
    a.href = url;
    a.textContent = word;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
}

/**
 * A row: the title and its line are the button that opens the detail, stretched
 * over the whole row (styles.css), and the badges sit beside it, not in it: a
 * listed one is a link to the listing (Michal, 2026-10-06: "clicking the venue
 * button from the inventory should open the listing"), and a link inside a
 * button is one a browser does not follow, so the tap goes to the link alone.
 */
function rowNode(row, photos) {
    const li = document.createElement("li");
    li.className = "inv-row";
    if (photos) {
        // a blank tile until photo 1 comes (fetchThumbs), or for a row with none
        const tile = document.createElement("span");
        tile.className = "inv-thumb";
        tile.textContent = Number(row.photos) > 0 ? "" : "no photo";
        admin.tiles.set(row.sku, tile);
        li.append(tile);
    }
    const words = document.createElement("div");
    words.className = "inv-words";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "inv-open";
    const title = document.createElement("span");
    title.className = "inv-title";
    title.textContent = rowTitle(row);
    const line = document.createElement("span");
    line.className = "inv-line";
    const price = priceWord(row.price);
    if (price) {
        const said = document.createElement("span");
        said.className = "inv-price";
        said.textContent = price;
        line.append(said);
    }
    const sku = document.createElement("span");
    sku.className = "inv-sku mono";
    sku.textContent = row.sku;
    line.append(sku);
    open.append(title, line);
    open.addEventListener("click", () => {
        openRow(row, open).catch(() => {});
    });
    const badges = document.createElement("span");
    badges.className = "inv-badges";
    for (const badge of rowBadges(row)) {
        const kind = `vbadge ${badge.kind}`;
        if (badge.link) {
            const a = linkNode(badge.link, kind, badge.text);
            a.setAttribute("aria-label", `${badge.text}: open the listing`);
            badges.append(a);
            continue;
        }
        const b = document.createElement("span");
        b.className = kind;
        b.textContent = badge.text;
        badges.append(b);
    }
    words.append(open, badges);
    li.append(words);
    return li;
}

/**
 * Photo 1 of each row into its tile, one at a time. A photo the PC cannot give
 * leaves the tile blank; no answer at all stops the rest, as does a new query.
 */
async function fetchThumbs(pc, mine) {
    for (const row of admin.rows) {
        const tile = admin.tiles.get(row.sku);
        if (!tile || !(Number(row.photos) > 0)) continue;
        let blob;
        try {
            blob = await getRowPhoto(pc, row.sku, 1);
        } catch (e) {
            if (e.status === 0) return;
            continue;
        }
        if (mine !== admin.asked) return;
        const url = URL.createObjectURL(blob);
        admin.thumbs.push(url);
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        tile.replaceChildren(img);
    }
}

/** The list's pictures let go: the list is changing, or Admin closed. */
function dropThumbs() {
    for (const url of admin.thumbs) URL.revokeObjectURL(url);
    admin.thumbs = [];
    admin.tiles.clear();
}

/** A chip tapped ("venue", "status" or "sort"): the list is asked for again at once. */
function onFilter(filter, value) {
    admin[filter] = value;
    renderFilters();
    loadInventory().catch(() => {});
}

/**
 * A row tapped: its detail in place of the list, the summary at once, then the
 * whole row from the PC and its photos one at a time. The cards of the venues
 * the row is on open; an empty one stays folded.
 */
async function openRow(row, from) {
    admin.shown += 1;
    const mine = admin.shown;
    dropPictures();
    dropCards();
    admin.from = from;
    admin.changed = false;
    admin.folds = Object.fromEntries(VENUES.map((v) => [v, rowVenues(row).includes(v)]));
    detailLine("");
    el.inventoryBrowse.hidden = true;
    el.inventoryDetail.hidden = false;
    renderDetail(row);
    if (typeof el.inventoryDetail.scrollIntoView === "function") el.inventoryDetail.scrollIntoView({ block: "start" });
    const pc = settings();
    if (!pc) {
        detailLine("Set the PC address and key under Settings first.");
        return;
    }
    detailLine(`Reading ${row.sku} from the PC...`);
    let whole;
    try {
        whole = await getRow(pc, row.sku);
    } catch (e) {
        if (mine !== admin.shown) return;
        if (e.status === 0 || e.status === 401) heard(e.status);
        detailLine(`Could not read ${row.sku}: ${e.message}.`);
        return;
    }
    if (mine !== admin.shown) return;
    heard(200);
    detailLine("");
    renderDetail({ ...whole, sku: row.sku });
    fetchRowPhotos(pc, mine).catch(() => {});
}

function detailLine(text) {
    el.detailStatus.textContent = text;
    el.detailStatus.hidden = !text;
}

/** The detail whole: the heading, the photo strip, the venue cards. */
function renderDetail(row) {
    admin.row = row;
    el.detailHeading.textContent = rowHeading(row);
    renderDetailPhotos(row);
    renderCards();
}

/** The row as the PC has it after a card changed it: the heading and the cards; the photos stay. */
function refreshRow(row) {
    admin.row = row;
    el.detailHeading.textContent = rowHeading(row);
    renderCards();
}

/**
 * One card's screen state, per venue, for the row on screen: what is on its way
 * to the PC (`wait`), its last job as GET /jobs/<id> answered, what the PC refused
 * (`note`), End asking its second tap (`confirm`), Edit's inputs (`edit`), End
 * refused for good (`noEnd`), its status line's node and its poll's timer.
 */
function blankCard() {
    return { wait: "", job: null, note: null, confirm: false, edit: null, noEnd: false, line: null, timer: null };
}

/** The cards' polls stopped and their state let go: the detail is leaving the screen or changing rows. */
function dropCards() {
    for (const venue of VENUES) clearTimeout(admin.cards[venue].timer);
    admin.cards = Object.fromEntries(VENUES.map((v) => [v, blankCard()]));
}

/**
 * Something is on its way to the PC or a job of the row's is still running: the
 * row's fields stay read-only and the other actions wait (one job per row at a time).
 */
function rowBusy() {
    return VENUES.some((v) => !!admin.cards[v].wait || jobRunning(admin.cards[v].job));
}

/** Every venue card, in its fixed order, and the foldouts' arrows. */
function renderCards() {
    for (const venue of VENUES) el.detailFolds[venue].card.replaceChildren(...cardNodes(venue));
    renderFolds();
}

/** Each venue's foldout: open or folded, and "not added" on one the row is not on. */
function renderFolds() {
    const on = admin.row ? rowVenues(admin.row) : [];
    for (const [venue, { toggle, card }] of Object.entries(el.detailFolds)) {
        const open = admin.folds[venue] === true;
        fold(toggle, on.includes(venue) ? venue : `${venue} · not added`, open);
        card.hidden = !open;
    }
}

/**
 * A venue's card: its status line and link, then the listing's fields (or Edit's
 * inputs), then its actions, and under Save what the PC refused. A venue the row
 * is not on has only the line and its Add.
 */
function cardNodes(venue) {
    const row = admin.row;
    const c = admin.cards[venue];
    const busy = rowBusy();
    c.line = document.createElement("p");
    paintLine(venue);
    if (!rowVenues(row).includes(venue)) return [c.line, actionsNode(venue, busy)];
    const nodes = [c.line];
    const url = venueStatus(row, venue).url;
    if (url) nodes.push(linkNode(url, "venue-link", url));
    nodes.push(c.edit ? editNode(venue, busy) : factsNode(venueFacts(row, venue)), actionsNode(venue, busy));
    if (c.edit && c.edit.error) {
        const refused = document.createElement("p");
        refused.className = "edit-error";
        refused.textContent = c.edit.error;
        nodes.push(refused);
    }
    return nodes;
}

/** A card's status line, rewritten in place: a poll changes it and nothing else. */
function paintLine(venue) {
    const c = admin.cards[venue];
    if (!c.line || !admin.row) return;
    const line = cardLine(admin.row, venue, c);
    c.line.textContent = line.text;
    c.line.className = line.kind ? `venue-status ${line.kind}` : "venue-status";
}

/** A card's facts as a list of label and value; a derived one says so under it, muted. */
function factsNode(facts) {
    const list = document.createElement("dl");
    list.className = "facts";
    for (const f of facts) {
        const label = document.createElement("dt");
        label.textContent = f.label;
        const value = document.createElement("dd");
        value.className = [f.pre && "pre", f.mono && "mono", f.derived && "derived"].filter(Boolean).join(" ");
        value.textContent = f.value;
        if (f.derived) {
            const note = document.createElement("span");
            note.className = "derived-note";
            note.textContent = DERIVED;
            value.append(note);
        }
        list.append(label, value);
    }
    return list;
}

function actionButton(word, className, disabled, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = className;
    b.textContent = word;
    b.disabled = disabled;
    b.addEventListener("click", onClick);
    return b;
}

/**
 * A card's actions row: the actions core.js says it offers (End gone once the
 * PC refused it for this venue), or End's inline question, or Edit's Save and Cancel.
 */
function actionsNode(venue, busy) {
    const c = admin.cards[venue];
    const row = admin.row;
    const box = document.createElement("div");
    box.className = "venue-actions";
    if (c.confirm) {
        // the second tap, inline (never a browser dialog): nothing is sent before it
        const ask = document.createElement("span");
        ask.className = "confirm-ask";
        ask.textContent = endQuestion(venue);
        box.append(
            ask,
            actionButton("Yes, end it", "pill pill-small pill-bad", busy, () => {
                runAction(venue, "end").catch(() => {});
            }),
            actionButton("Keep it", "pill pill-small", false, () => {
                c.confirm = false;
                renderCards();
            })
        );
        return box;
    }
    if (c.edit) {
        box.append(
            actionButton("Save", "pill pill-ink", busy, () => {
                saveEdit(venue).catch(() => {});
            }),
            actionButton("Cancel", "pill", !!c.wait, () => {
                c.edit = null;
                renderCards();
            })
        );
        return box;
    }
    for (const action of venueActions(row, venue)) {
        if (action === "end" && c.noEnd) continue;
        if (action === "open") {
            box.append(linkNode(venueStatus(row, venue).url, "pill", actionWord(action, venue)));
            continue;
        }
        box.append(actionButton(actionWord(action, venue), "pill", busy, () => onAction(venue, action)));
    }
    return box;
}

/** An action button tapped: Edit and End's question stay on the phone; the rest go to the PC. */
function onAction(venue, action) {
    const c = admin.cards[venue];
    if (action === "add") {
        addTo(venue).catch(() => {});
    } else if (action === "edit") {
        const before = editValues(admin.row, venue);
        c.edit = { before, values: { ...before }, error: "" };
        c.note = null;
        renderCards();
    } else if (action === "end") {
        c.confirm = true;
        renderCards();
    } else {
        runAction(venue, action).catch(() => {});
    }
}

/**
 * Edit's inputs, the page's own inputs, each starting from the row (editValues);
 * a craigslist field left blank shows what it is derived from as its placeholder
 * and has a clear that empties its override. Locked while the row is busy.
 */
function editNode(venue, busy) {
    const form = document.createElement("div");
    form.className = "edit-form";
    const from = venue === "craigslist" ? derivedFields({ ...admin.row, craigslist: {} }, venue) : {};
    for (const f of EDIT_FIELDS[venue]) form.append(fieldNode(venue, f, from[f.key], busy));
    return form;
}

function fieldNode(venue, f, from, locked) {
    const values = admin.cards[venue].edit.values;
    if (f.kind === "check") {
        const row = document.createElement("label");
        row.className = "pickup";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = values[f.key] === true;
        box.disabled = locked;
        box.addEventListener("change", () => {
            values[f.key] = box.checked;
        });
        const words = document.createElement("span");
        words.textContent = f.label;
        row.append(box, words);
        return row;
    }
    const field = document.createElement("div");
    field.className = "field";
    const head = document.createElement("div");
    head.className = "field-head";
    const label = document.createElement("span");
    label.className = "field-label";
    label.textContent = f.label;
    head.append(label);
    const input = document.createElement(f.kind === "text" ? "textarea" : "input");
    if (f.kind === "text") {
        input.rows = 4;
    } else {
        input.type = "text";
    }
    if (f.kind === "price") input.setAttribute("inputmode", "decimal");
    if (f.kind === "count") {
        input.setAttribute("inputmode", "numeric");
        input.className = "quantity";
    }
    input.setAttribute("aria-label", f.label);
    input.setAttribute("autocomplete", "off");
    input.value = String(values[f.key]);
    input.disabled = locked;
    if (from) input.placeholder = from.value;
    input.addEventListener("input", () => {
        values[f.key] = input.value;
    });
    if (venue === "craigslist") {
        // "" clears the override: the PC derives the field from eBay again
        head.append(
            actionButton("clear", "link clear", locked, () => {
                values[f.key] = "";
                input.value = "";
            })
        );
    }
    field.append(head, input);
    return field;
}

/**
 * Save: one PATCH with only the fields changed (patchBody); nothing changed sends
 * nothing. The row the PC answers is shown; a refusal is said under Save and the
 * inputs stay as typed.
 */
async function saveEdit(venue) {
    const c = admin.cards[venue];
    const row = admin.row;
    const pc = settings();
    if (!c.edit || !row || !pc || rowBusy()) return;
    const { body, error } = patchBody(venue, c.edit.before, c.edit.values);
    if (!body) {
        if (error) c.edit.error = error;
        else c.edit = null;
        renderCards();
        return;
    }
    const mine = admin.shown;
    c.wait = "saving";
    c.edit.error = "";
    renderCards();
    let whole;
    try {
        whole = await patchRow(pc, row.sku, body);
    } catch (e) {
        if (mine !== admin.shown) return;
        if (e.status === 0 || e.status === 401) heard(e.status);
        c.wait = "";
        c.edit.error = e.message;
        renderCards();
        return;
    }
    if (mine !== admin.shown) return;
    heard(200);
    c.wait = "";
    c.edit = null;
    c.note = null;
    c.job = null;
    admin.changed = true;
    refreshRow({ ...whole, sku: row.sku });
}

/** An empty card's Add: the row goes on that venue, and the card fills with its derived fields. */
async function addTo(venue) {
    const c = admin.cards[venue];
    const row = admin.row;
    const pc = settings();
    if (!row || !pc || rowBusy()) return;
    const mine = admin.shown;
    c.note = null;
    c.wait = `adding ${venue}`;
    renderCards();
    let whole;
    try {
        whole = await addVenue(pc, row.sku, venue);
    } catch (e) {
        if (mine !== admin.shown) return;
        if (e.status === 0 || e.status === 401) heard(e.status);
        c.wait = "";
        c.note = { text: e.message, kind: "bad" };
        renderCards();
        return;
    }
    if (mine !== admin.shown) return;
    heard(200);
    c.wait = "";
    admin.changed = true;
    admin.folds[venue] = true;
    refreshRow({ ...whole, sku: row.sku });
}

/**
 * Post on a venue (the row the PC saved, by its sku), Refresh status or End
 * listing: the job is sent, its line is the card's status line, polled every
 * POLL_MS like a venue button's, and once done the row is read again (the link a
 * post put up, the status a refresh or an end read). An End the PC refuses (400:
 * Craigslist cannot be ended from here) says why, and its button goes.
 */
async function runAction(venue, action) {
    const c = admin.cards[venue];
    const row = admin.row;
    const pc = settings();
    if (!row || !pc || rowBusy()) return;
    const mine = admin.shown;
    c.confirm = false;
    c.note = null;
    c.job = null;
    c.wait = "sending";
    renderCards();
    const body = action === "post" ? jobRequest({ venue, sku: row.sku }) : actionJob(action, { sku: row.sku, venue });
    let answer;
    try {
        answer = await postJob(pc, body);
    } catch (e) {
        if (mine !== admin.shown) return;
        if (e.status === 0 || e.status === 401) heard(e.status);
        c.wait = "";
        c.note = { text: e.message, kind: "bad" };
        if (action === "end" && e.status === 400) c.noEnd = true;
        renderCards();
        return;
    }
    if (mine !== admin.shown) return;
    heard(200);
    c.wait = "";
    c.job = { action, job: answer.job, state: answer.state || "queued", ahead: answer.ahead };
    renderCards();
    pollCard(venue, mine);
}

function pollCard(venue, mine) {
    const c = admin.cards[venue];
    clearTimeout(c.timer);
    c.timer = setTimeout(() => {
        askCard(venue, mine).catch(() => {});
    }, POLL_MS);
}

async function askCard(venue, mine) {
    const c = admin.cards[venue];
    const pc = settings();
    if (mine !== admin.shown || !pc || !c.job) return;
    let status;
    try {
        status = await getJob(pc, c.job.job);
    } catch (e) {
        if (mine !== admin.shown) return;
        if (e.status === 0) {
            // the job is safe on the PC's disk: keep asking
            c.job = { ...c.job, trouble: e.message };
            paintLine(venue);
            pollCard(venue, mine);
            return;
        }
        status = { state: "failed", error: e.message };
    }
    if (mine !== admin.shown) return;
    c.job = { ...c.job, ...status, trouble: "" };
    if (jobRunning(c.job)) {
        paintLine(venue);
        pollCard(venue, mine);
        return;
    }
    if (c.job.state !== "done") {
        renderCards();
        return;
    }
    admin.changed = true;
    let whole;
    try {
        whole = await getRow(pc, admin.row.sku);
    } catch (e) {
        if (mine !== admin.shown) return;
        detailLine(`Could not read ${admin.row.sku}: ${e.message}.`);
        renderCards();
        return;
    }
    if (mine !== admin.shown) return;
    refreshRow({ ...whole, sku: admin.row.sku });
}

/** The photo strip under the heading: an 88 px tile per photo, its picture on its way (fetchRowPhotos). */
function renderDetailPhotos(row) {
    admin.photoTiles.clear();
    const photos = rowPhotos(row);
    if (photos.length === 0) {
        const none = document.createElement("p");
        none.className = "small";
        none.textContent = Array.isArray(row.photos) ? "No photos." : "Reading the photos...";
        el.detailPhotos.replaceChildren(none);
        return;
    }
    const strip = document.createElement("ul");
    strip.className = "strip";
    for (const p of photos) {
        const li = document.createElement("li");
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = "thumb";
        tile.disabled = true;
        tile.textContent = "...";
        tile.setAttribute("aria-label", `${p.name}, full size`);
        tile.addEventListener("click", () => {
            const url = admin.pictures.get(p.n);
            if (url) openPhoto(url, p.name, tile);
        });
        admin.photoTiles.set(p.n, tile);
        li.append(tile);
        strip.append(li);
    }
    el.detailPhotos.replaceChildren(strip);
}

/**
 * The detail's photos, one at a time, each into its tile; a tap then shows it
 * full size. One the PC cannot give says so; no answer stops the rest, as does
 * leaving the detail.
 */
async function fetchRowPhotos(pc, mine) {
    const row = admin.row;
    for (const p of rowPhotos(row)) {
        const tile = admin.photoTiles.get(p.n);
        let blob;
        try {
            blob = await getRowPhoto(pc, row.sku, p.n);
        } catch (e) {
            if (e.status === 0 || mine !== admin.shown) return;
            tile.textContent = "not on the PC";
            continue;
        }
        if (mine !== admin.shown) return;
        const url = URL.createObjectURL(blob);
        admin.pictures.set(p.n, url);
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        tile.replaceChildren(img);
        tile.disabled = false;
    }
}

/** The detail's pictures let go: the detail is leaving the screen. */
function dropPictures() {
    closePhoto();
    for (const url of admin.pictures.values()) URL.revokeObjectURL(url);
    admin.pictures.clear();
    admin.photoTiles.clear();
    el.detailPhotos.replaceChildren();
}

/** The list on screen, as it was left (no new query); the detail's answers still on their way are dropped. */
function showList() {
    admin.shown += 1;
    dropPictures();
    dropCards();
    admin.row = null;
    admin.from = null;
    admin.changed = false;
    el.inventoryDetail.hidden = true;
    el.inventoryBrowse.hidden = false;
}

/**
 * Back to the list: on the row the detail was opened from, however long the list.
 * A card that changed the row has the list asked for again, so it says what the PC says now.
 */
function backToList() {
    const from = admin.from;
    const changed = admin.changed;
    showList();
    if (changed) {
        loadInventory().catch(() => {});
        return;
    }
    if (from && typeof from.scrollIntoView === "function") from.scrollIntoView({ block: "center" });
}

/** A photo full size over everything (Michal: "if clicking on a photo - should bring [it up full size]"). */
function openPhoto(url, name, opener) {
    admin.opener = opener;
    el.photoViewImg.src = url;
    el.photoViewImg.alt = name;
    el.photoView.hidden = false;
    el.photoViewClose.focus();
}

function closePhoto() {
    if (el.photoView.hidden) return;
    el.photoView.hidden = true;
    const opener = admin.opener;
    admin.opener = null;
    if (opener) opener.focus();
}

/**
 * The sync bar's two buttons: the sync job is sent, its line under them (queued,
 * the PC's step, its summary or its error), polled every POLL_MS; both lock until
 * it ends, and once done the inventory list is asked for again. A refusal shows
 * the PC's words. The job is the PC's: closing Admin leaves it running and polled.
 */
async function startSync(direction) {
    if (sync.wait || jobRunning(sync.job)) return;
    const pc = settings();
    sync.job = null;
    if (!pc) {
        sync.note = { text: "Set the PC address and key under Settings first.", kind: "bad" };
        renderSync();
        return;
    }
    sync.note = null;
    sync.wait = "sending";
    renderSync();
    let answer;
    try {
        answer = await postJob(pc, actionJob("sync", { direction }));
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        sync.wait = "";
        sync.note = { text: e.message, kind: "bad" };
        renderSync();
        return;
    }
    heard(200);
    sync.wait = "";
    sync.job = { action: "sync", direction, job: answer.job, state: answer.state || "queued", ahead: answer.ahead };
    renderSync();
    scheduleSync();
}

function scheduleSync() {
    clearTimeout(sync.timer);
    sync.timer = setTimeout(() => {
        askSync().catch(() => {});
    }, POLL_MS);
}

async function askSync() {
    const pc = settings();
    if (!pc || !sync.job) return;
    let status;
    try {
        status = await getJob(pc, sync.job.job);
    } catch (e) {
        if (e.status === 0) {
            sync.job = { ...sync.job, trouble: e.message };
            renderSync();
            scheduleSync();
            return;
        }
        status = { state: "failed", error: e.message };
    }
    sync.job = { ...sync.job, ...status, trouble: "" };
    renderSync();
    if (jobRunning(sync.job)) {
        scheduleSync();
        return;
    }
    if (sync.job.state !== "done" || el.admin.hidden || !admin.inventoryOpen) return;
    // a listing open in place of the list: the list is asked for again on the way back
    if (admin.row) admin.changed = true;
    else loadInventory().catch(() => {});
}

function renderSync() {
    const line = sync.wait ? { text: sync.wait, kind: "busy" } : sync.job ? syncLine(sync.job) : sync.note;
    el.syncStatus.textContent = line ? line.text : "";
    el.syncStatus.className = line && line.kind ? `sync-status ${line.kind}` : "sync-status";
    const locked = !!sync.wait || jobRunning(sync.job);
    el.syncFrom.disabled = locked;
    el.syncTo.disabled = locked;
}

// --- the server check ----------------------------------------------------------
// The page asks the PC by itself (on load, every HEALTH_MS while on screen, when
// back online or back on screen) and shows "server ok" / "server off" in the
// header and in Settings. Every other call to the PC updates it too.

function renderServer() {
    const line = serverLine(!!settings(), serverStatus);
    for (const node of [el.server, el.settingsServer]) {
        node.textContent = line.text;
        node.classList.toggle("ok", line.kind === "ok");
        node.classList.toggle("bad", line.kind === "bad");
    }
}

/** What the PC last said: 200, or the PcError status (0 = no answer). */
function heard(status) {
    serverStatus = status;
    renderServer();
}

function scheduleHealth() {
    clearTimeout(healthTimer);
    healthTimer = null;
    if (settings() && document.visibilityState === "visible") {
        healthTimer = setTimeout(() => {
            checkServer().catch(() => {});
        }, HEALTH_MS);
    }
}

async function checkServer() {
    if (checking) return;
    const pc = settings();
    if (!pc) {
        heard(null);
        return;
    }
    checking = true;
    try {
        await checkPc(pc);
        heard(200);
        // the PC is back: waiting photos go now, not after the retry pause
        let stalled = false;
        for (const m of MODES) {
            if (!slots[m].stalled) continue;
            stalled = true;
            clearTimeout(resumeTimers[m]);
            setState(m, reduce(slots[m], { type: "resume" }));
        }
        if (stalled) pump();
    } catch (e) {
        heard(e instanceof PcError ? e.status : 0);
    } finally {
        checking = false;
        scheduleHealth();
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
        heard(200);
        el.settingsStatus.textContent = "Saved. The PC answers and knows this key.";
    } catch (e) {
        heard(e instanceof PcError ? e.status : 0);
        el.settingsStatus.textContent = `Saved, but: ${e.message}.`;
    }
    scheduleHealth();
    // photos taken before the settings were right go now
    for (const m of MODES) setState(m, reduce(slots[m], { type: "resume" }));
    pump();
    retryLookup();
    if (admin.inventoryOpen) loadInventory().catch(() => {});
}

// --- a reload: the item back from the PC -----------------------------------------

/** `saved` (an item as savedItem keeps it) read back from the PC onto its kind's screen. */
async function restore(m, saved) {
    if (!saved || typeof saved.itemId !== "string" || !saved.itemId) return;
    const itemName = typeof saved.itemName === "string" ? saved.itemName : "";
    const pc = settings();
    if (!pc || !itemName) {
        keepSaved[m] = true; // read it back once Settings are right and the page is reloaded
        return;
    }
    restoring[m] = true;
    if (m === "goods") el.itemInput.value = itemName;
    setState(m, reduce(slots[m], { type: "setItem", itemName }));
    const mine = generation[m];
    try {
        const answer = await getItem(pc, saved.itemId);
        if (mine !== generation[m]) return; // back or forward moved on meanwhile
        restoring[m] = false;
        const ai = Array.isArray(saved.ai) ? saved.ai : [];
        setState(
            m,
            reduce(slots[m], {
                type: "recovered",
                mode: m,
                itemName,
                itemId: saved.itemId,
                ai,
                answer,
                book: saved,
                customize: saved.customize,
            })
        );
        noteBox(m).value = slots[m].note.text;
        fillCustomize(m);
        if (m === "book") {
            el.bookIsbn.value = slots.book.book.isbn;
            fillManual();
            el.bookPrice.value = slots.book.book.price;
            retryLookup(); // saved before the lookup answered: ask again
        }
        syncCounter(m);
        for (const venue of VENUES) {
            if (isActive(slots[m].jobs[venue])) schedulePoll(m, venue, generation[m]);
        }
        fetchPictures(m, pc).catch(() => {});
    } catch (e) {
        if (mine !== generation[m]) return;
        restoring[m] = false;
        if (m === "goods") el.itemInput.value = "";
        if (e.status === 404) {
            say(`${itemName} is no longer on the PC.`, "warn");
            setState(m, reduce(slots[m], { type: "reset" }));
        } else {
            // leave the saved item alone: a reload once the PC answers brings it back
            keepSaved[m] = true;
            say(`Could not read ${itemName} back from the PC (${e.message}). Its photos are safe there; reload when the PC answers.`, "warn");
            setState(m, reduce(slots[m], { type: "reset" }));
        }
    }
}

/**
 * The pictures of an item read back from the PC (a reload, back), fetched one
 * at a time into the strip: the phone keeps none past NEXT, and he wants to
 * "go back and see same photos" (Michal, 2026-10-03). A picture the PC cannot
 * give (a 404) stays "on the PC"; no answer at all stops the rest, as would
 * NEXT, back or forward meanwhile.
 */
async function fetchPictures(m, pc) {
    const mine = generation[m];
    const itemId = slots[m].itemId;
    for (const p of slots[m].photos.filter((photo) => !photo.local && !blobs.has(photo.id))) {
        let blob;
        try {
            blob = await getPhoto(pc, itemId, p.n);
        } catch (e) {
            if (e.status === 0) return;
            continue;
        }
        if (mine !== generation[m]) return;
        if (!slots[m].photos.some((photo) => photo.id === p.id)) continue; // the x took it meanwhile
        blobs.set(p.id, { file: null, url: URL.createObjectURL(blob), shrunk: blob, ready: null });
        render();
    }
}

// --- wiring ----------------------------------------------------------------

/**
 * NEXT (it was DONE): the next item of this kind. A listing still posting is
 * the PC's now: its polls stop here (the generation bump drops any answer
 * already on its way) and its link is not shown -- he asked not to babysit an
 * upload. Photos and deletes not yet on the PC keep NEXT shut (doneButton), so
 * nothing the queue still owes the PC is dropped.
 */
async function nextItem(m) {
    if (!doneButton(slots[m]).enabled) return;
    if (slots[m].itemId && !(await noteReady(m))) {
        say("The note has not reached the PC yet. NEXT again once it has.", "warn");
        return;
    }
    // the note's wait may have let something change: check again before clearing
    if (!doneButton(slots[m]).enabled) return;
    // back had brought an earlier item up (kept current in its place already):
    // NEXT returns to the items in hand, the newest place in the walk
    if (viewing[m]) {
        globalThis.history.go(readHistory().length + 1 - cursor);
        return;
    }
    // every item with a folder on the PC stays reachable with the browser's back button,
    // posted or not (Michal, 2026-10-03: "go back and see same photos, even if I did not
    // post yet"; until then one nothing was posted from was deleted on the PC)
    const record = savedItem(slots[m]);
    if (record) writeJson("localStorage", HISTORY_KEY, remembered(readHistory(), record));
    clearItem(m);
    say("");
    keepSaved[m] = false;
    customizeOpen[m] = false; // the next item starts folded, at one, shipped, a quick sale, posted
    setState(m, reduce(slots[m], { type: "reset" }));
    fillCustomize(m);
    // the walk is at the items in hand again, one place further when the list grew;
    // the other kind's screen leaves an earlier item it was showing
    pushTo(readHistory().length + 1);
    for (const k of MODES) if (viewing[k]) bringUp(k, null).catch(() => {});
    // a book starts with Scan, not the keyboard
    if (m === "goods") el.itemInput.focus();
}

/** Everything of the shown item that lives in this page's memory, let go. */
function clearItem(m) {
    generation[m] += 1;
    for (const venue of VENUES) {
        clearTimeout(polls.get(`${m}:${venue}`));
        polls.delete(`${m}:${venue}`);
    }
    clearTimeout(resumeTimers[m]);
    resumeTimers[m] = null;
    clearTimeout(noteTimers[m]);
    noteTimers[m] = null;
    // this item's pictures only: the other kind's item is still in progress
    for (const p of slots[m].photos) {
        const held = blobs.get(p.id);
        if (!held) continue;
        URL.revokeObjectURL(held.url);
        blobs.delete(p.id);
    }
    noteBox(m).value = "";
    if (m === "goods") {
        el.itemInput.value = "";
    } else {
        clearTimeout(isbnTimer);
        isbnTimer = null;
        clearTimeout(titleTimer);
        titleTimer = null;
        scan = "";
        el.bookIsbn.value = "";
        el.bookPrice.value = "";
        el.bookTitleInput.value = "";
        el.bookAuthor.value = "";
        el.bookYear.value = "";
    }
}

// --- back and forward: the walk through the items NEXT left ----------------------
//
// Michal, 2026-10-03: "the back and forward on browser is like a cache of a
// session - it should work in both directions and should, actually work for lets
// say, 10 items back and then 10 items forward. beyond that it should say
// something like - 'end of item history - see inventory lists' - instead of just
// quitting and loosing all cache". (Until then the page kept a single entry to go
// back from, so forward found none of its own and left the page.)
//
// The browser's own entries mirror the walk, one per place (walkPosition): the
// floor, each item NEXT left (oldest first), the items in hand last. Back and
// forward are the browser's, both ways, and a reload keeps the place
// (history.state). Back onto the floor says the history ends and steps forward
// again: back never leaves the page.
//
// One walk for both kinds, in the order NEXT left them, not one per kind: the
// browser has one line of entries, and rebuilding it on every mode switch would
// mean navigating it. An item brought up shows on its kind's screen; the items
// in hand come back on the kind last chosen with the switch, which leaves the
// entries alone. An entry names a place, not an item: when the oldest item falls
// off the list, every entry names the next one along and the floor still ends it.

/** Entries for the places after the current one up to `at`, which becomes current. */
function pushTo(at) {
    for (let j = cursor + 1; j <= at; j += 1) globalThis.history.pushState({ snap: j }, "");
    cursor = at;
}

/** On load: the entries a reload left (their place), or the walk mirrored afresh with the items in hand current. */
function startWalk() {
    const list = readHistory();
    const at = walkPosition(globalThis.history.state, list.length);
    if (at > 0) {
        cursor = at;
        return list[at - 1] || null;
    }
    globalThis.history.replaceState({ snap: 0 }, "");
    cursor = 0;
    pushTo(list.length + 1);
    return null;
}

function onPopState(e) {
    const list = readHistory();
    const at = walkPosition(e.state, list.length);
    if (at < 0 || at === cursor) return; // not the walk's, or the step back off the floor
    if (at === 0) {
        say(HISTORY_END);
        globalThis.history.go(1);
        return;
    }
    walkTo(at, list).catch(() => {});
}

/**
 * Place `at` on screen: an item NEXT left, as it was left, read back from the
 * PC like a reload (its photos fetched back, note, price, title, the links;
 * Michal, 2026-10-02: "when I press next but then want to go back and see how
 * much that other thing posted for"), or the items in hand. Whichever screen
 * does not show the item shows its own item in hand.
 */
async function walkTo(at, list) {
    const forward = at > cursor;
    cursor = at;
    const record = list[at - 1] || null;
    const kind = record ? recordKind(record) : chosenMode();
    showMode(kind);
    say(record ? walkLine(record, forward) : presentNote(inHand(kind)));
    const changing = MODES.filter((m) => {
        const shown = shownAt(m, record);
        return viewing[m] !== (shown ? shown.itemId : "");
    });
    await Promise.all(changing.map((m) => bringUp(m, shownAt(m, record))));
}

/** What a kind's screen shows at a place holding `record`: the item, when of its kind; null, the item in hand. */
function shownAt(m, record) {
    return record && recordKind(record) === m ? record : null;
}

/** The line for an item the walk brought up; NEXT then returns to the item in hand of the kind last chosen. */
function walkLine(record, forward) {
    return walkNote(record, forward, !!inHand(chosenMode()));
}

/** `record` (an item from the history; null: the item in hand) read back from the PC onto its kind's screen. */
async function bringUp(m, record) {
    const saved = record || inHand(m);
    clearItem(m);
    viewing[m] = record ? record.itemId : "";
    restoring[m] = false; // a read back still on its way is dropped (the generation moved on)
    keepSaved[m] = true; // the screen clears without dropping the item in hand from storage
    setState(m, reduce(slots[m], { type: "reset" }));
    keepSaved[m] = false;
    lastSaved[m] = null;
    await restore(m, saved);
}

function onFiles(handler) {
    return (e) => {
        handler(e.target.files);
        e.target.value = "";
    };
}

function main() {
    Object.assign(el, {
        adminToggle: $("admin-toggle"),
        admin: $("admin"),
        adminClose: $("admin-close"),
        settingsToggle: $("settings-toggle"),
        settings: $("settings"),
        pcAddress: $("pc-address"),
        pcKey: $("pc-key"),
        settingsSave: $("settings-save"),
        settingsStatus: $("settings-status"),
        settingsServer: $("settings-server"),
        inventoryToggle: $("inventory-toggle"),
        inventory: $("inventory"),
        inventoryBrowse: $("inventory-browse"),
        inventorySearch: $("inventory-search"),
        inventoryStatus: $("inventory-status"),
        inventoryVenues: INVENTORY_VENUES.map((value) => ({ value, node: $(`inventory-venue-${value || "all"}`) })),
        inventoryStates: INVENTORY_STATUSES.map((value) => ({ value, node: $(`inventory-state-${value || "all"}`) })),
        inventoryPhotos: $("inventory-photos"),
        inventorySorts: INVENTORY_SORTS.map(({ key }) => ({ value: key, node: $(`inventory-sort-${key}`) })),
        inventoryList: $("inventory-list"),
        inventoryDetail: $("inventory-detail"),
        inventoryBack: $("inventory-back"),
        detailHeading: $("detail-heading"),
        detailStatus: $("detail-status"),
        detailPhotos: $("detail-photos"),
        detailFolds: Object.fromEntries(
            VENUES.map((v) => [v, { toggle: $(`detail-${v}-toggle`), card: $(`detail-${v}`) }])
        ),
        syncFrom: $("sync-from"),
        syncTo: $("sync-to"),
        syncStatus: $("sync-status"),
        photoView: $("photo-view"),
        photoViewImg: $("photo-view-img"),
        photoViewClose: $("photo-view-close"),
        server: $("server"),
        modes: $("modes"),
        modeGoods: $("mode-goods"),
        modeBook: $("mode-book"),
        work: $("work"),
        itemInput: $("item-name"),
        cleaned: $("cleaned"),
        hint: $("hint"),
        snapInput: $("snap-input"),
        snapLabel: $("snap-label"),
        snapText: $("snap-word"),
        galleryInput: $("gallery-input"),
        galleryLabel: $("gallery-label"),
        progress: $("progress"),
        strip: $("strip"),
        note: $("note"),
        noteStatus: $("note-status"),
        titleLine: $("title-line"),
    priceLine: $("price-line"),
    ebayBtn: $("ebay-btn"),
    ebayCancel: $("ebay-cancel"),
    craigslistCancel: $("craigslist-cancel"),
        ebayStatus: $("ebay-status"),
        ebayLink: $("ebay-link"),
        craigslistBtn: $("craigslist-btn"),
        craigslistStatus: $("craigslist-status"),
        craigslistLink: $("craigslist-link"),
        customizeToggle: $("customize-toggle"),
        customize: $("customize"),
        quantity: $("quantity"),
        pickupOnly: $("pickup-only"),
        pricing: $("pricing"),
        pricingWords: PRICING.map(({ grade }) => $(`pricing-${grade}`)),
        pricingNote: $("pricing-note"),
        autoPost: $("auto-post"),
        venueHint: $("venue-hint"),
        doneHint: $("done-hint"),
        nextBtn: $("next-item"),
        nextNote: $("next-note"),
        book: $("book"),
        bookHint: $("book-hint"),
        bookScanLabel: $("book-scan-label"),
        bookScanInput: $("book-scan-input"),
        bookIsbn: $("book-isbn"),
        bookNoIsbn: $("book-no-isbn"),
        bookManual: $("book-manual"),
        bookIsbnKept: $("book-isbn-kept"),
        bookTitleInput: $("book-title"),
        bookAuthor: $("book-author"),
        bookYear: $("book-year"),
        formatChips: FORMATS.map(({ value }) => ({ value, node: $(`book-format-${value}`) })),
        bookFound: $("book-found"),
        bookLookup: $("book-lookup"),
        bookCardTitle: $("book-card-title"),
        bookAuthors: $("book-authors"),
        bookDetails: $("book-details"),
        bookMatch: $("book-match"),
        bookSnapLabel: $("book-snap-label"),
        bookSnapInput: $("book-snap-input"),
        bookGalleryLabel: $("book-gallery-label"),
        bookGalleryInput: $("book-gallery-input"),
        bookProgress: $("book-progress"),
        bookStrip: $("book-strip"),
        chips: CONDITIONS.map(({ value }) => ({ value, node: $(`book-condition-${value}`) })),
        bookPrice: $("book-price"),
        bookPriceNote: $("book-price-note"),
        bookFlaws: $("book-flaws"),
        bookNoteStatus: $("book-note-status"),
        bookCustomizeToggle: $("book-customize-toggle"),
        bookCustomize: $("book-customize"),
        bookQuantity: $("book-quantity"),
        bookPickupOnly: $("book-pickup-only"),
        bookPricing: $("book-pricing"),
        bookPricingWords: PRICING.map(({ grade }) => $(`book-pricing-${grade}`)),
        bookPricingNote: $("book-pricing-note"),
        bookAutoPost: $("book-auto-post"),
        bookTitleLine: $("book-title-line"),
    bookPriceLine: $("book-price-line"),
    bookEbayBtn: $("book-ebay-btn"),
    bookEbayCancel: $("book-ebay-cancel"),
        bookEbayStatus: $("book-ebay-status"),
        bookEbayLink: $("book-ebay-link"),
        bookVenueHint: $("book-venue-hint"),
        bookDoneHint: $("book-done-hint"),
        bookNextBtn: $("book-next-item"),
        bookNextNote: $("book-next-note"),
        offline: $("offline"),
        message: $("message"),
        version: $("version"),
    });

    el.version.textContent = VERSION;
    // goods unless this phone was last used for books; a reload on an item back brought up shows its kind
    const walked = startWalk();
    mode = walked ? recordKind(walked) : chosenMode();
    for (const m of MODES) slots[m] = reduce(slots[m], { type: "online", online: navigator.onLine });
    render();

    renderServer();

    el.adminToggle.addEventListener("click", toggleAdmin);
    el.adminClose.addEventListener("click", () => showAdmin(false));
    el.settingsToggle.addEventListener("click", toggleSettings);
    el.settingsSave.addEventListener("click", () => {
        saveSettings().catch(() => {});
    });
    el.inventoryToggle.addEventListener("click", () => showInventory(!admin.inventoryOpen));
    el.inventorySearch.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            loadInventory().catch(() => {});
        }, INVENTORY_DEBOUNCE_MS);
    });
    el.inventorySearch.addEventListener("keydown", (e) => {
        if (e.key === "Enter") loadInventory().catch(() => {});
    });
    for (const { value, node } of el.inventoryVenues) node.addEventListener("click", () => onFilter("venue", value));
    for (const { value, node } of el.inventoryStates) node.addEventListener("click", () => onFilter("status", value));
    for (const { value, node } of el.inventorySorts) node.addEventListener("click", () => onFilter("sort", value));
    el.inventoryPhotos.addEventListener("change", () => {
        loadInventory().catch(() => {});
    });
    el.inventoryBack.addEventListener("click", backToList);
    for (const [venue, { toggle, card }] of Object.entries(el.detailFolds)) {
        toggle.addEventListener("click", () => {
            admin.folds[venue] = card.hidden;
            renderFolds();
        });
    }
    el.syncFrom.addEventListener("click", () => {
        startSync("from").catch(() => {});
    });
    el.syncTo.addEventListener("click", () => {
        startSync("to").catch(() => {});
    });
    renderSync();
    // the full-size photo: Close, or a tap anywhere on it, or Escape on a keyboard
    el.photoView.addEventListener("click", closePhoto);
    el.photoViewClose.addEventListener("click", closePhoto);
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closePhoto();
    });
    el.modeGoods.addEventListener("click", () => setMode("goods"));
    el.modeBook.addEventListener("click", () => setMode("book"));

    el.itemInput.addEventListener("input", onItemNameChanged);
    el.note.addEventListener("input", () => onNoteInput("goods"));
    el.note.addEventListener("blur", () => noteDue("goods"));
    el.snapInput.addEventListener(
        "change",
        onFiles((files) => {
            acceptFiles("goods", files);
            snapUnderThumb();
        })
    );
    el.galleryInput.addEventListener("change", onFiles((files) => acceptFiles("goods", files)));
    for (const venue of VENUES) {
        el[`${venue}Btn`].addEventListener("click", () => {
            send("goods", venue).catch(() => {});
        });
    }
    el.nextBtn.addEventListener("click", () => {
        nextItem("goods").catch(() => {});
    });

    el.bookScanInput.addEventListener(
        "change",
        onFiles((files) => {
            onScan(files).catch(() => {});
        })
    );
    el.bookIsbn.addEventListener("input", onIsbnInput);
    el.bookNoIsbn.addEventListener("click", onNoIsbn);
    el.bookTitleInput.addEventListener("input", () => onManualInput("title", el.bookTitleInput));
    el.bookAuthor.addEventListener("input", () => onManualInput("author", el.bookAuthor));
    el.bookYear.addEventListener("input", () => onManualInput("year", el.bookYear));
    for (const { value, node } of el.formatChips) {
        node.addEventListener("click", () =>
            setState("book", reduce(slots.book, { type: "bookFormat", format: value }))
        );
    }
    el.bookSnapInput.addEventListener("change", onFiles((files) => acceptFiles("book", files)));
    el.bookGalleryInput.addEventListener("change", onFiles((files) => acceptFiles("book", files)));
    for (const { value, node } of el.chips) {
        node.addEventListener("click", () =>
            setState("book", reduce(slots.book, { type: "bookCondition", condition: value }))
        );
    }
    el.bookPrice.addEventListener("input", () =>
        setState("book", reduce(slots.book, { type: "bookPrice", text: el.bookPrice.value }))
    );
    el.bookFlaws.addEventListener("input", () => onNoteInput("book"));
    el.bookFlaws.addEventListener("blur", () => noteDue("book"));
    el.bookEbayBtn.addEventListener("click", () => {
        send("book", "ebay").catch(() => {});
    });
    el.bookEbayCancel.addEventListener("click", () => {
        cancelPress("book", "ebay").catch(() => {});
    });
    for (const venue of VENUES) {
        el[`${venue}Cancel`].addEventListener("click", () => {
            cancelPress("goods", venue).catch(() => {});
        });
    }
    el.bookNextBtn.addEventListener("click", () => {
        nextItem("book").catch(() => {});
    });

    for (const m of MODES) {
        const nodes = customizeNodes(m);
        nodes.toggle.addEventListener("click", () => {
            customizeOpen[m] = !customizeOpen[m];
            render();
        });
        nodes.quantity.addEventListener("input", () =>
            setState(m, reduce(slots[m], { type: "setQuantity", text: nodes.quantity.value }))
        );
        nodes.pickup.addEventListener("change", () =>
            setState(m, reduce(slots[m], { type: "setPickupOnly", on: nodes.pickup.checked }))
        );
        nodes.pricing.addEventListener("input", () =>
            setState(m, reduce(slots[m], { type: "setPricing", grade: nodes.pricing.value }))
        );
        nodes.autoPost.addEventListener("change", () =>
            setState(m, reduce(slots[m], { type: "setAutoPost", on: nodes.autoPost.checked }))
        );
    }

    window.addEventListener("online", () => {
        for (const m of MODES) setState(m, reduce(slots[m], { type: "online", online: true }));
        pump();
        checkServer().catch(() => {});
        retryLookup();
    });
    window.addEventListener("offline", () => {
        for (const m of MODES) setState(m, reduce(slots[m], { type: "online", online: false }));
    });
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            for (const m of MODES) noteDue(m);
            clearTimeout(healthTimer); // no checks while the phone is in a pocket
            healthTimer = null;
        } else {
            checkServer().catch(() => {});
        }
    });
    window.addEventListener("beforeunload", (e) => {
        if (MODES.some((m) => leaveWarning(slots[m]))) {
            e.preventDefault();
            e.returnValue = "";
        }
    });

    window.addEventListener("popstate", onPopState);

    if (walked) say(walkLine(walked, false));
    for (const m of MODES) {
        const record = shownAt(m, walked);
        viewing[m] = record ? record.itemId : "";
        restore(m, record || inHand(m)).catch(() => {});
    }
    checkServer().catch(() => {});
}

main();
