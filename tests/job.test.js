// tests/job.test.js -- what a venue button sends, and the line under it.
// Pure apart from FormData and Blob, which Node has built in. No network.

import test from "node:test";
import assert from "node:assert/strict";

import {
    errorText,
    initialState,
    jobRequest,
    KEY_HEADER,
    POLL_MS,
    reduce,
    safeLink,
    venueButton,
    venueLine,
} from "../core.js";
import { buildJobForm, PcError } from "../pc.js";

function photos(...marks) {
    return marks.map((ai, i) => ({ id: `p${i + 1}`, ai }));
}

// --- the request body ----------------------------------------------------------

test("a new item sends venue, note and the AI positions, then every photo", () => {
    const req = jobRequest({
        venue: "ebay",
        note: "  Size 10, scuffed toe \n",
        photos: photos(false, true, false, true),
    });
    assert.deepEqual(req.fields, [
        ["venue", "ebay"],
        ["note", "Size 10, scuffed toe"],
        ["ai", "1,3"],
    ]);
    assert.deepEqual(req.photoIds, ["p1", "p2", "p3", "p4"]);
    assert.equal(req.sendsNote, true);
});

test("the AI positions count the photos as sent, so a delete shifts them", () => {
    // four photos, #2 and #4 marked; the x takes #1 out
    let s = initialState("Boots");
    for (let i = 1; i <= 4; i += 1) {
        s = reduce(s, { type: "add", id: `p${i}`, name: `Boots-${i}.jpg`, n: i });
    }
    s = reduce(s, { type: "toggleAi", id: "p2" });
    s = reduce(s, { type: "toggleAi", id: "p4" });
    s = reduce(s, { type: "remove", id: "p1" });
    const req = jobRequest({ venue: "craigslist", note: "", photos: s.photos });
    assert.deepEqual(req.fields, [
        ["venue", "craigslist"],
        ["note", ""],
        ["ai", "0,2"],
    ]);
    assert.deepEqual(req.photoIds, ["p2", "p3", "p4"]);
});

test("the second button sends the venue and the sku only: no photos, no ai, no note", () => {
    const req = jobRequest({
        venue: "craigslist",
        sku: "B-0042",
        note: "this must not go",
        photos: photos(true, false),
    });
    assert.deepEqual(req.fields, [
        ["venue", "craigslist"],
        ["sku", "B-0042"],
    ]);
    assert.deepEqual(req.photoIds, []);
    assert.equal(req.sendsNote, false);
});

test("an unknown venue is a programming error", () => {
    assert.throws(() => jobRequest({ venue: "everywhere", photos: photos(true) }), RangeError);
});

test("the multipart body carries the fields and the photos under 'photos', in order", async () => {
    const req = jobRequest({ venue: "ebay", note: "n", photos: photos(true, false) });
    const form = buildJobForm(req.fields, [
        { blob: new Blob(["one"], { type: "image/jpeg" }), name: "Boots-1.jpg" },
        { blob: new Blob(["two"], { type: "image/jpeg" }), name: "Boots-2.jpg" },
    ]);
    assert.equal(form.get("venue"), "ebay");
    assert.equal(form.get("note"), "n");
    assert.equal(form.get("ai"), "0");
    assert.equal(form.has("sku"), false);
    const sent = form.getAll("photos");
    assert.deepEqual(sent.map((f) => f.name), ["Boots-1.jpg", "Boots-2.jpg"]);
    assert.equal(sent[0].type, "image/jpeg");
    assert.equal(await sent[1].text(), "two");
});

test("the sku-only body has exactly two fields and no file", () => {
    const req = jobRequest({ venue: "ebay", sku: "B-7", photos: photos(true) });
    const form = buildJobForm(req.fields, []);
    assert.deepEqual([...form.keys()], ["venue", "sku"]);
});

test("the contract constants: the key header and a 3 s poll", () => {
    assert.equal(KEY_HEADER, "X-Crosslister-Key");
    assert.equal(POLL_MS, 3000);
});

// --- errors from the PC ------------------------------------------------------------

test("errors read as one plain line", () => {
    assert.equal(errorText(0), "cannot reach the PC");
    assert.equal(errorText(401, "a valid X-Crosslister-Key header is needed"), "wrong key - check Settings");
    assert.equal(errorText(400, "mark at least one photo for the AI"), "mark at least one photo for the AI");
    assert.equal(errorText(404, "no job abc"), "no job abc");
    assert.equal(errorText(404), "the PC does not know this job");
    // FastAPI's own validation answer has a list, not a sentence
    assert.equal(errorText(422, [{ msg: "field required" }]), "the PC answered 422");
    assert.equal(errorText(502), "the PC answered 502");
    const e = new PcError(401, "x");
    assert.equal(e.status, 401);
    assert.equal(e.message, "wrong key - check Settings");
});

test("only an http(s) link becomes tappable", () => {
    assert.equal(safeLink("https://www.ebay.com/itm/123"), "https://www.ebay.com/itm/123");
    assert.equal(safeLink("javascript:alert(1)"), "");
    assert.equal(safeLink("not a url"), "");
    assert.equal(safeLink(undefined), "");
});

// --- a job's life, as the line under the button tells it ---------------------------

function newItem() {
    let s = initialState("Boots");
    s = reduce(s, { type: "add", id: "p1", name: "Boots-1.jpg", n: 1 });
    return reduce(s, { type: "toggleAi", id: "p1" });
}

test("an idle button says nothing", () => {
    assert.deepEqual(venueLine(initialState("x").jobs.ebay), { text: "", link: "", kind: "" });
});

test("ebay: sending, queued with jobs ahead, running steps, then the link", () => {
    let s = newItem();
    s = reduce(s, { type: "jobSending", venue: "ebay", step: "sending 1 photo" });
    assert.equal(venueLine(s.jobs.ebay).text, "sending 1 photo");
    assert.equal(venueButton(s, "ebay", true).enabled, false);

    s = reduce(s, { type: "jobAccepted", venue: "ebay", job: "j1", ahead: 2 });
    assert.equal(s.jobs.ebay.jobId, "j1");
    assert.equal(venueLine(s.jobs.ebay).text, "queued, 2 ahead");

    s = reduce(s, { type: "jobStatus", venue: "ebay", status: { state: "queued", ahead: 0 } });
    assert.equal(venueLine(s.jobs.ebay).text, "queued");

    s = reduce(s, {
        type: "jobStatus",
        venue: "ebay",
        status: { state: "running", step: "drafting the listing", sku: "", ahead: 0 },
    });
    assert.deepEqual(venueLine(s.jobs.ebay), {
        text: "drafting the listing",
        link: "",
        kind: "busy",
    });

    s = reduce(s, {
        type: "jobStatus",
        venue: "ebay",
        status: {
            state: "done",
            step: "posted",
            sku: "B-0042",
            links: { ebay: "https://www.ebay.com/itm/123" },
            error: "",
            ahead: 0,
        },
    });
    assert.deepEqual(venueLine(s.jobs.ebay), {
        text: "",
        link: "https://www.ebay.com/itm/123",
        kind: "ok",
    });
    assert.equal(s.sku, "B-0042");
    assert.equal(venueButton(s, "ebay", true).enabled, false, "posted once is enough");
});

test("the other button waits for the row, then sends the sku only", () => {
    let s = reduce(newItem(), { type: "jobAccepted", venue: "ebay", job: "j1", ahead: 0 });
    assert.equal(venueButton(s, "craigslist", true).enabled, false);
    assert.match(venueButton(s, "craigslist", true).hint, /goes first/);

    // the sku arrives while the first job is still running: the second may go now
    s = reduce(s, {
        type: "jobStatus",
        venue: "ebay",
        status: { state: "running", step: "publishing", sku: "B-0042" },
    });
    assert.equal(venueButton(s, "craigslist", true).enabled, true);
    const req = jobRequest({ venue: "craigslist", sku: s.sku, note: "x", photos: s.photos });
    assert.deepEqual(req.fields, [
        ["venue", "craigslist"],
        ["sku", "B-0042"],
    ]);

    s = reduce(s, { type: "jobAccepted", venue: "craigslist", job: "j2", ahead: 1 });
    s = reduce(s, {
        type: "jobStatus",
        venue: "craigslist",
        status: {
            state: "done",
            sku: "B-0042",
            links: { craigslist: "https://sfbay.craigslist.org/x/1.html" },
        },
    });
    assert.equal(venueLine(s.jobs.craigslist).link, "https://sfbay.craigslist.org/x/1.html");
    // the ebay line is untouched by the craigslist job
    assert.equal(venueLine(s.jobs.ebay).text, "publishing");
});

test("a later status never overwrites the sku already known", () => {
    let s = reduce(newItem(), {
        type: "jobStatus",
        venue: "ebay",
        status: { state: "running", sku: "B-1" },
    });
    s = reduce(s, { type: "jobStatus", venue: "ebay", status: { state: "running", sku: "" } });
    assert.equal(s.sku, "B-1");
});

test("a failed job shows the PC's words and the button comes back", () => {
    let s = reduce(newItem(), { type: "jobAccepted", venue: "craigslist", job: "j1", ahead: 0 });
    s = reduce(s, {
        type: "jobStatus",
        venue: "craigslist",
        status: { state: "failed", error: "the Craigslist form changed: no price box" },
    });
    assert.deepEqual(venueLine(s.jobs.craigslist), {
        text: "the Craigslist form changed: no price box",
        link: "",
        kind: "bad",
    });
    assert.equal(venueButton(s, "craigslist", true).enabled, true);
});

test("a POST that never reached the PC says so and re-enables the button", () => {
    let s = reduce(newItem(), { type: "jobSending", venue: "ebay", step: "sending 1 photo" });
    s = reduce(s, { type: "jobRefused", venue: "ebay", error: errorText(0) });
    assert.equal(venueLine(s.jobs.ebay).text, "cannot reach the PC");
    assert.equal(venueButton(s, "ebay", true).enabled, true);
    assert.equal(s.photos.length, 1, "the photos stay on the page");
});

test("a status poll that fails keeps the job and says it is still trying", () => {
    let s = reduce(newItem(), { type: "jobAccepted", venue: "ebay", job: "j1", ahead: 0 });
    s = reduce(s, { type: "pollTrouble", venue: "ebay", error: "cannot reach the PC" });
    assert.equal(s.jobs.ebay.phase, "queued");
    assert.equal(venueLine(s.jobs.ebay).text, "cannot reach the PC, still trying");
    s = reduce(s, { type: "jobStatus", venue: "ebay", status: { state: "running", step: "drafting" } });
    assert.equal(venueLine(s.jobs.ebay).text, "drafting");
});

test("a done job without a link still says done; a bad link is not shown", () => {
    let s = reduce(newItem(), { type: "jobAccepted", venue: "ebay", job: "j1", ahead: 0 });
    s = reduce(s, {
        type: "jobStatus",
        venue: "ebay",
        status: { state: "done", links: { ebay: "javascript:alert(1)" } },
    });
    assert.deepEqual(venueLine(s.jobs.ebay), { text: "done", link: "", kind: "ok" });
});

test("a status for an unknown venue changes nothing", () => {
    const s = newItem();
    assert.equal(reduce(s, { type: "jobStatus", venue: "etsy", status: { state: "done" } }), s);
});
