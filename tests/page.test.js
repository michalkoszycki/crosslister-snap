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
import { itemIdFor, NAME_CHECK_MS, SEND_DELAY_MS } from "../core.js";

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
        // Michal, 2026-09-30: the photos first, Snap under them where the camera's shutter was
        "progress",
        "strip",
        "snap-label",
        "snap-input",
        "gallery-label",
        "gallery-input",
        "note-status",
        "note",
        // Michal, 2026-09-28: "Before the eBay and Craigslist buttons ... a little arrow with the word customize"
        "customize-toggle",
        "customize",
        "quantity",
        "pickup-only",
        // Michal, 2026-09-30: the price above the buttons, not on them; 2026-10-02: the title above it
        "title-line",
        "price-line",
        "ebay-btn",
        "ebay-status",
        // Michal, 2026-10-02: a red cancel under the pressed button
        "ebay-cancel",
        "ebay-link",
        "craigslist-btn",
        "craigslist-status",
        "craigslist-cancel",
        "craigslist-link",
        "venue-hint",
        "done-hint",
        "next-item",
        // under NEXT: a listing left posting on the PC is said once, quietly
        "next-note",
    ]);
    // Snap hands over to the phone's own camera app, full screen
    assert.match(html, /capture="environment"/);
    // NEXT (Michal, 2026-09-28: "I want the final done button to be NEXT"): the same big button as Snap, only green
    const done = /<button type="button" id="next-item"[^>]*>([^<]*)</.exec(html);
    assert.match(done[0], /class="[^"]*\bbig\b[^"]*"/);
    assert.match(done[0], /aria-label="Next: start the next item"/);
    assert.equal(done[1].trim(), "NEXT");
    assert.ok(!/>\s*DONE\s*</.test(html), "no DONE left on the screen");
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

/**
 * The browser's history for one tab: its entries, the current one, and
 * popstate on the page's window (a moment later, as a browser fires it).
 * Back from the first entry, or forward from the last, leaves the page or does
 * nothing: `left` counts the times the page was left. Kept across loadPage
 * calls with the same object, as a reload keeps a tab's entries.
 */
function fakeHistory() {
    const nav = {
        entries: [{ state: null }],
        index: 0,
        left: 0,
        get state() {
            return nav.entries[nav.index].state;
        },
        pushState(state) {
            nav.entries.splice(nav.index + 1, Infinity, { state: structuredClone(state) });
            nav.index += 1;
        },
        replaceState(state) {
            nav.entries[nav.index] = { state: structuredClone(state) };
        },
        go(n) {
            assert.notEqual(n, 0, "go(0) would reload the page");
            const to = nav.index + n;
            if (to < 0) nav.left += 1;
            if (to < 0 || to >= nav.entries.length) return;
            nav.index = to;
            setImmediate(() => globalThis.window.fire("popstate", { state: nav.state }));
        },
        back: () => nav.go(-1),
        forward: () => nav.go(1),
    };
    return nav;
}

function installDom({ local = memoryStore(), fetchImpl, barcodes, nav = fakeHistory() } = {}) {
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
    Object.defineProperty(globalThis, "history", { value: nav, configurable: true, writable: true });
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
    return { nodes, asked, win, nav };
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
    return {
        li,
        x: child("kill"),
        ai: child("ai-mark"),
        badge: child("badge"),
        remote: child("shot-remote"),
        img: li.children.find((c) => c.tag === "img"),
    };
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
        cancelled: new Set(), // jobs the cancel button told the PC about
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
            if (parts[2] === "photos" && method === "GET") {
                // the JPEG itself, for the thumbnail of a photo read back
                const held = item.photos.get(Number(parts[3]));
                if (held === undefined) return json({ detail: `${parts[1]}: no photo ${parts[3]}` }, 404);
                return new Response(held, { status: 200, headers: { "Content-Type": "image/jpeg" } });
            }
            if (!parts[2] && method === "DELETE") {
                if (item.sku || item.jobs.some((j) => ["queued", "running"].includes(j.state))) {
                    return json({ detail: `${parts[1]} is being posted` }, 409);
                }
                pc.items.delete(parts[1]);
                return json({ item: parts[1], deleted: true, photos: item.photos.size });
            }
            if (parts[2] === "note") {
                item.note = body.note.trim();
                return json({ item: parts[1], note: item.note });
            }
            // a job recorded by a press is answered as GET /jobs/<id> would; one the test wrote whole stays
            const views = item.jobs.map((j) =>
                j.state || !jobs[j.job] ? j : { price: "", ...jobs[j.job](), job: j.job, venue: j.venue }
            );
            const sku = item.sku || views.map((j) => j.sku).find(Boolean) || null;
            return json({
                item: parts[1],
                photos: [...item.photos.keys()].sort((a, b) => a - b),
                note: item.note,
                sku,
                jobs: views,
            });
        }
        if (parts[0] === "jobs" && method === "POST") {
            pc.posted.push(body);
            if (refuseJob) return json({ detail: refuseJob }, 400);
            const id = body.venue === "ebay" ? "j1" : "j2";
            // the item remembers its jobs, as the PC's GET /items/<id> lists them
            const owner = pc.items.get(body.item) || [...pc.items.values()].find((it) => it.sku && it.sku === body.sku);
            if (owner) owner.jobs.push({ job: id, venue: body.venue });
            return json({ job: id, state: "queued", ahead: 1 });
        }
        if (parts[0] === "jobs" && parts[1] && method === "DELETE") {
            // the cancel button: a job the test holds "queued" is dropped, a running one is told
            const answer = jobs[parts[1]];
            if (!answer) return json({ detail: "no such job" }, 404);
            const state = answer().state;
            if (!["queued", "running"].includes(state)) return json({ detail: "finished" }, 409);
            pc.cancelled.add(parts[1]);
            return json({ job: parts[1], state: state === "queued" ? "cancelled" : "stopping" });
        }
        if (parts[0] === "jobs" && parts[1]) {
            const answer = jobs[parts[1]];
            if (answer && pc.cancelled.has(parts[1])) {
                return json({ price: "", ...answer(), state: "failed", error: "cancelled from the phone", links: {} });
            }
            // the row's price, "" until the PC has saved the row (the contract since 1.12.0)
            return answer ? json({ price: "", ...answer() }) : json({ detail: "no such job" }, 404);
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

test("end to end: each photo goes to the PC as it is taken; mark, ebay, link, craigslist by sku, NEXT", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let ebayState = "running";
    const local = memoryStore(GOOD);
    const pc = fakePc({
        jobs: {
            j1: () => ({
                state: ebayState,
                step: ebayState === "running" ? "drafting the listing" : "posted",
                sku: "B-0042",
                // the row is saved with the sku: its price and title come with it
                price: "14.00",
                title: "Brown Leather Boots Size 10",
                links: ebayState === "done" ? { ebay: "https://www.ebay.com/itm/123" } : {},
                error: "",
                ahead: 0,
            }),
            j2: () => ({
                state: "done",
                sku: "B-0042",
                price: "14.00",
                links: { craigslist: "https://sfbay.craigslist.org/x/1.html" },
            }),
        },
    });
    const { nodes, nav } = await loadPage({ local, fetchImpl: pc.fetch });
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
    assert.equal(nodes.get("ebay-btn").textContent, "ebay");
    assert.equal(nodes.get("craigslist-btn").textContent, "craigslist");
    assert.equal(nodes.get("next-note").hidden, true, "nothing posting yet");

    nodes.get("ebay-btn").fire("click");
    await settle();

    t.mock.timers.tick(SEND_DELAY_MS); // the second a press waits

    await settle();
    assert.deepEqual(pc.posted, [{ item, venue: "ebay", ai: [3] }], "the item, the venue, the marks");
    assert.equal(nodes.get("ebay-status").textContent, "queued, 1 ahead");
    // the ring turns in the pressed button from the press on; the other button has none
    assert.equal(nodes.get("ebay-btn").classList.contains("busy"), true);
    assert.equal(nodes.get("ebay-btn").attrs["aria-busy"], "true");
    assert.equal(nodes.get("craigslist-btn").classList.contains("busy"), false);
    // no price until the PC has saved the row: the venue alone
    assert.equal(nodes.get("ebay-btn").textContent, "ebay");
    assert.equal(nodes.get("ebay-btn").attrs["aria-label"], "ebay, posting");
    // NEXT does not wait for the listing: the PC has the job; the line under NEXT says so
    assert.equal(nodes.get("next-item").disabled, false);
    assert.equal(nodes.get("done-hint").hidden, true);
    assert.equal(nodes.get("next-note").hidden, false);
    assert.equal(
        nodes.get("next-note").textContent,
        "A listing is still posting on the PC; NEXT starts the next item without waiting for its link"
    );
    assert.equal(nodes.get("snap-input").disabled, true, "posted photos are locked");
    assert.equal(card(nodes, 0).x, undefined, "no x on a posted photo");

    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("ebay-status").textContent, "drafting the listing");
    // the row is saved: its price above the buttons, the button's word unchanged, the ring still turning
    assert.equal(nodes.get("price-line").hidden, false);
    assert.equal(nodes.get("price-line").textContent, "$14");
    assert.equal(nodes.get("ebay-btn").textContent, "ebay");
    assert.equal(nodes.get("ebay-btn").attrs["aria-label"], "ebay, posting");
    assert.equal(nodes.get("ebay-btn").classList.contains("busy"), true);
    // the sku is known: craigslist may go now, by sku alone
    assert.equal(nodes.get("craigslist-btn").disabled, false);
    assert.equal(nodes.get("craigslist-btn").textContent, "craigslist", "not pressed: its own word");

    ebayState = "done";
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("ebay-link").hidden, false);
    assert.equal(nodes.get("ebay-link").href, "https://www.ebay.com/itm/123");
    assert.equal(nodes.get("ebay-link").textContent, "https://www.ebay.com/itm/123");
    assert.equal(nodes.get("ebay-btn").disabled, true, "posted once is enough");
    assert.equal(nodes.get("ebay-btn").classList.contains("busy"), false, "the ring stops with the link");
    assert.equal(nodes.get("ebay-btn").attrs["aria-busy"], "false");
    // posted: the venue stays on the button, the price stays above
    assert.equal(nodes.get("ebay-btn").textContent, "ebay");
    assert.equal(nodes.get("ebay-btn").attrs["aria-label"], "ebay, posted");
    assert.equal(nodes.get("price-line").textContent, "$14");
    assert.equal(nodes.get("ebay-btn").classList.contains("posted"), true);
    assert.equal(nodes.get("next-item").disabled, false);
    assert.equal(nodes.get("next-note").hidden, true, "nothing is posting any more");

    nodes.get("craigslist-btn").fire("click");
    await settle();

    t.mock.timers.tick(SEND_DELAY_MS); // the second a press waits

    await settle();
    assert.deepEqual(pc.posted[1], { sku: "B-0042", venue: "craigslist" });
    // the same row: the price line stands, the button's word is the venue
    assert.equal(nodes.get("craigslist-btn").textContent, "craigslist");
    assert.equal(nodes.get("price-line").textContent, "$14");
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("craigslist-link").href, "https://sfbay.craigslist.org/x/1.html");
    assert.equal(nodes.get("craigslist-btn").textContent, "craigslist");
    assert.equal(nodes.get("craigslist-btn").attrs["aria-label"], "craigslist, posted");
    assert.equal(nodes.get("price-line").textContent, "$14");

    // no more calls once both are done
    const quiet = pc.calls.length;
    t.mock.timers.tick(30000);
    await settle();
    assert.equal(pc.calls.length, quiet);

    nodes.get("next-item").fire("click");
    await settle();
    assert.equal(nodes.get("strip").children.length, 0);
    assert.equal(nodes.get("ebay-link").hidden, true);
    assert.equal(nodes.get("ebay-btn").textContent, "ebay", "the next item's buttons say their venue again");
    assert.equal(nodes.get("ebay-btn").classList.contains("posted"), false);
    assert.equal(nodes.get("note").value, "");
    assert.equal(nodes.get("item-name").value, "");
    assert.equal(nodes.get("item-name").readOnly, false);
    assert.equal(local.getItem("snap.item"), null, "nothing left to read back");
    assert.equal(nodes.get("title-line").hidden, true);
    assert.equal(nodes.get("price-line").hidden, true);

    // the browser's back button brings the boots up again, as they were left
    // (Michal, 2026-10-02: "see how much that other thing posted for")
    assert.equal(JSON.parse(local.getItem("snap.history")).length, 1);
    nav.back();
    await settle();
    assert.equal(nodes.get("item-name").value, "Boots");
    assert.equal(nodes.get("item-name").readOnly, true);
    assert.equal(nodes.get("title-line").textContent, "Brown Leather Boots Size 10");
    assert.equal(nodes.get("price-line").textContent, "$14");
    assert.equal(nodes.get("ebay-link").href, "https://www.ebay.com/itm/123");
    assert.equal(nodes.get("craigslist-link").href, "https://sfbay.craigslist.org/x/1.html");
    assert.equal(nodes.get("note").value, "Size 10, scuffed toe");
    assert.equal(nodes.get("strip").children.length, 2, "the photos, fetched back from the PC");
    assert.equal(card(nodes, 0).img.src, "blob:stub");
    assert.equal(card(nodes, 1).img.src, "blob:stub");
    assert.equal(card(nodes, 0).remote, undefined);
    assert.equal(nodes.get("message").textContent, 'Back to "Boots", as it was left. NEXT starts a new item.');
    assert.equal(JSON.parse(local.getItem("snap.history")).length, 1, "brought up: still in its place");
    // NEXT from there: back to the fresh item in hand, the boots not deleted (they were posted)
    const calls = pc.calls.length;
    nodes.get("next-item").fire("click");
    await settle();
    assert.equal(nodes.get("item-name").value, "");
    assert.ok(!pc.calls.slice(calls).some((c) => c.startsWith("DELETE /items/")));
    assert.equal(JSON.parse(local.getItem("snap.history")).length, 1);
    nav.back();
    await settle();
    assert.equal(nodes.get("item-name").value, "Boots");
    nav.back();
    await settle();
    assert.equal(nodes.get("message").textContent, "End of the item history: see the inventory list on the PC.");
    assert.equal(nodes.get("item-name").value, "Boots", "nothing changed");
    assert.equal(nav.left, 0, "back never leaves the page");
});

test("back parks the item in hand; NEXT returns to it", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const local = memoryStore(GOOD);
    const lamp = `Lamp ${TODAY}`;
    local.setItem(
        "snap.history",
        JSON.stringify([{ itemName: "Lamp", itemId: lamp, ai: [1] }])
    );
    const pc = fakePc({
        items: {
            [lamp]: {
                photos: new Map([[1, "a"]]),
                note: "brass",
                sku: "B-7",
                jobs: [{ job: "j9", venue: "ebay", state: "done", sku: "B-7", price: "9.00", title: "Brass Lamp", links: { ebay: "https://www.ebay.com/itm/9" } }],
            },
        },
    });
    const { nodes, nav } = await loadPage({ local, fetchImpl: pc.fetch });
    await typeName(nodes, "Vase");
    snap(nodes, 2);
    await settle();
    card(nodes, 1).ai.fire("click");
    nodes.get("note").value = "chipped";
    nodes.get("note").fire("input");
    t.mock.timers.tick(1500);
    await settle();

    nav.back();
    await settle();
    assert.equal(nodes.get("item-name").value, "Lamp");
    assert.equal(nodes.get("title-line").textContent, "Brass Lamp");
    assert.equal(nodes.get("price-line").textContent, "$9");
    assert.equal(nodes.get("ebay-link").href, "https://www.ebay.com/itm/9");
    assert.equal(nodes.get("message").textContent, 'Back to "Lamp", as it was left. NEXT returns to the item you were on.');
    assert.equal(nodes.get("snap-input").disabled, true, "what was posted stays as it is");

    nodes.get("next-item").fire("click");
    await settle();
    assert.equal(nodes.get("item-name").value, "Vase", "the vase is back, with its note and mark");
    assert.equal(nodes.get("note").value, "chipped");
    assert.equal(nodes.get("strip").children.length, 2);
    assert.equal(card(nodes, 1).ai.attrs["aria-pressed"], "true");
    assert.equal(nodes.get("message").textContent, 'Back on "Vase", the item you were on.');
    assert.equal(nodes.get("snap-input").disabled, false, "and can go on");
    // the vase stayed the item in hand throughout; the lamp stays in the history
    assert.equal(JSON.parse(local.getItem("snap.item")).itemName, "Vase");
    assert.deepEqual(JSON.parse(local.getItem("snap.history")).map((r) => r.itemName), ["Lamp"]);
    assert.equal(nav.entries.length, 3, "the floor, the lamp, the vase");
    assert.equal(nav.index, 2);
});

test("NEXT while the listing still posts: the screen clears, the next item starts, its polls stop", async (t) => {
    // Michal, 2026-09-28: "I also want to not need to babysit an upload. I want to be
    // able to click NEXT as the things are loading/posting ... I know that does not
    // allow seeing the returned link, and that is fine."
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const local = memoryStore(GOOD);
    const pc = fakePc({
        jobs: { j1: () => ({ state: "running", step: "drafting the listing", sku: "B-7", price: "14.50" }) },
    });
    const { nodes, win } = await loadPage({ local, fetchImpl: pc.fetch });
    await typeName(nodes, "Lamp");
    snap(nodes, 2);
    await settle();
    card(nodes, 0).ai.fire("click");
    nodes.get("ebay-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS); // the second a press waits
    await settle();
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("price-line").textContent, "$14.50", "cents kept");
    assert.equal(nodes.get("ebay-btn").textContent, "ebay");
    assert.equal(nodes.get("ebay-btn").classList.contains("busy"), true);
    assert.equal(nodes.get("next-item").disabled, false);
    assert.equal(nodes.get("next-note").hidden, false);
    // leaving now loses nothing: the job is the PC's
    let prevented = false;
    win.fire("beforeunload", { preventDefault: () => (prevented = true) });
    assert.equal(prevented, false, "no warning merely because a listing is posting");

    const polled = () => pc.calls.filter((c) => c === "GET /jobs/j1").length;
    const before = polled();
    nodes.get("next-item").fire("click");
    await settle();
    // the screen is the next item's
    assert.equal(nodes.get("strip").children.length, 0);
    assert.equal(nodes.get("item-name").value, "");
    assert.equal(nodes.get("item-name").readOnly, false);
    assert.equal(nodes.get("ebay-btn").textContent, "ebay");
    assert.equal(nodes.get("ebay-btn").classList.contains("busy"), false);
    assert.equal(nodes.get("ebay-status").hidden, true);
    assert.equal(nodes.get("ebay-link").hidden, true);
    assert.equal(nodes.get("next-note").hidden, true);
    assert.equal(local.getItem("snap.item"), null, "the posting item is not read back after a reload either");
    // ... and the page stops asking about the job it left to the PC
    t.mock.timers.tick(30000);
    await settle();
    assert.equal(polled(), before, "no more polls for the item left posting");
    assert.deepEqual(pc.posted.length, 1, "nothing posted again");

    // the next item goes as any item does
    await typeName(nodes, "Chair");
    snap(nodes, 1);
    await settle();
    assert.equal(pc.calls.at(-1), `PUT /items/Chair ${TODAY}/photos/1`);
    assert.deepEqual(badges(nodes), ["sent"]);
});

test("NEXT waits for photos still going to the PC, whatever a job is doing", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = fakePc();
    pc.down = true;
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    await typeName(nodes, "Lamp");
    snap(nodes, 1);
    await settle();
    assert.equal(nodes.get("next-item").disabled, true);
    assert.equal(nodes.get("done-hint").textContent, "NEXT waits until the photos are on the PC");
    nodes.get("next-item").fire("click");
    await settle();
    assert.equal(nodes.get("strip").children.length, 1, "the unsent photo is still here");
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
    // the item, then its pictures one at a time (Michal, 2026-10-03: "see same photos")
    assert.deepEqual(pc.calls, [`GET /items/${item}`, `GET /items/${item}/photos/1`, `GET /items/${item}/photos/2`]);
    assert.equal(nodes.get("item-name").value, "Boots");
    assert.equal(nodes.get("item-name").readOnly, true);
    assert.equal(nodes.get("strip").children.length, 2);
    assert.equal(card(nodes, 0).img.src, "blob:stub", "the picture, fetched back");
    assert.equal(card(nodes, 0).remote, undefined);
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
    t.mock.timers.tick(SEND_DELAY_MS); // the second a press waits
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
        "book-isbn-kept",
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
        "book-customize-toggle",
        "book-customize",
        "book-quantity",
        "book-pickup-only",
        "book-title-line",
        "book-price-line",
        "book-ebay-btn",
        "book-ebay-status",
        "book-ebay-cancel",
        "book-ebay-link",
        "book-venue-hint",
        "book-done-hint",
        "book-next-item",
        "book-next-note",
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
    assert.match(html, /<button type="button" id="book-next-item" class="big done"\s+aria-label="Next: start the next book">NEXT</);
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

test("book mode end to end: scan, the book and its price, a cover, condition, flaws, ebay, link, NEXT", async (t) => {
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
                // not said while it runs here; once said, the PC's own price wins over the box
                price: ebayState === "done" ? "12.00" : "",
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
    assert.equal(nodes.get("book-ebay-btn").textContent, "ebay", "before the press: the venue");
    nodes.get("book-ebay-btn").fire("click");
    // the price is typed on the page: above the button from the press itself, before the PC answers
    assert.equal(nodes.get("book-price-line").hidden, false);
    assert.equal(nodes.get("book-price-line").textContent, "$11");
    assert.equal(nodes.get("book-ebay-btn").textContent, "ebay");
    assert.equal(nodes.get("book-ebay-btn").attrs["aria-label"], "ebay, posting");
    // ... while the press is on its way NEXT waits for it: clearing now would lose it
    assert.equal(nodes.get("book-next-item").disabled, true);
    assert.equal(nodes.get("book-done-hint").textContent, "NEXT waits until the listing has reached the PC");
    await settle();
    assert.equal(nodes.get("book-ebay-cancel").hidden, false, "the red cancel, for the second and after");
    t.mock.timers.tick(SEND_DELAY_MS); // the second a press waits
    await settle();
    assert.deepEqual(pc.posted, [
        { item, venue: "ebay", book: { ...NO_TYPING, isbn: ISBN, condition: "very_good", price: "11", main: 1 } },
    ]);
    assert.equal(nodes.get("book-ebay-status").textContent, "queued, 1 ahead");
    assert.equal(nodes.get("book-ebay-btn").classList.contains("busy"), true, "the ring turns");
    assert.equal(nodes.get("book-ebay-btn").attrs["aria-busy"], "true");
    assert.equal(nodes.get("book-price-line").textContent, "$11");
    assert.equal(nodes.get("book-next-item").disabled, false, "NEXT does not wait for the listing");
    assert.equal(nodes.get("book-done-hint").hidden, true);
    assert.equal(nodes.get("book-next-note").hidden, false, "the line under NEXT says one is posting");
    assert.equal(nodes.get("book-condition-good").disabled, true, "what is being listed stays put");
    assert.equal(nodes.get("book-price").readOnly, true);
    assert.equal(bookShot(nodes, 0).x, undefined, "no x on a posted photo");

    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("book-ebay-status").textContent, "listing the book");
    assert.equal(nodes.get("book-price-line").textContent, "$11", "the PC said no price yet: the box's");
    ebayState = "done";
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("book-ebay-link").hidden, false);
    assert.equal(nodes.get("book-ebay-link").href, "https://www.ebay.com/itm/777");
    assert.equal(nodes.get("book-ebay-btn").classList.contains("busy"), false, "the ring stops with the link");
    assert.equal(nodes.get("book-ebay-btn").disabled, true, "posted once is enough");
    // posted: the venue on the button, and above it the PC's own price once it says one
    assert.equal(nodes.get("book-ebay-btn").textContent, "ebay");
    assert.equal(nodes.get("book-ebay-btn").attrs["aria-label"], "ebay, posted");
    assert.equal(nodes.get("book-price-line").textContent, "$12");
    assert.equal(nodes.get("book-next-item").disabled, false);
    assert.equal(nodes.get("book-next-note").hidden, true);

    nodes.get("book-next-item").fire("click");
    await settle();
    assert.equal(nodes.get("book-ebay-btn").textContent, "ebay");
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

    t.mock.timers.tick(SEND_DELAY_MS); // the second a press waits

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

test("a book not in the catalogues points at No ISBN; a PC that could not look says why", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const books = {};
    const pc = fakePc({ books });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    nodes.get("mode-book").fire("click");

    typeIsbn(nodes, "9780804429573");
    t.mock.timers.tick(400);
    await settle();
    assert.equal(nodes.get("book-found").hidden, false);
    assert.equal(
        nodes.get("book-lookup").textContent,
        "Not in the catalogues. Tap No ISBN and type the title — the ISBN stays on the listing."
    );
    assert.equal(nodes.get("book-match").textContent, "9780804429573 is not in the catalogues", "the PC's words");
    assert.equal(nodes.get("book-card-title").hidden, true);
    assert.equal(nodes.get("book-venue-hint").textContent, "Tap No ISBN and type the title");
    assert.equal(nodes.get("book-no-isbn").classList.contains("next"), true, "the next step, lit up");

    books[ISBN] = { status: 502, body: { detail: "the catalogues could not be reached" } };
    typeIsbn(nodes, ISBN);
    t.mock.timers.tick(400);
    await settle();
    assert.equal(nodes.get("book-lookup").textContent, "the catalogues could not be reached");
    assert.equal(nodes.get("book-isbn").value, ISBN, "the ISBN is kept");
    assert.match(nodes.get("book-venue-hint").textContent, /edit the ISBN to try again/);
    assert.equal(nodes.get("book-no-isbn").classList.contains("next"), false, "a new ISBN: no miss to act on");

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
    t.mock.timers.tick(SEND_DELAY_MS); // the second a press waits
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
    assert.deepEqual(
        pc.calls,
        [`GET /items/${item}`, `GET /items/${item}/photos/1`, `GET /items/${item}/photos/2`],
        "the found book was kept: no second lookup, only the pictures"
    );
    assert.equal(nodes.get("book-isbn").value, ISBN);
    assert.equal(nodes.get("book-isbn").readOnly, true);
    assert.equal(nodes.get("book-card-title").textContent, "The Art of Computer Programming");
    assert.equal(nodes.get("book-price").value, "9", "his price, not the suggestion");
    assert.equal(nodes.get("book-condition-acceptable").attrs["aria-pressed"], "true");
    assert.equal(nodes.get("book-flaws").value, "Spine creased");
    assert.equal(bookShot(nodes, 0).li.children[0].src, "blob:stub", "the cover, fetched back from the PC");
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
    t.mock.timers.tick(SEND_DELAY_MS); // the second a press waits
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
    assert.deepEqual(
        pc.calls,
        [`GET /items/${item}`, `GET /items/${item}/photos/1`],
        "the match was kept: no second search, only the picture"
    );
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

// --- an ISBN no catalogue knows ------------------------------------------------------
// Michal, 2026-09-28: he scanned 9781926856155; the catalogues did not know it and the
// card said "Post it as goods instead", a dead end. No ISBN is the next step now, and it
// keeps the ISBN: the PC lists the book with that ISBN and the title he types.

const MISS = "9781926856155";

test("an ISBN no catalogue knows: No ISBN keeps it, the title is searched, the job carries both", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const detail = `${MISS} is not in the catalogues (no Google Books key is set)`;
    const local = memoryStore(GOOD);
    const pc = fakePc({
        books: { [MISS]: { status: 404, body: { detail } } },
        jobs: { j1: () => ({ state: "running", step: "listing the book" }) },
    });
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch, barcodes: [MISS] });
    const item = `Book ${MISS} ${TODAY}`;
    nodes.get("mode-book").fire("click");

    // the scan reads; the catalogues do not know the ISBN
    fire(nodes, "book-scan-input");
    await settle();
    assert.equal(nodes.get("book-isbn").value, MISS);
    assert.deepEqual(pc.calls, [`GET /books/${MISS}`]);
    assert.equal(
        nodes.get("book-lookup").textContent,
        "Not in the catalogues. Tap No ISBN and type the title — the ISBN stays on the listing."
    );
    assert.equal(nodes.get("book-match").textContent, detail, "the PC's reason, in the small line");
    assert.equal(nodes.get("book-venue-hint").textContent, "Tap No ISBN and type the title");
    assert.equal(nodes.get("book-no-isbn").classList.contains("next"), true);

    // the cover goes to the PC under the ISBN meanwhile; No ISBN still opens after that
    fire(nodes, "book-snap-input");
    await settle();
    assert.deepEqual(pc.calls.slice(1), ["POST /items", `PUT /items/${item}/photos/1`]);
    assert.equal(nodes.get("book-no-isbn").disabled, false);

    nodes.get("book-no-isbn").fire("click");
    assert.equal(nodes.get("book-manual").hidden, false);
    assert.equal(nodes.get("book-no-isbn").attrs["aria-expanded"], "true");
    assert.equal(nodes.get("book-no-isbn").classList.contains("next"), false, "done: it is open");
    assert.equal(nodes.get("book-isbn").value, MISS, "the ISBN box is not emptied");
    assert.equal(nodes.get("book-isbn").classList.contains("kept"), true);
    assert.equal(nodes.get("book-isbn-kept").hidden, false);
    assert.equal(nodes.get("book-isbn-kept").textContent, `ISBN ${MISS} kept: it goes on the listing`);
    assert.equal(nodes.get("book-venue-hint").textContent, "Type the book's title first");

    // the title typed: searched as any book with no ISBN, the folder left as it is
    typeInto(nodes, "book-title", "Coast Salish recipes");
    typeInto(nodes, "book-author", "Ann Smith");
    t.mock.timers.tick(600);
    await settle();
    assert.deepEqual(pc.calls.slice(3), ["GET /books/search?title=Coast%20Salish%20recipes&author=Ann%20Smith&year="]);
    assert.equal(nodes.get("book-lookup").textContent, "");
    assert.equal(nodes.get("book-card-title").textContent, "Coast Salish recipes");
    assert.equal(nodes.get("book-match").textContent, "Not in the catalogues: it will be listed as typed");
    assert.equal(nodes.get("book-price").value, "6", "eBay's price for the title");
    assert.equal(bookShot(nodes, 0).label.textContent, `Book ${MISS}-1.jpg`);
    const saved = JSON.parse(local.getItem("snap.book"));
    assert.deepEqual([saved.isbn, saved.isbnMiss, saved.manual, saved.title], [MISS, true, true, "Coast Salish recipes"]);

    assert.equal(nodes.get("book-ebay-btn").disabled, false);
    nodes.get("book-ebay-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS); // the second a press waits
    await settle();
    assert.deepEqual(pc.posted, [
        {
            item,
            venue: "ebay",
            book: {
                isbn: MISS,
                title: "Coast Salish recipes",
                author: "Ann Smith",
                year: "",
                format: "paperback",
                condition: "good",
                price: "6",
                main: 1,
            },
        },
    ]);
    assert.equal(nodes.get("book-no-isbn").disabled, true, "fixed while it is being listed");
});

test("after a miss: No ISBN again asks about the kept ISBN afresh; a new ISBN replaces it", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = fakePc({ books: { [ISBN]: BOOK } });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    nodes.get("mode-book").fire("click");
    typeIsbn(nodes, MISS);
    t.mock.timers.tick(400);
    await settle();
    nodes.get("book-no-isbn").fire("click");
    typeInto(nodes, "book-title", "Coast");

    // closed again: what was typed goes, the ISBN stays and is asked about again
    nodes.get("book-no-isbn").fire("click");
    await settle();
    assert.equal(nodes.get("book-manual").hidden, true);
    assert.equal(nodes.get("book-title").value, "");
    assert.equal(nodes.get("book-isbn").value, MISS);
    assert.equal(nodes.get("book-isbn").classList.contains("kept"), false);
    assert.deepEqual(pc.calls, [`GET /books/${MISS}`, `GET /books/${MISS}`], "the half-typed title never searched");
    assert.match(nodes.get("book-lookup").textContent, /^Not in the catalogues\. Tap No ISBN/);
    assert.equal(nodes.get("book-no-isbn").classList.contains("next"), true);

    // open, and a valid new ISBN typed over the kept one: it is the book, the fields close
    nodes.get("book-no-isbn").fire("click");
    typeIsbn(nodes, ISBN);
    t.mock.timers.tick(400);
    await settle();
    assert.equal(nodes.get("book-manual").hidden, true);
    assert.equal(nodes.get("book-isbn-kept").hidden, true);
    assert.equal(nodes.get("book-no-isbn").classList.contains("next"), false);
    assert.equal(pc.calls.at(-1), `GET /books/${ISBN}`);
    assert.equal(nodes.get("book-card-title").textContent, "The Art of Computer Programming");
});

// --- customize: the quantity and pickup only ---------------------------------------
// Michal, 2026-09-28: "Before the eBay and Craigslist buttons I would like to have a
// little arrow with the word customize. If clicked I want to be able to edit
// quantity. Also I want to be able to check pickup only. And it would be a pickup
// only item on eBay then."

const QUANTITY_HINT = "Quantity (under customize) must be a whole number, 1 or more";

test("customize sits right above the venue buttons in both modes, folded", () => {
    for (const [prefix, next] of [
        ["", "ebay-btn"],
        ["book-", "book-ebay-btn"],
    ]) {
        const toggle = new RegExp(
            `<button type="button" id="${prefix}customize-toggle" class="link customize-toggle" aria-expanded="false"\\s+aria-controls="${prefix}customize">▸ customize<`
        );
        assert.match(html, toggle);
        assert.match(html, new RegExp(`<div id="${prefix}customize" class="card customize" hidden>`));
        assert.match(html, new RegExp(`id="${prefix}quantity" class="quantity" type="text" inputmode="numeric"[^>]*value="1"`));
        assert.match(html, new RegExp(`id="${prefix}pickup-only" type="checkbox">\\s*<span>Pickup only — no shipping on eBay</span>`));
        assert.ok(html.indexOf(`id="${prefix}pickup-only"`) < html.indexOf(`id="${next}"`), "right above the buttons");
    }
});

test("customize, goods: open it, 2 and pickup only, ebay carries both, craigslist by sku too, DONE resets", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const local = memoryStore(GOOD);
    const pc = fakePc({
        jobs: {
            j1: () => ({ state: "done", sku: "B-0050", links: { ebay: "https://www.ebay.com/itm/50" } }),
            j2: () => ({ state: "done", sku: "B-0050", links: { craigslist: "https://sfbay.craigslist.org/x/50.html" } }),
        },
    });
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch });
    const item = `Chairs ${TODAY}`;
    await typeName(nodes, "Chairs");
    snap(nodes, 1);
    await settle();
    card(nodes, 0).ai.fire("click");
    assert.equal(nodes.get("ebay-btn").disabled, false);

    // folded until tapped: the arrow points right
    assert.equal(nodes.get("customize").hidden, true);
    assert.equal(nodes.get("customize-toggle").textContent, "▸ customize");
    assert.equal(nodes.get("ebay-status").hidden, true, "nothing under ebay yet");
    nodes.get("customize-toggle").fire("click");
    assert.equal(nodes.get("customize").hidden, false);
    assert.equal(nodes.get("customize-toggle").textContent, "▾ customize");
    assert.equal(nodes.get("customize-toggle").attrs["aria-expanded"], "true");
    assert.equal(nodes.get("book-customize").hidden, true, "the book's is its own");

    // a quantity that is not one shuts both buttons, and says why
    nodes.get("quantity").value = "0";
    nodes.get("quantity").fire("input");
    assert.equal(nodes.get("ebay-btn").disabled, true);
    assert.equal(nodes.get("craigslist-btn").disabled, true);
    assert.equal(nodes.get("venue-hint").textContent, QUANTITY_HINT);
    assert.equal(nodes.get("venue-hint").hidden, false);
    nodes.get("quantity").value = "2";
    nodes.get("quantity").fire("input");
    assert.equal(nodes.get("ebay-btn").disabled, false);
    assert.equal(nodes.get("venue-hint").hidden, true);

    // pickup only: a quiet word under ebay, before the press, so he sees it took
    nodes.get("pickup-only").checked = true;
    nodes.get("pickup-only").fire("change");
    assert.equal(nodes.get("ebay-status").textContent, "pickup only");
    assert.equal(nodes.get("ebay-status").hidden, false);
    assert.equal(nodes.get("craigslist-status").hidden, true, "craigslist is pickup anyway");
    assert.deepEqual(JSON.parse(local.getItem("snap.item")).customize, { quantity: "2", pickupOnly: true });

    nodes.get("ebay-btn").fire("click");
    await settle();

    t.mock.timers.tick(SEND_DELAY_MS); // the second a press waits

    await settle();
    assert.deepEqual(pc.posted, [{ item, venue: "ebay", ai: [1], quantity: 2, pickup_only: true }]);
    assert.equal(nodes.get("ebay-status").textContent, "queued, 1 ahead");
    // fixed while the job is on its way, as the photos are
    assert.equal(nodes.get("quantity").disabled, true);
    assert.equal(nodes.get("pickup-only").disabled, true);

    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("ebay-link").href, "https://www.ebay.com/itm/50");
    assert.equal(nodes.get("quantity").disabled, false, "the job is done: craigslist may still change them");
    nodes.get("craigslist-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS); // the second a press waits
    await settle();
    // the saved row's job carries them too: the PC updates the row before it posts
    assert.deepEqual(pc.posted[1], { sku: "B-0050", venue: "craigslist", quantity: 2, pickup_only: true });
    t.mock.timers.tick(3000);
    await settle();

    // DONE: the next item starts folded, at one, shipped
    nodes.get("next-item").fire("click");
    await settle();
    assert.equal(nodes.get("customize").hidden, true);
    assert.equal(nodes.get("customize-toggle").textContent, "▸ customize");
    assert.equal(nodes.get("quantity").value, "1");
    assert.equal(nodes.get("pickup-only").checked, false);
    assert.equal(nodes.get("ebay-status").hidden, true);
});

test("customize left alone sends the body exactly as before", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = fakePc({ jobs: { j1: () => ({ state: "running", step: "drafting the listing" }) } });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    await typeName(nodes, "Lamp");
    snap(nodes, 1);
    await settle();
    card(nodes, 0).ai.fire("click");
    // opened and looked at, nothing changed
    nodes.get("customize-toggle").fire("click");
    nodes.get("ebay-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS); // the second a press waits
    await settle();
    assert.equal(JSON.stringify(pc.posted[0]), `{"item":"Lamp ${TODAY}","venue":"ebay","ai":[1]}`);
});

test("customize, book: its own disclosure; a bad quantity shuts ebay; 3 and pickup only go with the book", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const local = memoryStore(GOOD);
    const pc = fakePc({
        books: { [ISBN]: BOOK },
        jobs: { j1: () => ({ state: "running", step: "listing the book" }) },
    });
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch, barcodes: [ISBN] });
    const item = `Book ${ISBN} ${TODAY}`;
    nodes.get("mode-book").fire("click");
    fire(nodes, "book-scan-input");
    await settle();
    fire(nodes, "book-snap-input");
    await settle();
    assert.equal(nodes.get("book-ebay-btn").disabled, false);

    assert.equal(nodes.get("book-customize").hidden, true);
    nodes.get("book-customize-toggle").fire("click");
    assert.equal(nodes.get("book-customize").hidden, false);
    assert.equal(nodes.get("book-customize-toggle").textContent, "▾ customize");
    assert.equal(nodes.get("customize").hidden, true, "the goods one stays folded");

    nodes.get("book-quantity").value = "1.5";
    nodes.get("book-quantity").fire("input");
    assert.equal(nodes.get("book-ebay-btn").disabled, true);
    assert.equal(nodes.get("book-venue-hint").textContent, QUANTITY_HINT);
    nodes.get("book-quantity").value = "3";
    nodes.get("book-quantity").fire("input");
    nodes.get("book-pickup-only").checked = true;
    nodes.get("book-pickup-only").fire("change");
    assert.equal(nodes.get("book-ebay-status").textContent, "pickup only");
    assert.equal(nodes.get("book-ebay-btn").disabled, false);
    assert.deepEqual(JSON.parse(local.getItem("snap.book")).customize, { quantity: "3", pickupOnly: true });

    nodes.get("book-ebay-btn").fire("click");
    await settle();

    t.mock.timers.tick(SEND_DELAY_MS); // the second a press waits

    await settle();
    assert.deepEqual(pc.posted, [
        {
            item,
            venue: "ebay",
            book: { ...NO_TYPING, isbn: ISBN, condition: "good", price: "11", main: 1 },
            quantity: 3,
            pickup_only: true,
        },
    ]);
    assert.equal(nodes.get("book-quantity").disabled, true);
    assert.equal(nodes.get("book-pickup-only").disabled, true);
});

test("a reload brings customize back, folded, with pickup only under ebay", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const item = `Chairs ${TODAY}`;
    const local = memoryStore({
        ...GOOD,
        "snap.item": JSON.stringify({
            itemName: "Chairs",
            itemId: item,
            ai: [1],
            customize: { quantity: "4", pickupOnly: true },
        }),
    });
    const pc = fakePc({ items: { [item]: { photos: new Map([[1, "a"]]), note: "", sku: null, jobs: [] } } });
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch });
    assert.equal(nodes.get("customize").hidden, true, "folded: the open state is not kept");
    assert.equal(nodes.get("quantity").value, "4");
    assert.equal(nodes.get("pickup-only").checked, true);
    assert.equal(nodes.get("ebay-status").textContent, "pickup only");
    nodes.get("ebay-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS); // the second a press waits
    await settle();
    assert.deepEqual(pc.posted, [{ item, venue: "ebay", ai: [1], quantity: 4, pickup_only: true }]);
});

test("a name the PC already has today is flagged after a pause and Snap waits for another", async (t) => {
    // Michal, 2026-09-30: "if I put a name for an item and it is the same as another, just
    // flag it and don't accept it. I see that that pulls back the cached photos"
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const taken = itemIdFor("Lamp", new Date()); // the page asks by the phone's own date
    const pc = fakePc({
        items: {
            [taken]: { photos: new Map([[1, "a"], [2, "b"], [3, "c"]]), note: "", sku: null, jobs: [] },
        },
    });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    await typeName(nodes, "Lamp");
    assert.equal(nodes.get("snap-input").disabled, false, "nothing known yet: typing is not blocked");
    assert.deepEqual(pc.calls, [], "not asked on every keystroke");
    t.mock.timers.tick(NAME_CHECK_MS);
    await settle();
    assert.deepEqual(pc.calls, [`GET /items/${taken}`]);
    assert.equal(
        nodes.get("hint").textContent,
        '"Lamp" is already an item on the PC today with 3 photos. Use a different name.'
    );
    assert.equal(nodes.get("hint").hidden, false);
    assert.equal(nodes.get("item-name").classList.contains("taken"), true);
    assert.equal(nodes.get("snap-input").disabled, true);
    assert.equal(nodes.get("item-name").readOnly, false, "the name is his to change");
    snap(nodes, 1);
    await settle();
    assert.equal(nodes.get("strip").children.length, 0, "no photo under a refused name");
    assert.match(nodes.get("message").textContent, /already an item on the PC today/);
    assert.deepEqual(pc.calls, [`GET /items/${taken}`], "nothing went to the PC");

    // another name: free, and the strip opens
    await typeName(nodes, "Lamp brass");
    assert.equal(nodes.get("hint").textContent, "Type the item name to start snapping.", "cleared as he types");
    assert.equal(nodes.get("item-name").classList.contains("taken"), false);
    t.mock.timers.tick(NAME_CHECK_MS);
    await settle();
    assert.deepEqual(pc.calls.at(-1), `GET /items/${itemIdFor("Lamp brass", new Date())}`);
    assert.equal(nodes.get("snap-input").disabled, false);
    snap(nodes, 1);
    await settle();
    assert.equal(nodes.get("strip").children.length, 1);
    assert.equal(pc.calls.at(-2), "POST /items");

    // once the folder exists the name is fixed and never asked about again
    const asked = pc.calls.length;
    t.mock.timers.tick(NAME_CHECK_MS * 2);
    await settle();
    assert.equal(pc.calls.length, asked);
});

test("a name is not held against him when the PC cannot be reached", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = fakePc();
    pc.down = true;
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    await typeName(nodes, "Lamp");
    t.mock.timers.tick(NAME_CHECK_MS);
    await settle();
    assert.equal(nodes.get("snap-input").disabled, false);
    assert.equal(nodes.get("hint").hidden, true);
});

test("after the first photo the button says Snap Again and scrolls to where the shutter was", async (t) => {
    // Michal, 2026-09-30: "when the website comes back I want the snap button to be right
    // there ... after the first snap it should say 'Snap Again' on that button"
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = fakePc();
    const { nodes, win } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    const scrolls = [];
    win.scrollTo = (opts) => scrolls.push(opts);
    win.innerHeight = 800;
    win.scrollY = 100;
    nodes.get("snap-label").getBoundingClientRect = () => ({ top: 1000, height: 100 });
    await typeName(nodes, "Lamp");
    assert.equal(nodes.get("snap-label").textContent, "Snap");
    snap(nodes, 1);
    await settle();
    assert.equal(nodes.get("snap-label").textContent, "Snap Again");
    // the button's middle (100 + 1000 + 50) at three quarters of 800
    assert.deepEqual(scrolls, [{ top: 550, left: 0, behavior: "instant" }]);
    // a gallery pick is not a return from the camera: no scroll
    nodes.get("gallery-input").fire("change", { target: { files: [new Blob(["g"], { type: "image/jpeg" })], value: "" } });
    await settle();
    assert.equal(scrolls.length, 1);
    nodes.get("next-item").fire("click");
    await settle();
    assert.equal(nodes.get("snap-label").textContent, "Snap", "a new item starts over");
});

test("NEXT keeps an item nothing was posted from, and back brings it up with its pictures", async (t) => {
    // Michal, 2026-10-03: "When I took some photos and pressed next. I would be able to go
    // back and see same photos. Even if I did not post yet" (until then such an item was
    // deleted on the PC, his 2026-09-30 wish)
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const local = memoryStore(GOOD);
    const pc = fakePc();
    const { nodes, nav } = await loadPage({ local, fetchImpl: pc.fetch });
    const item = `Lamp ${TODAY}`;
    await typeName(nodes, "Lamp");
    snap(nodes, 2);
    await settle();
    card(nodes, 1).ai.fire("click");
    nodes.get("note").value = "brass";
    nodes.get("note").fire("input");
    t.mock.timers.tick(1500);
    await settle();
    assert.equal(pc.items.has(item), true);
    nodes.get("next-item").fire("click");
    await settle();
    assert.ok(!pc.calls.some((c) => c.startsWith("DELETE /items/")), "nothing is deleted on the PC");
    assert.equal(pc.items.has(item), true);
    assert.equal(nodes.get("message").textContent, "");
    assert.equal(nodes.get("strip").children.length, 0);
    assert.equal(nodes.get("item-name").value, "");
    assert.deepEqual(JSON.parse(local.getItem("snap.history")), [{ itemName: "Lamp", itemId: item, ai: [2] }]);

    // back: the lamp as it was left, its pictures fetched from the PC, and it can go on
    const calls = pc.calls.length;
    nav.back();
    await settle();
    assert.equal(nodes.get("item-name").value, "Lamp");
    assert.equal(nodes.get("note").value, "brass");
    assert.deepEqual(pc.calls.slice(calls), [`GET /items/${item}`, `GET /items/${item}/photos/1`, `GET /items/${item}/photos/2`]);
    assert.equal(nodes.get("strip").children.length, 2);
    assert.equal(card(nodes, 0).img.src, "blob:stub");
    assert.equal(card(nodes, 1).img.src, "blob:stub");
    assert.equal(card(nodes, 1).ai.attrs["aria-pressed"], "true", "the AI mark as it was left");
    assert.equal(nodes.get("snap-input").disabled, false, "nothing was posted: it can go on");
    assert.equal(nodes.get("message").textContent, 'Back to "Lamp", as it was left. NEXT starts a new item.');

    // worked on again: its place in the history is kept current, the item in hand (none) untouched
    snap(nodes, 1);
    await settle();
    card(nodes, 0).ai.fire("click");
    assert.deepEqual(pc.calls.at(-1), `PUT /items/${item}/photos/3`);
    assert.deepEqual(JSON.parse(local.getItem("snap.history")), [{ itemName: "Lamp", itemId: item, ai: [1, 2] }]);
    assert.equal(local.getItem("snap.item"), null);
    nodes.get("next-item").fire("click");
    await settle();
    assert.equal(nodes.get("item-name").value, "", "NEXT: back to the fresh screen in hand");
    assert.equal(nav.index, 2);
    nav.back();
    await settle();
    assert.equal(nodes.get("strip").children.length, 3, "the lamp with its third photo");
    assert.equal(card(nodes, 0).ai.attrs["aria-pressed"], "true");
});

// --- back and forward ----------------------------------------------------------------
// Michal, 2026-10-03: "so the going back and forth on the browser is good. worked back.
// but when i wanted to go forward again it died. so... the back and forward on browser is
// like a cache of a session - it should work in both directions and should, actually work
// for lets say, 10 items back and then 10 items forward. beyond that it should say
// something like - 'end of item history - see inventory lists' - instead of just quitting
// and loosing all cache."

/** Name an item, snap `count` photos, NEXT: one more item left for back to walk to. */
async function leaveItem(nodes, name, count = 2) {
    await typeName(nodes, name);
    snap(nodes, count);
    await settle();
    nodes.get("next-item").fire("click");
    await settle();
}

/** A finished eBay job, as GET /items/<id> lists it, so the item brought up shows its title and price. */
function postedJob(name, i) {
    return { job: `j-${name}`, venue: "ebay", state: "done", sku: `B-${i}`, price: `${10 + i}.00`, title: `${name} listing`, links: { ebay: `https://www.ebay.com/itm/${i}` } };
}

const END = "End of the item history: see the inventory list on the PC.";

test("back and forward walk the items NEXT left, both ways, and never leave the page", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const local = memoryStore(GOOD);
    const pc = fakePc();
    const { nodes, nav } = await loadPage({ local, fetchImpl: pc.fetch });
    const names = ["Lamp", "Vase", "Boots"];
    for (const [i, name] of names.entries()) {
        await leaveItem(nodes, name);
        pc.items.get(`${name} ${TODAY}`).jobs = [postedJob(name, i)];
    }
    // the browser's entries mirror the walk: the floor, the three items, the screen in hand
    assert.deepEqual(nav.entries.map((e) => e.state), [0, 1, 2, 3, 4].map((snap) => ({ snap })));
    assert.equal(nav.index, 4);

    async function shows(move, name, line) {
        const calls = pc.calls.length;
        move();
        await settle();
        const item = `${name} ${TODAY}`;
        assert.equal(nodes.get("item-name").value, name);
        assert.equal(nodes.get("title-line").textContent, `${name} listing`);
        assert.equal(nodes.get("price-line").textContent, `$${10 + names.indexOf(name)}`);
        assert.deepEqual(pc.calls.slice(calls), [`GET /items/${item}`, `GET /items/${item}/photos/1`, `GET /items/${item}/photos/2`]);
        assert.equal(card(nodes, 0).img.src, "blob:stub", "the pictures, fetched back");
        assert.equal(card(nodes, 1).img.src, "blob:stub");
        assert.equal(nodes.get("message").textContent, line);
    }
    await shows(nav.back, "Boots", 'Back to "Boots", as it was left. NEXT starts a new item.');
    await shows(nav.back, "Vase", 'Back to "Vase", as it was left. NEXT starts a new item.');
    await shows(nav.forward, "Boots", 'Forward to "Boots", as it was left. NEXT starts a new item.');
    nav.forward();
    await settle();
    assert.equal(nodes.get("item-name").value, "", "the fresh screen in hand again");
    assert.equal(nodes.get("strip").children.length, 0);
    assert.equal(nodes.get("message").hidden, true);
    // forward past the newest: the browser has no entry to go to, nothing happens
    const calls = pc.calls.length;
    nav.forward();
    await settle();
    assert.equal(nav.index, 4);
    assert.equal(pc.calls.length, calls);
    assert.equal(nodes.get("item-name").value, "");

    // back past the oldest: the end of the history is said, the oldest stays, the page stays
    await shows(nav.back, "Boots", 'Back to "Boots", as it was left. NEXT starts a new item.');
    await shows(nav.back, "Vase", 'Back to "Vase", as it was left. NEXT starts a new item.');
    await shows(nav.back, "Lamp", 'Back to "Lamp", as it was left. NEXT starts a new item.');
    const before = pc.calls.length;
    nav.back();
    await settle();
    assert.equal(nodes.get("message").textContent, END);
    assert.equal(nodes.get("item-name").value, "Lamp");
    assert.equal(nodes.get("strip").children.length, 2);
    assert.equal(pc.calls.length, before, "nothing read again");
    assert.equal(nav.index, 1, "stepped forward off the floor, onto the oldest");
    assert.equal(nav.left, 0, "back never leaves the page");
    // and forward again from there
    await shows(nav.forward, "Vase", 'Forward to "Vase", as it was left. NEXT starts a new item.');

    // NEXT on an earlier item returns to the newest place: the screen in hand
    nodes.get("next-item").fire("click");
    await settle();
    assert.equal(nav.index, 4);
    assert.equal(nodes.get("item-name").value, "");
    assert.equal(nodes.get("item-name").readOnly, false);
    assert.deepEqual(JSON.parse(local.getItem("snap.history")).map((r) => r.itemName), names, "the list as it was");
    assert.equal(nav.entries.length, 5, "no entry was added by the walk");
});

test("a reload on an earlier item comes back on it, and the walk goes on from there", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const local = memoryStore(GOOD);
    const pc = fakePc();
    const { nodes, nav } = await loadPage({ local, fetchImpl: pc.fetch });
    await leaveItem(nodes, "Lamp");
    await leaveItem(nodes, "Vase");
    await typeName(nodes, "Boots"); // in hand, one photo on the PC
    snap(nodes, 1);
    await settle();
    nav.back();
    await settle();
    nav.back();
    await settle();
    assert.equal(nodes.get("item-name").value, "Lamp");
    assert.equal(nodes.get("message").textContent, 'Back to "Lamp", as it was left. NEXT returns to the item you were on.');

    // the tab reloads: its entries stay, the page finds its place in them
    const again = await loadPage({ local, fetchImpl: pc.fetch, nav });
    const page = again.nodes;
    assert.equal(nav.entries.length, 4, "the floor, the lamp, the vase, the boots in hand: none added");
    assert.equal(nav.index, 1);
    assert.equal(page.get("item-name").value, "Lamp");
    assert.equal(page.get("strip").children.length, 2);
    assert.equal(card(page, 0).img.src, "blob:stub");
    assert.equal(page.get("message").textContent, 'Back to "Lamp", as it was left. NEXT returns to the item you were on.');
    assert.equal(JSON.parse(local.getItem("snap.item")).itemName, "Boots", "the boots still in hand");

    nav.forward();
    await settle();
    assert.equal(page.get("item-name").value, "Vase");
    assert.equal(page.get("message").textContent, 'Forward to "Vase", as it was left. NEXT returns to the item you were on.');
    nav.forward();
    await settle();
    assert.equal(page.get("item-name").value, "Boots");
    assert.equal(page.get("strip").children.length, 1);
    assert.equal(page.get("message").textContent, 'Back on "Boots", the item you were on.');
    assert.equal(page.get("snap-input").disabled, false, "and it goes on");
});

test("the history keeps 10 items: the oldest falls off, and back stops at the tenth with the end", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const ids = Array.from({ length: 10 }, (_, i) => `Item ${i + 1} ${TODAY}`);
    const local = memoryStore({
        ...GOOD,
        "snap.history": JSON.stringify(ids.map((itemId, i) => ({ itemName: `Item ${i + 1}`, itemId, ai: [] }))),
    });
    const items = Object.fromEntries(ids.map((id) => [id, { photos: new Map(), note: "", sku: null, jobs: [] }]));
    const pc = fakePc({ items });
    const { nodes, nav } = await loadPage({ local, fetchImpl: pc.fetch });
    assert.equal(nav.entries.length, 12, "the floor, ten items, the screen in hand");
    await leaveItem(nodes, "Lamp", 1); // the eleventh: Item 1 falls off
    const kept = JSON.parse(local.getItem("snap.history")).map((r) => r.itemName);
    assert.deepEqual(kept, [...ids.slice(1).map((_, i) => `Item ${i + 2}`), "Lamp"]);
    assert.equal(nav.entries.length, 12, "the places are the same; each names the next item along");
    assert.equal(nav.index, 11);

    const seen = [];
    for (let i = 0; i < 10; i += 1) {
        nav.back();
        await settle();
        seen.push(nodes.get("item-name").value);
    }
    assert.deepEqual(seen, [...kept].reverse(), "ten back, newest first");
    nav.back();
    await settle();
    assert.equal(nodes.get("message").textContent, END);
    assert.equal(nodes.get("item-name").value, "Item 2", "the oldest kept stays on screen");
    assert.equal(nav.left, 0);
    assert.ok(!pc.calls.includes(`GET /items/Item 1 ${TODAY}`), "the item that fell off is not reached");
});

test("one walk for both kinds: an item of the other kind shows its kind; the item in hand comes back on the kind chosen", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const book = `Book ${ISBN} ${TODAY}`;
    const lamp = `Lamp ${TODAY}`;
    const local = memoryStore({
        ...GOOD,
        "snap.history": JSON.stringify([
            { itemName: "Lamp", itemId: lamp, ai: [1] },
            {
                mode: "book",
                itemName: `Book ${ISBN}`,
                itemId: book,
                isbn: ISBN,
                condition: "good",
                price: "9",
                main: 1,
                lookup: { record: BOOK, price: "11", listings: BOOK.listings, route: "list" },
            },
        ]),
    });
    const pc = fakePc({
        books: { [ISBN]: BOOK },
        items: {
            [lamp]: { photos: new Map([[1, "a"]]), note: "", sku: null, jobs: [] },
            [book]: { photos: new Map([[1, "c"]]), note: "", sku: null, jobs: [] },
        },
    });
    const { nodes, nav } = await loadPage({ local, fetchImpl: pc.fetch });
    await typeName(nodes, "Vase"); // goods in hand
    snap(nodes, 1);
    await settle();

    nav.back();
    await settle();
    assert.equal(nodes.get("book").hidden, false, "the book shows on the book screen");
    assert.equal(nodes.get("book-isbn").value, ISBN);
    assert.equal(nodes.get("message").textContent, `Back to "Book ${ISBN}", as it was left. NEXT returns to the item you were on.`);
    assert.equal(local.getItem("snap.mode"), null, "his choice of kind is untouched");
    nav.back();
    await settle();
    assert.equal(nodes.get("work").hidden, false);
    assert.equal(nodes.get("item-name").value, "Lamp");
    assert.equal(nodes.get("book-isbn").value, "", "the book screen is back on its own item in hand (none)");
    nav.forward();
    await settle();
    assert.equal(nodes.get("book").hidden, false);
    assert.equal(nodes.get("item-name").value, "Vase", "the goods screen is back on the vase in hand");
    // NEXT on the book: back to the vase, on the goods screen he was on
    nodes.get("book-next-item").fire("click");
    await settle();
    assert.equal(nodes.get("work").hidden, false);
    assert.equal(nodes.get("item-name").value, "Vase");
    assert.equal(nodes.get("message").textContent, 'Back on "Vase", the item you were on.');
    assert.equal(nav.index, 3);
});

test("a picture the PC cannot give stays on the PC; a PC that does not answer stops the fetching", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const item = `Boots ${TODAY}`;
    const local = memoryStore({ ...GOOD, "snap.item": JSON.stringify({ itemName: "Boots", itemId: item, ai: [] }) });
    const pc = fakePc({ items: { [item]: { photos: new Map([[1, "a"], [2, "b"], [3, "c"]]), note: "", sku: null, jobs: [] } } });
    const real = pc.fetch;
    pc.fetch = async (url, init) => {
        if (url.endsWith("/photos/1")) return new Response(JSON.stringify({ detail: "gone" }), { status: 404 });
        if (url.endsWith("/photos/3")) throw new TypeError("Failed to fetch");
        return real(url, init);
    };
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch });
    assert.equal(nodes.get("strip").children.length, 3);
    assert.equal(card(nodes, 0).remote.textContent, "on the PC");
    assert.equal(card(nodes, 1).img.src, "blob:stub");
    assert.equal(card(nodes, 2).remote.textContent, "on the PC");
    assert.equal(nodes.get("message").hidden, true, "nothing to say: the photos are safe on the PC");
});

test("photos are shrunk one after another as they come; only the shrunk JPEG is kept and shown", async (t) => {
    // Michal, 2026-10-02: several photos from the camera roll at once: the first went, the
    // rest showed failed however often he tapped them (the phone ran out of picture memory)
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = fakePc();
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    let decoding = 0;
    let atOnce = 0;
    globalThis.createImageBitmap = async () => {
        decoding += 1;
        atOnce = Math.max(atOnce, decoding);
        await new Promise((r) => setImmediate(r));
        decoding -= 1;
        return { width: 4032, height: 3024, close() {} };
    };
    const item = `Lamp ${TODAY}`;
    await typeName(nodes, "Lamp");
    snap(nodes, 4);
    // a second pick while the first is still being shrunk joins the same line
    nodes.get("gallery-input").fire("change", {
        target: { files: [new Blob(["g1"], { type: "image/jpeg" }), new Blob(["g2"], { type: "image/jpeg" })], value: "" },
    });
    await settle();
    assert.equal(atOnce, 1, "one original decoded at a time, across both picks");
    assert.deepEqual(badges(nodes), ["sent", "sent", "sent", "sent", "sent", "sent"]);
    assert.equal(pc.items.get(item).photos.size, 6);
    for (let i = 0; i < 6; i += 1) {
        assert.equal(card(nodes, i).li.children.find((c) => c.tag === "img").src, "blob:stub", "the shrunk one");
    }
});

test("a photo the phone cannot read shows failed with the reason, and a tap tries it again", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = fakePc();
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    const good = globalThis.createImageBitmap;
    globalThis.createImageBitmap = async () => {
        throw new Error("no bitmap");
    };
    globalThis.Image = class {
        set src(_url) {
            queueMicrotask(() => this.onerror && this.onerror());
        }
    };
    const item = `Lamp ${TODAY}`;
    await typeName(nodes, "Lamp");
    snap(nodes, 2);
    await settle();
    assert.deepEqual(badges(nodes), ["failed", "failed"]);
    assert.equal(
        nodes.get("message").textContent,
        "Lamp-2.jpg: could not read the photo (image/jpeg, 0.0 MB)",
        "the last failure, said where he can read it"
    );
    assert.ok(!pc.calls.some((c) => c.startsWith("PUT")), "nothing was sent");
    assert.equal(nodes.get("ebay-btn").disabled, true);

    // the phone can read again: a tap on failed shrinks and sends it
    globalThis.createImageBitmap = good;
    card(nodes, 0).badge.fire("click");
    await settle();
    assert.deepEqual(badges(nodes), ["sent", "failed"]);
    assert.equal(pc.calls.at(-1), `PUT /items/${item}/photos/1`);
});

test("a press waits a second with the ring turning; cancel within it sends nothing", async (t) => {
    // Michal, 2026-10-02: "below in red there should be a cancel button ... delay sending by
    // 1 second (but show loading) so that if one cancels within 1 sec there is no call money spent"
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = fakePc({ jobs: { j1: () => ({ state: "running", step: "drafting the listing" }) } });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    await typeName(nodes, "Lamp");
    snap(nodes, 1);
    await settle();
    card(nodes, 0).ai.fire("click");
    assert.equal(nodes.get("ebay-cancel").hidden, true, "nothing to cancel before the press");
    nodes.get("ebay-btn").fire("click");
    await settle();
    assert.equal(nodes.get("ebay-btn").classList.contains("busy"), true, "loading from the press");
    assert.equal(nodes.get("ebay-status").textContent, "sending");
    assert.equal(nodes.get("ebay-cancel").hidden, false, "the red cancel under the pressed button");
    assert.equal(nodes.get("craigslist-cancel").hidden, true);
    assert.deepEqual(pc.posted, [], "nothing has left the phone yet");
    t.mock.timers.tick(SEND_DELAY_MS - 1);
    await settle();
    assert.deepEqual(pc.posted, [], "not for a whole second");
    nodes.get("ebay-cancel").fire("click");
    await settle();
    assert.equal(nodes.get("ebay-status").textContent, "cancelled");
    assert.equal(nodes.get("ebay-status").className, "venue-status bad");
    assert.equal(nodes.get("ebay-cancel").hidden, true);
    assert.equal(nodes.get("ebay-btn").disabled, false, "the button comes back");
    assert.equal(nodes.get("ebay-btn").classList.contains("busy"), false);
    t.mock.timers.tick(SEND_DELAY_MS * 3);
    await settle();
    assert.deepEqual(pc.posted, [], "the taken-back press never goes, however long we wait");
    assert.ok(!pc.calls.some((c) => c.startsWith("POST /jobs")));

    // pressed again: a fresh second, then it goes
    nodes.get("ebay-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.equal(pc.posted.length, 1);
    assert.equal(nodes.get("ebay-cancel").hidden, false, "still cancellable once the PC has it");
});

test("cancel after the second tells the PC; the job stops at its next step and the draft's sku is kept", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = fakePc({
        jobs: { j1: () => ({ state: "running", step: "drafting the listing", sku: "B-0042" }) },
    });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    await typeName(nodes, "Lamp");
    snap(nodes, 1);
    await settle();
    card(nodes, 0).ai.fire("click");
    nodes.get("ebay-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("ebay-status").textContent, "drafting the listing");
    nodes.get("ebay-cancel").fire("click");
    await settle();
    assert.equal(pc.calls.at(-1), "DELETE /jobs/j1");
    assert.equal(nodes.get("ebay-status").textContent, "cancelling: the PC stops at its next step");
    assert.equal(nodes.get("ebay-cancel").disabled, true, "told once");
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("ebay-status").textContent, "cancelled from the phone");
    assert.equal(nodes.get("ebay-status").className, "venue-status bad");
    assert.equal(nodes.get("ebay-cancel").hidden, true);
    assert.equal(nodes.get("ebay-btn").disabled, false, "the saved row can be posted again");
    // the next press goes by the saved row's sku: no second draft
    nodes.get("ebay-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted.at(-1), { sku: "B-0042", venue: "ebay" });
});

test("NEXT keeps an item a button was pressed for", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = fakePc({ jobs: { j1: () => ({ state: "running", step: "drafting the listing" }) } });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    const item = `Lamp ${TODAY}`;
    await typeName(nodes, "Lamp");
    snap(nodes, 1);
    await settle();
    card(nodes, 0).ai.fire("click");
    nodes.get("ebay-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS); // the second a press waits
    await settle();
    nodes.get("next-item").fire("click");
    await settle();
    assert.ok(!pc.calls.some((c) => c === `DELETE /items/${item}`), "the job needs the folder");
    assert.equal(pc.items.has(item), true);
});
