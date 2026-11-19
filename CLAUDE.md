# CLAUDE.md: Snap, the phone page

Auto-loaded orientation for every agent session in this repo. The spec is `docs/UI.md`
(read its header and rules first); the server it talks to is `../crosslister`, whose
`AGENT.md` holds the full multi-agent workflow this file applies here.

## Other sessions work on this repo at the same time

Michal runs several Claude sessions side by side (2026-11-19: "note that there are other
agents working on the same projects"). On 2026-11-02 one session built the language picker
while another built the comment rounds. They met in `main` and in the mock artifact. It went
well because each kept to these rules:

1. **One task, one worktree, one branch.** Before any edit:
   `git worktree add ..\crosslister-snap-<task> -b feature/<task>` from the main checkout,
   then work only there. The main checkout `crosslister-snap` is integration-only: reading,
   merging finished branches, the version bump, the push.
2. **Absolute paths.** A relative path in a script, or a .NET call such as `[IO.File]`,
   resolves against the process's directory, which is often the main checkout. Pass full
   paths into your worktree.
3. **Integrate one branch at a time:**
   1. In the main checkout, `git fetch` and `git pull --ff-only` (another session may have
      pushed).
   2. `git merge --no-ff feature/<task>`.
   3. `node --test` must be green and `node tools/i18n-check.mjs` clean.
   4. Bump the version: `version.js`, then `node tools/bump-version.mjs`.
   5. Commit, push (GitHub Pages deploys `main`).
   6. Remove the worktree and delete the branch.
4. **Translations are part of every closeout** (Michal, 2026-11-04). Every new or changed
   page text gets its lines in every `lang/*.js`. i18n-check must report 0 missing, unused
   and broken for each language before a push.
5. **The mock artifact is shared.** "Snap as it is"
   (https://claude.ai/artifact/CrL2bMb7uBW1W9LHmrCQ1n) is the real page on a fake server,
   built from `../crosslister-data/snap-mock/src` with `node build.mjs [<worktree>]`.
   - Read the live version before republishing, and merge what it holds.
   - Never publish over another session's preview without asking Michal. Say in chat when
     your lane republishes it.
6. **Line endings.** The files are CRLF. Never mix LF into them. `tests/page.test.js` is
   stored with CRLF in git: stage it with `git -c core.autocrlf=false add tests/page.test.js`.
7. **Server changes** belong in `../crosslister`, through its own `new-agent-worktree.ps1`
   and gate (`scripts/check.ps1`). The page treats an older server's 404 or 400 as "not
   available" and keeps working; build the page against the server contract, not the
   other way round.
8. **Subagents.** A conductor session may hand a lane to an `Agent` subagent with the
   worktree, the files, the contract and these rules spelled out. The subagent commits on
   its branch and reports; the conductor merges.
