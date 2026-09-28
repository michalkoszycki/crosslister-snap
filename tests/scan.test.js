// tests/scan.test.js -- reading the ISBN off a photo, and asking the PC about it.
// BarcodeDetector (Chrome on Android) and fetch are faked; nothing else is needed.

import test from "node:test";
import assert from "node:assert/strict";

import { canScan, readIsbn } from "../scan.js";
import { getBook, PcError, searchBook } from "../pc.js";

const ISBN = "9780306406157";
const photo = new Blob(["back cover"], { type: "image/jpeg" });

/** A phone whose barcode reader finds `values`, or throws `error`. */
function phone({ values = [], error = null } = {}) {
    const seen = { formats: null, closed: 0 };
    globalThis.BarcodeDetector = class {
        constructor({ formats }) {
            seen.formats = formats;
        }
        async detect() {
            if (error) throw error;
            return values.map((rawValue) => ({ rawValue, format: "ean_13" }));
        }
    };
    globalThis.createImageBitmap = async () => ({
        width: 10,
        height: 10,
        close: () => {
            seen.closed += 1;
        },
    });
    return seen;
}

test("without BarcodeDetector (an iPhone) nothing can be read, and that is not an error", async () => {
    delete globalThis.BarcodeDetector;
    assert.equal(canScan(), false);
    assert.equal(await readIsbn(photo), "");
});

test("the bookland EAN-13 is read, asked for as ean_13, and the bitmap is let go", async () => {
    const seen = phone({ values: [ISBN] });
    assert.equal(canScan(), true);
    assert.equal(await readIsbn(photo), ISBN);
    assert.deepEqual(seen.formats, ["ean_13"]);
    assert.equal(seen.closed, 1);
});

test("only a valid 978/979 code counts; another barcode or none is ''", async () => {
    phone({ values: ["4006381333931", "9780306406158", ISBN] });
    assert.equal(await readIsbn(photo), ISBN, "the shop's EAN and a misread are skipped");
    phone({ values: ["4006381333931"] });
    assert.equal(await readIsbn(photo), "");
    phone({ values: [] });
    assert.equal(await readIsbn(photo), "");
});

test("a reader that fails (a format it lacks, a photo it cannot decode) reads as ''", async () => {
    phone({ error: new TypeError("ean_13 is not supported") });
    assert.equal(await readIsbn(photo), "");
    delete globalThis.BarcodeDetector;
});

test("getBook asks GET /books/<isbn13> with the key; a 404 carries its status", async () => {
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push({ url, init });
        return url.endsWith(ISBN)
            ? new Response(JSON.stringify({ isbn: ISBN, title: "T" }), { status: 200 })
            : new Response(JSON.stringify({ detail: "not in the catalogues" }), { status: 404 });
    };
    const settings = { pc: "https://pc.tail1234.ts.net", key: "test-key-0123456789" };
    assert.deepEqual(await getBook(settings, ISBN), { isbn: ISBN, title: "T" });
    assert.equal(calls[0].url, `https://pc.tail1234.ts.net/books/${ISBN}`);
    assert.equal(calls[0].init.method, "GET");
    assert.equal(calls[0].init.headers["X-Crosslister-Key"], "test-key-0123456789");
    await assert.rejects(getBook(settings, "9780804429573"), (e) => {
        assert.ok(e instanceof PcError);
        assert.equal(e.status, 404);
        return true;
    });
});

test("searchBook asks GET /books/search with the title, author and year, each URL-encoded", async () => {
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ title: "Dune", found: true }), { status: 200 });
    };
    const settings = { pc: "https://pc.tail1234.ts.net", key: "test-key-0123456789" };
    const answer = await searchBook(settings, { title: "Dune & Sons: #1?", author: "Frank Herbert", year: "" });
    assert.deepEqual(answer, { title: "Dune", found: true });
    assert.equal(
        calls[0].url,
        "https://pc.tail1234.ts.net/books/search?title=Dune%20%26%20Sons%3A%20%231%3F&author=Frank%20Herbert&year="
    );
    assert.equal(calls[0].init.method, "GET");
    assert.equal(calls[0].init.headers["X-Crosslister-Key"], "test-key-0123456789");
});
