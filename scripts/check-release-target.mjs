#!/usr/bin/env node
// check-release-target.mjs — refuse a release that is pointed at the wrong address.
//
// One working copy now has TWO remotes serving TWO addresses:
//   origin  -> Volksswitch/bts-web-app                 -> bts.volksswitch.org   (the new home)
//   legacy  -> Volksswitch/bliss-tactile-symbols-web   -> volksswitch.github.io/... (retiring)
//
// They must NOT be interchangeable. The retiring app keeps its GREEN icons and
// teal title bar; black means "served from volksswitch.org", and that distinction
// is what stops a user confusing two identically-named installed apps during the
// migration. Deploying either app's content to the other's address destroys it.
//
// The trigger phrases make this easy to get wrong: "bump OLD bts web app"
// CONTAINS "bump bts web app", so skimming for the familiar phrase inside the
// longer one picks the wrong target. "Read carefully" is not a control -- this is.
//
//   node scripts/check-release-target.mjs new     # about to push to origin
//   node scripts/check-release-target.mjs old     # about to push to legacy
//
// Exits non-zero and explains itself if the working tree does not match.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = (process.argv[2] || '').toLowerCase();
if (!['new', 'old'].includes(target)) {
  console.error('usage: check-release-target.mjs <new|old>');
  process.exit(2);
}

const read = p => readFileSync(join(root, p), 'utf8');
const has  = p => existsSync(join(root, p));
const fails = [];
const check = (ok, what, why) => { if (!ok) fails.push(`${what}\n      ${why}`); };

// --- what each address must look like ---------------------------------------
const EXPECT = {
  new: {
    label: 'the NEW address (bts.volksswitch.org, remote "origin")',
    iconFiles: ['icons/symbols-192.png', 'icons/tiles-192.png', 'icons/tiles-maskable-512.png'],
    forbiddenIcons: ['icons/icon-192.png', 'icons/icon-512.png'],
    theme: '#000000', themeName: 'black',
    repo: 'Volksswitch/bts-web-app',
  },
  old: {
    label: 'the RETIRING address (volksswitch.github.io/bliss-tactile-symbols-web/, remote "legacy")',
    iconFiles: ['icons/icon-192.png', 'icons/icon-512.png'],
    forbiddenIcons: ['icons/symbols-192.png', 'icons/tiles-192.png'],
    theme: '#2b8a80', themeName: 'teal',
    repo: 'Volksswitch/bliss-tactile-symbols-web',
  },
}[target];

for (const f of EXPECT.iconFiles)
  check(has(f), `missing ${f}`, `${EXPECT.label} expects this icon set.`);
for (const f of EXPECT.forbiddenIcons)
  check(!has(f), `${f} must NOT be here`, `That icon belongs to the other address. Black icons mean "served from volksswitch.org".`);

for (const app of ['symbols', 'tiles']) {
  const mf = JSON.parse(read(`${app}/manifest.webmanifest`));
  check(mf.theme_color === EXPECT.theme,
    `${app}: title-bar colour is ${mf.theme_color}, expected ${EXPECT.theme} (${EXPECT.themeName})`,
    'The installed window frame must match the icon.');

  const shell = read(`${app}/index.html`);
  check(shell.includes(`content="${EXPECT.theme}"`),
    `${app}/index.html: theme-color tag is not ${EXPECT.theme}`,
    'The page tag and the manifest must agree.');
  check(shell.includes(EXPECT.repo),
    `${app}/index.html: appRepo is not ${EXPECT.repo}`,
    'Informational only, but wrong here means the wrong tree is checked out.');

  // Every file the offline cache lists must exist, or the worker's install
  // aborts wholesale and the app loses offline mode AND its update path.
  const sw = read(`${app}/sw.js`);
  const shellList = /const SHELL = \[(.*?)\];/s.exec(sw)?.[1] ?? '';
  for (const rel of [...shellList.matchAll(/'([^']+)'/g)].map(m => m[1])) {
    const p = rel === './' ? `${app}/index.html` : join(app, rel);
    check(has(p), `${app}/sw.js caches a file that does not exist: ${rel}`,
      'cache.addAll() rejects wholesale on a single 404 — this would break offline mode and updates.');
  }
}

// The probe belongs at the NEW address; the old app fetches it from there.
check(target === 'new' ? has('migration-probe.json') : true,
  'migration-probe.json is missing', 'The retiring app reads this from the new address to know whether to move anyone.');

// --- report ------------------------------------------------------------------
if (fails.length) {
  console.error(`\n  ✗ REFUSING: this working tree is not what ${EXPECT.label} should hold.\n`);
  fails.forEach((f, i) => console.error(`  ${i + 1}. ${f}\n`));
  console.error('  Nothing has been pushed. Check which release you meant:');
  console.error('  "bump bts web app" = NEW,  "bump OLD bts web app" = RETIRING.\n');
  process.exit(1);
}
console.log(`  ✓ working tree matches ${EXPECT.label}`);
