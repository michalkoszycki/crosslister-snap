// auth.js -- sign-in with MSAL Browser v5 (vendored, see vendor/).
//
// Docs used:
//  https://learn.microsoft.com/en-us/entra/msal/javascript/browser/initialization
//  https://learn.microsoft.com/en-us/entra/msal/javascript/browser/v4-migration
//  https://learn.microsoft.com/en-us/entra/msal/javascript/browser/acquire-token
//
// Redirect flow only -- popups are unreliable on Android Chrome. MSAL v5 routes
// every flow through a "redirect bridge" page, so redirectUri points at
// redirect.html, which hands the answer back to this page.

import { config, redirectUri } from "./config.js";

let pca = null;
let account = null;

/** True when config.js still has the placeholder client id. */
export function clientIdMissing() {
    return !config.clientId || config.clientId.startsWith("PASTE-");
}

function msalNamespace() {
    const ns = globalThis.msal;
    if (!ns) {
        throw new Error(
            "MSAL did not load. Check that vendor/msal-browser-5.22.0.min.js is present."
        );
    }
    return ns;
}

/**
 * Create the MSAL instance and process any sign-in answer we came back with.
 * @returns {Promise<{account: object|null}>}
 */
export async function initAuth() {
    const msal = msalNamespace();
    const msalConfig = {
        auth: {
            clientId: config.clientId,
            authority: config.authority,
            redirectUri: redirectUri(),
        },
        cache: {
            // localStorage so he stays signed in between visits and tabs.
            cacheLocation: "localStorage",
        },
    };

    pca = await msal.createStandardPublicClientApplication(msalConfig);

    // Must be called on every page load when using the redirect APIs.
    const result = await pca.handleRedirectPromise();
    if (result && result.account) {
        account = result.account;
    } else {
        const all = pca.getAllAccounts();
        account = all.length > 0 ? all[0] : null;
    }
    if (account) pca.setActiveAccount(account);
    return { account };
}

/** @returns {object|null} the signed-in account, or null. */
export function currentAccount() {
    return account;
}

/** Start an interactive sign-in. The page navigates away and comes back. */
export async function signIn() {
    await pca.loginRedirect({ scopes: config.scopes });
}

/** Sign out and forget the cached tokens. */
export async function signOut() {
    await pca.logoutRedirect({ account: account || undefined });
}

/**
 * Get an access token for Graph. Silent first; if Microsoft insists on seeing
 * the person again, fall back to a full-page redirect.
 * @returns {Promise<string>} the access token
 */
export async function getAccessToken() {
    if (!account) throw new Error("not signed in");
    const msal = msalNamespace();
    try {
        const res = await pca.acquireTokenSilent({
            scopes: config.scopes,
            account,
        });
        return res.accessToken;
    } catch (e) {
        const needsUser =
            e instanceof msal.InteractionRequiredAuthError ||
            e?.errorCode === "interaction_required" ||
            e?.errorCode === "login_required" ||
            e?.errorCode === "consent_required" ||
            e?.errorCode === "no_account_error";
        if (needsUser) {
            await pca.acquireTokenRedirect({ scopes: config.scopes, account });
            // The page is navigating away; nothing below runs.
            return new Promise(() => {});
        }
        throw e;
    }
}
