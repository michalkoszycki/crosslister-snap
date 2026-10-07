# crosslister $nap

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
   **Settings** (under **Admin**) once and kept in the phone's `localStorage`.
5. `core.js` and `queue.js` hold every decision worth testing (settings, the
   shrink size, the queue, the requests, the job's state and the line under each
   button, when a button may be pressed); `tests/` proves it, including whole
   runs against a fake PC.

## Files

| File | What it is |
| --- | --- |
| `index.html` | the screen, plus the Content-Security-Policy |
| `app.js` | screen wiring: photos, the upload queue, the AI mark (a book's main mark), Admin (Settings, the inventory, a listing's customize, its cards and their actions, the sync bar), customize, the two buttons, polling, a reload, the walk back and forward |
| `queue.js` | the upload queue's rules: what goes next, how long to wait, the badge word |
| `pc.js` | every call to the PC, Admin's inventory and its actions too |
| `shrink.js` | a photo to at most 2000 px JPEG, orientation kept |
| `book.js` | the book mode's rules: the ISBN (ISBN-10 to 13, check digits), a book with no ISBN (what is searched, the year, the format chips), the price box, the price note, the book card, the conditions |
| `scan.js` | the ISBN off a photo of the barcode, with the phone's own `BarcodeDetector` where it has one |
| `core.js` | pure logic, no DOM, no network: the state and everything the screen says |
| `version.js` | one `VERSION`; every file the page loads carries it as `?v=` |
| `styles.css` | the look |
| `fonts/` | Manrope (variable, latin), self-hosted, with its licence (SIL OFL 1.1) |
| `tools/make-icons.mjs` | regenerates `icon-192.png` / `icon-512.png` from scratch |
| `tools/bump-version.mjs` | rewrites every `?v=` to match `VERSION` |
| `tests/` | `node --test`, no dependencies |

## The look (v2, design A2)

Michal picked design A2, "Signal Yellow", from a canvas of options ("A2
implement", 2026-10-05). This branch, `design-a2`, deploys to the design site
beside the live app; `main` stays the stable look. Only the look differs: the
ids, the order on screen, the Content-Security-Policy (bar `font-src 'self'`)
and every behaviour are the live app's.

- **The name** is written **crosslister $nap**: the S of Snap is a dollar sign.
  The header is a yellow band with the mark (a camera whose lens holds the $)
  and the wordmark, "crosslister" at weight 500 and "$nap" at 800. In the dark
  the band is black with a 4 px yellow rule under it, "$nap" turns yellow and
  the mark turns to its dark variant (black camera, white outline). The mark is
  one inline SVG whose colours come from `styles.css`, so both variants are the
  same drawing. "server ok" on the yellow is a darker green (`#0B5C2A`), and
  "server off" a darker red, so both read at 4.5:1.
- **Colours.** Light: white ground, smoke `#F2F2F0` sheets, ink `#0B0B0B`,
  muted `#5A5A5A`, lines `#E2E2E0`, signal yellow `#FFFC00` (the brand), posted
  green `#138A3F`, stop red `#D92D20`, the warning banner in ink on a yellow
  tint `#FFFCB3`. On yellow, text is always ink (muted: `#3D3D3D`). Dark: ground
  `#0B0B0B`, sheets `#171717`, ink `#FAFAFA`, muted `#9A9A9A`, lines `#2C2C2C`,
  the same yellow, posted `#7CF59A`, stop `#FF7B72`, warning tint `#3A3900`.
- **Shapes.** Every button is a pill. Sheets, inputs and photo tiles have 18 px
  corners. The chosen thing (goods | book, a condition chip, Snap) is a black
  pill with yellow words; in the dark, a yellow pill with black words.
- **Type.** Manrope, self-hosted in `fonts/` (never a font CDN: the CSP allows
  fonts from the page's own origin only). Body 17 px at 500; labels 13 px 700
  muted; headings and big words 800 with tight letter-spacing (-0.02em).
- **Snap** (and the book's **ISBN**) is a 92 px black pill with yellow words
  and a camera (a barcode) icon left of the word; **NEXT** is a 92 px yellow
  pill with black words, smoke until there is something to finish. **Add from
  gallery** is a 48 px smoke pill. **ebay** and **craigslist** are 64 px
  outlined pills in ink, green once posted; the link under them is ink. The
  price above them is 34 px at 800, the title over it 13 px muted.
- **Photos** are 108 x 128 tiles with a 3 px border, yellow when marked for the
  AI (or a book's main); "sent" is a green pill, "waiting" a black one,
  "failed" stays the red tap target; the AI / main marks are yellow chips when
  on, faint outlines when off.
- **The icon** is the mark on a yellow rounded square
  (`node tools/make-icons.mjs` draws the PNGs, the $ as two arcs and a bar).

## The screen, top to bottom

- **goods | book**, under the header: which kind of item is on screen. The
  page opens on **goods**, and after that on whichever this phone last used
  (`snap.mode` in `localStorage`). The page keeps one item of each kind at
  once, each with its own state: switching in the middle of an item asks
  nothing and loses nothing. Photos of the hidden item keep going to the PC
  (the shown item's go first), and a job running for it keeps being asked
  about, so its link is there on switching back. Hidden while Admin is open.
- **Admin** (header, top right; it was Settings until 2.1.0): **Settings** and
  the **Inventory**, each a foldout, then the sync bar, opening where the
  switch was (see [Admin](#admin)). **Settings** holds the PC address and the
  key: **Save and check** stores them and asks the PC whether it knows the key
  (a read of the newest job: no model call, nothing published). It also holds
  **Appearance**: Dark, Light or Sync with device, applied on the tap. **Close** at
  the bottom of Admin hides it again.
- **The server word** (header, beside Admin, and at the top of Settings):
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
  off by default, a faint outlined "AI" when off, a filled yellow chip (and a
  yellow frame round the photo) when on. Every photo goes to the listing; only
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
  or more`) and **Pickup only — no shipping on eBay**. Under them (Michal,
  2026-10-06: "in customize, there should be a slider for price preference (3
  grade) 1 (quicksell what we have) 2 (fair price longer wait time) 3 (higher
  end price - probably cheaper options exist in the marketplace). these need to
  be reflected in the prompt. 1 by default."), **Price**: a three-step slider
  with a yellow thumb, its words under the track, **Quick sale**, **Fair
  price**, **Higher end**, the chosen one bold, and a line saying what it
  means: `sell what we have this week`, `a fair price, a longer wait`, `a
  higher-end price; cheaper ones exist out there`. The PC writes the grade into
  the model's prompt. Last (Michal, 2026-10-06: "in customize it also should
  have a checkbox for post without asking - which is our default now."), **Post
  without asking**, ticked, with the small print `unticked: the PC saves the
  draft and the button posts it on the next press`. Unticked, a press saves the
  row without publishing: the line under that button says `saved, not posted`
  in green, the button opens again (not green: nothing is up), and its next
  press posts the saved row by its sku, with no second model call. Before a
  press, the line under each button says what customize changed, joined with
  ` · `: `pickup only` (under ebay only), the grade when it is not a quick sale
  (`fair price`, `higher end`) and `saved, not posted` while the box is
  unticked, e.g. `pickup only · fair price · saved, not posted`, so it is plain
  it took. All four go with either button, the second one's too (the PC updates
  the saved row first), and lock while a job is on its way. Folded again on
  every load and every **NEXT**; the values themselves are kept for a reload
  and reset by NEXT.
- **ebay | craigslist**, side by side, each with its status line and link:
  `sending`, `queued, 1 ahead`, the PC's step (`drafting the listing`...), then
  the link (opens in a new tab), or the PC's error in its own words. The pressed
  button shows a turning ring beside its word until the link or the error comes;
  posted, it turns green. Above the price, in small print, the listing's title
  as the PC saved it, from whichever job said it first (Michal, 2026-10-02:
  "add the title of the post ... above the price, once generated, small font,
  just for verification"; `title` in the job's status, read from the row).
  The price is a line above the two buttons (Michal,
  2026-09-28: "When posting, I want to see the price designated"; 2026-09-30:
  "show the chosen price for the item above the buttons instead of replacing
  button text"): nothing before a press and until the PC has saved the row,
  then `$14` (`$14.50` when the price has cents) while it posts and after. The
  price is the PC's (`price` in the job's status), the row's, so it stands for
  both buttons; a failure with nothing else running takes it away. A press
  waits one second before anything leaves the phone (Michal, 2026-10-02:
  "delay sending by 1 second, but show loading, so that if one cancels within
  1 sec there is no call money spent"): the ring turns at once, and a small red
  **cancel**, plain text in the header link's shape rather than a button
  (Michal, 2026-10-03: "low profile red text"), sits under the button from the
  press until the PC's step says `publishing ...`, the link or the error: once a
  posting is going up there is nothing left to cancel (Michal, 2026-10-03:
  "cancel only makes sense in mid-load"), and a cancel that reaches the PC after
  its publish anyway lets the job finish with its link.
  Within that second cancel takes the press back for free (the line says
  `cancelled`). After it the PC is told (`DELETE /jobs/<id>`): a job still
  queued is dropped before it runs, nothing paid; the job in hand stops at its
  next step, saving the draft instead of publishing it, and the line reads
  `cancelled from the phone` ("it will be a double charge but oh well"; it is
  not, since the next press posts the saved row without drafting again). The other
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
  Every item NEXT leaves is kept, posted or not (Michal, 2026-10-03: "When I
  took some photos and pressed next. I would be able to go back and see same
  photos. Even if I did not post yet"; until then an item nothing was posted
  from was deleted on the PC, his 2026-09-30 wish, and the PC's
  `DELETE /items/<id>` stays but is no longer called).
  What NEXT leaves behind is not gone: the page keeps the last 10 items it
  left, goods and books in the order he left them (`snap.history`), and **the
  browser's back and forward buttons** walk through them both ways (Michal,
  2026-10-03: "the back and forward on browser is like a cache of a session -
  it should work in both directions and should, actually work for lets say,
  10 items back and then 10 items forward. beyond that it should say
  something like - 'end of item history - see inventory lists' - instead of
  just quitting and loosing all cache"; until then forward left the page).
  Each item comes up as it was left, read back from the PC like a reload (its
  photos, their pictures fetched back one at a time, the note, the title and
  price, the links; Michal, 2026-10-02: "when I press next but then want to go
  back and see how much that other thing posted for"), on its own kind's
  screen. An item nothing was posted from comes back open: more photos, the
  note, the buttons, as if NEXT had not been pressed, and what is done to it
  is kept with it in the history. The line under the photos says which item
  is up, which way (`Back to "Lamp", as it was left.` / `Forward to ...`), and
  what NEXT does there: return to the item in hand (the newest place in the
  walk), or start a new one from a fresh screen. Forward past the newest item
  comes back to the item in hand (`Back on "Vase", the item you were on.`),
  on the kind last chosen with the switch; there is nothing further forward.
  Back past the oldest says `End of the item history: see the inventory list
  on the PC.` and stays on the oldest: back never leaves the page. The page
  mirrors the walk into the browser's own history, one entry per item plus
  one for the items in hand, so a reload keeps the place: on an earlier item
  it comes back on that item, and the walk goes on from there. When an 11th
  item is left the oldest falls off, and back stops one item sooner.

Once a button has sent the item, the photos are locked (no Snap, no x, no AI
toggles) because the PC's saved row is what the second button uses. If the
first job fails before the PC saved the row, they unlock and the next press is
a fresh send.

When a button is disabled, one line under the pair says why: `Set the PC
address and key in Admin`, `Snap a photo first`, `At most 24 photos -
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
  says so and points at No ISBN, which is filled in as the next step (black, yellow in the dark).
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
  and looking the same (a faint outlined `main` when off, a filled yellow chip
  and a yellow frame when on): the photo the listing leads with. Exactly one
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
  **Quantity** (several copies of one book), **Pickup only**, **Price** (the
  three grades) and **Post without asking**. A book saved, not posted, opens
  ebay again, and that press posts the saved row by its sku (no book in the
  body); otherwise a book is always sent whole.
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
- **NEXT**, as for goods (it does not wait for the listing either, and a book
  nothing was posted from is deleted on the PC the same way); it also
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
- **The PC answers with an error** for a photo (not a JPEG, too big), or **the
  phone cannot shrink it** (a picture the browser will not decode, a canvas
  that gives no JPEG): that photo shows `failed`, the line under the photos
  says which and why (`Lamp-3.jpg: could not read the photo (image/heic, 4.2
  MB)`), and the others carry on. Tap `failed` to try it again. An error for
  the item, a delete or the note (a wrong key, say) is shown in the banner and
  tried again on the same schedule.
- **Memory on the phone.** Each photo is shrunk the moment it is taken or
  picked, one after another, and only the shrunk JPEG is kept and shown as its
  thumbnail; the camera's original is let go at once. The phone therefore
  decodes one full-size picture at a time, never every one of a gallery pick
  together (Michal, 2026-10-02: several photos from the camera roll at once,
  the first went, the rest showed `failed` however often he tapped them). A
  retry re-shrinks only a photo whose shrink failed.
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
  its photos (each says "on the PC" until its picture is fetched back,
  `GET /items/<id>/photos/<n>`, one at a time; one the PC cannot give keeps
  saying so), the AI marks, the note, the sku and the jobs, whose status lines
  carry on. Photos that had not reached the PC before the reload are lost from
  the page (they were only in its memory); everything sent is safe. A reload
  while back shows an earlier item reads that item back, and the item in hand
  waits for forward or NEXT, as before the reload.

## The service contract (as this page uses it)

Every call carries the header `X-Crosslister-Key: <key>`. Errors are JSON
`{"detail": "..."}`: 400 with a message, 401 for a wrong key, 404 for an
unknown item or job, 409 while the same item is already being posted on that venue (the other venue queues behind it).

| Call | Sent | Answer |
| --- | --- | --- |
| `POST <pc>/items`, with the first photo | `{"name": "Boots"}` | `{"item": "Boots 2026-09-24", "photos": [n...]}` (what that folder already holds) |
| `PUT <pc>/items/<id>/photos/<n>`, each photo | the shrunk JPEG itself, `Content-Type: image/jpeg` | `{"item", "n", "bytes"}`; a retry overwrites |
| `GET <pc>/items/<id>/photos/<n>`, each photo of an item read back (a reload, back or forward) | - | the JPEG itself, `Content-Type: image/jpeg`; 404 for a photo the item does not hold |
| `DELETE <pc>/items/<id>/photos/<n>`, the x | - | `{"item", "n", "deleted"}`; safe to repeat |
| `PUT <pc>/items/<id>/note` | `{"note": "..."}` (blank removes it) | `{"item", "note"}` |
| `GET <pc>/items/<id>`, after a reload | - | `{"item", "photos", "note", "sku", "jobs"}` |
| `GET <pc>/books/<isbn13>`, a book's ISBN known | - | `{"isbn", "title", "subtitle", "authors": [...], "publisher", "year", "format", "pages", "price": "11" or null, "listings": {"count", "low", "high"} or null, "route": "list" / "lot or buyback" / "unknown"}`; 404 not in the catalogues (its `detail` is shown under the card as the reason, e.g. no Google Books key; No ISBN is then the next step and keeps the ISBN), 400 not an ISBN, 502 the catalogues could not be reached |
| `GET <pc>/books/search?title=<t>&author=<a>&year=<y>`, No ISBN, 0.6 s after the last keystroke | each URL-encoded (`%20` for a space); author and year `""` when not typed, year only once it has four digits | the same as `/books/<isbn13>`, plus `"found": true` (a catalogue matched it) or `false` (none did: it is listed as typed; `price` and `listings` still from eBay); 400 and 502 show the PC's words and keep the fields |
| `POST <pc>/jobs`, a new item | `{"item": id, "venue": "ebay" or "craigslist", "ai": [photo numbers]}` | `{"job": id, "state": "queued", "ahead": n}` |
| `POST <pc>/jobs`, a book | `{"item": id, "venue": "ebay", "book": {"isbn": "9780306406157", "title": "", "author": "", "year": "", "format": "", "condition": "good", "price": "11", "main": 1}}`, no `ai`; `main` (always sent) is the number of the photo marked main, the first unless moved. With no ISBN: `"isbn": ""`, `"title"` (never blank), `"author"`, `"year"` as typed (tidied; `""` when not given) and `"format": "paperback"` or `"hardcover"`; with an ISBN those four are `""`. After an ISBN no catalogue knows (the 404 above) and No ISBN: both, `"isbn": "9781926856155"` and the typed `"title"`, `"author"`, `"year"`, `"format"`; the PC keeps the ISBN on the listing and takes the rest from the typed fields | the same |
| `POST <pc>/jobs`, the other button, or the press after `saved, not posted` (a book's too) | `{"sku": sku, "venue": ...}` only, never a `book` (plus customize's keys, below); the PC updates the saved row with them before it posts | the same |
| customize, in any of the three `POST <pc>/jobs` bodies above | top-level `"quantity": 2` (only when not 1) and `"pickup_only": true` (only when ticked), e.g. `{"item", "venue", "ai", "quantity": 2, "pickup_only": true}`; left alone, the body is exactly as above | the same |
| customize's price grade (Michal, 2026-10-06: "1 (quicksell what we have) 2 (fair price longer wait time) 3 (higher end price - probably cheaper options exist in the marketplace). these need to be reflected in the prompt. 1 by default.") | top-level `"pricing": 2` or `3`, only when not 1 (1, a quick sale, is what the PC always did), e.g. `{"item", "venue", "ai", "pricing": 2}`; the PC writes it into the model's prompt | the same |
| customize's post without asking (Michal, 2026-10-06: "a checkbox for post without asking - which is our default now.") | top-level `"auto_post": false`, only when unticked (true, the default, publishes as ever), e.g. `{"item", "venue", "ai", "pricing": 2, "auto_post": false}`. The PC drafts and saves the row without publishing; the job ends `done` with the row's `sku`, `title` and `price` and no link for that venue, which the page shows as `saved, not posted`. The press after it sends `{"sku", "venue"}` without `auto_post` (plus `pricing` and the rest), and the PC publishes the saved row | the same |
| `GET <pc>/jobs/<id>`, every 3 s, until the link, the error or NEXT | - | `{"state": queued/running/done/failed, "step", "sku", "price", "links": {"ebay": url, "craigslist": url}, "error", "ahead"}`; `price` is the saved row's (`"14.00"`), `""` until the row is saved (a book: right after the save; goods: after the draft). The same in each of `GET /items/<id>`'s `jobs` |
| `GET <pc>/jobs?limit=1` | the Settings check | `{"jobs": [...]}`, or 401 |
| `GET <pc>/inventory?q=<t>&venue=<v>&status=<s>&limit=200&sort=<age or price>&order=<desc or asc>`, Admin's inventory list | every key always sent, each URL-encoded (`%20` for a space); `venue` `ebay` / `craigslist` and `status` `draft` / `listed` / `sold` / `ended`, `""` for All; the sort chips: Newest `sort=age&order=desc` (the default), Oldest `age` `asc`, Price ↓ `price` `desc`, Price ↑ `price` `asc` | `{"rows": [summary...]}` in that order (a row with no price last when sorted by price); a summary is `{"sku", "title", "price": "24.00" or null, "condition", "category", "category_path", "quantity", "venues": [...], "photos": 5 (a count), "note", "isbn", "pickup_only", "model_cost": "0.1046" or null, "pricing": 1/2/3 or null, "prices": {"quick", "market", "high"}, "statuses": {venue: {"status", "id", "url", "listed_at": ISO or null}}}`; `pricing` is the grade the row's price follows (null: none), `prices` the three prices the first model call made for the row, cached on it (`"24.00"` each, or null; all null on a row drafted before the cache or at the terminal) |
| `GET <pc>/inventory/<sku>`, a listing tapped | - | the summary's keys plus `"description"`, `"condition_note"`, `"source"`, `"condition_details": {name: value}`, `"aspects": {name: [values]}`, `"package": {"weight_oz", "length_in", "width_in", "height_in"}` or null, `"craigslist": {"title", "price", "description", "category"}` (blank: derived from the eBay fields), `"photos": [{"n", "name"}...]` (a list here) and `"posting": {"pricing", "auto_post", "job"}`, the choices the job that drafted the row was sent with (the page no longer shows them: customize's slider reads the row's own `pricing`); 404 for an unknown sku |
| `GET <pc>/inventory/<sku>/photos/<n>`, a listing's thumbnails (photo 1 in the list with Show photos, every photo in its detail) | - | the image itself (`image/jpeg`, png or webp); 404 when missing |
| `PATCH <pc>/inventory/<sku>`, a card's **Save** | JSON, only the fields changed (trimmed): any of `"title"`, `"price"` (`"24.50"`), `"description"`, `"note"`, `"condition_note"` from the eBay card, or `"craigslist": {"title", "price", "description", "category"}` from the craigslist card, `""` clearing an override, e.g. `{"title": "Brass desk lamp", "note": ""}` or `{"craigslist": {"title": "", "category": "household items"}}`; nothing changed sends nothing | the whole row, as `GET /inventory/<sku>`; 400 `{"detail"}` names a bad field (shown under Save) |
| `PATCH <pc>/inventory/<sku>`, customize's **Save** (and **Sync to eBay** with a change not yet saved) | `"quantity"` (a number), `"pickup_only"` and `"pricing"` (1, 2 or 3, the grade the slider was moved to), each only when it is not the row's, e.g. `{"pickup_only": true}`, `{"pricing": 3}` or `{"quantity": 3, "pickup_only": true, "pricing": 1}`; nothing changed sends nothing, a quantity that is not one is never sent, nor `pricing` on a row whose `prices` are all null. The PC sets the row's `price` to that grade's cached price and records the grade: no model call, no job | the same, the new price in it; 400 `{"detail"}` in customize's status line (`no cached fair price for this row: set the price by hand`), the slider left where he put it |
| `POST <pc>/inventory/<sku>/venues/<venue>`, an empty card's **Add <venue> to this item** | no body | the whole row, the venue now in its `venues` |
| `POST <pc>/jobs`, a card's **Post on <venue>** | `{"sku", "venue"}`, the same body as the other venue button's | the same as any job |
| `POST <pc>/jobs`, a card's **Refresh status** / **End listing** (after **Yes, end it**) | `{"action": "refresh", "sku", "venue"}` / `{"action": "end", "sku", "venue"}` | `{"job", "state": "queued", "ahead"}`; 400 `{"detail"}` when refused (Craigslist cannot be ended from here): the card says it and its End goes |
| `POST <pc>/jobs`, the sync bar's **Sync from eBay** / **Sync to eBay** | `{"action": "sync", "direction": "from"}` / `{"action": "sync", "direction": "to"}` | the same; 400 `{"detail"}` when refused, shown in the bar |
| `POST <pc>/jobs`, a listing's customize, **Sync to eBay** (one row, as saved, onto its eBay listing) | `{"action": "push", "sku", "venue": "ebay"}` | the same; 400 `{"detail"}` when the row is not listed on eBay, shown in customize's status line |
| `GET <pc>/jobs/<id>` of an action job (and a card's post), every 3 s until it ends | - | as above, plus `"action"`, `"direction"` and, once done, `"summary"` (`"ebay: listed"`, `"3 listings updated, 10 unchanged, 0 failed"`, a push's `"updated"` or `"unchanged"`), the line the card, customize or the bar shows |

The venue buttons open once every photo is `sent` and at least one is marked
AI; the note is sent first if it is still being typed. The `sku` comes from the
first job's status as soon as the PC has saved the row, so the second button
can go while the first job is still publishing. The page keeps the item id and
the sku with the item until **NEXT** (the id and the AI marks also in
`localStorage`, `snap.item`, for a reload; a book's id, ISBN (or, with no
ISBN, its title, author, year and format; after an ISBN miss, both, and
`isbnMiss`), condition, price, main photo and found record in `snap.book`;
either one's customize, `{"quantity", "pickupOnly"}` plus `"pricing"` and
`"autoPost": false` when they are not the default, once it is not the
default; a reload with `autoPost` off reads a job done with no link as
`saved, not posted`). What NEXT left is in `snap.history`, the same records, oldest first,
at most 10; the walk's place is not in `localStorage` but in the browser's own
history entries (`history.state`, `{"snap": n}`: 0 the floor, 1 to 10 the items,
the last the items in hand), which a reload keeps and a new tab starts afresh
on the items in hand. (`snap.forward.<kind>`, the one item back parked, is gone.)
A book's barcode picture (the ISBN button) is
never uploaded: only its barcode is read, on the phone.

## Admin

Michal, 2026-10-06: "i would like you to start working (and complete) on an
admin section of the app. somewhere where one can pull in all the listings ...
I was thinking that screen could be accessible through Admin which would
replace Settings. Settings would remain part of Admin though. After clicking
Admin (where settings are now) a user would have access to inventory list,
with search options / filtering options, etc. checkbox for showing images
(which would make the list less compact unfortunately.) clicking would need to
show all the card options and all the photos (in thumbnail format + plus if
clicking on a photo - should bring [it up full size]) ... just like 'customize'
now is a foldout - settings and inventory would be a foldout in the admin
section. once you click on a listing probably all the cards are different
foldouts (craigslist, ebay, etc)".

Michal, later on 2026-10-06: "I want a clear sync to and sync from for overall
syncing. They probably could be below the inventory list hovering fixed on the
screen as I scroll down. Add sorting options for the inventory (by price and by
age). When an item is listed probably clicking the venue button from the
inventory should open the listing. Also when we do admin we probably do not
need goods vs book slider distinction. Add the per item actions you have
proposed [post the other venue, end, refresh status, edit fields]. Also I think
when I click on an item there should only be eBay or and Craigslist card. I am
not sure what card I am looking at when I just clicked with some additional
eBay foldout. Also a foldout for a venue that is not active should be there.
Empty. With capacity to generate that card from there."

- **Admin**, the header link where Settings was, opens a section above the
  item (where Settings opened) with two foldouts in customize's shape (**▸**
  folded, **▾** open), the sync bar and a **Close** at its bottom. The goods |
  book switch is hidden while Admin is open, and back on Close. It opens on
  **Settings** while the address or key is missing or malformed, and otherwise
  on the **Inventory**, asked afresh each time. Should the PC then refuse the
  key, the inventory's line says `wrong key - check Settings` and Settings
  opens too.
- **Settings** is the old Settings card (the address, the key, **Save and
  check**, the server word at its top), with the **Appearance** chips (Dark |
  Light | Sync with device, see [Settings](#settings)) above Save and check.
  Saving while the inventory is open asks for the list again.
- **Inventory**: a **Search** box (asked 0.4 s after the last keystroke, or at
  once on the keyboard's search key), the line under it (`Asking the PC...`,
  `12 listings`, `No listings match.`, `The newest 200 listings; search to
  narrow them.`, or `Could not read the inventory: cannot reach the PC.`: the
  list stays as it was), two rows of chips, **Venue** (All | ebay |
  craigslist) and **Status** (All | draft | listed | sold | ended), **Show
  photos**, off by default, and a row of **Sort** chips (**Newest** | Oldest |
  Price ↓ | Price ↑; a row with no price comes last either way). Every chip
  asks at once. Then the list: one row per listing, in that order, with the
  title in bold (it wraps anywhere, so a long one never widens the page), the
  price (`$24`, `$24.50`), the sku in small mono, and a small badge per venue
  with its status: listed in the posted green, sold and ended muted, a draft
  outlined. A listed badge with a link is a link (`ebay listed ↗`): a tap
  opens the listing in a new tab and not the detail; the rest of the row opens
  the detail. With **Show photos** on, a 64 px tile of photo 1 sits on the left
  of each (`no photo` for a listing with none), fetched one at a time;
  changing the list lets those pictures go.
- **The sync bar**, under the inventory: **Sync from eBay** and **Sync to
  eBay** on a smoke sheet under a yellow rule. It sticks to the bottom of the
  screen while Admin is on it (`position: sticky`, so at the end of the list it
  sits in its own place above Close and never covers the last row). A tap
  sends the sync job; its line under the buttons says `queued`, then the PC's
  step, then its summary (`3 listings updated, 10 unchanged, 0 failed`) or its
  error, asked every 3 s; both buttons are locked until it ends, and the list
  is then asked for again (on the way back, when a listing is open). A sync the
  PC refuses shows the PC's words. Closing Admin leaves the job running on the
  PC, still asked about.
- **A listing tapped** opens in place of the list: **← Back to the list** at
  the top (back on the same list, at the same row, nothing asked again, unless
  a card changed the listing: then the list is asked for again), the title and
  price as its heading, the photos as a strip right under it (88 px tiles,
  fetched one at a time; a tap shows one full size on black, the whole
  picture, with **Close** at the top right; a tap anywhere on it, or Escape,
  closes it too), then its **customize** (below), then one foldout per venue
  and nothing else, **ebay** then **craigslist**, open for a venue the listing
  is on.
  - **customize** (Michal, 2026-10-07: "In inventory each item needs a
    customize tab and the customization options as at posting should pop up
    there with the choices that were made at posting. For instance I can there
    click pickup only and sync to eBay, and that detail of that listing should
    update."): the first foldout, open with every listing, and the goods
    customize card itself, live (Michal, 2026-10-07: "I want the menu in the
    inventory to look like the customize menu. Saying post without confirmation
    is useless. We will indeed be changing price with a slider here. Or quantity
    etc. or pickup / no pickup."; then "Don't worry about changes that will
    require model calls. Once in inventory changes can be made manually. However
    definitely 3 prices should be cached in first call so that if I change the
    slider, the price can be updated."). **Quantity** and **Pickup only** as the
    row has them, then the **Price** slider at the grade the row's price
    follows (its `pricing`), the three words under it each with the row's
    cached price beside it (`Quick sale $18`, `Fair price $24`, `Higher end
    $31.50`; `—` for one not cached), the chosen one bold, and the goods card's
    line for the grade under them. A row whose price follows no grade stands at
    1, nothing bold, the line `not priced by grade yet`. No post without asking
    here. Under them **Save** and **Sync to eBay**, and a status line.
    - **Save** opens once a box or the slider differs from the row, and sends
      one PATCH with only what changed: the quantity, pickup only, and the
      slider's grade as `pricing`. The PC sets the price to that grade's cached
      one: no model call, no job, and the row it answers puts the new price in
      the heading and the eBay card at once. A quantity that is not a whole
      number, 1 or more, is said in the status line at once and shuts both
      buttons, as the goods card does. Then `saved` (on a listing up on eBay,
      `saved; Sync to eBay puts it on the listing`), or the PC's refusal (`no
      cached fair price for this row: set the price by hand`) with the box and
      the slider as he left them. On a row with no cached prices at all, the
      slider moved says `no cached prices on this listing; set the price by
      hand` and is not sent; the boxes still are. The price itself is set by
      hand on the eBay card's Edit.
    - **Sync to eBay** opens only on a listing up on eBay (otherwise the line
      says `Sync to eBay opens once the listing is up on eBay`). It saves what
      is not yet saved first (a moved slider too, so the push carries the new
      price), so a tick and one tap is the whole of what Michal described, then
      sends the push job: `queued`, the PC's step, then `updated` or `unchanged`
      or the error, asked every 3 s. Once done the listing is read again, so the
      heading and the eBay card show what eBay now has; a Save or a push the PC
      refuses shows its words, and a refused Save sends no push.
    - The boxes, the slider and both buttons wait while anything of the
      listing's is on its way or running, and the cards wait while customize's
      is (one job per listing). A listing read again moves the boxes and the
      slider with it, except one holding a change he has not saved. The eBay
      card shows the quantity and pickup only as facts; only customize changes
      them.
  - Each card starts with its **status line**, the venue's status and when it
    went up (`listed since 2026-10-03 16:21`, the phone's own time; `draft`;
    `not posted yet`), or a job's line while one runs, and the link under it.
  - **ebay**: the listing as eBay has it: title, price, condition, category
    path, quantity, pickup only, the description as written (line breaks
    kept), the note, the condition note, the aspects and condition details as
    `name: values` lines, the package (`40 oz, 18 x 12 x 12 in`), the ISBN
    when there is one, the model cost (`$0.1046`).
  - **craigslist**: title, price, description and category, each the
    craigslist override when one was typed, or else the value it is derived
    from (the eBay title, price and description; the category `from the eBay
    category`) with `derived from eBay` under it, muted.
  - A venue the listing is not on is an **empty foldout**, folded, its arrow
    saying `▸ craigslist · not added`, holding one button, **Add craigslist to
    this item**: the PC puts the listing on it, and the card fills with its
    derived fields, open.
- **A card's actions**, in its row under the fields (which ones show is
  `venueActions` in core.js):
  - **Post on <venue>** when the listing is on the venue and not listed (a
    draft; an ended or sold one goes up again): the same `{"sku", "venue"}`
    job as the other venue button, its step in the card's status line, asked
    every 3 s; once done the listing is read again and the link shows.
  - **Open listing** (a link, new tab), **Refresh status** and **End
    listing** when listed. Refresh is a job like Post. End asks first, inline
    (`End this listing on ebay?` **Yes, end it** | **Keep it**, never a
    browser dialog), and only **Yes, end it** sends it. An End the PC refuses
    (Craigslist cannot be ended from here) puts the PC's words in the status
    line and the button goes.
  - **Edit** turns the card's fields into the page's own inputs (eBay: title,
    price, description, note, condition note, the quantity and pickup only
    being customize's; craigslist: its four overrides, each blank one showing
    what it derives as its placeholder, each with a **clear** that empties the
    override); **Save** sends one PATCH with only the fields changed (nothing
    changed sends nothing), **Cancel** puts the card back. A field the PC
    refuses is named under Save, the inputs kept as typed.
  - While something of the listing's is on its way or a job of its is still
    running, every action button but Open listing waits and the fields stay
    read-only: one job per listing at a time.

## Settings

- **PC address**: `https://<pc>.<tailnet>.ts.net`, the address
  `tailscale funnel` prints. Only `https://*.ts.net` is accepted, plus
  `http://127.0.0.1` and `http://localhost` for trying the page on the PC
  itself; the page's CSP allows exactly those, so any other address could only
  fail silently.
- **Key**: one of the keys in `CROSSLISTER_KEYS` in the PC's `.env`. Michal and
  his wife may use the same key on two phones.
- **Appearance** (Michal, 2026-10-06: "In settings I want to have the mode
  options. Dark, light or sync with device"): three chips above **Save and
  check**, **Dark** | **Light** | **Sync with device**, the default. A tap
  applies the look at once and remembers it on this phone; it is not part of
  Save and check. Dark or Light sets `data-theme` on `<html>` and puts that
  look's colour on both `theme-color` metas (the status bar: `#0B0B0B` or
  `#FFFC00`, read from the tags themselves); Sync with device removes the
  attribute and puts the metas back as `index.html` has them. The saved look
  is applied first thing on load, before the page renders. In `styles.css`
  the dark tokens are written twice, `@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) }` for the device and `:root[data-theme="dark"]`
  for Dark chosen; a test checks the two copies declare the same tokens with
  the same values, so change both together.

The address and key are stored in `localStorage` on the phone (`snap.pc`,
`snap.key`), and so is the look (`snap.theme`: `dark`, `light` or `device`;
none, or anything else, is `device`). Every storage read and write is wrapped,
so a private window or blocked site data only means Settings are not
remembered.

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
