# Setting up crosslister snap

Do these once. Step 1 is the only fiddly one and takes about ten minutes.
Everything is free.

Where a label below is quoted, it is copied from Microsoft's own documentation
(linked at the bottom). Microsoft rearranges this portal often, so if a button
is not where this says, look for the same words nearby — the shape of the thing
does not change.

**Step 1a is written from what actually happened on 2026-09-17**, not from
Microsoft's documentation, because the documented path does not work for a
personal account any more.

---

## 1. Register the app with Microsoft (free)

This tells Microsoft "a page at this address is allowed to ask me to sign in".

### 1a. Get yourself a directory to register the app in

A personal Microsoft account can no longer register an app on its own. Signing
in to <https://entra.microsoft.com> with one drops you into a shared tenant
called **"Microsoft Services"** (its Directory ID starts `f8cdef31`) — that one
is Microsoft's, not yours — and opening App registrations there ends with:

> Selected user account does not exist in tenant 'Microsoft Services'

There is nothing to fix on that screen. You need a directory of your own first,
and the free way to get one is to sign up for Azure with the same account. The
directory is the only thing you want out of the sign-up; nothing here costs
money.

1. On the PC, open <https://azure.microsoft.com/free/> and select
   **Start free**. Sign in with **your personal Microsoft account** — the same
   one your OneDrive is on.
2. Pick whichever of the two fits you:
   - **Azure for Students** — no card at all. It verifies you with a school
     email address (a `.edu` one is enough).
   - **Azure free account** — asks for a card and a phone number, for identity
     only. Nothing is charged, and nothing starts charging unless you later go
     and pick a paid service yourself.
3. Finish the sign-up. Ignore everything it offers to create; the sign-up has
   already made you a **directory**, which is all this is for.
4. Open <https://portal.azure.com> .
5. Select the **gear icon** (Settings) in the top bar, then
   **Directories + subscriptions**.
6. Under **Directory switching** you will see two: "Microsoft Services"
   (theirs) and the new one made for you, usually named after your account or
   "Default Directory". Select **Switch** next to **yours**.

   Check it took: the account menu in the top right should now show your own
   directory name. If it still says Microsoft Services, do step 6 again — every
   step below fails in the wrong directory.

### 1b. Create the registration

7. In the search box at the top of <https://portal.azure.com>, type
   `App registrations` and select it from the results. (It is the same screen
   entra.microsoft.com would have shown; coming at it from the portal is what
   avoids the tenant trap above.)
8. Select **New registration**.
9. **Name**: type `crosslister snap`. (Only you ever see it. It can be changed later.)
10. **Supported account types**: open the drop-down and pick

    > **Personal Microsoft accounts only**

    Microsoft describes that option as "For apps used only by personal
    Microsoft accounts (for example: Xbox, Live, Hotmail)". That is exactly
    what you have, and picking it means the app cannot be pointed at a company
    account by mistake. It matches the `consumers` authority the app's code
    uses.
11. Select **Register**.
12. You land on the app's **Overview** page. Leave this tab open — step 2 needs
    the **Application (client) ID** shown here.

### 1c. Say where the app lives (redirect URIs)

13. In the left menu of your app registration, under **Manage**, select
    **Authentication**.
14. Select **Add a platform**.
15. On the **Configure platforms** pane, select the **Single-page application**
    tile. (This one, **not "Web"** — a page with no server of its own is a
    single-page application, and this tile is what turns on the browser-safe
    sign-in method. Picking "Web" makes sign-in fail with a message about a
    client secret, and the platform then has to be deleted and redone.)
16. In **Redirect URI**, enter, one at a time, all four of these:

    ```
    https://michalkoszycki.github.io/crosslister-snap/redirect.html
    https://michalkoszycki.github.io/crosslister-snap/
    http://localhost:8080/redirect.html
    http://localhost:8080/
    ```

    The `redirect.html` ones are what the app actually uses. The other two are
    harmless spares that make life easier if the app is ever changed. Copy them
    exactly, trailing slash and all: Microsoft compares them character for
    character.
17. Select **Configure** (or **Save** if you added the extra URIs afterwards).

### 1d. Ask for permission to write files

18. In the left menu, under **Manage**, select **API permissions**.
19. Select **Add a permission** > **Microsoft Graph** > **Delegated permissions**.
20. In the search box type `Files.ReadWrite`, tick **Files.ReadWrite** — *not*
    `Files.ReadWrite.All` — and select **Add permissions**.

    "Delegated" means the app acts as you, and only ever reaches your own files.
    You will be asked to approve this once, on the phone, the first time you
    sign in.

    This one permission covers everything the app does: uploading photos,
    writing `note.txt`, and deleting a photo you struck out with the x. There
    is nothing else to add later.

### 1e. Copy the client id

21. Go back to **Overview** and copy the **Application (client) ID**. It looks
    like `11111111-2222-3333-4444-555555555555`.

---

## 2. Put the client id into `config.js`

Open `config.js` in the `crosslister-snap` folder and change the one line:

```js
clientId: "PASTE-YOUR-APPLICATION-CLIENT-ID-HERE",
```

to

```js
clientId: "11111111-2222-3333-4444-555555555555",
```

Save. That is the whole of step 2.

This id is **not a secret**, and it is fine that it sits in a public repo. A page
running in a browser cannot hide anything from whoever is looking at it, so
Microsoft designed the client id to be a public name-tag, not a password. What
actually protects the account is the list of redirect URIs from step 1c plus
your own sign-in.

---

## 3. Publish it — **the conductor does this step**

For reference, the commands are:

```powershell
cd C:\Users\MICHAL\Documents\PyCharm\crosslister-snap
gh repo create michalkoszycki/crosslister-snap --public --source . --remote origin --push
```

Then enable GitHub Pages, from the main branch, root folder — either in the
repo's **Settings > Pages** (Source: *Deploy from a branch*, Branch: `main`,
folder: `/ (root)`), or:

```powershell
gh api -X POST repos/michalkoszycki/crosslister-snap/pages -f "source[branch]=main" -f "source[path]=/"
```

A minute later the app is at
<https://michalkoszycki.github.io/crosslister-snap/> .

---

## 4. On the phone

1. Open **Chrome** and go to
   `https://michalkoszycki.github.io/crosslister-snap/`
2. Tap **Sign in**. Sign in with the same personal Microsoft account, and when
   it asks whether the app may work with your files, say yes. You come back to
   the app with your email shown small at the top. This happens once — the phone
   stays signed in.
3. Tap Chrome's **three-dot menu** > **Add to Home screen** (on some Chrome
   versions: **Install app**), then **Add**. A camera icon appears on the home
   screen and opens the app on its own, without Chrome's address bar.
4. The first time you tap **Snap**, Android asks to allow the camera. Allow it.

### Using it

- Type the item name, e.g. `Blue Levi jacket`. The line underneath shows the
  folder it will use.
- Tap the big **Snap** button, take the photo, confirm it. The photo starts
  uploading immediately and you can snap the next one straight away.
- The strip shows each photo: a percentage while it uploads, `done`, or `failed`
  with a **Retry** button. The line above it reads e.g. "3 of 4 uploaded".
- **Add from gallery** is for photos you already took some other way.
- **Next item** clears the name and the strip. Items you used before are listed
  underneath; tap one to add more photos to it (numbering carries on).
- Photos are uploaded as they came out of the camera. Nothing is shrunk or
  re-encoded, so eBay gets the originals.

---

## 5. When something goes wrong

**"AADSTS50011: The redirect URI specified in the request does not match…"**
The address in the browser does not exactly match a redirect URI from step 1c.
Check for a missing trailing slash, `http` vs `https`, a different port, or
capital letters. The error message itself names the URI it received — copy that
exact string into **Authentication > Add Redirect URI > Single-page application**
and select **Configure**.

**"Selected user account does not exist in tenant" / it refuses a work account**
The app is registered as **Personal accounts only**, on purpose. Sign in with
the personal Microsoft account that owns the OneDrive, not a work or school one.
If Chrome keeps offering the wrong one, tap **Sign out** in the app, then sign in
again and choose **Use another account**.

**"AADSTS700016 / application not found in the directory"**
The client id in `config.js` is wrong or has a stray space. Re-copy it from the
app's **Overview** page.

**Photos are in OneDrive on the web but not on the PC**
1. Look at the OneDrive cloud icon in the Windows notification area. If it says
   **Paused** (for example because the PC is on a metered connection or in
   battery saver), choose **Resume syncing**.
2. Check the folder is actually `Pictures\Uploads` inside the synced OneDrive
   folder and not a same-named folder elsewhere.
3. **Files On-Demand**: a file can show up as a placeholder with a little cloud
   icon, present in Explorer but not downloaded. Most tools open it fine (it
   downloads on first read), but if the crosslister CLI trips on one, right-click
   the item folder > **Always keep on this device**.
4. Sync is not instant. Give it a minute; the OneDrive icon shows progress.

**"OneDrive is full" / a photo fails with 507**
A free Microsoft account has 5 GB, shared with everything else in that OneDrive
(including Outlook attachments). Phone photos are a few MB each, so this only
bites after a lot of listings — clear out `Pictures/Uploads` folders you have
already listed, or empty the OneDrive recycle bin, which also counts.

**A photo says `failed` and Retry does not help**
The photo is still in the page — do not close the tab, or it is gone. Check the
signal, then Retry. If it says "sign-in expired", sign out and in again; the
photos survive that only if the page is not reloaded, so if in doubt take the
photo again.

**The camera preview stays black, or "Camera blocked"**
Chrome asks for the camera the first time you tap **Open camera**, and
remembers the answer per site. To change it: Chrome menu > the padlock/tune
icon next to the address > **Permissions** > **Camera** > Allow. The page needs
`https` (GitHub Pages) or `localhost`; over plain `http` Chrome hides the
camera API entirely and the page says so. Either way the fallbacks under
**Other ways to add a photo** still work.

**The note says "not saved (offline), will retry"**
The note is kept in the page and goes up on the next save — type another
character, or tap **Next item**, and it is sent. It is also kept per item for
the rest of the session, so reopening the same item brings the text back.

---

## Sources

- Register an app, account types, Application (client) ID:
  <https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app>
- Add a redirect URI, the Single-page application tile:
  <https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-redirect-uri>
- MSAL v5 redirect bridge (why the redirect URI is `redirect.html`):
  <https://learn.microsoft.com/en-us/entra/msal/javascript/browser/v4-migration>
- Upload sessions and byte ranges:
  <https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0>
