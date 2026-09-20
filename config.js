// config.js -- the only file you normally have to edit.
//
// STEP 1 of docs/SETUP.md gives you an "Application (client) ID" that looks
// like 11111111-2222-3333-4444-555555555555. Paste it between the quotes
// below, save the file, done. Nothing else in this repo needs changing.
//
// This id is NOT a secret. A single-page app cannot keep secrets, so Microsoft
// designs the client id to be public; it only says "which app is asking".
// Security comes from the redirect URIs you registered and from you signing in.

export const config = {
    /** Application (client) ID from the Microsoft Entra admin center. */
    clientId: "2db33f4c-37f9-4a9c-98b6-3eb1d3170637",

    /**
     * "consumers" = personal Microsoft accounts (outlook.com, hotmail.com,
     * live.com, Xbox). Work/school accounts are not used here.
     */
    authority: "https://login.microsoftonline.com/consumers",

    /**
     * Where OneDrive photos land, under the root of your personal OneDrive.
     * The <item name> folder is created automatically under this.
     */
    basePath: "Pictures/Uploads",

    /** Delegated Graph permission. Not Files.ReadWrite.All -- this app only
     *  ever needs the files of the signed-in person. */
    scopes: ["Files.ReadWrite"],

    /**
     * The notes file, written next to the photos as
     * Pictures/Uploads/<item>/note.txt (UTF-8, plain text).
     *
     * This name is a CONTRACT with the crosslister CLI on the PC, which reads
     * it to pre-fill the listing description. Change it here and you must
     * change it there too.
     */
    noteFileName: "note.txt",

    /** Graph API root. */
    graphRoot: "https://graph.microsoft.com/v1.0",
};

/**
 * The folder the app is served from, e.g. "https://user.github.io/crosslister-snap/"
 * or "http://localhost:8080/". Derived from the URL so the same code works in
 * both places with nothing to edit.
 */
export function appBaseUrl() {
    const { origin, pathname } = window.location;
    // keep the folder, drop index.html / redirect.html and any query or hash
    return origin + pathname.replace(/[^/]*$/, "");
}

/**
 * The redirect URI: the little redirect.html "bridge" page next to index.html.
 * MSAL v5 sends the sign-in answer there, and that page hands it back to the
 * app. This exact URL must be listed in the app registration (SETUP.md step 1).
 */
export function redirectUri() {
    return appBaseUrl() + "redirect.html";
}
