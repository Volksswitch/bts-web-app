# Releasing the Bliss Tactile Symbol Designer web app

The formal release process for this web app. It is the **same shape** as the
Keyguard Designer web app's process (*work locally, log each user-visible change
to `## Unreleased` in plain language, and say "bump bts web app" to cut a
release*). Only the names differ.

## Environment model

- **The PC is the development environment.** All day-to-day work is committed to the
  local `main` branch on the PC. **These commits are NOT pushed.** They are backed up
  and synced across machines by OneDrive, which syncs the whole project folder
  including the `.git` directory.
- **GitHub is the release environment.** The repository is
  <https://github.com/Volksswitch/bliss-tactile-symbols-web> ⚠️ *(confirm the exact
  repo name — it is also hardcoded as `APP_REPO` in `app.html`; the two must match).*
  **GitHub Pages serves the `main` branch**, so a user's browser picks up a new
  version when `main` moves. Therefore:

  > **Commit to local `main` = save your work.
  > Push `main` = release to users.**

  Everything you commit piles up locally, invisible to users, until you choose to
  release. **Any push to `main` redeploys the app** (even a docs-only commit), so we
  do not push between releases.

There is one branch: `main`. There is no separate release branch.

## Between releases (the dev cycle)

- **Claude commits; Ken does not run git.** As each change is completed, Claude commits
  it to local `main`. No pushing.
- **Changelog-as-you-go (mandatory).** `CHANGELOG.md` is kept in lockstep with
  `app.html`. The moment a change lands that a **user** could see or do differently
  (a new feature or a visible fix), add or edit the matching plain-English bullet
  under the topmost **`## Unreleased (next release)`** heading, **in the same commit
  as the code**, written the way a user reads it (not engineering language), matching
  the voice of the existing `## Release N` bullets. Exclude internal-only work (tests,
  tooling, refactors); when in doubt, ask Ken. If a change is backed out, delete its
  bullet in the same commit. **After any `CHANGELOG.md` edit, regenerate the bundled
  notes** (`node scripts/apply-release-notes.mjs`) so the in-app "What's new" notice
  stays in lockstep. **Ken's own edits to `CHANGELOG.md` are authoritative** —
  preserve his wording; make only surgical edits.

## Version numbers

Three things carry the version:

- **`APP_RELEASE`** (integer, in `app.html`) — the number users see in the header and
  the project-open console banner.
- **`CACHE_NAME`** (`bts-vN`, in `sw.js`) — the service-worker cache key. A client
  only picks up a new build when this changes.
- **`latest_app_version.json`** — the manifest the app's self-updater compares
  against; it must equal the *deployed* `APP_RELEASE`.

**Pre-bump (so you always know which build you're testing).** At the *end* of each
release, the local dev copy is immediately pre-incremented: `APP_RELEASE` → (last
public release + 1). The dev build's header and console banner therefore always read
a number **higher than the last public release**. This pre-bump lives **locally only
(unpushed)** until its release. **`CACHE_NAME` and `latest_app_version.json` are NOT
pre-bumped** — they move only during the release ritual, to match the deployed
`APP_RELEASE`. All numbers only ever **increase.**

## When to release

Release only when a coherent chunk is done — a set of fixes/features you'd describe
to a user in one breath. **Critical-fix exception:** a bug that blocks a user from
designing a symbol may be released as soon as it's fixed and tested.

## Releasing — trigger phrase "bump bts web app"

Ken says **"bump bts web app"** (or an obvious variant), only **after he has verified
the `CHANGELOG.md` contents.** That single command authorizes the entire ritual below
**through the push** — Claude runs it end to end and does **not** pause for a second
confirmation before pushing.

The ritual:

1. **Bump `CACHE_NAME`** in `sw.js` — increment the integer by one (`bts-v1` →
   `bts-v2`). It only ever goes up.
2. **Verify `APP_RELEASE`** in `app.html` already reads the release number (it was
   pre-bumped at the last release). If a cycle somehow shipped without a pre-bump, set
   it now. *(For the very first release, `APP_RELEASE` is 1 and there is no pre-bump to
   verify.)*
3. **Finalize the changelog.** Rename the topmost **`## Unreleased (next release)`**
   heading to **`## Release <APP_RELEASE>`**, and add a fresh empty
   `## Unreleased (next release)` section above it.
4. **Regenerate the bundled "What's new" notes:** `node scripts/apply-release-notes.mjs`.
5. **Update the manifest:** `node scripts/publish-app-version.mjs` — writes the deployed
   `APP_RELEASE` into `latest_app_version.json`. Confirm the number matches the release.
6. **Commit** the release (`sw.js`, `app.html`, `CHANGELOG.md`, the `RELEASE_NOTES`
   block in `app.html`, `latest_app_version.json`) as one commit.
7. **Push `origin main`.** GitHub Pages redeploys within ~1 minute. Users get the new
   app on their next reload (occasionally the one after, as the service worker swaps in).
8. **Start the next cycle — pre-bump.** Immediately increment `APP_RELEASE` in `app.html`
   to (release + 1), commit that locally, and **do not push.** The dev copy now leads
   public by one.

## Invariants — do not break these

- **Never push to `main` except as step 7 of "bump bts web app".** Any push to `main`
  deploys the app to users — including a docs-only push.
- **The pre-bumped `APP_RELEASE` and the `CACHE_NAME`/manifest bump stay local
  (unpushed) until release.** GitHub `main` always equals the last **public** release,
  and on `main` the served `app.html`, `CACHE_NAME`, and `latest_app_version.json` all
  agree on that number.
- **`CACHE_NAME`, `APP_RELEASE`, and the manifest only ever increase** (never reused,
  never lowered). A lowered cache number can strand clients on a stale build.
- **`CHANGELOG.md` is authored as-you-go**, in user language; nothing is authored at
  release except the `## Unreleased` → `## Release <N>` rename.
- **Ken verifies `CHANGELOG.md` before issuing "bump bts web app";** the command then
  runs through the push without a second confirmation.

## The symbol designer `.scad` is released from a SEPARATE repo

The `.scad` the user carries in their folder updates **independently** of this web app.
Its canonical copy + manifest live in their own repo,
[`Volksswitch/bliss-tactile-symbols`](https://github.com/Volksswitch/bliss-tactile-symbols),
with their own release process (see that repo's `RELEASING.md`, trigger phrase
**"bump bts"** — note that this app's **"bump bts web app"** starts with the same words,
so read the whole phrase). This is the keyguard model — the whole point is decoupling:

- Publishing a new `.scad` is a push to the **scad** repo. It does **not** redeploy this
  app (no Pages rebuild, no `APP_RELEASE`/`CACHE_NAME` change).
- Releasing this app ("bump bts web app") is a push to the **web-app** repo. It does
  **not** touch the `.scad`.

The only link is the constant **`SCAD_REPO`** in `app.html` (and the matching
`scad_url` in the scad repo's manifest) — keep them pointing at each other. The app
reads the manifest via `raw.githubusercontent.com`; when a user's local `scad_version`
is behind, it offers an in-place update (download → verify version → overwrite the local
file → reload), keeping the filename stable so the `.json` presets carry forward.

## What's different from keyguard

- **User files live in the connected folder, not the repo.** The user's `.scad`,
  `.json`, and `SVG files/` come from their own File System Access folder — they are
  **not** served from this origin and are **not** cached by `sw.js`. Only the app shell
  (`app.html` + vendored `openscad-wasm` / `three`) is cached and self-updated.
- **Localhost skips the service worker.** On the dev server the SW is unregistered and
  its caches cleared, so a plain reload always serves your latest edit (no
  Ctrl+Shift+R dance). Production registers it for the offline shell + self-update.

## Rolling back a bad release

Revert the release commit on `main`, then bump `CACHE_NAME` **up** again (e.g. v2 → v3,
never back to v1), and push:

```
git revert -m 1 <release-commit-sha>   # drop -m 1 if it wasn't a merge
# hand-edit sw.js: bump CACHE_NAME up by one more
git commit --amend --no-edit
git push origin main
```

Users roll back to the previous app on their next reload, same as a forward release.
