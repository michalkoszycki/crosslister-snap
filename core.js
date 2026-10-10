// core.js -- pure logic for Snap.
// No DOM, no network, no browser globals. Everything here is unit tested
// by `node --test`. The upload queue's own rules (what goes next, how long
// to wait) are in queue.js; the state they act on is reduced here.

import { noteDirty, unsent } from "./queue.js?v=2.17.0";
import {
    bookListings,
    bookPriceValue,
    bookRecord,
    bookSearch,
    CONDITIONS,
    DEFAULT_CONDITION,
    DEFAULT_FORMAT,
    FORMATS,
    formatOf,
    money,
} from "./book.js?v=2.17.0";

// --- the item name and photo file names ------------------------------------

/** Characters Windows refuses in a file name. */
const FORBIDDEN = /["*:<>?/\\|]/g;

/** Maximum length of the item name. */
export const MAX_ITEM_NAME = 60;

/**
 * Clean a typed item name into something a file name can carry.
 * - drops " * : < > ? / \ |
 * - drops control characters
 * - collapses runs of whitespace to a single space
 * - trims leading/trailing spaces and dots
 * - caps at MAX_ITEM_NAME characters (then trims again)
 *
 * @param {string} raw
 * @returns {string} cleaned name, possibly ""
 */
export function cleanItemName(raw) {
    if (typeof raw !== "string") return "";
    let s = raw.replace(FORBIDDEN, "");
    // control characters, but not tab / newline / carriage return: those are
    // whitespace and get collapsed into a single space on the next line.
    // eslint-disable-next-line no-control-regex
    s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
    s = s.replace(/\s+/g, " ");
    s = trimEdges(s);
    if (s.length > MAX_ITEM_NAME) s = trimEdges(s.slice(0, MAX_ITEM_NAME));
    return s;
}

function trimEdges(s) {
    return s.replace(/^[\s.]+/, "").replace(/[\s.]+$/, "");
}

/**
 * True when the cleaned name differs from what was typed, i.e. worth showing.
 * @param {string} raw
 * @returns {boolean}
 */
export function nameWasChanged(raw) {
    return typeof raw === "string" && raw.length > 0 && cleanItemName(raw) !== raw;
}

/**
 * The name of photo number `n` of an item. Every photo is sent as a JPEG (see
 * shrink.js), so the extension is always .jpg.
 * @param {string} itemName already cleaned
 * @param {number} n 1-based
 * @returns {string}
 */
export function buildFileName(itemName, n) {
    return `${itemName}-${n}.jpg`;
}

/**
 * What an item's photos are called on the page: its name, or, while it has none, "Book"
 * (a book waiting for its ISBN or title) or "Unnamed" (goods snapped with the name box
 * left empty, which the listing's title names in the end).
 * @param {{itemName:string, mode:string}} state
 * @returns {string}
 */
export function photoStem(state) {
    return state.itemName || (state.mode === "book" ? "Book" : UNNAMED);
}

/**
 * Highest photo number used so far for an item, so numbering continues
 * after DONE and a reload. Counters come from sessionStorage as a plain object.
 * @param {Record<string, number>} counters
 * @param {string} itemName
 * @returns {number}
 */
export function currentCount(counters, itemName) {
    const v = counters ? counters[itemName] : 0;
    return Number.isInteger(v) && v > 0 ? v : 0;
}

/**
 * Take the next photo number for an item and return the updated counters.
 * @param {Record<string, number>} counters
 * @param {string} itemName
 * @returns {{n:number, counters:Record<string,number>}}
 */
export function nextNumber(counters, itemName) {
    const n = currentCount(counters, itemName) + 1;
    return { n, counters: { ...(counters || {}), [itemName]: n } };
}

// --- settings: the PC address and the key ----------------------------------

/**
 * Hosts the page may call. They must match connect-src in index.html's
 * Content-Security-Policy, or the browser blocks the call without a word.
 * A Tailscale Funnel address is https://<pc>.<tailnet>.ts.net; the loopback
 * hosts are for trying the page on the PC itself.
 */
const LOOPBACK = new Set(["127.0.0.1", "localhost"]);

/**
 * Check what was typed into Settings.
 *
 * @param {string} pcRaw  e.g. "https://pc.tail1234.ts.net"
 * @param {string} keyRaw one of the keys in CROSSLISTER_KEYS on the PC
 * @returns {{ok:true, pc:string, key:string} | {ok:false, error:string}}
 *          pc is the bare origin: scheme, host and port, no trailing slash
 */
export function checkSettings(pcRaw, keyRaw) {
    const pcText = typeof pcRaw === "string" ? pcRaw.trim() : "";
    const key = typeof keyRaw === "string" ? keyRaw.trim() : "";
    if (!pcText) return { ok: false, error: "Enter the server address." };
    let url;
    try {
        url = new URL(pcText);
    } catch {
        return { ok: false, error: "The server address is not a web address (https://...)." };
    }
    const loopback = LOOPBACK.has(url.hostname);
    if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
        return { ok: false, error: "The server address must start with https://" };
    }
    if (!loopback && !url.hostname.endsWith(".ts.net")) {
        return {
            ok: false,
            error: "The page may only call a Tailscale address: https://<pc>.<tailnet>.ts.net",
        };
    }
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
        return { ok: false, error: "Give the address only, with nothing after the name." };
    }
    if (!key) return { ok: false, error: "Enter the key." };
    // a header value: visible ASCII only, so no spaces, accents or line breaks
    if (!/^[\x21-\x7e]+$/.test(key)) {
        return { ok: false, error: "The key has a space or an unusual character in it." };
    }
    return { ok: true, pc: url.origin, key };
}

// --- the way in: the landing, sign-in, the home screen, the account ---------------
// Michal, 2026-10-08: "The name of the app should be Snap, a crosslisting app. Snap is
// simple. Note that for the first landing page." A phone with no server address and key
// and no session opens on the landing instead of the goods screen: Install, then two ways
// in, a key (Settings, as ever) or a sign-in link sent by email.

/**
 * The product's own server: where a sign-in link is asked for and a signed-in phone's
 * calls go. A person with a key types his own address instead (Settings).
 */
export const DEFAULT_SERVER = "https://michal-pc.mulley-themis.ts.net";

/** The header a signed-in phone's session travels in, where a key would. */
export const SESSION_HEADER = "X-Crosslister-Session";

/**
 * The header a call carries: the key when this phone has one, else the session it signed
 * in with; nothing for the sign-in calls themselves.
 * @param {{key?:string, session?:string}} [auth]
 * @returns {Record<string, string>}
 */
export function authHeaders({ key = "", session = "" } = {}) {
    if (key) return { [KEY_HEADER]: key };
    if (session) return { [SESSION_HEADER]: session };
    return {};
}

/**
 * The address a sign-in link is sent to, as typed: one @, something either side, a dot
 * in the domain. The server is the judge of the rest.
 * @param {unknown} raw
 * @returns {{ok:true, email:string} | {ok:false, error:string}}
 */
export function checkEmail(raw) {
    const email = typeof raw === "string" ? raw.trim() : "";
    if (!email) return { ok: false, error: "Enter your email address." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "That is not an email address." };
    return { ok: true, email };
}

/**
 * The token a sign-in link brings, from the page's hash (`#login=<token>`); "" for any
 * other hash.
 * @param {unknown} hash
 * @returns {string}
 */
export function loginToken(hash) {
    const m = typeof hash === "string" ? /^#login=([^&]+)$/.exec(hash) : null;
    if (!m) return "";
    try {
        return decodeURIComponent(m[1]).trim();
    } catch {
        return "";
    }
}

/**
 * POST /auth/session's answer: the session to keep, whose it is, and whether he ticked
 * Keep me signed in (kept on the phone) or not (kept for this tab only). Null when it
 * carries no session.
 * @param {unknown} answer
 * @returns {{session:string, user:string, remember:boolean} | null}
 */
export function sessionOf(answer) {
    const a = answer && typeof answer === "object" ? /** @type {Record<string, unknown>} */ (answer) : {};
    const session = typeof a.session === "string" ? a.session.trim() : "";
    if (!session || !/^[\x21-\x7e]+$/.test(session)) return null;
    return { session, user: typeof a.user === "string" ? a.user : "", remember: a.remember !== false };
}

/**
 * Said on the sign-in screen once the server has sent the link (Michal, 2026-10-08, reading
 * it on a PC: "it works on this phone" confused him there; the mail carries a code too).
 */
export const LINK_SENT = "Check your email. Open the link on this device, or enter the code from the mail below.";

/** Said when the server answers the sign-in routes with a 404: the sign-in lane is not there yet. */
export const SIGNIN_MISSING = "Sign-in is not set up on this server yet. Ask the developer for a key.";

/**
 * The line under the landing's buttons while one is hovered, focused or held (Michal,
 * 2026-10-08: "when you hover on I have a key, give a tooltip at the bottom below the
 * buttons: key allows you to join a family account; in a similar way explain install"):
 * what that button does, "" for no button.
 * @param {string} which "signin", "key", "install", or ""
 * @returns {string}
 */
export function landingHelp(which) {
    switch (which) {
        case "signin":
            return "Sign in with your email: a link and a code are mailed to you. The first visit creates your account.";
        case "key":
            return "A key lets you join a family account: the person who runs the server gives it to you.";
        case "install":
            return "Install puts Snap on your home screen as an app: full screen, its own icon, no browser bar.";
        default:
            return "";
    }
}

/** Said on the landing when the server no longer knows this phone's session (a 401). */
export const SIGNIN_EXPIRED = "Your sign-in expired; send yourself a new link";

/**
 * GET /auth/signup's answer: true when anyone with an email may make an account by asking
 * for a sign-in link; false for anything else (a closed server, or none that says).
 * @param {unknown} answer
 * @returns {boolean}
 */
export function signupOf(answer) {
    return !!answer && typeof answer === "object" && /** @type {Record<string, unknown>} */ (answer).open === true;
}

/**
 * The landing's Sign in and the sign-in screen's line (Michal, 2026-10-08: "What else do we
 * need for the multi tenant? Let's continue."): a server open to sign-ups says the same link
 * makes the account; otherwise the words are as they were.
 * @param {boolean} open signupOf's
 * @returns {{button:string, what:string}}
 */
export function signinWords(open) {
    return open
        ? {
              button: "Sign in or create an account",
              what: "We email you a link. New here? The same link creates your account; your first three postings are free.",
          }
        : { button: "Sign in", what: "We email you a link. Open it on this phone and you are in." };
}

/**
 * The landing's line when a sign-in link did not sign him in.
 * @param {number} status the PcError's (0: no answer)
 * @param {string} message errorText's words
 * @returns {string}
 */
export function signinError(status, message) {
    if (status === 404) return SIGNIN_MISSING;
    if ([400, 401, 403, 410].includes(status)) return "That sign-in link has expired or was used already. Send yourself a new link.";
    return `Could not sign in: ${message}.`;
}

/**
 * The six-digit code the sign-in mail carries beside its link (Michal, 2026-10-08: an
 * iPhone's home-screen app keeps its own storage and a mailed link always opens in Safari,
 * so the installed Snap signs in by the code). Spaces allowed, as a mail may group it;
 * "" for anything that is not six digits.
 * @param {unknown} raw
 * @returns {string}
 */
export function cleanCode(raw) {
    const code = typeof raw === "string" ? raw.replace(/\s+/g, "") : "";
    return /^\d{6}$/.test(code) ? code : "";
}

/** Said when the code box holds no six digits; nothing is sent. */
export const CODE_NEEDED = "Enter the six digits from the mail.";

/**
 * The sign-in screen's line when the code did not sign him in: a wrong code is the server's
 * own words (it allows five tries), a spent one asks for a new link, and an older server, which
 * takes only a link's token, refuses the code's body as malformed (422, or 400).
 * @param {number} status the PcError's (0: no answer)
 * @param {unknown} detail the server's detail, as it said it ("" when it said none)
 * @returns {string}
 */
export function codeError(status, detail) {
    const said = typeof detail === "string" ? detail.trim() : "";
    if (status === 401) return said ? `${said[0].toUpperCase()}${said.slice(1)}${/[.!?]$/.test(said) ? "" : "."}` : "That code is not right.";
    if (status === 410) return "That code was used or has expired; send yourself a new link.";
    if (status === 400 || status === 422) return "Codes are not available on this server yet; use the link in the mail.";
    if (status === 404) return SIGNIN_MISSING;
    return `Could not sign in: ${errorText(status, said)}.`;
}

/**
 * The sign-in screen's last line (Michal, 2026-10-08): in Safari on an iPhone, a sign-in
 * stays in Safari, never in the installed Snap, so he is told to ask from the app; nothing
 * anywhere else, the app itself included.
 * @param {{isIos:boolean, standalone:boolean}} where
 * @returns {string}
 */
export function signinNote({ isIos, standalone }) {
    return isIos && !standalone
        ? "On iPhone, sign in inside the installed Snap: open it from the home screen, ask for the link there, and enter the code from the mail."
        : "";
}

/**
 * The postings this account has left: unlimited (a key the server does not count), or so
 * many free and so many bought. Null when the server does not say.
 * @typedef {{unlimited:true} | {unlimited:false, free:number, bought:number}} Credits
 */

/**
 * A pack of postings Settings offers to buy: its id for POST /pay/checkout, how many
 * postings, and the price as the server writes it ("$5.00").
 * @typedef {{id:string, postings:number, price:string}} Pack
 */

/**
 * The account's eBay, connected from the phone (another seller's own): whose it is, and
 * whether the server has set up its business policies ("ready", "pending" or "failed: <why>").
 * @typedef {{connected:boolean, user:string, policies:string}} Ebay
 */

/**
 * GET /me: who this key or session is and what the account may do. Leniently read: a
 * craigslist or admin the server does not say is as today (craigslist on, admin off); no
 * credits, packs or eBay from an older server is no Account block to speak of. A sign-up
 * still under way (Michal, 2026-10-08) says `pending` (signed in by email, eBay not yet
 * connected: no user yet, only the email) or, connected, `registered` false until the
 * address is in; a server that says neither is an account as today, pending nothing.
 * @param {unknown} answer
 * @returns {{user:string, email:string, admin:boolean, craigslist:boolean, venues:string[], credits:Credits|null, packs:Pack[], ebay:Ebay|null, pending:boolean, registered:boolean} | null}
 */
export function meOf(answer) {
    if (!answer || typeof answer !== "object") return null;
    const a = /** @type {Record<string, unknown>} */ (answer);
    return {
        user: typeof a.user === "string" ? a.user : "",
        email: plain(a.email),
        admin: a.admin === true,
        craigslist: a.craigslist !== false,
        venues: Array.isArray(a.venues) ? a.venues.filter((v) => typeof v === "string") : [],
        credits: creditsOf(a.credits),
        packs: (Array.isArray(a.packs) ? a.packs : []).map(packOf).filter((p) => p !== null),
        ebay: ebayOf(a.ebay),
        pending: a.pending === true,
        registered: a.registered !== false,
    };
}

/** What a server answers every keyed route but /me, Connect eBay and Sign out while a sign-up waits for eBay (403). */
export const SIGNUP_UNFINISHED = "Connect eBay to finish signing up.";

/**
 * Where a sign-up stands (Michal, 2026-10-08): "ebay" while the account is pending (step 1,
 * Connect eBay), "address" once eBay made it a real account but the address is not in yet
 * (step 2, Settings' Seller address), "" once registered (the goods screen), and for no /me.
 * @param {{user:string, pending:boolean, registered:boolean} | null} me meOf's
 * @returns {""|"ebay"|"address"}
 */
export function signupStep(me) {
    if (!me) return "";
    if (me.pending) return "ebay";
    return me.user && !me.registered ? "address" : "";
}

/**
 * The Account block's first line while a sign-up waits for eBay: the email it was signed in
 * with, and that it is not an account yet.
 * @param {string} email
 * @returns {string}
 */
export function pendingLine(email) {
    return email ? `Signed in as ${email}, not registered yet` : "Signed in, not registered yet";
}

/**
 * A line saying what could not be done and why ("Could not read the inventory: <why>."), but
 * a sign-up's refusal (403, SIGNUP_UNFINISHED) said as the server says it, the one thing to do.
 * @param {string} lead
 * @param {number} status the PcError's
 * @param {string} message errorText's words
 * @returns {string}
 */
export function refusalLine(lead, status, message) {
    return status === 403 && message === SIGNUP_UNFINISHED ? message : `${lead}: ${message}.`;
}

/** A whole count the server gives, or null for anything that is not one. */
function wholeOf(x) {
    return typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : null;
}

/** /me's "credits": {"unlimited": true} or {"free_left": n, "bought_left": n}; null otherwise. */
function creditsOf(x) {
    if (!x || typeof x !== "object") return null;
    const c = /** @type {Record<string, unknown>} */ (x);
    if (c.unlimited === true) return { unlimited: true };
    const free = wholeOf(c.free_left);
    const bought = wholeOf(c.bought_left);
    if (free === null && bought === null) return null;
    return { unlimited: false, free: free || 0, bought: bought || 0 };
}

/** One of /me's "packs"; null for one with no id or no count of postings. */
function packOf(x) {
    if (!x || typeof x !== "object") return null;
    const p = /** @type {Record<string, unknown>} */ (x);
    const id = plain(p.id);
    const postings = wholeOf(p.postings);
    if (!id || !postings) return null;
    return { id, postings, price: plain(p.price) };
}

/** /me's "ebay"; null when the server does not say (an older server). */
function ebayOf(x) {
    if (!x || typeof x !== "object") return null;
    const e = /** @type {Record<string, unknown>} */ (x);
    return { connected: e.connected === true, user: plain(e.user), policies: plain(e.policies) };
}

/**
 * The Account block's first line: whose this phone is ("Signed in as anna" for a sign-in's
 * session, "Key: michal" for a key); "" when /me names nobody.
 * @param {string} user
 * @param {boolean} bySession
 * @returns {string}
 */
export function userLine(user, bySession) {
    if (!user) return "";
    return bySession ? `Signed in as ${user}` : `Key: ${user}`;
}

/** "1 posting", "3 postings". */
function postingsWord(n) {
    return `${n} ${n === 1 ? "posting" : "postings"}`;
}

/**
 * The credits line (Michal, 2026-10-08: three free postings per person, then prepaid
 * credits): "3 free postings left", "12 postings left", "2 free + 10 bought postings
 * left", "No postings left"; "" for an unlimited key or a server that does not count.
 * @param {Credits|null} credits
 * @returns {string}
 */
export function creditsLine(credits) {
    if (!credits || credits.unlimited) return "";
    const { free, bought } = credits;
    if (free && bought) return `${free} free + ${bought} bought postings left`;
    if (free) return `${free} free ${free === 1 ? "posting" : "postings"} left`;
    if (bought) return `${postingsWord(bought)} left`;
    return "No postings left";
}

/**
 * A pack's pill under Buy postings: "10 postings, $5.00" (the count alone without a price).
 * @param {Pack} pack
 * @returns {string}
 */
export function packLabel(pack) {
    const count = postingsWord(pack.postings);
    return pack.price ? `${count}, ${pack.price}` : count;
}

/**
 * The business policies' words after the eBay line: "setting up your policies..." while
 * the server makes them, "policies failed: <why>; contact the developer", and "policies
 * ready" only the once (`justReady`: a Save of the address, or the poll after it, saw them
 * ready); "" otherwise ("ready" any other time, "none", a server that does not say).
 * @param {string} state "ready" | "pending" | "failed: <why>" | "none"
 * @param {boolean} [justReady]
 * @returns {string}
 */
export function policiesLine(state, justReady = false) {
    if (state === "pending") return "setting up your policies...";
    if (/^failed\b/.test(state)) {
        const why = state.replace(/^failed:?/, "").trim();
        return `policies failed${why ? `: ${why}` : ""}; contact the developer`;
    }
    return state === "ready" && justReady ? "policies ready" : "";
}

/**
 * The account's eBay line: "eBay: connected as anna", with the business policies' state
 * while they are not ready (policiesLine), or "eBay: not connected"; "" when the server
 * does not say.
 * @param {Ebay|null} ebay
 * @param {boolean} [justReady] policiesLine's: "policies ready" said once
 * @returns {string}
 */
export function ebayLine(ebay, justReady = false) {
    if (!ebay) return "";
    if (!ebay.connected) return "eBay: not connected";
    const who = ebay.user ? `eBay: connected as ${ebay.user}` : "eBay: connected";
    const policies = policiesLine(ebay.policies, justReady);
    return policies ? `${who}; ${policies}` : who;
}

/**
 * Connect eBay's word, on Finish signing up's step 1 and in the Account block: "Connect eBay"
 * until it is, then the same button says so, lit green and done with (Michal, 2026-10-10: "It
 * better just say eBay connected on the same button, lit in green"): "eBay connected:
 * irenurmenet0", or "eBay connected" when the server does not name the user.
 * @param {boolean} connected
 * @param {string} user
 * @returns {string}
 */
export function connectLabel(connected, user) {
    if (!connected) return "Connect eBay";
    return user ? `eBay connected: ${user}` : "eBay connected";
}

// --- the seller's address (Michal, 2026-10-08: "What else do we need for the multi tenant?
// Let's continue."): another seller's listings ship from, and are picked up at, her own
// address; the server keeps it (GET/PATCH /me/seller) and sets up her eBay policies from it.

/** How often the page asks GET /me/seller again while eBay's policies are being set up. */
export const SELLER_POLL_MS = 10000;

/** ... and how many times at most: three minutes of asking. */
export const SELLER_POLL_MAX = 18;

/** The foldout's heading, and Finish signing up's step 2 (Michal, 2026-10-08: "then your address. what address?"). */
export const SHIP_FROM = "Address where you ship from";

/** Step 2 while the server's address came prefilled from her eBay account and is not confirmed yet. */
export const CONFIRM_SHIP_FROM = "Confirm the address where you ship from";

/** The foldout's line over an address prefilled from eBay (Michal, 2026-10-08). */
export const ADDRESS_PREFILLED = "Prefilled from your eBay account; change it if you ship from elsewhere.";

/**
 * What Snap sets up on her eBay once the address is in, listed under the boxes while it is
 * being given (Michal, 2026-10-08: "the address can pop up and be confirmed when reviewing the
 * policies, after connecting eBay"). The server's defaults, as `crosslister setup --all`
 * creates them: change them here and there together.
 */
export const POLICY_LINES = [
    "Shipping: USPS Ground Advantage, buyer pays, 1 business day handling",
    "Returns: 30 days, buyer pays return shipping",
    "Local pickup only, for items you mark pickup only",
    "Your ship-from location: the address above",
];

/**
 * The foldout's line when it opens by itself (eBay is connected and the address is missing),
 * said under step 2 of Finish signing up too: what the address is for, and who sees what.
 */
export const ADDRESS_NEEDED =
    "eBay puts it on every listing as the item's location and uses it for shipping rates and local pickup. Street, city, state and ZIP; buyers see the city and state.";

/**
 * The seller's address as the server keeps it, whether it is all there, and her eBay.
 * @typedef {{address:{line1:string, city:string, state:string, postal_code:string}, complete:boolean, ebay:Ebay|null}} Seller
 */

/**
 * GET (or PATCH) /me/seller's answer; null for one that is not one (no address and no
 * word on whether it is complete).
 * @param {unknown} answer
 * @returns {Seller|null}
 */
export function sellerOf(answer) {
    if (!answer || typeof answer !== "object") return null;
    const a = /** @type {Record<string, unknown>} */ (answer);
    const at = a.address && typeof a.address === "object" ? /** @type {Record<string, unknown>} */ (a.address) : null;
    if (!at && typeof a.complete !== "boolean") return null;
    const field = (k) => (at ? plain(at[k]) : "");
    return {
        address: { line1: field("line1"), city: field("city"), state: field("state"), postal_code: field("postal_code") },
        complete: a.complete === true,
        ebay: ebayOf(a.ebay),
    };
}

/**
 * Where the seller's address stands: "complete" (all there), "prefilled" (the server filled
 * some of it from her eBay account on connect, to be confirmed: Michal, 2026-10-08), or
 * "empty" (none of it, or no answer).
 * @param {Seller|null} seller
 * @returns {"empty"|"prefilled"|"complete"}
 */
export function addressState(seller) {
    if (!seller) return "empty";
    if (seller.complete) return "complete";
    return Object.values(seller.address).some((v) => v !== "") ? "prefilled" : "empty";
}

/**
 * The foldout's own line: why it opens by itself when Settings does (eBay connected, the
 * address not all there: that is the moment it is needed), or where a prefilled one came
 * from; "" otherwise, and it stays folded.
 * @param {Seller|null} seller
 * @returns {string}
 */
export function sellerLine(seller) {
    if (!seller || seller.complete || !seller.ebay || !seller.ebay.connected) return "";
    return addressState(seller) === "prefilled" ? ADDRESS_PREFILLED : ADDRESS_NEEDED;
}

/**
 * Save address's body, from the four boxes as typed: each trimmed (inner spaces one), the
 * state two letters upper-cased, the ZIP five digits; a ZIP+4 typed is taken, its first five
 * sent (Michal, 2026-10-10), so it comes back five after Save. A box that is not right is
 * named, and nothing is sent.
 * @param {{line1?:unknown, city?:unknown, state?:unknown, zip?:unknown}} fields
 * @returns {{ok:true, body:{address:{line1:string, city:string, state:string, postal_code:string}}} | {ok:false, error:string}}
 */
export function addressBody({ line1, city, state, zip } = {}) {
    const text = (x) => (typeof x === "string" ? x.trim().replace(/\s+/g, " ") : "");
    const street = text(line1);
    if (!street) return { ok: false, error: "Enter the street address." };
    const town = text(city);
    if (!town) return { ok: false, error: "Enter the city." };
    const st = text(state).toUpperCase();
    if (!/^[A-Z]{2}$/.test(st)) return { ok: false, error: "The state is two letters, as IL." };
    const z = /^(\d{5})(?:[- ]?\d{4})?$/.exec(text(zip));
    if (!z) return { ok: false, error: "The ZIP is five digits, as 60601." };
    return { ok: true, body: { address: { line1: street, city: town, state: st, postal_code: z[1] } } };
}

/**
 * The foldout's line when Save address did not go: a server without the route (404) has it
 * not available yet; a refusal (400 naming the field, the admin's 409: the address is in the
 * server's .env) is the server's own words; anything else says what went wrong.
 * @param {number} status the PcError's (0: no answer)
 * @param {string} message errorText's words
 * @returns {string}
 */
export function sellerError(status, message) {
    if (status === 404) return "Saving the address is not available yet.";
    if (status === 400 || status === 409) return message;
    return `Could not save the address: ${message}.`;
}

/**
 * Where the page came back from, by its hash: Stripe's checkout (`#paid=<postings>` or
 * `#paid=cancelled`) or eBay's consent through the server (`#ebay=connected`, or
 * `#ebay=failed` and `#ebay=failed:<reason>`, the value kept whole). Null for any other hash,
 * a sign-in link's `#login=` included.
 * @param {unknown} hash
 * @returns {{kind:"paid"|"ebay", value:string} | null}
 */
export function returnHash(hash) {
    const m = typeof hash === "string" ? /^#(paid|ebay)=([^&]+)$/.exec(hash) : null;
    if (!m) return null;
    const value = m[2];
    if (m[1] === "paid" && (value === "cancelled" || /^[1-9]\d*$/.test(value))) return { kind: "paid", value };
    if (m[1] === "ebay" && (value === "connected" || /^failed(:[\w-]+)?$/.test(value))) return { kind: "ebay", value };
    return null;
}

/** eBay's consent came back for an eBay account another Snap account already has (`#ebay=failed:taken`). */
export const EBAY_TAKEN = "That eBay account is already connected to another Snap account. Sign in to that one, or use a different eBay account.";

/**
 * What the Account block says on the way back (returnHash): "10 postings added",
 * "Payment cancelled", "eBay connected", or that eBay did not connect: an eBay account
 * already another Snap account's said so (Michal, 2026-10-08), any other reason generically.
 * @param {{kind:"paid"|"ebay", value:string}} back
 * @returns {string}
 */
export function returnLine(back) {
    if (back.kind === "ebay") {
        if (back.value === "connected") return "eBay connected";
        return back.value === "failed:taken" ? EBAY_TAKEN : "eBay did not connect; try again or contact the developer";
    }
    return back.value === "cancelled" ? "Payment cancelled" : `${postingsWord(Number(back.value))} added`;
}

/**
 * The Account block's line when Buy postings (`pay`) or Connect eBay (`connect`) could not
 * go: a server without the route (404) has it not available yet; payments not set up (503)
 * is the server's own words; anything else says what went wrong.
 * @param {"pay"|"connect"} what
 * @param {number} status the PcError's (0: no answer)
 * @param {string} message errorText's words
 * @returns {string}
 */
export function accountError(what, status, message) {
    if (status === 404) return what === "pay" ? "Buying postings is not available yet." : "Connecting eBay is not available yet.";
    if (status === 503) return message;
    return what === "pay" ? `Could not open the payment page: ${message}.` : `Could not open eBay: ${message}.`;
}

/**
 * Under the craigslist button, and in an empty craigslist card, for an account without it:
 * where to ask for it (Michal, 2026-10-10), the page's own Feedback in Admin.
 */
export const CRAIGSLIST_OFF = "Craigslist is not available for your account yet. Ask for it in Admin, Feedback.";

/**
 * Whether this account may use a venue (Michal, 2026-10-08: "Keep the Craigslist button
 * gray and when tapped write 'contact developer'"): only craigslist can be off, and only
 * when /me says so; no answer (an older server's 404) is everything as today.
 * @param {{craigslist:boolean} | null} me
 * @param {string} venue
 * @returns {boolean}
 */
export function venueAllowed(me, venue) {
    return venue !== "craigslist" || !me || me.craigslist !== false;
}

/** A dismissed home-screen banner stays away this long. */
export const INSTALL_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

/** The banner's words on the goods screen. */
export const INSTALL_BANNER = "Add Snap to your home screen for the full-screen app";

/**
 * The install nudge (Michal, 2026-10-08: "If it is not on the home screen it should
 * direct towards that install. Can that be done even though I have already used it?
 * Would the website know?"): nothing from the home screen (display-mode standalone, or
 * an iPhone's navigator.standalone), nothing for a week after a dismissal, the browser's
 * own install prompt where Chrome offered one (kept from beforeinstallprompt), and the
 * two taps spelled out everywhere else. A desktop browser is not nudged at all (Michal,
 * 2026-10-08: Install below sign-in, smaller, and gone on a desktop).
 * @param {{standalone:boolean, hasPrompt:boolean, isIos:boolean, desktop?:boolean, dismissedAt?:unknown, now:number}} o
 * @returns {"hidden"|"prompt"|"steps"}
 */
export function installState({ standalone, hasPrompt, isIos, desktop = false, dismissedAt = "", now }) {
    if (standalone || desktop) return "hidden";
    const at = typeof dismissedAt === "string" && dismissedAt ? Date.parse(dismissedAt) : NaN;
    if (Number.isFinite(at) && now - at < INSTALL_SNOOZE_MS) return "hidden";
    // Safari never offers the prompt: an iPhone is always told the two taps
    return hasPrompt && !isIos ? "prompt" : "steps";
}

/**
 * The two taps that put the page on the home screen, where the browser offers no prompt.
 * @param {boolean} isIos
 * @returns {string}
 */
export function installSteps(isIos) {
    return isIos
        ? "Tap Share, then Add to Home Screen."
        : "Open the browser menu, then Add to Home screen (or Install app).";
}

/**
 * An iPhone or iPad, whose Safari has Share > Add to Home Screen and no install prompt
 * (an iPad asks for the desktop site, so it says Mac with a touch screen).
 * @param {{userAgent?:unknown, platform?:unknown, maxTouchPoints?:unknown}} nav
 * @returns {boolean}
 */
export function isIosDevice({ userAgent = "", platform = "", maxTouchPoints = 0 } = {}) {
    if (typeof userAgent === "string" && /iPhone|iPad|iPod/.test(userAgent)) return true;
    return platform === "MacIntel" && typeof maxTouchPoints === "number" && maxTouchPoints > 1;
}

/**
 * A desktop browser: no touch at all, and not an iPhone or iPad. A browser that does not say
 * how many touch points it has is not counted as one.
 * @param {{userAgent?:unknown, platform?:unknown, maxTouchPoints?:unknown}} nav
 * @returns {boolean}
 */
export function isDesktopBrowser(nav = {}) {
    return nav.maxTouchPoints === 0 && !isIosDevice(nav);
}

// --- feedback and the stats (Admin) -----------------------------------------------

/** Said once POST /feedback answered 201; the box clears. */
export const FEEDBACK_SENT = "Thanks, sent.";

/**
 * Where the feedback was written from: the posting screen Admin was opened from ("goods",
 * "book"), "admin" when Admin was opened with neither behind it, and "card" once a
 * listing was looked at in this visit to Admin.
 * @param {string} from
 * @param {boolean} sawCard
 * @returns {"goods"|"book"|"admin"|"card"}
 */
export function feedbackScreen(from, sawCard) {
    if (sawCard) return "card";
    return from === "goods" || from === "book" ? from : "admin";
}

/**
 * POST /feedback's body: the words trimmed, the screen, the page's version and, when he
 * left Include my last job ticked and the page has one, that job's id. Null for a blank box.
 * @param {{text:unknown, screen:string, version:string, job?:string}} o
 * @returns {{text:string, screen:string, version:string, job?:string} | null}
 */
export function feedbackBody({ text, screen, version, job = "" }) {
    const words = typeof text === "string" ? text.trim() : "";
    if (!words) return null;
    return { text: words, screen, version, ...(job ? { job } : {}) };
}

/**
 * One new entry of the admin's Feedback inbox, as the screen shows it.
 * @typedef {{id:string, user:string, created:string, text:string, screen:string, error:string}} InboxEntry
 */

/**
 * GET /feedback?new=1 (the admin's inbox, newest first): each entry with an id not yet
 * reviewed, its job's error when it failed; anything else is dropped.
 * @param {unknown} answer
 * @returns {InboxEntry[]}
 */
export function inboxOf(answer) {
    const a = answer && typeof answer === "object" ? /** @type {Record<string, any>} */ (answer) : {};
    return (Array.isArray(a.entries) ? a.entries : [])
        .filter((e) => e && typeof e === "object" && plain(e.id) && e.reviewed !== true)
        .map((e) => ({
            id: plain(e.id),
            user: plain(e.user),
            created: plain(e.created),
            text: plain(e.text),
            screen: plain(e.screen),
            error: e.job && typeof e.job === "object" ? plain(e.job.error) : "",
        }));
}

/**
 * An inbox entry's first line: who, when (the phone's own time), from which screen.
 * @param {InboxEntry} entry
 * @param {number} [offsetMinutes] listedAtWord's
 * @returns {string}
 */
export function inboxHead(entry, offsetMinutes) {
    return [entry.user || "someone", listedAtWord(entry.created, offsetMinutes), entry.screen].filter(Boolean).join(" · ");
}

/**
 * The Feedback foldout's word: with the count of new entries in the admin's inbox, when
 * there are any ("Feedback (3)").
 * @param {number} count
 * @returns {string}
 */
export function feedbackWord(count) {
    return count > 0 ? `Feedback (${count})` : "Feedback";
}

/** The Stats chips, in their order on screen; 30 days unless another is tapped. */
export const STATS_SINCE = ["7d", "30d", "all"];
export const DEFAULT_STATS_SINCE = "30d";

/**
 * GET /stats's query for a chip; the default for one the page does not know.
 * @param {unknown} since
 * @returns {string}
 */
export function statsQuery(since) {
    return `since=${STATS_SINCE.includes(/** @type {string} */ (since)) ? since : DEFAULT_STATS_SINCE}`;
}

/** A count as the server gives it; 0 for anything that is not one. */
function countOf(x) {
    const n = typeof x === "string" && x.trim() !== "" ? Number(x) : x;
    return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
}

/** A model cost ("12.34") in dollars; NO_PRICE when the server has none. */
function costWord(x) {
    const s = plain(x);
    return s ? `$${s}` : NO_PRICE;
}

/**
 * GET /stats drawn as Admin's small table: one line per figure, then one row per user
 * (name, actions, posted, model cost). Counts only: no listing's title ever reaches it. The
 * server's jobs are "Actions sent" on screen (Michal, 2026-10-08: "I don't understand the
 * jobs count on the stats."): each press that reached the server is one, a posting per venue,
 * an end, a refresh, a push, a sync; index.html's note under the table says so.
 * @param {unknown} answer
 * @returns {{rows:[string, string][], users:[string, string, string, string][]}}
 */
export function statsTable(answer) {
    const a = answer && typeof answer === "object" ? /** @type {Record<string, any>} */ (answer) : {};
    const jobs = a.jobs && typeof a.jobs === "object" ? a.jobs : {};
    const posted = a.posted && typeof a.posted === "object" ? a.posted : {};
    /** @type {[string, string][]} */
    const rows = [
        [
            "Actions sent",
            `${countOf(jobs.total)}: ${countOf(jobs.done)} done, ${countOf(jobs.failed)} failed, ${countOf(jobs.cancelled)} cancelled`,
        ],
        ...Object.keys(posted).map((venue) => /** @type {[string, string]} */ ([`posted on ${venueName(venue)}`, String(countOf(posted[venue]))])),
        ["drafted", String(countOf(a.drafted))],
        ["ended", String(countOf(a.ended))],
        ["pushed", String(countOf(a.pushed))],
        ["model cost", costWord(a.model_cost)],
    ];
    const users = (Array.isArray(a.per_user) ? a.per_user : [])
        .filter((u) => u && typeof u === "object")
        .map((u) => /** @type {[string, string, string, string]} */ ([plain(u.user), String(countOf(u.jobs)), String(countOf(u.posted)), costWord(u.model_cost)]));
    return { rows, users };
}

// --- the look: dark, light or the device's ---------------------------------

/**
 * The Appearance chips in Settings, in their order on screen (Michal, 2026-10-06: "In
 * settings I want to have the mode options. Dark, light or sync with device").
 */
export const THEMES = [
    { value: "dark", label: "Dark" },
    { value: "light", label: "Light" },
    { value: "device", label: "Sync with device" },
];

/**
 * The look as stored on the phone: "dark", "light", or "device" for anything else,
 * nothing saved included, so a phone that never chose follows its own setting.
 * @param {unknown} text
 * @returns {"dark"|"light"|"device"}
 */
export function themeOf(text) {
    return text === "dark" || text === "light" ? text : "device";
}

/**
 * The value of `data-theme` on <html> for a look: "dark" or "light" when one is chosen,
 * "" for the device's (the attribute goes, and styles.css follows the device).
 * @param {unknown} theme
 * @returns {"dark"|"light"|""}
 */
export function themeAttr(theme) {
    const t = themeOf(theme);
    return t === "device" ? "" : t;
}

/**
 * What the two theme-color metas say for a look. `grounds` is what index.html gives them
 * (`light` the plain one, `dark` the one for a dark device); a chosen look puts its own
 * ground on both, so the status bar matches the page whatever the device says.
 * @param {unknown} theme
 * @param {{light:string, dark:string}} grounds
 * @returns {{light:string, dark:string}}
 */
export function statusBarColors(theme, grounds) {
    const attr = themeAttr(theme);
    return attr ? { light: grounds[attr], dark: grounds[attr] } : { ...grounds };
}

// --- shrinking a photo before it is sent -----------------------------------

/** The long edge a photo is shrunk to before it is sent. */
export const MAX_EDGE = 2000;

/** JPEG quality of the shrunk photo. */
export const JPEG_QUALITY = 0.85;

/**
 * The size to draw a width x height photo at so its long edge is at most
 * `max`. Never enlarges; keeps the aspect ratio; never returns a 0 side.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} [max]
 * @returns {{width:number, height:number}}
 */
export function fitWithin(width, height, max = MAX_EDGE) {
    for (const [name, v] of [
        ["width", width],
        ["height", height],
        ["max", max],
    ]) {
        if (!Number.isInteger(v) || v <= 0) {
            throw new RangeError(`${name} must be a positive integer`);
        }
    }
    const long = Math.max(width, height);
    if (long <= max) return { width, height };
    const scale = max / long;
    return width >= height
        ? { width: max, height: Math.max(1, Math.round(height * scale)) }
        : { width: Math.max(1, Math.round(width * scale)), height: max };
}

// --- the service contract ----------------------------------------------------

/** The venues the two buttons send. */
export const VENUES = ["ebay", "craigslist"];

/** The most photos one item may carry (the service refuses more). */
export const MAX_PHOTOS = 24;

/** How often a running job is asked for its status. */
export const POLL_MS = 3000;

/**
 * How long a press that starts a job waits before it is sent (Michal, 2026-10-02:
 * "delay sending by 1 second, but show loading, so that if one cancels within 1
 * sec there is no call money spent"): the ring turns at once, the request goes
 * after this, and a tap on the button until then holds the press on the phone
 * (paused), so its reset costs nothing. Every job button waits it: the venue
 * buttons, a listing's Post, Refresh status, End listing and Sync to eBay, and the
 * sync bar's two.
 */
export const SEND_DELAY_MS = 1000;

/**
 * The second line inside a busy job button, small, while a tap on it still pauses
 * the job (Michal, 2026-10-07: "The button, within it, should just get 'tap again
 * to cancel' instead of an external cancel line. The writing should be within it,
 * below, and should be small, and appear just when the button action is
 * doing/loading"). It walks back 2026-10-02's "below in red there should be a
 * cancel button" on purpose: the red cancel under the button is gone.
 */
export const TAP_TO_CANCEL = "tap again to cancel";

/**
 * The word of a paused job button. Its first tap while busy pauses it, shown at
 * once (Michal, 2026-10-07, after a model call he could not cancel: "Better: show
 * that it cancelled immediately, stop the loading button etc. The cancel should
 * change to 'reset call' (as in discard) and the button should change to
 * 'continue', in case one would want to continue what was already received etc.
 * Each cancel should operate this way"): the ring stops, nothing is sent to the PC,
 * and a tap on continue carries on where it was.
 */
export const CONTINUE = "continue";

/**
 * The small red control beside a paused job button: the real cancel ("Only pressing
 * it twice actually drops all the info and resets the operation as if nothing
 * happened, and waits for a new press of the button"). A press held on the phone is
 * dropped, nothing paid; a job the PC has is told to stop (DELETE /jobs/<id>).
 */
export const RESET = "reset";

/** The status line under a paused press nothing has left the phone for: it is held. */
export const PAUSED = "paused";

/** ... and under one whose job is the PC's: the page stops watching it, the PC does not stop. */
export const PAUSED_ON_PC = "paused: the server may still be working on it";

/** The line under a job button whose press was reset, or dropped by the PC before it ran. */
export const CANCELLED = "cancelled";

/**
 * Said for a moment under a job button tapped from the PC's publishing step on
 * (Michal, 2026-10-07: "Perhaps after pressing cancel it should say 'too late to
 * cancel'?"); the tap changes nothing else, and the step's own words come back.
 */
export const TOO_LATE = "too late to cancel: it is publishing";

/** How long TOO_LATE stays under the button. */
export const TOO_LATE_MS = 2500;

/** How the PC's step reads once a posting is going up ("publishing B-1 on ebay", "publishing on craigslist for B-1"). */
export const PUBLISHING_PREFIX = "publishing";

/**
 * Whether a pressed venue button says "tap again to cancel" under its word and a
 * tap on it pauses its job: from the press until the publish begins, the link or
 * the error, and not while paused (a tap then continues). Within the first second
 * the press is held on the phone, nothing paid; after that the job is the PC's and
 * only reset tells it to stop. From the PC's publishing step on there is nothing
 * left to stop (Michal, 2026-10-03: "after a posting is published ... can't cancel
 * it now. cancel only makes sense in mid-load"): a tap says TOO_LATE.
 * @param {SnapState} state
 * @param {string} venue
 * @returns {boolean}
 */
export function cancelButton(state, venue) {
    const job = state.jobs[venue];
    return !!job && isActive(job) && !publishing(job) && !job.paused;
}

/**
 * What a tap on a venue button does: "send" a new press, "pause" a busy one
 * (cancelButton), "continue" a paused one, and from the publishing step on only
 * say it is "late" (TOO_LATE).
 * @param {SnapState} state
 * @param {string} venue
 * @returns {"send"|"pause"|"continue"|"late"}
 */
export function venueTap(state, venue) {
    const job = state.jobs[venue];
    if (job.paused) return "continue";
    if (cancelButton(state, venue)) return "pause";
    return isActive(job) ? "late" : "send";
}

/** @param {VenueJob} job */
function publishing(job) {
    return job.phase === "running" && job.step.startsWith(PUBLISHING_PREFIX);
}

/**
 * cancelButton's rule for Admin's job buttons (a listing's Post, Refresh status,
 * End listing and Sync to eBay, the sync bar's two): within the press's first
 * second (`press`), or while its job is on the PC's queue or in hand short of the
 * publishing step; not while paused, nor while something else is on its way to
 * the PC (the POST itself, customize's save before a push).
 * @param {{press?:unknown, wait:string, job:{state?:string, step?:string}|null, paused?:boolean}} task
 * @returns {boolean}
 */
export function taskCancel(task) {
    if (task.paused) return false;
    if (task.press) return true;
    return !task.wait && jobRunning(task.job) && !plain(task.job && task.job.step).startsWith(PUBLISHING_PREFIX);
}

/**
 * venueTap for an Admin job button that is pressed: "pause", "continue", "late" from
 * the publishing step on, or "" while its POST (or customize's save) is on its way.
 * @param {{press?:unknown, wait:string, job:{state?:string, step?:string}|null, paused?:boolean}} task
 * @returns {"pause"|"continue"|"late"|""}
 */
export function taskTap(task) {
    if (task.paused) return "continue";
    if (taskCancel(task)) return "pause";
    return !task.wait && jobRunning(task.job) ? "late" : "";
}

/**
 * The word on the Snap button: "Snap", and "Snap Again" once the item has a
 * photo (Michal, 2026-09-30: "after the first snap it should say 'Snap Again'
 * on that button. That will be cute").
 * @param {SnapState} state
 * @returns {string}
 */
export function snapWord(state) {
    return state.photos.length > 0 ? "Snap Again" : "Snap";
}

/**
 * Where the Snap button should sit when the page comes back from the camera:
 * the camera's shutter is about three quarters of the way down the screen,
 * and his thumb is still there (Michal, 2026-09-30: "I want the snap button to
 * be right there, so I can click quickly").
 */
export const SNAP_SPOT = 0.75;

/**
 * The page scroll that puts the button's middle at `SNAP_SPOT` of the viewport.
 * The browser clamps a value the page is too short for.
 * @param {{scrollY:number, innerHeight:number}} view
 * @param {{top:number, height:number}} rect  the button, relative to the viewport
 * @returns {number}
 */
export function snapScrollTop(view, rect) {
    return Math.max(0, Math.round(view.scrollY + rect.top + rect.height / 2 - view.innerHeight * SNAP_SPOT));
}

/** The header the key travels in. */
export const KEY_HEADER = "X-Crosslister-Key";

/**
 * The JSON body one press of a venue button sends to POST /jobs.
 *
 * A new item: the item (its folder on the PC, where every photo already is),
 * the venue, and the numbers of the photos marked AI. The second button for
 * the same item: the sku and the venue only -- the PC reuses the row it saved,
 * so there is no second model call.
 *
 * @param {object} o
 * @param {string} o.venue
 * @param {string} [o.sku]    known once the first job has saved the row
 * @param {string} [o.item]   the item's id on the PC
 * A book: the item (its photos) and the book itself -- the ISBN (or, with no
 * ISBN, the title, author, year and format he typed), the condition chip, the
 * price box and the number of the photo marked main. No AI marks: the
 * catalogue says what the book is, so there is no model call, and a book goes
 * to eBay only.
 *
 * @param {{n:number, ai:boolean}[]} [o.photos]
 * @param {BookJob} [o.book]  from bookForm()
 * @param {Customize} [o.customize]  from customizeOf(): the quantity, pickup only, the price
 *        grade and auto-post ride along, top-level, in every one of the three bodies -- the
 *        sku's too, since the PC updates the saved row before it posts it again
 *        (customizeBody says when)
 * @returns {({sku:string, venue:string} | {item:string, venue:string, ai:number[]}
 *          | {item:string, venue:string, book:BookJob}) & CustomizeBody}
 */
export function jobRequest({ venue, sku = "", item = "", photos = [], book = undefined, customize = undefined }) {
    if (!VENUES.includes(venue)) throw new RangeError(`unknown venue ${venue}`);
    const extra = customizeBody(customize);
    if (book) return { item, venue, book: { ...book }, ...extra };
    if (sku) return { sku, venue, ...extra };
    return { item, venue, ai: photos.filter((p) => p.ai).map((p) => p.n), ...extra };
}

// --- customize: the quantity, pickup only, the price grade, auto-post -----------
// Michal, 2026-09-28: "Before the eBay and Craigslist buttons I would like to
// have a little arrow with the word customize. If clicked I want to be able to
// edit quantity. Also I want to be able to check pickup only. And it would be a
// pickup only item on eBay then." Nearly everything he lists is one of a kind
// and shipped, so both sit folded away, and left alone they send nothing new:
// the body is exactly what it was before customize existed.
//
// Michal, 2026-10-06: "in customize, there should be a slider for price
// preference (3 grade) 1 (quicksell what we have) 2 (fair price longer wait
// time) 3 (higher end price - probably cheaper options exist in the
// marketplace). these need to be reflected in the prompt. 1 by default." and
// "in customize it also should have a checkbox for post without asking - which
// is our default now." Both defaults are what the PC already did, so they too
// send nothing new.
//
// Michal, 2026-10-07: "Let's abandon checking eBay for similar items (call 1) and
// put that toggle default off, in customization." So eBay's comparable listings
// reach the first draft only when he ticks Compare with eBay listings; left
// alone, the body says nothing of them and the PC leaves them out.

/**
 * What customize holds, per item (goods: state.customize; a book: state.book.customize).
 * @typedef {Object} Customize
 * @property {string} quantity   the box as typed ("1" until he changes it); quantityValue() reads it
 * @property {boolean} pickupOnly  no shipping on eBay: the buyer collects it
 * @property {1|2|3} pricing     the price grade (PRICING): 1 a quick sale, the default
 * @property {boolean} autoPost  the PC publishes (the default); off, it saves the row and the
 *                               button posts it on the next press
 * @property {boolean} comps     eBay's similar listings go to the AI for the first draft; off
 *                               by default
 */

/**
 * What customize adds to a job's body, each key only when it is not the default.
 * @typedef {{quantity?:number, pickup_only?:true, pricing?:2|3, auto_post?:false, comps?:true}} CustomizeBody
 */

/**
 * The three price grades, in Michal's words: the word under the slider's track
 * and the line under the slider. The PC writes the grade into the model's prompt.
 */
export const PRICING = [
    { grade: 1, word: "Quick sale", note: "sell what we have this week" },
    { grade: 2, word: "Fair price", note: "a fair price, a longer wait" },
    { grade: 3, word: "Higher end", note: "a higher-end price; cheaper ones exist out there" },
];

/** "1 by default": a quick sale, what the PC did before there was a slider. */
export const DEFAULT_PRICING = 1;

/** @returns {Customize} */
export function initialCustomize() {
    return { quantity: "1", pickupOnly: false, pricing: DEFAULT_PRICING, autoPost: true, comps: false };
}

/**
 * A price grade as the slider (a string) or storage (a number) gives it; 0 when
 * it is not one of the three.
 * @param {unknown} x
 * @returns {0|1|2|3}
 */
export function pricingGrade(x) {
    const n = typeof x === "string" && x.trim() !== "" ? Number(x) : x;
    const hit = PRICING.find((p) => p.grade === n);
    return hit ? /** @type {1|2|3} */ (hit.grade) : 0;
}

/**
 * The grade's word and line; the default's for anything else.
 * @param {unknown} grade
 * @returns {{grade:number, word:string, note:string}}
 */
export function pricingOf(grade) {
    return PRICING.find((p) => p.grade === pricingGrade(grade)) || PRICING[0];
}

/**
 * A done job with no link, pressed with auto-post off: the PC saved the row and
 * did not publish it. Said under the button, which opens again: the next press
 * posts that row by its sku.
 */
export const SAVED_NOT_POSTED = "saved, not posted";

/**
 * The PC saved this venue's row without publishing it (auto-post was off for the
 * press): the button is open again and its next press posts the row.
 * @param {VenueJob} job
 * @returns {boolean}
 */
export function savedNotPosted(job) {
    return job.phase === "done" && !job.link && job.held === true;
}

/**
 * The quantity box as a number: a whole number, 1 or more; 0 when it is not
 * one ("", "0", "1.5", "two"), which keeps the venue buttons shut. Kept as
 * typed in the state (as the book's price is) so a half-typed box is not
 * rewritten under his thumb.
 * @param {unknown} text
 * @returns {number}
 */
export function quantityValue(text) {
    const bare = typeof text === "number" ? String(text) : typeof text === "string" ? text.trim() : "";
    if (!/^\d+$/.test(bare)) return 0;
    const n = Number(bare);
    return Number.isSafeInteger(n) && n >= 1 ? n : 0;
}

/** The line under the buttons while the quantity is not a quantity. */
export const QUANTITY_HINT = "Quantity (under customize) must be a whole number, 1 or more";

/** The quiet word under ebay, before the press, once pickup only is ticked: he sees it took. */
export const PICKUP_NOTE = "pickup only";

/** Under both buttons, before the press, once Compare with eBay listings is ticked. */
export const COMPS_NOTE = "with eBay comparisons";

/**
 * This item's customize: a book keeps its own in the book slice, goods at the top.
 * @param {SnapState} state
 * @returns {Customize}
 */
export function customizeOf(state) {
    return state.mode === "book" ? state.book.customize : state.customize;
}

/**
 * What customize adds to a job's body: `quantity` only when it is not 1,
 * `pickup_only` only when ticked, `pricing` only when it is not 1,
 * `auto_post: false` only when unticked and `comps: true` only when ticked, so
 * an item left alone sends the same body as ever (and the PC's defaults, 1,
 * shipped, a quick sale, published and no comparisons, apply).
 * @param {Customize} [customize]
 * @returns {CustomizeBody}
 */
export function customizeBody(customize) {
    if (!customize) return {};
    /** @type {CustomizeBody} */
    const out = {};
    const quantity = quantityValue(customize.quantity);
    if (quantity > 1) out.quantity = quantity;
    if (customize.pickupOnly === true) out.pickup_only = true;
    const grade = pricingGrade(customize.pricing);
    if (grade > DEFAULT_PRICING) out.pricing = /** @type {2|3} */ (grade);
    if (customize.autoPost === false) out.auto_post = false;
    if (customize.comps === true) out.comps = true;
    return out;
}

/**
 * The line under a venue button before it is pressed: what customize changed,
 * so he sees it took, joined with " · ": "pickup only" under ebay once ticked
 * (craigslist is pickup anyway), the price grade when it is not a quick sale,
 * "saved, not posted" while auto-post is off, and "with eBay comparisons" once
 * ticked. Nothing when left alone.
 * @param {SnapState} state
 * @param {string} venue
 * @returns {string}
 */
export function venueIdleNote(state, venue) {
    const c = customizeOf(state);
    const said = [];
    if (venue === "ebay" && c.pickupOnly) said.push(PICKUP_NOTE);
    if (pricingGrade(c.pricing) > DEFAULT_PRICING) said.push(pricingOf(c.pricing).word.toLowerCase());
    if (c.autoPost === false) said.push(SAVED_NOT_POSTED);
    if (c.comps === true) said.push(COMPS_NOTE);
    return said.join(" · ");
}

/** Customize read back from storage after a reload; anything odd is the default. */
function recoveredCustomize(saved) {
    const c = initialCustomize();
    if (!saved || typeof saved !== "object") return c;
    if (typeof saved.quantity === "string") c.quantity = saved.quantity;
    else if (typeof saved.quantity === "number") c.quantity = String(saved.quantity);
    c.pickupOnly = saved.pickupOnly === true;
    c.pricing = pricingGrade(saved.pricing) || DEFAULT_PRICING;
    c.autoPost = saved.autoPost !== false;
    c.comps = saved.comps === true;
    return c;
}

/**
 * Customize as savedItem keeps it: nothing at all while it is the default; the
 * price grade, auto-post and the comparisons only when they are not, so an item
 * saved before they existed and one left alone read the same.
 */
function savedCustomize(c) {
    const grade = pricingGrade(c.pricing) || DEFAULT_PRICING;
    const plainly = c.quantity === "1" && !c.pickupOnly && grade === DEFAULT_PRICING && c.autoPost !== false;
    if (plainly && c.comps !== true) return {};
    return {
        customize: {
            quantity: c.quantity,
            pickupOnly: c.pickupOnly,
            ...(grade === DEFAULT_PRICING ? {} : { pricing: grade }),
            ...(c.autoPost === false ? { autoPost: false } : {}),
            ...(c.comps === true ? { comps: true } : {}),
        },
    };
}

// Michal, 2026-10-08: "The customize section should have a 'Save as default' button at
// the end, in case someone wants to change something permanently." Kept per kind on this
// phone: the price grade and the three ticks, never the quantity (nor the user note, which
// is not customize's); every new item starts from them.

/**
 * What Save as default keeps of a customize, and what a new item starts from.
 * @typedef {{pricing:1|2|3, autoPost:boolean, comps:boolean, pickupOnly:boolean}} CustomizeDefaults
 */

/** Said beside Save as default for a moment. */
export const DEFAULTS_SAVED = "saved as your defaults";

/** How long DEFAULTS_SAVED stays. */
export const DEFAULTS_SAVED_MS = 2500;

/**
 * One kind's defaults from a customize (or from storage, leniently: anything odd is the
 * plain default).
 * @param {unknown} c
 * @returns {CustomizeDefaults}
 */
export function defaultsOf(c) {
    const r = recoveredCustomize(c);
    return { pricing: /** @type {1|2|3} */ (r.pricing), autoPost: r.autoPost, comps: r.comps, pickupOnly: r.pickupOnly };
}

/**
 * The defaults saved on this phone, both kinds, as `snap.customize.defaults` holds them
 * ({"goods": {...}, "book": {...}}); nothing saved, or anything unreadable, is the plain default.
 * @param {unknown} raw
 * @returns {{goods:CustomizeDefaults, book:CustomizeDefaults}}
 */
export function customizeDefaults(raw) {
    const all = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
    return { goods: defaultsOf(all.goods), book: defaultsOf(all.book) };
}

/**
 * A new item's customize from the defaults of its kind; the quantity stays as it is.
 * @param {SnapState} state
 * @param {{goods:CustomizeDefaults, book:CustomizeDefaults}} defaults
 * @returns {SnapState}
 */
export function applyDefaults(state, defaults) {
    const d = (defaults || customizeDefaults(null))[state.mode === "book" ? "book" : "goods"];
    return withCustomize(state, (c) => ({ ...c, ...d }));
}

/** Customize changed, in the right place for the item's kind; fixed while a job is on its way. */
function withCustomize(state, fn) {
    if (anyActive(state)) return state;
    if (state.mode === "book") {
        return { ...state, book: { ...state.book, customize: fn(state.book.customize) } };
    }
    return { ...state, customize: fn(state.customize) };
}

/**
 * The one line an error from the PC is shown as.
 * The service answers errors as JSON {"detail": "..."}: 400 with a message,
 * 401 for a missing or wrong key, 404 for an item or job it does not know.
 *
 * @param {number} status HTTP status, 0 when the PC could not be reached
 * @param {unknown} [detail] the `detail` field of the answer, if any
 * @returns {string}
 */
export function errorText(status, detail) {
    if (status === 0) return "cannot reach the server";
    if (status === 401) return "wrong key - check Settings";
    if (typeof detail === "string" && detail) return detail;
    if (status === 404) return "the server does not know this item or job";
    return `the server answered ${status}`;
}

/** How often the page asks the PC whether it is there, while the page is on screen. */
export const HEALTH_MS = 30000;

/**
 * The server word in the header and in Settings, from the last check the page
 * made by itself (GET /jobs?limit=1: the PC answers and knows the key).
 * @param {boolean} settingsOk a PC address and key are saved
 * @param {number|null} status null: not checked yet; 200: fine; else the PcError status (0 = no answer)
 * @returns {{text:string, kind:"ok"|"bad"|""}}
 */
export function serverLine(settingsOk, status) {
    if (!settingsOk) return { text: "server not set", kind: "" };
    if (status === null) return { text: "checking server...", kind: "" };
    if (status === 200) return { text: "server ok", kind: "ok" };
    if (status === 401) return { text: "wrong key", kind: "bad" };
    // a sign-up waiting for eBay is refused everything but /me: the server answered all the same
    if (status === 403) return { text: "server ok", kind: "ok" };
    return { text: "server off", kind: "bad" };
}

/**
 * Only an http(s) address becomes a tappable link.
 * @param {unknown} url
 * @returns {string} the url, or "" when it is not one
 */
export function safeLink(url) {
    if (typeof url !== "string") return "";
    try {
        const u = new URL(url);
        return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
    } catch {
        return "";
    }
}

// --- page state --------------------------------------------------------------

/**
 * @typedef {Object} Photo
 * @property {string} id
 * @property {string} name  e.g. "Boots-3.jpg"
 * @property {number} n     1-based number within the item; the file on the PC is nn.jpg
 * @property {boolean} ai   sent to the model when true; every photo goes to the listing
 * @property {"waiting"|"sending"|"sent"|"failed"} status  on its way to the PC, or there
 * @property {string} error why the PC refused it
 * @property {boolean} tried a PUT was started, so the PC may hold it (the x then deletes it there)
 * @property {boolean} local the page holds the picture; false for one read back from the PC
 */

/**
 * One venue button's job.
 * @typedef {Object} VenueJob
 * @property {"idle"|"sending"|"queued"|"running"|"done"|"failed"} phase
 * @property {string} jobId
 * @property {string} step     what the PC says it is doing, or what the page is doing
 * @property {number} ahead    jobs in front of this one
 * @property {string} link     the posting, once done
 * @property {string} error    why it failed
 * @property {string} trouble  a status poll that failed; the job itself may be fine
 * @property {string} price    the saved row's price as the PC says it ("14.00"), "" until the
 *                             row is saved; the line above the buttons shows it (priceLine)
 * @property {string} title    the saved row's title as the PC says it, "" until the row is
 *                             saved; the small line above the price shows it (titleLine)
 * @property {boolean} held    pressed with auto-post off: the PC saves the row and does not
 *                             publish it, so done with no link is "saved, not posted"
 * @property {boolean} paused  tapped while busy: a press still on the phone is held, a job
 *                             the PC has is no longer asked about, until continue or reset
 * @property {boolean} stopping reset after the PC had it: the press reads cancelled, and the
 *                             job (by jobId) is asked about until the PC says it stopped
 * @property {boolean} credit  refused for want of postings (POST /jobs answered 402): the
 *                             line under the button offers Buy postings
 */

/**
 * @typedef {Object} SnapState
 * @property {string} itemName
 * @property {string} itemId      the item's folder on the PC, once made; kept until DONE
 * @property {Photo[]} photos
 * @property {number[]} deletes   photo numbers still to delete on the PC
 * @property {boolean} online
 * @property {{text:string, sentText:(string|null), due:boolean}} note
 *           sentText: what the PC has (null: nothing sent yet); due: send it now
 * @property {null|{kind:string}} busy  the one request in flight (queue.js)
 * @property {boolean} stalled    the PC could not be reached; waiting to try again
 * @property {number} failures    failed tries in a row, for the wait before the next
 * @property {string} problem     the last failure, shown while stalled
 * @property {string} sku   the saved row, once the first job reports it
 * @property {Record<string, VenueJob>} jobs
 * @property {"goods"|"book"} mode  which kind of item this is; the page keeps one of each
 * @property {BookSlice} book       the book's own fields (untouched in goods mode)
 * @property {Customize} customize  goods' customize (a book's is in its slice)
 * @property {null|{photos:number}} nameTaken  the PC already has an item of this name today
 * @property {boolean} unnamed    goods made on the PC with no name (POST /items {"name": ""}):
 *                                the listing's title names it; a name typed since is `label`
 * @property {string} serverName  the name the PC gave an unnamed item ("Unnamed 2026-10-08 1701")
 * @property {string} label       a name typed after an unnamed item was made: the phone's only,
 *                                for the history (the PC has no rename)
 * @property {boolean} needsName  the PC refused a blank name (an older server, 400): goods need
 *                                their name typed first again, as before 2.15.0
 */

/**
 * The book mode's own fields. The item name of a book is "Book <isbn13>", so
 * the PC's folder is "Book 9780306406157 <date>" and the same book scanned
 * twice the same day is the same folder, as with goods. A book with no ISBN is
 * named by its title instead, "Book <cleaned title>", so the folder on the PC
 * still says which book it is.
 * @typedef {Object} BookSlice
 * @property {string} isbn       13 digits once a valid ISBN was scanned or typed, else ""
 * @property {boolean} isbnMiss  the PC answered 404 for that ISBN: no catalogue knows it. No ISBN
 *                               then keeps it (it still names the folder and goes on the listing)
 *                               and the typed fields describe the book; a new ISBN clears it
 * @property {BookLookup} lookup the PC's answer to GET /books/<isbn> (or /books/search)
 * @property {string} condition  one of CONDITIONS' values
 * @property {string} price      the price box as typed (bookPriceValue() reads it)
 * @property {string} autoPrice  the price the page itself put in the box (a suggestion), ""
 *                               once he typed one: a later answer may replace only this
 * @property {number} main       the number n of the photo that leads the listing; 0 while
 *                               there is no photo. Always one of the photos once there is
 *                               one: the first by default (settleMain keeps it so)
 * @property {boolean} manual    No ISBN is open: the book is looked up by the fields below, and
 *                               the ISBN box is ignored (a valid ISBN closes it again); it is
 *                               named by them too, unless it has an ISBN no catalogue knows
 * @property {string} title      the fields under No ISBN, as typed
 * @property {string} author
 * @property {string} year
 * @property {string} format     one of FORMATS' values, paperback by default
 * @property {boolean} formatChosen  he tapped a format chip: a catalogue match no longer sets it
 * @property {Customize} customize   the book's own customize
 */

/**
 * @typedef {Object} BookLookup
 * @property {"idle"|"looking"|"found"|"missing"|"failed"} phase
 *           missing: not in the catalogues (404, by ISBN only); failed: the PC could not look
 *           (its words in error)
 * @property {""|"isbn"|"title"} by  what the book was looked up by
 * @property {boolean} matched   a catalogue knows it (always, when found by ISBN); a book found
 *                               by title that none knows is listed as typed
 * @property {null|ReturnType<typeof bookRecord>} record  the book, once found
 * @property {string} price      the PC's suggested price, "" when it has none
 * @property {null|{count:number, low:string, high:string}} listings  eBay's listings as the PC saw them
 * @property {string} route      "list", "lot or buyback" or "unknown"
 * @property {string} error
 */

/**
 * What a book's job carries (POST /jobs "book"). With an ISBN the four typed
 * fields are ""; without one the ISBN is "" and the title is what he typed;
 * with an ISBN no catalogue knows, both: the ISBN, and the title he typed.
 * @typedef {Object} BookJob
 * @property {string} isbn
 * @property {string} title
 * @property {string} author
 * @property {string} year
 * @property {""|"paperback"|"hardcover"} format
 * @property {string} condition
 * @property {string} price
 * @property {number} main
 */

/** The kinds of item the switch at the top chooses between. */
export const MODES = ["goods", "book"];

/** @returns {BookLookup} */
function idleLookup() {
    return { phase: "idle", by: "", matched: false, record: null, price: "", listings: null, route: "", error: "" };
}

/** The fields under No ISBN, empty. */
function blankManual() {
    return { manual: false, title: "", author: "", year: "", format: DEFAULT_FORMAT, formatChosen: false };
}

/** @returns {BookSlice} */
function initialBook() {
    return {
        isbn: "",
        isbnMiss: false,
        lookup: idleLookup(),
        condition: DEFAULT_CONDITION,
        price: "",
        autoPrice: "",
        main: 0,
        ...blankManual(),
        customize: initialCustomize(),
    };
}

/** @returns {VenueJob} */
export function idleJob() {
    return {
        phase: "idle",
        jobId: "",
        step: "",
        ahead: 0,
        link: "",
        error: "",
        trouble: "",
        price: "",
        title: "",
        held: false,
        paused: false,
        stopping: false,
        credit: false,
    };
}

/**
 * @param {string} [itemName]
 * @param {"goods"|"book"} [mode]
 * @returns {SnapState}
 */
export function initialState(itemName = "", mode = "goods") {
    return {
        mode: MODES.includes(mode) ? mode : "goods",
        book: initialBook(),
        itemName,
        itemId: "",
        photos: [],
        deletes: [],
        online: true,
        note: { text: "", sentText: null, due: false },
        busy: null,
        stalled: false,
        failures: 0,
        problem: "",
        sku: "",
        jobs: Object.fromEntries(VENUES.map((v) => [v, idleJob()])),
        customize: initialCustomize(),
        nameTaken: null,
        unnamed: false,
        serverName: "",
        label: "",
        needsName: false,
    };
}

const ACTIVE = new Set(["sending", "queued", "running"]);

/** @param {VenueJob} job */
export function isActive(job) {
    return ACTIVE.has(job.phase);
}

/** True while any button's job is on its way or on the PC. */
export function anyActive(state) {
    return VENUES.some((v) => isActive(state.jobs[v]));
}

/**
 * Once a job is on its way or has saved the row, the strip is what was
 * posted: no more snapping, deleting or marking for this item. A job that
 * failed before the row was saved unlocks it again.
 */
export function photosLocked(state) {
    return !!state.sku || anyActive(state);
}

/**
 * The one reducer. Pure: returns a new state, never mutates.
 * Actions:
 *   {type:"setItem", itemName}            the name box; once an unnamed item is made, its label
 *   {type:"add", id, name, n}             a photo taken; it waits for the upload queue
 *   {type:"remove", id}                   the x; a photo the PC may hold is deleted there too
 *   {type:"toggleAi", id}
 *   {type:"retry", id}                    tap on a failed photo
 *   {type:"online", online}
 *   {type:"noteText", text}
 *   {type:"noteDue"}                      he stopped typing: send the note
 *   {type:"reset"}                        NEXT (once DONE): the next item
 *   {type:"taskStart", task}              the upload queue (queue.js) sends a request
 *   {type:"taskDone", task, answer}
 *   {type:"taskFailed", task, status, error}  status 0: the PC could not be reached
 *   {type:"resume"}                       try the stalled queue again
 *   {type:"recovered", itemName, itemId, ai, answer}  a reload, read back from GET /items/<id>
 *                                         (an unnamed item's unnamed, serverName and label too)
 *   {type:"jobSending", venue, step}
 *   {type:"jobAccepted", venue, job, ahead}
 *   {type:"jobRefused", venue, error, credit}  the POST did not become a job (credit: a 402,
 *                                         no postings left)
 *   {type:"jobPaused", venue}             the busy button tapped (while cancelButton says so)
 *   {type:"jobResumed", venue}            continue
 *   {type:"jobCancelled", venue, stopping}  reset (stopping: the PC was told and is to be heard
 *                                         from), or the PC dropped the job before it ran
 *   {type:"jobStatus", venue, status}     an answer to GET /jobs/<id>
 *   {type:"pollTrouble", venue, error}    that GET failed; keep asking
 *   {type:"setQuantity", text}            the quantity box under customize, as typed
 *   {type:"setPickupOnly", on}            the pickup only box under customize
 *   {type:"setPricing", grade}            the price slider under customize: 1, 2 or 3
 *   {type:"setAutoPost", on}              the post without asking box under customize
 *                                         (all four: this item's kind's own; fixed while a job is on its way)
 * The book mode:
 *   {type:"setMode", mode}                "goods" or "book": what kind of item this state holds
 *   {type:"bookIsbn", isbn}               a valid ISBN-13 scanned or typed, or "" (fixed once the item is on the PC)
 *   {type:"bookManual", open}             No ISBN: open the title fields, or close and clear them
 *                                         (after an ISBN miss the ISBN is kept either way)
 *   {type:"bookField", field, text}       "title", "author" or "year" under No ISBN, as typed
 *   {type:"bookFormat", format}           the paperback | hardcover chip
 *   {type:"bookName"}                     he stopped typing: the title names the book's folder
 *   {type:"bookLookupStart", key}         GET /books/<isbn> (or /books/search) goes; key is
 *                                         lookupKey(book) when it went (an ISBN also as `isbn`)
 *   {type:"bookLookupDone", key, answer}  the PC answered
 *   {type:"bookLookupFailed", key, status, error}  404 by ISBN: not in the catalogues (and
 *                                         isbnMiss, so No ISBN keeps the ISBN); else the PC's words
 *   {type:"bookCondition", condition}     a condition chip
 *   {type:"bookPrice", text}              the price box, as typed
 *   {type:"bookMain", id}                 the "main" mark on a photo: it leads the listing
 *
 * A book always has exactly one main photo once it has any: the first by
 * default, so doing nothing keeps the order the photos were taken in. Every
 * action that adds, drops or renumbers photos ends in settleMain().
 *
 * @param {SnapState} state
 * @param {{type:string}&Record<string,any>} action
 * @returns {SnapState}
 */
export function reduce(state, action) {
    switch (action.type) {
        case "setItem": {
            // the folder is made: a named item's name is fixed; a name typed for an unnamed
            // one is the phone's own, for the history (Michal, 2026-10-08: the name is optional)
            if (state.itemId) return state.unnamed ? { ...state, label: action.itemName } : state;
            // photos taken before the name was typed wear it, as a book's do its ISBN
            const next = { ...state, itemName: action.itemName, nameTaken: null };
            return { ...next, photos: next.photos.map((p) => ({ ...p, name: buildFileName(photoStem(next), p.n) })) };
        }
        case "nameTaken":
            // the PC's answer to a name typed earlier means nothing for the one typed since
            if (action.itemName !== state.itemName || state.itemId) return state;
            return { ...state, nameTaken: { photos: toCount(action.photos) } };
        case "add":
            return settleMain({
                ...state,
                photos: [
                    ...state.photos,
                    {
                        id: action.id,
                        name: action.name,
                        n: action.n,
                        ai: false,
                        status: "waiting",
                        error: "",
                        tried: false,
                        local: true,
                    },
                ],
            });
        case "remove": {
            const gone = state.photos.find((p) => p.id === action.id);
            if (!gone) return state;
            const photos = state.photos.filter((p) => p !== gone);
            const deletes =
                gone.tried && !state.deletes.includes(gone.n)
                    ? [...state.deletes, gone.n]
                    : state.deletes;
            // the main photo gone: the mark goes back to the first one left
            return settleMain({ ...state, photos, deletes });
        }
        case "toggleAi":
            return patchPhoto(state, action.id, (p) => ({ ...p, ai: !p.ai }));
        case "retry":
            return patchPhoto(state, action.id, (p) =>
                p.status === "failed" ? { ...p, status: "waiting", error: "" } : p
            );
        case "online":
            // back online: the stalled queue goes again at once
            return action.online
                ? { ...state, online: true, stalled: false }
                : { ...state, online: false };
        case "noteText":
            return {
                ...state,
                note: {
                    ...state.note,
                    text: typeof action.text === "string" ? action.text : "",
                    due: false,
                },
            };
        case "noteDue":
            return { ...state, note: { ...state.note, due: true } };
        case "reset":
            // the next item is of the same kind: DONE on a book starts the next book; a
            // server that wants names still does
            return { ...initialState("", state.mode), online: state.online, needsName: state.needsName };

        case "taskStart": {
            const next = { ...state, busy: action.task };
            if (action.task.kind !== "photo") return next;
            return patchPhoto(next, action.task.id, (p) => ({
                ...p,
                status: "sending",
                tried: true,
                error: "",
            }));
        }
        case "taskDone":
            // the item made on the PC may renumber the photos (adoptItem)
            return settleMain(
                taskDone(
                    { ...state, busy: null, stalled: false, failures: 0, problem: "" },
                    action.task,
                    action.answer || {}
                )
            );
        case "taskFailed":
            return taskFailed({ ...state, busy: null }, action.task, action.status, action.error);
        case "resume":
            return { ...state, stalled: false };
        case "recovered":
            return settleMain(recovered(state, action));

        case "jobSending":
            return withJob(state, action.venue, (job) => ({
                ...idleJob(),
                phase: "sending",
                step: action.step || "sending",
                // auto-post off: this press saves the row, unless it is the press
                // after "saved, not posted" -- that one posts it
                held: customizeOf(state).autoPost === false && !savedNotPosted(job),
            }));
        case "jobAccepted":
            return withJob(state, action.venue, (job) => ({
                ...idleJob(),
                phase: "queued",
                jobId: String(action.job),
                ahead: toCount(action.ahead),
                held: job.held,
                // paused while its POST was on its way: still paused, now the PC's
                paused: job.paused,
            }));
        case "jobRefused":
            return withJob(state, action.venue, () => ({
                ...idleJob(),
                phase: "failed",
                error: action.error || "not sent",
                credit: action.credit === true,
            }));
        case "jobPaused":
            return cancelButton(state, action.venue)
                ? withJob(state, action.venue, (job) => ({ ...job, paused: true }))
                : state;
        case "jobResumed":
            return withJob(state, action.venue, (job) => ({ ...job, paused: false }));
        case "jobCancelled":
            // reset: the press dropped as if never made, the button free for a new one; a job
            // the PC has (stopping) is kept by its id until the PC says it stopped
            return withJob(state, action.venue, (job) => ({
                ...idleJob(),
                phase: "failed",
                error: CANCELLED,
                jobId: action.stopping === true ? job.jobId : "",
                stopping: action.stopping === true,
            }));
        case "jobStatus": {
            const s = action.status || {};
            const phase = ["queued", "running", "done", "failed"].includes(s.state)
                ? s.state
                : "running";
            const running = phase === "queued" || phase === "running";
            const sku = typeof s.sku === "string" ? s.sku : "";
            const withSku = (next) => (sku && !next.sku ? { ...next, sku } : next);
            // reset, the PC still stopping: only the row it saved is taken (the next press posts it)
            const was = state.jobs[action.venue];
            if (was && was.stopping && running) return withSku(state);
            const next = withJob(state, action.venue, (job) => ({
                ...job,
                phase,
                step: typeof s.step === "string" ? s.step : "",
                ahead: toCount(s.ahead),
                link: safeLink(s.links ? s.links[action.venue] : ""),
                error: phase === "failed" ? String(s.error || "failed") : "",
                trouble: "",
                // blank until the PC saved the row; once known, a later blank does not unsay it
                price: priceText(s.price) || job.price,
                title: (typeof s.title === "string" && s.title.trim()) || job.title || "",
                // a job that ended is neither paused nor stopping any more
                paused: job.paused && running,
                stopping: false,
            }));
            return withSku(next);
        }
        case "pollTrouble":
            return withJob(state, action.venue, (job) => ({
                ...job,
                trouble: action.error || "cannot reach the server",
            }));
        case "setQuantity": {
            const quantity = typeof action.text === "string" ? action.text : String(action.text ?? "");
            return withCustomize(state, (c) => ({ ...c, quantity }));
        }
        case "setPickupOnly":
            return withCustomize(state, (c) => ({ ...c, pickupOnly: action.on === true }));
        case "setPricing": {
            const grade = pricingGrade(action.grade);
            return grade ? withCustomize(state, (c) => ({ ...c, pricing: grade })) : state;
        }
        case "setAutoPost":
            return withCustomize(state, (c) => ({ ...c, autoPost: action.on !== false }));
        case "setComps":
            return withCustomize(state, (c) => ({ ...c, comps: action.on === true }));

        case "setMode":
            return MODES.includes(action.mode) ? { ...state, mode: action.mode } : state;
        case "bookIsbn":
            return bookIsbn(state, typeof action.isbn === "string" ? action.isbn : "");
        case "bookManual":
            return bookManual(state, !!action.open);
        case "bookField":
            return bookField(state, action.field, typeof action.text === "string" ? action.text : "");
        case "bookFormat":
            if (!state.book.manual || !FORMATS.some((f) => f.value === action.format)) return state;
            return { ...state, book: { ...state.book, format: action.format, formatChosen: true } };
        case "bookName":
            return bookName(state);
        case "bookLookupStart":
            return withLookup(state, action.key ?? action.isbn, (book) => ({
                ...idleLookup(),
                phase: "looking",
                by: lookupBy(book),
            }));
        case "bookLookupDone":
            return bookFound(state, action.key ?? action.isbn, action.answer || {});
        case "bookLookupFailed": {
            const next = withLookup(state, action.key ?? action.isbn, (book) => ({
                ...idleLookup(),
                by: lookupBy(book),
                // a title no catalogue knows is not a dead end: only an ISBN can be "missing"
                phase: action.status === 404 && !book.manual ? "missing" : "failed",
                error: action.error || "the book was not looked up",
            }));
            // remembered past the card: No ISBN keeps this ISBN for the listing
            if (next === state || next.book.lookup.phase !== "missing") return next;
            return { ...next, book: { ...next.book, isbnMiss: true } };
        }
        case "bookCondition":
            return CONDITIONS.some((c) => c.value === action.condition)
                ? { ...state, book: { ...state.book, condition: action.condition } }
                : state;
        case "bookPrice":
            // typed by him: his from now on, whatever a later lookup suggests
            return {
                ...state,
                book: { ...state.book, price: typeof action.text === "string" ? action.text : "", autoPrice: "" },
            };
        case "bookMain": {
            // like the AI marks, fixed once the listing is on its way
            const photo = state.photos.find((p) => p.id === action.id);
            if (state.mode !== "book" || !photo || photosLocked(state) || photo.n === state.book.main) {
                return state;
            }
            return { ...state, book: { ...state.book, main: photo.n } };
        }
        default:
            return state;
    }
}

/**
 * A book's main photo is always one of its photos: the one he marked while it
 * is there, else the first. No photos, no main (0). Returns the same state when
 * nothing needs to change, so a no-op action stays a no-op.
 * @param {SnapState} state
 * @returns {SnapState}
 */
function settleMain(state) {
    if (state.mode !== "book") return state;
    const { main } = state.book;
    if (state.photos.some((p) => p.n === main)) return state;
    const first = state.photos.length > 0 ? state.photos[0].n : 0;
    return first === main ? state : { ...state, book: { ...state.book, main: first } };
}

/**
 * A new ISBN names the book, and so its folder on the PC: "Book <isbn13>".
 * Once that folder is made the ISBN is fixed until DONE, as the goods item name
 * is. Before that, photos taken meanwhile (a cover snapped before the barcode
 * was scanned or the ISBN typed) wait on the page for the name and are
 * relabelled with it; a different book starts its lookup and price afresh.
 */
function bookIsbn(state, isbn) {
    if (state.itemId) return state;
    let s = state;
    if (s.book.manual) {
        // No ISBN is open: the ISBN box is ignored, until a valid ISBN is in it
        // after all -- then that is the book, and the typed title goes (the
        // ISBN kept after a miss is already the book's: it changes nothing)
        if (!isbn || isbn === s.book.isbn) return state;
        s = bookManual(s, false);
    }
    if (isbn === s.book.isbn) return s;
    return renamed(
        { ...s, book: { ...s.book, isbn, isbnMiss: false, lookup: idleLookup(), price: "", autoPrice: "" } },
        isbn ? `Book ${isbn}` : ""
    );
}

/**
 * The book's item name, and the photos waiting for it relabelled with it
 * ("Book-1.jpg" while there is none).
 */
function renamed(state, itemName) {
    return {
        ...state,
        itemName,
        photos: state.photos.map((p) => ({ ...p, name: buildFileName(itemName || "Book", p.n) })),
    };
}

/**
 * No ISBN, tapped: the title fields open, and the ISBN (if any) is set aside;
 * tapped again: they close and what was typed in them goes. Either way the
 * book is a different book now, so its lookup starts afresh and a price the
 * page suggested goes with the old one (a price he typed stays). Once the
 * book's folder is on the PC, what names it is fixed until DONE.
 *
 * After an ISBN no catalogue knows the ISBN is not set aside: it goes on the
 * listing, and it still names the folder, so the fields open (and close) even
 * once the folder is on the PC -- they only describe the book. Closed again,
 * the ISBN is asked about afresh (the lookup is idle).
 */
function bookManual(state, open) {
    if (open === state.book.manual) return state;
    const { book } = state;
    if (state.itemId && !book.isbnMiss) return state;
    const suggested = book.autoPrice && book.price === book.autoPrice;
    const next = {
        ...book,
        ...blankManual(),
        manual: open,
        lookup: idleLookup(),
        price: suggested ? "" : book.price,
        autoPrice: "",
    };
    if (book.isbnMiss) return { ...state, book: next };
    return renamed({ ...state, book: { ...next, isbn: "" } }, "");
}

const TYPED_FIELDS = ["title", "author", "year"];

/**
 * A keystroke in the title, author or year. When it changes what the PC would
 * be asked, the last answer no longer describes the book: the lookup goes back
 * to idle (the card says it is about to look) until the search goes again.
 */
function bookField(state, field, text) {
    if (!state.book.manual || !TYPED_FIELDS.includes(field) || state.book[field] === text) return state;
    const before = lookupKey(state.book);
    const book = { ...state.book, [field]: text };
    if (lookupKey(book) !== before) book.lookup = idleLookup();
    return { ...state, book };
}

/**
 * He stopped typing: the title names the book's folder on the PC,
 * "Book <cleaned title>", capped as a goods name is. The photos that waited
 * for a name go with it. Fixed once the folder is made, as an ISBN is. A kept
 * ISBN (one no catalogue knows) goes on naming it.
 */
function bookName(state) {
    if (state.itemId || !state.book.manual || state.book.isbnMiss) return state;
    const title = cleanItemName(bookSearch(state.book).title);
    const itemName = title ? cleanItemName(`Book ${title}`) : "";
    return itemName === state.itemName ? state : renamed(state, itemName);
}

/**
 * What the book is looked up by, as one string: the ISBN, or (No ISBN) the
 * title, author and year as they would be sent. "" while there is nothing to
 * look up. An answer is kept only while this is still the same.
 * @param {BookSlice} book
 * @returns {string}
 */
export function lookupKey(book) {
    if (!book.manual) return book.isbn;
    const q = bookSearch(book);
    return q.title ? JSON.stringify([q.title, q.author, q.year]) : "";
}

/** @param {BookSlice} book */
function lookupBy(book) {
    return book.manual ? "title" : "isbn";
}

/** The PC's answer about a book, kept only while it is still the book in the box. */
function withLookup(state, key, fn) {
    if (!key || key !== lookupKey(state.book)) return state;
    return { ...state, book: { ...state.book, lookup: fn(state.book) } };
}

/**
 * Found: the card, the listings, and the price box filled with the suggestion
 * unless he typed one (a suggestion of an earlier answer is replaced: he typed
 * more of the title and the PC found a better match). A book found by title
 * that a catalogue matched sets the format chip too, until he taps one himself.
 */
function bookFound(state, key, answer) {
    const price = bookPriceValue(typeof answer.price === "string" ? answer.price : String(answer.price ?? ""));
    const next = withLookup(state, key, (book) => ({
        ...idleLookup(),
        phase: "found",
        by: lookupBy(book),
        // by ISBN the catalogue always knows it; by title only when the PC says so
        matched: !book.manual || answer.found === true,
        record: bookRecord(answer),
        price,
        listings: bookListings(answer.listings),
        route: typeof answer.route === "string" ? answer.route : "",
    }));
    if (next === state) return next;
    const book = { ...next.book };
    // found by its ISBN after all (asked again): a catalogue knows it now
    if (!book.manual) book.isbnMiss = false;
    const typed = book.price.trim() !== "" && book.price !== book.autoPrice;
    if (!typed && (price || book.autoPrice)) {
        book.price = price;
        book.autoPrice = price;
    }
    const format = book.lookup.matched ? formatOf(book.lookup.record.format) : "";
    if (book.manual && !book.formatChosen && format) book.format = format;
    return { ...next, book };
}

/**
 * What a book's job carries besides the item: the ISBN -- or, with No ISBN,
 * the title, author, year and format he typed (the PC searches and lists by
 * them) -- the condition chip, the price as the PC should list it, and the
 * number of the main photo (always sent: the ebay button needs a photo, so
 * there is always one). The fields that do not apply are sent as "".
 *
 * An ISBN no catalogue knows, with No ISBN opened after it, sends both: the
 * ISBN (the PC keeps it on the listing) and the typed fields (the PC takes the
 * title and the rest from them, since the catalogues have nothing).
 * @param {SnapState} state
 * @returns {BookJob}
 */
export function bookForm(state) {
    const { book } = state;
    const typed = book.manual ? bookSearch(book) : { title: "", author: "", year: "" };
    return {
        isbn: book.manual && !book.isbnMiss ? "" : book.isbn,
        title: typed.title,
        author: typed.author,
        year: typed.year,
        format: book.manual ? book.format : "",
        condition: book.condition,
        price: bookPriceValue(book.price),
        main: book.main,
    };
}

function taskDone(state, task, answer) {
    switch (task.kind) {
        case "item":
            return adoptItem(state, answer);
        case "photo":
            return patchPhoto(state, task.id, (p) => ({ ...p, status: "sent", error: "" }));
        case "delete":
            return { ...state, deletes: state.deletes.filter((n) => n !== task.n) };
        case "note":
            return { ...state, note: { ...state.note, sentText: task.text } };
        default:
            return state;
    }
}

function taskFailed(state, task, status, error) {
    const why = error || "not sent";
    // a blank name refused: a server from before 2.15.0, which names every folder by what
    // was typed; the photos wait on the page for the name, as they did then
    if (task.kind === "item" && !task.name && status === 400) return { ...state, needsName: true };
    if (status !== 0) {
        // the PC answered and refused: a photo shows it (tap to retry); a
        // delete of something already gone is done; the rest is tried again
        if (task.kind === "photo") {
            return patchPhoto(state, task.id, (p) => ({ ...p, status: "failed", error: why }));
        }
        if (task.kind === "delete" && status === 404) {
            return { ...state, deletes: state.deletes.filter((n) => n !== task.n) };
        }
    }
    const stalled = { ...state, stalled: true, failures: state.failures + 1, problem: why };
    if (task.kind !== "photo") return stalled;
    return patchPhoto(stalled, task.id, (p) =>
        p.status === "sending" ? { ...p, status: "waiting" } : p
    );
}

/**
 * The item exists on the PC. The same name the same day is the same item
 * there, so it may already hold photos: they join the strip as sent, and the
 * photos waiting here are numbered on after them so nothing is overwritten.
 * Goods asked for with no name are an unnamed item, a new folder of the PC's
 * naming ("Unnamed 2026-10-08 1701", kept as `serverName`).
 */
function adoptItem(state, answer) {
    const itemId = typeof answer.item === "string" ? answer.item : "";
    if (!itemId) {
        return {
            ...state,
            stalled: true,
            failures: state.failures + 1,
            problem: "the server gave no item",
        };
    }
    const unnamed = state.mode !== "book" && !state.itemName;
    const made = {
        ...state,
        itemId,
        unnamed,
        serverName: unnamed && typeof answer.name === "string" ? answer.name.trim() : "",
    };
    const existing = numbers(answer.photos);
    if (existing.length === 0) return made;
    let next = Math.max(...existing);
    let { main } = state.book;
    const stem = photoStem(state);
    const waiting = state.photos.map((p) => {
        next += 1;
        // a book's main mark follows its photo to the new number
        if (p.n === state.book.main) main = next;
        return { ...p, n: next, name: buildFileName(stem, next) };
    });
    const there = existing.map((n) => photoOnPc(state.mode, stem, n, false));
    return { ...made, photos: [...there, ...waiting], book: { ...state.book, main } };
}

/**
 * A reloaded page takes the item back as the PC has it. A book also takes back
 * what only the phone knew (action.book, from savedItem): the ISBN or the typed
 * title, the condition, the price box and the book the lookup found. Without a found
 * book the page simply asks the PC again.
 */
function recovered(state, action) {
    const answer = action.answer || {};
    const marked = new Set(numbers(action.ai));
    const note = typeof answer.note === "string" ? answer.note : "";
    const mode = MODES.includes(action.mode) ? action.mode : state.mode;
    // an unnamed item: what the PC called it and a name typed for it since, as savedItem kept them
    const unnamed = mode === "goods" && action.unnamed === true;
    const named = {
        ...initialState(action.itemName, mode),
        unnamed,
        serverName: unnamed && typeof action.serverName === "string" ? action.serverName : "",
        label: unnamed && typeof action.label === "string" ? action.label : "",
    };
    let next = {
        ...named,
        book: mode === "book" ? recoveredBook(action.book) : initialBook(),
        online: state.online,
        needsName: state.needsName,
        itemId: action.itemId,
        photos: numbers(answer.photos).map((n) => photoOnPc(mode, photoStem(named), n, marked.has(n))),
        note: { text: note, sentText: note, due: false },
        sku: typeof answer.sku === "string" ? answer.sku : "",
        // only the phone knows it until a button is pressed (a book's is in its slice)
        customize: mode === "goods" ? recoveredCustomize(action.customize) : initialCustomize(),
    };
    for (const job of Array.isArray(answer.jobs) ? answer.jobs : []) {
        if (!job || !VENUES.includes(job.venue)) continue;
        // auto-post was off for the item: a job done with no link saved the row unposted
        const held = customizeOf(next).autoPost === false;
        next = withJob(next, job.venue, () => ({ ...idleJob(), jobId: String(job.job), held }));
        next = reduce(next, { type: "jobStatus", venue: job.venue, status: job });
    }
    return next;
}

function recoveredBook(saved) {
    const s = saved && typeof saved === "object" ? saved : {};
    const book = initialBook();
    const isbn = typeof s.isbn === "string" && /^\d{13}$/.test(s.isbn) ? s.isbn : "";
    if (s.manual === true) {
        // a book with no ISBN: its title (and the rest) is what names it
        book.manual = true;
        for (const field of TYPED_FIELDS) if (typeof s[field] === "string") book[field] = s[field];
        if (FORMATS.some((f) => f.value === s.format)) book.format = s.format;
        // ... or one whose ISBN no catalogue knows: that ISBN is kept for the listing
        if (isbn && s.isbnMiss === true) Object.assign(book, { isbn, isbnMiss: true });
    } else if (isbn) {
        book.isbn = isbn;
        book.isbnMiss = s.isbnMiss === true;
    }
    if (CONDITIONS.some((c) => c.value === s.condition)) book.condition = s.condition;
    if (typeof s.price === "string") book.price = s.price;
    book.customize = recoveredCustomize(s.customize);
    // settleMain() then checks it is still one of the photos the PC has
    if (Number.isInteger(s.main) && s.main > 0) book.main = s.main;
    const found = s.lookup && typeof s.lookup === "object" ? s.lookup : null;
    if (lookupKey(book) && found && found.record) {
        book.lookup = {
            ...idleLookup(),
            phase: "found",
            by: lookupBy(book),
            matched: !book.manual || found.matched === true,
            record: bookRecord(found.record),
            price: bookPriceValue(typeof found.price === "string" ? found.price : ""),
            listings: bookListings(found.listings),
            route: typeof found.route === "string" ? found.route : "",
        };
        // the box still holding the suggestion: a later answer may replace it, as before the reload
        if (book.lookup.price && book.price === book.lookup.price) book.autoPrice = book.price;
    }
    return book;
}

/**
 * A photo the PC holds and the page did not take: its picture is fetched back
 * (app.js fetchPictures). The id names the kind too, since the goods item and
 * the book both read back and their pictures share one map on the page.
 */
function photoOnPc(mode, stem, n, ai) {
    return {
        id: `pc#${mode}#${n}`,
        name: buildFileName(stem, n),
        n,
        ai,
        status: "sent",
        error: "",
        tried: true,
        local: false,
    };
}

function numbers(list) {
    return Array.isArray(list)
        ? [...new Set(list.filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b)
        : [];
}

function patchPhoto(state, id, fn) {
    let hit = false;
    const photos = state.photos.map((p) => {
        if (p.id !== id) return p;
        hit = true;
        return fn(p);
    });
    return hit ? { ...state, photos } : state;
}

function withJob(state, venue, fn) {
    if (!state.jobs[venue]) return state;
    return { ...state, jobs: { ...state.jobs, [venue]: fn(state.jobs[venue]) } };
}

function toCount(x) {
    return Number.isInteger(x) && x > 0 ? x : 0;
}

/** A job's price as the PC sent it ("14.00", or a bare 14), or "" when it is not a price above zero. */
function priceText(x) {
    const s = typeof x === "number" ? String(x) : typeof x === "string" ? x.trim() : "";
    return s && Number(s) > 0 ? s : "";
}

/** The highest photo number the item has, so a new photo never reuses one. */
export function highestNumber(state) {
    return state.photos.reduce((top, p) => Math.max(top, p.n), 0);
}

/**
 * Counters with the item's count raised to at least `n`.
 * @param {Record<string, number>} counters
 * @param {string} itemName
 * @param {number} n
 * @returns {Record<string, number>}
 */
export function raiseCount(counters, itemName, n) {
    if (currentCount(counters, itemName) >= n) return counters || {};
    return { ...(counters || {}), [itemName]: n };
}

/**
 * What the page keeps in localStorage so a reload can read the item back
 * from the PC: the name, the id, and which photos are marked AI (the PC does
 * not know the marks until a button is pressed).
 *
 * A book keeps, besides, what only the phone knows: the ISBN (or, with No
 * ISBN, the title, author, year and format he typed; after an ISBN no
 * catalogue knows, both, and that it was a miss), the condition chip, the
 * price box, the main photo and the book the lookup found (so a reload does
 * not even have to ask the catalogues again). It has no AI marks.
 *
 * Either kind also keeps customize (the quantity, pickup only, the price grade
 * and auto-post), but only once it is not the default: an item left alone is
 * saved as it always was. Goods made with no name keep `unnamed: true` and what
 * names them (savedUnnamed).
 * @returns {null|{itemName:string, itemId:string, ai:number[], customize?:Customize, unnamed?:true,
 *            serverName?:string, label?:string, title?:string}
 *          |{mode:"book", itemName:string, itemId:string, isbn:string, isbnMiss:boolean, manual:boolean, title:string,
 *            author:string, year:string, format:string, condition:string, price:string,
 *            main:number, lookup:(null|object), customize?:Customize}}
 */
export function savedItem(state) {
    if (!state.itemId) return null;
    if (state.mode === "book") {
        const { isbn, isbnMiss, manual, title, author, year, format, condition, price, main, lookup, customize } =
            state.book;
        return {
            mode: "book",
            itemName: state.itemName,
            itemId: state.itemId,
            isbn,
            isbnMiss,
            manual,
            title,
            author,
            year,
            format,
            condition,
            price,
            main,
            lookup:
                lookup.phase === "found"
                    ? {
                          by: lookup.by,
                          matched: lookup.matched,
                          record: lookup.record,
                          price: lookup.price,
                          listings: lookup.listings,
                          route: lookup.route,
                      }
                    : null,
            ...savedCustomize(customize),
        };
    }
    return {
        itemName: state.itemName,
        itemId: state.itemId,
        ai: state.photos.filter((p) => p.ai).map((p) => p.n),
        ...savedUnnamed(state),
        ...savedCustomize(state.customize),
    };
}

/**
 * An unnamed item keeps what names it on the phone: that it is unnamed (its itemName is ""),
 * the PC's name for it, a name typed since and the listing's title once a job said it, so the
 * history and the walk can call it by them (recordName). Nothing for a named item.
 */
function savedUnnamed(state) {
    if (!state.unnamed) return {};
    const title = titleLine(state);
    return {
        unnamed: true,
        serverName: state.serverName,
        ...(state.label ? { label: state.label } : {}),
        ...(title ? { title } : {}),
    };
}

// --- what the screen says ------------------------------------------------------

/**
 * The line under a venue button, and the link when there is one. Before the
 * press it says `idle`, if anything (venueIdleNote: "pickup only · fair price").
 * Done with no link says "saved, not posted" when the press had auto-post off,
 * else "done". Paused, it says so: held on the phone, or the PC's and maybe still
 * running there.
 * @param {VenueJob} job
 * @param {string} [idle]
 * @returns {{text:string, link:string, kind:""|"busy"|"ok"|"bad"}}
 */
export function venueLine(job, idle = "") {
    if (job.paused && isActive(job)) return { text: job.jobId ? PAUSED_ON_PC : PAUSED, link: "", kind: "busy" };
    switch (job.phase) {
        case "sending":
            return { text: job.step || "sending", link: "", kind: "busy" };
        case "queued": {
            if (job.trouble) return { text: `${job.trouble}, still trying`, link: "", kind: "busy" };
            const text = job.ahead > 0 ? `queued, ${job.ahead} ahead` : "queued";
            return { text, link: "", kind: "busy" };
        }
        case "running":
            if (job.trouble) return { text: `${job.trouble}, still trying`, link: "", kind: "busy" };
            return { text: job.step || "working", link: "", kind: "busy" };
        case "done":
            return job.link
                ? { text: "", link: job.link, kind: "ok" }
                : { text: job.held ? SAVED_NOT_POSTED : "done", link: "", kind: "ok" };
        case "failed":
            return { text: job.error || "failed", link: "", kind: "bad" };
        default:
            return { text: idle, link: "", kind: "" };
    }
}

/**
 * The price line above the venue buttons (Michal, 2026-09-30: "show the chosen
 * price for the item above the buttons instead of replacing button text"; the
 * 2026-09-28 wish for the price while posting and once posted stands, it just
 * moved off the button). Blank before any press and when nothing has gone;
 * from a press on, the row's price as the PC says it ("$14", "$14.50"). The
 * price is the row's, so one job's answer serves both buttons; until the PC
 * has one, `fallbackPrice` stands in: the book's price box, typed on the page
 * and so known from the press.
 * @param {SnapState} state
 * @param {string} [fallbackPrice]
 * @returns {string}
 */
export function priceLine(state, fallbackPrice = "") {
    const jobs = VENUES.map((v) => state.jobs[v]).filter((j) => j && (isActive(j) || j.phase === "done"));
    if (jobs.length === 0) return "";
    const said = jobs.map((j) => priceText(j.price)).find(Boolean) || priceText(fallbackPrice);
    return said ? money(said) : "";
}

/**
 * The small line above the price: the listing's title as the PC saved it,
 * from whichever job said it first (Michal, 2026-10-02: "add the title of the
 * post, from the first venue clicked, above the price, once generated, small
 * font, just for verification"). "" until a job has one.
 * @param {SnapState} state
 * @returns {string}
 */
export function titleLine(state) {
    return VENUES.map((v) => state.jobs[v]).map((j) => (j && j.title) || "").find(Boolean) || "";
}

/**
 * The listing's sku for "See in inventory" under the price (Michal, 2026-10-08: "After
 * something is posted you should see 'see in inventory' below the price."): once any venue
 * is up (a job done with its link) and the server named the row; "" before, and after NEXT.
 * @param {SnapState} state
 * @returns {string}
 */
export function inventorySku(state) {
    const up = VENUES.some((v) => state.jobs[v] && state.jobs[v].phase === "done" && !!state.jobs[v].link);
    return up ? state.sku : "";
}

/**
 * How many items NEXT left the browser's back button walks through (Michal,
 * 2026-10-03: "it should work in both directions and should, actually work
 * for lets say, 10 items back and then 10 items forward").
 */
export const HISTORY_LIMIT = 10;

/** Said by back beyond the oldest item kept, instead of leaving the page. */
export const HISTORY_END = "End of the item history: see the inventory list on the server.";

/**
 * The items NEXT left, oldest first, as stored: only what is a saved item,
 * at most `HISTORY_LIMIT` (a list kept by an older page could be longer).
 * @param {unknown} list
 * @returns {{itemId:string, itemName?:string, mode?:string}[]}
 */
export function historyList(list) {
    return (Array.isArray(list) ? list : [])
        .filter((r) => r && typeof r === "object" && typeof r.itemId === "string" && r.itemId)
        .slice(-HISTORY_LIMIT);
}

/**
 * `list` with `record` as its newest entry (an earlier entry for the same item
 * replaced), at most `HISTORY_LIMIT` long. What NEXT leaves behind, so back
 * can bring it up (Michal, 2026-10-02: "when I press next but then want to go
 * back and see how much that other thing posted for").
 * @param {unknown} list
 * @param {{itemId:string}} record
 * @returns {object[]}
 */
export function remembered(list, record) {
    return [...historyList(list).filter((r) => r.itemId !== record.itemId), record].slice(-HISTORY_LIMIT);
}

/**
 * `list` with `record`'s entry brought up to date where it stands: an item
 * back brought up and worked on stays in its place in the walk.
 * @param {unknown} list
 * @param {{itemId:string}} record
 * @returns {object[]}
 */
export function refreshed(list, record) {
    return historyList(list).map((r) => (r.itemId === record.itemId ? record : r));
}

/**
 * Which screen a saved item belongs on: a book's record says so; goods were
 * saved before there were kinds.
 * @param {{mode?:string}} record
 * @returns {"goods"|"book"}
 */
export function recordKind(record) {
    return record.mode === "book" ? "book" : "goods";
}

/**
 * The place in the walk a browser history entry names. The page mirrors the
 * walk into the browser's entries, one each: 0 is the floor (back beyond the
 * oldest item), 1..length the items in `historyList` oldest first, length + 1
 * the items in hand. An entry names a place, not an item, so one past the end
 * of a list that has since shrunk is the items in hand.
 * @param {unknown} state `history.state`, or a popstate's `state`
 * @param {number} length how many items the walk holds
 * @returns {number} -1 for an entry that is not the walk's
 */
export function walkPosition(state, length) {
    const at = state && typeof state === "object" ? state.snap : undefined;
    if (!Number.isInteger(at) || at < 0) return -1;
    return Math.min(at, length + 1);
}

/**
 * The line said when back or forward brings an item from the history up:
 * which, which way, and what NEXT does now (returns to the item he was on, or
 * starts a new one).
 * @param {{itemName?:string, itemId:string}} record
 * @param {boolean} forward
 * @param {boolean} resumes
 * @returns {string}
 */
export function walkNote(record, forward, resumes) {
    const next = resumes ? "returns to the item you were on" : "starts a new item";
    return `${forward ? "Forward" : "Back"} to "${recordName(record)}", as it was left. NEXT ${next}.`;
}

/**
 * The line said when the walk comes back to the items in hand: the one on
 * screen by name, nothing for a fresh screen.
 * @param {null|{itemName?:string, itemId:string}} record the item in hand, as saved for a reload
 * @returns {string}
 */
export function presentNote(record) {
    return record ? `Back on "${recordName(record)}", the item you were on.` : "";
}

// Michal, 2026-10-08: "I want the SNAP button to be available immediately when opening the
// app. The snap button is the important part, keep it where it is." The item name is optional:
// goods snapped with the box empty are made on the PC unnamed (POST /items {"name": ""}), and
// the draft's title names them.

/** What the photos of goods with no name are called, and the first word of their label. */
export const UNNAMED = "Unnamed";

/** The Snap line while a server that wants names (needsName) has none: as before 2.15.0. */
export const TYPE_NAME_HINT = "Type the item name to start snapping.";

/** Under the buttons while photos snapped unnamed wait for a server that wants a name. */
export const NAME_WAIT_HINT = "This server needs the item name: type it so the photos can go to the server";

/**
 * An unnamed item's label before it has a title: "Unnamed" with the time the PC made it,
 * read from the PC's name for it ("Unnamed 2026-10-08 1701" -> "Unnamed 17:01"); the PC's
 * name as it is when it is not that shape; "Unnamed" when there is none.
 * @param {unknown} serverName
 * @returns {string}
 */
export function unnamedWord(serverName) {
    const name = typeof serverName === "string" ? serverName.trim() : "";
    const at = /^Unnamed \d{4}-\d{2}-\d{2} (\d{2})(\d{2})$/.exec(name);
    if (at) return `${UNNAMED} ${at[1]}:${at[2]}`;
    return name || UNNAMED;
}

/**
 * What the history and the walk call a saved item: its name; for an unnamed one, the name
 * typed for it since, else the listing's title, else "Unnamed" with the time (never the PC's
 * "Unnamed 2026-10-08 1701" once a title exists); the id as a last resort.
 * @param {{itemName?:string, itemId:string, unnamed?:boolean, label?:string, title?:string, serverName?:string}} record
 * @returns {string}
 */
export function recordName(record) {
    if (record.itemName) return record.itemName;
    if (record.unnamed === true) return record.label || record.title || unnamedWord(record.serverName);
    return record.itemId;
}

/**
 * What the name box holds for the item: its name, or, once an unnamed item is made, the
 * name typed for the history.
 * @param {SnapState} state
 * @returns {string}
 */
export function typedName(state) {
    return state.itemId && state.unnamed ? state.label : state.itemName;
}

/**
 * Goods snapped unnamed whose server refused a blank name (needsName): their photos wait
 * on the page for the name, as a book's wait for its ISBN.
 * @param {SnapState} state
 * @returns {boolean}
 */
export function waitsForName(state) {
    return state.mode !== "book" && state.needsName && !state.itemName && !state.itemId && state.photos.length > 0;
}

/**
 * What a screen reader hears for a venue button: the venue, and whether its
 * job is on its way or posted. The button's visible word is always the venue.
 * @param {VenueJob} job
 * @param {string} venue
 * @returns {string}
 */
export function venueLabel(job, venue) {
    if (isActive(job)) return `${venue}, posting`;
    if (savedNotPosted(job)) return `${venue}, ${SAVED_NOT_POSTED}`;
    if (job.phase === "done") return `${venue}, posted`;
    return venue;
}

/** Settings live inside Admin since 2.1.0 (Michal, 2026-10-06: "Admin which would replace Settings"). */
export const SETTINGS_HINT = "Set the server address and key in Admin";

/** How long after the last keystroke the item name is checked against the PC. */
export const NAME_CHECK_MS = 500;

/**
 * The id the PC gives an item started today under `itemName`: its folder,
 * `<item name> <YYYY-MM-DD>` (`serve/items.py`), in the phone's local date.
 * @param {string} itemName  already cleaned
 * @param {Date} date
 * @returns {string}
 */
export function itemIdFor(itemName, date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${itemName} ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The line under the name once the PC says an item of that name was already
 * started today (Michal, 2026-09-30: "if I put a name for an item and it is
 * the same as another, just flag it and don't accept it. I see that that pulls
 * back the cached photos"). Before this, the same name on the same day was
 * silently the same folder, and its photos joined the strip.
 * @param {SnapState} state
 * @returns {string}
 */
export function nameTakenHint(state) {
    if (!state.nameTaken) return "";
    const { photos } = state.nameTaken;
    const held = photos > 0 ? ` with ${photos} photo${photos === 1 ? "" : "s"}` : "";
    return `"${state.itemName}" is already an item on the server today${held}. Use a different name.`;
}

/**
 * Whether a venue button can be pressed, and if not, the one-line reason.
 * A new item goes once every photo is on the PC and at least one is marked AI.
 * The second button does not wait for the first job (Michal, 2026-09-30: "I
 * seem not to be able to click craigslist while ebay is loading"): the PC runs
 * jobs one at a time and a job for an item whose folder already made a row
 * reuses that row, so the model is still paid once.
 * @param {SnapState} state
 * @param {string} venue
 * @param {boolean} settingsOk
 * @returns {{enabled:boolean, hint:string}}
 */
export function venueButton(state, venue, settingsOk) {
    if (state.mode === "book") return bookVenueButton(state, venue, settingsOk);
    const job = state.jobs[venue];
    // pressed already: on its way, or posted (the link is right there); a row
    // saved, not posted, opens again to post it
    if (isActive(job) || (job.phase === "done" && !savedNotPosted(job))) return { enabled: false, hint: "" };
    if (!settingsOk) return { enabled: false, hint: SETTINGS_HINT };
    // a quantity he typed wrong is his to fix first: it goes with either button
    if (!quantityValue(state.customize.quantity)) return { enabled: false, hint: QUANTITY_HINT };
    // the second button: the row is saved, nothing more is needed
    if (state.sku) return { enabled: true, hint: "" };
    const n = state.photos.length;
    if (n === 0) return { enabled: false, hint: "Snap a photo first" };
    if (waitsForName(state)) return { enabled: false, hint: NAME_WAIT_HINT };
    if (n > MAX_PHOTOS) return { enabled: false, hint: `At most ${MAX_PHOTOS} photos - delete ${n - MAX_PHOTOS}` };
    if (!state.photos.some((p) => p.ai)) {
        return { enabled: false, hint: "Mark at least one photo AI (bottom right of the photo)" };
    }
    if (state.photos.some((p) => p.status === "failed")) {
        return { enabled: false, hint: "A photo did not reach the server - tap its 'failed' to try again" };
    }
    if (unsent(state) || !state.itemId) {
        const sent = state.photos.filter((p) => p.status === "sent").length;
        return { enabled: false, hint: `Waiting for the photos to reach the server (${sent} of ${n} sent)` };
    }
    return { enabled: true, hint: "" };
}

/**
 * A book's photos are on the page but nothing names it yet: the cover was
 * snapped before the barcode was scanned, the ISBN typed or (No ISBN) the
 * title typed (the ISBN button's picture itself is never one of them). Its
 * folder on the PC is named by the ISBN or the title, so they cannot go until
 * there is one: what blocks them is the ISBN or the title, not the PC, and the
 * lines under ebay and DONE say so.
 */
export function waitsForIsbn(state) {
    return state.mode === "book" && !state.itemName && state.photos.length > 0;
}

/** The first thing a book needs, said where nothing else is to be said yet. */
export const NO_BOOK_HINT = "Scan the ISBN, or tap No ISBN and type the title";

export const ISBN_WAIT_HINT =
    "Scan the ISBN, or tap No ISBN and type the title, so the photos can go to the server; or remove them with their x";

export const TITLE_WAIT_HINT = "Type the title so the photos can go to the server, or remove them with their x";

/** The line under ebay and DONE while the photos wait for a name. */
function waitHint(state) {
    return state.book.manual ? TITLE_WAIT_HINT : ISBN_WAIT_HINT;
}

/** The book has what names it: an ISBN (one kept after a miss too), or (No ISBN) a title. */
function bookNamed(book) {
    return !!book.isbn || (book.manual && !!bookSearch(book).title);
}

/** The ebay line after an ISBN no catalogue knows, while No ISBN is closed: the next step. */
export const ISBN_MISS_HINT = "Tap No ISBN and type the title";

/**
 * The book's one button, ebay. It opens once the book is found in the
 * catalogues (by its ISBN; by its title the PC's answer is enough, matched or
 * not), at least one photo is taken and every photo is on the PC, and
 * the price box holds a price. A book goes by its catalogue record, not a
 * model, so there is no AI mark to wait for -- and no second venue: a book
 * that failed after the PC saved its row is simply sent again whole. A book
 * saved, not posted (auto-post off) opens again, and that press posts the row
 * by its sku.
 * @param {SnapState} state
 * @param {string} venue
 * @param {boolean} settingsOk
 * @returns {{enabled:boolean, hint:string}}
 */
function bookVenueButton(state, venue, settingsOk) {
    const job = state.jobs[venue];
    if (venue !== "ebay" || !job) return { enabled: false, hint: "" };
    if (isActive(job) || (job.phase === "done" && !savedNotPosted(job))) return { enabled: false, hint: "" };
    if (!settingsOk) return { enabled: false, hint: SETTINGS_HINT };
    const { book } = state;
    if (!quantityValue(book.customize.quantity)) return { enabled: false, hint: QUANTITY_HINT };
    if (waitsForIsbn(state)) return { enabled: false, hint: waitHint(state) };
    // under No ISBN the title is what is looked up, even with an ISBN kept after a miss
    if (book.manual ? !bookSearch(book).title : !book.isbn) {
        return { enabled: false, hint: book.manual ? "Type the book's title first" : NO_BOOK_HINT };
    }
    switch (book.lookup.phase) {
        case "found":
            break;
        case "missing":
            return { enabled: false, hint: ISBN_MISS_HINT };
        case "failed":
            return {
                enabled: false,
                hint: `The book was not looked up - edit the ${book.manual ? "title" : "ISBN"} to try again`,
            };
        default:
            return { enabled: false, hint: "Looking the book up..." };
    }
    const n = state.photos.length;
    if (n === 0) return { enabled: false, hint: "Snap the cover first" };
    if (n > MAX_PHOTOS) return { enabled: false, hint: `At most ${MAX_PHOTOS} photos - delete ${n - MAX_PHOTOS}` };
    if (!bookPriceValue(book.price)) return { enabled: false, hint: "Set a price (whole dollars are fine)" };
    if (state.photos.some((p) => p.status === "failed")) {
        return { enabled: false, hint: "A photo did not reach the server - tap its 'failed' to try again" };
    }
    if (unsent(state) || !state.itemId) {
        const sent = state.photos.filter((p) => p.status === "sent").length;
        return { enabled: false, hint: `Waiting for the photos to reach the server (${sent} of ${n} sent)` };
    }
    return { enabled: true, hint: "" };
}

/** A press whose POST /jobs has not been taken by the PC yet: only the page knows of it. */
function anySending(state) {
    return VENUES.some((v) => state.jobs[v].phase === "sending");
}

/**
 * NEXT (it was DONE): needs a photo (as before), and waits while a photo or a
 * delete has not reached the PC. It does not wait for the listing (Michal,
 * 2026-09-28: "I want to be able to click NEXT as the things are
 * loading/posting so I can start working on the following item"): once the PC
 * has taken the job, the job is the PC's, and the phone only stops watching it.
 * It waits only for the moment a press is still on its way to the PC, which
 * clearing the page would lose.
 * A book also opens it with an ISBN (or a typed title) and no photo yet, so a
 * book that is not in the catalogues can be cleared without taking a picture of it.
 * @returns {{enabled:boolean, hint:string}}
 */
export function doneButton(state) {
    // a press held by its pause has not gone: his to carry on or drop first
    if (VENUES.some((v) => state.jobs[v].phase === "sending" && state.jobs[v].paused)) {
        return { enabled: false, hint: NEXT_PAUSED };
    }
    if (anySending(state)) {
        return { enabled: false, hint: "NEXT waits until the listing has reached the server" };
    }
    // a book's photos waiting for its ISBN or title are not waiting for the PC
    if (waitsForIsbn(state)) return { enabled: false, hint: waitHint(state) };
    if (waitsForName(state)) return { enabled: false, hint: NAME_WAIT_HINT };
    if (unsent(state)) {
        return { enabled: false, hint: "NEXT waits until the photos are on the server" };
    }
    const something = state.photos.length > 0 || (state.mode === "book" && bookNamed(state.book));
    return { enabled: something, hint: "" };
}

/** NEXT's line while a press is paused before it left the phone. */
export const NEXT_PAUSED = "NEXT waits: continue or reset the paused press";

/** The quiet line under NEXT while a listing is posting on the PC. */
export const NEXT_NOTE = "A listing is still posting on the server; NEXT starts the next item without waiting for its link";

/**
 * The line under NEXT: said once a job is on the PC and not finished, since
 * NEXT then leaves it unwatched and its link will not show on this page.
 * @param {SnapState} state
 * @returns {string}
 */
export function nextNote(state) {
    return VENUES.some((v) => ["queued", "running"].includes(state.jobs[v].phase)) ? NEXT_NOTE : "";
}

/**
 * The quiet word next to the notes label. The note goes to the PC as he
 * types (note.txt beside the photos), a moment after he stops.
 * @param {SnapState} state
 * @returns {string}
 */
export function noteStatusText(state) {
    const { note } = state;
    if (!noteDirty(state)) return note.sentText ? "sent" : "";
    if (!state.itemId) return note.text.trim() ? "goes with the first photo" : "";
    if (state.busy && state.busy.kind === "note") return "sending...";
    if (state.stalled || !state.online) return "not sent (offline), will retry";
    return note.due ? "sending..." : "";
}

/**
 * The running line above the strip: "4 photos, 2 for the AI, 3 on the PC".
 * A book's photos never go to a model, so its line leaves the AI out:
 * "2 photos, all on the PC"; or "1 photo, waiting for the ISBN or the title"
 * while nothing names its folder, which is not the PC being slow.
 * @param {SnapState} state
 * @returns {string}
 */
export function progressLine(state) {
    const total = state.photos.length;
    if (total === 0) return "No photos yet.";
    const ai = state.photos.filter((p) => p.ai).length;
    const sent = state.photos.filter((p) => p.status === "sent").length;
    const photos = total === 1 ? "1 photo" : `${total} photos`;
    if (waitsForIsbn(state)) {
        return `${photos}, waiting for ${state.book.manual ? "the title" : "the ISBN or the title"}`;
    }
    if (waitsForName(state)) return `${photos}, waiting for the item name`;
    const where = `${sent === total ? "all" : sent} on the server`;
    if (state.mode === "book") return `${photos}, ${where}`;
    return `${photos}, ${ai} for the AI, ${where}`;
}

/**
 * Leaving the page now would lose something: a photo, a delete or the note
 * not yet on the PC, or a press not yet taken by the PC. A job the PC has is
 * not lost by leaving (it posts all the same; NEXT leaves it just as well), so
 * it no longer warns. A book adds nothing of its own: its ISBN, condition and
 * price are kept for a reload once its item is on the PC, and before that
 * there is no photo on the PC to lose them from.
 */
export function leaveWarning(state) {
    return anySending(state) || unsent(state) || (!!state.itemId && noteDirty(state));
}

/**
 * The banner at the top: offline, or the PC not answering. The photos wait on
 * the page meanwhile and the queue carries on by itself.
 * @param {SnapState} state
 * @returns {string} "" when all is well
 */
export function bannerText(state) {
    if (!state.online) {
        return "You are offline. Photos wait on this page and go to the server when you are back.";
    }
    if (state.stalled) {
        const why = state.problem || "cannot reach the server";
        return `${why[0].toUpperCase()}${why.slice(1)}. Photos wait on this page and go to the server as soon as it answers.`;
    }
    return "";
}

// --- Admin: the inventory ------------------------------------------------------
//
// Michal, 2026-10-06: "somewhere where one can pull in all the listings ... inventory
// list, with search options / filtering options ... clicking would need to show all
// the card options and all the photos". The PC answers GET /inventory with a summary
// per row and GET /inventory/<sku> with the whole row; what follows turns those into
// the words the list and the detail show.
//
// Michal, 2026-10-06, the second round: "Add sorting options for the inventory (by
// price and by age). When an item is listed probably clicking the venue button from
// the inventory should open the listing ... Add the per item actions you have proposed
// [post the other venue, end, refresh status, edit fields]. Also I think when I click
// on an item there should only be eBay or and Craigslist card ... Also a foldout for a
// venue that is not active should be there. Empty. With capacity to generate that card
// from there." So the detail is one card per venue, and each card says which actions
// it offers (venueActions), what an edit sends (patchBody) and what a job is doing
// (syncLine); the sync bar's jobs read the same way.

/** The most rows one query asks for: the newest; a search narrows them. */
export const INVENTORY_LIMIT = 200;

/** The search box asks the PC this long after the last keystroke. */
export const INVENTORY_DEBOUNCE_MS = 400;

/** The venue filter's chips, All ("") first. */
export const INVENTORY_VENUES = ["", ...VENUES];

/**
 * The status filter's chips, All ("") first; Archived last, the rows swiped off the list
 * (GET /inventory?status=archived lists only those, every other listing leaves them out).
 */
export const INVENTORY_STATUSES = ["", "draft", "listed", "sold", "ended", "archived"];

/**
 * The sort chips, in their order on screen, Newest first and chosen at the start
 * (Michal, 2026-10-06: "sorting options for the inventory (by price and by age)").
 * The PC puts a row with no price last whichever way price runs.
 */
export const INVENTORY_SORTS = [
    { key: "newest", word: "Newest", sort: "age", order: "desc" },
    { key: "oldest", word: "Oldest", sort: "age", order: "asc" },
    { key: "price-desc", word: "Price ↓", sort: "price", order: "desc" },
    { key: "price-asc", word: "Price ↑", sort: "price", order: "asc" },
];

/**
 * What the item's note is called wherever the screen names it (Michal, 2026-10-07: "Call
 * it 'User Note' everywhere. It is not something that posts. And 'note' by itself
 * confuses me."): the eBay card's fact and Edit's input, as index.html labels the goods
 * and book boxes.
 */
export const USER_NOTE = "User note";

/** Said under an override left blank on the craigslist card: the PC fills it from the eBay fields. */
export const DERIVED = "derived from eBay";

/** What a blank craigslist category is: the PC picks one from the eBay category. */
export const CATEGORY_FROM_EBAY = "from the eBay category";

/** A string field of an answer, trimmed; "" for anything else. */
function plain(x) {
    if (typeof x === "number" && Number.isFinite(x)) return String(x);
    return typeof x === "string" ? x.trim() : "";
}

/**
 * A sort chip's `sort` and `order` for GET /inventory; Newest for a chip the page does not know.
 * @param {string} key one of INVENTORY_SORTS' keys
 * @returns {{sort:string, order:string}}
 */
export function sortQuery(key) {
    const chip = INVENTORY_SORTS.find((s) => s.key === key) || INVENTORY_SORTS[0];
    return { sort: chip.sort, order: chip.order };
}

/**
 * The query string of GET /inventory: every key always sent ("" for All), each
 * URL-encoded, the limit, then the sort. An unknown venue or status is sent as All.
 * @param {{q?:string, venue?:string, status?:string, sort?:string}} filters
 * @returns {string} e.g. "q=blue%20lamp&venue=ebay&status=&limit=200&sort=age&order=desc"
 */
export function inventoryQuery({ q = "", venue = "", status = "", sort = "" } = {}) {
    const asked = {
        q: plain(q),
        venue: INVENTORY_VENUES.includes(venue) ? venue : "",
        status: INVENTORY_STATUSES.includes(status) ? status : "",
        limit: String(INVENTORY_LIMIT),
        ...sortQuery(sort),
    };
    // encodeURIComponent, as searchBook does: a space is %20, never a "+"
    return Object.entries(asked)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("&");
}

/**
 * The rows of GET /inventory's answer that are rows: objects with a sku.
 * @param {unknown} answer
 * @returns {Record<string, any>[]}
 */
export function inventoryRows(answer) {
    const rows = answer && typeof answer === "object" && Array.isArray(answer.rows) ? answer.rows : [];
    return rows.filter((r) => r && typeof r === "object" && typeof r.sku === "string" && r.sku);
}

/**
 * The line under the search box once the PC answered.
 * @param {number} n rows in the answer
 * @returns {string}
 */
export function inventoryCount(n) {
    if (n === 0) return "No listings match.";
    if (n >= INVENTORY_LIMIT) return `The newest ${n} listings; search to narrow them.`;
    return n === 1 ? "1 listing" : `${n} listings`;
}

/**
 * A row's price as the screen says it: "$24" for "24.00", "$24.50"; "" for none.
 * @param {unknown} price the PC's "24.00" or null
 * @returns {string}
 */
export function priceWord(price) {
    return money(priceText(price));
}

/**
 * A venue's status as the PC keeps it on a row: the word, the listing's id and
 * link (only an http(s) one), and when it went up.
 * @param {Record<string, any>} row
 * @param {string} venue
 * @returns {{status:string, id:string, url:string, listedAt:string}}
 */
export function venueStatus(row, venue) {
    const all = row && row.statuses && typeof row.statuses === "object" ? row.statuses : {};
    const s = all[venue] && typeof all[venue] === "object" ? all[venue] : {};
    return { status: plain(s.status), id: plain(s.id), url: safeLink(s.url), listedAt: plain(s.listed_at) };
}

/**
 * A venue's name in a sentence: "eBay", "craigslist" (the badges and buttons say "ebay",
 * as the venue buttons do).
 * @param {string} venue
 * @returns {string}
 */
export function venueName(venue) {
    return venue === "ebay" ? "eBay" : venue;
}

/**
 * The small badge a list row wears per venue: the venue and its status word.
 * Listed is the posted green, sold and ended are muted, a draft (or a word the
 * page does not know) is outlined. A listed one reads the venue and a tick
 * (Michal, 2026-10-08: "Instead of 'ebay listed' and an arrow, write 'ebay' and
 * follow that with a checkmark symbol"): `tick`, drawn by app.js, and `said`, what a
 * screen reader hears, still "ebay listed".
 * @param {string} venue
 * @param {string} status
 * @returns {{text:string, said:string, kind:"posted"|"muted"|"draft", tick:boolean}}
 */
export function statusBadge(venue, status) {
    const word = plain(status);
    const kind = word === "listed" ? "posted" : word === "sold" || word === "ended" ? "muted" : "draft";
    const said = word ? `${venue} ${word}` : venue;
    return { text: word === "listed" ? venue : said, said, kind, tick: word === "listed" };
}

/**
 * One badge per venue the row names in `venues`, in that order. A listed one
 * with a link carries it: the badge opens the listing (Michal, 2026-10-06: "When
 * an item is listed probably clicking the venue button from the inventory should
 * open the listing"); "" leaves the badge a plain word. A venue the row is listed on
 * whose listing the phone left behind (unsyncedList: a price moved for eBay, a
 * craigslist field for craigslist) has a badge that syncs instead (`sync`, no link): a
 * tap pushes the row onto that listing, and it is the plain listed badge again once
 * that is done.
 * @param {Record<string, any>} row
 * @param {Unsynced[]} [unsynced] unsyncedList's
 * @returns {{venue:string, text:string, said:string, kind:"posted"|"muted"|"draft", tick:boolean, link:string, sync?:true}[]}
 */
export function rowBadges(row, unsynced = []) {
    const venues = Array.isArray(row.venues) ? row.venues.map(plain).filter(Boolean) : [];
    return venues.map((v) => {
        const s = venueStatus(row, v);
        const badge = { venue: v, ...statusBadge(v, s.status), link: s.status === "listed" ? s.url : "" };
        if (s.status === "listed" && isUnsynced(unsynced, row.sku, v)) return { ...badge, link: "", sync: true };
        return badge;
    });
}

/**
 * The badge a listing's venue foldout wears, the list's own (Michal, 2026-10-07: "I
 * want them to look like they did on the inventory list. Inside a green bubble if
 * listed. (Keeping visual references the same across screens makes things
 * simple)"); a venue the row is not on says so, dashed. Never a link: the
 * listing's link is in the card's actions.
 * @param {Record<string, any>} row
 * @param {string} venue
 * @returns {{text:string, said:string, kind:"posted"|"muted"|"draft"|"absent", tick:boolean}}
 */
export function venueBadge(row, venue) {
    if (!rowVenues(row).includes(venue)) {
        const text = `${venue} not added`;
        return { text, said: text, kind: "absent", tick: false };
    }
    return statusBadge(venue, venueStatus(row, venue).status);
}

/** A row's title, or its sku when it has none. */
export function rowTitle(row) {
    return plain(row.title) || row.sku;
}

/**
 * The detail's heading: the title and the price ("Brown boots · $24").
 * @param {Record<string, any>} row
 * @returns {string}
 */
export function rowHeading(row) {
    const price = priceWord(row.price);
    return price ? `${rowTitle(row)} · ${price}` : rowTitle(row);
}

/**
 * The venues a row is on: those its `venues` names, in the app's order (ebay,
 * craigslist). The detail's card for any other venue is empty, with its Add.
 * @param {Record<string, any>} row
 * @returns {string[]}
 */
export function rowVenues(row) {
    const named = row && Array.isArray(row.venues) ? row.venues.map(plain) : [];
    return VENUES.filter((v) => named.includes(v));
}

/**
 * The photos of a whole row (GET /inventory/<sku>), by number: the summary's
 * "photos" is a count, so it has none.
 * @param {Record<string, any>} row
 * @returns {{n:number, name:string}[]}
 */
export function rowPhotos(row) {
    const list = Array.isArray(row.photos) ? row.photos : [];
    return list
        .filter((p) => p && Number.isInteger(p.n) && p.n > 0)
        .map((p) => ({ n: p.n, name: plain(p.name) || `photo ${p.n}` }));
}

/**
 * When a listing went up, short and in the phone's own time: "2026-10-03 16:21".
 * "" when it has not; an answer that is not a date is shown as it came.
 * @param {unknown} iso the PC's "2026-10-03T16:21:47-05:00"
 * @param {number} [offsetMinutes] east of UTC; the phone's own by default
 * @returns {string}
 */
export function listedAtWord(iso, offsetMinutes) {
    const text = plain(iso);
    if (!text) return "";
    const t = Date.parse(text);
    if (Number.isNaN(t)) return text;
    const offset = offsetMinutes === undefined ? -new Date(t).getTimezoneOffset() : offsetMinutes;
    const local = new Date(t + offset * 60000).toISOString();
    return `${local.slice(0, 10)} ${local.slice(11, 16)}`;
}

/**
 * The parcel: "5 oz, 8 x 6 x 2 in"; "" when the row has none.
 * @param {unknown} pkg {"weight_oz", "length_in", "width_in", "height_in"} or null
 * @returns {string}
 */
export function packageWord(pkg) {
    if (!pkg || typeof pkg !== "object") return "";
    const weight = plain(pkg.weight_oz);
    const sides = [pkg.length_in, pkg.width_in, pkg.height_in].map(plain);
    const parts = [];
    if (weight) parts.push(`${weight} oz`);
    if (sides.every(Boolean)) parts.push(`${sides.join(" x ")} in`);
    return parts.join(", ");
}

/**
 * {name: value} or {name: [values]} as lines: "Brand: Levi's\nSize: M, L".
 * @param {unknown} pairs
 * @returns {string}
 */
export function namedLines(pairs) {
    if (!pairs || typeof pairs !== "object" || Array.isArray(pairs)) return "";
    return Object.entries(pairs)
        .map(([name, value]) => {
            const words = (Array.isArray(value) ? value : [value]).map(plain).filter(Boolean);
            return words.length ? `${name}: ${words.join(", ")}` : "";
        })
        .filter(Boolean)
        .join("\n");
}

/**
 * @typedef {Object} Fact
 * @property {string} label
 * @property {string} value
 * @property {boolean} [pre]     kept as written, line breaks and all
 * @property {boolean} [mono]    an id or a number to read digit by digit
 * @property {boolean} [derived] a craigslist field left blank: the value it is derived from, muted
 */

/**
 * A venue's status line on its card: the status word and when it went up
 * ("listed since 2026-10-03 16:21", "sold · listed 2026-10-01 09:00"); "not
 * posted yet" for a venue the row is on with no status.
 * @param {Record<string, any>} row
 * @param {string} venue
 * @param {number} [offsetMinutes] for listedAtWord
 * @returns {string}
 */
export function venueStatusLine(row, venue, offsetMinutes) {
    const s = venueStatus(row, venue);
    const when = listedAtWord(s.listedAt, offsetMinutes);
    if (!s.status) return "not posted yet";
    if (!when) return s.status;
    return s.status === "listed" ? `listed since ${when}` : `${s.status} · listed ${when}`;
}

// --- Admin: a listing's condition ---------------------------------------------------
//
// Michal, 2026-10-08: "When editing a listing in the inventory card, there should be an
// option to change the condition there." (A cooler had gone up "for parts" and was put
// right from the terminal.) So the eBay card says the condition in words, its Edit offers
// the conditions eBay allows the row's category as chips (GET /inventory/<sku>/conditions),
// and a changed one leaves both listings behind.

/**
 * eBay's conditions (its ConditionEnum) in words, best first, as the server's labels say
 * the ones it names. The chips' whole list when the server cannot say which the row's
 * category allows (an older server's 404, eBay not read).
 */
export const CONDITION_LABELS = {
    NEW: "New",
    NEW_OTHER: "New (open box)",
    NEW_WITH_DEFECTS: "New with defects",
    CERTIFIED_REFURBISHED: "Certified refurbished",
    EXCELLENT_REFURBISHED: "Refurbished, excellent",
    VERY_GOOD_REFURBISHED: "Refurbished, very good",
    GOOD_REFURBISHED: "Refurbished, good",
    SELLER_REFURBISHED: "Seller refurbished",
    LIKE_NEW: "Like new",
    PRE_OWNED_EXCELLENT: "Pre-owned, excellent",
    USED_EXCELLENT: "Used, excellent",
    PRE_OWNED_FAIR: "Pre-owned, fair",
    USED_VERY_GOOD: "Used, very good",
    USED_GOOD: "Used, good",
    USED_ACCEPTABLE: "Used, acceptable",
    FOR_PARTS_OR_NOT_WORKING: "For parts or not working",
};

/** The friendly spellings a row's condition may carry from a CSV, as the server's map_condition reads them. */
const CONDITION_ALIASES = {
    new: "NEW",
    "brand new": "NEW",
    "new with tags": "NEW",
    nwt: "NEW",
    "new in box": "NEW",
    nib: "NEW",
    sealed: "NEW",
    "new other": "NEW_OTHER",
    "new without tags": "NEW_OTHER",
    nwot: "NEW_OTHER",
    "open box": "NEW_OTHER",
    "new with defects": "NEW_WITH_DEFECTS",
    "like new": "LIKE_NEW",
    mint: "LIKE_NEW",
    excellent: "USED_EXCELLENT",
    "used excellent": "USED_EXCELLENT",
    "very good": "USED_VERY_GOOD",
    "used very good": "USED_VERY_GOOD",
    good: "USED_GOOD",
    used: "USED_GOOD",
    "used good": "USED_GOOD",
    "pre owned": "USED_GOOD",
    acceptable: "USED_ACCEPTABLE",
    fair: "USED_ACCEPTABLE",
    "used acceptable": "USED_ACCEPTABLE",
    "for parts": "FOR_PARTS_OR_NOT_WORKING",
    parts: "FOR_PARTS_OR_NOT_WORKING",
    "not working": "FOR_PARTS_OR_NOT_WORKING",
    broken: "FOR_PARTS_OR_NOT_WORKING",
    refurbished: "SELLER_REFURBISHED",
    "seller refurbished": "SELLER_REFURBISHED",
    "certified refurbished": "CERTIFIED_REFURBISHED",
};

/**
 * The row's condition as eBay's enum: the enum itself, or a friendly spelling ("Used",
 * "open box"); "" for anything else. The server's map_condition, mirrored.
 * @param {unknown} condition
 * @returns {string}
 */
export function conditionEnum(condition) {
    const key = plain(condition).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key) return "";
    const value = CONDITION_ALIASES[key] || key.toUpperCase().replace(/ /g, "_");
    return Object.hasOwn(CONDITION_LABELS, value) ? value : "";
}

/**
 * A condition in words for the eBay card: its label, or as the row has it when it is no enum.
 * @param {unknown} condition
 * @returns {string}
 */
export function conditionLabel(condition) {
    const value = plain(condition);
    return Object.hasOwn(CONDITION_LABELS, value) ? CONDITION_LABELS[value] : value;
}

/** eBay's condition -> Craigslist's six words; a refurbished grade lands where its wear puts it. */
const CRAIGSLIST_CONDITIONS = {
    NEW: "new",
    NEW_OTHER: "new",
    NEW_WITH_DEFECTS: "new",
    CERTIFIED_REFURBISHED: "like new",
    EXCELLENT_REFURBISHED: "like new",
    LIKE_NEW: "like new",
    PRE_OWNED_EXCELLENT: "excellent",
    USED_EXCELLENT: "excellent",
    VERY_GOOD_REFURBISHED: "excellent",
    USED_VERY_GOOD: "excellent",
    GOOD_REFURBISHED: "good",
    SELLER_REFURBISHED: "good",
    USED_GOOD: "good",
    PRE_OWNED_FAIR: "fair",
    USED_ACCEPTABLE: "fair",
    FOR_PARTS_OR_NOT_WORKING: "salvage",
};

/**
 * The posting's Condition on Craigslist, from the row's eBay one: the server's
 * craigslist_condition, mirrored ("" when there is none to map; the posting goes without).
 * @param {unknown} condition
 * @returns {string}
 */
export function craigslistCondition(condition) {
    return CRAIGSLIST_CONDITIONS[conditionEnum(condition)] || "";
}

/** Under the chips when the server could not read eBay's list for the row's category. */
export const CONDITIONS_UNREAD = "eBay's list for this category could not be read: showing all";

/**
 * Edit's Condition chips from GET /inventory/<sku>/conditions: the conditions eBay allows
 * the row's category, in the server's order, each in the server's words (else
 * CONDITION_LABELS', else as it came), and the one the row has. Until it answers, or when
 * it cannot say (null: an older server's 404), every one of CONDITION_LABELS; an answer
 * with none allowed (eBay not read; a failed call is passed as {allowed: [], error}) says
 * so under them, with its why.
 * @param {{current?:unknown, allowed?:unknown, labels?:unknown, error?:unknown} | null} answer
 * @returns {{current:string, chips:{value:string, label:string}[], note:string}}
 */
export function conditionChoices(answer) {
    const a = answer && typeof answer === "object" ? answer : {};
    const named = a.labels && typeof a.labels === "object" ? a.labels : {};
    const allowed = (Array.isArray(a.allowed) ? a.allowed : []).map(plain).filter(Boolean);
    const label = (value) => plain(named[value]) || CONDITION_LABELS[value] || value;
    const current = plain(a.current);
    if (allowed.length) return { current, chips: allowed.map((value) => ({ value, label: label(value) })), note: "" };
    const chips = Object.keys(CONDITION_LABELS).map((value) => ({ value, label: label(value) }));
    if (!answer) return { current, chips, note: "" };
    const why = plain(a.error);
    return { current, chips, note: why ? `${CONDITIONS_UNREAD} (${why})` : CONDITIONS_UNREAD };
}

/**
 * A Save the server refused because of the condition: the PATCH carried one and the
 * refusal (a 400 naming it, or an older server's 422 or 400 for a field it does not
 * know) is about it, or nothing else was sent. Its words go under the chips, not under Save.
 * @param {Record<string, any>} body the PATCH sent
 * @param {{status?:number, message?:string}} error the PcError
 * @returns {boolean}
 */
export function conditionRefused(body, error) {
    if (!("condition" in body) || (error.status !== 400 && error.status !== 422)) return false;
    return Object.keys(body).length === 1 || /\bcondition\b/i.test(plain(error.message));
}

/**
 * The craigslist card's fields: each of its four its override, or, left blank, what
 * the PC derives it from (the eBay title, price and description; a category it picks
 * from the eBay one), with `derived` set so the card says so; and the condition,
 * always the eBay one in Craigslist's words (craigslistCondition), no override. {} for
 * any other venue.
 * @param {Record<string, any>} row
 * @param {string} venue
 * @returns {Record<string, {value:string, derived:boolean}>}
 */
export function derivedFields(row, venue) {
    if (venue !== "craigslist") return {};
    const own = row.craigslist && typeof row.craigslist === "object" ? row.craigslist : {};
    const pair = (override, from) => (override ? { value: override, derived: false } : { value: from, derived: true });
    return {
        title: pair(plain(own.title), plain(row.title)),
        price: pair(priceText(own.price), priceText(row.price)),
        description: pair(plain(own.description), plain(row.description)),
        category: pair(plain(own.category), CATEGORY_FROM_EBAY),
        condition: { value: craigslistCondition(row.condition), derived: true },
    };
}

/**
 * A venue's card: the listing as that venue has it. eBay: the title, price,
 * condition (in words), category path, quantity and pickup only always; the description,
 * note, condition note, aspects, condition details, package, ISBN and model cost
 * when the row has them. Craigslist: its four fields (derivedFields), always, and
 * the condition when the eBay one has a Craigslist word.
 * The status and the link are the card's status line, above these.
 * @param {Record<string, any>} row
 * @param {string} venue
 * @returns {Fact[]}
 */
export function venueFacts(row, venue) {
    if (venue === "craigslist") {
        const d = derivedFields(row, venue);
        return [
            { label: "Title", value: d.title.value, derived: d.title.derived },
            { label: "Price", value: priceWord(d.price.value), derived: d.price.derived },
            { label: "Description", value: d.description.value, pre: true, derived: d.description.derived },
            { label: "Category", value: d.category.value, derived: d.category.derived },
            ...(d.condition.value ? [{ label: "Condition", value: d.condition.value, derived: true }] : []),
        ];
    }
    if (venue !== "ebay") return [];
    const quantity = Number.isInteger(row.quantity) ? String(row.quantity) : "1";
    const cost = plain(row.model_cost);
    /** @type {Fact[]} */
    const facts = [
        { label: "Title", value: plain(row.title) },
        { label: "Price", value: priceWord(row.price) },
        { label: "Condition", value: conditionLabel(row.condition) },
        { label: "Category", value: plain(row.category_path) || plain(row.category) },
        { label: "Quantity", value: quantity },
        { label: "Pickup only", value: row.pickup_only === true ? "yes, no shipping on eBay" : "no" },
        { label: "Description", value: plain(row.description), pre: true },
        { label: USER_NOTE, value: plain(row.note), pre: true },
        { label: "Condition note", value: plain(row.condition_note), pre: true },
        { label: "Aspects", value: namedLines(row.aspects), pre: true },
        { label: "Condition details", value: namedLines(row.condition_details), pre: true },
        { label: "Package", value: packageWord(row.package) },
        { label: "ISBN", value: plain(row.isbn), mono: true },
        { label: "Model cost", value: cost ? `$${cost}` : "" },
    ];
    return facts.filter((f) => f.value);
}

// --- Admin: a card's actions, and the sync bar -------------------------------------

/**
 * The actions a venue's card offers, in their order in its actions row:
 *   "add"     the row is not on this venue: its empty card puts it there
 *   "post"    on the venue and not listed (a draft; an ended or sold row goes up again)
 *   "open"    listed, with a link: the listing in a new tab
 *   "sync"    listed on craigslist, its craigslist fields changed since the last sync
 *             (unsyncedList): the push job puts the row on the listing (Michal,
 *             2026-10-08: craigslist price and edits from the card)
 *   "refresh" listed: the PC asks the venue how the listing stands
 *   "end"     listed: the PC takes it down, after a second tap
 *   "edit"    on the venue: the card's fields as inputs
 * eBay's sync stays customize's Sync to eBay.
 * @param {Record<string, any>} row
 * @param {string} venue
 * @param {Unsynced[]} [unsynced] unsyncedList's
 * @returns {string[]}
 */
export function venueActions(row, venue, unsynced = []) {
    if (!rowVenues(row).includes(venue)) return ["add"];
    const s = venueStatus(row, venue);
    if (s.status !== "listed") return ["post", "edit"];
    const behind = venue === "craigslist" && isUnsynced(unsynced, row.sku, venue);
    return [...(s.url ? ["open"] : []), ...(behind ? ["sync"] : []), "refresh", "end", "edit"];
}

/**
 * An action's words on its button.
 * @param {string} action one of venueActions'
 * @param {string} venue
 * @returns {string}
 */
export function actionWord(action, venue) {
    switch (action) {
        case "add":
            return `Add ${venue} to this item`;
        case "post":
            return `Post on ${venue}`;
        case "open":
            return "Open listing";
        case "sync":
            return `Sync to ${venueName(venue)}`;
        case "refresh":
            return "Refresh status";
        case "end":
            return "End listing";
        default:
            return "Edit";
    }
}

/**
 * The question End listing asks inline before anything is sent; "Yes, end it" sends it.
 * @param {string} venue
 * @returns {string}
 */
export function endQuestion(venue) {
    return `End this listing on ${venue}?`;
}

/**
 * The body of POST /jobs for an action job (the PC's contract, 2026-10-06):
 *   {"action": "end" | "refresh", "sku", "venue"}  a card's End listing / Refresh status
 *   {"action": "sync", "direction": "from" | "to"}  the sync bar's two buttons
 *   {"action": "push", "sku", "venue"}               a listing's customize, Sync to eBay, a
 *                                                    sync badge, the craigslist card's Sync
 *                                                    to craigslist (eBay only until the
 *                                                    contract of 2026-10-08; a PC that still
 *                                                    refuses craigslist answers 400)
 * A card's Post stays jobRequest's {"sku", "venue"}.
 * @param {"end"|"refresh"|"sync"|"push"} action
 * @param {{sku?:string, venue?:string, direction?:string}} what
 * @returns {{action:string, sku:string, venue:string} | {action:string, direction:string}}
 */
export function actionJob(action, { sku = "", venue = "", direction = "" } = {}) {
    if (action === "sync") {
        if (direction !== "from" && direction !== "to") throw new RangeError(`unknown sync direction ${direction}`);
        return { action, direction };
    }
    if (action !== "end" && action !== "refresh" && action !== "push") throw new RangeError(`unknown action ${action}`);
    if (!sku || !VENUES.includes(venue)) throw new RangeError(`${action} needs a sku and a venue`);
    return { action, sku, venue };
}

/**
 * An action job (as GET /jobs/<id> last answered) still on the PC's queue or in hand.
 * @param {{state?:string} | null} job
 * @returns {boolean}
 */
export function jobRunning(job) {
    return !!job && (job.state === "queued" || job.state === "running");
}

/**
 * The line an action job reads as: the sync bar's, and a card's for its Post,
 * Refresh or End. Queued with how many are ahead, the PC's step while it runs,
 * its summary once done ("3 listings updated, 10 unchanged, 0 failed"), its
 * error once failed. A poll the PC did not answer (`trouble`) is said, and asked again.
 * @param {{state?:string, step?:string, summary?:string, error?:string, ahead?:number, trouble?:string}} job
 * @returns {{text:string, kind:"busy"|"ok"|"bad"}}
 */
export function syncLine(job) {
    const state = plain(job.state);
    if (state === "done") return { text: plain(job.summary) || "done", kind: "ok" };
    if (state === "failed") return { text: plain(job.error) || "failed", kind: "bad" };
    if (state === CANCELLED) return { text: CANCELLED, kind: "bad" };
    if (job.trouble) return { text: `${job.trouble}, still trying`, kind: "busy" };
    if (state === "running") return { text: plain(job.step) || "working", kind: "busy" };
    const ahead = Number.isInteger(job.ahead) && job.ahead > 0 ? job.ahead : 0;
    return { text: ahead ? `queued, ${ahead} ahead` : "queued", kind: "busy" };
}

/**
 * What a card (or a listing's customize, or the sync bar) has to say before anything
 * else: a tap too late to cancel (for a moment), its press paused (held on the phone,
 * or its job the PC's), what is on its way to the PC, its job, what the PC refused;
 * null when none of these.
 * @param {{wait:string, job:object|null, note:{text:string, kind:string}|null, press?:unknown, paused?:boolean, late?:boolean}} card
 * @returns {{text:string, kind:string} | null}
 */
export function busyLine(card) {
    if (card.late) return { text: TOO_LATE, kind: "busy" };
    if (card.paused) return { text: card.press ? PAUSED : PAUSED_ON_PC, kind: "busy" };
    if (card.wait) return { text: card.wait, kind: "busy" };
    if (card.job) return syncLine(card.job);
    return card.note || null;
}

/**
 * A card's status line: what is on its way to the PC (`wait`), its job (running
 * or ended), what the PC refused (`note`), and otherwise the venue's status on
 * the row. Nothing for a venue the row is not on until its Add has something to say.
 * @param {Record<string, any>} row
 * @param {string} venue
 * @param {{wait:string, job:object|null, note:{text:string, kind:string}|null}} card
 * @param {number} [offsetMinutes] for listedAtWord
 * @returns {{text:string, kind:string}}
 */
export function cardLine(row, venue, card, offsetMinutes) {
    const said = busyLine(card);
    if (said) return said;
    if (!rowVenues(row).includes(venue)) return { text: "", kind: "" };
    const listed = venueStatus(row, venue).status === "listed";
    return { text: venueStatusLine(row, venue, offsetMinutes), kind: listed ? "ok" : "" };
}

/**
 * A card's fields as Edit turns them into inputs, in their order on the card:
 * eBay's go top-level in the PATCH, craigslist's four overrides inside its
 * "craigslist" (where "" clears one). kind: "line" an input, "price" an input
 * for dollars, "text" a textarea, "choice" a row of chips, one pressed (the
 * condition: conditionChoices). The quantity and pickup only are not here: the
 * listing's customize owns them (Michal, 2026-10-07), so one place edits them.
 */
export const EDIT_FIELDS = {
    ebay: [
        { key: "condition", label: "Condition", kind: "choice" },
        { key: "title", label: "Title", kind: "line" },
        { key: "price", label: "Price, dollars", kind: "price" },
        { key: "description", label: "Description", kind: "text" },
        { key: "note", label: USER_NOTE, kind: "text" },
        { key: "condition_note", label: "Condition note", kind: "text" },
    ],
    craigslist: [
        { key: "title", label: "Title", kind: "line" },
        { key: "price", label: "Price, dollars", kind: "price" },
        { key: "description", label: "Description", kind: "text" },
        { key: "category", label: "Category", kind: "line" },
    ],
};

/**
 * What Edit's inputs start from: eBay's fields as the row has them (the condition
 * as eBay's enum, the chip pressed; "" when it is none), or craigslist's overrides
 * ("" for one left blank; its placeholder shows what it is derived from).
 * @param {Record<string, any>} row
 * @param {string} venue
 * @returns {Record<string, string>}
 */
export function editValues(row, venue) {
    if (venue === "craigslist") {
        const own = row.craigslist && typeof row.craigslist === "object" ? row.craigslist : {};
        return {
            title: plain(own.title),
            price: priceText(own.price),
            description: plain(own.description),
            category: plain(own.category),
        };
    }
    return {
        condition: conditionEnum(row.condition),
        title: plain(row.title),
        price: priceText(row.price),
        description: plain(row.description),
        note: plain(row.note),
        condition_note: plain(row.condition_note),
    };
}

/**
 * The fields Edit changed: those of `after` whose value is not `before`'s, typed
 * text trimmed (a stray space is no change; a field emptied is "").
 * @param {Record<string, unknown>} before
 * @param {Record<string, unknown>} after
 * @returns {Record<string, any>}
 */
export function changedFields(before, after) {
    /** @type {Record<string, any>} */
    const out = {};
    for (const [key, value] of Object.entries(after)) {
        const now = typeof value === "string" ? value.trim() : value;
        const was = typeof before[key] === "string" ? before[key].trim() : before[key];
        if (now !== was) out[key] = now;
    }
    return out;
}

/**
 * The one PATCH /inventory/<sku> body a card's Save sends: only the fields
 * changed, eBay's top-level, craigslist's inside "craigslist"; null when nothing
 * changed (nothing is sent).
 * @param {string} venue
 * @param {Record<string, unknown>} before editValues()
 * @param {Record<string, unknown>} after the inputs
 * @returns {Record<string, any> | null}
 */
export function patchBody(venue, before, after) {
    const changed = changedFields(before, after);
    if (Object.keys(changed).length === 0) return null;
    return venue === "craigslist" ? { craigslist: changed } : changed;
}

// --- Admin: a listing's customize ---------------------------------------------------
//
// Michal, 2026-10-07: "In inventory each item needs a customize tab and the customization
// options as at posting should pop up there with the choices that were made at posting.
// For instance I can there click pickup only and sync to eBay, and that detail of that
// listing should update." So the detail opens on a customize foldout, and Sync to eBay,
// the push job, puts the row as saved onto its eBay listing.
//
// Michal, 2026-10-07, later the same day: "I want the menu in the inventory to look like
// the customize menu. Saying post without confirmation is useless. We will indeed be
// changing price with a slider here. Or quantity etc. or pickup / no pickup." And then:
// "Don't worry about changes that will require model calls. Once in inventory changes can
// be made manually. However definitely 3 prices should be cached in first call so that if
// I change the slider, the price can be updated." So it is the goods card, live: the
// quantity, pickup only and the Price slider, standing at the grade the row's price
// follows (GET /inventory/<sku>'s "pricing"), each grade's cached price beside its word
// ("prices"); Save sends what changed in one PATCH, a moved slider as "pricing", and the
// PC sets the price to that grade's cached one. No model call, no job. Post without
// asking is not shown any more.

/** Said under Save and Sync while the listing is not up on eBay: there is nothing to push to. */
export const PUSH_CLOSED = "Sync to eBay opens once the listing is up on eBay";

/** Said under the quantity box while it holds no quantity, as under the goods card's buttons. */
export const EDIT_QUANTITY_HINT = "Quantity must be a whole number, 1 or more";

/** Under the slider of a row whose price follows no grade (its "pricing" is null). */
export const NOT_GRADED = "not priced by grade yet";

/** Under the slider once moved on a row with no cached prices: nothing for Save to set. */
export const NO_CACHED = "no cached prices on this listing; set the price by hand";

/** Beside a grade's word when the row has no cached price for it. */
export const NO_PRICE = "—";

/**
 * The foldout as typed: the quantity box (a string), pickup only, and the Price
 * slider's grade (0 while it has not been moved on a row whose price follows no grade).
 * @typedef {{quantity:string, pickupOnly:boolean, pricing:0|1|2|3}} RowCustomize
 */

/** "prices"' keys, in grade order: 1 a quick sale, 2 a fair (market) price, 3 the higher end. */
const CACHED_KEYS = ["quick", "market", "high"];

/**
 * The three prices the first model call made for the row, cached on it (GET
 * /inventory/<sku>'s "prices": {"quick", "market", "high"}), in grade order; ""
 * for one it has not (all of them on a row drafted before the cache, or at the terminal).
 * @param {Record<string, any>} row
 * @returns {string[]}
 */
export function cachedPrices(row) {
    const prices = row.prices && typeof row.prices === "object" ? row.prices : {};
    return CACHED_KEYS.map((key) => priceText(prices[key]));
}

/**
 * The foldout as the row has it: the quantity as the box holds it (a string, 1
 * when the row has none), pickup only, and the grade its price follows (0 when none).
 * @param {Record<string, any>} row
 * @returns {RowCustomize}
 */
export function rowCustomize(row) {
    return {
        quantity: Number.isInteger(row.quantity) ? String(row.quantity) : "1",
        pickupOnly: row.pickup_only === true,
        pricing: pricingGrade(row.pricing),
    };
}

/**
 * The Price slider as the goods card shows it, for the row: where it stands, the
 * word bold under it, what a screen reader hears, the line under it, and the three
 * words each with the row's cached price ("Fair price $30", "—" for none). A row
 * whose price follows no grade stands at 1, no word bold, and the line says so; moved
 * on a row with no cached prices, the line says Save cannot set one.
 * @param {Record<string, any>} row
 * @param {unknown} grade the foldout's `pricing`
 * @returns {{value:string, bold:0|1|2|3, said:string, note:string, words:string[]}}
 */
export function sliderWords(row, grade) {
    const prices = cachedPrices(row);
    const words = PRICING.map((p, i) => `${p.word} ${priceWord(prices[i]) || NO_PRICE}`);
    const g = pricingGrade(grade);
    const moved = g !== rowCustomize(row).pricing;
    const stuck = moved && !prices.some(Boolean);
    if (!g) return { value: String(DEFAULT_PRICING), bold: 0, said: NOT_GRADED, note: NOT_GRADED, words };
    return { value: String(g), bold: g, said: words[g - 1], note: stuck ? NO_CACHED : pricingOf(g).note, words };
}

/**
 * The PATCH /inventory/<sku> body of the foldout's Save: `quantity` (a number),
 * `pickup_only` and `pricing` (the grade the slider was moved to), each only when
 * it is not the row's; `pricing` never on a row with no cached prices (there is
 * nothing for the PC to set). null when nothing is left to send. The box must hold
 * a quantity (quantityValue): the foldout says so and keeps Save shut before this
 * is asked.
 * @param {Record<string, any>} row
 * @param {RowCustomize} values the foldout
 * @returns {{quantity?:number, pickup_only?:boolean, pricing?:1|2|3} | null}
 */
export function customizeChanges(row, { quantity, pickupOnly, pricing }) {
    const n = quantityValue(quantity);
    if (!n) throw new RangeError(EDIT_QUANTITY_HINT);
    const was = rowCustomize(row);
    /** @type {{quantity?:number, pickup_only?:boolean, pricing?:1|2|3}} */
    const body = {};
    if (n !== Number(was.quantity)) body.quantity = n;
    if (pickupOnly !== was.pickupOnly) body.pickup_only = pickupOnly;
    const grade = pricingGrade(pricing);
    if (grade && grade !== was.pricing && cachedPrices(row).some(Boolean)) body.pricing = grade;
    return Object.keys(body).length ? body : null;
}

/**
 * The foldout once the row is read again (after a Save, a push): the boxes take
 * the new row's quantity and pickup only unless they hold a change not yet saved
 * (or a quantity that is not one), and the slider the new row's grade unless it
 * holds a move not yet saved. What is not saved stays as he left it.
 * @param {Record<string, any>} before the row the foldout was showing
 * @param {RowCustomize} values the foldout
 * @param {Record<string, any>} after the row read again
 * @returns {RowCustomize}
 */
export function followRow(before, values, after) {
    const was = rowCustomize(before);
    const now = rowCustomize(after);
    const boxes = quantityValue(values.quantity) === Number(was.quantity) && values.pickupOnly === was.pickupOnly;
    return {
        quantity: boxes ? now.quantity : values.quantity,
        pickupOnly: boxes ? now.pickupOnly : values.pickupOnly,
        pricing: values.pricing === was.pricing ? now.pricing : values.pricing,
    };
}

/**
 * The row is listed on eBay: there is a listing for Sync to eBay to update (the PC
 * refuses a push otherwise).
 * @param {Record<string, any>} row
 * @returns {boolean}
 */
export function canPush(row) {
    return rowVenues(row).includes("ebay") && venueStatus(row, "ebay").status === "listed";
}

/**
 * Which of the foldout's buttons can be pressed. Save: something to send, the box
 * a quantity. Sync to eBay: listed on eBay, the box a quantity (what is not yet
 * saved is saved first). Neither while the row is busy (one job per row at a time).
 * @param {Record<string, any>} row
 * @param {RowCustomize} values
 * @param {boolean} busy
 * @returns {{save:boolean, sync:boolean}}
 */
export function customizeButtons(row, values, busy) {
    const ok = !busy && quantityValue(values.quantity) > 0;
    return { save: ok && customizeChanges(row, values) !== null, sync: ok && canPush(row) };
}

/**
 * The foldout's status line: what is on its way, the push job (its step, then
 * "updated" or "unchanged", or its error), what the PC refused or said; then the
 * quantity box that holds no quantity, then why Sync to eBay is shut.
 * @param {Record<string, any>} row
 * @param {{wait:string, job:object|null, note:{text:string, kind:string}|null, values:{quantity:string}}} card
 * @returns {{text:string, kind:string}}
 */
export function customizeLine(row, card) {
    const said = busyLine(card);
    if (said) return said;
    if (!quantityValue(card.values.quantity)) return { text: EDIT_QUANTITY_HINT, kind: "bad" };
    if (!canPush(row)) return { text: PUSH_CLOSED, kind: "" };
    return { text: "", kind: "" };
}

/**
 * Said once Save is through: the PC holds it, and on a listing up on eBay, Sync to
 * eBay is what puts it there.
 * @param {Record<string, any>} row the row the PC answered
 * @returns {{text:string, kind:string}}
 */
export function customizeSaved(row) {
    return { text: canPush(row) ? "saved; Sync to eBay puts it on the listing" : "saved", kind: "ok" };
}

// --- Admin: a list row's price, dialled on its tile -------------------------------------
//
// Michal, 2026-10-07 ("one of the highest priority items"): "On the inventory card on the
// right there should be a round + and a round − button ... When the price changes there
// should be our sync-to logo appearing on the ebay green button below. Pressing it would
// sync, and the button would revert to the 'ebay listed' or whatever it says now." And
// 2026-10-08: "This adjustment itself should be by 1 dollar. However we need to sense long
// press and speed up, for larger priced items, like dials on my oven for time setting." So
// a tap is exactly one dollar (the grade is the customize slider's), a press held past
// DIAL_DELAY_MS repeats every DIAL_REPEAT_MS in steps that grow the longer it is held
// (dialStep), the tile shows the price as it moves, and one PATCH goes on release. Which
// listings a change left behind is kept on the phone (rowBadges' `sync`).

/** How long + or − is held before it starts repeating. */
export const DIAL_DELAY_MS = 400;

/** How often a held + or − steps once it repeats. */
export const DIAL_REPEAT_MS = 120;

/**
 * The step of a held + or −, by how long it has been held: 1 dollar for the first 1.5 s,
 * then 2, then 5 from 3 s, then 10 from 5 s, so $250 down to $150 is about five seconds.
 * @param {number} heldMs
 * @returns {1|2|5|10}
 */
export function dialStep(heldMs) {
    if (heldMs < 1500) return 1;
    if (heldMs < 3000) return 2;
    if (heldMs < 5000) return 5;
    return 10;
}

/**
 * The price after one step of + (`direction` 1) or − (-1), in whole dollars: from $24.50
 * up to $25 and down to $24 by a step of 1, never below $1 (a row with no price goes up
 * to $1 and has nothing below it).
 * @param {unknown} price the row's "24.50", or a number the dial is at
 * @param {1|-1} direction
 * @param {number} step dialStep's
 * @returns {number}
 */
export function dialPrice(price, direction, step) {
    const now = Number(priceText(price)) || 0;
    return Math.max(1, direction > 0 ? Math.floor(now) + step : Math.ceil(now) - step);
}

/**
 * The one PATCH /inventory/<sku> body a dial sends on release: {"price": "150.00"}.
 * @param {number} dollars dialPrice's
 * @returns {{price:string}}
 */
export function dialBody(dollars) {
    return { price: `${dollars}.00` };
}

/**
 * A listing the phone changed since its venue last had it, as snap.inventory.unsynced keeps
 * it: the sku and the venues behind, in the app's order.
 * @typedef {{sku:string, venues:string[]}} Unsynced
 */

/**
 * snap.inventory.unsynced as stored: each sku once, its venues the app knows; anything
 * else is dropped. A bare sku (how 2.8.0 kept them, eBay the only venue then) is eBay's.
 * @param {unknown} raw
 * @returns {Unsynced[]}
 */
export function unsyncedList(raw) {
    /** @type {Map<string, Set<string>>} */
    const behind = new Map();
    for (const entry of Array.isArray(raw) ? raw : []) {
        const e = typeof entry === "string" ? { sku: entry, venues: ["ebay"] } : entry;
        if (!e || typeof e !== "object" || typeof e.sku !== "string" || !e.sku || !Array.isArray(e.venues)) continue;
        const venues = behind.get(e.sku) || new Set();
        for (const v of e.venues) venues.add(v);
        behind.set(e.sku, venues);
    }
    return [...behind]
        .map(([sku, venues]) => ({ sku, venues: VENUES.filter((v) => venues.has(v)) }))
        .filter((e) => e.venues.length);
}

/**
 * `venue` of `sku` is behind on this phone's list.
 * @param {Unsynced[]} list unsyncedList's
 * @param {string} sku
 * @param {string} venue
 * @returns {boolean}
 */
export function isUnsynced(list, sku, venue) {
    return list.some((e) => e.sku === sku && e.venues.includes(venue));
}

/**
 * The list with `venue` of `sku` marked behind (`on`), or let go once a push of it is done.
 * @param {unknown} list
 * @param {string} sku
 * @param {string} venue
 * @param {boolean} on
 * @returns {Unsynced[]}
 */
export function unsyncedWith(list, sku, venue, on) {
    const all = unsyncedList(list);
    const mine = all.find((e) => e.sku === sku);
    const venues = new Set(mine ? mine.venues : []);
    if (on) venues.add(venue);
    else venues.delete(venue);
    const rest = all.filter((e) => e.sku !== sku);
    const kept = VENUES.filter((v) => venues.has(v));
    return kept.length ? [...rest, { sku, venues: kept }] : rest;
}

/**
 * The list with every sku's `venue` let go: the sync bar's Sync to eBay put every row on
 * its eBay listing.
 * @param {unknown} list
 * @param {string} venue
 * @returns {Unsynced[]}
 */
export function unsyncedWithout(list, venue) {
    return unsyncedList(list)
        .map((e) => ({ sku: e.sku, venues: e.venues.filter((v) => v !== venue) }))
        .filter((e) => e.venues.length);
}

/**
 * The listings a change the PC answered (a tile's dial, customize's Save, a card's Edit) left
 * behind, by venue: eBay when the price or the condition moved and the row is listed there;
 * craigslist when the row is listed there and any of its fields reads otherwise now (an
 * override typed, or an eBay field it is derived from changed, the condition among them).
 * `before` may be a list row, which carries no description or overrides: what it does not
 * carry is taken as unchanged.
 * @param {Record<string, any>} before
 * @param {Record<string, any>} after the row the PC answered
 * @returns {string[]}
 */
export function leftUnsynced(before, after) {
    const venues = [];
    const priced = Number(priceText(before.price)) !== Number(priceText(after.price));
    const grade = (row) => conditionEnum(row.condition) || plain(row.condition);
    const graded = "condition" in before && grade(before) !== grade(after);
    if ((priced || graded) && canPush(after)) venues.push("ebay");
    const listed = rowVenues(after).includes("craigslist") && venueStatus(after, "craigslist").status === "listed";
    const reads = (row) => {
        const d = derivedFields(row, "craigslist");
        const price = Number(d.price.value) || 0;
        return [d.title.value, price, d.description.value, d.category.value, d.condition.value].join("\n");
    };
    if (listed && reads({ ...after, ...before }) !== reads(after)) venues.push("craigslist");
    return venues;
}


/**
 * A list row (a summary) with what the PC answered a PATCH with: every field but the
 * photos, which the whole row lists and the summary counts.
 * @param {Record<string, any>} summary
 * @param {Record<string, any>} whole
 * @returns {Record<string, any>}
 */
export function followSummary(summary, whole) {
    const { photos, ...rest } = whole;
    return { ...summary, ...rest, sku: summary.sku };
}

// --- archiving a row by a swipe (Michal, 2026-10-08: "Inventory list should have swipe left
// or right to archive, so you no longer see it in the list, kind of like what the Gmail app
// has on the phone.") ---------------------------------------------------------------------
// Archiving hides a row from the list (PATCH /inventory/<sku> {"archived": true}); it ends no
// listing. The Archived chip lists them, each with Unarchive.

/** A finger has to move this far before the page decides it is a swipe or a scroll. */
export const SWIPE_SLOP_PX = 10;

/** A swipe past this share of the row's width archives it ... */
export const SWIPE_SHARE = 0.4;

/** ... or past this far, whichever comes first (a wide screen's row need not cross the room). */
export const SWIPE_MAX_PX = 120;

/** How long the undo bar stays after a row is archived. */
export const UNDO_MS = 6000;

/** An archive (or Unarchive, or Undo) a server without the route answers with a 404. */
export const ARCHIVE_MISSING = "Archiving is not available on this server yet";

/**
 * A finger on a list row, from where it went down (`start`) to where it is (`now`): "none"
 * until it has moved SWIPE_SLOP_PX, then "swipe" when it went more sideways than up or down,
 * "scroll" otherwise, and that call stands for the rest of the touch (`decided`, the last
 * one's). `dx` is how far the row follows it sideways (0 unless a swipe), `past` whether
 * letting go now archives the row: SWIPE_SHARE of its `width` or SWIPE_MAX_PX, whichever is
 * less (a width not known: SWIPE_MAX_PX).
 * @param {{x:number, y:number}} start
 * @param {{x:number, y:number}} now
 * @param {number} width the row's, in px
 * @param {"none"|"swipe"|"scroll"} [decided]
 * @returns {{dx:number, decided:"none"|"swipe"|"scroll", past:boolean}}
 */
export function swipeState(start, now, width, decided = "none") {
    const dx = (Number(now.x) || 0) - (Number(start.x) || 0);
    const dy = (Number(now.y) || 0) - (Number(start.y) || 0);
    let call = decided;
    if (call === "none" && Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE_SLOP_PX) {
        call = Math.abs(dx) > Math.abs(dy) ? "swipe" : "scroll";
    }
    const reach = width > 0 ? Math.min(width * SWIPE_SHARE, SWIPE_MAX_PX) : SWIPE_MAX_PX;
    const swiping = call === "swipe";
    return { dx: swiping ? dx : 0, decided: call, past: swiping && Math.abs(dx) >= reach };
}

/**
 * The undo bar's words for a row just archived.
 * @param {string} title rowTitle's
 * @returns {string}
 */
export function archivedLine(title) {
    return `Archived ${title}`;
}

/**
 * The inventory's line when an archive, Unarchive or Undo was refused: a server without the
 * route (404) has it not available yet; anything else names the row and the server's words.
 * @param {string} sku
 * @param {number} status the PcError's
 * @param {string} message errorText's words
 * @returns {string}
 */
export function archiveError(sku, status, message) {
    return status === 404 ? ARCHIVE_MISSING : `${sku}: ${message}`;
}
