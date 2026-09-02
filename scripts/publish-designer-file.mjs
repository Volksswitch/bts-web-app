#!/usr/bin/env node
// publish-designer-file.mjs — put an app's PUBLIC designer .scad beside the app,
// and queue the app release that delivers it.
//
//   node scripts/publish-designer-file.mjs symbols
//   node scripts/publish-designer-file.mjs tiles
//
// WHY THIS EXISTS
// ---------------
// Until 1 Sep 2026 each app asked raw.githubusercontent.com which designer
// version was current, and downloaded it from there. School and hospital
// networks block that hostname by name, so a user on such a network could open
// the app — the whole point of moving to bts.volksswitch.org — and never once be
// offered a designer update, silently, because the check no-ops on any error.
//
// Serving the .scad from the app's own address fixes it: it arrives by the route
// that network has already allowed for the app itself.
//
// This reverses a deliberate earlier position — that the .scad releasing
// independently was a feature. Ken, 1 Sep 2026: "This position pales in
// comparison to an SLP not being able to update their software so I'm happy to
// abandon it." See PLAYBOOK-single-origin-companion-updates.md under
// %OneDrive%\4 T-Z\Volksswitch\.
//
// WHAT IT WRITES, all inside <app>/ and all deliberately OUT of that app's sw.js
// SHELL precache list (a precached .scad could never be replaced):
//   <scad_filename>            byte-identical to the published file
//   <scadManifestFile>         the version list, with a RELATIVE scad_url
//   CHANGELOG.md               the user-facing bullet for the release
//   index.html                 regenerated "What's new" notes
//
// The bytes come from GitHub rather than the scad repo's working copy on purpose:
// that copy is pre-bumped one version ahead (same convention as appRelease), so
// it is NOT what users should be handed. The scad repo's published manifest says
// which version is public; this fetches exactly that and refuses anything else.
//
// It stops short of pushing. Ken reads the pending changelog before authorizing a
// release — see RELEASING.md — and one push here deploys BOTH apps, so a publish
// that pushed by itself could ship far more than it was asked to.

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NL = '\n';
const UNRELEASED = '## Unreleased (next release)' + NL;

const app = (process.argv[2] || '').toLowerCase();
if (!['symbols', 'tiles'].includes(app)) {
  console.error('publish-designer-file: name the app — "symbols" or "tiles".');
  process.exit(1);
}

function die(msg) {
  console.error(`${NL}publish-designer-file (${app}): ${msg}`);
  process.exit(1);
}

// The scad repo is a sibling of this project on the Desktop, so it resolves on
// either machine without a hardcoded user path. Override with BTS_SCAD_ROOT.
const SCAD_ROOT = process.env.BTS_SCAD_ROOT || resolve(ROOT, '..', 'bliss-tactile-symbols');
const APP_DIR = join(ROOT, app);

// Which manifest is this app's? Read it from the shell rather than hardcoding,
// so the two stay in lockstep by construction.
const shell = await readFile(join(APP_DIR, 'index.html'), 'utf8');
const manifestFile = shell.match(/scadManifestFile:\s*'([^']+)'/)?.[1];
const designerLabel = shell.match(/designerLabel:\s*'([^']+)'/)?.[1] || 'designer';
if (!manifestFile) die(`cannot find scadManifestFile in ${app}/index.html`);

// 1. What version is PUBLIC? The scad repo's own published manifest is the
//    authority — not its working copy, which leads by one.
let srcManifest;
try {
  srcManifest = JSON.parse(await readFile(join(SCAD_ROOT, manifestFile), 'utf8'));
} catch (e) {
  die(`cannot read the scad repo's published manifest:${NL}  ${join(SCAD_ROOT, manifestFile)}`
    + `${NL}  ${e.message}${NL}  Set BTS_SCAD_ROOT if the scad repo lives elsewhere.`);
}

const version = Number(srcManifest.version);
if (!Number.isFinite(version)) die(`${manifestFile} has no usable "version": ${srcManifest.version}`);

const notes = Array.isArray(srcManifest.notes) ? srcManifest.notes
  : srcManifest.notes ? [String(srcManifest.notes)] : [];
if (!notes.length) {
  die(`${manifestFile} for v${version} carries no user notes.${NL}`
    + `  Those bullets ARE the "What's new" list in the update dialog — a version must never`
    + `${NL}  be advertised without them. Publish the .scad properly first, then retry.`);
}

const scadFilename = srcManifest.scad_filename;
if (!scadFilename) die(`${manifestFile} has no "scad_filename".`);

// 2. Fetch the published bytes and prove they are the version just claimed. A
//    mismatch means the manifest was pushed without the file (or vice versa).
console.log(`Fetching published "${scadFilename}" (expecting v${version})…`);
let scadText;
try {
  const resp = await fetch(srcManifest.scad_url, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  scadText = await resp.text();
} catch (e) {
  die(`could not download the published .scad: ${e.message}`
    + `${NL}  (This needs GitHub reachable — run it from a normal network.)`);
}

const got = Number(scadText.match(/scad_version\s*=\s*(\d+)/)?.[1]);
if (got !== version) {
  die(`the published file declares v${got}, but ${manifestFile} promises v${version}.`
    + `${NL}  Nothing written. Push the matching .scad and manifest together, then retry.`);
}

// 3. Write the file and the version list beside the app. scad_url is RELATIVE so
//    the app downloads from whichever address is serving it; the filename has
//    spaces, so it is encoded exactly as the GitHub URL was.
await writeFile(join(APP_DIR, scadFilename), scadText, 'utf8');
await writeFile(join(APP_DIR, manifestFile), JSON.stringify({
  version,
  scad_filename: scadFilename,
  scad_url: `./${encodeURIComponent(scadFilename)}`,
  notes,
}, null, 2) + NL, 'utf8');

const kb = Math.round(scadText.length / 1024);
console.log(`Wrote ${app}/${scadFilename} (${kb} KB) and ${app}/${manifestFile} for v${version}.`);

// 4. Queue the app release that DELIVERS it. A .scad sitting in the folder
//    reaches nobody: users fetch it only after their app refreshes, and the app
//    refreshes only on a release. So publishing and releasing are one act.
const CHANGELOG = join(APP_DIR, 'CHANGELOG.md');
let changelog = await readFile(CHANGELOG, 'utf8');

// These changelogs are CRLF on disk. Match and write in the file's OWN line
// ending, or the heading is never found and every rewrite would silently
// convert the whole file — a diff of hundreds of lines for a one-line edit.
const EOL = changelog.includes('\r\n') ? '\r\n' : NL;
const HEADING = '## Unreleased (next release)' + EOL;

const bullet = `- **Updated ${designerLabel} file (v${version}).** This update to the web app is `
  + `necessary to support an upgrade to the ${designerLabel}. Open your folder and the app will `
  + `offer you the new file.` + EOL;

if (!changelog.includes(HEADING)) die(`${app}/CHANGELOG.md has no "${HEADING.trim()}" heading.`);

// Only the newest designer version is worth telling a user about; two of these
// bullets in one release would read as two separate updates.
const prior = new RegExp(`^- \\*\\*Updated ${designerLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} file \\(v\\d+\\)\\.\\*\\*[^\\r\\n]*\\r?\\n`, 'gm');
const superseded = changelog.match(prior) || [];
changelog = changelog.replace(prior, '');
if (!changelog.includes(bullet)) changelog = changelog.replace(HEADING, HEADING + EOL + bullet);
changelog = changelog.replace(/(?:\r?\n){3,}/g, EOL + EOL);
await writeFile(CHANGELOG, changelog, 'utf8');
console.log(`Added the changelog entry for v${version}`
  + (superseded.length ? ` (replacing ${superseded.length} for an earlier version).` : '.'));

execFileSync(process.execPath, [join(ROOT, 'scripts', 'apply-release-notes.mjs'), app],
  { cwd: ROOT, stdio: 'inherit' });

const pending = (changelog.split(HEADING)[1] || '').split(/^## /m)[0]
  .split(/\r?\n/).filter(l => l.startsWith('- '));
console.log(`${NL}A ${app} release would ship ${pending.length} change(s):`);
for (const line of pending) {
  console.log(`  - ${line.match(/^- \*\*(.+?)\*\*/)?.[1] ?? line.slice(2, 80)}`);
}
console.log(`${NL}Nothing has reached users yet. Say "bump ${app === 'symbols' ? 'bts' : 'btp'} web app"`);
console.log(`to release, which refreshes that app and lets it offer the new ${designerLabel}.`);
