# Setting up crosslister snap

The page needs two things per phone: the **PC address** and a **key**. Both
come from the home PC, which must be running `crosslister serve` with Tailscale
Funnel on. The PC side is set up once, in the crosslister repo:
`docs/USAGE.md`, "The phone app: crosslister serve" (Tailscale, sleep off,
keys, started at logon).

---

## 1. On the PC: the address

With `crosslister serve` running, in another window:

```powershell
tailscale funnel --bg 8765
tailscale funnel status
```

`status` shows the address the PC is published at, like

```
https://pc.tail1234.ts.net
```

That whole line, `https://` included and nothing after `.ts.net`, is the **PC
address**. It stays the same across restarts.

Check it answers, from any browser (no key needed, costs nothing):
`https://pc.tail1234.ts.net/health` should show `{"ok":true,"queue":0}`.

## 2. On the PC: the key

Open `.env` in the crosslister folder and find `CROSSLISTER_KEYS`:

```
CROSSLISTER_KEYS=michal=<a long random key>;wife=<another long random key>
```

The **key** is the part after `name=`, up to the `;`. Keys are at least 16
characters. One shared key for both phones works too
(`CROSSLISTER_KEYS=michal=<key>`); two keys let the job list say who sent what.
After changing `.env`, restart `crosslister serve`.

Never put a key in this repo: it is public.

## 3. The first phone

1. Open **Chrome** and go to `https://michalkoszycki.github.io/crosslister-snap/`
2. Tap **Settings** (top right). Type the PC address and the key, tap **Save
   and check**. It should say "Saved. The PC answers and knows this key."
3. Tap Chrome's **three-dot menu** > **Add to Home screen** (or **Install
   app**), then **Add**. The icon opens the page without the address bar.
4. The first time you tap **Snap**, Android asks to allow the camera. Allow it.

## 4. The second phone

The same three steps, with the same address and the key for that person (or
the shared key). Settings live on each phone separately; nothing is copied
between them.

## 5. Using it

- Type the item name, tap **Snap**, take the photos. Each one goes to the PC
  right away, into the item's own folder in the PC's inbox (`Boots 2026-09-24`);
  the word at its top left goes `waiting`, then `sent`. The **x** at a photo's
  top right removes it, from the PC too.
- Tap **AI** at the bottom right of the photos that identify the item (label,
  model number, the whole thing). At least one; the rest still go to the
  listing.
- Write the note, if any. It goes to the PC a moment after you stop typing
  (`sent` next to the label).
- More than one of it, or pickup only? Tap the small **▸ customize** right
  above the buttons: set the **Quantity**, tick **Pickup only** (no shipping
  on eBay; `pickup only` then shows under ebay). Left alone it is one,
  shipped, as always, and the next item starts that way again.
- Tap **ebay** or **craigslist** (they open once every photo says `sent`). The
  line under it goes `sending`, `queued`, then the PC's steps, then the link.
  **Every press publishes for real** and a new item costs one model call.
- Tap the other button for the same item on the other site: it sends only the
  item's sku, so no second model call.
- Not pressing either is fine: the photos and the note are already in the PC's
  inbox, where `crosslister post` (nothing named) offers the folder.
- **DONE** when both links are there (or one is all you want).

### Books

- Tap **book** at the top. The phone remembers it: next time the page opens on
  books. Tapping **goods** goes back; an item half done on either side stays as
  it was, its photos still going to the PC.
- Tap **ISBN** (the big button; it used to say Scan) and photograph the
  barcode on the back cover, close and flat. The ISBN box fills, and a moment
  later the book's card shows its title, authors, publisher, year, format and
  pages. That picture is only read for the number: it is not one of the
  listing's photos, so a close-up of the barcode is all it needs. (No card:
  see "When something goes wrong".)
- Or type the ISBN printed above or under the barcode into the box (10 or 13
  digits, hyphens fine). It is looked up as soon as the last digit is in.
- **No ISBN** (an old book, a local print): tap the small **No ISBN** under the
  ISBN box. Type the **Title** as the cover has it, the **Author** if there is
  one, the **Year** if it is printed, and tap **Paperback** or **Hardcover**.
  A moment after you stop typing the PC looks the book up by those: the card
  shows the catalogue's book with `matched in the catalogues`, or what you
  typed with `Not in the catalogues: it will be listed as typed`, and the
  price box fills with eBay's price either way. A catalogue that says
  hardcover sets the chip, unless you tapped one yourself. The rest is the
  same as with an ISBN. Tapping **No ISBN** again closes the fields and clears
  them; an ISBN typed or read meanwhile closes them too.
- **An ISBN the catalogues do not know**: the card says so and **No ISBN**
  lights up. Tap it and type the title as above; the ISBN is kept and goes on
  the listing with what you typed.
- **Snap** the front cover, and anything worth showing (the spine, a flaw).
- The first photo leads the listing: it wears **main** at its bottom right
  (where goods have **AI**), filled blue. To lead with another, tap its
  **main**; the mark moves there. Deleting the main photo gives the mark back
  to the first one left. Once **ebay** is pressed the mark stays put.
- Tap the **condition**: Like new, Very good, Good (already chosen) or
  Acceptable.
- Check the **price**. It is filled with the PC's suggestion from eBay's own
  listings, shown under the box (`eBay: 12 listings, $6–$24 · suggested $11`).
  Under $5 the line says a lot or a buyback site may be better.
- Write the **flaws**, if any: wear, marks, writing inside. They go to the PC
  as the goods note does.
- Several copies, or pickup only: **▸ customize** above ebay, as for goods.
- Tap **ebay** (it opens once every photo says `sent`). The line under it goes
  `sending`, `queued`, the PC's steps, then the link. No model call; **the
  press publishes for real**.
- **DONE** for the next book.

---

## 6. When something goes wrong

**The buttons stay grey with "Set the PC address and key in Settings"**
Settings are empty or were not saved. In a private (incognito) tab nothing is
remembered; use a normal tab or the home-screen icon.

**Settings says "The page may only call a Tailscale address"**
The address must be the `https://....ts.net` one from step 1, with nothing
after `.ts.net`.

**"Cannot reach the PC" at the top, photos stuck on `waiting`**
The phone is offline, the PC is off or asleep, `crosslister serve` is not
running, or the Funnel is off (`tailscale funnel status` on the PC). Keep
snapping: the photos wait on the page and go by themselves once the PC answers
(the page tries again after a few seconds, then every 30 s, and at once when
the phone is back online). Do not reload or close the page meanwhile: photos
not yet sent live only in the page. Check with
`https://<pc>.<tailnet>.ts.net/health` in the phone's browser.

**A photo says `failed`**
The PC answered but refused that photo (its words are in the photo's label for
screen readers, and the line under the buttons says a photo did not reach the
PC). Tap `failed` to send it again, or the x to drop it.

**The page was reloaded or closed**
It reads the item back from the PC: the photos that were `sent` (shown as "on
the PC"), the AI marks (a book's main mark), the note and the jobs. Photos still `waiting` at that
moment are gone from the page; take them again.

**"wrong key - check Settings"** (at the top, or under a button)
The key does not match any in `CROSSLISTER_KEYS`. Re-copy it from `.env`; if
`.env` changed, restart `crosslister serve`.

**Books: "This phone cannot read barcodes; type the ISBN"**
Reading the barcode needs Chrome on Android; iPhones (and Safari) have no
barcode reader for web pages, so the ISBN button stays grey there. Type the
ISBN into the box instead.

**Books: "No barcode found — try again closer, or type the ISBN under the barcode"**
The picture was too far, blurred or at an angle. Tap **ISBN** again closer, or
type the ISBN. Nothing else changes: the missed picture is not kept.

**Books: "Not in the catalogues. Tap No ISBN and type the title — the ISBN stays on the listing."**
The PC's catalogues do not know that ISBN (old, local or self-published books);
the small line under it is the PC's own reason (if it says no Google Books key
is set, adding one on the PC may find the next such book). Tap **No ISBN**,
now filled blue: the fields open with the ISBN kept (`ISBN ... kept: it goes on
the listing` above them), even if a cover is already on the PC. Type the title
(and the author, year, format) as for a book with no ISBN; the PC finds a price
by the title, and the listing gets the ISBN and what you typed. A different
ISBN typed or read replaces the kept one; **No ISBN** again closes the fields
and asks about the ISBN once more.

**Books: "The book was not looked up - edit the title to try again"**
The PC could not search (its words are on the card; the catalogues or eBay did
not answer). What you typed is kept: change the title a little (a space at the
end will do) and it asks again.

**A job fails with a message**
That is the PC's own reason (a Craigslist form that changed, a missing eBay
setting...). Fix it at the PC with the row's usual commands; the button comes
back for another try.

## 7. Trying the page on the PC itself

```powershell
cd C:\Users\MICHAL\Documents\PyCharm\crosslister-snap
python -m http.server 8080
```

Open `http://localhost:8080/`, and in Settings use `http://127.0.0.1:8765`
and a key from `.env`. The service must allow this page's origin: put
`CROSSLISTER_SERVE_ORIGINS=https://*.github.io,http://localhost:8080` in
`.env` and restart `crosslister serve`. Settings, the disabled states, the
"knows this key" check, taking photos (they land in the inbox folder) and the
note cost nothing; a press of ebay or craigslist pays for a model call and
publishes.
