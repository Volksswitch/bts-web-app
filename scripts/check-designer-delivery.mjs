#!/usr/bin/env node
// check-designer-delivery.mjs — is each app actually serving the designer .scad
// that has been published? Trigger phrase: "check designer delivery".
//
// WHY
// ---
// Since 1 Sep 2026 each app serves its designer .scad from its own address, so a
// user on a network that blocks GitHub can still receive it. The cost is that a
// published .scad reaches nobody until the WEB APP is released — the delivery is
// a second step, and a second step can be forgotten.
//
// Unlike the keyguard, this cannot be one command: the .scad release ritual has a
// step only Ken can do (rebuilding the website ZIP), so the chain is deliberately
// broken in the middle. That makes a drift check worth more here, not less.
//
// It compares three numbers per app and says plainly which is behind:
//   published   what the scad repo's manifest advertises
//   bundled     what sits beside the app in this working copy
//   live        what bts.volksswitch.org is actually serving  (--live only)
//
//   node scripts/check-designer-delivery.mjs           local check, no network
//   node scripts/check-designer-delivery.mjs --live    also ask the live site
//
// Exit 0 = everything delivered. Exit 1 = something published is not yet reaching
// users. Never fails merely because the live site lags a moment behind a push.

import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCAD_ROOT = process.env.BTS_SCAD_ROOT || resolve(ROOT, '..', 'bliss-tactile-symbols');
const LIVE_BASE = 'https://bts.volksswitch.org';
const NL = '\n';
const live = process.argv.includes('--live');

const readJson = async p => JSON.parse(await readFile(p, 'utf8'));
let behind = 0;

console.log(`Designer delivery${live ? ' (including the live site)' : ''}:${NL}`);

for (const app of ['symbols', 'tiles']) {
  const shell = await readFile(join(ROOT, app, 'index.html'), 'utf8');
  const manifestFile = shell.match(/scadManifestFile:\s*'([^']+)'/)?.[1];
  const label = shell.match(/designerLabel:\s*'([^']+)'/)?.[1] || 'designer';
  if (!manifestFile) { console.error(`  ${app}: cannot find scadManifestFile in its shell.`); behind++; continue; }

  let published = null, bundled = null, liveVer = null;
  try { published = Number((await readJson(join(SCAD_ROOT, manifestFile))).version); }
  catch { console.error(`  ${app}: cannot read the scad repo's ${manifestFile}. Set BTS_SCAD_ROOT?`); behind++; continue; }
  try { bundled = Number((await readJson(join(ROOT, app, manifestFile))).version); }
  catch { bundled = null; }

  // "Not deployed yet" and "the network failed" are different answers, and this
  // whole exercise exists because one was allowed to look like the other.
  let liveState = 'not checked';
  if (live) {
    try {
      const r = await fetch(`${LIVE_BASE}/${app}/${manifestFile}?t=${Date.now()}`, { cache: 'no-store' });
      if (r.ok) { liveVer = Number((await r.json()).version); liveState = 'v' + liveVer; }
      else if (r.status === 404) liveState = 'not deployed';
      else liveState = `HTTP ${r.status}`;
    } catch (e) { liveState = `unreachable (${e.message})`; }
  }

  const parts = [`published v${published}`, `bundled ${bundled == null ? 'MISSING' : 'v' + bundled}`];
  if (live) parts.push(`live ${liveState}`);
  console.log(`  ${app.padEnd(8)} ${parts.join('   ')}`);

  if (bundled == null) {
    console.log(`           ⚠ nothing beside the app — run "publish the designer file" for ${app}.`);
    behind++;
  } else if (bundled < published) {
    console.log(`           ⚠ ${label} v${published} is published but not bundled — `
      + `run "publish the designer file" for ${app}, then release that app.`);
    behind++;
  } else if (live && liveVer != null && liveVer < bundled) {
    console.log(`           ⚠ bundled v${bundled} has not been released — say `
      + `"bump ${app === 'symbols' ? 'bts' : 'btp'} web app". Users still get v${liveVer}.`);
    behind++;
  } else if (live && liveState === 'not deployed') {
    console.log(`           ⚠ the live site serves no ${label} file yet — this app has not been `
      + `released since the change. Say "bump ${app === 'symbols' ? 'bts' : 'btp'} web app".`);
    behind++;
  }
}

if (behind) {
  console.error(`${NL}${behind} designer version(s) are published but not reaching users.`);
  process.exit(1);
}
console.log(`${NL}Everything published is bundled${live ? ' and served' : ''}.`);
