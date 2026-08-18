import * as THREE from 'three';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { createOpenSCAD } from '../openscad-wasm/openscad.js';
import { addFonts } from '../openscad-wasm/openscad.fonts.js';

// ------------------------------------------------------------- change control
// Integer app release, shown in the header (next to Export STL) and logged as a
// console banner on startup and folder connect. Convention mirrors the keyguard
// designer web app (see RELEASING.md): the local dev copy carries the NEXT
// release = last public release + 1, pre-incremented when a new cycle starts, so
// a dev build reads one ahead of what's deployed. sw.js's CACHE_NAME and
// latest_app_version.json are the SEPARATE deployment markers — NOT pre-bumped
// on dev, only at release, to match this number.
// ── Per-app configuration ────────────────────────────────────────────────────
// This engine is shared by two apps (Bliss Tactile Symbols and Bliss Tiles &
// Puzzles — see CLAUDE.md "Two apps from one engine"). Everything that differs
// between them is supplied by the thin shell (symbols/index.html or
// tiles/index.html) as `window.APP_CONFIG`, set BEFORE this module is imported.
// The shell's HTML documents each field (appName, scadBaseName, svgOwnDir,
// svgPickerDirs, svgCreateSources, exportFallback, appRelease, appRepo, appDir,
// scadRepo, scadManifestFile); nothing else in this file is app-specific.
const APP_CONFIG = window.APP_CONFIG;
if (!APP_CONFIG) throw new Error('APP_CONFIG missing — the shell must set window.APP_CONFIG before importing bts-core.js.');

// Human label for the designer .scad, mid-sentence lowercase ("symbol designer" /
// "tile & puzzle designer"); capFirst() capitalizes it at a sentence start. Used in
// the .scad-update modal + log lines below, which are otherwise identical per app.
const DESIGNER = APP_CONFIG.designerLabel || 'designer';
const capFirst = s => s ? s[0].toUpperCase() + s.slice(1) : s;

// ═══════════════════════════════════════════════════════════════════════════
// ORIGIN MIGRATION
// ═══════════════════════════════════════════════════════════════════════════
// Both halves live here, gated by which address we are on, so ONE implementation
// serves both deployments: the retiring Pages site (departure) and
// bts.volksswitch.org (arrival). Neither half does anything on any other address.
//
// WHY THIS EXISTS. Browser storage is bound to the web address that created it.
// Moving to bts.volksswitch.org starts from an empty store and nothing is
// inherited, so unless the OLD app hands the data over as it sends the user
// across, their setup is gone. Once the old address stops serving the app, no
// page can ever load there to read that storage again.
//
// PAGE-ONLY. Never put this in the service worker as well. A worker intercepts
// the navigation before any page code runs and has no localStorage, so it always
// arrives empty-handed — implementing both guarantees the worse one wins.
// Measured in the sandbox: every migration arrived with no payload until the
// worker-side redirect was removed.
const MIGRATION = (() => {
  const OLD_ORIGIN = 'https://volksswitch.github.io';
  const OLD_PREFIX = '/bliss-tactile-symbols-web';        // the retiring Pages project
  const NEW_ORIGIN = 'https://bts.volksswitch.org';
  // Path-qualified on purpose: the NEW site is also reachable at
  // volksswitch.github.io/bts-web-app/, and that must never be mistaken for the
  // old one and told to migrate to itself.
  const isOld = location.origin === OLD_ORIGIN &&
                location.pathname.startsWith(OLD_PREFIX + '/');
  return {
    OLD_ORIGIN, OLD_PREFIX, NEW_ORIGIN, isOld,
    PROBE_URL: NEW_ORIGIN + '/migration-probe.json',
    PROBE_TIMEOUT_MS: 4000,
    // /bliss-tactile-symbols-web/symbols/ -> /symbols/   (the repo segment goes)
    newPathFor: p => (p.startsWith(OLD_PREFIX) ? (p.slice(OLD_PREFIX.length) || '/') : p),
  };
})();

// Keys that must NOT cross between addresses.
// `bts_last_seen_release:*` records which releases you have READ THE NOTES FOR —
// it describes one app's history, not a user preference. The two deployments now
// climb separate release ladders and will cross, so carrying it over means
// arriving believing you have read everything and having every notice the new
// app had silently swallowed. Exactly the failure that hid ten releases of Tiles
// notices behind Symbols' higher number (Ken, 2026-08-11). Excluded from the
// migration payload AND from a cross-address restore. Everything else travels.
const migrationExcluded = k => k.startsWith('bts_last_seen_release');

// ⚠ SECURITY. Only ever carry keys belonging to THESE TWO APPS.
//
// The original rule was "every key stored at this address", chosen so migrating
// Symbols would bring Tiles along. That was wrong, and dangerously so: this
// address is shared by every Volksswitch app ever published to
// volksswitch.github.io. Conversant AAC lived there before it moved; the keyguard
// designer still does. So the payload swept up an Anthropic API key, a real
// person's name, home address, phone number and email, and keyguard's settings —
// and put them in a URL. Found 17 Aug 2026 on the first real client, which failed
// with "URI Too Long"; the length was the symptom, not the bug.
//
// Both apps prefix their keys `bts_`, so this still carries Tiles along — the
// whole point of the original rule — while never touching anything that is not
// ours. Anything added later MUST use that prefix to travel.
const isOursToCarry = k => k.startsWith('bts_') && !migrationExcluded(k);

// Probe before moving anyone: a blind redirect strands every user whose new
// address is not serving yet. A REAL CORS fetch requiring an explicit
// `ready:true` — never `mode:'no-cors'`, whose opaque response resolves even on
// a 404 and would happily move people onto a broken host. Requiring the flag
// also means the move can be disarmed without touching DNS.
async function migrationTargetReady(){
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), MIGRATION.PROBE_TIMEOUT_MS);
    const r = await fetch(MIGRATION.PROBE_URL + '?t=' + Date.now(), { cache: 'no-store', signal: c.signal });
    clearTimeout(t);
    if (!r.ok) return false;
    return (await r.json())?.ready === true;
  } catch { return false; }
}

// EVERY key on this address except the excluded ones — both apps', not just this
// one's. Symbols and Tiles share a single address and therefore a single store,
// so whichever app the user happens to open first must bring the other along;
// scoping this to the calling app would strand the other one's settings on an
// address that can never be read again.
// The connected folder is deliberately absent: a folder permission cannot be
// serialised or transferred by any means. One re-pick restores it for both apps.
function migrationPayload(){
  const ls = {};
  for (let i = 0; i < localStorage.length; i++){
    const k = localStorage.key(i);
    if (!isOursToCarry(k)) continue;
    ls[k] = localStorage.getItem(k);
  }
  return btoa(unescape(encodeURIComponent(JSON.stringify({
    ls, movedAt: new Date().toISOString(), fromApp: APP_CONFIG.appDir,
  }))));
}

// Leave nothing behind that could keep serving the old app. getRegistrations()
// returns every scope on the address, so migrating from /symbols/ also retires
// /tiles/ — both are being replaced at once.
async function migrationTearDown(){
  try { (await navigator.serviceWorker.getRegistrations()).forEach(r => r.unregister()); } catch {}
  try { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch {}
}

async function maybeMigrateOrigin(){
  if (!MIGRATION.isOld) return false;
  if (!await migrationTargetReady()){
    console.log('[migration] new address not ready — staying put, will retry next load');
    return false;
  }
  const payload = migrationPayload();
  await migrationTearDown();
  // The payload rides in the FRAGMENT (#), which browsers never transmit to a
  // server — so it cannot land in an access log or a proxy, and cannot trip the
  // server's URL length limit. Only `from` and `via` go in the query string.
  const here = MIGRATION.newPathFor(location.pathname) + location.search;
  const sep  = here.includes('?') ? '&' : '?';
  location.replace(MIGRATION.NEW_ORIGIN + here + sep +
    `from=${encodeURIComponent(location.origin)}&via=page` +
    `#s=${encodeURIComponent(payload)}`);
  return true;
}

// ── Arrival ────────────────────────────────────────────────────────────────
// Runs IMMEDIATELY, before anything else reads localStorage, so restored values
// are visible on this very load rather than one load later. Never clobbers what
// is already here — arriving a second time (a stale bookmark) must change
// nothing. That is the opposite of the deliberate, user-initiated restore in
// Preferences, which does overwrite.
const MIGRATION_ARRIVAL = (() => {
  const q = new URLSearchParams(location.search);
  const from = q.get('from');
  if (!from) return null;
  const via = q.get('via') || 'unknown';
  const restored = [];
  // Fragment first; the query is the fallback for a client still running the
  // build that sent it there.
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const s = hash.get('s') || q.get('s');
  if (s){
    try {
      const d = JSON.parse(decodeURIComponent(escape(atob(s))));
      for (const [k, v] of Object.entries(d.ls || {})){
        // Refuse anything that is not ours even if an older sender included it.
        if (!isOursToCarry(k)) continue;
        if (localStorage.getItem(k) === null){ localStorage.setItem(k, v); restored.push(k); }
      }
      console.log(`[migration] arrived from ${from} via ${via}; restored ${restored.length} key(s):`, restored);
    } catch (e){ console.warn('[migration] payload unreadable —', e.message); }
  } else {
    console.warn(`[migration] arrived from ${from} via ${via} with NO payload — settings stayed behind`);
  }
  history.replaceState(null, '', location.pathname);      // clean address bar for bookmarking
  return { from, via, restored };
})();

// The two apps share app-body.html, so app-specific text can't be literal in the
// markup — fill it here from APP_CONFIG. (Trusted config values, so innerHTML is
// safe.) Settings "About" labels and the "What's new" body are filled elsewhere.
(function applyAppIdentity(){
  // Both apps connect to the SAME folder (folderName); only what THIS app needs
  // from it (its own .scad + own SVG folder) is app-specific, in the message.
  const gt = document.getElementById('gateTitle');
  const gm = document.getElementById('gateMsg');
  // Someone who has just been moved gets the explanation IN the gate rather than
  // in a banner above it. The gate is a modal in the middle of the screen and
  // wins the user's attention outright; a strip along the top loses to it, and
  // the one thing they must do — reconnect the folder — is the gate's own job.
  // Their concepts and graphics are in the folder and were never at risk, so the
  // wording says that rather than leaving them to wonder (Ken, 2026-08-15).
  if (MIGRATION_ARRIVAL){
    if (gt) gt.textContent = `Please open your ${APP_CONFIG.folderName} folder again`;
    if (gm) gm.innerHTML =
      `<b>${APP_CONFIG.appName} has moved to a new web address.</b> Your settings came with you, `
      + `but the permission to read your folder cannot move between addresses — so please pick it `
      + `once more. Nothing in the folder has changed: your concepts and graphics are all still there. `
      + `Please update your bookmark, and if you installed this app, install it again from here.`;
  } else {
    if (gt) gt.textContent = `Open your ${APP_CONFIG.folderName} folder`;
    if (gm) gm.innerHTML = `Pick the folder that holds <b>${APP_CONFIG.scadBaseName}.scad</b>, its `
      + `<b>.json</b>, and the <b>${APP_CONFIG.svgOwnDir}</b> folder. The app remembers it next time.`;
  }
  const wt = document.getElementById('whatsnewTitle');
  if (wt) wt.textContent = `What’s new in ${APP_CONFIG.appName}`;
  const st = document.getElementById('scadUpdateTitle');
  if (st) st.textContent = `${capFirst(DESIGNER)} update available`;
})();

const APP_RELEASE = APP_CONFIG.appRelease;

// NOTE: `APP_CONFIG.appRepo` is now INFORMATIONAL ONLY — it records where the app
// is published but nothing reads it, because the update manifest is no longer
// fetched from GitHub (see below). Changing it has no runtime effect.
//
// The app's own update manifest, served from THIS origin by the same deploy that
// served this app — deliberately NOT from raw.githubusercontent.com any more.
// Two reasons, both load-bearing (Ken, 2026-08-15):
//
// 1. REACHABILITY. The whole point of moving to bts.volksswitch.org is that K-12
//    filters block GitHub. A filter that blocks `*.github.io` very likely blocks
//    raw.githubusercontent.com too — so a clinician behind one would get a working
//    app that can never discover an update, silently and forever (a failed check is
//    a deliberate no-op). Serving the manifest from our own origin means the update
//    channel is reachable exactly when the app itself is.
//
// 2. IT KILLS THE RELEASE RACE. raw.githubusercontent.com is a different CDN from
//    Pages, and the two update at unpredictable times relative to each other —
//    measured on the keyguard rehearsal, the manifest LED the deploy by 45 s once
//    and LAGGED it by 150 s minutes later (LEARNINGS Finding 2). When the manifest
//    leads, clients are told to fetch a release that is not being served yet, burn
//    their one loop-guard attempt, and give up (Finding 4). Same-origin, the app and
//    its manifest ship in ONE deploy and cannot disagree — which also retires the
//    two-push release split in RELEASING.md.
//
// Relative on purpose: resolved against the document, so it lands on
// `<wherever this app is served>/latest_app_version.json` — correct both at
// `/symbols/` on a subdomain and at `/<repo>/symbols/` on github.io. The worker
// does not cache it (it is not in SHELL), and the fetch is `no-store` with a
// cache-buster, so a stale copy cannot mask a new release.
const APP_MANIFEST_URL = './latest_app_version.json';

// SCAD-file update (parallel to the app self-update, but for the designer .scad
// this app owns — the one the user carries in their connected folder). The
// canonical .scad + its manifest live in a SEPARATE repo (scadRepo) so the
// .scad releases INDEPENDENTLY of the web app — a .scad publish never redeploys
// the app, and an app release never touches the .scad. The manifest names the
// latest `scad_version` and where to download the matching .scad; when the user's
// local .scad is behind, the app offers an in-place update (see checkForScadUpdate).
// raw.githubusercontent serves both with CORS; the filename is URL-encoded.
// ⚠️ Keep SCAD_REPO in lockstep with the scad repo (and its publish script).
const SCAD_REPO = APP_CONFIG.scadRepo;
const SCAD_MANIFEST_URL = `https://raw.githubusercontent.com/${SCAD_REPO}/main/${APP_CONFIG.scadManifestFile}`;
const SCAD_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;   // "Remind me in a week"

// User-facing "What's new" notes come from the shell's APP_CONFIG.releaseNotes,
// keyed by release — BUNDLED into each app (not fetched) so the post-update
// notice works offline. Each shell (symbols/index.html, tiles/index.html) carries
// its own, generated from that app's CHANGELOG.md by scripts/apply-release-notes.mjs.
const RELEASE_NOTES = APP_CONFIG.releaseNotes || {};

// ------------------------------------------------------------------ logging
const consoleEl = document.getElementById('console');
const statusEl = document.getElementById('statusmsg');
function logLine(t){ consoleEl.textContent += (t + '\n'); consoleEl.scrollTop = consoleEl.scrollHeight; }
function setStatus(msg, kind){ statusEl.textContent = msg; statusEl.className = kind || ''; }

// ---------------------------------------------------- change control (runtime)
// Settings → About + the console banner give the user the running release to
// quote in a support note. Banner is logged at startup and on each folder connect.
function logVersionBanner(){
  logLine(`${APP_CONFIG.appName} web app — release ${APP_RELEASE}`);
}

// Tiny persistent setting: the highest release whose "What's new" the user has
// seen. localStorage (the folder handle lives in IndexedDB; this needs no handle).
// ⚠ PER-APP key. Both apps are served from ONE origin (GitHub Pages), and
// localStorage is per-ORIGIN, not per-path — so a bare key is a single value
// shared by Symbols and Tiles. With Symbols at release 15 and Tiles at 5, every
// Tiles notice was suppressed by `seen >= APP_RELEASE` and would have stayed
// suppressed until Tiles passed 15 (Ken, 2026-08-11).
const LS_LAST_SEEN = `bts_last_seen_release:${APP_CONFIG.appDir}`;
const LS_LAST_SEEN_LEGACY = 'bts_last_seen_release';
function getLastSeenRelease(){
  let raw = localStorage.getItem(LS_LAST_SEEN);
  if (raw == null){
    // One-time migration off the shared key. Adopt it only when it could
    // plausibly be THIS app's own history: a value above our release belongs to
    // the other app, so treat it as no record at all (baseline, no notice).
    const legacy = Number(localStorage.getItem(LS_LAST_SEEN_LEGACY));
    raw = Number.isFinite(legacy) && legacy > 0 && legacy <= APP_RELEASE ? String(legacy) : null;
  }
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? v : null;
}
function setLastSeenRelease(n){ try { localStorage.setItem(LS_LAST_SEEN, String(n)); } catch {} }

// ===== User preferences =====
// ⚠ PER-APP key, same rule as LS_LAST_SEEN — both apps are served from ONE
// origin and localStorage is per-ORIGIN, not per-path, so a bare key would be a
// single value shared by Symbols and Tiles. Namespace EVERY new persisted key.
// Being per-app is also what makes the migration rehearsal meaningful: Symbols
// and Tiles each carry their own value, so the move can be shown to bring both.
const LS_SHOW_WHATSNEW = `bts_show_whatsnew:${APP_CONFIG.appDir}`;
function getShowWhatsNew(){ return localStorage.getItem(LS_SHOW_WHATSNEW) !== 'no'; }  // default ON
function setShowWhatsNew(on){ try { localStorage.setItem(LS_SHOW_WHATSNEW, on ? 'yes' : 'no'); } catch {} }

// ===== Save / load settings =====
// Origin-independent insurance. It exists because browser
// storage is bound to the web address that created it: moving the app to
// bts.volksswitch.org starts from an empty store, and nothing is inherited.
// The automatic hand-over covers most people, but not someone who cleared their
// browser, arrived on a new machine, or came back after the old address retired.
// A file the user keeps is the only thing that covers those.
//
// The payload is EVERY key on this origin, not just this app's — deliberately
// mirroring the migration payload. Symbols and Tiles share one origin, so a
// backup taken from either must be able to restore both; scoping it to the
// calling app would silently strand the other one's settings.
const SETTINGS_BACKUP_KIND = 'bliss-settings-backup';

function settingsBackupObject(){
  // Same rule as the migration payload, and for the same reason — this writes a
  // FILE to the user's disk, so sweeping up another app's API key or personal
  // data would be worse here, not better. See isOursToCarry.
  const settings = {};
  for (let i = 0; i < localStorage.length; i++){
    const k = localStorage.key(i);
    if (!k.startsWith('bts_')) continue;      // release history DOES belong in a backup
    settings[k] = localStorage.getItem(k);
  }
  return {
    kind: SETTINGS_BACKUP_KIND, version: 1,
    savedAt: new Date().toISOString(),
    savedBy: APP_CONFIG.appName, savedFrom: location.origin,
    settings,
  };
}

// The backup lives in the CONNECTED FOLDER, under ONE standard name, overwritten
// in place (Ken, 17 Aug 2026). Both halves of that are deliberate:
//
//  • THE FOLDER, not Downloads. Downloads separates the file conceptually from
//    the work it belongs to, and people empty Downloads without looking — so the
//    file whose whole purpose is to still be there months later is exactly the
//    one that gets swept away. In the folder it also rides OneDrive to the user's
//    other machines by itself, which is the "set up a second computer from a
//    saved copy" case the restore offer was written for.
//
//  • ONE STANDARD NAME, overwritten silently. Settings are a STATE, not a work:
//    there is only ever one current set, and a backup is a snapshot you want
//    refreshed, not collected. That is why this does NOT follow Create-Graphic's
//    always-Save-As rule, and the difference is not an inconsistency — for a
//    graphic, accumulating files is the safeguard; for settings, accumulating
//    "(2)", "(3)" copies with no way to tell which is current IS the failure
//    mode. Do not reintroduce date-stamps: the name being predictable is what
//    makes the restore fallback tractable months later.
//
// Two machines sharing the folder over OneDrive overwrite each other and the
// last writer wins. Accepted (Ken) — they are one user's own settings.
//
// Falls back to a download when no folder is connected: the backup notice can
// appear before a folder has ever been picked, and a locked-down machine may
// have no folder access at all.
const SETTINGS_BACKUP_FILE = 'bliss-settings-backup.json';

async function saveSettingsBackup(){
  const obj  = settingsBackupObject();
  const n    = Object.keys(obj.settings).length;
  const text = JSON.stringify(obj, null, 2);

  if (folder && folder.dir && await ensureRW(folder.dir)){
    const fh = await folder.dir.getFileHandle(SETTINGS_BACKUP_FILE, { create: true });
    const w  = await fh.createWritable();
    await w.write(text);
    await w.close();
    logLine(`Saved your settings (${n} item${n === 1 ? '' : 's'}) to ${SETTINGS_BACKUP_FILE} in ${folder.dir.name}.`);
    return { n, where: 'folder', dirName: folder.dir.name };
  }

  // No folder, or write permission refused — a download still protects them.
  const blob = new Blob([text], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = SETTINGS_BACKUP_FILE;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  logLine(`Saved your settings (${n} item${n === 1 ? '' : 's'}) to your downloads.`);
  return { n, where: 'download' };
}

// Restore looks in the connected folder FIRST. For the great majority of users
// the file is simply there and that is the whole interaction — 95% of keyguard
// users have only one project folder (Ken, 17 Aug 2026), and BTS has exactly
// one. The dialog below is the rare fallback and must not shape the feature.
async function readBackupFromFolder(){
  if (!(folder && folder.dir)) return null;
  try { return await (await folder.dir.getFileHandle(SETTINGS_BACKUP_FILE)).getFile(); }
  catch { return null; }        // absent (or unreadable) — ask the user instead
}

// ⚠ An OPEN dialog's filename box CANNOT be pre-filled by any browser API —
// only SAVE dialogs take a suggested name. So the substitute is to name the file
// on screen before opening the dialog, and to anchor the dialog on the connected
// folder so the user starts from the right place rather than wherever they were
// last. Returns null when the browser has no file-picker API, so the caller can
// fall back to the hidden <input type=file>. Throws AbortError if cancelled.
async function pickBackupFile(){
  if (!window.showOpenFilePicker) return null;
  const opts = {
    multiple: false,
    types: [{ description: 'Settings backup', accept: { 'application/json': ['.json'] } }],
  };
  if (folder && folder.dir) opts.startIn = folder.dir;
  const [fh] = await window.showOpenFilePicker(opts);
  return fh.getFile();
}

// Restore OVERWRITES. This is a deliberate, user-initiated action — unlike the
// automatic arrival importer, which must never clobber, because arriving twice
// has to be harmless. Restoring the same file twice is therefore also harmless:
// it simply writes the same values again.
async function restoreSettingsBackup(file){
  let obj;
  try { obj = JSON.parse(await file.text()); }
  catch { throw new Error('That file could not be read — it is not a settings backup.'); }
  if (!obj || obj.kind !== SETTINGS_BACKUP_KIND || !obj.settings || typeof obj.settings !== 'object'){
    throw new Error('That is not a Bliss settings backup file.');
  }
  // A backup saved at a DIFFERENT address must not bring that app's record of
  // which releases you have read — the two deployments number their releases
  // separately, so it would silently swallow this app's notices. Same reasoning
  // as migrationExcluded; this is the same hole reached by a different route.
  const crossAddress = !!obj.savedFrom && obj.savedFrom !== location.origin;
  let n = 0, skipped = 0;
  for (const [k, v] of Object.entries(obj.settings)){
    if (typeof v !== 'string') continue;
    // An older backup may contain other apps' data. Never write it back.
    if (!k.startsWith('bts_')){ skipped++; continue; }
    if (crossAddress && migrationExcluded(k)){ skipped++; continue; }
    localStorage.setItem(k, v); n++;
  }
  if (skipped) console.log(`[settings] ignored ${skipped} release-history item(s) from another address`);
  const when = obj.savedAt ? obj.savedAt.slice(0, 10) : 'an earlier date';
  logLine(`Restored ${n} setting${n === 1 ? '' : 's'} from a backup saved on ${when}.`);
  return { count: n, savedAt: obj.savedAt, savedFrom: obj.savedFrom };
}

// ===== Self-updater =====
// GitHub Pages serves the app cache-first through sw.js, so without this a user
// would keep the cached build until a hard-refresh. checkForAppUpdate compares
// the running APP_RELEASE against latest_app_version.json (in the repo, served
// with CORS by raw.githubusercontent.com) and, when behind, force-refreshes
// through the service worker. Called only at app load and folder connect — where
// there are provably no unsaved edits to disturb. Any fetch failure (offline, or
// a network that blocks github.com) and dev/localhost (no SW) are silent no-ops.
let swRegistration = null;
let appReloadArmed = false;
let appReloaded    = false;
// Per-app, like the localStorage keys — one origin, two apps, two release axes.
const SS_UPDATE_TRIED = `bts_app_update_tried:${APP_CONFIG.appDir}`;

async function checkForAppUpdate(reg){
  if (!reg) return;                                    // no SW (dev/localhost) — nothing to refresh through
  let latest;
  try {
    const r = await fetch(APP_MANIFEST_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    latest = Number((await r.json()).app_release);
  } catch { return; }                                  // offline / github blocked — silent no-op
  if (!Number.isFinite(latest) || latest <= APP_RELEASE) return;   // already current

  // Loop guard: if we already forced a refresh for this exact version in this
  // tab and we're STILL behind, the deploy or cache is inconsistent — stop
  // rather than reload forever.
  if (Number(sessionStorage.getItem(SS_UPDATE_TRIED)) === latest){
    // Never tell the user to hard-refresh. It bypasses the service worker, and
    // on a retiring address that removes the only thing that can hand their
    // settings over — see cleanReload().
    logLine(`App is still release ${APP_RELEASE} after trying to update to ${latest}. ` +
            `If this persists, use “Reload the app cleanly” on the Settings → Preferences tab.`);
    return;
  }
  sessionStorage.setItem(SS_UPDATE_TRIED, String(latest));

  logLine(`New app release ${latest} published (running ${APP_RELEASE}) — updating and reloading…`);
  setStatus('Updating to the latest app version…', 'busy');
  appReloadArmed = true;

  // Pull the new worker; skipWaiting() in sw.js activates it on install, firing
  // controllerchange → the armed reload handler.
  try { await reg.update(); } catch {}

  // Fallback: if no controllerchange arrives (SW current but cached shell stale),
  // clear caches and reload for fresh bytes. Terminates — the reloaded app's
  // APP_RELEASE then matches the manifest and the guard above suppresses repeats.
  setTimeout(async () => {
    if (appReloaded) return;
    try {
      if (window.caches){
        const ks = await caches.keys();
        await Promise.all(ks.map(k => caches.delete(k)));
      }
    } catch {}
    appReloaded = true;
    location.reload();
  }, 8000);
}

// ===== "What's new" post-update notice =====
// After a silent self-update, the freshly-loaded build shows what changed since
// the release the user last acknowledged. Notes come from the bundled
// RELEASE_NOTES (no network). Gated by getLastSeenRelease so it shows once.
function collectWhatsNew(sinceRelease){
  return Object.keys(RELEASE_NOTES)
    .map(Number)
    .filter(n => Number.isFinite(n) && n > sinceRelease && n <= APP_RELEASE)
    .sort((a, b) => b - a)                              // newest release first
    .map(n => ({ release: n, notes: (RELEASE_NOTES[n] || []).filter(Boolean) }))
    .filter(g => g.notes.length);
}

function showWhatsNewModal(groups){
  const ov  = document.getElementById('whatsnewOverlay');
  const msg = document.getElementById('whatsnewMsg');
  msg.textContent = '';

  const intro = document.createElement('div');
  intro.className = 'wn-intro';
  intro.append('The app updated itself to release ');
  const rel = document.createElement('b'); rel.textContent = String(APP_RELEASE);
  intro.append(rel, '. Here’s what changed:');
  msg.appendChild(intro);

  const multi = groups.length > 1;
  for (const g of groups){
    if (multi){
      const h = document.createElement('div');
      h.className = 'wn-relhead';
      h.textContent = 'Release ' + g.release;
      msg.appendChild(h);
    }
    const ul = document.createElement('ul');
    for (const it of g.notes){
      const li = document.createElement('li');
      li.textContent = String(it);
      ul.appendChild(li);
    }
    msg.appendChild(ul);
  }

  const ok = document.getElementById('whatsnewOk');
  function cleanup(){
    ov.hidden = true;
    ok.removeEventListener('click', cleanup);
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e){ if (e.key === 'Escape' || e.key === 'Enter') cleanup(); }
  ok.addEventListener('click', cleanup);
  document.addEventListener('keydown', onKey);
  ov.hidden = false;
  ok.focus();
}

// Called once at app load. Shows the notice when the running release is newer
// than the last one the user acknowledged, then records the current release. A
// run with no prior record (brand-new user, OR the first release to ship this
// feature — earlier releases never stored the value) just establishes the
// baseline silently: the release that INTRODUCES the notice cannot announce it.
function maybeShowWhatsNew(){
  // Preference wins, but the record still advances below — someone who turns the
  // notice off should not be shown a backlog of old releases if they turn it on.
  if (!getShowWhatsNew()){
    const s = getLastSeenRelease();
    if (s == null || s < APP_RELEASE) setLastSeenRelease(APP_RELEASE);
    return;
  }
  const seen = getLastSeenRelease();
  if (seen == null){ setLastSeenRelease(APP_RELEASE); return; }   // baseline, no notice
  if (seen >= APP_RELEASE) return;                                // already current
  const groups = collectWhatsNew(seen);
  // Nothing to announce — leave the record WHERE IT IS rather than advancing it.
  // One repo serves both apps, so releasing one deploys the other's pre-bumped
  // appRelease (a dev number, one ahead of public, with no notes behind it yet).
  // Advancing the record on that build silently consumed the notice for the
  // release that number later became: the user ran N+1, saw nothing because
  // there was nothing to see, and the record moved to N+1 — so when N+1 really
  // shipped with its bullets, `seen >= APP_RELEASE` swallowed them. Holding the
  // record back costs one cheap re-check per load. (Ken, 2026-08-11)
  if (!groups.length) return;
  setLastSeenRelease(APP_RELEASE);                                // record before showing (a reload can't re-trigger)
  showWhatsNewModal(groups);
}

// ===== Pre-move notice =====
// Shown ONLY on the retiring address, and only until the Save button is pressed.
// Deliberately modest (Ken, 2026-08-15): the automatic move carries settings for
// almost everyone, so "back up or lose everything" would be alarming AND mostly
// untrue — and it would spend credibility that the post-move reinstall notice
// needs. It says nothing about the new address either, because the two-addresses
// business is invisible plumbing a user cannot act on. The backup IS the only
// thing they can do, so it is the only thing asked of them.
//
// ⚠ DELIBERATELY NOT per-app, unlike every other persisted key. A backup covers
// the whole address — both apps at once — so backing up in Symbols must also
// stop Tiles asking. The namespacing rule exists to stop two apps COLLIDING over
// one value; here the shared value is the correct model.
const LS_BACKED_UP    = 'bts_settings_backed_up';
const SS_NOTICE_LATER = 'bts_backup_notice_snoozed';

function backupNoticeDue(){
  if (localStorage.getItem(LS_BACKED_UP) === 'yes') return false;   // they did it — never again
  if (sessionStorage.getItem(SS_NOTICE_LATER) === 'yes') return false; // "not now" — this session only
  return MIGRATION.isOld;                                           // only on the retiring address
}

function showBackupNotice(force){
  const el = document.getElementById('backupNotice');
  if (!el) return;
  if (!force && !backupNoticeDue()){ el.hidden = true; return; }
  document.getElementById('backupNoticeText').innerHTML =
    `<b>Please save a copy of your settings.</b> They are kept by your browser rather than in `
    + `your folder, so a saved copy is what protects them. It takes one click.`;
  el.hidden = false;
}

function wireBackupNotice(){
  const el = document.getElementById('backupNotice');
  if (!el) return;
  document.getElementById('backupNoticeSave').addEventListener('click', async () => {
    try {
      await saveSettingsBackup();
      localStorage.setItem(LS_BACKED_UP, 'yes');    // recorded only on success
      el.hidden = true;
    } catch (e){
      document.getElementById('backupNoticeText').textContent =
        'Could not save your settings: ' + e.message;
    }
  });
  document.getElementById('backupNoticeLater').addEventListener('click', () => {
    sessionStorage.setItem(SS_NOTICE_LATER, 'yes');  // back on the next visit
    el.hidden = true;
  });
}

// ===== Offer to restore, when this address holds nothing =====
// The counterpart to the backup button. A backup whose restore path is hard to
// find at the moment of confusion is a seatbelt with no buckle — and the moment
// of confusion is precisely this one: an app that looks brand new.
//
// Shown only when there are no settings here at all, so a returning user is
// never nagged. It appears for a genuinely new user too, which is harmless and
// occasionally useful (setting up a second machine from a saved copy).
// ⚠ Must ignore the app's OWN bookkeeping, or this is always true and the offer
// never appears. `maybeShowWhatsNew` baselines `bts_last_seen_release:<app>` on
// the very first load — before this runs — so counting it made a brand-new,
// empty address look like one that already had settings. Caught in testing: the
// offer was suppressed for precisely the stranded user it exists for.
// migrationExcluded() already names that key as "history, not a preference".
function settingsPresent(){
  for (let i = 0; i < localStorage.length; i++){
    const k = localStorage.key(i) || '';
    if (!k.startsWith('bts_')) continue;
    if (migrationExcluded(k)) continue;
    return true;
  }
  return false;
}

function showRestoreOffer(){
  const box = document.getElementById('gateRestore');
  if (!box) return;
  if (settingsPresent()){ box.hidden = true; return; }
  // Arriving with nothing is the case worth naming out loud: they were moved and
  // their setup did not come with them, which is exactly when a backup earns its
  // keep. Everyone else gets the quiet version.
  const strandedByMove = !!MIGRATION_ARRIVAL && MIGRATION_ARRIVAL.restored.length === 0;
  document.getElementById('gateRestoreMsg').textContent = strandedByMove
    ? 'Your settings did not come across with you. If you saved a copy, you can load it now.'
    : 'Starting fresh? If you have a saved settings file, you can load it now.';
  box.hidden = false;
}

function wireRestoreOffer(){
  const box = document.getElementById('gateRestore');
  if (!box) return;
  const input = document.getElementById('gateRestoreInput');
  document.getElementById('gateRestoreBtn').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    const msg = document.getElementById('gateRestoreMsg');
    try {
      const r = await restoreSettingsBackup(f);
      msg.textContent = `Restored ${r.count} item${r.count === 1 ? '' : 's'}. ` +
        `Your folder still needs connecting below.`;
      document.getElementById('gateRestoreBtn').hidden = true;
    } catch (e){ msg.textContent = e.message; }
  });
}

// ===== Clean reload — the replacement for "hard-refresh with Ctrl-Shift-R" =====
// That advice used to be printed to users, and it is the one action that can
// destroy a move: a hard reload bypasses the service worker, and on an address
// that has stopped serving the app there is then nothing left to run the
// hand-over. Replaced by a button that does the safe thing.
//
// ORDER MATTERS. Check for a due move FIRST. Clearing caches before migrating
// would remove the very thing that lets page code run on a retiring address — a
// naive "clear cache and reload" is exactly as destructive as the hard refresh
// it replaces.
async function cleanReload(){
  if (await maybeMigrateOrigin()) return;            // probes internally; false if not due
  try { (await navigator.serviceWorker.getRegistrations()).forEach(r => r.unregister()); } catch {}
  try { if (window.caches){ const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } } catch {}
  location.reload();
}

// Test hooks for the migration rehearsal — the backup/restore path cannot be
// driven through an OS file dialog from an automated browser, so it is exercised
// through these. See BTS-MIGRATION-TEST-PLAN.docx.
window.__showBackupNotice = (force = true) => showBackupNotice(force);
window.__showRestoreOffer = () => showRestoreOffer();
window.__settingsPresent  = () => settingsPresent();
window.__backupNoticeDue  = () => backupNoticeDue();
window.__cleanReload      = () => cleanReload();
window.__settingsBackup  = () => settingsBackupObject();
window.__saveSettingsBackup   = () => saveSettingsBackup();
window.__readBackupFromFolder = () => readBackupFromFolder();
window.__migration       = () => ({ ...MIGRATION, arrival: MIGRATION_ARRIVAL });
window.__migrationPayload= () => JSON.parse(decodeURIComponent(escape(atob(migrationPayload()))));
window.__probeReady      = () => migrationTargetReady();
window.__settingsRestore = (obj) => restoreSettingsBackup(
  new File([JSON.stringify(obj)], 'backup.json', { type: 'application/json' }));
window.__getShowWhatsNew = () => getShowWhatsNew();
window.__setShowWhatsNew = (v) => setShowWhatsNew(v);

// ===== SCAD-file update (this app's designer .scad in the user's folder) =====
// The user carries a local copy of this app's designer .scad (scadBaseName) in
// their connected folder. When a newer version is published (its scad_version
// bumped + its manifest updated), the app offers to download it and overwrite
// the local copy IN PLACE — the filename is stable (no version in the name), so
// the .json presets beside it carry forward untouched. Any fetch failure
// (offline / github blocked) is a silent no-op — the user is never blocked from
// working with the file they already have.
function parseScadVersion(scadText){
  const m = (scadText || '').match(/scad_version\s*=\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// "Remind me in a week" snooze, in localStorage: { until, forVersion }. A version
// newer than the one the user postponed re-prompts immediately (forVersion gate).
// Per-app for the same reason as LS_LAST_SEEN: the two designer .scads version
// independently, so on one origin a bare key let a snooze of one silence the
// other's update prompt (Ken, 2026-08-11).
const LS_SCAD_SNOOZE = `bts_scad_snooze:${APP_CONFIG.appDir}`;
function getScadSnooze(){ try { return JSON.parse(localStorage.getItem(LS_SCAD_SNOOZE) || 'null'); } catch { return null; } }
function setScadSnooze(v){ try { localStorage.setItem(LS_SCAD_SNOOZE, JSON.stringify(v)); } catch {} }
function clearScadSnooze(){ try { localStorage.removeItem(LS_SCAD_SNOOZE); } catch {} }

// Called after a folder connects (a safe moment: freshly loaded, no unsaved edits
// specific to the .scad). Compares the loaded scad_version against the manifest.
async function checkForScadUpdate(){
  if (!folder || !folder.dir) return;
  const loaded = parseScadVersion(SCAD_TEXT);
  if (loaded == null) return;                        // can't read a version — don't nag
  let manifest;
  try {
    const r = await fetch(SCAD_MANIFEST_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    manifest = await r.json();
  } catch { return; }                                // offline / github blocked — silent no-op
  const latest = Number(manifest && manifest.version);
  if (!Number.isFinite(latest) || latest <= loaded) return;   // already current

  // Honour an active snooze, but a version newer than the postponed one re-prompts.
  const sn = getScadSnooze();
  if (sn && sn.until > Date.now() && sn.forVersion >= latest) return;

  const choice = await showScadUpdateModal({ loaded, latest, notes: manifest.notes, scadName: folder.scadName });
  if (choice === 'update'){
    await applyScadUpdate(manifest);
  } else if (choice === 'snooze'){
    setScadSnooze({ until: Date.now() + SCAD_SNOOZE_MS, forVersion: latest });
    logLine(`${capFirst(DESIGNER)} update to v${latest} postponed for one week.`);
  } else {
    logLine(`${capFirst(DESIGNER)} update to v${latest} skipped — you'll be reminded next time you open the folder.`);
  }
}

// Downloads the new .scad, verifies it carries the promised version, then
// overwrites the local file in place and reloads the folder. Download-and-verify
// happen BEFORE any write, so any failure leaves the user's files untouched.
async function applyScadUpdate(manifest){
  const dir = folder.dir, scadName = folder.scadName;
  setStatus(`Updating ${DESIGNER}…`, 'busy');
  logLine(`Updating "${scadName}" to v${manifest.version}…`);

  let bytes;
  try {
    const r = await fetch(manifest.scad_url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    bytes = new Uint8Array(await r.arrayBuffer());
  } catch (e){
    logLine(`  ERROR downloading update: ${e.message} — no changes made.`);
    setStatus('Update failed (download error) — your files are unchanged.', 'err');
    return;
  }
  // Guard a stale/mispointed manifest: the bytes must carry the exact version
  // promised, or abort without changing anything.
  const dl = parseScadVersion(new TextDecoder().decode(bytes));
  if (dl !== Number(manifest.version)){
    logLine(`  ERROR: downloaded file is v${dl}, manifest promised v${manifest.version} — aborting, no changes made.`);
    setStatus('Update failed (version mismatch) — your files are unchanged.', 'err');
    return;
  }
  try {
    const h = await dir.getFileHandle(scadName, { create: true });
    const w = await h.createWritable();
    await w.write(bytes);
    await w.close();
    if ((await h.getFile()).size === 0) throw new Error('written .scad is empty');
    logLine(`  Update complete — now running v${manifest.version}. Reloading…`);
  } catch (e){
    logLine(`  ERROR writing update: ${e.message} — reopen the folder to re-check.`);
    setStatus('Update failed — see console', 'err');
    return;
  }
  clearScadSnooze();
  await loadFromFolder(dir);   // rebuilds Customizer, banner, presets from the new file
}

// Three-choice modal (Update now / Remind me in a week / Skip). Resolves
// 'update' | 'snooze' | 'skip'. Notes is an array of user-visible change strings.
function showScadUpdateModal({ loaded, latest, notes, scadName }){
  return new Promise(resolve => {
    const ov  = document.getElementById('scadUpdateOverlay');
    const msg = document.getElementById('scadUpdateMsg');
    msg.textContent = '';

    const p1 = document.createElement('div');
    const a = document.createElement('b'); a.textContent = 'v' + loaded;
    const b = document.createElement('b'); b.textContent = 'v' + latest;
    p1.append(`Your ${DESIGNER} file is `, a, '. Version ', b, ' is now available.');
    msg.appendChild(p1);

    const noteItems = Array.isArray(notes) ? notes.filter(Boolean) : (notes ? [notes] : []);
    if (noteItems.length){
      const intro = document.createElement('div');
      intro.className = 'su-intro';
      intro.textContent = noteItems.length > 1 ? 'What’s new in this version:' : 'What’s new:';
      msg.appendChild(intro);
      const ul = document.createElement('ul');
      for (const it of noteItems){
        const li = document.createElement('li'); li.textContent = String(it); ul.appendChild(li);
      }
      msg.appendChild(ul);
    }

    const p2 = document.createElement('div');
    p2.className = 'su-foot-note';
    const nc = document.createElement('code'); nc.textContent = scadName;
    p2.append('“Update now” downloads the new file from GitHub, replaces ', nc,
              ' in your folder, keeps your saved presets, and reloads.');
    msg.appendChild(p2);

    const now = document.getElementById('scadUpdateNow');
    const snooze = document.getElementById('scadUpdateSnooze');
    const skip = document.getElementById('scadUpdateSkip');
    function cleanup(val){
      ov.hidden = true;
      now.removeEventListener('click', onNow);
      snooze.removeEventListener('click', onSnooze);
      skip.removeEventListener('click', onSkip);
      document.removeEventListener('keydown', onKey);
      resolve(val);
    }
    const onNow = () => cleanup('update');
    const onSnooze = () => cleanup('snooze');
    const onSkip = () => cleanup('skip');
    const onKey = e => { if (e.key === 'Escape') cleanup('skip'); };
    now.addEventListener('click', onNow);
    snooze.addEventListener('click', onSnooze);
    skip.addEventListener('click', onSkip);
    document.addEventListener('keydown', onKey);
    ov.hidden = false;
    now.focus();
  });
}

// ------------------------------------------------------------------ 3D scene
const viewport = document.getElementById('viewport');
const scene = new THREE.Scene();
// OpenSCAD "Cornfield" viewport background (#FFFCE0) — the same colour the
// desktop Customizer shows, so screenshots of the two line up.
scene.background = new THREE.Color(0xfffce0);

const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 5000);
camera.up.set(0, 0, 1);                       // OpenSCAD is Z-up
camera.position.set(120, -160, 110);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
viewport.appendChild(renderer.domElement);

// Free tumble (the keyguard designer's default rotation style): TrackballControls
// rolls freely in any direction with no fixed world-up and no hard vertical stop,
// unlike OrbitControls' turntable. The base rotate speed is 4.0 × the 0.6
// sensitivity default the keyguard ships — Trackball needs a much larger raw
// speed than Orbit to cover the same drag distance.
const controls = new TrackballControls(camera, renderer.domElement);
controls.staticMoving = true;        // no inertia: rotation stops the instant the mouse is released
controls.rotateSpeed = 4.0 * 0.6;
controls.zoomSpeed   = 1.2;
controls.panSpeed    = 0.6;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.addEventListener('change', requestFrame);
// TrackballControls applies rotation inside update() rather than on pointer move
// (OrbitControls does the opposite), so the render-on-demand loop has to keep
// pumping frames for as long as a drag is in progress. 'start'/'end' bracket
// every interaction — including the wheel, which fires both back to back and so
// resolves in the single frame 'end' schedules.
let interacting = false;
controls.addEventListener('start', () => { interacting = true;  requestFrame(); });
controls.addEventListener('end',   () => { interacting = false; requestFrame(); });

// ── Lighting (camera-relative, mirroring the keyguard designer) ────────────
// The lights are children of the camera, so they orbit with the view the way
// OpenSCAD's native viewer does: the camera-facing face stays lit however the
// user rotates, and the rear face falls to a dim hemisphere floor instead of
// black. Three.js r155+ uses physical units — a DirectionalLight contributes
// albedo × (intensity/π) × dot, so intensities must be ~π× the legacy 0–1
// scale. The previous scene-fixed rig (ambient 0.62 + 0.75 + 0.32) predated
// that change, which is why the model read dark and washed out: a big flat
// ambient floor plus directionals worth only ~0.24× each.
//
// Sky white / ground black keeps down-facing surfaces dark rather than lifting
// the whole model to gray.
const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.15);
hemi.position.set(0, 1, 0);
camera.add(hemi);

// Both the light and its target are camera children, so the light direction is
// fixed in camera space no matter where the camera is in the world.
const lightTarget = new THREE.Object3D();
lightTarget.position.set(0, 0, -1);
camera.add(lightTarget);

// Top-face dot ≈ 0.83 from this geometry → (3.5/π) × 0.83 ≈ 0.92× albedo, so
// DimGray renders near its true #696969 as it does in OpenSCAD. No fill light,
// so shadowed faces stay dark and the chamfers/side rims read distinctly.
const key = new THREE.DirectionalLight(0xffffff, 3.5);
key.position.set(1.0, 1.2, 0);
key.target = lightTarget;
camera.add(key);

// A camera's children only render while the camera is in the scene graph.
scene.add(camera);

// The symbol and its Bliss graphic are drawn as two separate meshes so each can
// take its own Customizer display colour — the viewport equivalent of OpenSCAD's
// color(); the exported STL carries no colour. Colour names mirror bliss.scad's
// symbol_colors / graphic_colors tables (Three.Color understands CSS/X11 names).
const SYMBOL_COLORS  = ['DimGray','Snow','Red','Yellow','RoyalBlue','Lime','DarkOrange','SaddleBrown','Pink','DarkViolet'];
const GRAPHIC_COLORS = ['DimGray','Snow'];
let modelGroup = null, hadModel = false;
// Keyguard-matching surface: shininess 30 with Three's default specular
// (0x111111). The old 0x333333 specular added a gray sheen that further
// desaturated the displayed colour.
const symbolMat  = new THREE.MeshPhongMaterial({ shininess: 30, flatShading: false });
const graphicMat = new THREE.MeshPhongMaterial({ shininess: 30, flatShading: false });

// Bulletproof sizing: reconcile the drawing buffer to the container every
// frame (only when it actually differs). This avoids init-timing races where
// the container has no layout size yet — a ResizeObserver alone proved
// unreliable in some embedded browser panes.
function syncSize(){
  const w = viewport.clientWidth, h = viewport.clientHeight;
  if (w === 0 || h === 0) return;
  const dpr = renderer.getPixelRatio();
  if (renderer.domElement.width !== Math.round(w * dpr) ||
      renderer.domElement.height !== Math.round(h * dpr)) {
    renderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    // TrackballControls caches the canvas rect to map pointer coords onto the
    // virtual trackball; without this the rotation is offset after any resize
    // (window resize or a splitter drag).
    controls.handleResize();
  }
}
// Render on demand: schedule a single frame only when something changed
// (orbit, resize, new mesh). When idle, no rAF is queued, so the page can go
// idle — which keeps CPU near zero and lets screenshot/capture tools work.
let frameQueued = false;
function requestFrame(){ if (frameQueued) return; frameQueued = true; requestAnimationFrame(frame); }
function frame(){
  frameQueued = false;
  syncSize();
  controls.update();                  // Trackball applies rotate/zoom/pan here
  renderer.render(scene, camera);
  if (interacting) requestFrame();    // self-sustaining only while dragging
}
addEventListener('resize', requestFrame);
requestFrame();

// ------------------------------------------------- viewport/Customizer splitter
// Drag sets an explicit width on the pane; the viewport is flex:1 so it takes
// up the slack, and syncSize() reconciles the drawing buffer on the next frame.
// Clamps match the keyguard's.
const PANE_W_MIN = 180, PANE_W_MAX = 700;
document.getElementById('hsplit-cust').addEventListener('mousedown', e => {
  e.preventDefault();
  document.body.classList.add('dragging');
  const startX = e.clientX;
  const pane = document.getElementById('customizer');
  const startW = pane.getBoundingClientRect().width;
  function move(ev){
    // Pane is to the RIGHT of the splitter, so dragging left (negative dx) widens it.
    const w = Math.max(PANE_W_MIN, Math.min(PANE_W_MAX, startW - (ev.clientX - startX)));
    pane.style.flexBasis = w + 'px';
    requestFrame();
  }
  function up(){
    document.body.classList.remove('dragging');
    removeEventListener('mousemove', move);
    removeEventListener('mouseup', up);
  }
  addEventListener('mousemove', move);
  addEventListener('mouseup', up);
});

// Capture the current viewport as a PNG data URL (renders synchronously so the
// backbuffer is valid for toDataURL). controls.update() runs first so the
// capture reflects any pending tumble rather than the pre-drag view — the rAF
// loop that normally applies it is throttled in a backgrounded tab.
// Exposed for automated tests/screenshots.
window.__captureViewportPNG = () => {
  syncSize(); controls.update(); renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
};
// Camera orientation probe, for tests that need to assert on the view itself
// (e.g. that free tumble rolled `up` off world-Z, which a turntable cannot do).
window.__viewState = () => ({
  pos: camera.position.toArray(), up: camera.up.toArray(), target: controls.target.toArray(),
});

function fitCamera(object, keepAngle){
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  controls.target.copy(center);
  const maxDim = Math.max(size.x, size.y, size.z);
  const dist = (maxDim / (2 * Math.tan((camera.fov * Math.PI / 180) / 2))) * 1.5;
  // Framing fresh (not keeping the user's angle) also restores Z-up, which free
  // tumble may have rolled away from.
  if (!keepAngle) camera.up.set(0, 0, 1);
  const dir = keepAngle
    ? camera.position.clone().sub(controls.target).normalize()
    : new THREE.Vector3(0.55, -0.75, 0.5).normalize();
  camera.position.copy(center).add(dir.multiplyScalar(dist || 150));
  camera.near = (dist || 150) / 100; camera.far = (dist || 150) * 100;
  camera.updateProjectionMatrix();
  controls.update(); requestFrame();
}

// Each preset carries its own up vector. Free tumble leaves camera.up pointing
// wherever the last roll put it, so a preset has to restore it or the model
// arrives at the right angle but arbitrarily rolled. Top and bottom look along
// world-Z, where Z-up would be degenerate, so they use Y-up instead. Bottom
// shares top's +Y up (Ken, 2026-07-22), which lands the underside rotated 180°
// in the X/Y plane relative to the mirror-image framing a flipped Y would give.
const VIEWS = {
  front:  { dir: [0, -1, 0],          up: [0, 0, 1] },
  bottom: { dir: [0, 0, -1],          up: [0, 1, 0] },
  top:    { dir: [0, 0, 1],           up: [0, 1, 0] },
  side:   { dir: [1, 0, 0],           up: [0, 0, 1] },
  iso:    { dir: [0.55, -0.75, 0.5],  up: [0, 0, 1] },
};
document.querySelectorAll('#viewport-toolbar button[data-view]').forEach(b => b.addEventListener('click', () => {
  if (!modelGroup) return;
  const view = VIEWS[b.dataset.view];
  const box = new THREE.Box3().setFromObject(modelGroup);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const dist = (maxDim / (2 * Math.tan((camera.fov * Math.PI / 180) / 2))) * 1.5;
  controls.target.copy(center);
  camera.up.set(...view.up);
  camera.position.copy(center).add(new THREE.Vector3(...view.dir).normalize().multiplyScalar(dist));
  camera.updateProjectionMatrix();
  controls.update(); requestFrame();
}));

// ------------------------------------------------------- Step 0: SVG prep
// Automatic prep of a raw BSI Blissymbol SVG so it can go straight into the
// graphic pipeline. First pass: strip the indicator glyph that rides above the
// symbol (tense — a square, a "v", an inverted "v", optionally with a dot).
//
// Why this can be done geometrically rather than by shape recognition:
// BSI SVGs are laid out on the standard Bliss guideline matrix. In a 324-unit
// tall drawing the four guidelines fall at y = 66 (top of the indicator row),
// 130 (sky line), 194 (earth line) and 258 (ground line) — a 64-unit band
// between each. Indicators are the only thing that ever sits in the row ABOVE
// the sky line, so "bounding box entirely above the sky line" identifies them
// exactly, with no need to recognise the glyph itself.
//
// Note this removes ALL above-sky-line indicators, not only tense; plural,
// question and the other indicators share that row. That is what we want today.
// The one exception is an indicator the Create-Graphic dialog added, which is
// stamped with BTS_INDICATOR_ATTR and always kept — see that constant.
const BLISS_SKY_LINE   = 130;   // sky line, in the canonical 324-tall matrix
const BLISS_MATRIX_TALL = 324;
// Step-0 stroke fattening. BSI exports draw at ~7 units on the 324 matrix (what
// PowerPoint reports as 7 pt); the manual prep step thickens that to 11 before
// the symbol is printed. This is NOT cosmetic here: bliss.scad pins the PRINTED
// stroke at target_stroke_mm (~1.807 mm) via scale = 1.807/svg_stroke_width, so
// the SVG's stroke width is really what sets the stroke-to-symbol RATIO, and
// hence the finished symbol's size. Leaving a BSI file at 7 normalizes its
// thinner stroke up to 1.807 mm and blows the symbol up ~1.57x. Fattening to 11
// puts BSI input on the same footing as the already-prepped legacy SVGs:
// measured content height comes out ~22 mm either way.
const BLISS_SOURCE_STROKE = 7;
const BLISS_PREPPED_STROKE = 11;
// Guideline band, mirroring bliss.scad. Sky line y=130 -> earth line y=194 on
// the 324 matrix is 64 units, and maps to the lines engraved at y = +/-12 on
// the symbol, i.e. 24 mm. Keep in step with bliss.scad's earth_sky_half_span /
// bliss_band_units — these are only used for reporting on this side.
// The earth line is the deeper (lower) engraved line — y=258 on the 324 matrix,
// the symbol's baseline — not the intermediate guideline at y=194. The band the
// 24 mm engraved spacing maps to is therefore sky(130)->earth(258) = 128 units.
const BLISS_EARTH_LINE = 258;
const BLISS_BAND_UNITS = BLISS_EARTH_LINE - BLISS_SKY_LINE;   // 128
const EARTH_SKY_HALF_SPAN = 12;
// Minimum clear border between the graphic's ink and the body edge, each side.
const BLISS_MIN_BORDER_MM = 3;
const DRAWABLE = 'path,line,circle,ellipse,rect,polygon,polyline';
// Every indicator the Create-Graphic dialog adds is stamped with this attribute,
// which is what tells `stripIndicators` to leave it alone: "Remove Bliss
// Indicators" strips the indicator BUILT INTO a BCI graphic, but never one the
// user added in that dialog (Ken, 2026-07-23). Without the stamp the two are
// indistinguishable — both are just marks above the sky line — so an added
// indicator was being removed along with the built-in one it collided with. The
// stamp is written into the saved .svg, so it survives the round trip through the
// folder, and OpenSCAD's importer ignores attributes it does not know.
const BTS_INDICATOR_ATTR = 'data-bts-indicator';
// Gap inserted between two symbols when appending them into a sequence ("1"+"0"
// -> "10"), in matrix units. Each part is advanced by its own viewBox width —
// which already carries the designer's built-in side margins — PLUS this. Small
// on purpose; bump it if sequenced symbols read as too tight. (Ken, 2026-07-22.)
const BLISS_SEQUENCE_GAP_UNITS = 8;

// Offscreen host so we can use the browser's own geometry engine (getBBox +
// getScreenCTM) instead of re-implementing path maths and transform flattening.
let prepHost = null;
function getPrepHost(){
  if (!prepHost) {
    prepHost = document.createElement('div');
    prepHost.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden';
    document.body.appendChild(prepHost);
  }
  return prepHost;
}

// Bounding box of `el` in the root SVG's viewBox coordinates, grown by half the
// stroke width. The stroke matters: Bliss dots are drawn as ZERO-LENGTH lines
// that are only visible because stroke-linecap="round", so their raw getBBox()
// is a point of zero area.
function bboxInRootUnits(el, root){
  let box;
  try { box = el.getBBox(); } catch (e) { return null; }
  const toRoot = root.getScreenCTM()?.inverse().multiply(el.getScreenCTM());
  if (!toRoot) return null;
  const pt = root.createSVGPoint();
  let minX =  Infinity, minY =  Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of [[box.x, box.y], [box.x + box.width, box.y],
                        [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]) {
    pt.x = x; pt.y = y;
    const p = pt.matrixTransform(toRoot);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  // Pad by half the stroke — but only when the element is actually stroked.
  // Filled outline paths carry stroke:none yet still compute strokeWidth=1, so
  // padding them would overstate their extent (and tip the concept-width choice).
  const cs = getComputedStyle(el);
  const stroked = cs.stroke !== 'none' && cs.stroke !== '';
  const pad = stroked ? (parseFloat(cs.strokeWidth) || 0) / 2 : 0;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

// Name the glyph we removed, for the log. Purely informational — the removal
// decision above does not depend on it. Only attempted for all-<line> clusters,
// which is how every BSI indicator we've seen is drawn.
function describeIndicator(els){
  const lines = els.filter(e => e.tagName.toLowerCase() === 'line');
  if (lines.length !== els.length) return `${els.length} element(s)`;
  const seg = lines.map(l => ({
    x1: +l.getAttribute('x1'), y1: +l.getAttribute('y1'),
    x2: +l.getAttribute('x2'), y2: +l.getAttribute('y2'),
  }));
  const dots = seg.filter(s => s.x1 === s.x2 && s.y1 === s.y2);
  const strokes = seg.filter(s => !(s.x1 === s.x2 && s.y1 === s.y2));
  let shape = `${strokes.length} stroke(s)`;
  if (strokes.length === 4) shape = 'square';
  else if (strokes.length === 2) {
    // Two strokes sharing an endpoint: the apex is the shared point. Match on the
    // full coordinate pair, not y alone — the two free ends of a "v" sit at the
    // same y as each other, so a y-only match picks the wrong point. SVG y grows
    // downward, so apex at max y is a "v" and apex at min y is an inverted "v".
    const ends = s => [[s.x1, s.y1], [s.x2, s.y2]];
    const apex = ends(strokes[0]).find(a => ends(strokes[1]).some(b => a[0] === b[0] && a[1] === b[1]));
    if (!apex) return `${els.length} element(s)`;   // not a connected pair
    const ys = strokes.flatMap(s => [s.y1, s.y2]);
    shape = apex[1] === Math.max(...ys) ? '"v"' : 'inverted "v"';
  } else if (strokes.length === 0 && dots.length) shape = 'dot';
  if (strokes.length && dots.length) shape += ` + ${dots.length > 1 ? dots.length + ' dots' : 'dot'}`;
  return shape;
}

// Returns { svg, removed, shape } — `svg` is the prepped serialised SVG.
function stripIndicators(text){
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return { svg: text, removed: 0, shape: null };
  const root = getPrepHost().appendChild(document.importNode(doc.documentElement, true));
  try {
    // The sky line is only meaningful if we can actually locate the guideline
    // matrix, which means the drawing must declare a viewBox. BSI exports always
    // do. Files that don't (e.g. the already-prepped legacy SVGs, which are sized
    // in raw px and have had their indicators removed by hand upstream) give us
    // no frame of reference — assuming a 324-tall matrix there would slice at an
    // arbitrary height and eat real geometry. Leave them alone.
    const vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || !(vb[3] > 0)) {
      return { svg: text, removed: 0, shape: null, skipped: 'no viewBox' };
    }
    // Scale the sky line to this drawing's own matrix rather than assuming 324.
    const skyLine = vb[1] + vb[3] * (BLISS_SKY_LINE / BLISS_MATRIX_TALL);

    const all = [...root.querySelectorAll(DRAWABLE)];
    const doomed = all.filter(el => {
      // Indicators added in the Create-Graphic dialog are stamped, and are kept:
      // this param is about the indicator BUILT INTO a BCI graphic, not one the
      // user deliberately placed (Ken, 2026-07-23). Stripping the built-in one
      // while keeping the added one is exactly what resolves a collision between
      // the two, since both want the same spot in the indicator row.
      if (el.closest(`[${BTS_INDICATOR_ATTR}]`)) return false;
      const b = bboxInRootUnits(el, root);
      return b && b.maxY <= skyLine;     // entirely above the sky line
    });
    if (!doomed.length) return { svg: text, removed: 0, shape: null };
    // Safety net: an indicator is a small mark on top of a symbol, so something
    // must survive below the sky line. If nothing does, our matrix assumption is
    // wrong and we are about to delete the whole graphic.
    if (doomed.length === all.length) {
      return { svg: text, removed: 0, shape: null, skipped: 'would remove entire graphic' };
    }

    const shape = describeIndicator(doomed);
    doomed.forEach(el => el.remove());
    // Drop any group left holding nothing drawable.
    root.querySelectorAll('g').forEach(g => { if (!g.querySelector(DRAWABLE)) g.remove(); });

    return { svg: new XMLSerializer().serializeToString(root), removed: doomed.length, shape };
  } finally {
    root.remove();
  }
}

// Thicken every stroke so the dominant width lands on BLISS_PREPPED_STROKE,
// scaled to this drawing's own matrix — the automated equivalent of retracing a
// BSI symbol at 11 pt in PowerPoint. Individual widths are scaled by a common
// ratio rather than all forced to one value, so any deliberate variation in the
// source survives.
//
// This pass also BAKES the computed paint state into presentation attributes,
// which matters more than the thickening itself. BSI exports carry their paint
// in a CSS class (`.pen1 { stroke: rgb(0,0,0); stroke-width: 7 }`), while the
// legacy SVGs known to work through this pipeline put it in presentation
// attributes on every path. OpenSCAD's SVG importer is minimal and does not
// implement CSS selectors, and SVG's default `stroke` is `none` — so a BSI file
// read by a CSS-blind parser has fill:none and no stroke, i.e. nothing to
// import. Flattening computed style onto each element makes BSI input
// structurally identical to the legacy form. Widths are written to both the
// inline style and the attribute so the value is correct under either reading.
//
// Returns { svg, from, to } — from/to null when nothing was changed.
function fattenStrokes(text){
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return { svg: text, from: null, to: null };
  const root = getPrepHost().appendChild(document.importNode(doc.documentElement, true));
  try {
    // Same reasoning as stripIndicators: without a viewBox we cannot tell what
    // matrix the drawing is on, so we cannot say what "11" means here.
    const vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || !(vb[3] > 0)) return { svg: text, from: null, to: null, skipped: 'no viewBox' };

    const stroked = [...root.querySelectorAll(DRAWABLE)].filter(el => {
      const cs = getComputedStyle(el);
      return cs.stroke !== 'none' && cs.stroke !== '' && parseFloat(cs.strokeWidth) > 0;
    });
    if (!stroked.length) return { svg: text, from: null, to: null };

    const counts = new Map();
    for (const el of stroked) {
      const v = parseFloat(getComputedStyle(el).strokeWidth);
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    const dominant = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    const target = BLISS_PREPPED_STROKE * (vb[3] / BLISS_MATRIX_TALL);
    const ratio  = target / dominant;
    if (Math.abs(ratio - 1) < 1e-3) return { svg: text, from: null, to: null };  // already prepped

    for (const el of stroked) {
      const cs = getComputedStyle(el);
      const v = +(parseFloat(cs.strokeWidth) * ratio).toFixed(4);
      el.style.strokeWidth = v;
      el.setAttribute('stroke-width', v);
      // Bake the rest of the paint state so a CSS-blind importer still sees it.
      el.setAttribute('stroke', cs.stroke);
      el.setAttribute('fill', cs.fill === 'none' ? 'none' : cs.fill);
      el.setAttribute('stroke-linecap', cs.strokeLinecap);
      el.setAttribute('stroke-linejoin', cs.strokeLinejoin);
    }
    return { svg: new XMLSerializer().serializeToString(root), from: dominant, to: +target.toFixed(4) };
  } finally {
    root.remove();
  }
}

// Pin the SVG's unit system so OpenSCAD's import scale is exact and knowable.
//
// Measured behaviour of the importer (probe: a 200-unit line, scale forced to 1):
//   width="400"   + viewBox 400 -> 0.35278 mm/unit  (72 dpi fallback)
//   width="400mm" + viewBox 400 -> 1.00000 mm/unit
//   width="4.1667in" + viewBox 400 -> 0.26458 mm/unit
//   viewBox only,  no width/height -> 0.35278 mm/unit  (72 dpi fallback)
// It maps the viewBox across the physical width/height when those carry real
// units, and falls back to 72 dpi otherwise. A raw BSI export (324 units over
// height="4.5in") therefore lands on 25.4/72 — one user unit is one point,
// which is why PowerPoint reports the stroke in points.
//
// Rewriting width/height as mm equal to the viewBox extent makes it exactly
// 1 mm per unit, so bliss.scad's scale math needs no dpi guesswork.
function normalizeUnits(text){
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return { svg: text, mmPerUnit: null };
  const root = doc.documentElement;
  const vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || !(vb[2] > 0) || !(vb[3] > 0)) return { svg: text, mmPerUnit: null };
  root.setAttribute('width',  vb[2] + 'mm');
  root.setAttribute('height', vb[3] + 'mm');
  return { svg: new XMLSerializer().serializeToString(root), mmPerUnit: 1 };
}

// ---- Stroke to outline ------------------------------------------------
// Replace every stroked element with a FILLED path tracing that stroke's
// outline, the way Inkscape's "Stroke to Path" does.
//
// Why: OpenSCAD's SVG importer handles stroke inconsistently. Probe — a circle
// at stroke 6 and at stroke 30 imports byte-identically (46.5 mm, 476 tris both
// times), while a line at those widths gives 3.75 mm vs 12.75 mm. It honours
// stroke on <line> but treats <circle> as a FILLED shape, so a Bliss symbol
// with a circle prints as a solid disc and bright.svg's concentric circles
// merge into one blob. Once every shape is a filled region, the importer's
// stroke handling stops mattering at all.
//
// Centrelines are sampled with the browser's own getPointAtLength, so this
// works for line/circle/ellipse/rect/polygon/polyline/path alike rather than
// re-implementing arc and bezier maths per shape type.
//
// An open stroke becomes THREE separate filled elements: a butt-capped body
// polygon plus a full circle at each endpoint (the round cap). They are emitted
// as sibling elements so OpenSCAD's import UNIONS them — which is robust. The
// earlier approach threaded a semicircular arc into the body polygon; getting
// the arc's sweep direction wrong made it bulge inward, self-intersecting the
// polygon so the fill grew a long spike at every free end (e.g. the stem top of
// "acquiring" poked ~5 mm past the sky line). Endpoint circles have no
// orientation to get wrong.

function samplePoints(el, closed){
  const len = el.getTotalLength();
  if (!(len > 0)) return null;                        // degenerate: a dot
  const n = Math.max(8, Math.min(600, Math.ceil(len / 0.75)));
  const pts = [];
  // A closed path's first and last sample coincide, so drop the duplicate.
  for (let i = 0; i < (closed ? n : n + 1); i++) {
    const p = el.getPointAtLength(Math.min(len * i / n, len));
    pts.push([p.x, p.y]);
  }
  return pts;
}

// Unit normal at each sample, from the tangent through its neighbours.
function normalsFor(pts, closed){
  const N = pts.length;
  return pts.map((p, i) => {
    const a = closed ? pts[(i - 1 + N) % N] : pts[Math.max(0, i - 1)];
    const b = closed ? pts[(i + 1) % N]     : pts[Math.min(N - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const m = Math.hypot(tx, ty) || 1;
    return [-ty / m, tx / m];                          // perpendicular, unit
  });
}

const fmt = v => +v.toFixed(3);
const polyD = pts => 'M' + pts.map(p => `${fmt(p[0])},${fmt(p[1])}`).join('L') + 'Z';

// The outline of one stroked element as a list of primitives to emit:
//   { d }        a filled path (body, or annulus for closed shapes)
//   { cx,cy,r }  a filled circle (round cap, or a dot)
// Multiple primitives per element are unioned by the importer.
function outlinePrimitives(el, h, closed){
  const pts = samplePoints(el, closed);
  if (!pts) {
    // Zero-length line: a Bliss dot, visible only via stroke-linecap="round".
    const p = el.getPointAtLength(0);
    return [{ cx: p.x, cy: p.y, r: h }];
  }
  const nrm = normalsFor(pts, closed);
  const left  = pts.map((p, i) => [p[0] + h * nrm[i][0], p[1] + h * nrm[i][1]]);
  const right = pts.map((p, i) => [p[0] - h * nrm[i][0], p[1] - h * nrm[i][1]]);
  if (closed) {
    // Nested loops -> annulus under fill-rule="evenodd" (already declared).
    return [{ d: polyD(left) + polyD(right.slice().reverse()) }];
  }
  // Butt-capped body, then a round cap at each free end.
  const last = pts.length - 1;
  return [
    { d: polyD([...left, ...right.slice().reverse()]) },
    { cx: pts[0][0],    cy: pts[0][1],    r: h },
    { cx: pts[last][0], cy: pts[last][1], r: h },
  ];
}

// Shapes that enclose an area, and so outline as two nested loops.
const CLOSED_TAGS = new Set(['circle', 'ellipse', 'rect', 'polygon']);
function isClosed(el){
  const tag = el.tagName.toLowerCase();
  if (CLOSED_TAGS.has(tag)) return true;
  if (tag === 'path') return /z\s*$/i.test(el.getAttribute('d') || '');
  return false;
}

// Returns { svg, converted }.
function strokeToOutline(text){
  const SVGNS = 'http://www.w3.org/2000/svg';
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return { svg: text, converted: 0 };
  const root = getPrepHost().appendChild(document.importNode(doc.documentElement, true));
  try {
    let converted = 0;
    for (const el of [...root.querySelectorAll(DRAWABLE)]) {
      const cs = getComputedStyle(el);
      const w = parseFloat(cs.strokeWidth);
      if (cs.stroke === 'none' || cs.stroke === '' || !(w > 0)) continue;
      if (typeof el.getTotalLength !== 'function') continue;
      let prims;
      try { prims = outlinePrimitives(el, w / 2, isClosed(el)); } catch (e) { continue; }
      if (!prims || !prims.length) continue;
      const fill = cs.stroke;                   // the stroke's colour becomes the fill
      for (const pr of prims) {
        let node;
        if (pr.d != null) {
          node = doc.createElementNS(SVGNS, 'path');
          node.setAttribute('d', pr.d);
          node.setAttribute('fill-rule', 'evenodd');
        } else {
          node = doc.createElementNS(SVGNS, 'circle');
          node.setAttribute('cx', fmt(pr.cx));
          node.setAttribute('cy', fmt(pr.cy));
          node.setAttribute('r',  fmt(pr.r));
        }
        node.setAttribute('fill', fill);
        node.setAttribute('stroke', 'none');
        el.parentNode.insertBefore(node, el);
      }
      el.remove();
      converted++;
    }
    if (!converted) return { svg: text, converted: 0 };
    return { svg: new XMLSerializer().serializeToString(root), converted };
  } finally {
    root.remove();
  }
}

// Vertical registration. OpenSCAD's import(center=true) anchors on the content
// bounding box, not the viewBox, so a symbol whose ink sits mostly below the
// earth line gets centred on its ink and its guidelines miss the engraved ones.
//
// After center=true a point at SVG y_s lands at OpenSCAD y_o = (Cy - y_s)*scale
// (the import flips Y, and Cy is the content bbox centre). Putting the guideline
// band's centre at the origin therefore needs an extra shift of (bandCentre - Cy)
// SVG units, which lands the sky line at +12 mm and the earth line at -12 mm.
//
// Registration on BOTH axes, against the guideline matrix (Ken, 2026-08-11).
// Returns { ox, oy } in SVG user units, or null if the matrix can't be located.
//
// The anchor is the matrix, not the drawing's own ink: x = the viewBox's
// horizontal center, y = the sky-earth band center. That is the frame the sky and
// earth lines engraved on a symbol or tile live in, so registering to it is what
// puts a graphic — or a component split out of one — in the same frame as those
// lines. Anchoring to the ink instead would center every piece on itself, which is
// exactly why a split component landed dead center rather than where it belongs.
//
// Both offsets cancel `import(center=true)`, but with OPPOSITE signs, because the
// importer flips Y and not X. After centering, a point (x_s, y_s) lands at
// ((x_s - Cx)*s, (Cy - y_s)*s). We want ((x_s - anchorX)*s, (anchorY - y_s)*s), so
// the corrections are ox = Cx - anchorX and oy = anchorY - Cy. Applying them makes
// the mapping independent of the file's own ink — i.e. absolute.
function matrixOffsets(text){
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return null;
  const root = getPrepHost().appendChild(document.importNode(doc.documentElement, true));
  try {
    const vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || !(vb[2] > 0) || !(vb[3] > 0)) return null;
    const anchorX = vb[0] + vb[2] / 2;
    const anchorY = vb[1] + vb[3] * ((BLISS_SKY_LINE + BLISS_EARTH_LINE) / 2 / BLISS_MATRIX_TALL);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const el of root.querySelectorAll(DRAWABLE)) {
      const b = bboxInRootUnits(el, root);
      if (!b) continue;
      minX = Math.min(minX, b.minX); maxX = Math.max(maxX, b.maxX);
      minY = Math.min(minY, b.minY); maxY = Math.max(maxY, b.maxY);
    }
    if (!isFinite(minY) || !isFinite(minX)) return null;
    return {
      ox: +((minX + maxX) / 2 - anchorX).toFixed(4),
      oy: +(anchorY - (minY + maxY) / 2).toFixed(4),
    };
  } finally {
    root.remove();
  }
}

// Vertical-only registration, for the Symbols graphic (its graphic() translates on
// Y alone). Returns the offset in SVG user units, or null.
function registrationOffset(text){
  const o = matrixOffsets(text);
  return o ? o.oy : null;
}

// ------------------------------------------------------------------ SVG input
let svgText = null;     // the raw SVG text, written to the WASM FS as graphic.svg
let svgRaw  = null;     // as uploaded, before Step-0 prep
let svgName = null;     // original filename (for export naming)
let svgStroke = 50.4167;// dominant stroke-width parsed from the SVG (drives Step-0 fattening)
let svgMmPerUnit = 1;   // mm per SVG user unit as OpenSCAD will import them
let svgRegOffset = 0;   // vertical registration offset, in SVG user units
let svgPrepStroke = null; // stroke width measured before outlining consumed it
let conceptWidthOverride = 0; // body-width multiple derived from the graphic (0 = none)

// Parse the dominant stroke-width from a prepped Bliss SVG. The scale factor
// that makes the printed stroke a constant ~1.8 mm is derived from this in
// bliss.scad, so the user never picks the old type1/type2 factor by hand.
//
// This asks the DOM what each element is ACTUALLY drawn with rather than
// pattern-matching the source text, and weights by how many elements use each
// width. BSI exports declare an unused `.pen0 { stroke-width: 1 }` alongside the
// real `.pen1 { stroke-width: 7 }`; counting declarations ties them 1-1 and can
// pick the dead one, scaling the whole graphic 7x. Reading computed style also
// picks up presentation attributes and inline styles for free.
function parseStrokeWidth(text){
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return parseStrokeWidthFromText(text);
  const root = getPrepHost().appendChild(document.importNode(doc.documentElement, true));
  try {
    const widths = new Map();
    for (const el of root.querySelectorAll(DRAWABLE)) {
      const cs = getComputedStyle(el);
      if (cs.stroke === 'none' || cs.stroke === '') continue;   // unstroked: no contribution
      const v = parseFloat(cs.strokeWidth);                     // user units, not viewBox-scaled
      if (v > 0) widths.set(v, (widths.get(v) || 0) + 1);
    }
    if (!widths.size) return parseStrokeWidthFromText(text);
    return [...widths].sort((a, b) => b[1] - a[1])[0][0];       // most-used wins
  } finally {
    root.remove();
  }
}

// Fallback for SVGs the parser rejects: the original text scan.
function parseStrokeWidthFromText(text){
  const widths = {};
  const re = /stroke-width\s*[:=]\s*["']?\s*([0-9.]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const v = parseFloat(m[1]);
    if (v > 0) widths[v] = (widths[v] || 0) + 1;
  }
  const entries = Object.entries(widths);
  if (!entries.length) return null;               // no stroke -> caller decides
  entries.sort((a, b) => b[1] - a[1]);            // most common wins
  return parseFloat(entries[0][0]);
}

// Adopt SVG text as the current graphic. Shared by the header file picker, the
// Graphic Info "Open" folder picker, and preset application. `name` is the base
// filename (extension optional); it feeds export naming and the graphic_svg box.
function loadSvgText(text, name){
  if (!/<svg[\s>]/i.test(text)) { setStatus('That file is not an SVG.', 'err'); return false; }
  svgRaw = text; svgName = String(name).replace(/\.svg$/i, '');
  logLine(`Loaded ${svgName}.svg`);
  setGraphicSvgName(svgName);   // keep the Graphic Info text box in step
  applyPrep();
  scheduleRender();
  return true;
}
async function loadSvgFile(file){
  if (!file) return;
  loadSvgText(await file.text(), file.name);
}
// Load a curated graphic by its base name (no extension) from the connected
// folder's "SVG files" subfolder (read through its FileSystemDirectoryHandle).
// A compound graphic is just another file here — it was flattened to one .svg by
// the Create-Graphic dialog, so assigning it is an ordinary single-file load.
async function loadSvgByName(name, srcHandle){
  if (!name) return false;
  const sources = (folder && folder.svgPickerSources) || [];
  const ownFallback = (folder && folder.svgDir) ? [folder.svgDir] : [];
  // An interactive pick names the folder it came from. A bare reference (a typed
  // name, or a preset's graphic_svg) searches the picker's source folders in
  // order — the default/first folder wins on a same-name collision.
  const tryDirs = srcHandle ? [srcHandle]
    : (sources.length ? sources.map(s => s.handle) : ownFallback);
  if (!tryDirs.length) { setStatus(`Open a folder with a “${APP_CONFIG.svgOwnDir}” subfolder first.`, 'err'); return false; }
  for (const dir of tryDirs){
    try {
      const fh = await dir.getFileHandle(name + '.svg');
      return loadSvgText(await (await fh.getFile()).text(), name);
    } catch {}
  }
  const where = sources.length ? sources.map(s => s.name).join('” / “') : APP_CONFIG.svgOwnDir;
  setStatus(`Couldn't load “${name}.svg” from the “${where}” folder.`, 'err');
  logLine(`Load failed: ${name}.svg`);
  return false;
}
// Reflect the loaded graphic's name into the graphic_svg param + its text box,
// without triggering another load.
function setGraphicSvgName(name){
  const p = PARAMS.find(x => x.name === 'graphic_svg');
  if (p) { p.value = name; if (p.applyUI) p.applyUI(); }
  updateDirty();   // graphic changes are programmatic — the delegated listener won't see them
}
// Drop the current graphic and fall back to the bare symbol body.
function clearGraphic(){
  svgRaw = null; svgText = null; svgName = null;
  setGraphicSvgName('');
  scheduleRender();
}

// ---- Graphic composition (Create-Graphic dialog) ---------------------------
// Build a NEW compound graphic by appending existing on-matrix symbols
// left-to-right on the shared 324 guideline matrix ("1"+"0" -> "10"), with an
// optional indicator — plural (×), past or future — over any chosen
// component (one per component). The result is a
// single on-matrix SVG written back to the "SVG files" folder, so it is then
// picked and assigned exactly like any other file — creation is separate from
// assignment (Ken, 2026-07-22). Each part keeps its own y-coordinates (all parts
// share the matrix, so the guidelines line up automatically) and is shifted in X
// by a translate group, which OpenSCAD's importer honours (verified against both
// the desktop CLI and the WASM/Manifold build). See CLAUDE.md.

// Read one component's SVG text from a source folder handle (defaults to the
// app's own folder). Create-Graphic passes whichever A/B folder the user selected.
async function readGraphicPartText(name, dirHandle){
  const src = dirHandle || (folder && folder.svgDir);
  if (!src) throw new Error(`No “${APP_CONFIG.svgOwnDir}” folder is connected.`);
  const fh = await src.getFileHandle(name + '.svg');
  return (await fh.getFile()).text();
}

// Draw a multiplication-sign (×) plural indicator centered at (cx,cy).
function addPluralMark(root, cx, cy, half, sw){
  const SVGNS = 'http://www.w3.org/2000/svg';
  const grp = document.createElementNS(SVGNS, 'g');
  grp.setAttribute(BTS_INDICATOR_ATTR, 'plural');
  for (const [x1, y1, x2, y2] of [
    [cx - half, cy - half, cx + half, cy + half],
    [cx + half, cy - half, cx - half, cy + half],
  ]) {
    const ln = document.createElementNS(SVGNS, 'line');
    ln.setAttribute('x1', fmt(x1)); ln.setAttribute('y1', fmt(y1));
    ln.setAttribute('x2', fmt(x2)); ln.setAttribute('y2', fmt(y2));
    ln.setAttribute('stroke', '#000'); ln.setAttribute('stroke-width', fmt(sw));
    ln.setAttribute('stroke-linecap', 'round'); ln.setAttribute('fill', 'none');
    grp.appendChild(ln);
  }
  root.appendChild(grp);
}

// Draw a tense indicator — a shallow bow centered at (cx,cy), spanning 2*half
// vertically. Shape and proportions come from the BCI characters themselves
// (indicator (past action) / indicator (future action)): a 32-unit chord on a
// 22.25-unit radius, so the bow is ~0.42 of its height deep. Past bows to the
// RIGHT (chord on the left), future to the LEFT — same as the BCI glyphs.
function addTenseMark(root, cx, cy, half, sw, which){
  const SVGNS = 'http://www.w3.org/2000/svg';
  const r    = 1.390625 * half;                                     // BCI 22.25 at half = 16
  const sag  = r - Math.sqrt(Math.max(r * r - half * half, 0));     // bow depth
  const dir  = which === 'future' ? -1 : 1;                         // +1 = bow right (past)
  const x    = cx - dir * sag / 2;                                  // the chord side; apex is opposite
  const grp = document.createElementNS(SVGNS, 'g');
  grp.setAttribute(BTS_INDICATOR_ATTR, which);
  const p = document.createElementNS(SVGNS, 'path');
  p.setAttribute('d', `M ${fmt(x)},${fmt(cy - half)} A ${fmt(r)},${fmt(r)} 0 0 ${dir > 0 ? 1 : 0} ${fmt(x)},${fmt(cy + half)}`);
  p.setAttribute('stroke', '#000'); p.setAttribute('stroke-width', fmt(sw));
  p.setAttribute('stroke-linecap', 'round'); p.setAttribute('fill', 'none');
  grp.appendChild(p);
  root.appendChild(grp);
}

// Compose an ordered list of components into one on-matrix SVG string.
// `parts` = [{ text, plural, tense, over }] — `text` is a component SVG (must carry
// a viewBox); `plural` adds a × over THAT component's ink, in the indicator band,
// and `tense` ('past' | 'future' | '') adds the matching tense bow there instead.
// `over` SUPERIMPOSES the part on the one before it instead of appending it to the
// right (Ken, 2026-08-11) — see the column layout below.
// A component that is given an indicator REPLACES its built-in one (see below).
// `opts.stripBuiltIn` extends that to the components that were NOT given one, so
// the whole compound comes out clean of the indicators its parts were drawn with.
// Built in the offscreen prep host so getBBox/getScreenCTM can locate each
// component's ink for per-element indicator placement.
function composeCompound(parts, opts = {}){
  parts = (parts || []).filter(p => p && p.text);
  if (!parts.length) return null;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const parsed = parts.map(pt => {
    const doc = new DOMParser().parseFromString(pt.text, 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error('a component SVG did not parse');
    const r = doc.documentElement;
    const vb = (r.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || !(vb[2] > 0) || !(vb[3] > 0))
      throw new Error('a component SVG has no usable viewBox — cannot place it on the matrix');
    return { root: r, x: vb[0], y: vb[1], w: vb[2], h: vb[3],
             plural: !!pt.plural, tense: pt.tense || '', over: !!pt.over };
  });
  const gap = BLISS_SEQUENCE_GAP_UNITS;
  // Lay the parts out in COLUMNS. A column normally holds one part, but a part
  // marked `over` joins the column before it — that is the whole of
  // superimposition: the x cursor simply doesn't advance. Y is untouched either
  // way, so stacked parts land on the shared guideline matrix automatically,
  // which is the alignment Bliss superimposition wants. The first part can't be
  // `over` (there is nothing to sit on), so it always opens a column.
  const columns = [];
  for (const p of parsed){
    if (p.over && columns.length) columns[columns.length - 1].push(p);
    else columns.push([p]);
  }
  // A column is as wide as its widest member, and members are CENTERED on it
  // (Ken, 2026-08-11) — a container symbol and the symbol inside it are rarely
  // the same width, so aligning their viewBox lefts would sit them off to one side.
  const colW = columns.map(c => Math.max(...c.map(p => p.w)));
  const totalW = colW.reduce((s, w) => s + w, 0) + gap * (columns.length - 1);
  const top    = Math.min(...parsed.map(p => p.y));
  const totalH = Math.max(...parsed.map(p => p.y + p.h)) - top;
  const k      = totalH / BLISS_MATRIX_TALL;   // this drawing's units per canonical unit

  const outRoot = document.createElementNS(SVGNS, 'svg');
  // Carry presentation attributes from the first part's root (stroke-linecap,
  // fill-rule, xmlns…); BCI exports are uniform so the first stands for all.
  for (const a of parsed[0].root.attributes) outRoot.setAttribute(a.name, a.value);
  outRoot.setAttribute('viewBox', `0 0 ${fmt(totalW)} ${fmt(totalH)}`);
  outRoot.setAttribute('width',  fmt(totalW) + 'mm');
  outRoot.setAttribute('height', fmt(totalH) + 'mm');

  const host = getPrepHost(); host.appendChild(outRoot);
  try {
    let dx = 0;
    const groups = [];
    for (let ci = 0; ci < columns.length; ci++) {
      for (const p of columns[ci]) {
        const g = document.createElementNS(SVGNS, 'g');
        // Center this part in its column, then align that to the cursor. For a
        // one-part column the centering term is 0, so a plain left-to-right
        // sequence lays out exactly as it did before.
        const off = dx + (colW[ci] - p.w) / 2 - p.x;
        g.setAttribute('transform', `translate(${fmt(off)}, 0)`);   // x only; y stays on the matrix
        for (const node of [...p.root.childNodes]) g.appendChild(document.importNode(node, true));
        outRoot.appendChild(g);
        groups.push({ g, plural: p.plural, tense: p.tense });
      }
      dx += colW[ci] + gap;
    }
    // Per-element indicator: a × (plural) or a bow (past/future) over the ink
    // center of each flagged component, sitting in the indicator row (midway
    // between its top y=66 and sky line 130). A component carries at most one.
    // Removing the indicator a component was DRAWN with, baked into the composed
    // file (Ken, 2026-07-23). Two reasons a component sheds it:
    //   - it is being given an indicator here — one indicator per element, so the
    //     new one replaces the old rather than landing on top of it; or
    //   - `opts.stripBuiltIn`, the dialog's own checkbox.
    // Baking is safe because the compound is saved under a NEW name: the source
    // component file keeps its indicator either way. Same geometric test
    // `stripIndicators` uses, with its safety net — if everything in the component
    // sits above the sky line then the matrix assumption is wrong and we would be
    // deleting the symbol itself, so nothing is touched.
    const skyLine = top + BLISS_SKY_LINE * k;
    for (const { g, plural, tense } of groups) {
      const boxes = [...g.querySelectorAll(DRAWABLE)]
        .map(el => ({ el, b: bboxInRootUnits(el, outRoot) })).filter(x => x.b);
      const builtIn = boxes.filter(x => x.b.maxY <= skyLine);
      let keep = boxes;
      if ((plural || tense || opts.stripBuiltIn) && builtIn.length && builtIn.length < boxes.length) {
        builtIn.forEach(x => x.el.remove());
        keep = boxes.filter(x => !builtIn.includes(x));
      }
      if (!plural && !tense) continue;
      // Center on what's left — the symbol's own ink, not the indicator it just shed.
      let minX = Infinity, maxX = -Infinity;
      for (const { b } of keep) { minX = Math.min(minX, b.minX); maxX = Math.max(maxX, b.maxX); }
      const cx = isFinite(minX) ? (minX + maxX) / 2 : 0;
      const cy = top + 98 * k, half = 16 * k, sw = BLISS_SOURCE_STROKE * k;
      if (plural) addPluralMark(outRoot, cx, cy, half, sw);
      else        addTenseMark(outRoot, cx, cy, half, sw, tense);
    }
    return new XMLSerializer().serializeToString(outRoot);
  } finally {
    outRoot.remove();
  }
}

// ---- Graphic decomposition (Split-Graphic dialog) ---------------------------
// The inverse of composeCompound: take ONE on-matrix symbol and break it into
// its components, each written out as its own .svg — the raw material for a tile
// set built from a Blissymbol's parts (Ken, 2026-08-11).
//
// Decomposition happens in LEVELS, and the output is the union across them:
//   level 0  the whole symbol
//   level 1  the drawing primitives, as authored
//   level 2  sub-primitive geometry — a circle's four arcs, a path's segments
// "eye" (a circle + a dot) therefore gives circle, dot, and the circle's four
// arcs = the six components Ken asked for, plus the whole symbol if that box is
// ticked. "arm" (two lines) stops at level 1 with two pieces: a straight line has
// no natural sub-parts, so it is atomic and contributes nothing further.
//
// Two rules that look interchangeable but are not:
//   - ONE PRIMITIVE = ONE PIECE is the default. It is what makes "arm" come out
//     as two lines rather than one shape.
//   - CONNECTED INK = ONE PIECE (opts.merge) is offered as an option, not the
//     default: "arm"'s two lines meet at (10,194), so merging would fuse exactly
//     the two components we want kept apart. Its real use is the RAW BSI file
//     whose circle is drawn as four separate arcs — there merging rebuilds the
//     circle at level 1 and the four arcs reappear beneath it at level 2, which
//     is the same six pieces arrived at from the opposite direction.
//
// Every piece keeps the source's viewBox and its original coordinates: nothing is
// re-centered or re-scaled. So each piece flows through the normal Step-0 prep on
// the way to the printer and lands at exactly the size and place that component
// occupies on the whole symbol (the band scale), and a set of pieces reassembles
// into the symbol with no fitting.

// Argument counts per path command; the key is the uppercase (absolute) form.
const SEG_ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const PATH_TOKEN = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;

// Tokenise a `d` attribute into { cmd, args }, expanding implicit repeats (a
// command letter followed by several argument groups). A repeated M means L,
// which is what SVG says and what a naive splitter gets wrong.
function parsePathD(d){
  const toks = String(d || '').match(PATH_TOKEN) || [];
  const out = [];
  let i = 0, cmd = null;
  while (i < toks.length){
    if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
    else if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
    else if (!cmd || cmd === 'Z' || cmd === 'z') break;   // numbers with nothing to attach to
    const n = SEG_ARGS[cmd.toUpperCase()];
    if (n == null || i + n > toks.length) break;
    const args = [];
    for (let k = 0; k < n; k++){
      const v = parseFloat(toks[i++]);
      if (!isFinite(v)) return out;
      args.push(v);
    }
    out.push({ cmd, args });
  }
  return out;
}

// Walk a `d` and return one ABSOLUTE, self-contained path per segment:
// { d, sub } where `d` is "M <segment start> <one absolute command>" and `sub` is
// the index of the subpath the segment belongs to. Relative commands are
// resolved, and the smooth forms (S/T) are expanded to C/Q — a lone segment has
// no predecessor to infer its reflected control point from.
function absSegments(d){
  const segs = parsePathD(d);
  const out = [];
  let cx = 0, cy = 0, sx = 0, sy = 0, px = null, py = null, prev = null, sub = -1;
  for (const s of segs){
    const U = s.cmd.toUpperCase(), rel = s.cmd !== U, a = s.args;
    const ax = v => rel ? cx + v : v, ay = v => rel ? cy + v : v;
    let body = null, nx = cx, ny = cy, ctrl = null;
    switch (U){
      case 'M':
        cx = ax(a[0]); cy = ay(a[1]); sx = cx; sy = cy;
        prev = 'M'; px = py = null; sub++;
        continue;
      case 'L': nx = ax(a[0]); ny = ay(a[1]); body = `L ${fmt(nx)},${fmt(ny)}`; break;
      case 'H': nx = ax(a[0]);               body = `L ${fmt(nx)},${fmt(ny)}`; break;
      case 'V': ny = ay(a[0]);               body = `L ${fmt(nx)},${fmt(ny)}`; break;
      case 'C': {
        const x1 = ax(a[0]), y1 = ay(a[1]), x2 = ax(a[2]), y2 = ay(a[3]);
        nx = ax(a[4]); ny = ay(a[5]);
        body = `C ${fmt(x1)},${fmt(y1)} ${fmt(x2)},${fmt(y2)} ${fmt(nx)},${fmt(ny)}`; ctrl = [x2, y2]; break;
      }
      case 'S': {
        const r = (prev === 'C' || prev === 'S') && px != null ? [2 * cx - px, 2 * cy - py] : [cx, cy];
        const x2 = ax(a[0]), y2 = ay(a[1]);
        nx = ax(a[2]); ny = ay(a[3]);
        body = `C ${fmt(r[0])},${fmt(r[1])} ${fmt(x2)},${fmt(y2)} ${fmt(nx)},${fmt(ny)}`; ctrl = [x2, y2]; break;
      }
      case 'Q': {
        const x1 = ax(a[0]), y1 = ay(a[1]);
        nx = ax(a[2]); ny = ay(a[3]);
        body = `Q ${fmt(x1)},${fmt(y1)} ${fmt(nx)},${fmt(ny)}`; ctrl = [x1, y1]; break;
      }
      case 'T': {
        const r = (prev === 'Q' || prev === 'T') && px != null ? [2 * cx - px, 2 * cy - py] : [cx, cy];
        nx = ax(a[0]); ny = ay(a[1]);
        body = `Q ${fmt(r[0])},${fmt(r[1])} ${fmt(nx)},${fmt(ny)}`; ctrl = r; break;
      }
      case 'A':
        nx = ax(a[5]); ny = ay(a[6]);
        body = `A ${fmt(a[0])},${fmt(a[1])} ${fmt(a[2])} ${a[3] ? 1 : 0},${a[4] ? 1 : 0} ${fmt(nx)},${fmt(ny)}`;
        break;
      case 'Z':
        if (cx !== sx || cy !== sy){ nx = sx; ny = sy; body = `L ${fmt(nx)},${fmt(ny)}`; }
        break;
    }
    if (body) out.push({ d: `M ${fmt(cx)},${fmt(cy)} ${body}`, sub: Math.max(sub, 0) });
    px = ctrl ? ctrl[0] : null; py = ctrl ? ctrl[1] : null;
    cx = nx; cy = ny; prev = U;
    if (U === 'Z'){ cx = sx; cy = sy; }
  }
  return out;
}

// Cut a circle/ellipse into `n` arcs. Quarters are cut at the CARDINAL points
// (12/3/6/9 o'clock), so arc 1 is the upper-right quadrant and they run
// clockwise; `mode:'diagonal'` cuts at the diagonals instead, giving a top,
// right, bottom and left arc. Halves are always cut at 9 and 3 o'clock — an
// upper and a lower arc, which is the pairing Bliss actually uses (a mouth, a
// container). Emitted as open arc paths, which the prep pipeline's
// strokeToOutline traces correctly (OpenSCAD's own importer would fill an open
// arc as a chord region — see the stroke-to-outline notes).
function arcPieces(cx, cy, rx, ry, n, mode){
  const start = n === 2 ? 180 : (mode === 'diagonal' ? -135 : -90);
  const step = 360 / n;
  const hints = n === 2 ? ['upper', 'lower']
    : mode === 'diagonal' ? ['top', 'right', 'bottom', 'left']
    : ['upper right', 'lower right', 'lower left', 'upper left'];
  const pt = deg => { const t = deg * Math.PI / 180; return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)]; };
  const out = [];
  for (let i = 0; i < n; i++){
    const p0 = pt(start + i * step), p1 = pt(start + (i + 1) * step);
    out.push({
      label: `${n === 2 ? 'half' : 'arc'} ${i + 1}`,
      hint: hints[i] || '',
      d: `M ${fmt(p0[0])},${fmt(p0[1])} A ${fmt(rx)},${fmt(ry)} 0 ${step > 180 ? 1 : 0},1 ${fmt(p1[0])},${fmt(p1[1])}`,
    });
  }
  return out;
}

const numAttr = (el, name, dflt = 0) => { const v = parseFloat(el.getAttribute(name)); return isFinite(v) ? v : dflt; };
const ptsOf = el => (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number)
  .reduce((acc, v, i) => { if (i % 2) acc[acc.length - 1].push(v); else acc.push([v]); return acc; }, [])
  .filter(p => p.length === 2 && p.every(isFinite));
const edgePieces = pts => pts.slice(0, -1).map((p, i) => ({
  label: `line ${i + 1}`, hint: '',
  d: `M ${fmt(p[0])},${fmt(p[1])} L ${fmt(pts[i + 1][0])},${fmt(pts[i + 1][1])}`,
}));

// How one primitive breaks down a level further. Returns null when it is ATOMIC
// — a straight line and a Bliss dot have no natural sub-parts, and splitting them
// would produce halves nobody asked for.
function subShapes(el, opts){
  const tag = el.tagName.toLowerCase();
  const n = 4;
  if (tag === 'circle'){
    const r = numAttr(el, 'r');
    if (!(r > 0)) return null;
    const cx = numAttr(el, 'cx'), cy = numAttr(el, 'cy');
    return [...arcPieces(cx, cy, r, r, n, opts.cuts), ...(opts.halves ? arcPieces(cx, cy, r, r, 2, opts.cuts) : [])];
  }
  if (tag === 'ellipse'){
    const rx = numAttr(el, 'rx'), ry = numAttr(el, 'ry');
    if (!(rx > 0) || !(ry > 0)) return null;
    const cx = numAttr(el, 'cx'), cy = numAttr(el, 'cy');
    return [...arcPieces(cx, cy, rx, ry, n, opts.cuts), ...(opts.halves ? arcPieces(cx, cy, rx, ry, 2, opts.cuts) : [])];
  }
  if (tag === 'rect'){
    const x = numAttr(el, 'x'), y = numAttr(el, 'y'), w = numAttr(el, 'width'), h = numAttr(el, 'height');
    if (!(w > 0) || !(h > 0)) return null;
    return edgePieces([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]);
  }
  if (tag === 'polygon' || tag === 'polyline'){
    const pts = ptsOf(el);
    if (pts.length < 3) return null;                       // a 2-point polyline is just a line
    return edgePieces(tag === 'polygon' ? [...pts, pts[0]] : pts);
  }
  if (tag === 'path'){
    const segs = absSegments(el.getAttribute('d'));
    if (segs.length < 2) return null;
    // A path drawn as several subpaths splits along those first — they are
    // separate strokes that merely share an element.
    const subs = new Set(segs.map(s => s.sub));
    if (subs.size > 1){
      return [...subs].sort((a, b) => a - b).map((s, i) => {
        const own = segs.filter(x => x.sub === s);
        // Re-join this subpath's segments: keep the first M, drop the rest.
        const d = own[0].d + own.slice(1).map(x => ' ' + x.d.replace(/^M\s*[-\d.,eE+\s]+/, '')).join('');
        return { label: `shape ${i + 1}`, hint: '', d };
      });
    }
    return segs.map((s, i) => ({ label: `segment ${i + 1}`, hint: '', d: s.d }));
  }
  return null;                                             // line: atomic
}

// A primitive's own name, for the default file name.
function elLabel(el){
  const tag = el.tagName.toLowerCase();
  if (tag === 'line'){
    const zero = numAttr(el, 'x1') === numAttr(el, 'x2') && numAttr(el, 'y1') === numAttr(el, 'y2');
    return zero ? 'dot' : 'line';                          // a Bliss dot is a zero-length line
  }
  if (tag === 'polyline') return 'line';
  if (tag === 'path'){
    const segs = absSegments(el.getAttribute('d'));
    if (segs.length === 1) return /\sA\s/.test(segs[0].d) ? 'arc' : 'line';
    return 'shape';
  }
  return tag;                                              // circle / ellipse / rect / polygon
}

// Which elements touch which, for the optional merge. Cheap by construction: a
// bounding-box test (already grown by half the stroke) rejects almost every pair,
// and only survivors get a coarse centerline sample compared point to point.
function touchMatrix(els, boxes, root){
  const SAMPLES = 48;
  const pts = els.map((el, i) => {
    try {
      const len = typeof el.getTotalLength === 'function' ? el.getTotalLength() : 0;
      if (!(len > 0)){
        const p = typeof el.getPointAtLength === 'function' ? el.getPointAtLength(0) : null;
        return p ? [[p.x, p.y]] : [];
      }
      const out = [];
      for (let k = 0; k <= SAMPLES; k++) { const p = el.getPointAtLength(len * k / SAMPLES); out.push([p.x, p.y]); }
      return out;
    } catch { return []; }
  });
  const halfW = els.map(el => { const w = parseFloat(getComputedStyle(el).strokeWidth); return isFinite(w) ? w / 2 : 0; });
  const adj = els.map(() => []);
  for (let i = 0; i < els.length; i++){
    for (let j = i + 1; j < els.length; j++){
      const a = boxes[i], b = boxes[j];
      if (!a || !b) continue;
      if (a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY) continue;
      const reach = halfW[i] + halfW[j] + 0.5;
      let hit = false;
      for (const p of pts[i]){ for (const q of pts[j]){ if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= reach){ hit = true; break; } } if (hit) break; }
      if (hit){ adj[i].push(j); adj[j].push(i); }
    }
  }
  return adj;
}

// Geometry attributes a synthesized sub-shape replaces; everything else on the
// source element (class, stroke, fill, style…) is carried over verbatim, which is
// what keeps a piece looking like the .pen1 line-art it came from.
const GEOM_ATTRS = new Set(['d', 'points', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height']);
const SPLIT_IDX_ATTR = 'data-bts-split-i';

// Serialize one piece. `refs` = [{ idx, sub }] — the source elements it keeps,
// each optionally replaced by one of its sub-shapes. With `ghost` the elements
// NOT in the piece are dimmed instead of removed, which is how the dialog shows a
// piece in the context of the whole symbol.
function emitPiece(template, refs, ghost){
  const SVGNS = 'http://www.w3.org/2000/svg';
  const root = template.cloneNode(true);
  const keep = new Map(refs.map(r => [r.idx, r.sub || null]));
  for (const el of [...root.querySelectorAll(DRAWABLE)]){
    const i = +el.getAttribute(SPLIT_IDX_ATTR);
    if (!keep.has(i)){
      if (ghost) el.setAttribute('opacity', '.12'); else el.remove();
      continue;
    }
    const sub = keep.get(i);
    if (!sub) continue;
    const node = root.ownerDocument.createElementNS(SVGNS, 'path');
    for (const a of el.attributes) if (!GEOM_ATTRS.has(a.name)) node.setAttribute(a.name, a.value);
    node.setAttribute('d', sub.d);
    node.setAttribute('fill', 'none');                     // an arc of a circle is a stroke, never a region
    el.parentNode.replaceChild(node, el);
  }
  if (!ghost) root.querySelectorAll('g').forEach(g => { if (!g.querySelector(DRAWABLE)) g.remove(); });
  root.querySelectorAll(`[${SPLIT_IDX_ATTR}]`).forEach(el => el.removeAttribute(SPLIT_IDX_ATTR));
  return new XMLSerializer().serializeToString(root);
}

// Decompose one on-matrix symbol. Returns { pieces, warnings }; each piece is
// { id, level, label, hint, refs, svg } with `svg` a complete standalone file.
// opts: { cuts:'cardinal'|'diagonal', halves, includeWhole, merge }
function splitGraphic(text, opts = {}){
  opts = { cuts: 'cardinal', halves: false, includeWhole: true, merge: false, ...opts };
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('that SVG did not parse');
  const root = getPrepHost().appendChild(document.importNode(doc.documentElement, true));
  try {
    const els = [...root.querySelectorAll(DRAWABLE)];
    if (!els.length) throw new Error('that SVG has nothing to split');
    els.forEach((el, i) => el.setAttribute(SPLIT_IDX_ATTR, String(i)));
    const boxes = els.map(el => bboxInRootUnits(el, root));
    const warnings = [];

    // Level 1: one node per primitive, or per connected group when merging.
    let groups = els.map((el, i) => [i]);
    if (opts.merge){
      const adj = touchMatrix(els, boxes, root);
      const seen = new Set(); groups = [];
      for (let i = 0; i < els.length; i++){
        if (seen.has(i)) continue;
        const stack = [i], g = [];
        seen.add(i);
        while (stack.length){
          const k = stack.pop(); g.push(k);
          for (const j of adj[k]) if (!seen.has(j)){ seen.add(j); stack.push(j); }
        }
        groups.push(g.sort((a, b) => a - b));
      }
      groups.sort((a, b) => a[0] - b[0]);
    }

    // Grow the tree depth-first. A node with several members breaks into its
    // members; a lone member breaks into its own sub-shapes. That single rule
    // gives "merged circle -> four arcs" and "circle -> four arcs" alike.
    const pieces = [];
    let id = 0;
    const push = (level, label, hint, refs) => {
      pieces.push({ id: id++, level, label, hint, refs, svg: emitPiece(root, refs, false) });
      return pieces[pieces.length - 1];
    };
    const grow = (level, members) => {
      if (members.length > 1){
        // A merged group breaks into its members, and each member goes on
        // breaking down a level further — so a group of four arcs gives the arcs
        // at level 2 and anything they subdivide into at level 3.
        for (const i of members){
          push(level, elLabel(els[i]), '', [{ idx: i, sub: null }]);
          grow(level + 1, [i]);
        }
        return;
      }
      const i = members[0], el = els[i];
      const subs = subShapes(el, opts);
      if (!subs || subs.length < 2) return;
      for (const s of subs) push(level, s.label, s.hint, [{ idx: i, sub: s }]);
    };

    if (opts.includeWhole) push(0, 'whole symbol', '', els.map((_, i) => ({ idx: i, sub: null })));
    for (const g of groups){
      push(1, g.length > 1 ? 'group' : elLabel(els[g[0]]), '', g.map(i => ({ idx: i, sub: null })));
      grow(2, g);
    }
    if (pieces.filter(p => p.level > 0).length < 2){
      warnings.push('This symbol has only one component — there is nothing to split.');
    }
    // Group the output BY LEVEL rather than by which element produced it, so the
    // set reads as the ladder it is. Sort is stable, so within a level the pieces
    // stay in the order they were generated (document order, then cut order).
    pieces.sort((a, b) => a.level - b.level);
    return { pieces, warnings };
  } finally {
    root.remove();
  }
}

// A piece drawn over a faint copy of the whole symbol, so a row in the dialog
// reads as "this bit, here" rather than as an anonymous fragment.
function splitThumb(text, refs){
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return '';
  const root = doc.documentElement;
  [...root.querySelectorAll(DRAWABLE)].forEach((el, i) => el.setAttribute(SPLIT_IDX_ATTR, String(i)));
  return emitPiece(root, refs, true);
}

// ---- SVG folder picker -----------------------------------------------------
// Search-as-you-type over the served "SVG files" folder. The listing is
// re-enumerated on every open (Ken, 2026-07-22) — files can arrive in the folder
// while the app is running (the Create-Graphic dialog writes there, and so does
// anything outside the browser), and a cached list would hide them until reload.
// Enumeration only stats directory entries, never reads a file, so it stays cheap
// even on OneDrive. Filtering and keyboard navigation are all client-side.
let SVG_LIST = null;   // last listing; renderPicker() filters over it
const pickerEl     = document.getElementById('svgPicker');
const pickerFilter = document.getElementById('pickerFilter');
const pickerListEl = document.getElementById('pickerList');
const pickerCount  = document.getElementById('pickerCount');
const pickerFolderEl = document.getElementById('pickerFolder');
let pickerView = [], pickerActive = 0;
// Source folder(s) for the current picker session. Assignment resolves against the
// app's own folder only (one source, no selector); Create-Graphic passes the present
// A/B candidates and a folder selector appears when there is more than one.
let pickerSources = [];      // [{ name, handle }]
let pickerSourceIdx = 0;
function pickerSrc(){ return pickerSources[pickerSourceIdx] || null; }
function pickerSrcHandle(){ return pickerSrc() ? pickerSrc().handle : (folder && folder.svgDir) || null; }
function pickerSrcName(){ return pickerSrc() ? pickerSrc().name : APP_CONFIG.svgOwnDir; }
// Head shows the folder name (single source) or an A/B toggle (two+ sources).
function renderPickerFolders(){
  pickerFolderEl.innerHTML = '';
  if (pickerSources.length <= 1){ pickerFolderEl.textContent = pickerSrcName(); return; }
  const lbl = document.createElement('span'); lbl.className = 'picker-folder-lbl'; lbl.textContent = 'Folder:';
  pickerFolderEl.appendChild(lbl);
  pickerSources.forEach((s, i) => {
    const b = document.createElement('button'); b.type = 'button';
    b.className = 'picker-folder-btn' + (i === pickerSourceIdx ? ' active' : '');
    b.textContent = s.name;
    b.addEventListener('click', () => selectPickerSource(i));
    pickerFolderEl.appendChild(b);
  });
}
async function selectPickerSource(i){
  if (i === pickerSourceIdx || i < 0 || i >= pickerSources.length) return;
  pickerSourceIdx = i; pickerActive = 0;
  renderPickerFolders();
  pickerCount.textContent = 'loading…'; pickerListEl.innerHTML = '';
  try { await listSvgFolder(pickerSrcHandle()); }
  catch (e){ pickerCount.textContent = ''; pickerListEl.innerHTML = `<div class="picker-empty">Could not list the “${pickerSrcName()}” folder.</div>`; return; }
  renderPicker();
  pickerFilter.focus();
}

async function listSvgFolder(dirHandle){
  const src = dirHandle || (folder && folder.svgDir);
  if (!src) throw new Error(`No “${APP_CONFIG.svgOwnDir}” folder is connected.`);
  const names = [];
  for await (const [name, h] of src.entries()){
    if (h.kind === 'file' && /\.svg$/i.test(name)) names.push(name.replace(/\.svg$/i, ''));
  }
  SVG_LIST = names.sort((a, b) => a.localeCompare(b));
  return SVG_LIST;
}

function pEsc(s){ return s.replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c])); }
function pHi(name, q){
  if (!q) return pEsc(name);
  const i = name.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return pEsc(name);
  return pEsc(name.slice(0, i)) + '<mark>' + pEsc(name.slice(i, i + q.length)) + '</mark>' + pEsc(name.slice(i + q.length));
}
function renderPicker(){
  const q = pickerFilter.value.trim(), all = SVG_LIST || [];
  pickerView = q ? all.filter(n => n.toLowerCase().includes(q.toLowerCase())) : all.slice();
  pickerCount.textContent = pickerView.length + (pickerView.length === 1 ? ' file' : ' files');
  if (pickerActive >= pickerView.length) pickerActive = Math.max(0, pickerView.length - 1);
  if (!pickerView.length) { pickerListEl.innerHTML = '<div class="picker-empty">no match</div>'; return; }
  pickerListEl.innerHTML = pickerView.map((n, idx) =>
    `<div class="picker-row${idx === pickerActive ? ' active' : ''}" data-i="${idx}" role="option">${pHi(n, q)}</div>`).join('');
  const act = pickerListEl.querySelector('.picker-row.active');
  if (act) act.scrollIntoView({ block: 'nearest' });
}
function closeSvgPicker(){ pickerEl.hidden = true; }
// What to do with the chosen file name. Assignment loads it as the graphic; the
// Create-Graphic dialog overrides this to append a component instead.
let pickerOnChoose = loadSvgByName;
function choosePicker(i){
  if (i < 0 || i >= pickerView.length) return;
  const name = pickerView[i];
  closeSvgPicker();
  pickerOnChoose(name, pickerSrcHandle());   // handle is ignored by the default assignment loader
}
// Open the folder picker. `onChoose(name, srcHandle)` receives the picked base name
// and the folder it came from; `seed` pre-fills the search box (and is highlighted
// if it names a file). `sources` is the list of {name, handle} to offer — omit for
// the app's own folder only (assignment); Create-Graphic passes its A/B candidates.
async function openSvgPicker(onChoose, seed = '', sources = null){
  pickerOnChoose = onChoose || loadSvgByName;
  pickerSources = (sources && sources.length) ? sources.slice()
    : ((folder && folder.svgDir) ? [{ name: APP_CONFIG.svgOwnDir, handle: folder.svgDir }] : []);
  pickerSourceIdx = 0;
  renderPickerFolders();
  const cur = String(seed || '').trim();
  pickerEl.hidden = false;
  pickerFilter.value = cur; pickerActive = 0;
  pickerCount.textContent = 'loading…'; pickerListEl.innerHTML = '';
  pickerFilter.focus(); pickerFilter.select();
  try { await listSvgFolder(pickerSrcHandle()); }
  catch (e) {
    pickerCount.textContent = '';
    pickerListEl.innerHTML = `<div class="picker-empty">Could not list the “${pickerSrcName()}” folder — is the app served over http?</div>`;
    return;
  }
  renderPicker();
  // land the highlight on the currently-chosen file, if any
  if (cur) { const j = pickerView.indexOf(cur); if (j >= 0) { pickerActive = j; renderPicker(); } }
}
pickerFilter.addEventListener('input', () => { pickerActive = 0; renderPicker(); });
pickerFilter.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown')      { e.preventDefault(); pickerActive = Math.min(pickerView.length - 1, pickerActive + 1); renderPicker(); }
  else if (e.key === 'ArrowUp')   { e.preventDefault(); pickerActive = Math.max(0, pickerActive - 1); renderPicker(); }
  else if (e.key === 'Enter')     { e.preventDefault(); choosePicker(pickerActive); }
  else if (e.key === 'Escape')    { e.preventDefault(); closeSvgPicker(); }
});
pickerListEl.addEventListener('click', e => { const r = e.target.closest('.picker-row'); if (r) choosePicker(+r.dataset.i); });
pickerListEl.addEventListener('mousemove', e => { const r = e.target.closest('.picker-row'); if (r && +r.dataset.i !== pickerActive) { pickerActive = +r.dataset.i; renderPicker(); } });
document.getElementById('pickerCancel').addEventListener('click', closeSvgPicker);
pickerEl.addEventListener('mousedown', e => { if (e.target === pickerEl) closeSvgPicker(); });

// ---- Create-Graphic dialog -------------------------------------------------
// Build a new compound graphic from existing on-matrix symbols, preview it in
// 2D, and save it into the SVG files folder as a new .svg. Create-only: the
// saved file is then assigned like any other via the Graphic File picker.
const createOverlay = document.getElementById('createOverlay');
const createChipsEl = document.getElementById('createChips');
const createPreview = document.getElementById('createPreview');
const createNameEl  = document.getElementById('createName');
let createParts = [];              // [{ name, text, plural, tense }]  tense: '' | 'past' | 'future'
                                   // text is captured at add-time from the chosen A/B source folder,
                                   // so the component's source folder need not be recorded afterwards.

function openCreateDialog(){
  if (!folder) { setStatus('Open a folder first.', 'err'); return; }
  createParts = []; createNameEl.value = '';
  // Back to the default on each open, like the rest of the dialog's state — the
  // option belongs to the graphic being built, not to the session.
  document.getElementById('createStripBuiltIn').checked = true;
  createOverlay.hidden = false;
  renderCreateChips();
  refreshCreatePreview();
}
function closeCreateDialog(){ createOverlay.hidden = true; }

function renderCreateChips(){
  createChipsEl.innerHTML = '';
  if (!createParts.length) {
    const e = document.createElement('span'); e.className = 'seq-empty';
    e.textContent = 'No components yet — add a symbol.';
    createChipsEl.appendChild(e);
  }
  createParts.forEach((part, i) => {
    const chip = document.createElement('div'); chip.className = 'seq-chip';
    const mk = (txt, title, on, disabled) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'seq-chip-btn';
      b.textContent = txt; b.title = title; if (disabled) b.disabled = true;
      b.addEventListener('click', on); return b;
    };
    const move = (from, to) => { createParts.splice(to, 0, createParts.splice(from, 1)[0]); renderCreateChips(); refreshCreatePreview(); };
    chip.appendChild(mk('‹', 'Move left',  () => move(i, i - 1), i === 0));
    const nameEl = document.createElement('span'); nameEl.className = 'seq-chip-name';
    nameEl.textContent = part.name; nameEl.title = part.name;
    chip.appendChild(nameEl);
    // Per-element indicator toggles: plural (×) and tense (past / future). Bliss
    // puts one indicator over an element, and all three share the same spot in
    // the indicator row, so ticking one clears the others (re-render to show it).
    const flag = (txt, title, isOn, set) => {
      const lb = document.createElement('label'); lb.className = 'chip-ind'; lb.title = title;
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = isOn();
      cb.addEventListener('change', () => { set(cb.checked); renderCreateChips(); refreshCreatePreview(); });
      lb.appendChild(cb); lb.appendChild(document.createTextNode(txt));
      return lb;
    };
    chip.appendChild(flag('×', 'Plural (×) indicator over this component',
      () => !!part.plural, on => { part.plural = on; if (on) part.tense = ''; }));
    chip.appendChild(flag('past', 'Past-action indicator over this component',
      () => part.tense === 'past', on => { part.tense = on ? 'past' : ''; if (on) part.plural = false; }));
    chip.appendChild(flag('future', 'Future-action indicator over this component',
      () => part.tense === 'future', on => { part.tense = on ? 'future' : ''; if (on) part.plural = false; }));
    // Superimpose on the previous component instead of appending to its right.
    // Never offered on the first chip — there is nothing under it to sit on.
    if (i > 0) chip.appendChild(flag('over', 'Superimpose this component on the one to its left',
      () => !!part.over, on => { part.over = on; }));
    chip.appendChild(mk('›', 'Move right', () => move(i, i + 1), i === createParts.length - 1));
    chip.appendChild(mk('✕', 'Remove',     () => { createParts.splice(i, 1); renderCreateChips(); refreshCreatePreview(); }, false));
    createChipsEl.appendChild(chip);
  });
  document.getElementById('createSave').disabled = !createParts.length;
}

// The dialog's own indicator-removal option. It is NOT the Customizer's
// `remove_Bliss_indicators` (Ken, 2026-07-23): the Create-Graphic button is
// independent of any particular concept, while that param belongs to the concept
// being designed, so the dialog carries its own control and never reads the form.
// It is baked into the artwork the dialog composes — preview and saved file are
// the same bytes — which is sound because the compound is saved under a NEW name
// and the source components keep their own indicators.
function createComposeOpts(){
  return { stripBuiltIn: !!document.getElementById('createStripBuiltIn')?.checked };
}

// Rebuild the 2D preview from the current components. Reads any uncached part
// texts, composes, injects the SVG inline (the browser renders the line-art
// natively), and overlays faint Bliss guideline references. What you see here is
// exactly what Save writes.
async function refreshCreatePreview(){
  if (!createParts.length) { createPreview.innerHTML = '<div class="create-empty">Add symbols to see a preview.</div>'; return; }
  let svg;
  try { svg = composeCompound(createParts.map(p => ({ text: p.text, plural: p.plural, tense: p.tense, over: p.over })), createComposeOpts()); }
  catch (e) { createPreview.innerHTML = `<div class="create-empty">${e.message}</div>`; return; }
  createPreview.innerHTML = svg;
  const el = createPreview.querySelector('svg');
  if (el) { el.removeAttribute('width'); el.removeAttribute('height'); overlayGuidelines(el); }
}

// Draw faint sky/earth (solid) + indicator-top/mid (dashed) reference lines
// across the preview, positioned on the compound's own matrix.
function overlayGuidelines(svgEl){
  const vb = (svgEl.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4) return;
  const k = vb[3] / BLISS_MATRIX_TALL, x0 = vb[0], x1 = vb[0] + vb[2], SVGNS = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(SVGNS, 'g');
  const line = (yUnit, dashed) => {
    const y = vb[1] + yUnit * k, ln = document.createElementNS(SVGNS, 'line');
    ln.setAttribute('x1', x0); ln.setAttribute('x2', x1); ln.setAttribute('y1', y); ln.setAttribute('y2', y);
    ln.setAttribute('stroke', '#4a90d9'); ln.setAttribute('stroke-width', 1.2 * k);
    ln.setAttribute('opacity', dashed ? '0.35' : '0.55');
    if (dashed) ln.setAttribute('stroke-dasharray', `${4 * k} ${4 * k}`);
    g.appendChild(ln);
  };
  line(66, true); line(BLISS_SKY_LINE, false); line(194, true); line(BLISS_EARTH_LINE, false);
  svgEl.insertBefore(g, svgEl.firstChild);   // behind the artwork
}

async function saveCreatedGraphic(){
  const name = createNameEl.value.trim();
  if (!name) { setStatus('Enter a name for the new graphic.', 'err'); createNameEl.focus(); return; }
  if (/[\\/:*?"<>|]/.test(name)) { setStatus('That name has characters a file name can’t contain.', 'err'); return; }
  if (!createParts.length) return;
  let svg;
  try { svg = composeCompound(createParts.map(p => ({ text: p.text, plural: p.plural, tense: p.tense, over: p.over })), createComposeOpts()); }
  catch (e) { setStatus(`Couldn't build the graphic — ${e.message}`, 'err'); return; }
  // Create-Graphic saves into the app's OWN SVG folder (svgOwnDir), creating it if
  // it isn't there yet, so the composite is then referenceable on the normal path.
  let destDir = folder.svgDir;
  if (!destDir){
    try { destDir = folder.svgDir = await folder.dir.getDirectoryHandle(APP_CONFIG.svgOwnDir, { create: true }); }
    catch (e){ setStatus(`Couldn't open the “${APP_CONFIG.svgOwnDir}” folder — ${e.message}`, 'err'); return; }
  }
  // Confirm before overwriting an existing file of the same name.
  let exists = false;
  try { await destDir.getFileHandle(name + '.svg'); exists = true; } catch {}
  if (exists && !(await confirmDiscard(`A graphic named “${name}.svg” already exists. Overwrite it?`))) return;
  try {
    const fh = await destDir.getFileHandle(name + '.svg', { create: true });
    if (!(await ensureRW(fh))) throw new Error('write permission denied');
    const w = await fh.createWritable(); await w.write(svg); await w.close();
    SVG_LIST = null;                       // drop the stale listing (the picker re-enumerates on open anyway)
    logLine(`Saved graphic: ${name}.svg (${createParts.length} component${createParts.length > 1 ? 's' : ''})`);
    closeCreateDialog();
    setStatus(`Saved “${name}.svg” — pick it in Graphic File to use it.`, 'ok');
  } catch (e) { setStatus(`Save failed — ${e.message}`, 'err'); }
}

document.getElementById('createGraphicBtn').addEventListener('click', openCreateDialog);
document.getElementById('createClose').addEventListener('click', closeCreateDialog);
document.getElementById('createCancel').addEventListener('click', closeCreateDialog);
document.getElementById('createSave').addEventListener('click', saveCreatedGraphic);
document.getElementById('createStripBuiltIn').addEventListener('change', refreshCreatePreview);
document.getElementById('createAddBtn').addEventListener('click', () => {
  // Source a component from either present folder (A/B selector shown when both
  // are). The chosen file's text is baked onto the part right here.
  openSvgPicker(async (name, srcHandle) => {
    let text;
    try { text = await readGraphicPartText(name, srcHandle); }
    catch (e) { setStatus(`Couldn't read “${name}.svg” — ${e.message}`, 'err'); return; }
    createParts.push({ name, text, plural: false, tense: '', over: false });
    renderCreateChips(); refreshCreatePreview();
  }, '', folder.svgCreateSources);
});
createOverlay.addEventListener('mousedown', e => { if (e.target === createOverlay) closeCreateDialog(); });

// ---- Split-Graphic dialog --------------------------------------------------
// Pick one symbol, see the components it decomposes into level by level, and
// write the ones you want out as separate .svg files. Source and destination
// folders are per-app (APP_CONFIG.svgSplitSourceDirs / svgSplitDestDirs): Tiles
// reads a whole Blissymbol from "Bliss SVG files" and saves the pieces into
// "Basic SVG files" or "Puzzle SVG files" (Ken, 2026-08-11). An app that
// configures no source folders doesn't get the button at all.
const splitOverlay  = document.getElementById('splitOverlay');
const splitBtn      = document.getElementById('splitGraphicBtn');
const splitListEl   = document.getElementById('splitList');
const splitSrcEl    = document.getElementById('splitSrcName');
const splitBaseEl   = document.getElementById('splitBase');
const splitDestEl   = document.getElementById('splitDest');
const splitCountEl  = document.getElementById('splitCount');
const splitSaveBtn  = document.getElementById('splitSave');
const SPLIT_ENABLED = !!(APP_CONFIG.svgSplitSourceDirs && APP_CONFIG.svgSplitSourceDirs.length);
if (splitBtn && !SPLIT_ENABLED) splitBtn.hidden = true;

// Placeholder for the Symbol label, matching app-body.html's initial markup.
const SPLIT_NO_SOURCE = '— none chosen —';
let splitSrc = null;        // { name, text }
let splitRows = [];         // [{ piece, name, keep }]
let splitDestIdx = 0;

function splitOpts(){
  return {
    cuts:         document.getElementById('splitDiagonal').checked ? 'diagonal' : 'cardinal',
    halves:       document.getElementById('splitHalves').checked,
    includeWhole: document.getElementById('splitWhole').checked,
    merge:        document.getElementById('splitMerge').checked,
  };
}

function openSplitDialog(){
  if (!folder) { setStatus('Open a folder first.', 'err'); return; }
  splitSrc = null; splitRows = []; splitDestIdx = 0;
  // The dialog always opens with no symbol chosen, so the Symbol label has to go
  // back to its placeholder — leaving the last session's name there implied a
  // symbol was loaded when the piece list was empty (Ken, 2026-08-14).
  splitSrcEl.textContent = SPLIT_NO_SOURCE;
  splitBaseEl.value = '';
  document.getElementById('splitDiagonal').checked = false;
  document.getElementById('splitHalves').checked = false;
  document.getElementById('splitWhole').checked = true;
  document.getElementById('splitMerge').checked = false;
  splitOverlay.hidden = false;
  renderSplitDests();
  renderSplitRows();
}
function closeSplitDialog(){ splitOverlay.hidden = true; }

// Destination folders are offered whether or not they exist yet — a missing one
// is created on save, the same way Create-Graphic creates its own folder.
function renderSplitDests(){
  splitDestEl.innerHTML = '';
  const dests = folder.svgSplitDests || [];
  // With a single destination there is no choice to make, so the picker and its
  // caption stay out of the way — the Save line still names the folder. This is
  // the same rule Create-Graphic uses for its source selector.
  const one = dests.length < 2;
  splitDestEl.hidden = one;
  document.getElementById('splitDestCaption').hidden = one;
  dests.forEach((d, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'picker-folder-btn' + (i === splitDestIdx ? ' active' : '');
    b.textContent = d.name;
    if (!d.handle) b.title = 'Will be created in the connected folder';
    b.addEventListener('click', () => { splitDestIdx = i; renderSplitDests(); updateSplitCount(); });
    splitDestEl.appendChild(b);
  });
}

// Default file name for a piece: "<base> - <kind>", numbered when that kind of
// piece occurs more than once ("arm - line 1" / "arm - line 2"). Numbering is by
// the label's STEM, not the label — several elements can each produce their own
// "line 1", and appending a second index to that reads as "line 1 2". The whole
// symbol keeps the base name on its own.
const labelStem = s => String(s).replace(/\s+\d+$/, '');
function splitDefaultNames(pieces, base){
  const counts = {};
  for (const p of pieces) if (p.level > 0) counts[labelStem(p.label)] = (counts[labelStem(p.label)] || 0) + 1;
  const seen = {};
  return pieces.map(p => {
    if (p.level === 0) return base;
    const stem = labelStem(p.label);
    if (counts[stem] === 1) return `${base} - ${stem}`;
    seen[stem] = (seen[stem] || 0) + 1;
    return `${base} - ${stem} ${seen[stem]}`;
  });
}

function runSplit(){
  if (!splitSrc) { splitRows = []; renderSplitRows(); return; }
  let res;
  try { res = splitGraphic(splitSrc.text, splitOpts()); }
  catch (e) { splitRows = []; renderSplitRows(e.message); return; }
  const base = splitBaseEl.value.trim() || splitSrc.name;
  const names = splitDefaultNames(res.pieces, base);
  splitRows = res.pieces.map((piece, i) => ({ piece, name: names[i], keep: true }));
  renderSplitRows(res.warnings.join(' '));
}

function renderSplitRows(note){
  splitListEl.innerHTML = '';
  if (!splitSrc){
    splitListEl.innerHTML = '<div class="create-empty">Choose a symbol to see its components.</div>';
    splitCountEl.textContent = ''; splitSaveBtn.disabled = true;
    return;
  }
  if (!splitRows.length){
    splitListEl.innerHTML = `<div class="create-empty">${note || 'Nothing to split.'}</div>`;
    splitCountEl.textContent = ''; splitSaveBtn.disabled = true;
    return;
  }
  let level = -1;
  splitRows.forEach((row, i) => {
    if (row.piece.level !== level){
      level = row.piece.level;
      const h = document.createElement('div');
      h.className = 'split-lvl';
      const n = document.createElement('span');
      n.textContent = level === 0 ? 'Level 0 — the whole symbol'
        : level === 1 ? 'Level 1 — components'
        : `Level ${level} — sub-components`;
      const all = document.createElement('button');
      all.type = 'button'; all.className = 'seq-chip-btn'; all.textContent = 'all / none';
      all.addEventListener('click', () => {
        const mine = splitRows.filter(r => r.piece.level === level);
        const on = !mine.every(r => r.keep);
        mine.forEach(r => { r.keep = on; });
        renderSplitRows(note);
      });
      h.appendChild(n); h.appendChild(all);
      splitListEl.appendChild(h);
    }
    const el = document.createElement('div');
    el.className = 'split-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = row.keep;
    cb.addEventListener('change', () => { row.keep = cb.checked; updateSplitCount(); });
    const thumb = document.createElement('div');
    thumb.className = 'split-thumb';
    thumb.innerHTML = splitThumb(splitSrc.text, row.piece.refs);
    const svg = thumb.querySelector('svg');
    if (svg){ svg.removeAttribute('width'); svg.removeAttribute('height'); }
    const lbl = document.createElement('span');
    lbl.className = 'split-label';
    lbl.textContent = row.piece.hint ? `${row.piece.label} (${row.piece.hint})` : row.piece.label;
    const name = document.createElement('input');
    name.type = 'text'; name.className = 'split-name'; name.value = row.name; name.autocomplete = 'off';
    name.addEventListener('input', () => { row.name = name.value; });
    el.append(cb, thumb, lbl, name);
    splitListEl.appendChild(el);
  });
  updateSplitCount(note);
}

function updateSplitCount(note){
  const n = splitRows.filter(r => r.keep).length;
  const dest = (folder.svgSplitDests || [])[splitDestIdx];
  splitCountEl.textContent = (note ? note + ' ' : '') +
    `${n} of ${splitRows.length} piece${splitRows.length === 1 ? '' : 's'}${dest ? ` → ${dest.name}` : ''}`;
  splitSaveBtn.disabled = !n;
}

async function saveSplitPieces(){
  const chosen = splitRows.filter(r => r.keep);
  if (!chosen.length) return;
  for (const r of chosen){
    const nm = r.name.trim();
    if (!nm) { setStatus('Every piece needs a name.', 'err'); return; }
    if (/[\\/:*?"<>|]/.test(nm)) { setStatus(`“${nm}” has characters a file name can’t contain.`, 'err'); return; }
  }
  const names = chosen.map(r => r.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) { setStatus('Two pieces have the same name.', 'err'); return; }

  const dest = (folder.svgSplitDests || [])[splitDestIdx];
  if (!dest) { setStatus('No destination folder.', 'err'); return; }
  let destDir = dest.handle;
  if (!destDir){
    try { destDir = dest.handle = await folder.dir.getDirectoryHandle(dest.name, { create: true }); }
    catch (e){ setStatus(`Couldn't open the “${dest.name}” folder — ${e.message}`, 'err'); return; }
  }
  // One confirmation for the whole set: writing 6 files should not mean 6 prompts.
  const clashes = [];
  for (const r of chosen){
    try { await destDir.getFileHandle(r.name.trim() + '.svg'); clashes.push(r.name.trim()); } catch {}
  }
  if (clashes.length){
    const list = clashes.slice(0, 6).join(', ') + (clashes.length > 6 ? `, +${clashes.length - 6} more` : '');
    if (!(await confirmDiscard(`${clashes.length} file(s) already in “${dest.name}” will be overwritten: ${list}. Continue?`))) return;
  }
  try {
    for (const r of chosen){
      const fh = await destDir.getFileHandle(r.name.trim() + '.svg', { create: true });
      if (!(await ensureRW(fh))) throw new Error('write permission denied');
      const w = await fh.createWritable(); await w.write(r.piece.svg); await w.close();
    }
    SVG_LIST = null;                       // the picker re-enumerates on open
    logLine(`Split "${splitSrc.name}" into ${chosen.length} file(s) in "${dest.name}": ${chosen.map(r => r.name.trim()).join(', ')}`);
    closeSplitDialog();
    setStatus(`Saved ${chosen.length} component${chosen.length === 1 ? '' : 's'} to the “${dest.name}” folder.`, 'ok');
  } catch (e){ setStatus(`Save failed — ${e.message}`, 'err'); }
}

if (splitBtn && SPLIT_ENABLED){
  splitBtn.addEventListener('click', openSplitDialog);
  document.getElementById('splitClose').addEventListener('click', closeSplitDialog);
  document.getElementById('splitCancel').addEventListener('click', closeSplitDialog);
  splitSaveBtn.addEventListener('click', saveSplitPieces);
  splitOverlay.addEventListener('mousedown', e => { if (e.target === splitOverlay) closeSplitDialog(); });
  for (const id of ['splitDiagonal', 'splitHalves', 'splitWhole', 'splitMerge'])
    document.getElementById(id).addEventListener('change', runSplit);
  // Renaming the base re-derives every piece name — hand-edits are made after.
  splitBaseEl.addEventListener('input', () => {
    if (!splitRows.length) return;
    const names = splitDefaultNames(splitRows.map(r => r.piece), splitBaseEl.value.trim() || splitSrc.name);
    splitRows.forEach((r, i) => { r.name = names[i]; });
    renderSplitRows();
  });
  document.getElementById('splitChooseBtn').addEventListener('click', () => {
    openSvgPicker(async (name, srcHandle) => {
      let text;
      try { text = await readGraphicPartText(name, srcHandle); }
      catch (e){ setStatus(`Couldn't read “${name}.svg” — ${e.message}`, 'err'); return; }
      splitSrc = { name, text };
      splitSrcEl.textContent = name;
      splitBaseEl.value = name;
      runSplit();
    }, splitSrc ? splitSrc.name : '', folder.svgSplitSources);
  });
}

// Run Step-0 prep on the currently loaded SVG, then derive the scale from
// whatever we ended up with. Prep is unconditional — every graphic the app
// renders goes through it. Stroke detection runs on the PREPPED svg, since that
// is what is actually handed to OpenSCAD.
// Prep an arbitrary SVG's TEXT the same way the main graphic is prepped, returning
// the prepped text (no module state, no logging). Used for the Tiles designer's
// per-piece SVGs, which are written to the WASM FS and imported by the .scad.
// Prep a tile-piece SVG through the same Step-0 pipeline as the Symbols graphic
// and report the prepped file's mm-per-unit. normalizeUnits pins a file that has
// a viewBox to 1 mm/unit; a file it can't normalize keeps its own units and we
// fall back to 1 (mirroring the Symbols path). The .scad derives the raised-graphic
// scale as band_scale_factor / mmPerUnit, so this is what sets each piece's size.
function prepSvgText(text){
  let s = text, mmPerUnit = 1;
  try { const r = stripIndicators(s); if (r && r.svg) s = r.svg; } catch {}
  try { const r = fattenStrokes(s);   if (r && r.svg) s = r.svg; } catch {}
  try { const r = strokeToOutline(s); if (r && r.svg) s = r.svg; } catch {}
  try { const r = normalizeUnits(s);  if (r && r.svg) { s = r.svg; mmPerUnit = r.mmPerUnit ?? 1; } } catch {}
  // Guideline-matrix registration, measured on the PREPPED artwork — that is the
  // ink OpenSCAD imports. A file with no viewBox (the hand-prepped legacy SVGs)
  // gives no matrix to register against, so it falls back to 0/0, i.e. the
  // ink-centered behavior it had before.
  let ox = 0, oy = 0;
  try { const o = matrixOffsets(s); if (o) { ox = o.ox; oy = o.oy; } } catch {}
  return { text: s, mmPerUnit, ox, oy };
}

function applyPrep(){
  if (!svgRaw) return;
  {
    // First part of Step 0: indicator removal, gated by the Graphic Info param
    // `remove_Bliss_indicators` (default yes). At "no" the raw SVG passes through
    // to the rest of prep unchanged.
    let stripped = svgRaw;
    if ((pv('remove_Bliss_indicators') ?? 'yes') !== 'no') {
      const strip = stripIndicators(svgRaw);
      stripped = strip.svg;
      logLine(strip.skipped ? `Step 0: indicator removal skipped — ${strip.skipped}.`
        : strip.removed ? `Step 0: removed indicator above the sky line — ${strip.shape} (${strip.removed} element(s)).`
        : 'Step 0: no indicator found above the sky line.');
    } else {
      logLine('Step 0: indicator removal off (remove Bliss indicators = no).');
    }

    const fat = fattenStrokes(stripped);
    logLine(fat.skipped ? `Step 0: stroke thickening skipped — ${fat.skipped}.`
      : fat.from ? `Step 0: thickened stroke ${fat.from} → ${fat.to} units.`
      : 'Step 0: stroke already at prepped width.');

    // Read the stroke width BEFORE outlining consumes it — afterwards there are
    // no strokes left to measure, only filled regions.
    svgPrepStroke = parseStrokeWidth(fat.svg);

    const out = strokeToOutline(fat.svg);
    logLine(out.converted
      ? `Step 0: converted ${out.converted} stroked shape(s) to filled outlines.`
      : 'Step 0: no stroked shapes to outline.');

    const norm = normalizeUnits(out.svg);
    svgText = norm.svg;
    svgMmPerUnit = norm.mmPerUnit ?? 1;
    logLine(norm.mmPerUnit
      ? 'Step 0: pinned units to 1 mm per SVG unit.'
      : 'Step 0: unit normalization skipped — no viewBox; assuming 1 mm per unit.');
  }
  // Measured on the FINAL svg: once outlined, our bbox and OpenSCAD's agree
  // exactly, since neither has a stroke to account for.
  const reg = registrationOffset(svgText);
  svgRegOffset = reg ?? 0;
  logLine(reg === null
    ? 'Registration: could not measure — graphic centred on its own ink.'
    : `Registration: shifted ${reg.toFixed(1)} units to put the band centre on the symbol's.`);
  const sw = svgPrepStroke;
  if (sw) svgStroke = sw;
  // Scale is set by the guideline band now, not by stroke width, so the band is
  // 24 mm by construction. What the stroke width still determines is the printed
  // line thickness — report that, since it is the part that can go wrong.
  const mmPerUnit = 2 * EARTH_SKY_HALF_SPAN / BLISS_BAND_UNITS;
  logLine(sw
    ? `Sky→earth band → ${(2 * EARTH_SKY_HALF_SPAN).toFixed(0)} mm; ` +
      `stroke ${sw.toFixed(2)} units → ${(sw * mmPerUnit).toFixed(2)} mm printed.`
    : 'Warning: no stroke-width found; printed line thickness is unknown.');
}

// Test hooks: run Step-0 prep / scale detection on an SVG string without
// touching the app state.
window.__stripIndicators = stripIndicators;
window.__parseScadVersion = parseScadVersion;
window.__showScadUpdateModal = showScadUpdateModal;   // test hook: resolves the chosen action
window.__fattenStrokes = fattenStrokes;
window.__strokeToOutline = strokeToOutline;
window.__parseStrokeWidth = parseStrokeWidth;
window.__applyPreset = applyPreset;
window.__presetNames = () => presetNames();   // display order (alphabetical), matching the dropdown
window.__composeCompound = composeCompound;
window.__splitGraphic = splitGraphic;
window.__absSegments = absSegments;
window.__matrixOffsets = matrixOffsets;
// Test hook: set params by name and re-render, awaiting the render. Lets a test
// drive a specific configuration (e.g. one tile-piece SVG at a time) without
// operating the form, the way __applyPreset does for whole presets.
window.__setParams = async (vals) => {
  for (const [k, v] of Object.entries(vals || {})){
    const p = PARAMS.find(x => x.name === k);
    if (!p) continue;
    p.value = p.type === 'number' ? parseFloat(v) : String(v);
    if (p.applyUI) p.applyUI();
  }
  await runRender();
};
window.__loadFromFolder = (dir) => loadFromFolder(dir);   // test hook: drive the UI with a mock dir

// drag & drop — the only way to bring in an SVG from outside the connected
// folder now that the header "Open SVG…" button is gone.
['dragenter','dragover'].forEach(ev => viewport.addEventListener(ev, e => { e.preventDefault(); viewport.classList.add('dragover'); }));
['dragleave','drop'].forEach(ev => viewport.addEventListener(ev, e => { e.preventDefault(); viewport.classList.remove('dragover'); }));
viewport.addEventListener('drop', e => { const f = [...e.dataTransfer.files].find(f => /\.svg$/i.test(f.name)); if (f) loadSvgFile(f); });

// ------------------------------------------------------------- SCAD customizer
// Params the app manages itself (set programmatically, not shown as controls).
const APP_MANAGED = new Set(['svg_path', 'svg_mm_per_unit', 'graphic_registration_offset',
                             'Bliss_concept_width', 'concept_width_override']);
// Display overrides for params whose SCAD name doesn't read well in the form,
// and params whose `//` comment is developer-facing rather than user-facing.
const LABELS  = { graphic_svg: 'Graphic File' };
const NO_DESC = new Set(['graphic_svg']);

// Per-piece SVG references in the Tiles designer: params named tile_piece_svg_N.
// They STORE a connected-folder-relative path (e.g. "Basic SVG files/foo.svg") but
// SHOW just the filename ("foo"), and — unlike graphic_svg — do not load into the
// viewport; the render step preps and writes each referenced SVG. Symbols has no
// such params, so all of this is inert there.
const isTilePieceSvg = name => /^tile_piece_svg_\d+$/.test(name);
const tilePieceLabel = name => { const m = name.match(/^tile_piece_svg_(\d+)$/); return m ? `Tile-Piece SVG ${m[1]}` : null; };
const svgBaseFromPath = p => String(p || '').replace(/\\/g, '/').replace(/^.*\//, '').replace(/\.svg$/i, '');
// The picker source folder a chosen handle belongs to (for building the stored path).
function pickerSourceNameFor(handle){
  const s = (folder && folder.svgPickerSources || []).find(x => x.handle === handle);
  return s ? s.name : null;
}
// Resolve a bare filename to a "<folder>/<name>.svg" path by finding which picker
// source folder actually holds it (first match wins).
async function resolveTilePieceSvg(name){
  for (const s of (folder && folder.svgPickerSources || [])){
    try { await s.handle.getFileHandle(name + '.svg'); return `${s.name}/${name}.svg`; } catch {}
  }
  return '';
}
let PARAMS = [];        // [{name, type:'string'|'number', value, control, options, min, max, step, desc, group, applyUI}]
let SCAD_TEXT = '';
// OpenSCAD Customizer presets, read from the sibling "Bliss Tactile Symbols.json"
// (same basename as the .scad, the convention the desktop program uses). Shape:
// { "<preset name>": { "<param>": "<value-as-string>", … }, … }. null until loaded.
let PRESETS = null;
// The desktop Customizer always offers a built-in "design default values" entry
// that restores every parameter to the value declared in the .scad source. It is
// synthesised, never stored in the .json, so we do the same: SCAD_DEFAULTS is a
// snapshot taken right after the form is built from a freshly parsed .scad, in
// the same {param: "value-as-string"} shape as a stored preset, which lets
// applyPreset() treat it like any other. Re-taken on every folder open, so an
// updated .scad brings its new defaults with it.
const DEFAULTS_PRESET = 'design default values';
let SCAD_DEFAULTS = null;

function parseCustomizer(text){
  const lines = text.split(/\r?\n/);
  const groups = []; let cur = null, desc = '';
  for (let raw of lines) {
    const line = raw.trim();
    const g = line.match(/^\/\*\s*\[(.+?)\]\s*\*\/$/);
    if (g) { if (g[1] === 'Hidden') break; cur = { name: g[1], params: [] }; groups.push(cur); desc = ''; continue; }
    if (!cur) continue;
    if (line.startsWith('//')) { desc = line.replace(/^\/\/\s?/, ''); continue; }
    const p = line.match(/^([A-Za-z_]\w*)\s*=\s*(.+?);\s*(?:\/\/\s*(.*))?$/);
    if (p) {
      const name = p[1]; let rawval = p[2].trim(); const tail = (p[3] || '').trim();
      const isStr = /^".*"$/.test(rawval);
      const value = isStr ? rawval.slice(1, -1) : parseFloat(rawval);
      const opt = tail.match(/^\[(.*)\]$/);
      const param = { name, type: isStr ? 'string' : 'number', value, desc, group: cur.name };
      if (opt) {
        const body = opt[1];
        const slider = body.match(/^\s*(-?\d*\.?\d+)\s*:\s*(-?\d*\.?\d+)\s*(?::\s*(-?\d*\.?\d+)\s*)?$/);
        if (slider && !body.includes(',')) {
          param.control = 'range';
          if (slider[3] !== undefined) { param.min = +slider[1]; param.step = +slider[2]; param.max = +slider[3]; }
          else { param.min = +slider[1]; param.max = +slider[2]; param.step = 1; }
        } else {
          param.control = 'select';
          const tokens = body.split(',').map(s => s.trim());
          const labelled = tokens.some(t => /^-?\d+(\.\d+)?\s*:/.test(t));
          param.options = tokens.map(t => {
            if (labelled) { const i = t.indexOf(':'); return i >= 0 ? { v: t.slice(0, i).trim(), label: t.slice(i + 1).trim() } : { v: t, label: t }; }
            return { v: t, label: t };
          });
        }
      } else {
        param.control = isStr ? 'text' : 'number';
      }
      cur.params.push(param);
      desc = '';
    }
  }
  return groups;
}

// Decimal places implied by a SCAD range's step: 0.25 -> 2, 1 -> 0, 0.0001 -> 4.
// Used to display slider/spinner values at the precision the .scad declared,
// and to round away the float noise that snapping arithmetic introduces.
function stepDecimals(step){
  const s = String(step);
  if (s.includes('e-')) return Math.min(10, +s.split('e-')[1] + (s.split('e-')[0].split('.')[1] || '').length);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : Math.min(10, s.length - dot - 1);
}
function fmtStep(v, step){ return Number(v).toFixed(stepDecimals(step)); }

// Clamp into [min,max] and snap to the nearest step off min, matching what the
// slider itself would produce. Rounded to the step's precision so values like
// 1.7500000000000002 never reach the -D argument.
function snapToStep(v, p){
  if (!Number.isFinite(v)) return p.value;
  const clamped = Math.max(p.min, Math.min(p.max, v));
  const snapped = p.min + Math.round((clamped - p.min) / p.step) * p.step;
  return +Math.max(p.min, Math.min(p.max, snapped)).toFixed(stepDecimals(p.step));
}

function buildForm(groups){
  const root = document.getElementById('customizer');
  root.innerHTML = '';
  PARAMS = [];
  buildPresetBar(root);
  groups.forEach((grp, gi) => {
    const det = document.createElement('details');
    det.className = 'group'; det.open = gi < 2;
    const sum = document.createElement('summary'); sum.textContent = grp.name; det.appendChild(sum);
    // Fields live in a body wrapper so the group's padding is applied once,
    // and the gap between controls comes from .field's margin (keyguard's
    // .section-body / .param arrangement).
    const body = document.createElement('div'); body.className = 'groupbody'; det.appendChild(body);
    grp.params.forEach(p => {
      if (APP_MANAGED.has(p.name)) { PARAMS.push(p); return; }   // tracked, not shown
      PARAMS.push(p);
      const field = document.createElement('div'); field.className = 'field';
      const label = document.createElement('label'); label.className = 'name';
      // The graphic picker gets a plain-English label and no help text — the
      // Open/Change button already says what the field is for.
      label.textContent = LABELS[p.name] || tilePieceLabel(p.name) || prettify(p.name); field.appendChild(label);
      if (p.desc && !NO_DESC.has(p.name)) { const d = document.createElement('span'); d.className = 'desc'; d.textContent = p.desc; field.appendChild(d); }
      let input;
      if (p.name === 'graphic_svg') {
        // Assigning a graphic to the symbol: a text box + folder-picker button.
        // Button reads "Open" when empty and "Change" once a file is chosen.
        // Typing a name and committing loads it from the SVG files folder;
        // clearing it drops the graphic. Composition of NEW graphics lives in the
        // separate Create-Graphic dialog, which writes a finished .svg into the
        // folder that this picker then selects like any other file.
        const wrap = document.createElement('div'); wrap.className = 'svgpick';
        input = document.createElement('input'); input.type = 'text';
        // autocomplete/autofill off: the box must show exactly graphic_svg's
        // value, so an empty param reads as an empty box. Chrome otherwise
        // restores the previous session's text on reload.
        input.autocomplete = 'off'; input.name = 'graphic_svg_' + Math.random().toString(36).slice(2);
        input.value = p.value ?? ''; input.placeholder = 'no file chosen';
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'svgpick-btn';
        const syncBtn = () => { btn.textContent = input.value.trim() ? 'Change' : 'Open'; };
        syncBtn();
        p.applyUI = () => { input.value = p.value ?? ''; syncBtn(); };
        input.addEventListener('input', syncBtn);
        input.addEventListener('change', () => {
          const name = input.value.trim();
          p.value = name; syncBtn();
          if (name) loadSvgByName(name); else clearGraphic();
        });
        btn.addEventListener('click', () => openSvgPicker(loadSvgByName, input.value.trim(), folder.svgPickerSources));
        wrap.appendChild(input); wrap.appendChild(btn); field.appendChild(wrap);
        body.appendChild(field);
        return;
      }
      if (isTilePieceSvg(p.name)) {
        // Per-tile-piece SVG: text box + folder-picker button. Stores the
        // connected-folder-relative path, shows just the filename. Picking (or
        // typing a valid filename) sets the value and re-renders; the render step
        // reads/preps/writes the referenced SVG. It never loads into the viewport.
        const wrap = document.createElement('div'); wrap.className = 'svgpick';
        input = document.createElement('input'); input.type = 'text';
        input.autocomplete = 'off'; input.name = p.name + '_' + Math.random().toString(36).slice(2);
        input.value = svgBaseFromPath(p.value); input.placeholder = 'no file chosen';
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'svgpick-btn';
        const syncBtn = () => { btn.textContent = input.value.trim() ? 'Change' : 'Open'; };
        syncBtn();
        p.applyUI = () => { input.value = svgBaseFromPath(p.value); syncBtn(); };
        const commit = relpath => { p.value = relpath; input.value = svgBaseFromPath(relpath); syncBtn(); updateDirty(); scheduleRender(); };
        input.addEventListener('input', syncBtn);
        input.addEventListener('change', async () => {
          const typed = input.value.trim();
          if (!typed) { commit(''); return; }
          const rel = await resolveTilePieceSvg(typed);
          if (rel) commit(rel);
          else { setStatus(`No “${typed}.svg” in the picker folders.`, 'err'); input.value = svgBaseFromPath(p.value); syncBtn(); }
        });
        btn.addEventListener('click', () => openSvgPicker((name, srcHandle) => {
          const dirName = pickerSourceNameFor(srcHandle) || APP_CONFIG.svgOwnDir;
          commit(name ? `${dirName}/${name}.svg` : '');
        }, svgBaseFromPath(p.value), folder.svgPickerSources));
        wrap.appendChild(input); wrap.appendChild(btn); field.appendChild(wrap);
        body.appendChild(field);
        return;
      }
      if (p.control === 'select') {
        input = document.createElement('select');
        p.options.forEach(o => { const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.label; input.appendChild(opt); });
        input.value = String(p.value);
        p.applyUI = () => { input.value = String(p.value); };
        input.addEventListener('change', () => {
          p.value = p.type === 'number' ? +input.value : input.value;
          // Display-colour changes are viewport-only — recolour without re-rendering geometry.
          if (p.name === 'symbol_display_color' || p.name === 'graphic_display_color') { applyColors(); requestFrame(); }
          // Indicator removal reshapes the SVG handed to OpenSCAD, so re-run prep.
          else if (p.name === 'remove_Bliss_indicators') { applyPrep(); scheduleRender(); }
          else scheduleRender();
        });
        field.appendChild(input);
      } else if (p.control === 'range') {
        // Slider paired with a number spinner, as in the keyguard designer. The
        // spinner is the canonical control: it carries the SCAD range's exact
        // step, so a param declared [1:0.25:4] can be nudged a quarter at a time
        // instead of only as far as a slider pixel resolves.
        const wrap = document.createElement('div'); wrap.className = 'rangewrap';
        input = document.createElement('input'); input.type = 'range';
        input.min = p.min; input.max = p.max; input.step = p.step; input.value = p.value;
        const spin = document.createElement('input'); spin.type = 'number'; spin.className = 'rangeval';
        spin.min = p.min; spin.max = p.max; spin.step = p.step; spin.value = fmtStep(p.value, p.step);
        p.applyUI = () => { input.value = p.value; spin.value = fmtStep(p.value, p.step); };

        const commit = (v, echoTo) => {
          const snapped = snapToStep(v, p);
          p.value = snapped;
          const text = fmtStep(snapped, p.step);
          input.value = snapped;
          if (echoTo !== spin) spin.value = text;
          scheduleRender();
        };
        // Dragging the slider tracks live in the spinner but only renders on release.
        input.addEventListener('input',  () => { spin.value = fmtStep(+input.value, p.step); });
        input.addEventListener('change', () => commit(+input.value, input));
        // Track typed digits live so the preset reads dirty (and Save enables) even
        // before the value is committed on blur/Enter. p.value takes the raw typed
        // number WITHOUT snapping or reformatting, so mid-keystroke text isn't
        // clobbered; the 'change' handler below does the final clamp+snap+render.
        // Without this, typing a new value and clicking Save — when the typed value
        // was the only change — saved the OLD value: the spinner commits only on
        // 'change', so Save stayed disabled and p.value never updated.
        spin.addEventListener('input', () => {
          const v = parseFloat(spin.value);
          if (Number.isFinite(v)) { p.value = v; updateDirty(); }
        });
        // Typed text is only committed on change/blur, so partial entries like
        // "-" or "1." aren't clamped out from under the user mid-keystroke.
        spin.addEventListener('change', () => {
          if (spin.value === '') { spin.value = fmtStep(p.value, p.step); return; }  // reject empty, keep last good
          commit(+spin.value, spin);
          spin.value = fmtStep(p.value, p.step);   // reflect clamping/snapping back
        });
        wrap.appendChild(input); wrap.appendChild(spin); field.appendChild(wrap);
      } else {
        input = document.createElement('input');
        input.type = p.control === 'number' ? 'number' : 'text';
        input.value = p.value;
        p.applyUI = () => { input.value = p.value; };
        input.addEventListener('change', () => { p.value = p.type === 'number' ? +input.value : input.value; scheduleRender(); });
        field.appendChild(input);
      }
      body.appendChild(field);
    });
    root.appendChild(det);
  });
}

// ---- preset state + dirty tracking ----------------------------------------
let currentPreset = '';        // '' = the "— choose a concept —" placeholder
let presetBaseline = null;     // snapshot of savable params at last apply/save
let presetFileFormatVersion = 1;

// The params a preset stores: every user-facing param (incl. graphic_svg),
// excluding the app-managed ones the app computes itself.
function savableParams(){ return PARAMS.filter(p => !APP_MANAGED.has(p.name)); }
function snapshotParams(){ const s = {}; for (const p of savableParams()) s[p.name] = String(p.value); return s; }
function isDirty(){
  if (!presetBaseline) return false;
  const cur = snapshotParams();
  for (const k of Object.keys(cur)) if (cur[k] !== (presetBaseline[k] ?? '')) return true;
  return false;
}
function updateDirty(){
  // Dirty is measured against presetBaseline, which is set when the folder opens
  // (the .scad defaults), when a preset is applied, and after each Save/Add — so a
  // change is trackable even with no named preset selected.
  const dirty = isDirty();
  const marker = document.getElementById('dirtyMarker');
  if (marker) marker.classList.toggle('visible', dirty);
  const save = document.getElementById('savePresetBtn'); if (save) save.disabled = !dirty || !folder;
  // Reset acts on unsaved edits, so it is live exactly when Save is.
  const reset = document.getElementById('resetPresetBtn'); if (reset) reset.disabled = !dirty || !folder;
  // The built-in defaults entry isn't in the file, so there is nothing to delete.
  const del  = document.getElementById('delPresetBtn');  if (del)  del.disabled  = !currentPreset || currentPreset === DEFAULTS_PRESET || !folder;
  const add  = document.getElementById('addPresetBtn');  if (add)  add.disabled  = !folder;
}
window.__presetDbg = () => ({ currentPreset, baseline: presetBaseline, cur: snapshotParams(), dirty: isDirty() });

// Preset selector + Save / Add / Delete, mirroring the desktop Customizer and the
// keyguard web app. Sits at the top of the Customizer pane and drives the params
// below it. The list is the connected JSON's parameterSets (see PRESETS).
function buildPresetBar(root){
  if (!PRESETS || !Object.keys(PRESETS).length) return;
  const bar = document.createElement('div'); bar.className = 'presetbar';
  // Attach the bar FIRST. rebuildPresetOptions() below finds its elements by id
  // via document.getElementById, which only works once they're in the document —
  // building the whole bar detached and appending at the end left the concept
  // list silently empty.
  root.appendChild(bar);
  const label = document.createElement('label'); label.className = 'name';
  label.textContent = 'Concepts ';
  const marker = document.createElement('span'); marker.id = 'dirtyMarker';
  marker.className = 'dirty-marker'; marker.textContent = '● unsaved';
  label.appendChild(marker); bar.appendChild(label);

  // Editable combobox (keyguard's #preset-combo), not a <select>: the concept
  // name has to be selectable/copyable text, which an OS-rendered <select>
  // never is. Up/Down steps concepts; Enter renames; Esc/blur reverts typing.
  const combo = document.createElement('div'); combo.className = 'preset-combo'; combo.id = 'presetCombo';
  const input = document.createElement('input');
  input.type = 'text'; input.id = 'presetInput';
  input.autocomplete = 'off'; input.spellcheck = false;
  input.placeholder = '— choose a concept —';
  input.title = 'Concept — ↑↓ to switch, ▾ for the list, edit the name and press Enter to rename';
  const dropBtn = document.createElement('button');
  dropBtn.type = 'button'; dropBtn.className = 'combo-btn'; dropBtn.id = 'presetDropBtn';
  dropBtn.tabIndex = -1; dropBtn.textContent = '▾';
  dropBtn.setAttribute('aria-label', 'Show concept list');
  const list = document.createElement('ul');
  list.id = 'presetList'; list.setAttribute('role', 'listbox');
  combo.append(input, dropBtn, list);
  bar.appendChild(combo);
  wirePresetCombo(input, dropBtn, list);
  rebuildPresetOptions();

  const actions = document.createElement('div'); actions.className = 'preset-actions';
  const mk = (id, text, title) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.textContent = text; b.title = title; return b; };
  const saveBtn = mk('savePresetBtn', 'Save', 'Overwrite the selected preset (or, with none selected, save the current settings as a new preset)');
  const addBtn  = mk('addPresetBtn',  'New', 'Create a new preset that inherits the selected preset’s settings; prompts for a name');
  const delBtn  = mk('delPresetBtn',  'Delete', 'Delete the selected preset');
  // Reset sits beside Save and mirrors it: Save keeps your edits, Reset throws
  // them away, and both are live only while there are edits to act on.
  const resetBtn = mk('resetPresetBtn', 'Reset', 'Discard unsaved changes and go back to the last saved settings');
  actions.append(saveBtn, resetBtn, addBtn, delBtn);
  bar.appendChild(actions);

  saveBtn.addEventListener('click', savePreset);
  resetBtn.addEventListener('click', resetPreset);
  addBtn.addEventListener('click', addPreset);
  delBtn.addEventListener('click', deletePreset);
  updateDirty();
}
// Display order for the concept list: alphabetical, case-insensitive, so a name
// can be found by eye quickly. The JSON's own key order is NOT alphabetical (a
// handful of concepts were appended to the end over time), and it stays as-is on
// disk — this sort is presentation only. Everything that walks the list (the
// dropdown, ↑/↓ stepping) goes through here, so they can't disagree.
// The built-in defaults entry heads the list — the desktop Customizer puts it
// first too, and it reads as the starting point rather than as a concept filed
// under "d". Everything after it is the JSON's concepts, alphabetical. A concept
// in the file sharing the built-in's name is dropped rather than listed twice;
// the built-in wins, since it is the one that always works.
function presetNames(){
  const names = Object.keys(PRESETS || {})
    .filter(n => n !== DEFAULTS_PRESET)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return SCAD_DEFAULTS ? [DEFAULTS_PRESET, ...names] : names;
}
function closePresetList(){ const l = document.getElementById('presetList'); if (l) l.classList.remove('open'); }
function openPresetList(){
  const l = document.getElementById('presetList'); if (!l || !l.children.length) return;
  l.classList.add('open');
  const act = l.querySelector('li.active');
  if (act) act.scrollIntoView({ block: 'nearest' });
}
// Sync the input to currentPreset and rebuild the list, marking the active row.
// Items bind mousedown, not click, so the pick runs BEFORE the input's blur
// handler reverts the text (keyguard hit the same ordering problem).
function rebuildPresetOptions(){
  const input = document.getElementById('presetInput');
  const list  = document.getElementById('presetList');
  if (!input || !list) return;
  input.value = currentPreset;
  list.innerHTML = '';
  for (const n of presetNames()){
    const li = document.createElement('li');
    li.textContent = n; li.dataset.name = n; li.setAttribute('role', 'option');
    if (n === currentPreset) li.classList.add('active');
    li.addEventListener('mousedown', e => {
      e.preventDefault();
      closePresetList();
      if (n !== currentPreset) selectPreset(n); else input.value = currentPreset;
    });
    list.appendChild(li);
  }
}
function wirePresetCombo(input, dropBtn, list){
  dropBtn.addEventListener('mousedown', e => {
    e.preventDefault();
    if (list.classList.contains('open')) closePresetList();
    else { openPresetList(); input.focus(); }
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown')      { e.preventDefault(); stepPreset(1); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); stepPreset(-1); }
    else if (e.key === 'Enter')     { e.preventDefault(); closePresetList(); renamePreset(input.value); }
    else if (e.key === 'Escape')    { e.preventDefault(); input.value = currentPreset; closePresetList(); input.blur(); }
  });
  // Revert uncommitted typing when focus leaves. The delay lets a list-item
  // mousedown land first.
  input.addEventListener('blur', () => {
    setTimeout(() => { input.value = currentPreset; closePresetList(); }, 150);
  });
}
// Close the list on an outside click. Bound once at module scope — buildForm
// replaces the combo's DOM on every folder open, so a per-combo binding here
// would accumulate.
document.addEventListener('mousedown', e => {
  const combo = document.getElementById('presetCombo');
  if (combo && !combo.contains(e.target)) closePresetList();
});

// ↑/↓: step to the previous/next concept in list order.
function stepPreset(delta){
  const names = presetNames();
  if (!names.length) return;
  const i = names.indexOf(currentPreset);
  // With nothing selected, ↓ enters the list at the top and ↑ at the bottom.
  if (i < 0) { selectPreset(delta > 0 ? names[0] : names[names.length - 1]); return; }
  const j = Math.max(0, Math.min(names.length - 1, i + delta));
  if (j !== i) selectPreset(names[j]);
}

// Rename the current concept: relabel its parameterSets key on disk, in place.
// Params and dirty state are untouched — only the name changes.
async function renamePreset(newName){
  const input = document.getElementById('presetInput');
  newName = String(newName || '').trim();
  const oldName = currentPreset;
  if (!oldName || !newName || newName === oldName || !folder){ if (input) input.value = oldName; return; }
  // The built-in defaults entry has no row in the file to relabel, and no concept
  // may take its name.
  if (oldName === DEFAULTS_PRESET || newName === DEFAULTS_PRESET){
    if (input) input.value = oldName;
    setStatus(`“${DEFAULTS_PRESET}” is the built-in starting point — it can't be renamed or reused.`, 'err');
    return;
  }
  // Permission first, then the modal — same order as deletePreset, so the
  // permission prompt still has the page's user activation if it needs it.
  if (!(await ensureRW(folder.jsonHandle || folder.dir))){ setStatus('Write permission denied.', 'err'); if (input) input.value = oldName; return; }
  if (PRESETS[newName] && !(await confirmDiscard(`A concept named “${newName}” exists. Replace it?`))){
    if (input) input.value = oldName; return;
  }
  try {
    // Rebuild in key order so the renamed concept keeps its position in the
    // FILE rather than jumping to the end. (The dropdown sorts independently —
    // see presetNames() — so this only affects the JSON's own layout.)
    const next = {};
    for (const k of Object.keys(PRESETS)) { if (k === oldName) next[newName] = PRESETS[oldName]; else if (k !== newName) next[k] = PRESETS[k]; }
    PRESETS = next;
    currentPreset = newName;
    await writePresetsFile();
    rebuildPresetOptions(); updateDirty();
    setStatus(`Renamed “${oldName}” to “${newName}”.`, 'ok');
    logLine(`Renamed preset "${oldName}" to "${newName}" in ${folder.jsonName}`);
  } catch (e) {
    setStatus('Rename failed — see console', 'err');
    logLine('Rename preset failed: ' + (e.message || e));
    if (input) input.value = oldName;
  }
}

// Switch to preset `name`, honouring the unsaved-changes guard.
async function selectPreset(name){
  const input = document.getElementById('presetInput');
  if (name === currentPreset) { if (input) input.value = currentPreset; return; }
  if (currentPreset && isDirty()){
    const ok = await confirmDiscard(`Discard unsaved changes to “${currentPreset}”?`);
    if (!ok){ if (input) input.value = currentPreset; return; }
  }
  if (!name){ currentPreset = ''; presetBaseline = snapshotParams(); rebuildPresetOptions(); updateDirty(); return; }
  applyPreset(name);
}

// Apply a preset's stored values onto the live params, then re-render once.
// Only keys that map to a current, user-facing param are used: app-managed
// params (svg_path, the auto-computed concept width, …) are always skipped so a
// legacy preset can't fight the app's own logic, and keys with no matching param
// (removed/renamed since the preset was saved) are ignored. Values are strings
// in the JSON, coerced to each param's type; ranges are snapped to their step.
//
// Every user-facing param is written on every switch: one the preset doesn't
// name falls back to the .scad default, NOT to whatever the previous concept
// left there. Skipping it (as this did) meant a concept silently inherited
// stray values from the one before it, so the same concept could render
// differently depending on what you had loaded first. This is what the keyguard
// designer does — populateFormFromPreset builds a full map the same way.
// Push a {param: "value-as-string"} map onto the live params. Shared by
// applyPreset and resetPreset — the two differ only in where the map comes from
// (a stored concept vs the last known-clean snapshot), not in how it is applied.
function applyParamValues(preset){
  for (const p of PARAMS){
    if (APP_MANAGED.has(p.name)) continue;
    if (p.name === 'graphic_svg') continue;   // handled below — absent means "no graphic", not "keep"
    const raw = (p.name in preset) ? preset[p.name] : (SCAD_DEFAULTS ? SCAD_DEFAULTS[p.name] : undefined);
    if (raw === undefined) continue;          // param the .scad no longer declares
    if (p.type === 'number'){
      let v = parseFloat(raw);
      if (!Number.isFinite(v)) continue;
      if (p.control === 'range') v = snapToStep(v, p);
      p.value = v;
    } else {
      p.value = String(raw);
    }
    if (p.applyUI) p.applyUI();
  }
  applyColors();          // display-colour params are viewport-only
  // The graphic belongs to the preset like any other value, so a MISSING
  // graphic_svg key means "no graphic" — not "keep whatever the last concept
  // loaded". Carrying it over silently attached artwork the user never chose for
  // this concept, and left the box showing a file the preset doesn't specify.
  // (Only a handful of the shipped concepts name a graphic, so most switches clear it.)
  const nm = String(preset.graphic_svg ?? '').trim();
  if (nm) { setGraphicSvgName(nm); loadSvgByName(nm); }   // loads + preps + renders
  else clearGraphic();                                    // blanks the box and re-renders
}

function applyPreset(name){
  // The built-in defaults entry is synthesised from the .scad, not looked up in
  // the JSON; from here on it behaves exactly like a stored preset.
  const preset = (name === DEFAULTS_PRESET) ? SCAD_DEFAULTS : (PRESETS && PRESETS[name]);
  if (!preset) return;
  currentPreset = name;
  rebuildPresetOptions();   // syncs the combo input + moves the active row
  applyParamValues(preset);
  // Baseline AFTER the graphic is settled, so a fresh preset doesn't read dirty.
  presetBaseline = snapshotParams();
  updateDirty();
  setStatus('Applied preset “' + name + '” — rendering…', 'busy');
}

// Reset — throw away unsaved edits (Ken, 2026-08-14). It restores
// presetBaseline, the last known-clean snapshot: the concept as it was applied
// or last saved, or, with no concept selected, the .scad defaults the folder
// opened on. That one rule covers every case, so there is no separate "revert to
// the file" path to keep in step. It is a button beside Save in the preset bar,
// enabled exactly when Save is: the two are the pair of answers to "you have
// unsaved changes" — keep them, or throw them away.
function resetPreset(){
  if (!presetBaseline || !isDirty()) return;
  applyParamValues(presetBaseline);
  presetBaseline = snapshotParams();   // re-taken after the graphic settles, as applyPreset does
  updateDirty();                       // greys Save and Reset again — nothing is dirty now
  setStatus(currentPreset
    ? `Discarded unsaved changes to “${currentPreset}” — rendering…`
    : 'Discarded unsaved changes — rendering…', 'busy');
}
window.__resetPreset = resetPreset;

// ---- preset save / add / delete (write the single JSON in place) -----------
// Serialize to the on-disk format: 4-space indent, keys sorted within each
// preset, forward slashes escaped (\/) to match the existing file's style.
// Concept names are sorted with the SAME comparator as presetNames() (Ken,
// 2026-07-20), so the file's order matches the Concepts list in the UI and a
// newly added concept lands in its alphabetical place rather than at the end.
function buildPresetJson(parameterSets){
  const out = {};
  for (const name of Object.keys(parameterSets).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))){
    const sorted = {};
    for (const k of Object.keys(parameterSets[name]).sort((a, b) => a.localeCompare(b))) sorted[k] = parameterSets[name][k];
    out[name] = sorted;
  }
  return JSON.stringify({ parameterSets: out, fileFormatVersion: presetFileFormatVersion }, null, 4).replace(/\//g, '\\/') + '\n';
}
async function writePresetsFile(){
  if (!folder) throw new Error('No folder is connected.');
  const name = folder.jsonName || (folder.scadName.replace(/\.scad$/i, '') + '.json');
  const fh = folder.jsonHandle || await folder.dir.getFileHandle(name, { create: true });
  if (!(await ensureRW(fh))) throw new Error('write permission denied');
  const text = buildPresetJson(PRESETS);
  const w = await fh.createWritable(); await w.write(text); await w.close();
  folder.jsonHandle = fh; folder.jsonName = name;
}
async function savePreset(){
  if (!folder) return;
  // Nothing selected → Save As (prompt for a name). Editing the built-in defaults
  // takes the same route: it is not a row in the file, so there is nothing to
  // save over, and the edit becomes a new concept.
  if (!currentPreset || currentPreset === DEFAULTS_PRESET) return addPreset();
  try {
    PRESETS[currentPreset] = { ...(PRESETS[currentPreset] || {}), ...snapshotParams() };
    await writePresetsFile();
    presetBaseline = snapshotParams(); updateDirty();
    setStatus(`Saved preset “${currentPreset}”.`, 'ok');
    logLine(`Saved preset "${currentPreset}" to ${folder.jsonName}`);
  } catch (e) { setStatus('Save failed — see console', 'err'); logLine('Save preset failed: ' + (e.message || e)); }
}
async function addPreset(){
  if (!folder) return;
  // Grab write permission BEFORE prompt(): a native prompt consumes the page's
  // user-activation, which requestPermission() would then need and not have.
  if (!(await ensureRW(folder.jsonHandle || folder.dir))){ setStatus('Write permission denied.', 'err'); return; }
  // Don't seed the prompt with the built-in's name — it can't be used as a concept.
  const seed = currentPreset === DEFAULTS_PRESET ? '' : currentPreset;
  const name = (prompt('Name for the new preset:', seed || '') || '').trim();
  if (!name) return;
  if (name === DEFAULTS_PRESET){ setStatus(`“${DEFAULTS_PRESET}” is the built-in starting point — choose another name.`, 'err'); return; }
  if (PRESETS[name] && !(await confirmDiscard(`A preset named “${name}” exists. Overwrite it?`))) return;
  try {
    PRESETS[name] = { ...(PRESETS[currentPreset] || {}), ...snapshotParams() };
    await writePresetsFile();
    currentPreset = name; rebuildPresetOptions();
    presetBaseline = snapshotParams(); updateDirty();
    setStatus(`Added preset “${name}”.`, 'ok');
    logLine(`Added preset "${name}" to ${folder.jsonName}`);
  } catch (e) { setStatus('Add failed — see console', 'err'); logLine('Add preset failed: ' + (e.message || e)); }
}
async function deletePreset(){
  if (!currentPreset || !folder) return;
  const name = currentPreset;
  if (!(await ensureRW(folder.jsonHandle || folder.dir))){ setStatus('Write permission denied.', 'err'); return; }
  if (!(await confirmDiscard(`Delete preset “${name}”? This cannot be undone.`))) return;
  try {
    delete PRESETS[name];
    await writePresetsFile();
    logLine(`Deleted preset "${name}" from ${folder.jsonName}`);
    // Land on the built-in defaults (Ken, 2026-07-22) rather than the empty
    // placeholder: clearing the selection left the form still showing the deleted
    // concept's values, so the params on screen belonged to something that no
    // longer exists. Falling back to "design default values" gives a complete,
    // real starting point — the same one a fresh folder opens on.
    // currentPreset is cleared first so applyPreset() doesn't early-return, and
    // it never prompts about unsaved changes to a concept that is already gone.
    currentPreset = ''; presetBaseline = null;
    if (SCAD_DEFAULTS) applyPreset(DEFAULTS_PRESET);
    else { rebuildPresetOptions(); updateDirty(); }
    // Last, so the delete is what the pill shows — applyPreset's "rendering…" is
    // replaced by the render's own status a moment later either way.
    setStatus(`Deleted preset “${name}”.`, 'ok');
  } catch (e) { setStatus('Delete failed — see console', 'err'); logLine('Delete preset failed: ' + (e.message || e)); }
}

function prettify(name){ return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

// -------------------------------------------------------------------- render
function dArgs(){
  const args = [];
  for (const p of PARAMS) {
    if (p.name === 'svg_path') { args.push('-D', `svg_path="${svgText ? 'graphic.svg' : ''}"`); continue; }
    if (p.name === 'svg_mm_per_unit') { args.push('-D', `svg_mm_per_unit=${svgMmPerUnit}`); continue; }
    if (p.name === 'graphic_registration_offset') { args.push('-D', `graphic_registration_offset=${svgRegOffset}`); continue; }
    if (p.name === 'concept_width_override') { args.push('-D', `concept_width_override=${conceptWidthOverride}`); continue; }
    if (p.name === 'Bliss_concept_width') { continue; }   // superseded by the override; not emitted
    if (p.name === 'graphic_svg') { continue; }           // app loads the SVG to graphic.svg; svg_path is overridden above
    const val = p.type === 'string' ? `"${p.value}"` : `${p.value}`;
    args.push('-D', `${p.name}=${val}`);
  }
  // Tiles: each piece's prepped mm/unit, so the .scad derives its raised-graphic
  // scale (band_scale_factor / mm/unit) per piece. Empty for Symbols.
  if (TILE_PIECE_MMPU.length) args.push('-D', `tile_piece_mm_per_unit=[${TILE_PIECE_MMPU.join(',')}]`);
  if (TILE_PIECE_OFFY.length) args.push('-D', `tile_piece_offset_y=[${TILE_PIECE_OFFY.join(',')}]`);
  return args;
}

let renderTimer = null, rendering = false, pending = false;
function scheduleRender(){ clearTimeout(renderTimer); renderTimer = setTimeout(runRender, 160); }

const noise = t => /ECHO|Compiling|Geometries in cache|rendering time|Top level|Current top level object is empty|Could not initialize localization|CGAL (Polyhedrons|cache)|Geometry cache|Status:\s+NoError|Genus:|Vertices:|Facets:/i.test(t);

// Tile-piece SVGs (Tiles designer): each populated tile_piece_svg_N param names a
// connected-folder-relative SVG path. Before a render we read + prep them; renderOnce
// writes each into the fresh WASM FS at the SAME relative path, so the .scad's
// import(path) finds the prepped version. Always empty for Symbols.
let TILE_PIECE_FILES = [];
let TILE_PIECE_MMPU = [];   // slot N-1 = tile_piece_svg_N's prepped mm/unit; passed as -D
// Guideline-band registration per slot, in SVG units — what puts a split component
// at its own height on the tile instead of at the band's middle (Ken, 2026-08-11).
// VERTICAL ONLY: a tile graphic is centered horizontally on its own ink, so the
// target graphic and the tile below it both sit on their column's center line and
// therefore line up (Ken, 2026-08-14). There is no X counterpart.
let TILE_PIECE_OFFY = [];
async function readSvgByRelPath(rel){
  const segs = rel.split('/').filter(Boolean);
  const file = segs.pop();
  let dh = folder.dir;
  for (const seg of segs) dh = await dh.getDirectoryHandle(seg);
  const fh = await dh.getFileHandle(file);
  return (await fh.getFile()).text();
}
async function prepareTilePieceSvgs(){
  TILE_PIECE_FILES = [];
  TILE_PIECE_MMPU = [];
  if (!folder) return;
  // Prep each distinct referenced SVG once, then build a slot-indexed mm/unit
  // array aligned to tile_piece_svg_1..20 (the .scad's tile_piece_svgs order), so
  // each piece's derived scale (band_scale_factor / mm/unit) is per-piece correct.
  const cache = new Map();   // rel -> { text, mmPerUnit, ox, oy } | null (read/prep failed)
  const slots = [], slotsY = [];
  for (const p of PARAMS){
    const m = p.name.match(/^tile_piece_svg_(\d+)$/);
    if (!m) continue;
    const idx = +m[1] - 1;
    const rel = String(p.value || '').trim();
    if (!rel) { slots[idx] = 1; slotsY[idx] = 0; continue; }
    if (!cache.has(rel)){
      try { cache.set(rel, prepSvgText(await readSvgByRelPath(rel))); }
      catch (e){ logLine(`Tile-piece graphic "${rel}" could not be read/prepped — ${e.message}`); cache.set(rel, null); }
    }
    const prepped = cache.get(rel);
    slots[idx]  = prepped ? prepped.mmPerUnit : 1;
    slotsY[idx] = prepped ? prepped.oy : 0;
  }
  for (const [rel, prepped] of cache){
    if (prepped) TILE_PIECE_FILES.push({ path: rel, text: prepped.text });
  }
  // Only meaningful for Tiles; empty (no slots) for Symbols. Default any gap to 1
  // (mm/unit) and 0 (offset — i.e. plain ink-centered placement).
  if (slots.length){
    TILE_PIECE_MMPU = Array.from({ length: 20 }, (_, i) => slots[i] ?? 1);
    TILE_PIECE_OFFY = Array.from({ length: 20 }, (_, i) => slotsY[i] ?? 0);
  }
}

// Run one OpenSCAD render (fresh WASM instance) and return the STL bytes, or
// null if the render produced no geometry.
async function renderOnce(extraArgs){
  // Collect OpenSCAD's own ERROR: lines so a failed render can report the real
  // cause in the status pill (the console isn't shown in the app).
  const errLines = [];
  // "Current top level object is empty." is OpenSCAD's way of saying this pass
  // had nothing to draw. It exits 1 for it, but for us that is a legitimate
  // outcome, not a failure — see the rc check below.
  let emptyTop = false;
  // Test hook: everything OpenSCAD printed for the LAST pass. Most of it is
  // filtered out of the on-screen log by noise(), so this is the only way to see
  // why a pass came out empty or failed.
  const all = []; window.__lastRenderOut = all;
  const capture = t => {
    all.push(t);
    if (/ERROR:/i.test(t)) errLines.push(t.replace(/^ERROR:\s*/i, '').trim());
    if (/Current top level object is empty/i.test(t)) emptyTop = true;
  };
  const oscad = await createOpenSCAD({
    print:    t => { capture(t); if (!noise(t)) logLine(t); },
    printErr: t => { capture(t); if (!noise(t)) logLine(t); },
  });
  addFonts(oscad.getInstance());
  const fs = oscad.getInstance().FS;
  fs.writeFile('/bliss.scad', SCAD_TEXT);
  if (svgText) fs.writeFile('/graphic.svg', svgText);
  for (const f of TILE_PIECE_FILES){
    const segs = f.path.split('/').filter(Boolean); segs.pop();
    let cur = '';
    for (const seg of segs){ cur += '/' + seg; try { fs.mkdir(cur); } catch {} }
    fs.writeFile('/' + f.path, f.text);
  }
  const args = ['/bliss.scad', '-o', '/out.stl', '--backend=Manifold', ...dArgs(), ...extraArgs];
  const rc = oscad.getInstance().callMain(args);
  // A pass with no geometry is normal, not an error: the graphic pass of a tile
  // base whose target graphics are switched off has nothing raised to draw, and
  // OpenSCAD exits 1 for that with no ERROR: line of its own. Report it as "no
  // mesh" (callers already handle a null) instead of "render returned code 1".
  if (rc !== 0){
    if (emptyTop && !errLines.length) return null;
    throw new Error(errLines.length ? errLines[errLines.length - 1] : 'render returned code ' + rc);
  }
  try { return fs.readFile('/out.stl'); } catch (e) { return null; }
}

// Printed width (mm) of the graphic's INK, i.e. the stroke outline itself — NOT
// the rendered mesh. raw_graphic() grows the import by offset(delta=2), adding
// ~0.75 mm of margin each side; the 5 mm border is measured to the ink, so the
// body-width decision must use the ink width or a symbol tips up one size step
// (acquiring: 25.9 mm ink -> bcw 1, but 26.6 mm grown mesh -> bcw 1.25).
//
// The prepped SVG is all filled paths (stroke:none) in user units; getBBox is
// therefore exact, and OpenSCAD scales it by graphic_scale_factor. That factor
// mirrors bliss.scad: (2*half_span / band_units)/mm_per_unit.
function graphicInkWidthMm(text){
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return null;
  const root = getPrepHost().appendChild(document.importNode(doc.documentElement, true));
  try {
    let minX = Infinity, maxX = -Infinity;
    for (const el of root.querySelectorAll(DRAWABLE)) {
      const b = bboxInRootUnits(el, root);
      if (!b) continue;
      minX = Math.min(minX, b.minX); maxX = Math.max(maxX, b.maxX);
    }
    if (!isFinite(minX)) return null;
    const scale = (2 * EARTH_SKY_HALF_SPAN / BLISS_BAND_UNITS) / svgMmPerUnit;
    return (maxX - minX) * scale;
  } finally {
    root.remove();
  }
}

// Smallest body-width multiple (0.25 steps, min 1) whose body holds a graphic of
// the given ink width with a >= BLISS_MIN_BORDER_MM border on each side. The
// body's half-width is 18*bcw*rm (bliss.scad shape()), the graphic is centred,
// and both are inside the same resize scale rm — so 18*bcw*rm >= gWidth/2 + b,
// i.e. bcw >= (gWidth + 2b) / (36*rm). The border is absolute, hence divided by rm.
function conceptWidthFor(gWidthMm, rm){
  const need = (gWidthMm + 2 * BLISS_MIN_BORDER_MM) / (36 * (rm || 1));
  return Math.max(1, Math.ceil(need / 0.25) * 0.25);
}

// Preview render: the symbol body and the raised graphic are rendered
// separately so each can wear its own Customizer display colour.
async function runRender(){
  if (rendering) { pending = true; return; }
  rendering = true; pending = false;
  setStatus('Rendering…', 'busy');
  const t0 = performance.now();
  try {
    // Size the body to the graphic's ink BEFORE rendering, so both passes use the
    // right width in a single pass. The ink width comes from the SVG (not a mesh),
    // so it needs no graphic render to compute.
    if (svgText) {
      const gWidth = graphicInkWidthMm(svgText);
      const rm = (pv('resize_symbol_height_width') ?? 100) / 100;
      const bcw = gWidth ? conceptWidthFor(gWidth, rm) : 1;
      if (bcw !== conceptWidthOverride) {
        conceptWidthOverride = bcw;
        logLine(`Body width: ${bcw}× default (graphic ${gWidth ? gWidth.toFixed(1) : '?'} mm ink + ${BLISS_MIN_BORDER_MM} mm borders).`);
      }
    } else {
      conceptWidthOverride = 0;   // no graphic -> fall back to the SCAD default
    }
    await prepareTilePieceSvgs();   // Tiles: read + prep each referenced piece SVG (no-op for Symbols)
    // The graphic pass runs whenever there IS a graphic: the Symbols single SVG,
    // or any Tiles tile-piece SVG. Splitting the two render_parts is what lets the
    // base and the raised graphic wear different display colours (and export apart).
    const anyGraphic = !!svgText || TILE_PIECE_FILES.length > 0;
    const symBytes = await renderOnce(['-D', 'render_part="symbol"']);
    const grBytes  = anyGraphic ? await renderOnce(['-D', 'render_part="graphic"']) : null;
    showModel(symBytes, grBytes);
    // The finished render is its own confirmation, so the pill clears rather
    // than reporting a time (#statusmsg:empty collapses it). The timing still
    // goes to the console for anyone watching performance.
    logLine(`Rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s.`);
    setStatus('');
    document.getElementById('exportBtn').disabled = false;
    document.getElementById('exportStl2Btn').disabled = false;
    document.getElementById('exportPngBtn').disabled = false;
  } catch (e) {
    const detail = (e && (e.message || e.toString())) || 'unknown error';
    logLine('Render error: ' + detail);
    // The console isn't shown in the app, so put the actual failure in the pill.
    setStatus('Render failed: ' + detail, 'err');
  } finally {
    rendering = false;
    if (pending) scheduleRender();
  }
}

// Display colours (viewport only, like OpenSCAD's color()) from the Customizer.
function pv(name){ const p = PARAMS.find(x => x.name === name); return p ? p.value : undefined; }
function symColorName(){ return SYMBOL_COLORS[+pv('symbol_display_color')] || 'DimGray'; }
function grColorName(){  return GRAPHIC_COLORS[+pv('graphic_display_color')] || 'Snow'; }
function applyColors(){ symbolMat.color.set(symColorName()); graphicMat.color.set(grColorName()); }

function showModel(symBytes, grBytes){
  const loader = new STLLoader();
  const toAB = u8 => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  if (modelGroup) { scene.remove(modelGroup); modelGroup.traverse(o => o.geometry && o.geometry.dispose()); }
  modelGroup = new THREE.Group();
  applyColors();
  if (symBytes && symBytes.length) {
    const g = loader.parse(toAB(symBytes)); g.computeVertexNormals();
    modelGroup.add(new THREE.Mesh(g, symbolMat));
  }
  if (grBytes && grBytes.length) {
    const g = loader.parse(toAB(grBytes)); g.computeVertexNormals();
    modelGroup.add(new THREE.Mesh(g, graphicMat));
  }
  scene.add(modelGroup);
  const first = !hadModel; hadModel = true;
  fitCamera(modelGroup, !first);
}

// Test hook: per-mesh triangle count and mm extent of the current model, in
// render order (symbol pass, then graphic pass).
window.__modelInfo = () => (modelGroup ? modelGroup.children : []).map(m => {
  m.geometry.computeBoundingBox();
  const b = m.geometry.boundingBox;
  const r = v => +v.toFixed(2);
  return { tris: m.geometry.attributes.position.count / 3,
           size: [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map(r),
           // positions matter for registration, not just extents — and on BOTH
           // axes since tile pieces register horizontally too (Ken, 2026-08-11)
           xMin: r(b.min.x), xMax: r(b.max.x), xMid: r((b.min.x + b.max.x) / 2),
           yMin: r(b.min.y), yMax: r(b.max.y), yMid: r((b.min.y + b.max.y) / 2) };
});

// Test hook: count how many times a horizontal ray through the graphic (at its
// centre height, just under the top face) enters solid. A filled disc gives 1
// span; N concentric rings give up to N spans on each side of centre. Distinguishes
// "circle imported as a disc" from a real annulus without needing a screenshot.
window.__raySpans = (yFrac = 0.5) => {
  const g = modelGroup && modelGroup.children[modelGroup.children.length - 1];
  if (!g) return null;
  g.geometry.computeBoundingBox();
  const b = g.geometry.boundingBox;
  const y = b.min.y + (b.max.y - b.min.y) * yFrac;
  const z = b.max.z - 0.05;
  const ray = new THREE.Raycaster(
    new THREE.Vector3(b.min.x - 10, y, z), new THREE.Vector3(1, 0, 0), 0, 1e4);
  ray.firstHitOnly = false;
  const hits = ray.intersectObject(g, false).map(h => +h.point.x.toFixed(2));
  return { y: +y.toFixed(2), crossings: hits.length, xs: hits };
};

// Measure the arm (stroke) width: cast +X through the graphic at world y=yWorld,
// zBelowTop mm under the top face (so it hits the full-width body, not the
// chamfered top). Returns the widths of each solid span at that line.
window.__armProbe = (yWorld = 6, zBelowTop = 0.6) => {
  const g = modelGroup && modelGroup.children[modelGroup.children.length - 1];
  if (!g) return null;
  g.geometry.computeBoundingBox();
  const b = g.geometry.boundingBox;
  const z = b.max.z - zBelowTop;
  const ray = new THREE.Raycaster(
    new THREE.Vector3(b.min.x - 10, yWorld, z), new THREE.Vector3(1, 0, 0), 0, 1e4);
  ray.firstHitOnly = false;
  const xs = ray.intersectObject(g, false).map(h => h.point.x).sort((a, b) => a - b);
  const spans = [];
  for (let i = 0; i + 1 < xs.length; i += 2) spans.push(+(xs[i + 1] - xs[i]).toFixed(3));
  return { y: yWorld, z: +z.toFixed(2), crossings: xs.length, spans };
};

// -------------------------------------------------------------------- export
// Base name shared by the STL and PNG exports: the concept name if one is
// selected, else the graphic's name, else a generic name.
function exportBaseName(){
  return (currentPreset || svgName || pv('graphic_svg') || APP_CONFIG.exportFallback);
}

// Short two-note chime marking the end of an STL export, synthesised with
// WebAudio so the app stays a single file with no audio asset to ship. Created
// on demand (a browser won't let an AudioContext start before a user gesture)
// and reused; any failure is silent — the status pill is the real confirmation.
let audioCtx = null;
function ding(){
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime;
    [[880, 0], [1318.5, 0.12]].forEach(([freq, at]) => {
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      // Percussive envelope: instant attack, exponential decay (a linear ramp
      // to 0 clicks; exponentialRamp can't reach 0, hence the tiny floor).
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.45);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + at); osc.stop(t0 + at + 0.5);
    });
  } catch {}
}

// STL is written into the connected folder as "<preset name>.stl" (the keyguard
// model: outputs live beside the project files, not in Downloads). With no preset
// selected we fall back to the graphic's name, then a generic name.
document.getElementById('exportBtn').addEventListener('click', async () => {
  const btn = document.getElementById('exportBtn');
  // .active holds the button visually pressed for the whole export (which can
  // run for seconds), so it's obvious the click registered and is still working.
  btn.disabled = true; btn.classList.add('active');
  setStatus('Rendering STL for export…', 'busy');
  try {
    await prepareTilePieceSvgs();   // Tiles: refresh piece SVGs (no-op for Symbols)
    const bytes = await renderOnce(['-D', 'render_part="all"']);   // whole symbol, one solid
    if (!bytes || !bytes.length) throw new Error('export produced no STL');
    const fname = exportBaseName() + '.stl';
    if (folder && folder.dir){
      if (!(await ensureRW(folder.dir))){ setStatus('Write permission denied.', 'err'); return; }
      const fh = await folder.dir.getFileHandle(fname, { create: true });
      const w = await fh.createWritable(); await w.write(new Blob([bytes], { type: 'model/stl' })); await w.close();
      logLine(`Exported ${fname} (${bytes.length.toLocaleString()} bytes) to ${folder.dir.name}`);
      setStatus(`Exported ${fname} to the ${folder.dir.name} folder`, 'ok');
      ding();
    } else {
      // No folder connected (shouldn't happen once one is opened) — download instead.
      const url = URL.createObjectURL(new Blob([bytes], { type: 'model/stl' }));
      const a = document.createElement('a'); a.href = url; a.download = fname;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setStatus(`Downloaded ${fname}`, 'ok');
      ding();
    }
  } catch (e) {
    logLine('Export error: ' + (e.message || e));
    setStatus('Export failed — see console', 'err');
  } finally {
    btn.disabled = false; btn.classList.remove('active');
  }
});

// Two-colour STL export. Writes the *same two passes the preview renders* —
// render_part="symbol" and render_part="graphic" — as two files rather than the
// merged render_part="all" solid, so a multi-material printer (or a mid-print
// filament swap) can colour the body and the raised graphic separately.
//
// Both passes come out of OpenSCAD in one coordinate system, so a slicer lands
// them already aligned — no user positioning, and no container format needed.
// The import route matters, though (Ken, 2026-07-22): load the body first, then
// right-click it and Add Part > Load... the graphic. Importing both files at
// once instead drops each mesh onto the bed, which zeroes the graphic's Z and
// buries it inside the body.
//
// Naming is "<base> - body.stl" / "<base> - graphic.stl" off the same
// exportBaseName() the one-piece STL and the PNG use, so all the outputs for a
// concept sort together in the folder.
document.getElementById('exportStl2Btn').addEventListener('click', async () => {
  const btn = document.getElementById('exportStl2Btn');
  btn.disabled = true; btn.classList.add('active');
  setStatus('Rendering two-colour STLs for export…', 'busy');
  try {
    await prepareTilePieceSvgs();   // Tiles: refresh piece SVGs (no-op for Symbols)
    // Nothing to split without a graphic — the merged STL is already the whole
    // model, so say so rather than writing an identical pair of files. A graphic
    // is the Symbols single SVG or any Tiles tile-piece SVG.
    if (!svgText && TILE_PIECE_FILES.length === 0){
      setStatus('Load a graphic first — with no graphic there is only one part.', 'err');
      return;
    }
    const base = exportBaseName();
    const parts = [
      { suffix: ' - body.stl',    args: ['-D', 'render_part="symbol"'] },
      { suffix: ' - graphic.stl', args: ['-D', 'render_part="graphic"'] },
    ];
    // Render both before writing anything: a failure on the second pass then
    // leaves no half-written pair in the folder.
    for (const p of parts){
      p.bytes = await renderOnce(p.args);
      if (!p.bytes || !p.bytes.length) throw new Error(`export produced no STL for ${p.suffix.trim()}`);
    }
    if (folder && folder.dir){
      if (!(await ensureRW(folder.dir))){ setStatus('Write permission denied.', 'err'); return; }
      for (const p of parts){
        const fname = base + p.suffix;
        const fh = await folder.dir.getFileHandle(fname, { create: true });
        const w = await fh.createWritable(); await w.write(new Blob([p.bytes], { type: 'model/stl' })); await w.close();
        logLine(`Exported ${fname} (${p.bytes.length.toLocaleString()} bytes) to ${folder.dir.name}`);
      }
      setStatus(`Exported 2 STLs (body + graphic) to the ${folder.dir.name} folder`, 'ok');
      ding();
    } else {
      // No folder connected (shouldn't happen once one is opened) — download both.
      for (const p of parts){
        const url = URL.createObjectURL(new Blob([p.bytes], { type: 'model/stl' }));
        const a = document.createElement('a'); a.href = url; a.download = base + p.suffix;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
      setStatus('Downloaded 2 STLs (body + graphic)', 'ok');
      ding();
    }
  } catch (e) {
    logLine('Two-colour export error: ' + (e.message || e));
    setStatus('Two-colour export failed — see console', 'err');
  } finally {
    btn.disabled = false; btn.classList.remove('active');
  }
});

// PNG of the viewport exactly as shown (display colours and all), written into
// the connected folder beside the STL — same naming, same place. Silent: no
// chime, since the capture is instant and the pill already confirms it.
document.getElementById('exportPngBtn').addEventListener('click', async () => {
  const btn = document.getElementById('exportPngBtn');
  btn.disabled = true; btn.classList.add('active');
  try {
    // Render synchronously first so the backbuffer is valid for toBlob (the
    // same reason __captureViewportPNG does it).
    syncSize(); controls.update(); renderer.render(scene, camera);
    const blob = await new Promise(res => renderer.domElement.toBlob(res, 'image/png'));
    if (!blob) throw new Error('canvas.toBlob returned null');
    const fname = exportBaseName() + '.png';
    if (folder && folder.dir){
      if (!(await ensureRW(folder.dir))){ setStatus('Write permission denied.', 'err'); return; }
      const fh = await folder.dir.getFileHandle(fname, { create: true });
      const w = await fh.createWritable(); await w.write(blob); await w.close();
      logLine(`Saved ${fname} (${blob.size.toLocaleString()} bytes) to ${folder.dir.name}`);
      setStatus(`Saved ${fname} to the ${folder.dir.name} folder`, 'ok');
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = fname;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setStatus(`Downloaded ${fname}`, 'ok');
    }
  } catch (e) {
    logLine('PNG export error: ' + (e.message || e));
    setStatus('PNG export failed — see console', 'err');
  } finally {
    btn.disabled = false; btn.classList.remove('active');
  }
});

// ------------------------------------------------------------------ settings
// One tab today (About); the panel table is the extension point — add a .cat in
// the markup and a matching key here.
const SETTINGS_PANELS = {
  about: () => `
    <div class="setting">
      <label>${APP_CONFIG.appName} (web)</label>
      <div style="margin-bottom:10px;">Release ${APP_RELEASE}</div>
      <label>${APP_CONFIG.appName} (scad)</label>
      <div style="margin-bottom:10px;">${
        scadVersionLabel()
      }</div>
      <label>License</label>
      <div style="margin-bottom:10px;">
        CC0 1.0 Universal — dedicated to the public domain. You are free to
        use, modify, and share this tool for any purpose, with no restrictions
        and no attribution required.
      </div>
      <label>Created by</label>
      <div>
        Volksswitch —
        <a href="https://www.volksswitch.org" target="_blank" rel="noopener">www.volksswitch.org</a>
      </div>
    </div>
  `,

  prefs: () => `
    <div class="setting">
      <label>Notices</label>
      <div style="margin-bottom:14px;">
        <label style="font-weight:normal; display:flex; gap:7px; align-items:flex-start; cursor:pointer;">
          <input type="checkbox" id="prefWhatsNew" style="margin-top:2px;" ${getShowWhatsNew() ? 'checked' : ''}>
          <span>Show &ldquo;What&rsquo;s new&rdquo; after the app updates itself</span>
        </label>
      </div>

      <label>Your settings</label>
      <div style="margin-bottom:8px;">
        Save a copy of your settings, or put a saved copy back. The copy is kept
        in your folder as <b>bliss-settings-backup.json</b>, beside your concepts and
        graphics, and saving again replaces it. Your settings themselves are held by
        your browser against this app&rsquo;s web address, so the saved copy is what lets
        you move them to another computer &mdash; or get them back if this browser is
        ever cleared.
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
        <button id="prefSaveBtn" type="button" class="primary">Save my settings&hellip;</button>
        <button id="prefLoadBtn" type="button">Load saved settings&hellip;</button>
        <input id="prefLoadInput" type="file" accept="application/json,.json" hidden>
      </div>
      <p id="prefMsg" style="margin:0; min-height:1.2em; color:var(--muted);"></p>

      <label style="margin-top:14px;">If the app seems stuck on an old version</label>
      <div style="margin-bottom:8px;">
        This clears the copy your browser is holding and starts the app fresh.
        Use this rather than a hard refresh &mdash; a hard refresh can lose settings.
      </div>
      <button id="prefReloadBtn" type="button">Reload the app cleanly</button>
    </div>
  `,
};

// The .scad in play is the one read from the connected folder, so before a
// folder is open there is no version to report.
function scadVersionLabel(){
  const v = parseScadVersion(SCAD_TEXT);
  return v == null ? 'No folder connected' : 'Version ' + v;
}

const settingsOverlay = document.getElementById('settings-overlay');
const settingsPanelEl = document.getElementById('settings-panel');
function renderSettingsPanel(cat){
  settingsPanelEl.innerHTML = (SETTINGS_PANELS[cat] || SETTINGS_PANELS.about)();
  wireSettingsPanel(cat);
}

// The panel's markup is replaced on every render, so its controls must be wired
// each time rather than once at startup.
function wireSettingsPanel(cat){
  if (cat !== 'prefs') return;
  const msgEl  = document.getElementById('prefMsg');
  const setMsg = (t, bad) => { if (msgEl){ msgEl.textContent = t; msgEl.style.color = bad ? '#b3261e' : 'var(--muted)'; } };

  document.getElementById('prefWhatsNew').addEventListener('change', e => {
    setShowWhatsNew(e.target.checked);
    setMsg(e.target.checked
      ? 'The notice will appear after the next update.'
      : 'The notice is turned off.');
  });

  document.getElementById('prefSaveBtn').addEventListener('click', async () => {
    try {
      const r = await saveSettingsBackup();
      setMsg(r.where === 'folder'
        ? `Saved ${r.n} item${r.n === 1 ? '' : 's'} as ${SETTINGS_BACKUP_FILE} in your ${r.dirName} folder.`
        : `Saved ${r.n} item${r.n === 1 ? '' : 's'} as ${SETTINGS_BACKUP_FILE} in your downloads. `
          + `Connect your folder and save again to keep it beside your work.`);
    } catch (e){ setMsg('Could not save your settings: ' + e.message, true); }
  });

  document.getElementById('prefReloadBtn').addEventListener('click', () => {
    setMsg('Reloading…');
    cleanReload().catch(e => setMsg('Could not reload: ' + e.message, true));
  });

  const input = document.getElementById('prefLoadInput');

  // One place that applies a chosen file, so the folder path and the dialog path
  // cannot drift apart in what they do or what they say.
  async function applyBackupFile(f, fromFolder){
    const r = await restoreSettingsBackup(f);
    renderSettingsPanel('prefs');           // reflect restored values in the controls
    const el = document.getElementById('prefMsg');
    if (el){
      el.textContent = `Restored ${r.count} item${r.count === 1 ? '' : 's'}`
        + (fromFolder ? ` from ${SETTINGS_BACKUP_FILE} in your folder` : '')
        + (r.savedAt ? `, saved on ${r.savedAt.slice(0,10)}.` : '.')
        + ' Reload the app if anything still looks unchanged.';
    }
  }

  // Look in the folder first; only ask if it is not there. See readBackupFromFolder.
  document.getElementById('prefLoadBtn').addEventListener('click', async () => {
    try {
      const here = await readBackupFromFolder();
      if (here){ await applyBackupFile(here, true); return; }
      // Name the file BEFORE opening the dialog — the dialog itself cannot say it.
      setMsg(`No ${SETTINGS_BACKUP_FILE} in your folder — find your saved copy.`);
      const picked = await pickBackupFile();
      if (picked){ await applyBackupFile(picked, false); return; }
      input.click();                        // no file-picker API — old-style dialog
    } catch (e){
      if (e && e.name === 'AbortError'){ setMsg(''); return; }   // they cancelled
      setMsg(e.message, true);
    }
  });

  input.addEventListener('change', async () => {
    const f = input.files && input.files[0];
    input.value = '';                       // so the same file can be chosen again
    if (!f) return;
    try { await applyBackupFile(f, false); }
    catch (e){ setMsg(e.message, true); }
  });
}
function openSettings(){
  const cats = [...document.querySelectorAll('#settings-cats .cat')];
  const active = cats.find(c => c.classList.contains('active')) || cats[0];
  cats.forEach(c => c.classList.toggle('active', c === active));
  renderSettingsPanel(active ? active.dataset.cat : 'about');
  settingsOverlay.classList.add('open');
}
function closeSettings(){ settingsOverlay.classList.remove('open'); }
document.getElementById('settings-btn').addEventListener('click', openSettings);
document.getElementById('settings-close-btn').addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', e => { if (e.target === settingsOverlay) closeSettings(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && settingsOverlay.classList.contains('open')) closeSettings();
});
document.querySelectorAll('#settings-cats .cat').forEach(c => c.addEventListener('click', () => {
  document.querySelectorAll('#settings-cats .cat').forEach(x => x.classList.remove('active'));
  c.classList.add('active');
  renderSettingsPanel(c.dataset.cat);
}));

// Drag the title bar to move the panel (the keyguard designer's behaviour). The
// modal is centred with a transform, so the first drag converts that to pixel
// coordinates before tracking the pointer.
(function(){
  const modal = document.getElementById('settings-modal');
  const handle = modal.querySelector('h3');
  let dragging = false, ox = 0, oy = 0;
  handle.addEventListener('mousedown', e => {
    if (modal.style.transform !== 'none'){
      const r = modal.getBoundingClientRect();
      modal.style.transform = 'none';
      modal.style.left = r.left + 'px';
      modal.style.top = r.top + 'px';
    }
    dragging = true; ox = e.clientX - modal.offsetLeft; oy = e.clientY - modal.offsetTop;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    modal.style.left = Math.max(0, Math.min(e.clientX - ox, innerWidth - modal.offsetWidth)) + 'px';
    modal.style.top  = Math.max(0, Math.min(e.clientY - oy, innerHeight - modal.offsetHeight)) + 'px';
  });
  document.addEventListener('mouseup', () => { dragging = false; });
}());

// ============================================================ local folder (FSA)
// The app reads the .scad, the .json and the SVGs from a local folder the user
// grants read/write access to, and writes presets + exported STLs back into it.
// The folder handle is remembered in IndexedDB so returning users skip the
// picker — they still click once to re-grant permission (the API needs a user
// gesture). Chrome/Edge only. No "project" concept: just one folder.
let folder = null;   // { dir, scadHandle, scadName, jsonHandle, jsonName, svgDir }

const IDB_DB = 'bts-db', IDB_STORE = 'handles', IDB_KEY = 'folder';
function idbOpen(){
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function idbGet(){
  try { const db = await idbOpen();
    return await new Promise((res, rej) => {
      const r = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
      r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error);
    });
  } catch { return null; }
}
async function idbPut(h){
  try { const db = await idbOpen();
    await new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(h, IDB_KEY);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch (e) { console.warn('Could not persist folder handle:', e); }
}
async function idbClear(){
  try { const db = await idbOpen();
    await new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(IDB_KEY);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch {}
}
async function ensureRW(handle){
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
}

// DOM confirm (native confirm() consumes the user gesture the permission prompt
// later needs). Resolves true/false.
function confirmDiscard(message){
  return new Promise(resolve => {
    const ov = document.getElementById('confirmOverlay');
    document.getElementById('confirmMsg').textContent = message;
    const ok = document.getElementById('confirmOk'), cancel = document.getElementById('confirmCancel');
    function done(v){ ov.hidden = true; ok.removeEventListener('click', onOk); cancel.removeEventListener('click', onCancel); document.removeEventListener('keydown', onKey); resolve(v); }
    const onOk = () => done(true), onCancel = () => done(false), onKey = e => { if (e.key === 'Escape') done(false); };
    ok.addEventListener('click', onOk); cancel.addEventListener('click', onCancel); document.addEventListener('keydown', onKey);
    ov.hidden = false; cancel.focus();
  });
}

function showGate(msg){
  const g = document.getElementById('launchGate'); g.hidden = false;
  const e = document.getElementById('gateErr');
  if (msg){ e.textContent = msg; e.hidden = false; } else { e.hidden = true; }
}

// Read the folder's .scad, .json and SVG files subfolder, then (re)build the UI.
//
// The presets file is bound BY NAME: <scad-basename>.json, the same file the
// desktop Customizer uses. Any other .json in the folder — including "… - Copy"
// backups the user keeps deliberately — is ignored, never read and never
// written. The old code took the first .json the directory happened to enumerate
// (Ken, 2026-07-23): a backup copy that sorted ahead of "Bliss Tactile
// Symbols.json" silently became the read+write target for a whole session, so
// saves landed in the copy and the real file never changed. Reads and writes hit
// the same wrong handle, so nothing inside the session looked amiss — the loss
// only showed on the next open. Matching by name makes copies harmless.
async function loadFromFolder(dir){
  let scadHandle = null, scadName = null;
  // This app owns ONE .scad, matched by name — a folder may hold both apps' .scad,
  // so "first .scad found" would be ambiguous. The presets .json still derives
  // from this basename below.
  const wantScadLc = (APP_CONFIG.scadBaseName + '.scad').toLowerCase();
  const dirByLc = new Map();        // lowercased subfolder name -> handle
  const jsonByLcName = new Map();   // lowercased filename -> { name, handle }
  for await (const [name, h] of dir.entries()){
    if (h.kind === 'directory'){ dirByLc.set(name.toLowerCase(), h); continue; }
    if (name.toLowerCase() === wantScadLc && !scadHandle){ scadHandle = h; scadName = name; }
    if (/\.json$/i.test(name)) jsonByLcName.set(name.toLowerCase(), { name, handle: h });
  }
  if (!scadHandle) throw new Error(`That folder has no ${APP_CONFIG.scadBaseName}.scad file.`);

  // SVG folders. svgDir is the app's OWN folder (svgOwnDir) — where Create-Graphic
  // saves. svgPickerSources is the folders the Graphic File picker reads, from
  // APP_CONFIG.svgPickerDirs (default just [svgOwnDir]); the first is the default
  // when the picker opens, a selector appears when more than one is present, and
  // bare graphic_svg references resolve across them in order. svgCreateSources is
  // every configured Create-Graphic source folder present, own folder first.
  let svgDir = dirByLc.get(APP_CONFIG.svgOwnDir.toLowerCase()) || null;
  const svgPickerSources = (APP_CONFIG.svgPickerDirs || [APP_CONFIG.svgOwnDir])
    .map(n => ({ name: n, handle: dirByLc.get(n.toLowerCase()) || null }))
    .filter(e => e.handle);
  const svgCreateSources = APP_CONFIG.svgCreateSources
    .map(n => ({ name: n, handle: dirByLc.get(n.toLowerCase()) || null }))
    .filter(e => e.handle)
    .sort((a, b) => (a.name === APP_CONFIG.svgOwnDir ? -1 : b.name === APP_CONFIG.svgOwnDir ? 1 : 0));
  // Split-Graphic: whole symbols are READ from svgSplitSourceDirs (must exist to
  // be offered) and the pieces are SAVED into one of svgSplitDestDirs — those are
  // offered whether or not they exist yet, since a missing one is created on save.
  const svgSplitSources = (APP_CONFIG.svgSplitSourceDirs || [])
    .map(n => ({ name: n, handle: dirByLc.get(n.toLowerCase()) || null }))
    .filter(e => e.handle);
  const svgSplitDests = (APP_CONFIG.svgSplitDestDirs || [])
    .map(n => ({ name: n, handle: dirByLc.get(n.toLowerCase()) || null }));

  // The one .json the app owns: same basename as the .scad. Matched case-
  // insensitively (Windows is), and if it exists we keep its ON-DISK spelling so
  // a write reuses that exact file rather than creating a second casing of it.
  const wantJson = scadName.replace(/\.scad$/i, '') + '.json';
  const jsonEntry = jsonByLcName.get(wantJson.toLowerCase()) || null;
  let jsonHandle = jsonEntry ? jsonEntry.handle : null;
  let jsonName   = jsonEntry ? jsonEntry.name : wantJson;   // the name a first save will create
  const ignoredJson = [...jsonByLcName.values()].filter(e => e !== jsonEntry).map(e => e.name);
  const scadText = await (await scadHandle.getFile()).text();
  let presets = null;
  if (jsonHandle){
    try { const parsed = JSON.parse(await (await jsonHandle.getFile()).text());
      presets = parsed.parameterSets || null;
      if (parsed.fileFormatVersion != null) presetFileFormatVersion = parsed.fileFormatVersion;
    } catch (e){ logLine('JSON parse failed: ' + e.message); presets = null; }
  }
  folder = { dir, scadHandle, scadName, jsonHandle, jsonName, svgDir,
             svgPickerSources, svgCreateSources, svgSplitSources, svgSplitDests };
  SCAD_TEXT = scadText;
  PRESETS = presets;
  SVG_LIST = null;                 // drop the previous folder's listing
  currentPreset = ''; presetBaseline = null;
  buildForm(parseCustomizer(SCAD_TEXT));
  SCAD_DEFAULTS = snapshotParams();    // the built-in "design default values" entry
  presetBaseline = snapshotParams();   // baseline = the .scad defaults, so later edits read as dirty
  updateDirty();
  logLine(`Connected folder: ${dir.name}`);
  logVersionBanner();
  const sv = parseScadVersion(SCAD_TEXT);
  logLine(`${capFirst(DESIGNER)} file "${scadName}" — version ${sv != null ? sv : 'unknown'}`);
  logLine(jsonHandle
    ? `Concepts file: "${jsonName}" (${Object.keys(presets || {}).length} concept(s)).`
    : `No "${jsonName}" in this folder yet — it will be created when you first save a concept.`);
  if (ignoredJson.length){
    logLine(`Ignoring ${ignoredJson.length} other .json file(s) — only "${jsonName}" is read or written: ${ignoredJson.join(', ')}`);
  }
  if (!svgDir) logLine(`Note: no "${APP_CONFIG.svgOwnDir}" subfolder found — the graphic picker will be empty.`);
  document.getElementById('launchGate').hidden = true;
  document.getElementById('createGraphicBtn').disabled = false;   // compose needs a connected folder
  if (splitBtn && SPLIT_ENABLED){
    splitBtn.disabled = !svgSplitSources.length;
    if (!svgSplitSources.length)
      logLine(`Note: no "${APP_CONFIG.svgSplitSourceDirs.join('" or "')}" subfolder found — splitting a graphic is unavailable.`);
  }
  setStatus('Ready — rendering…', 'busy');
  runRender();
  // Folder just connected — a safe moment (no unsaved edits) to pick up updates.
  // Check the app build first; only offer a .scad update if the app itself isn't
  // about to force-reload (which would wipe the modal anyway).
  checkForAppUpdate(swRegistration).catch(() => {}).finally(() => {
    if (!appReloadArmed) checkForScadUpdate().catch(() => {});
  });
}

// User-driven: reuse the remembered folder if we can, else show the picker.
// `forceNew` skips the remembered handle and always shows the OS picker.
async function connectFolder(forceNew){
  if (!window.showDirectoryPicker){ showGate('This browser has no File System Access API — use Chrome or Edge.'); return; }
  let dir = null;
  const remembered = forceNew === true ? null : await idbGet();
  if (remembered){
    try { if (await ensureRW(remembered)) dir = remembered; } catch { /* fall through to picker */ }
  }
  if (!dir){
    try { dir = await window.showDirectoryPicker({ id: 'bts-folder', mode: 'readwrite' }); }
    catch (e){ if (e.name === 'AbortError') return; showGate(e.message); return; }
    if (!(await ensureRW(dir))){ showGate('Read/write permission is required to save presets and STLs.'); return; }
  }
  try {
    await loadFromFolder(dir);
    await idbPut(dir);
  } catch (e){
    logLine('Open folder failed: ' + (e.message || e));
    showGate(e.message || String(e));
    if (dir === remembered){                    // don't get stuck on a bad remembered handle
      await idbClear();
      document.getElementById('gateMsg').hidden = false;
      document.getElementById('gateOpenBtn').textContent = 'Open folder…';
      document.getElementById('gateNewBtn').hidden = true;
    }
  }
}

document.getElementById('gateOpenBtn').addEventListener('click', () => connectFolder(false));
document.getElementById('gateNewBtn').addEventListener('click', () => connectFolder(true));
// Live dirty tracking: any edit in the Customizer re-evaluates against the
// selected preset's baseline. Bound to the container (survives form rebuilds).
document.getElementById('customizer').addEventListener('input', updateDirty);
document.getElementById('customizer').addEventListener('change', updateDirty);

// -------------------------------------------------------------------- startup
logVersionBanner();

// "What's new" waits for the app-update check to have its say. A load that is
// about to self-update is the WRONG load to announce anything on: it is still
// running the OLD build, and the reload a moment later destroys the modal — but
// maybeShowWhatsNew has already advanced the last-seen record past the release
// it just tried to announce, so the notes are gone for good and the user sees
// only the start page appearing twice. (Ken hit exactly that going 19 -> 20;
// release 19's note was consumed by the pre-reload build. 2026-08-14.) Deferring
// costs one manifest fetch of delay and puts the notice on the build that
// actually has the new behavior in it.
// Runs on every load, service worker or not — the dev server has none, and the
// lastSeenRelease gate makes it a no-op unless the release moved.
function whatsNewAfterUpdateCheck(){
  if (appReloadArmed || appReloaded) return;   // a reload is coming; the new build announces it
  maybeShowWhatsNew();
}

// Service worker: registered only off localhost. It is cache-first (see sw.js)
// with CACHE_NAME bumped only at release, so on the dev server a normal reload
// would keep serving the cached build instead of the latest edit — skip and
// unregister it there. In production it powers the offline shell + self-update.
if ('serviceWorker' in navigator){
  // Attempt the move BEFORE registering a worker. If it fires, this page is
  // replaced and nothing below matters; if the new address is not ready, we
  // carry on exactly as before and retry on the next load.
  maybeMigrateOrigin().catch(() => {});

  const isLocalDev = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname);
  if (isLocalDev){
    navigator.serviceWorker.getRegistrations()
      .then(rs => rs.forEach(r => r.unregister())).catch(() => {});
    if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k))).catch(() => {});
    whatsNewAfterUpdateCheck();   // no self-update on the dev server — nothing to wait for
  } else {
    // Reload exactly once when a newer worker takes control — but ONLY when a
    // load-time checkForAppUpdate armed it, so the browser's own background SW
    // updates can never refresh the page out from under a user mid-design.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (appReloadArmed && !appReloaded){ appReloaded = true; location.reload(); }
    });
    navigator.serviceWorker.register('./sw.js').then(reg => {
      swRegistration = reg;
      // app-load staleness check; the notice follows its verdict either way
      checkForAppUpdate(reg).catch(() => {}).finally(whatsNewAfterUpdateCheck);
    }).catch(whatsNewAfterUpdateCheck);
  }
} else {
  whatsNewAfterUpdateCheck();     // no service worker at all — nothing can reload us
}

(async function init(){
  wireBackupNotice();
  showBackupNotice();          // no-op unless we are on the retiring address
  wireRestoreOffer();
  showRestoreOffer();          // no-op unless this address holds nothing
  const gate = document.getElementById('launchGate');
  if (!window.showDirectoryPicker){
    showGate('This browser has no File System Access API — use Chrome or Edge.');
    document.getElementById('gateOpenBtn').disabled = true;
    return;
  }
  // If a folder is remembered, tailor the gate so one click reconnects it.
  const remembered = await idbGet();
  if (remembered){
    document.getElementById('gateMsg').hidden = true;
    const btn = document.getElementById('gateOpenBtn');
    btn.textContent = 'Reconnect to';
    const l2 = document.createElement('span');   // folder name on its own line
    l2.className = 'btn-l2';
    l2.textContent = remembered.name;
    btn.appendChild(l2);
    document.getElementById('gateNewBtn').hidden = false;
  }
  gate.hidden = false;
})();
