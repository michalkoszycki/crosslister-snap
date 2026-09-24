// tests/page.test.js -- the headless "does the page actually work" check.
//
// There is no browser here, so we stub just enough of one: a DOM whose
// getElementById only knows the ids that really exist in index.html. If app.js
// asks for an element the HTML does not have, this test fails -- which is the
// mistake a browser would only show as a console error. The last tests drive
// the page end to end against a fake PC (fetch), a fake camera photo and fake
// timers: snap, mark, ebay, poll, link, craigslist by sku, DONE.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const PAGE_FILES = ["app.js", "core.js", "pc.js", "shrink.js", "version.js"];

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
    globalThis.window = { addEventListener() {} };
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
    return { nodes, asked };
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
    const button = (cls) => li.children.find((c) => c.className && c.className.split(" ")[0] === cls);
    return { li, x: button("kill"), ai: button("ai-mark") };
}

test("end to end: snap, mark, ebay, poll to the link, craigslist by sku, DONE", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const calls = [];
    let ebayState = "running";
    const { nodes } = await loadPage({
        local: memoryStore(GOOD),
        fetchImpl: async (url, init = {}) => {
            calls.push({ url, init });
            const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
            if (init.method === "POST") {
                const venue = init.body.get("venue");
                return json({ job: venue === "ebay" ? "j1" : "j2", state: "queued", ahead: 1 });
            }
            if (url.endsWith("/jobs/j1")) {
                return json({
                    state: ebayState,
                    step: ebayState === "running" ? "drafting the listing" : "posted",
                    sku: "B-0042",
                    links: ebayState === "done" ? { ebay: "https://www.ebay.com/itm/123" } : {},
                    error: "",
                    ahead: 0,
                });
            }
            if (url.endsWith("/jobs/j2")) {
                return json({
                    state: "done",
                    sku: "B-0042",
                    links: { craigslist: "https://sfbay.craigslist.org/x/1.html" },
                });
            }
            return json({ detail: "no such job" }, 404);
        },
    });

    nodes.get("item-name").value = "Boots";
    nodes.get("item-name").fire("input");
    snap(nodes, 3);
    assert.equal(nodes.get("strip").children.length, 3);
    assert.equal(nodes.get("progress").textContent, "3 photos, 0 for the AI");
    assert.equal(nodes.get("ebay-btn").disabled, true, "no AI mark yet");
    assert.match(nodes.get("venue-hint").textContent, /Mark at least one photo AI/);

    // the AI mark at the bottom right: off by default, on when tapped
    assert.equal(card(nodes, 0).ai.attrs["aria-pressed"], "false");
    card(nodes, 2).ai.fire("click");
    assert.equal(card(nodes, 2).ai.attrs["aria-pressed"], "true");
    assert.equal(card(nodes, 2).li.className, "shot shot-ai");
    // the x at the top right still deletes: photo 1 goes, so photo 3 is position 1
    card(nodes, 0).x.fire("click");
    assert.equal(nodes.get("strip").children.length, 2);
    assert.equal(nodes.get("ebay-btn").disabled, false);
    assert.equal(nodes.get("venue-hint").hidden, true);

    nodes.get("note").value = "Size 10, scuffed toe";
    nodes.get("note").fire("input");

    nodes.get("ebay-btn").fire("click");
    await settle();
    const post = calls.find((c) => c.init.method === "POST");
    assert.equal(post.url, "http://127.0.0.1:8765/jobs");
    assert.equal(post.init.headers["X-Crosslister-Key"], "test-key-0123456789");
    const form = post.init.body;
    assert.deepEqual([...form.keys()], ["venue", "note", "ai", "photos", "photos"]);
    assert.equal(form.get("venue"), "ebay");
    assert.equal(form.get("note"), "Size 10, scuffed toe");
    assert.equal(form.get("ai"), "1");
    const photos = form.getAll("photos");
    assert.deepEqual(photos.map((p) => p.name), ["Boots-2.jpg", "Boots-3.jpg"]);
    assert.equal(photos[0].type, "image/jpeg");
    assert.equal(await photos[0].text(), "jpeg 2000x1500", "shrunk to 2000 px on the long edge");

    assert.equal(nodes.get("ebay-status").textContent, "queued, 1 ahead");
    assert.equal(nodes.get("note-status").textContent, "sent");
    assert.equal(nodes.get("next-item").disabled, true);
    assert.match(nodes.get("done-hint").textContent, /DONE waits/);
    assert.equal(nodes.get("snap-input").disabled, true, "sent photos are locked");
    assert.equal(card(nodes, 0).x, undefined, "no x on a sent photo");

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
    const second = calls.filter((c) => c.init.method === "POST")[1];
    assert.deepEqual([...second.init.body.entries()], [
        ["venue", "craigslist"],
        ["sku", "B-0042"],
    ]);
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("craigslist-link").href, "https://sfbay.craigslist.org/x/1.html");

    // no more polling once both are done
    const polled = calls.length;
    t.mock.timers.tick(30000);
    await settle();
    assert.equal(calls.length, polled);

    nodes.get("next-item").fire("click");
    assert.equal(nodes.get("strip").children.length, 0);
    assert.equal(nodes.get("ebay-link").hidden, true);
    assert.equal(nodes.get("note").value, "");
    assert.equal(nodes.get("item-name").value, "");
});

test("a PC that does not answer: 'cannot reach the PC' and the button comes back", async () => {
    const { nodes } = await loadPage({
        local: memoryStore(GOOD),
        fetchImpl: async () => {
            throw new TypeError("Failed to fetch");
        },
    });
    nodes.get("item-name").value = "Lamp";
    nodes.get("item-name").fire("input");
    snap(nodes, 1);
    card(nodes, 0).ai.fire("click");
    nodes.get("craigslist-btn").fire("click");
    await settle();
    assert.equal(nodes.get("craigslist-status").textContent, "cannot reach the PC");
    assert.equal(nodes.get("craigslist-btn").disabled, false);
    assert.equal(nodes.get("strip").children.length, 1, "the photo stays on the page");
    assert.equal(nodes.get("next-item").disabled, false);
});

test("a refusal from the PC shows its own words", async () => {
    const { nodes } = await loadPage({
        local: memoryStore(GOOD),
        fetchImpl: async () =>
            new Response(JSON.stringify({ detail: "mark at least one photo for the AI" }), {
                status: 400,
            }),
    });
    nodes.get("item-name").value = "Lamp";
    nodes.get("item-name").fire("input");
    snap(nodes, 1);
    card(nodes, 0).ai.fire("click");
    nodes.get("ebay-btn").fire("click");
    await settle();
    assert.equal(nodes.get("ebay-status").textContent, "mark at least one photo for the AI");
    assert.equal(nodes.get("ebay-btn").disabled, false);
});
