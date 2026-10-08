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

import { VERSION } from "./version.js?v=2.14.0";
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
    pricingGrade,
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
    CANCELLED,
    CONTINUE,
    PAUSED,
    RESET,
    SEND_DELAY_MS,
    TAP_TO_CANCEL,
    taskCancel,
    taskTap,
    TOO_LATE,
    TOO_LATE_MS,
    venueTap,
    snapScrollTop,
    snapWord,
    statusBarColors,
    THEMES,
    themeAttr,
    themeOf,
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
    customizeButtons,
    customizeChanges,
    customizeLine,
    customizeSaved,
    DERIVED,
    derivedFields,
    EDIT_FIELDS,
    editValues,
    endQuestion,
    followRow,
    followSummary,
    inventoryCount,
    inventoryRows,
    jobRunning,
    leftUnsynced,
    patchBody,
    priceWord,
    quantityValue,
    rowBadges,
    rowCustomize,
    rowHeading,
    rowPhotos,
    rowTitle,
    rowVenues,
    sliderWords,
    busyLine,
    syncLine,
    unsyncedList,
    unsyncedWith,
    unsyncedWithout,
    venueActions,
    venueBadge,
    venueFacts,
    venueName,
    venueStatus,
    DIAL_DELAY_MS,
    DIAL_REPEAT_MS,
    dialBody,
    dialPrice,
    dialStep,
    DEFAULT_SERVER,
    checkEmail,
    loginToken,
    sessionOf,
    LINK_SENT,
    SIGNIN_MISSING,
    SIGNIN_EXPIRED,
    signinError,
    signinWords,
    signupOf,
    meOf,
    CRAIGSLIST_OFF,
    venueAllowed,
    accountError,
    creditsLine,
    ebayLine,
    packLabel,
    returnHash,
    returnLine,
    safeLink,
    userLine,
    SELLER_POLL_MAX,
    SELLER_POLL_MS,
    addressBody,
    sellerError,
    sellerLine,
    sellerOf,
    installState,
    installSteps,
    isIosDevice,
    FEEDBACK_SENT,
    feedbackBody,
    feedbackScreen,
    STATS_SINCE,
    DEFAULT_STATS_SINCE,
    statsTable,
    DEFAULTS_SAVED,
    DEFAULTS_SAVED_MS,
    applyDefaults,
    customizeDefaults,
    defaultsOf,
    conditionChoices,
    conditionRefused,
    inventorySku,
    UNDO_MS,
    archiveError,
    archivedLine,
    swipeState,
    feedbackWord,
    inboxHead,
    inboxOf,
    pendingLine,
    refusalLine,
    signupStep,
} from "./core.js?v=2.14.0";
import { badgeText, NOTE_DEBOUNCE_MS, nextTask, noteDirty, retryDelayMs } from "./queue.js?v=2.14.0";
import {
    addVenue,
    archiveRow,
    askLink,
    cancelJob,
    checkout,
    checkPc,
    createItem,
    deletePhoto,
    ebayConnect,
    endSession,
    getBook,
    getConditions,
    getFeedbackInbox,
    getInventory,
    getItem,
    getJob,
    getMe,
    getPhoto,
    getRow,
    getRowPhoto,
    getSeller,
    getSignup,
    getStats,
    patchRow,
    patchSeller,
    PcError,
    postFeedback,
    postJob,
    putNote,
    putPhoto,
    reviewFeedback,
    searchBook,
    startSession,
} from "./pc.js?v=2.14.0";
import { shrinkPhoto } from "./shrink.js?v=2.14.0";
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
} from "./book.js?v=2.14.0";
import { canScan, readIsbn } from "./scan.js?v=2.14.0";

const COUNTER_KEY = "snap.counters";
const PC_KEY = "snap.pc";
const KEY_KEY = "snap.key";
const MODE_KEY = "snap.mode";
const THEME_KEY = "snap.theme";
/** The inventory's Show photos: on unless he unticked it on this phone ("off"). */
const PHOTOS_KEY = "snap.inventory.photos";
/** The inventory's Options foldout: folded unless he left it open on this phone ("open"). */
const OPTIONS_KEY = "snap.inventory.options";
/** The listing open in Admin, by sku, so Admin opens back onto it; gone on Back. */
const CARD_KEY = "snap.admin.card";
/**
 * The listings this phone changed since their venue last had them, by sku and venue
 * (unsyncedList): their list badge for that venue offers its sync until a push of theirs
 * (or, for eBay, the sync bar's Sync to eBay) is done.
 */
const UNSYNCED_KEY = "snap.inventory.unsynced";
/**
 * The session a sign-in link made, in localStorage when he kept Keep me signed in ticked,
 * else in sessionStorage (this tab only); used when there is no key.
 */
const SESSION_KEY = "snap.session";
/** Save as default's choices, per kind ({"goods": {...}, "book": {...}}): every new item starts from them. */
const DEFAULTS_KEY = "snap.customize.defaults";
/** When the home-screen banner was put away (an ISO date): it stays away a week. */
const INSTALL_KEY = "snap.install.dismissed";
/** Where each kind of item is kept for a reload: the goods key is the one it always was. */
const SAVED_KEYS = { goods: "snap.item", book: "snap.book" };
/** What app.js draws its own icons in (a listed badge's tick). */
const SVG_NS = "http://www.w3.org/2000/svg";

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
 * GET /me's answer (meOf), in memory only: asked once per load after the first good check,
 * and again after Save and check or a sign-in; null until then and from an older server
 * (a 404), which is everything as before. `meAsked`: asked already for these settings.
 */
let me = null;
let meAsked = false;
/** "<mode>:<venue>" of a venue button the account may not use, once tapped: its line says why. */
const offTaps = new Set();
/**
 * Settings' Account block, as the screen has it: Buy postings' packs unfolded, a checkout or
 * Connect eBay on its way (`busy`), and its line (`status`: the way back from Stripe or eBay,
 * or what went wrong).
 */
const account = { packs: false, busy: false, status: "" };
/**
 * The Account block's Seller address (GET /me/seller), as the screen has it: the server's
 * answer (sellerOf; null until asked, and from an older server's 404, which is no foldout),
 * the foldout open, a Save on its way, its line, "policies ready" to be said (once), the
 * poll's timer while eBay's policies are being set up and how many times it has asked, and
 * `asked`, bumped per ask so a late answer for an older one is dropped.
 */
const seller = { info: null, open: false, busy: false, status: "", ready: false, poll: null, polls: 0, asked: 0 };

/** The way in, while there are no settings: "" the landing, "signin" the sign-in screen. */
let entry = "";
/**
 * GET /auth/signup's word on the landing (Michal, 2026-10-08: "What else do we need for the
 * multi tenant? Let's continue."): anyone with an email may make an account; asked once, and
 * false until the server says so (a 404, no answer: the words as they were).
 */
const signup = { open: false, asked: false };
/** Chrome's install prompt, kept from beforeinstallprompt for our own button; good for one ask. */
let installPrompt = null;
/** Installed from this tab (the prompt accepted): the nudges go. */
let installed = false;
/** The two taps unfolded, under the landing's Install and under the banner's Add. */
const stepsOpen = { landing: false, banner: false };

/** Save as default's "saved as your defaults", per kind, until its moment is over. */
const defaultTimers = { goods: null, book: null };

/** The last job this page sent (any POST /jobs), for Feedback's Include my last job. */
let lastJob = "";
/**
 * Where Feedback is written from: the posting screen Admin was opened from ("goods" or
 * "book"; "admin" with neither behind it), and whether a listing was looked at since.
 */
const visit = { from: "goods", sawCard: false };
/** Admin's Feedback and Stats foldouts, open or folded; the Stats chip; Stats asked, per ask. */
const extras = { feedback: false, stats: false, since: DEFAULT_STATS_SINCE, asked: 0, refused: false };
/**
 * The admin's Feedback inbox (GET /feedback?new=1): its new entries (inboxOf), the ids whose
 * Reviewed is on its way, asked per ask, and refused for good (403, or an older server's 404).
 */
const inbox = { entries: [], busy: new Set(), asked: 0, refused: false };

/**
 * The status bar's colours as index.html gives them, read before a chosen look first
 * changes them, so the device's are put back exactly.
 */
let grounds = { light: "", dark: "" };

/**
 * Admin's screen state (only the screen's: of it only the open listing's sku is
 * stored, under CARD_KEY, and Show photos under PHOTOS_KEY). The filters
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
    /** sku -> its list row's parts on screen (rowNode), repainted in place (paintTile) */
    parts: new Map(),
    /** sku -> its row's job task (jobTask): a + or −'s PATCH on its way (`wait`), its sync badge's push */
    rowTasks: new Map(),
    /** the list's object URLs, revoked when the list changes */
    thumbs: [],
    shown: 0,
    /** venue -> its card open or folded (every one folded as the listing opens) */
    folds: Object.fromEntries(VENUES.map((v) => [v, false])),
    /** venue -> its card's state (blankCard in the Admin section) */
    cards: Object.fromEntries(VENUES.map((v) => [v, blankCard()])),
    /** the listing's customize foldout (blankCustomize in the Admin section) */
    custom: blankCustomize(),
    /** the row on screen, whole once the PC gave it; null on the list, and on a listing reopened by its sku until the PC gives it */
    row: null,
    /** the row button the detail was opened from, to come back to; null on a listing Admin reopened */
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
/**
 * A finger on a list row (the swipe that archives it): its sku, its pointer, where it went
 * down, swipeState's call so far and where it is; null when none is.
 */
let swipe = null;
/** The row last swiped off the list, while the undo bar offers it back, and the bar's timer. */
const undo = { entry: null, timer: null };

/** The sync bar, an Admin job task as a card is (jobTask); its action the direction last pressed ("from" | "to"). */
const sync = jobTask();
/** The sync bar's two words, after their icons. */
const SYNC_WORDS = { from: "Sync from eBay", to: "Sync to eBay" };

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

/** The look chosen in Settings on this phone: "device" until Dark or Light is. */
function chosenTheme() {
    return themeOf(readText("localStorage", THEME_KEY));
}

/**
 * Where calls go and who makes them: the saved PC address and key, checked; else, on a
 * phone signed in by a link, the product's server and the session; null with neither
 * (the landing is then the screen).
 */
function settings() {
    const s = checkSettings(readText("localStorage", PC_KEY), readText("localStorage", KEY_KEY));
    if (s.ok) return { pc: s.pc, key: s.key };
    const session = readSession();
    return session ? { pc: DEFAULT_SERVER, session } : null;
}

/** The session a sign-in link made: kept on the phone, or for this tab only. */
function readSession() {
    return readText("localStorage", SESSION_KEY) || readText("sessionStorage", SESSION_KEY);
}

/** Save as default's choices on this phone, both kinds. */
function readDefaults() {
    return customizeDefaults(readJson("localStorage", DEFAULTS_KEY, null));
}

/** A kind's next item: a fresh screen, its customize from the defaults he saved. */
function freshState(m) {
    return applyDefaults(reduce(slots[m], { type: "reset" }), readDefaults());
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
    // neither screen under Admin (Michal, 2026-10-08: "When I look at a card the posting
    // screen is below. That should not be there"); both items carry on out of sight
    const away = !el.admin.hidden;
    // no settings and no session: the landing (or sign-in) is the whole screen instead
    const out = !settings();
    el.landing.hidden = !out || away || entry === "signin";
    el.signin.hidden = !out || away || entry !== "signin";
    const words = signinWords(signup.open);
    el.landingSignin.textContent = words.button;
    el.signinWhat.textContent = words.what;
    // a sign-up not finished (GET /me): its two steps in place of the posting screens
    const signing = !out && !!signupStep(me);
    el.signupSteps.hidden = !signing || away;
    renderSignup();
    // About and privacy under the landing and Admin; the posting screens keep their foot clear
    el.aboutLink.hidden = !out && !away && !signing;
    el.modes.hidden = out || away || signing;
    el.work.hidden = out || away || signing || mode !== "goods";
    el.book.hidden = out || away || signing || mode !== "book";
    renderInstall(out || away);

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
    if (restoring.goods) el.hint.textContent = "Reading this item back from the server...";
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
    el.seeInventory.hidden = !inventorySku(state);
    let hint = "";
    for (const venue of VENUES) {
        // painted first, then its hint taken: ||= alone would skip painting the second button
        const said = renderVenue("goods", venue, ok, {
            btn: el[`${venue}Btn`],
            reset: el[`${venue}Reset`],
            status: el[`${venue}Status`],
            buy: el[`${venue}Buy`],
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
    el.bookSeeInventory.hidden = !inventorySku(state);
    const venueHint = renderVenue("book", "ebay", !!settings(), {
        btn: el.bookEbayBtn,
        reset: el.bookEbayReset,
        status: el.bookEbayStatus,
        buy: el.bookEbayBuy,
        link: el.bookEbayLink,
    });
    el.bookVenueHint.textContent = venueHint;
    el.bookVenueHint.hidden = !venueHint;

    renderNext(state, el.bookNextBtn, el.bookDoneHint, el.bookNextNote);
}

/**
 * The customize nodes of a kind: the toggle, its card, the quantity box, the
 * pickup box, the price slider with its three words and its line, the post
 * without asking box and the eBay comparisons box.
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
              comps: el.bookComps,
              saveDefault: el.bookCustomizeDefault,
              defaultStatus: el.bookCustomizeDefaultStatus,
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
              comps: el.comps,
              saveDefault: el.customizeDefault,
              defaultStatus: el.customizeDefaultStatus,
          };
}

/**
 * Save as default (Michal, 2026-10-08: "in case someone wants to change something
 * permanently"): this kind's price grade and its three ticks as they stand, kept on this
 * phone for every new item of the kind (NEXT, a fresh load); never the quantity. Said
 * beside it for a moment.
 */
function saveDefaults(m) {
    writeJson("localStorage", DEFAULTS_KEY, { ...readDefaults(), [m]: defaultsOf(customizeOf(slots[m])) });
    const node = customizeNodes(m).defaultStatus;
    node.textContent = DEFAULTS_SAVED;
    clearTimeout(defaultTimers[m]);
    defaultTimers[m] = setTimeout(() => {
        node.textContent = "";
    }, DEFAULTS_SAVED_MS);
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
    nodes.comps.disabled = fixed;
    nodes.comps.checked = c.comps;
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
 * One venue button, its reset, its status line and its link; returns the button's
 * hint. The button's word is the venue (continue while paused); the price is the line
 * above the buttons.
 */
function renderVenue(m, venue, ok, nodes) {
    const state = slots[m];
    const job = state.jobs[venue];
    // a venue this account may not use (GET /me): grey, yet it takes the tap that says why
    // (Michal, 2026-10-08: "Keep the Craigslist button gray and when tapped write 'contact
    // developer'"); a job it already has is shown as ever
    const off = !venueAllowed(me, venue) && job.phase === "idle";
    nodes.btn.classList.toggle("venue-off", off);
    if (off) {
        nodes.btn.disabled = false;
        nodes.btn.setAttribute("aria-disabled", "true");
        paintJobButton(nodes.btn, venue, { busy: false, cancel: false, reset: nodes.reset });
        const said = offTaps.has(`${m}:${venue}`) ? CRAIGSLIST_OFF : "";
        nodes.status.textContent = said;
        nodes.status.className = "venue-status";
        nodes.status.hidden = !said;
        nodes.buy.hidden = true;
        nodes.link.hidden = true;
        return "";
    }
    nodes.btn.removeAttribute("aria-disabled");
    const button = venueButton(state, venue, ok);
    // the ring in the button from the press until the link or the error, and "tap again
    // to cancel" under the word while a tap pauses it: pressed, it is never disabled, so
    // it takes the tap that pauses, continues, or says it is too late
    const busy = isActive(job);
    nodes.btn.disabled = !button.enabled && !busy;
    paintJobButton(nodes.btn, venue, {
        busy,
        cancel: cancelButton(state, venue),
        paused: job.paused,
        label: venueLabel(job, venue),
        reset: nodes.reset,
    });
    nodes.btn.classList.toggle("posted", job.phase === "done" && !savedNotPosted(job));

    // before the press, what customize changed ("pickup only · fair price"): he sees it took
    const late = lates.get(`${m}:${venue}`);
    const line =
        busy && late && late.late
            ? { text: TOO_LATE, link: "", kind: "busy" }
            : venueLine(job, venueIdleNote(state, venue));
    nodes.status.textContent = line.text;
    nodes.status.className = `venue-status ${line.kind}`;
    nodes.status.hidden = !line.text;
    // no postings left (a 402): the server's words, and under them the way to buy more
    nodes.buy.hidden = !(job.phase === "failed" && job.credit);
    nodes.link.hidden = !line.link;
    nodes.link.textContent = line.link;
    if (line.link) nodes.link.href = line.link;
    return button.hint;
}

/**
 * A button whose press starts a job, painted the one way on every screen (Michal,
 * 2026-10-07: "Anytime there is a load or sync or AI call command, anything that
 * takes some [time] and we have a loading icon running, these buttons should get
 * that. The button, within it, should just get 'tap again to cancel' instead of an
 * external cancel line"): `lead` (the sync buttons' icon) and the word; while
 * `busy`, the ring turning beside it (styles.css); while `cancel`, TAP_TO_CANCEL in
 * small type under the word, and said after `label` to a screen reader. `paused`
 * (Michal, 2026-10-07: "the button should change to 'continue'"), the word is
 * CONTINUE and the ring stops; its `reset`, the small red control beside it, shows
 * only then.
 */
function paintJobButton(btn, word, { busy, cancel, paused = false, label = word, lead = [], reset = null }) {
    const kids = [...lead, paused ? CONTINUE : word];
    if (cancel) {
        const small = document.createElement("small");
        small.className = "tap-cancel";
        small.textContent = TAP_TO_CANCEL;
        kids.push(small);
    }
    btn.replaceChildren(...kids);
    const ring = busy && !paused;
    btn.classList.toggle("busy", ring);
    btn.setAttribute("aria-busy", ring ? "true" : "false");
    const said = paused ? `${word}, ${PAUSED}, ${CONTINUE}` : cancel ? `${label}, ${TAP_TO_CANCEL}` : label;
    btn.setAttribute("aria-label", said);
    if (reset) reset.hidden = !paused;
}

/**
 * Said under a job button tapped from the PC's publishing step on, for TOO_LATE_MS
 * (`holder.late`), then the step's own words again; nothing else changes.
 */
function tooLate(holder, paint) {
    clearTimeout(holder.lateTimer);
    holder.late = true;
    paint();
    holder.lateTimer = setTimeout(() => {
        holder.late = false;
        paint();
    }, TOO_LATE_MS);
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
            there.textContent = "on the server";
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
            retry.setAttribute("aria-label", `${p.name} did not reach the server (${p.error}); try again`);
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

/**
 * "<mode>:<venue>" -> the press on its way (a token): the timer of its one-second wait,
 * and `go`, which ends that wait (continue sends it at once, reset lets it fall)
 */
const presses = new Map();
/** "<mode>:<venue>" -> TOO_LATE under that button for a moment (tooLate) */
const lates = new Map();

async function send(m, venue) {
    const pc = settings();
    if (!pc || !venueButton(slots[m], venue, true).enabled) return;
    const mine = generation[m];
    const key = `${m}:${venue}`;
    const press = { timer: null, go: null };
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
            reduce(slots[m], { type: "jobRefused", venue, error: "the user note has not reached the server" })
        );
        return;
    }
    if (taken()) return;
    // the second he asked for: the ring turns, nothing has left the phone yet; paused,
    // the press is held here until continue (or reset lets it fall)
    await new Promise((resolve) => {
        press.go = resolve;
        if (!slots[m].jobs[venue].paused) press.timer = setTimeout(resolve, SEND_DELAY_MS);
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
        const answer = await sendJob(pc, body);
        if (presses.get(key) !== press) {
            // reset while the POST was on its way: the PC is told at once
            cancelJob(pc, answer.job).catch(() => {});
            return;
        }
        if (mine !== generation[m]) return;
        setState(m, reduce(slots[m], { type: "jobAccepted", venue, job: answer.job, ahead: answer.ahead }));
        // paused while the POST was on its way: asked about once he continues
        if (!slots[m].jobs[venue].paused) schedulePoll(m, venue, mine);
    } catch (e) {
        if (taken()) return;
        // 402: no postings left; the line offers Buy postings, and the credits line catches up
        const credit = e.status === 402;
        setState(m, reduce(slots[m], { type: "jobRefused", venue, error: e.message, credit }));
        if (credit) loadMe().catch(() => {});
    }
}

/**
 * A venue button tapped (venueTap): a new press sends; a busy one pauses, a paused one
 * continues, a publishing one says it is too late.
 */
function onVenueTap(m, venue) {
    const key = `${m}:${venue}`;
    if (!venueAllowed(me, venue) && slots[m].jobs[venue].phase === "idle") {
        // nothing is sent: the line under it says the account has no such venue
        offTaps.add(key);
        render();
        return;
    }
    const tap = venueTap(slots[m], venue);
    if (tap === "send") send(m, venue).catch(() => {});
    else if (tap === "pause") pausePress(m, venue);
    else if (tap === "continue") continuePress(m, venue);
    else {
        if (!lates.has(key)) lates.set(key, { late: false, lateTimer: null });
        tooLate(lates.get(key), render);
    }
}

/**
 * The first tap on a busy venue button pauses it, shown at once (Michal, 2026-10-07:
 * "show that it cancelled immediately, stop the loading button etc."): nothing goes to
 * the PC. A press still in its second is held there (its timer stopped); a job the PC
 * has is no longer asked about, though the PC may still be working on it. The button
 * reads continue, and reset (beside it) is the real cancel.
 */
function pausePress(m, venue) {
    const key = `${m}:${venue}`;
    const press = presses.get(key);
    if (press) clearTimeout(press.timer);
    clearTimeout(polls.get(key));
    setState(m, reduce(slots[m], { type: "jobPaused", venue }));
}

/**
 * continue: a held press goes now (its second is over); a job the PC has is asked
 * about again at once. The ring and "tap again to cancel" come back.
 */
function continuePress(m, venue) {
    setState(m, reduce(slots[m], { type: "jobResumed", venue }));
    if (slots[m].jobs[venue].jobId) {
        poll(m, venue, generation[m]).catch(() => {});
        return;
    }
    const press = presses.get(`${m}:${venue}`);
    if (press && press.go) press.go();
}

/**
 * reset, beside a paused venue button: the real cancel (Michal, 2026-10-07: "Only
 * pressing it twice actually drops all the info and resets the operation as if nothing
 * happened, and waits for a new press of the button"). A press nothing has left the
 * phone for is dropped, nothing paid. A job the PC has is told (DELETE /jobs/<id>): one
 * still queued is dropped before it runs, the one in hand stops at its next step and
 * saves the draft instead of publishing. Either way the button is its venue again at
 * once, waiting for a new press, and the line says cancelled; a job stopping is still
 * asked about, quietly, until the PC says it stopped ("cancelled from the phone"), for
 * the row it saved, which the next press reuses.
 */
async function resetPress(m, venue) {
    const job = slots[m].jobs[venue];
    if (!job.paused) return;
    const key = `${m}:${venue}`;
    const press = presses.get(key);
    presses.delete(key);
    if (press) {
        clearTimeout(press.timer);
        // a send still waiting out its second ends there
        if (press.go) press.go();
    }
    if (!job.jobId) {
        setState(m, reduce(slots[m], { type: "jobCancelled", venue }));
        return;
    }
    setState(m, reduce(slots[m], { type: "jobCancelled", venue, stopping: true }));
    const pc = settings();
    if (!pc) return;
    const mine = generation[m];
    const stopping = () => {
        const now = slots[m].jobs[venue];
        return mine === generation[m] && now.stopping && now.jobId === job.jobId;
    };
    try {
        const answer = await cancelJob(pc, job.jobId);
        if (!stopping()) return;
        if (answer.state === "cancelled") {
            // dropped before it ran: nothing more to hear
            setState(m, reduce(slots[m], { type: "jobCancelled", venue }));
            return;
        }
    } catch (e) {
        if (mine !== generation[m]) return;
        say(`Could not cancel: ${e.message}`, "warn");
    }
    if (stopping()) schedulePoll(m, venue, mine);
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
    // an answer is dropped once the press is paused, reset into a new one, or NEXT let the item go
    const current = () => {
        const now = slots[m].jobs[venue];
        return mine === generation[m] && now.jobId === jobId && !now.paused;
    };
    if (!pc || !jobId || !current()) return;
    try {
        const status = await getJob(pc, jobId);
        if (!current()) return;
        setState(m, reduce(slots[m], { type: "jobStatus", venue, status }));
    } catch (e) {
        if (!current()) return;
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
    const job = slots[m].jobs[venue];
    if (isActive(job) || job.stopping) schedulePoll(m, venue, mine);
    // the job ended: the postings it used show in the credits line
    else loadMe().catch(() => {});
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
 * 2026-10-06: "when we do admin we probably do not need goods vs book slider distinction"),
 * nor the screen below it (render): nothing of either item is reset, its uploads and polls
 * go on, and Close shows it as it now is.
 */
function adminShown(open) {
    el.admin.hidden = !open;
    el.adminToggle.setAttribute("aria-expanded", open ? "true" : "false");
    render();
}

/**
 * Admin opens on Settings while they are missing or wrong, and otherwise on the
 * inventory, asked afresh, or on the listing left open there (Michal, 2026-10-07:
 * "When I press admin I want to land on this same page tho as if the open card
 * was there all along"), or on the listing `card` names (See in inventory). A sign-up not
 * finished opens on Settings, where its Account block is: the inventory would be refused.
 * Closed, it lets go of the photos it fetched.
 * @param {boolean} open
 * @param {string} [card] a listing's sku to land on
 */
function showAdmin(open, card = "") {
    // Feedback says where he came from: the posting screen behind Admin, or none (the landing)
    if (open && el.admin.hidden) Object.assign(visit, { from: settings() ? mode : "admin", sawCard: false });
    adminShown(open);
    if (!open) {
        // the Account block starts folded and quiet on the next visit
        Object.assign(account, { packs: false, status: "" });
        quietSeller();
        renderAccount();
        // a search still waiting or an answer still on its way is for a list no longer shown
        clearTimeout(searchTimer);
        searchTimer = null;
        admin.asked += 1;
        dropSwipe();
        dropUndo();
        showList();
        dropThumbs();
        return;
    }
    const ok = !!settings();
    const signing = ok && !!signupStep(me);
    showSettings(!ok || signing);
    loadInbox().catch(() => {});
    const sku = ok && !signing ? card || readText("localStorage", CARD_KEY) : "";
    if (!sku) {
        showInventory(ok && !signing);
        return;
    }
    admin.inventoryOpen = true;
    el.inventory.hidden = false;
    fold(el.inventoryToggle, "Inventory", true);
    openRow({ sku }, null).catch(() => {});
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
        loadSeller().catch(() => {});
    }
}

function toggleSettings() {
    showSettings(el.settings.hidden);
}

/**
 * The look on screen: data-theme on <html> for Dark or Light (styles.css follows the
 * device without it), the status bar to match, and its chip pressed in Settings.
 * @param {"dark"|"light"|"device"} theme
 */
function applyTheme(theme) {
    const attr = themeAttr(theme);
    if (attr) document.documentElement.setAttribute("data-theme", attr);
    else document.documentElement.removeAttribute("data-theme");
    const colors = statusBarColors(theme, grounds);
    el.themeColor.content = colors.light;
    el.themeColorDark.content = colors.dark;
    for (const { value, node } of el.themeChips) node.setAttribute("aria-pressed", value === theme ? "true" : "false");
}

/** An Appearance chip: the look at once, remembered on this phone; Save and check is not needed. */
function setTheme(theme) {
    writeText("localStorage", THEME_KEY, theme);
    applyTheme(theme);
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

/**
 * The inventory's Options, the filters, the sort and Show photos (Michal, 2026-10-08:
 * "Inventory list options need to be all small, and also locked away inside a foldout tab
 * 'Options'"): folded or open, as customize; what is chosen in them holds either way.
 */
function showOptions(open) {
    el.options.hidden = !open;
    fold(el.optionsToggle, "Options", open);
}

/** Options tapped open or folded: remembered on this phone. */
function toggleOptions() {
    const open = el.options.hidden;
    writeText("localStorage", OPTIONS_KEY, open ? "open" : "closed");
    showOptions(open);
}

/** The chips show the filters and the sort chosen. */
function renderFilters() {
    for (const { value, node } of el.inventoryVenues) node.setAttribute("aria-pressed", value === admin.venue ? "true" : "false");
    for (const { value, node } of el.inventoryStates) node.setAttribute("aria-pressed", value === admin.status ? "true" : "false");
    for (const { value, node } of el.inventorySorts) node.setAttribute("aria-pressed", value === admin.sort ? "true" : "false");
    // archiving hides a row; it ends no listing: said once, under the chip that lists them
    el.inventoryArchivedNote.hidden = admin.status !== "archived";
}

/**
 * Ask the PC for the rows that match the search and the filters, in the sort
 * chosen, and show them. A PC that does not answer says so on the line under
 * the search box; the list stays as it was. `lead` goes before the count, for
 * a listing that could not be shown in its place.
 */
async function loadInventory(lead = "") {
    clearTimeout(searchTimer);
    searchTimer = null;
    admin.asked += 1;
    const mine = admin.asked;
    const pc = settings();
    if (!pc) {
        el.inventoryStatus.textContent = "Set the server address and key under Settings first.";
        return;
    }
    el.inventoryStatus.textContent = "Asking the server...";
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
        el.inventoryStatus.textContent = [lead, refusalLine("Could not read the inventory", e.status, e.message)].filter(Boolean).join(" ");
        // a key the PC does not know: Settings is where it is put right (a session it no
        // longer knows took the page back to the landing already: heard)
        if (e.status === 401 && settings()) showSettings(true);
        return;
    }
    if (mine !== admin.asked) return; // a later search or filter has its own answer coming
    heard(200);
    admin.rows = inventoryRows(answer);
    el.inventoryStatus.textContent = [lead, inventoryCount(admin.rows.length)].filter(Boolean).join(" ");
    renderRows();
    if (el.inventoryPhotos.checked) fetchThumbs(pc, mine).catch(() => {});
}

/** The list: one row per listing, with photo 1's tile on its left while Show photos is on; a swipe under way is let go. */
function renderRows() {
    dropThumbs();
    dropSwipe();
    admin.parts.clear();
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
 * On the right, the price's round + at the top and − at the bottom (Michal,
 * 2026-10-07: "Plus button in top right, minus button in bottom right of the little
 * tile that represents an inventory item"). The price, the badges and the two are
 * painted by paintTile, again whenever the row or its task changes.
 */
function rowNode(row, photos) {
    const li = document.createElement("li");
    li.className = "inv-item";
    // the row itself, over the grey Archive panel a swipe uncovers
    const card = document.createElement("div");
    card.className = "inv-row";
    if (photos) {
        // a blank tile until photo 1 comes (fetchThumbs), or for a row with none
        const tile = document.createElement("span");
        tile.className = "inv-thumb";
        tile.textContent = Number(row.photos) > 0 ? "" : "no photo";
        admin.tiles.set(row.sku, tile);
        card.append(tile);
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
    open.append(title, line);
    const badges = document.createElement("span");
    badges.className = "inv-badges";
    words.append(open, badges);
    // a row the Archived chip lists comes back with Unarchive, in place of the swipe
    const unarchive =
        admin.status === "archived"
            ? actionButton("Unarchive", "pill pill-small inv-unarchive", false, () => {
                  unarchiveRow(row.sku).catch(() => {});
              })
            : null;
    if (unarchive) words.append(unarchive);
    const steps = document.createElement("div");
    steps.className = "inv-steps";
    const up = dialButton(row.sku, 1, "+", "price up");
    const down = dialButton(row.sku, -1, "−", "price down");
    steps.append(up, down);
    card.append(words, steps);
    if (unarchive) li.append(card);
    else {
        const panel = document.createElement("span");
        panel.className = "inv-archive";
        panel.setAttribute("aria-hidden", "true");
        panel.textContent = "Archive";
        li.append(panel, card);
    }
    // the row as the PC last gave it: a dial's PATCH puts its answer here; `shown`, the
    // price a dial is at (held, or its PATCH on its way), null otherwise; `swiped`, a finger
    // moved on it since it went down, so the click it may end with opens nothing
    const parts = { row, li, card, line, badges, up, down, unarchive, shown: null, swiped: false };
    open.addEventListener("click", () => {
        if (parts.swiped) {
            parts.swiped = false;
            return;
        }
        openRow(parts.row, open).catch(() => {});
    });
    if (!unarchive) swipeable(row.sku, open);
    admin.parts.set(row.sku, parts);
    paintTile(row.sku);
    return li;
}

/**
 * A list row's price (`$24`, from the row the PC last gave, or where a dial is at), its
 * badges, and its + and −: − shut at $1, both while the row's PATCH or its push is on its
 * way or running (one job per row at a time, as on a listing's own page). Never shut under
 * a held finger: a button shut mid-press would not hear it lift.
 */
function paintTile(sku) {
    const parts = admin.parts.get(sku);
    if (!parts) return;
    const { row } = parts;
    const kids = [];
    const price = priceWord(parts.shown === null ? row.price : parts.shown);
    if (price) {
        const said = document.createElement("span");
        said.className = "inv-price";
        said.textContent = price;
        kids.push(said);
    }
    const code = document.createElement("span");
    code.className = "inv-sku mono";
    code.textContent = sku;
    kids.push(code);
    parts.line.replaceChildren(...kids);
    parts.badges.replaceChildren(
        ...rowBadges(row, readUnsynced()).flatMap((badge) => (badge.sync ? syncBadge(sku, badge) : [badgeNode(badge)]))
    );
    const busy = rowTaskBusy(rowTask(sku));
    const held = !!dial && dial.sku === sku;
    parts.up.disabled = busy;
    parts.down.disabled = busy || (!held && dialPrice(row.price, -1, 1) >= (Number(row.price) || 0));
    if (parts.unarchive) parts.unarchive.disabled = busy;
}

/** A row's job task on the list, made the first time it is asked for. */
function rowTask(sku) {
    if (!admin.rowTasks.has(sku)) admin.rowTasks.set(sku, jobTask());
    return admin.rowTasks.get(sku);
}

/** A row's PATCH or push is on its way, or its push runs on the PC: its tile waits. */
function rowTaskBusy(task) {
    return !!task.wait || jobRunning(task.job);
}

/** The listings their venues have not caught up with, by sku and venue, as this phone keeps them. */
function readUnsynced() {
    return unsyncedList(readJson("localStorage", UNSYNCED_KEY, []));
}

/** A listing's `venue` marked as not having the row (`on`), or let go once it has. */
function markUnsynced(sku, venue, on) {
    writeJson("localStorage", UNSYNCED_KEY, unsyncedWith(readUnsynced(), sku, venue, on));
}

/** Each listing a change the PC answered left behind (leftUnsynced), marked. */
function markBehind(sku, before, after) {
    for (const venue of leftUnsynced(before, after)) markUnsynced(sku, venue, true);
}

// --- a tile's + and −, a dial ---------------------------------------------------------
//
// Michal, 2026-10-08: "This adjustment itself should be by 1 dollar. However we need to sense
// long press and speed up, for larger priced items, like dials on my oven for time setting."
// A press is a dollar at once; held past DIAL_DELAY_MS it repeats every DIAL_REPEAT_MS by
// dialStep's growing step, the tile showing each price; the finger lifting (or leaving the
// button) sends the one PATCH. Pointer and touch events both start and end it (whichever
// the browser fires first; the other finds it running), the touch's long-press menu and
// text selection held off; a click is the keyboard's (Enter or Space), a tap of its own.

/** The dial being held: its row, its direction, the price it is at, how long it has been held, its timer. */
let dial = null;

/** A tile's + (`direction` 1) or − (-1), wired as a dial. */
function dialButton(sku, direction, word, label) {
    const btn = actionButton(word, "inv-step", false, (e) => {
        // a pointer's click comes after its press already dialled (detail 1); the keyboard's is 0
        if (e.detail) return;
        startDial(sku, direction);
        endDial(sku);
    });
    btn.setAttribute("aria-label", label);
    btn.addEventListener("pointerdown", (e) => {
        // a touch keeps the pointer on the button it went down on: let go of it, so sliding
        // off the button (pointerleave) ends the dial as lifting does
        if (typeof btn.releasePointerCapture === "function" && btn.hasPointerCapture(e.pointerId)) {
            btn.releasePointerCapture(e.pointerId);
        }
        startDial(sku, direction);
    });
    btn.addEventListener(
        "touchstart",
        (e) => {
            // no long-press menu, no selection, no click after it: the dial is the whole press
            e.preventDefault();
            startDial(sku, direction);
        },
        { passive: false }
    );
    for (const type of ["pointerup", "pointerleave", "pointercancel", "touchend", "touchcancel"]) {
        btn.addEventListener(type, () => endDial(sku));
    }
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
    return btn;
}

/** A press on a tile's + or −: a dollar at once, and the dial turning while it is held. */
function startDial(sku, direction) {
    const parts = admin.parts.get(sku);
    if (dial || !parts || !settings() || (direction > 0 ? parts.up : parts.down).disabled) return;
    dial = { sku, direction, price: dialPrice(parts.row.price, direction, 1), held: 0, timer: null };
    parts.shown = dial.price;
    paintTile(sku);
    dial.timer = setTimeout(turnDial, DIAL_DELAY_MS);
}

/** One more step of the dial held: dialStep's for how long it has been, shown on the tile. */
function turnDial() {
    if (!dial) return;
    dial.held += dial.held ? DIAL_REPEAT_MS : DIAL_DELAY_MS;
    dial.price = dialPrice(dial.price, dial.direction, dialStep(dial.held));
    const parts = admin.parts.get(dial.sku);
    if (parts) {
        parts.shown = dial.price;
        paintTile(dial.sku);
    }
    dial.timer = setTimeout(turnDial, DIAL_REPEAT_MS);
}

/** The finger off a tile's + or −: the dial stops where it is, and that price is sent. */
function endDial(sku) {
    if (!dial || dial.sku !== sku) return;
    clearTimeout(dial.timer);
    const { price } = dial;
    dial = null;
    sendPrice(sku, price).catch(() => {});
}

/**
 * The price a dial stopped at, as one PATCH ({"price": "150.00"}); the price on the tile is
 * then the one the PC answers, and each listing up on a venue the change left behind offers
 * its sync on its badge. A change the PC refuses (400) says its words on the inventory's
 * line, and the tile its price as it was. A dial back where it started sends nothing.
 */
async function sendPrice(sku, price) {
    const parts = admin.parts.get(sku);
    const task = rowTask(sku);
    const pc = settings();
    if (!parts) return;
    if (!pc || rowTaskBusy(task) || price === Number(parts.row.price)) {
        parts.shown = null;
        paintTile(sku);
        return;
    }
    const before = parts.row;
    task.wait = "saving";
    paintTile(sku);
    let whole;
    try {
        whole = await patchRow(pc, sku, dialBody(price));
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        task.wait = "";
        el.inventoryStatus.textContent = `${sku}: ${e.message}`;
        const shown = admin.parts.get(sku);
        if (shown) shown.shown = null;
        paintTile(sku);
        return;
    }
    heard(200);
    task.wait = "";
    markBehind(sku, before, whole);
    // the list as the PC now has it (a listing opened from it reads the row afresh)
    admin.rows = admin.rows.map((r) => (r.sku === sku ? followSummary(r, whole) : r));
    const shown = admin.parts.get(sku);
    if (shown) {
        shown.row = followSummary(shown.row, whole);
        shown.shown = null;
    }
    el.inventoryStatus.textContent = inventoryCount(admin.rows.length);
    paintTile(sku);
}

// --- a row swiped off the list: archived -----------------------------------------------------
//
// Michal, 2026-10-08: "Inventory list should have swipe left or right to archive, so you no
// longer see it in the list, kind of like what the Gmail app has on the phone." The row's own
// button (it reaches over the whole row) takes the finger: the row follows it sideways over a
// grey Archive panel, and past swipeState's mark, lifted, it slides out and is archived
// (PATCH {"archived": true}); short of it, or once the finger goes up or down the page, it
// slides back. The + and −, the badges and Unarchive sit above the button, so a press on them
// never starts a swipe. Archiving hides a row; it ends no listing. An undo bar under the list
// offers it back for UNDO_MS.

/** A row's button made the swipe's: pointer events (a touch's come as pointers too). */
function swipeable(sku, open) {
    open.addEventListener("pointerdown", (e) => startSwipe(sku, open, e));
    open.addEventListener("pointermove", (e) => moveSwipe(sku, e));
    open.addEventListener("pointerup", (e) => endSwipe(sku, e));
    open.addEventListener("pointercancel", () => {
        if (swipe && swipe.sku === sku) dropSwipe();
    });
}

/** A finger down on a row: followed from here, unless the row is busy or the list is not the live one. */
function startSwipe(sku, open, e) {
    const parts = admin.parts.get(sku);
    if (!parts) return;
    parts.swiped = false;
    if (swipe || !settings() || rowTaskBusy(rowTask(sku))) return;
    swipe = { sku, id: e.pointerId, start: { x: e.clientX, y: e.clientY }, decided: "none", dx: 0, past: false };
    // the finger's moves stay the row's even once it is past the row's edge
    if (typeof open.setPointerCapture === "function") {
        try {
            open.setPointerCapture(e.pointerId);
        } catch {
            /* a pointer already gone: its up or cancel ends the swipe all the same */
        }
    }
}

/** The finger moving: the row follows it sideways, or, gone up or down the page, lets it scroll. */
function moveSwipe(sku, e) {
    if (!swipe || swipe.sku !== sku || e.pointerId !== swipe.id) return;
    const parts = admin.parts.get(sku);
    if (!parts) return;
    const now = swipeState(swipe.start, { x: e.clientX, y: e.clientY }, parts.card.offsetWidth || 0, swipe.decided);
    swipe.decided = now.decided;
    if (now.decided === "none") return;
    parts.swiped = true;
    if (now.decided === "scroll") {
        dropSwipe();
        return;
    }
    swipe.dx = now.dx;
    swipe.past = now.past;
    slideRow(parts, now.dx);
}

/** The finger lifted: past the mark the row is archived, short of it it slides back. */
function endSwipe(sku, e) {
    if (!swipe || swipe.sku !== sku || e.pointerId !== swipe.id) return;
    const { past, dx } = swipe;
    swipe = null;
    if (past) archiveSwiped(sku, dx > 0 ? 1 : -1).catch(() => {});
    else {
        const parts = admin.parts.get(sku);
        if (parts) slideRow(parts, 0);
    }
}

/** No swipe any more (a scroll, a cancel, Admin closed): its row back in its place. */
function dropSwipe() {
    if (!swipe) return;
    const parts = admin.parts.get(swipe.sku);
    swipe = null;
    if (parts) slideRow(parts, 0);
}

/** The row `dx` px aside, the Archive panel showing on the side it uncovers; 0 is back in place. */
function slideRow(parts, dx) {
    parts.li.classList.toggle("swiping", dx !== 0);
    parts.li.classList.toggle("toward-right", dx > 0);
    parts.card.style.transform = dx ? `translateX(${dx}px)` : "";
}

/** The list's rows on screen as admin.rows has them, each the row node it already has. */
function showRows() {
    el.inventoryList.replaceChildren(...admin.rows.map((r) => admin.parts.get(r.sku)).filter(Boolean).map((p) => p.li));
}

/**
 * A row swiped past the mark: it slides out toward `direction` (1 right, -1 left), the PATCH
 * goes, and once the server has it the row leaves the list and the undo bar offers it back. A
 * server without archiving (404) says so; any refusal puts the row back where it was.
 * @param {string} sku
 * @param {1|-1} direction
 */
async function archiveSwiped(sku, direction) {
    const parts = admin.parts.get(sku);
    const task = rowTask(sku);
    const pc = settings();
    if (!parts || !pc) return;
    task.wait = "archiving";
    slideRow(parts, 0);
    parts.li.classList.add("leaving");
    parts.li.classList.toggle("toward-right", direction > 0);
    parts.card.style.transform = `translateX(${direction * 110}%)`;
    paintTile(sku);
    try {
        await archiveRow(pc, sku, true);
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        task.wait = "";
        el.inventoryStatus.textContent = archiveError(sku, e.status, e.message);
        parts.li.classList.remove("leaving");
        slideRow(parts, 0);
        paintTile(sku);
        return;
    }
    heard(200);
    task.wait = "";
    const at = admin.rows.findIndex((r) => r.sku === sku);
    admin.rows = admin.rows.filter((r) => r.sku !== sku);
    showRows();
    el.inventoryStatus.textContent = inventoryCount(admin.rows.length);
    offerUndo({ sku, row: parts.row, at, parts });
}

/** The undo bar under the list, for UNDO_MS: "Archived <title>" and Undo. A newer archive takes its place. */
function offerUndo(entry) {
    clearTimeout(undo.timer);
    undo.entry = entry;
    el.inventoryUndoText.textContent = archivedLine(rowTitle(entry.row));
    el.inventoryUndo.hidden = false;
    undo.timer = setTimeout(dropUndo, UNDO_MS);
}

function dropUndo() {
    clearTimeout(undo.timer);
    undo.timer = null;
    undo.entry = null;
    el.inventoryUndo.hidden = true;
}

/**
 * Undo: the row archived last is unarchived (PATCH {"archived": false}) and back in its place
 * on the list it left; the list asked for again when that list is no longer the one shown.
 */
async function undoArchive() {
    const entry = undo.entry;
    const pc = settings();
    if (!entry || !pc) return;
    dropUndo();
    try {
        await archiveRow(pc, entry.sku, false);
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        el.inventoryStatus.textContent = archiveError(entry.sku, e.status, e.message);
        return;
    }
    heard(200);
    if (admin.parts.get(entry.sku) !== entry.parts || admin.rows.some((r) => r.sku === entry.sku)) {
        loadInventory().catch(() => {});
        return;
    }
    entry.parts.li.classList.remove("leaving");
    slideRow(entry.parts, 0);
    admin.rows.splice(Math.max(0, Math.min(entry.at, admin.rows.length)), 0, entry.row);
    showRows();
    el.inventoryStatus.textContent = inventoryCount(admin.rows.length);
}

/** Unarchive, on a row the Archived chip lists: back on the lists, and off this one. */
async function unarchiveRow(sku) {
    const task = rowTask(sku);
    const pc = settings();
    if (!pc || rowTaskBusy(task)) return;
    task.wait = "archiving";
    paintTile(sku);
    try {
        await archiveRow(pc, sku, false);
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        task.wait = "";
        el.inventoryStatus.textContent = archiveError(sku, e.status, e.message);
        paintTile(sku);
        return;
    }
    heard(200);
    task.wait = "";
    admin.rows = admin.rows.filter((r) => r.sku !== sku);
    showRows();
    el.inventoryStatus.textContent = inventoryCount(admin.rows.length);
}

/**
 * The badge of a venue a row's listing there has not caught up with (eBay: its price;
 * craigslist: its fields): the listed badge, in its green, with the sync bar's to-eBay icon
 * where the tick was, and a job button (Michal, 2026-10-07: "When the price changes there
 * should be our sync-to logo appearing on the ebay green button below. Pressing it would
 * sync, and the button would revert to the 'ebay listed'"): pressed, its ring and "tap
 * again to cancel"; tapped again, paused, its continue and the reset beside it, as every
 * job button.
 */
function syncBadge(sku, badge) {
    const task = rowTask(sku);
    const action = `push ${badge.venue}`;
    const paint = () => {
        paintTile(sku);
        // the row has no line of its own: a tap from the publishing step on is said on the list's
        if (task.late) el.inventoryStatus.textContent = `${sku}: ${TOO_LATE}`;
    };
    const btn = actionButton("", `vbadge ${badge.kind} vsync`, false, () => {
        if (pressed(task, action)) onTaskTap(task, paint);
        else pushTile(sku, badge.venue).catch(() => {});
    });
    const reset = actionButton(RESET, "reset-call", false, () => {
        resetTask(task, paint).catch(() => {});
    });
    reset.setAttribute("aria-label", `${RESET} the sync of ${sku}`);
    const busy = pressed(task, action);
    btn.disabled = busy ? !taskTap(task) : rowTaskBusy(task);
    paintJobButton(btn, badge.text, {
        busy,
        cancel: busy && taskCancel(task),
        paused: busy && task.paused,
        label: `${badge.said}, sync to ${venueName(badge.venue)}`,
        lead: [syncIcon()],
        reset,
    });
    return [btn, reset];
}

/** The sync bar's to-eBay half of the sync symbol, copied for a sync badge (without its id: the bar keeps that). */
function syncIcon() {
    const icon = el.syncButtons.find((b) => b.direction === "to").icon.cloneNode(true);
    icon.removeAttribute("id");
    return icon;
}

/**
 * A sync badge tapped: after the second a job button waits, the push job puts the row as
 * saved on its listing on that venue ({"action": "push", "sku", "venue"}), asked about every
 * POLL_MS. Done, the venue has the row and the badge is the plain listed one again, a link.
 * What it ended with, or the PC's refusal, is said on the inventory's line.
 */
async function pushTile(sku, venue) {
    const task = rowTask(sku);
    if (rowTaskBusy(task)) return;
    task.action = `push ${venue}`;
    task.note = null;
    task.job = null;
    task.stopping = false;
    task.wait = "sending";
    const waited = pressWait(task);
    paintTile(sku);
    if (!(await waited)) return;
    const pc = settings();
    if (!pc) {
        task.action = "";
        task.wait = "";
        paintTile(sku);
        return;
    }
    let answer;
    try {
        answer = await sendJob(pc, actionJob("push", { sku, venue }));
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        task.action = "";
        task.wait = "";
        el.inventoryStatus.textContent = `${sku}: ${e.message}`;
        paintTile(sku);
        return;
    }
    heard(200);
    task.wait = "";
    task.job = { action: "push", venue, job: answer.job, state: answer.state || "queued", ahead: answer.ahead };
    task.ask = () => {
        askTile(sku).catch(() => {});
    };
    paintTile(sku);
    later(task);
}

/** A sync badge's push asked about; once it ends, done lets that venue's mark go. */
async function askTile(sku) {
    const task = rowTask(sku);
    if (!(await askTask(task, () => paintTile(sku)))) return;
    if (task.job.state === "done") markUnsynced(sku, task.job.venue, false);
    el.inventoryStatus.textContent = `${sku}: ${syncLine(task.job).text}`;
    paintTile(sku);
}

/**
 * A venue's badge, the one piece the list's rows and a listing's foldouts both wear
 * (Michal, 2026-10-07: "Keeping visual references the same across screens makes
 * things simple"): a link to the listing when it carries one, else a word. Listed, the
 * venue and a tick (tickIcon), "listed" said to a screen reader.
 */
function badgeNode(badge) {
    const kind = `vbadge ${badge.kind}`;
    const words = badge.tick ? [badge.text, tickIcon(), hiddenWord(" listed")] : [badge.text];
    if (badge.link) {
        const a = linkNode(badge.link, kind, "");
        a.replaceChildren(...words);
        a.setAttribute("aria-label", `${badge.said}: open the listing`);
        return a;
    }
    const b = document.createElement("span");
    b.className = kind;
    b.replaceChildren(...words);
    return b;
}

/**
 * The tick after a listed badge's venue (Michal, 2026-10-08: "write 'ebay' and follow that
 * with a checkmark symbol"): a stroke in the badge's own colour, 12 px, hidden from a screen
 * reader, which hears "listed" instead.
 */
function tickIcon() {
    const svg = document.createElementNS(SVG_NS, "svg");
    for (const [k, v] of Object.entries({
        class: "tick",
        viewBox: "0 0 24 24",
        width: "12",
        height: "12",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "3.5",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "aria-hidden": "true",
    })) {
        svg.setAttribute(k, v);
    }
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", "M5 12.5l4.5 4.5L19 7");
    svg.append(path);
    return svg;
}

/** Words a screen reader hears and the screen does not show. */
function hiddenWord(text) {
    const span = document.createElement("span");
    span.className = "sr-only";
    span.textContent = text;
    return span;
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
 * A row tapped (`from`, its button), or the listing Admin reopens by its sku
 * (`from` null): its own page in place of the list, remembered on this phone; a
 * tapped row's summary at once, then the whole row from the PC and its photos one
 * at a time. Every venue card starts folded (Michal, 2026-10-07: "When I look at a
 * card of a listing I want the eBay and Craigslist section be folded in at
 * first"). A reopened listing the PC no longer has is let go, and the list says so.
 */
async function openRow(row, from) {
    admin.shown += 1;
    const mine = admin.shown;
    dropPictures();
    dropCards();
    admin.from = from;
    admin.changed = false;
    admin.folds = Object.fromEntries(VENUES.map((v) => [v, false]));
    writeText("localStorage", CARD_KEY, row.sku);
    detailLine("");
    showCard(true);
    if (from) renderDetail(row);
    else {
        // only the sku: no foldout until the PC says what the listing is
        admin.row = null;
        el.detailHeading.textContent = row.sku;
        renderCards();
    }
    const view = globalThis.window;
    if (view && typeof view.scrollTo === "function") view.scrollTo({ top: 0, left: 0, behavior: "instant" });
    const pc = settings();
    if (!pc) {
        detailLine("Set the server address and key under Settings first.");
        return;
    }
    detailLine(`Reading ${row.sku} from the server...`);
    let whole;
    try {
        whole = await getRow(pc, row.sku);
    } catch (e) {
        if (mine !== admin.shown) return;
        if (e.status === 0 || e.status === 401) heard(e.status);
        const said = refusalLine(`Could not read ${row.sku}`, e.status, e.message);
        if (!from && e.status === 404) {
            removeText("localStorage", CARD_KEY);
            showList();
            loadInventory(said).catch(() => {});
            return;
        }
        detailLine(said);
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

/** The detail whole: the heading, the photo strip, customize's boxes as the row has them, the cards. */
function renderDetail(row) {
    admin.row = row;
    admin.custom.values = rowCustomize(row);
    el.detailHeading.textContent = rowHeading(row);
    renderDetailPhotos(row);
    renderCards();
}

/**
 * The row as the PC has it after a card or customize changed it: the heading and
 * the cards; the photos stay. customize's boxes and slider follow the row, unless
 * they hold a change not yet saved (followRow).
 */
function refreshRow(row) {
    admin.custom.values = followRow(admin.row, admin.custom.values, row);
    admin.row = row;
    el.detailHeading.textContent = rowHeading(row);
    renderCards();
}

/**
 * An Admin job button's task (a card's, customize's, the sync bar's): the action last
 * pressed (`action`), its press's first second (`press`, pressWait), what is on its
 * way to the PC (`wait`), its last job as GET /jobs/<id> answered, paused by a tap
 * (`paused`), reset while the PC had it and not yet stopped (`stopping`), what the PC
 * refused (`note`), TOO_LATE said for a moment (`late`, `lateTimer`), how its job is
 * asked about (`ask`, set once the PC has it) and the timer of its next poll.
 */
function jobTask() {
    return {
        action: "",
        press: null,
        wait: "",
        job: null,
        paused: false,
        stopping: false,
        note: null,
        late: false,
        lateTimer: null,
        ask: null,
        timer: null,
    };
}

/**
 * One card's screen state, per venue, for the row on screen: its job task (jobTask),
 * End asking its second tap (`confirm`), Edit's inputs (`edit`), End refused for good
 * (`noEnd`), its status line's node and its busy button's ({node, word, reset}).
 */
function blankCard() {
    return { ...jobTask(), confirm: false, edit: null, noEnd: false, line: null, button: null };
}

/**
 * The listing's customize, for the row on screen: open (each listing opens on it),
 * its two boxes and the slider as he left them (`values`, from the row until
 * changed), and, as a card's, its job task ("push" for Sync to eBay).
 */
function blankCustomize() {
    return { open: true, values: rowCustomize({}), ...jobTask() };
}

/** The cards' presses and polls stopped and their state let go: the detail is leaving the screen or changing rows. */
function dropCards() {
    for (const venue of VENUES) {
        takeBack(admin.cards[venue]);
        clearTimeout(admin.cards[venue].timer);
    }
    takeBack(admin.custom);
    clearTimeout(admin.custom.timer);
    admin.cards = Object.fromEntries(VENUES.map((v) => [v, blankCard()]));
    admin.custom = blankCustomize();
}

/**
 * Something is on its way to the PC or a job of the row's is still running: the
 * row's fields stay read-only and the other actions wait (one job per row at a time).
 */
function rowBusy() {
    const busy = (c) => !!c.wait || jobRunning(c.job);
    return busy(admin.custom) || VENUES.some((v) => busy(admin.cards[v]));
}

/** customize, then every venue card in its fixed order, and the foldouts' toggles; none without a row. */
function renderCards() {
    renderRowCustomize();
    for (const venue of VENUES) el.detailFolds[venue].card.replaceChildren(...(admin.row ? cardNodes(venue) : []));
    renderFolds();
}

/**
 * The listing's customize, as the goods card: open or folded; the quantity box (not
 * rewritten while it holds what was typed), pickup only and the Price slider with
 * each grade's cached price beside its word (sliderWords), locked while the row is
 * busy; Save and Sync to eBay as customizeButtons says; its status line.
 */
function renderRowCustomize() {
    const c = admin.custom;
    const row = admin.row;
    fold(el.detailCustomizeToggle, "customize", c.open);
    el.detailCustomizeToggle.hidden = !row;
    el.detailCustomize.hidden = !row || !c.open;
    if (!row) return;
    const busy = rowBusy();
    if (el.detailQuantity.value !== c.values.quantity) el.detailQuantity.value = c.values.quantity;
    el.detailQuantity.disabled = busy;
    el.detailPickupOnly.checked = c.values.pickupOnly;
    el.detailPickupOnly.disabled = busy;
    const slider = sliderWords(row, c.values.pricing);
    el.detailPricing.value = slider.value;
    el.detailPricing.disabled = busy;
    el.detailPricing.setAttribute("aria-valuetext", slider.said);
    PRICING.forEach((p, i) => {
        el.detailPricingWords[i].textContent = slider.words[i];
        el.detailPricingWords[i].classList.toggle("on", p.grade === slider.bold);
    });
    el.detailPricingNote.textContent = slider.note;
    const can = customizeButtons(row, c.values, busy);
    el.detailCustomizeSave.disabled = !can.save;
    // Sync to eBay is a job button: pressed, its ring and "tap again to cancel", paused its continue and reset
    const pushing = pressed(c, "push");
    el.detailCustomizeSync.disabled = pushing ? !taskTap(c) : !can.sync;
    paintJobButton(el.detailCustomizeSync, "Sync to eBay", {
        busy: pushing,
        cancel: pushing && taskCancel(c),
        paused: pushing && c.paused,
        reset: el.detailCustomizeReset,
    });
    paintCustomizeLine();
}

/** customize's status line, rewritten in place: a poll changes it and nothing else. */
function paintCustomizeLine() {
    if (!admin.row) return;
    const line = customizeLine(admin.row, admin.custom);
    el.detailCustomizeStatus.textContent = line.text;
    el.detailCustomizeStatus.className = line.kind ? `venue-status ${line.kind}` : "venue-status";
}

/**
 * A box typed or ticked, or the slider moved: the state takes it, and what the last
 * Save or push said gives way to what the foldout now is (Save opens, or the
 * quantity hint shows, or the slider's line says there is no cached price to set).
 */
function onCustomizeInput(values) {
    const c = admin.custom;
    if (rowBusy()) return;
    c.values = { ...c.values, ...values };
    c.note = null;
    c.job = null;
    renderRowCustomize();
}

/**
 * customize's Save: one PATCH with only the quantity, pickup only and the slider's
 * grade changed (customizeChanges); the PC sets the price to the grade's cached one
 * and the row it answers is shown, its new price in the heading and the eBay card.
 * A refusal (no cached price for that grade) is said in the status line, the
 * foldout as he left it. true once the row holds what the foldout says (nothing to
 * send counts), so Sync to eBay can follow.
 */
async function saveRowCustomize() {
    const c = admin.custom;
    const row = admin.row;
    const pc = settings();
    if (!row || !pc || rowBusy() || !quantityValue(c.values.quantity)) return false;
    const body = customizeChanges(row, c.values);
    if (!body) return true;
    const mine = admin.shown;
    c.note = null;
    c.job = null;
    c.wait = "saving";
    renderCards();
    let whole;
    try {
        whole = await patchRow(pc, row.sku, body);
    } catch (e) {
        if (mine !== admin.shown) return false;
        if (e.status === 0 || e.status === 401) heard(e.status);
        c.wait = "";
        c.note = { text: e.message, kind: "bad" };
        renderCards();
        return false;
    }
    if (mine !== admin.shown) return false;
    heard(200);
    c.wait = "";
    c.note = customizeSaved(whole);
    markBehind(row.sku, row, whole);
    admin.changed = true;
    refreshRow({ ...whole, sku: row.sku });
    return true;
}

/**
 * Sync to eBay (Michal, 2026-10-07: "click pickup only and sync to eBay, and that
 * detail of that listing should update"): the second a job button waits, then a
 * change not yet saved is saved, then the push job puts the row as saved on its
 * eBay listing. Its line is customize's status line, polled every POLL_MS,
 * "updated" or "unchanged" once done, and the row is read again. A push the PC
 * refuses says why. A tap on it pauses it (onTaskTap), and its reset calls it off.
 */
async function pushRow() {
    const c = admin.custom;
    if (!admin.row || !customizeButtons(admin.row, c.values, rowBusy()).sync) return;
    const mine = admin.shown;
    c.action = "push";
    c.note = null;
    c.job = null;
    c.stopping = false;
    c.wait = "sending";
    const waited = pressWait(c);
    renderCards();
    if (!(await waited) || mine !== admin.shown) return;
    c.wait = "";
    const saved = await saveRowCustomize();
    if (mine !== admin.shown) return;
    const row = admin.row;
    const pc = settings();
    if (!saved || !row || !pc || rowBusy()) {
        c.action = "";
        renderCards();
        return;
    }
    c.job = null;
    c.wait = "sending";
    renderCards();
    let answer;
    try {
        answer = await sendJob(pc, actionJob("push", { sku: row.sku, venue: "ebay" }));
    } catch (e) {
        if (mine !== admin.shown) return;
        if (e.status === 0 || e.status === 401) heard(e.status);
        c.action = "";
        c.wait = "";
        c.note = { text: e.message, kind: "bad" };
        renderCards();
        return;
    }
    if (mine !== admin.shown) return;
    heard(200);
    c.wait = "";
    c.note = null;
    c.job = { action: "push", venue: "ebay", job: answer.job, state: answer.state || "queued", ahead: answer.ahead };
    c.ask = () => {
        askJob(c, mine, renderRowCustomize).catch(() => {});
    };
    renderCards();
    later(c);
}

/**
 * Each venue's foldout, open or folded: its toggle is the venue's badge as the list
 * wears it (green when listed, "not added" on one the row is not on), then the arrow.
 */
function renderFolds() {
    const row = admin.row;
    for (const [venue, { toggle, card }] of Object.entries(el.detailFolds)) {
        const open = admin.folds[venue] === true;
        toggle.hidden = !row;
        card.hidden = !row || !open;
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        toggle.replaceChildren(...(row ? [badgeNode(venueBadge(row, venue)), ` ${open ? "▾" : "▸"}`] : []));
    }
}

/**
 * A venue's card: its status line and link, then the listing's fields (or Edit's
 * inputs), then its actions, and under Save what the PC refused. A venue the row
 * is not on has only the line and its Add; for an account without that venue (GET /me),
 * the line why instead of Add.
 */
function cardNodes(venue) {
    const row = admin.row;
    const c = admin.cards[venue];
    const busy = rowBusy();
    c.line = document.createElement("p");
    c.button = null;
    paintLine(venue);
    if (!rowVenues(row).includes(venue)) {
        if (venueAllowed(me, venue)) return [c.line, actionsNode(venue, busy)];
        const off = document.createElement("p");
        off.className = "venue-status venue-off-note";
        off.textContent = CRAIGSLIST_OFF;
        return [c.line, off];
    }
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

/**
 * A card's status line and its pressed button, rewritten in place: a poll changes
 * them and nothing else (the button's "tap again to cancel" goes at the PC's
 * publishing step).
 */
function paintLine(venue) {
    const c = admin.cards[venue];
    if (!c.line || !admin.row) return;
    const line = cardLine(admin.row, venue, c);
    c.line.textContent = line.text;
    c.line.className = line.kind ? `venue-status ${line.kind}` : "venue-status";
    if (c.button) paintTaskButton(c, c.button);
}

/**
 * An Admin job button while its job is pressed: the ring, and "tap again to cancel"
 * while taskCancel says so; paused, continue and its reset. It takes a tap whenever
 * taskTap has something for it to do.
 */
function paintTaskButton(task, { node, word, reset }) {
    node.disabled = !taskTap(task);
    paintJobButton(node, word, { busy: true, cancel: taskCancel(task), paused: task.paused, reset });
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
 * Post on <venue> is the posting screen's own venue button, the big outlined pill across
 * the card, its reset under it (Michal, 2026-10-08: "I did post something to craigslist;
 * the button was weird. Make the same style button as when we post to venues
 * originally"); the rest are small pills under it.
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
    for (const action of venueActions(row, venue, readUnsynced())) {
        if (action === "end" && c.noEnd) continue;
        const word = actionWord(action, venue);
        const look = action === "post" ? "big venue-btn" : "pill";
        if (action === "open") {
            box.append(linkNode(venueStatus(row, venue).url, "pill", word));
            continue;
        }
        if (pressed(c, action)) {
            // the one pressed: its ring; a tap pauses it, and its reset (beside it) calls it off
            const mine = admin.shown;
            const paint = () => {
                if (mine === admin.shown) renderCards();
            };
            const node = actionButton(word, look, true, () => onTaskTap(c, paint));
            const reset = actionButton(RESET, "reset-call", false, () => {
                resetTask(c, paint).catch(() => {});
            });
            reset.setAttribute("aria-label", `${RESET} ${word}`);
            c.button = { node, word, reset };
            paintTaskButton(c, c.button);
            box.append(node, reset);
            continue;
        }
        box.append(actionButton(word, look, busy, () => onAction(venue, action)));
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
        // choices: the Condition chips (eBay's), every condition until the server says which
        c.edit = { before, values: { ...before }, error: "", choices: conditionChoices(null), choiceError: "" };
        c.note = null;
        renderCards();
        if (venue === "ebay") readConditions(c.edit).catch(() => {});
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
 * and has a clear that empties its override; eBay's Condition is a row of chips.
 * Locked while the row is busy.
 */
function editNode(venue, busy) {
    const form = document.createElement("div");
    form.className = "edit-form";
    const from = venue === "craigslist" ? derivedFields({ ...admin.row, craigslist: {} }, venue) : {};
    for (const f of EDIT_FIELDS[venue]) {
        form.append(f.kind === "choice" ? choiceNode(venue, f) : fieldNode(venue, f, from[f.key], busy));
    }
    return form;
}

/**
 * The eBay card's Edit asks which conditions eBay allows the row's category (Michal,
 * 2026-10-08: "there should be an option to change the condition there"). Until the
 * server answers, and when it cannot say (an older server's 404; a call that failed,
 * said under the chips), the chips offer every condition the page knows. The chip
 * pressed follows the server's `current` unless he has pressed one already.
 */
async function readConditions(edit) {
    const row = admin.row;
    const pc = settings();
    if (!row || !pc) return;
    let answer;
    try {
        answer = await getConditions(pc, row.sku);
        heard(200);
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        answer = e.status === 404 ? null : { allowed: [], error: e.message };
    }
    if (admin.cards.ebay.edit !== edit) return;
    edit.choices = conditionChoices(answer);
    const { current } = edit.choices;
    if (current && edit.values.condition === edit.before.condition) {
        edit.before.condition = current;
        edit.values.condition = current;
    }
    paintChoices("ebay");
}

/**
 * Edit's Condition: its label, then the chips (paintChoices). Painted in place, so the
 * server's late answer or a tap on a chip leaves what is typed below as it is.
 */
function choiceNode(venue, f) {
    const field = document.createElement("div");
    field.className = "field";
    const head = document.createElement("div");
    head.className = "field-head";
    const label = document.createElement("span");
    label.className = "field-label";
    label.textContent = f.label;
    head.append(label);
    const box = document.createElement("div");
    box.className = "chips chips-conditions";
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", f.label);
    admin.cards[venue].edit.choiceField = { field, head, box, key: f.key };
    paintChoices(venue);
    return field;
}

/**
 * The Condition chips, one per choice in its words, the one chosen pressed (the
 * inventory Options' small chips); under them why every condition is offered, and the
 * server's refusal of the one sent. Locked while the row is busy.
 */
function paintChoices(venue) {
    const edit = admin.cards[venue].edit;
    if (!edit || !edit.choiceField) return;
    const { field, head, box, key } = edit.choiceField;
    const locked = rowBusy();
    box.replaceChildren(
        ...edit.choices.chips.map(({ value, label }) => {
            const chip = actionButton(label, "chip", locked, () => {
                edit.values[key] = value;
                paintChoices(venue);
            });
            chip.setAttribute("aria-pressed", edit.values[key] === value ? "true" : "false");
            return chip;
        })
    );
    const lines = [];
    for (const [text, className] of [
        [edit.choices.note, "choice-note"],
        [edit.choiceError, "edit-error"],
    ]) {
        if (!text) continue;
        const line = document.createElement("p");
        line.className = className;
        line.textContent = text;
        lines.push(line);
    }
    field.replaceChildren(head, box, ...lines);
}

function fieldNode(venue, f, from, locked) {
    const values = admin.cards[venue].edit.values;
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
 * A card's Save: one PATCH with only the fields changed (patchBody; the condition
 * only when another chip was pressed); nothing changed sends nothing. The row the PC
 * answers is shown; a refusal is said under Save (one of the condition under its chips)
 * and the inputs stay as typed.
 */
async function saveEdit(venue) {
    const c = admin.cards[venue];
    const row = admin.row;
    const pc = settings();
    if (!c.edit || !row || !pc || rowBusy()) return;
    const body = patchBody(venue, c.edit.before, c.edit.values);
    if (!body) {
        c.edit = null;
        renderCards();
        return;
    }
    const mine = admin.shown;
    c.wait = "saving";
    c.edit.error = "";
    c.edit.choiceError = "";
    renderCards();
    let whole;
    try {
        whole = await patchRow(pc, row.sku, body);
    } catch (e) {
        if (mine !== admin.shown) return;
        if (e.status === 0 || e.status === 401) heard(e.status);
        c.wait = "";
        if (conditionRefused(body, e)) c.edit.choiceError = e.message;
        else c.edit.error = e.message;
        renderCards();
        return;
    }
    if (mine !== admin.shown) return;
    heard(200);
    c.wait = "";
    c.edit = null;
    c.note = null;
    c.job = null;
    markBehind(row.sku, row, whole);
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
 * Post on a venue (the row the PC saved, by its sku), Sync to craigslist (the push job),
 * Refresh status or End listing: after the second a job button waits, the job is sent,
 * its line is the card's status line, polled every POLL_MS like a venue button's, and once
 * done the row is read again (the link a post put up, the status a refresh or an end
 * read). An End the PC refuses (400) says why, and its button goes; a push it refuses (a
 * PC not yet pushing to craigslist) says why. A tap on its button pauses it (onTaskTap),
 * and its reset calls it off.
 */
async function runAction(venue, action) {
    const c = admin.cards[venue];
    const row = admin.row;
    const pc = settings();
    if (!row || !pc || rowBusy()) return;
    const mine = admin.shown;
    c.action = action;
    c.confirm = false;
    c.note = null;
    c.job = null;
    c.stopping = false;
    c.wait = "sending";
    const waited = pressWait(c);
    renderCards();
    if (!(await waited) || mine !== admin.shown) return;
    const body =
        action === "post"
            ? jobRequest({ venue, sku: row.sku })
            : actionJob(action === "sync" ? "push" : action, { sku: row.sku, venue });
    let answer;
    try {
        answer = await sendJob(pc, body);
    } catch (e) {
        if (mine !== admin.shown) return;
        if (e.status === 0 || e.status === 401) heard(e.status);
        c.action = "";
        c.wait = "";
        c.note = { text: e.message, kind: "bad" };
        if (action === "end" && e.status === 400) c.noEnd = true;
        renderCards();
        return;
    }
    if (mine !== admin.shown) return;
    heard(200);
    c.wait = "";
    c.job = { action: body.action || action, venue, job: answer.job, state: answer.state || "queued", ahead: answer.ahead };
    c.ask = () => {
        askJob(c, mine, () => paintLine(venue)).catch(() => {});
    };
    renderCards();
    later(c);
}

/**
 * The second an Admin job button waits before its job leaves the phone
 * (SEND_DELAY_MS), as a venue button's: true once it has passed (or continue cut it
 * short), false when reset dropped the press meanwhile (takeBack). Paused, the press
 * is held: its timer stops and `resolve` waits for continue or reset.
 */
function pressWait(task) {
    return new Promise((resolve) => {
        task.press = {
            resolve,
            timer: setTimeout(() => {
                task.press = null;
                resolve(true);
            }, SEND_DELAY_MS),
        };
    });
}

/** The task's button for `action` is the pressed one: its job on its way or on the PC. */
function pressed(task, action) {
    return task.action === action && (!!task.wait || jobRunning(task.job));
}

/** A press still in its second let go: nothing has left the phone, and nothing will. */
function takeBack(task) {
    if (!task.press) return;
    clearTimeout(task.press.timer);
    task.press.resolve(false);
    task.press = null;
}

/** A task's job asked about in POLL_MS (its `ask`, set once the PC has it). */
function later(task) {
    clearTimeout(task.timer);
    task.timer = setTimeout(task.ask, POLL_MS);
}

/**
 * An Admin job button's pressed one tapped, as a venue button is (onVenueTap): a busy
 * one pauses, a paused one continues, a publishing one says it is too late; nothing
 * while its POST is on its way. `paint` puts the task on screen.
 */
function onTaskTap(task, paint) {
    const tap = taskTap(task);
    if (tap === "pause") {
        // nothing goes to the PC: a press in its second is held, a job the PC has no longer asked about
        task.paused = true;
        if (task.press) clearTimeout(task.press.timer);
        clearTimeout(task.timer);
        paint();
    } else if (tap === "continue") {
        // a held press goes now, its second over; a job the PC has is asked about again at once
        task.paused = false;
        if (task.press) {
            const { resolve } = task.press;
            task.press = null;
            resolve(true);
        } else {
            task.ask();
        }
        paint();
    } else if (tap === "late") {
        tooLate(task, paint);
    }
}

/**
 * reset, beside a paused Admin job button, as a venue button's (resetPress): a press
 * held in its second is dropped, nothing sent; a job the PC has is told to stop
 * (DELETE /jobs/<id>), dropped if still queued, stopped at its next step if running.
 * Either way the button is its word again at once and the line says cancelled; a job
 * stopping is still asked about, quietly, until the PC says it stopped.
 */
async function resetTask(task, paint) {
    if (!task.paused) return;
    task.paused = false;
    task.action = "";
    if (task.press) {
        takeBack(task);
        task.wait = "";
        task.note = { text: CANCELLED, kind: "bad" };
        paint();
        return;
    }
    const id = task.job.job;
    clearTimeout(task.timer);
    task.job = { ...task.job, state: CANCELLED, trouble: "" };
    task.stopping = true;
    paint();
    const pc = settings();
    if (!pc) return;
    const stopping = () => task.stopping && !!task.job && task.job.job === id;
    try {
        const answer = await cancelJob(pc, id);
        // dropped before it ran: nothing more to hear
        if (answer.state === "cancelled" && stopping()) task.stopping = false;
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        say(`Could not cancel: ${e.message}`, "warn");
    }
    if (stopping()) later(task);
}

/**
 * GET /jobs/<id> for a task's job: true once it has ended, its answer in `task.job`.
 * While it runs its line is painted and it is asked again in POLL_MS. An answer is
 * dropped once the task is paused or has another job; a job reset (`stopping`) is
 * not shown running again, only asked about until it ends.
 */
async function askTask(task, paint) {
    const pc = settings();
    if (!pc || !task.job || task.paused) return false;
    const id = task.job.job;
    const current = () => !task.paused && !!task.job && task.job.job === id;
    let status;
    try {
        status = await getJob(pc, id);
    } catch (e) {
        if (!current()) return false;
        if (e.status === 0) {
            // the job is safe on the PC's disk: keep asking
            if (!task.stopping) {
                task.job = { ...task.job, trouble: e.message };
                paint();
            }
            later(task);
            return false;
        }
        status = { state: "failed", error: e.message };
    }
    if (!current()) return false;
    if (task.stopping && jobRunning(status)) {
        later(task);
        return false;
    }
    task.job = { ...task.job, ...status, trouble: "" };
    if (jobRunning(task.job)) {
        paint();
        later(task);
        return false;
    }
    task.action = "";
    task.stopping = false;
    // the job ended (a card's post uses a posting): the credits line follows
    loadMe().catch(() => {});
    return true;
}

/** A card's job (or customize's push) asked about; `paint` rewrites its status line while it runs. */
async function askJob(c, mine, paint) {
    if (mine !== admin.shown) return;
    const ended = await askTask(c, paint);
    if (!ended || mine !== admin.shown) return;
    if (c.job.state !== "done") {
        renderCards();
        return;
    }
    // a push (customize's Sync to eBay, the card's Sync to craigslist): that venue has the row
    // now, and its list badge is plain again
    if (c.job.action === "push") markUnsynced(admin.row.sku, c.job.venue, false);
    admin.changed = true;
    const pc = settings();
    let whole;
    try {
        whole = await getRow(pc, admin.row.sku);
    } catch (e) {
        if (mine !== admin.shown) return;
        detailLine(refusalLine(`Could not read ${admin.row.sku}`, e.status, e.message));
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
            tile.textContent = "not on the server";
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
    showCard(false);
}

/**
 * A listing is a page of its own (Michal, 2026-10-07: "Now when I am on a card I
 * don't want to see admin or settings above. Looking at an item is a new page (at
 * the top it just says back to inventory)"): while one is on screen Admin's title,
 * Settings, the inventory's own line, the sync bar and Close step aside, and Back
 * is the top of the page. The header and its Admin link stay.
 */
function showCard(on) {
    if (on) showSettings(false);
    if (on) visit.sawCard = true;
    for (const node of [el.adminTitle, el.settingsToggle, el.inventoryToggle, el.syncBar, el.adminClose]) node.hidden = on;
    el.inventoryBrowse.hidden = on;
    el.inventoryDetail.hidden = !on;
    renderExtras();
}

// --- Admin's Feedback and Stats ---------------------------------------------------------

/**
 * Feedback and Stats, after the inventory: each a foldout as Settings is, both stepping
 * aside on a listing's own page. Stats is an admin's only (GET /me says so) and goes for
 * good once the server refuses it (403, or a 404 from an older server).
 */
function renderExtras() {
    const card = !el.inventoryDetail.hidden;
    el.feedbackToggle.hidden = card;
    el.feedback.hidden = card || !extras.feedback;
    // an admin's new entries, counted in the toggle and listed above the box
    const entries = me && me.admin ? inbox.entries : [];
    fold(el.feedbackToggle, feedbackWord(entries.length), extras.feedback);
    el.feedbackInbox.hidden = !entries.length;
    const stats = !card && !!me && me.admin && !extras.refused;
    el.statsToggle.hidden = !stats;
    el.stats.hidden = !stats || !extras.stats;
    fold(el.statsToggle, "Stats", extras.stats);
    for (const { value, node } of el.statsChips) node.setAttribute("aria-pressed", value === extras.since ? "true" : "false");
}

/** The last job id the page has: the one it last sent, else one of the items in hand's. */
function lastJobId() {
    if (lastJob) return lastJob;
    for (const m of [mode, other(mode)]) {
        for (const venue of VENUES) if (slots[m].jobs[venue].jobId) return slots[m].jobs[venue].jobId;
    }
    return "";
}

/** POST /jobs, its job id remembered for Feedback's Include my last job. */
async function sendJob(pc, body) {
    const answer = await postJob(pc, body);
    if (answer && typeof answer.job === "string") lastJob = answer.job;
    return answer;
}

/**
 * Feedback's Send: the words, where he came from (feedbackScreen), the page's version and,
 * ticked, the last job. Sent, the box clears and says thanks; a refusal is the server's words.
 */
async function sendFeedback() {
    const pc = settings();
    if (!pc) {
        el.feedbackStatus.textContent = "Set the server address and key under Settings first.";
        return;
    }
    const body = feedbackBody({
        text: el.feedbackText.value,
        screen: feedbackScreen(visit.from, visit.sawCard),
        version: VERSION,
        job: el.feedbackJob.checked ? lastJobId() : "",
    });
    if (!body) {
        el.feedbackStatus.textContent = "Write what happened first.";
        return;
    }
    el.feedbackSend.disabled = true;
    el.feedbackStatus.textContent = "Sending...";
    try {
        await postFeedback(pc, body);
        heard(200);
        el.feedbackText.value = "";
        el.feedbackStatus.textContent = FEEDBACK_SENT;
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        el.feedbackStatus.textContent = refusalLine("Not sent", e.status, e.message);
    } finally {
        el.feedbackSend.disabled = false;
    }
}

/**
 * The admin's Feedback inbox (Michal, 2026-10-08), asked as Admin opens, as /me says he is an
 * admin, and as the foldout opens: the new entries, newest first. A 403 or an older server's
 * 404 leaves Feedback as everyone else has it; no answer keeps what it had.
 */
async function loadInbox() {
    const pc = settings();
    if (!pc || !me || !me.admin || inbox.refused) return;
    inbox.asked += 1;
    const mine = inbox.asked;
    let answer;
    try {
        answer = await getFeedbackInbox(pc);
    } catch (e) {
        if (mine !== inbox.asked) return;
        if (e.status === 403 || e.status === 404) {
            inbox.refused = true;
            inbox.entries = [];
            renderExtras();
        }
        if (e.status === 0 || e.status === 401) heard(e.status);
        return;
    }
    if (mine !== inbox.asked) return;
    heard(200);
    inbox.entries = inboxOf(answer);
    renderInbox();
}

/** Each new entry: who, when, from where, the words, its job's error if it failed, and Reviewed. */
function renderInbox() {
    el.feedbackInbox.replaceChildren(
        ...inbox.entries.map((entry) => {
            const box = document.createElement("div");
            box.className = "inbox-entry";
            const line = (className, text) => {
                const p = document.createElement("p");
                p.className = className;
                p.textContent = text;
                return p;
            };
            box.append(line("inbox-head", inboxHead(entry)), line("inbox-text", entry.text));
            if (entry.error) box.append(line("inbox-error", `Job error: ${entry.error}`));
            box.append(
                actionButton("Reviewed", "pill pill-small", inbox.busy.has(entry.id), () => {
                    reviewEntry(entry.id).catch(() => {});
                })
            );
            return box;
        })
    );
    renderExtras();
}

/** Reviewed: PATCH /feedback/<id> {"reviewed": true}, and the entry leaves the inbox; refused, it stays and the line says why. */
async function reviewEntry(id) {
    const pc = settings();
    if (!pc || inbox.busy.has(id)) return;
    inbox.busy.add(id);
    renderInbox();
    try {
        await reviewFeedback(pc, id);
        heard(200);
        inbox.entries = inbox.entries.filter((e) => e.id !== id);
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        el.feedbackStatus.textContent = refusalLine("Not marked reviewed", e.status, e.message);
    } finally {
        inbox.busy.delete(id);
        renderInbox();
    }
}

/**
 * Stats, asked afresh each time the foldout opens or a chip is tapped: the small table
 * (statsTable), counts only. A 403 or 404 takes the foldout away.
 */
async function loadStats() {
    const pc = settings();
    if (!pc) return;
    extras.asked += 1;
    const mine = extras.asked;
    el.statsStatus.textContent = "Asking the server...";
    let answer;
    try {
        answer = await getStats(pc, extras.since);
    } catch (e) {
        if (mine !== extras.asked) return;
        if (e.status === 403 || e.status === 404) {
            extras.refused = true;
            renderExtras();
            return;
        }
        if (e.status === 0 || e.status === 401) heard(e.status);
        el.statsStatus.textContent = `Could not read the stats: ${e.message}.`;
        return;
    }
    if (mine !== extras.asked) return;
    heard(200);
    el.statsStatus.textContent = "";
    const { rows, users } = statsTable(answer);
    const figures = document.createElement("table");
    for (const [label, value] of rows) figures.append(tableRow("th", [label], value));
    const people = document.createElement("table");
    people.append(tableRow("th", ["user", "actions", "posted", "cost"]));
    for (const [name, ...rest] of users) people.append(tableRow("td", [name, ...rest]));
    el.statsTable.replaceChildren(figures, ...(users.length ? [people] : []));
}

/** One table row: cells of `kind` for `cells`, and, given, a last plain cell. */
function tableRow(kind, cells, last) {
    const tr = document.createElement("tr");
    for (const text of cells) {
        const cell = document.createElement(kind);
        cell.textContent = text;
        tr.append(cell);
    }
    if (last !== undefined) {
        const cell = document.createElement("td");
        cell.textContent = last;
        tr.append(cell);
    }
    return tr;
}

/**
 * Back to the list: on the row the detail was opened from, however long the list,
 * and the listing no longer remembered. A card that changed the row has the list
 * asked for again, so it says what the PC says now, as has a listing Admin reopened
 * (no list behind it yet).
 */
function backToList() {
    const from = admin.from;
    const changed = admin.changed;
    removeText("localStorage", CARD_KEY);
    showList();
    if (changed || !from) {
        loadInventory().catch(() => {});
        return;
    }
    if (typeof from.scrollIntoView === "function") from.scrollIntoView({ block: "center" });
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
 * The sync bar's two buttons: after the second a job button waits, the sync job
 * is sent, its line under them (queued, the PC's step, its summary or its error),
 * polled every POLL_MS; the other locks until it ends, the pressed one turns its
 * ring, a tap on it pauses the job (onTaskTap) and reset under them calls it off,
 * and once done the inventory list is asked for again. A refusal shows the PC's
 * words. The job is the PC's: closing Admin leaves it running and polled.
 */
async function startSync(direction) {
    if (sync.wait || jobRunning(sync.job)) {
        if (pressed(sync, direction)) onTaskTap(sync, renderSync);
        return;
    }
    const pc = settings();
    sync.job = null;
    if (!pc) {
        sync.note = { text: "Set the server address and key under Settings first.", kind: "bad" };
        renderSync();
        return;
    }
    sync.action = direction;
    sync.note = null;
    sync.stopping = false;
    sync.wait = "sending";
    const waited = pressWait(sync);
    renderSync();
    if (!(await waited)) return;
    let answer;
    try {
        answer = await sendJob(pc, actionJob("sync", { direction }));
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        sync.action = "";
        sync.wait = "";
        sync.note = { text: e.message, kind: "bad" };
        renderSync();
        return;
    }
    heard(200);
    sync.wait = "";
    sync.job = { action: "sync", direction, job: answer.job, state: answer.state || "queued", ahead: answer.ahead };
    sync.ask = () => {
        askSync().catch(() => {});
    };
    renderSync();
    later(sync);
}

async function askSync() {
    if (!(await askTask(sync, renderSync))) return;
    renderSync();
    // Sync to eBay put every row on its eBay listing: no eBay listing is behind its row any
    // more (a craigslist one still is)
    if (sync.job.state === "done" && sync.job.direction === "to") {
        writeJson("localStorage", UNSYNCED_KEY, unsyncedWithout(readUnsynced(), "ebay"));
    }
    if (sync.job.state !== "done" || el.admin.hidden || !admin.inventoryOpen) return;
    // a listing open in place of the list: the list is asked for again on the way back
    if (!el.inventoryDetail.hidden) admin.changed = true;
    else loadInventory().catch(() => {});
}

/**
 * The sync bar's line, and its two buttons: each its icon and word, the pressed one
 * its ring (continue while paused), and the one reset under them while it is paused.
 */
function renderSync() {
    const line = busyLine(sync);
    el.syncStatus.textContent = line ? line.text : "";
    el.syncStatus.className = line && line.kind ? `sync-status ${line.kind}` : "sync-status";
    const locked = !!sync.wait || jobRunning(sync.job);
    for (const { direction, btn, icon } of el.syncButtons) {
        const busy = pressed(sync, direction);
        btn.disabled = locked && !(busy && taskTap(sync));
        paintJobButton(btn, SYNC_WORDS[direction], {
            busy,
            cancel: busy && taskCancel(sync),
            paused: busy && sync.paused,
            lead: [icon],
        });
    }
    el.syncReset.hidden = !sync.paused;
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
    renderSignOut();
}

/**
 * What the PC last said: 200, or the PcError status (0 = no answer). A 401 on a phone
 * signed in by a link (no key) is a session the server no longer knows: it is let go and
 * the landing says so.
 */
function heard(status) {
    serverStatus = status;
    const s = settings();
    if (status === 401 && s && s.session) {
        for (const store of ["localStorage", "sessionStorage"]) removeText(store, SESSION_KEY);
        toLanding(SIGNIN_EXPIRED);
        return;
    }
    renderServer();
}

/**
 * GET /me, kept in memory (Michal, 2026-10-08: "Keep the Craigslist button gray and when
 * tapped write 'contact developer'"): what the account may do. A 404 (an older server)
 * leaves everything as before; no answer keeps what the last one said (nothing, on a load).
 * Asked again after every job ends, so the credits line keeps up with the postings used.
 */
async function loadMe() {
    const pc = settings();
    if (!pc) return;
    meAsked = true;
    // another account may be allowed Stats and the Feedback inbox
    extras.refused = false;
    inbox.refused = false;
    try {
        me = meOf(await getMe(pc));
    } catch (e) {
        if (e.status !== 0) me = null;
        if (e.status === 401) heard(401);
    }
    renderMe();
    if (!el.admin.hidden) loadInbox().catch(() => {});
}

/**
 * What /me changes on screen: the craigslist button, an empty craigslist card, Stats, the
 * Account block, and a sign-up's steps in place of the posting screens.
 */
function renderMe() {
    render();
    renderExtras();
    renderAccount();
    if (admin.row) renderCards();
}

/**
 * Finish signing up (Michal, 2026-10-08), while /me says the sign-up is not done: step 1,
 * Connect eBay, until eBay made the account a real one (then ticked, its button gone); step
 * 2, the address, greyed until then. Its line is the Account block's (Connect eBay's way out
 * and what went wrong, a 503's words among them).
 */
function renderSignup() {
    const step = settings() ? signupStep(me) : "";
    const connected = step === "address";
    el.signupStepEbay.classList.toggle("done", connected);
    el.signupConnect.hidden = connected;
    el.signupConnect.disabled = account.busy;
    el.signupStepAddress.classList.toggle("off", !connected);
    el.signupAddress.disabled = !connected;
    el.signupStatus.textContent = step ? account.status : "";
}

/** Settings' Seller address unfolded, its note saying why: step 2 of a sign-up. */
function openSeller() {
    seller.open = true;
    renderAccount();
    if (typeof el.sellerToggle.scrollIntoView === "function") el.sellerToggle.scrollIntoView({ block: "start" });
}

// --- Settings' Account block: postings, Buy postings, Connect eBay --------------------------
// Michal, 2026-10-08: three free postings per person, then prepaid postings bought through
// Stripe; and Connect eBay from the phone, for another seller's own eBay. The page only sends
// the browser to Stripe's or eBay's page; each sends it back here with a hash (cameBack).

/**
 * The Account block from /me: each part only when the server gives it, and no block at all
 * from an older server (no /me), unless its line has something to say.
 */
function renderAccount() {
    const s = settings();
    const credits = me ? me.credits : null;
    const packs = me ? me.packs : [];
    // an unlimited key has nothing to buy
    const canBuy = packs.length > 0 && !(credits && credits.unlimited);
    const user = !me ? "" : me.pending ? pendingLine(me.email) : userLine(me.user, !!(s && s.session));
    const left = creditsLine(credits);
    // the seller's answer is the newer word on her eBay (its policies follow a Save)
    const ebayNow = (seller.info && seller.info.ebay) || (me ? me.ebay : null);
    const ebay = ebayLine(ebayNow, seller.ready);
    el.account.hidden = !me && !account.status && !seller.info;
    el.accountUser.textContent = user;
    el.accountUser.hidden = !user;
    el.accountCredits.textContent = left;
    el.accountCredits.hidden = !left;
    el.accountBuy.hidden = !canBuy;
    el.accountBuy.disabled = account.busy;
    el.accountBuy.setAttribute("aria-expanded", canBuy && account.packs ? "true" : "false");
    el.accountPacks.hidden = !canBuy || !account.packs;
    el.accountPacks.replaceChildren(
        ...packs.map((pack) => {
            const pill = document.createElement("button");
            pill.type = "button";
            pill.className = "pill pill-ink pill-small";
            pill.textContent = packLabel(pack);
            pill.disabled = account.busy;
            pill.addEventListener("click", () => {
                buyPack(pack).catch(() => {});
            });
            return pill;
        })
    );
    el.accountEbay.textContent = ebay;
    el.accountEbay.hidden = !ebay;
    el.accountConnect.hidden = !ebayNow || ebayNow.connected;
    el.accountConnect.disabled = account.busy;
    renderSeller();
    el.accountStatus.textContent = account.status;
    renderSignup();
}

// --- the seller's address, under the eBay line --------------------------------------------
// Michal, 2026-10-08: "What else do we need for the multi tenant? Let's continue." Another
// seller's listings ship from, and are picked up at, her own address: the server keeps it
// (GET/PATCH /me/seller) and sets up her eBay business policies from it.

/** The Seller address foldout: shown once the server gave an answer, open or folded, its line and its Save. */
function renderSeller() {
    const info = seller.info;
    el.sellerToggle.hidden = !info;
    fold(el.sellerToggle, "Seller address", seller.open);
    el.seller.hidden = !info || !seller.open;
    const note = sellerLine(info);
    el.sellerNote.textContent = note;
    el.sellerNote.hidden = !note;
    el.sellerSave.disabled = seller.busy;
    el.sellerStatus.textContent = seller.status;
}

/** The four boxes as the server has the address (Settings opened, a Save answered). */
function fillSeller(info) {
    el.sellerLine1.value = info.address.line1;
    el.sellerCity.value = info.address.city;
    el.sellerState.value = info.address.state;
    el.sellerZip.value = info.address.postal_code;
}

/** Folded and quiet for the next visit, and no more asking about the policies. */
function quietSeller() {
    clearTimeout(seller.poll);
    Object.assign(seller, { open: false, status: "", ready: false, poll: null, polls: 0 });
    seller.asked += 1;
}

/**
 * GET /me/seller, as Settings opens: the boxes filled, and the foldout open by itself, saying
 * why, when eBay is connected and the address is missing. An older server's 404: no foldout.
 */
async function loadSeller() {
    const pc = settings();
    if (!pc) return;
    seller.asked += 1;
    const mine = seller.asked;
    try {
        const info = sellerOf(await getSeller(pc));
        if (mine !== seller.asked) return;
        seller.info = info;
        if (info) {
            fillSeller(info);
            if (sellerLine(info)) seller.open = true;
            if (info.ebay && info.ebay.policies === "pending") pollSeller(true);
        }
    } catch (e) {
        if (mine !== seller.asked) return;
        if (e.status === 404) seller.info = null;
        if (e.status === 0 || e.status === 401) heard(e.status);
    }
    renderAccount();
}

/**
 * Save address: PATCH /me/seller with the four boxes (addressBody), or the box that is not
 * right named and nothing sent. Saved, the eBay line follows the answer's policies: asked
 * again every 10 s while they are being set up.
 */
async function saveSeller() {
    const pc = settings();
    if (!pc || seller.busy) return;
    const made = addressBody({
        line1: el.sellerLine1.value,
        city: el.sellerCity.value,
        state: el.sellerState.value,
        zip: el.sellerZip.value,
    });
    if (!made.ok) {
        seller.status = made.error;
        renderAccount();
        return;
    }
    seller.busy = true;
    seller.status = "Saving...";
    // a poll still on its way is for the address before this one
    clearTimeout(seller.poll);
    seller.poll = null;
    seller.asked += 1;
    const mine = seller.asked;
    renderAccount();
    try {
        const info = sellerOf(await patchSeller(pc, made.body));
        // Admin closed meanwhile (or another account): the next visit asks afresh
        if (mine !== seller.asked) return;
        seller.status = "saved";
        if (info) {
            seller.info = info;
            fillSeller(info);
            const policies = info.ebay ? info.ebay.policies : "";
            seller.ready = policies === "ready";
            if (policies === "pending") pollSeller(true);
        }
        // a sign-up's last step: the address in, /me says registered, and the goods screen is his
        if (signupStep(me) === "address") loadMe().catch(() => {});
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        if (mine === seller.asked) seller.status = sellerError(e.status, e.message);
    } finally {
        seller.busy = false;
        renderAccount();
    }
}

/**
 * While eBay's policies are being set up: GET /me/seller every 10 s until they are ready
 * (said once) or failed, three minutes at most (`fresh` starts the count again). The boxes
 * are left as he may be typing in them.
 * @param {boolean} fresh
 */
function pollSeller(fresh) {
    clearTimeout(seller.poll);
    if (fresh) seller.polls = 0;
    if (seller.polls >= SELLER_POLL_MAX) {
        seller.poll = null;
        return;
    }
    seller.poll = setTimeout(async () => {
        seller.poll = null;
        seller.polls += 1;
        const pc = settings();
        if (!pc) return;
        const mine = seller.asked;
        try {
            const info = sellerOf(await getSeller(pc));
            if (mine !== seller.asked || !info) return;
            seller.info = info;
        } catch (e) {
            if (e.status === 401) heard(401);
            if (mine !== seller.asked) return;
        }
        const policies = seller.info && seller.info.ebay ? seller.info.ebay.policies : "";
        if (policies === "ready") seller.ready = true;
        renderAccount();
        if (policies === "pending") pollSeller(false);
    }, SELLER_POLL_MS);
}

/**
 * Admin open on Settings, at the Account block: where a venue button's Buy postings leads
 * (`packs`: its pack choice unfolded), and the way back from Stripe or eBay.
 * @param {boolean} packs
 */
function openAccount(packs) {
    if (el.admin.hidden) {
        Object.assign(visit, { from: settings() ? mode : "admin", sawCard: false });
        adminShown(true);
    }
    showSettings(true);
    account.packs = packs;
    renderAccount();
    if (typeof el.account.scrollIntoView === "function") el.account.scrollIntoView({ block: "start" });
}

/**
 * A pack's pill: POST /pay/checkout, and the browser to Stripe's page. Payments not set up
 * (503) says the server's words.
 */
async function buyPack(pack) {
    const pc = settings();
    if (!pc || account.busy) return;
    await leaveFor("pay", "Opening the payment page...", () => checkout(pc, pack.id));
}

/** Connect eBay: GET /ebay/connect, and the browser to eBay's consent page. */
async function connectEbay() {
    const pc = settings();
    if (!pc || account.busy) return;
    await leaveFor("connect", "Opening eBay...", () => ebayConnect(pc));
}

/**
 * Ask the server for the page to send the browser to (`ask`), and go there; the way back
 * is a hash (cameBack). Said on the Account block's line meanwhile, and on a refusal.
 * @param {"pay"|"connect"} what
 * @param {string} meanwhile
 * @param {() => Promise<{url?:unknown}>} ask
 */
async function leaveFor(what, meanwhile, ask) {
    account.busy = true;
    account.status = meanwhile;
    renderAccount();
    try {
        const answer = await ask();
        const url = safeLink(answer.url);
        if (!url) throw new PcError(200, "the server gave no address");
        globalThis.location.assign(url);
    } catch (e) {
        account.status = accountError(what, e.status, e.message);
        // a session the server forgot: the landing, and the line goes with Admin
        if (e.status === 0 || e.status === 401) heard(e.status);
    } finally {
        account.busy = false;
        renderAccount();
    }
}

/**
 * Back from Stripe (`#paid=`) or eBay (`#ebay=`): Admin on Settings, the line says how it
 * went, and /me is asked again for the postings or the eBay now there.
 * @param {{kind:"paid"|"ebay", value:string}} back
 */
function cameBack(back) {
    account.status = returnLine(back);
    openAccount(false);
    loadMe()
        .then(() => {
            // a sign-up's eBay connected: the account is real now, and the address is next
            if (back.kind === "ebay" && signupStep(me) === "address" && !el.admin.hidden) openSeller();
        })
        .catch(() => {});
}

/**
 * The landing again, with `message` on it: Admin closed, the server word and /me let go.
 * The items in hand stay saved for when he is back in.
 */
function toLanding(message) {
    me = null;
    meAsked = false;
    seller.info = null;
    quietSeller();
    serverStatus = null;
    clearTimeout(healthTimer);
    healthTimer = null;
    entry = "";
    el.landingStatus.textContent = message;
    if (!el.admin.hidden) showAdmin(false);
    askSignup().catch(() => {});
    render();
    renderServer();
    renderExtras();
    renderAccount();
}

/**
 * Settings' Sign out / Forget this server: the address, the key and any session gone from
 * this phone, and the landing back (Michal, 2026-10-08). Sign out first tells the server
 * to forget the session (DELETE /auth/session); its answer is not waited for, and a
 * refusal or no answer changes nothing: the phone forgets the session either way.
 */
function forgetServer() {
    const s = settings();
    if (s && s.session) endSession(s).catch(() => {});
    for (const key of [PC_KEY, KEY_KEY, SESSION_KEY]) removeText("localStorage", key);
    removeText("sessionStorage", SESSION_KEY);
    toLanding("");
}

/** Settings' last button: Sign out on a phone signed in by a link, Forget this server with a key. */
function renderSignOut() {
    const s = settings();
    el.settingsSignout.hidden = !s;
    el.settingsSignout.textContent = s && s.session ? "Sign out" : "Forget this server";
}

// --- the way in: the landing, sign-in, the home screen ------------------------------

/**
 * GET /auth/signup on the product's server, no key, no session, once while the landing is
 * the screen: open to sign-ups, the landing's Sign in and the sign-in screen say the link
 * also makes the account. A 404 or no answer: the words as they were.
 */
async function askSignup() {
    if (signup.asked) return;
    signup.asked = true;
    try {
        signup.open = signupOf(await getSignup(DEFAULT_SERVER));
    } catch {
        signup.open = false;
    }
    render();
}

/** The landing's Sign in, or the sign-in screen's Back. */
function showSignin(open) {
    entry = open ? "signin" : "";
    el.signinStatus.textContent = "";
    render();
    if (open) el.signinEmail.focus();
}

/**
 * Send me a link: POST /auth/link on the product's server, the email and Keep me signed
 * in. The link it emails opens this page signed in (signIn).
 */
async function sendLink() {
    const checked = checkEmail(el.signinEmail.value);
    if (!checked.ok) {
        el.signinStatus.textContent = checked.error;
        return;
    }
    el.signinSend.disabled = true;
    el.signinStatus.textContent = "Sending...";
    try {
        await askLink(DEFAULT_SERVER, { email: checked.email, remember: el.signinRemember.checked });
        el.signinStatus.textContent = LINK_SENT;
    } catch (e) {
        el.signinStatus.textContent = e.status === 404 ? SIGNIN_MISSING : `Could not send the link: ${e.message}.`;
    } finally {
        el.signinSend.disabled = false;
    }
}

/**
 * The page opened from a sign-in link (`#login=<token>`): the token for a session (POST
 * /auth/session), kept on the phone when he ticked Keep me signed in, else for this tab;
 * then the goods screen, checked and asked about as on any load.
 */
async function signIn(token) {
    el.landingStatus.textContent = "Signing you in...";
    render();
    let made = null;
    try {
        made = sessionOf(await startSession(DEFAULT_SERVER, token));
    } catch (e) {
        el.landingStatus.textContent = signinError(e.status, e.message);
        return;
    }
    if (!made) {
        el.landingStatus.textContent = signinError(400, "");
        return;
    }
    for (const store of ["localStorage", "sessionStorage"]) removeText(store, SESSION_KEY);
    writeText(made.remember ? "localStorage" : "sessionStorage", SESSION_KEY, made.session);
    el.landingStatus.textContent = "";
    entry = "";
    me = null;
    meAsked = false;
    render();
    checkServer().catch(() => {});
    for (const m of MODES) setState(m, reduce(slots[m], { type: "resume" }));
    pump();
    retryLookup();
}

/** Running from the home screen: the display mode an installed web app gets, or an iPhone's own flag. */
function standalone() {
    const view = globalThis.window;
    const query = view && typeof view.matchMedia === "function" ? view.matchMedia("(display-mode: standalone)") : null;
    return installed || !!(query && query.matches) || globalThis.navigator.standalone === true;
}

/** An iPhone or iPad, told the Share taps (it never offers a prompt). */
function onIos() {
    const nav = globalThis.navigator;
    return isIosDevice({ userAgent: nav.userAgent, platform: nav.platform, maxTouchPoints: nav.maxTouchPoints });
}

/**
 * The two install nudges (Michal, 2026-10-08: "If it is not on the home screen it should
 * direct towards that install"): the landing's Install step (never put away), and the
 * banner over the posting screens (`away` while they are not on screen; put away for a week).
 */
function renderInstall(away) {
    const ios = onIos();
    const base = { standalone: standalone(), hasPrompt: !!installPrompt, isIos: ios, now: Date.now() };
    const steps = installSteps(ios);
    const onLanding = installState({ ...base, dismissedAt: "" });
    el.landingInstall.hidden = onLanding === "hidden";
    el.landingInstall.setAttribute("aria-expanded", stepsOpen.landing ? "true" : "false");
    el.landingInstallSteps.textContent = steps;
    el.landingInstallSteps.hidden = onLanding !== "steps" || !stepsOpen.landing;
    const banner = installState({ ...base, dismissedAt: readText("localStorage", INSTALL_KEY) });
    el.installBanner.hidden = away || banner === "hidden";
    el.installAdd.setAttribute("aria-expanded", stepsOpen.banner ? "true" : "false");
    el.installSteps.textContent = steps;
    el.installSteps.hidden = banner !== "steps" || !stepsOpen.banner;
}

/**
 * Install (the landing's) or Add (the banner's): Chrome's own prompt where it offered one
 * (an ask it allows once), else the two taps unfold under the button, or fold again.
 */
async function onInstall(where) {
    const ask = installPrompt;
    if (!ask) {
        stepsOpen[where] = !stepsOpen[where];
        render();
        return;
    }
    installPrompt = null;
    try {
        await ask.prompt();
        const choice = await ask.userChoice;
        if (choice && choice.outcome === "accepted") installed = true;
    } catch {
        /* the browser would not ask: the taps are spelled out instead from now on */
    }
    render();
}

/** The banner's x: away for a week (INSTALL_SNOOZE_MS), counted from now. */
function dismissInstall() {
    writeText("localStorage", INSTALL_KEY, new Date().toISOString());
    render();
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
        // who this is, once per load (and per new settings): craigslist and Stats follow it
        if (!meAsked) loadMe().catch(() => {});
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
        const status = e instanceof PcError ? e.status : 0;
        heard(status);
        // a sign-up not finished is refused all but /me, which says what is left to do
        if (status === 403 && !meAsked) loadMe().catch(() => {});
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
    el.settingsStatus.textContent = "Saved. Checking the server...";
    // new settings, maybe another account: /me and the seller's address are asked afresh
    me = null;
    meAsked = false;
    seller.info = null;
    quietSeller();
    try {
        await checkPc(s);
        heard(200);
        el.settingsStatus.textContent = "Saved. The server answers and knows this key.";
        loadMe().catch(() => {});
        loadSeller().catch(() => {});
    } catch (e) {
        heard(e instanceof PcError ? e.status : 0);
        el.settingsStatus.textContent = refusalLine("Saved, but", e.status, e.message);
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
            say(`${itemName} is no longer on the server.`, "warn");
            setState(m, freshState(m));
        } else {
            // leave the saved item alone: a reload once the PC answers brings it back
            keepSaved[m] = true;
            say(`Could not read ${itemName} back from the server (${e.message}). Its photos are safe there; reload when the server answers.`, "warn");
            setState(m, freshState(m));
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
        say("The user note has not reached the server yet. NEXT again once it has.", "warn");
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
    customizeOpen[m] = false; // the next item starts folded, at one, from his defaults (Save as default)
    setState(m, freshState(m));
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
        offTaps.delete(`${m}:${venue}`);
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
    setState(m, freshState(m));
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
        adminTitle: $("admin-title"),
        settingsToggle: $("settings-toggle"),
        settings: $("settings"),
        pcAddress: $("pc-address"),
        pcKey: $("pc-key"),
        settingsSave: $("settings-save"),
        settingsStatus: $("settings-status"),
        settingsServer: $("settings-server"),
        settingsSignout: $("settings-signout"),
        account: $("account"),
        accountUser: $("account-user"),
        accountCredits: $("account-credits"),
        accountBuy: $("account-buy"),
        accountPacks: $("account-packs"),
        accountEbay: $("account-ebay"),
        accountConnect: $("account-connect"),
        accountStatus: $("account-status"),
        landing: $("landing"),
        landingInstall: $("landing-install"),
        landingInstallSteps: $("landing-install-steps"),
        landingKey: $("landing-key"),
        landingSignin: $("landing-signin"),
        landingStatus: $("landing-status"),
        signin: $("signin"),
        signinBack: $("signin-back"),
        signinEmail: $("signin-email"),
        signinRemember: $("signin-remember"),
        signinSend: $("signin-send"),
        signinStatus: $("signin-status"),
        signinWhat: $("signin-what"),
        signupSteps: $("signup-steps"),
        signupStepEbay: $("signup-step-ebay"),
        signupConnect: $("signup-connect"),
        signupStepAddress: $("signup-step-address"),
        signupAddress: $("signup-address"),
        signupStatus: $("signup-status"),
        sellerToggle: $("seller-toggle"),
        seller: $("seller"),
        sellerNote: $("seller-note"),
        sellerLine1: $("seller-line1"),
        sellerCity: $("seller-city"),
        sellerState: $("seller-state"),
        sellerZip: $("seller-zip"),
        sellerSave: $("seller-save"),
        sellerStatus: $("seller-status"),
        aboutLink: $("about-link"),
        installBanner: $("install-banner"),
        installAdd: $("install-add"),
        installDismiss: $("install-dismiss"),
        installSteps: $("install-steps"),
        feedbackToggle: $("feedback-toggle"),
        feedback: $("feedback"),
        feedbackInbox: $("feedback-inbox"),
        feedbackText: $("feedback-text"),
        feedbackJob: $("feedback-job"),
        feedbackSend: $("feedback-send"),
        feedbackStatus: $("feedback-status"),
        statsToggle: $("stats-toggle"),
        stats: $("stats"),
        statsChips: STATS_SINCE.map((value) => ({ value, node: $(`stats-since-${value}`) })),
        statsStatus: $("stats-status"),
        statsTable: $("stats-table"),
        themeChips: THEMES.map(({ value }) => ({ value, node: $(`theme-${value}`) })),
        themeColor: $("theme-color"),
        themeColorDark: $("theme-color-dark"),
        inventoryToggle: $("inventory-toggle"),
        inventory: $("inventory"),
        inventoryBrowse: $("inventory-browse"),
        inventorySearch: $("inventory-search"),
        inventoryStatus: $("inventory-status"),
        optionsToggle: $("options-toggle"),
        options: $("options"),
        inventoryVenues: INVENTORY_VENUES.map((value) => ({ value, node: $(`inventory-venue-${value || "all"}`) })),
        inventoryStates: INVENTORY_STATUSES.map((value) => ({ value, node: $(`inventory-state-${value || "all"}`) })),
        inventoryArchivedNote: $("inventory-archived-note"),
        inventoryPhotos: $("inventory-photos"),
        inventorySorts: INVENTORY_SORTS.map(({ key }) => ({ value: key, node: $(`inventory-sort-${key}`) })),
        inventoryList: $("inventory-list"),
        inventoryUndo: $("inventory-undo"),
        inventoryUndoText: $("inventory-undo-text"),
        inventoryUndoBtn: $("inventory-undo-btn"),
        inventoryDetail: $("inventory-detail"),
        inventoryBack: $("inventory-back"),
        detailHeading: $("detail-heading"),
        detailStatus: $("detail-status"),
        detailPhotos: $("detail-photos"),
        detailCustomizeToggle: $("detail-customize-toggle"),
        detailCustomize: $("detail-customize"),
        detailQuantity: $("detail-quantity"),
        detailPickupOnly: $("detail-pickup-only"),
        detailPricing: $("detail-pricing"),
        detailPricingWords: PRICING.map(({ grade }) => $(`detail-pricing-${grade}`)),
        detailPricingNote: $("detail-pricing-note"),
        detailCustomizeSave: $("detail-customize-save"),
        detailCustomizeSync: $("detail-customize-sync"),
        detailCustomizeReset: $("detail-customize-reset"),
        detailCustomizeStatus: $("detail-customize-status"),
        detailFolds: Object.fromEntries(
            VENUES.map((v) => [v, { toggle: $(`detail-${v}-toggle`), card: $(`detail-${v}`) }])
        ),
        syncBar: $("sync-bar"),
        syncButtons: ["from", "to"].map((direction) => ({
            direction,
            btn: $(`sync-${direction}`),
            icon: $(`sync-${direction}-icon`),
        })),
        syncReset: $("sync-reset"),
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
        seeInventory: $("see-inventory"),
        ebayBtn: $("ebay-btn"),
        ebayReset: $("ebay-reset"),
        ebayStatus: $("ebay-status"),
        ebayBuy: $("ebay-buy"),
        ebayLink: $("ebay-link"),
        craigslistBtn: $("craigslist-btn"),
        craigslistReset: $("craigslist-reset"),
        craigslistStatus: $("craigslist-status"),
        craigslistBuy: $("craigslist-buy"),
        craigslistLink: $("craigslist-link"),
        customizeToggle: $("customize-toggle"),
        customize: $("customize"),
        quantity: $("quantity"),
        pickupOnly: $("pickup-only"),
        pricing: $("pricing"),
        pricingWords: PRICING.map(({ grade }) => $(`pricing-${grade}`)),
        pricingNote: $("pricing-note"),
        autoPost: $("auto-post"),
        comps: $("comps"),
        customizeDefault: $("customize-default"),
        customizeDefaultStatus: $("customize-default-status"),
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
        bookComps: $("book-comps"),
        bookCustomizeDefault: $("book-customize-default"),
        bookCustomizeDefaultStatus: $("book-customize-default-status"),
        bookTitleLine: $("book-title-line"),
        bookPriceLine: $("book-price-line"),
        bookSeeInventory: $("book-see-inventory"),
        bookEbayBtn: $("book-ebay-btn"),
        bookEbayReset: $("book-ebay-reset"),
        bookEbayStatus: $("book-ebay-status"),
        bookEbayBuy: $("book-ebay-buy"),
        bookEbayLink: $("book-ebay-link"),
        bookVenueHint: $("book-venue-hint"),
        bookDoneHint: $("book-done-hint"),
        bookNextBtn: $("book-next-item"),
        bookNextNote: $("book-next-note"),
        offline: $("offline"),
        message: $("message"),
        version: $("version"),
    });

    // the look chosen on this phone before anything is painted, so it never flashes the other one
    grounds = { light: el.themeColor.content, dark: el.themeColorDark.content };
    applyTheme(chosenTheme());
    el.version.textContent = VERSION;
    // opened from a sign-in link: its token is taken and the hash cleared before the walk
    // mirrors this entry, so a reload or back never signs in with it again
    const place = globalThis.location;
    const token = loginToken(place ? place.hash : "");
    // back from Stripe's checkout or eBay's consent (#paid=, #ebay=): the hash cleared the same
    // way, so a reload never says it again
    const back = returnHash(place ? place.hash : "");
    if (token || back) globalThis.history.replaceState(globalThis.history.state, "", `${place.pathname}${place.search}`);
    // goods unless this phone was last used for books; a reload on an item back brought up shows its kind
    const walked = startWalk();
    mode = walked ? recordKind(walked) : chosenMode();
    // a fresh screen starts from his defaults; an item read back keeps its own customize
    for (const m of MODES) slots[m] = applyDefaults(reduce(slots[m], { type: "online", online: navigator.onLine }), readDefaults());
    render();

    renderServer();
    renderExtras();
    renderAccount();

    // the way in: the landing's two ways and Install, the sign-in screen, the banner's Add and x
    // I have a key: Admin, which opens on Settings while none are saved
    el.landingKey.addEventListener("click", () => showAdmin(true));
    el.landingSignin.addEventListener("click", () => showSignin(true));
    el.signinBack.addEventListener("click", () => showSignin(false));
    el.signinSend.addEventListener("click", () => {
        sendLink().catch(() => {});
    });
    el.signinEmail.addEventListener("keydown", (e) => {
        if (e.key === "Enter") sendLink().catch(() => {});
    });
    el.landingInstall.addEventListener("click", () => {
        onInstall("landing").catch(() => {});
    });
    el.installAdd.addEventListener("click", () => {
        onInstall("banner").catch(() => {});
    });
    el.installDismiss.addEventListener("click", dismissInstall);
    // Chrome offers to install: kept for our own button instead of its mini-infobar
    window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        installPrompt = e;
        render();
    });
    window.addEventListener("appinstalled", () => {
        installed = true;
        installPrompt = null;
        render();
    });
    el.settingsSignout.addEventListener("click", forgetServer);
    // the Account block: Buy postings unfolds the packs (each pill a checkout), Connect eBay
    el.accountBuy.addEventListener("click", () => {
        account.packs = !account.packs;
        renderAccount();
    });
    el.accountConnect.addEventListener("click", () => {
        connectEbay().catch(() => {});
    });
    // Seller address: the foldout, and Save address
    el.sellerToggle.addEventListener("click", () => {
        seller.open = !seller.open;
        renderAccount();
    });
    el.sellerSave.addEventListener("click", () => {
        saveSeller().catch(() => {});
    });
    // a venue button refused for want of postings: its Buy postings opens the Account block
    for (const node of [el.ebayBuy, el.craigslistBuy, el.bookEbayBuy]) node.addEventListener("click", () => openAccount(true));
    // See in inventory: Admin on the listing the item became, as its row's tap opens it
    for (const [m, node] of [["goods", el.seeInventory], ["book", el.bookSeeInventory]]) {
        node.addEventListener("click", () => {
            const sku = inventorySku(slots[m]);
            if (sku) showAdmin(true, sku);
        });
    }
    // Finish signing up: Connect eBay, as the Account block's; then the address, in Settings
    el.signupConnect.addEventListener("click", () => {
        connectEbay().catch(() => {});
    });
    el.signupAddress.addEventListener("click", () => {
        openAccount(false);
        openSeller();
    });
    el.feedbackToggle.addEventListener("click", () => {
        extras.feedback = !extras.feedback;
        renderExtras();
        // an admin's inbox, asked afresh as it opens
        if (extras.feedback) loadInbox().catch(() => {});
    });
    el.feedbackSend.addEventListener("click", () => {
        sendFeedback().catch(() => {});
    });
    el.statsToggle.addEventListener("click", () => {
        extras.stats = !extras.stats;
        renderExtras();
        if (extras.stats) loadStats().catch(() => {});
    });
    for (const { value, node } of el.statsChips) {
        node.addEventListener("click", () => {
            extras.since = value;
            renderExtras();
            loadStats().catch(() => {});
        });
    }

    el.adminToggle.addEventListener("click", toggleAdmin);
    el.adminClose.addEventListener("click", () => showAdmin(false));
    el.settingsToggle.addEventListener("click", toggleSettings);
    el.settingsSave.addEventListener("click", () => {
        saveSettings().catch(() => {});
    });
    for (const { value, node } of el.themeChips) node.addEventListener("click", () => setTheme(value));
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
    showOptions(readText("localStorage", OPTIONS_KEY) === "open");
    el.optionsToggle.addEventListener("click", toggleOptions);
    // a finger lifted anywhere ends a dial too: its button may have been redrawn under it; and
    // a swipe its row did not hear end (no pointer capture) slides back
    for (const type of ["pointerup", "pointercancel"]) {
        window.addEventListener(type, () => {
            if (dial) endDial(dial.sku);
            dropSwipe();
        });
    }
    el.inventoryUndoBtn.addEventListener("click", () => {
        undoArchive().catch(() => {});
    });
    for (const { value, node } of el.inventoryVenues) node.addEventListener("click", () => onFilter("venue", value));
    for (const { value, node } of el.inventoryStates) node.addEventListener("click", () => onFilter("status", value));
    for (const { value, node } of el.inventorySorts) node.addEventListener("click", () => onFilter("sort", value));
    // Michal, 2026-10-07: "in inventory, let's keep photos showing by default"
    el.inventoryPhotos.checked = readText("localStorage", PHOTOS_KEY) !== "off";
    el.inventoryPhotos.addEventListener("change", () => {
        writeText("localStorage", PHOTOS_KEY, el.inventoryPhotos.checked ? "on" : "off");
        loadInventory().catch(() => {});
    });
    el.inventoryBack.addEventListener("click", backToList);
    el.detailCustomizeToggle.addEventListener("click", () => {
        admin.custom.open = !admin.custom.open;
        renderRowCustomize();
    });
    el.detailQuantity.addEventListener("input", () => onCustomizeInput({ quantity: el.detailQuantity.value }));
    el.detailPickupOnly.addEventListener("change", () => onCustomizeInput({ pickupOnly: el.detailPickupOnly.checked }));
    el.detailPricing.addEventListener("input", () => onCustomizeInput({ pricing: pricingGrade(el.detailPricing.value) }));
    el.detailCustomizeSave.addEventListener("click", () => {
        saveRowCustomize().catch(() => {});
    });
    // customize's task on screen again, unless the listing has changed meanwhile
    const customizePaint = () => {
        const mine = admin.shown;
        return () => {
            if (mine === admin.shown) renderCards();
        };
    };
    el.detailCustomizeSync.addEventListener("click", () => {
        if (pressed(admin.custom, "push")) onTaskTap(admin.custom, customizePaint());
        else pushRow().catch(() => {});
    });
    el.detailCustomizeReset.addEventListener("click", () => {
        resetTask(admin.custom, customizePaint()).catch(() => {});
    });
    for (const [venue, { toggle, card }] of Object.entries(el.detailFolds)) {
        toggle.addEventListener("click", () => {
            admin.folds[venue] = card.hidden;
            renderFolds();
        });
    }
    for (const { direction, btn } of el.syncButtons) {
        btn.addEventListener("click", () => {
            startSync(direction).catch(() => {});
        });
    }
    el.syncReset.addEventListener("click", () => {
        resetTask(sync, renderSync).catch(() => {});
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
        el[`${venue}Btn`].addEventListener("click", () => onVenueTap("goods", venue));
        el[`${venue}Reset`].addEventListener("click", () => {
            resetPress("goods", venue).catch(() => {});
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
    el.bookEbayBtn.addEventListener("click", () => onVenueTap("book", "ebay"));
    el.bookEbayReset.addEventListener("click", () => {
        resetPress("book", "ebay").catch(() => {});
    });
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
        nodes.comps.addEventListener("change", () =>
            setState(m, reduce(slots[m], { type: "setComps", on: nodes.comps.checked }))
        );
        nodes.saveDefault.addEventListener("click", () => saveDefaults(m));
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
    if (back) cameBack(back);
    if (token) signIn(token).catch(() => {});
    else checkServer().catch(() => {});
    // the landing on screen: does the product's server take new accounts?
    if (!token && !settings()) askSignup().catch(() => {});
}

main();
