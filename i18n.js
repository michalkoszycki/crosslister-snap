// i18n.js -- the page's words in English, Simplified Chinese or Spanish.
//
// English is the source and the key (gettext's way): the page is written in English, and a
// translation is found by the English words themselves, in lang/zh.js and lang/es.js. A line
// with no translation yet shows in English, on purpose (Michal, 2026-11-02: translations are
// one pass before a release, never per change), so a new or reworded English line simply waits
// for that pass; `node tools/i18n-check.mjs` lists what waits. Everything the page writes is
// translated, its own error lines included; never translated: anything the server sends (its
// error details, job steps and summaries, what the AI wrote), venue names, the brand, the
// listings (docs/UI.md rule 8).
// Kept on this phone (localStorage snap.language), chosen on the landing or under This phone.
//
// Pure, no DOM, so core.js uses it too. index.html's own words carry data-t (app.js).

import { ZH } from "./lang/zh.js?v=2.45.3";
import { ES } from "./lang/es.js?v=2.45.3";

/** The languages, in their order on screen, each named in its own language. */
export const LANGUAGES = [
    { value: "en", label: "English", lang: "en" },
    { value: "zh", label: "中文", lang: "zh-Hans" },
    { value: "es", label: "Español", lang: "es" },
];

/** @typedef {"en"|"zh"|"es"} Language */

/** @type {Record<"zh"|"es", Record<string, string>>} */
export const CATALOGS = { zh: ZH, es: ES };

/** @type {Language} */
let current = "en";

/**
 * The language as stored on the phone: "zh" or "es" when chosen, "en" for anything else,
 * nothing saved included (English is the default; Michal, 2026-11-02).
 * @param {unknown} text
 * @returns {Language}
 */
export function languageOf(text) {
    return text === "zh" || text === "es" ? text : "en";
}

/** @param {unknown} lang */
export function setLanguage(lang) {
    current = languageOf(lang);
}

/** @returns {Language} */
export function language() {
    return current;
}

/** The `lang` attribute <html> carries for a language. @param {unknown} lang */
export function htmlLang(lang) {
    const value = languageOf(lang);
    return LANGUAGES.find((l) => l.value === value)?.lang ?? "en";
}

/**
 * English words in the chosen language; the English itself until it has a translation. Each
 * `{name}` in the words is then filled from `vars` (in English too), so a sentence with a
 * number or a name in it is one key: t("{n} free postings left", { n: 3 }).
 * @param {string} english
 * @param {Record<string, unknown>} [vars]
 * @returns {string}
 */
export function t(english, vars) {
    const words = current === "en" ? english : (CATALOGS[current][english] ?? english);
    if (!vars) return words;
    return words.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
}

/**
 * Marks English words for translation where they are written and returns them unchanged: words
 * kept in a constant or a table, which t() translates where they are shown (gettext's N_). The
 * checker finds both t("...") and tKey("...").
 * @template {string} T
 * @param {T} english
 * @returns {T}
 */
export function tKey(english) {
    return english;
}
