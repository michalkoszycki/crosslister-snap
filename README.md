# crosslister snap

Open the phone, tap the icon, type the item name, snap. Each photo goes
straight into OneDrive under `Pictures/Uploads/<item name>/`, which is the
folder the [crosslister](../crosslister) CLI reads on the PC. No camera roll
detour, no OneDrive app, no "pick files, upload". Works from anywhere; the PC
can be off, it picks the photos up next time OneDrive syncs.

**Not set up yet.** Do [docs/SETUP.md](docs/SETUP.md) first: it takes one app
registration and one line in `config.js`.

## Architecture in five lines

1. A static page on GitHub Pages: plain HTML, CSS and ES modules, no build step,
   no backend, no npm packages at runtime.
2. `auth.js` signs the person in with MSAL Browser v5 (redirect flow, personal
   Microsoft accounts, the `Files.ReadWrite` scope), tokens cached in
   `localStorage`.
3. `app.js` takes each photo from an `<input type="file" capture="environment">`
   and hands it to `graph.js` immediately, one at a time, in the background.
4. `graph.js` asks Microsoft Graph for an upload session addressed by path and
   PUTs the bytes; the `<item name>` folder is created implicitly by that path.
5. `core.js` holds every decision worth testing (name cleaning, file naming,
   byte ranges, retry schedule, the photo-list reducer); `tests/` proves it.

The bytes never touch a server of ours: phone -> Microsoft, directly.

## Files

| File | What it is |
| --- | --- |
| `index.html` | the screen, plus the Content-Security-Policy |
| `redirect.html`, `bridge.js` | the MSAL v5 "redirect bridge" page sign-in comes back to |
| `config.js` | **the only file you edit**: client id, folder, scopes |
| `app.js` | screen wiring, the upload queue, offline handling |
| `auth.js` | sign in / sign out / get a token |
| `graph.js` | the two Microsoft Graph calls |
| `core.js` | pure logic, no DOM, no network |
| `vendor/` | pinned `@azure/msal-browser` 5.22.0 bundles + its MIT licence |
| `tools/make-icons.mjs` | regenerates `icon-192.png` / `icon-512.png` from scratch |
| `tests/` | `node --test`, no dependencies |

## Run it

```powershell
# tests (Node 24; nothing to install)
node --test

# the page, at http://localhost:8080/
python -m http.server 8080
```

`http://localhost:8080/redirect.html` must be one of the registered redirect
URIs for sign-in to work locally (SETUP.md step 1 adds it).

## Why MSAL is vendored instead of loaded from a CDN

Microsoft retired the MSAL CDN at `@azure/msal-browser` v3 and now tells app
developers to take MSAL from a package manager or bundler. We have no bundler,
so the two pinned minified bundles from the npm tarball of **5.22.0** live in
`vendor/` and are loaded with plain `<script>` tags:

- `vendor/msal-browser-5.22.0.min.js` — UMD, defines `window.msal`
  (sha256 `5CE42B98842C06A0D00233253F46684F43DD398B46CB7DD5E1441F1BFD9CAA6D`)
- `vendor/msal-redirect-bridge-5.22.0.min.js` — UMD, defines
  `window.msalRedirectBridge`, used only by `redirect.html`

Upside: nothing is fetched from a third party at all, and the strict CSP can be
`script-src 'self'`. To upgrade, download the new tarball and replace both files
(and the file names in `index.html`, `redirect.html` and `tests/page.test.js`).

## Graph endpoints used

| Call | Purpose |
| --- | --- |
| `POST /v1.0/me/drive/root:/Pictures/Uploads/<item>/<file>:/createUploadSession` | start an upload, creating the folder implicitly, `@microsoft.graph.conflictBehavior: rename` |
| `PUT <uploadUrl>` with `Content-Range: bytes a-b/total` | the bytes, in ranges that are multiples of 320 KiB (10 MiB each) |

The upload URL is pre-authenticated: the `Authorization` header is deliberately
**not** sent on the PUT, as the Graph docs require.

## Sources relied on

- createUploadSession, byte ranges, the "no Authorization header on the PUT"
  rule, retry advice:
  <https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0>
- CORS for browser JavaScript against OneDrive/Graph:
  <https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/working-with-cors?view=odsp-graph-online>
- MSAL initialization, `createStandardPublicClientApplication`,
  `handleRedirectPromise`, redirect vs popup:
  <https://learn.microsoft.com/en-us/entra/msal/javascript/browser/initialization>
- MSAL v5 changes, the redirect bridge page and why `redirectUri` points at it:
  <https://learn.microsoft.com/en-us/entra/msal/javascript/browser/v4-migration>
- MSAL CDN retirement:
  <https://learn.microsoft.com/en-us/entra/msal/javascript/browser/cdn-usage>
- App registration, account types, Application (client) ID:
  <https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app>

## Verified vs unverified

**Verified by running it here**

- `node --test`: 41 tests, all passing.
- `app.js` loads and paints against the real ids in `index.html`, under a stubbed
  DOM, with no thrown error (`tests/page.test.js`).
- Every file `index.html` and `redirect.html` reference exists and is served with
  the right content type by `python -m http.server 8080` (checked with curl:
  page, modules, vendored MSAL, manifest, icons, redirect page — all 200).
- The vendored bundles are the real 5.22.0 artefacts and define the globals the
  page expects.
- The CSP has no `unsafe-inline` and does list Graph, the OneDrive upload hosts
  and the login endpoints.
- Icon PNGs render (checked by eye).

**Unverified until Michal has a client id and signs in**

- The sign-in round trip itself: redirect to Microsoft, `redirect.html`, back to
  the app, the account name appearing. There is no client id yet, so this could
  not be exercised.
- Whether the MSAL v5 redirect bridge behaves as documented on Android Chrome.
  If sign-in ever loops or lands on a blank `redirect.html`, that is the first
  suspect; the fallback is to pin `@azure/msal-browser` 4.x, whose redirect flow
  needs no bridge page and whose redirect URI is the app root.
- A real upload: `createUploadSession` and the byte-range PUT against a personal
  OneDrive from a browser, including whether CORS lets the PUT through to the
  `*.up.1drv.com` host the session returns. The code follows the documented
  shape but has never been run against the live service.
- Camera behaviour on the Pixel: that `capture="environment"` opens the camera
  and that the photo is not added to the gallery. That is Android's choice, not
  the page's — Chrome hands the page a temporary file. If a copy does show up in
  the camera roll, it is because the camera app was configured to save it.
- "Add to Home screen" producing a standalone app icon.

## Security and privacy

- No secrets in this repo. The Application (client) ID in `config.js` is public
  by design: a single-page app cannot keep a secret, so the identity platform
  treats the client id as an identifier, not a credential. What protects the
  account is the registered redirect URIs plus the person's own sign-in.
- The app asks for `Files.ReadWrite` only — the signed-in person's own files.
  Never `Files.ReadWrite.All`.
- No analytics, no external fonts, nothing loaded from a third party at all.
- Nothing is logged to the console; a test enforces that.
- Access tokens live in `localStorage` under MSAL's own keys, as MSAL manages
  them, and never leave the browser except in the `Authorization` header to
  `graph.microsoft.com`.
