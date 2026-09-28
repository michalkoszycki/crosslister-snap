// tests/page.test.js -- the headless "does the page actually work" check.
//
// There is no browser here, so we stub just enough of one: a DOM whose
// getElementById only knows the ids that really exist in index.html. If app.js
// asks for an element the HTML does not have, this test fails -- which is the
// mistake a browser would only show as a console error. The last tests drive
// the page end to end against a fake PC (fetch), a fake camera photo and fake
// timers: snap (each photo goes to the PC at once), mark, ebay, poll, link,
// craigslist by sku, DONE; offline and back; a refused photo; a reload.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const PAGE_FILES = ["app.js", "core.js", "pc.js", "queue.js", "shrink.js", "book.js", "scan.js", "version.js"];

function idsIn(source) {
    return new Set([...source.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
}

function referencedFiles(source) {
    const out = new Set();
    for (const m of source.matchAll(/(?:src|href)="([^"]+)"/g)) {
        const v = m[1];
        if (!v.startsWith("http") && !v.startsWith("#")) out.add(v.split("?")[0]);
    }
    return out;
}

// --- static checks ---------------------------------------------------------

test("index.html references only files that exist", () => {
    for (const f of referencedFiles(html)) {
        assert.ok(existsSync(join(root, f)), `missing file referenced by index.html: ${f}`);
    }
});

test("the OneDrive path is gone: no MSAL, no Graph, no sign-in", () => {
    for (const gone of ["graph.js", "auth.js", "bridge.js", "redirect.html", "config.js", "vendor"]) {
        assert.ok(!existsSync(join(root, gone)), `${gone} should be gone`);
    }
    for (const file of ["index.html", ...PAGE_FILES]) {
        const src = readFileSync(join(root, file), "utf8");
        assert.ok(!/microsoft|onedrive|msal|1drv/i.test(src), `${file} still mentions OneDrive/MSAL`);
    }
});

test("the Content-Security-Policy allows the PC through Tailscale and nothing else", () => {
    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
    const connect = /connect-src([^;]*);/.exec(csp)[1].trim().split(/\s+/);
    assert.deepEqual(connect, [
        "'self'",
        "https://*.ts.net",
        "https://*.ts.net:*",
        "http://127.0.0.1:*",
        "http://localhost:*",
    ]);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /img-src[^;]*blob:/);
    assert.match(csp, /default-src 'none'/);
    assert.ok(!csp.includes("frame-src"), "no sign-in frame any more");
    assert.ok(!csp.includes("unsafe-inline"), "CSP must not allow inline script");
});

test("every ?v= in the repo is the one VERSION, so nothing loads half-stale", async () => {
    const { VERSION } = await import("../version.js");
    let seen = 0;
    for (const file of ["index.html", ...PAGE_FILES]) {
        const src = readFileSync(join(root, file), "utf8");
        for (const m of src.matchAll(/\?v=(\d+\.\d+\.\d+)/g)) {
            seen += 1;
            assert.equal(m[1], VERSION, `${file} carries ?v=${m[1]}, VERSION is ${VERSION}`);
        }
    }
    assert.ok(seen >= 7, `expected the cache-busting query on every module, saw ${seen}`);
    assert.match(html, new RegExp(`src="app\\.js\\?v=${VERSION.replace(/\./g, "\\.")}"`));
    assert.match(html, new RegExp(`href="styles\\.css\\?v=${VERSION.replace(/\./g, "\\.")}"`));
    // the bump tool rewrites every file that carries one
    const tool = readFileSync(join(root, "tools/bump-version.mjs"), "utf8");
    for (const file of ["index.html", ...PAGE_FILES]) {
        const src = readFileSync(join(root, file), "utf8");
        if (/\?v=/.test(src) && file !== "version.js") {
            assert.ok(tool.includes(`"${file}"`), `bump-version.mjs does not rewrite ${file}`);
        }
    }
});

test("the work section reads top to bottom the way Michal asked", () => {
    // Michal, 2026-09-24: Snap, the photos, the notes, then ebay | craigslist
    // with a status line and link under each, and DONE at the very bottom.
    const work = /<section id="work"[^>]*>([\s\S]*?)<\/section>/.exec(html)[1];
    const order = [...work.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(order, [
        "item-name",
        "cleaned",
        "hint",
        "snap-label",
        "snap-input",
        "gallery-label",
        "gallery-input",
        "progress",
        "strip",
        "note-status",
        "note",
        "ebay-btn",
        "ebay-status",
        "ebay-link",
        "craigslist-btn",
        "craigslist-status",
        "craigslist-link",
        "venue-hint",
        "done-hint",
        "next-item",
    ]);
    // Snap hands over to the phone's own camera app, full screen
    assert.match(html, /capture="environment"/);
    // DONE: the same big button as Snap, only green
    const done = /<button type="button" id="next-item"[^>]*>([^<]*)</.exec(html);
    assert.match(done[0], /class="[^"]*\bbig\b[^"]*"/);
    assert.equal(done[1].trim(), "DONE");
    // the two buttons say exactly what he said
    assert.match(html, /id="ebay-btn"[^>]*>ebay</);
    assert.match(html, /id="craigslist-btn"[^>]*>craigslist</);
    // links open in a new tab and hand nothing back to this page
    for (const v of ["ebay", "craigslist"]) {
        assert.match(html, new RegExp(`id="${v}-link"[^>]*target="_blank" rel="noopener noreferrer"`));
    }
});

test("the manifest points at icons that exist", () => {
    const manifest = JSON.parse(readFileSync(join(root, "manifest.webmanifest"), "utf8"));
    assert.equal(manifest.display, "standalone");
    for (const icon of manifest.icons) {
        assert.ok(existsSync(join(root, icon.src)), `missing icon ${icon.src}`);
    }
});

test("nothing is logged to the console, so the key never is", () => {
    for (const file of PAGE_FILES) {
        const src = readFileSync(join(root, file), "utf8");
        assert.ok(!/console\.(log|debug|info|warn|error)\s*\(/.test(src), `${file} logs`);
    }
});

test("every storage touch in app.js goes through the try/catch helpers", () => {
    const app = readFileSync(join(root, "app.js"), "utf8");
    const direct = [...app.matchAll(/\b(localStorage|sessionStorage)\s*\./g)];
    assert.deepEqual(direct.map((m) => m[0]), [], "use readText/writeText, never the store directly");
});

test("no test file is left over from the OneDrive page", () => {
    assert.ok(!readdirSync(join(root, "tests")).includes("notes-delete.test.js"));
});

// --- the DOM stub ----------------------------------------------------------

function fakeElement(id = "", tag = "") {
    const classes = new Set();
    const attrs = {};
    return {
        id,
        tag,
        hidden: false,
        disabled: false,
        value: "",
        textContent: "",
        className: "",
        title: "",
        src: "",
        alt: "",
        href: "",
        type: "",
        width: 0,
        height: 0,
        children: [],
        attrs,
        classList: {
            add: (c) => classes.add(c),
            remove: (c) => classes.delete(c),
            contains: (c) => classes.has(c),
            toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
        },
        listeners: {},
        addEventListener(type, fn) {
            (this.listeners[type] ||= []).push(fn);
        },
        fire(type, event = {}) {
            for (const fn of this.listeners[type] || []) fn({ target: this, ...event });
        },
        append(...kids) {
            this.children.push(...kids);
        },
        replaceChildren(...kids) {
            this.children = kids;
        },
        focus() {},
        setAttribute(k, v) {
            attrs[k] = String(v);
        },
        // canvas, for shrink.js
        getContext: () => ({ drawImage() {} }),
        toBlob(cb, type) {
            cb(new Blob([`jpeg ${this.width}x${this.height}`], { type }));
        },
    };
}

function memoryStore(initial = {}) {
    const m = new Map(Object.entries(initial));
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
        map: m,
    };
}

/**
 * A phone that reads barcodes (Chrome on Android): BarcodeDetector finds these
 * raw values in any photo. Without it, as on an iPhone, the page must say the
 * ISBN has to be typed.
 */
function fakeBarcodes(values) {
    globalThis.BarcodeDetector = class {
        constructor({ formats }) {
            assert.deepEqual(formats, ["ean_13"]);
        }
        async detect() {
            return values.map((rawValue) => ({ rawValue, format: "ean_13" }));
        }
    };
}

function installDom({ local = memoryStore(), fetchImpl, barcodes } = {}) {
    delete globalThis.BarcodeDetector;
    if (barcodes) fakeBarcodes(barcodes);
    const ids = idsIn(html);
    const nodes = new Map([...ids].map((id) => [id, fakeElement(id)]));
    // elements the HTML starts hidden (the settings card, the offline banner...)
    for (const m of html.matchAll(/<[a-z]+\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
        if (/\shidden[\s>]/.test(m[0])) nodes.get(m[1]).hidden = true;
    }
    const asked = new Set();
    globalThis.document = {
        getElementById(id) {
            asked.add(id);
            return nodes.get(id) ?? null;
        },
        createElement: (tag) => fakeElement("", tag),
        addEventListener() {},
        visibilityState: "visible",
    };
    const win = fakeElement("window");
    globalThis.window = win;
    Object.defineProperty(globalThis, "navigator", {
        value: { onLine: true },
        configurable: true,
        writable: true,
    });
    if (typeof local === "function") {
        // storage blocked: merely touching it throws, as in some private modes
        Object.defineProperty(globalThis, "localStorage", { get: local, configurable: true });
    } else {
        Object.defineProperty(globalThis, "localStorage", {
            value: local,
            configurable: true,
            writable: true,
        });
    }
    Object.defineProperty(globalThis, "sessionStorage", {
        value: memoryStore(),
        configurable: true,
        writable: true,
    });
    globalThis.URL.createObjectURL = () => "blob:stub";
    globalThis.URL.revokeObjectURL = () => {};
    // a Pixel photo: 4032 x 3024, which shrink.js must bring down to 2000 x 1500
    globalThis.createImageBitmap = async () => ({ width: 4032, height: 3024, close() {} });
    globalThis.fetch =
        fetchImpl ||
        (async () => {
            throw new Error("this test must not reach the network");
        });
    return { nodes, asked, win };
}

let loads = 0;
async function loadPage(options) {
    const dom = installDom(options);
    loads += 1;
    await import(`../app.js?load=${loads}`); // top-level main() runs during this import
    await settle();
    return dom;
}

/** Let every pending promise run (fetch answers, shrinks) without real time passing. */
async function settle() {
    for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r));
}

const GOOD = { "snap.pc": "http://127.0.0.1:8765", "snap.key": "test-key-0123456789" };

test("app.js loads against the real index.html ids, with no settings yet", async () => {
    const { nodes, asked } = await loadPage();
    for (const id of asked) {
        assert.ok(nodes.has(id), `app.js asked for #${id}, which index.html does not have`);
    }
    assert.equal(nodes.get("ebay-btn").disabled, true);
    assert.equal(nodes.get("craigslist-btn").disabled, true);
    assert.equal(nodes.get("venue-hint").textContent, "Set the PC address and key in Settings");
    assert.equal(nodes.get("next-item").disabled, true);
    assert.equal(nodes.get("settings").hidden, true);
    const { VERSION } = await import("../version.js");
    assert.equal(nodes.get("version").textContent, VERSION);
});

test("the page still works when the browser blocks storage outright", async () => {
    const { nodes } = await loadPage({
        local: () => {
            throw new Error("SecurityError");
        },
    });
    assert.equal(nodes.get("venue-hint").textContent, "Set the PC address and key in Settings");
    nodes.get("settings-toggle").fire("click");
    assert.equal(nodes.get("settings").hidden, false);
    assert.equal(nodes.get("pc-address").value, "");
});

test("Settings: a bad address is refused on the page; a good one is saved and checked", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] }); // the page's own server check runs on a timer
    const calls = [];
    const local = memoryStore();
    const { nodes } = await loadPage({
        local,
        fetchImpl: async (url, init) => {
            calls.push({ url, init });
            return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
        },
    });
    nodes.get("settings-toggle").fire("click");
    nodes.get("pc-address").value = "http://pc.tail1234.ts.net";
    nodes.get("pc-key").value = "test-key-0123456789";
    nodes.get("settings-save").fire("click");
    await settle();
    assert.match(nodes.get("settings-status").textContent, /https/);
    assert.equal(local.map.size, 0, "nothing saved");
    assert.equal(calls.length, 0);

    nodes.get("pc-address").value = "https://pc.tail1234.ts.net/";
    nodes.get("settings-save").fire("click");
    await settle();
    assert.equal(local.getItem("snap.pc"), "https://pc.tail1234.ts.net");
    assert.equal(local.getItem("snap.key"), "test-key-0123456789");
    assert.deepEqual(calls.map((c) => c.url), ["https://pc.tail1234.ts.net/jobs?limit=1"]);
    assert.equal(calls[0].init.headers["X-Crosslister-Key"], "test-key-0123456789");
    assert.match(nodes.get("settings-status").textContent, /knows this key/);
    // with settings, the hint moves on to what the item still needs
    assert.equal(nodes.get("venue-hint").textContent, "Snap a photo first");
});

test("Settings: a wrong key is reported as such", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] }); // the page's own server check runs on a timer
    const { nodes } = await loadPage({
        fetchImpl: async () =>
            new Response(JSON.stringify({ detail: "a valid X-Crosslister-Key header is needed" }), {
                status: 401,
            }),
    });
    nodes.get("settings-toggle").fire("click");
    nodes.get("pc-address").value = "http://127.0.0.1:8765";
    nodes.get("pc-key").value = "wrong-key-0123456789";
    nodes.get("settings-save").fire("click");
    await settle();
    assert.match(nodes.get("settings-status").textContent, /wrong key/);
});

function snap(nodes, count = 1) {
    const files = Array.from({ length: count }, (_, i) => new Blob([`raw ${i}`], { type: "image/jpeg" }));
    nodes.get("snap-input").fire("change", { target: { files, value: "" } });
}

function card(nodes, i) {
    const li = nodes.get("strip").children[i];
    const child = (cls) => li.children.find((c) => c.className && c.className.split(" ")[0] === cls);
    return { li, x: child("kill"), ai: child("ai-mark"), badge: child("badge"), remote: child("shot-remote") };
}

function badges(nodes) {
    return nodes.get("strip").children.map((_, i) => card(nodes, i).badge.textContent);
}

const TODAY = "2026-09-24";

/**
 * The PC as the page sees it: `crosslister serve`'s items and jobs, in memory.
 * `down` makes every call fail as an unreachable PC does; `jobs` answers
 * GET /jobs/<id>; `refuseJob` answers POST /jobs with a 400.
 */
function fakePc({ jobs = {}, refuseJob = "", items = {}, books = {}, searches = {} } = {}) {
    const pc = {
        items: new Map(Object.entries(items)),
        calls: [],
        posted: [],
        checks: 0,
        down: false,
    };
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
    pc.fetch = async (url, init = {}) => {
        const method = init.method || "GET";
        const u = new URL(url);
        const parts = u.pathname.split("/").slice(1).map(decodeURIComponent);
        // the page's own server check is counted apart, so `calls` stays the item's traffic
        const check = method === "GET" && parts[0] === "jobs" && !parts[1];
        if (check) pc.checks += 1;
        else pc.calls.push(`${method} /${parts.join("/")}${u.search}`);
        if (pc.down) throw new TypeError("Failed to fetch");
        const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
        if (parts[0] === "items" && method === "POST") {
            const item = `${body.name} ${TODAY}`;
            if (!pc.items.has(item)) pc.items.set(item, { photos: new Map(), note: "", sku: null, jobs: [] });
            return json({ item, photos: [...pc.items.get(item).photos.keys()].sort((a, b) => a - b) });
        }
        if (parts[0] === "items") {
            const item = pc.items.get(parts[1]);
            if (!item) return json({ detail: `no item '${parts[1]}'` }, 404);
            if (parts[2] === "photos" && method === "PUT") {
                item.photos.set(Number(parts[3]), await init.body.text());
                return json({ item: parts[1], n: Number(parts[3]), bytes: 1 });
            }
            if (parts[2] === "photos" && method === "DELETE") {
                const deleted = item.photos.delete(Number(parts[3]));
                return json({ item: parts[1], n: Number(parts[3]), deleted });
            }
            if (parts[2] === "note") {
                item.note = body.note.trim();
                return json({ item: parts[1], note: item.note });
            }
            return json({
                item: parts[1],
                photos: [...item.photos.keys()].sort((a, b) => a - b),
                note: item.note,
                sku: item.sku,
                jobs: item.jobs,
            });
        }
        if (parts[0] === "jobs" && method === "POST") {
            pc.posted.push(body);
            if (refuseJob) return json({ detail: refuseJob }, 400);
            return json({ job: body.venue === "ebay" ? "j1" : "j2", state: "queued", ahead: 1 });
        }
        if (parts[0] === "jobs" && parts[1]) {
            const answer = jobs[parts[1]];
            return answer ? json(answer()) : json({ detail: "no such job" }, 404);
        }
        // a book with no ISBN, by what was typed: `searches` maps a title to the
        // answer (found: true), or to {status, body} for an error; a title no
        // catalogue knows is found: false, with eBay's price for the title if any
        if (parts[0] === "books" && parts[1] === "search" && method === "GET") {
            const title = u.searchParams.get("title");
            const answer = searches[title];
            if (answer && answer.status) return json(answer.body, answer.status);
            if (answer) return json({ ...answer, found: true });
            return json({
                isbn: "",
                title,
                subtitle: "",
                authors: [u.searchParams.get("author")].filter(Boolean),
                publisher: "",
                year: u.searchParams.get("year"),
                format: "",
                pages: 0,
                price: "6",
                listings: { count: 2, low: "5.00", high: "8.00" },
                route: "list",
                found: false,
            });
        }
        // a book from the catalogues: `books` maps an ISBN-13 to the answer, or to
        // {status, body} for an error; a book it does not know is a 404
        if (parts[0] === "books" && method === "GET") {
            const answer = books[parts[1]];
            if (!answer) return json({ detail: `${parts[1]} is not in the catalogues` }, 404);
            return answer.status ? json(answer.body, answer.status) : json(answer);
        }
        return json({ jobs: [] });
    };
    return pc;
}

async function typeName(nodes, name) {
    nodes.get("item-name").value = name;
    nodes.get("item-name").fire("input");
}

test("end to end: each photo goes to the PC as it is taken; mark, ebay, link, craigslist by sku, DONE", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let ebayState = "running";
    const local = memoryStore(GOOD);
    const pc = fakePc({
        jobs: {
            j1: () => ({
                state: ebayState,
                step: ebayState === "running" ? "drafting the listing" : "posted",
                sku: "B-0042",
                links: ebayState === "done" ? { ebay: "https://www.ebay.com/itm/123" } : {},
                error: "",
                ahead: 0,
            }),
            j2: () => ({
                state: "done",
                sku: "B-0042",
                links: { craigslist: "https://sfbay.craigslist.org/x/1.html" },
            }),
        },
    });
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch });
    const item = `Boots ${TODAY}`;

    await typeName(nodes, "Boots");
    snap(nodes, 3);
    assert.equal(nodes.get("strip").children.length, 3);
    await settle();
    // the item folder with the first photo, then each photo on its own, in order
    assert.deepEqual(pc.calls, [
        "POST /items",
        `PUT /items/${item}/photos/1`,
        `PUT /items/${item}/photos/2`,
        `PUT /items/${item}/photos/3`,
    ]);
    const onPc = pc.items.get(item).photos;
    assert.equal(onPc.get(1), "jpeg 2000x1500", "shrunk to 2000 px on the long edge");
    assert.deepEqual(badges(nodes), ["sent", "sent", "sent"]);
    assert.equal(nodes.get("progress").textContent, "3 photos, 0 for the AI, all on the PC");
    assert.equal(nodes.get("item-name").readOnly, true, "the folder on the PC is named");
    assert.equal(nodes.get("ebay-btn").disabled, true, "no AI mark yet");
    assert.match(nodes.get("venue-hint").textContent, /Mark at least one photo AI/);
    // kept for a reload
    assert.deepEqual(JSON.parse(local.getItem("snap.item")), { itemName: "Boots", itemId: item, ai: [] });

    // the AI mark at the bottom right: off by default, on when tapped
    assert.equal(card(nodes, 0).ai.attrs["aria-pressed"], "false");
    card(nodes, 2).ai.fire("click");
    assert.equal(card(nodes, 2).ai.attrs["aria-pressed"], "true");
    assert.equal(card(nodes, 2).li.className, "shot shot-ai");
    // the x at the top right deletes on the page and on the PC
    card(nodes, 0).x.fire("click");
    await settle();
    assert.equal(nodes.get("strip").children.length, 2);
    assert.equal(pc.calls.at(-1), `DELETE /items/${item}/photos/1`);
    assert.deepEqual([...onPc.keys()], [2, 3]);
    assert.equal(nodes.get("ebay-btn").disabled, false);
    assert.equal(nodes.get("venue-hint").hidden, true);

    // the note goes a moment after he stops typing
    nodes.get("note").value = "Size 10, scuffed toe";
    nodes.get("note").fire("input");
    await settle();
    assert.equal(pc.calls.at(-1), `DELETE /items/${item}/photos/1`, "not while typing");
    t.mock.timers.tick(1500);
    await settle();
    assert.equal(pc.calls.at(-1), `PUT /items/${item}/note`);
    assert.equal(pc.items.get(item).note, "Size 10, scuffed toe");
    assert.equal(nodes.get("note-status").textContent, "sent");

    nodes.get("ebay-btn").fire("click");
    await settle();
    assert.deepEqual(pc.posted, [{ item, venue: "ebay", ai: [3] }], "the item, the venue, the marks");
    assert.equal(nodes.get("ebay-status").textContent, "queued, 1 ahead");
    // the ring turns in the pressed button from the press on; the other button has none
    assert.equal(nodes.get("ebay-btn").classList.contains("busy"), true);
    assert.equal(nodes.get("ebay-btn").attrs["aria-busy"], "true");
    assert.equal(nodes.get("craigslist-btn").classList.contains("busy"), false);
    assert.equal(nodes.get("next-item").disabled, true);
    assert.match(nodes.get("done-hint").textContent, /DONE waits/);
    assert.equal(nodes.get("snap-input").disabled, true, "posted photos are locked");
    assert.equal(card(nodes, 0).x, undefined, "no x on a posted photo");

    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("ebay-status").textContent, "drafting the listing");
    // the sku is known: craigslist may go now, by sku alone
    assert.equal(nodes.get("craigslist-btn").disabled, false);

    ebayState = "done";
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("ebay-link").hidden, false);
    assert.equal(nodes.get("ebay-link").href, "https://www.ebay.com/itm/123");
    assert.equal(nodes.get("ebay-link").textContent, "https://www.ebay.com/itm/123");
    assert.equal(nodes.get("ebay-btn").disabled, true, "posted once is enough");
    assert.equal(nodes.get("ebay-btn").classList.contains("busy"), false, "the ring stops with the link");
    assert.equal(nodes.get("ebay-btn").attrs["aria-busy"], "false");
    assert.equal(nodes.get("next-item").disabled, false);

    nodes.get("craigslist-btn").fire("click");
    await settle();
    assert.deepEqual(pc.posted[1], { sku: "B-0042", venue: "craigslist" });
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("craigslist-link").href, "https://sfbay.craigslist.org/x/1.html");

    // no more calls once both are done
    const quiet = pc.calls.length;
    t.mock.timers.tick(30000);
    await settle();
    assert.equal(pc.calls.length, quiet);

    nodes.get("next-item").fire("click");
    await settle();
    assert.equal(nodes.get("strip").children.length, 0);
    assert.equal(nodes.get("ebay-link").hidden, true);
    assert.equal(nodes.get("note").value, "");
    assert.equal(nodes.get("item-name").value, "");
    assert.equal(nodes.get("item-name").readOnly, false);
    assert.equal(local.getItem("snap.item"), null, "nothing left to read back");
});

test("offline: photos wait on the page, then go by themselves once the PC answers", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = fakePc();
    pc.down = true;
    const { nodes, win } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    const item = `Lamp ${TODAY}`;
    await typeName(nodes, "Lamp");
    snap(nodes, 2);
    await settle();
    assert.deepEqual(pc.calls, ["POST /items"]);
    assert.deepEqual(badges(nodes), ["waiting", "waiting"]);
    assert.equal(nodes.get("offline").hidden, false);
    assert.match(nodes.get("offline").textContent, /^Cannot reach the PC\. Photos wait on this page/);
    card(nodes, 0).ai.fire("click");
    assert.equal(nodes.get("ebay-btn").disabled, true);
    assert.equal(nodes.get("venue-hint").textContent, "Waiting for the photos to reach the PC (0 of 2 sent)");
    assert.equal(nodes.get("next-item").disabled, true);

    // it tries again after 1 s, then 3 s: still nothing
    t.mock.timers.tick(1000);
    await settle();
    assert.equal(pc.calls.length, 2);
    // a photo that never reached the PC is struck out: nothing to delete there
    card(nodes, 1).x.fire("click");
    snap(nodes, 1);
    await settle();
    assert.equal(pc.calls.length, 2, "stalled: no request until the pause is over");

    // the phone says it is back: the queue goes at once, in order
    pc.down = false;
    win.fire("online");
    await settle();
    assert.deepEqual(pc.calls.slice(2), [
        "POST /items",
        `PUT /items/${item}/photos/1`,
        `PUT /items/${item}/photos/3`,
    ]);
    assert.ok(!pc.calls.some((c) => c.startsWith("DELETE")), "photo 2 never left the page");
    assert.deepEqual(badges(nodes), ["sent", "sent"]);
    assert.equal(nodes.get("offline").hidden, true);
    assert.equal(nodes.get("ebay-btn").disabled, false);
});

function server(nodes) {
    const node = nodes.get("server");
    const kind = node.classList.contains("ok") ? "ok" : node.classList.contains("bad") ? "bad" : "";
    assert.equal(nodes.get("settings-server").textContent, node.textContent, "Settings says the same");
    return `${node.textContent} (${kind})`;
}

test("the page checks the server by itself: ok in green, off in red, again every 30 s", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = fakePc();
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    assert.equal(pc.checks, 1, "checked on load, with no button pressed");
    assert.equal(server(nodes), "server ok (ok)");

    pc.down = true;
    t.mock.timers.tick(29000);
    await settle();
    assert.equal(pc.checks, 1, "not before 30 s");
    t.mock.timers.tick(1000);
    await settle();
    assert.equal(pc.checks, 2);
    assert.equal(server(nodes), "server off (bad)");

    pc.down = false;
    t.mock.timers.tick(30000);
    await settle();
    assert.equal(pc.checks, 3);
    assert.equal(server(nodes), "server ok (ok)");
});

test("the server check: nothing to ask without settings; a wrong key says so", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { nodes } = await loadPage();
    assert.equal(server(nodes), "server not set ()");

    const { nodes: keyed } = await loadPage({
        local: memoryStore(GOOD),
        fetchImpl: async () => new Response(JSON.stringify({ detail: "wrong" }), { status: 401 }),
    });
    assert.equal(server(keyed), "wrong key (bad)");
});

test("the PC coming back is noticed by the check: waiting photos go without waiting out the pause", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = fakePc();
    pc.down = true;
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    await typeName(nodes, "Vase");
    snap(nodes, 1);
    await settle();
    assert.equal(server(nodes), "server off (bad)");
    // the queue's retry pause grows past the check's 30 s after a few misses
    for (const ms of [1000, 3000, 10000]) {
        t.mock.timers.tick(ms);
        await settle();
    }
    const before = pc.calls.length;
    pc.down = false;
    t.mock.timers.tick(30000 - 14000);
    await settle();
    assert.equal(server(nodes), "server ok (ok)");
    assert.deepEqual(pc.calls.slice(before), ["POST /items", `PUT /items/Vase ${TODAY}/photos/1`]);
    assert.deepEqual(badges(nodes), ["sent"]);
});

test("Settings has a Close button", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { nodes } = await loadPage();
    nodes.get("settings-toggle").fire("click");
    assert.equal(nodes.get("settings").hidden, false);
    nodes.get("settings-close").fire("click");
    assert.equal(nodes.get("settings").hidden, true);
    assert.equal(nodes.get("settings-toggle").attrs["aria-expanded"], "false");
});

test("a photo the PC refuses shows failed; a tap sends it again", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] }); // the page's own server check runs on a timer
    const pc = fakePc();
    let refuse = true;
    const inner = pc.fetch;
    const fetchImpl = async (url, init = {}) => {
        if (refuse && init.method === "PUT" && url.includes("/photos/")) {
            pc.calls.push("refused");
            return new Response(JSON.stringify({ detail: "photo 1: not a JPEG" }), { status: 400 });
        }
        return inner(url, init);
    };
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl });
    await typeName(nodes, "Lamp");
    snap(nodes, 1);
    await settle();
    assert.deepEqual(badges(nodes), ["failed"]);
    const retry = card(nodes, 0).badge;
    assert.equal(retry.tag, "button");
    assert.match(retry.attrs["aria-label"], /not a JPEG/);
    assert.match(nodes.get("venue-hint").textContent, /Mark at least one photo AI/);
    card(nodes, 0).ai.fire("click");
    assert.match(nodes.get("venue-hint").textContent, /did not reach the PC - tap/);
    refuse = false;
    retry.fire("click");
    await settle();
    assert.deepEqual(badges(nodes), ["sent"]);
    assert.equal(nodes.get("ebay-btn").disabled, false);
});

test("a reload reads the item back from the PC: photos, marks, note, the job still running", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const item = `Boots ${TODAY}`;
    const local = memoryStore({
        ...GOOD,
        "snap.item": JSON.stringify({ itemName: "Boots", itemId: item, ai: [2] }),
    });
    const pc = fakePc({
        items: {
            [item]: {
                photos: new Map([
                    [1, "a"],
                    [2, "b"],
                ]),
                note: "Size 10",
                sku: null,
                jobs: [{ job: "j1", venue: "ebay", state: "running", step: "drafting the listing" }],
            },
        },
        jobs: { j1: () => ({ state: "done", sku: "B-7", links: { ebay: "https://www.ebay.com/itm/7" } }) },
    });
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch });
    assert.deepEqual(pc.calls, [`GET /items/${item}`]);
    assert.equal(nodes.get("item-name").value, "Boots");
    assert.equal(nodes.get("item-name").readOnly, true);
    assert.equal(nodes.get("strip").children.length, 2);
    assert.equal(card(nodes, 0).remote.textContent, "on the PC");
    assert.deepEqual(badges(nodes), ["sent", "sent"]);
    assert.equal(card(nodes, 1).ai.attrs["aria-pressed"], "true");
    assert.equal(nodes.get("note").value, "Size 10");
    assert.equal(nodes.get("note-status").textContent, "sent");
    assert.equal(nodes.get("ebay-status").textContent, "drafting the listing");
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("ebay-link").href, "https://www.ebay.com/itm/7");
});

test("after a reload a new photo numbers on after the PC's, never over them", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] }); // the page's own server check runs on a timer
    const item = `Boots ${TODAY}`;
    const local = memoryStore({
        ...GOOD,
        "snap.item": JSON.stringify({ itemName: "Boots", itemId: item, ai: [] }),
    });
    const photos = new Map([
        [1, "a"],
        [4, "b"],
    ]);
    const pc = fakePc({ items: { [item]: { photos, note: "", sku: null, jobs: [] } } });
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch });
    snap(nodes, 1);
    await settle();
    assert.equal(pc.calls.at(-1), `PUT /items/${item}/photos/5`);
    assert.deepEqual([...photos.keys()], [1, 4, 5]);
    assert.equal(card(nodes, 2).li.children.find((c) => c.tag === "img").src, "blob:stub");
});

test("a reload whose item is gone from the PC starts fresh", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] }); // the page's own server check runs on a timer
    const local = memoryStore({
        ...GOOD,
        "snap.item": JSON.stringify({ itemName: "Gone", itemId: `Gone ${TODAY}`, ai: [] }),
    });
    const { nodes } = await loadPage({ local, fetchImpl: fakePc().fetch });
    assert.equal(nodes.get("item-name").value, "");
    assert.equal(nodes.get("item-name").readOnly, false);
    assert.match(nodes.get("message").textContent, /no longer on the PC/);
    assert.equal(local.getItem("snap.item"), null);
});

test("a refusal from the PC shows its own words", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] }); // the page's own server check runs on a timer
    const pc = fakePc({ refuseJob: "mark at least one photo for the AI" });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    await typeName(nodes, "Lamp");
    snap(nodes, 1);
    await settle();
    card(nodes, 0).ai.fire("click");
    nodes.get("ebay-btn").fire("click");
    await settle();
    assert.equal(nodes.get("ebay-status").textContent, "mark at least one photo for the AI");
    assert.equal(nodes.get("ebay-btn").disabled, false);
    assert.equal(nodes.get("ebay-btn").classList.contains("busy"), false, "the ring stops with the error");
});

// --- the book mode -------------------------------------------------------------------

const ISBN = "9780306406157";

/** GET /books/9780306406157, as the PC answers it. */
const BOOK = {
    isbn: ISBN,
    title: "The Art of Computer Programming",
    subtitle: "",
    authors: ["Donald E. Knuth"],
    publisher: "Addison-Wesley",
    year: "1998",
    format: "Paperback",
    pages: 320,
    price: "11",
    listings: { count: 12, low: "6.00", high: "24.00" },
    route: "list",
};

/** A book with an ISBN sends the No ISBN fields empty. */
const NO_TYPING = { title: "", author: "", year: "", format: "" };

function fire(nodes, id, count = 1) {
    const files = Array.from({ length: count }, (_, i) => new Blob([`book ${i}`], { type: "image/jpeg" }));
    nodes.get(id).fire("change", { target: { files, value: "" } });
}

function typeIsbn(nodes, text) {
    nodes.get("book-isbn").value = text;
    nodes.get("book-isbn").fire("input");
}

function bookShot(nodes, i) {
    const li = nodes.get("book-strip").children[i];
    const child = (cls) => li.children.find((c) => c.className && c.className.split(" ")[0] === cls);
    return {
        li,
        x: child("kill"),
        ai: child("ai-mark"),
        main: child("main-mark"),
        badge: child("badge"),
        label: child("shot-name"),
    };
}

/** Which photos wear the main mark, by number: [false, true, false]. */
function mains(nodes) {
    return nodes.get("book-strip").children.map((_, i) => bookShot(nodes, i).main.attrs["aria-pressed"] === "true");
}

test("the book section is its own, beside the goods one, and reads top to bottom", () => {
    // Michal, 2026-09-26: a button at the top that says book, and a UI analogous to
    // the goods one, so the same page serves both
    const modes = html.indexOf('id="mode-goods"');
    assert.ok(modes > 0 && modes < html.indexOf('id="work"'), "the switch is above the goods section");
    assert.ok(html.indexOf('id="mode-book"') < html.indexOf('id="work"'));
    assert.match(html, /id="mode-goods"[^>]*aria-pressed="true"[^>]*>goods</);
    assert.match(html, /id="mode-book"[^>]*aria-pressed="false"[^>]*>book</);
    const book = /<section id="book"[^>]*>([\s\S]*?)<\/section>/.exec(html);
    assert.match(book[0], /^<section id="book" hidden>/, "goods is what the page opens on");
    const order = [...book[1].matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(order, [
        "book-hint",
        "book-scan-label",
        "book-scan-input",
        "book-isbn",
        "book-no-isbn",
        "book-manual",
        "book-title",
        "book-author",
        "book-year",
        "book-format",
        "book-format-paperback",
        "book-format-hardcover",
        "book-found",
        "book-lookup",
        "book-card-title",
        "book-authors",
        "book-details",
        "book-match",
        "book-snap-label",
        "book-snap-input",
        "book-gallery-label",
        "book-gallery-input",
        "book-progress",
        "book-strip",
        "book-condition",
        "book-condition-like_new",
        "book-condition-very_good",
        "book-condition-good",
        "book-condition-acceptable",
        "book-price",
        "book-price-note",
        "book-note-status",
        "book-flaws",
        "book-ebay-btn",
        "book-ebay-status",
        "book-ebay-link",
        "book-venue-hint",
        "book-done-hint",
        "book-next-item",
    ]);
    // the camera button is called what it reads (Michal, 2026-09-28: "Let's call scan
    // 'ISBN' since that is what it is"); under it, small, No ISBN opens the typed fields
    assert.match(book[1], /<label id="book-scan-label" class="big snap"[^>]*aria-label="ISBN: [^"]*">ISBN</);
    assert.match(
        book[1],
        /<button type="button" id="book-no-isbn" class="secondary no-isbn" aria-expanded="false"\s+aria-controls="book-manual">No ISBN</
    );
    assert.match(book[1], /<fieldset id="book-manual" class="manual" hidden>/);
    assert.match(book[1], /id="book-title" type="text"[^>]*required/);
    assert.match(book[1], /id="book-year" type="text" inputmode="numeric"/);
    assert.match(book[1], /id="book-format-paperback" class="chip" data-value="paperback"\s+aria-pressed="true">Paperback</);
    assert.match(book[1], /id="book-format-hardcover" class="chip" data-value="hardcover"\s+aria-pressed="false">Hardcover</);
    // the ISBN button opens the camera; the ISBN box gives the number keyboard; the price the decimal one
    assert.match(book[1], /id="book-scan-input"[^>]*capture="environment"/);
    assert.match(book[1], /id="book-isbn" type="text" inputmode="numeric"/);
    assert.match(book[1], /id="book-price" type="text" inputmode="decimal"/);
    assert.match(book[1], /id="book-flaws"[^>]*placeholder="Wear, marks, writing inside, anything a buyer should know\."/);
    for (const [value, label] of [
        ["like_new", "Like new"],
        ["very_good", "Very good"],
        ["good", "Good"],
        ["acceptable", "Acceptable"],
    ]) {
        assert.match(book[1], new RegExp(`id="book-condition-${value}" class="chip" data-value="${value}"[^>]*>${label}<`));
    }
    assert.match(html, /id="book-ebay-btn"[^>]*>ebay</);
    assert.match(html, /id="book-ebay-link"[^>]*target="_blank" rel="noopener noreferrer"/);
    assert.match(html, /<button type="button" id="book-next-item" class="big done"[^>]*>DONE</);
});

test("a fresh load is the goods screen, exactly as before", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const local = memoryStore(GOOD);
    const { nodes } = await loadPage({ local, fetchImpl: fakePc().fetch });
    assert.equal(nodes.get("work").hidden, false);
    assert.equal(nodes.get("book").hidden, true);
    assert.equal(nodes.get("mode-goods").attrs["aria-pressed"], "true");
    assert.equal(nodes.get("mode-book").attrs["aria-pressed"], "false");
    assert.equal(nodes.get("hint").textContent, "Type the item name to start snapping.");
    assert.equal(nodes.get("venue-hint").textContent, "Snap a photo first");
    assert.equal(local.getItem("snap.mode"), null, "nothing written until he chooses");
});

test("book mode end to end: scan, the book and its price, a cover, condition, flaws, ebay, link, DONE", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let ebayState = "running";
    const local = memoryStore(GOOD);
    const pc = fakePc({
        books: { [ISBN]: BOOK },
        jobs: {
            j1: () => ({
                state: ebayState,
                step: ebayState === "running" ? "listing the book" : "posted",
                sku: "BK-0007",
                links: ebayState === "done" ? { ebay: "https://www.ebay.com/itm/777" } : {},
                error: "",
                ahead: 0,
            }),
        },
    });
    // the back cover carries a shop's own EAN too: only the bookland one counts
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch, barcodes: ["4006381333931", ISBN] });
    const item = `Book ${ISBN} ${TODAY}`;

    nodes.get("mode-book").fire("click");
    assert.equal(nodes.get("book").hidden, false);
    assert.equal(nodes.get("work").hidden, true);
    assert.equal(nodes.get("mode-book").attrs["aria-pressed"], "true");
    assert.equal(nodes.get("mode-goods").attrs["aria-pressed"], "false");
    assert.equal(local.getItem("snap.mode"), "book", "remembered on this phone");
    assert.equal(
        nodes.get("book-hint").textContent,
        "Tap ISBN to read the barcode on the back cover, or type the ISBN. A close-up of the barcode is enough; it is not a listing photo."
    );
    assert.equal(nodes.get("book-found").hidden, true);
    assert.equal(nodes.get("book-ebay-btn").disabled, true);
    assert.equal(nodes.get("book-venue-hint").textContent, "Scan the ISBN, or tap No ISBN and type the title");
    assert.equal(nodes.get("book-next-item").disabled, true);
    assert.equal(nodes.get("book-condition-good").attrs["aria-pressed"], "true", "good by default");

    // Scan: the barcode names the book and the PC looks it up. The picture is a
    // close-up of the bars, read and dropped: not in the strip, never sent
    fire(nodes, "book-scan-input");
    await settle();
    assert.equal(nodes.get("book-isbn").value, ISBN);
    assert.deepEqual(pc.calls, [`GET /books/${ISBN}`], "the book asked about; no folder, no PUT");
    assert.equal(nodes.get("book-strip").children.length, 0, "the scan is not a listing photo");
    assert.equal(nodes.get("book-progress").textContent, "No photos yet.");
    assert.equal(nodes.get("book-venue-hint").textContent, "Snap the cover first");
    assert.equal(nodes.get("book-next-item").disabled, false, "a book with an ISBN can be cleared");
    assert.equal(nodes.get("book-found").hidden, false);
    assert.equal(nodes.get("book-lookup").textContent, "");
    assert.equal(nodes.get("book-card-title").textContent, "The Art of Computer Programming");
    assert.equal(nodes.get("book-authors").textContent, "Donald E. Knuth");
    assert.equal(nodes.get("book-details").textContent, "Addison-Wesley · 1998 · Paperback · 320 pages");
    assert.equal(nodes.get("book-price").value, "11", "the PC's suggestion");
    assert.equal(nodes.get("book-price-note").textContent, "eBay: 12 listings, $6–$24 · suggested $11");
    assert.equal(nodes.get("book-price-note").hidden, false);
    assert.equal(local.getItem("snap.book"), null, "nothing on the PC yet, nothing to read back");

    // the front cover is the first photo, and it makes the book's folder
    fire(nodes, "book-snap-input");
    await settle();
    assert.deepEqual(pc.calls.slice(1), ["POST /items", `PUT /items/${item}/photos/1`]);
    assert.equal(pc.items.get(item).photos.get(1), "jpeg 2000x1500", "shrunk like any photo");
    assert.equal(nodes.get("book-hint").hidden, true, "the book is named: nothing more to say");
    assert.equal(nodes.get("book-scan-input").disabled, true, "its ISBN is fixed until DONE");
    assert.equal(nodes.get("book-isbn").readOnly, true);
    // the photo: the x and the badge, no AI mark
    assert.equal(nodes.get("book-strip").children.length, 1);
    assert.equal(bookShot(nodes, 0).badge.textContent, "sent");
    assert.ok(bookShot(nodes, 0).x, "the x is there");
    assert.equal(bookShot(nodes, 0).ai, undefined, "no model call for a book");
    assert.deepEqual(mains(nodes), [true], "in its place, main: the first photo leads");
    assert.equal(bookShot(nodes, 0).label.textContent, `Book ${ISBN}-1.jpg`);
    assert.equal(nodes.get("book-progress").textContent, "1 photo, all on the PC");
    assert.equal(nodes.get("strip").children.length, 0, "the goods strip is not touched");
    const saved = JSON.parse(local.getItem("snap.book"));
    assert.equal(saved.isbn, ISBN);
    assert.equal(saved.itemId, item);
    assert.equal(local.getItem("snap.item"), null, "the goods item is its own");

    // the spine, say
    fire(nodes, "book-snap-input");
    await settle();
    assert.equal(pc.calls.at(-1), `PUT /items/${item}/photos/2`);
    assert.equal(nodes.get("book-progress").textContent, "2 photos, all on the PC");

    // the condition
    nodes.get("book-condition-very_good").fire("click");
    assert.equal(nodes.get("book-condition-very_good").attrs["aria-pressed"], "true");
    assert.equal(nodes.get("book-condition-good").attrs["aria-pressed"], "false");
    assert.equal(JSON.parse(local.getItem("snap.book")).condition, "very_good", "kept for a reload");

    // the flaws are the item's note, sent as he stops typing
    nodes.get("book-flaws").value = "Name written inside the cover";
    nodes.get("book-flaws").fire("input");
    t.mock.timers.tick(1500);
    await settle();
    assert.equal(pc.calls.at(-1), `PUT /items/${item}/note`);
    assert.equal(pc.items.get(item).note, "Name written inside the cover");
    assert.equal(nodes.get("book-note-status").textContent, "sent");

    assert.equal(nodes.get("book-ebay-btn").disabled, false);
    assert.equal(nodes.get("book-venue-hint").hidden, true);
    nodes.get("book-ebay-btn").fire("click");
    await settle();
    assert.deepEqual(pc.posted, [
        { item, venue: "ebay", book: { ...NO_TYPING, isbn: ISBN, condition: "very_good", price: "11", main: 1 } },
    ]);
    assert.equal(nodes.get("book-ebay-status").textContent, "queued, 1 ahead");
    assert.equal(nodes.get("book-ebay-btn").classList.contains("busy"), true, "the ring turns");
    assert.equal(nodes.get("book-ebay-btn").attrs["aria-busy"], "true");
    assert.equal(nodes.get("book-next-item").disabled, true);
    assert.match(nodes.get("book-done-hint").textContent, /DONE waits/);
    assert.equal(nodes.get("book-condition-good").disabled, true, "what is being listed stays put");
    assert.equal(nodes.get("book-price").readOnly, true);
    assert.equal(bookShot(nodes, 0).x, undefined, "no x on a posted photo");

    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("book-ebay-status").textContent, "listing the book");
    ebayState = "done";
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("book-ebay-link").hidden, false);
    assert.equal(nodes.get("book-ebay-link").href, "https://www.ebay.com/itm/777");
    assert.equal(nodes.get("book-ebay-btn").classList.contains("busy"), false, "the ring stops with the link");
    assert.equal(nodes.get("book-ebay-btn").disabled, true, "posted once is enough");
    assert.equal(nodes.get("book-next-item").disabled, false);

    nodes.get("book-next-item").fire("click");
    await settle();
    assert.equal(nodes.get("book-strip").children.length, 0);
    assert.equal(nodes.get("book-isbn").value, "");
    assert.equal(nodes.get("book-isbn").readOnly, false);
    assert.equal(nodes.get("book-price").value, "");
    assert.equal(nodes.get("book-flaws").value, "");
    assert.equal(nodes.get("book-found").hidden, true);
    assert.equal(nodes.get("book-ebay-link").hidden, true);
    assert.equal(nodes.get("book-condition-good").attrs["aria-pressed"], "true");
    assert.equal(nodes.get("book").hidden, false, "the next item is a book too");
    assert.equal(local.getItem("snap.book"), null, "nothing left to read back");
});

test("the main mark: the first photo by default, a tap moves it, a delete moves it back, the job carries it", async (t) => {
    // Michal, 2026-09-27: "I need to have a way to choose main (can be like the AI
    // button on photos for goods)"
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const local = memoryStore(GOOD);
    const pc = fakePc({
        books: { [ISBN]: BOOK },
        jobs: { j1: () => ({ state: "running", step: "listing the book", sku: "BK-1" }) },
    });
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch, barcodes: [ISBN] });
    const item = `Book ${ISBN} ${TODAY}`;
    nodes.get("mode-book").fire("click");
    fire(nodes, "book-scan-input");
    await settle();
    fire(nodes, "book-snap-input", 3);
    await settle();
    assert.equal(nodes.get("book-strip").children.length, 3, "three photos; the scan is not one");

    // where goods have the AI mark: bottom right, labelled main, the first one on
    const first = bookShot(nodes, 0).main;
    assert.equal(first.tag, "button");
    assert.equal(first.textContent, "main");
    assert.equal(first.id, "book-main-1");
    assert.equal(first.attrs["data-value"], "1");
    assert.equal(first.attrs["aria-label"], `Lead the listing with Book ${ISBN}-1.jpg`);
    assert.equal(first.className, "main-mark on");
    assert.equal(bookShot(nodes, 0).li.className, "shot shot-main");
    assert.equal(bookShot(nodes, 1).main.className, "main-mark");
    assert.equal(bookShot(nodes, 1).li.className, "shot");
    assert.deepEqual(mains(nodes), [true, false, false], "doing nothing keeps the first");

    // a tap moves it; tapping it again leaves it on
    bookShot(nodes, 2).main.fire("click");
    assert.deepEqual(mains(nodes), [false, false, true]);
    bookShot(nodes, 2).main.fire("click");
    assert.deepEqual(mains(nodes), [false, false, true], "exactly one, never none");
    assert.equal(JSON.parse(local.getItem("snap.book")).main, 3, "kept for a reload");

    // the main photo deleted: back to the first left
    bookShot(nodes, 2).x.fire("click");
    await settle();
    assert.deepEqual(mains(nodes), [true, false]);
    bookShot(nodes, 1).main.fire("click");
    assert.deepEqual(mains(nodes), [false, true]);

    nodes.get("book-ebay-btn").fire("click");
    await settle();
    assert.deepEqual(pc.posted, [
        { item, venue: "ebay", book: { ...NO_TYPING, isbn: ISBN, condition: "good", price: "11", main: 2 } },
    ]);
    // on its way: the mark shows, and stays where it is
    assert.equal(bookShot(nodes, 1).main.disabled, true);
    assert.equal(bookShot(nodes, 0).main.disabled, true);
    bookShot(nodes, 0).main.fire("click");
    assert.deepEqual(mains(nodes), [false, true]);
});

test("a typed ISBN: a wrong check digit is not looked up; an ISBN-10 is, as its ISBN-13", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = fakePc({ books: { [ISBN]: BOOK } });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    nodes.get("mode-book").fire("click");
    assert.equal(nodes.get("book-hint").textContent, "This phone cannot read barcodes; type the ISBN");
    assert.equal(nodes.get("book-scan-input").disabled, true, "the picture would be good for nothing");

    typeIsbn(nodes, "978-0-306-40615-8");
    t.mock.timers.tick(400);
    await settle();
    assert.deepEqual(pc.calls, [], "not an ISBN: nothing asked");
    assert.equal(nodes.get("book-found").hidden, true);
    assert.equal(nodes.get("book-venue-hint").textContent, "Scan the ISBN, or tap No ISBN and type the title");

    typeIsbn(nodes, "0-306-40615-2");
    t.mock.timers.tick(399);
    await settle();
    assert.deepEqual(pc.calls, [], "not while typing");
    t.mock.timers.tick(1);
    await settle();
    assert.deepEqual(pc.calls, [`GET /books/${ISBN}`]);
    assert.equal(nodes.get("book-card-title").textContent, "The Art of Computer Programming");
    assert.equal(nodes.get("book-venue-hint").textContent, "Snap the cover first");
});

test("a book not in the catalogues says to post it as goods; a PC that could not look says why", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const books = {};
    const pc = fakePc({ books });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    nodes.get("mode-book").fire("click");

    typeIsbn(nodes, "9780804429573");
    t.mock.timers.tick(400);
    await settle();
    assert.equal(nodes.get("book-found").hidden, false);
    assert.equal(nodes.get("book-lookup").textContent, "Not in the catalogues. Post it as goods instead.");
    assert.equal(nodes.get("book-card-title").hidden, true);
    assert.equal(nodes.get("book-venue-hint").textContent, "Not in the catalogues - post it as goods instead");

    books[ISBN] = { status: 502, body: { detail: "the catalogues could not be reached" } };
    typeIsbn(nodes, ISBN);
    t.mock.timers.tick(400);
    await settle();
    assert.equal(nodes.get("book-lookup").textContent, "the catalogues could not be reached");
    assert.equal(nodes.get("book-isbn").value, ISBN, "the ISBN is kept");
    assert.match(nodes.get("book-venue-hint").textContent, /edit the ISBN to try again/);

    // editing the box is the retry
    books[ISBN] = BOOK;
    typeIsbn(nodes, `${ISBN} `);
    t.mock.timers.tick(400);
    await settle();
    assert.deepEqual(pc.calls, ["GET /books/9780804429573", `GET /books/${ISBN}`, `GET /books/${ISBN}`]);
    assert.equal(nodes.get("book-card-title").textContent, "The Art of Computer Programming");
});

test("a scan with no readable barcode says so and changes nothing else", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = fakePc({ books: { [ISBN]: BOOK } });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch, barcodes: [] });
    nodes.get("mode-book").fire("click");
    fire(nodes, "book-scan-input");
    await settle();
    assert.equal(
        nodes.get("book-hint").textContent,
        "No barcode found — try again closer, or type the ISBN under the barcode"
    );
    assert.equal(nodes.get("book-hint").hidden, false);
    assert.equal(nodes.get("book-strip").children.length, 0, "the scan is not a listing photo");
    assert.equal(nodes.get("book-progress").textContent, "No photos yet.");
    assert.deepEqual(pc.calls, []);
    assert.equal(nodes.get("book-scan-input").disabled, false, "Scan is there for another try");
    assert.equal(nodes.get("book-venue-hint").textContent, "Scan the ISBN, or tap No ISBN and type the title");
    assert.equal(nodes.get("book-next-item").disabled, true, "nothing to clear");
});

test("a cover snapped before the ISBN waits on the page for it, and says so", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = fakePc({ books: { [ISBN]: BOOK } });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch, barcodes: [ISBN] });
    nodes.get("mode-book").fire("click");
    fire(nodes, "book-snap-input");
    await settle();
    assert.equal(nodes.get("book-strip").children.length, 1);
    assert.equal(bookShot(nodes, 0).badge.textContent, "waiting");
    assert.deepEqual(pc.calls, [], "no ISBN, no folder yet");
    // what blocks it is the ISBN, not the PC, and every line says so
    const blocked =
        "Scan the ISBN, or tap No ISBN and type the title, so the photos can go to the PC; or remove them with their x";
    assert.equal(nodes.get("book-progress").textContent, "1 photo, waiting for the ISBN or the title");
    assert.equal(nodes.get("book-done-hint").textContent, blocked);
    assert.equal(nodes.get("book-done-hint").hidden, false);
    assert.equal(nodes.get("book-next-item").disabled, true);
    assert.equal(nodes.get("book-venue-hint").textContent, blocked);

    // the scan names them; its own picture does not join them
    fire(nodes, "book-scan-input");
    await settle();
    const item = `Book ${ISBN} ${TODAY}`;
    assert.deepEqual(pc.calls, [`GET /books/${ISBN}`, "POST /items", `PUT /items/${item}/photos/1`]);
    assert.equal(nodes.get("book-strip").children.length, 1);
    assert.equal(bookShot(nodes, 0).badge.textContent, "sent");
    assert.equal(bookShot(nodes, 0).label.textContent, `Book ${ISBN}-1.jpg`, "named by the ISBN now");
    assert.equal(nodes.get("book-hint").hidden, true);
});

test("switching mid-item asks nothing and loses nothing: the goods job carries on behind the book", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let ebayState = "running";
    const local = memoryStore(GOOD);
    const pc = fakePc({
        books: { [ISBN]: BOOK },
        jobs: {
            j1: () => ({
                state: ebayState,
                step: "drafting the listing",
                sku: "B-0042",
                links: ebayState === "done" ? { ebay: "https://www.ebay.com/itm/123" } : {},
            }),
        },
    });
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch, barcodes: [ISBN] });
    await typeName(nodes, "Boots");
    snap(nodes, 2);
    await settle();
    card(nodes, 0).ai.fire("click");
    nodes.get("ebay-btn").fire("click");
    await settle();
    assert.equal(nodes.get("ebay-status").textContent, "queued, 1 ahead");

    nodes.get("mode-book").fire("click");
    assert.equal(nodes.get("mode-book").disabled, false, "never locked");
    assert.equal(nodes.get("work").hidden, true);
    // a book, meanwhile: scanned, and its cover
    fire(nodes, "book-scan-input");
    await settle();
    fire(nodes, "book-snap-input");
    await settle();
    assert.equal(nodes.get("book-card-title").textContent, "The Art of Computer Programming");
    // the goods job is still asked about, and finishes, while the book is on screen
    ebayState = "done";
    t.mock.timers.tick(3000);
    await settle();
    assert.ok(pc.calls.includes("GET /jobs/j1"));

    nodes.get("mode-goods").fire("click");
    assert.equal(nodes.get("work").hidden, false);
    assert.equal(nodes.get("book").hidden, true);
    assert.equal(nodes.get("item-name").value, "Boots");
    assert.equal(nodes.get("strip").children.length, 2);
    assert.equal(nodes.get("ebay-link").href, "https://www.ebay.com/itm/123");
    assert.equal(nodes.get("next-item").disabled, false);
    // and back: the book is as it was
    nodes.get("mode-book").fire("click");
    assert.equal(nodes.get("book-strip").children.length, 1);
    assert.equal(nodes.get("book-isbn").value, ISBN);
    assert.equal(local.getItem("snap.mode"), "book");
    assert.deepEqual(JSON.parse(local.getItem("snap.item")).itemId, `Boots ${TODAY}`);
    assert.equal(JSON.parse(local.getItem("snap.book")).itemId, `Book ${ISBN} ${TODAY}`);
});

test("the mode is remembered per phone, and a reload reads the book back", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const item = `Book ${ISBN} ${TODAY}`;
    const local = memoryStore({
        ...GOOD,
        "snap.mode": "book",
        "snap.book": JSON.stringify({
            mode: "book",
            itemName: `Book ${ISBN}`,
            itemId: item,
            isbn: ISBN,
            condition: "acceptable",
            price: "9",
            main: 2,
            lookup: { record: BOOK, price: "11", listings: BOOK.listings, route: "list" },
        }),
    });
    const photos = new Map([
        [1, "a"],
        [2, "b"],
    ]);
    const pc = fakePc({
        books: { [ISBN]: BOOK },
        items: { [item]: { photos, note: "Spine creased", sku: null, jobs: [] } },
    });
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch });
    assert.equal(nodes.get("book").hidden, false, "book, as he left it");
    assert.equal(nodes.get("work").hidden, true);
    assert.deepEqual(pc.calls, [`GET /items/${item}`], "the found book was kept: no second lookup");
    assert.equal(nodes.get("book-isbn").value, ISBN);
    assert.equal(nodes.get("book-isbn").readOnly, true);
    assert.equal(nodes.get("book-card-title").textContent, "The Art of Computer Programming");
    assert.equal(nodes.get("book-price").value, "9", "his price, not the suggestion");
    assert.equal(nodes.get("book-condition-acceptable").attrs["aria-pressed"], "true");
    assert.equal(nodes.get("book-flaws").value, "Spine creased");
    assert.equal(bookShot(nodes, 0).li.children[0].textContent, "on the PC");
    assert.deepEqual(mains(nodes), [false, true], "his main photo, read back");
    assert.equal(nodes.get("book-ebay-btn").disabled, false);

    nodes.get("mode-goods").fire("click");
    assert.equal(local.getItem("snap.mode"), "goods");
});

// --- books with no ISBN --------------------------------------------------------------
// Michal, 2026-09-28: "Some books don't have ISBN. Make a least friction pathway. It
// should be hidden under one button overall -- a small button under scan ... The extra
// button will open necessary fields. I want the API to work it through still, suggest
// price, fill in other info etc. Automate."

/** GET /books/search?title=Dune..., as the PC answers it for a title a catalogue knows. */
const DUNE = {
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
};

function typeInto(nodes, id, text) {
    nodes.get(id).value = text;
    nodes.get(id).fire("input");
}

test("no ISBN end to end: No ISBN, the title typed, the book and its price found, a cover, ebay, DONE", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let ebayState = "running";
    const local = memoryStore(GOOD);
    const pc = fakePc({
        searches: { Dune: DUNE },
        jobs: {
            j1: () => ({
                state: ebayState,
                step: "listing the book",
                sku: "BK-0009",
                links: ebayState === "done" ? { ebay: "https://www.ebay.com/itm/999" } : {},
            }),
        },
    });
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch, barcodes: [ISBN] });
    const item = `Book Dune ${TODAY}`;

    nodes.get("mode-book").fire("click");
    assert.equal(nodes.get("book-manual").hidden, true, "hidden under the one button");
    assert.equal(nodes.get("book-no-isbn").disabled, false);
    assert.equal(nodes.get("book-no-isbn").attrs["aria-expanded"], "false");
    assert.equal(nodes.get("book-venue-hint").textContent, "Scan the ISBN, or tap No ISBN and type the title");

    nodes.get("book-no-isbn").fire("click");
    assert.equal(nodes.get("book-manual").hidden, false);
    assert.equal(nodes.get("book-no-isbn").attrs["aria-expanded"], "true");
    assert.equal(
        nodes.get("book-hint").textContent,
        "No ISBN: type the title as the cover has it. The PC finds the book and a price."
    );
    assert.equal(nodes.get("book-format-paperback").attrs["aria-pressed"], "true", "paperback by default");
    assert.equal(nodes.get("book-format-hardcover").attrs["aria-pressed"], "false");
    assert.equal(nodes.get("book-venue-hint").textContent, "Type the book's title first");
    assert.equal(nodes.get("book-found").hidden, true);

    // the search waits for him to stop typing in any of the fields
    typeInto(nodes, "book-title", "Dune");
    t.mock.timers.tick(300);
    typeInto(nodes, "book-author", "Frank Herbert");
    t.mock.timers.tick(599);
    await settle();
    assert.deepEqual(pc.calls, [], "not while typing");
    assert.equal(nodes.get("book-lookup").textContent, "Looking up “Dune”…");
    t.mock.timers.tick(1);
    await settle();
    assert.deepEqual(pc.calls, ["GET /books/search?title=Dune&author=Frank%20Herbert&year="]);

    // the card as for an ISBN, the match said under it; the price and the format filled in
    assert.equal(nodes.get("book-found").hidden, false);
    assert.equal(nodes.get("book-lookup").textContent, "");
    assert.equal(nodes.get("book-card-title").textContent, "Dune");
    assert.equal(nodes.get("book-authors").textContent, "Frank Herbert");
    assert.equal(nodes.get("book-details").textContent, "Chilton Books · 1965 · Hardcover · 412 pages");
    assert.equal(nodes.get("book-match").textContent, "matched in the catalogues");
    assert.equal(nodes.get("book-match").hidden, false);
    assert.equal(nodes.get("book-price").value, "40", "the PC's suggestion");
    assert.equal(nodes.get("book-price-note").textContent, "eBay: 7 listings, $25–$90 · suggested $40");
    assert.equal(nodes.get("book-format-hardcover").attrs["aria-pressed"], "true", "the catalogue says hardcover");
    assert.equal(nodes.get("book-format-paperback").attrs["aria-pressed"], "false");
    assert.equal(nodes.get("book-venue-hint").textContent, "Snap the cover first");
    assert.equal(nodes.get("book-next-item").disabled, false, "a typed book can be cleared");
    assert.equal(nodes.get("book-isbn").value, "");

    // the cover: the title names the folder on the PC
    fire(nodes, "book-snap-input");
    await settle();
    assert.deepEqual(pc.calls.slice(1), ["POST /items", `PUT /items/${item}/photos/1`]);
    assert.equal(bookShot(nodes, 0).label.textContent, "Book Dune-1.jpg");
    assert.equal(bookShot(nodes, 0).badge.textContent, "sent");
    assert.deepEqual(mains(nodes), [true]);
    assert.equal(nodes.get("book-no-isbn").disabled, true, "the title names the folder now: fixed until DONE");
    assert.equal(nodes.get("book-hint").hidden, true);
    const saved = JSON.parse(local.getItem("snap.book"));
    assert.deepEqual(
        [saved.itemId, saved.manual, saved.isbn, saved.title, saved.author, saved.format],
        [item, true, "", "Dune", "Frank Herbert", "hardcover"]
    );

    nodes.get("book-condition-very_good").fire("click");
    assert.equal(nodes.get("book-ebay-btn").disabled, false);
    nodes.get("book-ebay-btn").fire("click");
    await settle();
    assert.deepEqual(pc.posted, [
        {
            item,
            venue: "ebay",
            book: {
                isbn: "",
                title: "Dune",
                author: "Frank Herbert",
                year: "",
                format: "hardcover",
                condition: "very_good",
                price: "40",
                main: 1,
            },
        },
    ]);
    assert.equal(nodes.get("book-ebay-status").textContent, "queued, 1 ahead");
    assert.equal(nodes.get("book-title").readOnly, true, "what is being listed stays put");
    assert.equal(nodes.get("book-format-paperback").disabled, true);

    ebayState = "done";
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("book-ebay-link").href, "https://www.ebay.com/itm/999");

    nodes.get("book-next-item").fire("click");
    await settle();
    assert.equal(nodes.get("book-manual").hidden, true, "the next book starts with the ISBN");
    assert.equal(nodes.get("book-no-isbn").attrs["aria-expanded"], "false");
    assert.equal(nodes.get("book-no-isbn").disabled, false);
    assert.equal(nodes.get("book-title").value, "");
    assert.equal(nodes.get("book-author").value, "");
    assert.equal(nodes.get("book-title").readOnly, false);
    assert.equal(nodes.get("book-found").hidden, true);
    assert.equal(nodes.get("book-price").value, "");
    assert.equal(nodes.get("book-format-paperback").attrs["aria-pressed"], "true");
    assert.equal(local.getItem("snap.book"), null);
});

test("no ISBN: a title no catalogue knows is listed as typed; No ISBN again clears; a valid ISBN closes it", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = fakePc({ books: { [ISBN]: BOOK } });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    nodes.get("mode-book").fire("click");
    nodes.get("book-no-isbn").fire("click");
    typeInto(nodes, "book-title", "Family recipes");
    typeInto(nodes, "book-year", "1972");
    nodes.get("book-format-hardcover").fire("click");
    assert.equal(nodes.get("book-format-hardcover").attrs["aria-pressed"], "true");
    t.mock.timers.tick(600);
    await settle();
    assert.deepEqual(pc.calls, ["GET /books/search?title=Family%20recipes&author=&year=1972"]);
    // what he typed is the book: not "post it as goods"
    assert.equal(nodes.get("book-lookup").textContent, "");
    assert.equal(nodes.get("book-card-title").textContent, "Family recipes");
    assert.equal(nodes.get("book-authors").hidden, true);
    assert.equal(nodes.get("book-details").textContent, "1972 · Hardcover");
    assert.equal(nodes.get("book-match").textContent, "Not in the catalogues: it will be listed as typed");
    assert.equal(nodes.get("book-price").value, "6", "eBay's price for the title, still");
    assert.equal(nodes.get("book-venue-hint").textContent, "Snap the cover first");

    // No ISBN again: the fields close and what was typed goes, with the suggestion
    nodes.get("book-no-isbn").fire("click");
    assert.equal(nodes.get("book-manual").hidden, true);
    assert.equal(nodes.get("book-title").value, "");
    assert.equal(nodes.get("book-year").value, "");
    assert.equal(nodes.get("book-found").hidden, true);
    assert.equal(nodes.get("book-price").value, "");
    assert.equal(nodes.get("book-format-paperback").attrs["aria-pressed"], "true");
    assert.equal(nodes.get("book-venue-hint").textContent, "Scan the ISBN, or tap No ISBN and type the title");

    // open, and the ISBN box ignored while it holds no ISBN
    nodes.get("book-no-isbn").fire("click");
    typeIsbn(nodes, "978-0-306");
    t.mock.timers.tick(400);
    await settle();
    assert.equal(nodes.get("book-manual").hidden, false, "not an ISBN: ignored");
    assert.deepEqual(pc.calls.length, 1);
    // a title half typed -- and then the ISBN turns up after all: it is the book
    typeInto(nodes, "book-title", "The Art of");
    typeIsbn(nodes, ISBN);
    t.mock.timers.tick(400);
    await settle();
    assert.equal(nodes.get("book-manual").hidden, true);
    assert.equal(nodes.get("book-no-isbn").attrs["aria-expanded"], "false");
    assert.equal(nodes.get("book-title").value, "");
    t.mock.timers.tick(600);
    await settle();
    assert.deepEqual(pc.calls.slice(1), [`GET /books/${ISBN}`], "the half-typed title is never searched");
    assert.equal(nodes.get("book-card-title").textContent, "The Art of Computer Programming");
    assert.equal(nodes.get("book-match").hidden, true, "an ISBN's book needs no match line");
});

test("no ISBN: a cover snapped first waits for the title; a PC that could not look says why; an edit asks again", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const searches = { Dune: { status: 502, body: { detail: "the catalogues could not be reached" } } };
    const pc = fakePc({ searches });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    const item = `Book Dune ${TODAY}`;
    nodes.get("mode-book").fire("click");
    fire(nodes, "book-snap-input");
    await settle();
    assert.equal(nodes.get("book-progress").textContent, "1 photo, waiting for the ISBN or the title");
    nodes.get("book-no-isbn").fire("click");
    assert.equal(nodes.get("book-progress").textContent, "1 photo, waiting for the title");
    const waiting = "Type the title so the photos can go to the PC, or remove them with their x";
    assert.equal(nodes.get("book-done-hint").textContent, waiting);
    assert.equal(nodes.get("book-venue-hint").textContent, waiting);
    assert.deepEqual(pc.calls, []);

    typeInto(nodes, "book-title", "Dune");
    t.mock.timers.tick(600);
    await settle();
    assert.deepEqual(pc.calls, [
        "GET /books/search?title=Dune&author=&year=",
        "POST /items",
        `PUT /items/${item}/photos/1`,
    ]);
    assert.equal(bookShot(nodes, 0).label.textContent, "Book Dune-1.jpg", "named by the title now");
    assert.equal(nodes.get("book-lookup").textContent, "the catalogues could not be reached");
    assert.equal(nodes.get("book-title").value, "Dune", "the fields are kept");
    assert.equal(nodes.get("book-venue-hint").textContent, "The book was not looked up - edit the title to try again");

    // editing the title is the retry
    searches.Dune = DUNE;
    typeInto(nodes, "book-title", "Dune ");
    t.mock.timers.tick(600);
    await settle();
    assert.equal(pc.calls.at(-1), "GET /books/search?title=Dune&author=&year=");
    assert.equal(nodes.get("book-card-title").textContent, "Dune");
    assert.equal(nodes.get("book-match").textContent, "matched in the catalogues");
    assert.equal(nodes.get("book-ebay-btn").disabled, false);
});

test("a reload reads a book with no ISBN back: the fields, the match, the price", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const item = `Book Dune ${TODAY}`;
    const local = memoryStore({
        ...GOOD,
        "snap.mode": "book",
        "snap.book": JSON.stringify({
            mode: "book",
            itemName: "Book Dune",
            itemId: item,
            isbn: "",
            manual: true,
            title: "Dune",
            author: "Frank Herbert",
            year: "",
            format: "hardcover",
            condition: "good",
            price: "40",
            main: 1,
            lookup: { by: "title", matched: true, record: DUNE, price: "40", listings: DUNE.listings, route: "list" },
        }),
    });
    const pc = fakePc({ items: { [item]: { photos: new Map([[1, "a"]]), note: "", sku: null, jobs: [] } } });
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch });
    assert.deepEqual(pc.calls, [`GET /items/${item}`], "the match was kept: no second search");
    assert.equal(nodes.get("book-manual").hidden, false);
    assert.equal(nodes.get("book-no-isbn").disabled, true);
    assert.equal(nodes.get("book-title").value, "Dune");
    assert.equal(nodes.get("book-author").value, "Frank Herbert");
    assert.equal(nodes.get("book-format-hardcover").attrs["aria-pressed"], "true");
    assert.equal(nodes.get("book-card-title").textContent, "Dune");
    assert.equal(nodes.get("book-match").textContent, "matched in the catalogues");
    assert.equal(nodes.get("book-price").value, "40");
    assert.equal(nodes.get("book-ebay-btn").disabled, false);
});
