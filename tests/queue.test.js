// tests/queue.test.js -- the upload queue: what goes to the PC next, retries,
// offline, deletes, and when a venue button opens. Pure: no DOM, no network.

import test from "node:test";
import assert from "node:assert/strict";

import { bannerText, initialState, reduce, venueButton } from "../core.js";
import { badgeText, nextTask, noteDirty, retryDelayMs, unsent } from "../queue.js";

const ITEM = "Boots 2026-09-24";

function snapped(n) {
    let s = initialState("Boots");
    for (let i = 1; i <= n; i += 1) {
        s = reduce(s, { type: "add", id: `p${i}`, name: `Boots-${i}.jpg`, n: i });
    }
    return s;
}

/** Run the next task and answer it: `outcome` is an answer, or {status, error} to fail. */
function step(s, outcome = {}) {
    const task = nextTask(s);
    assert.ok(task, "there should be something to send");
    const started = reduce(s, { type: "taskStart", task });
    if ("status" in outcome) {
        return { task, s: reduce(started, { type: "taskFailed", task, ...outcome }) };
    }
    const answer = task.kind === "item" ? { item: ITEM, photos: [], ...outcome } : outcome;
    return { task, s: reduce(started, { type: "taskDone", task, answer }) };
}

/** Drain the queue while the PC answers; the tasks in the order they went. */
function drain(s) {
    const sentTasks = [];
    let state = s;
    for (let guard = 0; guard < 100 && nextTask(state); guard += 1) {
        const r = step(state);
        sentTasks.push(r.task);
        state = r.s;
    }
    return { s: state, tasks: sentTasks };
}

const OFFLINE = { status: 0, error: "cannot reach the PC" };

test("nothing goes before the first photo; then the item, then the photos in order", () => {
    assert.equal(nextTask(initialState("Boots")), null);
    const { s, tasks } = drain(snapped(3));
    assert.deepEqual(
        tasks.map((t) => [t.kind, t.n ?? t.name]),
        [
            ["item", "Boots"],
            ["photo", 1],
            ["photo", 2],
            ["photo", 3],
        ]
    );
    assert.equal(s.itemId, ITEM);
    assert.deepEqual(s.photos.map(badgeText), ["sent", "sent", "sent"]);
    assert.equal(unsent(s), false);
});

test("one request at a time: nothing else while one is in flight", () => {
    const s = snapped(2);
    const busy = reduce(s, { type: "taskStart", task: nextTask(s) });
    assert.equal(nextTask(busy), null);
});

test("a delete goes before the photos still waiting, and the note goes last, once due", () => {
    let s = drain(snapped(2)).s;
    s = reduce(s, { type: "remove", id: "p1" });
    s = reduce(s, { type: "add", id: "p3", name: "Boots-3.jpg", n: 3 });
    s = reduce(s, { type: "noteText", text: " Size 10 " });
    assert.deepEqual(nextTask(s), { kind: "delete", n: 1 });
    s = step(s).s;
    assert.deepEqual(nextTask(s), { kind: "photo", id: "p3", n: 3 });
    s = step(s).s;
    assert.equal(nextTask(s), null, "he is still typing");
    assert.equal(noteDirty(s), true);
    s = reduce(s, { type: "noteDue" });
    assert.deepEqual(nextTask(s), { kind: "note", text: "Size 10" });
    s = step(s).s;
    assert.equal(noteDirty(s), false);
    assert.equal(nextTask(s), null);
});

test("the x on a photo still waiting sends nothing; on one sent or in flight, a delete", () => {
    let s = snapped(3);
    s = reduce(s, { type: "remove", id: "p1" }); // never left the page
    s = step(s).s; // the item
    const inFlight = nextTask(s);
    assert.deepEqual(inFlight, { kind: "photo", id: "p2", n: 2 });
    s = reduce(s, { type: "taskStart", task: inFlight });
    s = reduce(s, { type: "remove", id: "p2" }); // struck out while its PUT is on its way
    assert.deepEqual(s.deletes, [2]);
    s = reduce(s, { type: "taskDone", task: inFlight, answer: {} }); // the PUT lands anyway
    assert.deepEqual(nextTask(s), { kind: "delete", n: 2 }, "and is taken back off the PC");
    const { tasks, s: end } = drain(s);
    assert.deepEqual(tasks.map((t) => [t.kind, t.n]), [
        ["delete", 2],
        ["photo", 3],
    ]);
    assert.deepEqual(end.photos.map((p) => p.n), [3]);
});

test("the PC not answering: the photo waits, the queue stalls, and the wait grows", () => {
    let s = step(snapped(2)).s; // the item is made
    let r = step(s, OFFLINE);
    s = r.s;
    assert.equal(s.stalled, true);
    assert.equal(s.failures, 1);
    assert.equal(badgeText(s.photos[0]), "waiting", "not failed: it goes again by itself");
    assert.equal(nextTask(s), null, "nothing until the pause is over");
    assert.equal(bannerText(s), "Cannot reach the PC. Photos wait on this page and go to the PC as soon as it answers.");
    s = reduce(s, { type: "resume" });
    r = step(s, OFFLINE);
    assert.equal(r.task.id, "p1", "the same photo, first in line");
    s = r.s;
    assert.equal(s.failures, 2);
    assert.deepEqual([1, 2, 3, 4, 5, 9].map(retryDelayMs), [1000, 3000, 9000, 27000, 30000, 30000]);
    assert.equal(retryDelayMs(0), 0);
    s = reduce(s, { type: "resume" });
    const { s: end, tasks } = drain(s);
    assert.deepEqual(tasks.map((t) => t.n), [1, 2]);
    assert.equal(end.failures, 0);
    assert.equal(end.stalled, false);
    assert.equal(bannerText(end), "");
});

test("offline: nothing goes; back online, the queue carries on where it stopped", () => {
    let s = drain(snapped(1)).s;
    s = reduce(s, { type: "add", id: "p2", name: "Boots-2.jpg", n: 2 });
    s = reduce(s, { type: "online", online: false });
    s = reduce(s, { type: "add", id: "p3", name: "Boots-3.jpg", n: 3 });
    assert.equal(nextTask(s), null);
    assert.match(bannerText(s), /^You are offline/);
    // a request that was already out fails meanwhile: stalled as well
    s = reduce(s, { type: "online", online: true });
    s = step(s, OFFLINE).s;
    s = reduce(s, { type: "online", online: false });
    s = reduce(s, { type: "online", online: true });
    assert.equal(s.stalled, false, "coming back online lifts the stall at once");
    const { tasks } = drain(s);
    assert.deepEqual(tasks.map((t) => t.n), [2, 3]);
});

test("a photo the PC refuses shows failed, and a tap sends it again", () => {
    let s = step(snapped(2)).s;
    s = step(s, { status: 413, error: "a photo is at most 20 MB" }).s;
    assert.equal(badgeText(s.photos[0]), "failed");
    assert.equal(s.photos[0].error, "a photo is at most 20 MB");
    assert.equal(s.stalled, false, "the others go on");
    assert.deepEqual(nextTask(s), { kind: "photo", id: "p2", n: 2 });
    s = step(s).s;
    assert.equal(nextTask(s), null, "a failed photo waits for the tap");
    s = reduce(s, { type: "retry", id: "p1" });
    assert.deepEqual(nextTask(s), { kind: "photo", id: "p1", n: 1 });
    s = step(s).s;
    assert.deepEqual(s.photos.map(badgeText), ["sent", "sent"]);
    // the x on a failed photo deletes it on the PC too: the PUT may have landed
    let t = step(reduce(s, { type: "add", id: "p3", name: "Boots-3.jpg", n: 3 }), {
        status: 500,
        error: "the PC answered 500",
    }).s;
    t = reduce(t, { type: "remove", id: "p3" });
    assert.deepEqual(nextTask(t), { kind: "delete", n: 3 });
});

test("a wrong key on the first request: the queue stalls and the banner says why", () => {
    const s = step(snapped(1), { status: 401, error: "wrong key - check Settings" }).s;
    assert.equal(s.itemId, "");
    assert.equal(s.stalled, true);
    assert.equal(bannerText(s), "Wrong key - check Settings. Photos wait on this page and go to the PC as soon as it answers.");
    assert.equal(badgeText(s.photos[0]), "waiting");
});

test("a delete of a photo already gone is done; a delete that fails otherwise is tried again", () => {
    let s = drain(snapped(2)).s;
    s = reduce(s, { type: "remove", id: "p1" });
    const gone = step(s, { status: 404, error: "no item" }).s;
    assert.deepEqual(gone.deletes, []);
    const later = step(s, OFFLINE).s;
    assert.deepEqual(later.deletes, [1]);
    assert.equal(later.stalled, true);
});

test("the same name the same day is the same item: its photos join, ours number on after", () => {
    let s = snapped(2);
    s = reduce(s, { type: "toggleAi", id: "p2" });
    s = step(s, { photos: [1, 2, 5] }).s;
    assert.deepEqual(
        s.photos.map((p) => [p.id, p.n, p.name, p.status, p.ai]),
        [
            ["pc#1", 1, "Boots-1.jpg", "sent", false],
            ["pc#2", 2, "Boots-2.jpg", "sent", false],
            ["pc#5", 5, "Boots-5.jpg", "sent", false],
            ["p1", 6, "Boots-6.jpg", "waiting", false],
            ["p2", 7, "Boots-7.jpg", "waiting", true],
        ]
    );
    assert.deepEqual(nextTask(s), { kind: "photo", id: "p1", n: 6 }, "nothing is overwritten");
});

test("ebay and craigslist open when every photo is on the PC and one is marked AI", () => {
    let s = snapped(2);
    s = reduce(s, { type: "toggleAi", id: "p1" });
    assert.deepEqual(venueButton(s, "ebay", true), {
        enabled: false,
        hint: "Waiting for the photos to reach the PC (0 of 2 sent)",
    });
    s = step(step(s).s).s; // the item, photo 1
    assert.match(venueButton(s, "ebay", true).hint, /\(1 of 2 sent\)/);
    s = step(s, { status: 500, error: "the PC answered 500" }).s;
    assert.match(venueButton(s, "craigslist", true).hint, /did not reach the PC - tap/);
    s = step(reduce(s, { type: "retry", id: "p2" })).s;
    assert.deepEqual(venueButton(s, "ebay", true), { enabled: true, hint: "" });
    assert.deepEqual(venueButton(s, "craigslist", true), { enabled: true, hint: "" });
    // a delete still on its way closes them again until it is done
    s = reduce(s, { type: "remove", id: "p2" });
    assert.equal(venueButton(s, "ebay", true).enabled, false);
    s = step(s).s;
    assert.equal(venueButton(s, "ebay", true).enabled, true);
    // the AI mark is still needed once everything is there
    s = reduce(s, { type: "toggleAi", id: "p1" });
    assert.match(venueButton(s, "ebay", true).hint, /Mark at least one photo AI/);
});
