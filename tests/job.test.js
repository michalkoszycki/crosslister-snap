// tests/job.test.js -- what a venue button sends, and the line under it.
// Pure apart from Blob and Response, which Node has built in; fetch is faked.

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
import {
    checkPc,
    createItem,
    deletePhoto,
    getItem,
    getJob,
    PcError,
    postJob,
    putNote,
    putPhoto,
} from "../pc.js";

const ITEM = "Boots 2026-09-24";

/** Photos taken, some marked AI, and every one on the PC (the queue has sent them). */
function sentItem(...marks) {
    let s = initialState("Boots");
    marks.forEach((ai, i) => {
        const id = `p${i + 1}`;
        s = reduce(s, { type: "add", id, name: `Boots-${i + 1}.jpg`, n: i + 1 });
        if (ai) s = reduce(s, { type: "toggleAi", id });
    });
    const item = { kind: "item", name: "Boots" };
    s = reduce(s, { type: "taskStart", task: item });
    s = reduce(s, { type: "taskDone", task: item, answer: { item: ITEM, photos: [] } });
    for (const p of s.photos) {
        const task = { kind: "photo", id: p.id, n: p.n };
        s = reduce(s, { type: "taskStart", task });
        s = reduce(s, { type: "taskDone", task, answer: { item: ITEM, n: p.n, bytes: 9 } });
    }
    return s;
}

// --- the request body ----------------------------------------------------------

test("a new item sends the item, the venue and the numbers of the photos marked AI", () => {
    const s = sentItem(false, true, false, true);
    const body = jobRequest({ venue: "ebay", item: s.itemId, photos: s.photos });
    assert.deepEqual(body, { item: ITEM, venue: "ebay", ai: [2, 4] });
    assert.equal(JSON.stringify(body), `{"item":"${ITEM}","venue":"ebay","ai":[2,4]}`);
});

test("the AI marks are photo numbers, so a delete leaves them alone", () => {
    // four photos, #2 and #4 marked; the x takes #1 out (and off the PC)
    const s = reduce(sentItem(false, true, false, true), { type: "remove", id: "p1" });
    const body = jobRequest({ venue: "craigslist", item: s.itemId, photos: s.photos });
    assert.deepEqual(body, { item: ITEM, venue: "craigslist", ai: [2, 4] });
    assert.deepEqual(s.deletes, [1]);
});

test("the second button sends the sku and the venue only: no item, no ai", () => {
    const s = sentItem(true, false);
    const body = jobRequest({ venue: "craigslist", sku: "B-0042", item: s.itemId, photos: s.photos });
    assert.deepEqual(body, { sku: "B-0042", venue: "craigslist" });
});

test("an unknown venue is a programming error", () => {
    assert.throws(() => jobRequest({ venue: "everywhere", item: ITEM }), RangeError);
});

// --- every call to the PC, as it goes over the wire ------------------------------------

async function wire(call, answer = { ok: true }) {
    const seen = [];
    const before = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        seen.push({ url, init });
        return new Response(JSON.stringify(answer), { status: 200 });
    };
    try {
        await call();
    } finally {
        globalThis.fetch = before;
    }
    return seen[0];
}

const PC = { pc: "http://127.0.0.1:8765", key: "test-key-0123456789" };

test("the item, its photos and its note: method, address and body of each call", async () => {
    const made = await wire(() => createItem(PC, "Boots"));
    assert.equal(made.url, "http://127.0.0.1:8765/items");
    assert.equal(made.init.method, "POST");
    assert.equal(made.init.headers["Content-Type"], "application/json");
    assert.equal(made.init.headers["X-Crosslister-Key"], PC.key);
    assert.equal(made.init.body, '{"name":"Boots"}');

    const jpeg = new Blob(["jpeg bytes"], { type: "image/jpeg" });
    const put = await wire(() => putPhoto(PC, ITEM, 3, jpeg));
    assert.equal(put.url, "http://127.0.0.1:8765/items/Boots%202026-09-24/photos/3");
    assert.equal(put.init.method, "PUT");
    assert.equal(put.init.headers["Content-Type"], "image/jpeg");
    assert.equal(put.init.body, jpeg, "the JPEG itself is the body");

    const gone = await wire(() => deletePhoto(PC, ITEM, 3));
    assert.equal(gone.url, "http://127.0.0.1:8765/items/Boots%202026-09-24/photos/3");
    assert.equal(gone.init.method, "DELETE");
    assert.equal(gone.init.body, undefined);

    const note = await wire(() => putNote(PC, ITEM, "Size 10"));
    assert.equal(note.url, "http://127.0.0.1:8765/items/Boots%202026-09-24/note");
    assert.equal(note.init.method, "PUT");
    assert.equal(note.init.body, '{"note":"Size 10"}');

    const read = await wire(() => getItem(PC, "a/b?c"));
    assert.equal(read.url, "http://127.0.0.1:8765/items/a%2Fb%3Fc");
    assert.equal(read.init.method, "GET");
});

test("the jobs: a JSON body for a press, GETs for the status and the Settings check", async () => {
    const press = await wire(() => postJob(PC, { item: ITEM, venue: "ebay", ai: [2] }));
    assert.equal(press.url, "http://127.0.0.1:8765/jobs");
    assert.equal(press.init.method, "POST");
    assert.equal(press.init.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(press.init.body), { item: ITEM, venue: "ebay", ai: [2] });
    assert.equal((await wire(() => getJob(PC, "j 1"))).url, "http://127.0.0.1:8765/jobs/j%201");
    assert.equal((await wire(() => checkPc(PC))).url, "http://127.0.0.1:8765/jobs?limit=1");
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
    assert.equal(errorText(404), "the PC does not know this item or job");
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
    return sentItem(true);
}

test("an idle button says nothing", () => {
    assert.deepEqual(venueLine(initialState("x").jobs.ebay), { text: "", link: "", kind: "" });
});

test("ebay: sending, queued with jobs ahead, running steps, then the link", () => {
    let s = newItem();
    assert.equal(venueButton(s, "ebay", true).enabled, true);
    s = reduce(s, { type: "jobSending", venue: "ebay", step: "sending" });
    assert.equal(venueLine(s.jobs.ebay).text, "sending");
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
    const body = jobRequest({ venue: "craigslist", sku: s.sku, item: s.itemId, photos: s.photos });
    assert.deepEqual(body, { sku: "B-0042", venue: "craigslist" });

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
    let s = reduce(newItem(), { type: "jobSending", venue: "ebay", step: "sending" });
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
