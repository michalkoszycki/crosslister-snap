// version.js -- the one place the app's version lives.
//
// Why this exists: GitHub Pages serves every file with a ten-minute cache, so a
// fix pushed now can reach the phone ten minutes late, and worse, in pieces --
// a new index.html next to a stale app.js. Every file the page loads therefore
// carries "?v=<VERSION>" in its URL: a new version means a new URL, and a new
// URL is never in the cache.
//
// That includes the ES module imports inside the app (`./core.js?v=1.1.0`),
// which the browser and Node both accept as ordinary relative specifiers.
//
// Bumping: change VERSION here, then run
//     node tools/bump-version.mjs
// which rewrites every "?v=..." in the repo to match. A test fails if any of
// them drift apart.
export const VERSION = "1.1.0";
