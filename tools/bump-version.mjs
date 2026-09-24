// tools/bump-version.mjs -- rewrite every "?v=x.y.z" in the repo to match
// VERSION in version.js, so one edit busts the GitHub Pages cache everywhere.
//
//   1. edit VERSION in version.js
//   2. node tools/bump-version.mjs
//
// A test (tests/page.test.js) fails if the two ever drift apart.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { VERSION } = await import("../version.js");

const files = ["index.html", "app.js", "core.js", "pc.js", "queue.js", "shrink.js", "version.js"];
const pattern = /\?v=\d+\.\d+\.\d+/g;

let touched = 0;
for (const file of files) {
    const path = join(root, file);
    const before = readFileSync(path, "utf8");
    const after = before.replace(pattern, `?v=${VERSION}`);
    if (after !== before) {
        writeFileSync(path, after);
        touched += 1;
        process.stdout.write(`updated ${file}\n`);
    }
}
process.stdout.write(`version ${VERSION}; ${touched} file(s) changed\n`);
