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

- Type the item name, tap **Snap**, take the photos. The **x** at a photo's top
  right removes it.
- Tap **AI** at the bottom right of the photos that identify the item (label,
  model number, the whole thing). At least one; the rest still go to the
  listing.
- Write the note, if any.
- Tap **ebay** or **craigslist**. The line under it goes `sending`, `queued`,
  then the PC's steps, then the link. **Every press publishes for real** and a
  new item costs one model call.
- Tap the other button for the same item on the other site: it sends only the
  item's sku, so no second upload and no second model call.
- **DONE** when both links are there (or one is all you want).

---

## 6. When something goes wrong

**The buttons stay grey with "Set the PC address and key in Settings"**
Settings are empty or were not saved. In a private (incognito) tab nothing is
remembered; use a normal tab or the home-screen icon.

**Settings says "The page may only call a Tailscale address"**
The address must be the `https://....ts.net` one from step 1, with nothing
after `.ts.net`.

**"cannot reach the PC"**
The PC is off or asleep, `crosslister serve` is not running, or the Funnel is
off (`tailscale funnel status` on the PC). The photos are still on the page;
tap the button again once the PC is back. Check with
`https://<pc>.<tailnet>.ts.net/health` in the phone's browser.

**"wrong key - check Settings"**
The key does not match any in `CROSSLISTER_KEYS`. Re-copy it from `.env`; if
`.env` changed, restart `crosslister serve`.

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
`.env` and restart `crosslister serve`. Settings, the disabled states and
the "knows this key" check cost nothing; a press of ebay or craigslist pays
for a model call and publishes.
