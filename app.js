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

import { VERSION } from "./version.js?v=2.38.0";
import {
    adminLink,
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
    cancelNote,
    CANCELLED,
    CONTINUE,
    PAUSED,
    RESET,
    SEND_DELAY_MS,
    TAP_AGAIN,
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
    photoStem,
    recordName,
    TYPE_NAME_HINT,
    typedName,
    venueButton,
    venueIdleNote,
    venueLabel,
    venueLine,
    POST_ONLY,
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
    editSaved,
    editValues,
    endQuestion,
    followRow,
    followSummary,
    inventoryCount,
    endingLine,
    liveVenues,
    ASK_MS,
    booksAllowed,
    BOOKS_ASK,
    inventoryTally,
    inventoryRows,
    jobRunning,
    leftUnsynced,
    MAX_PHOTOS,
    patchBody,
    photoQuestion,
    photoSaved,
    photosBehind,
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
    syncJob,
    syncLine,
    syncNote,
    syncReason,
    syncShown,
    syncVenues,
    syncWord,
    unsyncedList,
    unsyncedWith,
    unsyncedWithout,
    venueActions,
    venueBadge,
    venueFacts,
    venueName,
    venueStatus,
    DIAL_DELAY_MS,
    PRICE_SAVE_MS,
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
    CODE_NEEDED,
    cleanCode,
    codeError,
    signinNote,
    meOf,
    venueOff,
    venueAllowed,
    accountError,
    accountKind,
    creditsLine,
    connectLabel,
    stepQuantity,
    packLabel,
    returnHash,
    returnLine,
    safeLink,
    SELLER_POLL_MAX,
    SELLER_POLL_MS,
    ADDRESS_ON_SERVER,
    addressBody,
    addressHint,
    addressLine,
    parseAddressLine,
    addressOf,
    addressSaveBody,
    CONNECT_TO_POST,
    noAddressLine,
    sellerError,
    sellerLine,
    shipsFromLine,
    venueBlockLine,
    SHIP_FROM,
    CONFIRM_SHIP_FROM,
    POLICY_LINES,
    policyLinesOf,
    policyRowsOf,
    shippingOf,
    policyChanges,
    returnsWord,
    handlingWord,
    addressState,
    deviceLine,
    devicesOf,
    INVITE_SENT,
    inviteBody,
    LEFT_ACCOUNT,
    nameBody,
    peopleCount,
    peopleError,
    peopleOf,
    personWords,
    signedOutOthers,
    wrapDraftBody,
    wrapOffBody,
    wrapOn,
    wrapApplyVenues,
    installState,
    installSteps,
    installDismissal,
    INSTALL_ASK_AT,
    isDesktopBrowser,
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
    myFeedbackOf,
    listedAtWord,
    inboxHead,
    inboxOf,
    refusalLine,
    signupStep,
    WRAP_PARTS,
    wrapError,
    wrapOf,
    ACCOUNT_DELETED,
    accountName,
    accountsOf,
    deleteError,
    newAccount,
    SIGNED_OUT,
} from "./core.js?v=2.38.0";
import { badgeText, NOTE_DEBOUNCE_MS, nextTask, noteDirty, retryDelayMs } from "./queue.js?v=2.38.0";
import {
    addVenue,
    applyWrap,
    archiveRow,
    askLink,
    cancelJob,
    checkout,
    checkPc,
    codeSession,
    addRowPhoto,
    createItem,
    deleteMe,
    deletePhoto,
    deleteRowPhoto,
    ebayConnect,
    endSession,
    getAddress,
    getPolicies,
    getMyFeedback,
    markFeedbackSeen,
    getBook,
    getConditions,
    getDevices,
    getFeedbackInbox,
    getInventory,
    getItem,
    getJob,
    getMe,
    getPeople,
    getPhoto,
    getRow,
    getRowPhoto,
    getSignup,
    getStats,
    getWrap,
    inviteMember,
    leaveAccount,
    patchAddress,
    patchPolicies,
    confirmPolicies,
    patchRow,
    patchSeller,
    patchWrap,
    PcError,
    postFeedback,
    postJob,
    putNote,
    putPhoto,
    removeMember,
    renameMe,
    reviewFeedback,
    searchBook,
    signOutDevice,
    signOutOthers,
    startSession,
} from "./pc.js?v=2.38.0";
import { shrinkPhoto } from "./shrink.js?v=2.38.0";
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
} from "./book.js?v=2.38.0";
import { canScan, readIsbn } from "./scan.js?v=2.38.0";

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
 * Before 2.23.0, the session a sign-in link made, in localStorage when he kept Keep me
 * signed in ticked, else in sessionStorage (this tab only). Read once, to be carried into
 * the accounts list; written since as a mirror of the current account (mirrorCurrent).
 */
const SESSION_KEY = "snap.session";
/**
 * The accounts kept on this phone (Michal, 2026-10-18; accountsOf in core.js): a JSON list
 * in localStorage for those kept on the phone, the same key in sessionStorage for a session
 * he did not tick Keep me signed in for (this tab only).
 */
const ACCOUNTS_KEY = "snap.accounts";
/** The current account's id, among those kept (ACCOUNTS_KEY); the first when it names none. */
const CURRENT_KEY = "snap.accounts.current";
/** The Posting fold's defaults, per kind ({"goods": {...}, "book": {...}}, one set written for both): every new item starts from them. */
const DEFAULTS_KEY = "snap.customize.defaults";
/** When the home-screen banner was put away (an ISO date): it stays away a week. */
const INSTALL_KEY = "snap.install.dismissed";
/** Fix dark photos as the Posting fold left it ("off"; on until then): every new item starts from it. */
const FIXDARK_KEY = "snap.photos.fixdark";
/** Which of Settings' five folds were left open on this phone (a JSON object, fold -> true). */
const FOLDS_KEY = "snap.settings.folds";
/** Settings' five folds, in their order, each with its heading. */
const FOLDS = [
    ["account", "Snap Account"],
    ["venues", "Venues"],
    ["posting", "Posting defaults"],
    ["server", "Server"],
    ["phone", "This phone"],
];
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
 * id -> { file, url, shrunk, ready, fixDark, original, originalUrl, before } -- the pictures
 * taken on this page, until NEXT. `file` is the camera's original until the photo is shrunk,
 * then null: only the shrunk JPEG (`shrunk`) is kept, and `url` shows it. `ready` is the
 * shrink in progress, shared by the thumbnail and the upload. `fixDark`: Fix dark photos as
 * it was when the photo was taken. A dark photo it brightened keeps its picture from before
 * (`original`, shown by `originalUrl` while `before` is on: the lit badge's before/after look)
 * only while the item is on screen; the brightened one is what goes to the PC.
 */
const blobs = new Map();

/**
 * Fix dark photos, the tick in customize: brighten a dark photo before it goes (shrink.js).
 * The phone's, for every photo taken from now on; NEXT puts it back to the Posting fold's.
 */
let fixDark = true;

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
 * Settings' account card, as the screen has it: Buy postings' packs unfolded, a checkout or
 * Connect eBay on its way (`busy`), and its line (`status`: the way back from Stripe or eBay,
 * or what went wrong).
 */
const account = { packs: false, busy: false, status: "" };
/**
 * The address where you ship from (GET /me/address), last under Venues, as the screen has
 * it: the server's answer (addressOf; null until asked, and from an older server's 404, which
 * is no card), the Same address for every venue tick as on screen, a Save on its way, its line,
 * "policies ready" to be said (once), the poll's timer while eBay's policies are being set up
 * and how many times it has asked, and `asked`, bumped per ask so a late answer for an older
 * one is dropped. `venueBoxes`: venue -> its one line and the fields it uses, drawn while the tick is off.
 */
const seller = { info: null, same: true, busy: false, status: "", ready: false, poll: null, polls: 0, asked: 0, venueBoxes: {} };
/**
 * The header and footer on every listing (GET /me/wrap), under Posting defaults, as the screen
 * has it: the server's answer (wrapOf; null until asked, and from an older server's 404, which
 * is no tick and no card), Add standard text to posts ticked (`open`), each part's venue chips
 * as chosen (`draft`; its words are its box's), the card's line, a PATCH on its way, `asked`,
 * bumped per ask so a late answer for an older one is dropped, per venue the job task (jobTask)
 * of Apply to existing postings (one push carries both parts), and the chips as drawn.
 */
const wrap = {
    info: null,
    /** The server said it has no header and footer (an older one's 404). */
    missing: false,
    open: false,
    /** @type {{header:string[], footer:string[]}} */
    draft: { header: [], footer: [] },
    status: "",
    busy: false,
    asked: 0,
    /** @type {Record<string, ReturnType<typeof jobTask>>} */
    apply: {},
    /** @type {Record<string, HTMLButtonElement>} "<part> <venue>" -> its chip */
    chips: {},
    /** What each part's chip row holds now, so it is redrawn only when that changes. */
    shown: { header: "", footer: "" },
};
/**
 * The people on this account (GET /me/people, /me/devices; Michal, 2026-10-25), as the screen
 * has them: the server's answers (peopleOf, devicesOf; null until asked, and from a server
 * without them), the People page open in Admin's place, an action on its way (`busy`), the
 * page's line, the invite box's line, Change name's box open (`renaming`), and `asked`.
 */
const people = { info: null, devices: null, open: false, busy: false, status: "", inviteStatus: "", renaming: false, asked: 0 };
/**
 * Settings' five folds (Michal, 2026-10-25: "a two-level fold"), open or closed, as read from
 * the phone (FOLDS_KEY) and as opened by themselves since (the one the person needs now).
 * @type {Record<string, boolean>}
 */
let folds = {};
/**
 * Finish setting up's step 3 (Michal, 2026-10-31): GET /me/policies' answer (null: none yet, or
 * an older server's 404, the fixed lines then), whether it was asked, Edit open and its draft.
 */
const policies = { info: null, asked: false, editing: false, draft: null, busy: false, status: "" };
/** Add standard text to posts, greyed: signed out, or a server without it (Michal, 2026-10-31). */
const WRAP_SIGN_IN = "Sign in to add a header and footer to your posts.";
const WRAP_MISSING = "Your server does not offer this yet.";
/** A sender's own feedback as GET /me/feedback last said (null: not asked, or an older server). */
let mine = null;
/** The venue whose own page is open under Settings ("" none; Michal, 2026-10-31). */
let venuePage = "";
/** A sign-in just made on this phone: Admin's first open lands on Settings, Snap Account open. */
let freshSignin = false;
/** Settings unfolded (its toggle's state, kept while a page of its own covers it). */
let settingsOpen = false;

/** The way in, while there are no settings: "" the landing, "signin" the sign-in screen. */
let entry = "";
/**
 * The accounts on this phone (Michal, 2026-10-18), in memory once read (readAccounts): the
 * list, those kept on the phone and those for this tab together, and the current one's id.
 * @type {{list: import("./core.js").Account[], current: string} | null}
 */
let accounts = null;
/**
 * Settings' Add account (or an expired account's Sign in again): the landing's two ways in
 * are the screen while the account in hand stays; a sign-in made joins the list, Back keeps
 * things as they were.
 */
let adding = false;
/**
 * Settings' Delete my account: its confirmation view open or folded, DELETE /me on its way
 * (`busy`), and its line (what went wrong, or that the account was deleted).
 */
const deleting = { open: false, busy: false, status: "" };
/**
 * The mail's code box on the sign-in screen (Michal, 2026-10-08): shown once a link is sent,
 * or by I already have a code; folded again by Back.
 */
let codeOpen = false;
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
/** The two taps unfolded, under the landing's Install, under the banner's Add and under This phone's Install. */
const stepsOpen = { landing: false, banner: false, phone: false };

/** The Posting fold's "saved", until its moment is over. */
let defaultsTimer = null;
/** Step 2's address box typed in since the server's address was last put there. */
let signupAddressDirty = false;
/** customize's Save as default, and its word a moment after a press. */
const SAVE_AS_DEFAULT = "Save as default";
const SAVED_AS_DEFAULT = "Saved as default";
let savedDefaultTimer = null;

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
    /** the PC has answered with a list: its count follows the Inventory foldout's word */
    counted: false,
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
    /** a tile's price waiting to go to the PC (PRICE_SAVE_MS after its last tap), by sku */
    priceTimers: new Map(),
    /** a tile's price on its way to the PC, by sku: what a sync waits for */
    priceSaves: new Map(),
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
    /**
     * the photo strip's own state: the x's question (`ask`, a photo number or 0), what is on its
     * way (`wait`), what was said (`note`); its line and the x's and the + input, as drawn
     */
    photoEdit: blankPhotoEdit(),
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

/**
 * The venue blocks' sync buttons, one Admin job task as a card is (jobTask): one sync at a
 * time (the server refuses a second, 409); its action the button last pressed ("<direction>
 * <venue>", "to craigslist"), and `venue` that button's venue, kept past the press for its
 * line, which shows in that venue's block.
 */
const sync = { ...jobTask(), venue: "" };
/**
 * The venue blocks' sync buttons as drawn, by "<direction> <venue>": the button, its half of
 * the sync symbol, its reset; made once per venue and direction.
 */
const syncDrawn = { nodes: new Map() };

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
/** Whether the browser's entries mirror the walk yet: a reload's do; a fresh page's from his first tap (mirrorWalk). */
let mirrored = false;

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
    if (!s.itemName) return; // unnamed goods number on from their own photos (acceptFiles)
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
 * Where calls go and who makes them: the current account's server and its key, or its
 * session; null with no account, or one the server forgot (the landing is then the screen).
 */
function settings() {
    const a = currentAccount();
    if (!a || a.expired) return null;
    return a.key ? { pc: a.pc, key: a.key } : { pc: a.pc, session: a.session };
}

// --- the accounts on this phone (Michal, 2026-10-18) --------------------------------------
// "switch accounts somewhere so i can navigate easy between two logins to this app": the
// phone keeps every account it signed in to, one of them current. A phone from before has
// its one key or session carried into the list on the first load, nothing changing for it.

/** The accounts, read once from the phone. */
function allAccounts() {
    if (!accounts) accounts = readAccounts();
    return accounts;
}

/** The current account, whole; null with none kept. */
function currentAccount() {
    const { list, current } = allAccounts();
    return list.find((a) => a.id === current) || null;
}

/**
 * The accounts as stored, kept on the phone and for this tab, and the current one; or, on a
 * phone from before 2.23.0 that stored neither list, its one address and key or its session
 * as a list of one (and stored so from then on).
 */
function readAccounts() {
    const stored = readText("localStorage", ACCOUNTS_KEY) || readText("sessionStorage", ACCOUNTS_KEY);
    const list = [...accountsOf(readJson("localStorage", ACCOUNTS_KEY, null), true), ...accountsOf(readJson("sessionStorage", ACCOUNTS_KEY, null), false)];
    let current = readText("localStorage", CURRENT_KEY);
    const old = stored ? null : oldAccount();
    if (old) {
        list.push(old);
        current = old.id;
    }
    if (!list.some((a) => a.id === current)) current = list.length ? list[0].id : "";
    accounts = { list, current };
    if (old) writeAccounts();
    return accounts;
}

/** The one sign-in a page before 2.23.0 kept: the address and key, else the session, kept on the phone or for this tab. */
function oldAccount() {
    const s = checkSettings(readText("localStorage", PC_KEY), readText("localStorage", KEY_KEY));
    if (s.ok) return newAccount({ pc: s.pc, key: s.key });
    const kept = readText("localStorage", SESSION_KEY);
    if (kept) return newAccount({ pc: DEFAULT_SERVER, session: kept, remember: true });
    const tab = readText("sessionStorage", SESSION_KEY);
    return tab ? newAccount({ pc: DEFAULT_SERVER, session: tab, remember: false }) : null;
}

/** The accounts to the phone: those kept there, those for this tab, the current one's id; and the mirror. */
function writeAccounts() {
    const { list, current } = allAccounts();
    writeJson("localStorage", ACCOUNTS_KEY, list.filter((a) => a.remember));
    writeJson("sessionStorage", ACCOUNTS_KEY, list.filter((a) => !a.remember));
    writeText("localStorage", CURRENT_KEY, current);
    mirrorCurrent();
}

/**
 * The current account in the keys a page before 2.23.0 read (snap.pc and snap.key, or
 * snap.session where Keep me signed in put it), so an older page on this phone still finds
 * it; nothing of the others, and nothing for an account the server forgot. Read by no one here.
 */
function mirrorCurrent() {
    const a = currentAccount();
    const live = a && !a.expired ? a : null;
    if (live && live.key) {
        writeText("localStorage", PC_KEY, live.pc);
        writeText("localStorage", KEY_KEY, live.key);
    } else {
        for (const key of [PC_KEY, KEY_KEY]) removeText("localStorage", key);
    }
    for (const store of ["localStorage", "sessionStorage"]) {
        const its = live && live.session && store === (live.remember ? "localStorage" : "sessionStorage");
        if (its) writeText(store, SESSION_KEY, live.session);
        else removeText(store, SESSION_KEY);
    }
}

/**
 * A sign-in made (a key saved, a session from a link or a code): kept beside the others, and
 * current. The same key on the same server, or a session of the same person there (the same
 * token, or the name the server gave), is the one account: its entry is replaced, so signing
 * in again after the server forgot a session takes the old entry's place. `replace` names an
 * entry to replace whatever the parts say: Save and check correcting the key account in hand.
 * @param {{pc:string, key?:string, session?:string, user?:string, remember?:boolean}} parts
 * @param {string} [replace]
 */
function addAccount(parts, replace = "") {
    const all = allAccounts();
    const made = newAccount(parts);
    const same = (a) =>
        a.id === replace ||
        (a.pc === made.pc && (made.key ? a.key === made.key : !!a.session && (a.session === made.session || (!!made.user && a.user === made.user))));
    const i = all.list.findIndex(same);
    if (i >= 0) {
        made.id = all.list[i].id;
        made.admin = all.list[i].admin;
        all.list[i] = made;
    } else all.list.push(made);
    all.current = made.id;
    adding = false;
    writeAccounts();
}

/** Did the account just added reach the phone's storage? (A private window may keep nothing.) */
function accountKept(id) {
    return [accountsOf(readJson("localStorage", ACCOUNTS_KEY, null), true), accountsOf(readJson("sessionStorage", ACCOUNTS_KEY, null), false)].some((list) =>
        list.some((a) => a.id === id)
    );
}

/**
 * Another account made current (Settings' list): the page takes it up as it does a
 * sign-in (takeUp). One the server forgot is not: its Sign in again is the way.
 * @param {string} id
 */
function switchAccount(id) {
    const all = allAccounts();
    const to = all.list.find((a) => a.id === id);
    if (!to || to.expired || all.current === id) return;
    all.current = id;
    adding = false;
    writeAccounts();
    takeUp();
}

/**
 * Remove from this phone (Michal, 2026-10-18: "a way to REMOVE account from phone [which is
 * different than deleting an account]"): a session is first told to the server (DELETE
 * /auth/session with that account's own session; not waited for, and a refusal or no answer
 * changes nothing), then the entry is dropped. The current one removed, the next is taken up,
 * or the landing is back when none is left. Settings' Sign out is this for the current
 * account; Delete my account drops the entry with the server told nothing (`tell` false:
 * its sessions went with the account).
 * @param {string} id
 * @param {boolean} [tell]
 */
function removeAccount(id, tell = true) {
    const all = allAccounts();
    const gone = all.list.find((a) => a.id === id);
    if (!gone) return;
    if (tell && gone.session) endSession({ pc: gone.pc, session: gone.session }).catch(() => {});
    all.list = all.list.filter((a) => a.id !== id);
    if (all.current !== id) {
        writeAccounts();
        renderAccounts();
        return;
    }
    all.current = all.list.length ? all.list[0].id : "";
    writeAccounts();
    if (all.current) takeUp();
    else toLanding("");
}

/**
 * What the server said of the account in hand, let go: /me, the address, the header and
 * footer, the people, the venues tapped, the server word and its timer, and Delete account's view.
 */
function letGoAccount() {
    me = null;
    meAsked = false;
    seller.info = null;
    quietSeller();
    dropWrap();
    dropPeople();
    offTaps.clear();
    serverStatus = null;
    clearTimeout(healthTimer);
    healthTimer = null;
    Object.assign(deleting, { open: false, busy: false, status: "" });
}

/**
 * The account current now taken up, as a sign-in is: the last one's answers let go, the
 * landing and sign-in put away, the server checked and asked who this is (the Account block,
 * the venue buttons and the sync bar follow), Settings' boxes and foldouts its own, the
 * inventory asked afresh if open; the items in hand carry on, as they do after a sign-in.
 */
function takeUp() {
    letGoAccount();
    el.landingStatus.textContent = "";
    entry = "";
    codeOpen = false;
    if (!el.settings.hidden) {
        fillSettings();
        el.settingsStatus.textContent = "";
        // a key account has its Server fold, an email account none
        renderSettingsFolds();
    }
    if (!el.admin.hidden) {
        admin.asked += 1;
        dropUndo();
        showList();
        admin.rows = [];
        renderRows();
    }
    render();
    renderServer();
    renderExtras();
    renderAccount();
    checkServer().catch(() => {});
    if (!el.settings.hidden) loadSettingsParts();
    if (!el.admin.hidden && admin.inventoryOpen) loadInventory().catch(() => {});
    for (const m of MODES) setState(m, reduce(slots[m], { type: "resume" }));
    pump();
    retryLookup();
}

/** What Settings asks the server for as it opens (and after Save and check): the address, the header and footer, the people. */
function loadSettingsParts() {
    loadSeller().catch(() => {});
    loadWrap().catch(() => {});
    loadPeople().catch(() => {});
}

/** Settings' address and key boxes: the key account in hand; empty for a session, and while an account is being added. */
function fillSettings() {
    const a = currentAccount();
    const keyed = !adding && a && a.key ? a : null;
    el.pcAddress.value = keyed ? keyed.pc : "";
    el.pcKey.value = keyed ? keyed.key : "";
}

/**
 * Add account (Settings), or Sign in again on an account the server forgot: the landing
 * (or, `signin`, the sign-in screen itself) in place of the posting screens, the account
 * in hand kept; Back there puts it back.
 * @param {boolean} [signin]
 */
function startAdding(signin = false) {
    adding = true;
    Object.assign(deleting, { open: false, status: "" });
    el.landingStatus.textContent = "";
    if (!el.admin.hidden) showAdmin(false);
    askSignup().catch(() => {});
    if (signin) showSignin(true);
    else render();
}

/** The landing's Back while an account is being added: the screens as they were. */
function stopAdding() {
    adding = false;
    entry = "";
    render();
}

/**
 * The other accounts kept on this phone, under the current one's card (Michal, 2026-10-25:
 * one card each): the name, "by key" or "signed out" under it, Switch to this account (Sign in
 * again on one the server forgot) and Remove from this phone; under them Add account. No list
 * at all with no other account kept.
 */
function renderAccounts() {
    const { list, current } = allAccounts();
    const others = list.filter((a) => a.id !== current);
    el.accounts.hidden = list.length === 0;
    el.accountsList.hidden = others.length === 0;
    el.accountsList.replaceChildren(...others.map(accountCard));
    // the landing's way to another account, while the one in hand is signed out or gone
    el.landingAccounts.hidden = adding || list.every((a) => a.expired || a.id === current);
}

/**
 * Another account's card: its name, what it is, Switch to this account (or Sign in again), and
 * Remove from this phone.
 * @param {import("./core.js").Account} a
 */
function accountCard(a) {
    const li = document.createElement("li");
    li.className = "card account-card";
    const name = document.createElement("p");
    name.className = "account-user";
    name.textContent = accountName(a);
    li.append(name);
    const kind = accountKind(a);
    if (kind) {
        const state = document.createElement("p");
        state.className = "small account-kind";
        state.textContent = kind;
        li.append(state);
    }
    const row = document.createElement("div");
    row.className = "account-row";
    row.append(
        a.expired
            ? actionButton("Sign in again", "pill pill-small", false, () => startAdding(true))
            : actionButton("Switch to this account", "pill pill-small", false, () => switchAccount(a.id)),
        actionButton("Remove from this phone", "link account-action", false, () => removeAccount(a.id))
    );
    li.append(row);
    return li;
}

// --- Delete account (Michal, 2026-10-18: "in settings there also needs to be an option to
// delete your account"), Leave this account (a member's, 2026-10-25) ----------------------

/**
 * The card's last line: Delete account in quiet red (not for the admin, whose account the
 * server refuses to delete, nor for a member, who gets Leave this account instead), its
 * confirmation view when opened, its button and Keep my account held while DELETE /me is on
 * its way, and its line.
 */
function renderDelete() {
    const can = !!settings() && !!me && !me.admin;
    const owner = can && me.owner;
    el.settingsDelete.hidden = !owner;
    el.settingsDelete.setAttribute("aria-expanded", owner && deleting.open ? "true" : "false");
    el.deleteConfirm.hidden = !owner || !deleting.open;
    el.deleteConfirmBtn.disabled = deleting.busy;
    el.deleteKeep.disabled = deleting.busy;
    el.accountLeave.hidden = !can || owner;
    el.accountLeave.disabled = people.busy;
    el.deleteStatus.textContent = deleting.status;
}

/** Delete account tapped: the confirmation view, in plain words, nothing sent yet. */
function openDelete() {
    deleting.open = true;
    deleting.status = "";
    renderDelete();
    if (typeof el.deleteConfirm.scrollIntoView === "function") el.deleteConfirm.scrollIntoView({ block: "nearest" });
}

/** Keep my account: the view folded, nothing sent. */
function keepAccount() {
    if (deleting.busy) return;
    deleting.open = false;
    deleting.status = "";
    renderDelete();
}

/**
 * The red Delete my account: DELETE /me with the account's own key or session. A 204 drops
 * the account from the phone (its sessions went with it; the server is told nothing more)
 * and the next account, or the landing, says it was deleted. A refusal (the admin's account,
 * a job of theirs still queued or running: 409), a 401 or no answer is said under the view
 * (deleteError) and the account stays.
 */
async function confirmDelete() {
    const s = settings();
    const a = currentAccount();
    if (!s || !a || deleting.busy) return;
    deleting.busy = true;
    deleting.status = "Deleting your account...";
    renderDelete();
    try {
        await deleteMe(s);
    } catch (e) {
        deleting.busy = false;
        deleting.status = deleteError(e.status, e.detail, e.message, e.code);
        if (e.status === 0) heard(0);
        renderDelete();
        return;
    }
    Object.assign(deleting, { open: false, busy: false, status: "" });
    removeAccount(a.id, false);
    if (settings()) {
        deleting.status = ACCOUNT_DELETED;
        renderDelete();
    } else {
        el.landingStatus.textContent = ACCOUNT_DELETED;
    }
}

/** The Posting fold's defaults on this phone, both kinds. */
function readDefaults() {
    return customizeDefaults(readJson("localStorage", DEFAULTS_KEY, null));
}

/** Fix dark photos as the Posting fold left it on this phone: on unless he saved it off. */
function savedFixDark() {
    return readText("localStorage", FIXDARK_KEY) !== "off";
}

/**
 * Leave this account (a member's, Michal 2026-10-25): POST /me/leave, then the account off
 * this phone (its sessions ended with it: the server is told nothing more) and the next
 * account, or the landing, says so. A refusal is said on the card's line.
 */
async function leaveThisAccount() {
    const s = settings();
    const a = currentAccount();
    if (!s || !a || people.busy) return;
    people.busy = true;
    deleting.status = "Leaving the account...";
    renderDelete();
    try {
        await leaveAccount(s);
    } catch (e) {
        people.busy = false;
        deleting.status = peopleError("Could not leave the account", e.status, e.message);
        if (e.status === 0 || e.status === 401) heard(e.status);
        renderDelete();
        return;
    }
    people.busy = false;
    deleting.status = "";
    removeAccount(a.id, false);
    if (settings()) {
        deleting.status = LEFT_ACCOUNT;
        renderDelete();
    } else {
        el.landingStatus.textContent = LEFT_ACCOUNT;
    }
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
    // books are the admin's (booksAllowed): anyone else sees the book screen milky and inert,
    // the line on top saying so with the way to ask
    const booksOff = !booksAllowed(me);
    el.book.classList.toggle("books-locked", booksOff);
    for (const kid of el.book.children || []) if (kid !== el.booksOff) kid.inert = booksOff;
    el.booksOff.hidden = !booksOff;
    el.modeGoods.setAttribute("aria-pressed", mode === "goods" ? "true" : "false");
    el.modeBook.setAttribute("aria-pressed", mode === "book" ? "true" : "false");
    // neither screen under Admin (Michal, 2026-10-08: "When I look at a card the posting
    // screen is below. That should not be there"); both items carry on out of sight
    const away = !el.admin.hidden;
    // no settings and no session, or an account being added: the landing (or sign-in) is the
    // whole screen instead
    const out = !settings() || adding;
    el.landing.hidden = !out || away || entry === "signin";
    el.signin.hidden = !out || away || entry !== "signin";
    el.landingBack.hidden = !adding;
    const words = signinWords(signup.open);
    el.landingSignin.textContent = words.button;
    el.signinWhat.textContent = words.what;
    el.signinCodeForm.hidden = !codeOpen;
    el.signinHaveCode.hidden = codeOpen;
    const note = signinNote({ isIos: onIos(), standalone: standalone() });
    el.signinNote.textContent = note;
    el.signinNote.hidden = !note;
    // the current account's name in the top bar, after the wordmark; absent on the landing
    const a = currentAccount();
    el.headerUser.textContent = me && me.user ? me.user : a && a.user ? a.user : "";
    el.headerUser.hidden = out || !el.headerUser.textContent;
    // an account not set up yet (GET /me: registered false): its two steps in place of the
    // posting screens
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
    // the item's folder on the PC is named once, when it is made; an unnamed one's box
    // stays open for a name the history calls it by
    el.itemInput.readOnly = restoring.goods || (!!state.itemId && !state.unnamed);

    const locked = photosLocked(state);
    const taken = nameTakenHint(state);
    el.itemInput.classList.toggle("taken", !!taken);
    // Snap from the moment the page opens (Michal, 2026-10-08): the name is optional, unless
    // the server refused a blank one (needsName), which keeps the rule from before
    const named = !!state.itemName || !state.needsName;
    const ready = named && !locked && !restoring.goods && !taken;
    // the word only: the camera icon beside it in the label stays
    const word = snapWord(state, { earlier: !!viewing.goods });
    el.snapText.textContent = word;
    const snapReady = word === "Snap Next" ? onwardReady("goods") : ready;
    el.snapLabel.classList.toggle("disabled", !snapReady);
    el.galleryLabel.classList.toggle("disabled", !ready);
    el.snapInput.disabled = !snapReady;
    el.galleryInput.disabled = !ready;
    el.hint.hidden = snapReady;
    if (restoring.goods) el.hint.textContent = "Reading this item back from the server...";
    else if (locked) el.hint.textContent = "These photos went with the listing. NEXT starts the next item.";
    else if (taken) el.hint.textContent = taken;
    else el.hint.textContent = named ? "" : TYPE_NAME_HINT;

    el.noteStatus.textContent = noteStatusText(state);
    el.progress.textContent = progressLine(state);
    renderStrip("goods", el.strip, locked);
    renderCustomize("goods");
    el.fixDark.checked = fixDark;

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
    const word = snapWord(state, { earlier: !!viewing.book });
    el.bookSnapText.textContent = word;
    const snapReady = word === "Snap Next" ? onwardReady("book") : ready;
    el.bookSnapLabel.classList.toggle("disabled", !snapReady);
    el.bookGalleryLabel.classList.toggle("disabled", !ready);
    el.bookSnapInput.disabled = !snapReady;
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
          };
}

// --- Settings, Posting: the defaults every new item starts with (Michal, 2026-10-08: "in case
// someone wants to change something permanently"; in Settings since 2026-10-25, Save as
// default gone from the customize box) ----------------------------------------------------

/**
 * customize's Save as default (Michal, 2026-10-31): this item's values kept as every new item's,
 * Fix dark photos beside them, Settings' Posting defaults showing them; the button says so a moment.
 */
function saveCustomizeAsDefault() {
    const d = defaultsOf(customizeOf(slots.goods));
    writeJson("localStorage", DEFAULTS_KEY, { goods: d, book: d });
    writeText("localStorage", FIXDARK_KEY, el.fixDark.checked ? "on" : "off");
    renderPosting();
    el.customizeSaveDefault.textContent = SAVED_AS_DEFAULT;
    clearTimeout(savedDefaultTimer);
    savedDefaultTimer = setTimeout(() => {
        el.customizeSaveDefault.textContent = SAVE_AS_DEFAULT;
    }, DEFAULTS_SAVED_MS);
}

/** The Posting fold's boxes as the phone keeps the defaults (a load, a change saved). */
function renderPosting() {
    const d = readDefaults().goods;
    el.postingQuantity.value = d.quantity;
    el.postingPickupOnly.checked = d.pickupOnly;
    const grade = pricingOf(d.pricing);
    el.postingPricing.value = String(grade.grade);
    el.postingPricing.setAttribute("aria-valuetext", grade.word);
    PRICING.forEach((p, i) => el.postingPricingWords[i].classList.toggle("on", p.grade === grade.grade));
    el.postingPricingNote.textContent = grade.note;
    el.postingAutoPost.checked = d.autoPost;
    el.postingComps.checked = d.comps;
    el.postingFixDark.checked = savedFixDark();
}

/**
 * A default changed: the boxes as they stand kept on this phone (one set, for goods and books
 * alike; a quantity that is not one is not kept), Fix dark photos beside them, "saved" said
 * for a moment, and an item in hand that has nothing on it yet starts from them at once.
 */
function savePostingDefaults() {
    const d = defaultsOf({
        quantity: el.postingQuantity.value,
        pickupOnly: el.postingPickupOnly.checked,
        pricing: pricingGrade(el.postingPricing.value),
        autoPost: el.postingAutoPost.checked,
        comps: el.postingComps.checked,
    });
    writeJson("localStorage", DEFAULTS_KEY, { goods: d, book: d });
    writeText("localStorage", FIXDARK_KEY, el.postingFixDark.checked ? "on" : "off");
    for (const m of MODES) {
        const s = slots[m];
        if (s.itemId || s.photos.length || restoring[m]) continue;
        if (m === "goods") fixDark = el.postingFixDark.checked;
        setState(m, applyDefaults(s, { goods: d, book: d }));
        fillCustomize(m);
    }
    el.postingStatus.textContent = DEFAULTS_SAVED;
    clearTimeout(defaultsTimer);
    defaultsTimer = setTimeout(() => {
        el.postingStatus.textContent = "";
    }, DEFAULTS_SAVED_MS);
    renderPosting();
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
        const said = offTaps.has(`${m}:${venue}`) ? venueOff(venue) : "";
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
        // "credits will be lost" once the press has left the phone (Michal, 2026-10-17)
        note: cancelNote(job),
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
 * `busy`, the ring turning beside it (styles.css); while `cancel`, its `note`
 * (TAP_AGAIN; a venue button's cancelNote) in small type under the word, and said
 * after `label` to a screen reader. `paused` (Michal, 2026-10-07: "the button should
 * change to 'continue'"), the word is CONTINUE and the ring stops; its `reset`, the
 * small red control beside it, shows only then.
 */
function paintJobButton(btn, word, { busy, cancel, note = TAP_AGAIN, paused = false, label = word, lead = [], trail = [], reset = null }) {
    const kids = [...lead, paused ? CONTINUE : word, ...trail];
    if (cancel) {
        const small = document.createElement("small");
        small.className = "tap-cancel";
        small.textContent = note;
        kids.push(small);
    }
    btn.replaceChildren(...kids);
    const ring = busy && !paused;
    btn.classList.toggle("busy", ring);
    btn.setAttribute("aria-busy", ring ? "true" : "false");
    const said = paused ? `${word}, ${PAUSED}, ${CONTINUE}` : cancel ? `${label}, ${note}` : label;
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
            if (held.shrunk) img.src = held.before ? held.originalUrl : held.url;
            img.alt = p.name;
            card.append(img);
            if (held.original) card.append(litMark(held, p.name));
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

/**
 * The lit badge, bottom left of a photo Fix dark photos brightened (the AI mark has the
 * bottom right): a tap shows the picture as it was, another the brightened one again, a
 * before/after look on the page only. The brightened one is what goes, or went, to the
 * server: nothing is sent again.
 */
function litMark(held, name) {
    const lit = document.createElement("button");
    lit.type = "button";
    lit.className = held.before ? "lit-mark before" : "lit-mark";
    lit.textContent = "lit";
    lit.setAttribute("aria-pressed", held.before ? "false" : "true");
    lit.setAttribute("aria-label", held.before ? `${name}, as taken: show it brightened` : `${name}, brightened: show it as taken`);
    lit.addEventListener("click", () => {
        held.before = !held.before;
        render();
    });
    return lit;
}

/**
 * The posting screens' line, above them (a walk's "Back to ...", a photo that failed). It is
 * theirs alone: while Admin is open it waits out of sight, and shows again as Admin closes
 * (Michal, 2026-10-22: "when i switch to Admin... the thing is still there.... admin is a not
 * related to this. that tip should not occur on the admin view").
 */
function say(message, kind = "info") {
    el.message.textContent = message || "";
    el.message.className = `message ${kind}`;
    showMessage();
}

/** The posting screens' line shown when it has words and Admin is not open. */
function showMessage() {
    el.message.hidden = !el.message.textContent || !el.admin.hidden;
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

/**
 * The book chip's "Ask for it in Feedback": Admin at Feedback, open, its box saying what is
 * asked for unless something is written there already.
 */
function askForBooks() {
    if (el.admin.hidden) {
        Object.assign(visit, { from: settings() ? mode : "admin", sawCard: false });
        adminShown(true);
    }
    extras.feedback = true;
    renderExtras();
    if (!el.feedbackText.value.trim()) el.feedbackText.value = BOOKS_ASK;
    if (typeof el.feedbackToggle.scrollIntoView === "function") el.feedbackToggle.scrollIntoView({ block: "start" });
    if (typeof el.feedbackText.focus === "function") el.feedbackText.focus();
}

// --- photos ----------------------------------------------------------------

function onItemNameChanged() {
    if (el.itemInput.readOnly) return;
    const cleaned = cleanItemName(el.itemInput.value);
    if (cleaned !== typedName(slots.goods)) {
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
 * folder exists, or once photos are waiting for it: the name is fixed then
 * anyway (an unnamed item's is the phone's only). Photos that waited for a
 * name (a server that wants one) go once he stops typing it.
 */
function scheduleNameCheck() {
    clearTimeout(nameCheck);
    const s = slots.goods;
    if (!s.itemName || s.itemId) return;
    nameCheck = setTimeout(() => {
        checkName(s.itemName)
            .catch(() => {})
            .then(pump);
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
 * A goods item may go with no name (Michal, 2026-10-08), made unnamed on the PC,
 * unless the server refused that (needsName); a book's photos may come before its
 * ISBN (the cover snapped before the barcode is scanned or the ISBN typed) and
 * wait on the page until it names them.
 */
function acceptFiles(m, fileList) {
    const s = slots[m];
    if (m === "goods" && !s.itemName && s.needsName) {
        say(TYPE_NAME_HINT, "warn");
        return;
    }
    if (m === "goods" && s.nameTaken) {
        say(nameTakenHint(s), "warn");
        return;
    }
    if (restoring[m] || photosLocked(s)) return;
    keepSaved[m] = false; // a new item starts: it is the one to remember now
    const item = photoStem(s);
    let next = s;
    const ids = [];
    for (const file of fileList) {
        // unnamed goods are a new folder every time: their photos number from 1, not on
        // from the last unnamed item's
        const n = s.itemName || m === "book" ? takeNumber(item, next) : highestNumber(next) + 1;
        const id = `${item}#${n}#${Date.now()}#${Math.random().toString(36).slice(2, 8)}`;
        blobs.set(id, { file, url: "", shrunk: null, ready: null, fixDark, original: null, originalUrl: "", before: false });
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
                return shrinkPhoto(held.file, { fixDark: held.fixDark });
            })
            .then(
            ({ jpeg, original }) => {
                held.shrunk = jpeg;
                held.file = null; // the camera's original is not needed any more: let it go
                if (held.url) URL.revokeObjectURL(held.url);
                held.url = URL.createObjectURL(jpeg);
                // brightened: the picture as taken, for the lit badge's before/after look
                if (original) {
                    held.original = original;
                    held.originalUrl = URL.createObjectURL(original);
                }
                held.ready = null;
                render();
                return jpeg;
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

/** A photo's pictures off the page: its URLs revoked (the one from before a brightening too). */
function letGo(id) {
    const held = blobs.get(id);
    if (!held) return;
    URL.revokeObjectURL(held.url);
    if (held.originalUrl) URL.revokeObjectURL(held.originalUrl);
    blobs.delete(id);
}

/** The x on a thumbnail: off the page, and off the PC when it may be there. */
function removePhoto(m, id) {
    letGo(id);
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
    // the press leaves the phone: from here a reset may cost the posting ("credits will be lost")
    setState(m, reduce(slots[m], { type: "jobSent", venue }));
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
    if (m === "book" && !booksAllowed(me)) return; // the book screen is only to see (render)
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
 * still queued is dropped before it runs, its posting given back; the one in hand stops
 * at its next step, a draft dumped (Michal, 2026-10-17: "Just dump that answer"), a row
 * already saved kept unpublished, and its posting is spent. Either way the button is its
 * venue again at once, waiting for a new press, and the line says cancelled; a job
 * stopping is still asked about, quietly, until the PC says it stopped ("cancelled from
 * the phone"): the line then says whether the credit is lost (cancelledLine), and only a
 * row it did save is reused by the next press; a dumped draft is drafted afresh.
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

/** The inventory foldout's arrow and word, the list's count after it once there is one. */
function inventoryFold(open) {
    foldCounted(el.inventoryToggle, "Inventory", inventoryTally(admin.counted ? admin.rows.length : null), open);
}

/** The list's count after the Inventory foldout's word, and under it only what the count cannot say. */
function showCount(lead = "") {
    el.inventoryStatus.textContent = [lead, inventoryCount(admin.rows.length)].filter(Boolean).join(" ");
    inventoryFold(admin.inventoryOpen);
}

/** A foldout's arrow and word with a count after it in small muted type ("" for none), as People's. */
function foldCounted(toggle, word, count, open) {
    if (!count) {
        fold(toggle, word, open);
        return;
    }
    const small = document.createElement("span");
    small.className = "fold-count";
    small.textContent = count;
    toggle.replaceChildren(`${open ? "▾" : "▸"} ${word} `, small);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
}

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
    // Admin put away: a venue's page with it, its policies back on Finish setting up
    if (!open && venuePage) {
        venuePage = "";
        el.signupPolicySlot.append(el.policyBlock);
    }
    el.admin.hidden = !open;
    showMessage();
    el.adminToggle.setAttribute("aria-expanded", open ? "true" : "false");
    // Snap while Admin is open, the way back to snapping (Michal, 2026-10-17)
    const link = adminLink(open);
    if (link.dots) el.adminToggle.replaceChildren(dotsIcon());
    else el.adminToggle.textContent = link.text;
    if (link.label) el.adminToggle.setAttribute("aria-label", link.label);
    else el.adminToggle.removeAttribute("aria-label");
    render();
}

/**
 * Admin opens on Settings (its Server fold) while no server is set or an account is being
 * added, on Settings at Snap Account right after a sign-in made on this phone and at Venues
 * while a new account is not set up yet (docs/UI.md), and otherwise on the inventory, asked afresh, or on the listing left open there (Michal,
 * 2026-10-07: "When I press admin I want to land on this same page tho as if the open card
 * was there all along"), or on the listing `card` names (See in inventory). Closed, it lets
 * go of the photos it fetched.
 * @param {boolean} open
 * @param {string} [card] a listing's sku to land on
 */
function showAdmin(open, card = "") {
    // Feedback says where he came from: the posting screen behind Admin, or none (the landing)
    if (open && el.admin.hidden) Object.assign(visit, { from: settings() ? mode : "admin", sawCard: false });
    adminShown(open);
    if (!open) {
        // the account card starts folded and quiet on the next visit, Delete account too, and
        // Venues on eBay's block
        Object.assign(account, { packs: false, status: "" });
        Object.assign(deleting, { open: false, status: "" });
        quietSeller();
        showPeople(false);
        people.status = "";
        people.inviteStatus = "";
        renderAccount();
        wrap.status = "";
        renderWrap();
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
    renderExtras();
    // an account being added: Settings, for its key, as on a phone with none
    const ok = !!settings() && !adding;
    if (!ok) {
        selectFold("server");
        showSettings(true);
        showInventory(false);
        return;
    }
    loadInbox().catch(() => {});
    // the fold the person needs now (docs/UI.md): Snap Account after a sign-in made on this
    // phone, Venues while a new account's eBay is not connected or its address not saved
    const step = signupStep(me);
    if (freshSignin || step) {
        if (step) selectFold("venues");
        if (freshSignin) selectFold("account");
        freshSignin = false;
        showSettings(true);
        showInventory(false);
        // eBay to connect or the address to give: eBay's own page, where both are (2026-10-31)
        if (step && !freshSignin) showVenue("ebay");
        return;
    }
    showSettings(false);
    const sku = card || readText("localStorage", CARD_KEY);
    // Admin opens with Inventory folded at first (Michal, 2026-10-31: "it is no longer necessary for
    // the inventory to be OPEN when you go to the admin options"), then as it was left this visit;
    // a listing left open still reopens
    if (!sku) {
        showInventory(admin.inventoryOpen);
        return;
    }
    admin.inventoryOpen = true;
    el.inventory.hidden = false;
    inventoryFold(true);
    openRow({ sku }, null).catch(() => {});
}

function toggleAdmin() {
    const opening = el.admin.hidden;
    showAdmin(opening);
    // the dot lit: straight to Feedback, its Reviewed mark seen there (Michal, 2026-10-31)
    if (opening && me && me.feedbackUnseen > 0) {
        extras.feedback = true;
        renderExtras();
        loadMine().catch(() => {});
        if (typeof el.feedback.scrollIntoView === "function") el.feedback.scrollIntoView({ block: "start" });
    }
}

/**
 * Settings, inside Admin: opening them opens Admin too, for a caller that sends him there.
 * Opened, its five folds as they were left (renderFolds), the Server fold's boxes filled, and
 * the server asked for the address, the header and footer and the people.
 */
function showSettings(open) {
    if (open && el.admin.hidden) adminShown(true);
    settingsOpen = open;
    el.settings.hidden = !open;
    fold(el.settingsToggle, "Settings", open);
    if (open) {
        fillSettings();
        el.settingsStatus.textContent = "";
        renderAccounts();
        renderDelete();
        renderSettingsFolds();
        loadSettingsParts();
    }
}

function toggleSettings() {
    showSettings(el.settings.hidden);
}

/** Which of Settings' folds this phone left open, read once (FOLDS_KEY). */
function readFolds() {
    const raw = readJson("localStorage", FOLDS_KEY, null);
    const kept = raw && typeof raw === "object" ? raw : {};
    folds = Object.fromEntries(FOLDS.map(([key]) => [key, kept[key] === true]));
}

/**
 * Settings' five parts as a row of chips (Michal, 2026-10-31: "words in pill shaped buttons
 * with the highlighted one deciding what is visible below"): one part shown, the first that
 * `folds` has open, Snap Account when none is; the Server part and its chip only for a key
 * account (an email account has no server to type), or while no account is in hand or one is
 * being added.
 */
function renderSettingsFolds() {
    const a = currentAccount();
    const server = adding || !a || !!a.key;
    const shown = FOLDS.find(([key]) => !!folds[key] && (key !== "server" || server));
    const chosen = shown ? shown[0] : "account";
    for (const [key, word] of FOLDS) {
        const open = key === chosen;
        el.folds[key].toggle.hidden = key === "server" && !server;
        el.folds[key].body.hidden = !open;
        fold(el.folds[key].toggle, word, open);
        el.folds[key].tab.hidden = key === "server" && !server;
        el.folds[key].tab.setAttribute("aria-pressed", open ? "true" : "false");
    }
}

/** One part chosen, the others put away; `keep`: remembered on this phone (a chip's tap). */
function selectFold(key, keep = false) {
    folds = Object.fromEntries(FOLDS.map(([k]) => [k, k === key]));
    if (keep) writeJson("localStorage", FOLDS_KEY, folds);
}

/** A part's chip (or its heading) tapped: that part shown, remembered on this phone. */
function toggleFold(key) {
    selectFold(key, true);
    renderSettingsFolds();
}

/** A part opened by itself (the one the person needs now), Settings open with it, Admin too. */
function openFold(key) {
    selectFold(key);
    showSettings(true);
    const body = el.folds[key].body;
    if (typeof body.scrollIntoView === "function") body.scrollIntoView({ block: "start" });
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
    inventoryFold(open);
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
    el.optionsToggle.setAttribute("aria-expanded", open ? "true" : "false");
}

/** Options tapped open or folded: remembered on this phone. */
/** The magnifying glass: the search box under the tools, or put away; open, the box takes the typing. */
function toggleSearch() {
    const open = el.searchPanel.hidden;
    el.searchPanel.hidden = !open;
    el.searchToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open && typeof el.inventorySearch.focus === "function") el.inventorySearch.focus();
}

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
    admin.counted = true;
    showCount(lead);
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
    const now = parts.shown === null ? row.price : parts.shown;
    parts.up.disabled = busy;
    parts.down.disabled = busy || (!held && dialPrice(now, -1, 1) >= (Number(now) || 0));
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
    clearTimeout(admin.priceTimers.get(sku));
    admin.priceTimers.delete(sku);
    const from = parts.shown === null ? parts.row.price : parts.shown;
    dial = { sku, direction, price: dialPrice(from, direction, 1), held: 0, timer: null };
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

/**
 * The finger off a tile's + or −: the dial stops where it is, on the tile; the price goes to
 * the PC PRICE_SAVE_MS after the last tap, so taps in a row are each shown at once and sent
 * as one (Michal, 2026-10-31: "reactions of the price number to the plus and minus clicks
 * needs to be instantaneous").
 */
function endDial(sku) {
    if (!dial || dial.sku !== sku) return;
    clearTimeout(dial.timer);
    dial = null;
    // the venues the row is live on are behind from this tap: their badges dim at once
    const parts = admin.parts.get(sku);
    if (parts && parts.shown !== null && parts.shown !== Number(parts.row.price)) {
        for (const venue of liveVenues(parts.row)) markUnsynced(sku, venue, true);
    }
    paintTile(sku);
    clearTimeout(admin.priceTimers.get(sku));
    admin.priceTimers.set(
        sku,
        setTimeout(() => {
            admin.priceTimers.delete(sku);
            savePrice(sku).catch(() => {});
        }, PRICE_SAVE_MS)
    );
}

/** The tile's price to the PC now, if it differs from the row's; the save remembered for a sync to wait on. */
function savePrice(sku) {
    const parts = admin.parts.get(sku);
    if (!parts || parts.shown === null) return Promise.resolve();
    const going = sendPrice(sku, parts.shown).finally(() => {
        if (admin.priceSaves.get(sku) === going) admin.priceSaves.delete(sku);
    });
    admin.priceSaves.set(sku, going);
    return going;
}

/** Before a sync or the listing's page: a tile's price still waiting goes now, and one on its way is waited for. */
async function flushPrice(sku) {
    if (admin.priceTimers.has(sku)) {
        clearTimeout(admin.priceTimers.get(sku));
        admin.priceTimers.delete(sku);
        await savePrice(sku).catch(() => {});
    }
    const going = admin.priceSaves.get(sku);
    if (going) await going.catch(() => {});
}

/** A tile's price waiting to go, or on its way. */
function pricePending(sku) {
    return admin.priceTimers.has(sku) || admin.priceSaves.has(sku);
}

/** Every tile's price still waiting, before the venue block's Sync. */
async function flushPrices() {
    await Promise.all([...new Set([...admin.priceTimers.keys(), ...admin.priceSaves.keys()])].map(flushPrice));
}

/**
 * The price a tile was left at, as one PATCH ({"price": "150.00"}) to the PC's inventory, quietly:
 * nothing on the tile shuts or greys while it goes (Michal, 2026-10-31), and no venue hears of
 * it; each listing up on a venue the change left behind then offers its sync on its badge. A
 * change the PC refuses (400) says its words on the inventory's line, and the tile its price as
 * it was. A tile back where it started sends nothing. Taps made while it goes stay on the tile.
 */
async function sendPrice(sku, price) {
    const parts = admin.parts.get(sku);
    const pc = settings();
    if (!parts) return;
    if (!pc || price === Number(parts.row.price)) {
        if (parts.shown === price) parts.shown = null;
        paintTile(sku);
        return;
    }
    const before = parts.row;
    let whole;
    try {
        whole = await patchRow(pc, sku, dialBody(price));
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        el.inventoryStatus.textContent = `${sku}: ${e.message}`;
        const shown = admin.parts.get(sku);
        if (shown) shown.shown = null;
        paintTile(sku);
        return;
    }
    heard(200);
    markBehind(sku, before, whole);
    // the list as the PC now has it (a listing opened from it reads the row afresh)
    admin.rows = admin.rows.map((r) => (r.sku === sku ? followSummary(r, whole) : r));
    const shown = admin.parts.get(sku);
    if (shown) {
        shown.row = followSummary(shown.row, whole);
        if (shown.shown === price) shown.shown = null;
    }
    showCount();
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
    showCount();
    offerUndo({ sku, row: parts.row, at, parts });
}

/**
 * The undo bar under the list: "Archived <title>" and Undo, for UNDO_MS; a row still live on a
 * venue is asked about instead, End listing beside Undo, for ASK_MS (Michal, 2026-10-31). A
 * newer archive takes its place.
 */
function offerUndo(entry) {
    clearTimeout(undo.timer);
    undo.entry = entry;
    entry.live = liveVenues(entry.row);
    el.inventoryUndoText.textContent = archivedLine(rowTitle(entry.row), entry.live);
    el.inventoryEndBtn.hidden = !entry.live.length;
    el.inventoryEndBtn.textContent = entry.live.length > 1 ? "End listings" : "End listing";
    el.inventoryUndo.hidden = false;
    undo.timer = setTimeout(dropUndo, entry.live.length ? ASK_MS : UNDO_MS);
}

function dropUndo() {
    clearTimeout(undo.timer);
    undo.timer = null;
    undo.entry = null;
    el.inventoryUndo.hidden = true;
    el.inventoryEndBtn.hidden = true;
}

/**
 * End listing on the bar: an end job for each venue the archived row is live on, as a card's
 * End listing sends; the bar says so, then goes. Undo after it puts the row back on the list,
 * its listings ended.
 */
async function endArchived() {
    const entry = undo.entry;
    const pc = settings();
    if (!entry || !pc || !entry.live.length) return;
    el.inventoryEndBtn.hidden = true;
    el.inventoryUndoText.textContent = endingLine(rowTitle(entry.row), entry.live);
    clearTimeout(undo.timer);
    undo.timer = setTimeout(dropUndo, UNDO_MS);
    for (const venue of entry.live) {
        try {
            await postJob(pc, actionJob("end", { sku: entry.sku, venue }));
        } catch (e) {
            if (e.status === 0 || e.status === 401) heard(e.status);
            el.inventoryStatus.textContent = `${entry.sku}: ${e.message}`;
        }
    }
    entry.live = [];
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
    showCount();
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
    showCount();
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
        trail: [syncIcon()],
        reset,
    });
    return [btn, reset];
}

/**
 * The sync mark for `direction`, after the venue's name on a venue block's sync button and a
 * row's sync badge: an arrow, right to the venue, left from it (Michal, 2026-10-31: "the
 * typical font arrow right (for sync to) and arrow left (for sync from)"), drawn with a heavy
 * stroke since the font's was too thin to see ("is there a thicker version"), the words'
 * height so the button is no taller. Hidden from a screen reader, which hears the label.
 */
function syncIcon(direction = "to") {
    const mark = document.createElement("span");
    mark.className = "sync-dir";
    mark.setAttribute("aria-hidden", "true");
    mark.setAttribute("data-dir", direction === "from" ? "from" : "to");
    const svg = document.createElementNS(SVG_NS, "svg");
    for (const [k, v] of Object.entries({
        viewBox: "0 0 24 24",
        width: "12",
        height: "12",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "3.6",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
    })) {
        svg.setAttribute(k, v);
    }
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", direction === "from" ? "M20 12H5M11 5l-7 7 7 7" : "M4 12h15M13 5l7 7-7 7");
    svg.append(path);
    mark.append(svg);
    return mark;
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
    if (pricePending(sku)) await flushPrice(sku); // the price the tile shows is the one pushed
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
 * The header's Admin button while Admin is closed (adminLink): three dots in a row in the
 * header's ink (Michal, 2026-10-31: "the dots should be horizontal"), hidden from a screen
 * reader, which hears the button's label, "Admin".
 */
function dotsIcon() {
    const svg = document.createElementNS(SVG_NS, "svg");
    for (const [k, v] of Object.entries({ class: "dots", viewBox: "0 0 24 24", width: "24", height: "24", fill: "currentColor", "aria-hidden": "true" })) {
        svg.setAttribute(k, v);
    }
    for (const cx of ["5", "12", "19"]) {
        const dot = document.createElementNS(SVG_NS, "circle");
        dot.setAttribute("cx", cx);
        dot.setAttribute("cy", "12");
        dot.setAttribute("r", "2.25");
        svg.append(dot);
    }
    return svg;
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
    if (pricePending(row.sku)) await flushPrice(row.sku); // the page reads the price the tile shows
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
 * changed), and, as a card's, its task (Save's PATCH on its way, the row's other buttons
 * waiting).
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
    return !!admin.photoEdit.wait || busy(admin.custom) || VENUES.some((v) => busy(admin.cards[v]));
}

/** customize, then every venue card in its fixed order, and the foldouts' toggles; none without a row. */
function renderCards() {
    renderRowCustomize();
    for (const venue of VENUES) el.detailFolds[venue].card.replaceChildren(...(admin.row ? cardNodes(venue) : []));
    renderFolds();
    paintPhotoEdit();
}

/**
 * The listing's customize, as the goods card: open or folded; the quantity box (not
 * rewritten while it holds what was typed), pickup only and the Price slider with
 * each grade's cached price beside its word (sliderWords), locked while the row is
 * busy; Save, as customizeButtons says; its status line.
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
    // Save alone: the sync buttons live only in each venue's block under Settings, Venues
    // (Michal, 2026-10-31), whose Sync to <venue> puts the saved row on its listing
    el.detailCustomizeSave.disabled = !customizeButtons(row, c.values, busy).save;
    paintCustomizeLine();
}

/** customize's status line, rewritten in place. */
function paintCustomizeLine() {
    if (!admin.row) return;
    const line = customizeLine(admin.custom);
    el.detailCustomizeStatus.textContent = line.text;
    el.detailCustomizeStatus.className = line.kind ? `venue-status ${line.kind}` : "venue-status";
}

/**
 * A box typed or ticked, or the slider moved: the state takes it, and what the last
 * Save said gives way to what the foldout now is (Save opens, or the quantity hint
 * shows, or the slider's line says there is no cached price to set).
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
 * foldout as he left it. Saved, the line says where the change goes on to a listing
 * up (customizeSaved: Sync to <venue> under Settings, Venues).
 */
async function saveRowCustomize() {
    const c = admin.custom;
    const row = admin.row;
    const pc = settings();
    if (!row || !pc || rowBusy() || !quantityValue(c.values.quantity)) return;
    const body = customizeChanges(row, c.values);
    if (!body) return;
    const mine = admin.shown;
    c.note = null;
    c.job = null;
    c.wait = "saving";
    renderCards();
    let whole;
    try {
        whole = await patchRow(pc, row.sku, body);
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
    c.note = customizeSaved(whole, syncVenues(me, "to"));
    markBehind(row.sku, row, whole);
    admin.changed = true;
    refreshRow({ ...whole, sku: row.sku });
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
        off.textContent = venueOff(venue);
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
function paintTaskButton(task, { node, word, reset, trail = [] }) {
    node.disabled = !taskTap(task);
    paintJobButton(node, word, { busy: true, cancel: taskCancel(task), paused: task.paused, reset, trail });
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
    for (const action of venueActions(row, venue)) {
        if (action === "end" && c.noEnd) continue;
        const word = actionWord(action, venue);
        // no Sync to <venue> here: the sync buttons live only in each venue's block under
        // Settings, Venues (Michal, 2026-10-31)
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
    for (const f of EDIT_FIELDS[venue] || []) {
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
    c.note = editSaved(venue, leftUnsynced(row, whole));
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
            : actionJob(action, { sku: row.sku, venue });
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
        // said on the task's own line, in Admin (the posting screens' line is out of sight
        // there), until the next poll says how the job stands
        task.job = { ...task.job, state: "failed", error: `Could not cancel: ${e.message}` };
        paint();
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

/**
 * The photo strip under the heading: an 88 px tile per photo, its picture on its way
 * (fetchRowPhotos), each with an x at its top right while the row has more than one (the
 * server keeps at least one); then a + tile while it has room (Michal, 2026-10-22: "add a
 * plus element at the end of photos to add photo to an item and x at the edge of photo to
 * remove photo ( after confirming)"); under them the strip's line (paintPhotoEdit). A row
 * not read whole yet has neither.
 */
function renderDetailPhotos(row) {
    admin.photoTiles.clear();
    admin.photoEdit.controls = [];
    const photos = rowPhotos(row);
    const whole = Array.isArray(row.photos);
    const kids = [];
    if (photos.length === 0) {
        const none = document.createElement("p");
        none.className = "small";
        none.textContent = whole ? "No photos." : "Reading the photos...";
        kids.push(none);
    }
    const strip = document.createElement("ul");
    strip.className = "strip";
    for (const p of photos) {
        const li = document.createElement("li");
        li.className = "thumb-box";
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
        if (photos.length > 1) {
            const x = actionButton("×", "kill thumb-kill", false, () => {
                admin.photoEdit.ask = p.n;
                admin.photoEdit.note = null;
                paintPhotoEdit();
            });
            x.setAttribute("aria-label", `Remove ${p.name}`);
            admin.photoEdit.controls.push(x);
            li.append(x);
        }
        strip.append(li);
    }
    if (whole && photos.length < MAX_PHOTOS) strip.append(addPhotoNode());
    if (strip.children.length) kids.push(strip);
    const line = document.createElement("div");
    line.className = "photo-edit";
    admin.photoEdit.line = line;
    kids.push(line);
    el.detailPhotos.replaceChildren(...kids);
    paintPhotoEdit();
}

/** The photo strip's state for a listing just opened: nothing asked, nothing on its way. */
function blankPhotoEdit() {
    return { ask: 0, wait: "", note: null, line: null, controls: [] };
}

/**
 * The listing's photos as the PC now has them, after a + or an x: the strip drawn again
 * and every picture fetched again (the numbers have moved), its line saying `note`.
 */
function showRowPhotos(pc, mine, note) {
    for (const url of admin.pictures.values()) URL.revokeObjectURL(url);
    admin.pictures.clear();
    admin.photoEdit.note = note;
    renderDetailPhotos(admin.row);
    fetchRowPhotos(pc, mine).catch(() => {});
}

/**
 * The + tile's photos: each shrunk as a snapped one is (Fix dark photos as it stands, so a
 * dark one goes brightened), then added to the row, one at a time, its line counting them.
 * Each listing up somewhere is then behind on its photos (photosBehind: the PC says so) and
 * offers its Sync to <venue>. More than the row has room for is said, and none of those is
 * sent; one the phone cannot read, or the PC refuses, stops the rest with its words.
 */
async function addRowPhotos(files) {
    const pe = admin.photoEdit;
    const row = admin.row;
    const pc = settings();
    if (!row || !pc || rowBusy() || !files.length) return;
    const mine = admin.shown;
    const room = MAX_PHOTOS - rowPhotos(row).length;
    const going = files.slice(0, Math.max(room, 0));
    pe.ask = 0;
    let current = row;
    let added = 0;
    let stop = files.length > going.length ? { text: `an item holds at most ${MAX_PHOTOS} photos`, kind: "bad" } : null;
    for (const [i, file] of going.entries()) {
        pe.wait = going.length > 1 ? `adding photo ${i + 1} of ${going.length}...` : "adding the photo...";
        renderCards();
        let whole;
        try {
            const { jpeg } = await shrinkPhoto(file, { fixDark });
            if (mine !== admin.shown) return;
            whole = await addRowPhoto(pc, row.sku, jpeg);
        } catch (e) {
            if (mine !== admin.shown) return;
            if (e.status === 0 || e.status === 401) heard(e.status);
            stop = { text: e.message || "could not read the photo", kind: "bad" };
            break;
        }
        if (mine !== admin.shown) return;
        heard(200);
        markBehind(row.sku, current, whole);
        current = { ...whole, sku: row.sku };
        added += 1;
    }
    pe.wait = "";
    if (!added) {
        pe.note = stop;
        renderCards();
        return;
    }
    admin.changed = true;
    refreshRow(current);
    const done = added > 1 ? `${added} photos added` : "photo added";
    showRowPhotos(pc, mine, stop || photoSaved(done, photosBehind(current)));
}

/**
 * The x's "Yes, remove": photo n off the row (the server refuses the only one), the strip
 * drawn again, each listing up somewhere behind on its photos as after a +.
 */
async function removeRowPhoto(n) {
    const pe = admin.photoEdit;
    const row = admin.row;
    const pc = settings();
    if (!row || !pc || rowBusy()) return;
    const mine = admin.shown;
    pe.ask = 0;
    pe.note = null;
    pe.wait = "removing the photo...";
    renderCards();
    let whole;
    try {
        whole = await deleteRowPhoto(pc, row.sku, n);
    } catch (e) {
        if (mine !== admin.shown) return;
        if (e.status === 0 || e.status === 401) heard(e.status);
        pe.wait = "";
        pe.note = { text: e.message, kind: "bad" };
        renderCards();
        return;
    }
    if (mine !== admin.shown) return;
    heard(200);
    pe.wait = "";
    markBehind(row.sku, row, whole);
    admin.changed = true;
    const current = { ...whole, sku: row.sku };
    refreshRow(current);
    showRowPhotos(pc, mine, photoSaved("photo removed", photosBehind(current)));
}

/** The + tile: a label round a hidden file input, the phone's own chooser (camera or gallery). */
function addPhotoNode() {
    const li = document.createElement("li");
    li.className = "add-photo";
    const label = document.createElement("label");
    label.className = "thumb thumb-add";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.className = "sr-only";
    input.setAttribute("aria-label", "Add photos to this item");
    admin.photoEdit.controls.push(input);
    input.addEventListener(
        "change",
        onFiles((files) => {
            addRowPhotos(Array.from(files || [])).catch(() => {});
        })
    );
    const plus = document.createElement("span");
    plus.setAttribute("aria-hidden", "true");
    plus.textContent = "+";
    label.append(plus, input);
    li.append(label);
    return li;
}

/**
 * The strip's x's and + locked while the row is busy, and its line: the x's question
 * (Yes, remove | Keep it), else what is on its way, else what was said last.
 */
function paintPhotoEdit() {
    const pe = admin.photoEdit;
    const line = pe.line;
    if (!line) return;
    const busy = rowBusy();
    for (const control of pe.controls) control.disabled = busy;
    if (pe.ask) {
        const ask = document.createElement("span");
        ask.className = "confirm-ask";
        ask.textContent = photoQuestion(pe.ask);
        const n = pe.ask;
        line.replaceChildren(
            ask,
            actionButton("Yes, remove", "pill pill-small pill-bad", busy, () => {
                removeRowPhoto(n).catch(() => {});
            }),
            actionButton("Keep it", "pill pill-small", false, () => {
                pe.ask = 0;
                paintPhotoEdit();
            })
        );
        return;
    }
    const said = pe.wait ? { text: pe.wait, kind: "busy" } : pe.note;
    if (!said) {
        line.replaceChildren();
        return;
    }
    const p = document.createElement("p");
    p.className = said.kind ? `venue-status ${said.kind}` : "venue-status";
    p.textContent = said.text;
    line.replaceChildren(p);
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
    admin.photoEdit = blankPhotoEdit();
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
    el.inventoryBrowse.hidden = on;
    el.inventoryDetail.hidden = !on;
    el.inventoryBack.hidden = !on || people.open;
    renderExtras();
}

/**
 * Admin's own folds and Close, there on its page and gone while a page of its own (a listing,
 * the People page) is on screen; the Inventory and Feedback never show while no server is set
 * (docs/UI.md).
 */
function renderAdminPage() {
    const page = !el.inventoryDetail.hidden || people.open || !!venuePage;
    const ok = !!settings() && !adding;
    if (!ok) admin.inventoryOpen = false;
    el.inventoryToggle.hidden = page || !ok;
    el.inventory.hidden = !admin.inventoryOpen || people.open || !!venuePage;
    el.settingsToggle.hidden = page;
    el.settings.hidden = page || !settingsOpen;
    el.people.hidden = !people.open;
    // each page's Back above its card, on the page's ground (Michal, 2026-10-31)
    el.inventoryBack.hidden = el.inventoryDetail.hidden || people.open || !!venuePage;
    el.peopleBack.hidden = !people.open;
    el.venueBack.hidden = !venuePage;
    el.venuePage.hidden = !venuePage;
    // no one signed in: Back to sign-in above Settings (Michal, 2026-10-31)
    el.settingsBack.hidden = page || !!settings();
}

/**
 * A venue's own page (Michal, 2026-10-31), as the People page is: Back above the grey card, the
 * venue's name, its block (status, Connect, its sync pair), the address where you ship from
 * where the venue uses one, and on eBay's the policies with their Edit, borrowed from Finish
 * setting up's step 3. `venue` "" closes it.
 */
function showVenue(venue) {
    venuePage = venue;
    el.venuePageHeading.textContent = venue;
    if (venue === "ebay") {
        el.venuePolicySlot.append(el.policyBlock);
        loadPolicies().catch(() => {});
    } else el.signupPolicySlot.append(el.policyBlock);
    renderExtras();
    renderVenues();
    renderSeller();
    if (venue && typeof globalThis.window.scrollTo === "function") globalThis.window.scrollTo({ top: 0 });
}

// --- Admin's Feedback and Stats ---------------------------------------------------------

/**
 * Feedback and Stats, after Settings: each a foldout as Settings is, both stepping aside on
 * a page of its own (a listing's, the People page). Feedback never shows while no server is
 * set. Stats is an admin's only (GET /me says so) and goes for good once the server refuses
 * it (403, or a 404 from an older server).
 */
function renderExtras() {
    renderAdminPage();
    const card = !el.inventoryDetail.hidden || people.open || !!venuePage || !settings() || adding;
    el.feedbackToggle.hidden = card;
    el.feedback.hidden = card || !extras.feedback;
    // an admin's new entries, counted in the toggle and listed above the box
    const entries = me && me.admin ? inbox.entries : [];
    // the admin with an inbox the server gives; one it refuses (an older server) is as anyone's
    const isAdmin = !!me && me.admin === true && !inbox.refused;
    fold(el.feedbackToggle, feedbackWord(entries.length, isAdmin), extras.feedback);
    el.feedbackBox.hidden = isAdmin;
    // what they sent, Reviewed beside each the admin marked
    // oldest first, the newest nearest the box, as a chat reads
    const sent = (mine || []).slice().reverse();
    el.feedbackMine.hidden = isAdmin || !sent.length;
    const who = me && me.user ? `${me.user}'s feedback` : "Your feedback";
    const mineCard = (className, head, text) => {
        const box = document.createElement("div");
        box.className = className;
        const line = (cls, words) => {
            const p = document.createElement("p");
            p.className = cls;
            p.textContent = words;
            return p;
        };
        box.replaceChildren(line("inbox-head", head), line("inbox-text", text));
        return box;
    };
    el.feedbackMine.replaceChildren(
        ...sent.map((e) => {
            const li = document.createElement("li");
            const parts = [mineCard("inbox-entry", [who, listedAtWord(e.created)].filter(Boolean).join(" · "), e.text)];
            if (e.reviewed) parts.push(mineCard("inbox-entry mine-reply", ["Admin", listedAtWord(e.reviewedAt)].filter(Boolean).join(" · "), "Reviewed"));
            li.replaceChildren(...parts);
            return li;
        })
    );
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
/**
 * Their own feedback (GET /me/feedback) as Feedback opens, and, any Reviewed mark among it not
 * seen, every one seen (POST /me/feedback/seen): the dot on top goes. An older server: none.
 */
async function loadMine() {
    const pc = settings();
    if (!pc) return;
    try {
        mine = myFeedbackOf(await getMyFeedback(pc));
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        mine = null;
    }
    renderExtras();
    if (me && me.feedbackUnseen > 0) {
        try {
            await markFeedbackSeen(pc);
            me.feedbackUnseen = 0;
        } catch {
            /* the dot stays until the next try */
        }
        renderUnseen();
    }
}

/** The dot on the top button while a Reviewed mark on their feedback is unseen. */
function renderUnseen() {
    const unseen = !!me && me.feedbackUnseen > 0;
    el.adminToggle.classList.toggle("unseen", unseen);
    if (unseen) el.adminToggle.setAttribute("data-unseen", String(me.feedbackUnseen));
    else el.adminToggle.removeAttribute("data-unseen");
}

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
        loadMine().catch(() => {});
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
    people.append(tableRow("th", ["user", "posted", "cost", "actions"]));
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
 * A sync bar button (Michal, 2026-10-17: "All venues need to be represented (if any new get
 * added as well)"): after the second a job button waits, the sync job of its direction and
 * venue is sent (syncJob), its line under the buttons (queued, the PC's step, its summary or
 * its error; the venue first when the bar holds more than one), polled every POLL_MS; the
 * others lock until it ends (one sync at a time), the pressed one turns its ring, a tap on it
 * pauses the job (onTaskTap) and its reset calls it off, and once done the inventory list is
 * asked for again. A refusal shows the PC's words. The job is the PC's: closing Admin leaves
 * it running and polled.
 */
async function startSync(direction, venue) {
    const action = `${direction} ${venue}`;
    if (sync.wait || jobRunning(sync.job)) {
        if (pressed(sync, action)) onTaskTap(sync, renderSync);
        return;
    }
    if (direction === "to" && (admin.priceTimers.size || admin.priceSaves.size)) await flushPrices(); // the prices the tiles show are the ones sent
    const pc = settings();
    sync.job = null;
    if (!pc) {
        sync.venue = "";
        sync.note = { text: "Set the server address and key under Settings first.", kind: "bad" };
        renderSync();
        return;
    }
    sync.action = action;
    sync.venue = venue;
    sync.note = null;
    sync.stopping = false;
    sync.wait = "sending";
    const waited = pressWait(sync);
    renderSync();
    if (!(await waited)) return;
    let answer;
    try {
        answer = await sendJob(pc, syncJob(me, direction, venue));
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
    sync.job = { action: "sync", direction, venue, job: answer.job, state: answer.state || "queued", ahead: answer.ahead };
    sync.ask = () => {
        askSync().catch(() => {});
    };
    renderSync();
    later(sync);
}

async function askSync() {
    if (!(await askTask(sync, renderSync))) return;
    renderSync();
    // Sync to <venue> put every row on its listing there: none of that venue's listings is
    // behind its row any more (another venue's still are)
    if (sync.job.state === "done" && sync.job.direction === "to") {
        writeJson("localStorage", UNSYNCED_KEY, unsyncedWithout(readUnsynced(), sync.venue));
    }
    if (sync.job.state !== "done" || el.admin.hidden || !admin.inventoryOpen) return;
    // a listing open in place of the list: the list is asked for again on the way back
    if (!el.inventoryDetail.hidden) admin.changed = true;
    else loadInventory().catch(() => {});
}

/**
 * The sync buttons in each venue's block under Settings, Venues, the one place they live
 * (Michal, 2026-10-31): both, Sync from and Sync to, the inventory's green with black words and
 * the page's own half of the sync symbol after them (syncIcon), shown only once the venue is
 * connected or signed in (syncShown); one whose direction does not exist is grey and disabled
 * (syncReason), the one muted reason line under the pair (syncNote); the others are job
 * buttons, the pressed one its ring (continue while paused) and, while it is paused, its
 * reset, the job's line under that venue's pair; one sync at a time locks the rest.
 */
function renderSync() {
    const line = busyLine(sync);
    const locked = !!sync.wait || jobRunning(sync.job);
    const ebay = ebayNow();
    for (const venue of VENUES) {
        const block = el.venueBlocks[venue];
        const said = sync.venue === venue ? line : null;
        block.syncStatus.textContent = said ? said.text : "";
        block.syncStatus.className = said && said.kind ? `sync-status ${said.kind}` : "sync-status";
        const shown = syncShown(venue, me, ebay);
        const drawn = ["from", "to"].map((direction) => {
            const nodes = syncNodes(/** @type {"from"|"to"} */ (direction), venue);
            const busy = pressed(sync, `${direction} ${venue}`);
            const grey = !busy && !!syncReason(venue, /** @type {"from"|"to"} */ (direction), me, ebay);
            nodes.btn.hidden = !shown && !busy;
            nodes.btn.classList.toggle("posted", !grey);
            nodes.btn.classList.toggle("muted", grey);
            nodes.btn.disabled = grey || (locked && !(busy && taskTap(sync)));
            paintJobButton(nodes.btn, syncWord(/** @type {"from"|"to"} */ (direction), venue), {
                busy,
                cancel: busy && taskCancel(sync),
                paused: busy && sync.paused,
                trail: [nodes.icon],
                reset: nodes.reset,
            });
            return nodes;
        });
        if (!block.syncDrawn) {
            // the resets after both buttons: the one showing sits under the pair (styles.css)
            block.syncDrawn = true;
            block.sync.replaceChildren(...drawn.map((n) => n.btn), ...drawn.map((n) => n.reset));
        }
        // no line saying why a button is grey (Michal, 2026-10-31: "no need for this comment")
        block.cannot.textContent = "";
        block.cannot.hidden = true;
    }
}

/**
 * A venue block's sync button and its reset, made once: `sync-<direction>-<venue>`, the
 * inventory's small green badge (Michal, 2026-10-26) with black words (`sync-call`) and the
 * page's own half of the sync symbol after them, the "from" half on Sync from, the "to" half
 * on Sync to (Michal, 2026-10-31: the one sync symbol throughout), and its reset
 * `sync-<direction>-<venue>-reset` (drawn after both buttons).
 */
function syncNodes(direction, venue) {
    const key = `${direction} ${venue}`;
    if (!syncDrawn.nodes.has(key)) {
        const btn = actionButton(syncWord(direction, venue), `vbadge posted vsync sync-call sync-${direction}`, false, () => {
            // a grey one is disabled; should a tap reach it all the same, it does nothing
            if (!pressed(sync, key) && syncReason(venue, direction, me, ebayNow())) return;
            startSync(direction, venue).catch(() => {});
        });
        btn.id = `sync-${direction}-${venue}`;
        const reset = actionButton(RESET, "reset-call", false, () => {
            resetTask(sync, renderSync).catch(() => {});
        });
        reset.id = `sync-${direction}-${venue}-reset`;
        reset.hidden = true;
        reset.setAttribute("aria-label", `${RESET} ${syncWord(direction, venue)}`);
        syncDrawn.nodes.set(key, { btn, icon: syncIcon(direction), reset });
    }
    return syncDrawn.nodes.get(key);
}

// --- the server check ----------------------------------------------------------
// The page asks the PC by itself (on load, every HEALTH_MS while on screen, when
// back online or back on screen) and shows "server ok" / "server off" in the
// header, and there alone (docs/UI.md). Every other call to the PC updates it too.

function renderServer() {
    const line = serverLine(!!settings(), serverStatus);
    el.server.textContent = line.text;
    el.server.classList.toggle("ok", line.kind === "ok");
    el.server.classList.toggle("bad", line.kind === "bad");
    renderSignOut();
}

/**
 * What the PC last said: 200, or the PcError status (0 = no answer). A 401 on a phone
 * signed in by a link (no key) is a session the server no longer knows: the account is
 * marked signed out (kept in Settings' list, with Sign in again) and the landing says so.
 */
function heard(status) {
    serverStatus = status;
    const s = settings();
    if (status === 401 && s && s.session) {
        const a = currentAccount();
        if (a) a.expired = true;
        writeAccounts();
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
        // the account's name in the top bar and on its card, and whether it is the admin's
        const a = currentAccount();
        if (me && a && (a.user !== me.user || a.admin !== me.admin)) {
            a.user = me.user;
            a.admin = me.admin;
            writeAccounts();
        }
    } catch (e) {
        if (e.status !== 0) me = null;
        if (e.status === 401) heard(401);
    }
    renderMe();
    if (!el.admin.hidden) loadInbox().catch(() => {});
    // a new account's step 2: the address for its box, asked once
    if (signupStep(me) === "address" && !seller.info) loadSeller().catch(() => {});
    // a new account's step 3: the policies as the server has them, asked once
    if (signupStep(me) && !policies.asked) {
        policies.asked = true;
        loadPolicies().catch(() => {});
    }
}

/** The eBay policies as the server has them (GET /me/policies); none from an older server. */
async function loadPolicies() {
    const pc = settings();
    if (!pc) return;
    try {
        policies.info = await getPolicies(pc);
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        policies.info = null;
    }
    renderPolicies();
}

/**
 * Step 3: the policies as lines (policyLinesOf), Edit under them where the account may change
 * them (not the admin's: set on the server), once eBay is connected; Edit open, each choice a
 * menu in the list's place, Save last.
 */
function renderPolicies() {
    const info = policies.info;
    const ebay = ebayNow();
    const connected = !!ebay && ebay.connected;
    el.signupPolicyList.replaceChildren(
        ...policySummary(info).map((line) => {
            const li = document.createElement("li");
            li.textContent = line;
            return li;
        })
    );
    const open = policies.editing && !!info;
    el.signupPolicyList.hidden = open;
    el.policyEditor.hidden = !open;
    el.policiesEdit.hidden = open || !info || info.editable !== true;
    el.policiesEdit.disabled = !connected || policies.busy;
    // Looks good: a new account's, from a server that asks for it, once the address is in
    const asks = !!info && typeof info.confirmed === "boolean" && !info.confirmed && !!signupStep(me);
    el.policiesOk.hidden = open || !asks;
    el.policiesOk.disabled = policies.busy || !connected || addressState(seller.info) !== "complete";
    el.policyStatus.textContent = policies.status;
    if (!open) return;
    // the names they have on eBay, in Edit only
    const names = [...new Set((info && Array.isArray(info.line_names) ? info.line_names : []).filter((n) => typeof n === "string" && n))];
    el.policyNames.hidden = !names.length;
    el.policyNames.textContent = names.length ? `On eBay these are named ${namesWord(names)}.` : "";
    const d = policies.draft;
    const services = Array.isArray(info.shipping_services) ? info.shipping_services : [];
    el.policyService.replaceChildren(
        ...services.map((sv) => {
            const option = document.createElement("option");
            option.value = sv.code;
            option.textContent = sv.name;
            if (sv.code === d.shipping_service) option.setAttribute("selected", "");
            return option;
        })
    );
    el.policyService.value = d.shipping_service;
    choiceRow(el.policyCostType, [["CALCULATED", "Calculated"], ["FLAT_RATE", "Flat rate"]], d.shipping_cost_type, (v) => (d.shipping_cost_type = v));
    // several services, a row each, the buyer picking one (2026-10-31); else the one menu
    const several = Array.isArray(d.shipping);
    el.policyService.hidden = several;
    el.policyShipList.hidden = !several;
    if (several) renderShipRows(info, d, services);
    else {
        el.policyShipAdd.hidden = true;
        el.policyShipNote.hidden = true;
    }
    el.policyCostRow.hidden = several || d.shipping_cost_type !== "FLAT_RATE";
    if (document.activeElement !== el.policyCost) el.policyCost.value = d.shipping_cost || "";
    const handling = Array.isArray(info.handling_choices) ? info.handling_choices : [d.handling_days];
    choiceRow(el.policyHandling, handling.map((n) => [n, handlingWord(n)]), d.handling_days, (v) => (d.handling_days = v));
    const returns = Array.isArray(info.return_choices) ? info.return_choices : [d.return_days];
    choiceRow(el.policyReturns, returns.map((n) => [n, returnsWord(n)]), d.return_days, (v) => (d.return_days = v));
    el.policyPayerRow.hidden = d.return_days === 0;
    choiceRow(el.policyPayer, [["BUYER", "Buyer"], ["SELLER", "Seller"]], d.return_shipping_paid_by, (v) => (d.return_shipping_paid_by = v));
    el.policyPickup.checked = !!d.local_pickup;
    el.policyBestOffer.checked = !!d.best_offer;
    el.policyBestOfferTip.hidden = !d.best_offer;
    el.policySave.disabled = policies.busy;
}

/**
 * Edit's services the buyer picks from (Michal, 2026-10-31: "isnt there a way buyer chooses?"):
 * a row each, its menu leaving out the others' services, its own flat rate when the shipping is
 * flat, and a remove while there is more than one; the add link up to the server's most.
 */
function renderShipRows(info, d, services) {
    const flat = d.shipping_cost_type === "FLAT_RATE";
    const most = typeof info.max_services === "number" && info.max_services > 0 ? info.max_services : 4;
    const nameOf = (code) => (services.find((sv) => sv.code === code) || { name: code }).name;
    el.policyShipList.replaceChildren(
        ...d.shipping.map((row, i) => {
            const line = document.createElement("div");
            line.className = "ship-row";
            const menu = document.createElement("select");
            menu.className = "policy-select";
            menu.setAttribute("aria-label", `Shipping service ${i + 1}`);
            const taken = new Set(d.shipping.filter((_, j) => j !== i).map((r) => r.service));
            menu.replaceChildren(
                ...services
                    .filter((sv) => !taken.has(sv.code))
                    .map((sv) => {
                        const option = document.createElement("option");
                        option.value = sv.code;
                        option.textContent = sv.name;
                        if (sv.code === row.service) option.setAttribute("selected", "");
                        return option;
                    })
            );
            menu.value = row.service;
            menu.addEventListener("change", () => {
                row.service = menu.value;
                renderPolicies();
            });
            line.append(menu);
            if (flat) {
                const cost = document.createElement("input");
                cost.type = "text";
                cost.className = "policy-cost";
                cost.setAttribute("inputmode", "decimal");
                cost.setAttribute("autocomplete", "off");
                cost.setAttribute("placeholder", "$");
                cost.setAttribute("aria-label", `Flat rate for ${nameOf(row.service)}, $`);
                cost.value = row.cost || "";
                cost.addEventListener("input", () => {
                    row.cost = cost.value.trim() || null;
                });
                line.append(cost);
            }
            if (d.shipping.length > 1) {
                const drop = document.createElement("button");
                drop.type = "button";
                drop.className = "ship-remove";
                drop.textContent = "×";
                drop.setAttribute("aria-label", `Remove ${nameOf(row.service)}`);
                drop.addEventListener("click", () => {
                    d.shipping.splice(i, 1);
                    renderPolicies();
                });
                line.append(drop);
            }
            return line;
        })
    );
    const used = new Set(d.shipping.map((r) => r.service));
    el.policyShipAdd.hidden = d.shipping.length >= most || !services.some((sv) => !used.has(sv.code));
    el.policyShipNote.hidden = d.shipping.length < 2;
}

/** The add link: the first service not chosen yet, as a new row. */
function addShipRow() {
    const d = policies.draft;
    const info = policies.info;
    if (!d || !Array.isArray(d.shipping) || !info) return;
    const services = Array.isArray(info.shipping_services) ? info.shipping_services : [];
    const used = new Set(d.shipping.map((r) => r.service));
    const next = services.find((sv) => !used.has(sv.code));
    if (next) d.shipping.push({ service: next.code, cost: null });
    renderPolicies();
}

/** What every account gets besides the server's lines (ebay/seller_setup.py). */
const POLICY_EXTRAS = ["Payment: paid through eBay's own checkout", "Books: a separate USPS Media Mail shipping policy"];

/** Step 3's summary: the server's lines, POLICY_EXTRAS before the ship-from one. */
function policySummary(info) {
    const lines = policyRowsOf(info).map((r) => r.line);
    const at = lines.findIndex((l) => l.startsWith("Your ship-from"));
    const cut = at < 0 ? lines.length : at;
    return [...lines.slice(0, cut), ...POLICY_EXTRAS, ...lines.slice(cut)];
}

/** “a”, “a” and “b”, “a”, “b” and “c”. */
function namesWord(names) {
    const q = names.map((n) => `“${n}”`);
    return q.length < 2 ? q.join("") : `${q.slice(0, -1).join(", ")} and ${q.at(-1)}`;
}

/**
 * Looks good: the choices agreed to as they are (POST /me/policies/confirm), the server sets
 * them up on eBay, /me says registered and the goods screen is theirs.
 */
async function confirmPoliciesNow() {
    const pc = settings();
    if (!pc || policies.busy) return;
    policies.busy = true;
    policies.status = "";
    renderPolicies();
    try {
        policies.info = await confirmPolicies(pc);
        await loadMe();
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        policies.status = e.message;
    } finally {
        policies.busy = false;
        renderPolicies();
    }
}

/** A row of chips, the chosen one pressed; a tap chooses (`pick`) and draws Edit again. */
function choiceRow(node, choices, chosen, pick) {
    node.replaceChildren(
        ...choices.map(([value, word]) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "chip";
            chip.textContent = word;
            chip.setAttribute("aria-pressed", value === chosen ? "true" : "false");
            chip.addEventListener("click", () => {
                pick(value);
                renderPolicies();
            });
            return chip;
        })
    );
}

/** Edit tapped: the choices as menus, a draft of them as they are. */
function editPolicies() {
    if (!policies.info) return;
    // its own copy of the services, so a row changed and not saved leaves the list as it was
    policies.draft = { ...policies.info, shipping: shippingOf(policies.info) };
    policies.editing = true;
    policies.status = "";
    renderPolicies();
}

/**
 * Save: only what changed (policyChanges) to PATCH /me/policies; the answer is the list again
 * (Michal, 2026-10-31: "Save will return it into a small list as is"). Refused, its words under
 * Save and the menus stay open.
 */
async function savePolicies() {
    const pc = settings();
    if (!pc || !policies.info || policies.busy) return;
    const changes = policyChanges(policies.info, policies.draft);
    // a cost only with a flat rate: calculated shipping has none (the server refuses one)
    if (policies.draft.shipping_cost_type !== "FLAT_RATE") delete changes.shipping_cost;
    if (!Object.keys(changes).length) {
        policies.editing = false;
        policies.status = "";
        renderPolicies();
        return;
    }
    policies.busy = true;
    policies.status = "saving";
    renderPolicies();
    try {
        policies.info = await patchPolicies(pc, changes);
        policies.editing = false;
        policies.status = "";
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        policies.status = e.message;
    } finally {
        policies.busy = false;
        renderPolicies();
    }
}

/**
 * What /me changes on screen: the top bar's name, the craigslist and poshmark buttons, their
 * empty cards, Stats, the account card, the venue blocks, a new account's steps in place of
 * the posting screens, and the venues the sync buttons and customize's go to and from
 * (`syncable`).
 */
function renderMe() {
    render();
    renderUnseen();
    renderExtras();
    renderAccount();
    renderSync();
    if (admin.row) renderCards();
}

/**
 * Finish setting up (Michal, 2026-10-08), while /me says the account is not registered: step
 * 1, Connect eBay, until it is (then its button says eBay connected, in green: paintConnect);
 * step 2, the address where you ship from, greyed until then (asked to be confirmed when eBay
 * prefilled it, ticked when it is all there). Its line is the account card's (Connect eBay's
 * way out and what went wrong, a 503's words among them).
 */
function renderSignup() {
    const step = settings() ? signupStep(me) : "";
    const connected = step === "address";
    const ebay = ebayNow();
    paintConnect(el.signupConnect, connected, ebay ? ebay.user : "");
    el.signupStepAddress.classList.toggle("off", !connected);
    // step 3 waits with step 2; never ticked: what Snap sets up, not a step done (Michal,
    // 2026-10-31: "no checkmark")
    el.signupStepPolicies.classList.toggle("off", !connected);
    renderPolicies();
    // Michal, 2026-10-08: the server prefills it from eBay on connect: confirmed, or already all
    // there (ticked; the address card still takes a correction while /me catches up)
    const address = connected ? addressState(seller.info) : "empty";
    el.signupAddressWord.textContent = address === "prefilled" ? CONFIRM_SHIP_FROM : SHIP_FROM;
    el.signupStepAddress.classList.toggle("done", address === "complete");
    // the box in place, the server's address in it until it is typed in; Save once edited,
    // Looks right for one prefilled from eBay (Michal, 2026-10-31)
    const info = seller.info;
    if (info) {
        el.signupAddressLine.setAttribute("placeholder", addressHint(sharedUses(info)));
        if (!signupAddressDirty) el.signupAddressLine.value = addressLine(info.shared, sharedUses(info));
    }
    el.signupAddressLine.disabled = !connected || !info || !info.editable;
    el.signupAddress.textContent = !signupAddressDirty && address === "prefilled" ? "Looks right" : "Save";
    el.signupAddress.hidden = !signupAddressDirty && address !== "prefilled";
    el.signupAddress.disabled = !connected || seller.busy;
    el.signupAddressStatus.textContent = connected ? seller.status : "";
    el.signupStatus.textContent = step ? account.status : "";
}

/** Step 2's Save: the box's address through the card's own Save (PATCH /me/seller for a new account). */
async function saveSignupAddress() {
    el.sellerLine.value = el.signupAddressLine.value;
    await saveSeller();
    if (seller.status === "saved") signupAddressDirty = false;
    renderSignup();
}

/** The account's eBay, as /me last said (its policies followed while they are being set up: pollPolicies). */
function ebayNow() {
    return me ? me.ebay : null;
}

/**
 * A Connect eBay button: its word (connectLabel), and once connected lit in the posted green
 * and done with (Michal, 2026-10-10: "It better just say eBay connected on the same button,
 * lit in green"), disabled as it is while eBay or Stripe is being asked.
 * @param {HTMLButtonElement} btn
 * @param {boolean} connected
 * @param {string} user
 */
function paintConnect(btn, connected, user) {
    if (connected && user) {
        const word = document.createElement("span");
        word.className = "connect-word";
        word.textContent = connectLabel(true, "");
        const name = document.createElement("span");
        name.className = "connect-user";
        name.textContent = user;
        btn.replaceChildren(word, name);
        btn.setAttribute("aria-label", connectLabel(true, user));
    } else {
        btn.textContent = connectLabel(connected, user);
        btn.removeAttribute("aria-label");
    }
    btn.classList.toggle("connected", connected);
    btn.disabled = connected || account.busy;
}

/** The address card, at the end of Venues, on screen: step 2 of a new account, the way back from eBay. */
function openSeller() {
    openFold("venues");
    // the address lives on eBay's own page (2026-10-31)
    showVenue("ebay");
    renderAccount();
    if (typeof el.seller.scrollIntoView === "function") el.seller.scrollIntoView({ block: "start" });
}

// --- Settings, Snap Account: the current account's card ----------------------------------
// Michal, 2026-10-08: three free postings per person, then prepaid postings bought through
// Stripe; the page only sends the browser to Stripe's page, which sends it back here with a
// hash (cameBack). Since 2026-10-25 one card per account kept on the phone, the current one
// first and outlined: its name, "by key", the postings on the Buy postings line, its status
// line, the owner's invite box, the People link, and Delete account (Leave this account for a
// member) with Sign out at the bottom right.

/**
 * The current account's card: there while an account is in hand (its name from /me, else
 * from the phone); each part only when the server gives it. The venue blocks, the address
 * card and the people follow it, since /me moves them all.
 */
function renderAccount() {
    const a = currentAccount();
    const credits = me ? me.credits : null;
    const packs = me ? me.packs : [];
    // Buy postings for every account whose postings are counted, however many are left
    // (Michal, 2026-10-31); an unlimited key, the admin's, has nothing to buy
    const canBuy = !!settings() && !!credits && !credits.unlimited;
    const left = settings() ? creditsLine(credits) : "";
    el.account.hidden = !a;
    el.accountUser.textContent = a ? accountName(a) : "";
    const kind = a ? accountKind(a) : "";
    el.accountKind.textContent = kind;
    el.accountKind.hidden = !kind;
    el.accountSigninAgain.hidden = !a || !a.expired;
    el.accountCredits.textContent = left;
    el.accountCredits.hidden = !left;
    el.accountBuy.hidden = !canBuy;
    el.accountBuy.disabled = account.busy;
    el.accountBuy.setAttribute("aria-expanded", canBuy && account.packs ? "true" : "false");
    el.accountPacks.hidden = !canBuy || !account.packs || !packs.length;
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
    el.accountStatus.textContent = account.status;
    renderVenues();
    renderSeller();
    renderPeopleLink();
    renderSignup();
    renderAccounts();
    renderDelete();
}

// --- Settings, Venues: one block per venue (Michal, 2026-10-17 and 2026-10-18: "venue
// symmetry") ----------------------------------------------------------------------------

/**
 * The venues' cards, in /me's order, all shown, the same size (Michal, 2026-10-31): each its
 * name, its status line (venueBlockLine), its Ships from
 * line (shipsFromLine), eBay's Connect eBay and "Connect eBay to start posting" while it is
 * not connected, Reconnect once it is (the status line says "Connected as ...", so the green
 * button is the two steps' alone), the other venues' "Ask for it in Feedback" while the
 * account lacks them; the sync buttons are renderSync's.
 */
function renderVenues() {
    const ebay = ebayNow();
    const order = [...new Set([...(me ? me.venues : []), ...VENUES])].filter((v) => VENUES.includes(v));
    // the Venues part: one summary card per venue, in /me's order; the open venue's page its block
    el.venues.replaceChildren(...order.map((v) => el.venueCards[v].tile));
    for (const venue of VENUES) {
        const block = el.venueBlocks[venue];
        const card = el.venueCards[venue];
        block.block.hidden = venue !== venuePage;
        const words = settings() ? venueBlockLine(venue, me, ebay, seller.ready) : "";
        const ok = !!words && (venue !== "ebay" ? venueAllowed(me, venue) : !!ebay && ebay.connected);
        for (const line of [block.status, card.status]) {
            line.textContent = words;
            line.hidden = !words;
            line.classList.toggle("ok", ok);
        }
        const allowed = venueAllowed(me, venue);
        const ships = allowed ? shipsFromLine(venue, seller.info) : "";
        for (const line of [block.ships, card.ships]) {
            line.textContent = ships;
            line.hidden = !ships;
        }
        if (venue === "ebay") {
            const connected = !!ebay && ebay.connected;
            el.accountConnect.hidden = !ebay || connected;
            paintConnect(el.accountConnect, connected, connected ? ebay.user : "");
            // connected, Reconnect on its page, a button as Connect eBay is (Michal, 2026-10-31)
            el.accountReconnect.hidden = !connected;
            el.accountReconnect.disabled = account.busy;
            block.note.textContent = ebay && !connected ? CONNECT_TO_POST : "";
            block.note.hidden = !block.note.textContent;
        } else block.ask.hidden = allowed || !settings();
    }
    renderSync();
}

// --- the address where you ship from, at the end of Venues --------------------------------
// Michal, 2026-10-08: "What else do we need for the multi tenant? Let's continue." Another
// seller's listings ship from, and are picked up at, her own address: the server keeps it
// (GET/PATCH /me/address since 2026-10-25: one for every venue, or one per venue, Michal:
// "Address can be same for all venues, but also if unchecked it would split into addresses
// per venue") and sets up her eBay business policies from it.

/**
 * The address card, last under Venues with no card of its own (Michal, 2026-10-31): shown
 * once the server gave an answer; its line (why the fold opened by itself, or where a
 * prefilled address came from); the one line, or one line per venue that uses an address
 * (drawAddressVenues), a venue that uses none saying so; what Snap sets up on her eBay while
 * the address is still to be given after eBay connected; then one row, Save address (Looks
 * right for one prefilled from eBay: Michal, 2026-10-08) and the Same address for every venue
 * tick; its line. The admin's is the server's own: the boxes read-only, no Save.
 */
function renderSeller() {
    const info = seller.info;
    // on a venue's own page, for a venue that uses an address (Poshmark uses none)
    el.seller.hidden = !info || !venuePage || (Array.isArray(info.uses && info.uses[venuePage]) && !info.uses[venuePage].length);
    if (!info) return;
    const note = sellerLine(info, ebayNow());
    el.sellerNote.textContent = note || (info.editable ? "" : ADDRESS_ON_SERVER);
    el.sellerNote.hidden = !el.sellerNote.textContent;
    el.addressSame.checked = seller.same;
    el.addressSame.disabled = !info.editable;
    el.addressShared.hidden = !seller.same;
    el.sellerLine.readOnly = !info.editable;
    el.sellerLine.setAttribute("placeholder", addressHint(sharedUses(info)));
    el.addressVenues.hidden = seller.same;
    el.sellerPolicies.hidden = !note;
    el.sellerSave.textContent = addressState(info) === "prefilled" ? "Looks right" : "Save address";
    el.sellerSave.disabled = seller.busy;
    el.sellerSave.hidden = !info.editable;
    el.sellerStatus.textContent = seller.status;
}

/** The venues of the account, in /me's order (every venue while /me does not say). */
function accountVenues() {
    return (me ? me.venues : VENUES).filter((v) => VENUES.includes(v));
}

/**
 * The fields the shared line holds: the street, city, state and ZIP, and the neighbourhood
 * while a venue of the account's uses it (Craigslist's).
 * @param {Address} info
 */
function sharedUses(info) {
    const venues = accountVenues();
    const neighborhood = Object.entries(info.uses).some(([v, fields]) => venues.includes(v) && fields.includes("neighborhood"));
    return ["line1", "city", "state", "zip", ...(neighborhood ? ["neighborhood"] : [])];
}

/** The shared line as the server has the address (Settings opened, a Save answered). */
function fillSeller(info) {
    el.sellerLine.value = addressLine(info.shared, sharedUses(info));
}

/**
 * The shared line, as typed, split at its commas into its fields (parseAddressLine); a
 * neighbourhood no venue of the account uses stays as the server has it.
 */
function sharedBoxes() {
    const info = seller.info;
    const kept = info ? info.shared.neighborhood : "";
    return { neighborhood: kept, ...parseAddressLine(el.sellerLine.value, info ? sharedUses(info) : ["line1", "city", "state", "zip"]) };
}

/**
 * The tick off: one line per venue the account has (in /me's order), its name its label,
 * prefilled from the shared line as it stands (or the venue's own, once the server keeps one)
 * with the fields that venue uses (eBay the full line, Craigslist "60609, McKinley Park"); a
 * venue that uses none gets its muted line. Drawn afresh each time.
 * @param {Address} info
 */
function drawAddressVenues(info) {
    seller.venueBoxes = {};
    const shared = sharedBoxes();
    el.addressVenues.replaceChildren(
        ...accountVenues().map((venue) => {
            const uses = info.uses[venue] || [];
            if (!uses.length) {
                const none = document.createElement("p");
                none.className = "small venue-note";
                none.textContent = noAddressLine(venue);
                return none;
            }
            const own = info.same ? {} : info.venues[venue] || {};
            const fields = Object.fromEntries(uses.map((k) => [k, own[k] || shared[k] || ""]));
            const wrap = document.createElement("label");
            wrap.className = "field field-small";
            const span = document.createElement("span");
            span.className = "field-label";
            span.textContent = venue;
            const input = document.createElement("input");
            input.className = "small-input";
            input.type = "text";
            input.id = `address-${venue}-line`;
            input.value = addressLine(fields, uses);
            input.setAttribute("placeholder", addressHint(uses));
            input.readOnly = !info.editable;
            wrap.append(span, input);
            seller.venueBoxes[venue] = { input, uses };
            return wrap;
        })
    );
}

/**
 * Same address for every venue ticked or unticked: unticked, the venue lines come up from
 * the shared one; ticked again, eBay's goes on as the shared one (it is the one eBay
 * prefilled: docs/UI.md), with Craigslist's neighbourhood. Nothing is sent until Save address.
 */
function setSameAddress(on) {
    const info = seller.info;
    if (!info) return;
    if (!on) drawAddressVenues(info);
    else if (seller.venueBoxes.ebay) {
        const typed = (venue) => (seller.venueBoxes[venue] ? parseAddressLine(seller.venueBoxes[venue].input.value, seller.venueBoxes[venue].uses) : {});
        const fields = { ...sharedBoxes(), ...typed("ebay") };
        const cl = typed("craigslist");
        if (cl.neighborhood !== undefined) fields.neighborhood = cl.neighborhood;
        el.sellerLine.value = addressLine(fields, sharedUses(info));
    }
    seller.same = on;
    seller.status = "";
    renderSeller();
}
/** Quiet for the next visit, and no more asking about the policies. */
function quietSeller() {
    clearTimeout(seller.poll);
    Object.assign(seller, { status: "", ready: false, poll: null, polls: 0 });
    seller.asked += 1;
}

/**
 * GET /me/address, as Settings opens: the boxes filled (prefilled from eBay, maybe), and the
 * Venues fold open by itself, saying why, when eBay is connected and the address is not all
 * there. An older server's 404: no card.
 */
async function loadSeller() {
    const pc = settings();
    if (!pc) return;
    seller.asked += 1;
    const mine = seller.asked;
    try {
        const info = addressOf(await getAddress(pc));
        if (mine !== seller.asked) return;
        seller.info = info;
        if (info) {
            seller.same = info.same;
            fillSeller(info);
            if (!info.same) drawAddressVenues(info);
            if (sellerLine(info, ebayNow())) {
                selectFold("venues");
                // the address it asks for is on eBay's own page (2026-10-31)
                if (!el.admin.hidden && !venuePage) showVenue("ebay");
            }
            const ebay = ebayNow();
            if (ebay && ebay.policies === "pending") pollPolicies(true);
            // a new account whose address came all there from eBay: /me again, for the goods screen
            if (addressState(info) === "complete" && signupStep(me) === "address") loadMe().catch(() => {});
        }
    } catch (e) {
        if (mine !== seller.asked) return;
        if (e.status === 404) seller.info = null;
        if (e.status === 0 || e.status === 401) heard(e.status);
    }
    if (!el.settings.hidden) renderSettingsFolds();
    renderAccount();
}

/**
 * Save address: PATCH /me/address with the boxes as they stand (addressSaveBody: the one
 * shared block, or one per venue), or the box that is not right named and nothing sent.
 * Saved, /me is asked again for the policies the server now sets up, and every 10 s while
 * it does.
 */
async function saveSeller() {
    const pc = settings();
    const info = seller.info;
    if (!pc || !info || seller.busy) return;
    // each venue's line split at its commas into the fields it uses (eBay's street, city, state and ZIP)
    const venues = Object.fromEntries(Object.entries(seller.venueBoxes).map(([v, { input, uses }]) => [v, parseAddressLine(input.value, uses)]));
    const uses = Object.fromEntries(Object.entries(info.uses).filter(([v]) => (me ? me.venues : VENUES).includes(v)));
    // step 2 of Finish setting up saves through PATCH /me/seller as ever: the route that starts
    // the eBay policy setup (and writes the shared address too); the card otherwise /me/address
    const step2 = signupStep(me) === "address";
    const made = step2 ? addressBody(sharedBoxes()) : addressSaveBody({ same: seller.same, shared: sharedBoxes(), venues, uses });
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
        const answer = step2 ? addressOf(await patchSeller(pc, made.body).then(() => getAddress(pc))) : addressOf(await patchAddress(pc, made.body));
        // Admin closed meanwhile (or another account): the next visit asks afresh
        if (mine !== seller.asked) return;
        seller.status = "saved";
        if (answer) {
            seller.info = answer;
            seller.same = answer.same;
            fillSeller(answer);
            if (!answer.same) drawAddressVenues(answer);
        }
        // the server sets up her eBay policies from it: /me says how they stand; a new
        // account's last step: the address in, /me says registered, and the goods screen is hers
        await loadMe();
        const ebay = ebayNow();
        if (ebay && ebay.policies === "pending") pollPolicies(true);
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        if (mine === seller.asked) seller.status = sellerError(e.status, e.message);
    } finally {
        seller.busy = false;
        renderAccount();
    }
}

/**
 * While eBay's policies are being set up: GET /me every 10 s until they are ready (said
 * once on the eBay block's line) or failed, three minutes at most (`fresh` starts the count
 * again).
 * @param {boolean} fresh
 */
function pollPolicies(fresh) {
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
            const answer = meOf(await getMe(pc));
            if (mine !== seller.asked || !answer) return;
            me = answer;
        } catch (e) {
            if (e.status === 401) heard(401);
            if (mine !== seller.asked) return;
        }
        const ebay = ebayNow();
        const policies = ebay ? ebay.policies : "";
        if (policies === "ready") seller.ready = true;
        renderMe();
        if (policies === "pending") pollPolicies(false);
    }, SELLER_POLL_MS);
}

// --- a header and a footer on every listing, under Posting defaults ----------------------
// Michal, 2026-10-17: "In default settings add a checkbox for footnote/header for all posts.
// When you check that, a text area appears ... If you uncheck it, it should not lose what you
// had." The server keeps both (GET/PATCH /me/wrap) and puts them round every description it
// posts. Since 2026-10-31 one tick, Add standard text to posts, and under it while ticked the
// gray card: Header and its box and venue chips, Footer the same (a blank box means none),
// then Save for upcoming postings and Apply to existing postings, dimmed until something
// changes, dimmed again once pressed.

/** The card's two parts as typed and chosen: each box's words and its venue chips. */
function wrapDraft() {
    return Object.fromEntries(WRAP_PARTS.map((part) => [part, { text: el.wrapParts[part].text.value, venues: wrap.draft[part] }]));
}

/**
 * The tick and the card: the tick once the server answered, ticked as wrap.open; the card
 * while it is; per part its venue chips (option chips, one per venue /me/wrap offers, the
 * chosen white with a check); the two buttons dimmed until the boxes or the chips differ from
 * the server's (wrapDraftBody), while a Save is on its way, and Apply while one of its pushes
 * runs; the card's line; under it one line per venue Apply pushed onto, its job's step or summary.
 */
function renderWrap() {
    const info = wrap.info;
    // always there, greyed with its reason until the server gives it (Michal, 2026-10-31)
    el.wrapOn.disabled = !info;
    const why = info ? "" : !settings() ? WRAP_SIGN_IN : wrap.missing ? WRAP_MISSING : "";
    el.wrapWhy.textContent = why;
    el.wrapWhy.hidden = !why;
    el.wrapOn.checked = !!info && wrap.open;
    el.wrap.hidden = !info || !wrap.open;
    const venues = info ? info.available : [];
    for (const part of WRAP_PARTS) {
        const chips = venues.map((venue) => {
            const chip = wrapChip(part, venue);
            chip.setAttribute("aria-pressed", wrap.draft[part].includes(venue) ? "true" : "false");
            chip.disabled = wrap.busy;
            return chip;
        });
        if (wrap.shown[part] !== venues.join(" ")) {
            wrap.shown[part] = venues.join(" ");
            el.wrapParts[part].venues.replaceChildren(...chips);
        }
    }
    const made = info ? wrapDraftBody(wrapDraft(), info) : { ok: true, body: {} };
    const changed = !made.ok || Object.keys(made.body).length > 0;
    const applying = Object.values(wrap.apply).some((task) => !!task.wait || jobRunning(task.job));
    el.wrapSave.disabled = wrap.busy || !wrap.open || !changed;
    el.wrapApply.disabled = wrap.busy || !wrap.open || !changed || applying;
    el.wrapStatus.textContent = wrap.status;
    const said = VENUES.flatMap((venue) => {
        const task = wrap.apply[venue];
        const line = task ? busyLine(task) : null;
        return line ? [{ venue, line }] : [];
    });
    el.wrapJobs.hidden = !said.length;
    el.wrapJobs.replaceChildren(
        ...said.map(({ venue, line }) => {
            const p = document.createElement("p");
            p.id = `wrap-apply-${venue}-status`;
            p.className = line.kind ? `venue-status ${line.kind}` : "venue-status";
            // the venue named once there is more than one line
            p.textContent = said.length > 1 ? `${venue}: ${line.text}` : line.text;
            return p;
        })
    );
}

/** A part's venue chip (`wrap-<part>-<venue>`), made once: a tap chooses the venue or lets it go. */
function wrapChip(part, venue) {
    const key = `${part} ${venue}`;
    if (!wrap.chips[key]) {
        const chip = actionButton(venue, "chip option", false, () => {
            const now = wrap.draft[part];
            wrap.draft[part] = now.includes(venue) ? now.filter((v) => v !== venue) : VENUES.filter((v) => v === venue || now.includes(v));
            wrap.status = "";
            renderWrap();
        });
        chip.id = `wrap-${part}-${venue}`;
        wrap.chips[key] = chip;
    }
    return wrap.chips[key];
}

/** The card as the server has it: each box its text, each part's chips its venues (Settings opened, a Save answered). */
function fillWrap(info, parts) {
    for (const part of parts) {
        el.wrapParts[part].text.value = info[part].text;
        wrap.draft[part] = [...info[part].venues];
    }
}

/**
 * GET /me/wrap, as Settings opens: the tick as the server has it (wrapOn), the card filled.
 * An older server's 404: no tick, no card. No answer keeps what the last one said.
 */
async function loadWrap() {
    const pc = settings();
    if (!pc) return;
    wrap.asked += 1;
    const mine = wrap.asked;
    try {
        const info = wrapOf(await getWrap(pc));
        if (mine !== wrap.asked) return;
        wrap.info = info;
        wrap.missing = !info;
        if (info) {
            fillWrap(info, WRAP_PARTS);
            wrap.open = wrapOn(info);
        }
    } catch (e) {
        if (mine !== wrap.asked) return;
        if (e.status === 404) Object.assign(wrap, { info: null, missing: true });
        if (e.status === 0 || e.status === 401) heard(e.status);
    }
    renderWrap();
}

/**
 * A box typed in: the buttons wake once it differs from the server's. A part with words and no
 * venue chosen, for an account that posts to one venue (Michal: "If there is only one venue
 * available, as for a typical user, that can be checked right away"), gets that venue chosen.
 * @param {"header"|"footer"} part
 */
function onWrapInput(part) {
    const info = wrap.info;
    if (!info) return;
    if (!wrap.busy) wrap.status = "";
    if (info.available.length === 1 && !wrap.draft[part].length && el.wrapParts[part].text.value.trim()) wrap.draft[part] = [...info.available];
    renderWrap();
}

/**
 * Add standard text to posts ticked: the card, as it was left, nothing sent. Unticked: the card
 * goes and both parts are turned off on the server at once (wrapOffBody), their texts and
 * venues kept; a refusal ticks it again and says why.
 * @param {boolean} on
 */
async function setWrapOpen(on) {
    const pc = settings();
    const info = wrap.info;
    if (!info || !pc) return;
    wrap.open = on;
    wrap.status = "";
    renderWrap();
    const body = on ? {} : wrapOffBody(info);
    if (!Object.keys(body).length) return;
    wrap.busy = true;
    wrap.asked += 1;
    const mine = wrap.asked;
    try {
        const answer = wrapOf(await patchWrap(pc, body));
        if (mine === wrap.asked && answer) wrap.info = answer;
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        if (mine === wrap.asked) {
            wrap.open = true;
            wrap.status = wrapError(e.status, e.message);
        }
    } finally {
        wrap.busy = false;
        renderWrap();
    }
}

/**
 * Save for upcoming postings: the card as it stands, only what differs from the server's
 * (wrapDraftBody), in one PATCH /me/wrap; its line saying so; the boxes and chips as the
 * server keeps them, unless typed in meanwhile. True once the server holds what the card says
 * (nothing to send counts), so Apply can follow.
 * @returns {Promise<boolean>}
 */
async function saveWrap() {
    const pc = settings();
    const info = wrap.info;
    if (wrap.busy || !info || !pc) return false;
    const sent = wrapDraft();
    const made = wrapDraftBody(sent, info);
    if (!made.ok) {
        wrap.status = made.error;
        renderWrap();
        return false;
    }
    if (!Object.keys(made.body).length) return true;
    wrap.busy = true;
    wrap.status = "Saving...";
    wrap.asked += 1;
    const mine = wrap.asked;
    renderWrap();
    try {
        const answer = wrapOf(await patchWrap(pc, made.body));
        if (mine !== wrap.asked) return false;
        if (answer) {
            wrap.info = answer;
            for (const part of WRAP_PARTS) {
                if (el.wrapParts[part].text.value === sent[part].text) fillWrap(answer, [part]);
            }
        }
        wrap.status = "saved";
        return true;
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        if (mine === wrap.asked) wrap.status = wrapError(e.status, e.message);
        return false;
    } finally {
        wrap.busy = false;
        renderWrap();
    }
}

/**
 * Apply to existing postings: Save first, then POST /me/wrap/apply for every venue a part now
 * goes on (wrapApplyVenues), each its own job, polled every POLL_MS as a venue block's sync is,
 * its line under the card's (queued, the server's step, its summary or its error).
 */
async function applyWrapAll() {
    if (!(await saveWrap()) || !wrap.info) return;
    for (const venue of wrapApplyVenues(wrap.info)) startApply(venue).catch(() => {});
}

/**
 * One venue's push of the header and footer onto its listings already up: POST /me/wrap/apply
 * {"venue"}, then the job asked about every POLL_MS; a refusal shows the server's words.
 * @param {string} venue
 */
async function startApply(venue) {
    if (!wrap.apply[venue]) wrap.apply[venue] = jobTask();
    const task = wrap.apply[venue];
    if (task.wait || jobRunning(task.job)) return;
    const pc = settings();
    if (!pc) return;
    Object.assign(task, { action: "apply", job: null, note: null, stopping: false, wait: "sending" });
    renderWrap();
    let answer;
    try {
        answer = await applyWrap(pc, venue);
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        Object.assign(task, { action: "", wait: "", note: { text: e.message, kind: "bad" } });
        renderWrap();
        return;
    }
    // signed out meanwhile: the task is no longer the screen's
    if (wrap.apply[venue] !== task) return;
    heard(200);
    task.wait = "";
    task.job = { action: "wrap", venue, job: answer.job, state: answer.state || "queued", ahead: answer.ahead };
    task.ask = () => {
        askTask(task, renderWrap)
            .then(renderWrap)
            .catch(() => {});
    };
    renderWrap();
    later(task);
}

/**
 * Signed out, or other settings saved: the tick, the card and their answers go, any push no
 * longer asked about (the job itself is the server's).
 */
function dropWrap() {
    wrap.asked += 1;
    Object.assign(wrap, { info: null, open: false, status: "", busy: false, draft: { header: [], footer: [] } });
    for (const part of WRAP_PARTS) el.wrapParts[part].text.value = "";
    for (const task of Object.values(wrap.apply)) {
        clearTimeout(task.timer);
        clearTimeout(task.lateTimer);
    }
    wrap.apply = {};
    renderWrap();
}
// --- the people on this account (Michal, 2026-10-25: "allow two users to join the same
// family group") -----------------------------------------------------------------------
// The owner's card carries the invite box (their email alone); everyone's carries the People
// link, which opens the People page in Admin's place: one card per person by the name they
// chose, their devices with Sign out, Change name on your own, Remove on a member (the
// owner's), Leave this account at the end (a member's).

/**
 * GET /me/people, then GET /me/devices (everyone's, `?all=1`, when the person looking owns
 * the account): the count on the People link and the People page. A server without them
 * (404) or refusing (403): no link, no invite box.
 */
async function loadPeople() {
    const pc = settings();
    if (!pc) return;
    people.asked += 1;
    const mine = people.asked;
    try {
        const info = peopleOf(await getPeople(pc));
        if (mine !== people.asked) return;
        people.info = info;
        if (info) {
            const devices = devicesOf(await getDevices(pc, info.owner));
            if (mine !== people.asked) return;
            people.devices = devices;
        }
    } catch (e) {
        if (mine !== people.asked) return;
        if (e.status === 404 || e.status === 403) {
            people.info = null;
            people.devices = null;
        }
        if (e.status === 0 || e.status === 401) heard(e.status);
    }
    renderPeopleLink();
    renderPeople();
}

/** The people let go with the account: the page closed, the lines quiet. */
function dropPeople() {
    people.asked += 1;
    Object.assign(people, { info: null, devices: null, busy: false, status: "", inviteStatus: "", renaming: false });
    if (people.open) showPeople(false);
}

/** The invite box (the owner's) and the People link with its count, on the current account's card. */
function renderPeopleLink() {
    const info = settings() ? people.info : null;
    const owner = !!info && info.owner;
    el.invite.hidden = !owner;
    el.inviteSend.disabled = people.busy;
    el.inviteStatus.textContent = people.inviteStatus;
    el.accountPeople.hidden = !info;
    el.peopleCount.textContent = info ? peopleCount(info.people.length) : "";
}

/**
 * The People page in Admin's place, or Admin's own page again: opened, the people asked for
 * afresh and the page at the top.
 * @param {boolean} on
 */
function showPeople(on) {
    people.open = on;
    people.status = "";
    people.renaming = false;
    renderExtras();
    renderPeople();
    if (on) {
        loadPeople().catch(() => {});
        if (typeof globalThis.window.scrollTo === "function") globalThis.window.scrollTo({ top: 0 });
    }
}

/**
 * The People page: one card per person, the owner first (peopleOf), its name, its words
 * (personWords), Change name on your own (the box and its Save while open), Remove on a
 * member for the owner; under each their devices (deviceLine), Sign out on each, and Sign
 * out all other devices on your own card while there is another; Leave this account at the
 * end for a member.
 */
function renderPeople() {
    const info = people.info;
    el.peopleStatus.textContent = people.status;
    el.peopleLeave.hidden = !info || info.owner;
    el.peopleLeave.disabled = people.busy;
    if (!people.open || !info) {
        el.peopleList.replaceChildren();
        return;
    }
    const now = Date.now();
    el.peopleList.replaceChildren(
        ...info.people.map((p) => {
            const li = document.createElement("li");
            li.className = "card person-card";
            const name = document.createElement("p");
            name.className = "person-name";
            name.textContent = p.name;
            const words = document.createElement("p");
            words.className = "small person-words";
            words.textContent = personWords(p);
            li.append(name, words);
            const actions = document.createElement("div");
            actions.className = "person-actions";
            if (p.you) {
                actions.append(
                    actionButton("Change name", "link person-action", people.busy, () => {
                        people.renaming = !people.renaming;
                        renderPeople();
                    })
                );
            }
            if (!p.owner && info.owner) {
                actions.append(
                    actionButton("Remove", "link person-action", people.busy, () => {
                        removePerson(p).catch(() => {});
                    })
                );
            }
            if (actions.children.length) li.append(actions);
            if (p.you && people.renaming) {
                const field = document.createElement("label");
                field.className = "field field-small";
                const label = document.createElement("span");
                label.className = "field-label";
                label.textContent = "Your name";
                const input = document.createElement("input");
                input.className = "small-input";
                input.type = "text";
                input.id = "person-name-input";
                input.value = p.name;
                field.append(label, input);
                const save = actionButton("Save", "pill pill-ink pill-small", people.busy, () => {
                    rename(input.value).catch(() => {});
                });
                save.id = "person-name-save";
                li.append(field, save);
            }
            const devices = (people.devices && people.devices[p.email]) || [];
            if (devices.length) {
                const list = document.createElement("ul");
                list.className = "device-list";
                for (const d of devices) {
                    const row = document.createElement("li");
                    row.className = "device";
                    const line = document.createElement("span");
                    line.textContent = deviceLine(d, now);
                    const out = actionButton("Sign out", "link device-signout", people.busy, () => {
                        signOutOne(d).catch(() => {});
                    });
                    out.id = `device-${d.id}-signout`;
                    row.append(line, out);
                    list.append(row);
                }
                li.append(list);
            }
            // only where there is another device of yours to sign out (a key has no sessions)
            if (p.you && devices.some((d) => !d.thisDevice)) {
                const others = actionButton("Sign out all other devices", "link person-action", people.busy, () => {
                    signOutRest().catch(() => {});
                });
                others.id = "people-signout-others";
                li.append(others);
            }
            return li;
        })
    );
}

/** One people action on its way: the page's line meanwhile, then the people asked for again; a refusal said (peopleError). */
async function peopleAction(lead, meanwhile, run) {
    const pc = settings();
    if (!pc || people.busy) return false;
    people.busy = true;
    people.status = meanwhile;
    renderPeople();
    renderPeopleLink();
    renderDelete();
    try {
        await run(pc);
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        people.busy = false;
        people.status = peopleError(lead, e.status, e.message);
        renderPeople();
        renderPeopleLink();
        renderDelete();
        return false;
    }
    people.busy = false;
    people.status = "";
    renderDelete();
    await loadPeople();
    return true;
}

/** Invite: POST /me/people with their email (inviteBody); 202: "Invitation sent", the box cleared. */
async function invite() {
    const pc = settings();
    if (!pc || people.busy) return;
    const made = inviteBody({ email: el.inviteEmail.value });
    if (!made.ok) {
        people.inviteStatus = made.error;
        renderPeopleLink();
        return;
    }
    people.busy = true;
    people.inviteStatus = "Inviting...";
    renderPeopleLink();
    try {
        await inviteMember(pc, made.body);
        people.inviteStatus = INVITE_SENT;
        el.inviteEmail.value = "";
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        people.inviteStatus = peopleError("Could not invite", e.status, e.message);
    } finally {
        people.busy = false;
        renderPeopleLink();
    }
    await loadPeople();
}

/** Remove, on a member's card (the owner's): DELETE /me/people/<email>; their sessions end with them. */
function removePerson(p) {
    return peopleAction("Could not remove them", `Removing ${p.name}...`, (pc) => removeMember(pc, p.email));
}

/** Change name's Save: PATCH /me/people/me (nameBody); the page says the new name. */
async function rename(raw) {
    const made = nameBody(raw);
    if (!made.ok) {
        people.status = made.error;
        renderPeople();
        return;
    }
    const done = await peopleAction("Could not change the name", "Saving...", (pc) => renameMe(pc, made.body));
    if (done) people.renaming = false;
    renderPeople();
}

/**
 * Sign out, on a device: DELETE /me/devices/<id>. This device's drops the account from the
 * phone as Sign out does (its session ended with it: the server is told nothing more).
 */
async function signOutOne(d) {
    if (!d.thisDevice) {
        await peopleAction("Could not sign out the device", "Signing out...", (pc) => signOutDevice(pc, d.id));
        return;
    }
    const pc = settings();
    const a = currentAccount();
    if (!pc || !a || people.busy) return;
    people.busy = true;
    people.status = "Signing out...";
    renderPeople();
    try {
        await signOutDevice(pc, d.id);
    } catch (e) {
        if (e.status === 0 || e.status === 401) heard(e.status);
        people.busy = false;
        people.status = peopleError("Could not sign out the device", e.status, e.message);
        renderPeople();
        return;
    }
    people.busy = false;
    removeAccount(a.id, false);
}

/** Sign out all other devices: POST /me/devices/sign-out-others, "Signed out n other devices". */
async function signOutRest() {
    let said = "";
    await peopleAction("Could not sign out the other devices", "Signing out...", async (pc) => {
        said = signedOutOthers((await signOutOthers(pc)).signed_out);
    });
    if (said) {
        people.status = said;
        renderPeople();
    }
}

/**
 * Admin open on Settings, at the account card: where a venue button's Buy postings leads
 * (`packs`: its pack choice unfolded), and the way back from Stripe or eBay.
 * @param {boolean} packs
 */
function openAccount(packs) {
    if (el.admin.hidden) {
        Object.assign(visit, { from: settings() ? mode : "admin", sawCard: false });
        adminShown(true);
    }
    openFold("account");
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
 * Back from Stripe (`#paid=`) or eBay (`#ebay=`): the line says how it went, and /me is asked
 * again for the postings or the eBay now there. Back from Stripe, and from eBay on an account
 * set up already: Admin on Settings. A new account back from eBay stays on Finish setting up,
 * step 1 green and the address next (Michal, 2026-10-31: "i want to come back to this page").
 * @param {{kind:"paid"|"ebay", value:string}} back
 */
function cameBack(back) {
    account.status = returnLine(back);
    if (back.kind !== "ebay") {
        openAccount(false);
        loadMe().catch(() => {});
        return;
    }
    loadMe()
        .then(() => {
            if (signupStep(me)) {
                // step 1's green button says it: the line only for what it cannot (a failure)
                if (back.value === "connected") account.status = "";
                render();
            } else openAccount(false);
        })
        .catch(() => openAccount(false));
}

/**
 * The landing again, with `message` on it: Admin closed, the server word and /me let go.
 * The items in hand stay saved for when he is back in.
 */
function toLanding(message) {
    letGoAccount();
    entry = "";
    adding = false;
    el.landingStatus.textContent = message;
    if (!el.admin.hidden) showAdmin(false);
    askSignup().catch(() => {});
    render();
    renderServer();
    renderExtras();
    renderAccount();
}

/**
 * Settings' Sign out (Michal, 2026-10-08; of the current account since 2.23.0): the account
 * in hand off this phone (removeAccount: a session is first told to the server, DELETE
 * /auth/session, not waited for), the next account kept here taken up, or the landing back.
 */
function forgetServer() {
    const a = currentAccount();
    if (a) removeAccount(a.id);
}

/** Sign out, bottom right of the account card: there once there is an account in hand. */
function renderSignOut() {
    const a = currentAccount();
    el.settingsSignout.hidden = !a;
    el.settingsSignout.textContent = "Sign out";
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
    codeOpen = false;
    el.signinStatus.textContent = "";
    render();
    if (open) el.signinEmail.focus();
}

/** I already have a code: the code box, without a new link (asked for in Safari, say). */
function openCode() {
    codeOpen = true;
    render();
    el.signinCode.focus();
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
        codeOpen = true;
        render();
    } catch (e) {
        el.signinStatus.textContent = e.status === 404 ? SIGNIN_MISSING : `Could not send the link: ${e.message}.`;
    } finally {
        el.signinSend.disabled = false;
    }
}

/**
 * The page opened from a sign-in link (`#login=<token>`): the token for a session (POST
 * /auth/session), kept as keepSession keeps it.
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
    keepSession(made);
}

/**
 * Sign in with the code: the mail's six digits and the address in the box for a session
 * (POST /auth/session, as a link's token is); a wrong code keeps the box for another try.
 */
async function sendCode() {
    const checked = checkEmail(el.signinEmail.value);
    if (!checked.ok) {
        el.signinStatus.textContent = checked.error;
        return;
    }
    const code = cleanCode(el.signinCode.value);
    if (!code) {
        el.signinStatus.textContent = CODE_NEEDED;
        return;
    }
    el.signinCodeSend.disabled = true;
    el.signinStatus.textContent = "Signing you in...";
    let made = null;
    try {
        made = sessionOf(await codeSession(DEFAULT_SERVER, { email: checked.email, code }));
    } catch (e) {
        el.signinStatus.textContent = codeError(e.status, e.detail);
        return;
    } finally {
        el.signinCodeSend.disabled = false;
    }
    if (!made) {
        el.signinStatus.textContent = codeError(200, "the server gave no session");
        return;
    }
    el.signinStatus.textContent = "";
    el.signinCode.value = "";
    keepSession(made);
}

/**
 * A session made (by a link or a code): kept on the phone when he ticked Keep me signed in,
 * else for this tab, beside the accounts already there, and current (addAccount); then the
 * goods screen, checked and asked about as on any load (takeUp).
 */
function keepSession(made) {
    addAccount({ pc: DEFAULT_SERVER, session: made.session, user: made.user, remember: made.remember });
    // Admin's first open lands on Settings, Snap Account open (docs/UI.md: "Account after a new sign-in")
    freshSignin = true;
    takeUp();
}

/** Running from the home screen: the display mode an installed web app gets, or an iPhone's own flag. */
function standalone() {
    const view = globalThis.window;
    const query = view && typeof view.matchMedia === "function" ? view.matchMedia("(display-mode: standalone)") : null;
    return installed || !!(query && query.matches) || globalThis.navigator.standalone === true;
}

/** What navigator says of the device: its userAgent, platform and touch points. */
function device() {
    const nav = globalThis.navigator;
    return { userAgent: nav.userAgent, platform: nav.platform, maxTouchPoints: nav.maxTouchPoints };
}

/** An iPhone or iPad, told the Share taps (it never offers a prompt). */
function onIos() {
    return isIosDevice(device());
}

/**
 * The two install nudges (Michal, 2026-10-08: "If it is not on the home screen it should
 * direct towards that install"): the landing's Install step (never put away), and the
 * banner over the posting screens (`away` while they are not on screen; put away for a week).
 * Neither on a desktop browser (Michal, 2026-10-08).
 */
function renderInstall(away) {
    const ios = onIos();
    const base = { standalone: standalone(), hasPrompt: !!installPrompt, isIos: ios, desktop: isDesktopBrowser(device()), now: Date.now() };
    const steps = installSteps(ios);
    const onLanding = installState({ ...base, dismissedAt: "" });
    el.landingInstall.hidden = onLanding === "hidden";
    el.landingInstall.setAttribute("aria-expanded", stepsOpen.landing ? "true" : "false");
    el.landingInstallSteps.textContent = steps;
    el.landingInstallSteps.hidden = onLanding !== "steps" || !stepsOpen.landing;
    const kept = installDismissal(readText("localStorage", INSTALL_KEY));
    const banner = installAsking ? "asking" : installState({ ...base, dismissedAt: kept.dismissedAt, never: kept.never });
    el.installBanner.hidden = away || banner === "hidden";
    // the question in the banner's place while it asks
    for (const node of [el.installWords, el.installAdd, el.installDismiss]) node.hidden = installAsking;
    el.installAsk.hidden = !installAsking;
    el.installAdd.setAttribute("aria-expanded", stepsOpen.banner ? "true" : "false");
    el.installSteps.textContent = steps;
    el.installSteps.hidden = banner !== "steps" || !stepsOpen.banner;
    // This phone, under Settings: Install on the home screen, or that it is there already
    el.phoneInstall.hidden = onLanding === "hidden";
    el.phoneInstall.setAttribute("aria-expanded", stepsOpen.phone ? "true" : "false");
    el.phoneInstallSteps.textContent = steps;
    el.phoneInstallSteps.hidden = onLanding !== "steps" || !stepsOpen.phone;
    el.phoneInstalled.hidden = !base.standalone;
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

/** The banner's third close and on: it asks "Do not show this again?" in its own place. */
let installAsking = false;

/**
 * The banner's x: away for a day (INSTALL_SNOOZE_MS), counted from now; from the third
 * close (INSTALL_ASK_AT) it first asks whether to show it again at all (Michal, 2026-10-31).
 */
function dismissInstall() {
    const kept = installDismissal(readText("localStorage", INSTALL_KEY));
    if (kept.count + 1 >= INSTALL_ASK_AT) {
        installAsking = true;
        render();
        return;
    }
    putInstallAway(false);
}

/** The banner away: for a day, or (`never`) for good on this phone; the close counted. */
function putInstallAway(never) {
    const kept = installDismissal(readText("localStorage", INSTALL_KEY));
    writeText("localStorage", INSTALL_KEY, JSON.stringify({ at: new Date().toISOString(), count: kept.count + 1, never }));
    installAsking = false;
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
    // the key account in hand corrected, in its place; Add account, or a phone signed in by
    // email or with nothing, one more entry, current now
    const was = currentAccount();
    addAccount({ pc: s.pc, key: s.key }, !adding && was && was.key ? was.id : "");
    el.pcAddress.value = s.pc;
    const all = allAccounts();
    if (!accountKept(all.current)) {
        // nothing reaches the phone's storage: not an account to work with
        all.list = all.list.filter((a) => a.id !== all.current);
        all.current = all.list.length ? all.list[0].id : "";
        render();
        el.settingsStatus.textContent =
            "Could not save on this phone (private mode?). The buttons need it saved.";
        return;
    }
    el.settingsStatus.textContent = "Saved. Checking the server...";
    // new settings, maybe another account: /me, the address, the header and footer and the
    // people are asked afresh
    letGoAccount();
    renderAccounts();
    renderDelete();
    renderSettingsFolds();
    render();
    try {
        await checkPc(s);
        heard(200);
        el.settingsStatus.textContent = "Saved. The server answers and knows this key.";
        loadMe().catch(() => {});
        loadSettingsParts();
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
    // goods made with no name (2.15.0): no name, and the box shows the one typed for it since
    const unnamed = m === "goods" && saved.unnamed === true;
    const label = unnamed && typeof saved.label === "string" ? saved.label : "";
    const name = recordName(saved);
    const pc = settings();
    if (!pc || (!itemName && !unnamed)) {
        keepSaved[m] = true; // read it back once Settings are right and the page is reloaded
        return;
    }
    restoring[m] = true;
    if (m === "goods") el.itemInput.value = itemName || label;
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
                unnamed,
                serverName: saved.serverName,
                label,
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
            say(`${name} is no longer on the server.`, "warn");
            setState(m, freshState(m));
        } else {
            // leave the saved item alone: a reload once the PC answers brings it back
            keepSaved[m] = true;
            say(`Could not read ${name} back from the server (${e.message}). Its photos are safe there; reload when the server answers.`, "warn");
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
async function nextItem(m, { snapping = false } = {}) {
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
    if (m === "goods") fixDark = savedFixDark();
    setState(m, freshState(m));
    fillCustomize(m);
    // the walk is at the items in hand again, one place further when the list grew;
    // the other kind's screen leaves an earlier item it was showing
    pushTo(readHistory().length + 1);
    for (const k of MODES) if (viewing[k]) bringUp(k, null).catch(() => {});
    // a book starts with Scan, not the keyboard; Snap Next starts with the camera
    if (m === "goods" && !snapping) el.itemInput.focus();
}

/**
 * Snap Next (Michal, 2026-10-17: "After the item is posted the snap yellow button darkens;
 * that is ok. But rather it should say Snap Next."): NEXT and Snap in one tap. The label
 * still opens the camera itself, inside his tap as the phone requires; the tap starts NEXT,
 * and a photo back from the camera waits for it (`snapped`), so it starts the next item.
 */
const onward = { goods: null, book: null };

/** Snap Next opens while NEXT would. */
function onwardReady(m) {
    return doneButton(slots[m]).enabled && !restoring[m];
}

function onSnapTap(m) {
    if (snapWord(slots[m], { earlier: !!viewing[m] }) !== "Snap Next" || !onwardReady(m)) return;
    onward[m] = nextItem(m, { snapping: true }).catch(() => {});
}

/** Photos back from the camera: onto the item, once a Snap Next begun on the tap has started it. */
function snapped(m, files) {
    const take = (list) => {
        acceptFiles(m, list);
        if (m === "goods") snapUnderThumb();
    };
    const pending = onward[m];
    onward[m] = null;
    if (!pending) {
        take(files);
        return;
    }
    // the input is emptied as this returns: the files are kept for after the wait
    const kept = [...files];
    pending.then(() => take(kept));
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
    for (const p of slots[m].photos) letGo(p.id);
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
//
// Michal, 2026-10-17: "Swiping left on the app goes to the previous listing. But
// swiping right should go to the one I just came from (forward on browser). I
// thought this used to work. Seems now both direction swipes go backwards." Safari
// (since iOS 17.5) has its back and forward, the buttons and the edge swipes, skip
// an entry a page pushed with no tap or key in the ten seconds before, and the load
// pushed the whole walk before any tap: back from the items in hand fell through to
// the floor (the end said, the oldest item up) and forward found nothing to stop on.
// Chrome's back skips the like. So a fresh page makes the walk's entries on his first
// tap (mirrorWalk), NEXT's on its own tap, and a page never pushes one without a tap.

/** Entries for the places after the current one up to `at`, which becomes current. */
function pushTo(at) {
    for (let j = cursor + 1; j <= at; j += 1) globalThis.history.pushState({ snap: j }, "");
    cursor = at;
}

/** On load: the entries a reload left (their place); a fresh entry waits for his first tap (mirrorWalk). */
function startWalk() {
    const list = readHistory();
    const at = walkPosition(globalThis.history.state, list.length);
    if (at <= 0) return null;
    cursor = at;
    mirrored = true;
    return list[at - 1] || null;
}

/** On his first tap of a fresh page: the walk mirrored into the browser's entries, the items in hand current. */
function mirrorWalk() {
    if (mirrored) return;
    mirrored = true;
    globalThis.history.replaceState({ snap: 0 }, "");
    cursor = 0;
    pushTo(readHistory().length + 1);
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
        headerUser: $("header-user"),
        settingsBack: $("settings-back"),
        settingsToggle: $("settings-toggle"),
        settings: $("settings"),
        folds: Object.fromEntries(
            FOLDS.map(([key]) => [key, { toggle: $(`fold-${key}-toggle`), body: $(`fold-${key}`), tab: $(`settings-tab-${key}`) }])
        ),
        pcAddress: $("pc-address"),
        pcKey: $("pc-key"),
        settingsSave: $("settings-save"),
        settingsStatus: $("settings-status"),
        settingsSignout: $("settings-signout"),
        accounts: $("accounts"),
        accountsList: $("accounts-list"),
        accountsAdd: $("accounts-add"),
        settingsDelete: $("settings-delete"),
        accountLeave: $("account-leave"),
        deleteConfirm: $("delete-confirm"),
        deleteConfirmBtn: $("delete-confirm-btn"),
        deleteKeep: $("delete-keep"),
        deleteStatus: $("delete-status"),
        account: $("account"),
        accountUser: $("account-user"),
        accountKind: $("account-kind"),
        accountCredits: $("account-credits"),
        accountBuy: $("account-buy"),
        accountPacks: $("account-packs"),
        accountStatus: $("account-status"),
        accountSigninAgain: $("account-signin-again"),
        invite: $("invite"),
        inviteEmail: $("invite-email"),
        inviteSend: $("invite-send"),
        inviteStatus: $("invite-status"),
        accountPeople: $("account-people"),
        peopleCount: $("people-count"),
        people: $("people"),
        peopleBack: $("people-back"),
        peopleStatus: $("people-status"),
        peopleList: $("people-list"),
        peopleLeave: $("people-leave"),
        accountEbay: $("account-ebay"),
        accountConnect: $("account-connect"),
        accountReconnect: $("account-reconnect"),
        venues: $("venues"),
        venueCards: Object.fromEntries(
            VENUES.map((v) => [v, { tile: $(`venue-tile-${v}`), card: $(`venue-card-${v}`), status: $(`venue-card-${v}-status`), ships: $(`venue-card-${v}-ships`) }])
        ),
        venueBack: $("venue-back"),
        venuePage: $("venue-page"),
        venuePageHeading: $("venue-page-heading"),
        venuePolicySlot: $("venue-policy-slot"),
        signupPolicySlot: $("signup-policy-slot"),
        policyBlock: $("policy-block"),
        venueBlocks: Object.fromEntries(
            VENUES.map((v) => [
                v,
                {
                    block: $(`venue-${v}`),
                    status: v === "ebay" ? $("account-ebay") : $(`venue-${v}-status`),
                    ships: $(`venue-${v}-ships`),
                    note: v === "ebay" ? $("venue-ebay-note") : null,
                    ask: v === "ebay" ? null : $(`venue-${v}-ask`),
                    sync: $(`venue-${v}-sync`),
                    syncStatus: $(`sync-${v}-status`),
                    cannot: $(`venue-${v}-cannot`),
                    syncDrawn: false,
                },
            ])
        ),
        postingQuantity: $("posting-quantity"),
        postingPickupOnly: $("posting-pickup-only"),
        postingPricing: $("posting-pricing"),
        postingPricingWords: PRICING.map(({ grade }) => $(`posting-pricing-${grade}`)),
        postingPricingNote: $("posting-pricing-note"),
        postingAutoPost: $("posting-auto-post"),
        postingComps: $("posting-comps"),
        postingFixDark: $("posting-fix-dark"),
        postingStatus: $("posting-status"),
        phoneInstall: $("phone-install"),
        phoneInstallSteps: $("phone-install-steps"),
        phoneInstalled: $("phone-installed"),
        landing: $("landing"),
        landingBack: $("landing-back"),
        landingAccounts: $("landing-accounts"),
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
        signinHaveCode: $("signin-have-code"),
        signinCodeForm: $("signin-code-form"),
        signinCode: $("signin-code"),
        signinCodeSend: $("signin-code-send"),
        signinNote: $("signin-note"),
        signupSteps: $("signup-steps"),
        signupConnect: $("signup-connect"),
        signupStepAddress: $("signup-step-address"),
        signupAddressLine: $("signup-address-line"),
        signupAddressStatus: $("signup-address-status"),
        signupStepPolicies: $("signup-step-policies"),
        signupPolicyList: $("signup-policy-list"),
        policiesEdit: $("signup-policies-edit"),
        policyEditor: $("policy-editor"),
        policyService: $("policy-service"),
        policyCostType: $("policy-cost-type"),
        policyCostRow: $("policy-cost-row"),
        policyCost: $("policy-cost"),
        policyHandling: $("policy-handling"),
        policyReturns: $("policy-returns"),
        policyPayerRow: $("policy-payer-row"),
        policyPayer: $("policy-payer"),
        policyPickup: $("policy-pickup"),
        policyBestOffer: $("policy-best-offer"),
        policyBestOfferTip: $("policy-best-offer-tip"),
        policySave: $("policy-save"),
        policiesOk: $("signup-policies-ok"),
        policyNames: $("policy-names"),
        policyShipList: $("policy-ship-list"),
        policyShipNote: $("policy-ship-note"),
        policyShipAdd: $("policy-ship-add"),
        policyStatus: $("policy-status"),
        signupAddress: $("signup-address"),
        signupAddressWord: $("signup-address-word"),
        signupStatus: $("signup-status"),
        seller: $("seller"),
        sellerNote: $("seller-note"),
        addressSame: $("address-same"),
        addressShared: $("address-shared"),
        addressVenues: $("address-venues"),
        sellerLine: $("seller-line"),
        sellerPolicies: $("seller-policies"),
        sellerPolicyList: $("seller-policy-list"),
        sellerSave: $("seller-save"),
        sellerStatus: $("seller-status"),
        wrap: $("wrap"),
        wrapRow: $("wrap-row"),
        wrapOn: $("wrap-on"),
        wrapWhy: $("wrap-why"),
        wrapParts: Object.fromEntries(WRAP_PARTS.map((part) => [part, { text: $(`wrap-${part}-text`), venues: $(`wrap-${part}-venues`) }])),
        wrapSave: $("wrap-save"),
        wrapApply: $("wrap-apply"),
        wrapStatus: $("wrap-status"),
        wrapJobs: $("wrap-jobs"),
        aboutLink: $("about-link"),
        installBanner: $("install-banner"),
        installAdd: $("install-add"),
        installDismiss: $("install-dismiss"),
        installWords: $("install-words"),
        installAsk: $("install-ask"),
        installNever: $("install-never"),
        installLater: $("install-later"),
        installSteps: $("install-steps"),
        feedbackToggle: $("feedback-toggle"),
        feedback: $("feedback"),
        feedbackInbox: $("feedback-inbox"),
        feedbackText: $("feedback-text"),
        feedbackBox: $("feedback-box"),
        feedbackMine: $("feedback-mine"),
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
        searchToggle: $("search-toggle"),
        searchPanel: $("search-panel"),
        options: $("options"),
        inventoryVenues: INVENTORY_VENUES.map((value) => ({ value, node: $(`inventory-venue-${value || "all"}`) })),
        inventoryStates: INVENTORY_STATUSES.map((value) => ({ value, node: $(`inventory-state-${value || "all"}`) })),
        inventoryPhotos: $("inventory-photos"),
        inventorySorts: INVENTORY_SORTS.map(({ key }) => ({ value: key, node: $(`inventory-sort-${key}`) })),
        inventoryList: $("inventory-list"),
        inventoryUndo: $("inventory-undo"),
        inventoryUndoText: $("inventory-undo-text"),
        inventoryUndoBtn: $("inventory-undo-btn"),
        inventoryEndBtn: $("inventory-end-btn"),
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
        detailCustomizeActions: $("detail-customize-actions"),
        detailCustomizeSave: $("detail-customize-save"),
        detailCustomizeStatus: $("detail-customize-status"),
        detailFolds: Object.fromEntries(
            VENUES.map((v) => [v, { toggle: $(`detail-${v}-toggle`), card: $(`detail-${v}`) }])
        ),
        photoView: $("photo-view"),
        photoViewImg: $("photo-view-img"),
        photoViewClose: $("photo-view-close"),
        server: $("server"),
        modes: $("modes"),
        modeGoods: $("mode-goods"),
        modeBook: $("mode-book"),
        booksOff: $("books-off"),
        booksAsk: $("books-ask"),
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
        poshmarkBtn: $("poshmark-btn"),
        poshmarkReset: $("poshmark-reset"),
        poshmarkStatus: $("poshmark-status"),
        poshmarkBuy: $("poshmark-buy"),
        poshmarkLink: $("poshmark-link"),
        customizeToggle: $("customize-toggle"),
        customize: $("customize"),
        quantity: $("quantity"),
        pickupOnly: $("pickup-only"),
        pricing: $("pricing"),
        pricingWords: PRICING.map(({ grade }) => $(`pricing-${grade}`)),
        pricingNote: $("pricing-note"),
        autoPost: $("auto-post"),
        comps: $("comps"),
        fixDark: $("fix-dark"),
        customizeSaveDefault: $("customize-save-default"),
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
        bookSnapText: $("book-snap-word"),
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
    for (const m of MODES) fillCustomize(m);
    fixDark = savedFixDark();
    readFolds();
    render();

    renderServer();
    renderExtras();
    renderAccount();
    renderPosting();
    // what Snap sets up on her eBay, listed under the address boxes and as Finish setting up's
    // step 3 (2026-10-31): fixed, so written once
    for (const list of [el.sellerPolicyList]) {
        list.replaceChildren(
            ...POLICY_LINES.map((line) => {
                const li = document.createElement("li");
                li.textContent = line;
                return li;
            })
        );
    }

    // the way in: the landing's Sign in, key and Install, the sign-in screen, the banner's Add and x
    // I have a key: Admin, which opens on Settings while none are saved
    el.landingKey.addEventListener("click", () => showAdmin(true));
    el.landingSignin.addEventListener("click", () => showSignin(true));
    // Add account's Back, and Switch account to Settings' list (Michal, 2026-10-18); no help
    // line under the buttons since 2026-10-31 (a phone has no hover: it only flashed)
    el.landingBack.addEventListener("click", stopAdding);
    el.landingAccounts.addEventListener("click", () => showAdmin(true));
    el.signinBack.addEventListener("click", () => showSignin(false));
    el.signinSend.addEventListener("click", () => {
        sendLink().catch(() => {});
    });
    el.signinEmail.addEventListener("keydown", (e) => {
        if (e.key === "Enter") sendLink().catch(() => {});
    });
    // the mail's code: I already have a code opens its box; Sign in with the code, or Enter
    el.signinHaveCode.addEventListener("click", openCode);
    el.signinCodeSend.addEventListener("click", () => {
        sendCode().catch(() => {});
    });
    el.signinCode.addEventListener("keydown", (e) => {
        if (e.key === "Enter") sendCode().catch(() => {});
    });
    el.landingInstall.addEventListener("click", () => {
        onInstall("landing").catch(() => {});
    });
    el.installAdd.addEventListener("click", () => {
        onInstall("banner").catch(() => {});
    });
    el.installDismiss.addEventListener("click", dismissInstall);
    el.installNever.addEventListener("click", () => putInstallAway(true));
    el.installLater.addEventListener("click", () => putInstallAway(false));
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
    el.accountSigninAgain.addEventListener("click", () => startAdding(true));
    // the accounts on this phone (Michal, 2026-10-18): Add account, and Delete account with
    // its confirmation view; Leave this account for a member (2026-10-25)
    el.accountsAdd.addEventListener("click", () => startAdding(false));
    el.settingsDelete.addEventListener("click", () => {
        if (deleting.open) keepAccount();
        else openDelete();
    });
    el.deleteConfirmBtn.addEventListener("click", () => {
        confirmDelete().catch(() => {});
    });
    el.deleteKeep.addEventListener("click", keepAccount);
    for (const node of [el.accountLeave, el.peopleLeave]) {
        node.addEventListener("click", () => {
            leaveThisAccount().catch(() => {});
        });
    }
    // the people on this account: the invite box, the People page and its way back
    el.inviteSend.addEventListener("click", () => {
        invite().catch(() => {});
    });
    el.inviteEmail.addEventListener("keydown", (e) => {
        if (e.key === "Enter") invite().catch(() => {});
    });
    el.accountPeople.addEventListener("click", () => showPeople(true));
    el.peopleBack.addEventListener("click", () => showPeople(false));
    // Settings' five folds: a tap opens or closes one, remembered on this phone
    for (const [key] of FOLDS) {
        el.folds[key].toggle.addEventListener("click", () => toggleFold(key));
        el.folds[key].tab.addEventListener("click", () => toggleFold(key));
    }
    // the account card: Buy postings unfolds the packs (each pill a checkout)
    el.accountBuy.addEventListener("click", () => {
        account.packs = !account.packs;
        // no packs offered (payments not set up on the server): said, nothing to unfold
        const none = !me || !me.packs.length;
        if (none) account.status = account.packs ? accountError("pay", 404, "") : "";
        renderAccount();
    });
    // the eBay block: Connect eBay, and, connected, Reconnect: eBay's consent again (a token
    // eBay let lapse)
    for (const node of [el.accountConnect, el.accountReconnect]) {
        node.addEventListener("click", () => {
            connectEbay().catch(() => {});
        });
    }

    // a venue's card: its own page; Back: the Venues part again (Michal, 2026-10-31)
    for (const venue of VENUES) el.venueCards[venue].card.addEventListener("click", () => showVenue(venue));
    el.venueBack.addEventListener("click", () => showVenue(""));
    // a venue the account lacks: Ask for it in Feedback opens the Feedback fold
    for (const venue of VENUES) {
        const ask = el.venueBlocks[venue].ask;
        if (ask) {
            ask.addEventListener("click", () => {
                extras.feedback = true;
                renderExtras();
                if (typeof el.feedback.scrollIntoView === "function") el.feedback.scrollIntoView({ block: "start" });
            });
        }
    }
    // the address: Same address for every venue, and Save address
    el.addressSame.addEventListener("change", () => setSameAddress(el.addressSame.checked));
    el.sellerSave.addEventListener("click", () => {
        saveSeller().catch(() => {});
    });
    // the Posting defaults: every box saved as it changes
    for (const node of [el.postingPickupOnly, el.postingAutoPost, el.postingComps, el.postingFixDark]) node.addEventListener("change", savePostingDefaults);
    for (const node of [el.postingQuantity, el.postingPricing]) node.addEventListener("input", savePostingDefaults);
    // This phone: Install on the home screen, as the landing's
    el.phoneInstall.addEventListener("click", () => {
        onInstall("phone").catch(() => {});
    });
    // the header and the footer: Add standard text to posts, each part's box, the two buttons
    // (the venue chips are drawn per venue /me/wrap offers, with their own listeners)
    el.wrapOn.addEventListener("change", () => {
        setWrapOpen(el.wrapOn.checked).catch(() => {});
    });
    for (const part of WRAP_PARTS) el.wrapParts[part].text.addEventListener("input", () => onWrapInput(/** @type {"header"|"footer"} */ (part)));
    el.wrapSave.addEventListener("click", () => {
        saveWrap().catch(() => {});
    });
    el.wrapApply.addEventListener("click", () => {
        applyWrapAll().catch(() => {});
    });
    renderWrap();
    // a venue button refused for want of postings: its Buy postings opens the account card
    for (const node of [el.ebayBuy, el.craigslistBuy, el.poshmarkBuy, el.bookEbayBuy]) node.addEventListener("click", () => openAccount(true));
    // See in inventory: Admin on the listing the item became, as its row's tap opens it
    for (const [m, node] of [["goods", el.seeInventory], ["book", el.bookSeeInventory]]) {
        node.addEventListener("click", () => {
            const sku = inventorySku(slots[m]);
            if (sku) showAdmin(true, sku);
        });
    }
    // Finish setting up: Connect eBay, as the eBay block's; then the address, at the end of Venues
    // step 3's Edit, its menus and Save (Michal, 2026-10-31)
    el.policiesEdit.addEventListener("click", editPolicies);
    el.policiesOk.addEventListener("click", () => {
        confirmPoliciesNow().catch(() => {});
    });
    el.policyShipAdd.addEventListener("click", addShipRow);
    el.policySave.addEventListener("click", () => {
        savePolicies().catch(() => {});
    });
    el.policyService.addEventListener("change", () => {
        if (policies.draft) policies.draft.shipping_service = el.policyService.value;
    });
    el.policyCost.addEventListener("input", () => {
        if (policies.draft) policies.draft.shipping_cost = el.policyCost.value.trim() || null;
    });
    el.policyPickup.addEventListener("change", () => {
        if (policies.draft) policies.draft.local_pickup = el.policyPickup.checked;
    });
    el.policyBestOffer.addEventListener("change", () => {
        if (policies.draft) policies.draft.best_offer = el.policyBestOffer.checked;
        el.policyBestOfferTip.hidden = !el.policyBestOffer.checked;
    });
    el.signupConnect.addEventListener("click", () => {
        connectEbay().catch(() => {});
    });
    el.signupAddress.addEventListener("click", () => {
        saveSignupAddress().catch(() => {});
    });
    el.signupAddressLine.addEventListener("input", () => {
        signupAddressDirty = true;
        seller.status = "";
        renderSignup();
    });
    el.signupAddressLine.addEventListener("keydown", (e) => {
        if (e.key === "Enter") saveSignupAddress().catch(() => {});
    });
    el.feedbackToggle.addEventListener("click", () => {
        extras.feedback = !extras.feedback;
        renderExtras();
        // an admin's inbox, asked afresh as it opens; anyone's own, and their Reviewed marks seen
        if (extras.feedback) {
            loadInbox().catch(() => {});
            loadMine().catch(() => {});
        }
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
    // each Quantity's − and +: the box changed as if typed (Michal, 2026-10-31)
    for (const id of ["quantity", "detail-quantity", "posting-quantity", "book-quantity"]) {
        const box = $(id);
        for (const [side, by] of /** @type {[string, number][]} */ ([["less", -1], ["more", 1]])) {
            $(`${id}-${side}`).addEventListener("click", () => {
                if (box.disabled) return;
                box.value = stepQuantity(box.value, by);
                box.dispatchEvent(new Event("input", { bubbles: true }));
            });
        }
    }
    el.settingsToggle.addEventListener("click", toggleSettings);
    el.settingsBack.addEventListener("click", () => showAdmin(false));
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
    el.searchToggle.addEventListener("click", toggleSearch);
    // a finger lifted anywhere ends a dial too: its button may have been redrawn under it; and
    // a swipe its row did not hear end (no pointer capture) slides back
    for (const type of ["pointerup", "pointercancel"]) {
        window.addEventListener(type, () => {
            if (dial) endDial(dial.sku);
            dropSwipe();
        });
    }
    el.inventoryEndBtn.addEventListener("click", () => {
        endArchived().catch(() => {});
    });
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
    for (const [venue, { toggle, card }] of Object.entries(el.detailFolds)) {
        toggle.addEventListener("click", () => {
            admin.folds[venue] = card.hidden;
            renderFolds();
        });
    }
    renderSync();
    // the full-size photo: Close, or a tap anywhere on it, or Escape on a keyboard
    el.photoView.addEventListener("click", closePhoto);
    el.photoViewClose.addEventListener("click", closePhoto);
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closePhoto();
    });
    el.modeGoods.addEventListener("click", () => setMode("goods"));
    el.modeBook.addEventListener("click", () => setMode("book"));
    el.booksAsk.addEventListener("click", askForBooks);

    el.itemInput.addEventListener("input", onItemNameChanged);
    // Fix dark photos: for every photo taken from now on (Michal, 2026-10-08: "Some of mine are quite dark.")
    el.fixDark.addEventListener("change", () => {
        fixDark = el.fixDark.checked;
    });
    el.customizeSaveDefault.addEventListener("click", saveCustomizeAsDefault);
    el.note.addEventListener("input", () => onNoteInput("goods"));
    el.note.addEventListener("blur", () => noteDue("goods"));
    el.snapLabel.addEventListener("click", () => onSnapTap("goods"));
    el.snapInput.addEventListener("change", onFiles((files) => snapped("goods", files)));
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
    el.bookSnapLabel.addEventListener("click", () => onSnapTap("book"));
    el.bookSnapInput.addEventListener("change", onFiles((files) => snapped("book", files)));
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
    // ahead of the tap's own handler (NEXT pushes on from there); a key on a button clicks it too
    window.addEventListener("click", mirrorWalk, { capture: true });

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
