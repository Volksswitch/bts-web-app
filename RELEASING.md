# Releasing the Bliss web apps

This repo hosts **two** web apps built from one shared engine — **Bliss Tactile
Symbols** (`symbols/`) and **Bliss Tiles and Puzzles** (`tiles/`) — plus the shared
engine in `shared/` (see `CLAUDE.md`, "Two apps from one engine"). Each app releases
on its **own** version stream; the process is the **same shape** as the Keyguard
Designer web app's (*work locally, log each user-visible change to that app's
`## Unreleased`, and say the trigger phrase to cut a release*).

## Environment model

- **The PC is the development environment.** All day-to-day work is committed to the
  local `main` branch on the PC. **These commits are NOT pushed.** OneDrive backs them
  up and syncs the whole project folder (including `.git`) across machines.
- **GitHub is the release environment.** The repository is
  <https://github.com/Volksswitch/bliss-tactile-symbols-web> ⚠️ *(confirm the exact
  repo name — it is also hardcoded as `appRepo` in each shell's `APP_CONFIG`; they must
  match).* **GitHub Pages serves the `main` branch.**

  > **Commit to local `main` = save your work.  Push `main` = release.**

  Everything committed piles up locally, invisible to users, until you push.

There is one branch: `main`. There is no separate release branch.

## One repo, two apps — what "independent release" means

Both apps live in one repo served by one GitHub Pages site, so **a push redeploys the
whole site** (both apps' files). Independence is enforced **client-side**, not by the
deploy:

- Each app has its **own** service worker (`symbols/sw.js` scope `/symbols/`,
  `tiles/sw.js` scope `/tiles/`), its own `CACHE_NAME` (`bts-symbols-vN` /
  `bts-tiles-vN`), and its own `latest_app_version.json` + `appRelease`.
- A client only picks up a new build of an app when **that app's** `CACHE_NAME` moves,
  and only shows the "What's new" notice when **that app's** `latest_app_version.json`
  advances past the running `appRelease`.

So you can release one app without disturbing the other **as long as you touch only the
app being released.** Two consequences:

- **App-specific change** (a shell's own files: `<app>/index.html`, `<app>/sw.js`,
  `<app>/manifest.webmanifest`, `<app>/CHANGELOG.md`) → release just that app.
- **Shared change** (`shared/bts-core.js`, `shared/bts.css`, `shared/app-body.html`, or
  a vendored dep) → it affects **both** apps. To reach already-cached users you must bump
  **both** apps' `CACHE_NAME` (so each re-caches the shared file); release-notify whichever
  apps' behavior actually changed. Treat a shared-engine change as a release of both apps.

## Between releases (the dev cycle)

- **Claude commits; Ken does not run git.** No pushing between releases.
- **Changelog-as-you-go (mandatory), per app.** Each app has its own `<app>/CHANGELOG.md`.
  The moment a change lands that a **user of that app** could see or do differently, add or
  edit the matching plain-English bullet under that app's topmost **`## Unreleased (next
  release)`** heading, **in the same commit as the code**, in user language matching the
  existing `## Release N` bullets. A shared-engine change that both apps' users see goes in
  **both** changelogs. Exclude internal-only work (tests, tooling, refactors); when in doubt,
  ask Ken. **After any `CHANGELOG.md` edit, regenerate the bundled notes**
  (`node scripts/apply-release-notes.mjs` — does both apps) so the in-app "What's new" notice
  stays in lockstep. **Ken's own changelog edits are authoritative** — preserve his wording.

## Version numbers (per app)

Three things carry each app's version:

- **`appRelease`** (integer, in `<app>/index.html`'s `APP_CONFIG`) — the number shown in
  Settings → About and the console banner.
- **`CACHE_NAME`** (`bts-<app>-vN`, in `<app>/sw.js`) — the service-worker cache key. A
  client only picks up a new build of that app when this changes.
- **`<app>/latest_app_version.json`** — the manifest that app's self-updater compares
  against; it must equal that app's *deployed* `appRelease`.

**Pre-bump (so you always know which build you're testing).** At the *end* of each app's
release, its dev copy is immediately pre-incremented: `appRelease` → (last public + 1). Its
Settings/console number therefore always reads higher than the last public release. The
pre-bump lives **locally only (unpushed)**. **`CACHE_NAME` and `latest_app_version.json` are
NOT pre-bumped** — they move only during that app's release ritual. All numbers only ever
**increase.**

⚠️ **"Locally only" is aspirational for the app you are NOT releasing.** There is one branch and
one push, so releasing app A also deploys app B's pre-bumped `appRelease` — B's users end up
running a number one ahead of B's manifest. That is harmless for updating (B's manifest hasn't
moved, so no update is offered), but it used to be *silently destructive* for B's next "What's
new": `maybeShowWhatsNew` advanced the last-seen record to that empty pre-bump number, so when
that release really shipped its notes were already marked read. Fixed 2026-08-11 — the record now
only advances when there was something to show. Don't reintroduce an unconditional
`setLastSeenRelease` in that path.

## Releasing — trigger phrases

Four release streams (two apps + two designer `.scad`s), **`bts` = Bliss Tactile Symbols,
`btp` = Bliss Tiles and Puzzles** (Ken, 2026-07-24):

| Phrase | Releases | Goes to |
|---|---|---|
| **"bump bts web app"** | the **Bliss Tactile Symbols** web app (`symbols/`) | `origin` → **bts.volksswitch.org** |
| **"bump btp web app"** | the **Bliss Tiles and Puzzles** web app (`tiles/`) | `origin` → **bts.volksswitch.org** |
| **"bump OLD bts web app"** | the same app on the **retiring** address | `legacy` → **volksswitch.github.io/bliss-tactile-symbols-web/** |
| **"bump OLD btp web app"** | the same app on the **retiring** address | `legacy` → same |
| **"bump bts"** | the **Bliss Tactile Symbols** designer `.scad` (separate repo) | scad repo |
| **"bump btp"** | the **Bliss Tiles and Puzzles** designer `.scad` (separate repo) | scad repo |

⚠️ **The word "old" is the whole instruction** (Ken, 2026-08-16). Ken inserts it when he
means the retiring address: *"bts web app means new; old bts web app means old."* Note the
trap — **"bump old bts web app" CONTAINS "bump bts web app"**, so skimming for the familiar
phrase inside the longer one deploys to the wrong address. Deploying new-app content to the
retiring address would put the black icons there and destroy the visual distinction the whole
migration depends on; deploying the other way round is worse. **Read the whole phrase, and
check which remote you are pushing to.**

⚠️ Within each pair the short phrase is also a **prefix** of the long one (`bump bts` ⊂ `bump
bts web app`; `bump btp` ⊂ `bump btp web app`) — read the whole phrase before acting.

**Two remotes, one working copy.** `origin` is the new repo (`Volksswitch/bts-web-app`,
serving `bts.volksswitch.org`); `legacy` is the retiring one
(`Volksswitch/bliss-tactile-symbols-web`). They share history to the "Release … 21 and … 12"
commit and have diverged since. **Never push `main` to `legacy`** — the old app takes only
`shared/bts-core.js`, `shared/app-body.html` and `shared/bts.css`, on its own branch, keeping
its green icons, its teal title bar, its old icon filenames and its own release line.

Ken says the phrase **only after he has verified that app's `CHANGELOG.md`.** That single
command authorizes the ritual below **through the push** for that app.

The ritual (let `<app>` = `symbols` or `tiles`):

1. **Bump `CACHE_NAME`** in `<app>/sw.js` (`bts-<app>-vN` → `v(N+1)`). If a shared file
   changed, bump the **other** app's `CACHE_NAME` too.
2. **Verify `appRelease`** in `<app>/index.html` already reads the release number (it was
   pre-bumped last release). *(First Tiles release: `appRelease` is 1, no pre-bump to verify.)*
3. **Finalize that app's changelog.** Rename its topmost **`## Unreleased (next release)`** to
   **`## Release <appRelease>`**, and add a fresh empty `## Unreleased (next release)` above it.
4. **Regenerate bundled notes:** `node scripts/apply-release-notes.mjs <app>` (or with no arg
   for both, e.g. after a shared change).
5. **Update the manifest:** `node scripts/publish-app-version.mjs <app>` — writes the deployed
   `appRelease` into `<app>/latest_app_version.json`. Confirm the number matches.
   - ℹ️ Since 2026-08-15 the app fetches this manifest from **its own origin** (the same Pages
     deploy that served the app), not from `raw.githubusercontent.com`. So the app and its
     manifest now ship **atomically in one push** and cannot disagree. That is why steps 6–7
     are a single commit and a single push, and why the "push the app, wait for it to be
     served, *then* push the manifest" split recommended for the keyguard rehearsal is **not**
     needed here. Previously the two came from different CDNs that updated in an unpredictable
     order, which could tell a client to fetch a release that was not being served yet.
6. **Commit** the release (`<app>/sw.js`, `<app>/index.html`, `<app>/CHANGELOG.md`,
   `<app>/latest_app_version.json`, plus any `shared/*` and the other app's `sw.js` if a shared
   file changed) as one commit.
7. **Push `origin main`.** GitHub Pages redeploys within ~1 minute. Users of that app get the
   new build on their next reload (occasionally the one after, as the SW swaps in).
8. **Start the next cycle — pre-bump.** Increment that app's `appRelease` to (release + 1),
   commit locally, and **do not push.**

## Invariants — do not break these

- **Never push to `main` except as step 7 of a release.** Any push deploys the site.
- **Pre-bumped `appRelease` and the `CACHE_NAME`/manifest bumps stay local (unpushed) until
  release.** On `main`, each app's shell `appRelease`, its `CACHE_NAME`, and its
  `latest_app_version.json` all agree on that app's last **public** release.
- **`CACHE_NAME`, `appRelease`, and each manifest only ever increase.**
- **Changelogs are authored as-you-go**, per app, in user language; nothing is authored at
  release except the `## Unreleased` → `## Release <N>` rename.
- **A shared-engine change bumps both apps' `CACHE_NAME`** — otherwise cached users of the app
  you didn't bump keep serving the stale shared file.

## The designer `.scad`s are released from a SEPARATE repo

Both apps' designer `.scad`s update **independently** of the web apps. Their canonical copies +
manifests live in [`Volksswitch/bliss-tactile-symbols`](https://github.com/Volksswitch/bliss-tactile-symbols)
(`latest_scad_version.json` for Symbols, `latest_tiles_version.json` for Tiles), with their own
release process (see that repo's `RELEASING.md`). Publishing a `.scad` is a push to the **scad**
repo and does **not** redeploy the web apps; releasing a web app does **not** touch the `.scad`s.
The link is each shell's `scadRepo` + `scadManifestFile` (and the matching `scad_url` in the scad
manifest) — keep them pointing at each other.

## What's different from keyguard

- **User files live in the connected folder, not the repo.** Both apps read the user's `.scad`s,
  `.json`s, and SVG folders from one shared File System Access folder ("Bliss Tactile Symbols");
  those are **not** served from this origin and **not** cached by any `sw.js`. Only each app's
  shell + the shared engine + vendored `openscad-wasm`/`three` are cached and self-updated.
- **Localhost skips the service worker.** On the dev server the SW is unregistered and its caches
  cleared, so a plain reload serves your latest edit. Production registers it per app.

## Rolling back a bad release

Revert the release commit on `main`, bump the affected app's `CACHE_NAME` **up** again (e.g. v2 →
v3, never back to v1), and push:

```
git revert -m 1 <release-commit-sha>   # drop -m 1 if it wasn't a merge
# hand-edit <app>/sw.js: bump CACHE_NAME up by one more
git commit --amend --no-edit
git push origin main
```

Users of that app roll back on their next reload, same as a forward release.
