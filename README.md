# Snap

Snap, a crosslisting app (crosslister-snap on GitHub). Michal, 2026-10-08: "The name
of the app should be Snap, a crosslisting app. Snap is simple." The header writes it
**$nap** (the S a dollar sign); "crosslister" is in no name or title the phone shows.

Open the phone, tap the icon, type the item name, tap **Snap**, take the
photos. Each photo goes to the home PC the moment it is taken, into the item's
own folder there, whether or not a button is ever pressed. Tap the small **AI**
at the bottom right of the photos the model should look at. Tap **ebay** (or
**craigslist**): the home PC drafts the listing from that folder, posts it, and
the link appears under the button; the price shows above the buttons (`$14`)
as soon as the server has saved the item. Tap the other button, right away or
later, and the same item goes up there too, with no second model call. **NEXT**
starts the next item, without waiting for the listing to finish.

Books have their own screen: tap **book** at the top, tap **ISBN** to read
the barcode, and the server finds the book in the catalogues and prices it from
eBay. A book with no ISBN: tap the small **No ISBN** and type its title (the
author, year and paperback | hardcover if known); the server looks it up by those
instead. A book whose ISBN no catalogue knows: the same **No ISBN**, which then
keeps the ISBN for the listing. Snap the cover (the barcode picture itself is not a photo), tap
**main** on the photo to lead with if it is not the first, pick the
condition, check the price, tap **ebay**.

The work happens on the home PC, in `crosslister serve` (the
[crosslister](../crosslister) repo, `docs/USAGE.md`, "The phone app"). This
page is a thin client: it takes the photos, sends them one by one, and shows
what the server says. Setup is [docs/SETUP.md](docs/SETUP.md): the server address and
a key, once per phone, typed after **I have a key** on the landing (or, once the
server's sign-in lane is there, **Sign in** with a link sent by email).

In the app the home PC is **the server** (Michal, 2026-10-08: "Start referring to
the PC as server, in the app."): every word on the screen says so (**Server
address**, `Set the server address and key in Admin`, `cannot reach the server`),
and so does this README where it means the service. The storage keys and ids keep
their names (`snap.pc`, `pc-address`, `pc.js`).

The item folders land in the server's inbox (`CROSSLISTER_INBOX`), the same folder
`crosslister post` offers when nothing is named, so an item snapped on the
phone can also be finished at the server's terminal. The page used to upload to
OneDrive directly; that code is in the git history (up to version 1.2.2).

## Architecture in five lines

1. A static page on GitHub Pages: plain HTML, CSS and ES modules, no build step,
   no backend of its own, no npm packages at runtime.
2. **Snap** is a `<label>` for `<input type="file" capture="environment">`: the
   phone's own camera app opens full screen and hands each photo back to the
   page.
3. The upload queue (`queue.js` decides, `app.js` sends) makes the item on the
   server with the first photo, then sends each photo on its own, shrunk first
   (`shrink.js`: at most 2000 px, JPEG 0.85), one request at a time, retrying
   by itself while the server does not answer. A venue button then sends only the
   item's id and the AI marks, and asks for the job's status every 3 s.
4. The server is reached at its Tailscale Funnel address
   (`https://<pc>.<tailnet>.ts.net`) with a per-person key; both are typed into
   **Settings** (under **Admin**) once and kept in the phone's `localStorage`. A
   phone signed in by an emailed link calls the product's own server
   (`DEFAULT_SERVER` in `core.js`) with its session instead of a key.
5. `core.js` and `queue.js` hold every decision worth testing (settings, the
   shrink size, the queue, the requests, the job's state and the line under each
   button, when a button may be pressed); `tests/` proves it, including whole
   runs against a fake server.

## Files

| File | What it is |
| --- | --- |
| `index.html` | the screen, plus the Content-Security-Policy |
| `app.js` | screen wiring: the landing, sign-in and the install nudge, photos, the upload queue, the AI mark (a book's main mark), Admin (Settings, the inventory, a listing's customize, its cards and their actions, Feedback, Stats, the sync bar), customize and its Save as default, the two buttons, polling, a reload, the walk back and forward |
| `queue.js` | the upload queue's rules: what goes next, how long to wait, the badge word |
| `pc.js` | every call to the server, Admin's inventory and its actions, `/me`, Feedback, Stats and the sign-in calls too |
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

- **The name** is **Snap**, written **$nap**: the S is a dollar sign (until
  2.10.0 the wordmark was "crosslister $nap"; Michal, 2026-10-08: "The name of the
  app should be Snap, a crosslisting app"). `<title>` and the manifest's `name` and
  `short_name` say Snap, its `description` "a crosslisting app".
  The header is a yellow band with the mark (a camera whose lens holds the $)
  and the wordmark, "$nap" at 800. In the dark
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

## The way in: the landing, the home screen, sign-in

- **The landing** (Michal, 2026-10-08: "Snap is simple. Note that for the first
  landing page."): while the phone has no server address and key saved and no
  session (`snap.session`), `#landing` is the whole screen under the header, in
  place of the goods | book switch and both posting screens: the mark large, **Snap**,
  "a crosslisting app", one line of what it does ("Photograph it, and it is listed
  on eBay and Craigslist with a price and a description."), **Install**, then the
  two ways in side by side, **I have a key** (Admin, which opens on Settings with
  the address and key fields as ever) and **Sign in**. Once settings are saved or a
  session exists the landing is gone and the goods screen shows as before. Admin
  closed without saving brings the landing back.
- **The home screen** (Michal, 2026-10-08: "I don't have the app on the home screen.
  If it is not on the home screen it should direct towards that install. Can that be
  done even though I have already used it? Would the website know?"). It does:
  `matchMedia("(display-mode: standalone)")`, or an iPhone's `navigator.standalone`,
  says the page runs from the home screen, and then there is no nudge at all.
  Otherwise the landing's **Install** is the first step, and over the posting screens
  sits a thin yellow-tint banner, "Add Snap to your home screen for the full-screen
  app", with **Add** and an **x**. Where Chrome offered to install
  (`beforeinstallprompt`, kept rather than shown as its own bar), Add (or Install)
  asks with Chrome's own prompt, once; accepted, the nudges go. Elsewhere the
  button unfolds the two taps: on an iPhone `Tap Share, then Add to Home Screen.`,
  otherwise `Open the browser menu, then Add to Home screen (or Install app).` The x
  puts the banner away for 7 days (`snap.install.dismissed`, the day as an ISO
  date); the landing's Install step is never put away. `installState` in core.js
  decides: `hidden`, `prompt` or `steps`.
- **Sign in** (for a later server lane; until it ships the server answers 404): the
  `#signin` screen, **← Back**, an **Email** box, **Keep me signed in** (ticked) and
  **Send me a link**, which posts `POST /auth/link` to the product's own server,
  `https://michal-pc.mulley-themis.ts.net` (`DEFAULT_SERVER`; the "I have a key"
  path keeps the address typed). A 202 says `Check your email for the link; it works
  on this phone.`; a 404 `Sign-in is not set up on this server yet. Ask the developer
  for a key.` The emailed link opens the page as `#login=<token>`: the page takes the
  token, clears the hash at once (`history.replaceState`), posts `POST
  /auth/session`, and keeps the session it answers, in `localStorage` when he kept
  Keep me signed in ticked, else in `sessionStorage` (this tab only); then the goods
  screen, checked and asked about as on any load. A link that no longer works says
  so on the landing. From then on every call carries `X-Crosslister-Session:
  <token>` (a key, when one is saved, wins: `X-Crosslister-Key` as ever). A 401 on a
  session lets it go and brings the landing back with `Your sign-in expired; send
  yourself a new link`.
- **The account** (`GET /me`, after the first good server check of each load, after
  Save and check, after a sign-in; kept in memory only). When it says `"craigslist":
  false` (Michal, 2026-10-08: "Keep the Craigslist button gray and when tapped write
  'contact developer'"), the goods screen's **craigslist** button is grey, yet takes
  the tap (`aria-disabled`, not disabled), and a tap sends nothing and says under it
  `Craigslist is not available for your account. Contact the developer.`; a
  listing's empty craigslist foldout says the same line in place of its Add. The
  sync bar is unchanged. A 404 (an older server) is everything as before.

## The screen, top to bottom

- **goods | book**, under the header: which kind of item is on screen. The
  page opens on **goods**, and after that on whichever this phone last used
  (`snap.mode` in `localStorage`). The page keeps one item of each kind at
  once, each with its own state: switching in the middle of an item asks
  nothing and loses nothing. Photos of the hidden item keep going to the server
  (the shown item's go first), and a job running for it keeps being asked
  about, so its link is there on switching back. Hidden while Admin is open,
  and so is the screen under it (see Admin, next).
- **Admin** (header, top right; it was Settings until 2.1.0): **Settings** and
  the **Inventory**, each a foldout, then the sync bar, opening where the
  switch was (see [Admin](#admin)). **Settings** holds the server address and the
  key: **Save and check** stores them and asks the server whether it knows the key
  (a read of the newest job: no model call, nothing published). It also holds
  **Appearance**: Dark, Light or Sync with device, applied on the tap. While
  Admin is open, on its list or on a listing, the goods and book screens are
  hidden too (Michal, 2026-10-08: "When I look at a card the posting screen is
  below. That should not be there"): their items carry on underneath, photos
  still uploading and jobs still asked about, nothing reset. **Close** at the
  bottom of Admin, or the Admin link, hides it again and the screen comes back
  as it now is.
- **The server word** (header, beside Admin, and at the top of Settings):
  the page asks the server by itself, on load, every 30 s while it is on screen,
  and when the phone is back online or back on screen, the same read as the
  Settings check. **server ok** in green, **server off** in red (no answer),
  **wrong key** in red, **server not set** before Settings are saved. When the
  server comes back, waiting photos go at once instead of after the retry pause.
- **Item name**, as before: Snap waits for it, and it names the item's folder
  on the server, `<item name> <date>` (`Boots 2026-09-24`). Once the first photo is
  taken the name is fixed until **NEXT**. A name already started today on the
  server is refused (Michal, 2026-09-30: "if I put a name for an item and it is
  the same as another, just flag it and don't accept it"): half a second after
  he stops typing the page asks the server for today's folder of that name, and if
  it is there the box turns red, the line under it says `"Lamp" is already an
  item on the server today with 3 photos. Use a different name.`, and Snap waits
  for another name. (Until then the same name on the same day was silently the
  same folder, and its photos came back into the strip.) A server that does not
  answer cannot refuse a name; the folder it then lands in is still the one
  the server names.
- **The photos**, then **Snap** and **Add from gallery** under them (Michal,
  2026-09-30: "when I snap a photo I confirm it with a round white button 3/4
  of the screen length down. When the website comes back I want the snap
  button to be right there, so I can click quickly"). Each photo taken with
  Snap scrolls the page so the button's middle sits three quarters down the
  screen, where the camera's shutter was; the browser stops short when the
  page is not long enough yet. After the first photo the button says **Snap
  Again**.
- **The photos.** Top left, each photo says where it is: `waiting` (on the
  page, on its way), `sent` (on the server), or `failed` (the server refused it; tap
  the word to send it again). The **x** at the top right takes a photo off the
  page and off the server. The **AI** at the bottom right marks it for the model:
  off by default, a faint outlined "AI" when off, a filled yellow chip (and a
  yellow frame round the photo) when on. Every photo goes to the listing; only
  the marked ones go to the model, and a new item needs at least one.
- **User note** (it was "Notes for this item"; Michal, 2026-10-07: "Call it
  'User Note' everywhere. It is not something that posts. And 'note' by itself
  confuses me."): for the server and its model, not printed on the listing; sent to
  the server (`note.txt` in the item's folder) a moment and a half after you stop
  typing, or when you leave the box. The small word next to the label says
  `sending...`, `sent`, `not sent (offline), will retry`, or `goes with the
  first photo` before there is an item. Wherever the screen names it (the
  book's box, a listing's eBay card, its Edit) it is the **User note**; the
  ids and the server's key stay `note`.
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
  higher-end price; cheaper ones exist out there`. The server writes the grade into
  the model's prompt. Then (Michal, 2026-10-06: "in customize it also should
  have a checkbox for post without asking - which is our default now."), **Post
  without asking**, ticked, with the small print `unticked: the server saves the
  draft and the button posts it on the next press`. Unticked, a press saves the
  row without publishing: the line under that button says `saved, not posted`
  in green, the button opens again (not green: nothing is up), and its next
  press posts the saved row by its sku, with no second model call. Last
  (Michal, 2026-10-07: "Let's abandon checking eBay for similar items (call 1)
  and put that toggle default off, in customization."), **Compare with eBay
  listings**, unticked, with the small print `sends eBay's similar listings to
  the AI for the first draft; slower, a little dearer`; ticked, the body says
  `"comps": true` and the server looks eBay up for the draft as it used to, left
  alone it does not. Before a press, the line under each button says what
  customize changed, joined with ` · `: `pickup only` (under ebay only), the
  grade when it is not a quick sale (`fair price`, `higher end`), `saved, not
  posted` while that box is unticked and `with eBay comparisons` while this one
  is ticked, e.g. `pickup only · fair price · saved, not posted`, so it is
  plain it took. All five go with either button, the second one's too (the server
  updates the saved row first), and lock while a job is on its way. Folded
  again on every load and every **NEXT**; the values themselves are kept for a
  reload and reset by NEXT. Last in the card (Michal, 2026-10-08: "The customize
  section should have a 'Save as default' button at the end, in case someone wants
  to change something permanently."), **Save as default**, a small pill: it keeps
  the price grade, Post without asking, Compare with eBay listings and Pickup only
  as they stand (never the quantity, nor the user note) in
  `snap.customize.defaults`, `{"goods": {...}, "book": {...}}`, says `saved as your
  defaults` beside it for 2.5 s, and every new item of that kind starts from them:
  NEXT, a fresh load, an item reset. An item read back keeps its own customize. The
  book's customize has its own Save as default and its own defaults.
- **ebay | craigslist**, side by side, each with its status line and link:
  `sending`, `queued, 1 ahead`, the server's step (`drafting the listing`...), then
  the link (opens in a new tab), or the server's error in its own words. The pressed
  button shows a turning ring beside its word until the link or the error comes;
  posted, it turns green. Above the price, in small print, the listing's title
  as the server saved it, from whichever job said it first (Michal, 2026-10-02:
  "add the title of the post ... above the price, once generated, small font,
  just for verification"; `title` in the job's status, read from the row).
  The price is a line above the two buttons (Michal,
  2026-09-28: "When posting, I want to see the price designated"; 2026-09-30:
  "show the chosen price for the item above the buttons instead of replacing
  button text"): nothing before a press and until the server has saved the row,
  then `$14` (`$14.50` when the price has cents) while it posts and after. The
  price is the server's (`price` in the job's status), the row's, so it stands for
  both buttons; a failure with nothing else running takes it away. A press
  waits one second before anything leaves the phone (Michal, 2026-10-02:
  "delay sending by 1 second, but show loading, so that if one cancels within
  1 sec there is no call money spent"): the ring turns at once, and inside the
  pressed button, under its word, a second line in small type says **tap again
  to cancel** (Michal, 2026-10-07: "The button, within it, should just get 'tap
  again to cancel' instead of an external cancel line. The writing should be
  within it, below, and should be small, and appear just when the button action
  is doing/loading"; this replaces the small red **cancel** under the button of
  2026-10-02/03, on purpose). A pressed button is never disabled, so it takes
  the tap; a screen reader hears `ebay, posting, tap again to cancel`.
  **A tap pauses; reset cancels** (Michal, 2026-10-07, after trying to cancel
  an eBay draft: "I was not able to cancel an ebay model call - I guess there is
  no way to cancel it, since the call is sent. Perhaps after pressing cancel it
  should say 'too late to cancel'? Better: show that it cancelled immediately,
  stop the loading button etc. The cancel should change to 'reset call' (as in
  discard) and the button should change to 'continue', in case one would want
  to continue what was already received etc. Each cancel should operate this
  way. Only pressing it twice actually drops all the info and resets the
  operation as if nothing happened, and waits for a new press of the button.
  Use these guidelines for all cancel things."):
  - **The tap pauses, shown at once**: the ring stops, the second line goes,
    the button reads **continue**, and a small red **reset** sits under it.
    Nothing is sent to the server: a press still in its second is held on the phone
    (the line says `paused`; NEXT waits for continue or reset); a job the server
    already has is only no longer asked about (`paused: the server may still be
    working on it`). A screen reader hears `ebay, paused, continue`.
  - **continue** carries on: a held press is sent at once (its second is
    over); a job the server has is asked about again at once. The ring and **tap
    again to cancel** come back.
  - **reset** is the real cancel: a held press is dropped, nothing sent,
    nothing paid; a job the server has is told (`DELETE /jobs/<id>`): one still
    queued is dropped before it runs, the one in hand stops at its next step,
    saving the draft instead of publishing it. Either way the button is its
    venue again at once, as if never pressed, waiting for a new press, and the
    line says `cancelled`; a job still stopping is asked about quietly until the
    server says `cancelled from the phone`, and the row it saved is kept, so the
    next press posts it without drafting again ("it will be a double charge but
    oh well"; it is not).
  - **Too late**: from the server's `publishing ...` step on there is nothing left
    to stop (Michal, 2026-10-03: "cancel only makes sense in mid-load"): the
    second line is gone, a tap changes nothing, and the line says `too late to
    cancel: it is publishing` for a moment before the step's own words come
    back. A reset that reaches the server after its publish anyway lets the job
    finish with its link.

  Admin's job buttons work the same way (below). The other
  button can be pressed at any time after the first (Michal, 2026-09-30: "I
  seem not to be able to click craigslist while ebay is loading"): the server runs
  jobs one at a time, so it queues behind (`queued, 1 ahead`) and, by then, the
  row the first job saved is there to reuse; no second model call. A screen
  reader hears the venue and its state (`ebay, posting`, `ebay, posted`), and
  `, tap again to cancel` while it can be.
- **NEXT** (it was DONE; Michal, 2026-09-28: "I want the final done button to
  be NEXT"), at the very bottom: clears the item and starts the next one. It
  waits while a photo or a delete has not reached the server (`NEXT waits until
  the photos are on the server`), and for the moment a press is on its way to the
  server; it sends a user note still being typed first. It does **not** wait for the
  listing ("I want to be able to click NEXT as the things are loading/posting
  ... I know that does not allow seeing the returned link, and that is fine"):
  the job is the server's, it posts all the same, and the page just stops asking
  about it, so its link is not shown. While a listing is posting, a quiet line
  under NEXT says so: `A listing is still posting on the server; NEXT starts the
  next item without waiting for its link`.
  Every item NEXT leaves is kept, posted or not (Michal, 2026-10-03: "When I
  took some photos and pressed next. I would be able to go back and see same
  photos. Even if I did not post yet"; until then an item nothing was posted
  from was deleted on the server, his 2026-09-30 wish, and the server's
  `DELETE /items/<id>` stays but is no longer called).
  What NEXT leaves behind is not gone: the page keeps the last 10 items it
  left, goods and books in the order he left them (`snap.history`), and **the
  browser's back and forward buttons** walk through them both ways (Michal,
  2026-10-03: "the back and forward on browser is like a cache of a session -
  it should work in both directions and should, actually work for lets say,
  10 items back and then 10 items forward. beyond that it should say
  something like - 'end of item history - see inventory lists' - instead of
  just quitting and loosing all cache"; until then forward left the page).
  Each item comes up as it was left, read back from the server like a reload (its
  photos, their pictures fetched back one at a time, the user note, the title and
  price, the links; Michal, 2026-10-02: "when I press next but then want to go
  back and see how much that other thing posted for"), on its own kind's
  screen. An item nothing was posted from comes back open: more photos, the
  user note, the buttons, as if NEXT had not been pressed, and what is done to it
  is kept with it in the history. The line under the photos says which item
  is up, which way (`Back to "Lamp", as it was left.` / `Forward to ...`), and
  what NEXT does there: return to the item in hand (the newest place in the
  walk), or start a new one from a fresh screen. Forward past the newest item
  comes back to the item in hand (`Back on "Vase", the item you were on.`),
  on the kind last chosen with the switch; there is nothing further forward.
  Back past the oldest says `End of the item history: see the inventory list
  on the server.` and stays on the oldest: back never leaves the page. The page
  mirrors the walk into the browser's own history, one entry per item plus
  one for the items in hand, so a reload keeps the place: on an earlier item
  it comes back on that item, and the walk goes on from there. When an 11th
  item is left the oldest falls off, and back stops one item sooner.

Once a button has sent the item, the photos are locked (no Snap, no x, no AI
toggles) because the server's saved row is what the second button uses. If the
first job fails before the server saved the row, they unlock and the next press is
a fresh send.

When a button is disabled, one line under the pair says why: `Set the server
address and key in Admin`, `Snap a photo first`, `At most 24 photos -
delete n`, `Mark at least one photo AI (bottom right of the photo)`, `A photo
did not reach the server - tap its 'failed' to try again`, `Waiting for the photos
to reach the server (2 of 4 sent)`, or that the other button goes first.

### Book mode

A book is named by its ISBN, not by a model looking at photos: the server finds it
in the catalogues and looks at what it sells for on eBay, so there is no item
name to type, no AI mark and no model call (in the AI mark's place, **main**
picks the photo the listing leads with). A book with no ISBN is named by its
title instead, and the server does the same work from that. Top to bottom:

- **ISBN** (the big button; it was called Scan, and it is what it reads): the
  phone's camera, as Snap. The barcode is read on the phone
  (`scan.js`), the ISBN box fills and the server is asked about the book. The
  picture is only read, never kept: it is not added to the strip, not sent to
  the server, and a close-up of the barcode is all it needs to be (the line above
  the button says so). A barcode that would not read says `No barcode found — try
  again closer, or type the ISBN under the barcode` and nothing else changes. A
  phone that cannot read barcodes at all (iPhones) says so up front, and the
  button stays grey there. It is
  there until the book's folder is made on the server; from then its ISBN is fixed
  until **NEXT**.
- **Or type the ISBN**: the number typed instead. ISBN-10 or ISBN-13, hyphens and spaces
  fine; the check digit must be right. It is looked up 0.4 s after the last
  keystroke. The book's folder on the server is `Book <isbn13> <date>`.
- **No ISBN**, small, under the box: opens the fields for a book that has no
  ISBN (Michal, 2026-09-28: "hidden under one button overall"): **Title**
  (required), **Author**, **Year** (optional) and **Paperback | Hardcover**
  (Paperback unless tapped). 0.6 s after the last keystroke in any of them
  (title not blank) the title names the book's folder, `Book <title> <date>`
  (cleaned and capped as a goods name is), and the server is asked
  `GET /books/search` by the title, author and year (a year counts once it has
  four digits). While the fields are open the ISBN box is set aside (it is
  emptied, and anything but a valid ISBN in it is ignored); a valid ISBN typed
  or read closes them and is the book. Tapping No ISBN again closes them and
  clears what was typed. Like the ISBN, it is fixed once the folder is on the
  server; the fields themselves can still be corrected until **ebay** is pressed.
- **No ISBN after an ISBN no catalogue knows** (Michal, 2026-09-28: he scanned
  9781926856155 and the page said to post it as goods, a dead end): the card
  says so and points at No ISBN, which is filled in as the next step (black, yellow in the dark).
  Tapped, it opens the same fields but keeps the ISBN: the box stays filled
  (greyed, set aside), `ISBN 9781926856155 kept: it goes on the listing` sits
  above the fields, the folder stays `Book <isbn13> <date>` (so No ISBN opens
  even with a cover already on the server), and the title is searched exactly as
  above. The job then carries the ISBN and the typed fields both
  (`book.isbnMiss`, kept for a reload). A valid different ISBN typed or read
  replaces it and closes the fields, as ever; No ISBN again clears the fields,
  keeps the ISBN and asks the server about it afresh.
- **The book card**: `looking up...`, then the title in bold, the authors and
  `publisher · year · format · pages`; or `Not in the catalogues. Tap No ISBN
  and type the title — the ISBN stays on the listing.` with the server's own
  words for the 404 in the small line under it (they may say why, e.g. that no
  Google Books key is set); or the server's own words when it could not look (edit
  the box to try again). A book looked up by title says `matched in the catalogues`
  under the catalogue's book, or, when no catalogue knows it, shows the title,
  author, year and format as typed with `Not in the catalogues: it will be
  listed as typed` (a typed book is a book: ebay still opens). A catalogue
  match that says hardcover or paperback sets the format chip, unless he
  tapped one.
- **Snap** and **Add from gallery**: the front cover and anything else; the
  first of them makes the book's folder on the server. The photos have the same
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
- **Price**, in dollars, filled with the server's suggestion when the lookup
  answers (a price typed first is kept; a suggestion the page filled in is
  replaced by a later answer, when more of the title is typed). Under it: `eBay: 12 listings, $6–$24
  · suggested $11`, or `no eBay listings found — set a price`, with `under $5:
  a lot or a buyback site may be better` when the suggestion is that low.
- **User note** (it was Flaws; Michal, 2026-10-07: "Call it 'User Note'
  everywhere"): the item's user note, sent to the server exactly as the goods one is.
- **▸ customize**, right above ebay: the same disclosure as for goods, the
  book's own (open or folded, and its values, apart from the goods item's):
  **Quantity** (several copies of one book), **Pickup only**, **Price** (the
  three grades), **Post without asking** and **Compare with eBay listings**. A book saved, not posted, opens
  ebay again, and that press posts the saved row by its sku (no book in the
  body); otherwise a book is always sent whole.
- **ebay**, one full-width button with the same status line, turning ring,
  pause (continue, reset) and link. It opens once the book is found (by title: once the server answered,
  matched or not), there is a photo (`Snap the cover
  first` when there is none), every photo is on the server and the price is a
  price; otherwise the line under it says which of those is missing (first of
  all `Scan the ISBN, or tap No ISBN and type the title`; after an ISBN no
  catalogue knows, `Tap No ISBN and type the title`). It sends
  the main photo's number with the book, and for a book with no ISBN what was
  typed (after a miss, the ISBN too). The price line above it is as for
  goods, but from the press: the price is typed on the page, so it reads
  `$11` at once, and the server's `price` replaces it when it says one.
- **NEXT**, as for goods (it does not wait for the listing either, and a book
  nothing was posted from is deleted on the server the same way); it also
  clears a book that has an ISBN (or a typed title) but no photo.

## The upload queue, and being offline

One request at a time, in this order: the item itself (with the first photo),
deletes, the photos in the order they were taken, then the user note once it is due.
The photos stay in the page's memory until **NEXT**, so nothing is lost while
the server cannot be reached:

- **The server does not answer** (phone offline, PC asleep, Funnel off): the photo
  stays `waiting`, the banner at the top says so, and the queue waits 1 s, 3 s,
  9 s, 27 s, then every 30 s before trying again, from where it stopped. When
  the phone says it is back online the queue goes at once. New photos taken
  meanwhile join the line.
- **The server answers with an error** for a photo (not a JPEG, too big), or **the
  phone cannot shrink it** (a picture the browser will not decode, a canvas
  that gives no JPEG): that photo shows `failed`, the line under the photos
  says which and why (`Lamp-3.jpg: could not read the photo (image/heic, 4.2
  MB)`), and the others carry on. Tap `failed` to try it again. An error for
  the item, a delete or the user note (a wrong key, say) is shown in the banner and
  tried again on the same schedule.
- **Memory on the phone.** Each photo is shrunk the moment it is taken or
  picked, one after another, and only the shrunk JPEG is kept and shown as its
  thumbnail; the camera's original is let go at once. The phone therefore
  decodes one full-size picture at a time, never every one of a gallery pick
  together (Michal, 2026-10-02: several photos from the camera roll at once,
  the first went, the rest showed `failed` however often he tapped them). A
  retry re-shrinks only a photo whose shrink failed.
- **The x on a photo still waiting** takes it off the page and nothing is sent.
  On a photo that is on the server, or on its way, or failed, the server deletes it too.
  Photo numbers are never reused, so a delete leaves a gap and the AI marks keep
  naming the right photos.
- **Leaving the page** asks first while a photo, a delete or the user note has not
  reached the server, or a venue press has not reached it yet. A listing the server
  has taken is no reason to ask: it posts whether or not the page watches.
- **NEXT** never drops what the queue still owes the server: it stays shut while a
  photo or a delete of this item is on its way. The other kind's item (goods
  or book) keeps its own photos going, as ever.
- **A reload** (or the phone closing the tab) reads the item back from the server:
  its photos (each says "on the server" until its picture is fetched back,
  `GET /items/<id>/photos/<n>`, one at a time; one the server cannot give keeps
  saying so), the AI marks, the user note, the sku and the jobs, whose status lines
  carry on. Photos that had not reached the server before the reload are lost from
  the page (they were only in its memory); everything sent is safe. A reload
  while back shows an earlier item reads that item back, and the item in hand
  waits for forward or NEXT, as before the reload.

## The service contract (as this page uses it)

Every call carries the header `X-Crosslister-Key: <key>`, or, on a phone signed in
by a link with no key saved, `X-Crosslister-Session: <session>` in its place
(`authHeaders` in core.js); the two sign-in calls carry neither. Errors are JSON
`{"detail": "..."}`: 400 with a message, 401 for a wrong key (or a session the
server no longer knows: the page lets it go and shows the landing), 404 for an
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
| `GET <pc>/books/search?title=<t>&author=<a>&year=<y>`, No ISBN, 0.6 s after the last keystroke | each URL-encoded (`%20` for a space); author and year `""` when not typed, year only once it has four digits | the same as `/books/<isbn13>`, plus `"found": true` (a catalogue matched it) or `false` (none did: it is listed as typed; `price` and `listings` still from eBay); 400 and 502 show the server's words and keep the fields |
| `POST <pc>/jobs`, a new item | `{"item": id, "venue": "ebay" or "craigslist", "ai": [photo numbers]}` | `{"job": id, "state": "queued", "ahead": n}` |
| `POST <pc>/jobs`, a book | `{"item": id, "venue": "ebay", "book": {"isbn": "9780306406157", "title": "", "author": "", "year": "", "format": "", "condition": "good", "price": "11", "main": 1}}`, no `ai`; `main` (always sent) is the number of the photo marked main, the first unless moved. With no ISBN: `"isbn": ""`, `"title"` (never blank), `"author"`, `"year"` as typed (tidied; `""` when not given) and `"format": "paperback"` or `"hardcover"`; with an ISBN those four are `""`. After an ISBN no catalogue knows (the 404 above) and No ISBN: both, `"isbn": "9781926856155"` and the typed `"title"`, `"author"`, `"year"`, `"format"`; the server keeps the ISBN on the listing and takes the rest from the typed fields | the same |
| `POST <pc>/jobs`, the other button, or the press after `saved, not posted` (a book's too) | `{"sku": sku, "venue": ...}` only, never a `book` (plus customize's keys, below); the server updates the saved row with them before it posts | the same |
| customize, in any of the three `POST <pc>/jobs` bodies above | top-level `"quantity": 2` (only when not 1) and `"pickup_only": true` (only when ticked), e.g. `{"item", "venue", "ai", "quantity": 2, "pickup_only": true}`; left alone, the body is exactly as above | the same |
| customize's price grade (Michal, 2026-10-06: "1 (quicksell what we have) 2 (fair price longer wait time) 3 (higher end price - probably cheaper options exist in the marketplace). these need to be reflected in the prompt. 1 by default.") | top-level `"pricing": 2` or `3`, only when not 1 (1, a quick sale, is what the server always did), e.g. `{"item", "venue", "ai", "pricing": 2}`; the server writes it into the model's prompt | the same |
| customize's post without asking (Michal, 2026-10-06: "a checkbox for post without asking - which is our default now.") | top-level `"auto_post": false`, only when unticked (true, the default, publishes as ever), e.g. `{"item", "venue", "ai", "pricing": 2, "auto_post": false}`. The server drafts and saves the row without publishing; the job ends `done` with the row's `sku`, `title` and `price` and no link for that venue, which the page shows as `saved, not posted`. The press after it sends `{"sku", "venue"}` without `auto_post` (plus `pricing` and the rest), and the server publishes the saved row | the same |
| customize's Compare with eBay listings (Michal, 2026-10-07: "Let's abandon checking eBay for similar items (call 1) and put that toggle default off, in customization.") | top-level `"comps": true`, only when ticked, in any of the three bodies, e.g. `{"item", "venue", "ai", "comps": true}`; never `"comps": false`: left alone, the server drafts without eBay's similar listings | the same |
| `GET <pc>/jobs/<id>`, every 3 s, until the link, the error or NEXT | - | `{"state": queued/running/done/failed, "step", "sku", "price", "links": {"ebay": url, "craigslist": url}, "error", "ahead"}`; `price` is the saved row's (`"14.00"`), `""` until the row is saved (a book: right after the save; goods: after the draft). The same in each of `GET /items/<id>`'s `jobs` |
| `GET <pc>/jobs?limit=1` | the Settings check | `{"jobs": [...]}`, or 401 |
| `GET <pc>/inventory?q=<t>&venue=<v>&status=<s>&limit=200&sort=<age or price>&order=<desc or asc>`, Admin's inventory list | every key always sent, each URL-encoded (`%20` for a space); `venue` `ebay` / `craigslist` and `status` `draft` / `listed` / `sold` / `ended`, `""` for All; the sort chips: Newest `sort=age&order=desc` (the default), Oldest `age` `asc`, Price ↓ `price` `desc`, Price ↑ `price` `asc` | `{"rows": [summary...]}` in that order (a row with no price last when sorted by price); a summary is `{"sku", "title", "price": "24.00" or null, "condition", "category", "category_path", "quantity", "venues": [...], "photos": 5 (a count), "note", "isbn", "pickup_only", "model_cost": "0.1046" or null, "pricing": 1/2/3 or null, "prices": {"quick", "market", "high"}, "statuses": {venue: {"status", "id", "url", "listed_at": ISO or null}}}`; `pricing` is the grade the row's price follows (null: none), `prices` the three prices the first model call made for the row, cached on it (`"24.00"` each, or null; all null on a row drafted before the cache or at the terminal) |
| `GET <pc>/inventory/<sku>`, a listing tapped | - | the summary's keys plus `"description"`, `"condition_note"`, `"source"`, `"condition_details": {name: value}`, `"aspects": {name: [values]}`, `"package": {"weight_oz", "length_in", "width_in", "height_in"}` or null, `"craigslist": {"title", "price", "description", "category"}` (blank: derived from the eBay fields), `"photos": [{"n", "name"}...]` (a list here) and `"posting": {"pricing", "auto_post", "job"}`, the choices the job that drafted the row was sent with (the page no longer shows them: customize's slider reads the row's own `pricing`); 404 for an unknown sku |
| `GET <pc>/inventory/<sku>/photos/<n>`, a listing's thumbnails (photo 1 in the list with Show photos, every photo in its detail) | - | the image itself (`image/jpeg`, png or webp); 404 when missing |
| `PATCH <pc>/inventory/<sku>`, a card's **Save** | JSON, only the fields changed (trimmed): any of `"title"`, `"price"` (`"24.50"`), `"description"`, `"note"`, `"condition_note"` from the eBay card, or `"craigslist": {"title", "price", "description", "category"}` from the craigslist card, `""` clearing an override, e.g. `{"title": "Brass desk lamp", "note": ""}` or `{"craigslist": {"title": "", "category": "household items"}}`; nothing changed sends nothing | the whole row, as `GET /inventory/<sku>`; 400 `{"detail"}` names a bad field (shown under Save) |
| `PATCH <pc>/inventory/<sku>`, a list row's **+** or **−**, one per press (a tap, or a press held: sent once the finger lifts or leaves the button) | `{"price": "150.00"}`, the whole dollars the dial stopped at, never below `"1.00"`; never a grade (`pricing` is customize's slider's); a dial back where it started sends nothing | the same; 400 `{"detail"}` on the inventory's line as `<sku>: <detail>`, the price as it was |
| `PATCH <pc>/inventory/<sku>`, customize's **Save** (and **Sync to eBay** with a change not yet saved) | `"quantity"` (a number), `"pickup_only"` and `"pricing"` (1, 2 or 3, the grade the slider was moved to), each only when it is not the row's, e.g. `{"pickup_only": true}`, `{"pricing": 3}` or `{"quantity": 3, "pickup_only": true, "pricing": 1}`; nothing changed sends nothing, a quantity that is not one is never sent, nor `pricing` on a row whose `prices` are all null. The server sets the row's `price` to that grade's cached price and records the grade: no model call, no job | the same, the new price in it; 400 `{"detail"}` in customize's status line (`no cached fair price for this row: set the price by hand`), the slider left where he put it |
| `POST <pc>/inventory/<sku>/venues/<venue>`, an empty card's **Add <venue> to this item** | no body | the whole row, the venue now in its `venues` |
| `POST <pc>/jobs`, a card's **Post on <venue>** | `{"sku", "venue"}`, the same body as the other venue button's | the same as any job |
| `POST <pc>/jobs`, a card's **Refresh status** / **End listing** (after **Yes, end it**), either venue | `{"action": "refresh", "sku", "venue"}` / `{"action": "end", "sku", "venue"}`, e.g. `{"action": "end", "sku": "R5", "venue": "craigslist"}` | `{"job", "state": "queued", "ahead"}`; 400 `{"detail"}` when refused: the card says it and its End goes |
| `POST <pc>/jobs`, the sync bar's **Sync from eBay** / **Sync to eBay** | `{"action": "sync", "direction": "from"}` / `{"action": "sync", "direction": "to"}` | the same; 400 `{"detail"}` when refused, shown in the bar |
| `POST <pc>/jobs`, a listing's customize **Sync to eBay** (one row, as saved, onto its eBay listing), the craigslist card's **Sync to craigslist**, or a list row's sync badge | `{"action": "push", "sku", "venue": "ebay"}` / `{"action": "push", "sku", "venue": "craigslist"}` (the craigslist push is the server's from 2026-10-08) | the same; 400 `{"detail"}` when the row is not listed there, or from a server that does not push to craigslist yet, shown in customize's status line, the card's line (the badge's: on the inventory's line) |
| `GET <pc>/jobs/<id>` of an action job (and a card's post), every 3 s until it ends | - | as above, plus `"action"`, `"direction"` and, once done, `"summary"` (`"ebay: listed"`, `"3 listings updated, 10 unchanged, 0 failed"`, a push's `"updated"` or `"unchanged"`), the line the card, customize or the bar shows |
| `GET <pc>/me`, after the first good check of each load, after Save and check, after a sign-in | - | `{"user", "admin": true/false, "craigslist": true/false, "venues": [...]}`; `craigslist: false` greys the craigslist button, `admin: true` shows Stats; a key it does not say is as before (craigslist on, admin off); 404 (an older server): everything as before |
| `POST <pc>/feedback`, Admin's Feedback **Send** | `{"text": "...", "screen": "goods" / "book" / "admin" / "card", "version": "2.10.0", "job": "<job id>"}`, `job` only when Include my last job is ticked and the page has one | 201 `{"id"}`; an error's `detail` under Send |
| `GET <pc>/stats?since=7d` / `30d` / `all`, Admin's Stats, opened or a chip tapped | - | `{"since", "jobs": {"total", "done", "failed", "cancelled", "queued", "running"}, "posted": {"ebay": n, "craigslist": n}, "drafted", "ended", "pushed", "model_cost": "12.34", "per_user": [{"user", "jobs", "posted", "model_cost"}], "per_day": [{"date", "jobs", "posted"}], "first", "last"}`; 403 for anyone but an admin (and 404 from an older server): the foldout goes |
| `POST <server>/auth/link`, the sign-in screen's **Send me a link**, to `DEFAULT_SERVER`, no key, no session | `{"email": "...", "remember": true/false}` | 202 `{"sent": true}`; the email's link opens this page as `#login=<token>`; 404 until the server's sign-in lane ships |
| `POST <server>/auth/session`, the page opened as `#login=<token>`, no key, no session | `{"token": "<token>"}` | `{"session": "<token>", "user": "<name>", "remember": true/false}`; the session kept by `remember`, then sent as `X-Crosslister-Session` on every call |

The venue buttons open once every photo is `sent` and at least one is marked
AI; the user note is sent first if it is still being typed. The `sku` comes from the
first job's status as soon as the server has saved the row, so the second button
can go while the first job is still publishing. The page keeps the item id and
the sku with the item until **NEXT** (the id and the AI marks also in
`localStorage`, `snap.item`, for a reload; a book's id, ISBN (or, with no
ISBN, its title, author, year and format; after an ISBN miss, both, and
`isbnMiss`), condition, price, main photo and found record in `snap.book`;
either one's customize, `{"quantity", "pickupOnly"}` plus `"pricing"`,
`"autoPost": false` and `"comps": true` when they are not the default, once it
is not the default; a reload with `autoPost` off reads a job done with no link as
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
  on the **Inventory**, asked afresh each time. Should the server then refuse the
  key, the inventory's line says `wrong key - check Settings` and Settings
  opens too.
- **Settings** is the old Settings card (the address, the key, **Save and
  check**, the server word at its top), with the **Appearance** chips (Dark |
  Light | Sync with device, see [Settings](#settings)) above Save and check.
  Saving while the inventory is open asks for the list again. Under the status
  line, once there is something to forget, **Forget this server** (with a key) or
  **Sign out** (signed in by a link): the address, the key and any session leave
  the phone, Admin closes and the landing is back.
- **Inventory**: a **Search** box, small (36 px tall; its words stay 16 px, the
  size under which a phone zooms in on a box), asked 0.4 s after the last
  keystroke, or at once on the keyboard's search key; the line under it
  (`Asking the server...`, `12 listings`, `No listings match.`, `The newest 200
  listings; search to narrow them.`, or `Could not read the inventory: cannot
  reach the server.`: the list stays as it was); then **▸ Options**, a foldout in
  customize's pattern, folded at first (Michal, 2026-10-08: "Inventory list
  options need to be all small, and also locked away inside a foldout tab
  'Options'"; open or folded is remembered on this phone, `snap.inventory.options`
  `open` or `closed`). In it, all small (13 px chips, 36 px tall): two rows of
  chips, **Venue** (All | ebay | craigslist) and **Status** (All | draft |
  listed | sold | ended), a row of **Sort** chips (**Newest** | Oldest | Price ↓
  | Price ↑; a row with no price comes last either way), and last, on its own
  line, **Show photos**, ticked by default (Michal, 2026-10-07: "in inventory,
  let's keep photos showing by default. And that checkbox should be at end of
  options. Not right in the awkward middle"); unticked, it stays so on this
  phone (`snap.inventory.photos` is `off`; ticked again, `on`). Every chip and
  the box ask at once, and what they hold stands with Options folded. Then the
  list: one row per listing, in that order, with the
  title in bold (it wraps anywhere, so a long one never widens the page), the
  price (`$24`, `$24.50`), the sku in small mono, and a small badge per venue
  with its status: listed in the posted green, sold and ended muted, a draft
  outlined. A listed badge reads the venue and a tick (Michal, 2026-10-08:
  "Instead of 'ebay listed' and an arrow, write 'ebay' and follow that with a
  checkmark symbol"): `ebay ✓`, the tick a 12 px stroke in the badge's own
  colour, hidden from a screen reader, which hears `ebay listed`; no arrow. A
  listed badge with a link is a link: a tap opens the listing in a new tab and
  not the detail; the rest of the row opens the detail. With **Show photos** on,
  a 64 px tile of photo 1 sits on the left of each (`no photo` for a listing
  with none), fetched one at a time; changing the list lets those pictures go.
- **The price on a row** (Michal, 2026-10-07, "one of the highest priority
  items": "On the inventory card on the right there should be a round + and a
  round − button. Pressing them increments through the price. Plus button in
  top right, minus button in bottom right of the little tile that represents an
  inventory item. When the price changes there should be our sync-to logo
  appearing on the ebay green button below. Pressing it would sync, and the
  button would revert to the 'ebay listed' or whatever it says now."): right of
  the badges, a round **+** at the row's top right and a round **−** at its
  bottom right, 44 px, ink on smoke with a thin white outline (1.5 px; dark in
  the dark), `price up`, `price down` to a screen reader. Each is a dial
  (Michal, 2026-10-08: "This adjustment itself should be by 1 dollar. However
  we need to sense long press and speed up, for larger priced items, like dials
  on my oven for time setting."): a press moves the price a whole dollar at
  once (from $24.50 up to $25, down to $24), never a grade (the grade is
  customize's slider's), never below $1. Held past 400 ms it repeats every
  120 ms, a dollar a step for the first 1.5 s, then 2, then 5 from 3 s, then 10
  from 5 s (`dialStep`; $250 down to $150 is about five seconds), the tile
  showing each price as it goes. One PATCH, `{"price": "150.00"}`, leaves when
  the finger lifts or slides off the button (or lifts anywhere on the page),
  never one per step. Pointer and touch events both start and end it; the
  browser's long-press menu and text selection are held off the two. A click
  from the keyboard (Enter, Space) is one dollar, sent at once. The price on the
  row is then the one the server answers; − is shut at $1, both are while the
  row's PATCH or its push is on its way (never under a held finger). A change
  the server refuses puts its words on the inventory's line (`D1: <detail>`),
  the price as it was. The listing opened afterwards reads the row afresh, the
  new price in its heading.
- **The sync badge.** A listing this phone changed since its venue last had it
  is kept in `snap.inventory.unsynced` as `[{"sku", "venues"}]` (a bare sku, as
  2.8.0 kept them, is eBay's): eBay when the price moved on a row listed there
  (a + or −, customize's Save, an Edit of the price), craigslist when one of the
  craigslist card's four fields reads otherwise now on a row listed there (its
  Edit, or an eBay field it is derived from: a + or − moves a derived price).
  That venue's badge is then the same green bubble with the sync bar's to-eBay
  icon where the tick was, then the venue, a button, not a link (`ebay listed,
  sync to eBay` to a screen reader). A tap is a job button's: the ring in the
  icon's place and **tap again to cancel** under the words, the push
  (`{"action": "push", "sku", "venue"}`) a second later, asked about every 3 s;
  a tap while it runs pauses it (**continue**, a small red **reset** beside it),
  as everywhere. One job per row: the row's other badge and its + and − wait.
  Done, that venue is let go and its badge is the plain listed one again, a
  link; the inventory's line says how it ended (`G1: updated`, or the server's
  words). A Sync to eBay from the sync bar that ends done lets every eBay mark
  go (craigslist's stay), customize's Sync to eBay its own, and the craigslist
  card's Sync to craigslist its own.
- **The sync bar**, under the inventory: **Sync from eBay** and **Sync to
  eBay** on a smoke sheet under a yellow rule, each with its half of the sync
  symbol left of the word (Michal, 2026-10-07; 20 px, in the word's colour, on
  one 24-unit box so the two read as one circle): to eBay the top arc, left to
  right, its arrow at the right; from eBay the bottom arc, right to left, its
  arrow at the left. It sticks to the bottom of the screen while Admin is on it
  (`position: sticky`, so at the end of the list it sits in its own place above
  Close and never covers the last row). A tap is a job button's, as a venue
  button's: the ring turns in it at once (in the icon's place) with **tap again
  to cancel** under the word, and the sync job leaves the phone a second later;
  its line under the buttons says `queued`, then the server's step, then its
  summary (`3 listings updated, 10 unchanged, 0 failed`) or its error, asked
  every 3 s; the other button is locked until it ends, and the list is then
  asked for again (on the way back, when a listing is open). A tap on the
  pressed one pauses it as a venue button's tap does: it reads **continue**
  (its icon back, the ring gone), the other stays locked, one red **reset**
  sits under the two, and the line says `paused` (held in its second) or
  `paused: the server may still be working on it`. continue carries on; reset drops
  a held press, or tells the server (`DELETE /jobs/<id>`), frees both buttons at once
  with `cancelled`, and shows the server's own words once it has stopped; from its
  `publishing ...` step on a tap only says `too late to cancel: it is
  publishing`. A sync the server refuses shows the server's words. Closing Admin leaves
  the job running on the server, still asked about.
- **A listing tapped** is a page of its own (Michal, 2026-10-07: "Now when I am
  on a card I don't want to see admin or settings above. Looking at an item is
  a new page (at the top it just says back to inventory)"; "The general
  inventory commands should not be present of course when looking at a card"):
  Admin's title, Settings and its line, the Inventory line, the search and
  Options, the sync bar and Close all step aside, the page scrolls
  to the top, and only **← Back to inventory** sits above the listing. The
  header stays, its **Admin** link still closing Admin. Back is the list again
  (on the same list, at the same row, nothing asked again, unless a card
  changed the listing: then the list is asked for again), with everything
  Admin had. The listing open is remembered on this phone (`snap.admin.card`,
  its sku, gone on Back): Admin closed (to snap something) and opened again
  lands straight on it, as if it had been there all along (Michal, 2026-10-07:
  "When I press admin I want to land on this same page tho"), read afresh from
  the server (its sku as the heading until the server answers, no foldout yet); a
  reload closes Admin as ever, and opening it lands on the listing too. Back
  from a listing reopened so asks for the list behind it. A listing the server no
  longer has (404) is let go and the list shows, its line saying so first
  (`Could not read B-1: no row B-1. 12 listings`); a server that does not answer
  keeps the listing, saying why. The listing: the title and price as its
  heading, the photos as a strip right under it (88 px tiles, fetched one at a
  time; a tap shows one full size on black, the whole picture, with **Close**
  at the top right; a tap anywhere on it, or Escape, closes it too), then its
  **customize** (below), then one foldout per venue and nothing else, **ebay**
  then **craigslist**, both folded each time a listing opens (Michal,
  2026-10-07: "When I look at a card of a listing I want the eBay and
  Craigslist section be folded in at first"). Each foldout's line is the
  list's own badge for that venue, then the arrow (Michal, 2026-10-07: "I want
  them to look like they did on the inventory list. Inside a green bubble if
  listed. (Keeping visual references the same across screens makes things
  simple)"): `ebay ✓` in the posted green, `craigslist draft` outlined,
  sold and ended muted, and `craigslist not added` dashed for a venue the
  listing is not on; one piece of markup and CSS for both screens, and never a
  link here (the listing's link is in the card's actions).
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
      slider's grade as `pricing`. The server sets the price to that grade's cached
      one: no model call, no job, and the row it answers puts the new price in
      the heading and the eBay card at once. A quantity that is not a whole
      number, 1 or more, is said in the status line at once and shuts both
      buttons, as the goods card does. Then `saved` (on a listing up on eBay,
      `saved; Sync to eBay puts it on the listing`), or the server's refusal (`no
      cached fair price for this row: set the price by hand`) with the box and
      the slider as he left them. On a row with no cached prices at all, the
      slider moved says `no cached prices on this listing; set the price by
      hand` and is not sent; the boxes still are. The price itself is set by
      hand on the eBay card's Edit.
    - **Sync to eBay** opens only on a listing up on eBay (otherwise the line
      says `Sync to eBay opens once the listing is up on eBay`). It saves what
      is not yet saved first (a moved slider too, so the push carries the new
      price), so a tick and one tap is the whole of what Michal described, then
      sends the push job: `queued`, the server's step, then `updated` or `unchanged`
      or the error, asked every 3 s. Once done the listing is read again, so the
      heading and the eBay card show what eBay now has; a Save or a push the server
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
    kept), the User note, the condition note, the aspects and condition details as
    `name: values` lines, the package (`40 oz, 18 x 12 x 12 in`), the ISBN
    when there is one, the model cost (`$0.1046`).
  - **craigslist**: title, price, description and category, each the
    craigslist override when one was typed, or else the value it is derived
    from (the eBay title, price and description; the category `from the eBay
    category`) with `derived from eBay` under it, muted.
  - A venue the listing is not on is an **empty foldout**, folded, its badge
    saying `craigslist not added`, holding one button, **Add craigslist to
    this item**: the server puts the listing on it, and the card fills with its
    derived fields, open.
- **A card's actions**, in its row under the fields (which ones show is
  `venueActions` in core.js):
  - **Post on <venue>** when the listing is on the venue and not listed (a
    draft; an ended or sold one goes up again): the same `{"sku", "venue"}`
    job as the other venue button, its step in the card's status line, asked
    every 3 s; once done the listing is read again and the link shows. It is
    the posting screen's own venue button (Michal, 2026-10-08: "I did post
    something to craigslist; the button was weird. Make the same style button as
    when we post to venues originally"): the 64 px outlined pill in ink, across
    the card, its ring, **tap again to cancel**, **continue** and its **reset**
    (under it) as the venue buttons have them; the other actions are the small
    pills under it.
  - **Open listing** (a link, new tab), **Refresh status** and **End
    listing** when listed, on either venue. Refresh is a job like Post. End asks
    first, inline (`End this listing on craigslist?` **Yes, end it** | **Keep
    it**, never a browser dialog), and only **Yes, end it** sends it,
    `{"action": "end", "sku", "venue"}`. An End the server refuses (400) puts
    its words in the status line and the button goes.
  - **Sync to craigslist**, on the craigslist card, after Open listing, while
    the row is listed on craigslist and its craigslist fields changed since the
    last sync (an Edit of the card, or an eBay field it is derived from; see the
    sync badge): the push job `{"action": "push", "sku", "venue":
    "craigslist"}`, a job button as Refresh is; done, the mark is let go and the
    listing read again. A server that does not push to craigslist yet answers
    400, and the card's line says its words. eBay's is customize's Sync to eBay.
  - **Edit** turns the card's fields into the page's own inputs (eBay: title,
    price, description, User note, condition note, the quantity and pickup only
    being customize's; craigslist: its four overrides, each blank one showing
    what it derives as its placeholder, each with a **clear** that empties the
    override); **Save** sends one PATCH with only the fields changed (nothing
    changed sends nothing), **Cancel** puts the card back. A field the server
    refuses is named under Save, the inputs kept as typed.
  - While something of the listing's is on its way or a job of its is still
    running, every action button but Open listing waits and the fields stay
    read-only: one job per listing at a time.
  - **Post**, **Sync to craigslist**, **Refresh status**, **End listing**
    (pressed through **Yes, end it**) and customize's **Sync to eBay** are job
    buttons, as a venue
    button is (Michal, 2026-10-07: "Anytime there is a load or sync or AI call
    command, anything that takes some [time] and we have a loading icon
    running, these buttons should get that"): the pressed one turns its ring
    beside its word with **tap again to cancel** under it, small, and its job
    leaves the phone a second later (Sync to eBay saves first, then pushes). A
    tap on it pauses it, as a venue button's does: it reads **continue**, a
    small red **reset** beside it, and the line says `paused` (held in its
    second) or `paused: the server may still be working on it`, the listing still
    busy. continue carries on (a held press goes at once, a job is asked about
    again at once); reset drops a held press, nothing sent, or tells the server
    (`DELETE /jobs/<id>`), and the card is free at once with `cancelled`, then
    the server's `cancelled from the phone` once it has stopped (a queued job it
    drops at once). From the server's `publishing ...` step on the second line goes
    and a tap only says `too late to cancel: it is publishing` for a moment. A
    tap while the job's POST (or Sync's save) is on its way does nothing. Add,
    Save and a plain load (the list, a listing read again) have nothing to
    cancel: no ring, no second line.
- **Feedback**, a foldout after the inventory (Michal, 2026-10-08): a box ("What
  happened, or what you wish it did"), **Include my last job** (ticked) and
  **Send**, which posts `POST /feedback` with the words, `screen` (where he came
  from: `goods` or `book`, the posting screen Admin was opened from; `admin` when it
  was opened from the landing; `card` once a listing was looked at in this visit to
  Admin), the page's `version`, and, ticked, the last job id the page has (the last
  `POST /jobs` it sent, else a job of an item in hand; none, no `job` key). 201:
  `Thanks, sent.` and the box clears; an error says `Not sent: <the server's
  words>.` and keeps the box.
- **Stats**, after Feedback, for an admin only (`/me` says `"admin": true`; Michal's
  wish, 2026-10-08): chips **7d** | **30d** (the default) | **all**, each asking
  `GET /stats?since=...` afresh, drawn as a small table: jobs (done, failed,
  cancelled), posted per venue, drafted, ended, pushed, the model cost, then one row
  per user (name, jobs, posted, cost). Counts only, no listing's title anywhere. A
  403 or 404 takes the foldout away. Feedback and Stats step aside on a listing's
  own page, as Settings does.

## Settings

- **Server address**: `https://<pc>.<tailnet>.ts.net`, the address
  `tailscale funnel` prints. Only `https://*.ts.net` is accepted, plus
  `http://127.0.0.1` and `http://localhost` for trying the page on the server
  itself; the page's CSP allows exactly those, so any other address could only
  fail silently.
- **Key**: one of the keys in `CROSSLISTER_KEYS` in the server's `.env`. Michal and
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
none, or anything else, is `device`). Also kept: a sign-in's session
(`snap.session`, in `localStorage` with Keep me signed in, else `sessionStorage`),
customize's defaults (`snap.customize.defaults`) and the day the home-screen
banner was put away (`snap.install.dismissed`); `/me`'s answer is never stored. Every storage read and write is wrapped,
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
`http://localhost:8080` to `CROSSLISTER_SERVE_ORIGINS` in the server's `.env`
(e.g. `CROSSLISTER_SERVE_ORIGINS=https://*.github.io,http://localhost:8080`).
Taking photos and typing the user note cost nothing (they only land in the inbox
folder). **A real press of ebay or craigslist pays for a model call and
publishes.**

## Security and privacy

- No secrets in this repo. The key is typed into each phone and lives only in
  that phone's `localStorage` and in the header of calls to the server; a sign-in's
  session the same way (or in `sessionStorage`, for one tab), and the link's token
  leaves the address bar the moment the page has read it.
- The CSP lets the page talk to the server's Tailscale address (or loopback) and
  nothing else; no third-party script, font or analytics.
- Shrinking re-encodes each photo, which also drops the camera's metadata (GPS
  included) before anything leaves the phone.
- A link from the server is only made tappable if it is an `http(s)` address, and
  it opens with `rel="noopener noreferrer"`.
- Nothing is logged to the console; a test enforces that.
