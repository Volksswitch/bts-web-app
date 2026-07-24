#!/usr/bin/env node
// apply-release-notes.mjs — regenerate each app's bundled release notes from its
// own CHANGELOG.md. Trigger phrase: "apply release notes".
//
// The engine (shared/bts-core.js) reads its notes from APP_CONFIG.releaseNotes,
// which each thin shell (symbols/index.html, tiles/index.html) supplies. This
// script parses <app>/CHANGELOG.md and injects a
// `window.APP_CONFIG.releaseNotes = {…}` object (keyed by release number) between
// the @@RELEASE_NOTES_START@@ / _END@@ markers in <app>/index.html, so the in-app
// "What's new" notice after a silent auto-update works offline (notes are BUNDLED,
// not fetched). By default it does both apps; pass names to limit (e.g. `symbols`).
//
// Mapping:
//   "## Release N"                → key N        (a shipped release)
//   "## Unreleased (next release)" → key appRelease  (so a dev build can preview
//                                                     the pending notes)
// Bullets are every "- …" line under a heading (### subheads are flattened);
// markdown emphasis (**bold**, `code`) is stripped to plain text since the modal
// renders with textContent. Italic-only placeholders (_Nothing yet._) are skipped.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));   // web-app repo root
const START = '// @@RELEASE_NOTES_START@@';
const END = '// @@RELEASE_NOTES_END@@';

// Which apps to process (subfolder names). Optional CLI args limit the set.
const ALL_APPS = ['symbols', 'tiles'];
const apps = process.argv.length > 2 ? process.argv.slice(2) : ALL_APPS;

// Strip markdown emphasis to plain text (the modal renders with textContent).
// Protect backslash-escaped punctuation (e.g. "STL\*") so it survives as a
// literal, using private-use sentinels that can't appear in the source.
const SH_STAR = '', SH_TICK = '';
const clean = (s) => s
  .replace(/\\\*/g, SH_STAR).replace(/\\`/g, SH_TICK)   // shield escaped * and `
  .replace(/\*\*(.*?)\*\*/g, '$1')                      // **bold**
  .replace(/\*(.*?)\*/g, '$1')                          // *italic*
  .replace(/`/g, '')                                    // `code`
  .replace(new RegExp(SH_STAR, 'g'), '*')               // restore literals
  .replace(new RegExp(SH_TICK, 'g'), '`')
  .trim();

function parseChangelog(text, appRelease) {
  const notes = {};                 // { releaseNumber: [bullet, …] }
  let key = null;                   // current release number, or null to ignore
  let lastArr = null;               // array we're appending bullets to (for wrapping)
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    let m;
    if ((m = line.match(/^##\s+Release\s+(\d+)/i))) {
      key = parseInt(m[1], 10); notes[key] = notes[key] || []; lastArr = notes[key];
      delete lastArr.__skip; continue;   // a real release heading — clear any stale placeholder flag
    }
    if (/^##\s+Unreleased\b/i.test(line)) {
      key = appRelease; notes[key] = notes[key] || []; lastArr = notes[key];
      delete lastArr.__skip; continue;
    }
    if (/^##\s+/.test(line)) { key = null; lastArr = null; continue; }   // some other H2 → ignore
    if (/^###\s+/.test(line)) continue;                                  // subheader → keep current key
    if (key == null) continue;

    const bullet = line.match(/^\s*-\s+(.*)$/);
    if (bullet) {
      const text = clean(bullet[1]);
      if (text && !/^_.*_$/.test(text)) lastArr.push(text);   // skip _Nothing yet._ / _In development._
      else lastArr.__skip = true;                              // remember placeholder so wraps don't attach
    } else if (line.trim() && lastArr && lastArr.length && !lastArr.__skip) {
      lastArr[lastArr.length - 1] += ' ' + clean(line);        // wrapped continuation of previous bullet
    }
  }
  for (const k of Object.keys(notes)) {           // drop empty keys (placeholder-only headings)
    delete notes[k].__skip;
    if (!notes[k].length) delete notes[k];
  }
  return notes;
}

const reBlock = new RegExp(
  `${START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
);

let failed = false;
for (const app of apps) {
  const indexPath = join(root, app, 'index.html');
  const changelogPath = join(root, app, 'CHANGELOG.md');
  if (!existsSync(indexPath) || !existsSync(changelogPath)) {
    console.error(`SKIP ${app}: missing ${existsSync(indexPath) ? 'CHANGELOG.md' : 'index.html'}`);
    failed = true; continue;
  }
  const html = readFileSync(indexPath, 'utf8');
  const relMatch = html.match(/appRelease\s*:\s*(\d+)/);
  if (!relMatch) { console.error(`SKIP ${app}: appRelease not found in index.html`); failed = true; continue; }
  if (!html.includes(START) || !html.includes(END)) {
    console.error(`SKIP ${app}: RELEASE_NOTES markers not found in index.html`); failed = true; continue;
  }
  const appRelease = parseInt(relMatch[1], 10);
  const notes = parseChangelog(readFileSync(changelogPath, 'utf8'), appRelease);
  const body = `window.APP_CONFIG.releaseNotes = ${JSON.stringify(notes, null, 2)};`;
  writeFileSync(indexPath, html.replace(reBlock, `${START}\n  ${body}\n  ${END}`));
  const keys = Object.keys(notes).map(Number).sort((a, b) => b - a);
  console.log(`${app}: wrote ${keys.length} release(s) [${keys.join(', ')}] (appRelease=${appRelease}).`);
}
process.exit(failed ? 1 : 0);
