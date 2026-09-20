// tests/notes-delete-camera.test.js -- the logic added for the notes field,
// the delete-a-thumbnail x, and the in-page camera. Still pure: no DOM, no
// network. The camera module is exercised with stubs standing in for
// getUserMedia / ImageCapture / canvas.

import test from "node:test";
import assert from "node:assert/strict";

import {
    cameraErrorMessage,
    driveItemUrl,
    fileContentUrl,
    initialNote,
    initialState,
    makeDebouncer,
    NOTE_DEBOUNCE_MS,
    noteNeedsSave,
    noteStatusText,
    progressLine,
    reduce,
} from "../core.js";
import { cameraSupported, createCamera, VIDEO_CONSTRAINTS } from "../camera.js";

// --- Graph URLs ------------------------------------------------------------

test("fileContentUrl addresses note.txt by path, url-encoded", () => {
    assert.equal(
        fileContentUrl("Pictures/Uploads", "Blue Levi jacket", "note.txt"),
        "https://graph.microsoft.com/v1.0/me/drive/root:/Pictures/Uploads/Blue%20Levi%20jacket/note.txt:/content"
    );
});

test("driveItemUrl is the documented delete address", () => {
    assert.equal(
        driveItemUrl("01ABCDEF"),
        "https://graph.microsoft.com/v1.0/me/drive/items/01ABCDEF"
    );
    assert.equal(
        driveItemUrl("a b", "https://example.test/v1.0"),
        "https://example.test/v1.0/me/drive/items/a%20b"
    );
});

// --- the photo state machine, extended -------------------------------------

function withOnePhoto() {
    return reduce(initialState("Boots"), { type: "add", id: "p1", name: "Boots-1.jpg", n: 1 });
}

test("done carries the drive item id a later delete needs", () => {
    const s = reduce(withOnePhoto(), { type: "done", id: "p1", driveItemId: "01XYZ" });
    assert.equal(s.photos[0].status, "done");
    assert.equal(s.photos[0].driveItemId, "01XYZ");
});

test("done without an id leaves any id already known alone", () => {
    let s = reduce(withOnePhoto(), { type: "done", id: "p1", driveItemId: "01XYZ" });
    s = reduce(s, { type: "done", id: "p1" });
    assert.equal(s.photos[0].driveItemId, "01XYZ");
});

test("deleting -> remove takes the photo out of the list", () => {
    let s = reduce(withOnePhoto(), { type: "done", id: "p1", driveItemId: "01XYZ" });
    s = reduce(s, { type: "deleting", id: "p1" });
    assert.equal(s.photos[0].status, "deleting");
    s = reduce(s, { type: "remove", id: "p1" });
    assert.deepEqual(s.photos, []);
});

test("a failed delete brings the card back, marked, so the x can retry", () => {
    let s = reduce(withOnePhoto(), { type: "done", id: "p1", driveItemId: "01XYZ" });
    s = reduce(s, { type: "deleting", id: "p1" });
    s = reduce(s, { type: "deleteFailed", id: "p1", error: "delete failed (503)" });
    assert.equal(s.photos[0].status, "delete-failed");
    assert.equal(s.photos[0].driveItemId, "01XYZ", "the id must survive for the retry");
    assert.match(s.photos[0].error, /503/);
});

test("remove of an unknown id changes nothing and keeps the same object", () => {
    const s = withOnePhoto();
    assert.equal(reduce(s, { type: "remove", id: "nope" }), s);
});

test("numbering does not go backwards when a photo is removed", () => {
    // gaps are fine; a name is never reused. The counter lives outside the
    // photo list, so removing a photo cannot lower it.
    let s = withOnePhoto();
    s = reduce(s, { type: "add", id: "p2", name: "Boots-2.jpg", n: 2 });
    s = reduce(s, { type: "remove", id: "p1" });
    assert.deepEqual(
        s.photos.map((p) => p.name),
        ["Boots-2.jpg"]
    );
    assert.equal(progressLine(s), "0 of 1 uploaded");
});

// --- the note state machine ------------------------------------------------

test("a fresh note is clean and empty", () => {
    const n = initialNote();
    assert.equal(n.text, "");
    assert.equal(n.status, "clean");
    assert.equal(n.uploaded, false);
});

test("typing makes it dirty, saving then saved", () => {
    let s = reduce(initialState("Boots"), { type: "noteText", text: "Size 10, scuffed toe" });
    assert.equal(s.note.status, "dirty");
    assert.equal(noteNeedsSave(s), true);

    s = reduce(s, { type: "noteSaving" });
    assert.equal(noteStatusText(s.note), "saving...");

    s = reduce(s, {
        type: "noteSaved",
        text: "Size 10, scuffed toe",
        uploaded: true,
        driveItemId: "01NOTE",
    });
    assert.equal(s.note.status, "saved");
    assert.equal(s.note.uploaded, true);
    assert.equal(s.note.driveItemId, "01NOTE");
    assert.equal(noteNeedsSave(s), false);
    assert.equal(noteStatusText(s.note), "saved");
});

test("typing on while the save is in flight leaves it dirty, not saved", () => {
    let s = reduce(initialState("Boots"), { type: "noteText", text: "one" });
    s = reduce(s, { type: "noteSaving" });
    s = reduce(s, { type: "noteText", text: "one two" });
    s = reduce(s, { type: "noteSaved", text: "one", uploaded: true });
    assert.equal(s.note.status, "dirty");
    assert.equal(noteNeedsSave(s), true);
});

test("an empty note saves nothing unless one was already uploaded", () => {
    let s = reduce(initialState("Boots"), { type: "noteText", text: "   " });
    assert.equal(noteNeedsSave(s), false, "nothing up there, nothing to do");

    s = reduce(s, { type: "noteText", text: "something" });
    s = reduce(s, { type: "noteSaved", text: "something", uploaded: true, driveItemId: "01N" });
    s = reduce(s, { type: "noteText", text: "" });
    assert.equal(noteNeedsSave(s), true, "the uploaded note.txt must be deleted");
});

test("with no item name there is nowhere to put the note", () => {
    const s = reduce(initialState(""), { type: "noteText", text: "hello" });
    assert.equal(noteNeedsSave(s), false);
});

test("a failed save says so, and says offline when he is", () => {
    const s = reduce(initialState("Boots"), { type: "noteFailed", error: "network problem" });
    assert.equal(noteStatusText(s.note, true), "not saved, will retry");
    assert.equal(noteStatusText(s.note, false), "not saved (offline), will retry");
});

test("clean and dirty stay quiet", () => {
    assert.equal(noteStatusText(initialNote()), "");
    assert.equal(noteStatusText({ ...initialNote(), status: "dirty" }), "");
});

test("noteReset forgets what the previous folder had saved", () => {
    let s = reduce(initialState("Boots"), { type: "noteText", text: "a" });
    s = reduce(s, { type: "noteSaved", text: "a", uploaded: true, driveItemId: "01N" });
    s = reduce(s, { type: "noteReset", text: "a" });
    assert.equal(s.note.savedText, "");
    assert.equal(s.note.uploaded, false);
    assert.equal(s.note.driveItemId, undefined);
    assert.equal(s.note.status, "dirty", "the text must be saved again, into the new folder");
});

test("reset clears the note along with the photos", () => {
    let s = reduce(initialState("Boots"), { type: "noteText", text: "a" });
    s = reduce(s, { type: "add", id: "p1", name: "Boots-1.jpg", n: 1 });
    s = reduce(s, { type: "reset", itemName: "" });
    assert.deepEqual(s.photos, []);
    assert.equal(s.note.text, "");
    assert.equal(s.note.status, "clean");
});

// --- the debouncer ---------------------------------------------------------

function fakeTimers() {
    let next = 1;
    const jobs = new Map();
    return {
        timers: {
            setTimer: (fn, ms) => {
                const h = next++;
                jobs.set(h, { fn, ms });
                return h;
            },
            clearTimer: (h) => jobs.delete(h),
        },
        runAll() {
            for (const [h, job] of [...jobs]) {
                jobs.delete(h);
                job.fn();
            }
        },
        count: () => jobs.size,
    };
}

test("the debouncer keeps only the last call and fires it once", () => {
    const t = fakeTimers();
    const d = makeDebouncer(NOTE_DEBOUNCE_MS, t.timers);
    const seen = [];
    d.schedule(() => seen.push("a"));
    d.schedule(() => seen.push("b"));
    d.schedule(() => seen.push("c"));
    assert.equal(t.count(), 1, "the earlier timers must be cleared");
    assert.equal(d.pending(), true);
    t.runAll();
    assert.deepEqual(seen, ["c"]);
    assert.equal(d.pending(), false);
});

test("flush runs the waiting call now and cancel drops it", () => {
    const t = fakeTimers();
    const d = makeDebouncer(50, t.timers);
    let ran = 0;
    d.schedule(() => (ran += 1));
    d.flush();
    assert.equal(ran, 1);
    d.flush();
    assert.equal(ran, 1, "flush twice must not repeat the call");

    d.schedule(() => (ran += 1));
    d.cancel();
    t.runAll();
    assert.equal(ran, 1);
});

test("the note debounce is a second or two, as asked", () => {
    assert.ok(NOTE_DEBOUNCE_MS >= 1000 && NOTE_DEBOUNCE_MS <= 2000);
});

// --- camera errors ---------------------------------------------------------

test("camera errors are explained in plain words, pointing at the fallback", () => {
    assert.match(cameraErrorMessage({ name: "NotAllowedError" }), /Camera blocked/);
    assert.match(cameraErrorMessage({ name: "NotFoundError" }), /No camera/);
    assert.match(cameraErrorMessage({ name: "NotReadableError" }), /busy/);
    assert.match(cameraErrorMessage({ name: "Weird", message: "x" }), /could not start/);
    for (const name of ["NotAllowedError", "NotFoundError", "Weird"]) {
        assert.match(cameraErrorMessage({ name }), /camera app below/);
    }
});

// --- the camera module, with stubs -----------------------------------------

function stubVideo() {
    return {
        srcObject: null,
        videoWidth: 1920,
        videoHeight: 1080,
        muted: false,
        setAttribute() {},
        play: async () => {},
    };
}

function stubStream() {
    const track = { readyState: "live", kind: "video", stopped: false, stop() { this.stopped = true; } };
    return {
        track,
        getVideoTracks: () => [track],
        getTracks: () => [track],
    };
}

function stubNav(stream, calls) {
    return {
        mediaDevices: {
            getUserMedia: async (c) => {
                calls.push(c);
                return stream;
            },
        },
    };
}

test("cameraSupported is false where there is no mediaDevices (http, old browser)", () => {
    assert.equal(cameraSupported({}), false);
    assert.equal(cameraSupported(undefined), false);
    assert.equal(cameraSupported({ mediaDevices: { getUserMedia: () => {} } }), true);
});

test("it asks for the rear camera as an ideal, never an exact", () => {
    assert.equal(VIDEO_CONSTRAINTS.facingMode.ideal, "environment");
    assert.equal("exact" in VIDEO_CONSTRAINTS.facingMode, false);
    assert.ok(VIDEO_CONSTRAINTS.width.ideal >= 3000);
});

test("start attaches the stream to the video and asks for the back camera", async () => {
    const stream = stubStream();
    const calls = [];
    const video = stubVideo();
    const cam = createCamera({ nav: stubNav(stream, calls), imageCaptureCtor: null });
    await cam.start(video);
    assert.equal(video.srcObject, stream);
    assert.equal(calls[0].audio, false);
    assert.equal(calls[0].video.facingMode.ideal, "environment");
    assert.equal(cam.isActive(), true);
    cam.stop();
    assert.equal(stream.track.stopped, true);
    assert.equal(video.srcObject, null);
    assert.equal(cam.isActive(), false);
});

test("capture uses ImageCapture at the largest size the camera admits to", async () => {
    const stream = stubStream();
    const asked = [];
    class FakeImageCapture {
        constructor(track) {
            this.track = track;
        }
        async getPhotoCapabilities() {
            return {
                imageWidth: { min: 640, max: 4032, step: 1 },
                imageHeight: { min: 480, max: 3024, step: 1 },
            };
        }
        async takePhoto(settings) {
            asked.push(settings);
            return { size: 1234, type: "image/jpeg" };
        }
    }
    const cam = createCamera({
        nav: stubNav(stream, []),
        imageCaptureCtor: FakeImageCapture,
    });
    await cam.start(stubVideo());
    const blob = await cam.capture();
    assert.equal(blob.type, "image/jpeg");
    assert.deepEqual(asked[0], { imageWidth: 4032, imageHeight: 3024 });
    assert.equal(cam.lastMode(), "ImageCapture");
});

test("capture falls back to the canvas when ImageCapture is missing", async () => {
    const stream = stubStream();
    let drew = false;
    const doc = {
        createElement: () => ({
            width: 0,
            height: 0,
            getContext: () => ({ drawImage: () => (drew = true) }),
            toBlob: (cb, type, q) => cb({ size: 99, type, quality: q }),
        }),
    };
    const cam = createCamera({ nav: stubNav(stream, []), imageCaptureCtor: null, doc });
    await cam.start(stubVideo());
    const blob = await cam.capture();
    assert.equal(drew, true);
    assert.equal(blob.type, "image/jpeg");
    assert.equal(blob.quality, 0.92);
    assert.equal(cam.lastMode(), "canvas");
});

test("capture falls back to the canvas when takePhoto throws", async () => {
    const stream = stubStream();
    class Throwing {
        async getPhotoCapabilities() {
            throw new Error("nope");
        }
        async takePhoto() {
            const e = new Error("InvalidStateError");
            e.name = "InvalidStateError";
            throw e;
        }
    }
    const doc = {
        createElement: () => ({
            width: 0,
            height: 0,
            getContext: () => ({ drawImage() {} }),
            toBlob: (cb, type) => cb({ size: 1, type }),
        }),
    };
    const cam = createCamera({ nav: stubNav(stream, []), imageCaptureCtor: Throwing, doc });
    await cam.start(stubVideo());
    const blob = await cam.capture();
    assert.equal(blob.type, "image/jpeg");
    assert.equal(cam.lastMode(), "canvas");
});

test("capture before start is an error, not a crash later", async () => {
    const cam = createCamera({ nav: stubNav(stubStream(), []), imageCaptureCtor: null });
    await assert.rejects(() => cam.capture(), /not running/);
});

test("start without a camera API says NotSupportedError", async () => {
    const cam = createCamera({ nav: {}, imageCaptureCtor: null });
    await assert.rejects(() => cam.start(stubVideo()), { name: "NotSupportedError" });
});
