#!/usr/bin/env node
// publish-app-version.mjs — regenerate an app's latest_app_version.json from its
// shell's appRelease. Usage: node scripts/publish-app-version.mjs <symbols|tiles>
//
// RELEASE-TIME ONLY. appRelease is pre-bumped on the dev copy (one ahead of
// public), so this manifest — exactly like the app's sw.js CACHE_NAME — must move
// only when you actually release. Run it during that app's release ritual, when
// its appRelease already equals the version being deployed. Publishing it mid
// dev-cycle would advertise a release that isn't live and bounce users through a
// refresh loop (the in-app guard stops the loop, but they'd be stuck on the old
// build). Existing `notes` are preserved so a hand-written summary survives re-runs.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));      // web-app repo root
const app = process.argv[2];
if (!app || !['symbols', 'tiles'].includes(app)) {
  console.error('Usage: node scripts/publish-app-version.mjs <symbols|tiles>');
  process.exit(1);
}

const indexPath = join(root, app, 'index.html');
const swPath    = join(root, app, 'sw.js');
const outPath   = join(root, app, 'latest_app_version.json');
if (!existsSync(indexPath)) { console.error(`ERROR: ${indexPath} not found`); process.exit(1); }

const html = readFileSync(indexPath, 'utf8');
const m = html.match(/appRelease\s*:\s*(\d+)/);
if (!m) { console.error(`ERROR: appRelease not found in ${app}/index.html`); process.exit(1); }
const appRelease = parseInt(m[1], 10);

// Surface CACHE_NAME so the operator can confirm the release actually moved it.
let cacheName = '(not found)';
try {
  const c = readFileSync(swPath, 'utf8').match(/CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
  if (c) cacheName = c[1];
} catch { /* sw.js unreadable — leave placeholder */ }

let notes = `Latest published ${app === 'tiles' ? 'Bliss Tiles and Puzzles' : 'Bliss Tactile Symbols'} web app.`;
try {
  const prev = JSON.parse(readFileSync(outPath, 'utf8'));
  if (prev && typeof prev.notes === 'string' && prev.notes.trim()) notes = prev.notes;
} catch { /* no prior file — use the default */ }

const manifest = { app_release: appRelease, notes };
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${outPath}\n`);
console.log(JSON.stringify(manifest, null, 2));
console.log(`\n⚠ RELEASE-TIME ONLY — wrote app_release=${appRelease} (${app} appRelease on this branch).`);
console.log(`   ${app}/sw.js CACHE_NAME is "${cacheName}". Only commit this when ${appRelease}`);
console.log(`   is the ${app} release you are deploying. Do NOT run/commit it mid dev-cycle.`);
