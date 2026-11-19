// i18n.js -- the page's words in English, Simplified Chinese, Spanish or Polish.
//
// English is the source and the key (gettext's way): the page is written in English, and a
// translation is found by the English words themselves, in lang/zh.js, lang/es.js and
// lang/pl.js. A line with no translation yet shows in English, on purpose (Michal, 2026-11-02:
// translations are one pass before a release, never per change), so a new or reworded English line simply waits
// for that pass; `node tools/i18n-check.mjs` lists what waits. Everything the page writes is
// translated, its own error lines included; never translated: anything the server sends (its
// error details, job steps and summaries, what the AI wrote), venue names, the brand, the
// listings (docs/UI.md rule 8).
// Kept on this phone (localStorage snap.language), chosen on the landing or under This phone;
// until one is chosen, the phone's own language when it is one of these, else English (Michal,
// 2026-11-19), never stored, so the page follows the phone until a chip is chosen.
//
// Counts: the English has a key for one and a key for more ("{n} photo" / "{n} photos"); a
// translation whose grammar has more forms than two (Polish: 1 zdjęcie, 2 zdjęcia, 5 zdjęć)
// holds them split by "|", in the order one|few|many, and {n} picks one (Intl.PluralRules).
//
// Pure, no DOM, so core.js uses it too. index.html's own words carry data-t (app.js).

import { ZH } from "./lang/zh.js?v=2.48.1";
import { ES } from "./lang/es.js?v=2.48.1";
import { PL } from "./lang/pl.js?v=2.48.1";

/** The languages, in their order on screen, each named in its own language. */
export const LANGUAGES = [
    { value: "en", label: "English", lang: "en" },
    { value: "zh", label: "中文", lang: "zh-Hans" },
    { value: "es", label: "Español", lang: "es" },
    { value: "pl", label: "Polski", lang: "pl" },
];

/** @typedef {"en"|"zh"|"es"|"pl"} Language */

/** @type {Record<Exclude<Language, "en">, Record<string, string>>} */
export const CATALOGS = { zh: ZH, es: ES, pl: PL };

/** The order of a translation's count forms split by "|" (Intl.PluralRules' categories). */
const PLURAL_FORMS = ["one", "few", "many", "other"];

/** @type {Language} */
let current = "en";

/**
 * The language as stored on the phone: "zh", "es" or "pl" when chosen, "en" for anything else,
 * nothing saved included (English is the default; Michal, 2026-11-02).
 * @param {unknown} text
 * @returns {Language}
 */
export function languageOf(text) {
    return text === "zh" || text === "es" || text === "pl" ? text : "en";
}

/**
 * The phone's own language, from what the browser says it prefers (navigator.languages, else
 * navigator.language): the first whose primary part is one of ours ("pl-PL" is Polish, "zh-TW"
 * Chinese, "es-MX" Spanish), English when none is (Michal, 2026-11-19). Never where the phone
 * is: the phone's language is the reader's, and a location would need another site.
 * @param {readonly unknown[] | null | undefined} preferred
 * @returns {Language}
 */
export function phoneLanguage(preferred) {
    for (const tag of preferred ?? []) {
        const primary = String(tag ?? "").toLowerCase().split(/[-_]/)[0];
        if (languageOf(primary) === primary) return languageOf(primary);
    }
    return "en";
}

/**
 * The language a page opens in: the one chosen on a chip and stored, whichever it is; with none
 * stored (or something no chip writes), the phone's own (phoneLanguage).
 * @param {unknown} stored
 * @param {readonly unknown[] | null | undefined} preferred
 * @returns {Language}
 */
export function startingLanguage(stored, preferred) {
    return languageOf(stored) === stored ? languageOf(stored) : phoneLanguage(preferred);
}

/**
 * What a browser says it prefers, most preferred first: navigator.languages, else
 * navigator.language; none outside a browser.
 * @param {{ languages?: readonly string[], language?: string } | undefined} [nav]
 * @returns {readonly string[]}
 */
export function preferredLanguages(nav = globalThis.navigator) {
    if (!nav) return [];
    if (Array.isArray(nav.languages) && nav.languages.length) return nav.languages;
    return typeof nav.language === "string" && nav.language ? [nav.language] : [];
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
 * number or a name in it is one key: t("{n} free postings left", { n: 3 }). Words with count
 * forms split by "|" give the one {n} asks for (countForm).
 * @param {string} english
 * @param {Record<string, unknown>} [vars]
 * @returns {string}
 */
export function t(english, vars) {
    const found = current === "en" ? english : (CATALOGS[current][english] ?? english);
    const words = found.includes("|") ? countForm(found, vars?.n) : found;
    if (!vars) return words;
    return words.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
}

/**
 * Of a translation's count forms ("{n} zdjęcie|{n} zdjęcia|{n} zdjęć", in PLURAL_FORMS' order), the
 * one the language's grammar takes for n; the last when n is no number or the form is not written.
 * @param {string} words
 * @param {unknown} n
 * @returns {string}
 */
export function countForm(words, n) {
    const forms = words.split("|");
    const count = typeof n === "number" || (typeof n === "string" && n.trim()) ? Number(n) : NaN;
    if (!Number.isFinite(count)) return forms[forms.length - 1];
    const at = PLURAL_FORMS.indexOf(new Intl.PluralRules(htmlLang(current)).select(count));
    return forms[at >= 0 && at < forms.length ? at : forms.length - 1];
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
