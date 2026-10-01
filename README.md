# crosslister snap

Open the phone, tap the icon, type the item name, tap **Snap**, take the
photos. Each photo goes to the home PC the moment it is taken, into the item's
own folder there, whether or not a button is ever pressed. Tap the small **AI**
at the bottom right of the photos the model should look at. Tap **ebay** (or
**craigslist**): the home PC drafts the listing from that folder, posts it, and
the link appears under the button; the price shows above the buttons (`$14`)
as soon as the PC has saved the item. Tap the other button, right away or
later, and the same item goes up there too, with no second model call. **NEXT**
starts the next item, without waiting for the listing to finish.

Books have their own screen: tap **book** at the top, tap **ISBN** to read
the barcode, and the PC finds the book in the catalogues and prices it from
eBay. A book with no ISBN: tap the small **No ISBN** and type its title (the
author, year and paperback | hardcover if known); the PC looks it up by those
instead. A book whose ISBN no catalogue knows: the same **No ISBN**, which then
keeps the ISBN for the listing. Snap the cover (the barcode picture itself is not a photo), tap
**main** on the photo to lead with if it is not the first, pick the
condition, check the price, tap **ebay**.

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
| `app.js` | screen wiring: photos, the upload queue, the AI mark (a book's main mark), Settings, customize, the two buttons, polling, a reload |
| `queue.js` | the upload queue's rules: what goes next, how long to wait, the badge word |
| `pc.js` | every call to the PC |
| `shrink.js` | a photo to at most 2000 px JPEG, orientation kept |
| `book.js` | the book mode's rules: the ISBN (ISBN-10 to 13, check digits), a book with no ISBN (what is searched, the year, the format chips), the price box, the price note, the book card, the conditions |
| `scan.js` | the ISBN off a photo of the barcode, with the phone's own `BarcodeDetector` where it has one |
| `core.js` | pure logic, no DOM, no network: the state and everything the screen says |
| `version.js` | one `VERSION`; every file the page loads carries it as `?v=` |
| `styles.css` | the look |
| `tools/make-icons.mjs` | regenerates `icon-192.png` / `icon-512.png` from scratch |
| `tools/bump-version.mjs` | rewrites every `?v=` to match `VERSION` |
| `tests/` | `node --test`, no dependencies |

## The screen, top to bottom

- **goods | book**, under the header: which kind of item is on screen. The
  page opens on **goods**, and after that on whichever this phone last used
  (`snap.mode` in `localStorage`). The page keeps one item of each kind at
  once, each with its own state: switching in the middle of an item asks
  nothing and loses nothing. Photos of the hidden item keep going to the PC
  (the shown item's go first), and a job running for it keeps being asked
  about, so its link is there on switching back.
- **Settings** (header, top right): the PC address and the key. **Save and
  check** stores them and asks the PC whether it knows the key (a read of the
  newest job: no model call, nothing published). **Close** at the bottom hides
  them again.
- **The server word** (header, beside Settings, and at the top of Settings):
  the page asks the PC by itself, on load, every 30 s while it is on screen,
  and when the phone is back online or back on screen, the same read as the
  Settings check. **server ok** in green, **server off** in red (no answer),
  **wrong key** in red, **server not set** before Settings are saved. When the
  PC comes back, waiting photos go at once instead of after the retry pause.
- **Item name**, as before: Snap waits for it, and it names the item's folder
  on the PC, `<item name> <date>` (`Boots 2026-09-24`). Once the first photo is
  taken the name is fixed until **NEXT**. A name already started today on the
  PC is refused (Michal, 2026-09-30: "if I put a name for an item and it is
  the same as another, just flag it and don't accept it"): half a second after
  he stops typing the page asks the PC for today's folder of that name, and if
  it is there the box turns red, the line under it says `"Lamp" is already an
  item on the PC today with 3 photos. Use a different name.`, and Snap waits
  for another name. (Until then the same name on the same day was silently the
  same folder, and its photos came back into the strip.) A PC that does not
  answer cannot refuse a name; the folder it then lands in is still the one
  the PC names.
- **The photos**, then **Snap** and **Add from gallery** under them (Michal,
  2026-09-30: "when I snap a photo I confirm it with a round white button 3/4
  of the screen length down. When the website comes back I want the snap
  button to be right there, so I can click quickly"). Each photo taken with
  Snap scrolls the page so the button's middle sits three quarters down the
  screen, where the camera's shutter was; the browser stops short when the
  page is not long enough yet. After the first photo the button says **Snap
  Again**.
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
- **▸ customize**, small, left aligned, right above the buttons (Michal,
  2026-09-28: "a little arrow with the word customize. If clicked I want to be
  able to edit quantity. Also I want to be able to check pickup only"). Folded
  until tapped (the arrow turns ▾); it opens a small card with **Quantity** (1
  unless changed; a whole number, 1 or more, or the buttons stay shut and the
  line under them says `Quantity (under customize) must be a whole number, 1
  or more`) and **Pickup only — no shipping on eBay**. Once ticked, the line
  under ebay says `pickup only` until the press, so it is plain it took. Both
  go with either button, the second one's too (the PC updates the saved row
  first), and lock while a job is on its way. Folded again on every load and
  every **NEXT**; the values themselves are kept for a reload and reset by
  NEXT.
- **ebay | craigslist**, side by side, each with its status line and link:
  `sending`, `queued, 1 ahead`, the PC's step (`drafting the listing`...), then
  the link (opens in a new tab), or the PC's error in its own words. The pressed
  button shows a turning ring beside its word until the link or the error comes;
  posted, it turns green. The price is a line above the two buttons (Michal,
  2026-09-28: "When posting, I want to see the price designated"; 2026-09-30:
  "show the chosen price for the item above the buttons instead of replacing
  button text"): nothing before a press and until the PC has saved the row,
  then `$14` (`$14.50` when the price has cents) while it posts and after. The
  price is the PC's (`price` in the job's status), the row's, so it stands for
  both buttons; a failure with nothing else running takes it away. The other
  button can be pressed at any time after the first (Michal, 2026-09-30: "I
  seem not to be able to click craigslist while ebay is loading"): the PC runs
  jobs one at a time, so it queues behind (`queued, 1 ahead`) and, by then, the
  row the first job saved is there to reuse; no second model call. A screen
  reader hears the venue and its state (`ebay, posting`, `ebay, posted`).
- **NEXT** (it was DONE; Michal, 2026-09-28: "I want the final done button to
  be NEXT"), at the very bottom: clears the item and starts the next one. It
  waits while a photo or a delete has not reached the PC (`NEXT waits until
  the photos are on the PC`), and for the moment a press is on its way to the
  PC; it sends a note still being typed first. It does **not** wait for the
  listing ("I want to be able to click NEXT as the things are loading/posting
  ... I know that does not allow seeing the returned link, and that is fine"):
  the job is the PC's, it posts all the same, and the page just stops asking
  about it, so its link is not shown. While a listing is posting, a quiet line
  under NEXT says so: `A listing is still posting on the PC; NEXT starts the
  next item without waiting for its link`.

Once a button has sent the item, the photos are locked (no Snap, no x, no AI
toggles) because the PC's saved row is what the second button uses. If the
first job fails before the PC saved the row, they unlock and the next press is
a fresh send.

When a button is disabled, one line under the pair says why: `Set the PC
address and key in Settings`, `Snap a photo first`, `At most 24 photos -
delete n`, `Mark at least one photo AI (bottom right of the photo)`, `A photo
did not reach the PC - tap its 'failed' to try again`, `Waiting for the photos
to reach the PC (2 of 4 sent)`, or that the other button goes first.

### Book mode

A book is named by its ISBN, not by a model looking at photos: the PC finds it
in the catalogues and looks at what it sells for on eBay, so there is no item
name to type, no AI mark and no model call (in the AI mark's place, **main**
picks the photo the listing leads with). A book with no ISBN is named by its
title instead, and the PC does the same work from that. Top to bottom:

- **ISBN** (the big button; it was called Scan, and it is what it reads): the
  phone's camera, as Snap. The barcode is read on the phone
  (`scan.js`), the ISBN box fills and the PC is asked about the book. The
  picture is only read, never kept: it is not added to the strip, not sent to
  the PC, and a close-up of the barcode is all it needs to be (the line above
  the button says so). A barcode that would not read says `No barcode found — try
  again closer, or type the ISBN under the barcode` and nothing else changes. A
  phone that cannot read barcodes at all (iPhones) says so up front, and the
  button stays grey there. It is
  there until the book's folder is made on the PC; from then its ISBN is fixed
  until **NEXT**.
- **Or type the ISBN**: the number typed instead. ISBN-10 or ISBN-13, hyphens and spaces
  fine; the check digit must be right. It is looked up 0.4 s after the last
  keystroke. The book's folder on the PC is `Book <isbn13> <date>`.
- **No ISBN**, small, under the box: opens the fields for a book that has no
  ISBN (Michal, 2026-09-28: "hidden under one button overall"): **Title**
  (required), **Author**, **Year** (optional) and **Paperback | Hardcover**
  (Paperback unless tapped). 0.6 s after the last keystroke in any of them
  (title not blank) the title names the book's folder, `Book <title> <date>`
  (cleaned and capped as a goods name is), and the PC is asked
  `GET /books/search` by the title, author and year (a year counts once it has
  four digits). While the fields are open the ISBN box is set aside (it is
  emptied, and anything but a valid ISBN in it is ignored); a valid ISBN typed
  or read closes them and is the book. Tapping No ISBN again closes them and
  clears what was typed. Like the ISBN, it is fixed once the folder is on the
  PC; the fields themselves can still be corrected until **ebay** is pressed.
- **No ISBN after an ISBN no catalogue knows** (Michal, 2026-09-28: he scanned
  9781926856155 and the page said to post it as goods, a dead end): the card
  says so and points at No ISBN, which is filled in blue as the next step.
  Tapped, it opens the same fields but keeps the ISBN: the box stays filled
  (greyed, set aside), `ISBN 9781926856155 kept: it goes on the listing` sits
  above the fields, the folder stays `Book <isbn13> <date>` (so No ISBN opens
  even with a cover already on the PC), and the title is searched exactly as
  above. The job then carries the ISBN and the typed fields both
  (`book.isbnMiss`, kept for a reload). A valid different ISBN typed or read
  replaces it and closes the fields, as ever; No ISBN again clears the fields,
  keeps the ISBN and asks the PC about it afresh.
- **The book card**: `looking up...`, then the title in bold, the authors and
  `publisher · year · format · pages`; or `Not in the catalogues. Tap No ISBN
  and type the title — the ISBN stays on the listing.` with the PC's own
  words for the 404 in the small line under it (they may say why, e.g. that no
  Google Books key is set); or the PC's own words when it could not look (edit
  the box to try again). A book looked up by title says `matched in the catalogues`
  under the catalogue's book, or, when no catalogue knows it, shows the title,
  author, year and format as typed with `Not in the catalogues: it will be
  listed as typed` (a typed book is a book: ebay still opens). A catalogue
  match that says hardcover or paperback sets the format chip, unless he
  tapped one.
- **Snap** and **Add from gallery**: the front cover and anything else; the
  first of them makes the book's folder on the PC. The photos have the same
  `waiting` / `sent` / `failed` word and the same **x**, and no AI mark. A
  cover snapped before there is an ISBN or a title waits on the page until one
  is scanned or typed (the progress line says `1 photo, waiting for the ISBN or
  the title` -- `for the title` once No ISBN is open -- and the lines under
  ebay and NEXT say what to do).
- **main**, at the bottom right of each photo, where goods have the AI mark
  and looking the same (a faint outlined `main` when off, a filled blue chip
  and a blue frame when on): the photo the listing leads with. Exactly one
  photo wears it, the first by default, so doing nothing leads with the first
  photo taken. A tap on another moves it there; deleting the main photo moves
  it back to the first one left. After the **ebay** press it shows but no
  longer moves. It is kept with the book for a reload.
- **Condition**: four chips, Like new, Very good, **Good** (the default),
  Acceptable.
- **Price**, in dollars, filled with the PC's suggestion when the lookup
  answers (a price typed first is kept; a suggestion the page filled in is
  replaced by a later answer, when more of the title is typed). Under it: `eBay: 12 listings, $6–$24
  · suggested $11`, or `no eBay listings found — set a price`, with `under $5:
  a lot or a buyback site may be better` when the suggestion is that low.
- **Flaws**: the item's note, sent to the PC exactly as the goods note is.
- **▸ customize**, right above ebay: the same disclosure as for goods, the
  book's own (open or folded, and its values, apart from the goods item's):
  **Quantity** (several copies of one book) and **Pickup only**.
- **ebay**, one full-width button with the same status line, turning ring and
  link. It opens once the book is found (by title: once the PC answered,
  matched or not), there is a photo (`Snap the cover
  first` when there is none), every photo is on the PC and the price is a
  price; otherwise the line under it says which of those is missing (first of
  all `Scan the ISBN, or tap No ISBN and type the title`; after an ISBN no
  catalogue knows, `Tap No ISBN and type the title`). It sends
  the main photo's number with the book, and for a book with no ISBN what was
  typed (after a miss, the ISBN too). The price line above it is as for
  goods, but from the press: the price is typed on the page, so it reads
  `$11` at once, and the PC's `price` replaces it when it says one.
- **NEXT**, as for goods (it does not wait for the listing either); it also
  clears a book that has an ISBN (or a typed title) but no photo.

## The upload queue, and being offline

One request at a time, in this order: the item itself (with the first photo),
deletes, the photos in the order they were taken, then the note once it is due.
The photos stay in the page's memory until **NEXT**, so nothing is lost while
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
  reached the PC, or a venue press has not reached it yet. A listing the PC
  has taken is no reason to ask: it posts whether or not the page watches.
- **NEXT** never drops what the queue still owes the PC: it stays shut while a
  photo or a delete of this item is on its way. The other kind's item (goods
  or book) keeps its own photos going, as ever.
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
| `GET <pc>/books/<isbn13>`, a book's ISBN known | - | `{"isbn", "title", "subtitle", "authors": [...], "publisher", "year", "format", "pages", "price": "11" or null, "listings": {"count", "low", "high"} or null, "route": "list" / "lot or buyback" / "unknown"}`; 404 not in the catalogues (its `detail` is shown under the card as the reason, e.g. no Google Books key; No ISBN is then the next step and keeps the ISBN), 400 not an ISBN, 502 the catalogues could not be reached |
| `GET <pc>/books/search?title=<t>&author=<a>&year=<y>`, No ISBN, 0.6 s after the last keystroke | each URL-encoded (`%20` for a space); author and year `""` when not typed, year only once it has four digits | the same as `/books/<isbn13>`, plus `"found": true` (a catalogue matched it) or `false` (none did: it is listed as typed; `price` and `listings` still from eBay); 400 and 502 show the PC's words and keep the fields |
| `POST <pc>/jobs`, a new item | `{"item": id, "venue": "ebay" or "craigslist", "ai": [photo numbers]}` | `{"job": id, "state": "queued", "ahead": n}` |
| `POST <pc>/jobs`, a book | `{"item": id, "venue": "ebay", "book": {"isbn": "9780306406157", "title": "", "author": "", "year": "", "format": "", "condition": "good", "price": "11", "main": 1}}`, no `ai`; `main` (always sent) is the number of the photo marked main, the first unless moved. With no ISBN: `"isbn": ""`, `"title"` (never blank), `"author"`, `"year"` as typed (tidied; `""` when not given) and `"format": "paperback"` or `"hardcover"`; with an ISBN those four are `""`. After an ISBN no catalogue knows (the 404 above) and No ISBN: both, `"isbn": "9781926856155"` and the typed `"title"`, `"author"`, `"year"`, `"format"`; the PC keeps the ISBN on the listing and takes the rest from the typed fields | the same |
| `POST <pc>/jobs`, the other button | `{"sku": sku, "venue": ...}` only (plus customize's two, below); the PC updates the saved row with them before it posts | the same |
| customize, in any of the three `POST <pc>/jobs` bodies above | top-level `"quantity": 2` (only when not 1) and `"pickup_only": true` (only when ticked), e.g. `{"item", "venue", "ai", "quantity": 2, "pickup_only": true}`; left alone, the body is exactly as above | the same |
| `GET <pc>/jobs/<id>`, every 3 s, until the link, the error or NEXT | - | `{"state": queued/running/done/failed, "step", "sku", "price", "links": {"ebay": url, "craigslist": url}, "error", "ahead"}`; `price` is the saved row's (`"14.00"`), `""` until the row is saved (a book: right after the save; goods: after the draft). The same in each of `GET /items/<id>`'s `jobs` |
| `GET <pc>/jobs?limit=1` | the Settings check | `{"jobs": [...]}`, or 401 |

The venue buttons open once every photo is `sent` and at least one is marked
AI; the note is sent first if it is still being typed. The `sku` comes from the
first job's status as soon as the PC has saved the row, so the second button
can go while the first job is still publishing. The page keeps the item id and
the sku with the item until **NEXT** (the id and the AI marks also in
`localStorage`, `snap.item`, for a reload; a book's id, ISBN (or, with no
ISBN, its title, author, year and format; after an ISBN miss, both, and
`isbnMiss`), condition, price, main photo and found record in `snap.book`;
either one's customize, `{"quantity", "pickupOnly"}`, once it is not the
default). A book's barcode picture (the ISBN button) is
never uploaded: only its barcode is read, on the phone.

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
and every ES module import inside the app (`./core.js?v=1.5.0`). A new version
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
