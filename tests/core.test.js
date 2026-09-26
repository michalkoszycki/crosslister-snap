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
} from "../core.js";

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
