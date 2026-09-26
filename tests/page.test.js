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
const PAGE_FILES = ["app.js", "core.js", "pc.js", "queue.js", "shrink.js", "version.js"];

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

function installDom({ local = memoryStore(), fetchImpl } = {}) {
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

test("Settings: a bad address is refused on the page; a good one is saved and checked", async () => {
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

test("Settings: a wrong key is reported as such", async () => {
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
function fakePc({ jobs = {}, refuseJob = "", items = {} } = {}) {
    const pc = {
        items: new Map(Object.entries(items)),
        calls: [],
        posted: [],
        down: false,
    };
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
    pc.fetch = async (url, init = {}) => {
        const method = init.method || "GET";
        const u = new URL(url);
        const parts = u.pathname.split("/").slice(1).map(decodeURIComponent);
        pc.calls.push(`${method} /${parts.join("/")}${u.search}`);
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

test("a photo the PC refuses shows failed; a tap sends it again", async () => {
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

test("after a reload a new photo numbers on after the PC's, never over them", async () => {
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

test("a reload whose item is gone from the PC starts fresh", async () => {
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

test("a refusal from the PC shows its own words", async () => {
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
});
