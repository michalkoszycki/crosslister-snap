// tests/page.test.js -- the headless "does the page actually load" check.
//
// There is no browser here, so we stub just enough of one: a DOM whose
// getElementById only knows the ids that really exist in index.html. If app.js
// asks for an element the HTML does not have, this test fails -- which is the
// mistake a browser would only show as a console error.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");

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

test("redirect.html references only files that exist", () => {
    const bridge = readFileSync(join(root, "redirect.html"), "utf8");
    for (const f of referencedFiles(bridge)) {
        assert.ok(existsSync(join(root, f)), `missing file referenced by redirect.html: ${f}`);
    }
});

test("the vendored MSAL bundles are present and export their globals", () => {
    const main = readFileSync(join(root, "vendor/msal-browser-5.22.0.min.js"), "utf8");
    assert.ok(main.includes("@azure/msal-browser v5.22.0"), "version banner missing");
    assert.ok(main.includes(".msal={}"), "does not define the msal global");
    const bridge = readFileSync(join(root, "vendor/msal-redirect-bridge-5.22.0.min.js"), "utf8");
    assert.ok(bridge.includes(".msalRedirectBridge={}"), "bridge global missing");
});

test("the Content-Security-Policy allows Graph and the login endpoints only", () => {
    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
    assert.match(csp, /connect-src[^;]*https:\/\/graph\.microsoft\.com/);
    assert.match(csp, /connect-src[^;]*https:\/\/\*\.up\.1drv\.com/);
    // the hosts a personal OneDrive actually hands back for the byte upload (seen live)
    assert.match(csp, /connect-src[^;]*https:\/\/my\.microsoftpersonalcontent\.com/);
    assert.match(csp, /connect-src[^;]*https:\/\/api\.onedrive\.com/);
    assert.match(csp, /connect-src[^;]*https:\/\/login\.microsoftonline\.com/);
    assert.match(csp, /script-src 'self'/);
    // blob: thumbnails, with default-src still 'none'
    assert.match(csp, /img-src[^;]*blob:/);
    // media-src went with the in-page camera; nothing plays media here now
    assert.ok(!csp.includes("media-src"), "CSP must not carry media-src any more");
    assert.match(csp, /default-src 'none'/);
    assert.ok(!csp.includes("unsafe-inline"), "CSP must not allow inline script");
    assert.ok(!csp.includes("*.microsoft.com"), "CSP must stay host-specific");
});

test("every ?v= in the repo is the one VERSION, so nothing loads half-stale", async () => {
    const { VERSION } = await import("../version.js");
    const files = [
        "index.html",
        "app.js",
        "graph.js",
        "core.js",
        "auth.js",
        "config.js",
        "version.js",
    ];
    let seen = 0;
    for (const file of files) {
        const src = readFileSync(join(root, file), "utf8");
        for (const m of src.matchAll(/\?v=(\d+\.\d+\.\d+)/g)) {
            seen += 1;
            assert.equal(m[1], VERSION, `${file} carries ?v=${m[1]}, but VERSION is ${VERSION}`);
        }
    }
    assert.ok(seen >= 6, `expected the cache-busting query on every module, saw ${seen}`);
    // index.html must bust both the page's script and its stylesheet
    assert.match(html, new RegExp(`src="app\\.js\\?v=${VERSION.replace(/\./g, "\\.")}"`));
    assert.match(html, new RegExp(`href="styles\\.css\\?v=${VERSION.replace(/\./g, "\\.")}"`));
});

test("note.txt is a contract with the CLI and lives in config.js", () => {
    const cfg = readFileSync(join(root, "config.js"), "utf8");
    assert.match(cfg, /noteFileName:\s*"note\.txt"/);
    const app = readFileSync(join(root, "app.js"), "utf8");
    assert.ok(
        !/"note\.txt"/.test(app),
        "app.js must use config.noteFileName, not the literal name"
    );
});

test("the screen elements are all in index.html", () => {
    const ids = idsIn(html);
    for (const id of [
        "item-name",
        "cleaned",
        "hint",
        "snap-label",
        "snap-input",
        "gallery-label",
        "gallery-input",
        "progress",
        "strip",
        "note",
        "note-status",
        "next-item",
        "version",
    ]) {
        assert.ok(ids.has(id), `index.html is missing #${id}`);
    }
    // Snap hands over to the phone's own camera app, full screen
    assert.match(html, /capture="environment"/);
});

test("the work section reads top to bottom the way Michal asked", () => {
    // Michal, 2026-09-21: the page goes back to the Snap label that opens the
    // phone's camera app, with the notes under the photos and a DONE button in
    // the same shape as Snap.
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
        "next-item",
    ]);

    // DONE: the same big button as Snap, only green; never a round one
    const done = /<button type="button" id="next-item"[^>]*>([^<]*)</.exec(html);
    assert.match(done[0], /class="[^"]*\bbig\b[^"]*"/);
    assert.equal(done[1].trim(), "DONE");

    // and nothing of the in-page camera, the recents or the footer blurb is left
    for (const id of idsIn(html)) {
        assert.ok(
            !/^(camera|shutter|recents|fallbacks|reload-latest)/.test(id),
            `index.html still carries #${id}`
        );
    }
    assert.ok(!existsSync(join(root, "camera.js")), "camera.js must be gone");
});

test("the manifest points at icons that exist", () => {
    const manifest = JSON.parse(readFileSync(join(root, "manifest.webmanifest"), "utf8"));
    assert.equal(manifest.display, "standalone");
    for (const icon of manifest.icons) {
        assert.ok(existsSync(join(root, icon.src)), `missing icon ${icon.src}`);
    }
});

test("config.js holds a client id and nothing secret; no token is ever logged", () => {
    const cfg = readFileSync(join(root, "config.js"), "utf8");
    const value = /clientId:\s*"([^"]*)"/.exec(cfg)[1];
    // A single-page app's client id is public by design (README, "Security"), so the real
    // one is committed. It must be the placeholder or a GUID, never anything else.
    assert.match(value, /^(PASTE-YOUR-APPLICATION-CLIENT-ID-HERE|[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12})$/);
    assert.ok(!/client_?secret|password/i.test(cfg), "config.js must never carry a secret");
    for (const file of [
        "app.js",
        "auth.js",
        "graph.js",
        "core.js",
        "config.js",
        "version.js",
        "bridge.js",
    ]) {
        const src = readFileSync(join(root, file), "utf8");
        assert.ok(
            !/console\.(log|debug|info)\s*\(/.test(src),
            `${file} logs to the console; tokens must never be logged`
        );
    }
});

// --- the DOM stub ----------------------------------------------------------

function fakeElement(id = "") {
    const classes = new Set();
    return {
        id,
        hidden: false,
        disabled: false,
        value: "",
        textContent: "",
        className: "",
        title: "",
        src: "",
        alt: "",
        type: "",
        open: false,
        srcObject: null,
        videoWidth: 0,
        videoHeight: 0,
        offsetWidth: 0,
        children: [],
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
        append(...kids) {
            this.children.push(...kids);
        },
        replaceChildren(...kids) {
            this.children = kids;
        },
        focus() {},
        setAttribute() {},
    };
}

function installDom(ids) {
    const nodes = new Map([...ids].map((id) => [id, fakeElement(id)]));
    const asked = new Set();
    const store = () => {
        const m = new Map();
        return {
            getItem: (k) => (m.has(k) ? m.get(k) : null),
            setItem: (k, v) => m.set(k, String(v)),
            removeItem: (k) => m.delete(k),
        };
    };
    globalThis.document = {
        getElementById(id) {
            asked.add(id);
            return nodes.get(id) ?? null;
        },
        createElement: () => fakeElement(),
        addEventListener() {},
        visibilityState: "visible",
        title: "",
    };
    globalThis.window = {
        location: {
            origin: "http://localhost:8080",
            pathname: "/",
            hash: "",
            search: "",
        },
        addEventListener() {},
        history: { replaceState() {} },
    };
    // navigator is a getter on globalThis in Node, so it needs redefining.
    // Only onLine is needed: the page never touches a device API itself, it
    // hands over to the phone's camera app through the file input.
    Object.defineProperty(globalThis, "navigator", {
        value: { onLine: true },
        configurable: true,
        writable: true,
    });
    globalThis.localStorage = store();
    globalThis.sessionStorage = store();
    globalThis.URL.createObjectURL = () => "blob:stub";
    globalThis.URL.revokeObjectURL = () => {};
    return { nodes, asked };
}

test("app.js loads against the real index.html ids without an error", async () => {
    const ids = idsIn(html);
    const { nodes, asked } = installDom(ids);

    await import("../app.js"); // top-level main() runs during this import
    await new Promise((r) => setTimeout(r, 20));

    for (const id of asked) {
        assert.ok(nodes.has(id), `app.js asked for #${id}, which index.html does not have`);
    }
    // Nothing may reach the network from this stubbed page. With the placeholder client id
    // the app stops and says so; with a real one it gets as far as MSAL, which this stub
    // does not load, and reports that instead. Either way it explains itself on the page.
    assert.match(nodes.get("message").textContent, /client id|MSAL did not load/i);
    // and it must have painted the signed-out state
    assert.equal(nodes.get("work").hidden, true);
    assert.equal(nodes.get("signin-box").hidden, false);
    // and the running version is on the page
    const { VERSION } = await import("../version.js");
    assert.equal(nodes.get("version").textContent, VERSION);
});

test("config.js derives the redirect URI from wherever the page is served", async () => {
    installDom(idsIn(html));
    const { redirectUri, appBaseUrl } = await import("../config.js");
    globalThis.window.location.pathname = "/crosslister-snap/index.html";
    globalThis.window.location.origin = "https://michalkoszycki.github.io";
    assert.equal(appBaseUrl(), "https://michalkoszycki.github.io/crosslister-snap/");
    assert.equal(
        redirectUri(),
        "https://michalkoszycki.github.io/crosslister-snap/redirect.html"
    );
});
