// about.js -- about.html in the language chosen on this phone (docs/UI.md rule 8).
//
// The page is written in English, its words marked as index.html's are (data-t on an element
// whose own text is translated, data-t-<attribute> for an attribute); in Chinese, Spanish or Polish each
// marked line is looked up by its English in the same catalogs the app uses (i18n.js), a line
// with none yet staying English, and the line saying the English governs is shown. The language
// is the app's own choice, kept in this browser's storage, or with none chosen the phone's own as
// the app takes it (i18n.js); nothing is fetched, nothing is sent.

import { htmlLang, language, preferredLanguages, setLanguage, startingLanguage, t } from "./i18n.js?v=2.48.0";

/** The attributes a page marks for translation, each as data-t-<attribute>. */
const ATTRIBUTES = ["placeholder", "aria-label", "title"];

/** HTML text as one line, as tools/i18n-check.mjs reads it. @param {string | null} text */
function oneLine(text) {
    return String(text ?? "").replace(/\s+/g, " ").trim();
}

/** The language this phone chose in the app; the phone's own when none, or storage is blocked. */
function chosen() {
    let stored = null;
    try {
        stored = localStorage.getItem("snap.language");
    } catch {
        // blocked storage: as if nothing were chosen
    }
    return startingLanguage(stored, preferredLanguages());
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
