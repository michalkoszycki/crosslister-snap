// about.js -- about.html in the language chosen on this phone (docs/UI.md rule 8).
//
// The page is written in English, its words marked as index.html's are (data-t on an element
// whose own text is translated, data-t-<attribute> for an attribute); in Chinese or Spanish each
// marked line is looked up by its English in the same catalogs the app uses (i18n.js), a line
// with none yet staying English, and the line saying the English governs is shown. The language
// is the app's own choice, kept in this browser's storage; nothing is fetched, nothing is sent.

import { htmlLang, language, languageOf, setLanguage, t } from "./i18n.js?v=2.45.3";

/** The attributes a page marks for translation, each as data-t-<attribute>. */
const ATTRIBUTES = ["placeholder", "aria-label", "title"];

/** HTML text as one line, as tools/i18n-check.mjs reads it. @param {string | null} text */
function oneLine(text) {
    return String(text ?? "").replace(/\s+/g, " ").trim();
}

/** The language this phone chose in the app; English when none, or storage is blocked. */
function chosen() {
    try {
        return languageOf(localStorage.getItem("snap.language"));
    } catch {
        return "en";
    }
}

setLanguage(chosen());
document.documentElement.lang = htmlLang(language());
if (language() !== "en") {
    const selector = ["[data-t]", ...ATTRIBUTES.map((a) => `[data-t-${a}]`)].join(", ");
    for (const node of document.querySelectorAll(selector)) {
        if (node.hasAttribute("data-t")) node.textContent = t(oneLine(node.textContent));
        for (const a of ATTRIBUTES) if (node.hasAttribute(`data-t-${a}`)) node.setAttribute(a, t(oneLine(node.getAttribute(a))));
    }
    const governs = document.getElementById("about-governs");
    if (governs) governs.hidden = false;
}
