// tools/i18n-check.mjs -- what the translation pass before a release still has to do.
//
//   node tools/i18n-check.mjs          (or: npm run i18n)
//   node tools/i18n-check.mjs --json   the same as JSON, every English key included
//
// Reads the page's sources as text (nothing runs): every t("...") and tKey("...") in the
// scripts, and every data-t, data-t-placeholder, data-t-aria-label and data-t-title in
// index.html and about.html. Per language it lists
//   MISSING  English the page shows that the catalog (lang/<language>.js) has no entry for:
//            it shows in English until the pass translates it;
//   UNUSED   catalog entries whose English the page no longer shows: delete them;
//   BROKEN   entries whose {placeholders} are not the English key's.
// The exit code is always 0: translations lag on purpose (Michal, 2026-11-02, docs/UI.md
// rule 8); a pending line is work for the pass, never a failed check. A t() whose words are not
// a literal (a variable) cannot be read here: its words must be marked where they are written,
// with tKey("...").

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const SCRIPTS = ["app.js", "core.js", "book.js", "pc.js", "queue.js", "shrink.js", "scan.js"];
export const PAGES = ["index.html", "about.html"];

/** A JS string literal's value: "...", '...' or `...` with no ${}. @param {string} literal */
function unquote(literal) {
    if (literal.startsWith("`")) {
        return literal.slice(1, -1).replace(/\\(.)/g, (_, c) => ({ n: "\n", t: "\t" })[c] ?? c);
    }
    if (literal.startsWith("'")) literal = `"${literal.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"')}"`;
    return JSON.parse(literal);
}

/** The English keys a script passes to t() and tKey(), as literals. @param {string} source */
export function scriptKeys(source) {
    const keys = [];
    const call = /(?<![\w.$])(?:t|tKey)\(\s*("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\$]|\\.)*`)/g;
    for (const m of source.matchAll(call)) keys.push(unquote(m[1]));
    return keys;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rarr: "→", larr: "←", hellip: "…", middot: "·", mdash: "—", ndash: "–", times: "×" };

/** HTML text as the page reads it: entities decoded, whitespace one space, trimmed. @param {string} text */
export function htmlText(text) {
    return text
        .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, name) => {
            if (name[0] === "#") return String.fromCodePoint(name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : Number(name.slice(1)));
            return ENTITIES[name] ?? whole;
        })
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * The English keys a page marks: a data-t element's own text (plain text only: a child element
 * is reported, as app.js would lose it), and the attributes data-t-<attribute> names.
 * @param {string} html
 * @returns {{ keys: string[], problems: string[] }}
 */
export function pageKeys(html) {
    const page = html.replace(/<!--[\s\S]*?-->/g, "");
    const keys = [];
    const problems = [];
    for (const m of page.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
        const attrs = m[2];
        if (/\sdata-t(?=[\s>=/]|$)/.test(attrs)) {
            const close = page.indexOf(`</${m[1]}>`, m.index + m[0].length);
            const inner = page.slice(m.index + m[0].length, close);
            if (inner.includes("<")) problems.push(`data-t on an element with child elements: ${m[0]}`);
            else keys.push(htmlText(inner));
        }
        for (const a of attrs.matchAll(/\sdata-t-([\w-]+)/g)) {
            const value = new RegExp(`\\s${a[1]}="([^"]*)"`).exec(attrs);
            if (value) keys.push(htmlText(value[1]));
            else problems.push(`data-t-${a[1]} with no ${a[1]}="...": ${m[0]}`);
        }
    }
    return { keys, problems };
}

/** The {placeholders} in words, sorted. @param {string} words */
export function placeholders(words) {
    return [...words.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

async function main() {
    const asJson = process.argv.includes("--json");
    const used = new Set();
    const problems = [];
    for (const file of SCRIPTS) for (const key of scriptKeys(readFileSync(join(root, file), "utf8"))) used.add(key);
    for (const file of PAGES) {
        const found = pageKeys(readFileSync(join(root, file), "utf8"));
        for (const key of found.keys) used.add(key);
        problems.push(...found.problems.map((p) => `${file}: ${p}`));
    }
    used.delete("");
    const { CATALOGS } = await import("../i18n.js");
    const report = { keys: [...used].sort(), problems, languages: {} };
    for (const [lang, catalog] of Object.entries(CATALOGS)) {
        const missing = report.keys.filter((k) => !(k in catalog));
        const unused = Object.keys(catalog).filter((k) => !used.has(k));
        const broken = Object.entries(catalog)
            .filter(([k, v]) => placeholders(k).join() !== placeholders(v).join())
            .map(([k]) => k);
        report.languages[lang] = { missing, unused, broken };
    }
    if (asJson) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }
    const out = [`${report.keys.length} English lines marked for translation`];
    for (const p of problems) out.push(`PROBLEM ${p}`);
    for (const [lang, r] of Object.entries(report.languages)) {
        out.push("", `${lang}: ${r.missing.length} missing, ${r.unused.length} unused, ${r.broken.length} broken`);
        for (const k of r.missing) out.push(`  MISSING ${JSON.stringify(k)}`);
        for (const k of r.unused) out.push(`  UNUSED  ${JSON.stringify(k)}`);
        for (const k of r.broken) out.push(`  BROKEN  ${JSON.stringify(k)} (its {placeholders} differ)`);
    }
    process.stdout.write(`${out.join("\n")}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
