# Snap: what each screen contains

> The page's specification. Every lane that touches a screen reads this first, builds to it,
> and updates it in the same lane. A change that contradicts it is a bug, not a feature.
> Decisions carry Michal's date; a section marked *proposed* is not yet agreed.
>
> Draft 2026-10-22. The Settings part follows the mock Michal reviewed that day; its
> decisions, listed at the end, were decided on 2026-10-26 and built in v2.25.0; his 26
> comments on the mock (2026-10-26 to 2026-10-31) were built in the minor after it.

## 1. Rules that shape every screen

1. **Plain words, from the user's side.** A control says what happens ("Sign out", "Buy
   postings"). No developer words on the page: no "tenant", "key line", "RuName",
   "CROSSLISTER_". The server is "the server", never "the PC".
   **Less is more** (Michal, 2026-10-26: "the controls should be minimal, no multiple
   lines of text with no impact or info necessary to the user. less is more. save this
   design rule."): a control is one label, one box, one button; a line of text exists
   only when the person needs what it says; a title that only names a box becomes that
   box's label, and a hint that only repeats the label goes in the box as its
   placeholder.
2. **Venues are symmetrical** (Michal, 2026-10-17 and 2026-10-18). Whatever one venue has
   on a screen, every venue has in the same place and shape: a button, a chip, a block, a
   sync action, a header-and-footer pill. A venue that cannot do something says so in its
   own block, in its own words. Nothing is worded for eBay alone.
3. **Who sees what is decided by `/me`, once.** Four kinds of person open the page:
   the admin (Michal, by key), a seller signed in by email, a family member by key, and
   someone still signing up. Section 5 is the one table of what each sees. A control
   that a person cannot use is not shown to them, with one exception: a venue button the
   account lacks is shown grey and explains itself when tapped.
4. **Fill the whole screen.** A lane that adds or moves a control reviews the screen it
   lands on against this document and fixes what no longer fits, in the same lane, and
   lists what it changed beyond the ask. Michal keeps the veto on that list, not the job
   of noticing.
5. **A screen is complete at rest.** Nothing waits for a hover. Every fold starts closed
   except the one the person needs now (Settings for a new sign-in or a sign-up step,
   Inventory otherwise).
6. **Phone-local things live under "This phone".** Appearance, show photos, install, the
   accounts kept on the phone. Everything else is the server's and survives a new phone.
7. **The look is the A2 "Signal Yellow" system** (chosen 2026-10-06): the yellow header
   band, smoke cards, Manrope. Dark follows the device unless chosen. New controls reuse the
   existing classes. **Two looks, two meanings** (Michal, 2026-10-31): yellow on black, or
   black on yellow in the dark (`.pill-ink`), is "press me", an action. An **option** (Dark /
   Light / Sync with device, a venue chip under Venues, a header's or footer's venue) is a
   bordered chip in the field colour with ink words (`.chip.option`); the chosen one is solid
   white with black words and a check mark " ✓" after the word, its border white so it is its
   neighbours' size (no black border, no outline), the same in the dark.

## 2. Vocabulary

| Thing | Word on the page |
|---|---|
| The machine running `crosslister serve` | the server ("server ok", "server off", "Server address") |
| The text given to the drafter | User note |
| What a posting costs | postings ("3 free postings left", "Buy postings"); never "credits" |
| A venue, in a button or chip | lowercase: ebay, craigslist, poshmark |
| A venue, in a sentence | eBay, Craigslist, Poshmark |
| The folds in Admin | Settings, Inventory, Feedback, Stats (capitalised); the item's fold is "customize"; the inventory's own fold is "Filters" |
| Leaving an account on this phone | Sign out (the current account) / Remove from this phone (another account) |
| Deleting the account on the server | Delete account / Keep my account |
| The ship-from address | Address where you ship from |
| Going back | "← Back" plus where to |

## 3. The top bar

Always present. Left: the camera mark and the "$nap" wordmark, as today. After the
wordmark: **the current account's name** (`/me` `user`; there is no one signing up without
an account since 2026-10-25, 4.3), muted; absent on the landing. Right: the server word ("server ok" green, "server off" and
"wrong key" red, "checking server...", "server not set"), then the Admin button: three
dots in a row, the way apps open their menu, heard as "Admin" (Michal, 2026-10-31); it reads
"Snap" while Admin is open and takes the person back. One fixed box for both, the word centred
where the dots were, so the header never changes height. The server word appears here only;
nowhere else on the page repeats it.

## 4. The screens

### 4.1 Landing (first open, or no account on this phone)

Top to bottom: "← Back" (only while adding an account); the big mark; "$nap" written as the header writes it (Michal, 2026-10-31), "a
crosslisting app"; one line of what it does, naming no venue ("From photo to live listing in seconds";
Michal, 2026-10-31, who also took the postings count off the landing); **Sign in** ("Sign in or create an account" when sign-up is open); **I have a
key**; **Install** (hidden on the home screen and on desktop); **Switch account** (only
when another usable account is kept on this phone); no help line under the buttons (a phone
has no hover, so it only flashed; Michal, 2026-10-31: "no tip is fine"); the
status line ("Signing you in...", "Your sign-in expired; send yourself a new link", "Your
account was deleted."). Footer: "About and privacy", the version, at the foot of the screen at least: on a short page the spare room is white space, on the landing evenly above the mark and below the buttons (Michal, 2026-10-31).

### 4.2 Sign in

"← Back"; "Sign in"; the sentence; Email; "Keep me signed in" (ticked); **Send me a
link**; status; "I already have a code" opening the six-digit code field and **Sign in
with the code**; the iPhone note (Safari only).

### 4.3 A new account, before eBay is connected

The first code makes the account (Michal, 2026-10-25: "create the account EVEN if they
don't create a venue"). There is no "pending" person: from the first code on, the person
is an ordinary account with a name in the top bar, an empty inventory and the whole of
Admin. In place of the posting screens, until eBay is connected and the address saved:
"Finish setting up" with no line under it (Michal, 2026-10-31: "take this out"). Step 1 as a card: **Connect eBay**, which
becomes "eBay connected: name" in green. Step 2 as a card: the address where you ship
from, prefilled from eBay once connected, **Looks right** or **Save address**. Step 3 (Michal,
2026-10-31): "Snap sets up on your eBay account" and the policy lines Settings lists under the
address, ticked once eBay says they are made; in step 2's look, no bullets. **Edit** under them (GET/PATCH /me/policies; not for the admin's, set on the server; shut until eBay is connected): each choice a menu in the list's place (Shipping service, Shipping cost calculated or flat, Handling time, Returns, Return shipping paid by, Offer local pickup, Accept best offers), **Save** sends what changed and the list comes back (Michal, 2026-10-31). Back from eBay's consent, a new account lands on
this screen again (not Settings), step 1 green, its line saying "eBay connected". The same
two things are in Settings, Venues, under eBay, with the note "Connect eBay to start
posting".

### 4.4 Posting screens (goods and book)

The mode chips (goods, book); the install banner (until added; its x puts it away for a day, and from the third close it
asks "Do not show this again?": Yes, never on this phone; No, a day; Michal 2026-10-31); the offline
banner; the photos with the AI mark and delete; the User note; the **▸ customize** fold
(Quantity, Pickup only, the Price slider Quick sale / Fair price / Higher end, Post without
asking, Compare with marketplace listings, Fix dark photos for goods); the title and price
line once drafted, "See in inventory"; **one block per venue, in the same shape**: the
button, "reset" while paused, the status line (before a press only what customize changed
that is not the price: no price grade under the buttons, Michal 2026-10-31), "Buy postings"
after a 402, the posting's link; the hint line; **NEXT** at the bottom. A venue the account lacks is grey and, when
tapped, says it is not available for this account yet and points to Feedback. The book
screen has the same venue blocks as the goods screen, not eBay alone. Books are the admin's
alone (Michal, 2026-10-31): anyone else can switch to book and see its screen, all of it very
milky light grey and inert, with one line on top, "Books are not open for your account yet.
**Ask for it in Feedback**" (the link opens Admin at Feedback with "I would like to list
books." in the box); goods takes them back.

The customize fold holds this item's values. Its starting values come from Settings,
Posting defaults (4.5). "Save as default" has left the fold; the defaults are edited in
Settings (decided 2026-10-26, section 6).

### 4.5 Admin

Opens from the top bar. No title. Order (Michal, 2026-10-22: "inventory should be before
settings"): **▸ Inventory**; **▸ Settings**; **▸ Feedback**; **▸ Stats** (admin only).
No Close at its foot (Michal, 2026-10-31: "take the exit button out"): the header's button,
"Snap" while Admin is open, is the way back. The sticky sync bar is gone: its buttons live in each venue's block (decided
2026-10-26, section 6). Inventory, Feedback and Stats are hidden when no server is set (a
new account sees the whole of Admin, 4.3).

**Settings** opens as its five parts as a row of chips on the page's ground (Michal,
2026-10-31: "put the submenu items OUT of the gray background"), the chosen part in a grey
card under them as the inventory's, the inventory filters' look; the pressed chip's part is the one shown
under them, one at a time (Michal, 2026-10-31: "words in pill shaped buttons with the
highlighted one deciding what is visible below"), the chosen one remembered on this phone,
in this order. The first is named **Snap Account** (Michal, 2026-10-25), shown until another
is chosen; the one the person needs is chosen by itself (Account after a new
sign-in, Venues while eBay is not yet connected, Server for "I have a key" before a key is
saved), and the phone remembers which were left open.

1. **Snap Account.** One card per account kept on this phone, the current one outlined (no
   sentence saying so: the outline, the missing "Switch to" and the top bar's name already
   say it; Michal, 2026-10-25). A card shows the name, "by key" only on a key account
   (every new account is by email, so that is not said), for the current account its
   postings ("2 free postings left", on the same line as **Buy postings**, Michal
   2026-10-25; nothing for the admin), Buy postings the press-me pill, there for every
   account whose postings are counted however many are left (2026-10-31; with no packs on
   the server its tap says "Buying postings is not available yet."), the packs under it, its status line directly
   under those buttons, and on the other cards **Switch to this account** and **Remove
   from this phone**, or "Sign in again" on an expired one. The last line of the current
   card is right-aligned (Michal, 2026-10-25): **Delete account** in quiet red, then
   **Sign out** at the bottom right. Delete account opens the confirmation view (the
   three sentences, **Delete account** in red, **Keep my account**). Under the cards:
   **Add account**, in line with the cards' inner text edge, a gap above it (Michal,
   2026-10-31), which returns to the landing without dropping the others.

   On the current card, for the owner, the invite box: one label "Invite someone to this
   account" in the field-label style, one box with "email" as its placeholder, one
   **Invite** button, nothing else (Michal, 2026-10-25/26: "the invite someone section
   should return here, above the people on this account", "don't ask for their name. just
   email is fine … simple", "less is more"); the person's name starts as the first part of their email and
   **Change name** alters it; then, for everyone, one link:
   **People on this account ›** with the count ("2 people", "just you"). It opens the
   **People page** (Michal, 2026-10-25: "let it be a
   simple separate page"), its own screen in Admin's place with **← Back to settings** at
   the top in the inventory card's shape, then the heading, then one card per person,
   the owner first, each a bordered card in the inventory row's style (Michal, 2026-10-31). **People are shown by their chosen name, never by email** (Michal,
   2026-10-25). A person's card: the name, "owner" or "member", "you" on yourself,
   "invited, not signed in yet" until their first sign-in, **Change name** on your own,
   **Remove** on a member (owner only); under it their signed-in **devices**: the device
   as the browser names it ("iPhone, Safari"), "this device" or "last used …", **Sign
   out** per device (this device's is a sign-out); on your own card **Sign out all other
   devices** while there is another device of yours (a key has no sessions). A member sees only
   their own devices; the owner sees everyone's. The invited person gets a mail with a
   link and a code that sign them into this account, not a new one, and can change their
   name afterwards. For a member the page ends with **Leave this account**, and the
   member's account card shows neither the invite box nor Delete account. Rules: ten
   devices per person, the oldest sign-in dropped quietly by the eleventh; every new
   sign-in is announced by mail ("Snap was opened on a new device …; if this was not
   you, open Settings and sign out all other devices"); removing a member ends their
   sessions, leaving ends your own, deleting the account ends all. Keys stay for the
   admin and scripts only; a family member is a member by email.
2. **Venues.** One white card per venue (ebay, craigslist, poshmark, in `/me.venues` order),
   all shown, each as tall as the tallest, no chip row (Michal, 2026-10-31: "eliminate the venue
   buttons at the top. instead provide 3 cards for the venues ... same size with same options").
   Each card the same shape: the venue's name first, then its status line
   ("Connected as name · policies ready", "Signed in on the server", "Not available for
   your account yet", "Not connected" with the **Connect eBay** pill and "Connect eBay to
   start posting"); one muted line "Ships from …" showing the address that venue uses, as
   its line is typed ("Ships from 1234 W Example St, Chicago, IL 60637"); its actions (eBay:
   **Connect eBay** while not connected, **Reconnect** once it is, the status line then
   saying "Connected as …"; Craigslist and Poshmark: "Ask for it in Feedback" when not
   available); its two sync buttons, **Sync from <venue>** and **Sync to <venue>**, the venue
   lowercase as on every button ("Sync from ebay"; Michal, 2026-10-26). **The sync buttons
   live here and nowhere else** (Michal, 2026-10-31): the inventory's green with its white (light look; Michal, 2026-10-31)
   words, then an arrow drawn with a heavy stroke (the font's was too thin to see), ← on Sync from and → on Sync to (Michal, 2026-10-31:
   "the typical font arrow right (for sync to) and arrow left (for sync from)"; the same → after
   the venue on an inventory row's sync badge; no other sync symbol), every state exactly a
   listed badge's height (the ring in the arrow's room, "tap again to cancel" on the word's
   line); shown only once
   the venue is connected or signed in (none for eBay before Connect eBay, none for a venue
   the account lacks: its status line says why); grey and disabled where a direction does not
   exist (Sync from craigslist, both for poshmark), with one muted line of reason under the
   pair ("Craigslist cannot be read back yet.", "Poshmark sync is not built yet.").
   Last, after the venue blocks, the **Address where you ship from** (Michal, 2026-10-26:
   "the address box should be at the end of venues"), with no card background, in line with
   the venue block's inner text edge (2026-10-31): the title, then ONE line, "1234 W Example
   St, Chicago, IL 60637", typed as one line and split at the commas into street, city,
   state and ZIP for `PATCH /me/address` (the state and ZIP one part or two; the
   neighbourhood after the ZIP while Craigslist uses it); then one row, **Save address** and
   the **Same address for every venue** checkbox on the same line, last, ticked by default.
   Unticked, one line per venue that uses an address, its name its label, each prefilled from
   the shared one and split the same way: eBay the full line, Craigslist "60609, McKinley
   Park", Poshmark a muted line saying it uses none. Ticking it again keeps the eBay address
   as the shared one (it is the one eBay prefilled). The page reads and writes `GET`/`PATCH
   /me/address` (`same`, `shared`, `venues`, `uses`).
3. **Posting defaults** (Michal, 2026-10-26: "call this posting defaults"). The Snap page's
   customize field for field, its words and small print too (Michal, 2026-10-31: "make this card
   look like the customize menu on the snap page"): **Quantity**; Pickup only, no shipping; the
   **Price** slider, its three words and its line under them; Post without asking / Compare with
   marketplace listings / Fix dark photos, each with customize's small print, each saved as it
   changes and kept on this phone for now (the server has no place for them yet, so they do
   not follow to a new phone: rule 6's exception until it does) / **Add standard text to
   posts**. That fifth is the header and footer (`GET`/`PATCH /me/wrap`): unticked, just its
   line; ticked, the gray card under it: "Header" (field label) and its text box, its venue
   chips (option chips, one per venue `/me/wrap` offers), "Footer" and its box and chips; no
   checkboxes on Header or Footer, a blank box means none; then two press-me pills, each on a
   line of its own: **Save for upcoming postings** (`PATCH /me/wrap`) and **Apply to existing
   postings** (the same save, then `POST /me/wrap/apply` for every venue a part goes on, one
   line per push under the card), both dimmed until the text or a chip changes and dimmed
   again after a press, as the page's main buttons are. The tick follows the server: ticked
   while a part is on with words in it; Save turns a part on when its box holds words and off
   when it is blank; unticking turns both parts off at once and keeps their texts and venues,
   so ticking it again brings them back. A part with words and no venue, on an account that
   posts to one venue, gets that venue chosen.4. **Server.** Only for an account that signed in by key: Server address, Key, **Save and
   check**, its status line. An email account has no Server part.
5. **This phone.** Dark / Light / Sync with device, three option chips with no label over
   them, and **Install on the home screen**, the press-me pill, where the app is not
   installed; where it is, the chosen chip with its check, "Installed on home screen"
   (Michal, 2026-10-31). "Show photos" is an inventory setting and stays at the top of the
   Inventory fold (Michal, 2026-10-26).

**Inventory.** The fold's heading carries the count once the list is in, "▸ Inventory (99)"
("Inventory (200+)" at the limit, the number grey and the word's size; Michal, 2026-10-31); the line under it says only what the
count cannot ("No listings match.", the newest-200 note, the server's trouble); **▸ Filters**,
folded at first (the search box first, then the venue chips, status chips including
Archived, sort chips, Show photos; no tip under the status chips: a row swiped off while it is live on a
venue makes the undo bar ask, "Archived <title>. Still live on ebay: end it there?" with
**End listing** beside **Undo**, for 15 s (Michal, 2026-10-31); the count after "Inventory" small and muted, as the line
under it said it before; every checkbox row on the page the box and its words on the smoke
grey with no outline, Michal 2026-10-31; Michal, 2026-10-31: "move the search to Options. so it
is hidden at first. and change Options to 'Filters'"); the list, with swipe to archive and **Undo**; a row's + and − change the price on the tile at once, nothing shut or grey, the price going quietly to the inventory 1.5 s after the last tap (at once when a sync or the listing's page needs it), and no venue hears of it before a sync (Michal, 2026-10-31); the badge of each venue the row
is live on dims from the tap and stays dim until its sync is done: green is in sync. A row opens the
listing's page: "← Back to inventory" above the grey card, on the page's ground (as the
People page's "← Back to settings"; Michal, 2026-10-31), the heading and photos, **▾ customize** with
Quantity, Pickup only, the Price slider and **Save** (no Sync: the sync buttons live only in
each venue's block under Settings, Venues, Michal 2026-10-31), then one card per venue with
its status and actions (post, open, refresh, end, edit, add the venue; no Sync to <venue>),
the same set for every venue that offers them. A save, an edit or a photo that leaves a
listing behind says where its sync is ("saved; Sync to ebay in Settings, Venues puts it on
the listing"). A list row's listed badge still wears the sync-to half while its listing is
behind and pushes that row when tapped.

**Feedback.** The admin's inbox with a count (admin only); the Feedback box, "Include my
last job", **Send**, "Thanks, sent."

**Stats** (admin only). 7d / 30d / all chips, the table, the note.

### 4.6 About and privacy

The mark; "← Back to Snap"; what Snap is, naming venues only as examples; Privacy (what the
server keeps, Stripe, and that an account is deleted from Settings); Terms (three free
postings, then prepaid); the version.

## 5. Who sees what

| | Admin (key) | Owner by email | Member by email | New account, no eBay yet |
|---|---|---|---|---|
| Top bar name | michal | the account's name | the account's name | the account's name |
| Posting screens | yes | yes | yes | no, the two steps |
| Book screen | live | milky, asks in Feedback | milky, asks in Feedback | not shown |
| Venue buttons | all live | ebay live, others grey | as the owner | ebay says connect first |
| Settings, Account | card, no postings count, no Delete; people and devices | card, postings, Buy, Delete; people and devices | card, postings; own devices; Leave this account | card, postings; people and devices; Delete |
| Settings, Venues | all three with sync | ebay with sync, others "not available" | as the owner | ebay "Connect eBay to start posting" |
| Settings, Posting | yes | yes | yes | yes |
| Settings, Server | yes | no | no | no |
| Settings, This phone | yes | yes | yes | yes |
| Inventory | yes | yes | yes | yes, empty |
| Feedback | box and inbox | box | box | box |
| Stats | yes | no | no | no |
| About | yes | yes | yes | yes |

A family member who still has a key (today: one shared key on two phones) is the same as
the admin's or owner's column until moved to a member by email, which is the plan.

States that change any screen: **no server set** (Admin opens on Server, the venue hint
says to set it); **server off / offline** (the banner, photos wait, the buttons hold);
**wrong key** (the red word, Admin opens on Server); **a job running** (the item's
controls disabled, the row edits refused with the server's words); **an expired session**
(the landing's line, the card reads "signed out" with "Sign in again").

## 6. Decisions (asked 2026-10-22, decided 2026-10-26, Michal's)

1. **Decided:** the sync buttons live in each venue's block; the sticky bar is gone.
2. **Decided:** "Save as default" leaves the customize box; the defaults live in Settings,
   Posting defaults, and the box on an item starts from them.
3. **Decided:** header and footer under Posting defaults, with a pill per venue.
4. **Decided:** the admin's card shows no Delete account.
5. **Decided:** the wording changes: "Pickup only, no shipping"; "Compare with marketplace
   listings"; the landing names no venue; cancel notes say "postings"; About says an
   account is deleted from Settings.
6. **Decided:** both ways to close Admin stay (the top bar's "Snap" and the bottom "Close").
7. **Decided (2026-10-31):** two looks for two meanings: yellow and black is an action, an
   option is a bordered chip, the chosen one white with a check (rule 7).
8. **Decided (2026-10-31):** the sync buttons live only in each venue's block under
   Settings, Venues; the listing page has none.

## 7. Changes to this document

- 2026-10-22: first draft, from the audit of v2.24.2 and the Settings mock.
- 2026-10-25: Inventory before Settings, no Admin title, Sign out bottom right beside
  Delete account, the five parts of Settings as folds; the account made at the first code;
  people on an account and devices with sign-out (Michal's decisions of the day).
- 2026-10-26: section 6 decided; built in v2.25.0 (the Settings lane). Where the build
  settled what the text left open: no reason line under the sync buttons where the status
  line already says why; eBay's Connect eBay pill only while it is not connected (the
  status line says "Connected as …" after); Inventory and Feedback shown to a new account
  (4.3 and section 5 over the older line in 4.5); Sign out all other devices only while
  there is another device; the Posting defaults kept on the phone until the server keeps
  them.
- 2026-10-31: Michal's 26 comments on the mock (2026-10-26 to 2026-10-31), built in the
  minor after v2.25.0: two looks, two meanings (rule 7: `.pill-ink` an action, `.chip.option`
  an option, the chosen white with a check); Buy postings for every counted account; Add
  account indented; the People page's cards bordered; Venues as a row of option chips, one
  block at a time, eBay's first; the sync buttons only in the venue blocks (decision 8),
  black on green with the page's half-arrows after the words, shown once the venue is
  connected or signed in; the ship-from address with no card, one line split at the
  commas, Save address and the tick on one row; Posting defaults as one muted line,
  Quantity beside the slider, five one-line options, the fifth Add standard text to posts
  with its card (Header and Footer, venue chips, Save for upcoming postings and Apply to
  existing postings); This phone's Install as press-me, or the chosen chip once installed.
  Where the build settled what the mock left open: the tick of Add standard text to posts
  follows a part that is on with words (a part off with words kept is unticked), and
  unticking sends both parts off at once (the card and its buttons go with the tick);
  Apply to existing postings saves first, then pushes each venue a part goes on; the
  inventory list's sync badge stays (only the listing page lost its Sync buttons); the
  option look is the Settings chips' (the inventory's filter, sort and Stats chips keep
  theirs); Poshmark's address line keeps its capital ("Poshmark does not use a ship-from
  address.", the vocabulary's sentence form).
