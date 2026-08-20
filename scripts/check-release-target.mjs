#!/usr/bin/env node
// check-release-target.mjs — refuse a release that is pointed at the wrong address.
//
// There is now ONE remote and ONE address:
//   origin  -> Volksswitch/bts-web-app  -> bts.volksswitch.org
//
// It used to be two. The retiring address (Volksswitch/bliss-tactile-symbols-web,
// served at volksswitch.github.io/...) was DELETED on 20 Aug 2026 once the move was
// complete and its only user -- Ken -- had crossed. The 'old' target and the "bump
// OLD ..." trigger phrases went with it. Asking for 'old' is now refused with an
// explanation rather than quietly failing at the push.
//
// What survives is the icon check. Black icons mean "served from volksswitch.org";
// the retiring app's GREEN icon files must never reappear in this tree, because
// their presence means the wrong branch is checked out -- `legacy-main` still holds
// the retired app locally.
//
//   node scripts/check-release-target.mjs        # about to push to origin
//   node scripts/check-release-target.mjs new    # the same thing, spelled out
//
// Exits non-zero and explains itself if the working tree does not match.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = (process.argv[2] || 'new').toLowerCase();
if (target === 'old') {
  console.error('');
  console.error('  ✗ There is no "old" release target any more.');
  console.error('');
  console.error('  The retiring address (Volksswitch/bliss-tactile-symbols-web) was deleted');
  console.error('  on 20 Aug 2026 -- the move to bts.volksswitch.org is finished and its only');
  console.error('  user had already crossed. The "bump OLD ..." phrases are retired with it.');
  console.error('  The retired app itself survives on the local branch `legacy-main`.');
  console.error('');
  process.exit(2);
}
if (target !== 'new') {
  console.error('usage: check-release-target.mjs [new]');
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

// The migration is over (18 Aug 2026) and its code — including the readiness
// probe the retiring app used to fetch from the new address — has been removed
// from both apps. This guard used to require `migration-probe.json` at the NEW
// address and so refused every release the moment that file was deleted: correct
// code, wrong moment, which is exactly how it failed at the go-live push (see
// ORIGIN-MIGRATION-STATE.md §22). A guard must know every legitimate state of
// the world, including the terminal one, or it teaches you to override it.
check(!has('migration-probe.json'),
  'migration-probe.json is back',
  'The migration is finished and its code is gone from both apps. Nothing should be arming a move.');

// --- report ------------------------------------------------------------------
if (fails.length) {
  console.error(`\n  ✗ REFUSING: this working tree is not what ${EXPECT.label} should hold.\n`);
  fails.forEach((f, i) => console.error(`  ${i + 1}. ${f}\n`));
  console.error('  Nothing has been pushed. Check what is in the working tree —');
  console.error('  a green icon here means the retired branch is checked out.\n');
  process.exit(1);
}
console.log(`  ✓ working tree matches ${EXPECT.label}`);
