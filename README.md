# crosslister snap

Open the phone, tap the icon, type the item name, tap **Snap**, take the
photos. Tap the small **AI** at the bottom right of the photos the model should
look at. Tap **ebay** (or **craigslist**): the home PC drafts the listing,
posts it, and the link appears under the button. Tap the other button and the
same item goes up there too, with no second upload and no second model call.
**DONE** starts the next item.

The work happens on the home PC, in `crosslister serve` (the
[crosslister](../crosslister) repo, `docs/USAGE.md`, "The phone app"). This
page is a thin client: it holds the photos, sends them, and shows what the PC
says. Setup is [docs/SETUP.md](docs/SETUP.md): the PC address and a key, once
per phone.

A OneDrive fallback for when the PC does not answer is planned for later. The
page used to upload to OneDrive directly; that code is in the git history
(up to version 1.2.2).

## Architecture in five lines

1. A static page on GitHub Pages: plain HTML, CSS and ES modules, no build step,
   no backend of its own, no npm packages at runtime.
2. **Snap** is a `<label>` for `<input type="file" capture="environment">`: the
   phone's own camera app opens full screen and hands each photo back to the
   page, which keeps it in memory until **DONE**.
3. A venue button shrinks each photo (`shrink.js`: at most 2000 px, JPEG 0.85)
   and sends the item to the PC in one request (`pc.js`), then asks for its
   status every 3 s until there is a link or an error.
4. The PC is reached at its Tailscale Funnel address
   (`https://<pc>.<tailnet>.ts.net`) with a per-person key; both are typed into
   **Settings** once and kept in the phone's `localStorage`.
5. `core.js` holds every decision worth testing (settings, the shrink size, the
   request, the job's state and the line under each button, when a button may be
   pressed); `tests/` proves it, including a whole run against a fake PC.

## Files

| File | What it is |
| --- | --- |
| `index.html` | the screen, plus the Content-Security-Policy |
| `app.js` | screen wiring: photos, the AI mark, Settings, the two buttons, polling |
| `pc.js` | every call to the PC |
| `shrink.js` | a photo to at most 2000 px JPEG, orientation kept |
| `core.js` | pure logic, no DOM, no network |
| `version.js` | one `VERSION`; every file the page loads carries it as `?v=` |
| `styles.css` | the look |
| `tools/make-icons.mjs` | regenerates `icon-192.png` / `icon-512.png` from scratch |
| `tools/bump-version.mjs` | rewrites every `?v=` to match `VERSION` |
| `tests/` | `node --test`, no dependencies |

## The screen, top to bottom

- **Settings** (header, top right): the PC address and the key. **Save and
  check** stores them and asks the PC whether it knows the key (a read of the
  newest job: no model call, nothing published).
- **Item name**, as before: Snap waits for it, and it names the photos
  (`Boots-1.jpg`, `Boots-2.jpg`, ...). The service has no name field; the model
  names the listing from the photos and the note.
- **Snap** and **Add from gallery**, as before.
- **The photos.** The **x** at the top right takes a photo off the page. The
  **AI** at the bottom right marks it for the model: off by default, a faint
  outlined "AI" when off, a filled blue chip (and a blue frame round the photo)
  when on. Every photo goes to the listing; only the marked ones go to the
  model, and a new item needs at least one.
- **Notes for this item**, as before. The note goes with the first button only;
  the small word next to the label then says `sent`, or
  `changed after sending - not sent` if it was edited afterwards.
- **ebay | craigslist**, side by side, each with its status line and link:
  `sending 3 photos`, `queued, 1 ahead`, the PC's step (`drafting the
  listing`...), then the link (opens in a new tab), or the PC's error in its own
  words. `cannot reach the PC` when the request never arrived; the button comes
  back and the photos are still on the page.
- **DONE**, at the very bottom: clears the item. It waits while a job for this
  item is on its way or on the PC.

Once the first button has sent the photos, they are locked (no Snap, no x, no
AI toggles) because the PC's saved row is what the second button uses. If the
first job fails before the PC saved the row, they unlock and the next press is
a fresh send.

When a button is disabled, one line under the pair says why: `Set the PC
address and key in Settings`, `Snap a photo first`, `Mark at least one photo AI
(bottom right of the photo)`, `At most 24 photos - delete n`, or that the other
button goes first.

## The service contract (as this page uses it)

Every call carries the header `X-Crosslister-Key: <key>`. Errors are JSON
`{"detail": "..."}`: 400 with a message, 401 for a wrong key, 404 for an
unknown job.

| Call | Sent | Answer |
| --- | --- | --- |
| `POST <pc>/jobs`, a new item | multipart: `venue` = `ebay` or `craigslist`, `note`, `ai` = 0-based positions of the marked photos in the order sent (`0,2`), `photos` (1-24 JPEGs) | `{"job": id, "state": "queued", "ahead": n}` |
| `POST <pc>/jobs`, the other button | `venue` and `sku` only: no photos, no `ai`, no `note` | the same |
| `GET <pc>/jobs/<id>`, every 3 s | - | `{"state": queued/running/done/failed, "step", "sku", "links": {"ebay": url, "craigslist": url}, "error", "ahead"}` |
| `GET <pc>/jobs?limit=1` | the Settings check | `{"jobs": [...]}`, or 401 |

The `sku` comes from the first job's status as soon as the PC has saved the
row, so the second button can go while the first job is still publishing. The
page keeps it with the item until **DONE**.

## Settings

- **PC address**: `https://<pc>.<tailnet>.ts.net`, the address
  `tailscale funnel` prints. Only `https://*.ts.net` is accepted, plus
  `http://127.0.0.1` and `http://localhost` for trying the page on the PC
  itself; the page's CSP allows exactly those, so any other address could only
  fail silently.
- **Key**: one of the keys in `CROSSLISTER_KEYS` in the PC's `.env`. Michal and
  his wife may use the same key on two phones.

Both are stored in `localStorage` on the phone (`snap.pc`, `snap.key`). Every
storage read and write is wrapped, so a private window or blocked site data
only means Settings are not remembered.

## Getting a fix onto the phone

GitHub Pages caches every file for ten minutes, which can leave the phone with
a new `index.html` next to a stale `app.js`. So `version.js` holds one
`VERSION`, and everything the page loads carries it: the stylesheet, `app.js`,
and every ES module import inside the app (`./core.js?v=1.3.0`). A new version
is a new URL, and a new URL was never in the cache. Node accepts the same query
on a relative import, so `node --test` is unaffected.

The running version is in small print at the bottom of the page.

To release: edit `VERSION`, run `node tools/bump-version.mjs`, commit, push. A
test fails if any `?v=` drifts out of step.

## Run it

```powershell
# tests (Node 24; nothing to install)
node --test

# the page, at http://localhost:8080/
python -m http.server 8080
```

To point the local page at a local `crosslister serve`
(`http://127.0.0.1:8765`), the service must allow the page's origin: add
`http://localhost:8080` to `CROSSLISTER_SERVE_ORIGINS` in the PC's `.env`
(e.g. `CROSSLISTER_SERVE_ORIGINS=https://*.github.io,http://localhost:8080`).
**A real press of ebay or craigslist pays for a model call and publishes.**

## Security and privacy

- No secrets in this repo. The key is typed into each phone and lives only in
  that phone's `localStorage` and in the header of calls to the PC.
- The CSP lets the page talk to the PC's Tailscale address (or loopback) and
  nothing else; no third-party script, font or analytics.
- Shrinking re-encodes each photo, which also drops the camera's metadata (GPS
  included) before anything leaves the phone.
- A link from the PC is only made tappable if it is an `http(s)` address, and
  it opens with `rel="noopener noreferrer"`.
- Nothing is logged to the console; a test enforces that.
