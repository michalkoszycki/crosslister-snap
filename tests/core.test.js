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
    venueButton,
    bookForm,
    ISBN_WAIT_HINT,
    jobRequest,
    lookupKey,
    NO_BOOK_HINT,
    TITLE_WAIT_HINT,
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
    assert.equal(SETTINGS_HINT, "Set the PC address and key in Settings");
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

test("DONE needs a photo and waits while a job is on its way or on the PC", () => {
    assert.equal(doneButton(initialState("x")).enabled, false);
    const s = sent(1, [1]);
    assert.deepEqual(doneButton(s), { enabled: true, hint: "" });
    for (const [action, busy] of [
        [{ type: "jobSending", venue: "ebay", step: "sending" }, true],
        [{ type: "jobAccepted", venue: "ebay", job: "j1", ahead: 0 }, true],
        [{ type: "jobRefused", venue: "ebay", error: "cannot reach the PC" }, false],
    ]) {
        const d = doneButton(reduce(s, action));
        assert.equal(d.enabled, !busy, action.type);
        if (busy) assert.match(d.hint, /DONE waits/);
    }
});

test("DONE waits while a photo or a delete has not reached the PC", () => {
    assert.deepEqual(doneButton(withPhotos(1)), {
        enabled: false,
        hint: "DONE waits until the photos are on the PC",
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

test("leaving warns while something is not on the PC yet or a job is on its way", () => {
    assert.equal(leaveWarning(initialState("x")), false);
    assert.equal(leaveWarning(withPhotos(1, [1])), true, "a photo not sent yet");
    const s = sent(1, [1]);
    assert.equal(leaveWarning(s), false, "everything is on the PC: a reload reads it back");
    assert.equal(leaveWarning(reduce(s, { type: "noteText", text: "x" })), true);
    const running = reduce(s, { type: "jobAccepted", venue: "ebay", job: "j1", ahead: 0 });
    assert.equal(leaveWarning(running), true);
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
    const missing = reduce(s, { type: "bookLookupFailed", isbn: ISBN, status: 404, error: "no book" });
    assert.equal(missing.book.lookup.phase, "missing");
    assert.equal(bookCard(missing.book).status, "Not in the catalogues. Post it as goods instead.");
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
    assert.match(
        hint(reduce(isbn, { type: "bookLookupFailed", isbn: ISBN, status: 404, error: "" })),
        /post it as goods/
    );
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

test("DONE and the progress line know the book mode", () => {
    assert.equal(progressLine(foundBook(2)), "2 photos, all on the PC");
    assert.equal(doneButton(bookState()).enabled, false);
    const isbnOnly = reduce(bookState(), { type: "bookIsbn", isbn: ISBN });
    assert.equal(doneButton(isbnOnly).enabled, true, "a book not worth a photo can be cleared");
    assert.equal(doneButton(foundBook()).enabled, true);
    const going = reduce(foundBook(), { type: "jobSending", venue: "ebay", step: "sending" });
    assert.match(doneButton(going).hint, /DONE waits/);
    assert.equal(leaveWarning(going), true);
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
    assert.equal(scanHint({ ...base, canScan: false }), "This phone cannot read barcodes; type the ISBN");
    assert.equal(scanHint({ ...base, scan: "reading" }), "Reading the barcode...");
    assert.equal(
        scanHint({ ...base, scan: "missed" }),
        "No barcode found — try again closer, or type the ISBN under the barcode"
    );
    assert.equal(scanHint({ ...base, hasItem: true }), "");
    assert.match(scanHint({ ...base, locked: true }), /DONE starts the next book/);
});

// --- books: photos waiting for the ISBN ---------------------------------------------

/** The cover snapped before the ISBN: the photos are on the page, the book has no ISBN. */
function coverBeforeIsbn(n = 1) {
    let s = bookState();
    for (let i = 1; i <= n; i += 1) s = reduce(s, { type: "add", id: `b${i}`, name: `Book-${i}.jpg`, n: i });
    return s;
}

test("photos waiting for the ISBN: DONE and ebay say the ISBN is what blocks them, not the PC", () => {
    const s = coverBeforeIsbn();
    assert.equal(
        ISBN_WAIT_HINT,
        "Scan the ISBN, or tap No ISBN and type the title, so the photos can go to the PC; or remove them with their x"
    );
    assert.deepEqual(doneButton(s), { enabled: false, hint: ISBN_WAIT_HINT });
    assert.deepEqual(venueButton(s, "ebay", true), { enabled: false, hint: ISBN_WAIT_HINT });
    // with the ISBN typed they are ordinary photos on their way to the PC again
    const named = reduce(s, { type: "bookIsbn", isbn: ISBN });
    assert.equal(doneButton(named).hint, "DONE waits until the photos are on the PC");
    // with the photo struck out there is nothing waiting: back to the first step
    const struck = reduce(s, { type: "remove", id: "b1" });
    assert.equal(venueButton(struck, "ebay", true).hint, "Scan the ISBN, or tap No ISBN and type the title");
    assert.deepEqual(doneButton(struck), { enabled: false, hint: "" });
    // goods photos not yet on the PC keep their own words
    assert.equal(doneButton(withPhotos(1)).hint, "DONE waits until the photos are on the PC");
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
    assert.notEqual(venueButton(s, "ebay", true).hint, "Not in the catalogues - post it as goods instead");
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
