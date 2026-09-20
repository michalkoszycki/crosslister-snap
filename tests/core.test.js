import test from "node:test";
import assert from "node:assert/strict";

import {
    addRecent,
    buildFileName,
    cleanItemName,
    currentCount,
    DEFAULT_CHUNK_SIZE,
    initialState,
    MAX_ATTEMPTS,
    MAX_ITEM_NAME,
    MAX_RECENTS,
    nameWasChanged,
    nextNumber,
    photoExtension,
    planRanges,
    progressLine,
    RANGE_MULTIPLE,
    reduce,
    retryDelayMs,
    shouldRetry,
    uploadSessionUrl,
} from "../core.js";

// --- cleanItemName ---------------------------------------------------------

test("cleanItemName keeps an already clean name", () => {
    assert.equal(cleanItemName("Blue Levi jacket"), "Blue Levi jacket");
});

test("cleanItemName strips characters OneDrive and Windows forbid", () => {
    assert.equal(cleanItemName('Le:vi"s <501> / 32*34 ? | \\ jeans'), "Levis 501 3234 jeans");
});

test("cleanItemName collapses whitespace and trims spaces and dots", () => {
    assert.equal(cleanItemName("  ..Nike   Air\tMax.. "), "Nike Air Max");
});

test("cleanItemName removes control characters", () => {
    assert.equal(cleanItemName("tab\there\u0000"), "tab here");
});

test("cleanItemName caps at 60 characters and trims the cut edge", () => {
    const long = "x".repeat(70);
    assert.equal(cleanItemName(long).length, MAX_ITEM_NAME);
    const cutToSpace = "y".repeat(59) + " zzz";
    assert.equal(cleanItemName(cutToSpace), "y".repeat(59));
});

test("cleanItemName handles junk input", () => {
    assert.equal(cleanItemName(""), "");
    assert.equal(cleanItemName("   "), "");
    assert.equal(cleanItemName("///"), "");
    assert.equal(cleanItemName(null), "");
    assert.equal(cleanItemName(undefined), "");
    assert.equal(cleanItemName(42), "");
});

test("nameWasChanged only fires when cleaning changed something", () => {
    assert.equal(nameWasChanged("Blue jacket"), false);
    assert.equal(nameWasChanged("Blue/jacket"), true);
    assert.equal(nameWasChanged(""), false);
});

// --- file names ------------------------------------------------------------

test("photoExtension uses the original extension, lowercased", () => {
    assert.equal(photoExtension("IMG_20260919_121314.JPG"), ".jpg");
    assert.equal(photoExtension("shot.heic"), ".heic");
});

test("photoExtension falls back to the mime type, then to .jpg", () => {
    assert.equal(photoExtension("image", "image/png"), ".png");
    assert.equal(photoExtension("", "image/webp"), ".webp");
    assert.equal(photoExtension("", ""), ".jpg");
    assert.equal(photoExtension("no-extension-here", "application/octet-stream"), ".jpg");
});

test("buildFileName numbers photos from 1", () => {
    assert.equal(buildFileName("Blue jacket", 1), "Blue jacket-1.jpg");
    assert.equal(buildFileName("Blue jacket", 12, ".png"), "Blue jacket-12.png");
});

// --- graph url -------------------------------------------------------------

test("uploadSessionUrl addresses the file by path and encodes each segment", () => {
    assert.equal(
        uploadSessionUrl("Pictures/Uploads", "Blue jacket", "Blue jacket-1.jpg"),
        "https://graph.microsoft.com/v1.0/me/drive/root:/Pictures/Uploads/Blue%20jacket/Blue%20jacket-1.jpg:/createUploadSession"
    );
});

test("uploadSessionUrl tolerates stray slashes in the base path", () => {
    assert.equal(
        uploadSessionUrl("/Pictures/Uploads/", "It", "It-1.jpg", "https://g/v1.0"),
        "https://g/v1.0/me/drive/root:/Pictures/Uploads/It/It-1.jpg:/createUploadSession"
    );
});

test("uploadSessionUrl encodes characters that would break the path", () => {
    const url = uploadSessionUrl("Pictures/Uploads", "A&B #1", "A&B #1-1.jpg");
    assert.ok(url.includes("A%26B%20%231/A%26B%20%231-1.jpg"));
});

// --- upload range planning -------------------------------------------------

test("planRanges returns one range for a small file", () => {
    const r = planRanges(1000);
    assert.deepEqual(r, [
        { start: 0, end: 999, length: 1000, contentRange: "bytes 0-999/1000" },
    ]);
});

test("planRanges splits a big file on 320 KiB multiples and covers every byte", () => {
    const size = DEFAULT_CHUNK_SIZE * 2 + 12345;
    const r = planRanges(size);
    assert.equal(r.length, 3);
    assert.equal(r[0].contentRange, `bytes 0-${DEFAULT_CHUNK_SIZE - 1}/${size}`);
    assert.equal(r[r.length - 1].end, size - 1);
    for (let i = 1; i < r.length; i += 1) {
        assert.equal(r[i].start, r[i - 1].end + 1);
    }
    for (const range of r.slice(0, -1)) {
        assert.equal(range.length % RANGE_MULTIPLE, 0);
    }
    assert.equal(
        r.reduce((sum, x) => sum + x.length, 0),
        size
    );
});

test("planRanges on an exact multiple does not add an empty tail", () => {
    const r = planRanges(DEFAULT_CHUNK_SIZE * 2);
    assert.equal(r.length, 2);
    assert.equal(r[1].end, DEFAULT_CHUNK_SIZE * 2 - 1);
});

test("planRanges returns nothing for an empty file and rejects bad input", () => {
    assert.deepEqual(planRanges(0), []);
    assert.throws(() => planRanges(-1), RangeError);
    assert.throws(() => planRanges(10.5), RangeError);
    assert.throws(() => planRanges(100, 1000), RangeError); // not a 320 KiB multiple
    assert.throws(() => planRanges(100, 0), RangeError);
});

test("DEFAULT_CHUNK_SIZE is 10 MiB and a 320 KiB multiple", () => {
    assert.equal(DEFAULT_CHUNK_SIZE, 10 * 1024 * 1024);
    assert.equal(DEFAULT_CHUNK_SIZE % RANGE_MULTIPLE, 0);
});

// --- retry schedule --------------------------------------------------------

test("retryDelayMs backs off and is capped", () => {
    assert.equal(retryDelayMs(1), 0);
    assert.equal(retryDelayMs(2), 1000);
    assert.equal(retryDelayMs(3), 3000);
    assert.equal(retryDelayMs(9), 30000);
});

test("shouldRetry retries transient failures only, up to three attempts", () => {
    assert.equal(shouldRetry(1, 0), true); // network error
    assert.equal(shouldRetry(1, 503), true);
    assert.equal(shouldRetry(1, 429), true);
    assert.equal(shouldRetry(1, 404), false);
    assert.equal(shouldRetry(1, 401), false);
    assert.equal(shouldRetry(MAX_ATTEMPTS, 500), false);
    assert.equal(shouldRetry(MAX_ATTEMPTS - 1, 500), true);
});

// --- reducer ---------------------------------------------------------------

function withOne() {
    let s = initialState("Blue jacket");
    s = reduce(s, { type: "add", id: "a", name: "Blue jacket-1.jpg", n: 1 });
    return s;
}

test("reduce adds a photo as queued", () => {
    const s = withOne();
    assert.equal(s.photos.length, 1);
    assert.equal(s.photos[0].status, "queued");
    assert.equal(s.photos[0].attempts, 0);
});

test("reduce does not mutate the previous state", () => {
    const before = withOne();
    const after = reduce(before, { type: "done", id: "a" });
    assert.equal(before.photos[0].status, "queued");
    assert.equal(after.photos[0].status, "done");
    assert.notEqual(before.photos[0], after.photos[0]);
});

test("reduce walks a photo through start, progress, done", () => {
    let s = withOne();
    s = reduce(s, { type: "start", id: "a" });
    assert.equal(s.photos[0].status, "uploading");
    assert.equal(s.photos[0].attempts, 1);
    s = reduce(s, { type: "progress", id: "a", progress: 0.4 });
    assert.equal(s.photos[0].progress, 0.4);
    s = reduce(s, { type: "done", id: "a" });
    assert.equal(s.photos[0].status, "done");
    assert.equal(s.photos[0].progress, 1);
});

test("reduce clamps silly progress values", () => {
    let s = withOne();
    s = reduce(s, { type: "progress", id: "a", progress: 5 });
    assert.equal(s.photos[0].progress, 1);
    s = reduce(s, { type: "progress", id: "a", progress: -2 });
    assert.equal(s.photos[0].progress, 0);
    s = reduce(s, { type: "progress", id: "a", progress: NaN });
    assert.equal(s.photos[0].progress, 0);
});

test("reduce records a failure with its reason and counts the retry", () => {
    let s = withOne();
    s = reduce(s, { type: "start", id: "a" });
    s = reduce(s, { type: "fail", id: "a", error: "boom" });
    assert.equal(s.photos[0].status, "failed");
    assert.equal(s.photos[0].error, "boom");
    s = reduce(s, { type: "start", id: "a" });
    assert.equal(s.photos[0].attempts, 2);
    assert.equal(s.photos[0].error, undefined);
});

test("reduce ignores actions for photos it does not know", () => {
    const s = withOne();
    assert.equal(reduce(s, { type: "done", id: "nope" }), s);
    assert.equal(reduce(s, { type: "nonsense" }), s);
});

test("reduce tracks the item name and the online flag", () => {
    let s = reduce(initialState(""), { type: "setItem", itemName: "Boots" });
    assert.equal(s.itemName, "Boots");
    s = reduce(s, { type: "online", online: false });
    assert.equal(s.online, false);
});

test("reduce reset clears the strip for the next item", () => {
    let s = withOne();
    s = reduce(s, { type: "reset" });
    assert.equal(s.photos.length, 0);
    assert.equal(s.itemName, "");
});

// --- progress line ---------------------------------------------------------

test("progressLine counts what is uploaded and what failed", () => {
    let s = initialState("It");
    assert.equal(progressLine(s), "No photos yet.");
    s = reduce(s, { type: "add", id: "a", name: "It-1.jpg", n: 1 });
    s = reduce(s, { type: "add", id: "b", name: "It-2.jpg", n: 2 });
    s = reduce(s, { type: "add", id: "c", name: "It-3.jpg", n: 3 });
    s = reduce(s, { type: "add", id: "d", name: "It-4.jpg", n: 4 });
    s = reduce(s, { type: "done", id: "a" });
    s = reduce(s, { type: "done", id: "b" });
    s = reduce(s, { type: "done", id: "c" });
    assert.equal(progressLine(s), "3 of 4 uploaded");
    s = reduce(s, { type: "fail", id: "d", error: "x" });
    assert.equal(progressLine(s), "3 of 4 uploaded - 1 failed");
});

// --- per-item counters -----------------------------------------------------

test("nextNumber continues the numbering for the same item", () => {
    let counters = {};
    let n;
    ({ n, counters } = nextNumber(counters, "Boots"));
    assert.equal(n, 1);
    ({ n, counters } = nextNumber(counters, "Boots"));
    assert.equal(n, 2);
    ({ n, counters } = nextNumber(counters, "Jacket"));
    assert.equal(n, 1);
    ({ n, counters } = nextNumber(counters, "Boots"));
    assert.equal(n, 3);
    assert.deepEqual(counters, { Boots: 3, Jacket: 1 });
});

test("nextNumber survives missing or broken counters", () => {
    assert.equal(nextNumber(undefined, "Boots").n, 1);
    assert.equal(nextNumber({ Boots: "seven" }, "Boots").n, 1);
    assert.equal(currentCount(null, "Boots"), 0);
});

// --- recents ---------------------------------------------------------------

test("addRecent puts the newest first without duplicates", () => {
    let r = addRecent([], "Boots");
    r = addRecent(r, "Jacket");
    r = addRecent(r, "Boots");
    assert.deepEqual(r, ["Boots", "Jacket"]);
});

test("addRecent cleans the name, ignores empty ones and caps the list", () => {
    assert.deepEqual(addRecent([], "  Boots/  "), ["Boots"]);
    assert.deepEqual(addRecent(["Boots"], "   "), ["Boots"]);
    let r = [];
    for (let i = 0; i < MAX_RECENTS + 5; i += 1) r = addRecent(r, `item ${i}`);
    assert.equal(r.length, MAX_RECENTS);
    assert.equal(r[0], `item ${MAX_RECENTS + 4}`);
});
