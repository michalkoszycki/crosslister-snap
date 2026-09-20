# crosslister snap

Open the phone, tap the icon, type the item name, tap the shutter. Each photo
goes straight into OneDrive under `Pictures/Uploads/<item name>/`, which is the
folder the [crosslister](../crosslister) CLI reads on the PC. No camera roll
detour, no OneDrive app, no "pick files, upload". Works from anywhere; the PC
can be off, it picks the photos up next time OneDrive syncs.

Notes for the item go into the same folder as `note.txt`, and the little **x**
on a thumbnail deletes that photo from OneDrive as well as from the page.

**Not set up yet.** Do [docs/SETUP.md](docs/SETUP.md) first: it takes one app
registration and one line in `config.js`.

## Architecture in five lines

1. A static page on GitHub Pages: plain HTML, CSS and ES modules, no build step,
   no backend, no npm packages at runtime.
2. `auth.js` signs the person in with MSAL Browser v5 (redirect flow, personal
   Microsoft accounts, the `Files.ReadWrite` scope), tokens cached in
   `localStorage`.
3. `camera.js` runs an in-page camera (`getUserMedia` + `ImageCapture`), and
   `app.js` hands each still to `graph.js` immediately, one at a time, in the
   background.
4. `graph.js` asks Microsoft Graph for an upload session addressed by path and
   PUTs the bytes; the `<item name>` folder is created implicitly by that path.
   It also PUTs `note.txt` and DELETEs a photo you struck out.
5. `core.js` holds every decision worth testing (name cleaning, file naming,
   byte ranges, retry schedule, the photo and note state machines); `tests/`
   proves it.

The bytes never touch a server of ours: phone -> Microsoft, directly.

## Files

| File | What it is |
| --- | --- |
| `index.html` | the screen, plus the Content-Security-Policy |
| `redirect.html`, `bridge.js` | the MSAL v5 "redirect bridge" page sign-in comes back to |
| `config.js` | **the only file you edit**: client id, folder, scopes, `note.txt` |
| `app.js` | screen wiring, the upload queue, offline handling |
| `camera.js` | the live camera: `getUserMedia`, `ImageCapture`, canvas fallback |
| `auth.js` | sign in / sign out / get a token |
| `graph.js` | every Microsoft Graph call |
| `core.js` | pure logic, no DOM, no network |
| `version.js` | one `VERSION`; every file the page loads carries it as `?v=` |
| `vendor/` | pinned `@azure/msal-browser` 5.22.0 bundles + its MIT licence |
| `tools/make-icons.mjs` | regenerates `icon-192.png` / `icon-512.png` from scratch |
| `tools/bump-version.mjs` | rewrites every `?v=` to match `VERSION` |
| `tests/` | `node --test`, no dependencies |

## Taking photos: no accept/retake

Tap **Open camera** once (that tap is what makes Chrome ask for the camera, and
it is why the permission prompt does not appear on page load). From then on the
preview is live and **every tap of the round shutter is a photo** — it goes
straight into the upload queue, the preview keeps running, and there is no
accept/retake screen at all. The screen blinks white so you know it fired.

That blink is the whole confirmation, by design. The old
`<input type="file" capture="environment">` is still there, tucked under **Other
ways to add a photo**, but it hands over to the Android camera app, and *that*
app always shows its own accept/retake screen — a web page cannot switch that
off. Use it only if the in-page camera will not start.

**What resolution you get.** With `ImageCapture.takePhoto()` (Chrome on
Android) the page asks for the largest `imageWidth`/`imageHeight` that
`getPhotoCapabilities()` reports, which is the camera's full still — on a Pixel
that is typically a 12 MP JPEG, several MB. Where `ImageCapture` is missing or
throws (Firefox, Safari), it falls back to drawing the live frame onto a canvas
and `toBlob("image/jpeg", 0.92)`, which gives the *preview* size instead —
usually around 1920×1080. Either way the file is a JPEG and is named
`<item>-<n>.jpg` like every other photo.

The camera is released (`track.stop()`) on **Next item**, on sign-out and
whenever the page is hidden, and comes back on its own when you return.

## Notes

The **Notes for this item** box is saved to
`Pictures/Uploads/<item>/note.txt`, UTF-8 plain text, one file per item,
overwritten each time. It saves itself a second and a half after you stop
typing, and again when you leave the box, tap **Next item**, or switch away
from the page. The small grey word next to the label is the only status:
"saving...", "saved", or "not saved (offline), will retry". Emptying the box
deletes the `note.txt` that was uploaded; if none was, nothing is sent at all.

`note.txt` is a **contract with the CLI**, which reads it on the PC. The name
lives in `config.js` as `noteFileName` — change it there and you must change it
in the CLI too.

## Deleting a photo

Every thumbnail has an **x** in its top right (a 44 px touch target around a
small glyph). Tapping it:

- sends `DELETE /me/drive/items/{id}` straight away — **no confirmation**, on
  purpose;
- fades the card out at once, and if Graph refuses, brings it back marked
  `delete failed`, with the x still there to try again;
- for a photo still uploading, aborts the PUT instead. An abandoned upload
  session leaves no file behind, so there is nothing to delete;
- for a queued or failed photo, just drops it from the page.

Deleted files go to the **OneDrive recycle bin**, not to nothing, so a mistap
is recoverable from onedrive.com for 30 days.

Numbering never goes backwards: delete `Boots-2.jpg` and the next photo is
still `Boots-3.jpg`. Gaps are fine, and a file name is never reused.

## Getting a fix onto the phone

GitHub Pages caches every file for ten minutes, which can leave the phone with
a new `index.html` next to a stale `app.js`. So `version.js` holds one
`VERSION`, and everything the page loads carries it: the stylesheet, `app.js`,
and every ES module import inside the app (`./core.js?v=1.1.0`). A new version
is a new URL, and a new URL was never in the cache. Node accepts the same query
on a relative import, so `node --test` is unaffected.

The running version is in small print at the bottom of the page, next to
**Reload latest**, which reloads with a timestamp query if you are impatient.

To release: edit `VERSION`, run `node tools/bump-version.mjs`, commit, push. A
test fails if any `?v=` drifts out of step.

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
| `PUT /v1.0/me/drive/root:/Pictures/Uploads/<item>/note.txt:/content` | the note, in one call; a PUT to a path that already has a file replaces it |
| `DELETE /v1.0/me/drive/items/{id}` | the x on a thumbnail; `204 No Content`, and the file goes to the recycle bin |

The upload URL is pre-authenticated: the `Authorization` header is deliberately
**not** sent on the PUT of the bytes, as the Graph docs require. The other
three calls do send it.

The id for the `DELETE` is the `id` of the driveItem Graph returns in its
answer to the **last** byte range, which `graph.js` keeps on the photo. The
same goes for `note.txt`: its `id` comes back from the PUT and is what an
emptied note deletes.

All four calls are covered by the one delegated **`Files.ReadWrite`** scope the
app already asks for — the Graph reference lists it as the least-privileged
permission for a personal Microsoft account on both the delete and the
small-file upload, so nothing new is ever consented to.

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
- Small-file upload (`PUT .../:/content`, "up to 250 MB", `Content-Type`
  required, returns the driveItem), used for `note.txt`:
  <https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0>
- Delete a file (`DELETE /me/drive/items/{id}`, `204 No Content`, "moves the
  items to the recycle bin", `Files.ReadWrite` least privileged for a personal
  account):
  <https://learn.microsoft.com/en-us/graph/api/driveitem-delete?view=graph-rest-1.0>
- `getUserMedia` constraint syntax, the exception names, the secure-context
  rule (https or localhost):
  <https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia>
- `new ImageCapture(track)` and `takePhoto(photoSettings)` → `Promise<Blob>`,
  and the `readyState === "live"` requirement:
  <https://developer.mozilla.org/en-US/docs/Web/API/ImageCapture/takePhoto>
- `getPhotoCapabilities()` → `{ imageWidth: {min,max,step}, imageHeight: … }`,
  where the "largest still on offer" comes from:
  <https://developer.mozilla.org/en-US/docs/Web/API/ImageCapture/getPhotoCapabilities>
- CSP `media-src` (what it covers for `<audio>`/`<video>`):
  <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/media-src>

## Verified vs unverified

**Verified by running it here**

- `node --test`: 73 tests, all passing.
- Every module still loads with its `?v=` query, both in Node and over
  `python -m http.server 8080` (checked with curl: `app.js?v=…`, `core.js?v=…`,
  `camera.js?v=…`, `styles.css?v=…` — all 200, right content types).
- The note, photo-delete and camera logic under stubs: the state machines, the
  debouncer, the largest-size pick from `getPhotoCapabilities()`, the canvas
  fallback when `ImageCapture` is absent or `takePhoto()` throws, and that the
  page comes up and says so when `navigator.mediaDevices` is missing entirely.
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
- **What resolution `takePhoto()` actually delivers on the Pixel.** The page
  asks for `getPhotoCapabilities().imageWidth.max` × `imageHeight.max`, but
  Chrome has been known to ignore the request and hand back the preview size.
  Check: snap one photo, then look at the file in OneDrive — its pixel
  dimensions and its size in MB. A ~12 MP, multi-MB JPEG is the good case; a
  1920×1080, few-hundred-KB one means Chrome fell back and the canvas path is
  no worse.
- **The camera permission prompt in the home-screen app.** Chrome asks on the
  first **Open camera** tap. Whether a page launched from the Android home
  screen (standalone display mode) asks separately, or inherits the answer the
  browser tab already gave, has not been tried.
- **Delete.** The `DELETE` has never been sent against the live service. Check:
  tap the x on an uploaded photo; the card should vanish within a second and
  the file should be gone from `Pictures/Uploads/<item>/` on onedrive.com and
  present in the recycle bin. If the card comes back saying `delete failed`,
  long-press it to read the error.
- **The note upload.** `PUT .../note.txt:/content` has never been sent either,
  and a personal OneDrive has rejected a fuller body before (the
  `createUploadSession` 400 of 2026-09-19). Check: type a note, wait two
  seconds for "saved", then look for `note.txt` in the item folder and open it.
  Then clear the box and confirm the file disappears.
- The old `capture="environment"` fallback on the Pixel: that it opens the
  camera app and that the photo is not added to the gallery. That is Android's
  choice, not the page's.
- "Add to Home screen" producing a standalone app icon.

## Security and privacy

- No secrets in this repo. The Application (client) ID in `config.js` is public
  by design: a single-page app cannot keep a secret, so the identity platform
  treats the client id as an identifier, not a credential. What protects the
  account is the registered redirect URIs plus the person's own sign-in.
- The app asks for `Files.ReadWrite` only — the signed-in person's own files.
  Never `Files.ReadWrite.All`. Writing `note.txt` and deleting a photo are both
  covered by it, so the set of permissions has not grown.
- The camera stream never leaves the device as a stream: a still is captured,
  uploaded to OneDrive, and the tracks are stopped as soon as the page is
  hidden or the item is finished. There is no recording and no `audio: true`.
- No analytics, no external fonts, nothing loaded from a third party at all.
- Nothing is logged to the console; a test enforces that.
- Access tokens live in `localStorage` under MSAL's own keys, as MSAL manages
  them, and never leave the browser except in the `Authorization` header to
  `graph.microsoft.com`.
