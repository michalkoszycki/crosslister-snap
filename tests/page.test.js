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
        if (!v.startsWith("http") && !v.startsWith("#")) out.add(v);
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
    assert.ok(!csp.includes("unsafe-inline"), "CSP must not allow inline script");
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
    for (const file of ["app.js", "auth.js", "graph.js", "core.js", "config.js", "bridge.js"]) {
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
    // navigator is a getter on globalThis in Node, so it needs redefining
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
