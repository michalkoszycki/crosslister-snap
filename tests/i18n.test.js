// tests/i18n.test.js -- the page's languages (docs/UI.md rule 8): the English is the key, a line
// with no translation shows in English, and a catalog entry keeps its English's {placeholders}.
// What is still untranslated is never a failure here: tools/i18n-check.mjs lists it for the
// translation pass before a release (Michal, 2026-11-02).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CATALOGS, htmlLang, language, languageOf, setLanguage, t, tKey } from "../i18n.js";
import { pageKeys, placeholders, scriptKeys } from "../tools/i18n-check.mjs";
import { checkEmail, errorText, serverLine, wrapError } from "../core.js";
import { VERSION } from "../version.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("English by default; only zh and es are other languages", () => {
    assert.equal(languageOf(null), "en");
    assert.equal(languageOf("fr"), "en");
    assert.equal(languageOf("zh"), "zh");
    assert.equal(languageOf("es"), "es");
    assert.equal(htmlLang("zh"), "zh-Hans");
    assert.equal(htmlLang("es"), "es");
    assert.equal(htmlLang("xx"), "en");
});

test("t(): the chosen language's words, the English until one is written, {placeholders} filled", () => {
    try {
        setLanguage("en");
        assert.equal(t("Sign in"), "Sign in");
        assert.equal(t("Language: {name}", { name: "English" }), "Language: English");
        setLanguage("zh");
        assert.equal(language(), "zh");
        assert.equal(t("Sign in"), CATALOGS.zh["Sign in"]);
        assert.equal(t("words no catalog has"), "words no catalog has", "untranslated: the English");
        assert.equal(t("{n} of {m}", { n: 1 }), "1 of {m}", "a placeholder with no value stays");
        setLanguage("es");
        assert.equal(t("Sign in"), CATALOGS.es["Sign in"]);
        assert.equal(tKey("Sign in"), "Sign in", "tKey only marks");
    } finally {
        setLanguage("en");
    }
});

test("the page's own error lines are translated; the server's words inside them stay as it sent them", async () => {
    // core.js's own i18n.js, as it imports it (with its ?v=)
    const core = await import(`../i18n.js?v=${VERSION}`);
    try {
        core.setLanguage("zh");
        assert.equal(serverLine(true, 0).text, CATALOGS.zh["server off"]);
        assert.equal(errorText(0), CATALOGS.zh["cannot reach the server"]);
        assert.equal(errorText(400, "price must be positive"), "price must be positive", "the server's detail as it came");
        assert.equal(wrapError(500, "disk full"), CATALOGS.zh["Could not save: {detail}."].replace("{detail}", "disk full"));
        core.setLanguage("es");
        assert.equal(checkEmail("nope").error, CATALOGS.es["That is not an email address."]);
    } finally {
        core.setLanguage("en");
    }
});

test("every catalog entry keeps its English's {placeholders}, so no number or name is lost", () => {
    for (const [lang, catalog] of Object.entries(CATALOGS)) {
        for (const [english, words] of Object.entries(catalog)) {
            assert.deepEqual(placeholders(words), placeholders(english), `${lang}: ${JSON.stringify(english)}`);
            assert.ok(words.trim(), `${lang}: ${JSON.stringify(english)} is empty`);
        }
    }
});

test("the checker reads t(), tKey() and the pages' data-t marks; a marked element holds text alone", () => {
    assert.deepEqual(scriptKeys(`t("A {n}", { n }); tKey('B'); x.t("not this"); split("no"); t(\`C\`)`), ["A {n}", "B", "C"]);
    const found = pageKeys('<p data-t>\r\n  Two\n  lines &amp; more</p><input data-t-placeholder placeholder="Box"><b aria-label="L" data-t-aria-label>x</b>');
    assert.deepEqual(found, { keys: ["Two lines & more", "Box", "L"], problems: [] });
    for (const file of ["index.html", "about.html"]) {
        assert.deepEqual(pageKeys(readFileSync(join(root, file), "utf8")).problems, [], file);
    }
});
