// tests/core.test.js -- names, settings, the shrink size and the page state.
// Pure: no DOM, no network.

import test from "node:test";
import assert from "node:assert/strict";

import {
    buildFileName,
    checkSettings,
    cleanItemName,
    currentCount,
    doneButton,
    fitWithin,
    highestNumber,
    initialState,
    JPEG_QUALITY,
    leaveWarning,
    MAX_EDGE,
    MAX_ITEM_NAME,
    MAX_PHOTOS,
    nameWasChanged,
    nextNumber,
    noteStatusText,
    photosLocked,
    progressLine,
    reduce,
    raiseCount,
    savedItem,
    SETTINGS_HINT,
    statusBarColors,
    THEMES,
    themeAttr,
    themeOf,
    venueButton,
    bookForm,
    ISBN_WAIT_HINT,
    jobRequest,
    lookupKey,
    NO_BOOK_HINT,
    TITLE_WAIT_HINT,
    ISBN_MISS_HINT,
    customizeBody,
    customizeOf,
    initialCustomize,
    PICKUP_NOTE,
    PRICING,
    DEFAULT_PRICING,
    pricingGrade,
    pricingOf,
    SAVED_NOT_POSTED,
    savedNotPosted,
    QUANTITY_HINT,
    quantityValue,
    venueIdleNote,
    venueLine,
    priceLine,
    venueLabel,
    itemIdFor,
    nameTakenHint,
    NAME_CHECK_MS,
    snapScrollTop,
    snapWord,
    SNAP_SPOT,
    cancelButton,
    CANCELLED,
    SEND_DELAY_MS,
    STOPPING_STEP,
    titleLine,
    remembered,
    refreshed,
    historyList,
    recordKind,
    walkPosition,
    walkNote,
    presentNote,
    HISTORY_LIMIT,
    HISTORY_END,
    nextNote,
    NEXT_NOTE,
    idleJob,
    DERIVED,
    CATEGORY_FROM_EBAY,
    derivedFields,
    INVENTORY_DEBOUNCE_MS,
    INVENTORY_LIMIT,
    INVENTORY_SORTS,
    INVENTORY_STATUSES,
    INVENTORY_VENUES,
    inventoryCount,
    inventoryQuery,
    inventoryRows,
    sortQuery,
    venueStatusLine,
    venueActions,
    actionWord,
    endQuestion,
    actionJob,
    jobRunning,
    syncLine,
    cardLine,
    EDIT_FIELDS,
    editValues,
    changedFields,
    patchBody,
    EDIT_QUANTITY_HINT,
    NOT_GRADED,
    NO_CACHED,
    PUSH_CLOSED,
    cachedPrices,
    canPush,
    customizeButtons,
    customizeChanges,
    customizeLine,
    customizeSaved,
    followRow,
    rowCustomize,
    sliderWords,
    listedAtWord,
    namedLines,
    packageWord,
    priceWord,
    rowBadges,
    rowHeading,
    rowPhotos,
    rowTitle,
    rowVenues,
    statusBadge,
    venueFacts,
    venueStatus,
} from "../core.js";
import {
    bookCard,
    bookPriceValue,
    bookSearch,
    bookYear,
    CONDITIONS,
    DEFAULT_CONDITION,
    DEFAULT_FORMAT,
    FORMATS,
    formatOf,
    ISBN_MISS,
    isbnKept,
    LISTED_AS_TYPED,
    MATCHED,
    money,
    normalizeIsbn,
    priceNote,
    scanHint,
    SEARCH_DEBOUNCE_MS,
} from "../book.js";

// --- cleanItemName ---------------------------------------------------------

test("cleanItemName keeps an already clean name", () => {
    assert.equal(cleanItemName("Blue Levi jacket"), "Blue Levi jacket");
});

test("cleanItemName strips characters Windows forbids in a file name", () => {
    assert.equal(cleanItemName('Le:vi"s <501> / 32*34 ? | \\ jeans'), "Levis 501 3234 jeans");
});

test("cleanItemName collapses whitespace and trims spaces and dots", () => {
    assert.equal(cleanItemName("  ..Nike   Air\tMax.. "), "Nike Air Max");
});

test("cleanItemName removes control characters", () => {
    assert.equal(cleanItemName("tab\there\u0000"), "tab here");
});

test("cleanItemName caps at 60 characters and trims the cut edge", () => {
    assert.equal(cleanItemName("x".repeat(70)).length, MAX_ITEM_NAME);
    assert.equal(cleanItemName("y".repeat(59) + " zzz"), "y".repeat(59));
});

test("cleanItemName handles junk input", () => {
    for (const junk of ["", "   ", "///", null, undefined, 42]) {
        assert.equal(cleanItemName(junk), "");
    }
});

test("nameWasChanged only fires when cleaning changed something", () => {
    assert.equal(nameWasChanged("Blue jacket"), false);
    assert.equal(nameWasChanged("Blue/jacket"), true);
    assert.equal(nameWasChanged(""), false);
});

test("buildFileName numbers photos from 1, always .jpg (they are sent as JPEG)", () => {
    assert.equal(buildFileName("Blue jacket", 1), "Blue jacket-1.jpg");
    assert.equal(buildFileName("Blue jacket", 12), "Blue jacket-12.jpg");
});

test("nextNumber continues the numbering for the same item", () => {
    let counters = {};
    let n;
    ({ n, counters } = nextNumber(counters, "Boots"));
    assert.equal(n, 1);
    ({ n, counters } = nextNumber(counters, "Boots"));
    assert.equal(n, 2);
    ({ n, counters } = nextNumber(counters, "Jacket"));
    assert.equal(n, 1);
    assert.deepEqual(counters, { Boots: 2, Jacket: 1 });
});

test("nextNumber survives missing or broken counters", () => {
    assert.equal(nextNumber(undefined, "Boots").n, 1);
    assert.equal(nextNumber({ Boots: "seven" }, "Boots").n, 1);
    assert.equal(currentCount(null, "Boots"), 0);
});

// --- settings ----------------------------------------------------------------

const KEY = "k3y-0f-at-least-16";

test("a Tailscale address and a key are accepted, trimmed, as the bare origin", () => {
    assert.deepEqual(checkSettings("  https://pc.tail1234.ts.net/ ", ` ${KEY} `), {
        ok: true,
        pc: "https://pc.tail1234.ts.net",
        key: KEY,
    });
    assert.equal(checkSettings("HTTPS://PC.Tail1234.TS.NET", KEY).pc, "https://pc.tail1234.ts.net");
});

test("the service on the PC itself is accepted over plain http", () => {
    assert.equal(checkSettings("http://127.0.0.1:8765", KEY).pc, "http://127.0.0.1:8765");
    assert.equal(checkSettings("http://localhost:8765/", KEY).pc, "http://localhost:8765");
});

test("anything but https to a ts.net host is refused, with the reason", () => {
    const cases = [
        ["", /Enter the PC address/],
        ["pc.tail1234.ts.net", /not a web address/],
        ["http://pc.tail1234.ts.net", /https/],
        ["ftp://pc.tail1234.ts.net", /https/],
        ["https://example.com", /Tailscale/],
        ["https://evil.ts.net.example.com", /Tailscale/],
        ["https://pc.tail1234.ts.net/jobs", /address only/],
        ["https://pc.tail1234.ts.net/?x=1", /address only/],
        ["https://me:pw@pc.tail1234.ts.net", /address only/],
    ];
    for (const [pc, why] of cases) {
        const s = checkSettings(pc, KEY);
        assert.equal(s.ok, false, pc);
        assert.match(s.error, why, pc);
    }
});

test("the key must be there and be one plain word", () => {
    const pc = "https://pc.tail1234.ts.net";
    assert.match(checkSettings(pc, "").error, /Enter the key/);
    assert.match(checkSettings(pc, "   ").error, /Enter the key/);
    assert.match(checkSettings(pc, "two words").error, /unusual/);
    assert.match(checkSettings(pc, "klíč").error, /unusual/);
    assert.equal(checkSettings(pc, undefined).ok, false);
    assert.equal(checkSettings(undefined, KEY).ok, false);
});

// --- the look (Michal, 2026-10-06: "Dark, light or sync with device") ----------

test("themeOf keeps dark and light and makes anything else the device's", () => {
    assert.equal(themeOf("dark"), "dark");
    assert.equal(themeOf("light"), "light");
    assert.equal(themeOf("device"), "device");
    for (const odd of ["", "Dark", " light", "auto", null, undefined, 1]) assert.equal(themeOf(odd), "device", String(odd));
    assert.deepEqual(
        THEMES.map((t) => [t.value, t.label]),
        [
            ["dark", "Dark"],
            ["light", "Light"],
            ["device", "Sync with device"],
        ]
    );
});

test("themeAttr is the data-theme value, empty for the device's look", () => {
    assert.equal(themeAttr("dark"), "dark");
    assert.equal(themeAttr("light"), "light");
    assert.equal(themeAttr("device"), "");
    assert.equal(themeAttr("sepia"), "");
    assert.equal(themeAttr(undefined), "");
});

test("statusBarColors puts a chosen look's ground on both metas and leaves the device's as given", () => {
    const grounds = { light: "#FFFC00", dark: "#0B0B0B" };
    assert.deepEqual(statusBarColors("dark", grounds), { light: "#0B0B0B", dark: "#0B0B0B" });
    assert.deepEqual(statusBarColors("light", grounds), { light: "#FFFC00", dark: "#FFFC00" });
    assert.deepEqual(statusBarColors("device", grounds), grounds);
    assert.notEqual(statusBarColors("device", grounds), grounds, "a copy, not the caller's object");
    assert.deepEqual(statusBarColors("", grounds), grounds);
});

// --- the shrink size -----------------------------------------------------------

test("fitWithin brings the long edge down to 2000 and keeps the shape", () => {
    assert.equal(MAX_EDGE, 2000);
    assert.equal(JPEG_QUALITY, 0.85);
    assert.deepEqual(fitWithin(4000, 3000), { width: 2000, height: 1500 });
    assert.deepEqual(fitWithin(3000, 4000), { width: 1500, height: 2000 });
    assert.deepEqual(fitWithin(4032, 3024), { width: 2000, height: 1500 });
    assert.deepEqual(fitWithin(4080, 3072), { width: 2000, height: 1506 });
    assert.deepEqual(fitWithin(5000, 5000), { width: 2000, height: 2000 });
});

test("fitWithin never enlarges and never returns a zero side", () => {
    assert.deepEqual(fitWithin(1200, 900), { width: 1200, height: 900 });
    assert.deepEqual(fitWithin(2000, 1000), { width: 2000, height: 1000 });
    assert.deepEqual(fitWithin(40000, 3), { width: 2000, height: 1 });
    assert.deepEqual(fitWithin(300, 200, 100), { width: 100, height: 67 });
});

test("fitWithin refuses nonsense sizes", () => {
    assert.throws(() => fitWithin(0, 10), RangeError);
    assert.throws(() => fitWithin(10, -1), RangeError);
    assert.throws(() => fitWithin(10.5, 10), RangeError);
    assert.throws(() => fitWithin(10, 10, 0), RangeError);
});

// --- photos and the AI mark ------------------------------------------------------

const ITEM = "Boots 2026-09-24";

function withPhotos(n, marked = []) {
    let s = initialState("Boots");
    for (let i = 1; i <= n; i += 1) {
        s = reduce(s, { type: "add", id: `p${i}`, name: `Boots-${i}.jpg`, n: i });
    }
    for (const i of marked) s = reduce(s, { type: "toggleAi", id: `p${i}` });
    return s;
}

/** As withPhotos, with the item made on the PC and every photo sent there. */
function sent(n, marked = []) {
    let s = withPhotos(n, marked);
    const item = { kind: "item", name: "Boots" };
    s = reduce(s, { type: "taskStart", task: item });
    s = reduce(s, { type: "taskDone", task: item, answer: { item: ITEM, photos: [] } });
    for (const p of s.photos) {
        const task = { kind: "photo", id: p.id, n: p.n };
        s = reduce(s, { type: "taskStart", task });
        s = reduce(s, { type: "taskDone", task, answer: {} });
    }
    return s;
}

test("a new photo is not marked for the AI and waits for the upload queue", () => {
    const s = withPhotos(1);
    assert.equal(s.photos[0].ai, false);
    assert.equal(s.photos[0].status, "waiting");
    assert.equal(s.photos[0].tried, false);
});

test("the AI mark toggles, one photo at a time, without touching the old state", () => {
    const before = withPhotos(2);
    const after = reduce(before, { type: "toggleAi", id: "p2" });
    assert.deepEqual(after.photos.map((p) => p.ai), [false, true]);
    assert.equal(before.photos[1].ai, false);
    assert.equal(reduce(after, { type: "toggleAi", id: "p2" }).photos[1].ai, false);
    assert.equal(reduce(after, { type: "toggleAi", id: "nope" }), after);
});

test("the x takes a photo out of the list; an unknown id changes nothing", () => {
    const s = reduce(withPhotos(3), { type: "remove", id: "p2" });
    assert.deepEqual(s.photos.map((p) => p.id), ["p1", "p3"]);
    assert.deepEqual(s.deletes, [], "it never left the page, so nothing to delete on the PC");
    assert.equal(reduce(s, { type: "remove", id: "nope" }), s);
    const there = reduce(sent(3), { type: "remove", id: "p2" });
    assert.deepEqual(there.deletes, [2], "a sent photo is deleted on the PC too");
});

test("progressLine counts the photos, the ones for the AI and the ones on the PC", () => {
    assert.equal(progressLine(initialState("It")), "No photos yet.");
    assert.equal(progressLine(withPhotos(1)), "1 photo, 0 for the AI, 0 on the PC");
    assert.equal(progressLine(withPhotos(4, [1, 3])), "4 photos, 2 for the AI, 0 on the PC");
    assert.equal(progressLine(sent(4, [1])), "4 photos, 1 for the AI, all on the PC");
});

test("DONE resets the item but keeps knowing whether the phone is online", () => {
    let s = reduce(sent(2, [1]), { type: "online", online: false });
    s = reduce(s, { type: "noteText", text: "scuffed" });
    s = reduce(s, { type: "reset" });
    assert.deepEqual(s.photos, []);
    assert.equal(s.itemName, "");
    assert.equal(s.itemId, "");
    assert.equal(s.note.text, "");
    assert.equal(s.sku, "");
    assert.equal(s.jobs.ebay.phase, "idle");
    assert.equal(s.online, false);
});

// --- when the buttons can be pressed -----------------------------------------------

test("without settings neither venue button works, and the hint says why", () => {
    const s = sent(2, [1]);
    for (const venue of ["ebay", "craigslist"]) {
        assert.deepEqual(venueButton(s, venue, false), { enabled: false, hint: SETTINGS_HINT });
    }
    assert.equal(SETTINGS_HINT, "Set the PC address and key in Admin");
});

test("a new item needs a photo, at most 24, and at least one AI mark", () => {
    assert.match(venueButton(initialState("x"), "ebay", true).hint, /Snap a photo/);
    assert.match(venueButton(sent(2), "ebay", true).hint, /Mark at least one photo AI/);
    assert.equal(venueButton(sent(2), "ebay", true).enabled, false);
    assert.deepEqual(venueButton(sent(2, [2]), "ebay", true), { enabled: true, hint: "" });
    const many = sent(MAX_PHOTOS + 2, [1]);
    assert.equal(venueButton(many, "ebay", true).enabled, false);
    assert.match(venueButton(many, "ebay", true).hint, /At most 24 photos - delete 2/);
    assert.equal(venueButton(sent(MAX_PHOTOS, [1]), "ebay", true).enabled, true);
});

test("NEXT needs a photo and does not wait for a listing the PC has taken", () => {
    // Michal, 2026-09-28: "I want to be able to click NEXT as the things are
    // loading/posting so I can start working on the following item"
    assert.equal(doneButton(initialState("x")).enabled, false);
    const s = sent(1, [1]);
    assert.deepEqual(doneButton(s), { enabled: true, hint: "" });
    assert.equal(nextNote(s), "");
    const accepted = reduce(s, { type: "jobAccepted", venue: "ebay", job: "j1", ahead: 0 });
    const running = reduce(accepted, { type: "jobStatus", venue: "ebay", status: { state: "running", step: "drafting" } });
    const done = reduce(running, { type: "jobStatus", venue: "ebay", status: { state: "done", sku: "B-1" } });
    for (const [what, state, note] of [
        ["queued", accepted, NEXT_NOTE],
        ["running", running, NEXT_NOTE],
        ["done", done, ""],
        ["refused", reduce(s, { type: "jobRefused", venue: "ebay", error: "cannot reach the PC" }), ""],
    ]) {
        assert.deepEqual(doneButton(state), { enabled: true, hint: "" }, what);
        assert.equal(nextNote(state), note, what);
    }
    assert.equal(
        NEXT_NOTE,
        "A listing is still posting on the PC; NEXT starts the next item without waiting for its link"
    );
    // only the moment the press is on its way, not yet the PC's: clearing would lose it
    const sending = reduce(s, { type: "jobSending", venue: "ebay", step: "sending" });
    assert.deepEqual(doneButton(sending), { enabled: false, hint: "NEXT waits until the listing has reached the PC" });
    // the second button pressed while the first still runs: the same
    const second = reduce(reduce(running, { type: "jobStatus", venue: "ebay", status: { state: "running", sku: "B-1" } }), {
        type: "jobSending",
        venue: "craigslist",
        step: "sending",
    });
    assert.equal(doneButton(second).enabled, false);
    const both = reduce(second, { type: "jobAccepted", venue: "craigslist", job: "j2", ahead: 0 });
    assert.equal(doneButton(both).enabled, true);
    assert.equal(nextNote(both), NEXT_NOTE);
});

// --- the price line above the venue buttons -----------------------------------------

test("priceLine: nothing before the press, '$14' once the PC has saved the row, for both buttons", () => {
    // Michal, 2026-09-28: "When posting, I want to see the price designated"; 2026-09-30:
    // "show the chosen price for the item above the buttons instead of replacing button text"
    let s = sent(1, [1]);
    assert.equal(priceLine(s), "", "before the press");
    assert.equal(venueLabel(s.jobs.ebay, "ebay"), "ebay");
    s = reduce(s, { type: "jobSending", venue: "ebay", step: "sending" });
    assert.equal(priceLine(s), "", "no price known yet");
    assert.equal(venueLabel(s.jobs.ebay, "ebay"), "ebay, posting");
    s = reduce(s, { type: "jobAccepted", venue: "ebay", job: "j1", ahead: 1 });
    s = reduce(s, { type: "jobStatus", venue: "ebay", status: { state: "queued", ahead: 1, price: "" } });
    assert.equal(priceLine(s), "", "blank before the row is saved");
    s = reduce(s, { type: "jobStatus", venue: "ebay", status: { state: "running", sku: "B-1", price: "14.00" } });
    assert.equal(s.jobs.ebay.price, "14.00");
    assert.equal(priceLine(s), "$14", "whole dollars without cents");
    // a later answer without it does not unsay it
    s = reduce(s, { type: "jobStatus", venue: "ebay", status: { state: "running", step: "publishing" } });
    assert.equal(priceLine(s), "$14");
    s = reduce(s, { type: "jobStatus", venue: "ebay", status: { state: "done", price: "14.00" } });
    assert.equal(priceLine(s), "$14");
    assert.equal(venueLabel(s.jobs.ebay, "ebay"), "ebay, posted");
    // the other button's word is the venue throughout; the line is the row's, so it serves it too
    assert.equal(venueLabel(s.jobs.craigslist, "craigslist"), "craigslist");
    s = reduce(s, { type: "jobAccepted", venue: "craigslist", job: "j2", ahead: 0 });
    assert.equal(priceLine(s), "$14", "the ebay job's price, while craigslist has not said one");
    s = reduce(s, { type: "jobStatus", venue: "craigslist", status: { state: "done", price: "14.00" } });
    assert.equal(priceLine(s), "$14");
    assert.equal(venueLabel(s.jobs.craigslist, "craigslist"), "craigslist, posted");
});

test("priceLine: cents when the price has them; gone after a failure; a fallback price stands in", () => {
    const job = (phase, price = "") => ({ ...idleJob(), phase, price });
    const withJob = (venue, j) => ({ ...sent(1, [1]), jobs: { ...sent(1, [1]).jobs, [venue]: j } });
    assert.equal(priceLine(withJob("ebay", job("running", "14.50"))), "$14.50");
    assert.equal(priceLine(withJob("craigslist", job("done", "7.5"))), "$7.50");
    assert.equal(priceLine(withJob("ebay", job("failed", "14.00"))), "", "a failure takes the line away");
    assert.equal(priceLine(withJob("ebay", job("done"))), "", "posted, no price said");
    // a book's price is typed on the page: known from the press, the PC's replaces it
    assert.equal(priceLine(withJob("ebay", job("sending")), "11"), "$11");
    assert.equal(priceLine(withJob("ebay", job("running", "12.00")), "11"), "$12");
    assert.equal(priceLine(withJob("ebay", job("idle")), "11"), "", "not before the press");
    // nothing that is not a price above zero
    for (const junk of ["", "0", "0.00", "abc", null, undefined]) {
        assert.equal(priceLine(withJob("ebay", job("running", junk))), "", String(junk));
    }
    // a bare number from the PC is a price too
    const s = reduce(reduce(sent(1, [1]), { type: "jobAccepted", venue: "ebay", job: "j1", ahead: 0 }), {
        type: "jobStatus",
        venue: "ebay",
        status: { state: "running", price: 9 },
    });
    assert.equal(priceLine(s), "$9");
    // a new press starts without the old price
    assert.equal(reduce(s, { type: "jobSending", venue: "ebay", step: "sending" }).jobs.ebay.price, "");
});

test("the second button opens as soon as the first job is on its way: the PC queues it behind", () => {
    // Michal, 2026-09-30: "I seem not to be able to click craigslist while ebay is loading"
    let s = reduce(sent(1, [1]), { type: "jobSending", venue: "ebay", step: "sending" });
    assert.deepEqual(venueButton(s, "craigslist", true), { enabled: true, hint: "" }, "while sending");
    s = reduce(s, { type: "jobAccepted", venue: "ebay", job: "j1", ahead: 0 });
    s = reduce(s, { type: "jobStatus", venue: "ebay", status: { state: "running", step: "drafting" } });
    assert.deepEqual(venueButton(s, "craigslist", true), { enabled: true, hint: "" }, "while drafting, no row yet");
    assert.deepEqual(venueButton(s, "ebay", true), { enabled: false, hint: "" }, "the pressed one waits");
});

// --- an item name the PC already has today ------------------------------------------

test("a name the PC already has today is flagged and refused; retyping clears it", () => {
    // Michal, 2026-09-30: "if I put a name for an item and it is the same as another,
    // just flag it and don't accept it. I see that that pulls back the cached photos"
    let s = reduce(initialState(""), { type: "setItem", itemName: "Lamp" });
    assert.equal(s.nameTaken, null);
    assert.equal(nameTakenHint(s), "");
    s = reduce(s, { type: "nameTaken", itemName: "Lamp", photos: 3 });
    assert.deepEqual(s.nameTaken, { photos: 3 });
    assert.equal(nameTakenHint(s), '"Lamp" is already an item on the PC today with 3 photos. Use a different name.');
    assert.equal(nameTakenHint({ ...s, nameTaken: { photos: 1 } }), '"Lamp" is already an item on the PC today with 1 photo. Use a different name.');
    assert.equal(nameTakenHint({ ...s, nameTaken: { photos: 0 } }), '"Lamp" is already an item on the PC today. Use a different name.');
    // typing on clears the flag; an answer about an older name is ignored
    s = reduce(s, { type: "setItem", itemName: "Lamp two" });
    assert.equal(s.nameTaken, null);
    assert.equal(reduce(s, { type: "nameTaken", itemName: "Lamp", photos: 3 }).nameTaken, null, "a stale answer");
    // once the folder exists the name is fixed: nothing to flag
    const made = sent(1, [1]);
    assert.equal(reduce(made, { type: "nameTaken", itemName: "Boots", photos: 2 }).nameTaken, null);
    assert.ok(NAME_CHECK_MS >= 300 && NAME_CHECK_MS <= 1000, "a pause after the last keystroke");
});

test("the Snap button says Snap Again once there is a photo, and lands three quarters down", () => {
    assert.equal(snapWord(initialState("Lamp")), "Snap");
    assert.equal(snapWord(withPhotos(1)), "Snap Again");
    assert.equal(snapWord(sent(3, [1])), "Snap Again");
    assert.equal(SNAP_SPOT, 0.75);
    // scrolled 100 down, the button 1000 below the top of the viewport and 100 tall: its middle
    // (1150 from the page top) goes to 600, three quarters of an 800 viewport
    assert.equal(snapScrollTop({ scrollY: 100, innerHeight: 800 }, { top: 1000, height: 100 }), 550);
    assert.equal(snapScrollTop({ scrollY: 0, innerHeight: 800 }, { top: 300, height: 100 }), 0, "never above the top");
});

test("the red cancel shows from the press until the link or the error; a cancelled press reads cancelled", () => {
    // Michal, 2026-10-02: "below in red there should be a cancel button ... delay sending by
    // 1 second (but show loading) so that if one cancels within 1 sec there is no call money spent"
    assert.equal(SEND_DELAY_MS, 1000);
    let s = sent(1, [1]);
    assert.equal(cancelButton(s, "ebay"), false, "before the press");
    s = reduce(s, { type: "jobSending", venue: "ebay", step: "sending" });
    assert.equal(cancelButton(s, "ebay"), true);
    assert.equal(cancelButton(s, "craigslist"), false, "only under the pressed one");
    const takenBack = reduce(s, { type: "jobCancelled", venue: "ebay" });
    assert.equal(takenBack.jobs.ebay.phase, "failed");
    assert.equal(venueLine(takenBack.jobs.ebay).text, CANCELLED);
    assert.equal(cancelButton(takenBack, "ebay"), false);
    assert.equal(venueButton(takenBack, "ebay", true).enabled, true, "the button comes back");
    // once the PC has it: told, then its status says when it stopped
    s = reduce(s, { type: "jobAccepted", venue: "ebay", job: "j1", ahead: 0 });
    s = reduce(s, { type: "jobStatus", venue: "ebay", status: { state: "running", step: "drafting" } });
    assert.equal(cancelButton(s, "ebay"), true);
    s = reduce(s, { type: "jobStopping", venue: "ebay" });
    assert.equal(venueLine(s.jobs.ebay).text, STOPPING_STEP);
    s = reduce(s, {
        type: "jobStatus",
        venue: "ebay",
        status: { state: "failed", error: "cancelled from the phone", sku: "B-1" },
    });
    assert.equal(venueLine(s.jobs.ebay).text, "cancelled from the phone");
    assert.equal(s.sku, "B-1", "the saved draft's sku is kept: the next press posts it");
    assert.equal(cancelButton(s, "ebay"), false);
    s = reduce(sent(1, [1]), { type: "jobAccepted", venue: "ebay", job: "j1", ahead: 0 });
    assert.equal(reduce(s, { type: "jobStatus", venue: "ebay", status: { state: "done" } }).jobs.ebay.phase, "done");
    assert.equal(cancelButton(reduce(s, { type: "jobStatus", venue: "ebay", status: { state: "done" } }), "ebay"), false);
    // Michal, 2026-10-03: "after a posting is published ... can't cancel it now": gone from
    // the PC's publishing step on, before the link arrives
    const status = (step) => reduce(s, { type: "jobStatus", venue: "ebay", status: { state: "running", step } });
    assert.equal(cancelButton(status("drafting the listing"), "ebay"), true);
    assert.equal(cancelButton(status("filling craigslist for B-1"), "ebay"), true);
    assert.equal(cancelButton(status("publishing B-1 on ebay"), "ebay"), false);
    assert.equal(cancelButton(status("publishing on craigslist for B-1"), "ebay"), false);
    assert.equal(venueLine(status("publishing B-1 on ebay").jobs.ebay).kind, "busy", "the ring still turns");
});

test("the title line is the saved row's title, from whichever job said it first", () => {
    // Michal, 2026-10-02: "add the title of the post, from the first venue clicked, above the price"
    let s = sent(1, [1]);
    assert.equal(titleLine(s), "");
    s = reduce(s, { type: "jobAccepted", venue: "ebay", job: "j1", ahead: 0 });
    s = reduce(s, { type: "jobStatus", venue: "ebay", status: { state: "running", step: "drafting" } });
    assert.equal(titleLine(s), "", "nothing until the row is saved");
    s = reduce(s, { type: "jobStatus", venue: "ebay", status: { state: "running", sku: "B-1", title: " Brass Lamp 1970s " } });
    assert.equal(titleLine(s), "Brass Lamp 1970s");
    s = reduce(s, { type: "jobStatus", venue: "ebay", status: { state: "done", title: "" } });
    assert.equal(titleLine(s), "Brass Lamp 1970s", "a later blank does not unsay it");
    for (const junk of [7, null, undefined, "  "]) {
        const j = reduce(sent(1, [1]), { type: "jobStatus", venue: "ebay", status: { state: "running", title: junk } });
        assert.equal(titleLine(j), "", String(junk));
    }
});

test("history keeps the last items for back, newest last, one entry per item", () => {
    // Michal, 2026-10-02: "when I press next but then want to go back and see how much that
    // other thing posted for"
    const a = { itemName: "Lamp", itemId: "Lamp 2026-09-24", ai: [1] };
    const b = { itemName: "Vase", itemId: "Vase 2026-09-24", ai: [] };
    assert.deepEqual(remembered(null, a), [a]);
    assert.deepEqual(remembered([a], b), [a, b]);
    assert.deepEqual(remembered([a, b], { ...a, ai: [2] }), [b, { ...a, ai: [2] }], "the same item moves to the end");
    assert.deepEqual(remembered(["junk", null, a], b), [a, b], "whatever is not a record is dropped");
    // Michal, 2026-10-03: "lets say, 10 items back and then 10 items forward"
    assert.equal(HISTORY_LIMIT, 10);
    const many = Array.from({ length: HISTORY_LIMIT + 5 }, (_, i) => ({ itemId: `x${i}` }));
    const kept = many.reduce((list, r) => remembered(list, r), []);
    assert.equal(kept.length, HISTORY_LIMIT);
    assert.equal(kept[0].itemId, "x5", "the oldest fall off");
    assert.equal(kept.at(-1).itemId, `x${HISTORY_LIMIT + 4}`);
    // a list an older page kept (up to 30) is read as its newest ten
    assert.deepEqual(historyList(many).map((r) => r.itemId), kept.map((r) => r.itemId));
    assert.deepEqual(historyList([a, { itemName: "no id" }, { itemId: "" }, 7, null]), [a]);
    assert.deepEqual(historyList("junk"), []);
});

test("an item back brought up and worked on is kept current where it stands", () => {
    const a = { itemName: "Lamp", itemId: "Lamp 2026-09-24", ai: [1] };
    const b = { itemName: "Vase", itemId: "Vase 2026-09-24", ai: [] };
    assert.deepEqual(refreshed([a, b], { ...a, ai: [1, 3] }), [{ ...a, ai: [1, 3] }, b], "in its place, not moved to the end");
    assert.deepEqual(refreshed([a], b), [a], "an item not in the list is not added");
    assert.deepEqual(refreshed(null, a), []);
    assert.equal(recordKind({ mode: "book", itemId: "x" }), "book");
    assert.equal(recordKind(a), "goods", "goods were saved before there were kinds");
});

test("the walk's places, as the browser's entries name them", () => {
    // 0 the floor, 1..length the items NEXT left, length + 1 the items in hand
    assert.equal(walkPosition({ snap: 0 }, 3), 0);
    assert.equal(walkPosition({ snap: 2 }, 3), 2);
    assert.equal(walkPosition({ snap: 4 }, 3), 4);
    assert.equal(walkPosition({ snap: 9 }, 3), 4, "past a list that has since shrunk: the items in hand");
    // not the walk's: no state, someone else's, the single entry an older page kept
    for (const state of [null, undefined, "x", {}, { snap: true }, { snap: -1 }, { snap: 1.5 }, { snap: "2" }]) {
        assert.equal(walkPosition(state, 3), -1, JSON.stringify(state));
    }
});

test("the lines the walk says", () => {
    const a = { itemName: "Lamp", itemId: "Lamp 2026-09-24", ai: [1] };
    assert.equal(walkNote(a, false, true), 'Back to "Lamp", as it was left. NEXT returns to the item you were on.');
    assert.equal(walkNote(a, true, true), 'Forward to "Lamp", as it was left. NEXT returns to the item you were on.');
    assert.equal(walkNote({ itemId: "Book 978 2026-09-24" }, false, false), 'Back to "Book 978 2026-09-24", as it was left. NEXT starts a new item.');
    assert.equal(presentNote(a), 'Back on "Lamp", the item you were on.');
    assert.equal(presentNote(null), "", "a fresh screen: nothing to say");
    // Michal, 2026-10-03: "beyond that it should say something like - 'end of item history - see inventory lists'"
    assert.equal(HISTORY_END, "End of the item history: see the inventory list on the PC.");
});

test("itemIdFor names today's folder the way serve/items.py does", () => {
    assert.equal(itemIdFor("Lamp", new Date(2026, 8, 30, 23, 59)), "Lamp 2026-09-30");
    assert.equal(itemIdFor("Blue Levi jacket", new Date(2026, 0, 5)), "Blue Levi jacket 2026-01-05");
});

test("a reload reads each job's price back with its status", () => {
    const s = reduce(initialState(""), {
        type: "recovered",
        itemName: "Boots",
        itemId: ITEM,
        ai: [1],
        answer: {
            photos: [1],
            note: "",
            sku: "B-1",
            jobs: [{ job: "j1", venue: "ebay", state: "done", sku: "B-1", price: "14.00", links: {} }],
        },
    });
    assert.equal(priceLine(s), "$14");
    assert.equal(venueLabel(s.jobs.ebay, "ebay"), "ebay, posted");
});

test("NEXT waits while a photo or a delete has not reached the PC", () => {
    assert.deepEqual(doneButton(withPhotos(1)), {
        enabled: false,
        hint: "NEXT waits until the photos are on the PC",
    });
    const struck = reduce(sent(2), { type: "remove", id: "p1" });
    assert.equal(doneButton(struck).enabled, false, "the delete has not gone yet");
    const task = { kind: "delete", n: 1 };
    const gone = reduce(reduce(struck, { type: "taskStart", task }), { type: "taskDone", task });
    assert.equal(doneButton(gone).enabled, true);
});

test("the photos lock once a job is on its way, and unlock if it failed before saving the row", () => {
    const s = sent(2, [1]);
    assert.equal(photosLocked(s), false);
    const going = reduce(s, { type: "jobAccepted", venue: "ebay", job: "j1", ahead: 0 });
    assert.equal(photosLocked(going), true);
    const failed = reduce(going, {
        type: "jobStatus",
        venue: "ebay",
        status: { state: "failed", error: "the model said no", sku: "" },
    });
    assert.equal(photosLocked(failed), false);
    const savedThenFailed = reduce(going, {
        type: "jobStatus",
        venue: "ebay",
        status: { state: "failed", error: "publish failed", sku: "B-0042" },
    });
    assert.equal(photosLocked(savedThenFailed), true, "the row is saved; the photos are its");
});

test("the note status word: waits for the first photo, sending, sent, offline", () => {
    let s = reduce(initialState("Boots"), { type: "noteText", text: "Size 10 " });
    assert.equal(noteStatusText(s), "goes with the first photo");
    s = reduce(sent(1, [1]), { type: "noteText", text: "Size 10 " });
    assert.equal(noteStatusText(s), "", "still typing");
    s = reduce(s, { type: "noteDue" });
    assert.equal(noteStatusText(s), "sending...");
    const task = { kind: "note", text: "Size 10" };
    s = reduce(s, { type: "taskStart", task });
    assert.equal(noteStatusText(s), "sending...");
    s = reduce(s, { type: "taskDone", task, answer: {} });
    assert.equal(noteStatusText(s), "sent");
    s = reduce(s, { type: "noteText", text: "Size 10, scuffed" });
    s = reduce(s, { type: "noteDue" });
    const again = { kind: "note", text: "Size 10, scuffed" };
    s = reduce(reduce(s, { type: "taskStart", task: again }), {
        type: "taskFailed",
        task: again,
        status: 0,
        error: "cannot reach the PC",
    });
    assert.equal(noteStatusText(s), "not sent (offline), will retry");
});

test("leaving warns while something is not on the PC yet, not merely while a job runs there", () => {
    assert.equal(leaveWarning(initialState("x")), false);
    assert.equal(leaveWarning(withPhotos(1, [1])), true, "a photo not sent yet");
    const s = sent(1, [1]);
    assert.equal(leaveWarning(s), false, "everything is on the PC: a reload reads it back");
    assert.equal(leaveWarning(reduce(s, { type: "noteText", text: "x" })), true);
    const sending = reduce(s, { type: "jobSending", venue: "ebay", step: "sending" });
    assert.equal(leaveWarning(sending), true, "the press has not reached the PC yet");
    const running = reduce(s, { type: "jobAccepted", venue: "ebay", job: "j1", ahead: 0 });
    assert.equal(leaveWarning(running), false, "the job is the PC's: it posts whether or not the page watches");
    const done = reduce(running, {
        type: "jobStatus",
        venue: "ebay",
        status: { state: "done", sku: "B-1", links: { ebay: "https://www.ebay.com/itm/1" } },
    });
    assert.equal(leaveWarning(done), false);
});

// --- a reload ------------------------------------------------------------------------

test("what is kept for a reload: the item, its id and the AI marks, once it is on the PC", () => {
    assert.equal(savedItem(withPhotos(2, [2])), null, "not on the PC yet");
    assert.deepEqual(savedItem(sent(3, [1, 3])), { itemName: "Boots", itemId: ITEM, ai: [1, 3] });
});

test("a reloaded page takes the item back as the PC has it", () => {
    const s = reduce(initialState(""), {
        type: "recovered",
        itemName: "Boots",
        itemId: ITEM,
        ai: [4],
        answer: {
            item: ITEM,
            photos: [1, 4],
            note: "Size 10",
            sku: "B-0042",
            jobs: [
                {
                    job: "j1",
                    venue: "ebay",
                    state: "done",
                    sku: "B-0042",
                    links: { ebay: "https://www.ebay.com/itm/9" },
                },
                { job: "j2", venue: "craigslist", state: "running", step: "filling craigslist" },
                { job: "j0", venue: "everywhere", state: "done" },
            ],
        },
    });
    assert.deepEqual(
        s.photos.map((p) => [p.n, p.name, p.ai, p.status, p.local]),
        [
            [1, "Boots-1.jpg", false, "sent", false],
            [4, "Boots-4.jpg", true, "sent", false],
        ]
    );
    assert.equal(s.itemId, ITEM);
    assert.deepEqual(s.note, { text: "Size 10", sentText: "Size 10", due: false });
    assert.equal(s.sku, "B-0042");
    assert.equal(s.jobs.ebay.link, "https://www.ebay.com/itm/9");
    assert.equal(s.jobs.craigslist.jobId, "j2");
    assert.equal(s.jobs.craigslist.phase, "running");
    assert.equal(highestNumber(s), 4);
});

test("the photo counter only ever goes up", () => {
    assert.deepEqual(raiseCount({ Boots: 2 }, "Boots", 5), { Boots: 5 });
    assert.deepEqual(raiseCount({ Boots: 7 }, "Boots", 5), { Boots: 7 });
    assert.deepEqual(raiseCount(null, "Boots", 0), {});
});

// --- books: the ISBN -----------------------------------------------------------------

const ISBN = "9780306406157";

test("normalizeIsbn takes an ISBN-13 with or without hyphens, spaces or the printed label", () => {
    for (const typed of [ISBN, "978-0-306-40615-7", " 978 0306 40615 7 ", "ISBN 978-0-306-40615-7", "ISBN-13: 9780306406157"]) {
        assert.equal(normalizeIsbn(typed), ISBN, typed);
    }
    assert.equal(normalizeIsbn("9791034304301"), "9791034304301", "979 is a bookland prefix too");
});

test("normalizeIsbn turns an ISBN-10 into the 978 ISBN-13 the PC is asked by", () => {
    assert.equal(normalizeIsbn("0-306-40615-2"), ISBN);
    assert.equal(normalizeIsbn("ISBN-10: 0306406152"), ISBN);
    // an X check character stands for 10
    assert.equal(normalizeIsbn("080442957X"), "9780804429573");
    assert.equal(normalizeIsbn("080442957x"), "9780804429573");
});

test("normalizeIsbn refuses a wrong check digit, another barcode, and junk", () => {
    for (const bad of [
        "9780306406158", // check digit off by one
        "0306406153",
        "4006381333931", // a real EAN-13, but not a book
        "978030640615", // 12 digits
        "97803064061577",
        "978O306406157", // a letter O
        "X306406152",
        "",
        "   ",
        null,
        undefined,
        9780306406157,
    ]) {
        assert.equal(normalizeIsbn(bad), "", String(bad));
    }
});

// --- books: the price ----------------------------------------------------------------

test("bookPriceValue reads whole dollars, cents, a $ and a decimal comma; nothing else", () => {
    assert.equal(bookPriceValue("11"), "11");
    assert.equal(bookPriceValue(" $12 "), "12");
    assert.equal(bookPriceValue("011"), "11");
    assert.equal(bookPriceValue("7.5"), "7.50");
    assert.equal(bookPriceValue("7,50"), "7.50");
    assert.equal(bookPriceValue("9.00"), "9");
    for (const bad of ["", "0", "0.00", "-3", "12.345", "twelve", "1e3", null]) {
        assert.equal(bookPriceValue(bad), "", String(bad));
    }
    assert.equal(money("6.00"), "$6");
    assert.equal(money("24.5"), "$24.50");
    assert.equal(money(null), "");
});

test("the line under the price: eBay's listings and the suggestion, or none found", () => {
    const found = (price, listings) => ({ phase: "found", price, listings, route: "list" });
    assert.equal(
        priceNote(found("11", { count: 12, low: "6.00", high: "24.00" })),
        "eBay: 12 listings, $6–$24 · suggested $11"
    );
    assert.equal(priceNote(found("", { count: 1, low: "8.00", high: "8.00" })), "eBay: 1 listing, $8");
    assert.equal(priceNote(found("", null)), "no eBay listings found — set a price");
    assert.equal(priceNote(found("", { count: 0, low: "", high: "" })), "no eBay listings found — set a price");
    assert.equal(
        priceNote(found("3", { count: 5, low: "2.00", high: "4.50" })),
        "eBay: 5 listings, $2–$4.50 · suggested $3 · under $5: a lot or a buyback site may be better"
    );
    assert.equal(priceNote({ phase: "looking", price: "", listings: null }), "");
});

// --- books: the state ----------------------------------------------------------------

const ANSWER = {
    isbn: ISBN,
    title: "The Art of Computer Programming",
    subtitle: "Fundamental Algorithms",
    authors: ["Donald E. Knuth"],
    publisher: "Addison-Wesley",
    year: "1998",
    format: "Hardcover",
    pages: 672,
    price: "11",
    listings: { count: 12, low: "6.00", high: "24.00" },
    route: "list",
};

function bookState() {
    return reduce(initialState(""), { type: "setMode", mode: "book" });
}

/** A book looked up and found, with n photos taken and sent. */
function foundBook(n = 1) {
    let s = reduce(bookState(), { type: "bookIsbn", isbn: ISBN });
    s = reduce(s, { type: "bookLookupStart", isbn: ISBN });
    s = reduce(s, { type: "bookLookupDone", isbn: ISBN, answer: ANSWER });
    for (let i = 1; i <= n; i += 1) {
        s = reduce(s, { type: "add", id: `b${i}`, name: `Book ${ISBN}-${i}.jpg`, n: i });
    }
    const item = { kind: "item", name: s.itemName };
    s = reduce(reduce(s, { type: "taskStart", task: item }), {
        type: "taskDone",
        task: item,
        answer: { item: `Book ${ISBN} 2026-09-24`, photos: [] },
    });
    for (const p of s.photos) {
        const task = { kind: "photo", id: p.id, n: p.n };
        s = reduce(reduce(s, { type: "taskStart", task }), { type: "taskDone", task, answer: {} });
    }
    return s;
}

test("goods is the default mode; setMode takes only goods or book; DONE keeps the mode", () => {
    assert.equal(initialState("Boots").mode, "goods");
    const s = bookState();
    assert.equal(s.mode, "book");
    assert.equal(s.book.condition, DEFAULT_CONDITION);
    assert.equal(DEFAULT_CONDITION, "good");
    assert.equal(reduce(s, { type: "setMode", mode: "records" }), s);
    const next = reduce(foundBook(2), { type: "reset" });
    assert.equal(next.mode, "book", "DONE on a book starts the next book");
    assert.equal(next.book.isbn, "");
    assert.equal(next.itemName, "");
});

test("an ISBN names the book's item, and relabels a photo that waited for it", () => {
    let s = reduce(bookState(), { type: "add", id: "b1", name: "Book-1.jpg", n: 1 });
    s = reduce(s, { type: "bookIsbn", isbn: ISBN });
    assert.equal(s.itemName, `Book ${ISBN}`);
    assert.equal(s.photos[0].name, `Book ${ISBN}-1.jpg`);
    assert.equal(s.book.lookup.phase, "idle");
    // the same ISBN again changes nothing
    assert.equal(reduce(s, { type: "bookIsbn", isbn: ISBN }), s);
    // cleared: the photo waits again for a name
    const cleared = reduce(s, { type: "bookIsbn", isbn: "" });
    assert.equal(cleared.itemName, "");
    // once the folder is on the PC, the ISBN is fixed until DONE
    const made = foundBook();
    assert.equal(reduce(made, { type: "bookIsbn", isbn: "9780804429573" }), made);
});

test("the lookup: looking, found (the card and the price box filled), a late answer ignored", () => {
    let s = reduce(bookState(), { type: "bookIsbn", isbn: ISBN });
    assert.equal(bookCard(s.book).status, `Looking up ${ISBN}…`);
    s = reduce(s, { type: "bookLookupStart", isbn: ISBN });
    assert.equal(s.book.lookup.phase, "looking");
    s = reduce(s, { type: "bookLookupDone", isbn: ISBN, answer: ANSWER });
    assert.equal(s.book.lookup.phase, "found");
    assert.equal(s.book.price, "11", "the suggestion fills the price box");
    assert.deepEqual(bookCard(s.book), {
        hidden: false,
        status: "",
        kind: "",
        title: "The Art of Computer Programming: Fundamental Algorithms",
        authors: "Donald E. Knuth",
        details: "Addison-Wesley · 1998 · Hardcover · 672 pages",
        note: "",
    });
    // an answer for a book no longer in the box changes nothing
    assert.equal(reduce(s, { type: "bookLookupDone", isbn: "9780804429573", answer: ANSWER }), s);
    // a price he typed first is kept
    let typed = reduce(bookState(), { type: "bookIsbn", isbn: ISBN });
    typed = reduce(typed, { type: "bookPrice", text: "15" });
    typed = reduce(typed, { type: "bookLookupDone", isbn: ISBN, answer: ANSWER });
    assert.equal(typed.book.price, "15");
    // no suggestion: the box stays empty
    const none = reduce(reduce(bookState(), { type: "bookIsbn", isbn: ISBN }), {
        type: "bookLookupDone",
        isbn: ISBN,
        answer: { ...ANSWER, price: null, listings: null },
    });
    assert.equal(none.book.price, "");
    assert.equal(priceNote(none.book.lookup), "no eBay listings found — set a price");
});

test("the lookup: 404 is not in the catalogues; anything else shows the PC's words", () => {
    const s = reduce(bookState(), { type: "bookIsbn", isbn: ISBN });
    assert.equal(s.book.isbnMiss, false);
    const missing = reduce(s, { type: "bookLookupFailed", isbn: ISBN, status: 404, error: "no book" });
    assert.equal(missing.book.lookup.phase, "missing");
    assert.equal(missing.book.isbnMiss, true, "remembered past the card: No ISBN keeps it");
    // not a dead end: No ISBN is the next step, and the PC's words are the small line
    assert.equal(ISBN_MISS, "Not in the catalogues. Tap No ISBN and type the title — the ISBN stays on the listing.");
    assert.deepEqual(bookCard(missing.book), {
        hidden: false,
        status: ISBN_MISS,
        kind: "bad",
        title: "",
        authors: "",
        details: "",
        note: "no book",
    });
    const failed = reduce(s, {
        type: "bookLookupFailed",
        isbn: ISBN,
        status: 502,
        error: "the catalogues could not be reached",
    });
    assert.equal(failed.book.lookup.phase, "failed");
    assert.equal(bookCard(failed.book).status, "the catalogues could not be reached");
    assert.equal(bookCard(bookState().book).hidden, true, "no ISBN, no card");
});

test("the condition chips: four, good by default, only a known value is taken", () => {
    assert.deepEqual(
        CONDITIONS.map((c) => c.value),
        ["like_new", "very_good", "good", "acceptable"]
    );
    assert.deepEqual(
        CONDITIONS.map((c) => c.label),
        ["Like new", "Very good", "Good", "Acceptable"]
    );
    const s = reduce(bookState(), { type: "bookCondition", condition: "very_good" });
    assert.equal(s.book.condition, "very_good");
    assert.equal(reduce(s, { type: "bookCondition", condition: "mint" }), s);
});

test("the book's ebay button: ISBN, found, a photo, a price, every photo on the PC", () => {
    const hint = (s, ok = true) => venueButton(s, "ebay", ok).hint;
    assert.equal(hint(foundBook(), false), SETTINGS_HINT);
    assert.equal(hint(bookState()), "Scan the ISBN, or tap No ISBN and type the title");
    const isbn = reduce(bookState(), { type: "bookIsbn", isbn: ISBN });
    assert.equal(hint(isbn), "Looking the book up...");
    assert.equal(ISBN_MISS_HINT, "Tap No ISBN and type the title");
    assert.equal(hint(reduce(isbn, { type: "bookLookupFailed", isbn: ISBN, status: 404, error: "" })), ISBN_MISS_HINT);
    assert.match(
        hint(reduce(isbn, { type: "bookLookupFailed", isbn: ISBN, status: 502, error: "down" })),
        /edit the ISBN to try again/
    );
    const found = reduce(isbn, { type: "bookLookupDone", isbn: ISBN, answer: ANSWER });
    assert.equal(hint(found), "Snap the cover first");
    const waiting = reduce(found, { type: "add", id: "b1", name: "x", n: 1 });
    assert.equal(hint(waiting), "Waiting for the photos to reach the PC (0 of 1 sent)");
    assert.equal(hint(reduce(waiting, { type: "bookPrice", text: "free" })), "Set a price (whole dollars are fine)");
    assert.deepEqual(venueButton(foundBook(), "ebay", true), { enabled: true, hint: "" });
    // no AI mark is needed, and there is no craigslist for a book
    assert.equal(foundBook().photos.some((p) => p.ai), false);
    assert.deepEqual(venueButton(foundBook(), "craigslist", true), { enabled: false, hint: "" });
    // a job on its way: pressed once is enough
    const going = reduce(foundBook(), { type: "jobAccepted", venue: "ebay", job: "j1", ahead: 0 });
    assert.deepEqual(venueButton(going, "ebay", true), { enabled: false, hint: "" });
});

test("a book's job carries the ISBN, the condition, the price and the main photo, and no AI marks", () => {
    let s = reduce(foundBook(2), { type: "bookCondition", condition: "very_good" });
    s = reduce(s, { type: "bookPrice", text: "$9.5" });
    const body = () => jobRequest({ venue: "ebay", sku: "B-1", item: s.itemId, photos: s.photos, book: bookForm(s) });
    // nothing marked: the first photo leads, as it always did; with an ISBN the typed fields are ""
    assert.deepEqual(body(), {
        item: `Book ${ISBN} 2026-09-24`,
        venue: "ebay",
        book: {
            isbn: ISBN,
            title: "",
            author: "",
            year: "",
            format: "",
            condition: "very_good",
            price: "9.50",
            main: 1,
        },
    });
    s = reduce(s, { type: "bookMain", id: "b2" });
    assert.equal(body().book.main, 2);
});

// --- books: the main photo ------------------------------------------------------

test("the main photo: none before a photo, then the first by default", () => {
    assert.equal(bookState().book.main, 0);
    let s = reduce(bookState(), { type: "add", id: "b1", name: "Book-1.jpg", n: 1 });
    assert.equal(s.book.main, 1);
    s = reduce(s, { type: "add", id: "b2", name: "Book-2.jpg", n: 2 });
    assert.equal(s.book.main, 1, "a later photo does not take it");
    assert.equal(foundBook(3).book.main, 1);
    // goods have no main photo
    const goods = reduce(initialState("Boots"), { type: "add", id: "g1", name: "Boots-1.jpg", n: 1 });
    assert.equal(goods.book.main, 0);
    assert.equal(reduce(goods, { type: "bookMain", id: "g1" }), goods);
});

test("the main photo: a tap moves it; exactly one; a tap on it or on nothing changes nothing", () => {
    const s = foundBook(3);
    const moved = reduce(s, { type: "bookMain", id: "b3" });
    assert.equal(moved.book.main, 3);
    assert.equal(reduce(moved, { type: "bookMain", id: "b3" }), moved, "no toggling off");
    assert.equal(reduce(moved, { type: "bookMain", id: "b1" }).book.main, 1, "and back");
    assert.equal(reduce(s, { type: "bookMain", id: "nope" }), s);
    // the ebay press fixes it, as it fixes the AI marks
    const going = reduce(moved, { type: "jobSending", venue: "ebay", step: "sending" });
    assert.equal(reduce(going, { type: "bookMain", id: "b1" }), going);
    assert.equal(going.book.main, 3);
});

test("the main photo: deleting it moves the mark back to the first photo left", () => {
    let s = reduce(foundBook(3), { type: "bookMain", id: "b2" });
    s = reduce(s, { type: "remove", id: "b2" });
    assert.equal(s.book.main, 1);
    // the first one gone as well: the next first
    s = reduce(s, { type: "remove", id: "b1" });
    assert.equal(s.book.main, 3);
    // deleting another photo leaves it alone
    const kept = reduce(reduce(foundBook(3), { type: "bookMain", id: "b3" }), { type: "remove", id: "b1" });
    assert.equal(kept.book.main, 3);
    // none left: none
    assert.equal(reduce(s, { type: "remove", id: "b3" }).book.main, 0);
    // DONE: the next book starts with none
    assert.equal(reduce(foundBook(2), { type: "reset" }).book.main, 0);
});

test("the main photo follows its photo when the PC's folder renumbers it", () => {
    // the same book the same day: the PC already holds photos 1 and 2
    let s = reduce(bookState(), { type: "bookIsbn", isbn: ISBN });
    s = reduce(s, { type: "add", id: "b1", name: "x", n: 1 });
    s = reduce(s, { type: "add", id: "b2", name: "x", n: 2 });
    s = reduce(s, { type: "bookMain", id: "b2" });
    const item = { kind: "item", name: s.itemName };
    s = reduce(reduce(s, { type: "taskStart", task: item }), {
        type: "taskDone",
        task: item,
        answer: { item: `Book ${ISBN} 2026-09-24`, photos: [1, 2] },
    });
    assert.deepEqual(s.photos.map((p) => p.n), [1, 2, 3, 4]);
    assert.equal(s.book.main, 4, "still the photo he marked, now number 4");
});

test("NEXT and the progress line know the book mode", () => {
    assert.equal(progressLine(foundBook(2)), "2 photos, all on the PC");
    assert.equal(doneButton(bookState()).enabled, false);
    const isbnOnly = reduce(bookState(), { type: "bookIsbn", isbn: ISBN });
    assert.equal(doneButton(isbnOnly).enabled, true, "a book not worth a photo can be cleared");
    assert.equal(doneButton(foundBook()).enabled, true);
    const going = reduce(foundBook(), { type: "jobSending", venue: "ebay", step: "sending" });
    assert.match(doneButton(going).hint, /NEXT waits until the listing has reached the PC/);
    assert.equal(leaveWarning(going), true);
    const taken = reduce(going, { type: "jobAccepted", venue: "ebay", job: "j1", ahead: 2 });
    assert.deepEqual(doneButton(taken), { enabled: true, hint: "" }, "the next book while this one posts");
    assert.equal(nextNote(taken), NEXT_NOTE);
    assert.equal(leaveWarning(taken), false);
});

test("a book is kept for a reload with its ISBN, condition, price and found record, and read back", () => {
    assert.equal(savedItem(reduce(bookState(), { type: "bookIsbn", isbn: ISBN })), null, "not on the PC yet");
    let s = reduce(foundBook(2), { type: "bookCondition", condition: "acceptable" });
    s = reduce(s, { type: "bookPrice", text: "8" });
    s = reduce(s, { type: "bookMain", id: "b2" });
    const saved = savedItem(s);
    assert.deepEqual(saved, {
        mode: "book",
        itemName: `Book ${ISBN}`,
        itemId: `Book ${ISBN} 2026-09-24`,
        isbn: ISBN,
        isbnMiss: false,
        manual: false,
        title: "",
        author: "",
        year: "",
        format: "paperback",
        condition: "acceptable",
        price: "8",
        main: 2,
        lookup: {
            by: "isbn",
            matched: true,
            record: s.book.lookup.record,
            price: "11",
            listings: { count: 12, low: "6.00", high: "24.00" },
            route: "list",
        },
    });
    const back = reduce(bookState(), {
        type: "recovered",
        mode: "book",
        itemName: saved.itemName,
        itemId: saved.itemId,
        ai: [],
        book: JSON.parse(JSON.stringify(saved)),
        answer: { item: saved.itemId, photos: [1, 2], note: "Spine creased", sku: null, jobs: [] },
    });
    assert.equal(back.mode, "book");
    assert.deepEqual(back.book, s.book);
    assert.equal(back.book.main, 2, "the main photo is read back");
    assert.equal(back.note.text, "Spine creased");
    assert.deepEqual(venueButton(back, "ebay", true), { enabled: true, hint: "" });
    // without a found record the page asks the catalogues again
    const again = reduce(bookState(), {
        type: "recovered",
        mode: "book",
        itemName: saved.itemName,
        itemId: saved.itemId,
        book: { ...saved, lookup: null },
        answer: { photos: [1] },
    });
    assert.equal(again.book.isbn, ISBN);
    assert.equal(again.book.lookup.phase, "idle");
    // the saved main photo no longer on the PC (or never saved): the first leads
    assert.equal(again.book.main, 1);
    const older = reduce(bookState(), {
        type: "recovered",
        mode: "book",
        itemName: saved.itemName,
        itemId: saved.itemId,
        book: { ...saved, main: undefined },
        answer: { photos: [3, 5] },
    });
    assert.equal(older.book.main, 3);
});

test("the line above the ISBN button says what to do, or why the ISBN must be typed", () => {
    const base = { canScan: true, scan: "", hasItem: false, locked: false, restoring: false };
    // the picture is for the number only: the line says so before the first one
    assert.equal(
        scanHint(base),
        "Tap ISBN to read the barcode on the back cover, or type the ISBN. A close-up of the barcode is enough; it is not a listing photo."
    );
    // No ISBN open: the title is what to type
    assert.equal(
        scanHint({ ...base, manual: true }),
        "No ISBN: type the title as the cover has it. The PC finds the book and a price."
    );
    assert.equal(scanHint({ ...base, manual: true, hasItem: true }), "");
    // ... opened after an ISBN no catalogue knows: that ISBN stays
    assert.equal(
        scanHint({ ...base, manual: true, kept: true }),
        "Type the title as the cover has it. The PC finds a price; the ISBN stays on the listing."
    );
    assert.equal(scanHint({ ...base, canScan: false }), "This phone cannot read barcodes; type the ISBN");
    assert.equal(scanHint({ ...base, scan: "reading" }), "Reading the barcode...");
    assert.equal(
        scanHint({ ...base, scan: "missed" }),
        "No barcode found — try again closer, or type the ISBN under the barcode"
    );
    assert.equal(scanHint({ ...base, hasItem: true }), "");
    assert.match(scanHint({ ...base, locked: true }), /NEXT starts the next book/);
});

// --- books: photos waiting for the ISBN ---------------------------------------------

/** The cover snapped before the ISBN: the photos are on the page, the book has no ISBN. */
function coverBeforeIsbn(n = 1) {
    let s = bookState();
    for (let i = 1; i <= n; i += 1) s = reduce(s, { type: "add", id: `b${i}`, name: `Book-${i}.jpg`, n: i });
    return s;
}

test("photos waiting for the ISBN: NEXT and ebay say the ISBN is what blocks them, not the PC", () => {
    const s = coverBeforeIsbn();
    assert.equal(
        ISBN_WAIT_HINT,
        "Scan the ISBN, or tap No ISBN and type the title, so the photos can go to the PC; or remove them with their x"
    );
    assert.deepEqual(doneButton(s), { enabled: false, hint: ISBN_WAIT_HINT });
    assert.deepEqual(venueButton(s, "ebay", true), { enabled: false, hint: ISBN_WAIT_HINT });
    // with the ISBN typed they are ordinary photos on their way to the PC again
    const named = reduce(s, { type: "bookIsbn", isbn: ISBN });
    assert.equal(doneButton(named).hint, "NEXT waits until the photos are on the PC");
    // with the photo struck out there is nothing waiting: back to the first step
    const struck = reduce(s, { type: "remove", id: "b1" });
    assert.equal(venueButton(struck, "ebay", true).hint, "Scan the ISBN, or tap No ISBN and type the title");
    assert.deepEqual(doneButton(struck), { enabled: false, hint: "" });
    // goods photos not yet on the PC keep their own words
    assert.equal(doneButton(withPhotos(1)).hint, "NEXT waits until the photos are on the PC");
});

test("photos waiting for the ISBN: the progress line says so", () => {
    assert.equal(progressLine(coverBeforeIsbn(1)), "1 photo, waiting for the ISBN or the title");
    assert.equal(progressLine(coverBeforeIsbn(2)), "2 photos, waiting for the ISBN or the title");
    const named = reduce(coverBeforeIsbn(1), { type: "bookIsbn", isbn: ISBN });
    assert.equal(progressLine(named), "1 photo, 0 on the PC");
});

// --- books with no ISBN ----------------------------------------------------------------
// Michal, 2026-09-28: "Some books don't have ISBN. Make a least friction pathway ...
// The extra button will open necessary fields. I want the API to work it through
// still, suggest price, fill in other info etc."

/** GET /books/search, as the PC answers it for a title a catalogue knows. */
const MATCH = {
    isbn: "",
    title: "Dune",
    subtitle: "",
    authors: ["Frank Herbert"],
    publisher: "Chilton Books",
    year: "1965",
    format: "Hardcover",
    pages: 412,
    price: "40",
    listings: { count: 7, low: "25.00", high: "90.00" },
    route: "list",
    found: true,
};

/** No ISBN tapped, and the title (and whatever else) typed. */
function typedBook(fields = { title: "Dune" }) {
    let s = reduce(bookState(), { type: "bookManual", open: true });
    for (const [field, text] of Object.entries(fields)) s = reduce(s, { type: "bookField", field, text });
    return s;
}

/** ... then he stopped typing: named, looked up, answered. */
function searchedBook(answer = MATCH, fields = { title: "Dune" }) {
    let s = reduce(typedBook(fields), { type: "bookName" });
    const key = lookupKey(s.book);
    s = reduce(s, { type: "bookLookupStart", key });
    return reduce(s, { type: "bookLookupDone", key, answer });
}

/** A searched book with n photos taken and on the PC. */
function listedBook(n = 1, answer = MATCH) {
    let s = searchedBook(answer);
    for (let i = 1; i <= n; i += 1) s = reduce(s, { type: "add", id: `b${i}`, name: `Book Dune-${i}.jpg`, n: i });
    const item = { kind: "item", name: s.itemName };
    s = reduce(reduce(s, { type: "taskStart", task: item }), {
        type: "taskDone",
        task: item,
        answer: { item: "Book Dune 2026-09-28", photos: [] },
    });
    for (const p of s.photos) {
        const task = { kind: "photo", id: p.id, n: p.n };
        s = reduce(reduce(s, { type: "taskStart", task }), { type: "taskDone", task, answer: {} });
    }
    return s;
}

test("no ISBN: the year is asked only once it is a year; the title and author are tidied", () => {
    assert.equal(SEARCH_DEBOUNCE_MS, 600);
    assert.equal(bookYear("1965"), "1965");
    assert.equal(bookYear(" 1965 "), "1965");
    for (const partial of ["", "19", "196", "19655", "mcmlxv", null]) assert.equal(bookYear(partial), "");
    assert.deepEqual(bookSearch({ title: "  The   Hobbit ", author: " J.R.R.  Tolkien", year: "193" }), {
        title: "The Hobbit",
        author: "J.R.R. Tolkien",
        year: "",
    });
});

test("no ISBN: a catalogue's format word picks the chip, or neither", () => {
    assert.deepEqual(
        FORMATS.map((f) => [f.value, f.label]),
        [
            ["paperback", "Paperback"],
            ["hardcover", "Hardcover"],
        ]
    );
    assert.equal(DEFAULT_FORMAT, "paperback");
    for (const word of ["Hardcover", "hardback", "Hard Cover", "Library Binding (hardbound)"]) {
        assert.equal(formatOf(word), "hardcover", word);
    }
    for (const word of ["Paperback", "Mass Market Paperback", "softcover", "Trade Paper"]) {
        assert.equal(formatOf(word), "paperback", word);
    }
    for (const word of ["", "Audio CD", null]) assert.equal(formatOf(word), "");
});

test("No ISBN opens the fields and sets the ISBN aside; tapped again it closes and clears them", () => {
    // an ISBN first, looked up, its price suggested
    let s = reduce(bookState(), { type: "add", id: "b1", name: "x", n: 1 });
    s = reduce(s, { type: "bookIsbn", isbn: ISBN });
    s = reduce(s, { type: "bookLookupDone", isbn: ISBN, answer: ANSWER });
    assert.equal(s.book.price, "11");
    const open = reduce(s, { type: "bookManual", open: true });
    assert.equal(open.book.manual, true);
    assert.equal(open.book.isbn, "", "the ISBN box is ignored now");
    assert.equal(open.book.lookup.phase, "idle");
    assert.equal(open.book.price, "", "the other book's suggestion goes with it");
    assert.equal(open.itemName, "", "nothing names the folder until the title does");
    assert.equal(open.photos[0].name, "Book-1.jpg");
    assert.equal(open.book.format, "paperback", "paperback by default");
    assert.equal(bookCard(open.book).hidden, true, "no title yet, no card");
    // a price he typed himself stays
    const typed = reduce(reduce(s, { type: "bookPrice", text: "7" }), { type: "bookManual", open: true });
    assert.equal(typed.book.price, "7");
    // open again: nothing changes
    assert.equal(reduce(open, { type: "bookManual", open: true }), open);

    let t = reduce(open, { type: "bookField", field: "title", text: "Dune" });
    t = reduce(t, { type: "bookField", field: "author", text: "Frank Herbert" });
    t = reduce(t, { type: "bookFormat", format: "hardcover" });
    t = reduce(t, { type: "bookName" });
    const closed = reduce(t, { type: "bookManual", open: false });
    assert.equal(closed.book.manual, false);
    assert.deepEqual(
        [closed.book.title, closed.book.author, closed.book.year, closed.book.format],
        ["", "", "", "paperback"],
        "closing clears what was typed"
    );
    assert.equal(closed.itemName, "");
    // the fields only take typing while they are open, and only the three of them
    assert.equal(reduce(bookState(), { type: "bookField", field: "title", text: "Dune" }).book.title, "");
    assert.equal(reduce(open, { type: "bookField", field: "isbn", text: "1" }), open);
    assert.equal(reduce(open, { type: "bookFormat", format: "leather" }), open);
    // once the folder is on the PC what names the book is fixed until DONE
    const made = foundBook();
    assert.equal(reduce(made, { type: "bookManual", open: true }), made);
});

test("No ISBN: a valid ISBN closes the fields and is the book; anything else in the ISBN box is ignored", () => {
    const s = typedBook({ title: "Dune", author: "Herbert" });
    assert.equal(reduce(s, { type: "bookIsbn", isbn: "" }), s);
    const isbn = reduce(s, { type: "bookIsbn", isbn: ISBN });
    assert.equal(isbn.book.manual, false);
    assert.equal(isbn.book.title, "");
    assert.equal(isbn.book.isbn, ISBN);
    assert.equal(isbn.itemName, `Book ${ISBN}`);
});

test("No ISBN: the title names the folder when he stops typing, cleaned and capped like a goods name", () => {
    let s = reduce(typedBook({ title: "" }), { type: "add", id: "b1", name: "Book-1.jpg", n: 1 });
    // nothing typed: the photo waits, and the lines say for what
    assert.deepEqual(venueButton(s, "ebay", true), { enabled: false, hint: TITLE_WAIT_HINT });
    assert.equal(TITLE_WAIT_HINT, "Type the title so the photos can go to the PC, or remove them with their x");
    assert.deepEqual(doneButton(s), { enabled: false, hint: TITLE_WAIT_HINT });
    assert.equal(progressLine(s), "1 photo, waiting for the title");
    s = reduce(s, { type: "bookField", field: "title", text: 'Dune: "Messiah" / part 2?' });
    assert.equal(s.itemName, "", "not while typing: a half-typed title would name the folder");
    s = reduce(s, { type: "bookName" });
    assert.equal(s.itemName, "Book Dune Messiah part 2");
    assert.equal(s.photos[0].name, "Book Dune Messiah part 2-1.jpg");
    assert.equal(progressLine(s), "1 photo, 0 on the PC");
    assert.equal(reduce(s, { type: "bookName" }), s, "the same name again changes nothing");
    const long = reduce(reduce(s, { type: "bookField", field: "title", text: "A".repeat(80) }), { type: "bookName" });
    assert.equal(long.itemName, `Book ${"A".repeat(55)}`);
    assert.equal(long.itemName.length, MAX_ITEM_NAME);
    // the folder made: an edit to the title no longer renames it
    const made = listedBook();
    const edited = reduce(reduce(made, { type: "bookField", field: "title", text: "Dune Messiah" }), {
        type: "bookName",
    });
    assert.equal(edited.itemName, made.itemName);
    assert.equal(edited.book.title, "Dune Messiah", "but the title itself may still be fixed");
});

test("No ISBN: the lookup by title -- a match fills the card, the price and the format chip", () => {
    let s = reduce(typedBook({ title: "Dune", author: "Frank Herbert" }), { type: "bookName" });
    const key = lookupKey(s.book);
    assert.equal(key, JSON.stringify(["Dune", "Frank Herbert", ""]));
    assert.equal(bookCard(s.book).status, "Looking up “Dune”…");
    s = reduce(s, { type: "bookLookupStart", key });
    assert.equal(s.book.lookup.phase, "looking");
    assert.equal(s.book.lookup.by, "title");
    // an ISBN's answer is not this book's
    assert.equal(reduce(s, { type: "bookLookupDone", isbn: ISBN, answer: ANSWER }), s);
    s = reduce(s, { type: "bookLookupDone", key, answer: MATCH });
    assert.equal(s.book.lookup.phase, "found");
    assert.equal(s.book.lookup.matched, true);
    assert.equal(s.book.price, "40", "the suggestion fills the price box");
    assert.equal(s.book.format, "hardcover", "the catalogue says hardcover: the chip follows");
    assert.deepEqual(bookCard(s.book), {
        hidden: false,
        status: "",
        kind: "",
        title: "Dune",
        authors: "Frank Herbert",
        details: "Chilton Books · 1965 · Hardcover · 412 pages",
        note: MATCHED,
    });
    assert.equal(MATCHED, "matched in the catalogues");
    assert.equal(priceNote(s.book.lookup), "eBay: 7 listings, $25–$90 · suggested $40");
    // a chip he tapped himself is his
    let chosen = reduce(typedBook(), { type: "bookFormat", format: "paperback" });
    const k = lookupKey(chosen.book);
    chosen = reduce(chosen, { type: "bookLookupDone", key: k, answer: MATCH });
    assert.equal(chosen.book.format, "paperback");
});

test("No ISBN: a title no catalogue knows is listed as typed, not sent to goods", () => {
    const answer = { ...MATCH, found: false, title: "", authors: [], publisher: "", year: "", format: "", pages: 0, price: "6" };
    let s = reduce(typedBook({ title: "Grandma's  recipes", author: "Ann Smith", year: "1972" }), { type: "bookName" });
    s = reduce(s, { type: "bookFormat", format: "hardcover" });
    const key = lookupKey(s.book);
    s = reduce(s, { type: "bookLookupDone", key, answer });
    assert.equal(s.book.lookup.phase, "found");
    assert.equal(s.book.lookup.matched, false);
    assert.deepEqual(bookCard(s.book), {
        hidden: false,
        status: "",
        kind: "",
        title: "Grandma's recipes",
        authors: "Ann Smith",
        details: "1972 · Hardcover",
        note: LISTED_AS_TYPED,
    });
    assert.equal(LISTED_AS_TYPED, "Not in the catalogues: it will be listed as typed");
    assert.equal(s.book.price, "6", "eBay's price for the title still fills the box");
    assert.equal(venueButton(s, "ebay", true).hint, "Snap the cover first");
    // a 404 by title is the PC's words, never "post it as goods"
    const k = lookupKey(s.book);
    const nf = reduce(s, { type: "bookLookupFailed", key: k, status: 404, error: "Not Found" });
    assert.equal(nf.book.lookup.phase, "failed");
    assert.equal(bookCard(nf.book).status, "Not Found");
});

test("No ISBN: an edit that changes the question starts it afresh; a half-typed year does not", () => {
    const s = searchedBook(MATCH, { title: "Dune", author: "Herbert" });
    assert.equal(s.book.lookup.phase, "found");
    const year = reduce(s, { type: "bookField", field: "year", text: "19" });
    assert.equal(year.book.lookup.phase, "found", "not a year yet: the same question");
    const whole = reduce(year, { type: "bookField", field: "year", text: "1965" });
    assert.equal(whole.book.lookup.phase, "idle", "a year now: the answer is for another question");
    const spaced = reduce(s, { type: "bookField", field: "title", text: "Dune " });
    assert.equal(spaced.book.lookup.phase, "found", "a trailing space asks nothing new");
    // an answer for the old question arriving late is dropped
    const late = reduce(whole, { type: "bookLookupDone", key: lookupKey(s.book), answer: MATCH });
    assert.equal(late, whole);
});

test("No ISBN: a later answer replaces the page's own suggestion, never a price he typed", () => {
    const s = searchedBook(MATCH, { title: "Dune" });
    assert.equal(s.book.price, "40");
    // he types the author: a better match, a new suggestion
    let more = reduce(s, { type: "bookField", field: "author", text: "Frank Herbert" });
    more = reduce(more, { type: "bookLookupDone", key: lookupKey(more.book), answer: { ...MATCH, price: "35" } });
    assert.equal(more.book.price, "35");
    // his own price wins over every answer after it
    let his = reduce(s, { type: "bookPrice", text: "45" });
    his = reduce(his, { type: "bookField", field: "author", text: "Frank Herbert" });
    his = reduce(his, { type: "bookLookupDone", key: lookupKey(his.book), answer: { ...MATCH, price: "35" } });
    assert.equal(his.book.price, "45");
    // and a suggestion the new answer does not have is not left standing
    let none = reduce(s, { type: "bookField", field: "author", text: "Brian Herbert" });
    none = reduce(none, {
        type: "bookLookupDone",
        key: lookupKey(none.book),
        answer: { ...MATCH, price: null, listings: null },
    });
    assert.equal(none.book.price, "");
});

test("No ISBN: the ebay button asks for the title, waits for the answer, then as for any book", () => {
    const hint = (s) => venueButton(s, "ebay", true).hint;
    assert.equal(NO_BOOK_HINT, "Scan the ISBN, or tap No ISBN and type the title");
    assert.equal(hint(bookState()), NO_BOOK_HINT);
    assert.equal(hint(typedBook({ title: "  " })), "Type the book's title first");
    const named = reduce(typedBook(), { type: "bookName" });
    assert.equal(hint(named), "Looking the book up...");
    const failed = reduce(named, {
        type: "bookLookupFailed",
        key: lookupKey(named.book),
        status: 502,
        error: "the catalogues could not be reached",
    });
    assert.equal(hint(failed), "The book was not looked up - edit the title to try again");
    assert.equal(bookCard(failed.book).status, "the catalogues could not be reached");
    assert.equal(failed.book.title, "Dune", "the fields are kept");
    assert.equal(hint(searchedBook()), "Snap the cover first");
    assert.deepEqual(venueButton(listedBook(), "ebay", true), { enabled: true, hint: "" });
    // DONE clears a typed book with no photo, as it does an ISBN's
    assert.equal(doneButton(typedBook()).enabled, true);
    assert.equal(doneButton(typedBook({ title: "" })).enabled, false);
});

test("No ISBN: the job carries the title, author, year and format, and an empty ISBN", () => {
    let s = reduce(listedBook(2), { type: "bookField", field: "author", text: " Frank  Herbert " });
    s = reduce(s, { type: "bookField", field: "year", text: "1965" });
    s = reduce(s, { type: "bookCondition", condition: "acceptable" });
    s = reduce(s, { type: "bookMain", id: "b2" });
    assert.deepEqual(jobRequest({ venue: "ebay", item: s.itemId, photos: s.photos, book: bookForm(s) }), {
        item: "Book Dune 2026-09-28",
        venue: "ebay",
        book: {
            isbn: "",
            title: "Dune",
            author: "Frank Herbert",
            year: "1965",
            format: "hardcover",
            condition: "acceptable",
            price: "40",
            main: 2,
        },
    });
    // a half-typed year is not a year
    const partial = reduce(s, { type: "bookField", field: "year", text: "196" });
    assert.equal(bookForm(partial).year, "");
});

test("No ISBN: the typed book is kept for a reload and read back, fields, match and all", () => {
    let s = reduce(listedBook(2), { type: "bookFormat", format: "paperback" });
    s = reduce(s, { type: "bookField", field: "year", text: "1965" });
    const saved = savedItem(s);
    assert.equal(saved.manual, true);
    assert.equal(saved.isbn, "");
    assert.deepEqual([saved.title, saved.author, saved.year, saved.format], ["Dune", "", "1965", "paperback"]);
    assert.equal(saved.itemName, "Book Dune");
    // the year made it a new question: the old answer is not saved as this book's
    assert.equal(saved.lookup, null);
    const kept = savedItem(listedBook(1));
    assert.deepEqual([kept.lookup.by, kept.lookup.matched], ["title", true]);
    const back = reduce(bookState(), {
        type: "recovered",
        mode: "book",
        itemName: kept.itemName,
        itemId: kept.itemId,
        book: JSON.parse(JSON.stringify(kept)),
        answer: { item: kept.itemId, photos: [1], note: "", sku: null, jobs: [] },
    });
    assert.equal(back.book.manual, true);
    assert.equal(back.book.title, "Dune");
    assert.equal(back.book.format, "hardcover");
    assert.equal(back.book.lookup.phase, "found");
    assert.equal(back.book.lookup.matched, true);
    assert.equal(back.book.price, "40");
    assert.equal(bookCard(back.book).note, MATCHED);
    assert.deepEqual(venueButton(back, "ebay", true), { enabled: true, hint: "" });
    // a manual save's stray ISBN is ignored: the title is the book
    const odd = reduce(bookState(), {
        type: "recovered",
        mode: "book",
        itemName: kept.itemName,
        itemId: kept.itemId,
        book: { ...kept, isbn: ISBN },
        answer: { photos: [1] },
    });
    assert.equal(odd.book.isbn, "");
});

// --- books: an ISBN no catalogue knows ---------------------------------------------------
// Michal, 2026-09-28: he scanned 9781926856155, the catalogues did not know it, and the
// card said "Post it as goods instead" -- a dead end. Now No ISBN is the next step, and
// it keeps the ISBN: the title is typed and searched, and the job carries both.

const MISS = "9781926856155";
const MISS_DETAIL = `${MISS} is not in the catalogues (no Google Books key is set)`;

/** An ISBN scanned (n covers snapped meanwhile) and asked about: the PC's 404. */
function missedBook(n = 0) {
    let s = reduce(bookState(), { type: "bookIsbn", isbn: MISS });
    for (let i = 1; i <= n; i += 1) s = reduce(s, { type: "add", id: `m${i}`, name: `Book ${MISS}-${i}.jpg`, n: i });
    s = reduce(s, { type: "bookLookupStart", key: MISS });
    return reduce(s, { type: "bookLookupFailed", key: MISS, status: 404, error: MISS_DETAIL });
}

/** The folder made on the PC and every photo sent. */
function onPc(s) {
    const item = { kind: "item", name: s.itemName };
    let next = reduce(reduce(s, { type: "taskStart", task: item }), {
        type: "taskDone",
        task: item,
        answer: { item: `${s.itemName} 2026-09-28`, photos: [] },
    });
    for (const p of next.photos) {
        const task = { kind: "photo", id: p.id, n: p.n };
        next = reduce(reduce(next, { type: "taskStart", task }), { type: "taskDone", task, answer: {} });
    }
    return next;
}

test("an ISBN no catalogue knows: No ISBN is the next step, and it keeps the ISBN", () => {
    const s = missedBook();
    assert.equal(s.book.isbnMiss, true);
    assert.equal(bookCard(s.book).status, ISBN_MISS);
    assert.equal(bookCard(s.book).note, MISS_DETAIL, "the PC's words, in the small line");
    assert.equal(venueButton(s, "ebay", true).hint, ISBN_MISS_HINT);
    assert.equal(doneButton(s).enabled, true, "DONE can still clear it");

    const open = reduce(s, { type: "bookManual", open: true });
    assert.equal(open.book.manual, true);
    assert.equal(open.book.isbn, MISS, "kept, not set aside");
    assert.equal(open.book.isbnMiss, true);
    assert.equal(open.itemName, `Book ${MISS}`, "the ISBN still names the folder");
    assert.equal(open.book.lookup.phase, "idle", "the next question is the title");
    assert.equal(isbnKept(open.book), `ISBN ${MISS} kept: it goes on the listing`);
    assert.equal(isbnKept(s.book), "", "said only once the fields are open");
    assert.equal(isbnKept(typedBook().book), "", "No ISBN on a book without one keeps nothing");
    assert.equal(lookupKey(open.book), "", "nothing to search until the title is typed");
    assert.equal(venueButton(open, "ebay", true).hint, "Type the book's title first");
    assert.equal(doneButton(open).enabled, true);

    // the title typed: it does not rename the folder, it is what is searched
    let t = reduce(open, { type: "bookField", field: "title", text: "Coast  Salish recipes" });
    t = reduce(t, { type: "bookField", field: "author", text: "Ann Smith" });
    t = reduce(t, { type: "bookName" });
    assert.equal(t.itemName, `Book ${MISS}`);
    const key = lookupKey(t.book);
    assert.equal(key, JSON.stringify(["Coast Salish recipes", "Ann Smith", ""]));
    t = reduce(t, { type: "bookLookupStart", key });
    assert.equal(t.book.lookup.by, "title");
    const answer = { ...MATCH, found: false, title: "", authors: [], publisher: "", year: "", format: "", pages: 0, price: "9" };
    t = reduce(t, { type: "bookLookupDone", key, answer });
    assert.equal(t.book.lookup.phase, "found");
    assert.equal(t.book.isbnMiss, true, "found by title: the ISBN is still one no catalogue knows");
    assert.equal(t.book.price, "9");
    assert.equal(bookCard(t.book).title, "Coast Salish recipes");
    assert.equal(bookCard(t.book).note, LISTED_AS_TYPED);
    assert.equal(venueButton(t, "ebay", true).hint, "Snap the cover first");
});

test("an ISBN no catalogue knows: the job carries the ISBN and the typed fields both", () => {
    // the cover went to the PC under the ISBN before the miss was known: No ISBN still opens
    let s = onPc(missedBook(2));
    assert.equal(s.itemId, `Book ${MISS} 2026-09-28`);
    s = reduce(s, { type: "bookManual", open: true });
    assert.equal(s.book.manual, true, "the fields only describe the book: the folder stays as it is");
    for (const [field, text] of [
        ["title", " Coast Salish  recipes "],
        ["author", "Ann Smith"],
        ["year", "1998"],
    ]) {
        s = reduce(s, { type: "bookField", field, text });
    }
    s = reduce(s, { type: "bookFormat", format: "hardcover" });
    const key = lookupKey(s.book);
    s = reduce(s, { type: "bookLookupDone", key, answer: { ...MATCH, found: false, price: "9" } });
    s = reduce(s, { type: "bookMain", id: "m2" });
    assert.deepEqual(venueButton(s, "ebay", true), { enabled: true, hint: "" });
    assert.deepEqual(jobRequest({ venue: "ebay", item: s.itemId, photos: s.photos, book: bookForm(s) }), {
        item: `Book ${MISS} 2026-09-28`,
        venue: "ebay",
        book: {
            isbn: MISS,
            title: "Coast Salish recipes",
            author: "Ann Smith",
            year: "1998",
            format: "hardcover",
            condition: "good",
            price: "9",
            main: 2,
        },
    });
    // without a miss No ISBN is grey once the folder is made, as before
    const made = foundBook();
    assert.equal(reduce(made, { type: "bookManual", open: true }), made);
});

test("an ISBN no catalogue knows: a new ISBN clears the miss; closing the fields keeps the ISBN", () => {
    const open = reduce(missedBook(), { type: "bookManual", open: true });
    const typed = reduce(open, { type: "bookField", field: "title", text: "Coast Salish recipes" });
    // the kept ISBN typed again, or anything not an ISBN: nothing changes
    assert.equal(reduce(typed, { type: "bookIsbn", isbn: MISS }), typed);
    assert.equal(reduce(typed, { type: "bookIsbn", isbn: "" }), typed);
    // a valid new one replaces it and closes the fields, as ever
    const other = reduce(typed, { type: "bookIsbn", isbn: ISBN });
    assert.equal(other.book.isbn, ISBN);
    assert.equal(other.book.isbnMiss, false);
    assert.equal(other.book.manual, false);
    assert.equal(other.book.title, "");
    assert.equal(other.itemName, `Book ${ISBN}`);
    assert.equal(bookForm(other).title, "");
    // No ISBN again: the typed fields go, the ISBN stays, and it is asked about afresh
    const closed = reduce(typed, { type: "bookManual", open: false });
    assert.equal(closed.book.manual, false);
    assert.equal(closed.book.title, "");
    assert.equal(closed.book.isbn, MISS);
    assert.equal(closed.book.isbnMiss, true);
    assert.equal(closed.book.lookup.phase, "idle");
    assert.equal(lookupKey(closed.book), MISS);
    // ... and should a catalogue know it by then, it is no miss any more
    const found = reduce(closed, { type: "bookLookupDone", key: MISS, answer: ANSWER });
    assert.equal(found.book.isbnMiss, false);
    // a miss by title is no ISBN miss
    const byTitle = typedBook();
    const failed = reduce(byTitle, { type: "bookLookupFailed", key: lookupKey(byTitle.book), status: 404, error: "" });
    assert.equal(failed.book.isbnMiss, false);
});

test("an ISBN no catalogue knows is kept for a reload, the miss with it", () => {
    let s = onPc(missedBook(1));
    s = reduce(s, { type: "bookManual", open: true });
    s = reduce(s, { type: "bookField", field: "title", text: "Coast Salish recipes" });
    const key = lookupKey(s.book);
    s = reduce(s, { type: "bookLookupDone", key, answer: { ...MATCH, found: false, price: "9" } });
    const saved = savedItem(s);
    assert.deepEqual(
        [saved.isbn, saved.isbnMiss, saved.manual, saved.title, saved.lookup.by],
        [MISS, true, true, "Coast Salish recipes", "title"]
    );
    const back = reduce(bookState(), {
        type: "recovered",
        mode: "book",
        itemName: saved.itemName,
        itemId: saved.itemId,
        book: JSON.parse(JSON.stringify(saved)),
        answer: { item: saved.itemId, photos: [1], note: "", sku: null, jobs: [] },
    });
    assert.deepEqual(
        [back.book.isbn, back.book.isbnMiss, back.book.manual, back.book.title, back.book.lookup.phase],
        [MISS, true, true, "Coast Salish recipes", "found"]
    );
    assert.equal(bookForm(back).isbn, MISS);
    assert.equal(bookForm(back).title, "Coast Salish recipes");
    // the miss with the fields closed comes back as a miss: the page asks again
    const shut = savedItem(onPc(missedBook(1)));
    const again = reduce(bookState(), {
        type: "recovered",
        mode: "book",
        itemName: shut.itemName,
        itemId: shut.itemId,
        book: shut,
        answer: { photos: [1] },
    });
    assert.deepEqual([again.book.isbn, again.book.isbnMiss, again.book.lookup.phase], [MISS, true, "idle"]);
});

// --- customize: the quantity and pickup only ---------------------------------------
// Michal, 2026-09-28: a little arrow with the word customize before the buttons,
// to edit the quantity and tick pickup only ("a pickup only item on eBay then").

test("customize starts at one, shipped, a quick sale, posted, for goods and books alike", () => {
    assert.deepEqual(initialCustomize(), { quantity: "1", pickupOnly: false, pricing: 1, autoPost: true });
    assert.deepEqual(initialState("x").customize, initialCustomize());
    assert.deepEqual(bookState().book.customize, initialCustomize());
    const goods = initialState("x");
    assert.equal(customizeOf(goods), goods.customize);
    // a book's is its own, in the book slice
    const book = reduce(bookState(), { type: "setQuantity", text: "3" });
    assert.equal(customizeOf(book).quantity, "3");
    assert.equal(book.book.customize.quantity, "3");
    assert.equal(book.customize.quantity, "1", "the goods customize is not the book's");
});

test("the quantity: a whole number, 1 or more; anything else is 0", () => {
    for (const [typed, n] of [
        ["1", 1],
        ["2", 2],
        [" 12 ", 12],
        ["02", 2],
        [3, 3],
    ]) {
        assert.equal(quantityValue(typed), n, JSON.stringify(typed));
    }
    for (const bad of ["", " ", "0", "00", "-1", "1.5", "2,0", "two", "1e3", null, undefined, 2.5]) {
        assert.equal(quantityValue(bad), 0, JSON.stringify(bad));
    }
});

test("a bad quantity shuts the venue buttons with the hint, in both modes", () => {
    assert.equal(QUANTITY_HINT, "Quantity (under customize) must be a whole number, 1 or more");
    const goods = reduce(sent(2, [1]), { type: "setQuantity", text: "0" });
    for (const venue of ["ebay", "craigslist"]) {
        assert.deepEqual(venueButton(goods, venue, true), { enabled: false, hint: QUANTITY_HINT });
    }
    // the second button too: the quantity goes with it
    const saved = reduce(goods, { type: "jobStatus", venue: "ebay", status: { state: "done", sku: "B-1" } });
    assert.deepEqual(venueButton(saved, "craigslist", true), { enabled: false, hint: QUANTITY_HINT });
    assert.equal(venueButton(reduce(goods, { type: "setQuantity", text: "2" }), "ebay", true).enabled, true);
    const book = reduce(foundBook(), { type: "setQuantity", text: "x" });
    assert.deepEqual(venueButton(book, "ebay", true), { enabled: false, hint: QUANTITY_HINT });
    assert.equal(venueButton(reduce(book, { type: "setQuantity", text: "4" }), "ebay", true).enabled, true);
});

test("the job body carries quantity and pickup_only only when they are not the default", () => {
    assert.deepEqual(customizeBody(undefined), {});
    assert.deepEqual(customizeBody(initialCustomize()), {});
    assert.deepEqual(customizeBody({ quantity: "2", pickupOnly: false }), { quantity: 2 });
    assert.deepEqual(customizeBody({ quantity: "1", pickupOnly: true }), { pickup_only: true });

    let s = sent(2, [2]);
    const body = (x) => jobRequest({ venue: "ebay", sku: x.sku, item: x.itemId, photos: x.photos, customize: customizeOf(x) });
    // left alone: the body is exactly what it always was
    assert.equal(JSON.stringify(body(s)), `{"item":"${ITEM}","venue":"ebay","ai":[2]}`);
    s = reduce(s, { type: "setQuantity", text: "2" });
    s = reduce(s, { type: "setPickupOnly", on: true });
    assert.deepEqual(body(s), { item: ITEM, venue: "ebay", ai: [2], quantity: 2, pickup_only: true });
    // the saved row's job carries them too: the PC updates the row before it posts
    const saved = { ...s, sku: "B-9" };
    assert.deepEqual(
        jobRequest({ venue: "craigslist", sku: "B-9", customize: customizeOf(saved) }),
        { sku: "B-9", venue: "craigslist", quantity: 2, pickup_only: true }
    );
    // a book: top-level, beside the book
    let b = reduce(foundBook(), { type: "setPickupOnly", on: true });
    b = reduce(b, { type: "setQuantity", text: "3" });
    const bookBody = jobRequest({ venue: "ebay", item: b.itemId, photos: b.photos, book: bookForm(b), customize: customizeOf(b) });
    assert.equal(bookBody.quantity, 3);
    assert.equal(bookBody.pickup_only, true);
    assert.equal(bookBody.book.isbn, ISBN);
    assert.equal("quantity" in bookBody.book, false);
});

test("pickup only shows under ebay while idle, and only there", () => {
    const s = reduce(sent(1, [1]), { type: "setPickupOnly", on: true });
    assert.equal(PICKUP_NOTE, "pickup only");
    assert.equal(venueIdleNote(s, "ebay"), "pickup only");
    assert.equal(venueIdleNote(s, "craigslist"), "", "craigslist is pickup anyway");
    assert.equal(venueIdleNote(sent(1, [1]), "ebay"), "");
    assert.deepEqual(venueLine(s.jobs.ebay, venueIdleNote(s, "ebay")), { text: "pickup only", link: "", kind: "" });
    // pressed: the job's own line takes over
    const going = reduce(s, { type: "jobSending", venue: "ebay", step: "sending" });
    assert.equal(venueLine(going.jobs.ebay, venueIdleNote(going, "ebay")).text, "sending");
    const book = reduce(foundBook(), { type: "setPickupOnly", on: true });
    assert.equal(venueIdleNote(book, "ebay"), "pickup only");
});

test("customize is fixed while a job is on its way, free again after, and reset by DONE", () => {
    const s = reduce(sent(1, [1]), { type: "setQuantity", text: "2" });
    const going = reduce(s, { type: "jobAccepted", venue: "ebay", job: "j1", ahead: 0 });
    assert.equal(reduce(going, { type: "setQuantity", text: "5" }), going);
    assert.equal(reduce(going, { type: "setPickupOnly", on: true }), going);
    // the row saved and the job done: craigslist may still go with a new quantity
    const done = reduce(going, { type: "jobStatus", venue: "ebay", status: { state: "done", sku: "B-1" } });
    assert.equal(reduce(done, { type: "setQuantity", text: "3" }).customize.quantity, "3");
    assert.deepEqual(reduce(done, { type: "reset" }).customize, initialCustomize());
    const book = reduce(reduce(foundBook(), { type: "setPickupOnly", on: true }), { type: "reset" });
    assert.deepEqual(book.book.customize, initialCustomize());
    const bookGoing = reduce(foundBook(), { type: "jobSending", venue: "ebay", step: "sending" });
    assert.equal(reduce(bookGoing, { type: "setPickupOnly", on: true }), bookGoing);
});

test("customize is kept for a reload once it is not the default, and read back", () => {
    let s = reduce(sent(2, [1]), { type: "setQuantity", text: "2" });
    s = reduce(s, { type: "setPickupOnly", on: true });
    const saved = savedItem(s);
    assert.deepEqual(saved, {
        itemName: "Boots",
        itemId: ITEM,
        ai: [1],
        customize: { quantity: "2", pickupOnly: true },
    });
    const back = reduce(initialState(""), {
        type: "recovered",
        mode: "goods",
        itemName: saved.itemName,
        itemId: saved.itemId,
        ai: saved.ai,
        customize: JSON.parse(JSON.stringify(saved.customize)),
        answer: { item: ITEM, photos: [1, 2] },
    });
    assert.deepEqual(back.customize, { ...initialCustomize(), quantity: "2", pickupOnly: true });
    // nothing saved (an item from before customize): the default
    const old = reduce(initialState(""), { type: "recovered", itemName: "Boots", itemId: ITEM, answer: { photos: [1] } });
    assert.deepEqual(old.customize, initialCustomize());

    const book = reduce(foundBook(), { type: "setPickupOnly", on: true });
    const bookSaved = savedItem(book);
    assert.deepEqual(bookSaved.customize, { quantity: "1", pickupOnly: true });
    const bookBack = reduce(bookState(), {
        type: "recovered",
        mode: "book",
        itemName: bookSaved.itemName,
        itemId: bookSaved.itemId,
        book: JSON.parse(JSON.stringify(bookSaved)),
        answer: { photos: [1] },
    });
    assert.deepEqual(bookBack.book.customize, { ...initialCustomize(), pickupOnly: true });
    assert.equal("customize" in savedItem(foundBook()), false, "left alone: saved as it always was");
});

// --- customize: the price grade and auto-post (Michal, 2026-10-06) ------------------
// "a slider for price preference (3 grade) 1 (quicksell what we have) 2 (fair price
// longer wait time) 3 (higher end price - probably cheaper options exist in the
// marketplace). these need to be reflected in the prompt. 1 by default." and "a
// checkbox for post without asking - which is our default now."

test("the price grade: three steps in Michal's words, 1 by default; odd input is not a grade", () => {
    assert.equal(DEFAULT_PRICING, 1);
    assert.deepEqual(
        PRICING.map((p) => [p.grade, p.word, p.note]),
        [
            [1, "Quick sale", "sell what we have this week"],
            [2, "Fair price", "a fair price, a longer wait"],
            [3, "Higher end", "a higher-end price; cheaper ones exist out there"],
        ]
    );
    for (const [x, grade] of [
        [1, 1],
        [2, 2],
        [3, 3],
        ["2", 2],
        [" 3 ", 3],
    ]) {
        assert.equal(pricingGrade(x), grade, JSON.stringify(x));
    }
    for (const bad of [0, 4, 1.5, "", "two", null, undefined, true]) {
        assert.equal(pricingGrade(bad), 0, JSON.stringify(bad));
    }
    assert.equal(pricingOf(3).word, "Higher end");
    assert.equal(pricingOf("x").word, "Quick sale", "anything else reads as the default");
});

test("setPricing and setAutoPost: this kind's own, fixed while a job is on its way, reset by NEXT", () => {
    let s = reduce(sent(1, [1]), { type: "setPricing", grade: "2" });
    assert.equal(s.customize.pricing, 2);
    assert.equal(reduce(s, { type: "setPricing", grade: "9" }), s, "not a grade: nothing changes");
    s = reduce(s, { type: "setAutoPost", on: false });
    assert.equal(s.customize.autoPost, false);
    assert.equal(reduce(s, { type: "setAutoPost", on: true }).customize.autoPost, true);
    const going = reduce(s, { type: "jobSending", venue: "ebay", step: "sending" });
    assert.equal(reduce(going, { type: "setPricing", grade: 3 }), going);
    assert.equal(reduce(going, { type: "setAutoPost", on: true }), going);
    assert.deepEqual(reduce(s, { type: "reset" }).customize, initialCustomize());
    // a book's is in its slice
    const book = reduce(reduce(foundBook(), { type: "setPricing", grade: 3 }), { type: "setAutoPost", on: false });
    assert.deepEqual([book.book.customize.pricing, book.book.customize.autoPost], [3, false]);
    assert.deepEqual(book.customize, initialCustomize(), "the goods customize is not the book's");
    assert.deepEqual(reduce(book, { type: "reset" }).book.customize, initialCustomize());
});

test("the body carries pricing only when not 1 and auto_post only when off, in all three bodies", () => {
    const c = (o) => ({ ...initialCustomize(), ...o });
    assert.deepEqual(customizeBody(c({ pricing: 1 })), {});
    assert.deepEqual(customizeBody(c({ pricing: 2 })), { pricing: 2 });
    assert.deepEqual(customizeBody(c({ pricing: 3, autoPost: false })), { pricing: 3, auto_post: false });
    assert.deepEqual(customizeBody(c({ autoPost: true })), {});
    // a customize saved before the grade existed sends nothing new
    assert.deepEqual(customizeBody({ quantity: "1", pickupOnly: false }), {});

    let s = sent(2, [2]);
    s = reduce(s, { type: "setPricing", grade: 2 });
    s = reduce(s, { type: "setAutoPost", on: false });
    assert.equal(
        JSON.stringify(jobRequest({ venue: "ebay", item: s.itemId, photos: s.photos, customize: customizeOf(s) })),
        `{"item":"${ITEM}","venue":"ebay","ai":[2],"pricing":2,"auto_post":false}`
    );
    assert.deepEqual(jobRequest({ venue: "craigslist", sku: "B-9", customize: customizeOf(s) }), {
        sku: "B-9",
        venue: "craigslist",
        pricing: 2,
        auto_post: false,
    });
    const b = reduce(foundBook(), { type: "setPricing", grade: 3 });
    const bookBody = jobRequest({ venue: "ebay", item: b.itemId, book: bookForm(b), customize: customizeOf(b) });
    assert.equal(bookBody.pricing, 3);
    assert.equal("pricing" in bookBody.book, false, "top-level, beside the book");
    assert.equal("auto_post" in bookBody, false);
});

test("the idle line says what customize changed, joined with a middle dot", () => {
    let s = sent(1, [1]);
    assert.equal(venueIdleNote(s, "ebay"), "");
    s = reduce(s, { type: "setPricing", grade: 2 });
    assert.equal(venueIdleNote(s, "ebay"), "fair price");
    assert.equal(venueIdleNote(s, "craigslist"), "fair price", "the grade goes with both buttons");
    s = reduce(s, { type: "setPickupOnly", on: true });
    s = reduce(s, { type: "setAutoPost", on: false });
    assert.equal(venueIdleNote(s, "ebay"), "pickup only · fair price · saved, not posted");
    assert.equal(venueIdleNote(s, "craigslist"), "fair price · saved, not posted", "pickup only stays under ebay");
    s = reduce(s, { type: "setPricing", grade: 3 });
    assert.equal(venueIdleNote(s, "craigslist"), "higher end · saved, not posted");
    const book = reduce(foundBook(), { type: "setAutoPost", on: false });
    assert.equal(venueIdleNote(book, "ebay"), "saved, not posted");
});

test("auto-post off: done with no link is saved, not posted; the button opens and the next press posts", () => {
    assert.equal(SAVED_NOT_POSTED, "saved, not posted");
    let s = reduce(sent(1, [1]), { type: "setAutoPost", on: false });
    s = reduce(s, { type: "jobSending", venue: "ebay", step: "sending" });
    assert.equal(s.jobs.ebay.held, true, "this press saves the row");
    s = reduce(s, { type: "jobAccepted", venue: "ebay", job: "j1", ahead: 0 });
    assert.equal(s.jobs.ebay.held, true, "kept once the PC has the job");
    s = reduce(s, {
        type: "jobStatus",
        venue: "ebay",
        status: { state: "done", sku: "B-1", price: "14.00", title: "Lamp", links: {} },
    });
    assert.equal(savedNotPosted(s.jobs.ebay), true);
    assert.deepEqual(venueLine(s.jobs.ebay), { text: "saved, not posted", link: "", kind: "ok" });
    assert.equal(venueLabel(s.jobs.ebay, "ebay"), "ebay, saved, not posted");
    assert.deepEqual(venueButton(s, "ebay", true), { enabled: true, hint: "" });
    assert.equal(priceLine(s), "$14");
    // the next press posts: it is not held, so the body says nothing of auto_post
    const again = reduce(s, { type: "jobSending", venue: "ebay", step: "sending" });
    assert.equal(again.jobs.ebay.held, false);
    assert.deepEqual(
        jobRequest({ venue: "ebay", sku: again.sku, customize: { ...customizeOf(again), autoPost: !again.jobs.ebay.held } }),
        { sku: "B-1", venue: "ebay" }
    );
    // craigslist, still with auto-post off, is saved first too
    const cl = reduce(s, { type: "jobSending", venue: "craigslist", step: "sending" });
    assert.equal(cl.jobs.craigslist.held, true);
    // posted after all: the link, and shut as ever
    const posted = reduce(again, {
        type: "jobStatus",
        venue: "ebay",
        status: { state: "done", sku: "B-1", links: { ebay: "https://www.ebay.com/itm/1" } },
    });
    assert.equal(savedNotPosted(posted.jobs.ebay), false);
    assert.equal(venueButton(posted, "ebay", true).enabled, false);
    // auto-post on: done with no link is still just "done", and shut
    const plain = reduce(reduce(sent(1, [1]), { type: "jobSending", venue: "ebay" }), {
        type: "jobStatus",
        venue: "ebay",
        status: { state: "done", sku: "B-1", links: {} },
    });
    assert.deepEqual(venueLine(plain.jobs.ebay), { text: "done", link: "", kind: "ok" });
    assert.equal(venueButton(plain, "ebay", true).enabled, false);
    // a book opens again the same way
    let book = reduce(foundBook(), { type: "setAutoPost", on: false });
    book = reduce(book, { type: "jobSending", venue: "ebay" });
    book = reduce(book, { type: "jobStatus", venue: "ebay", status: { state: "done", sku: "B-2", links: {} } });
    assert.deepEqual(venueButton(book, "ebay", true), { enabled: true, hint: "" });
    assert.equal(venueLine(book.jobs.ebay).text, "saved, not posted");
});

test("the price grade and auto-post are kept for a reload only when not the default, and read back", () => {
    let s = reduce(sent(2, [1]), { type: "setPricing", grade: 3 });
    s = reduce(s, { type: "setAutoPost", on: false });
    const saved = savedItem(s);
    assert.deepEqual(saved.customize, { quantity: "1", pickupOnly: false, pricing: 3, autoPost: false });
    // only the one changed is written
    assert.deepEqual(savedItem(reduce(sent(1, [1]), { type: "setPricing", grade: 2 })).customize, {
        quantity: "1",
        pickupOnly: false,
        pricing: 2,
    });
    // set back to a quick sale, posted: saved as it always was
    const undone = reduce(reduce(s, { type: "setPricing", grade: 1 }), { type: "setAutoPost", on: true });
    assert.equal("customize" in savedItem(undone), false);
    const back = reduce(initialState(""), {
        type: "recovered",
        mode: "goods",
        itemName: saved.itemName,
        itemId: saved.itemId,
        ai: saved.ai,
        customize: JSON.parse(JSON.stringify(saved.customize)),
        // the PC saved the row unposted before the reload
        answer: { photos: [1, 2], sku: "B-1", jobs: [{ job: "j1", venue: "ebay", state: "done", sku: "B-1", links: {} }] },
    });
    assert.deepEqual(back.customize, { quantity: "1", pickupOnly: false, pricing: 3, autoPost: false });
    assert.equal(venueLine(back.jobs.ebay).text, "saved, not posted");
    assert.equal(venueButton(back, "ebay", true).enabled, true);
    // anything odd is the default
    const odd = reduce(initialState(""), {
        type: "recovered",
        itemName: "Boots",
        itemId: ITEM,
        customize: { quantity: "1", pricing: 7, autoPost: "no" },
        answer: { photos: [1] },
    });
    assert.deepEqual(odd.customize, initialCustomize());

    const book = reduce(foundBook(), { type: "setPricing", grade: 2 });
    const bookSaved = savedItem(book);
    assert.deepEqual(bookSaved.customize, { quantity: "1", pickupOnly: false, pricing: 2 });
    const bookBack = reduce(bookState(), {
        type: "recovered",
        mode: "book",
        itemName: bookSaved.itemName,
        itemId: bookSaved.itemId,
        book: JSON.parse(JSON.stringify(bookSaved)),
        answer: { photos: [1] },
    });
    assert.deepEqual(bookBack.book.customize, { ...initialCustomize(), pricing: 2 });
});

// --- Admin: the inventory (Michal, 2026-10-06) -----------------------------------------

test("the inventory's query: every key sent, each encoded, All as blank, the limit last", () => {
    assert.equal(INVENTORY_LIMIT, 200);
    assert.equal(INVENTORY_DEBOUNCE_MS, 400);
    assert.deepEqual(INVENTORY_VENUES, ["", "ebay", "craigslist"]);
    assert.deepEqual(INVENTORY_STATUSES, ["", "draft", "listed", "sold", "ended"]);
    assert.equal(inventoryQuery({}), "q=&venue=&status=&limit=200&sort=age&order=desc");
    assert.equal(
        inventoryQuery({ q: "  blue lamp & co ", venue: "ebay", status: "sold", sort: "price-asc" }),
        "q=blue%20lamp%20%26%20co&venue=ebay&status=sold&limit=200&sort=price&order=asc"
    );
    assert.equal(
        inventoryQuery({ q: "x", venue: "etsy", status: "lost", sort: "cheapest" }),
        "q=x&venue=&status=&limit=200&sort=age&order=desc",
        "unknown: All, newest first"
    );
});

test("the sort chips: newest first by default, then oldest, price high to low, low to high", () => {
    assert.deepEqual(
        INVENTORY_SORTS.map((s) => `${s.key} ${s.word}`),
        ["newest Newest", "oldest Oldest", "price-desc Price ↓", "price-asc Price ↑"]
    );
    assert.deepEqual(sortQuery("newest"), { sort: "age", order: "desc" });
    assert.deepEqual(sortQuery("oldest"), { sort: "age", order: "asc" });
    assert.deepEqual(sortQuery("price-desc"), { sort: "price", order: "desc" });
    assert.deepEqual(sortQuery("price-asc"), { sort: "price", order: "asc" });
    assert.deepEqual(sortQuery(""), { sort: "age", order: "desc" });
    assert.deepEqual(sortQuery("price"), { sort: "age", order: "desc" }, "not a chip: Newest");
});

test("the inventory's rows: only objects with a sku; the count line", () => {
    assert.deepEqual(inventoryRows(null), []);
    assert.deepEqual(inventoryRows({ rows: "no" }), []);
    assert.deepEqual(inventoryRows({ rows: [{ sku: "A" }, null, { title: "no sku" }, { sku: "" }, "B"] }), [{ sku: "A" }]);
    assert.equal(inventoryCount(0), "No listings match.");
    assert.equal(inventoryCount(1), "1 listing");
    assert.equal(inventoryCount(12), "12 listings");
    assert.equal(inventoryCount(200), "The newest 200 listings; search to narrow them.");
});

test("a row's price: whole dollars when .00, cents otherwise, nothing for none", () => {
    assert.equal(priceWord("24.00"), "$24");
    assert.equal(priceWord("24.50"), "$24.50");
    assert.equal(priceWord("24.5"), "$24.50");
    assert.equal(priceWord(14), "$14");
    assert.equal(priceWord(null), "");
    assert.equal(priceWord(""), "");
    assert.equal(priceWord("0.00"), "");
});

test("a venue's badge: listed green, sold and ended muted, a draft outlined", () => {
    assert.deepEqual(statusBadge("ebay", "listed"), { text: "ebay listed", kind: "posted" });
    assert.deepEqual(statusBadge("ebay", "sold"), { text: "ebay sold", kind: "muted" });
    assert.deepEqual(statusBadge("craigslist", "ended"), { text: "craigslist ended", kind: "muted" });
    assert.deepEqual(statusBadge("craigslist", "draft"), { text: "craigslist draft", kind: "draft" });
    assert.deepEqual(statusBadge("ebay", ""), { text: "ebay", kind: "draft" });
    assert.deepEqual(statusBadge("ebay", "paused"), { text: "ebay paused", kind: "draft" });
});

const ROW = {
    sku: "R5GM4XZN",
    title: "Brass lamp",
    price: "24.00",
    condition: "Used",
    category: "Lamps",
    category_path: "Home > Lighting > Lamps",
    quantity: 2,
    venues: ["ebay", "craigslist"],
    photos: [
        { n: 1, name: "R5GM4XZN-1.jpg" },
        { n: 3, name: "" },
        { n: 0, name: "bad" },
        { name: "no number" },
    ],
    note: "from the attic",
    isbn: "",
    pickup_only: true,
    model_cost: "0.1046",
    description: "Brass.\nWorks.",
    condition_note: "Light wear",
    source: "Lamp 2026-10-03",
    condition_details: { "Professional grader": "PSA" },
    aspects: { Brand: ["Acme"], Color: ["Brass", "Gold"], Empty: [] },
    package: { weight_oz: "5", length_in: "8", width_in: "6", height_in: "2" },
    craigslist: { title: "", price: "30.00", description: "Brass lamp, pickup in town", category: null },
    statuses: {
        ebay: {
            status: "listed",
            id: "257780366045",
            url: "https://www.ebay.com/itm/257780366045",
            listed_at: "2026-10-03T16:21:47-05:00",
        },
        craigslist: { status: "draft", id: "", url: "javascript:alert(1)", listed_at: null },
    },
};

test("a row's title, heading, badges, venues and photos", () => {
    assert.equal(rowTitle(ROW), "Brass lamp");
    assert.equal(rowTitle({ sku: "X1", title: " " }), "X1", "no title: the sku");
    assert.equal(rowHeading(ROW), "Brass lamp · $24");
    assert.equal(rowHeading({ sku: "X1", title: "Vase", price: null }), "Vase");
    // a listed badge carries its listing's link (Michal, 2026-10-06); any other is a word
    assert.deepEqual(rowBadges(ROW), [
        { text: "ebay listed", kind: "posted", link: "https://www.ebay.com/itm/257780366045" },
        { text: "craigslist draft", kind: "draft", link: "" },
    ]);
    assert.deepEqual(rowBadges({ sku: "X", venues: ["ebay"] }), [{ text: "ebay", kind: "draft", link: "" }]);
    const unsafe = { sku: "X", venues: ["craigslist"], statuses: { craigslist: { status: "listed", url: "javascript:alert(1)" } } };
    assert.deepEqual(rowBadges(unsafe), [{ text: "craigslist listed", kind: "posted", link: "" }], "only an http(s) link");
    const ended = { sku: "X", venues: ["ebay"], statuses: { ebay: { status: "ended", url: "https://www.ebay.com/itm/1" } } };
    assert.equal(rowBadges(ended)[0].link, "", "an ended listing's badge stays a word");
    // the venues a row is on: its `venues`, in the app's order
    assert.deepEqual(rowVenues(ROW), ["ebay", "craigslist"]);
    assert.deepEqual(rowVenues({ venues: ["craigslist", "etsy", "ebay"] }), ["ebay", "craigslist"]);
    assert.deepEqual(rowVenues({ venues: ["craigslist"], statuses: { ebay: {} } }), ["craigslist"]);
    assert.deepEqual(rowVenues({}), []);
    assert.deepEqual(rowPhotos(ROW), [
        { n: 1, name: "R5GM4XZN-1.jpg" },
        { n: 3, name: "photo 3" },
    ]);
    assert.deepEqual(rowPhotos({ photos: 5 }), [], "a summary counts its photos, it does not list them");
    assert.deepEqual(venueStatus(ROW, "craigslist"), { status: "draft", id: "", url: "", listedAt: "" }, "no javascript: link");
});

test("craigslist's four fields: the override, or what it is derived from on eBay", () => {
    assert.equal(DERIVED, "derived from eBay");
    assert.equal(CATEGORY_FROM_EBAY, "from the eBay category");
    // ROW: no title override, a price and a description typed, the category blank
    assert.deepEqual(derivedFields(ROW, "craigslist"), {
        title: { value: "Brass lamp", derived: true },
        price: { value: "30.00", derived: false },
        description: { value: "Brass lamp, pickup in town", derived: false },
        category: { value: "from the eBay category", derived: true },
    });
    const typed = { ...ROW, craigslist: { title: " Lamp ", price: "0", description: "  ", category: "household" } };
    assert.deepEqual(derivedFields(typed, "craigslist"), {
        title: { value: "Lamp", derived: false },
        price: { value: "24.00", derived: true },
        description: { value: "Brass.\nWorks.", derived: true },
        category: { value: "household", derived: false },
    });
    assert.deepEqual(derivedFields({ sku: "X" }, "craigslist"), {
        title: { value: "", derived: true },
        price: { value: "", derived: true },
        description: { value: "", derived: true },
        category: { value: CATEGORY_FROM_EBAY, derived: true },
    });
    assert.deepEqual(derivedFields(ROW, "ebay"), {});
});

test("when a listing went up: short, in the phone's own time", () => {
    assert.equal(listedAtWord("2026-10-03T16:21:47-05:00", -300), "2026-10-03 16:21");
    assert.equal(listedAtWord("2026-10-03T16:21:47-05:00", 120), "2026-10-03 23:21");
    assert.equal(listedAtWord("2026-10-03T23:30:00-05:00", 0), "2026-10-04 04:30", "the date moves with the time");
    assert.equal(listedAtWord(null), "");
    assert.equal(listedAtWord(""), "");
    assert.equal(listedAtWord("yesterday"), "yesterday", "not a date: as it came");
    // without an offset, the phone's own
    const t = new Date("2026-10-03T16:21:47-05:00");
    const own = listedAtWord("2026-10-03T16:21:47-05:00");
    assert.equal(own.slice(11), `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`);
});

test("the parcel and name: value lines", () => {
    assert.equal(packageWord(ROW.package), "5 oz, 8 x 6 x 2 in");
    assert.equal(packageWord({ weight_oz: "12", length_in: "", width_in: "6", height_in: "2" }), "12 oz");
    assert.equal(packageWord(null), "");
    assert.equal(namedLines(ROW.aspects), "Brand: Acme\nColor: Brass, Gold");
    assert.equal(namedLines({ Grade: "9", Blank: "" }), "Grade: 9");
    assert.equal(namedLines(null), "");
    assert.equal(namedLines(["a"]), "");
});

test("the eBay card: the listing as eBay has it; the status and link are its status line", () => {
    assert.deepEqual(venueFacts(ROW, "ebay"), [
        { label: "Title", value: "Brass lamp" },
        { label: "Price", value: "$24" },
        { label: "Condition", value: "Used" },
        { label: "Category", value: "Home > Lighting > Lamps" },
        { label: "Quantity", value: "2" },
        { label: "Pickup only", value: "yes, no shipping on eBay" },
        { label: "Description", value: "Brass.\nWorks.", pre: true },
        { label: "Note", value: "from the attic", pre: true },
        { label: "Condition note", value: "Light wear", pre: true },
        { label: "Aspects", value: "Brand: Acme\nColor: Brass, Gold", pre: true },
        { label: "Condition details", value: "Professional grader: PSA", pre: true },
        { label: "Package", value: "5 oz, 8 x 6 x 2 in" },
        { label: "Model cost", value: "$0.1046" },
    ]);
    // a book: the ISBN; quantity and pickup only always, the rest only when there
    assert.deepEqual(venueFacts({ sku: "B", category: "Books", isbn: "9780306406157", model_cost: null }, "ebay"), [
        { label: "Category", value: "Books" },
        { label: "Quantity", value: "1" },
        { label: "Pickup only", value: "no" },
        { label: "ISBN", value: "9780306406157", mono: true },
    ]);
    assert.deepEqual(venueFacts(ROW, "etsy"), []);
});

test("the craigslist card: its four fields, each the override or the eBay value marked derived", () => {
    assert.deepEqual(venueFacts(ROW, "craigslist"), [
        { label: "Title", value: "Brass lamp", derived: true },
        { label: "Price", value: "$30", derived: false },
        { label: "Description", value: "Brass lamp, pickup in town", pre: true, derived: false },
        { label: "Category", value: "from the eBay category", derived: true },
    ]);
    const bare = venueFacts({ sku: "X", title: "Vase", price: "12.50", venues: ["craigslist"] }, "craigslist");
    assert.deepEqual(bare.map((f) => `${f.label}: ${f.value}${f.derived ? " (derived)" : ""}`), [
        "Title: Vase (derived)",
        "Price: $12.50 (derived)",
        "Description:  (derived)",
        "Category: from the eBay category (derived)",
    ]);
});

test("a card's status line: the status word and when it went up", () => {
    assert.equal(venueStatusLine(ROW, "ebay", -300), "listed since 2026-10-03 16:21");
    assert.equal(venueStatusLine(ROW, "craigslist"), "draft");
    const sold = { venues: ["ebay"], statuses: { ebay: { status: "sold", listed_at: "2026-10-01T09:00:00Z" } } };
    assert.equal(venueStatusLine(sold, "ebay", 0), "sold · listed 2026-10-01 09:00");
    assert.equal(venueStatusLine({ venues: ["craigslist"] }, "craigslist"), "not posted yet", "added, no status yet");
});

test("a card's actions: add when not on the venue, post when not listed, open/refresh/end when listed, edit", () => {
    assert.deepEqual(venueActions(ROW, "ebay"), ["open", "refresh", "end", "edit"]);
    assert.deepEqual(venueActions(ROW, "craigslist"), ["post", "edit"]);
    const ebayOnly = { ...ROW, venues: ["ebay"] };
    assert.deepEqual(venueActions(ebayOnly, "craigslist"), ["add"]);
    const noLink = { venues: ["craigslist"], statuses: { craigslist: { status: "listed", url: "" } } };
    assert.deepEqual(venueActions(noLink, "craigslist"), ["refresh", "end", "edit"], "listed with no link: nothing to open");
    for (const status of ["ended", "sold", "draft", ""]) {
        const row = { venues: ["ebay"], statuses: { ebay: { status, url: "https://www.ebay.com/itm/1" } } };
        assert.deepEqual(venueActions(row, "ebay"), ["post", "edit"], `${status || "no status"}: post it`);
    }
    assert.deepEqual(venueActions({ venues: ["craigslist"] }, "craigslist"), ["post", "edit"]);
    assert.deepEqual(
        ["add", "post", "open", "refresh", "end", "edit"].map((a) => actionWord(a, "craigslist")),
        ["Add craigslist to this item", "Post on craigslist", "Open listing", "Refresh status", "End listing", "Edit"]
    );
    assert.equal(endQuestion("ebay"), "End this listing on ebay?");
});

test("the action jobs' bodies: end and refresh carry the sku and venue, a sync its direction", () => {
    assert.deepEqual(actionJob("end", { sku: "R5", venue: "ebay" }), { action: "end", sku: "R5", venue: "ebay" });
    assert.deepEqual(actionJob("refresh", { sku: "R5", venue: "craigslist" }), {
        action: "refresh",
        sku: "R5",
        venue: "craigslist",
    });
    assert.deepEqual(actionJob("sync", { direction: "from" }), { action: "sync", direction: "from" });
    assert.deepEqual(actionJob("sync", { direction: "to", sku: "R5" }), { action: "sync", direction: "to" });
    assert.throws(() => actionJob("sync", { direction: "sideways" }), RangeError);
    assert.throws(() => actionJob("end", { venue: "ebay" }), RangeError);
    assert.throws(() => actionJob("end", { sku: "R5", venue: "etsy" }), RangeError);
    assert.throws(() => actionJob("post", { sku: "R5", venue: "ebay" }), RangeError, "a post is jobRequest's");
    // a listing's customize, Sync to eBay (the contract of 2026-10-07): eBay only
    assert.deepEqual(actionJob("push", { sku: "R5", venue: "ebay" }), { action: "push", sku: "R5", venue: "ebay" });
    assert.throws(() => actionJob("push", { sku: "R5", venue: "craigslist" }), RangeError);
    assert.throws(() => actionJob("push", { venue: "ebay" }), RangeError);
});

test("an action job's line: queued, the step, the summary once done, the error once failed", () => {
    assert.equal(jobRunning({ state: "queued" }), true);
    assert.equal(jobRunning({ state: "running" }), true);
    assert.equal(jobRunning({ state: "done" }), false);
    assert.equal(jobRunning(null), false);
    assert.deepEqual(syncLine({ state: "queued", ahead: 2 }), { text: "queued, 2 ahead", kind: "busy" });
    assert.deepEqual(syncLine({ state: "queued", ahead: 0 }), { text: "queued", kind: "busy" });
    assert.deepEqual(syncLine({ state: "running", step: "reading eBay" }), { text: "reading eBay", kind: "busy" });
    assert.deepEqual(syncLine({ state: "running" }), { text: "working", kind: "busy" });
    assert.deepEqual(syncLine({ state: "running", step: "x", trouble: "cannot reach the PC" }), {
        text: "cannot reach the PC, still trying",
        kind: "busy",
    });
    assert.deepEqual(syncLine({ state: "done", summary: "3 listings updated, 10 unchanged, 0 failed" }), {
        text: "3 listings updated, 10 unchanged, 0 failed",
        kind: "ok",
    });
    assert.deepEqual(syncLine({ state: "done" }), { text: "done", kind: "ok" });
    assert.deepEqual(syncLine({ state: "failed", error: "eBay said no" }), { text: "eBay said no", kind: "bad" });
    assert.deepEqual(syncLine({ state: "cancelled" }), { text: "cancelled", kind: "bad" });
});

test("a card's status line: sending, its job, a refusal, else the venue's status", () => {
    const idle = { wait: "", job: null, note: null };
    assert.deepEqual(cardLine(ROW, "ebay", idle, -300), { text: "listed since 2026-10-03 16:21", kind: "ok" });
    assert.deepEqual(cardLine(ROW, "craigslist", idle), { text: "draft", kind: "" });
    assert.deepEqual(cardLine(ROW, "ebay", { ...idle, wait: "sending" }), { text: "sending", kind: "busy" });
    assert.deepEqual(cardLine(ROW, "ebay", { ...idle, job: { state: "running", step: "ending" } }), {
        text: "ending",
        kind: "busy",
    });
    const refused = { text: "craigslist cannot be ended from here", kind: "bad" };
    assert.deepEqual(cardLine(ROW, "craigslist", { ...idle, note: refused }), refused);
    assert.deepEqual(cardLine({ ...ROW, venues: ["ebay"] }, "craigslist", idle), { text: "", kind: "" }, "an empty card");
});

test("Edit: the inputs start from the row; Save sends only what changed", () => {
    // the quantity and pickup only are customize's now (Michal, 2026-10-07): one place edits them
    assert.deepEqual(EDIT_FIELDS.ebay.map((f) => f.key), ["title", "price", "description", "note", "condition_note"]);
    assert.deepEqual(EDIT_FIELDS.craigslist.map((f) => f.key), ["title", "price", "description", "category"]);
    const ebay = editValues(ROW, "ebay");
    assert.deepEqual(ebay, {
        title: "Brass lamp",
        price: "24.00",
        description: "Brass.\nWorks.",
        note: "from the attic",
        condition_note: "Light wear",
    });
    const craigslist = editValues(ROW, "craigslist");
    assert.deepEqual(craigslist, { title: "", price: "30.00", description: "Brass lamp, pickup in town", category: "" });

    assert.deepEqual(changedFields(ebay, { ...ebay }), {});
    assert.deepEqual(changedFields(ebay, { ...ebay, title: " Brass lamp " }), {}, "a stray space is no change");
    assert.deepEqual(changedFields(ebay, { ...ebay, title: "Brass desk lamp ", note: "" }), {
        title: "Brass desk lamp",
        note: "",
    });

    assert.equal(patchBody("ebay", ebay, { ...ebay }), null, "nothing changed: nothing sent");
    assert.deepEqual(patchBody("ebay", ebay, { ...ebay, price: "26.50" }), { price: "26.50" });
    // craigslist's go inside "craigslist"; "" clears an override
    assert.deepEqual(patchBody("craigslist", craigslist, { ...craigslist, price: "", category: "household" }), {
        craigslist: { price: "", category: "household" },
    });
});

/** ROW priced at a fair price, the three prices of its first model call cached on it. */
const GRADED = { ...ROW, pricing: 2, prices: { quick: "18.00", market: "24.00", high: "31.50" } };

test("a listing's customize: the Price slider at the row's grade, each word with its cached price", () => {
    // Michal, 2026-10-07: "definitely 3 prices should be cached in first call so that if I
    // change the slider, the price can be updated"
    assert.deepEqual(cachedPrices(GRADED), ["18.00", "24.00", "31.50"]);
    assert.deepEqual(cachedPrices({ ...GRADED, prices: { quick: null, market: "30", high: "" } }), ["", "30", ""]);
    assert.deepEqual(cachedPrices(ROW), ["", "", ""], "a row from before the cache");
    assert.deepEqual(rowCustomize(GRADED), { quantity: "2", pickupOnly: true, pricing: 2 });
    assert.deepEqual(rowCustomize(ROW), { quantity: "2", pickupOnly: true, pricing: 0 });
    assert.deepEqual(rowCustomize({ sku: "X", pricing: 7 }), { quantity: "1", pickupOnly: false, pricing: 0 });

    // at the row's grade: the goods card's line for it
    const words = ["Quick sale $18", "Fair price $24", "Higher end $31.50"];
    assert.deepEqual(sliderWords(GRADED, 2), {
        value: "2",
        bold: 2,
        said: "Fair price $24",
        note: "a fair price, a longer wait",
        words,
    });
    assert.equal(sliderWords(GRADED, 3).note, "a higher-end price; cheaper ones exist out there");
    // a price the row has not cached shows a dash
    const some = { ...GRADED, prices: { quick: null, market: "24.00", high: null } };
    assert.deepEqual(sliderWords(some, 2).words, ["Quick sale —", "Fair price $24", "Higher end —"]);
    // a row whose price follows no grade: at 1, nothing bold, and the line says so
    assert.deepEqual(sliderWords(ROW, 0), {
        value: "1",
        bold: 0,
        said: NOT_GRADED,
        note: "not priced by grade yet",
        words: ["Quick sale —", "Fair price —", "Higher end —"],
    });
    // moved on a row with no cached prices: Save has nothing to set
    assert.equal(sliderWords(ROW, 3).note, NO_CACHED);
    assert.equal(NO_CACHED, "no cached prices on this listing; set the price by hand");
    assert.equal(sliderWords({ ...ROW, pricing: 3 }, 3).note, "a higher-end price; cheaper ones exist out there", "not moved");
});

test("a listing's customize: Save sends only what changed, the slider as pricing; Sync to eBay when listed there", () => {
    const same = rowCustomize(GRADED);
    assert.equal(customizeChanges(GRADED, same), null, "nothing changed: nothing sent");
    assert.equal(customizeChanges(GRADED, { ...same, quantity: " 2 " }), null, "a stray space is no change");
    assert.deepEqual(customizeChanges(GRADED, { ...same, pickupOnly: false }), { pickup_only: false });
    assert.deepEqual(customizeChanges(GRADED, { ...same, quantity: "3" }), { quantity: 3 });
    assert.deepEqual(customizeChanges(GRADED, { ...same, pricing: 3 }), { pricing: 3 });
    assert.deepEqual(customizeChanges(GRADED, { quantity: "4", pickupOnly: false, pricing: 1 }), {
        quantity: 4,
        pickup_only: false,
        pricing: 1,
    });
    assert.deepEqual(customizeChanges({ sku: "X" }, { quantity: "4", pickupOnly: true, pricing: 0 }), {
        quantity: 4,
        pickup_only: true,
    });
    // a row priced by no grade with prices cached: moving to quick sale is a change too
    assert.deepEqual(customizeChanges({ ...GRADED, pricing: null }, { ...same, pricing: 1 }), { pricing: 1 });
    // no cached prices: the slider is never sent, the boxes still are
    assert.equal(customizeChanges(ROW, { ...rowCustomize(ROW), pricing: 3 }), null);
    assert.deepEqual(customizeChanges(ROW, { ...rowCustomize(ROW), quantity: "5", pricing: 3 }), { quantity: 5 });
    assert.throws(() => customizeChanges(GRADED, { ...same, quantity: "two" }), RangeError);

    // the foldout after the row is read again: what was not moved follows the row
    const after = { ...GRADED, quantity: 3, pickup_only: false, pricing: 3 };
    assert.deepEqual(followRow(GRADED, same, after), { quantity: "3", pickupOnly: false, pricing: 3 });
    assert.deepEqual(followRow(GRADED, { ...same, pricing: 1 }, after), { quantity: "3", pickupOnly: false, pricing: 1 });
    assert.deepEqual(followRow(GRADED, { ...same, quantity: "7" }, after), { quantity: "7", pickupOnly: true, pricing: 3 });
    assert.deepEqual(followRow(GRADED, { ...same, quantity: "x" }, after).quantity, "x", "as typed");

    // Sync to eBay: only a listing up on eBay has something to update
    assert.equal(canPush(GRADED), true);
    const draft = { ...GRADED, statuses: { ...GRADED.statuses, ebay: { status: "draft" } } };
    assert.equal(canPush(draft), false);
    assert.equal(canPush({ ...GRADED, venues: ["craigslist"] }), false, "not on eBay");
    assert.deepEqual(customizeButtons(GRADED, same, false), { save: false, sync: true });
    assert.deepEqual(customizeButtons(GRADED, { ...same, pricing: 1 }, false), { save: true, sync: true });
    assert.deepEqual(customizeButtons(GRADED, { ...same, pickupOnly: false }, false), { save: true, sync: true });
    assert.deepEqual(customizeButtons(GRADED, { ...same, pickupOnly: false }, true), { save: false, sync: false }, "busy");
    assert.deepEqual(customizeButtons(GRADED, { ...same, quantity: "0" }, false), { save: false, sync: false });
    assert.deepEqual(customizeButtons(draft, { ...same, quantity: "3" }, false), { save: true, sync: false });
    assert.deepEqual(customizeButtons(ROW, { ...rowCustomize(ROW), pricing: 2 }, false), { save: false, sync: true });

    // its status line: on its way, the push job, what the PC said; the quantity hint; why Sync is shut
    const idle = { wait: "", job: null, note: null, values: same };
    assert.deepEqual(customizeLine(GRADED, idle), { text: "", kind: "" });
    assert.deepEqual(customizeLine(draft, idle), { text: PUSH_CLOSED, kind: "" });
    assert.deepEqual(customizeLine(GRADED, { ...idle, values: { ...same, quantity: "1.5" } }), {
        text: EDIT_QUANTITY_HINT,
        kind: "bad",
    });
    assert.deepEqual(customizeLine(GRADED, { ...idle, wait: "saving" }), { text: "saving", kind: "busy" });
    assert.deepEqual(customizeLine(GRADED, { ...idle, job: { state: "running", step: "revising on eBay" } }), {
        text: "revising on eBay",
        kind: "busy",
    });
    assert.deepEqual(customizeLine(GRADED, { ...idle, job: { state: "done", summary: "updated" } }), {
        text: "updated",
        kind: "ok",
    });
    const refused = { text: "no cached fair price for this row: set the price by hand", kind: "bad" };
    assert.deepEqual(customizeLine(GRADED, { ...idle, note: refused }), refused);
    assert.deepEqual(customizeSaved(GRADED), { text: "saved; Sync to eBay puts it on the listing", kind: "ok" });
    assert.deepEqual(customizeSaved(draft), { text: "saved", kind: "ok" });
});
