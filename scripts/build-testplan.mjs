#!/usr/bin/env node
// build-testplan.mjs — generates BTS-MIGRATION-TEST-PLAN.docx.
//
// THE DOCUMENT IS AN OUTPUT. Never hand-edit the .docx — edit this file and
// rebuild, or the next rebuild silently discards the change.
//
// It lives here, in the repo, so the plan has real version history: it was
// previously written in a scratchpad and the .docx overwritten on each build,
// which meant there was no way to diff one revision against the last (Ken asked
// for exactly that on 16 Aug 2026 and it could not be produced).
//
// Output defaults beside the other migration documents in OneDrive; pass a path
// to override.
//
//   node scripts/build-testplan.mjs
//   node scripts/build-testplan.mjs some/other/path.docx
//
// Needs the `docx` npm package, which is installed GLOBALLY on this machine and
// is not resolvable from here by default.
//
// ⚠ Setting process.env.NODE_PATH at runtime does NOT work — Node reads NODE_PATH
// once at process start, so assigning it inside the script is too late and the
// require below fails with MODULE_NOT_FOUND. It was written that way and did not
// run at all (found 17 Aug 2026). Resolve the global folder explicitly instead,
// while still preferring a local install if one ever appears.

import { createRequire } from 'node:module';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
function loadDocx(){
  try { return require('docx'); } catch {}
  const globalAnchor = join(process.env.APPDATA || '', 'npm', 'node_modules', 'anchor.js');
  try { return createRequire(globalAnchor)('docx'); } catch {}
  console.error('\n  ✗ The docx package is not installed.  Run: npm install -g docx\n');
  process.exit(1);
}

const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  PageOrientation, LevelFormat, PageBreak,
} = loadDocx();
const fs = require('fs');

const OUT_DEFAULT = join(process.env.OneDrive || '', '4 T-Z', 'Volksswitch', 'BTS-MIGRATION-TEST-PLAN.docx');

const W = 9360;                       // Letter minus 1" margins each side
const HDR = 'D9D9D9', ALT = 'F2F2F2', WARN = 'FFF2CC', OK = 'E2EFDA', BAD = 'FCE4E4';

const P = (text, opts = {}) => new Paragraph({
  spacing: { after: opts.after ?? 120, before: opts.before ?? 0 },
  alignment: opts.align,
  children: [new TextRun({ text, bold: opts.bold, italics: opts.italics,
                           size: opts.size ?? 20, color: opts.color, font: opts.font })],
});
const H = (text, level) => new Paragraph({
  text, heading: level, spacing: { before: 260, after: 130 },
});
const bullet = (text, opts = {}) => new Paragraph({
  numbering: { reference: 'bul', level: opts.level ?? 0 },
  spacing: { after: 70 },
  children: [new TextRun({ text, size: 20, bold: opts.bold, italics: opts.italics })],
});

function cell(text, w, o = {}) {
  const runs = Array.isArray(text) ? text : [{ t: text }];
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({
      spacing: { after: 0 },
      alignment: o.align,
      children: runs.map(r => new TextRun({
        text: r.t, bold: r.bold ?? o.bold, italics: r.italics ?? o.italics,
        size: o.size ?? 18, color: r.color, break: r.break,
      })),
    })],
  });
}

function table(cols, rows, opts = {}) {
  const head = new TableRow({
    tableHeader: true,
    children: cols.map((c, i) => cell(c.h, c.w, { fill: HDR, bold: true })),
  });
  const body = rows.map((r, ri) => new TableRow({
    children: r.map((c, i) => {
      const isObj = c && typeof c === 'object' && !Array.isArray(c);
      const txt = isObj ? c.t : c;
      const fill = isObj && c.fill ? c.fill : (opts.zebra && ri % 2 ? ALT : undefined);
      return cell(txt, cols[i].w, { fill, align: cols[i].align, bold: isObj ? c.bold : false });
    }),
  }));
  return new Table({
    columnWidths: cols.map(c => c.w),
    width: { size: W, type: WidthType.DXA },
    rows: [head, ...body],
  });
}

// ---- test-case table helper -------------------------------------------------
const TC = [
  { h: 'ID',    w: 640 },
  { h: 'Who / what they do', w: 2560 },
  { h: 'What should happen — including SETTINGS', w: 3160 },
  { h: 'What actually happened', w: 2240 },
  { h: 'OK?', w: 760, align: AlignmentType.CENTER },
];
// A 4th element renders as a bold "WATCH OUT" line under the expectation — for
// steps that are easy to invalidate by accident, or where a correct result looks
// like a failure.
const tc = rows => table(TC, rows.map(r => [
  { t: r[0], bold: true }, r[1],
  r[3] ? [{ t: r[2] }, { t: '⚠ WATCH OUT — ' + r[3], bold: true, break: 1 }] : r[2],
  '', { t: '☐', align: AlignmentType.CENTER },
]), { zebra: true });

const doc = new Document({
  numbering: {
    config: [{
      reference: 'bul',
      levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 200 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 200 } } } },
      ],
    }],
  },
  styles: {
    default: { document: { run: { font: 'Calibri', size: 20 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 30, bold: true, color: '1F3864' },
        paragraph: { spacing: { before: 320, after: 140 } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, color: '2E5496' },
        paragraph: { spacing: { before: 260, after: 110 } } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 21, bold: true, color: '333333' },
        paragraph: { spacing: { before: 200, after: 90 } } },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1440, right: 1440 } } },
    children: [

// ============================================================ TITLE
new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: 'Origin Migration — Test Plan', bold: true, size: 40, color: '1F3864' })] }),
new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Bliss Tactile Symbols & Bliss Tiles and Puzzles', size: 26, color: '2E5496' })] }),
new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: 'The rehearsal for the Keyguard Designer migration  ·  16 August 2026', size: 19, italics: true, color: '666666' })] }),

new Table({
  columnWidths: [W],
  width: { size: W, type: WidthType.DXA },
  rows: [new TableRow({ children: [cell([
    { t: 'THIS RUN IS FINISHED. Do not execute it against Bliss Tactile Symbols again.', bold: true },
    { t: ' The BTS/BTP migration completed on 17 August 2026: the old address no longer serves the app, so steps 1 to 4 cannot run there and would only confuse. This document is retained as the TEMPLATE for the Keyguard Designer migration — read section 8 first, then adapt. Its findings are recorded in ORIGIN-MIGRATION-STATE.md, sections 20 to 23.', break: 1 },
  ], W, { fill: WARN })] })],
}),

P('This is the one realistic rehearsal we get. The Keyguard Designer is the migration that matters — real clinicians, settings they tuned over months, and the blocked-school problem that started all of this. Bliss Tactile Symbols and Bliss Tiles and Puzzles are the same architecture with only Ken as a user, so every scenario can be walked through deliberately and the surprises found here instead of there.', { after: 160 }),

new Table({
  columnWidths: [W],
  width: { size: W, type: WidthType.DXA },
  rows: [new TableRow({ children: [cell([
    { t: 'The single most important rule: ', bold: true },
    { t: 'every test records what we EXPECTED to happen to the user’s settings before it is run, and what ACTUALLY happened after. Losing settings has been judged survivable — but that judgement only stays honest if we can see, case by case, whether reality matched the prediction.' },
  ], W, { fill: WARN })] })],
}),

// ============================================================ 1
H('1.  What is built, and what is not', HeadingLevel.HEADING_1),
P('Updated 16 August 2026. Seven of the eight pieces are built and live, and the eighth is built and waiting. Steps 1 to 3 of the testing can begin now.', { after: 120 }),

new Table({
  columnWidths: [W],
  width: { size: W, type: WidthType.DXA },
  rows: [new TableRow({ children: [cell([
    { t: 'Both addresses are live and carry different releases. ', bold: true },
    { t: 'The retiring address is on Symbols 22 / Tiles 13 with GREEN icons. The new address is on Symbols 26 / Tiles 17 with BLACK icons. The colour tells you which one you are looking at — that is what the icon change was for. The move itself is SWITCHED OFF: the retiring app checks a flag at the new address that currently reads “not ready”, so nothing moves anyone until it is deliberately flipped.' },
  ], W, { fill: OK })] })],
}),

P('', { after: 60 }),

table([
  { h: 'Status', w: 900 }, { h: 'Piece', w: 3000 }, { h: 'Notes', w: 5460 },
], [
  [{t:'DONE',bold:true,fill:OK}, 'Migration ability in the OLD app', 'Released to the retiring address as its release 22 / 13, and switched off. It reads a flag at the new address before moving anyone.'],
  [{t:'DONE',bold:true,fill:OK}, 'A real, visible setting in both apps', 'Settings → Preferences now has “Show What’s new after the app updates itself”, on by default. Untick it and you have a visible non-default value to follow through the whole test.'],
  [{t:'DONE',bold:true,fill:OK}, 'Save a backup / restore from a backup', 'Settings → Preferences: “Save my settings…” and “Load saved settings…”. A backup covers BOTH apps at once, so one saved from either restores both.'],
  [{t:'DONE',bold:true,fill:OK}, 'The pre-move notice, with the backup button in it', 'Appears only on the retiring address. “Not now” hides it for that session; only pressing Save stops it for good.'],
  [{t:'DONE',bold:true,fill:OK}, 'Replace the “hard refresh” advice', 'Gone. Settings → Preferences now offers “Reload the app cleanly”, which migrates first if a move is due and only then clears caches.'],
  [{t:'BUILT,\nPARKED',bold:true,fill:WARN}, 'A “we have moved” page for the old address', 'Written and verified end to end against the live new address — it carries settings across, it does not merely point the way. Ships with a retirement script that clears the old app’s offline copy, without which a cached browser would never reach the page. NOT deployed: it replaces the app, so it goes live only at step 7.0, once every earlier step is ticked off.'],
  [{t:'DONE',bold:true,fill:OK}, 'Restore offered on arrival', 'When an address holds no settings at all, the opening screen offers to load a saved file. Someone who arrived and lost everything gets wording that names the loss; everyone else gets a quiet version.'],
  [{t:'DONE',bold:true,fill:OK}, 'Stop the “what you have already read” record from crossing addresses', 'Built into both the move and the restore. §5a explains why; steps 4.1 and 6.6 confirm it.'],
], { zebra: true }),

// ============================================================ 2
H('2.  How people actually get moved', HeadingLevel.HEADING_1),
P('Five stages. Stage 1 is already done. Each later stage is a deliberate decision, taken when you are ready — nothing happens on a timer.', { after: 130 }),

table([
  { h: 'Stage', w: 1180 }, { h: 'What happens', w: 3600 }, { h: 'What a user experiences', w: 4580 },
], [
  [{t:'1  DONE',bold:true,fill:OK}, {t:'The new address goes live alongside the old one. Nothing is redirected.',fill:OK}, {t:'Nothing at all. Their bookmark and installed app work exactly as before. A blocked clinician can now reach the app for the first time.',fill:OK}],
  [{t:'2',bold:true}, 'The warning release ships to the OLD address. Migration is present but NOT yet switched on.', 'They open the app as usual and see a modest notice asking them to save a copy of their settings, with a button right there. It reappears each time until they press it.'],
  [{t:'3',bold:true}, 'Migration is switched on. The old app now moves people across as they open it — one at a time, at their own pace.', 'They open the old app and arrive at the new address with their settings carried over. They are asked to reconnect their folder once. Installed apps keep their own window.'],
  [{t:'4',bold:true}, 'The old address is replaced by a “we have moved” page — which can still carry settings across.', 'Someone who has not opened the app in months finds a page telling them where the app went. Their settings still travel when they click through.'],
  [{t:'5',bold:true}, 'The old repository is deleted.', {t:'Anyone who has still not returned finds nothing. This is the only point at which settings become genuinely unrecoverable.',fill:BAD}],
], { zebra: false }),

P('Rollout stage 4 — the “we have moved” page — is required, not a tidy-up. Some people open these apps a few times a year; without it, they return to a dead address with no signpost and no way for us to reach them.', { before: 120 }),

// ============================================================ 3
H('3.  What changed when we chose two addresses instead of one', HeadingLevel.HEADING_1),
P('The original plan moved everybody at once: the old address would stop serving the app and start bouncing people to the new one, giving the app a single instant to hand over the user’s settings. Most of the ways a user could lose data came from missing that instant.', { after: 120 }),
P('We are not doing that. Both addresses serve normally, and people are moved individually when they next open the app. That retires most of the risk — but the reasoning below is a prediction, and the tests in §6 are what confirm it.', { after: 140 }),

table([
  { h: 'The worry', w: 2760 }, { h: 'Under the old “everyone at once” plan', w: 3200 }, { h: 'Under the plan we are using', w: 3400 },
], [
  ['They hard-refresh at the wrong moment', 'Settings lost. Unavoidable in code.', {t:'No longer applies — nothing is bouncing them, so the app still runs and still carries their settings.',fill:OK}],
  ['They bookmarked a slightly different address', 'A coin flip decided whether they kept their settings.', {t:'No longer applies — every address on the old site still serves the app.',fill:OK}],
  ['Their browser remembers the bounce', 'No undo. That user could never be recovered.', {t:'No longer applies — there is no bounce to remember.',fill:OK}],
  ['The gap while the new address gets its security certificate', 'The app was unusable, and said something misleading about the browser.', {t:'No longer applies — the new address was fully working before anyone was moved.',fill:OK}],
  ['They never open the app before it moves', 'Settings lost, and no way to reach them.', {t:'Deferred, not solved. The “we have moved” page catches them; deleting the repository is the point of no return.',fill:WARN}],
  ['Their installed app still points at the old address', 'Permanent — the icon can never be repointed.', {t:'Still true. This is now the main user-visible wart, and the reason for the reinstall instructions.',fill:WARN}],
], { zebra: false }),

new Paragraph({ children: [new PageBreak()] }),

// ============================================================ 4
H('4.  The testers, and keeping them apart', HeadingLevel.HEADING_1),
P('Browser storage belongs to a browser PROFILE, not to a machine or a person. That single fact decides the whole setup — and getting it wrong quietly destroys most of the testers before you start.', { after: 120 }),

new Table({
  columnWidths: [W],
  width: { size: W, type: WidthType.DXA },
  rows: [new TableRow({ children: [cell([
    { t: 'The trap: an installed app and a browser tab in the SAME profile share one pot of settings. ', bold: true },
    { t: 'So a bookmark kept in the same Chrome as your installed app is not an independent tester at all — when the installed app moves, the bookmark\u2019s settings move with it, and there is nothing left for it to prove. Testers are separated by profile. You do not need extra machines, except for C5.' },
  ], W, { fill: WARN })] })],
}),

P('', { after: 60 }),

table([
  { h: 'ID', w: 520 }, { h: 'Who they represent', w: 2260 }, { h: 'Machine & browser', w: 2280 },
  { h: 'How to set it up', w: 2300 }, { h: 'Record before starting', w: 2000 },
], [
  [{t:'C1',bold:true}, 'Someone with the app installed who uses it regularly — the best case',
   {t:'MACHINE 1 — Chrome.\nInstalled app.',fill:OK}, 'Already exists: your installed Bliss Symbols', 'Release 21. Confirmed 15 Aug.'],
  [{t:'C2',bold:true}, 'A second app on the same address that the user never opens',
   {t:'MACHINE 1 — Chrome,\nSAME profile as C1.\nDeliberate.',fill:OK}, 'Already exists: your installed Bliss Tiles. Leave it closed until step 4.5.', 'Release 12. Confirmed 15 Aug.'],
  [{t:'C3',bold:true}, 'Someone who uses a browser bookmark rather than an installed app',
   {t:'MACHINE 1 — EDGE.\nTab only, never installed.',fill:WARN}, 'Open the retiring address in Edge and bookmark it. A different browser is a completely separate pot of settings, so no extra Chrome profile is needed.', 'Release shown, and the setting’s value'],
  [{t:'C5',bold:true}, 'Someone who used the app, then did not come back for months',
   {t:'MACHINE 2 — Chrome.\nTab only, never installed.',fill:WARN}, 'SET UP AT STEP 3, before step 4.0: open BOTH apps at the retiring address, untick the setting in each, then do not touch this machine again until Step 7.', 'Both releases, and both settings'],
  [{t:'C6',bold:true}, 'A brand-new user who never saw the retiring address',
   {t:'MACHINE 3 — Chrome.\nTab only, never installed.',fill:WARN}, 'Nothing to do until step 4.9. Then go straight to the new address, having never visited the retiring one.', 'Nothing'],
  [{t:'C7',bold:true}, 'Someone who kept a backup and then lost everything',
   {t:'MACHINE 1 — Edge,\nreusing C3.',fill:OK}, 'Becomes C7 at Step 6, once C3 has migrated', 'The backup file, and the setting’s value'],
], { zebra: false }),

H('Why C1 and C2 must NOT be separated', HeadingLevel.HEADING_3),
P('They are the only pair that shares a profile on purpose. Step 4.5 — the one that proves the most — shows that migrating Symbols carries Tiles’ settings across even though Tiles was never opened. That can only be demonstrated if they genuinely share one pot of settings, which is exactly what two apps installed from the same profile do.', { after: 110 }),

H('Why C5 must be USED before it is abandoned', HeadingLevel.HEADING_3),
P('An earlier version of this plan said to leave machine 2 completely untouched. That would have made C5 useless for the one test it exists for: a machine that has never opened the app has no settings, so when it finally arrives at Step 7 there is nothing to carry and “did the We’ve Moved page bring their settings?” cannot be answered. C5 has to be someone who WAS a user and then vanished — so it must be set up, given a changed setting, and only then abandoned.', { after: 110 }),

H('C4 has been dropped', HeadingLevel.HEADING_3),
P('An earlier version of this plan had a tester who bookmarked the front page rather than the app. That existed because, under the original “everyone moves at once” design, the front page was unprotected and such a user lost everything. Nothing bounces anyone in this plan, so the hazard is gone. Its steps are simply gone; everything has been renumbered into one continuous sequence.', { after: 110 }),

H('OneDrive — turn it off for the duration', HeadingLevel.HEADING_3),
P('Your Desktop is inside OneDrive, so a shortcut created by installing an app appears on all three machines within minutes — as a dead launcher for an app that is not installed there, which reads as a fault mid-test. Turning OneDrive off keeps the three desktops genuinely independent.', { after: 110 }),
P('This matters because the tests must be done the way a real person does them: clicking the icon on the desktop. Three of the steps are ABOUT that icon — whether it is green or black, whether an address strip has appeared, whether it still points at the old address. Launching from the Start menu instead would avoid the mess and hollow out the very thing being tested.', { after: 110 }),

new Table({
  columnWidths: [W],
  width: { size: W, type: WidthType.DXA },
  rows: [new TableRow({ children: [cell([
    { t: 'Before turning OneDrive off — do this on machines 2 and 3: ', bold: true },
    { t: 'right-click the Bliss Tactile Symbols folder and choose “Always keep on this device”, and let it finish downloading. The Desktop is a real local folder, but a folder never opened on that machine can be present in name only; freeze sync in that state and the app has nothing to connect to. It cannot get past its opening screen without a connected folder, so C5 would be stuck before it could change anything.' },
  ], W, { fill: WARN })] })],
}),

P('', { after: 60 }),
bullet('Prefer quitting OneDrive to pausing it. The pause menu tops out at 24 hours and then resumes on its own, which could catch you mid-test. Quitting holds until you start it again — though it does come back on reboot.'),
bullet('Before turning it back on, tidy machine 1’s desktop: stray shortcuts from installs and reinstalls, and the old green icons once you are finished with them. Whatever is on that desktop when sync resumes is what lands on the other two.'),
bullet('Not a test artifact: whichever icon you keep at the end will still sync out as a shortcut to an app the other machines do not have. That is how your setup already behaves for any installed app.'),
bullet('While sync is off, nothing written to this plan or the migration notes reaches the other machines. Read them on machine 1.'),
bullet('Do not save a concept, or accept a designer-file update, on two machines while sync is off — those are the only actions that write into the shared folder, and that is how conflict copies appear when it resumes. Nothing here asks you to do either; decline if an update is offered mid-test.'),

H('4a.  Which steps depend on which', HeadingLevel.HEADING_1),
P('Testers are not run in lockstep. Each one follows its own sequence, and only a few steps genuinely depend on another tester having gone first. Those are:', { after: 110 }),
table([
  { h: 'This step', w: 2200 }, { h: 'Cannot happen until', w: 2600 }, { h: 'Why', w: 4560 },
], [
  ['All of Step 1, in order', '—', 'Both apps’ settings must be changed BEFORE the backup is saved, or the backup does not contain the value you spend the rest of the plan following.'],
  ['Everything in Step 4', '4.0 — you ask for the migration to be armed', 'Until then the apps correctly stay put, which looks exactly like a failed test.'],
  ['4.5 (Tiles carries across)', '4.1 (Symbols has migrated)', 'Tiles can only demonstrate the carry after the app sharing its profile has actually moved.'],
  ['All of Step 6', 'C3 has migrated at 4.6', 'C7 is C3 after its move — there is no “after” to restore into before then.'],
  ['All of Step 7', 'Every earlier step is ticked off', 'Going live with the “we have moved” page removes the old app, and stages 2 and 3 can never be run again.'],
], { zebra: true }),

H('5.  Where you are starting from', HeadingLevel.HEADING_1),
P('Stage 2 has already shipped. Both addresses are live and carry different releases, and your installed apps have not yet caught up — so the first few actions produce results before you have consciously started testing. Those are written out as Step 1 in §6 rather than left to surprise you.', { after: 130 }),

table([
  { h: 'What', w: 3000 }, { h: 'State right now', w: 6360 },
], [
  ['Your installed Symbols app', 'Release 21, on the retiring address, GREEN icon. Has not seen any of the new work.'],
  ['Your installed Tiles app', 'Release 12, on the retiring address, GREEN icon. Same.'],
  ['The retiring address', 'Serving Symbols 22 / Tiles 13 — the settings backup, the pre-move notice, the clean reload, and the move itself.'],
  ['The new address', 'Serving Symbols 26 / Tiles 17, BLACK icons. Nothing of yours is there yet.'],
  [{t:'The move itself',bold:true}, {t:'SWITCHED OFF. The retiring app checks a flag at the new address that reads “not ready”, so nothing moves anyone until you ask.',fill:OK}],
  ['Your second machine (C5)', 'Set up at Step 3, then left alone until Step 7.'],
], { zebra: true }),

P('', { after: 40 }),
bullet('C2 — Tiles — proves the most at step 4.5: it is never opened during the move, so its settings can only arrive if the move carries everything stored at that address rather than just the app doing the moving.'),
bullet('Record every value below as you go. If every tester leaves the setting at its default, a total failure to carry settings looks exactly like a success.'),

table([
  { h: 'Client', w: 1400 }, { h: 'Setting changed to', w: 3200 }, { h: 'Release shown', w: 1800 }, { h: 'Date recorded', w: 2960 },
], [
  [{t:'C1',bold:true}, '', '', ''], [{t:'C2',bold:true}, '', '', ''],
  [{t:'C3',bold:true}, '', '', ''],
], { zebra: true }),

// ============================================================ 5a
H('5a.  Release numbers, and the notices they can swallow', HeadingLevel.HEADING_1),
P('The old address and the new one are now separate products with separate release numbers. The old app is at 21 and will climb as each migration piece is added to it; the new app is already well ahead and climbing too. They will cross.', { after: 120 }),
P('That matters because the app remembers which release you last read notes for — and that memory travels with you when you move. If the old app has reached a higher number than the new one, you arrive believing you have already read everything, and every note the new app had is silently swallowed. If the old app stays ahead, it stays swallowed.', { after: 120 }),

new Table({
  columnWidths: [W],
  width: { size: W, type: WidthType.DXA },
  rows: [new TableRow({ children: [cell([
    { t: 'This is not hypothetical. ', bold: true },
    { t: 'It is the same failure that hid ten releases of Bliss Tiles notices behind Bliss Symbols’ higher number, and the plan makes it likely rather than unlikely — every extra release on the old app moves it closer to the new one.' },
  ], W, { fill: WARN })] })],
}),

P('The intended fix is that this record simply does not cross between addresses: it describes which app’s history you have read, and the two histories are now different. You arrive with a clean slate and are notified normally from then on. Everything else still travels. Step 4.1 confirms it, and step 6.6 confirms it for a restored backup too — the same hole reached a different way.', { before: 130, after: 120 }),

new Paragraph({ children: [new PageBreak()] }),

// ============================================================ 6
H('6.  The tests', HeadingLevel.HEADING_1),
P('One sequence, in the order you actually perform it. Each step says which tester, on which machine, in which browser. Steps within a numbered group are strictly in order; the groups themselves are in order too.', { after: 130 }),

H('Step 1 — Machine 1, Chrome: your two installed apps  (C1 and C2)', HeadingLevel.HEADING_2),
P('These results happen simply because you opened your apps for the first time since the work shipped, so they are written down rather than left as surprises.', { after: 110 }),
tc([
  ['1.1', 'Open your installed Symbols app from its desktop icon', 'It updates itself from release 21 to 22 and shows a “What’s new” notice listing four things: the Preferences tab, the reminder to save your settings, “Reload the app cleanly”, and groundwork for the move. SETTINGS: unchanged.',
   'This is the moment C1 stops being frozen on an old release, and it cannot be undone.'],
  ['1.2', 'Dismiss the notice. Settings → About', 'Reads Release 22. The icon is still GREEN — that is how you know you are on the retiring address. Write the number down.'],
  ['1.3', 'Close Settings and look at the top of the app', 'The backup reminder is there: “Please save a copy of your settings…” with a Save button in it.',
   'Do NOT press Save yet. Steps 1.4 and 1.6 must happen first, or your backup will not contain the values you spend the rest of the plan following.'],
  ['1.4', 'Settings → Preferences → untick “Show What’s new after the app updates itself”', 'The box is now clear. THIS IS C1’s MARKER. Record it in §5.'],
  ['1.5', 'Open your installed Tiles app from its desktop icon', 'It updates itself from 12 to 13, shows the same four items, and then shows the same backup reminder.',
   'Tiles keeps its OWN copy of the setting. Untick it here too or step 4.5 — the test that proves the most — will have nothing to prove.'],
  ['1.6', 'In Tiles: Settings → Preferences → untick the same box', 'Clear in both apps. Both markers set.'],
  ['1.7', 'NOW press Save on the backup reminder, in either app', 'bliss-settings-backup.json lands in Downloads. The reminder disappears — and it disappears in the OTHER app too, because one backup covers both.',
   'Keep this file. Step 6.4 needs it, possibly weeks from now, and it is the only copy of your settings outside this browser.'],
  ['1.8', 'Confirm nothing has moved', 'Both apps still on the retiring address, still green, releases 22 and 13, both boxes unticked.',
   'If either app has jumped to the new address, the move was armed early. Stop and say so before going any further.'],
  ['1.9', 'Leave both apps open or closed as you like — but see 4.0', 'No action needed yet.',
   'Everything must be CLOSED before the move is armed at 4.0, because the move only happens when an app starts up. Noted here so it is not a surprise later.'],
]),

H('Step 2 — Machine 1, EDGE: the bookmark user  (C3)', HeadingLevel.HEADING_2),
P('A different browser is a completely separate pot of settings, so this tester is genuinely independent of C1 and C2 even though it is on the same machine. It has never seen the app before.', { after: 110 }),
tc([
  ['2.1', 'In Edge, open the retiring address for the first time, and bookmark it', 'It loads release 22 straight away, and shows NO “What’s new” notice.',
   'The ABSENCE of the notice is correct here, unlike C1 at step 1.1. This browser has no history with the app, so there is nothing to catch up on. Do not record this as a fault.'],
  ['2.2', 'The backup reminder appears. Press “Not now”', 'It disappears for now. SETTINGS: nothing saved.'],
  ['2.3', 'Close the TAB completely, then reopen from the bookmark', 'The reminder is back.',
   '“Not now” lasts the browser session, not the page load. Reloading the tab will NOT bring it back — you must close the tab, or the window, and open it fresh.'],
  ['2.4', 'Do that once more', 'Back again. It keeps asking until the button is actually pressed, which is the intended behaviour for someone who never gets round to it.'],
  ['2.5', 'Settings → Preferences → untick “Show What’s new…”', 'Clear. THIS IS C3’s MARKER — separate from C1’s, because Edge holds its own settings.'],
  ['2.6', 'Deliberately do NOT press Save in Edge', 'C3 is your “ignored the advice” tester. It reaches the move with no backup of its own, which is what most people will actually do.'],
]),

H('Step 3 — Machine 2: the user who then vanishes  (C5)', HeadingLevel.HEADING_2),
P('C5 has to be someone who WAS a user and then stopped coming back. A machine that never opened the app has no settings, so at Step 7 there would be nothing to carry and the test could not be answered.', { after: 110 }),
tc([
  ['3.1', 'On MACHINE 2, in Chrome, open the retiring address (Symbols) in a tab', 'Release 22, no “What’s new” (first visit here), and the backup reminder appears.',
   'A tab, not an installed app. Only machine 1 installs anything, so only machine 1 gets desktop icons.'],
  ['3.2', 'Settings → Preferences → untick the box', 'Clear. C5’s Symbols marker.'],
  ['3.3', 'Open Tiles the same way, and untick it there too', 'Release 13, box clear. C5 now has settings in both apps.'],
  ['3.4', 'Press “Not now”, close everything, and leave machine 2 alone', 'Nothing further happens here until Step 7.',
   'Do not open anything on machine 2 again until Step 7. This state cannot be recreated once the retiring address stops serving the app.'],
]),

H('Step 4 — the move itself', HeadingLevel.HEADING_2),
P('This is the heart of the rehearsal, and it does not begin until you ask for it.', { after: 110 }),
tc([
  ['4.0', 'FIRST close everything: both installed apps on machine 1, and the Edge tab. THEN tell Claude: “arm the migration”', 'Nothing is left running anywhere. The flag at the new address is switched to ready. Claude confirms the flag reads ready and that the retiring app can see it.',
   'Closing first is not tidiness. The move only happens when an app STARTS UP — so clicking the icon of an app that is already running just brings its window forward, nothing reloads, and nothing migrates. It looks exactly like a failure. Machine 2 was already closed at 3.4.'],
  ['4.1', 'Machine 1, Chrome — open the installed Symbols app', 'It arrives at the NEW address and stays in its own window. SETTINGS: your unticked box is still unticked. AND: no “What’s new” notice appears at all.',
   'A “What’s new” notice here is a FAILURE, even though a notice normally means things are working. Seeing notes for releases 23–26 would mean the record of what you had read travelled with you, which must not happen — the two addresses number their releases separately.  ⚠ BUT READ THIS BEFORE RECORDING A PASS: the marker set at step 1.4 IS the setting that suppresses this notice, so on this client no notice can appear for any reason and “no notice” proves NOTHING. It passed vacuously on the BTS run. See section 8 for the fix — keyguard must not use its notice preference as the carried marker.'],
  ['4.2', 'Look at the window frame', 'An address strip has appeared that was never there before, because the icon still points at the old address. Expected, not a fault.'],
  ['4.3', 'Read what the opening screen asks you to do', 'It says the app has moved, that your settings came with you, and asks you to open your folder once more. It explains why without alarming you.'],
  ['4.4', 'Open your folder again', 'Your concepts and graphics are all present. SETTINGS: still intact afterwards.'],
  ['4.5', 'Machine 1, Chrome — NOW open the installed Tiles app', 'SETTINGS: Tiles’ own unticked box is there, even though Tiles was never opened during the move. This proves the move carries everything stored at the old address, not just the app doing the moving.',
   'Only valid if Tiles has never been opened on the NEW address before now. If it has, it wrote its own defaults there, the move correctly left them alone, and this proves nothing either way.'],
  ['4.6', 'Machine 1, EDGE — open the C3 bookmark', 'It moves across too. SETTINGS: C3’s marker carried. The bookmark still works afterwards.'],
  ['4.7', 'Machine 1, EDGE — hard-refresh on the retiring address, then open normally', 'Still moves across, because nothing is bouncing you. SETTINGS: carried.',
   'The ONE place in this plan where a hard refresh is deliberate. C3 in Edge only — never on C1, C2 or C5, where it can destroy state you cannot recreate.'],
  ['4.8', 'Machine 1, Chrome — open the OLD address again, after having moved', 'Nothing is damaged and nothing is duplicated. SETTINGS: unchanged — arriving a second time must not overwrite anything.'],
  ['4.9', 'MACHINE 3, Chrome — go straight to the new address, having never visited the old one', 'A normal first run. No mention of any move. The opening screen quietly offers to load a saved settings file, which is correct for someone starting fresh.'],
  ['4.10', 'Machine 1 — install the app from the NEW address, WITHOUT removing the old icon yet', 'You now have TWO icons with the same name and the same artwork apart from colour — the old GREEN one and the new BLACK one. This is the confusion a clinician would hit; note which is which before going on.',
   'Real users should be told to remove the old icon FIRST and install second — uninstalling before the app has been opened and moved is what strands settings, and “also delete data” is the destructive choice. We are deliberately doing it the other way round to keep a tester alive; see 4.12.'],
  ['4.11', 'Launch the new BLACK icon', 'No address strip. It opens straight to the new address with no detour. SETTINGS: intact.'],
  ['4.12', 'Leave the old GREEN icon in place for now', 'Nothing to do — just do not remove it.',
   'Step 7.3 needs it. It is the only way to see what a stranded installed app shows a user once the retiring address stops serving the app, and it cannot be recreated afterwards.'],
]),

H('Step 5 — an update arrives on the new address', HeadingLevel.HEADING_2),
tc([
  ['5.0', 'TELL CLAUDE: “publish a test release”', 'Claude ships a small release to the NEW address and confirms it is live. Nothing changes on any client until it is next opened.',
   'A gate, like 4.0 and 7.0. Steps 5.1–5.3 cannot show anything until a newer release actually exists.'],
  ['5.1', 'Machine 1, Chrome — open Symbols', 'NOW the “What’s new” notice appears, for that one new release only. SETTINGS: survive the update.',
   'This is the other half of step 4.1. Together they show the release record is not crossing addresses but IS advancing normally on its own line.'],
  ['5.2', 'Open it again', 'No repeat notice. SETTINGS: unchanged.'],
  ['5.3', 'Open Tiles', 'Tiles shows its own release number and its own notes, not Symbols’.'],
]),

H('Step 6 — backup and restore  (C7 — Machine 1, Edge, reusing C3)', HeadingLevel.HEADING_2),
P('Never tested before, in either app. C3 has migrated by now, so its Edge profile becomes C7.', { after: 110 }),
tc([
  ['6.1', 'In Edge on the new address: Settings → Preferences → “Save my settings…”', 'A file is saved and is readable.'],
  ['6.2', 'Clear Edge’s data for the NEW address, then reopen the app', 'The opening screen says your settings did not come across and offers to load a saved file. SETTINGS: gone at this moment — that is the scenario.',
   'The offer is on the opening screen, not inside Settings. If you cleared the data while the app was open, reload before judging — the check runs at start-up.'],
  ['6.3', 'Load the file saved at 6.1', 'SETTINGS: the unticked box returns exactly.'],
  ['6.4', 'Now load the OLD-address backup saved at step 1.7 instead', 'Your settings come back.',
   'Expect FEWER items restored than the file contains. The record of which releases you had read is deliberately left behind when a backup crosses addresses. That is correct, not a fault.'],
  ['6.5', 'Close the tab and open the app again', 'NO “What’s new” notice appears.',
   'This is the check that the release record did not ride across inside the backup. If you see notes for releases 23 onwards, it did — the same fault as step 4.1, reached by a different route. No new release is needed to see this.  ⚠ SAME DEFECT AS 4.1: this client carries the unticked marker, so the notice is switched off and cannot appear whatever the truth is. Vacuous as written. Fix it the same way — see section 8.'],
  ['6.6', 'Load the same file a second time', 'Nothing is duplicated or corrupted.'],
]),

H('Step 7 — the “We’ve Moved” page  (C5, Machine 2)', HeadingLevel.HEADING_2),
P('For people who come back long after everyone else. Machine 2 has been left alone since Step 3 for exactly this.', { after: 110 }),
tc([
  ['7.0', 'TELL CLAUDE: “go live with the We’ve Moved page”', 'The retiring address stops serving the app and serves the page instead. Its offline copy is retired at the same time, so a browser holding a cached copy of the old app cannot keep loading it. Claude confirms both, and that the page still carries settings.',
   'The point of no return for Steps 1 to 4 — the old app is gone afterwards and those steps can never be run again. Do not ask for this until everything above is ticked off.'],
  ['7.1', 'MACHINE 2 — open the retiring address for the first time since Step 3', 'A clear page saying where the app went. Not a dead end, and not a technical error. It may take a second visit: the browser retires its cached copy of the old app on the first one, then reloads itself onto the page.',
   'Without the retirement step this would have shown you the CACHED OLD APP instead, because an offline copy answers before the network does. C5 registered one back at Step 3. It was found and fixed before you got here; a second visit being needed is normal, not a fault.'],
  ['7.2', 'Click the button that takes you across', 'You land in the app at the new address. SETTINGS: the boxes you unticked back at Step 3 are still unticked. Record exactly what arrived.',
   'This is the whole reason the page carries settings rather than merely pointing the way. If nothing arrives, the people it was built for are the ones it failed.'],
  ['7.3', 'Machine 1 — relaunch a stale OLD icon, if you kept one', 'It shows the “We’ve Moved” page inside the app window — which is precisely where someone will notice it.'],
  ['7.4', 'Read the page as someone who has been away a year', 'It says what happened, where the app is, and what to do about the old icon, without assuming they remember anything.'],
  ['7.5', 'Machine 1 — now remove the old GREEN icon, and tidy the desktop', 'One BLACK icon remains, pointing at the new address. This is the end state a real user should reach.',
   'Do this before turning OneDrive back on. Whatever is on machine 1’s desktop when sync resumes is what lands on the other two machines.'],
]),

// ============================================================ 7
H('7.  Results that look like failures but are not', HeadingLevel.HEADING_1),
P('Write these down before testing so a correct outcome is not reported as a bug — and so a real bug is not waved away as one of these.', { after: 130 }),
table([
  { h: 'What you will see', w: 3800 }, { h: 'Why it is correct', w: 5560 },
], [
  ['You are asked to reconnect your folder', 'A folder permission cannot move between web addresses by any means. One reconnect restores it for both apps. This is unavoidable and is not a settings failure.'],
  ['An address strip appears in the installed app’s window', 'The installed icon still points at the old address, and the icon can never be repointed. It is the reason for reinstalling, and it disappears once you do.'],
  ['The app looks brand new after moving', 'The new address starts empty by design. If your settings came across, the only thing genuinely missing is the folder connection.'],
  ['The “what’s new” notice does not appear after moving', 'Correct if the record of what you last read came across with everything else — you have already seen those notes.'],
  ['C5 arrives with nothing at step 7.2', 'This would be a FAILURE, not an expected result. The page was deliberately built to carry settings, and was verified doing so before it shipped.'],
], { zebra: true }),

// ============================================================ 8
H('8.  What this tells us about the Keyguard Designer', HeadingLevel.HEADING_1),
new Table({
  columnWidths: [W],
  width: { size: W, type: WidthType.DXA },
  rows: [new TableRow({ children: [cell([
    { t: 'DO THIS FIRST when adapting the plan: do NOT use the “Show What’s new” preference as the carried marker.', bold: true },
    { t: ' That single choice broke four checks on the BTS run — 4.1, 5.1, 5.2 and 6.5 — because the setting being carried is the same setting that suppresses the notice those steps observe. Every one of them appeared to pass while being incapable of failing.', break: 1 },
    { t: 'For keyguard the fix is trivial and costs nothing: it has 21 settings, so pick any OTHER one as the marker and leave the notice switched ON. Then 4.1 and 6.5 mean what they say — no notice on arrival proves the release record stayed behind, and a run of old release notes is a real, visible failure. BTS could not do this because it had exactly one user-visible setting, which is why the collision was structural rather than careless.', break: 1 },
    { t: 'Related trap, same area: when the notice is switched off the app still ADVANCES its record of what you have read. So a release published while it is off is spent permanently — switching the notice back on does not bring it back, and you must publish another release to see one. That cost an extra release on the BTS run.', break: 1 },
  ], W, { fill: WARN })] })],
}),

P('', { after: 60 }),

bullet('Keyguard has 21 settings against these apps’ one. Everything the tests above prove about carrying a single setting applies unchanged, but the cost of getting it wrong is 21 times larger.'),
bullet('Keyguard’s remembered list of recent projects cannot be exported or restored by any backup. Test 4.4 will not cover it, and no test can — it is a known, accepted loss.'),
bullet('Keyguard has two addresses that both open the app, and only one of them is saved for offline use. That mattered enormously under the old “everyone at once” plan. Under this plan it should not matter at all — step 4.6 is the closest equivalent, and if it passes, the concern can be closed.'),
bullet('Keyguard will have the same release-number problem in a sharper form: its old address has years of release history behind it, so the number it carries into the move will be large. Whatever §5a proves here applies there, and the record must not cross.'),
bullet('Keyguard is used seasonally. The “opens it once a year” tester (C5) is a rare edge case here and may be a large fraction of real clinicians there, which makes the “we have moved” page far more important for Keyguard than it is for these apps.'),
bullet('Ken’s point about the DNS check applies to Keyguard’s move too: after attaching the address, open the repository’s Pages settings page in a browser. It completes the check within seconds. Waiting does not.'),

H('9.  Sign-off', HeadingLevel.HEADING_1),
table([
  { h: 'Stage', w: 3400 }, { h: 'All tests passed', w: 1800 }, { h: 'Date', w: 1900 }, { h: 'Notes / anything left open', w: 2260 },
], [
  ['Steps 1–3 — setup and the notice', '☐', '', ''],
  ['Step 4 — the move itself', '☐', '', ''],
  ['Step 5 — an update on the new address', '☐', '', ''],
  ['Step 6 — backup and restore', '☐', '', ''],
  ['Step 7 — the “We’ve Moved” page', '☐', '', ''],
  [{t:'Cleared to migrate Keyguard',bold:true,fill:OK}, {t:'☐',fill:OK}, {t:'',fill:OK}, {t:'',fill:OK}],
], { zebra: false }),

P('Deleting the old repository is deliberately not on this list. It is the one step with no undo, and it should not be taken until the “we have moved” page has been live long enough that nobody is still arriving there.', { before: 160, italics: true }),

    ],
  }],
});

const out = process.argv[2] || OUT_DEFAULT;
Packer.toBuffer(doc).then(b => {
  fs.writeFileSync(out, b);
  console.log('wrote', out, '—', b.length, 'bytes');
});
