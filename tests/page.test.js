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
import { itemIdFor, NAME_CHECK_MS, SEND_DELAY_MS, TOO_LATE_MS } from "../core.js";

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
        // the word in it, beside the camera icon (design A2, 2026-10-05)
        "snap-word",
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
        // Michal, 2026-10-06: "a slider for price preference (3 grade)", its three words and
        // its line; then "a checkbox for post without asking"
        "pricing",
        "pricing-1",
        "pricing-2",
        "pricing-3",
        "pricing-note",
        "auto-post",
        // Michal, 2026-10-07: "Let's abandon checking eBay for similar items (call 1) and put
        // that toggle default off, in customization"
        "comps",
        // Michal, 2026-09-30: the price above the buttons, not on them; 2026-10-02: the title above it
        "title-line",
        "price-line",
        // Michal, 2026-10-07: no red cancel under a pressed button any more ("The button,
        // within it, should just get 'tap again to cancel' instead of an external cancel line");
        // and later that day, under it while a tap has paused it, its reset ("The cancel should
        // change to 'reset call' (as in discard) and the button should change to 'continue'")
        "ebay-btn",
        "ebay-reset",
        "ebay-status",
        "ebay-link",
        "craigslist-btn",
        "craigslist-reset",
        "craigslist-status",
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

test("Admin reads top to bottom: Settings, the inventory and a listing's foldouts, Close", () => {
    // Michal, 2026-10-06: "Admin which would replace Settings ... settings and inventory
    // would be a foldout in the admin section ... all the cards are different foldouts"
    assert.match(html, /id="admin-toggle"[^>]*aria-controls="admin">Admin</);
    assert.ok(!html.includes('id="settings-close"'), "Close is Admin's now");
    const admin = /<section id="admin"[^>]*>([\s\S]*?)<\/section>/.exec(html)[1];
    const order = [...admin.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(order, [
        // an id so a listing's own page can hide it (Michal, 2026-10-07: "when I am on a card
        // I don't want to see admin or settings above")
        "admin-title",
        "settings-toggle",
        "settings",
        "settings-server",
        "pc-address",
        "pc-key",
        // Michal, 2026-10-06: "In settings I want to have the mode options. Dark, light or sync with device"
        "theme",
        "theme-dark",
        "theme-light",
        "theme-device",
        "settings-save",
        "settings-status",
        "inventory-toggle",
        "inventory",
        "inventory-browse",
        "inventory-search",
        // the status line right under the search box: the count, or the server's trouble
        "inventory-status",
        // Michal, 2026-10-08: "Inventory list options need to be all small, and also locked
        // away inside a foldout tab 'Options'": the chips and Show photos, the search left out
        "options-toggle",
        "options",
        "inventory-venue",
        "inventory-venue-all",
        "inventory-venue-ebay",
        "inventory-venue-craigslist",
        "inventory-state",
        "inventory-state-all",
        "inventory-state-draft",
        "inventory-state-listed",
        "inventory-state-sold",
        "inventory-state-ended",
        // Michal, 2026-10-06: "Add sorting options for the inventory (by price and by age)"
        "inventory-sort",
        "inventory-sort-newest",
        "inventory-sort-oldest",
        "inventory-sort-price-desc",
        "inventory-sort-price-asc",
        // Michal, 2026-10-07: "that checkbox should be at end of options. Not right in the awkward middle"
        "inventory-photos",
        "inventory-list",
        // a listing, in place of the list: the heading, the photo strip, then only the venue
        // cards (Michal, 2026-10-06: "there should only be eBay or and Craigslist card")
        "inventory-detail",
        "inventory-back",
        "detail-heading",
        "detail-status",
        "detail-photos",
        // its customize, first (Michal, 2026-10-07: "each item needs a customize tab"), live as
        // the goods card ("I want the menu in the inventory to look like the customize menu"):
        // the quantity, pickup only and the price slider, Save and Sync to eBay
        "detail-customize-toggle",
        "detail-customize",
        "detail-quantity",
        "detail-pickup-only",
        "detail-pricing",
        "detail-pricing-1",
        "detail-pricing-2",
        "detail-pricing-3",
        "detail-pricing-note",
        "detail-customize-save",
        "detail-customize-sync",
        // beside Sync to eBay while a tap has paused it (Michal, 2026-10-07)
        "detail-customize-reset",
        "detail-customize-status",
        "detail-ebay-toggle",
        "detail-ebay",
        "detail-craigslist-toggle",
        "detail-craigslist",
        // the sync bar, below the inventory list, sticking to the bottom of the screen
        "sync-bar",
        // each with its half of the sync symbol (Michal, 2026-10-07)
        "sync-from",
        "sync-from-icon",
        "sync-to",
        "sync-to-icon",
        // under the two while a tap has paused the pressed one
        "sync-reset",
        "sync-status",
        "admin-close",
    ]);
    assert.match(html, /id="inventory-search"[^>]*inputmode="search"/);
    // Show photos: on by default, a pill row of its own after the sort chips, the last of Options
    assert.match(html, /<\/div>\s*<\/div>\s*(<!--[\s\S]*?-->\s*)?<label class="pickup">\s*<input id="inventory-photos" type="checkbox" checked>\s*<span>Show photos<\/span>\s*<\/label>\s*<\/div>\s*<ul id="inventory-list"/);
    // Options folded by default, in customize's pattern; the search small, out of it
    assert.match(html, /<button type="button" id="options-toggle" class="link customize-toggle options-toggle" aria-expanded="false"\s+aria-controls="options">▸ Options<\/button>\s*<div id="options" class="options" hidden>/);
    assert.match(html, /<label class="field field-small">\s*<span class="field-label">Search<\/span>\s*<input id="inventory-search" class="small-input"/);
    assert.match(html, /<button type="button" id="inventory-back" class="link back-link">← Back to inventory</);
    assert.ok(!html.includes('id="detail-item"'), "no Item foldout");
    assert.ok(!html.includes('id="detail-photos-toggle"'), "the photos are a strip, not a foldout");
    // customize opens with the listing; the goods card's slider, and no post without asking
    // (Michal, 2026-10-07: "Saying post without confirmation is useless")
    assert.match(html, /<button type="button" id="detail-customize-toggle"[^>]*aria-expanded="true"[^>]*>▾ customize</);
    assert.match(html, /<div id="detail-customize" class="card customize fold">/);
    const css = readFileSync(join(root, "styles.css"), "utf8");
    const custom = /<div id="detail-customize"[^>]*>([\s\S]*?)<p id="detail-customize-status"/.exec(html)[1];
    assert.match(custom, /<label class="field-label" for="detail-pricing">Price<\/label>/);
    assert.match(custom, /<input id="detail-pricing" class="pricing" type="range" min="1" max="3" step="1"/);
    assert.ok(!/without asking|auto-post|post the item again/i.test(custom), "no post without asking, no read-only grade");
    // each its half of the sync symbol on one 24-unit box, hidden from a screen reader, then
    // its word (Michal, 2026-10-07): to eBay the top arc, its arrow at the right; from eBay the
    // bottom arc, its arrow at the left
    const icon = (id) =>
        new RegExp(`<button type="button" id="${id}" class="sync-btn"><span id="${id}-icon" class="btn-icon"><svg\\s+aria-hidden="true" viewBox="0 0 24 24"[^>]*stroke="currentColor"[^>]*>([\\s\\S]*?)</svg></span>([^<]*)</button>`).exec(html);
    const to = icon("sync-to");
    const from = icon("sync-from");
    assert.equal(to[2], "Sync to eBay");
    assert.equal(from[2], "Sync from eBay");
    assert.match(to[1], /<path d="M4 12a8 8 0 0 1 14-5\.5"><\/path>/);
    assert.match(from[1], /<path d="M20 12a8 8 0 0 1-14 5\.5"><\/path>/);
    assert.match(css, /\.sync-btn \.btn-icon svg \{ width: 20px; height: 20px; \}/);
    // the goods | book switch has an id, so Admin can hide it
    assert.match(html, /<div id="modes" class="modes" role="group"/);
    assert.match(css, /\.sync-bar \{[^}]*position: sticky;[^}]*bottom: 0;/);
    assert.match(css, /\.modes\[hidden\] \{ display: none; \}/);
    // the full-size photo lies over everything, outside main
    const after = html.slice(html.indexOf("</main>"));
    assert.match(after, /<div id="photo-view"[^>]*hidden>\s*<img id="photo-view-img"[^>]*>\s*<button type="button" id="photo-view-close"/);
});

test("the app calls the PC the server: no visible PC on the page or in its words", () => {
    // Michal, 2026-10-08: "Start referring to the PC as server, in the app."
    const page = html.replace(/<!--[\s\S]*?-->/g, "");
    const words = [...page.matchAll(/>([^<]+)</g)].map((m) => m[1]);
    const attrs = [...page.matchAll(/\s(?:placeholder|aria-label|title)="([^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual([...words, ...attrs].filter((w) => /\bPC\b/.test(w)), []);
    assert.match(html, /<span class="field-label">Server address<\/span>/);
    assert.match(html, /placeholder="from CROSSLISTER_KEYS on the server"/);
    // the strings the scripts show; their comments, ids and storage keys keep the PC
    for (const file of ["app.js", "core.js", "book.js", "pc.js", "queue.js"]) {
        const code = readFileSync(join(root, file), "utf8")
            .split(/\r?\n/)
            .filter((line) => !/^\s*(\*|\/\/|\/\*\*)/.test(line))
            .join("\n");
        const said = [...code.matchAll(/(["`])((?:(?!\1).)*)\1/g)].map((m) => m[2]).filter((s) => /\bPC\b/.test(s));
        assert.deepEqual(said, [], file);
    }
    assert.match(html, /id="pc-address"/);
});

test("Appearance: three chips in Settings, Sync with device pressed until one is chosen", () => {
    const group = /<div id="theme" class="chips chips-three" role="group" aria-label="Appearance">([\s\S]*?)<\/div>/.exec(html)[1];
    const chips = [...group.matchAll(/<button type="button" id="theme-(\w+)" class="chip" data-value="(\w+)"\s+aria-pressed="(\w+)">([^<]+)</g)];
    assert.deepEqual(
        chips.map((m) => [m[1], m[2], m[3], m[4]]),
        [
            ["dark", "dark", "false", "Dark"],
            ["light", "light", "false", "Light"],
            ["device", "device", "true", "Sync with device"],
        ]
    );
    // the status bar's two colours are written once, in the metas app.js reads them from
    assert.match(html, /<meta id="theme-color" name="theme-color" content="#FFFC00">/);
    assert.match(html, /<meta id="theme-color-dark" name="theme-color" media="\(prefers-color-scheme: dark\)" content="#0B0B0B">/);
});

test("styles.css: the device's dark and Dark chosen declare the very same tokens", () => {
    const css = readFileSync(join(root, "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const declarations = (block) =>
        block
            .split(";")
            .map((d) => d.trim())
            .filter(Boolean)
            .map((d) => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()]);
    const device = /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{([^}]*)\}\s*\}/.exec(css);
    const chosen = /:root\[data-theme="dark"\] \{([^}]*)\}/.exec(css);
    assert.ok(device, "the device's dark is guarded so Light chosen wins");
    assert.ok(chosen, "Dark chosen has its own block");
    const a = declarations(device[1]);
    const b = declarations(chosen[1]);
    assert.deepEqual(a, b);
    const names = a.map(([name]) => name);
    for (const token of ["--bg", "--ink", "--accent", "--head-bg", "--mark-fill", "--mark-line"]) {
        assert.ok(names.includes(token), `${token} is in the dark tokens`);
    }
    assert.equal(new Set(names).size, names.length, "no token declared twice");
    // every dark-only rule follows the two selectors: no other dark media block
    assert.equal(css.match(/prefers-color-scheme/g).length, 1);
    assert.match(css, /:root\[data-theme="light"\] \{ color-scheme: light; \}/);
});

test("the manifest points at icons that exist", () => {
    const manifest = JSON.parse(readFileSync(join(root, "manifest.webmanifest"), "utf8"));
    assert.equal(manifest.display, "standalone");
    for (const icon of manifest.icons) {
        assert.ok(existsSync(join(root, icon.src)), `missing icon ${icon.src}`);
    }
});

test("the header carries the A2 mark and the $nap wordmark; the font comes from this repo", async () => {
    // Michal, 2026-10-05: "A2 implement" -- the app is written "crosslister $nap"
    const header = /<header>([\s\S]*?)<\/header>/.exec(html)[1];
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(header)[1];
    assert.match(h1, /<svg class="mark" viewBox="0 0 132 132"[^>]*role="img" aria-label="crosslister \$nap">/);
    assert.match(h1, /<circle class="mark-lens" cx="66" cy="76" r="23"/);
    assert.match(h1, />\$<\/text>/, "the lens holds the $");
    assert.match(h1, /crosslister <span class="wordmark-snap">\$nap<\/span>/);
    assert.match(html, /<title>crosslister \$nap<\/title>/);
    // the font is self-hosted: the CSP lets fonts come from 'self' and nowhere else
    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
    assert.match(csp, /font-src 'self';/);
    assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(html), "no font CDN");
    const css = readFileSync(join(root, "styles.css"), "utf8");
    const { VERSION } = await import("../version.js");
    assert.ok(css.includes(`url("fonts/Manrope.woff2?v=${VERSION}")`), "the font's URL carries VERSION");
    assert.ok(existsSync(join(root, "fonts/Manrope.woff2")));
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
        // as a browser does, the words become the new children's (a string is a text node)
        replaceChildren(...kids) {
            this.children = kids;
            this.textContent = kids.map((k) => (typeof k === "string" ? k : k.textContent)).join("");
        },
        focus() {},
        setAttribute(k, v) {
            attrs[k] = String(v);
        },
        removeAttribute(k) {
            delete attrs[k];
            if (k === "id") this.id = "";
        },
        // a copy (the sync badge's icon is the sync bar's, copied): its class, attributes, children
        cloneNode(deep) {
            const copy = fakeElement(this.id, this.tag);
            copy.className = this.className;
            Object.assign(copy.attrs, attrs);
            copy.cloneOf = this;
            if (deep) copy.children = this.children.map((k) => (typeof k === "string" ? k : k.cloneNode(true)));
            return copy;
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
        // a meta's content as the HTML writes it (the theme-color pair)
        const content = /\scontent="([^"]*)"/.exec(m[0]);
        if (m[0].startsWith("<meta") && content) nodes.get(m[1]).content = content[1];
    }
    const asked = new Set();
    globalThis.document = {
        documentElement: fakeElement("", "html"),
        getElementById(id) {
            asked.add(id);
            return nodes.get(id) ?? null;
        },
        createElement: (tag) => fakeElement("", tag),
        // the badges' tick is drawn as SVG
        createElementNS: (ns, tag) => {
            assert.equal(ns, "http://www.w3.org/2000/svg");
            return fakeElement("", tag);
        },
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

/**
 * A job button as the screen shows it: its word, and " / tap again to cancel" while
 * that small second line sits inside it (Michal, 2026-10-07).
 */
function buttonSays(btn) {
    const small = btn.children.find((c) => c.className === "tap-cancel");
    return small ? `${wordOf(btn)} / ${small.textContent}` : wordOf(btn);
}

/** A button's own word: its text children (not its icon, not its small second line). */
function wordOf(btn) {
    return btn.children.length ? btn.children.filter((c) => typeof c === "string").join("") : btn.textContent;
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
    assert.equal(nodes.get("venue-hint").textContent, "Set the server address and key in Admin");
    assert.equal(nodes.get("next-item").disabled, true);
    assert.equal(nodes.get("admin").hidden, true);
    assert.equal(nodes.get("settings").hidden, true);
    assert.equal(nodes.get("photo-view").hidden, true);
    const { VERSION } = await import("../version.js");
    assert.equal(nodes.get("version").textContent, VERSION);
});

test("the page still works when the browser blocks storage outright", async () => {
    const { nodes } = await loadPage({
        local: () => {
            throw new Error("SecurityError");
        },
    });
    assert.equal(nodes.get("venue-hint").textContent, "Set the server address and key in Admin");
    nodes.get("admin-toggle").fire("click");
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
    nodes.get("admin-toggle").fire("click");
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
    nodes.get("admin-toggle").fire("click");
    nodes.get("pc-address").value = "http://127.0.0.1:8765";
    nodes.get("pc-key").value = "wrong-key-0123456789";
    nodes.get("settings-save").fire("click");
    await settle();
    assert.match(nodes.get("settings-status").textContent, /wrong key/);
});

// --- Appearance (Michal, 2026-10-06: "Dark, light or sync with device") ----------

function pressed(nodes) {
    return ["dark", "light", "device"].filter((t) => nodes.get(`theme-${t}`).attrs["aria-pressed"] === "true");
}

test("Appearance: a chip applies the look at once and remembers it; Sync with device lets the device decide", async () => {
    const local = memoryStore();
    const { nodes } = await loadPage({ local });
    const page = globalThis.document.documentElement;
    const metas = () => [nodes.get("theme-color").content, nodes.get("theme-color-dark").content];
    assert.equal(page.attrs["data-theme"], undefined, "nothing chosen: the device's look");
    assert.deepEqual(pressed(nodes), ["device"]);
    assert.deepEqual(metas(), ["#FFFC00", "#0B0B0B"]);

    nodes.get("admin-toggle").fire("click");
    nodes.get("theme-dark").fire("click");
    assert.equal(page.attrs["data-theme"], "dark");
    assert.equal(local.getItem("snap.theme"), "dark");
    assert.deepEqual(pressed(nodes), ["dark"]);
    assert.deepEqual(metas(), ["#0B0B0B", "#0B0B0B"], "the status bar black on a light phone too");

    nodes.get("theme-light").fire("click");
    assert.equal(page.attrs["data-theme"], "light");
    assert.equal(local.getItem("snap.theme"), "light");
    assert.deepEqual(pressed(nodes), ["light"]);
    assert.deepEqual(metas(), ["#FFFC00", "#FFFC00"], "the status bar yellow on a dark phone too");

    nodes.get("theme-device").fire("click");
    assert.equal(page.attrs["data-theme"], undefined);
    assert.equal(local.getItem("snap.theme"), "device");
    assert.deepEqual(pressed(nodes), ["device"]);
    assert.deepEqual(metas(), ["#FFFC00", "#0B0B0B"], "the metas as index.html has them");
    // not part of Save and check: the address and key are untouched
    assert.equal(local.getItem("snap.pc"), null);
    assert.equal(nodes.get("settings-status").textContent, "");
});

test("Appearance: the saved look is on <html> before the page first renders", async () => {
    const local = memoryStore({ "snap.theme": "dark" });
    const dom = installDom({ local });
    const page = globalThis.document.documentElement;
    const seen = [];
    const set = page.setAttribute;
    page.setAttribute = (k, v) => {
        // render() writes the venue hint; the version line comes right after the look
        seen.push({ k, v, rendered: dom.nodes.get("venue-hint").textContent !== "" });
        set(k, v);
    };
    loads += 1;
    await import(`../app.js?load=${loads}`);
    await settle();
    assert.deepEqual(seen, [{ k: "data-theme", v: "dark", rendered: false }]);
    assert.deepEqual(pressed(dom.nodes), ["dark"]);
    assert.deepEqual([dom.nodes.get("theme-color").content, dom.nodes.get("theme-color-dark").content], ["#0B0B0B", "#0B0B0B"]);
    assert.notEqual(dom.nodes.get("venue-hint").textContent, "", "and the page did render after");
});

test("Appearance: a look saved wrong (or by an older page) is the device's", async () => {
    const { nodes } = await loadPage({ local: memoryStore({ "snap.theme": "sepia" }) });
    assert.equal(globalThis.document.documentElement.attrs["data-theme"], undefined);
    assert.deepEqual(pressed(nodes), ["device"]);
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
 * What is wrong with a POST /jobs body as the PC reads it, or "" when nothing:
 * a new item, a book, or a sku, each with customize's optional top-level keys
 * (`pricing` 2 or 3, `auto_post` false, `comps` true; 1, true and false are never sent).
 */
function jobContract(body) {
    const known = ["item", "venue", "ai", "book", "sku", "quantity", "pickup_only", "pricing", "auto_post", "comps"];
    const odd = Object.keys(body).filter((k) => !known.includes(k));
    if (odd.length) return `unknown keys ${odd.join(", ")}`;
    if (body.sku && ("book" in body || "item" in body)) return "a sku job carries no book and no item";
    if (!body.sku && !body.item) return "neither an item nor a sku";
    if ("pricing" in body && ![2, 3].includes(body.pricing)) return `pricing ${body.pricing}`;
    if ("auto_post" in body && body.auto_post !== false) return `auto_post ${body.auto_post}`;
    if ("comps" in body && body.comps !== true) return `comps ${body.comps}`;
    if ("pickup_only" in body && body.pickup_only !== true) return `pickup_only ${body.pickup_only}`;
    if ("quantity" in body && !(Number.isInteger(body.quantity) && body.quantity > 1)) return `quantity ${body.quantity}`;
    return "";
}

/**
 * The PC as the page sees it: `crosslister serve`'s items and jobs, in memory.
 * `down` makes every call fail as an unreachable PC does; `jobs` answers
 * GET /jobs/<id>; `refuseJob` answers POST /jobs with a 400.
 */
function fakePc({ jobs = {}, refuseJob = "", items = {}, books = {}, searches = {} } = {}) {
    const pc = {
        items: new Map(Object.entries(items)),
        calls: [],
        cancelled: new Set(), // jobs the cancel button told the server about
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
            // the PC's contract: a sku job carries no book (and no item); customize's keys
            // come only when not the default. A body that breaks it is refused, in words
            // a test's status line shows
            const broken = jobContract(body);
            if (broken) return json({ detail: `contract: ${broken}` }, 422);
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
    assert.equal(nodes.get("progress").textContent, "3 photos, 0 for the AI, all on the server");
    assert.equal(nodes.get("item-name").readOnly, true, "the folder on the server is named");
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
    // no price until the PC has saved the row: the venue alone, and inside the button, small,
    // what a tap on it does (Michal, 2026-10-07)
    assert.equal(buttonSays(nodes.get("ebay-btn")), "ebay / tap again to cancel");
    assert.equal(nodes.get("ebay-btn").attrs["aria-label"], "ebay, posting, tap again to cancel");
    assert.equal(nodes.get("ebay-btn").disabled, false, "it takes the tap that pauses it");
    assert.equal(buttonSays(nodes.get("craigslist-btn")), "craigslist", "the other has no second line");
    // NEXT does not wait for the listing: the PC has the job; the line under NEXT says so
    assert.equal(nodes.get("next-item").disabled, false);
    assert.equal(nodes.get("done-hint").hidden, true);
    assert.equal(nodes.get("next-note").hidden, false);
    assert.equal(
        nodes.get("next-note").textContent,
        "A listing is still posting on the server; NEXT starts the next item without waiting for its link"
    );
    assert.equal(nodes.get("snap-input").disabled, true, "posted photos are locked");
    assert.equal(card(nodes, 0).x, undefined, "no x on a posted photo");

    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("ebay-status").textContent, "drafting the listing");
    // the row is saved: its price above the buttons, the button's word unchanged, the ring still turning
    assert.equal(nodes.get("price-line").hidden, false);
    assert.equal(nodes.get("price-line").textContent, "$14");
    assert.equal(buttonSays(nodes.get("ebay-btn")), "ebay / tap again to cancel");
    assert.equal(nodes.get("ebay-btn").attrs["aria-label"], "ebay, posting, tap again to cancel");
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
    assert.equal(buttonSays(nodes.get("craigslist-btn")), "craigslist / tap again to cancel");
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
    assert.equal(nodes.get("strip").children.length, 2, "the photos, fetched back from the server");
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
    assert.equal(nodes.get("message").textContent, "End of the item history: see the inventory list on the server.");
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
    assert.equal(buttonSays(nodes.get("ebay-btn")), "ebay / tap again to cancel");
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
    assert.equal(nodes.get("done-hint").textContent, "NEXT waits until the photos are on the server");
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
    assert.match(nodes.get("offline").textContent, /^Cannot reach the server\. Photos wait on this page/);
    card(nodes, 0).ai.fire("click");
    assert.equal(nodes.get("ebay-btn").disabled, true);
    assert.equal(nodes.get("venue-hint").textContent, "Waiting for the photos to reach the server (0 of 2 sent)");
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

test("Admin has a Close button at its bottom", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { nodes } = await loadPage();
    nodes.get("admin-toggle").fire("click");
    assert.equal(nodes.get("admin").hidden, false);
    assert.equal(nodes.get("admin-toggle").attrs["aria-expanded"], "true");
    nodes.get("admin-close").fire("click");
    assert.equal(nodes.get("admin").hidden, true);
    assert.equal(nodes.get("admin-toggle").attrs["aria-expanded"], "false");
    // the header link again opens it, and closes it, as Settings' did
    nodes.get("admin-toggle").fire("click");
    assert.equal(nodes.get("admin").hidden, false);
    nodes.get("admin-toggle").fire("click");
    assert.equal(nodes.get("admin").hidden, true);
});

// --- Admin: Settings and the inventory (Michal, 2026-10-06) ------------------------------

/** Rows as GET /inventory gives them: a summary each, newest first. */
function summary(sku, over = {}) {
    return {
        sku,
        title: `Item ${sku}`,
        price: "24.00",
        condition: "Used",
        category: "Lamps",
        category_path: "Home > Lamps",
        quantity: 1,
        venues: ["ebay", "craigslist"],
        photos: 2,
        note: "",
        isbn: "",
        pickup_only: false,
        model_cost: "0.1046",
        // the grade its price follows and the three prices the first model call made,
        // cached (the contract of 2026-10-07): the price is the fair one
        pricing: 2,
        prices: { quick: "18.00", market: "24.00", high: "31.50" },
        statuses: {
            ebay: {
                status: "listed",
                id: "257780366045",
                url: "https://www.ebay.com/itm/257780366045",
                listed_at: "2026-10-03T16:21:47-05:00",
            },
            craigslist: { status: "draft", id: "", url: "", listed_at: null },
        },
        ...over,
    };
}

/** The whole row, as GET /inventory/<sku> gives it. */
function wholeRow(sku, over = {}) {
    return {
        ...summary(sku),
        description: "A brass lamp.\nWorks.",
        condition_note: "Light wear on the base",
        source: `Lamp ${TODAY}`,
        condition_details: {},
        aspects: { Brand: ["Acme"], Color: ["Brass", "Gold"] },
        package: { weight_oz: "5", length_in: "8", width_in: "6", height_in: "2" },
        craigslist: { title: "Brass lamp, works", price: null, description: "", category: "" },
        photos: [
            { n: 1, name: `${sku}-1.jpg` },
            { n: 2, name: `${sku}-2.jpg` },
        ],
        // the choices the job that drafted it was sent with: the PC still says them, the page
        // no longer shows them (Michal, 2026-10-07: "Saying post without confirmation is useless")
        posting: { pricing: 2, auto_post: true, job: "j1" },
        ...over,
    };
}

/**
 * What is wrong with an action job's POST /jobs body as the PC reads it, or ""
 * (the contract of 2026-10-06): {"action": "end" | "refresh", "sku", "venue"} or
 * {"action": "sync", "direction": "from" | "to"}; since 2026-10-07 {"action": "push",
 * "sku", "venue": "ebay"}, and since 2026-10-08 craigslist's too; nothing else.
 */
function actionContract(body) {
    const keys = Object.keys(body).sort().join(",");
    if (body.action === "sync") {
        return keys === "action,direction" && ["from", "to"].includes(body.direction) ? "" : `sync with ${keys}`;
    }
    if (["end", "refresh", "push"].includes(body.action)) {
        const ok = keys === "action,sku,venue" && body.sku && ["ebay", "craigslist"].includes(body.venue);
        return ok ? "" : `${body.action} with ${keys}`;
    }
    return `unknown action ${body.action}`;
}

/**
 * The fake PC with Admin's routes: GET /inventory answers `rows` (the query is
 * in pc.calls), /inventory/<sku> the whole row, /inventory/<sku>/photos/<n> an
 * image for any photo the row names. PATCH /inventory/<sku> merges its body into
 * the whole row, a "pricing" setting the price to that grade's cached one or
 * refused with a 400 when none is cached (each body in pc.patches; `pc.refusePatch`
 * answers a 400 with those words instead), POST /inventory/<sku>/venues/<venue> puts the row on that
 * venue. POST /jobs with an "action" is checked against the contract, kept in
 * pc.posted and queued as a1, a2, ... (answered by `jobs`), or refused with
 * `pc.refuse[action]`'s words (a push, too, for a row not listed on eBay); any
 * other job is fakePc's own.
 */
function inventoryPc(rows, wholes = {}, { jobs = {} } = {}) {
    const pc = fakePc({ jobs });
    const base = pc.fetch;
    pc.patches = [];
    pc.refusePatch = "";
    pc.refuse = {};
    let made = 0;
    pc.fetch = async (url, init = {}) => {
        const method = init.method || "GET";
        const u = new URL(url);
        const parts = u.pathname.split("/").slice(1).map(decodeURIComponent);
        const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
        const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
        if (parts[0] === "jobs" && method === "POST" && body && "action" in body) {
            pc.calls.push("POST /jobs");
            if (pc.down) throw new TypeError("Failed to fetch");
            pc.posted.push(body);
            const broken = actionContract(body);
            if (broken) return json({ detail: `contract: ${broken}` }, 422);
            if (pc.refuse[body.action]) return json({ detail: pc.refuse[body.action] }, 400);
            // a push needs a listing on that venue to update, as the PC does
            const listing = wholes[body.sku] && wholes[body.sku].statuses[body.venue];
            if (body.action === "push" && (!listing || listing.status !== "listed")) {
                return json({ detail: `${body.sku} is not listed on ${body.venue === "ebay" ? "eBay" : body.venue}` }, 400);
            }
            made += 1;
            return json({ job: `a${made}`, state: "queued", ahead: 0 });
        }
        if (parts[0] !== "inventory") return base(url, init);
        pc.calls.push(`${method} /${parts.join("/")}${u.search}`);
        if (pc.down) throw new TypeError("Failed to fetch");
        if (!parts[1]) return json({ rows });
        const whole = wholes[parts[1]];
        if (!whole) return json({ detail: `no row ${parts[1]}` }, 404);
        if (parts[2] === "photos") {
            if (!whole.photos.some((p) => p.n === Number(parts[3]))) return json({ detail: "no such photo" }, 404);
            return new Response(`jpeg ${parts[1]} ${parts[3]}`, { status: 200, headers: { "Content-Type": "image/jpeg" } });
        }
        if (method === "PATCH") {
            assert.equal(init.headers["Content-Type"], "application/json");
            pc.patches.push(body);
            if (pc.refusePatch) return json({ detail: pc.refusePatch }, 400);
            const { craigslist, pricing, ...top } = body;
            if (pricing !== undefined) {
                // the grade's cached price becomes the row's price, as the PC does; a grade
                // with none cached is refused, and nothing of the body is kept
                assert.ok([1, 2, 3].includes(pricing), `pricing ${pricing}`);
                const [key, word] = [["quick", "quick"], ["market", "fair"], ["high", "high"]][pricing - 1];
                const cached = whole.prices && whole.prices[key];
                if (!cached) return json({ detail: `no cached ${word} price for this row: set the price by hand` }, 400);
                Object.assign(whole, { price: cached, pricing });
            }
            Object.assign(whole, top);
            if (craigslist) whole.craigslist = { ...whole.craigslist, ...craigslist };
            return json(whole);
        }
        if (parts[2] === "venues" && method === "POST") {
            whole.venues = [...whole.venues, parts[3]];
            return json(whole);
        }
        return json(whole);
    };
    return pc;
}

const ALL = "venue=&status=&limit=200&sort=age&order=desc";

/** Settings right and Show photos unticked on this phone: the list fetches no photo 1s. */
const NO_PHOTOS = { ...GOOD, "snap.inventory.photos": "off" };

/** A listing's venue foldout as its toggle shows it: the badge's words and class, the arrow. */
function foldOf(nodes, venue) {
    const toggle = nodes.get(`detail-${venue}-toggle`);
    if (toggle.hidden) return "hidden";
    const [badge, arrow] = toggle.children;
    return `${badge.textContent} (${badge.className} ${badge.tag})${arrow}`;
}

/** The list's rows as the screen shows them: the button's words, each part by its class. */
function listed(nodes) {
    return nodes.get("inventory-list").children.map((li) => {
        const words = li.children.find((c) => c.className === "inv-words");
        const [open, badges] = words.children;
        const [title, line] = open.children;
        return {
            title: title.textContent,
            line: line.children.map((c) => c.textContent).join(" "),
            badges: badges.children.map((b) => `${b.textContent} (${b.className})`),
            links: badges.children,
            thumb: li.children.find((c) => c.className === "inv-thumb"),
            open,
        };
    });
}

/** A card's facts: "label: value", a field derived from eBay marked. */
function factsOf(list) {
    const out = [];
    for (let i = 0; i < list.children.length; i += 2) {
        const value = list.children[i + 1];
        const note = value.children.find((c) => c.className === "derived-note");
        out.push(`${list.children[i].textContent}: ${value.textContent}${note ? ` (${note.textContent})` : ""}`);
    }
    return out;
}

/**
 * A venue card as the screen shows it: the status line and its kind, the link,
 * the facts (or null while editing), the actions row's words ("/ tap again to
 * cancel" for a pressed one that says so, "(busy)" for one whose ring turns,
 * "(off)" for a button that cannot be pressed, "(link)" for a link, "(ask)" for
 * End's question; a pressed one's reset only while it shows), the words under Save,
 * and its buttons and Edit's inputs by word.
 */
function cardOf(nodes, venue) {
    const kids = nodes.get(`detail-${venue}`).children;
    const find = (cls) => kids.find((c) => c.className === cls || c.className.startsWith(`${cls} `));
    const line = find("venue-status");
    const link = find("venue-link");
    const list = find("facts");
    const form = find("edit-form");
    const actions = find("venue-actions");
    const refused = find("edit-error");
    const fields = form ? form.children : [];
    const field = (label) => fields.find((f) => f.children[0].children[0].textContent === label);
    return {
        line: line.textContent,
        kind: line.className,
        link,
        facts: list ? factsOf(list) : null,
        actions: actions.children.filter((b) => !b.hidden).map((b) => {
            if (b.tag === "a") return `${b.textContent} (link)`;
            if (b.tag === "span") return `${b.textContent} (ask)`;
            const busy = b.classList.contains("busy") ? " (busy)" : "";
            return `${buttonSays(b)}${busy}${b.disabled ? " (off)" : ""}`;
        }),
        refused: refused ? refused.textContent : "",
        button: (word) => actions.children.find((b) => wordOf(b) === word),
        input: (label) => field(label).children[1],
        labels: fields.map((f) => f.children[0].children[0].textContent),
        clear: (label) => field(label).children[0].children[1],
    };
}

/** Type into one of Edit's inputs, as the phone's keyboard does. */
function typeField(input, text) {
    input.value = text;
    input.fire("input");
}

test("Admin opens on Settings while they are missing; Settings work inside it as before", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { nodes } = await loadPage();
    assert.equal(nodes.get("admin").hidden, true);
    nodes.get("admin-toggle").fire("click");
    assert.equal(nodes.get("admin").hidden, false);
    assert.equal(nodes.get("settings").hidden, false, "no settings yet: Settings opens by itself");
    assert.equal(nodes.get("settings-toggle").textContent, "▾ Settings");
    assert.equal(nodes.get("settings-toggle").attrs["aria-expanded"], "true");
    assert.equal(nodes.get("inventory").hidden, true);
    assert.equal(nodes.get("inventory-toggle").textContent, "▸ Inventory");
    // folded by hand, opened by hand
    nodes.get("settings-toggle").fire("click");
    assert.equal(nodes.get("settings").hidden, true);
    assert.equal(nodes.get("settings-toggle").textContent, "▸ Settings");
    // the inventory without settings asks nothing and says why
    nodes.get("inventory-toggle").fire("click");
    await settle();
    assert.equal(nodes.get("inventory").hidden, false);
    assert.equal(nodes.get("inventory-status").textContent, "Set the server address and key under Settings first.");
});

test("Admin opens on the inventory once Settings are right: the PC's rows, one button each", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = inventoryPc([
        summary("R5GM4XZN"),
        summary("B-0042", {
            title: "A very long title that goes on and on without a break",
            price: "24.50",
            venues: ["ebay"],
            statuses: { ebay: { status: "sold", id: "1", url: "", listed_at: null } },
        }),
        summary("NOPRICE", { price: null, venues: [], statuses: {} }),
    ]);
    // Show photos unticked on this phone stays unticked
    const { nodes } = await loadPage({ local: memoryStore(NO_PHOTOS), fetchImpl: pc.fetch });
    assert.equal(nodes.get("inventory-photos").checked, false);
    nodes.get("admin-toggle").fire("click");
    assert.equal(nodes.get("settings").hidden, true, "settings are right: folded");
    assert.equal(nodes.get("inventory").hidden, false);
    assert.equal(nodes.get("inventory-toggle").textContent, "▾ Inventory");
    assert.equal(nodes.get("inventory-status").textContent, "Asking the server...");
    await settle();
    assert.deepEqual(pc.calls, [`GET /inventory?q=&${ALL}`]);
    assert.equal(nodes.get("inventory-status").textContent, "3 listings");
    const rows = listed(nodes);
    assert.deepEqual(
        rows.map(({ title, line, badges }) => ({ title, line, badges })),
        [
            {
                title: "Item R5GM4XZN",
                line: "$24 R5GM4XZN",
                badges: ["ebay listed (vbadge posted)", "craigslist draft (vbadge draft)"],
            },
            {
                title: "A very long title that goes on and on without a break",
                line: "$24.50 B-0042",
                badges: ["ebay sold (vbadge muted)"],
            },
            { title: "Item NOPRICE", line: "NOPRICE", badges: [] },
        ]
    );
    assert.equal(rows[0].open.tag, "button");
    assert.equal(rows[0].thumb, undefined, "Show photos is off: no tiles, no photo fetched");
    assert.equal(nodes.get("inventory-detail").hidden, true);

    // Michal, 2026-10-06: "When an item is listed probably clicking the venue button from the
    // inventory should open the listing": a listed badge is a link, beside the row's button
    // (not in it), so its tap opens the listing and not the detail; any other is a word
    const [ebay, craigslist] = rows[0].links;
    assert.equal(ebay.tag, "a");
    assert.equal(ebay.href, "https://www.ebay.com/itm/257780366045");
    assert.equal(ebay.target, "_blank");
    assert.equal(ebay.rel, "noopener noreferrer");
    assert.equal(ebay.attrs["aria-label"], "ebay listed: open the listing");
    assert.equal(craigslist.tag, "span");
    assert.equal(rows[1].links[0].tag, "span", "sold: a word");
    ebay.fire("click");
    await settle();
    assert.equal(nodes.get("inventory-detail").hidden, true, "the listing opened, not the detail");
    assert.deepEqual(pc.calls, [`GET /inventory?q=&${ALL}`]);
});

test("Admin hides the goods | book switch while it is open", async (t) => {
    // Michal, 2026-10-06: "when we do admin we probably do not need goods vs book slider distinction"
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { nodes } = await loadPage();
    assert.equal(nodes.get("modes").hidden, false);
    nodes.get("admin-toggle").fire("click");
    assert.equal(nodes.get("modes").hidden, true);
    nodes.get("admin-close").fire("click");
    assert.equal(nodes.get("modes").hidden, false);
    nodes.get("admin-toggle").fire("click");
    nodes.get("admin-toggle").fire("click");
    assert.equal(nodes.get("modes").hidden, false, "the header link closes it the same way");
});

test("Admin hides the posting screens too, the list's and a listing's; Close shows them as they carried on", async (t) => {
    // Michal, 2026-10-08: "When I look at a card the posting screen is below. That should not be there."
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = inventoryPc([summary("A1")], { A1: wholeRow("A1") });
    const { nodes } = await loadPage({ local: memoryStore(NO_PHOTOS), fetchImpl: pc.fetch });
    await typeName(nodes, "Boots");
    snap(nodes, 2);
    // Admin opened while the photos are still on their way
    nodes.get("admin-toggle").fire("click");
    assert.deepEqual([nodes.get("work").hidden, nodes.get("book").hidden], [true, true]);
    await settle();
    // underneath, the uploads carried on: nothing was reset
    assert.deepEqual(
        pc.calls.filter((c) => c.startsWith("PUT")),
        [`PUT /items/Boots ${TODAY}/photos/1`, `PUT /items/Boots ${TODAY}/photos/2`]
    );
    listed(nodes)[0].open.fire("click");
    await settle();
    assert.equal(nodes.get("work").hidden, true, "under a listing too");
    // the header's Admin link closes it: the goods screen as it now is
    nodes.get("admin-toggle").fire("click");
    assert.deepEqual([nodes.get("work").hidden, nodes.get("book").hidden], [false, true]);
    assert.equal(nodes.get("strip").children.length, 2);
    assert.equal(nodes.get("progress").textContent, "2 photos, 0 for the AI, all on the server");
    assert.equal(nodes.get("item-name").value, "Boots");
    // in book mode Close brings the book screen back, not the goods one
    nodes.get("mode-book").fire("click");
    nodes.get("admin-toggle").fire("click");
    assert.deepEqual([nodes.get("work").hidden, nodes.get("book").hidden], [true, true]);
    nodes.get("admin-close").fire("click");
    assert.deepEqual([nodes.get("work").hidden, nodes.get("book").hidden], [true, false]);
});

test("the sort chips: Newest first, and each chip asks again with its sort and order", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = inventoryPc([]);
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    nodes.get("admin-toggle").fire("click");
    await settle();
    assert.match(html, /id="inventory-sort-newest"[^>]*aria-pressed="true"/);
    assert.equal(pc.calls.at(-1), "GET /inventory?q=&venue=&status=&limit=200&sort=age&order=desc");
    const chips = {
        "price-desc": "sort=price&order=desc",
        "price-asc": "sort=price&order=asc",
        oldest: "sort=age&order=asc",
        newest: "sort=age&order=desc",
    };
    for (const [chip, query] of Object.entries(chips)) {
        nodes.get(`inventory-sort-${chip}`).fire("click");
        await settle();
        assert.equal(pc.calls.at(-1), `GET /inventory?q=&venue=&status=&limit=200&${query}`);
        for (const other of Object.keys(chips)) {
            const pressed = nodes.get(`inventory-sort-${other}`).attrs["aria-pressed"];
            assert.equal(pressed, other === chip ? "true" : "false", `${other} after ${chip}`);
        }
    }
    // the sort stays with the search and the filters
    nodes.get("inventory-sort-price-asc").fire("click");
    nodes.get("inventory-state-listed").fire("click");
    await settle();
    assert.equal(pc.calls.at(-1), "GET /inventory?q=&venue=&status=listed&limit=200&sort=price&order=asc");
});

test("the sync bar: from and to post their job, show its step and summary, lock, then the list reloads", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let syncing = { state: "running", step: "reading eBay's listings", action: "sync", direction: "from" };
    const pc = inventoryPc([summary("A1")], {}, { jobs: { a1: () => syncing } });
    const { nodes } = await loadPage({ local: memoryStore(NO_PHOTOS), fetchImpl: pc.fetch });
    nodes.get("admin-toggle").fire("click");
    await settle();
    assert.equal(nodes.get("sync-status").textContent, "");
    assert.equal(nodes.get("sync-from").disabled, false);
    // each button its icon, then its word
    assert.equal(nodes.get("sync-from").children[0], nodes.get("sync-from-icon"));
    assert.equal(buttonSays(nodes.get("sync-from")), "Sync from eBay");
    assert.equal(nodes.get("sync-to").children[0], nodes.get("sync-to-icon"));
    assert.equal(buttonSays(nodes.get("sync-to")), "Sync to eBay");

    // the press: its ring and "tap again to cancel" at once, the job after the second
    nodes.get("sync-from").fire("click");
    assert.equal(nodes.get("sync-status").textContent, "sending");
    assert.equal(nodes.get("sync-from").classList.contains("busy"), true);
    assert.equal(buttonSays(nodes.get("sync-from")), "Sync from eBay / tap again to cancel");
    assert.equal(nodes.get("sync-from").attrs["aria-label"], "Sync from eBay, tap again to cancel");
    assert.equal(nodes.get("sync-from").disabled, false, "it takes the tap that pauses it");
    assert.equal(nodes.get("sync-to").disabled, true, "the other locks from the tap");
    assert.equal(nodes.get("sync-to").classList.contains("busy"), false);
    await settle();
    assert.deepEqual(pc.posted, [], "nothing has left the phone yet");
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted, [{ action: "sync", direction: "from" }]);
    assert.equal(nodes.get("sync-status").textContent, "queued");
    assert.equal(buttonSays(nodes.get("sync-from")), "Sync from eBay / tap again to cancel");
    assert.equal(nodes.get("sync-to").disabled, true);
    nodes.get("sync-to").fire("click");
    await settle();
    assert.equal(pc.posted.length, 1, "nothing more while one runs");

    t.mock.timers.tick(3000);
    await settle();
    assert.equal(pc.calls.at(-1), "GET /jobs/a1");
    assert.equal(nodes.get("sync-status").textContent, "reading eBay's listings");
    assert.equal(nodes.get("sync-status").className, "sync-status busy");

    syncing = { ...syncing, state: "done", summary: "3 listings updated, 10 unchanged, 0 failed" };
    const before = pc.calls.length;
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("sync-status").textContent, "3 listings updated, 10 unchanged, 0 failed");
    assert.equal(nodes.get("sync-status").className, "sync-status ok");
    assert.equal(nodes.get("sync-from").disabled, false);
    assert.equal(nodes.get("sync-to").disabled, false);
    assert.equal(nodes.get("sync-from").classList.contains("busy"), false);
    assert.equal(buttonSays(nodes.get("sync-from")), "Sync from eBay");
    assert.deepEqual(pc.calls.slice(before), ["GET /jobs/a1", `GET /inventory?q=&${ALL}`], "the list asked again");
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(pc.calls.length, before + 2, "no more polls once it ended");

    // a sync the PC refuses says why, and the buttons open again
    pc.refuse.sync = "eBay is not connected: run crosslister ebay-login";
    nodes.get("sync-to").fire("click");
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted.at(-1), { action: "sync", direction: "to" });
    assert.equal(nodes.get("sync-status").textContent, "eBay is not connected: run crosslister ebay-login");
    assert.equal(nodes.get("sync-status").className, "sync-status bad");
    assert.equal(nodes.get("sync-to").disabled, false);
    assert.equal(buttonSays(nodes.get("sync-to")), "Sync to eBay");
});

test("the sync bar's pressed button, tapped: paused at once; continue carries on, reset drops it or tells the PC", async (t) => {
    // Michal, 2026-10-07: "show that it cancelled immediately, stop the loading button etc. The
    // cancel should change to 'reset call' (as in discard) and the button should change to
    // 'continue' ... Use these guidelines for all cancel things."
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = inventoryPc([summary("A1")], {}, { jobs: { a1: () => ({ state: "running", step: "writing to eBay" }) } });
    const { nodes } = await loadPage({ local: memoryStore(NO_PHOTOS), fetchImpl: pc.fetch });
    nodes.get("admin-toggle").fire("click");
    await settle();
    assert.equal(nodes.get("sync-reset").hidden, true, "no reset before a press");

    // within the second: held on the phone, then reset drops it, nothing sent
    nodes.get("sync-to").fire("click");
    t.mock.timers.tick(SEND_DELAY_MS - 1);
    await settle();
    nodes.get("sync-to").fire("click");
    await settle();
    assert.equal(nodes.get("sync-status").textContent, "paused");
    assert.equal(buttonSays(nodes.get("sync-to")), "continue");
    assert.equal(nodes.get("sync-to").classList.contains("busy"), false, "the ring stops");
    assert.equal(nodes.get("sync-to").attrs["aria-label"], "Sync to eBay, paused, continue");
    assert.equal(nodes.get("sync-to").disabled, false, "it takes the tap that continues");
    assert.equal(nodes.get("sync-from").disabled, true, "the other stays locked");
    assert.equal(nodes.get("sync-reset").hidden, false);
    t.mock.timers.tick(SEND_DELAY_MS * 3);
    await settle();
    assert.deepEqual(pc.posted, [], "held: nothing leaves the phone");
    nodes.get("sync-reset").fire("click");
    await settle();
    assert.equal(nodes.get("sync-status").textContent, "cancelled");
    assert.equal(nodes.get("sync-status").className, "sync-status bad");
    assert.equal(buttonSays(nodes.get("sync-to")), "Sync to eBay");
    assert.equal(nodes.get("sync-reset").hidden, true);
    assert.equal(nodes.get("sync-from").disabled, false, "both open again");
    assert.equal(nodes.get("sync-to").disabled, false);
    t.mock.timers.tick(SEND_DELAY_MS * 3);
    await settle();
    assert.deepEqual(pc.posted, [], "the dropped press never goes");

    // within the second again, then continue: it goes at once, the ring back
    nodes.get("sync-from").fire("click");
    t.mock.timers.tick(SEND_DELAY_MS / 2);
    await settle();
    nodes.get("sync-from").fire("click");
    await settle();
    assert.deepEqual(pc.posted, []);
    nodes.get("sync-from").fire("click");
    await settle();
    assert.deepEqual(pc.posted, [{ action: "sync", direction: "from" }], "no second wait");
    assert.equal(nodes.get("sync-status").textContent, "queued");
    assert.equal(buttonSays(nodes.get("sync-from")), "Sync from eBay / tap again to cancel");
    assert.equal(nodes.get("sync-from").classList.contains("busy"), true);
    assert.equal(nodes.get("sync-reset").hidden, true);
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("sync-status").textContent, "writing to eBay");

    // the PC's: paused, the polls stop; continue asks at once
    nodes.get("sync-from").fire("click");
    await settle();
    assert.equal(nodes.get("sync-status").textContent, "paused: the server may still be working on it");
    assert.equal(buttonSays(nodes.get("sync-from")), "continue");
    assert.equal(nodes.get("sync-reset").hidden, false);
    const asked = pc.calls.length;
    t.mock.timers.tick(3000 * 3);
    await settle();
    assert.equal(pc.calls.length, asked, "not asked about while paused");
    assert.ok(!pc.calls.some((c) => c.startsWith("DELETE")), "the server is not told");
    nodes.get("sync-from").fire("click");
    await settle();
    assert.equal(pc.calls.at(-1), "GET /jobs/a1");
    assert.equal(nodes.get("sync-status").textContent, "writing to eBay");
    assert.equal(buttonSays(nodes.get("sync-from")), "Sync from eBay / tap again to cancel");
    assert.equal(nodes.get("sync-from").classList.contains("busy"), true);

    // paused, then reset: DELETE /jobs/<id>, the bar free at once, the PC's word when it stops
    nodes.get("sync-from").fire("click");
    await settle();
    nodes.get("sync-reset").fire("click");
    await settle();
    assert.equal(pc.calls.at(-1), "DELETE /jobs/a1");
    assert.equal(nodes.get("sync-status").textContent, "cancelled");
    assert.equal(buttonSays(nodes.get("sync-from")), "Sync from eBay");
    assert.equal(nodes.get("sync-from").classList.contains("busy"), false);
    assert.equal(nodes.get("sync-reset").hidden, true);
    assert.equal(nodes.get("sync-from").disabled, false);
    assert.equal(nodes.get("sync-to").disabled, false);
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("sync-status").textContent, "cancelled from the phone");
    assert.equal(nodes.get("sync-status").className, "sync-status bad");
    const ended = pc.calls.length;
    t.mock.timers.tick(3000 * 2);
    await settle();
    assert.equal(pc.calls.length, ended, "no more polls once it stopped");
    assert.equal(pc.calls.filter((c) => c.startsWith("DELETE")).length, 1);
});

// --- a list row's price on its tile (Michal, 2026-10-07, 2026-10-08) ----------------------
// "On the inventory card on the right there should be a round + and a round − button.
// Pressing them increments through the price. Plus button in top right, minus button in
// bottom right of the little tile that represents an inventory item. When the price changes
// there should be our sync-to logo appearing on the ebay green button below. Pressing it
// would sync, and the button would revert to the 'ebay listed' or whatever it says now."
// Then: "Add thin white outline around the + − price buttons. This adjustment itself should
// be by 1 dollar. However we need to sense long press and speed up, for larger priced
// items, like dials on my oven for time setting."

/** A list row's + and − (the round two on its right, + on top), by the row's place in the list. */
function stepsOf(nodes, i) {
    const li = nodes.get("inventory-list").children[i];
    const [up, down] = li.children.find((c) => c.className === "inv-steps").children;
    return { up, down, last: li.children.at(-1).className };
}

/** A list row's eBay badge, as listed() finds the row's badges. */
function ebayBadge(nodes, i) {
    return listed(nodes)[i].links[0];
}

/** A press on a tile's + or −, as a finger makes it: the pointer down, later up. */
function press(btn) {
    btn.fire("pointerdown", { pointerId: 1 });
    return () => btn.fire("pointerup", { pointerId: 1 });
}

test("a row's + and −: a dollar a tap, whatever the grades; one PATCH each, the price from the server", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const draft = { status: "draft", id: "", url: "", listed_at: null };
    const none = { pricing: null, prices: { quick: null, market: null, high: null } };
    const d1 = { price: "1.50", statuses: { ebay: draft, craigslist: draft }, ...none };
    const pc = inventoryPc([summary("G1"), summary("D1", d1)], { G1: wholeRow("G1"), D1: wholeRow("D1", d1) });
    const local = memoryStore(NO_PHOTOS);
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch });
    nodes.get("admin-toggle").fire("click");
    await settle();
    const before = pc.calls.length;

    // on the right of the badges' column, + on top and − under it, 44 px round targets
    let g1 = stepsOf(nodes, 0);
    assert.equal(g1.last, "inv-steps", "the last thing on the row, at its right");
    assert.deepEqual([g1.up.textContent, g1.up.className, g1.up.attrs["aria-label"]], ["+", "inv-step", "price up"]);
    assert.deepEqual([g1.down.textContent, g1.down.attrs["aria-label"]], ["−", "price down"]);
    assert.deepEqual([g1.up.disabled, g1.down.disabled], [false, false]);
    assert.equal(listed(nodes)[0].line, "$24 G1");

    // G1 follows the fair price, and still + is a dollar: the grades are customize's slider's
    const lift = press(g1.up);
    assert.equal(listed(nodes)[0].line, "$25 G1", "the dollar at once, on the tile");
    await settle();
    assert.deepEqual(pc.calls.slice(before), [], "nothing sent while the finger is down");
    lift();
    assert.deepEqual([g1.up.disabled, g1.down.disabled], [true, true], "shut while the PATCH is on its way");
    await settle();
    assert.deepEqual(pc.calls.slice(before), ["PATCH /inventory/G1"]);
    assert.deepEqual(pc.patches, [{ price: "25.00" }]);
    assert.equal(listed(nodes)[0].line, "$25 G1", "the server's price on the tile");
    g1 = stepsOf(nodes, 0);
    assert.deepEqual([g1.up.disabled, g1.down.disabled], [false, false]);
    // the click a browser fires after the press is the press's own: nothing more
    g1.up.fire("click", { detail: 1 });
    await settle();
    assert.equal(pc.patches.length, 1);

    // the price moved on a listing up on eBay: its badge carries the sync-to icon, a button
    assert.equal(local.getItem("snap.inventory.unsynced"), '[{"sku":"G1","venues":["ebay"]}]');
    const badge = ebayBadge(nodes, 0);
    assert.equal(badge.tag, "button");
    assert.equal(badge.className, "vbadge posted vsync", "the same green bubble");
    assert.equal(badge.children[0].cloneOf, nodes.get("sync-to-icon"), "the sync bar's to-eBay icon, where the tick was");
    assert.equal(badge.children[0].id, "", "a copy, without the bar's id");
    assert.equal(wordOf(badge), "ebay");
    assert.ok(!badge.children.some((c) => c.tag === "svg"), "no tick while it is behind");
    assert.equal(badge.attrs["aria-label"], "ebay listed, sync to eBay");
    // its reset beside it, hidden until a tap pauses it; the other badges as ever
    assert.deepEqual(listed(nodes)[0].badges, [
        "ebay (vbadge posted vsync)",
        "reset (reset-call)",
        "craigslist draft (vbadge draft)",
    ]);
    assert.equal(listed(nodes)[0].links[1].hidden, true);

    // − from the keyboard (a click of its own, no press): a dollar down, sent at once
    stepsOf(nodes, 0).down.fire("click");
    await settle();
    assert.deepEqual(pc.patches.at(-1), { price: "24.00" });
    assert.equal(listed(nodes)[0].line, "$24 G1");

    // D1: from $1.50 down to $1, where − rests; a draft, so nothing falls behind
    press(stepsOf(nodes, 1).down)();
    await settle();
    assert.deepEqual(pc.patches.at(-1), { price: "1.00" });
    assert.equal(listed(nodes)[1].line, "$1 D1");
    assert.equal(stepsOf(nodes, 1).down.disabled, true, "never below $1");
    press(stepsOf(nodes, 1).up)();
    await settle();
    assert.deepEqual(pc.patches.at(-1), { price: "2.00" });
    assert.equal(local.getItem("snap.inventory.unsynced"), '[{"sku":"G1","venues":["ebay"]}]', "a draft has no listing to fall behind");

    // a change the server refuses: its words on the inventory's line, the price as it was
    pc.refusePatch = "price: the server is busy";
    const refused = press(stepsOf(nodes, 1).up);
    assert.equal(listed(nodes)[1].line, "$3 D1");
    refused();
    await settle();
    assert.equal(nodes.get("inventory-status").textContent, "D1: price: the server is busy");
    assert.equal(listed(nodes)[1].line, "$2 D1");
    assert.equal(stepsOf(nodes, 1).up.disabled, false);
    pc.refusePatch = "";

    // the listing opened shows the price the tiles left it at, read afresh
    listed(nodes)[0].open.fire("click");
    await settle();
    assert.equal(nodes.get("detail-heading").textContent, "Item G1 · $24");
    // and the list, back again, still knows it
    nodes.get("inventory-back").fire("click");
    await settle();
    assert.equal(listed(nodes)[0].line, "$24 G1");
    assert.equal(ebayBadge(nodes, 0).tag, "button", "still behind eBay");
});

test("a held + or − is an oven's dial: it repeats and speeds up, the tile live, one PATCH on release", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const draft = { status: "draft", id: "", url: "", listed_at: null };
    const h1 = { price: "250.00", statuses: { ebay: draft, craigslist: draft } };
    const pc = inventoryPc([summary("H1", h1)], { H1: wholeRow("H1", h1) });
    const { nodes } = await loadPage({ local: memoryStore(NO_PHOTOS), fetchImpl: pc.fetch });
    nodes.get("admin-toggle").fire("click");
    await settle();
    const price = () => listed(nodes)[0].line.split(" ")[0];

    // held: a dollar at once, then after 400 ms a dollar every 120 ms, the tile showing each
    const { up, down } = stepsOf(nodes, 0);
    const lift = press(up);
    assert.equal(price(), "$251");
    t.mock.timers.tick(399);
    assert.equal(price(), "$251", "not before 400 ms");
    t.mock.timers.tick(1);
    assert.equal(price(), "$252");
    t.mock.timers.tick(120);
    assert.equal(price(), "$253");
    await settle();
    assert.deepEqual(pc.patches, [], "nothing sent while held");
    assert.equal(up.disabled, false, "never shut under the finger");
    lift();
    await settle();
    assert.deepEqual(pc.patches, [{ price: "253.00" }], "one PATCH, the price it stopped at");
    t.mock.timers.tick(2000);
    await settle();
    assert.equal(price(), "$253", "the dial stopped with the finger");
    assert.equal(pc.patches.length, 1);

    // − held: 1 a step for 1.5 s, then 2, then 5 from 3 s; $253 to $150 in about five seconds
    down.fire("pointerdown", { pointerId: 2 });
    t.mock.timers.tick(400);
    let held = 400;
    while (Number(price().slice(1)) > 150 && held < 8000) {
        t.mock.timers.tick(120);
        held += 120;
    }
    assert.ok(held > 4000 && held < 5500, `$253 to $150 took ${held} ms`);
    // the finger slides off the button: the dial stops there, as lifting it would
    down.fire("pointerleave", { pointerId: 2 });
    down.fire("pointerup", { pointerId: 2 });
    await settle();
    assert.equal(pc.patches.length, 2, "one PATCH for the whole hold");
    assert.deepEqual(pc.patches[1], { price: `${price().slice(1)}.00` });

    // a touch: its long-press menu and selection held off; the pointer events that come with
    // it find the dial already turning, and the touch's end is the one release
    let prevented = 0;
    const touch = { preventDefault: () => (prevented += 1) };
    up.fire("touchstart", touch);
    up.fire("pointerdown", { pointerId: 3 });
    assert.equal(prevented, 1);
    const at = Number(price().slice(1));
    up.fire("touchend", touch);
    up.fire("pointerup", { pointerId: 3 });
    await settle();
    assert.equal(pc.patches.length, 3);
    assert.deepEqual(pc.patches[2], { price: `${at}.00` }, "one dollar for the one touch");
    const menu = { preventDefault: () => (prevented += 1) };
    up.fire("contextmenu", menu);
    assert.equal(prevented, 2, "no context menu on the buttons");

    // a finger lifted off the page altogether ends a dial too
    up.fire("pointerdown", { pointerId: 4 });
    globalThis.window.fire("pointerup", { pointerId: 4 });
    await settle();
    assert.equal(pc.patches.length, 4);

    // the outline and the press, in styles.css: a thin white ring (dark in the dark), no menu,
    // no selection, no scroll from under the finger
    const css = readFileSync(join(root, "styles.css"), "utf8");
    const step = /\.inv-step \{([^}]*)\}/.exec(css)[1];
    assert.match(step, /border: 1\.5px solid var\(--field\);/);
    for (const rule of ["user-select: none;", "-webkit-user-select: none;", "-webkit-touch-callout: none;", "touch-action: none;"]) {
        assert.ok(step.includes(rule), rule);
    }
});

test("a row's sync badge: pushes the row to its eBay listing as a job button; done, the plain listed badge again", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let pushing = { action: "push", state: "running", step: "revising the eBay listing" };
    const pc = inventoryPc([summary("G1")], { G1: wholeRow("G1") }, { jobs: { a1: () => pushing, a2: () => pushing } });
    // the price changed on this phone before (as 2.8.0 kept it, a bare sku): the badge offers the sync from the start
    const local = memoryStore({ ...NO_PHOTOS, "snap.inventory.unsynced": '["G1"]' });
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch });
    nodes.get("admin-toggle").fire("click");
    await settle();
    assert.equal(ebayBadge(nodes, 0).tag, "button");

    // the press: its ring and "tap again to cancel" at once, the push after the second
    ebayBadge(nodes, 0).fire("click");
    let badge = ebayBadge(nodes, 0);
    assert.equal(badge.classList.contains("busy"), true);
    assert.equal(buttonSays(badge), "ebay / tap again to cancel");
    assert.equal(badge.attrs["aria-label"], "ebay listed, sync to eBay, tap again to cancel");
    assert.deepEqual([stepsOf(nodes, 0).up.disabled, stepsOf(nodes, 0).down.disabled], [true, true], "no price change while it runs");
    await settle();
    assert.deepEqual(pc.posted, [], "nothing has left the phone yet");
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted, [{ action: "push", sku: "G1", venue: "ebay" }]);
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(pc.calls.at(-1), "GET /jobs/a1");
    assert.equal(buttonSays(ebayBadge(nodes, 0)), "ebay / tap again to cancel");
    assert.deepEqual([stepsOf(nodes, 0).up.disabled, stepsOf(nodes, 0).down.disabled], [true, true]);

    // a tap pauses it as any job button: continue, and the reset beside it; continue asks at once
    ebayBadge(nodes, 0).fire("click");
    await settle();
    badge = ebayBadge(nodes, 0);
    let reset = listed(nodes)[0].links[1];
    assert.equal(buttonSays(badge), "continue");
    assert.equal(badge.classList.contains("busy"), false);
    assert.equal(badge.attrs["aria-label"], "ebay, paused, continue");
    assert.deepEqual([reset.textContent, reset.className, reset.hidden], ["reset", "reset-call", false]);
    const asked = pc.calls.length;
    t.mock.timers.tick(3000 * 2);
    await settle();
    assert.equal(pc.calls.length, asked, "not asked about while paused");
    ebayBadge(nodes, 0).fire("click");
    await settle();
    assert.equal(pc.calls.at(-1), "GET /jobs/a1");
    assert.equal(buttonSays(ebayBadge(nodes, 0)), "ebay / tap again to cancel");
    assert.equal(listed(nodes)[0].links[1].hidden, true, "reset only while paused");

    // paused, then reset: the server is told, the badge is the sync badge again at once, still behind
    ebayBadge(nodes, 0).fire("click");
    await settle();
    listed(nodes)[0].links[1].fire("click");
    await settle();
    assert.equal(pc.calls.at(-1), "DELETE /jobs/a1");
    badge = ebayBadge(nodes, 0);
    assert.equal(badge.tag, "button");
    assert.equal(buttonSays(badge), "ebay");
    assert.equal(badge.classList.contains("busy"), false);
    assert.deepEqual([stepsOf(nodes, 0).up.disabled, stepsOf(nodes, 0).down.disabled], [false, false]);
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("inventory-status").textContent, "G1: cancelled from the phone");
    assert.deepEqual(JSON.parse(local.getItem("snap.inventory.unsynced") || '["G1"]'), ["G1"], "untouched: still behind");

    // pressed again and let run: done, the plain listed badge, a link again, its tick back
    ebayBadge(nodes, 0).fire("click");
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted.at(-1), { action: "push", sku: "G1", venue: "ebay" });
    pushing = { action: "push", state: "done", summary: "updated" };
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(pc.calls.at(-1), "GET /jobs/a2");
    badge = ebayBadge(nodes, 0);
    assert.equal(badge.tag, "a");
    assert.equal(badge.href, "https://www.ebay.com/itm/257780366045");
    assert.equal(badge.children[1].tag, "svg");
    assert.equal(nodes.get("inventory-status").textContent, "G1: updated");
    assert.equal(local.getItem("snap.inventory.unsynced"), "[]");
    assert.deepEqual([stepsOf(nodes, 0).up.disabled, stepsOf(nodes, 0).down.disabled], [false, false]);

    // a push the server refuses says why, and the badge stays the sync one
    pc.refuse.push = "eBay is not connected: run crosslister ebay-login";
    press(stepsOf(nodes, 0).up)();
    await settle();
    ebayBadge(nodes, 0).fire("click");
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.equal(nodes.get("inventory-status").textContent, "G1: eBay is not connected: run crosslister ebay-login");
    assert.equal(buttonSays(ebayBadge(nodes, 0)), "ebay");
});

test("a row's craigslist badge syncs too, once a change left its listing behind; done, only its mark goes", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let pushing = { action: "push", state: "running", step: "revising the craigslist post" };
    const up = { status: "listed", id: "7781", url: "https://chicago.craigslist.org/hsh/d/7781.html", listed_at: null };
    // the craigslist price derived from eBay's: a dollar on the tile moves both
    const c1 = { statuses: { ...summary("C1").statuses, craigslist: up } };
    const whole = wholeRow("C1", { ...c1, craigslist: { title: "", price: null, description: "", category: "" } });
    const pc = inventoryPc([summary("C1", c1)], { C1: whole }, { jobs: { a1: () => pushing } });
    const local = memoryStore(NO_PHOTOS);
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch });
    nodes.get("admin-toggle").fire("click");
    await settle();
    assert.deepEqual(listed(nodes)[0].badges, ["ebay listed (vbadge posted)", "craigslist listed (vbadge posted)"]);
    press(stepsOf(nodes, 0).up)();
    await settle();
    assert.equal(local.getItem("snap.inventory.unsynced"), '[{"sku":"C1","venues":["ebay","craigslist"]}]');
    // the eBay sync badge and its reset, then craigslist's
    const cl = () => listed(nodes)[0].links[2];
    assert.equal(cl().tag, "button");
    assert.equal(cl().attrs["aria-label"], "craigslist listed, sync to craigslist");
    cl().fire("click");
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted, [{ action: "push", sku: "C1", venue: "craigslist" }]);
    assert.equal(buttonSays(cl()), "craigslist / tap again to cancel");
    assert.equal(buttonSays(ebayBadge(nodes, 0)), "ebay", "the eBay one waits, not pressed");
    assert.equal(ebayBadge(nodes, 0).disabled, true, "one job per row");
    pushing = { action: "push", state: "done", summary: "updated" };
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("inventory-status").textContent, "C1: updated");
    assert.equal(local.getItem("snap.inventory.unsynced"), '[{"sku":"C1","venues":["ebay"]}]', "eBay's still behind");
    assert.equal(cl().tag, "a");
    assert.equal(ebayBadge(nodes, 0).tag, "button");
});

test("the sync bar's Sync to eBay, done, leaves no eBay listing behind its row", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let syncing = { action: "sync", direction: "to", state: "running", step: "writing to eBay" };
    const pc = inventoryPc([summary("G1")], { G1: wholeRow("G1") }, { jobs: { a1: () => syncing } });
    const local = memoryStore({ ...NO_PHOTOS, "snap.inventory.unsynced": '[{"sku":"G1","venues":["ebay"]},{"sku":"K9","venues":["ebay","craigslist"]}]' });
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch });
    nodes.get("admin-toggle").fire("click");
    await settle();
    assert.equal(ebayBadge(nodes, 0).tag, "button");
    nodes.get("sync-to").fire("click");
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    syncing = { ...syncing, state: "done", summary: "1 listing updated, 0 unchanged, 0 failed" };
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(local.getItem("snap.inventory.unsynced"), '[{"sku":"K9","venues":["craigslist"]}]', "craigslist's marks stay");
    assert.equal(pc.calls.at(-1), `GET /inventory?q=&${ALL}`, "the list asked again");
    assert.equal(ebayBadge(nodes, 0).tag, "a", "the plain listed badge, a link");
});

test("the search waits for him to stop typing; the chips and Show photos ask at once", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = inventoryPc([]);
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    nodes.get("admin-toggle").fire("click");
    await settle();
    assert.equal(nodes.get("inventory-status").textContent, "No listings match.");
    assert.deepEqual(nodes.get("inventory-list").children, []);

    nodes.get("inventory-search").value = "blue lamp ";
    nodes.get("inventory-search").fire("input");
    await settle();
    t.mock.timers.tick(399);
    await settle();
    assert.equal(pc.calls.length, 1, "not while typing");
    t.mock.timers.tick(1);
    await settle();
    assert.equal(pc.calls.at(-1), `GET /inventory?q=blue%20lamp&${ALL}`);

    nodes.get("inventory-venue-craigslist").fire("click");
    await settle();
    assert.equal(nodes.get("inventory-venue-craigslist").attrs["aria-pressed"], "true");
    assert.equal(nodes.get("inventory-venue-all").attrs["aria-pressed"], "false");
    assert.equal(pc.calls.at(-1), "GET /inventory?q=blue%20lamp&venue=craigslist&status=&limit=200&sort=age&order=desc");
    nodes.get("inventory-state-sold").fire("click");
    await settle();
    assert.equal(nodes.get("inventory-state-sold").attrs["aria-pressed"], "true");
    assert.equal(pc.calls.at(-1), "GET /inventory?q=blue%20lamp&venue=craigslist&status=sold&limit=200&sort=age&order=desc");
    nodes.get("inventory-venue-all").fire("click");
    nodes.get("inventory-state-all").fire("click");
    await settle();
    assert.equal(pc.calls.at(-1), "GET /inventory?q=blue%20lamp&venue=&status=&limit=200&sort=age&order=desc");
    const before = pc.calls.length;
    nodes.get("inventory-photos").checked = false;
    nodes.get("inventory-photos").fire("change");
    await settle();
    assert.deepEqual(pc.calls.slice(before), [`GET /inventory?q=blue%20lamp&${ALL}`]);
});

test("the inventory's Options: folded at first, the search out of it; open or folded is remembered on this phone", async (t) => {
    // Michal, 2026-10-08: "Inventory list options need to be all small, and also locked away
    // inside a foldout tab 'Options'."
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = inventoryPc([]);
    const local = memoryStore(NO_PHOTOS);
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch });
    nodes.get("admin-toggle").fire("click");
    await settle();
    assert.equal(nodes.get("inventory-search").hidden, false);
    assert.equal(nodes.get("options").hidden, true);
    assert.equal(nodes.get("options-toggle").textContent, "▸ Options");
    assert.equal(nodes.get("options-toggle").attrs["aria-expanded"], "false");
    nodes.get("options-toggle").fire("click");
    assert.equal(nodes.get("options").hidden, false);
    assert.equal(nodes.get("options-toggle").textContent, "▾ Options");
    assert.equal(nodes.get("options-toggle").attrs["aria-expanded"], "true");
    assert.equal(local.map.get("snap.inventory.options"), "open");
    // the chips inside ask as ever
    nodes.get("inventory-state-listed").fire("click");
    await settle();
    assert.equal(pc.calls.at(-1), "GET /inventory?q=&venue=&status=listed&limit=200&sort=age&order=desc");
    // a reload keeps it open; folded again, it stays folded
    const again = await loadPage({ local, fetchImpl: pc.fetch });
    assert.equal(again.nodes.get("options").hidden, false);
    assert.equal(again.nodes.get("options-toggle").textContent, "▾ Options");
    again.nodes.get("options-toggle").fire("click");
    assert.equal(again.nodes.get("options").hidden, true);
    assert.equal(local.map.get("snap.inventory.options"), "closed");
    const third = await loadPage({ local, fetchImpl: pc.fetch });
    assert.equal(third.nodes.get("options").hidden, true);

    // all small: 13 px chips 36 px tall, the search 36 px tall (its words 16 px, or a phone zooms in)
    const css = readFileSync(join(root, "styles.css"), "utf8");
    assert.match(css, /\.options \.chips \.chip \{ min-height: 36px; padding: 4px 2px; font-size: 13px; \}/);
    assert.match(css, /\.options \.pickup \{ min-height: 36px;[^}]*font-size: 13px; \}/);
    assert.match(css, /input\[type="text"\]\.small-input \{ min-height: 36px;[^}]*font-size: 16px;/);
});

test("Show photos, on by default, puts photo 1 of each row on its left, fetched one at a time", async (t) => {
    // Michal, 2026-10-07: "in inventory, let's keep photos showing by default"
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = inventoryPc(
        [summary("A1"), summary("NONE", { photos: 0 }), summary("B2")],
        { A1: wholeRow("A1"), B2: wholeRow("B2") }
    );
    const revoked = [];
    const local = memoryStore(GOOD);
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch });
    let made = 0;
    globalThis.URL.createObjectURL = () => `blob:${(made += 1)}`;
    globalThis.URL.revokeObjectURL = (url) => revoked.push(url);
    assert.equal(nodes.get("inventory-photos").checked, true, "ticked with nothing stored");
    nodes.get("admin-toggle").fire("click");
    await settle();
    assert.deepEqual(pc.calls, [`GET /inventory?q=&${ALL}`, "GET /inventory/A1/photos/1", "GET /inventory/B2/photos/1"]);
    const rows = listed(nodes);
    assert.equal(rows[0].thumb.children[0].tag, "img");
    assert.equal(rows[0].thumb.children[0].src, "blob:1");
    assert.equal(rows[1].thumb.textContent, "no photo");
    assert.equal(rows[2].thumb.children[0].src, "blob:2");
    // the list changing lets its pictures go; unticked is remembered on this phone
    nodes.get("inventory-photos").checked = false;
    nodes.get("inventory-photos").fire("change");
    await settle();
    assert.deepEqual(revoked, ["blob:1", "blob:2"]);
    assert.equal(listed(nodes)[0].thumb, undefined);
    assert.equal(local.map.get("snap.inventory.photos"), "off");
    const again = await loadPage({ local, fetchImpl: pc.fetch });
    assert.equal(again.nodes.get("inventory-photos").checked, false, "a reload keeps it unticked");
    again.nodes.get("inventory-photos").checked = true;
    again.nodes.get("inventory-photos").fire("change");
    assert.equal(local.map.get("snap.inventory.photos"), "on");
});

test("a PC that cannot be reached is said under the search box; the list stays", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = inventoryPc([summary("A1")]);
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    nodes.get("admin-toggle").fire("click");
    await settle();
    assert.equal(listed(nodes).length, 1);
    pc.down = true;
    nodes.get("inventory-state-listed").fire("click");
    await settle();
    assert.equal(nodes.get("inventory-status").textContent, "Could not read the inventory: cannot reach the server.");
    assert.equal(listed(nodes).length, 1, "nothing else changes");
    assert.equal(nodes.get("server").textContent, "server off");
});

test("a key the PC does not know: the inventory says so and Settings opens to put it right", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { nodes } = await loadPage({
        local: memoryStore(GOOD),
        fetchImpl: async () => new Response(JSON.stringify({ detail: "wrong" }), { status: 401 }),
    });
    nodes.get("admin-toggle").fire("click");
    assert.equal(nodes.get("settings").hidden, true, "the settings look right on the phone");
    await settle();
    assert.equal(nodes.get("inventory-status").textContent, "Could not read the inventory: wrong key - check Settings.");
    assert.equal(nodes.get("settings").hidden, false);
    assert.equal(nodes.get("pc-key").value, GOOD["snap.key"]);
});

test("a row tapped: the heading, the photo strip, then only the venue cards; full size and back", async (t) => {
    // Michal, 2026-10-06: "when I click on an item there should only be eBay or and Craigslist
    // card. I am not sure what card I am looking at when I just clicked with some additional
    // eBay foldout."
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = inventoryPc([summary("R5GM4XZN")], { R5GM4XZN: wholeRow("R5GM4XZN") });
    const local = memoryStore(NO_PHOTOS);
    const { nodes, win } = await loadPage({ local, fetchImpl: pc.fetch });
    const scrolled = [];
    win.scrollTo = (to) => scrolled.push(to.top);
    let made = 0;
    globalThis.URL.createObjectURL = () => `blob:${(made += 1)}`;
    nodes.get("admin-toggle").fire("click");
    await settle();
    // the Admin page: its title, Settings, the inventory's line, the sync bar and Close
    const page = ["admin-title", "settings-toggle", "inventory-toggle", "sync-bar", "admin-close"];
    assert.deepEqual(page.filter((id) => nodes.get(id).hidden), []);
    listed(nodes)[0].open.fire("click");
    // a page of its own (Michal, 2026-10-07: "when I am on a card I don't want to see admin or
    // settings above. Looking at an item is a new page (at the top it just says back to
    // inventory)"), at the top of the screen, remembered on this phone
    assert.deepEqual(page.filter((id) => !nodes.get(id).hidden), []);
    assert.equal(nodes.get("settings").hidden, true);
    assert.equal(nodes.get("inventory-back").hidden, false);
    assert.equal(nodes.get("admin").hidden, false);
    assert.equal(nodes.get("admin-toggle").hidden, false, "the header's Admin link stays");
    assert.deepEqual(scrolled, [0]);
    assert.equal(local.map.get("snap.admin.card"), "R5GM4XZN");
    // the summary at once, the whole row once the PC gives it
    assert.equal(nodes.get("inventory-browse").hidden, true);
    assert.equal(nodes.get("inventory-detail").hidden, false);
    assert.equal(nodes.get("detail-heading").textContent, "Item R5GM4XZN · $24");
    assert.equal(nodes.get("detail-status").textContent, "Reading R5GM4XZN from the server...");
    await settle();
    assert.deepEqual(pc.calls.slice(1), [
        "GET /inventory/R5GM4XZN",
        "GET /inventory/R5GM4XZN/photos/1",
        "GET /inventory/R5GM4XZN/photos/2",
    ]);
    assert.equal(nodes.get("detail-status").hidden, true);
    assert.ok(!nodes.has("detail-item") && !nodes.has("detail-photos-toggle"), "no Item foldout, no Photos foldout");

    // one foldout per venue, ebay then craigslist, both folded (Michal, 2026-10-07: "I want
    // the eBay and Craigslist section be folded in at first"), each toggle the list's badge
    // ("I want them to look like they did on the inventory list. Inside a green bubble if
    // listed"), a word and not a link, then the arrow
    const toggles = ["ebay", "craigslist"].map((v) => nodes.get(`detail-${v}-toggle`));
    assert.deepEqual(
        ["ebay", "craigslist"].map((v) => foldOf(nodes, v)),
        ["ebay listed (vbadge posted span) ▸", "craigslist draft (vbadge draft span) ▸"]
    );
    // listed: the venue, then the tick; "listed" for a screen reader only (Michal, 2026-10-08:
    // "write 'ebay' and follow that with a checkmark symbol")
    const [word, tick, hidden] = toggles[0].children[0].children;
    assert.equal(word, "ebay");
    assert.deepEqual([tick.tag, tick.attrs["aria-hidden"], tick.attrs.stroke, tick.attrs.width], ["svg", "true", "currentColor", "12"]);
    assert.deepEqual([hidden.className, hidden.textContent], ["sr-only", " listed"]);
    assert.deepEqual(toggles[1].children[0].children, ["craigslist draft"], "a draft: its word, no tick");
    // the posting screens stay out of sight under a listing as under the list (Michal,
    // 2026-10-08: "When I look at a card the posting screen is below. That should not be there")
    assert.deepEqual([nodes.get("work").hidden, nodes.get("book").hidden, nodes.get("modes").hidden], [true, true, true]);
    assert.deepEqual(toggles.map((n) => n.attrs["aria-expanded"]), ["false", "false"]);
    assert.equal(nodes.get("detail-ebay").hidden, true);
    assert.equal(nodes.get("detail-craigslist").hidden, true);
    assert.equal(nodes.get("detail-customize").hidden, false, "customize stays open");
    for (const toggle of toggles) toggle.fire("click");
    assert.deepEqual(
        ["ebay", "craigslist"].map((v) => foldOf(nodes, v)),
        ["ebay listed (vbadge posted span) ▾", "craigslist draft (vbadge draft span) ▾"]
    );
    assert.equal(nodes.get("detail-ebay").hidden, false);
    const ebay = cardOf(nodes, "ebay");
    assert.match(ebay.line, /^listed since 2026-10-0\d \d\d:\d\d$/);
    assert.equal(ebay.kind, "venue-status ok");
    assert.equal(ebay.link.tag, "a");
    assert.equal(ebay.link.href, "https://www.ebay.com/itm/257780366045");
    assert.equal(ebay.link.rel, "noopener noreferrer");
    assert.equal(ebay.link.target, "_blank");
    assert.deepEqual(ebay.facts, [
        "Title: Item R5GM4XZN",
        "Price: $24",
        "Condition: Used",
        "Category: Home > Lamps",
        "Quantity: 1",
        "Pickup only: no",
        "Description: A brass lamp.\nWorks.",
        "Condition note: Light wear on the base",
        "Aspects: Brand: Acme\nColor: Brass, Gold",
        "Package: 5 oz, 8 x 6 x 2 in",
        "Model cost: $0.1046",
    ]);
    const description = nodes.get("detail-ebay").children.find((c) => c.className === "facts").children[13];
    assert.equal(description.className, "pre", "kept as written, line breaks and all");
    assert.deepEqual(ebay.actions, ["Open listing (link)", "Refresh status", "End listing", "Edit"]);
    assert.equal(ebay.button("Open listing").href, "https://www.ebay.com/itm/257780366045");

    // craigslist: each field the override, or the eBay value it is derived from, said muted
    const craigslist = cardOf(nodes, "craigslist");
    assert.equal(craigslist.line, "draft");
    assert.equal(craigslist.link, undefined);
    assert.deepEqual(craigslist.facts, [
        "Title: Brass lamp, works",
        "Price: $24 (derived from eBay)",
        "Description: A brass lamp.\nWorks. (derived from eBay)",
        "Category: from the eBay category (derived from eBay)",
    ]);
    assert.deepEqual(craigslist.actions, ["Post on craigslist", "Edit"]);
    // Post is the posting screen's venue button, across the card (Michal, 2026-10-08: "Make the
    // same style button as when we post to venues originally"); the rest small pills
    assert.equal(craigslist.button("Post on craigslist").className, "big venue-btn");
    assert.equal(craigslist.button("Edit").className, "pill");
    assert.ok(ebay.button("Refresh status").className === "pill");
    toggles[1].fire("click");
    assert.equal(nodes.get("detail-craigslist").hidden, true);
    assert.equal(foldOf(nodes, "craigslist"), "craigslist draft (vbadge draft span) ▸");
    assert.equal(toggles[1].attrs["aria-expanded"], "false");

    // the photos: a strip right under the heading, 88 px tiles; a tap shows one full size
    const tiles = nodes.get("detail-photos").children[0].children.map((li) => li.children[0]);
    assert.equal(tiles.length, 2);
    assert.deepEqual(tiles.map((b) => b.children[0].src), ["blob:1", "blob:2"]);
    assert.equal(tiles[1].disabled, false);
    assert.equal(nodes.get("photo-view").hidden, true);
    tiles[1].fire("click");
    assert.equal(nodes.get("photo-view").hidden, false);
    assert.equal(nodes.get("photo-view-img").src, "blob:2");
    assert.equal(nodes.get("photo-view-img").alt, "R5GM4XZN-2.jpg");
    nodes.get("photo-view-close").fire("click");
    assert.equal(nodes.get("photo-view").hidden, true);
    // a tap anywhere on it closes it too
    tiles[0].fire("click");
    assert.equal(nodes.get("photo-view-img").src, "blob:1");
    nodes.get("photo-view").fire("click");
    assert.equal(nodes.get("photo-view").hidden, true);

    // back: the list as it was, no new query (nothing changed), the Admin page back, the
    // listing no longer remembered
    const asked = pc.calls.length;
    nodes.get("inventory-back").fire("click");
    assert.equal(nodes.get("inventory-detail").hidden, true);
    assert.equal(nodes.get("inventory-browse").hidden, false);
    assert.deepEqual(page.filter((id) => nodes.get(id).hidden), []);
    assert.equal(nodes.get("settings").hidden, true, "Settings folded, as it was");
    assert.equal(local.map.has("snap.admin.card"), false);
    assert.equal(listed(nodes).length, 1);
    await settle();
    assert.equal(pc.calls.length, asked);
});

test("Admin opens back onto the listing left open; Back lets it go and asks for the list", async (t) => {
    // Michal, 2026-10-07: "If I do press admin again and go to snap something, to sell. When I
    // press admin I want to land on this same page tho as if the open card was there all along"
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = inventoryPc([summary("R5"), summary("B2")], { R5: wholeRow("R5", { photos: [] }) });
    const local = memoryStore(NO_PHOTOS);
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch });
    nodes.get("admin-toggle").fire("click");
    await settle();
    listed(nodes)[0].open.fire("click");
    await settle();
    nodes.get("detail-ebay-toggle").fire("click");
    // the Admin link closes Admin, the goods screen is back; the listing stays remembered
    nodes.get("admin-toggle").fire("click");
    assert.equal(nodes.get("admin").hidden, true);
    assert.equal(nodes.get("modes").hidden, false);
    assert.equal(local.map.get("snap.admin.card"), "R5");

    pc.calls.length = 0;
    nodes.get("admin-toggle").fire("click");
    // straight onto it: its page, its sku until the PC answers, no foldout yet, no list asked
    assert.equal(nodes.get("inventory").hidden, false);
    assert.equal(nodes.get("inventory-detail").hidden, false);
    assert.equal(nodes.get("inventory-browse").hidden, true);
    assert.equal(nodes.get("inventory-toggle").hidden, true);
    assert.equal(nodes.get("settings-toggle").hidden, true);
    assert.equal(nodes.get("sync-bar").hidden, true);
    assert.equal(nodes.get("admin-close").hidden, true);
    assert.equal(nodes.get("detail-heading").textContent, "R5");
    assert.equal(nodes.get("detail-status").textContent, "Reading R5 from the server...");
    assert.equal(foldOf(nodes, "ebay"), "hidden");
    assert.equal(nodes.get("detail-customize-toggle").hidden, true);
    await settle();
    assert.deepEqual(pc.calls, ["GET /inventory/R5"]);
    assert.equal(nodes.get("detail-heading").textContent, "Item R5 · $24");
    assert.equal(nodes.get("detail-status").hidden, true);
    assert.deepEqual(
        ["ebay", "craigslist"].map((v) => foldOf(nodes, v)),
        ["ebay listed (vbadge posted span) ▸", "craigslist draft (vbadge draft span) ▸"],
        "folded again, as every listing opens"
    );
    assert.equal(nodes.get("detail-customize-toggle").hidden, false);
    assert.equal(nodes.get("detail-customize").hidden, false);

    // a reload: Admin closed as ever; opened, it lands on the listing again
    const again = await loadPage({ local, fetchImpl: pc.fetch });
    assert.equal(again.nodes.get("admin").hidden, true);
    pc.calls.length = 0;
    again.nodes.get("admin-toggle").fire("click");
    await settle();
    assert.deepEqual(pc.calls, ["GET /inventory/R5"]);
    assert.equal(again.nodes.get("detail-heading").textContent, "Item R5 · $24");

    // Back: the list behind it asked for, the Admin page back, nothing remembered
    again.nodes.get("inventory-back").fire("click");
    assert.equal(local.map.has("snap.admin.card"), false);
    assert.equal(again.nodes.get("inventory-browse").hidden, false);
    assert.equal(again.nodes.get("inventory-toggle").hidden, false);
    assert.equal(again.nodes.get("admin-close").hidden, false);
    await settle();
    assert.deepEqual(pc.calls.slice(1), [`GET /inventory?q=&${ALL}`]);
    assert.equal(listed(again.nodes).length, 2);
    again.nodes.get("admin-close").fire("click");
    again.nodes.get("admin-toggle").fire("click");
    await settle();
    assert.equal(again.nodes.get("inventory-detail").hidden, true, "the list, once let go");
});

test("a listing Admin reopens that the PC no longer has is let go; the list says so", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = inventoryPc([summary("A1")]);
    const local = memoryStore({ ...NO_PHOTOS, "snap.admin.card": "GONE" });
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch });
    nodes.get("admin-toggle").fire("click");
    await settle();
    assert.deepEqual(pc.calls, ["GET /inventory/GONE", `GET /inventory?q=&${ALL}`]);
    assert.equal(local.map.has("snap.admin.card"), false);
    assert.equal(nodes.get("inventory-detail").hidden, true);
    assert.equal(nodes.get("inventory-browse").hidden, false);
    assert.equal(nodes.get("inventory-toggle").hidden, false);
    assert.equal(nodes.get("inventory-status").textContent, "Could not read GONE: no row GONE. 1 listing");
    assert.equal(listed(nodes).length, 1);

    // a PC that does not answer is not a listing gone: it stays, saying so
    const down = memoryStore({ ...NO_PHOTOS, "snap.admin.card": "A1" });
    const again = await loadPage({ local: down, fetchImpl: pc.fetch });
    pc.down = true;
    again.nodes.get("admin-toggle").fire("click");
    await settle();
    assert.equal(again.nodes.get("inventory-detail").hidden, false);
    assert.equal(again.nodes.get("detail-status").textContent, "Could not read A1: cannot reach the server.");
    assert.equal(down.map.get("snap.admin.card"), "A1");
});

test("a venue the row is not on: an empty foldout whose Add puts it there; a row the PC lost says so", async (t) => {
    // Michal, 2026-10-06: "a foldout for a venue that is not active should be there. Empty.
    // With capacity to generate that card from there."
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const only = summary("EB1", { venues: ["ebay"], statuses: { ebay: { status: "draft", id: "", url: "", listed_at: null } } });
    const whole = wholeRow("EB1", {
        venues: ["ebay"],
        statuses: only.statuses,
        photos: [],
        craigslist: { title: "", price: null, description: "", category: "" },
    });
    const pc = inventoryPc([only, summary("GONE")], { EB1: whole });
    const { nodes } = await loadPage({ local: memoryStore(NO_PHOTOS), fetchImpl: pc.fetch });
    nodes.get("admin-toggle").fire("click");
    await settle();
    listed(nodes)[0].open.fire("click");
    await settle();
    assert.equal(nodes.get("detail-photos").children[0].textContent, "No photos.");
    assert.equal(foldOf(nodes, "ebay"), "ebay draft (vbadge draft span) ▸");
    nodes.get("detail-ebay-toggle").fire("click");
    assert.deepEqual(cardOf(nodes, "ebay").actions, ["Post on ebay", "Edit"]);
    assert.equal(cardOf(nodes, "ebay").line, "draft");
    // the empty one: there, folded, saying so
    const toggle = nodes.get("detail-craigslist-toggle");
    assert.equal(toggle.hidden, false);
    assert.equal(foldOf(nodes, "craigslist"), "craigslist not added (vbadge absent span) ▸");
    assert.equal(nodes.get("detail-craigslist").hidden, true);
    toggle.fire("click");
    assert.equal(nodes.get("detail-craigslist").hidden, false);
    let craigslist = cardOf(nodes, "craigslist");
    assert.equal(craigslist.line, "");
    assert.equal(craigslist.facts, null, "empty");
    assert.deepEqual(craigslist.actions, ["Add craigslist to this item"]);

    craigslist.button("Add craigslist to this item").fire("click");
    assert.equal(cardOf(nodes, "craigslist").line, "adding craigslist");
    assert.deepEqual(cardOf(nodes, "ebay").actions, ["Post on ebay (off)", "Edit (off)"], "the row waits");
    await settle();
    assert.equal(pc.calls.at(-1), "POST /inventory/EB1/venues/craigslist");
    assert.equal(foldOf(nodes, "craigslist"), "craigslist (vbadge draft span) ▾", "added, and open");
    craigslist = cardOf(nodes, "craigslist");
    assert.equal(craigslist.line, "not posted yet");
    assert.deepEqual(craigslist.facts, [
        "Title: Item EB1 (derived from eBay)",
        "Price: $24 (derived from eBay)",
        "Description: A brass lamp.\nWorks. (derived from eBay)",
        "Category: from the eBay category (derived from eBay)",
    ]);
    assert.deepEqual(craigslist.actions, ["Post on craigslist", "Edit"]);

    // the row changed: back asks for the list again
    nodes.get("inventory-back").fire("click");
    await settle();
    assert.equal(pc.calls.at(-1), `GET /inventory?q=&${ALL}`);
    listed(nodes)[1].open.fire("click");
    await settle();
    assert.equal(nodes.get("detail-status").hidden, false);
    assert.equal(nodes.get("detail-status").textContent, "Could not read GONE: no row GONE.");
    assert.equal(nodes.get("detail-heading").textContent, "Item GONE · $24", "the summary stays on screen");
});

test("Edit: the card's fields as inputs; Save sends one PATCH of only the changed fields", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = inventoryPc([summary("R5")], { R5: wholeRow("R5") });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    nodes.get("admin-toggle").fire("click");
    await settle();
    listed(nodes)[0].open.fire("click");
    await settle();

    cardOf(nodes, "ebay").button("Edit").fire("click");
    let ebay = cardOf(nodes, "ebay");
    assert.equal(ebay.facts, null, "the facts turned into inputs");
    assert.deepEqual(ebay.actions, ["Save", "Cancel"]);
    assert.equal(ebay.input("Title").value, "Item R5");
    assert.equal(ebay.input("Price, dollars").value, "24.00");
    assert.equal(ebay.input("Description").tag, "textarea");
    assert.equal(ebay.input("Description").value, "A brass lamp.\nWorks.");
    assert.equal(ebay.input("User note").value, "");
    assert.equal(ebay.input("Condition note").value, "Light wear on the base");
    // the quantity and pickup only are customize's (Michal, 2026-10-07): facts here, not inputs;
    // the note is the User note, as everywhere ("'note' by itself confuses me")
    assert.deepEqual(ebay.labels, ["Title", "Price, dollars", "Description", "User note", "Condition note"]);
    typeField(ebay.input("Title"), "Brass desk lamp ");
    typeField(ebay.input("User note"), "from the attic");
    ebay.button("Save").fire("click");
    assert.equal(cardOf(nodes, "ebay").line, "saving");
    assert.deepEqual(cardOf(nodes, "ebay").actions, ["Save (off)", "Cancel (off)"]);
    await settle();
    assert.deepEqual(pc.patches, [{ title: "Brass desk lamp", note: "from the attic" }]);
    assert.equal(pc.calls.at(-1), "PATCH /inventory/R5");
    ebay = cardOf(nodes, "ebay");
    assert.deepEqual(ebay.facts.slice(0, 6), [
        "Title: Brass desk lamp",
        "Price: $24",
        "Condition: Used",
        "Category: Home > Lamps",
        "Quantity: 1",
        "Pickup only: no",
    ]);
    assert.equal(nodes.get("detail-heading").textContent, "Brass desk lamp · $24");

    // nothing changed: nothing sent; Cancel puts the card back
    cardOf(nodes, "ebay").button("Edit").fire("click");
    cardOf(nodes, "ebay").button("Save").fire("click");
    await settle();
    assert.equal(pc.patches.length, 1);
    assert.notEqual(cardOf(nodes, "ebay").facts, null);
    cardOf(nodes, "ebay").button("Edit").fire("click");
    typeField(cardOf(nodes, "ebay").input("Title"), "Something else");
    cardOf(nodes, "ebay").button("Cancel").fire("click");
    assert.equal(cardOf(nodes, "ebay").facts[0], "Title: Brass desk lamp", "Cancel restores");
    assert.equal(pc.patches.length, 1);
    assert.equal(cardOf(nodes, "ebay").refused, "");

    // craigslist: its overrides, a blank one showing what it derives; "clear" empties one
    cardOf(nodes, "craigslist").button("Edit").fire("click");
    let craigslist = cardOf(nodes, "craigslist");
    assert.equal(craigslist.input("Title").value, "Brass lamp, works");
    assert.equal(craigslist.input("Price, dollars").value, "");
    assert.equal(craigslist.input("Price, dollars").placeholder, "24.00");
    assert.equal(craigslist.input("Description").placeholder, "A brass lamp.\nWorks.");
    assert.equal(craigslist.input("Category").placeholder, "from the eBay category");
    craigslist.clear("Title").fire("click");
    assert.equal(craigslist.input("Title").value, "");
    typeField(craigslist.input("Category"), "household items");
    craigslist.button("Save").fire("click");
    await settle();
    assert.deepEqual(pc.patches.at(-1), { craigslist: { title: "", category: "household items" } });
    assert.deepEqual(cardOf(nodes, "craigslist").facts, [
        "Title: Brass desk lamp (derived from eBay)",
        "Price: $24 (derived from eBay)",
        "Description: A brass lamp.\nWorks. (derived from eBay)",
        "Category: household items",
    ]);

    // a field the PC refuses: its words under Save, the inputs as typed
    pc.refusePatch = "price: not a price (e.g. 24.50)";
    cardOf(nodes, "craigslist").button("Edit").fire("click");
    typeField(cardOf(nodes, "craigslist").input("Price, dollars"), "cheap");
    cardOf(nodes, "craigslist").button("Save").fire("click");
    await settle();
    assert.deepEqual(pc.patches.at(-1), { craigslist: { price: "cheap" } });
    craigslist = cardOf(nodes, "craigslist");
    assert.equal(craigslist.refused, "price: not a price (e.g. 24.50)");
    assert.equal(craigslist.facts, null, "still editing");
    assert.equal(craigslist.input("Price, dollars").value, "cheap");
    assert.deepEqual(craigslist.actions, ["Save", "Cancel"]);
});

test("Post, Refresh and End: each sends its job, its step in the card's line, then the row read again", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let posting = { state: "running", step: "publishing on craigslist for R5" };
    let refreshing = { state: "running", step: "asking eBay" };
    let ending = { state: "running", step: "ending on eBay" };
    const whole = wholeRow("R5");
    const pc = inventoryPc([summary("R5")], { R5: whole }, {
        jobs: { j2: () => posting, a1: () => refreshing, a2: () => ending },
    });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    nodes.get("admin-toggle").fire("click");
    await settle();
    listed(nodes)[0].open.fire("click");
    await settle();

    // Post on craigslist: the row the PC saved, by its sku, after the second a job button
    // waits; its ring and "tap again to cancel" from the tap (Michal, 2026-10-07)
    cardOf(nodes, "craigslist").button("Post on craigslist").fire("click");
    assert.equal(cardOf(nodes, "craigslist").line, "sending");
    const pressedPost = ["Post on craigslist / tap again to cancel (busy)", "Edit (off)"];
    assert.deepEqual(cardOf(nodes, "craigslist").actions, pressedPost);
    // pressed, still the big venue button, its reset right after it (under it, styles.css)
    const box = nodes.get("detail-craigslist").children.find((c) => c.className === "venue-actions");
    assert.deepEqual(box.children.slice(0, 2).map((b) => b.className), ["big venue-btn", "reset-call"]);
    const css = readFileSync(join(root, "styles.css"), "utf8");
    assert.match(css, /\.venue-actions \.venue-btn \{ flex-basis: 100%; \}/);
    assert.match(css, /\.venue-actions \.venue-btn \+ \.reset-call \{ flex-basis: 100%;/);
    await settle();
    assert.deepEqual(pc.posted, [], "nothing has left the phone yet");
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted, [{ sku: "R5", venue: "craigslist" }]);
    assert.equal(cardOf(nodes, "craigslist").line, "queued, 1 ahead");
    // while it runs the row's fields stay read-only and the other actions wait
    assert.deepEqual(cardOf(nodes, "ebay").actions, [
        "Open listing (link)",
        "Refresh status (off)",
        "End listing (off)",
        "Edit (off)",
    ]);
    assert.deepEqual(cardOf(nodes, "craigslist").actions, pressedPost);
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(pc.calls.at(-1), "GET /jobs/j2");
    assert.equal(cardOf(nodes, "craigslist").line, "publishing on craigslist for R5");
    assert.equal(cardOf(nodes, "craigslist").kind, "venue-status busy");
    // publishing: nothing left to stop, the ring still turning; a tap only says it is too late
    assert.deepEqual(cardOf(nodes, "craigslist").actions, ["Post on craigslist (busy)", "Edit (off)"]);

    posting = { state: "done", step: "done", summary: "craigslist: listed", links: { craigslist: "https://sfbay.craigslist.org/1.html" } };
    whole.statuses = {
        ...whole.statuses,
        craigslist: { status: "listed", id: "1", url: "https://sfbay.craigslist.org/1.html", listed_at: "2026-10-06T10:00:00-05:00" },
    };
    let before = pc.calls.length;
    t.mock.timers.tick(3000);
    await settle();
    assert.deepEqual(pc.calls.slice(before), ["GET /jobs/j2", "GET /inventory/R5"]);
    let craigslist = cardOf(nodes, "craigslist");
    assert.equal(craigslist.line, "craigslist: listed");
    assert.equal(craigslist.kind, "venue-status ok");
    assert.equal(craigslist.link.href, "https://sfbay.craigslist.org/1.html");
    assert.deepEqual(craigslist.actions, ["Open listing (link)", "Refresh status", "End listing", "Edit"]);
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(pc.calls.length, before + 2, "no more polls once it ended");

    // Refresh status on ebay
    cardOf(nodes, "ebay").button("Refresh status").fire("click");
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted.at(-1), { action: "refresh", sku: "R5", venue: "ebay" });
    assert.deepEqual(cardOf(nodes, "ebay").actions, [
        "Open listing (link)",
        "Refresh status / tap again to cancel (busy)",
        "End listing (off)",
        "Edit (off)",
    ]);
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(cardOf(nodes, "ebay").line, "asking eBay");
    refreshing = { state: "done", summary: "ebay: still listed" };
    before = pc.calls.length;
    t.mock.timers.tick(3000);
    await settle();
    assert.deepEqual(pc.calls.slice(before), ["GET /jobs/a1", "GET /inventory/R5"]);
    assert.equal(cardOf(nodes, "ebay").line, "ebay: still listed");

    // End listing: a second tap, inline; Keep it sends nothing
    const posted = pc.posted.length;
    cardOf(nodes, "ebay").button("End listing").fire("click");
    assert.deepEqual(cardOf(nodes, "ebay").actions, ["End this listing on ebay? (ask)", "Yes, end it", "Keep it"]);
    await settle();
    assert.equal(pc.posted.length, posted, "nothing sent on the first tap");
    cardOf(nodes, "ebay").button("Keep it").fire("click");
    assert.deepEqual(cardOf(nodes, "ebay").actions, ["Open listing (link)", "Refresh status", "End listing", "Edit"]);
    await settle();
    assert.equal(pc.posted.length, posted);
    cardOf(nodes, "ebay").button("End listing").fire("click");
    cardOf(nodes, "ebay").button("Yes, end it").fire("click");
    // the pressed one is End listing again, its ring turning
    assert.deepEqual(cardOf(nodes, "ebay").actions, [
        "Open listing (link)",
        "Refresh status (off)",
        "End listing / tap again to cancel (busy)",
        "Edit (off)",
    ]);
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted.at(-1), { action: "end", sku: "R5", venue: "ebay" });
    assert.equal(cardOf(nodes, "ebay").line, "queued");
    ending = { state: "done", summary: "ebay: ended" };
    whole.statuses = { ...whole.statuses, ebay: { ...whole.statuses.ebay, status: "ended" } };
    t.mock.timers.tick(3000);
    await settle();
    const ebay = cardOf(nodes, "ebay");
    assert.equal(ebay.line, "ebay: ended");
    assert.deepEqual(ebay.actions, ["Post on ebay", "Edit"], "ended: it can go up again");
});

test("an End the PC refuses says why, and its button goes", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const whole = wholeRow("R5", {
        statuses: {
            ...summary("R5").statuses,
            craigslist: { status: "listed", id: "1", url: "https://sfbay.craigslist.org/1.html", listed_at: null },
        },
    });
    const pc = inventoryPc([summary("R5")], { R5: whole });
    pc.refuse.end = "craigslist cannot be ended from here: delete it on craigslist.org";
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    nodes.get("admin-toggle").fire("click");
    await settle();
    listed(nodes)[0].open.fire("click");
    await settle();
    cardOf(nodes, "craigslist").button("End listing").fire("click");
    assert.deepEqual(cardOf(nodes, "craigslist").actions, ["End this listing on craigslist? (ask)", "Yes, end it", "Keep it"]);
    cardOf(nodes, "craigslist").button("Yes, end it").fire("click");
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted, [{ action: "end", sku: "R5", venue: "craigslist" }]);
    const craigslist = cardOf(nodes, "craigslist");
    assert.equal(craigslist.line, "craigslist cannot be ended from here: delete it on craigslist.org");
    assert.equal(craigslist.kind, "venue-status bad");
    assert.deepEqual(craigslist.actions, ["Open listing (link)", "Refresh status", "Edit"]);
    // the other venue's End stays
    assert.deepEqual(cardOf(nodes, "ebay").actions, ["Open listing (link)", "Refresh status", "End listing", "Edit"]);
});

test("the craigslist card: an Edit leaves its listing behind, Sync to craigslist pushes it; End as eBay's", async (t) => {
    // Michal, 2026-10-08: craigslist price and edits from the card; the server side is built
    // alongside, and one that still refuses a craigslist push answers 400
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let pushing = { action: "push", state: "running", step: "revising the craigslist post" };
    let ending = { action: "end", state: "running", step: "deleting the craigslist post" };
    const whole = wholeRow("R5", {
        statuses: {
            ...summary("R5").statuses,
            craigslist: { status: "listed", id: "1", url: "https://sfbay.craigslist.org/1.html", listed_at: null },
        },
    });
    const pc = inventoryPc([summary("R5")], { R5: whole }, { jobs: { a1: () => pushing, a2: () => ending } });
    const local = memoryStore(GOOD);
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch });
    nodes.get("admin-toggle").fire("click");
    await settle();
    listed(nodes)[0].open.fire("click");
    await settle();
    const listedActions = ["Open listing (link)", "Refresh status", "End listing", "Edit"];
    assert.deepEqual(cardOf(nodes, "craigslist").actions, listedActions, "caught up: no sync");

    // its price typed on the card: saved to the row, and the listing is behind it
    cardOf(nodes, "craigslist").button("Edit").fire("click");
    typeField(cardOf(nodes, "craigslist").input("Price, dollars"), "30");
    cardOf(nodes, "craigslist").button("Save").fire("click");
    await settle();
    assert.deepEqual(pc.patches, [{ craigslist: { price: "30" } }]);
    assert.equal(local.getItem("snap.inventory.unsynced"), '[{"sku":"R5","venues":["craigslist"]}]');
    assert.deepEqual(cardOf(nodes, "craigslist").actions, [
        "Open listing (link)",
        "Sync to craigslist",
        "Refresh status",
        "End listing",
        "Edit",
    ]);
    assert.equal(cardOf(nodes, "craigslist").button("Sync to craigslist").className, "pill");
    assert.deepEqual(cardOf(nodes, "ebay").actions, listedActions, "eBay's price did not move");

    // a server that still refuses a craigslist push: its words, the sync still offered
    pc.refuse.push = "push goes to ebay only";
    cardOf(nodes, "craigslist").button("Sync to craigslist").fire("click");
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted, [{ action: "push", sku: "R5", venue: "craigslist" }]);
    assert.equal(cardOf(nodes, "craigslist").line, "push goes to ebay only");
    assert.equal(cardOf(nodes, "craigslist").kind, "venue-status bad");
    assert.ok(cardOf(nodes, "craigslist").actions.includes("Sync to craigslist"));
    delete pc.refuse.push;

    // a job button as any: its ring and "tap again to cancel", after the second the push
    cardOf(nodes, "craigslist").button("Sync to craigslist").fire("click");
    assert.deepEqual(cardOf(nodes, "craigslist").actions, [
        "Open listing (link)",
        "Sync to craigslist / tap again to cancel (busy)",
        "Refresh status (off)",
        "End listing (off)",
        "Edit (off)",
    ]);
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted.at(-1), { action: "push", sku: "R5", venue: "craigslist" });
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(cardOf(nodes, "craigslist").line, "revising the craigslist post");
    pushing = { ...pushing, state: "done", summary: "updated" };
    const before = pc.calls.length;
    t.mock.timers.tick(3000);
    await settle();
    assert.deepEqual(pc.calls.slice(before), ["GET /jobs/a1", "GET /inventory/R5"], "done: the row read again");
    assert.equal(cardOf(nodes, "craigslist").line, "updated");
    assert.equal(local.getItem("snap.inventory.unsynced"), "[]");
    assert.deepEqual(cardOf(nodes, "craigslist").actions, listedActions);

    // End listing on craigslist: two taps, then {"action": "end", "sku", "venue": "craigslist"}
    cardOf(nodes, "craigslist").button("End listing").fire("click");
    assert.deepEqual(cardOf(nodes, "craigslist").actions, ["End this listing on craigslist? (ask)", "Yes, end it", "Keep it"]);
    cardOf(nodes, "craigslist").button("Yes, end it").fire("click");
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted.at(-1), { action: "end", sku: "R5", venue: "craigslist" });
    ending = { ...ending, state: "done", summary: "craigslist: ended" };
    whole.statuses = { ...whole.statuses, craigslist: { ...whole.statuses.craigslist, status: "ended" } };
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(cardOf(nodes, "craigslist").line, "craigslist: ended");
    assert.deepEqual(cardOf(nodes, "craigslist").actions, ["Post on craigslist", "Edit"]);
});

test("a listing's job buttons tapped: paused at once, continue or reset beside; too late once publishing", async (t) => {
    // Michal, 2026-10-07: "The cancel should change to 'reset call' (as in discard) and the
    // button should change to 'continue' ... Use these guidelines for all cancel things."
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = inventoryPc([summary("R5")], { R5: wholeRow("R5") }, {
        jobs: {
            a1: () => ({ state: "running", step: "asking eBay" }),
            a2: () => ({ state: "queued" }),
            j2: () => ({ state: "running", step: "publishing on craigslist for R5" }),
        },
    });
    const { nodes } = await loadPage({ local: memoryStore(NO_PHOTOS), fetchImpl: pc.fetch });
    await openFirst(nodes);
    await settle();

    // Post, tapped within its second: held, continue and reset beside it; reset drops it
    cardOf(nodes, "craigslist").button("Post on craigslist").fire("click");
    t.mock.timers.tick(SEND_DELAY_MS - 1);
    await settle();
    cardOf(nodes, "craigslist").button("Post on craigslist").fire("click");
    await settle();
    assert.equal(cardOf(nodes, "craigslist").line, "paused");
    assert.deepEqual(cardOf(nodes, "craigslist").actions, ["continue", "reset", "Edit (off)"]);
    t.mock.timers.tick(SEND_DELAY_MS * 3);
    await settle();
    assert.deepEqual(pc.posted, [], "held: nothing leaves the phone");
    cardOf(nodes, "craigslist").button("reset").fire("click");
    await settle();
    assert.equal(cardOf(nodes, "craigslist").line, "cancelled");
    assert.equal(cardOf(nodes, "craigslist").kind, "venue-status bad");
    assert.deepEqual(cardOf(nodes, "craigslist").actions, ["Post on craigslist", "Edit"]);
    t.mock.timers.tick(SEND_DELAY_MS * 3);
    await settle();
    assert.deepEqual(pc.posted, [], "the dropped press never goes");

    // Refresh status, the PC's: paused, its polls stop; continue asks at once
    cardOf(nodes, "ebay").button("Refresh status").fire("click");
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted, [{ action: "refresh", sku: "R5", venue: "ebay" }]);
    cardOf(nodes, "ebay").button("Refresh status").fire("click");
    await settle();
    assert.equal(cardOf(nodes, "ebay").line, "paused: the server may still be working on it");
    assert.deepEqual(cardOf(nodes, "ebay").actions, [
        "Open listing (link)",
        "continue",
        "reset",
        "End listing (off)",
        "Edit (off)",
    ]);
    const asked = pc.calls.length;
    t.mock.timers.tick(3000 * 2);
    await settle();
    assert.equal(pc.calls.length, asked, "not asked about while paused");
    cardOf(nodes, "ebay").button("continue").fire("click");
    await settle();
    assert.equal(pc.calls.at(-1), "GET /jobs/a1");
    assert.equal(cardOf(nodes, "ebay").line, "asking eBay");
    assert.deepEqual(cardOf(nodes, "ebay").actions, [
        "Open listing (link)",
        "Refresh status / tap again to cancel (busy)",
        "End listing (off)",
        "Edit (off)",
    ]);

    // paused again, then reset: DELETE /jobs/<id>, the card free at once, the PC's word when it stops
    cardOf(nodes, "ebay").button("Refresh status").fire("click");
    await settle();
    cardOf(nodes, "ebay").button("reset").fire("click");
    await settle();
    assert.equal(pc.calls.at(-1), "DELETE /jobs/a1");
    assert.equal(cardOf(nodes, "ebay").line, "cancelled");
    assert.deepEqual(cardOf(nodes, "ebay").actions, ["Open listing (link)", "Refresh status", "End listing", "Edit"]);
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(cardOf(nodes, "ebay").line, "cancelled from the phone");
    assert.deepEqual(cardOf(nodes, "ebay").actions, ["Open listing (link)", "Refresh status", "End listing", "Edit"]);

    // Sync to eBay, paused while its push is queued, then reset: the PC drops it at once
    nodes.get("detail-customize-sync").fire("click");
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted.at(-1), { action: "push", sku: "R5", venue: "ebay" });
    assert.deepEqual(customizeOf(nodes).buttons, ["Save (off)", "Sync to eBay / tap again to cancel (busy)"]);
    assert.equal(nodes.get("detail-customize-reset").hidden, true);
    nodes.get("detail-customize-sync").fire("click");
    await settle();
    assert.deepEqual(customizeOf(nodes).buttons, ["Save (off)", "continue"]);
    assert.equal(customizeOf(nodes).line, "paused: the server may still be working on it");
    assert.equal(nodes.get("detail-customize-reset").hidden, false);
    nodes.get("detail-customize-reset").fire("click");
    await settle();
    assert.equal(pc.calls.at(-1), "DELETE /jobs/a2");
    assert.equal(customizeOf(nodes).line, "cancelled");
    assert.deepEqual(customizeOf(nodes).buttons, ["Save (off)", "Sync to eBay"]);
    assert.equal(nodes.get("detail-customize-reset").hidden, true);
    const dropped = pc.calls.length;
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(pc.calls.length, dropped, "no more polls for a job the server dropped");

    // Post, once the PC publishes it: a tap is too late, said for a moment; nothing else changes
    cardOf(nodes, "craigslist").button("Post on craigslist").fire("click");
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(cardOf(nodes, "craigslist").line, "publishing on craigslist for R5");
    assert.deepEqual(cardOf(nodes, "craigslist").actions, ["Post on craigslist (busy)", "Edit (off)"]);
    cardOf(nodes, "craigslist").button("Post on craigslist").fire("click");
    await settle();
    assert.equal(cardOf(nodes, "craigslist").line, "too late to cancel: it is publishing");
    assert.deepEqual(cardOf(nodes, "craigslist").actions, ["Post on craigslist (busy)", "Edit (off)"], "still busy");
    t.mock.timers.tick(TOO_LATE_MS);
    await settle();
    assert.equal(cardOf(nodes, "craigslist").line, "publishing on craigslist for R5");
    assert.ok(!pc.calls.includes("DELETE /jobs/j2"), "the server is not told");
});

/**
 * A listing's customize as the screen shows it: its boxes and slider (locked: all of
 * them, none, or "mixed"), the grade's bold word, the words with their prices, the line
 * under the slider, its buttons, its status line.
 */
function customizeOf(nodes) {
    const status = nodes.get("detail-customize-status");
    const inputs = ["detail-quantity", "detail-pickup-only", "detail-pricing"].map((id) => nodes.get(id).disabled === true);
    return {
        open: `${nodes.get("detail-customize-toggle").textContent} ${nodes.get("detail-customize").hidden ? "hidden" : "shown"}`,
        quantity: nodes.get("detail-quantity").value,
        pickup: nodes.get("detail-pickup-only").checked === true,
        locked: inputs.every(Boolean) ? true : inputs.some(Boolean) ? "mixed" : false,
        slider: nodes.get("detail-pricing").value,
        grade: [1, 2, 3].filter((g) => nodes.get(`detail-pricing-${g}`).classList.contains("on")),
        words: [1, 2, 3].map((g) => nodes.get(`detail-pricing-${g}`).textContent),
        note: nodes.get("detail-pricing-note").textContent,
        // the stub does not read index.html's words, so a button the page has not painted is
        // named here; Sync to eBay, a job button, as cardOf says a card's
        buttons: [
            ["save", "Save"],
            ["sync", "Sync to eBay"],
        ].map(([id, word]) => {
            const b = nodes.get(`detail-customize-${id}`);
            const busy = b.classList.contains("busy") ? " (busy)" : "";
            return `${b.children.length ? buttonSays(b) : word}${busy}${b.disabled ? " (off)" : ""}`;
        }),
        line: status.textContent,
        kind: status.className,
    };
}

/** Tick or untick customize's pickup only, as a thumb does. */
function tickPickup(nodes, on) {
    const box = nodes.get("detail-pickup-only");
    box.checked = on;
    box.fire("change");
}

/** Move customize's Price slider to a grade, as a thumb does. */
function slide(nodes, grade) {
    const slider = nodes.get("detail-pricing");
    slider.value = String(grade);
    slider.fire("input");
}

/** Open the first listing of the inventory, and wait for the whole row. */
async function openFirst(nodes) {
    nodes.get("admin-toggle").fire("click");
    await settle();
    listed(nodes)[0].open.fire("click");
}

const CACHED_WORDS = ["Quick sale $18", "Fair price $24", "Higher end $31.50"];

test("a listing's customize: the goods card, live, first and open; Save sends only what changed", async (t) => {
    // Michal, 2026-10-07: "I want the menu in the inventory to look like the customize menu.
    // Saying post without confirmation is useless. We will indeed be changing price with a
    // slider here. Or quantity etc. or pickup / no pickup."
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = inventoryPc([summary("R5")], { R5: wholeRow("R5") });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    await openFirst(nodes);
    // the summary from the list already carries the grade and the cached prices
    assert.equal(customizeOf(nodes).slider, "2");
    assert.equal(nodes.get("detail-customize-toggle").attrs["aria-expanded"], "true");
    await settle();
    let custom = customizeOf(nodes);
    assert.deepEqual(custom, {
        open: "▾ customize shown",
        quantity: "1",
        pickup: false,
        locked: false,
        slider: "2",
        grade: [2],
        words: CACHED_WORDS,
        note: "a fair price, a longer wait",
        buttons: ["Save (off)", "Sync to eBay"],
        line: "",
        kind: "venue-status",
    });
    assert.equal(nodes.get("detail-pricing").attrs["aria-valuetext"], "Fair price $24");
    assert.equal(nodes.has("detail-auto-post"), false, "post without asking is gone");

    // folds and opens like the cards
    nodes.get("detail-customize-toggle").fire("click");
    assert.equal(customizeOf(nodes).open, "▸ customize hidden");
    nodes.get("detail-customize-toggle").fire("click");
    assert.equal(customizeOf(nodes).open, "▾ customize shown");

    // a quantity that is not one: said at once, as the goods card does, and nothing can go
    typeField(nodes.get("detail-quantity"), "two");
    custom = customizeOf(nodes);
    assert.equal(custom.line, "Quantity must be a whole number, 1 or more");
    assert.equal(custom.kind, "venue-status bad");
    assert.deepEqual(custom.buttons, ["Save (off)", "Sync to eBay (off)"]);

    // the quantity and pickup only changed: one PATCH with only them, the row as the PC answers it
    typeField(nodes.get("detail-quantity"), "3");
    tickPickup(nodes, true);
    assert.deepEqual(customizeOf(nodes).buttons, ["Save", "Sync to eBay"]);
    nodes.get("detail-customize-save").fire("click");
    custom = customizeOf(nodes);
    assert.equal(custom.line, "saving");
    assert.equal(custom.locked, true);
    assert.deepEqual(custom.buttons, ["Save (off)", "Sync to eBay (off)"]);
    assert.deepEqual(cardOf(nodes, "ebay").actions, ["Open listing (link)", "Refresh status (off)", "End listing (off)", "Edit (off)"]);
    await settle();
    assert.deepEqual(pc.patches, [{ quantity: 3, pickup_only: true }], "no pricing: the slider was not moved");
    assert.equal(pc.calls.at(-1), "PATCH /inventory/R5");
    assert.deepEqual(pc.posted, [], "no job");
    custom = customizeOf(nodes);
    assert.equal(custom.line, "saved; Sync to eBay puts it on the listing");
    assert.equal(custom.kind, "venue-status ok");
    assert.deepEqual([custom.quantity, custom.pickup, custom.locked, custom.slider], ["3", true, false, "2"]);
    assert.deepEqual(custom.buttons, ["Save (off)", "Sync to eBay"], "nothing left to save");
    // the eBay card says it as a fact; its Edit no longer holds them
    assert.deepEqual(cardOf(nodes, "ebay").facts.slice(4, 6), ["Quantity: 3", "Pickup only: yes, no shipping on eBay"]);

    // pickup only alone: only it is sent
    tickPickup(nodes, false);
    assert.equal(customizeOf(nodes).line, "", "what Save said gives way to the change");
    nodes.get("detail-customize-save").fire("click");
    await settle();
    assert.deepEqual(pc.patches.at(-1), { pickup_only: false });

    // a field the PC refuses: its words in the line, the box as typed
    pc.refusePatch = "quantity: more than eBay allows";
    typeField(nodes.get("detail-quantity"), "5000");
    nodes.get("detail-customize-save").fire("click");
    await settle();
    assert.deepEqual(pc.patches.at(-1), { quantity: 5000 });
    custom = customizeOf(nodes);
    assert.equal(custom.line, "quantity: more than eBay allows");
    assert.equal(custom.kind, "venue-status bad");
    assert.equal(custom.quantity, "5000");
    assert.deepEqual(custom.buttons, ["Save", "Sync to eBay"]);
});

test("the Price slider: moved and saved, the price is the grade's cached one; a grade with none is refused", async (t) => {
    // Michal, 2026-10-07: "definitely 3 prices should be cached in first call so that if I
    // change the slider, the price can be updated"
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const whole = wholeRow("R5");
    const pc = inventoryPc([summary("R5")], { R5: whole });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    await openFirst(nodes);
    await settle();
    assert.equal(nodes.get("detail-heading").textContent, "Item R5 · $24");

    // moved: the word and the goods card's line follow it, and Save opens
    slide(nodes, 3);
    let custom = customizeOf(nodes);
    assert.deepEqual([custom.slider, custom.grade, custom.note], ["3", [3], "a higher-end price; cheaper ones exist out there"]);
    assert.deepEqual(custom.buttons, ["Save", "Sync to eBay"]);
    assert.equal(nodes.get("detail-pricing").attrs["aria-valuetext"], "Higher end $31.50");
    // moved back: nothing to save
    slide(nodes, 2);
    assert.deepEqual(customizeOf(nodes).buttons, ["Save (off)", "Sync to eBay"]);

    // Save: one PATCH with the grade, no job; the heading and the eBay card show the new price at once
    slide(nodes, 3);
    nodes.get("detail-customize-save").fire("click");
    assert.equal(customizeOf(nodes).locked, true, "the slider too waits");
    await settle();
    assert.deepEqual(pc.patches, [{ pricing: 3 }]);
    assert.deepEqual(pc.posted, [], "no model call, no job");
    custom = customizeOf(nodes);
    assert.deepEqual([custom.slider, custom.grade, custom.words, custom.locked], ["3", [3], CACHED_WORDS, false]);
    assert.equal(custom.line, "saved; Sync to eBay puts it on the listing");
    assert.deepEqual(custom.buttons, ["Save (off)", "Sync to eBay"]);
    assert.equal(nodes.get("detail-heading").textContent, "Item R5 · $31.50");
    assert.equal(cardOf(nodes, "ebay").facts[1], "Price: $31.50");

    // a grade the row has no cached price for: the PC's words, the slider where he put it
    whole.prices = { ...whole.prices, quick: null };
    nodes.get("inventory-back").fire("click");
    await settle();
    listed(nodes)[0].open.fire("click");
    await settle();
    assert.deepEqual(customizeOf(nodes).words, ["Quick sale —", "Fair price $24", "Higher end $31.50"]);
    slide(nodes, 1);
    nodes.get("detail-customize-save").fire("click");
    await settle();
    assert.deepEqual(pc.patches.at(-1), { pricing: 1 });
    custom = customizeOf(nodes);
    assert.equal(custom.line, "no cached quick price for this row: set the price by hand");
    assert.equal(custom.kind, "venue-status bad");
    assert.deepEqual([custom.slider, custom.grade], ["1", [1]]);
    assert.deepEqual(custom.buttons, ["Save", "Sync to eBay"]);
    assert.equal(nodes.get("detail-heading").textContent, "Item R5 · $31.50", "the price as it was");
});

test("a re-read row moves the slider only when it holds no move of his", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let refreshing = { action: "refresh", state: "running", step: "reading eBay" };
    const whole = wholeRow("R5");
    const pc = inventoryPc([summary("R5")], { R5: whole }, { jobs: { a1: () => refreshing, a2: () => refreshing } });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    await openFirst(nodes);
    await settle();

    // moved and not saved; a refresh reads the row again with another quantity and grade
    slide(nodes, 3);
    cardOf(nodes, "ebay").button("Refresh status").fire("click");
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.equal(customizeOf(nodes).locked, true, "one job per row");
    refreshing = { action: "refresh", state: "done", summary: "ebay: listed" };
    Object.assign(whole, { quantity: 4, pricing: 1, price: "18.00" });
    t.mock.timers.tick(3000);
    await settle();
    let custom = customizeOf(nodes);
    assert.deepEqual([custom.quantity, custom.slider, custom.grade], ["4", "3", [3]], "the box follows, his move stays");
    assert.deepEqual(custom.buttons, ["Save", "Sync to eBay"]);

    // moved back to where the row stood: the next re-read moves it with the row
    slide(nodes, 1);
    assert.deepEqual(customizeOf(nodes).buttons, ["Save (off)", "Sync to eBay"]);
    refreshing = { action: "refresh", state: "running", step: "reading eBay" };
    cardOf(nodes, "ebay").button("Refresh status").fire("click");
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    refreshing = { action: "refresh", state: "done", summary: "ebay: listed" };
    Object.assign(whole, { pricing: 2, price: "24.00" });
    t.mock.timers.tick(3000);
    await settle();
    custom = customizeOf(nodes);
    assert.deepEqual([custom.slider, custom.grade, custom.note], ["2", [2], "a fair price, a longer wait"]);
    assert.deepEqual(custom.buttons, ["Save (off)", "Sync to eBay"]);
});

test("Sync to eBay: the slider moved and pickup only ticked, saved in one PATCH, then pushed and polled", async (t) => {
    // Michal, 2026-10-07: "I can there click pickup only and sync to eBay, and that detail of
    // that listing should update."
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let pushing = { action: "push", state: "running", step: "revising the eBay listing" };
    let again = { action: "push", state: "running", step: "revising the eBay listing" };
    const whole = wholeRow("R5");
    const pc = inventoryPc([summary("R5")], { R5: whole }, { jobs: { a1: () => pushing, a2: () => again } });
    const local = memoryStore(NO_PHOTOS);
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch });
    await openFirst(nodes);
    await settle();

    // moved and ticked, not saved: Sync to eBay saves both first, then sends the push, which
    // puts the row's price (the PATCH already set it) on the listing
    slide(nodes, 1);
    tickPickup(nodes, true);
    const from = pc.calls.length;
    nodes.get("detail-customize-sync").fire("click");
    // the second a job button waits, its ring and "tap again to cancel" from the tap
    assert.equal(customizeOf(nodes).line, "sending");
    assert.deepEqual(customizeOf(nodes).buttons, ["Save (off)", "Sync to eBay / tap again to cancel (busy)"]);
    await settle();
    assert.deepEqual(pc.calls.slice(from), [], "nothing has left the phone yet");
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.calls.slice(from), ["PATCH /inventory/R5", "POST /jobs"], "saved, then pushed");
    assert.deepEqual(pc.patches, [{ pickup_only: true, pricing: 1 }]);
    assert.deepEqual(pc.posted, [{ action: "push", sku: "R5", venue: "ebay" }]);
    assert.equal(whole.price, "18.00", "the server set the cached quick price before the push");
    // the listing is behind its row until the push is done: its list badge would offer the sync
    assert.equal(local.getItem("snap.inventory.unsynced"), '[{"sku":"R5","venues":["ebay"]}]');
    let custom = customizeOf(nodes);
    assert.equal(custom.line, "queued");
    assert.equal(custom.locked, true);
    assert.deepEqual(custom.buttons, ["Save (off)", "Sync to eBay / tap again to cancel (busy)"]);
    assert.equal(nodes.get("detail-heading").textContent, "Item R5 · $18");
    // one job per row: the cards wait too
    assert.deepEqual(cardOf(nodes, "craigslist").actions, ["Post on craigslist (off)", "Edit (off)"]);
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(pc.calls.at(-1), "GET /jobs/a1");
    assert.equal(customizeOf(nodes).line, "revising the eBay listing");
    assert.equal(customizeOf(nodes).kind, "venue-status busy");

    // done: "updated", and the row read again (the heading and the eBay card with it)
    pushing = { action: "push", state: "done", step: "done", summary: "updated" };
    whole.title = "Brass lamp, pickup only";
    whole.statuses = { ...whole.statuses, ebay: { ...whole.statuses.ebay, listed_at: "2026-10-07T09:30:00-05:00" } };
    const before = pc.calls.length;
    t.mock.timers.tick(3000);
    await settle();
    assert.deepEqual(pc.calls.slice(before), ["GET /jobs/a1", "GET /inventory/R5"]);
    custom = customizeOf(nodes);
    assert.equal(custom.line, "updated");
    assert.equal(custom.kind, "venue-status ok");
    assert.equal(local.getItem("snap.inventory.unsynced"), "[]", "eBay has the price now");
    assert.deepEqual([custom.pickup, custom.slider, custom.grade, custom.locked], [true, "1", [1], false]);
    assert.deepEqual(custom.buttons, ["Save (off)", "Sync to eBay"]);
    assert.equal(nodes.get("detail-heading").textContent, "Brass lamp, pickup only · $18");
    const ebay = cardOf(nodes, "ebay");
    assert.match(ebay.line, /^listed since 2026-10-07 \d\d:\d\d$/);
    assert.equal(ebay.facts[5], "Pickup only: yes, no shipping on eBay");
    assert.deepEqual(ebay.actions, ["Open listing (link)", "Refresh status", "End listing", "Edit"]);
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(pc.calls.length, before + 2, "no more polls once it ended");

    // nothing changed: Sync to eBay only pushes, and "unchanged" says so
    nodes.get("detail-customize-sync").fire("click");
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.equal(pc.patches.length, 1);
    assert.deepEqual(pc.posted.at(-1), { action: "push", sku: "R5", venue: "ebay" });
    again = { action: "push", state: "done", summary: "unchanged" };
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(customizeOf(nodes).line, "unchanged");

    // a refused Save sends no push
    whole.prices = { ...whole.prices, high: null };
    slide(nodes, 3);
    const posted = pc.posted.length;
    nodes.get("detail-customize-sync").fire("click");
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.patches.at(-1), { pricing: 3 });
    assert.equal(pc.posted.length, posted, "no push after a refusal");
    assert.equal(customizeOf(nodes).line, "no cached high price for this row: set the price by hand");
    assert.deepEqual(customizeOf(nodes).buttons, ["Save", "Sync to eBay"], "the ring stops with the refusal");

    // the row changed: back asks for the list again
    nodes.get("inventory-back").fire("click");
    await settle();
    assert.equal(pc.calls.at(-1), `GET /inventory?q=&${ALL}`);
});

test("Sync to eBay waits for a listing on eBay; no cached prices keeps the slider out of Save; a push refused says why", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const draft = { status: "draft", id: "", url: "", listed_at: null };
    const none = { pricing: null, prices: { quick: null, market: null, high: null } };
    const d1 = summary("D1", { statuses: { ebay: draft, craigslist: draft }, ...none });
    const l1 = summary("L1", { pricing: 3 });
    const pc = inventoryPc([d1, l1], {
        D1: wholeRow("D1", { statuses: d1.statuses, ...none, posting: { pricing: null, auto_post: null, job: null } }),
        L1: wholeRow("L1", { pricing: 3, posting: { pricing: 3, auto_post: false, job: "j4" } }),
    });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    await openFirst(nodes);
    await settle();
    // a row priced by no grade, nothing cached: at 1, nothing bold, a dash for each price
    let custom = customizeOf(nodes);
    assert.deepEqual([custom.slider, custom.grade, custom.note], ["1", [], "not priced by grade yet"]);
    assert.deepEqual(custom.words, ["Quick sale —", "Fair price —", "Higher end —"]);
    assert.deepEqual(custom.buttons, ["Save (off)", "Sync to eBay (off)"]);
    assert.equal(custom.line, "Sync to eBay opens once the listing is up on eBay");
    // moved: the line says there is nothing to set, and Save stays shut
    slide(nodes, 2);
    custom = customizeOf(nodes);
    assert.deepEqual([custom.slider, custom.grade], ["2", [2]]);
    assert.equal(custom.note, "no cached prices on this listing; set the price by hand");
    assert.deepEqual(custom.buttons, ["Save (off)", "Sync to eBay (off)"]);
    // Save still works on a draft for the boxes, without the grade: the next post carries it
    typeField(nodes.get("detail-quantity"), "2");
    assert.deepEqual(customizeOf(nodes).buttons, ["Save", "Sync to eBay (off)"]);
    nodes.get("detail-customize-save").fire("click");
    await settle();
    assert.deepEqual(pc.patches, [{ quantity: 2 }]);
    custom = customizeOf(nodes);
    assert.equal(custom.line, "saved");
    assert.deepEqual([custom.slider, custom.note], ["2", "no cached prices on this listing; set the price by hand"]);
    nodes.get("detail-customize-sync").fire("click");
    await settle();
    assert.deepEqual(pc.posted, [], "a draft is never pushed");

    // a listing at the higher end; a push the PC refuses
    nodes.get("inventory-back").fire("click");
    await settle();
    listed(nodes)[1].open.fire("click");
    await settle();
    custom = customizeOf(nodes);
    assert.deepEqual([custom.slider, custom.grade, custom.words], ["3", [3], CACHED_WORDS]);
    assert.deepEqual([custom.quantity, custom.pickup], ["1", false], "the foldout is this row's, not the last one's");
    pc.refuse.push = "eBay would not revise L1: the listing has ended";
    nodes.get("detail-customize-sync").fire("click");
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted, [{ action: "push", sku: "L1", venue: "ebay" }]);
    custom = customizeOf(nodes);
    assert.equal(custom.line, "eBay would not revise L1: the listing has ended");
    assert.equal(custom.kind, "venue-status bad");
    assert.deepEqual(custom.buttons, ["Save (off)", "Sync to eBay"]);
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
    assert.match(nodes.get("venue-hint").textContent, /did not reach the server - tap/);
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
    assert.match(nodes.get("message").textContent, /no longer on the server/);
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
        // Michal, 2026-10-06: the price grade slider and post without asking
        "book-pricing",
        "book-pricing-1",
        "book-pricing-2",
        "book-pricing-3",
        "book-pricing-note",
        "book-auto-post",
        // Michal, 2026-10-07: the eBay comparisons toggle, off by default, in both customize cards
        "book-comps",
        "book-title-line",
        "book-price-line",
        "book-ebay-btn",
        "book-ebay-reset",
        "book-ebay-status",
        "book-ebay-link",
        "book-venue-hint",
        "book-done-hint",
        "book-next-item",
        "book-next-note",
    ]);
    // the camera button is called what it reads (Michal, 2026-09-28: "Let's call scan
    // 'ISBN' since that is what it is"); under it, small, No ISBN opens the typed fields
    assert.match(book[1], /<label id="book-scan-label" class="big snap"[^>]*aria-label="ISBN: [^"]*">[\s\S]*?<span>ISBN<\/span><\/label>/);
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
    // Michal, 2026-10-07: "Call it 'User Note' everywhere. It is not something that posts.
    // And 'note' by itself confuses me." The book's Flaws and the goods' Notes for this item are
    // both that one note; the ids stay
    const label = (status) => new RegExp(`<span class="field-label">\\s*User note\\s*<span id="${status}" class="note-status"></span>`);
    assert.match(book[1], label("book-note-status"));
    assert.match(html, label("note-status"));
    assert.ok(!/Flaws|Notes for this item/.test(html), "no other name for it on the screen");
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
    assert.equal(nodes.get("book-price").value, "11", "the server's suggestion");
    assert.equal(nodes.get("book-price-note").textContent, "eBay: 12 listings, $6–$24 · suggested $11");
    assert.equal(nodes.get("book-price-note").hidden, false);
    assert.equal(local.getItem("snap.book"), null, "nothing on the server yet, nothing to read back");

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
    assert.equal(nodes.get("book-progress").textContent, "1 photo, all on the server");
    assert.equal(nodes.get("strip").children.length, 0, "the goods strip is not touched");
    const saved = JSON.parse(local.getItem("snap.book"));
    assert.equal(saved.isbn, ISBN);
    assert.equal(saved.itemId, item);
    assert.equal(local.getItem("snap.item"), null, "the goods item is its own");

    // the spine, say
    fire(nodes, "book-snap-input");
    await settle();
    assert.equal(pc.calls.at(-1), `PUT /items/${item}/photos/2`);
    assert.equal(nodes.get("book-progress").textContent, "2 photos, all on the server");

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
    assert.equal(buttonSays(nodes.get("book-ebay-btn")), "ebay / tap again to cancel");
    assert.equal(nodes.get("book-ebay-btn").attrs["aria-label"], "ebay, posting, tap again to cancel");
    // ... while the press is on its way NEXT waits for it: clearing now would lose it
    assert.equal(nodes.get("book-next-item").disabled, true);
    assert.equal(nodes.get("book-done-hint").textContent, "NEXT waits until the listing has reached the server");
    await settle();
    assert.equal(buttonSays(nodes.get("book-ebay-btn")), "ebay / tap again to cancel", "for the second and after");
    assert.equal(nodes.get("book-ebay-btn").disabled, false, "it takes the tap that pauses it");
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
    assert.equal(nodes.get("book-price-line").textContent, "$11", "the server said no price yet: the box's");
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
    assert.equal(nodes.get("book-match").textContent, "9780804429573 is not in the catalogues", "the server's words");
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
        "Scan the ISBN, or tap No ISBN and type the title, so the photos can go to the server; or remove them with their x";
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
    assert.equal(bookShot(nodes, 0).li.children[0].src, "blob:stub", "the cover, fetched back from the server");
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
        "No ISBN: type the title as the cover has it. The server finds the book and a price."
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
    assert.equal(nodes.get("book-price").value, "40", "the server's suggestion");
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
    const waiting = "Type the title so the photos can go to the server, or remove them with their x";
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
    assert.equal(nodes.get("book-match").textContent, detail, "the server's reason, in the small line");
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
        // Michal, 2026-10-06: the price grade under the pickup row, three steps, 1 by default
        assert.match(
            html,
            new RegExp(`<input id="${prefix}pricing" class="pricing" type="range" min="1" max="3" step="1" value="1"`)
        );
        assert.match(
            html,
            new RegExp(
                `<span id="${prefix}pricing-1" class="on">Quick sale</span>\\s*<span id="${prefix}pricing-2">Fair price</span>\\s*<span id="${prefix}pricing-3">Higher end</span>`
            )
        );
        assert.match(html, new RegExp(`id="${prefix}pricing-note" class="pricing-note">sell what we have this week<`));
        // ... then post without asking, ticked: what the PC did until now
        assert.match(
            html,
            new RegExp(
                `<input id="${prefix}auto-post" type="checkbox" checked>\\s*<span>Post without asking<small>unticked: the server saves the draft and the button posts it on the next press</small></span>`
            )
        );
        assert.ok(html.indexOf(`id="${prefix}pickup-only"`) < html.indexOf(`id="${prefix}pricing"`));
        assert.ok(html.indexOf(`id="${prefix}auto-post"`) < html.indexOf(`id="${next}"`));
    }
    const css = readFileSync(join(root, "styles.css"), "utf8");
    assert.match(css, /input\[type="range"\]\.pricing \{[^}]*height: 44px;[^}]*accent-color: var\(--signal\);/);
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

// --- customize: the price grade and post without asking (Michal, 2026-10-06) ---------
// "a slider for price preference (3 grade) 1 (quicksell what we have) 2 (fair price
// longer wait time) 3 (higher end price - probably cheaper options exist in the
// marketplace) ... 1 by default." and "a checkbox for post without asking - which is
// our default now."

/** The slider and its words, as the screen shows them. */
function pricingShown(nodes, prefix = "") {
    return {
        value: nodes.get(`${prefix}pricing`).value,
        bold: [1, 2, 3].filter((g) => nodes.get(`${prefix}pricing-${g}`).classList.contains("on")),
        note: nodes.get(`${prefix}pricing-note`).textContent,
        said: nodes.get(`${prefix}pricing`).attrs["aria-valuetext"],
    };
}

test("customize, goods: fair price and post without asking off; saved, not posted; the next press posts by sku; NEXT resets", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let ebayPosted = false;
    const local = memoryStore(GOOD);
    const pc = fakePc({
        jobs: {
            j1: () => ({
                state: "done",
                sku: "B-0060",
                price: "14.00",
                title: "Brass Lamp",
                links: ebayPosted ? { ebay: "https://www.ebay.com/itm/60" } : {},
            }),
            j2: () => ({ state: "running", step: "drafting the listing", sku: "B-0060" }),
        },
    });
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch });
    const item = `Lamp ${TODAY}`;
    await typeName(nodes, "Lamp");
    snap(nodes, 1);
    await settle();
    card(nodes, 0).ai.fire("click");
    nodes.get("customize-toggle").fire("click");

    // 1 by default, post without asking ticked
    assert.deepEqual(pricingShown(nodes), {
        value: "1",
        bold: [1],
        note: "sell what we have this week",
        said: "Quick sale",
    });
    assert.equal(nodes.get("auto-post").checked, true);

    nodes.get("pricing").value = "2";
    nodes.get("pricing").fire("input");
    assert.deepEqual(pricingShown(nodes), {
        value: "2",
        bold: [2],
        note: "a fair price, a longer wait",
        said: "Fair price",
    });
    assert.equal(nodes.get("ebay-status").textContent, "fair price");
    assert.equal(nodes.get("craigslist-status").textContent, "fair price", "the grade goes with both");
    nodes.get("auto-post").checked = false;
    nodes.get("auto-post").fire("change");
    assert.equal(nodes.get("ebay-status").textContent, "fair price · saved, not posted");
    assert.deepEqual(JSON.parse(local.getItem("snap.item")).customize, {
        quantity: "1",
        pickupOnly: false,
        pricing: 2,
        autoPost: false,
    });

    nodes.get("ebay-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS); // the second a press waits
    await settle();
    assert.deepEqual(pc.posted, [{ item, venue: "ebay", ai: [1], pricing: 2, auto_post: false }]);
    // fixed while the job is on its way, as the quantity box is
    assert.equal(nodes.get("pricing").disabled, true);
    assert.equal(nodes.get("auto-post").disabled, true);

    // done with no link: the row is saved, not posted, and the button opens again
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("ebay-status").textContent, "saved, not posted");
    assert.equal(nodes.get("ebay-status").className, "venue-status ok");
    assert.equal(nodes.get("ebay-link").hidden, true);
    assert.equal(nodes.get("ebay-btn").disabled, false);
    assert.equal(nodes.get("ebay-btn").textContent, "ebay");
    assert.equal(nodes.get("ebay-btn").classList.contains("posted"), false, "not green: nothing is up");
    assert.equal(nodes.get("ebay-btn").attrs["aria-label"], "ebay, saved, not posted");
    assert.equal(nodes.get("price-line").textContent, "$14");
    assert.equal(nodes.get("pricing").disabled, false);

    // the next press posts the saved row by its sku: no second model call
    ebayPosted = true;
    nodes.get("ebay-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted[1], { sku: "B-0060", venue: "ebay", pricing: 2 });
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("ebay-link").href, "https://www.ebay.com/itm/60");
    assert.equal(nodes.get("ebay-btn").disabled, true);
    assert.equal(nodes.get("ebay-btn").classList.contains("posted"), true);

    // craigslist, with the box still unticked, is saved first too
    nodes.get("craigslist-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted[2], { sku: "B-0060", venue: "craigslist", pricing: 2, auto_post: false });

    // NEXT: a quick sale, posted without asking, folded
    nodes.get("next-item").fire("click");
    await settle();
    assert.equal(nodes.get("customize").hidden, true);
    assert.deepEqual(pricingShown(nodes), {
        value: "1",
        bold: [1],
        note: "sell what we have this week",
        said: "Quick sale",
    });
    assert.equal(nodes.get("auto-post").checked, true);
    assert.equal(nodes.get("auto-post").disabled, false);
    assert.equal(nodes.get("ebay-status").hidden, true);
});

test("customize, goods: the slider alone sends pricing, and Higher end says so under both buttons", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = fakePc({ jobs: { j1: () => ({ state: "running", step: "drafting the listing" }) } });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    await typeName(nodes, "Lamp");
    snap(nodes, 1);
    await settle();
    card(nodes, 0).ai.fire("click");
    nodes.get("customize-toggle").fire("click");
    nodes.get("pricing").value = "3";
    nodes.get("pricing").fire("input");
    assert.deepEqual(pricingShown(nodes).bold, [3]);
    assert.equal(nodes.get("pricing-note").textContent, "a higher-end price; cheaper ones exist out there");
    assert.equal(nodes.get("craigslist-status").textContent, "higher end");
    nodes.get("ebay-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.equal(JSON.stringify(pc.posted[0]), `{"item":"Lamp ${TODAY}","venue":"ebay","ai":[1],"pricing":3}`);
    assert.equal(nodes.get("ebay-status").textContent, "queued, 1 ahead");
});

test("customize, book: higher end, saved, not posted, then posted by sku with no book", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let posted = false;
    const local = memoryStore(GOOD);
    const pc = fakePc({
        books: { [ISBN]: BOOK },
        jobs: {
            j1: () => ({
                state: "done",
                sku: "B-0070",
                price: "11.00",
                links: posted ? { ebay: "https://www.ebay.com/itm/70" } : {},
            }),
        },
    });
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch, barcodes: [ISBN] });
    const item = `Book ${ISBN} ${TODAY}`;
    nodes.get("mode-book").fire("click");
    fire(nodes, "book-scan-input");
    await settle();
    fire(nodes, "book-snap-input");
    await settle();
    nodes.get("book-customize-toggle").fire("click");
    assert.deepEqual(pricingShown(nodes, "book-").bold, [1]);
    nodes.get("book-pricing").value = "3";
    nodes.get("book-pricing").fire("input");
    nodes.get("book-auto-post").checked = false;
    nodes.get("book-auto-post").fire("change");
    assert.equal(nodes.get("book-ebay-status").textContent, "higher end · saved, not posted");
    assert.equal(pricingShown(nodes).value, "1", "the goods slider is its own");
    assert.deepEqual(JSON.parse(local.getItem("snap.book")).customize, {
        quantity: "1",
        pickupOnly: false,
        pricing: 3,
        autoPost: false,
    });

    nodes.get("book-ebay-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted, [
        {
            item,
            venue: "ebay",
            book: { ...NO_TYPING, isbn: ISBN, condition: "good", price: "11", main: 1 },
            pricing: 3,
            auto_post: false,
        },
    ]);
    assert.equal(nodes.get("book-pricing").disabled, true);
    assert.equal(nodes.get("book-auto-post").disabled, true);

    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("book-ebay-status").textContent, "saved, not posted");
    assert.equal(nodes.get("book-ebay-btn").disabled, false);

    // the press after it posts the saved row: the sku only, no book, no second save
    posted = true;
    nodes.get("book-ebay-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted[1], { sku: "B-0070", venue: "ebay", pricing: 3 });
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("book-ebay-link").href, "https://www.ebay.com/itm/70");
    assert.equal(nodes.get("book-ebay-btn").disabled, true);
});

test("a reload brings the price grade and post without asking back, and a row saved, not posted", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const item = `Chairs ${TODAY}`;
    const local = memoryStore({
        ...GOOD,
        "snap.item": JSON.stringify({
            itemName: "Chairs",
            itemId: item,
            ai: [1],
            customize: { quantity: "1", pickupOnly: false, pricing: 2, autoPost: false },
        }),
    });
    const pc = fakePc({
        items: {
            [item]: {
                photos: new Map([[1, "a"]]),
                note: "",
                sku: "B-0080",
                jobs: [{ job: "j9", venue: "ebay", state: "done", sku: "B-0080", price: "30.00", links: {} }],
            },
        },
        jobs: { j1: () => ({ state: "running", step: "publishing on eBay", sku: "B-0080" }) },
    });
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch });
    assert.equal(nodes.get("customize").hidden, true, "folded: the open state is not kept");
    assert.deepEqual(pricingShown(nodes), {
        value: "2",
        bold: [2],
        note: "a fair price, a longer wait",
        said: "Fair price",
    });
    assert.equal(nodes.get("auto-post").checked, false);
    assert.equal(nodes.get("ebay-status").textContent, "saved, not posted");
    assert.equal(nodes.get("craigslist-status").textContent, "fair price · saved, not posted");
    assert.equal(nodes.get("ebay-btn").disabled, false);
    nodes.get("ebay-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted, [{ sku: "B-0080", venue: "ebay", pricing: 2 }]);
    assert.equal(nodes.get("ebay-status").textContent, "queued, 1 ahead");
});

// --- customize: the eBay comparisons (Michal, 2026-10-07) --------------------------------
// "Let's abandon checking eBay for similar items (call 1) and put that toggle default off,
// in customization."

test("customize, goods: Compare with eBay listings, off by default; ticked, comps: true goes and is said; NEXT unticks it", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const local = memoryStore(GOOD);
    const pc = fakePc({ jobs: { j1: () => ({ state: "running", step: "drafting the listing", sku: "B-0090" }) } });
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch });
    const item = `Lamp ${TODAY}`;
    // after post without asking, its small print saying what it costs
    assert.match(
        html,
        /<input id="auto-post"[^>]*>[\s\S]*?<\/label>\s*(<!--[\s\S]*?-->\s*)?<label class="pickup">\s*<input id="comps" type="checkbox">\s*<span>Compare with eBay listings<small>sends eBay's similar listings to the AI for the first draft; slower, a little dearer<\/small><\/span>/
    );
    await typeName(nodes, "Lamp");
    snap(nodes, 1);
    await settle();
    card(nodes, 0).ai.fire("click");
    nodes.get("customize-toggle").fire("click");
    assert.equal(nodes.get("comps").checked, false);
    assert.equal(nodes.get("ebay-status").textContent, "", "left alone: nothing said");

    nodes.get("comps").checked = true;
    nodes.get("comps").fire("change");
    assert.equal(nodes.get("ebay-status").textContent, "with eBay comparisons");
    assert.equal(nodes.get("craigslist-status").textContent, "with eBay comparisons");
    assert.deepEqual(JSON.parse(local.getItem("snap.item")).customize, { quantity: "1", pickupOnly: false, comps: true });
    nodes.get("ebay-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted, [{ item, venue: "ebay", ai: [1], comps: true }]);
    assert.equal(nodes.get("comps").disabled, true, "fixed while the job is on its way");

    // NEXT: unticked again, and the next item's body says nothing of it
    nodes.get("next-item").fire("click");
    await settle();
    assert.equal(nodes.get("comps").checked, false);
    assert.equal(nodes.get("comps").disabled, false);
    await typeName(nodes, "Vase");
    snap(nodes, 1);
    await settle();
    card(nodes, 0).ai.fire("click");
    nodes.get("ebay-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted[1], { item: `Vase ${TODAY}`, venue: "ebay", ai: [1] });
});

test("customize, book: its own Compare with eBay listings; ticked, comps: true beside the book; a reload keeps it", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const local = memoryStore(GOOD);
    const pc = fakePc({ books: { [ISBN]: BOOK }, jobs: { j1: () => ({ state: "running", step: "listing the book" }) } });
    const { nodes } = await loadPage({ local, fetchImpl: pc.fetch, barcodes: [ISBN] });
    nodes.get("mode-book").fire("click");
    fire(nodes, "book-scan-input");
    await settle();
    fire(nodes, "book-snap-input");
    await settle();
    nodes.get("book-customize-toggle").fire("click");
    assert.equal(nodes.get("book-comps").checked, false);
    nodes.get("book-comps").checked = true;
    nodes.get("book-comps").fire("change");
    assert.equal(nodes.get("comps").checked, false, "the goods box is its own");
    assert.equal(nodes.get("book-ebay-status").textContent, "with eBay comparisons");
    assert.equal(JSON.parse(local.getItem("snap.book")).customize.comps, true);

    const again = await loadPage({ local, fetchImpl: pc.fetch, barcodes: [ISBN] });
    assert.equal(again.nodes.get("book-comps").checked, true, "a reload keeps it ticked");
    again.nodes.get("book-ebay-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted, [
        {
            item: `Book ${ISBN} ${TODAY}`,
            venue: "ebay",
            book: { ...NO_TYPING, isbn: ISBN, condition: "good", price: "11", main: 1 },
            comps: true,
        },
    ]);
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
        '"Lamp" is already an item on the server today with 3 photos. Use a different name.'
    );
    assert.equal(nodes.get("hint").hidden, false);
    assert.equal(nodes.get("item-name").classList.contains("taken"), true);
    assert.equal(nodes.get("snap-input").disabled, true);
    assert.equal(nodes.get("item-name").readOnly, false, "the name is his to change");
    snap(nodes, 1);
    await settle();
    assert.equal(nodes.get("strip").children.length, 0, "no photo under a refused name");
    assert.match(nodes.get("message").textContent, /already an item on the server today/);
    assert.deepEqual(pc.calls, [`GET /items/${taken}`], "nothing went to the server");

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
    assert.equal(nodes.get("snap-word").textContent, "Snap");
    snap(nodes, 1);
    await settle();
    assert.equal(nodes.get("snap-word").textContent, "Snap Again");
    // the button's middle (100 + 1000 + 50) at three quarters of 800
    assert.deepEqual(scrolls, [{ top: 550, left: 0, behavior: "instant" }]);
    // a gallery pick is not a return from the camera: no scroll
    nodes.get("gallery-input").fire("change", { target: { files: [new Blob(["g"], { type: "image/jpeg" })], value: "" } });
    await settle();
    assert.equal(scrolls.length, 1);
    nodes.get("next-item").fire("click");
    await settle();
    assert.equal(nodes.get("snap-word").textContent, "Snap", "a new item starts over");
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
    assert.ok(!pc.calls.some((c) => c.startsWith("DELETE /items/")), "nothing is deleted on the server");
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

const END = "End of the item history: see the inventory list on the server.";

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
    await typeName(nodes, "Boots"); // in hand, one photo on the server
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
    assert.equal(card(nodes, 0).remote.textContent, "on the server");
    assert.equal(card(nodes, 1).img.src, "blob:stub");
    assert.equal(card(nodes, 2).remote.textContent, "on the server");
    assert.equal(nodes.get("message").hidden, true, "nothing to say: the photos are safe on the server");
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

test("a press waits a second with the ring turning; a tap within it holds it: reset drops it, continue sends it", async (t) => {
    // Michal, 2026-10-02: "delay sending by 1 second (but show loading) so that if one cancels
    // within 1 sec there is no call money spent"; 2026-10-07: "The button, within it, should just
    // get 'tap again to cancel' instead of an external cancel line"; and later that day: "show
    // that it cancelled immediately, stop the loading button etc. The cancel should change to
    // 'reset call' (as in discard) and the button should change to 'continue'"
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pc = fakePc({ jobs: { j1: () => ({ state: "running", step: "drafting the listing" }) } });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    await typeName(nodes, "Lamp");
    snap(nodes, 1);
    await settle();
    card(nodes, 0).ai.fire("click");
    assert.equal(buttonSays(nodes.get("ebay-btn")), "ebay", "nothing to cancel before the press");
    assert.equal(nodes.get("ebay-reset").hidden, true);
    assert.ok(!/id="[^"]*cancel"|class="cancel"/.test(html), "no red cancel left in the page");
    nodes.get("ebay-btn").fire("click");
    await settle();
    assert.equal(nodes.get("ebay-btn").classList.contains("busy"), true, "loading from the press");
    assert.equal(nodes.get("ebay-status").textContent, "sending");
    assert.equal(buttonSays(nodes.get("ebay-btn")), "ebay / tap again to cancel", "inside the pressed button");
    assert.equal(nodes.get("ebay-btn").attrs["aria-label"], "ebay, posting, tap again to cancel");
    assert.equal(nodes.get("ebay-btn").disabled, false, "it takes the tap");
    assert.equal(buttonSays(nodes.get("craigslist-btn")), "craigslist");
    t.mock.timers.tick(SEND_DELAY_MS - 1);
    await settle();
    assert.deepEqual(pc.posted, [], "not for a whole second");

    // the tap: paused at once, the ring gone, continue in its place and reset under it
    nodes.get("ebay-btn").fire("click");
    await settle();
    assert.equal(nodes.get("ebay-status").textContent, "paused");
    assert.equal(buttonSays(nodes.get("ebay-btn")), "continue");
    assert.equal(nodes.get("ebay-btn").attrs["aria-label"], "ebay, paused, continue");
    assert.equal(nodes.get("ebay-btn").classList.contains("busy"), false, "the ring stops");
    assert.equal(nodes.get("ebay-btn").disabled, false);
    assert.equal(nodes.get("ebay-reset").hidden, false);
    assert.equal(nodes.get("craigslist-reset").hidden, true, "only under the paused one");
    assert.equal(nodes.get("done-hint").textContent, "NEXT waits: continue or reset the paused press");
    t.mock.timers.tick(SEND_DELAY_MS * 3);
    await settle();
    assert.deepEqual(pc.posted, [], "held: nothing leaves the phone, however long we wait");

    // reset: as if never pressed, nothing sent, the button waits for a new press
    nodes.get("ebay-reset").fire("click");
    await settle();
    assert.equal(nodes.get("ebay-status").textContent, "cancelled");
    assert.equal(nodes.get("ebay-status").className, "venue-status bad");
    assert.equal(buttonSays(nodes.get("ebay-btn")), "ebay");
    assert.equal(nodes.get("ebay-btn").disabled, false, "the button comes back");
    assert.equal(nodes.get("ebay-btn").classList.contains("busy"), false);
    assert.equal(nodes.get("ebay-reset").hidden, true);
    t.mock.timers.tick(SEND_DELAY_MS * 3);
    await settle();
    assert.deepEqual(pc.posted, [], "the dropped press never goes");
    assert.ok(!pc.calls.some((c) => c.startsWith("POST /jobs")));

    // pressed again: a fresh second, paused within it, then continue sends it at once
    nodes.get("ebay-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS / 2);
    await settle();
    nodes.get("ebay-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted, []);
    nodes.get("ebay-btn").fire("click");
    await settle();
    assert.equal(pc.posted.length, 1, "no second wait");
    assert.equal(nodes.get("ebay-status").textContent, "queued, 1 ahead");
    assert.equal(buttonSays(nodes.get("ebay-btn")), "ebay / tap again to cancel", "the ring and its line back");
    assert.equal(nodes.get("ebay-btn").classList.contains("busy"), true);
    assert.equal(nodes.get("ebay-reset").hidden, true);
});

test("after the second a tap pauses the PC's job: continue asks again; reset tells the PC, keeps the draft's sku", async (t) => {
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

    // paused: the PC is not told, only no longer asked
    nodes.get("ebay-btn").fire("click");
    await settle();
    assert.equal(nodes.get("ebay-status").textContent, "paused: the server may still be working on it");
    assert.equal(buttonSays(nodes.get("ebay-btn")), "continue");
    assert.equal(nodes.get("ebay-btn").classList.contains("busy"), false);
    assert.equal(nodes.get("ebay-reset").hidden, false);
    const asked = pc.calls.length;
    t.mock.timers.tick(3000 * 3);
    await settle();
    assert.equal(pc.calls.length, asked, "not asked about while paused");
    assert.ok(!pc.calls.some((c) => c.startsWith("DELETE")));

    // continue: asked at once, the ring and its line back
    nodes.get("ebay-btn").fire("click");
    await settle();
    assert.equal(pc.calls.at(-1), "GET /jobs/j1");
    assert.equal(nodes.get("ebay-status").textContent, "drafting the listing");
    assert.equal(buttonSays(nodes.get("ebay-btn")), "ebay / tap again to cancel");
    assert.equal(nodes.get("ebay-btn").classList.contains("busy"), true);
    assert.equal(nodes.get("ebay-reset").hidden, true);

    // paused again, then reset: DELETE /jobs/<id>, and the button is ebay again at once
    nodes.get("ebay-btn").fire("click");
    await settle();
    nodes.get("ebay-reset").fire("click");
    await settle();
    assert.equal(pc.calls.at(-1), "DELETE /jobs/j1");
    assert.equal(nodes.get("ebay-status").textContent, "cancelled");
    assert.equal(nodes.get("ebay-status").className, "venue-status bad");
    assert.equal(buttonSays(nodes.get("ebay-btn")), "ebay");
    assert.equal(nodes.get("ebay-btn").classList.contains("busy"), false);
    assert.equal(nodes.get("ebay-btn").disabled, false, "waiting for a new press");
    assert.equal(nodes.get("ebay-reset").hidden, true);
    assert.equal(pc.posted.length, 1, "nor posts it again");
    // the PC's own word once it has stopped, asked about quietly
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("ebay-status").textContent, "cancelled from the phone");
    assert.equal(nodes.get("ebay-status").className, "venue-status bad");
    assert.equal(pc.calls.filter((c) => c === "DELETE /jobs/j1").length, 1);
    const ended = pc.calls.length;
    t.mock.timers.tick(3000 * 2);
    await settle();
    assert.equal(pc.calls.length, ended, "no more polls once it stopped");
    // the next press goes by the saved row's sku: no second draft
    nodes.get("ebay-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    assert.deepEqual(pc.posted.at(-1), { sku: "B-0042", venue: "ebay" });
});

test("too late: from the publishing step on a tap says so for a moment, and the button stays busy", async (t) => {
    // Michal, 2026-10-07: "Perhaps after pressing cancel it should say 'too late to cancel'?"
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let step = "drafting the listing";
    const pc = fakePc({ jobs: { j1: () => ({ state: "running", step, sku: "B-1" }) } });
    const { nodes } = await loadPage({ local: memoryStore(GOOD), fetchImpl: pc.fetch });
    await typeName(nodes, "Lamp");
    snap(nodes, 1);
    await settle();
    card(nodes, 0).ai.fire("click");
    nodes.get("ebay-btn").fire("click");
    await settle();
    t.mock.timers.tick(SEND_DELAY_MS);
    await settle();
    step = "publishing B-1 on ebay";
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(nodes.get("ebay-status").textContent, "publishing B-1 on ebay");
    assert.equal(buttonSays(nodes.get("ebay-btn")), "ebay", "nothing left to cancel: no second line");
    assert.equal(nodes.get("ebay-btn").disabled, false, "it takes the tap, to say so");
    nodes.get("ebay-btn").fire("click");
    await settle();
    assert.equal(nodes.get("ebay-status").textContent, "too late to cancel: it is publishing");
    assert.equal(nodes.get("ebay-btn").classList.contains("busy"), true, "still busy");
    assert.equal(buttonSays(nodes.get("ebay-btn")), "ebay");
    assert.equal(nodes.get("ebay-reset").hidden, true, "nothing paused");
    assert.ok(!pc.calls.some((c) => c.startsWith("DELETE")), "the server is not told");
    t.mock.timers.tick(TOO_LATE_MS);
    await settle();
    assert.equal(nodes.get("ebay-status").textContent, "publishing B-1 on ebay", "the step's own words again");
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
