# Setting up Snap

Snap, a crosslisting app. The page needs two things per phone: the **Server address** and a **key**. Both
come from the home PC, which must be running `crosslister serve` with Tailscale
Funnel on; the app, and this page, call it **the server**. The server side is set
up once, in the crosslister repo:
`docs/USAGE.md`, "The phone app: crosslister serve" (Tailscale, sleep off,
keys, started at logon).

---

## 1. On the server: the address

With `crosslister serve` running, in another window:

```powershell
tailscale funnel --bg 8765
tailscale funnel status
```

`status` shows the address the server is published at, like

```
https://pc.tail1234.ts.net
```

That whole line, `https://` included and nothing after `.ts.net`, is the **Server
address**. It stays the same across restarts.

Check it answers, from any browser (no key needed, costs nothing):
`https://pc.tail1234.ts.net/health` should show `{"ok":true,"queue":0}`.

## 2. On the server: the key

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

1. Open **Chrome** and go to `https://michalkoszycki.github.io/crosslister-snap/`.
   A phone that has never been set up opens on the **landing**: Snap, "a
   crosslisting app", **Install**, then **I have a key** and **Sign in**.
2. Tap **Install**. Where Chrome offers it, its own install prompt comes up: tap
   **Install**. Otherwise the page spells out the two taps (Chrome's **three-dot
   menu** > **Add to Home screen** or **Install app**, then **Add**; on an iPhone,
   **Share** > **Add to Home Screen**). The icon opens the page without the address
   bar. A phone already in use that never did this sees a thin banner at the top,
   "Add Snap to your home screen for the full-screen app", with the same **Add**;
   its x puts it away for a week.
3. Open Snap from the home-screen icon and tap **I have a key**: Admin opens on
   **Settings**. Type the server address and the key, tap **Save and check**. It
   should say "Saved. The server answers and knows this key." Tap **Close**: the
   goods screen.
4. The first time you tap **Snap**, Android asks to allow the camera. Allow it.

**Sign in** (an email address, then a link that opens Snap signed in) is for the
server's sign-in lane; until that is set up it says "Sign-in is not set up on this
server yet. Ask the developer for a key." Use **I have a key**.

To take a phone off the server: Admin > Settings > **Forget this server** (or
**Sign out**). The landing comes back.

## 4. The second phone

The same steps, with the same address and the key for that person (or
the shared key). Settings live on each phone separately; nothing is copied
between them.

## 5. Using it

- Type the item name, tap **Snap**, take the photos. Each one goes to the server
  right away, into the item's own folder in the server's inbox (`Boots 2026-09-24`);
  the word at its top left goes `waiting`, then `sent`. The **x** at a photo's
  top right removes it, from the server too.
- Tap **AI** at the bottom right of the photos that identify the item (label,
  model number, the whole thing). At least one; the rest still go to the
  listing.
- Write the note, if any. It goes to the server a moment after you stop typing
  (`sent` next to the label).
- More than one of it, or pickup only? Tap the small **▸ customize** right
  above the buttons: set the **Quantity**, tick **Pickup only** (no shipping
  on eBay; `pickup only` then shows under ebay). Left alone it is one,
  shipped, as always, and the next item starts that way again. To make a choice
  stick (the price grade, Post without asking, Compare with eBay listings, Pickup
  only; never the quantity), tap **Save as default** at the end of customize:
  every new item starts from it, on this phone.
- Tap **ebay** or **craigslist** (they open once every photo says `sent`). The
  line under it goes `sending`, `queued`, then the server's steps, then the link.
  The button itself turns a ring and, once the server has saved the listing, shows
  its price (`ebay · $14`); when it is posted the button reads just `$14`.
  **Every press publishes for real** and a new item costs one model call.
- Tap the other button for the same item on the other site: it sends only the
  item's sku, so no second model call.
- Not pressing either is fine: the photos and the note are already in the server's
  inbox, where `crosslister post` (nothing named) offers the folder.
- **NEXT** (it used to say DONE) for the next item. No need to wait for the
  link: once a button is pressed and the server has the job, NEXT clears the
  screen and the listing finishes on the server by itself (the line under NEXT
  says one is still posting; its link is then not shown on the phone). NEXT
  waits only while a photo is still on its way.

### Books

- Tap **book** at the top. The phone remembers it: next time the page opens on
  books. Tapping **goods** goes back; an item half done on either side stays as
  it was, its photos still going to the server.
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
  A moment after you stop typing the server looks the book up by those: the card
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
- Check the **price**. It is filled with the server's suggestion from eBay's own
  listings, shown under the box (`eBay: 12 listings, $6–$24 · suggested $11`).
  Under $5 the line says a lot or a buyback site may be better.
- Write the **flaws**, if any: wear, marks, writing inside. They go to the server
  as the goods note does.
- Several copies, or pickup only: **▸ customize** above ebay, as for goods.
- Tap **ebay** (it opens once every photo says `sent`). The line under it goes
  `sending`, `queued`, the server's steps, then the link. The button shows the
  price you set from the press (`ebay · $11`), then just `$11` once posted.
  No model call; **the press publishes for real**.
- **NEXT** for the next book, as for goods: no need to wait for the link.

---

## 6. When something goes wrong

**The landing comes up every time, or "Set the server address and key in Admin"**
Settings are empty or were not saved. In a private (incognito) tab nothing is
remembered; use a normal tab or the home-screen icon.

**The craigslist button is grey and says "Craigslist is not available for your account yet. Ask for it in Admin, Feedback."**
The server says this key's account has no Craigslist. Ask for it in Admin > **Feedback**.

**Something odd happened**
Admin > **Feedback**: write what happened and tap **Send**. It goes to the server
with the screen you came from, the page's version and (ticked) the last job.

**Settings says "The page may only call a Tailscale address"**
The address must be the `https://....ts.net` one from step 1, with nothing
after `.ts.net`.

**"Cannot reach the server" at the top, photos stuck on `waiting`**
The phone is offline, the server is off or asleep, `crosslister serve` is not
running, or the Funnel is off (`tailscale funnel status` on the server). Keep
snapping: the photos wait on the page and go by themselves once the server answers
(the page tries again after a few seconds, then every 30 s, and at once when
the phone is back online). Do not reload or close the page meanwhile: photos
not yet sent live only in the page. Check with
`https://<pc>.<tailnet>.ts.net/health` in the phone's browser.

**A photo says `failed`**
The server answered but refused that photo (its words are in the photo's label for
screen readers, and the line under the buttons says a photo did not reach the
server). Tap `failed` to send it again, or the x to drop it.

**The page was reloaded or closed**
It reads the item back from the server: the photos that were `sent` (shown as "on
the server"), the AI marks (a book's main mark), the note and the jobs. Photos still `waiting` at that
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
The server's catalogues do not know that ISBN (old, local or self-published books);
the small line under it is the server's own reason (if it says no Google Books key
is set, adding one on the server may find the next such book). Tap **No ISBN**,
now filled blue: the fields open with the ISBN kept (`ISBN ... kept: it goes on
the listing` above them), even if a cover is already on the server. Type the title
(and the author, year, format) as for a book with no ISBN; the server finds a price
by the title, and the listing gets the ISBN and what you typed. A different
ISBN typed or read replaces the kept one; **No ISBN** again closes the fields
and asks about the ISBN once more.

**Books: "The book was not looked up - edit the title to try again"**
The server could not search (its words are on the card; the catalogues or eBay did
not answer). What you typed is kept: change the title a little (a space at the
end will do) and it asks again.

**A job fails with a message**
That is the server's own reason (a Craigslist form that changed, a missing eBay
setting...). Fix it at the server with the row's usual commands; the button comes
back for another try.

## 7. Trying the page on the server itself

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
