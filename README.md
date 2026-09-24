# crosslister snap

Open the phone, tap the icon, type the item name, tap **Snap**, take the
photos. Each photo goes to the home PC the moment it is taken, into the item's
own folder there, whether or not a button is ever pressed. Tap the small **AI**
at the bottom right of the photos the model should look at. Tap **ebay** (or
**craigslist**): the home PC drafts the listing from that folder, posts it, and
the link appears under the button. Tap the other button and the same item goes
up there too, with no second model call. **DONE** starts the next item.

The work happens on the home PC, in `crosslister serve` (the
[crosslister](../crosslister) repo, `docs/USAGE.md`, "The phone app"). This
page is a thin client: it takes the photos, sends them one by one, and shows
what the PC says. Setup is [docs/SETUP.md](docs/SETUP.md): the PC address and
a key, once per phone.

The item folders land in the PC's inbox (`CROSSLISTER_INBOX`), the same folder
`crosslister post` offers when nothing is named, so an item snapped on the
phone can also be finished at the PC's terminal. The page used to upload to
OneDrive directly; that code is in the git history (up to version 1.2.2).

## Architecture in five lines

1. A static page on GitHub Pages: plain HTML, CSS and ES modules, no build step,
   no backend of its own, no npm packages at runtime.
2. **Snap** is a `<label>` for `<input type="file" capture="environment">`: the
   phone's own camera app opens full screen and hands each photo back to the
   page.
3. The upload queue (`queue.js` decides, `app.js` sends) makes the item on the
   PC with the first photo, then sends each photo on its own, shrunk first
   (`shrink.js`: at most 2000 px, JPEG 0.85), one request at a time, retrying
   by itself while the PC does not answer. A venue button then sends only the
   item's id and the AI marks, and asks for the job's status every 3 s.
4. The PC is reached at its Tailscale Funnel address
   (`https://<pc>.<tailnet>.ts.net`) with a per-person key; both are typed into
   **Settings** once and kept in the phone's `localStorage`.
5. `core.js` and `queue.js` hold every decision worth testing (settings, the
   shrink size, the queue, the requests, the job's state and the line under each
   button, when a button may be pressed); `tests/` proves it, including whole
   runs against a fake PC.

## Files

| File | What it is |
| --- | --- |
| `index.html` | the screen, plus the Content-Security-Policy |
| `app.js` | screen wiring: photos, the upload queue, the AI mark, Settings, the two buttons, polling, a reload |
| `queue.js` | the upload queue's rules: what goes next, how long to wait, the badge word |
| `pc.js` | every call to the PC |
| `shrink.js` | a photo to at most 2000 px JPEG, orientation kept |
| `core.js` | pure logic, no DOM, no network: the state and everything the screen says |
| `version.js` | one `VERSION`; every file the page loads carries it as `?v=` |
| `styles.css` | the look |
| `tools/make-icons.mjs` | regenerates `icon-192.png` / `icon-512.png` from scratch |
| `tools/bump-version.mjs` | rewrites every `?v=` to match `VERSION` |
| `tests/` | `node --test`, no dependencies |

## The screen, top to bottom

- **Settings** (header, top right): the PC address and the key. **Save and
  check** stores them and asks the PC whether it knows the key (a read of the
  newest job: no model call, nothing published).
- **Item name**, as before: Snap waits for it, and it names the item's folder
  on the PC, `<item name> <date>` (`Boots 2026-09-24`). Once the first photo is
  taken the name is fixed until **DONE**. The same name on the same day is the
  same folder: its photos join the strip and new ones are numbered after them.
- **Snap** and **Add from gallery**, as before.
- **The photos.** Top left, each photo says where it is: `waiting` (on the
  page, on its way), `sent` (on the PC), or `failed` (the PC refused it; tap
  the word to send it again). The **x** at the top right takes a photo off the
  page and off the PC. The **AI** at the bottom right marks it for the model:
  off by default, a faint outlined "AI" when off, a filled blue chip (and a
  blue frame round the photo) when on. Every photo goes to the listing; only
  the marked ones go to the model, and a new item needs at least one.
- **Notes for this item**: sent to the PC (`note.txt` in the item's folder) a
  moment and a half after you stop typing, or when you leave the box. The small
  word next to the label says `sending...`, `sent`, `not sent (offline), will
  retry`, or `goes with the first photo` before there is an item.
- **ebay | craigslist**, side by side, each with its status line and link:
  `sending`, `queued, 1 ahead`, the PC's step (`drafting the listing`...), then
  the link (opens in a new tab), or the PC's error in its own words.
- **DONE**, at the very bottom: clears the item. It waits while a photo or a
  delete has not reached the PC, and while a job for this item is on its way or
  on the PC; it sends a note still being typed first.

Once a button has sent the item, the photos are locked (no Snap, no x, no AI
toggles) because the PC's saved row is what the second button uses. If the
first job fails before the PC saved the row, they unlock and the next press is
a fresh send.

When a button is disabled, one line under the pair says why: `Set the PC
address and key in Settings`, `Snap a photo first`, `At most 24 photos -
delete n`, `Mark at least one photo AI (bottom right of the photo)`, `A photo
did not reach the PC - tap its 'failed' to try again`, `Waiting for the photos
to reach the PC (2 of 4 sent)`, or that the other button goes first.

## The upload queue, and being offline

One request at a time, in this order: the item itself (with the first photo),
deletes, the photos in the order they were taken, then the note once it is due.
The photos stay in the page's memory until **DONE**, so nothing is lost while
the PC cannot be reached:

- **The PC does not answer** (phone offline, PC asleep, Funnel off): the photo
  stays `waiting`, the banner at the top says so, and the queue waits 1 s, 3 s,
  9 s, 27 s, then every 30 s before trying again, from where it stopped. When
  the phone says it is back online the queue goes at once. New photos taken
  meanwhile join the line.
- **The PC answers with an error** for a photo (not a JPEG, too big): that
  photo shows `failed`; the others carry on. Tap `failed` to send it again. An
  error for the item, a delete or the note (a wrong key, say) is shown in the
  banner and tried again on the same schedule.
- **The x on a photo still waiting** takes it off the page and nothing is sent.
  On a photo that is on the PC, or on its way, or failed, the PC deletes it too.
  Photo numbers are never reused, so a delete leaves a gap and the AI marks keep
  naming the right photos.
- **Leaving the page** asks first while a photo, a delete or the note has not
  reached the PC, or a job is on its way.
- **A reload** (or the phone closing the tab) reads the item back from the PC:
  its photos (shown as "on the PC"; the pictures themselves are there), the AI
  marks, the note, the sku and the jobs, whose status lines carry on. Photos
  that had not reached the PC before the reload are lost from the page (they
  were only in its memory); everything sent is safe.

## The service contract (as this page uses it)

Every call carries the header `X-Crosslister-Key: <key>`. Errors are JSON
`{"detail": "..."}`: 400 with a message, 401 for a wrong key, 404 for an
unknown item or job, 409 while the same item is already being posted.

| Call | Sent | Answer |
| --- | --- | --- |
| `POST <pc>/items`, with the first photo | `{"name": "Boots"}` | `{"item": "Boots 2026-09-24", "photos": [n...]}` (what that folder already holds) |
| `PUT <pc>/items/<id>/photos/<n>`, each photo | the shrunk JPEG itself, `Content-Type: image/jpeg` | `{"item", "n", "bytes"}`; a retry overwrites |
| `DELETE <pc>/items/<id>/photos/<n>`, the x | - | `{"item", "n", "deleted"}`; safe to repeat |
| `PUT <pc>/items/<id>/note` | `{"note": "..."}` (blank removes it) | `{"item", "note"}` |
| `GET <pc>/items/<id>`, after a reload | - | `{"item", "photos", "note", "sku", "jobs"}` |
| `POST <pc>/jobs`, a new item | `{"item": id, "venue": "ebay" or "craigslist", "ai": [photo numbers]}` | `{"job": id, "state": "queued", "ahead": n}` |
| `POST <pc>/jobs`, the other button | `{"sku": sku, "venue": ...}` only | the same |
| `GET <pc>/jobs/<id>`, every 3 s | - | `{"state": queued/running/done/failed, "step", "sku", "links": {"ebay": url, "craigslist": url}, "error", "ahead"}` |
| `GET <pc>/jobs?limit=1` | the Settings check | `{"jobs": [...]}`, or 401 |

The venue buttons open once every photo is `sent` and at least one is marked
AI; the note is sent first if it is still being typed. The `sku` comes from the
first job's status as soon as the PC has saved the row, so the second button
can go while the first job is still publishing. The page keeps the item id and
the sku with the item until **DONE** (the id and the AI marks also in
`localStorage`, `snap.item`, for a reload).

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
and every ES module import inside the app (`./core.js?v=1.4.0`). A new version
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
Taking photos and typing the note cost nothing (they only land in the inbox
folder). **A real press of ebay or craigslist pays for a model call and
publishes.**

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
