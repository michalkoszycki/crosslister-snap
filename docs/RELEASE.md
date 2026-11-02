# Before a release

The steps, in order, before a version goes to the phone (GitHub Pages).

1. **Translation pass.** Run `node tools/i18n-check.mjs` (or `npm run i18n`). Translate every
   MISSING line for `zh` (`lang/zh.js`) and `es` (`lang/es.js`); remove every UNUSED one; fix any
   BROKEN one (its `{placeholders}` must be the English key's). New text is written in English
   only and waits for this pass, showing in English until then (Michal, 2026-11-02: "that change
   is always pending before final release"; docs/UI.md rule 8). The checker never fails: this
   step is the one place the pending lines get done.
2. **Tests.** `node --test`, all green.
3. **docs/UI.md current.** What the screens show matches section 4, and section 7 has a line
   for what changed.
4. **Version.** Edit `VERSION` in `version.js`, then run `node tools/bump-version.mjs`, which
   rewrites every `?v=` to match (a test fails if one drifts).
5. **Commit and push.** The page is live once GitHub Pages has built it; its version shows in
   small print at the foot of the page.
