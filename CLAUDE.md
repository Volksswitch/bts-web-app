# Bliss Tactile Symbol Designer (web) — Claude Code Context

## What this project is

A browser-based tool that lets a user turn a prepped **Blissymbol SVG** directly into a
finished, 3D-printable **tactile symbol STL** — in one step, entirely in Chrome or Edge, with no
OpenSCAD install and no command line. It merges two public-domain Volksswitch OpenSCAD programs
(the *Bliss Tactile Symbols* designer and the *Bliss Graphic STL maker*) into a single combined
`bliss.scad`, and wraps it in a single-file web app modeled on the keyguard designer.

**Author:** Volksswitch (www.volksswitch.org) — released to the public domain (CC0)

## Two apps from one engine (Ken, 2026-07-24)

This repo will host **two** web apps that are the *same engine* pointed at different files:
**Bliss Tactile Symbols** (today's app) and **Bliss Tiles & Puzzles** (new). They differ only in
their designer `.scad` + presets `.json`, a few identity strings, and per-app SVG folders — the
Customizer is auto-generated from the `.scad` and the whole SVG→3D pipeline is generic, so almost
nothing is app-specific code. Decisions Ken made setting this up:

- **One repo, two independent apps.** Some users want only Symbols, and either app must be
  updatable/deliverable without touching the other. Independence is enforced by **service-worker
  scope**: each app lives in its own subdirectory with its own `sw.js` (distinct `CACHE_NAME`),
  its own `latest_app_version.json`, and its own `APP_RELEASE`. Planned layout:
  `shared/` (the extracted `bts-core.js` engine + vendored `openscad-wasm/`, `vendor/three/`),
  `symbols/` and `tiles/` (thin shells + each app's `sw.js` + manifest), plus a root landing page.
- **Neither app is public yet — Ken is the only user and the download URL has not been shared
  (Ken, 2026-07-24).** So there are no other installed users to migrate: the symmetric subdir layout
  is free, and a "first public deploy" / "bump bts web app" is a low-stakes non-event until the URL
  is actually distributed. Testing never needs a release anyway — `server.bat` on localhost
  exercises the whole app (FSA + WASM render both work on localhost); a release only adds the Pages
  deploy + self-updater, which is the one part unaffected by current work. Both apps should be ready
  before the download URL goes out.
- **Shared engine, thin shells, no build step.** `bts-core.js` is a native ES module imported by
  each shell (`symbols/index.html`, `tiles/index.html`); the shell defines an **`APP_CONFIG`**
  object and passes it in. Native modules load over `python -m http.server`, so the no-bundler rule
  holds; the only thing given up is the single-*file* convention.
- **`APP_CONFIG` knobs** (per app): `scadBaseName`; identity strings (`<title>`, gate text, log
  banner, Settings labels, export fallback name); the app-update axis (`APP_RELEASE`, `APP_REPO`,
  its `latest_app_version.json`, `sw.js` `CACHE_NAME`); the scad-update axis; and the SVG folders
  (see next bullet).
- **SVG folders — two named folders, split across two actions (Ken, 2026-07-24).** Two subfolders:
  **`Bliss SVG files`** (Symbols' own) and **`Basic SVG files`** (Tiles' own). The old single
  `SVG files` folder is renamed `Bliss SVG files`; `Basic SVG files` is added — a
  provisioning-bundle change (nothing is public yet). `APP_CONFIG.svgOwnDir` is the app's own folder
  (Symbols `Bliss SVG files`, Tiles `Basic SVG files`); `APP_CONFIG.svgCreateSources` is the ordered
  candidate list `['Bliss SVG files','Basic SVG files']` (same for both apps, own folder first).
  - **The Graphic File picker reads `APP_CONFIG.svgPickerDirs`** (ordered; first = default when the
    picker opens). Symbols leaves it unset → the engine defaults to `[svgOwnDir]` = `['Bliss SVG
    files']` (single folder, no selector, behaves as before). **Tiles sets it to `['Basic SVG
    files','Puzzle SVG files']`** (Ken, 2026-07-24) — so the Tiles picker shows the same A/B folder
    selector Create-Graphic uses, defaulting to `Basic SVG files`, with a new **`Puzzle SVG files`**
    folder as the second source. A folder present in the list but missing on disk is dropped, so the
    selector only appears when ≥2 are present. `Puzzle SVG files` is a new provisioning subfolder.
  - **Bare `graphic_svg` references resolve across `svgPickerDirs` in order** (default folder first
    on a same-name collision). An interactive pick loads from the folder selected in the picker; a
    typed name or a preset's `graphic_svg` searches the picker's folders. (This relaxes the earlier
    "own folder only" rule, which Tiles' two-folder picker supersedes.)
  - **Create-Graphic "+ Add symbol" may source a component from EITHER folder.** An A/B selector
    appears in the Create-Graphic dialog **only when both folders are present** (otherwise the one
    present folder is used silently). The component's shape is **baked into the composite**, so the
    source folder need not be recorded. The composite **saves to the app's own folder** (`svgOwnDir`)
    and is thereafter referenceable on the normal path.
- **Both apps connect to the SAME folder — named `Bliss Tactile Symbols` (Ken, 2026-07-24).** One
  provisioning folder holds *both* apps' files: `Bliss Tactile Symbols.scad` + `Bliss Tiles and
  Puzzles.scad`, both `.json`s, and the SVG folders (`Bliss SVG files`, `Basic SVG files`, and
  `Puzzle SVG files`). So the
  gate **title** ("Open your … folder") names this shared folder for both apps — driven by
  `APP_CONFIG.folderName` (`'Bliss Tactile Symbols'` in *both* shells) — while the gate **message**
  stays per-app (each app states the `.scad`/SVG folder *it* needs, from `scadBaseName`/`svgOwnDir`).
- **Folder discovery targets the app's own `.scad` by name**, not "the first `.scad` found"
  — the shared folder holds both `.scad` files, so each app finds its own (`scadBaseName`). The
  `.json` still derives from that basename.
- **Create-Graphic is shared** — Tiles needs it too, so it stays in `bts-core.js`. It is the one
  place the A/B source selector lives (see the SVG-folders bullet); it saves to `svgOwnDir`.
- **Both designer `.scad` files live in the one `bliss-tactile-symbols` repo**, each with its own
  version manifest (`latest_scad_version.json` for symbols, `latest_tiles_version.json` for tiles)
  — same repo, independent `.scad` release streams, mirroring the app side.
- **Phasing:** (1) ✅ parameterize `app.html` with `APP_CONFIG`, Symbols behavior unchanged.
  (2) ✅ extract `shared/bts-core.js` + shared markup/CSS; add `symbols/` and `tiles/` shells.
  Both shells verified to boot the shared engine with their own identity (2026-07-24).

### Phase 2 layout & boot (done 2026-07-24)

```
BTS web app/
├── shared/
│   ├── bts-core.js      ← the engine (the old inline module); reads window.APP_CONFIG
│   ├── bts.css          ← the old <style> block
│   └── app-body.html    ← the old <body> markup (no <script>/<style>)
├── symbols/  index.html · sw.js · manifest.webmanifest · latest_app_version.json
├── tiles/    index.html · sw.js · manifest.webmanifest · latest_app_version.json
├── openscad-wasm/ · vendor/three/   ← unmoved; shared, reached from a shell with ../
└── index.html   ← root landing page (chooser). The OLD single-file app.html/sw.js/manifest
                   were retired in the finalize pass (recoverable from git history).
```

- **Vendored deps stay at the repo root** (not moved into `shared/`) to avoid rewriting many import
  paths; both shells reach them with `../`. A shell's import map maps `three`; `bts-core.js` imports
  openscad-wasm by relative path (`../openscad-wasm/…`).
- **Thin shell + injected markup — no build step.** Each `index.html` sets `window.APP_CONFIG`
  (a classic `<script>`), then a module `<script>` **fetches `../shared/app-body.html` and injects
  it as `body`'s first children** (so `<main>` stays a direct flex child, which the CSS requires),
  **then** `import()`s `../shared/bts-core.js` (its top-level `getElementById` wiring runs after the
  markup exists). CSS is a plain `<link>` to `../shared/bts.css`.
- **`APP_CONFIG` now comes from the shell**, not a literal in the engine: `const APP_CONFIG =
  window.APP_CONFIG` (the engine throws if it's missing). Added field **`appDir`** (`symbols`/`tiles`)
  — the app's subfolder, used to build `APP_MANIFEST_URL` (`…/main/<appDir>/latest_app_version.json`)
  and, via the shell's own `sw.js` scope, its independent update stream.
- **Per-app service workers**: `symbols/sw.js` (`CACHE_NAME 'bts-symbols-vN'`, scope `/symbols/`) and
  `tiles/sw.js` (`'bts-tiles-vN'`, scope `/tiles/`). `register('./sw.js')` is document-relative, so
  each shell registers its own. Cross-scope caching of `../shared` + `../vendor` + `../openscad-wasm`
  is fine (scope limits which *pages* a worker controls, not what it may cache).
- **App-specific text out of the shared markup**: `app-body.html`'s gate title/message and
  "What's new" heading are empty `id`'d elements filled at boot by `applyAppIdentity()` in the engine.
  The gate **title** uses `APP_CONFIG.folderName` (the shared folder, same for both apps); the gate
  **message** uses `scadBaseName`/`svgOwnDir` (per-app); Settings "About" labels use `APP_CONFIG.appName`.
- **Release notes are per-app (done 2026-07-24).** The engine reads `APP_CONFIG.releaseNotes`; each
  shell carries its own between the `@@RELEASE_NOTES_*@@` markers, generated from **`<app>/CHANGELOG.md`**
  by the reworked `scripts/apply-release-notes.mjs` (processes both apps by default; reads each shell's
  `appRelease:` and writes `window.APP_CONFIG.releaseNotes = {…}`). `CHANGELOG.md` moved to
  `symbols/CHANGELOG.md`; `tiles/CHANGELOG.md` is new (release 1). Symbols' generated notes are
  byte-identical to the old inline object (keys 1–10, 12–14).
- **Tiles identity is set**: title/appName `Bliss Tiles and Puzzles`, description "Build remedial and
  motivational tools for your Bliss Tactile Symbols.", `exportFallback: 'bliss-tile'`, `scadBaseName`
  `Bliss Tiles and Puzzles`. The Tiles designer `.scad` exists in the `bliss-tactile-symbols` repo
  (`C:\Users\ken\OneDrive\Desktop\bliss-tactile-symbols`); it (and optionally a Tiles `.json`) must be
  **provisioned into the shared connected folder** for Tiles to render there.

### Phase 2 — finalize (done 2026-07-24)

- **Root `index.html` is now a landing page** (chooser linking to `./symbols/` and `./tiles/`),
  replacing the old redirect-to-`app.html`.
- **Old single-file app retired**: `app.html`, root `sw.js`, root `manifest.webmanifest`, and root
  `latest_app_version.json` were `git rm`'d (recoverable from history). All logic now lives in
  `shared/` + the two shells.
- **`server.bat`** now opens the landing page (`http://localhost:8000/`), not `app.html`.
- **Release tooling is per-app**: `scripts/apply-release-notes.mjs` (both apps by default; reads each
  shell's `appRelease`, writes into `<app>/index.html`) and `scripts/publish-app-version.mjs <app>`
  (writes `<app>/latest_app_version.json`). `RELEASING.md` rewritten for the two-app model.
- **`README.md`** rewritten for the two apps + the shared-folder launch flow.

### Phase 2 — still open

- **Scad-update strings are parametrized (done 2026-07-24).** The `.scad`-update modal heading, its
  body ("Your … file is v…"), the "Updating …" status, and the snooze/skip/version log lines now read
  `APP_CONFIG.designerLabel` (Symbols `'symbol designer'`, Tiles `'tile & puzzle designer'`;
  `capFirst()` capitalizes at sentence starts). The shared `#scadUpdateTitle` heading is filled at boot
  by `applyAppIdentity()`, same as the gate title. Verified both apps render their own wording.
- **Tiles `.scad` released + release tooling built (2026-07-24).** The Tiles designer `.scad`
  (version 1, with the tile-piece-SVG feature) is **pushed to the scad repo's `main`** alongside
  `latest_tiles_version.json` (version 1), so the deployed Tiles app's update check resolves. The
  scad repo's tooling now handles **both** designers: `publish-scad-version.mjs` takes `[bts|btp]`
  (own `scad_version`/changelog/manifest, plus a cross-app pre-bump warning), `TILES-SCAD-CHANGELOG.md`
  exists, and `RELEASING.md` documents `bump btp` — including the **one-repo/two-version-gated-`.scad`s**
  rule: releasing one designer must not publish the other's local-only pre-bump (release it underneath,
  via `git reset --mixed origin/main` then commit only that designer's files). Scad repo currently holds
  local-only pre-bumps: Symbols `scad_version 4` (manifest 3), Tiles `scad_version 2` (manifest 1).
- **The Tiles designer `.scad` + a Tiles `.json` must be provisioned into the shared folder** for
  Tiles to render there.

### Tiles "tile-piece SVG" feature — IN PROGRESS (uncommitted, 2026-07-24)

Replaces the Tiles designer's three per-piece STL-folder refs (`core_concept_N` /
`beyond_core_concept_N` / `basic_shape_N`) with ONE **`tile_piece_svg_N`** that stores a
connected-folder-relative SVG path; the web app preps each referenced SVG and writes it into the
WASM FS at that path, and the `.scad` `import`s + extrudes it as a raised graphic. **All local,
nothing committed/deployed.**

- **Phase A — `.scad`** (BOTH copies: the scad repo *and* the connected folder
  `…/Desktop/Bliss Tactile Symbols/`): 60→20 params, single `tile_piece_svgs` array, new
  `tile_piece_graphic(path)` extrude module, all 7 geometry sites rewired. Parses clean for every
  `part_to_print`. ⚠️ `.scad` is CRLF + tab-indented — script edits with `perl`.
- **Phase B — `shared/bts-core.js`**: `tile_piece_svg_N` pickers (helpers `isTilePieceSvg`,
  `tilePieceLabel`, `svgBaseFromPath`, `pickerSourceNameFor`, `resolveTilePieceSvg`; a `buildForm`
  branch; per-app **`svgPickerDirs`** — Tiles reads `['Basic SVG files','Puzzle SVG files']`, Basic
  default). Render: `prepSvgText()`, `prepareTilePieceSvgs()` / `readSvgByRelPath()` /
  `TILE_PIECE_FILES`, `renderOnce` writes them into the FS, `runRender` awaits the prep.
- **Phase C — JSON migrated** (connected folder's `Bliss Tiles and Puzzles.json`): 55 presets, 382
  values; `core`/`beyond` → `Puzzle SVG files/<name>.svg`, `basic` → `Basic SVG files/<name>.svg`.
- **DONE — the raised-graphic scale is the band scale, DERIVED per piece (Ken, 2026-07-24).** The
  fitted `tile_piece_scale = 0.1655` constant is gone. `tile_piece_graphic(path, mm_per_unit)` now
  computes `sc = band_scale_factor / mm_per_unit` with **`band_scale_factor = 0.1875`** — exactly the
  Symbols graphic's mapping (the 128-unit sky→earth band, y 130..258, → 24 mm). The web app preps each
  piece SVG (`prepSvgText` now returns `{text, mmPerUnit}`; `normalizeUnits` pins any viewBox SVG to
  1 mm/unit) and passes a per-piece `-D tile_piece_mm_per_unit=[…]` (20-slot, aligned to
  `tile_piece_svg_1..20`), so the effective scale is a flat 0.1875 for every real Bliss SVG.
  **Ken's ruling: the official scaling is how a graphic appears on a Bliss Tactile Symbol** — a 100%
  puzzle graphic must equal the same graphic on a symbol. That is the band scale, full stop.
  - **The old baked `beyond core concepts` library is ~11.8% SMALLER** than the band scale (its
    effective scale ≈ 0.1655; 0.1875/0.1655 = 1.133). Measured from ground truth: `target bear.stl`
    (baked import) graphic outline 54.5×23.0 mm vs the band render 61.9×26.1 mm (uniform 1.133×). So
    the derived scale does **not** reproduce the baked STLs — the baked library predates the band-scale
    rework, and a 100% puzzle graphic is now ~13% larger than before but matches the symbol. Ken
    accepted this. Verified in desktop OpenSCAD with a 100-unit square: `mm_per_unit=1` → 18.75 mm,
    `=2` → 9.375 mm (`scratchpad/stlbbox.mjs` measures the raised-graphic bbox via a z-threshold).
- **DONE — two-color Tiles render (render-part split) (2026-07-24).** The Tiles `.scad` gained
  `render_part` ("all"=base+graphics [standalone default], "symbol"=base only, "graphic"=raised
  graphics only), gated by `draw_base`/`draw_graphics` flags across all four `part_to_print` branches
  — so "all" stays byte-identical to before. Verified the decomposition on a puzzle piece: `symbol`
  is the bare slab, `graphic` is the raised solid (trimmed at the base bottom to match `all`), and
  their union is `all`. The web app now fires the graphic pass whenever there is a graphic (Symbols'
  single SVG **or** any Tiles tile-piece SVG: `anyGraphic = !!svgText || TILE_PIECE_FILES.length`), so
  the base and raised graphic wear different display colors and the two-color STL export (`- body.stl`
  / `- graphic.stl`) works for Tiles. Both exports call `prepareTilePieceSvgs()` first.
  - **Ken's acceptance test (pending):** export the raised graphic **alone** from both apps and confirm
    the two are the same size in the slicer. Reuses the same tokens as Symbols, so no app render-token
    changes were needed — only the Tiles-aware `anyGraphic` gate.
  - ⚠️ Both `.scad` copies were re-saved as clean CRLF (an earlier scripted edit had left one stray
    LF-only line ending); they are byte-identical to each other.

The sections below describe the Symbols app's behavior — now the shared engine's behavior; file/line
references predating the extraction point into what is now `shared/bts-core.js`.

## The folders in play — two for development, plus one live-page worktree

Development touches **exactly two** folders, and a third exists only to publish the retiring
address's farewell page. Nothing else on the machine is part of this work — do not read from,
write to, or reason about any other path, and do not go looking for one.

| Folder | What it is |
|---|---|
| `BTS web app/` | This repo — the two app shells (`symbols/`, `tiles/`), the shared engine (`shared/`), vendored deps, change control. |
| `bliss-tactile-symbols/` | The separate repo — canonical `.scad` + `latest_scad_version.json` only. Released independently; see below. The starter `.json` / `SVG files/` are **not** there (deleted 2026-07-22): they ship as a ZIP from the Volksswitch website, so there is no local corpus of concepts or Blissymbols to consult. |
| `BTS web app - legacy page/` | ⚠️ **A git worktree of THIS repo on branch `legacy-main`**, not a separate project. It is the working copy for the **retiring** address (`volksswitch.github.io/bliss-tactile-symbols-web/`), which now serves the "we have moved" page; its remote is **`legacy`**, never `origin`. Moved here 17 Aug 2026 out of a temp scratchpad that was not guaranteed to survive. Touch it only to edit that page, then release with **"bump OLD bts web app"**. It carries a `WHAT-THIS-FOLDER-IS.md` marker (locally ignored, never committed). Goes away on its own timeline — `ORIGIN-MIGRATION-STATE.md` §10, §16.5. |

Other folders may exist on disk with similar names. They are **not** ours: they are not sources of
truth, not validation corpora, and not the app's connected folder. Leave them alone.

**The connected folder is the user's own and is unknowable from disk.** At runtime the app reads
the `.scad`/`.json`/SVGs from whichever folder the user picks via File System Access; the handle
lives only in IndexedDB (`bts-db`/`handles`/`folder`). Never infer which folder that is from a
path, and never edit a file on the assumption that it is the connected copy.

---

## The symbol pipeline (and what we collapsed)

Making a Bliss tactile symbol has three conceptual steps:

- **Step 0 — SVG prep (manual, in PowerPoint today):** raw BSI (Blissymbolics International) SVG →
  printable/tactile SVG. Three edits: (1) increase stroke width, (2) close open shapes (e.g. four
  arcs → one circle, so OpenSCAD imports a clean filled region), (3) add spacing between elements
  that would otherwise merge once the stroke is fattened (e.g. the dot and line of an exclamation
  point). Edits (2) and (3) require human judgment — **out of scope for now** (see Scope below).
- **Step 1 — graphic maker:** prepped SVG → raised-graphic solid (offset + extrude + optional
  2-step top chamfer).
- **Step 2 — designer:** graphic + parameters → finished symbol (body shape by grammatical type,
  earth/sky lines, engraved text, ASCII Braille sphere-dots, string hole, RFID pocket, magnets,
  Velcro recesses).

**This app merges Steps 1 and 2.** The user brings a Step-0-prepped SVG; the app does the rest in
one render.

Bliss SVGs are **stroke-based line art** (`fill="none" stroke-width=…`), not filled shapes — that
is the whole reason Steps 0 and 1 exist.

---

## How `bliss.scad` works

> **Filename note:** the SCAD file on disk is `Bliss Tactile Symbols.scad`. This doc (and many
> code comments) call it `bliss.scad` for short — the same conceptual file. The app fetches it at
> `./Bliss%20Tactile%20Symbols.scad`; `/bliss.scad` still appears only as the *virtual* path
> written inside the WASM filesystem, which is unrelated to the on-disk name.

It is the *Bliss Tactile Symbols* designer, verbatim, with one change: the `graphic()` module no
longer imports a pre-baked STL. Instead it builds that same geometry inline via `raw_graphic()`,
which is the *Bliss Graphic STL maker*'s body (`import(svg) → offset(delta=2) → linear_extrude →
2-step offset chamfer`). Everything downstream (mask + placement) is unchanged.

- **Why the placement math is reusable unchanged:** the old flow imported the graphic STL with
  `import(center=true)`, but for the centered Bliss graphic that is a **no-op in Z** — the graphic
  spans Z `0..6.2` and `translate z = sd/2 − 6.2 + graphic_height` puts its top exactly
  `graphic_height` mm above the symbol face. Confirmed empirically: rendering `all.svg` through
  `bliss.scad` yields a byte-identical bounding box to the original two-step output.
- **Scale auto-detection (replaces the manual type1/type2 choice):**
  `graphic_scale_factor = target_stroke_mm(1.807) / svg_stroke_width`. The two legacy magic factors
  (`0.122` @ stroke 14.74, `0.036` @ stroke 50.42) both normalized the source stroke to ~1.8 mm on
  the print; we recover that invariant continuously. The **app** parses the SVG's dominant
  stroke-width and passes it in as `-D svg_stroke_width=…`.
- **App-managed params:** `svg_path` (the app writes the uploaded SVG to `/graphic.svg` in the WASM
  FS and sets this) and `svg_stroke_width`. Both live in `bliss.scad` for standalone OpenSCAD use,
  but the app hides them from the generated form (see `APP_MANAGED` in `app.html`).
- **`render_part`** (in the `/*[Hidden]*/` block, so it's not shown in the Customizer): `"all"`
  (default, whole symbol) / `"symbol"` (body + earth-sky + braille, no graphic) / `"graphic"` (just
  the raised graphic). The app uses `"symbol"`+`"graphic"` for the two-colour preview and `"all"`
  for export. The body-only cuts (hole, RFID, magnets, Velcro) don't intersect the graphic, so they
  are harmless in the graphic pass.

---

## How `app.html` works

Single HTML file, one inline ES module. **No build step, no bundler** — served over http/https
(FSA needs a secure context; localhost counts). Mirrors the keyguard designer's approach.

- **Local folder (File System Access) — the source of the .scad/.json/SVGs (Ken, 2026-07-20):**
  the app is hosted; the **user downloads a starter bundle** (`Bliss Tactile Symbols.scad`, its
  `.json`, and a copy of the `SVG files/` folder) into a local folder and, on launch, **grants the
  app read/write access to that folder** (`showDirectoryPicker`, `mode:'readwrite'`). It reads the
  `.scad`, the `.json`, and enumerates `SVG files/` **from the folder handle** — nothing is fetched
  by URL. The handle is remembered in **IndexedDB** (`bts-db`/`handles`/`folder`) so a returning
  user reconnects with one click (the API still needs a user gesture to re-grant). A **launch gate**
  (`#launchGate`) blocks the UI until a folder is connected; `connectFolder` → `loadFromFolder`
  parses the .scad, builds the form, and renders. No "project" concept (unlike keyguard) — just one
  folder. **Chrome/Edge only.** See [[bts-fsa-folder-model]]. *(Future: version check + automatic
  downloads from within the app, the keyguard `latest_app_version.json` pattern — not built yet.)*
- **Deps (vendored):** `openscad-wasm/` (v0.0.4, single-threaded — the WASM is embedded in
  `openscad.js`; no separate `.wasm`; COOP/COEP headers not required) and `vendor/three/`
  (three.module.min.js + OrbitControls + STLLoader). Loaded via an import map.
- **Render path:** `createOpenSCAD()` → `addFonts()` → `fs.writeFile('/bliss.scad', …)` and, if an
  SVG is loaded, `fs.writeFile('/graphic.svg', …)` → `callMain(['/bliss.scad','-o','/out.stl',
  '--backend=Manifold', …-D…])` → `fs.readFile('/out.stl')` → `STLLoader.parse` → Three.js mesh.
  A **fresh WASM instance per render** (callMain triggers `exitJS()`). Manifold ≈ 0.5–1.5 s.
- **Two-colour preview (two-pass render):** each preview does two renders — `-D render_part="symbol"`
  and `-D render_part="graphic"` — and puts them in a `THREE.Group` as two meshes so each can wear
  its own Customizer display colour (`symbol_display_color` / `graphic_display_color`, mapped through
  `SYMBOL_COLORS`/`GRAPHIC_COLORS` — the same names as bliss.scad's tables). This is **viewport-only,
  like OpenSCAD's `color()`**; the STL carries no colour. Changing either colour dropdown recolours
  the material live (no re-render). The graphic pass is skipped when no SVG is loaded.
- **Customizer:** auto-generated by parsing `bliss.scad`'s top-of-file `/*[Group]*/` declarations
  (`parseCustomizer`) — `name = value; //[options]` → text / number / range slider / labelled
  dropdown; parsing stops at `/*[Hidden]*/`. Add a parameter to `bliss.scad` and the UI updates.
  Two small presentation overrides live in `app.html`: `LABELS` renames a field (`graphic_svg` →
  "Graphic File") and `NO_DESC` suppresses a param's `//` comment when it's developer-facing.
  - ⚠️ **Only the LAST `//` line above a param becomes its description** — `parseCustomizer`
    *overwrites* `desc` on each comment line rather than accumulating, matching the desktop
    Customizer. So a param's block reads as: developer notes first, then one whole user-facing
    sentence on the final line (`graphic_svg` is written that way). Add explanation to the *top* of
    a block, never the bottom, or you silently replace the field's description with a fragment —
    `remove_Bliss_indicators` was showing "standalone-OpenSCAD user prepping their own SVG can leave
    this off." for exactly that reason until 2026-07-23.
- **Presets:** an editable **Concepts** combobox + **Save / New / Delete** + a dirty marker, pinned at
  the top of the Customizer pane (`buildPresetBar`), the web equivalent of the desktop Customizer's
  preset picker.
  The list comes from the connected folder's **`Bliss Tactile Symbols.json`** (`parameterSets`, read
  from the folder handle in `loadFromFolder`; missing/broken JSON just hides the selector). Choosing
  a concept (`selectPreset` → `applyPreset`) pushes its stored values onto the matching params and
  re-renders once. Only user-facing params are touched: **`APP_MANAGED` keys are skipped** (so a
  legacy preset can't override the auto-computed concept width, the SVG path, etc.), and keys with no
  matching param are ignored — which lets old presets stay forward-compatible. Values are strings,
  coerced to each param's type; ranges snap to their step. Test hooks: `window.__applyPreset`,
  `window.__presetNames`, `window.__presetDbg`.
  - **A switch writes EVERY user-facing param (Ken, 2026-07-22).** A param the concept doesn't name
    falls back to `SCAD_DEFAULTS`, *not* to the value the previous concept left behind. `applyPreset`
    used to `continue` past unnamed params, so a concept inherited stray settings and could render
    differently depending on what had been loaded before it — 243 of the 249 concepts omitted at least
    one key (`add_velcro_mounts` absent from 211, `include_earth_and_sky_lines` from 236), so the drift
    was the normal case, not an edge case. *(Counts measured 2026-07-22 against the starter `.json`
    then sitting in the scad repo, since deleted — treat them as an order-of-magnitude record of why
    this changed, not as a current fact.)* This matches the keyguard designer, whose
    `populateFormFromPreset` builds a full value map the same way. `graphic_svg` already worked like
    this — absent means "no graphic", not "keep".
  - **Why a combobox and not a `<select>` (Ken, 2026-07-20):** a `<select>` is rendered by the OS, and
    its text can never be selected or copied in any browser — Ken needs to copy a concept name. So the
    control is the keyguard designer's `#preset-combo` ported over (which its own comments describe as
    a mirror of OpenSCAD's Qt combobox): a **text input** + a **▾ button** + an absolutely-positioned
    **`<ul role="listbox">`** toggled by an `.open` class (`.preset-combo` in the CSS; built in
    `buildPresetBar`, wired by `wirePresetCombo`). The name is now ordinary copyable text.
    - `rebuildPresetOptions()` is the single sync point: it sets the input to `currentPreset` and
      rebuilds the list, marking the active row. Call it after **any** change to `PRESETS` or
      `currentPreset` (`applyPreset`, `addPreset`, `deletePreset`, `renamePreset`, `selectPreset`).
      ⚠️ It finds its elements with `document.getElementById`, so **the preset bar must already be
      attached to the DOM before it runs** — `buildPresetBar` appends `bar` to `root` as its *first*
      act for exactly this reason. Building the bar detached and appending at the end made the
      lookup return null and the concept list came up silently empty on every folder open.
    - **List order is alphabetical** (case-insensitive), via `presetNames()` — the one place that
      enumerates concepts, so the dropdown and ↑/↓ stepping can't disagree.
    - **`design default values` heads the list** — the web equivalent of the desktop Customizer's
      built-in entry of that name, a known starting point that restores every parameter to the value
      declared in the `.scad`. It is **synthesised, never stored in the `.json`**: `SCAD_DEFAULTS` is a
      `snapshotParams()` taken in `loadFromFolder` right after `buildForm`, in the same
      `{param: "value-as-string"}` shape as a stored preset, so `applyPreset` handles it on the normal
      path (including clearing the graphic, since the default `graphic_svg` is empty). Re-taken on
      every folder open, so an updated `.scad` supplies its own new defaults.
      - `presetNames()` prepends it and filters a same-named concept out of the file's keys, so it
        can't appear twice; it is omitted entirely until `SCAD_DEFAULTS` exists (no folder yet).
      - It has no row in the file, so **Delete is disabled**, **Save routes to New**, and rename is
        refused in both directions — `addPreset`/`renamePreset` also reject the name for a concept.
        Nothing here reaches `buildPresetJson`, so the on-disk file is unaffected.
    - **The JSON on disk is sorted to match** (Ken, 2026-07-20). `buildPresetJson` sorts concept names
      with the *same* comparator (`localeCompare`, `sensitivity:'base'`), so a Save/New/Rename writes
      the new concept into its alphabetical place instead of appending it. The shipped file was
      re-sorted once to match (it had `hydrotherapy`, `music therapy`, `water`, `milk`, `outside`
      appended out of order). File order and UI order are now the same list.
      - Verified byte-for-byte: feeding the current file back through `buildPresetJson` reproduces it
        exactly, so a Save never churns the file. Re-check that round-trip if you touch the
        serializer — it's the guard against a save rewriting all 249 blocks.
      - ⚠️ When verifying the JSON from the browser, fetch it with `cache:'no-store'`. A cached copy
        made this round-trip appear to fail and sent me chasing a collation bug that wasn't there.
    - List items bind **`mousedown`, not `click`** — deliberately. The input's `blur` handler reverts
      uncommitted typing on a 150 ms timer, and a `click` would land after it.
    - **↑/↓ steps** concepts (`stepPreset`, clamped at both ends; from no selection ↓ enters at the
      top and ↑ at the bottom). **Enter renames** (`renamePreset`), **Esc/blur reverts** the typing.
      Typing does *not* filter — that's the deliberate difference from the Graphic File picker, which
      Ken asked to leave as a search modal. Only these two controls exist; don't converge them.
    - `renamePreset` relabels the `parameterSets` key **in place**, rebuilding the dict in key order so
      the concept keeps its position instead of jumping to the end; params and dirty state are
      untouched. Grabs write permission *before* the collision modal, as `deletePreset` does.
    - The outside-click handler that closes the list is bound **once at module scope**, not per combo —
      `buildForm` replaces the combo's DOM on every folder open, so a per-combo binding would pile up.
  - **Dirty tracking + switch guard:** `presetBaseline` is the last-known-clean snapshot of the
    savable params. It's set **when the folder opens** (the .scad defaults), when a preset is applied,
    after each Save/Add, and when the placeholder is selected — so a change is dirty-trackable even
    with **no named preset** selected. A delegated `input`/`change` listener on `#customizer` re-runs
    `isDirty()` (current vs baseline) and toggles the marker + enables Save. **Graphic changes are
    programmatic** (the picker sets `graphic_svg` without a DOM event), so `setGraphicSvgName` calls
    `updateDirty()` itself — the delegated listener would otherwise miss them. Switching presets while
    dirty pops `confirmDiscard` (a DOM modal, **not** native `confirm()` — that consumes the user
    gesture the FSA permission prompt needs afterwards).
  - **Reset — throw away unsaved edits (Ken, 2026-08-14).** `resetPreset()` restores
    **`presetBaseline`** — the last known-clean snapshot. That single rule covers every case: with a
    concept selected it is that concept as applied or last saved; with none, the `.scad` defaults the
    folder opened on. There is deliberately **no separate "re-read the file" path** to keep in step.
    - **It is a BUTTON beside Save** (`resetPresetBtn`, second in `.preset-actions`), not an entry in
      the Concepts pull-down (Ken, 2026-08-14). It first shipped — in Symbols 18 / Tiles 9 — as a row
      at the top of the combo list, shown only while dirty; **Ken didn't find it** ("I don't see a
      reset button"), which is the whole verdict on that placement: an action hidden inside a
      249-row name list, and invisible until you already had a problem. Save and Reset are the two
      answers to "you have unsaved changes", so they sit together and `updateDirty()` enables and
      greys them on the same condition. Don't move it back into the list.
    - `applyPreset`'s value-pushing body was extracted as **`applyParamValues(map)`** so Reset and a
      concept switch apply a `{param: "value"}` map by exactly the same code — including the
      graphic tail (a non-empty `graphic_svg` loads, empty/absent clears). Verified: swapping the
      graphic on `afraid` and resetting restores both the name and the 61.87 mm mesh.
  - **New** (`addPresetBtn` → `addPreset`) creates a new preset that **inherits the selected preset's
    settings** — `{ ...PRESETS[currentPreset], ...snapshotParams() }`, so the full dict (incl. hidden
    keys) carries over — and prompts for a name (prefilled with the source name). The original preset
    is untouched.
  - **Save with no preset selected = Save As** — `savePreset` delegates to `addPreset` (prompts for a
    name) when `currentPreset` is empty, so a from-scratch config (e.g. just picking a graphic) is
    saveable without first selecting a preset.
  - **Delete lands on the built-in defaults** (Ken, 2026-07-22): after `deletePreset` removes the row
    and writes the file, it clears `currentPreset` and calls `applyPreset(DEFAULTS_PRESET)`. Clearing
    the selection alone left the form still showing the *deleted* concept's values — params on screen
    belonging to something that no longer exists — so it now falls back to "design default values",
    the same complete starting point a fresh folder opens on. `currentPreset` is cleared first so
    `applyPreset` doesn't early-return and nothing prompts about unsaved changes to a concept that is
    already gone; the "Deleted …" pill is set **last**, after `applyPreset`'s "rendering…".
  - **Save / Add / Delete write the single JSON in place** (`writePresetsFile` → `createWritable`),
    formatted by `buildPresetJson` to match the on-disk style (4-space indent, keys sorted, `\/`
    escaped). **Preserving that JSON is the user's responsibility** — no app-side backup. Save/Add
    **merge** current savable params over the preset's existing dict, so hidden-but-real keys (`$fn`,
    `braille_a/d`, `symbol_colors`, …) survive. Permission is requested **before** any native
    `prompt()`/modal for the same gesture reason. `savableParams()` = `PARAMS` minus `APP_MANAGED`.
  - The graphic still comes from the loaded SVG — a preset sets everything *around* the graphic
    (grammatical type, text, mounts, hole, colours…), not the artwork, unless it carries `graphic_svg`.
  - **JSON is kept in sync with the .scad's parameter set.** When a param is removed/renamed, its
    entries are pruned from every preset so no dead keys linger. Done once already: dropped
    `core_concept`, `beyond_core_concept`, and `slide_Bliss_graphic_vertically` (all deleted), and
    migrated the misspelled `embed_magnet` → `embed_magnets` (the real param) across 210 presets.
    Hidden-but-real vars (`$fn`, `braille_a/d`, `symbol_colors`, …) stay — they're still valid for
    standalone desktop OpenSCAD. `Bliss_concept_width` stays in the JSON too (real param, just
    app-managed/skipped in the web app).
    - ⚠️ **A UNIT change needs the same treatment, and it is easy to miss** (Ken, 2026-08-14).
      Tiles' `slot_gap` went from tenths of a millimeter (`10` = 1 mm, `s_g = slot_gap/10`) to plain
      millimeters at 0.1 precision (`1`, `s_g = slot_gap`). The parameter *name* didn't change, so
      nothing would have flagged it — but every stored value silently meant ten times as much, and
      52 presets would have printed a 4 mm gap where they meant 0.4. All were divided by 10, and
      `move_lines_vertically` (deleted, `0` in all 52) was pruned in the same pass.
    - **Migrate through a mirror of `buildPresetJson`, and verify the round trip FIRST** — the
      unchanged file must serialize byte-for-byte before rewriting anything, or the diff is the
      serializer's rather than the migration's. (The escaping is the trap: `\/`. Write the script
      to a file; passing it through `node -e` in a shell mangles the backslashes and the round-trip
      check then fails for the wrong reason.) Verify after with the old `.scad` at the old value vs
      the new `.scad` at the new one: `slot_gap=4` (old) and `slot_gap=0.4` (new) give an identical
      mesh bounding box.
    - The pre-migration file is left beside the real one as `… - before <what> migration.json`.
      That is safe by design: the app reads and writes only the `.json` matching the `.scad`'s
      basename, and logs the rest as ignored.
- **Graphic file picker (`graphic_svg` param, labelled "Graphic File"):** the first field in the
  Graphic Info group is a text box + a button labelled **Open** when empty / **Change** when a file is
  set. The button opens a
  search-as-you-type modal (`openSvgPicker`) over the connected folder's **`SVG files/`** subfolder —
  `listSvgFolder` enumerates the subfolder's `FileSystemDirectoryHandle` (`.entries()`) on **every
  open** — the listing is **not** cached (Ken, 2026-07-22): files can appear in the folder while the
  app is running (the Create-Graphic dialog writes there, and so does anything outside the browser),
  and a cached list hid them until reload. Enumeration only stats directory entries — it never reads
  a file — so it stays cheap even on OneDrive. `SVG_LIST` is now just the last listing (what
  `renderPicker` filters over), not a cache to invalidate.
  Filtering is client-side (substring, match-anywhere, arrow-key/Enter/Esc). The modal
  opens with the box's **current value pre-filled into the filter and selected**, so the current name
  is immediately usable as a search term (keep typing to refine, or type over it). Picking a
  file reads `SVG files/<name>.svg` through the handle (`loadSvgByName` → `getFileHandle`) and renders
  it; the base name (no extension) lands in the box. Typing a name and committing loads it directly;
  clearing the box drops the graphic (`clearGraphic`). Drag-drop onto the viewport still loads
  arbitrary files from anywhere — both funnel through `loadSvgText`, which keeps the box in step via
  `setGraphicSvgName`. The box is `autocomplete="off"` with a randomized `name` so Chrome's form
  restore can't refill it on reload: an empty `graphic_svg` must show an empty box.
  - **Why an in-app picker, not the OS dialog:** a browser file dialog can't be restricted to a
    folder and never exposes a full path. The picker reads the folder handle directly, so it *is*
    restricted to `SVG files/` and the base name + folder locate the file — the "hidden full-path
    param" fallback in the original ask wasn't needed. `graphic_svg` is **not** emitted as `-D` (the
    app writes the chosen SVG to `graphic.svg` in the WASM FS and overrides `svg_path`); for standalone
    OpenSCAD, `svg_path` derives from `graphic_svg` as `str("SVG files/", graphic_svg, ".svg")`.
  - **Presets + graphics — a missing `graphic_svg` means "no graphic" (Ken, 2026-07-20):**
    `applyPreset` treats the graphic as part of the preset like any other value. It is handled
    *outside* the main param loop (which `continue`s past `graphic_svg`): a non-empty value →
    `setGraphicSvgName` + `loadSvgByName`; an empty **or absent** key → `clearGraphic()`. Absent must
    not mean "keep" — carrying the last concept's file over silently attached artwork the user never
    chose and left the box showing a file the preset doesn't specify. Only **1 of the 249** shipped
    presets (`afraid`) names a graphic, so in practice most concept switches blank the graphic until
    the user picks one; mapping concept names (`afraid`) onto SVG filenames
    (`afraid,frightened,scared`) is still future work. `presetBaseline` is snapshotted **after** the
    graphic is settled, so a freshly-applied preset doesn't read dirty.
- **Create-Graphic dialog — composing new graphics (Ken, 2026-07-22):** a `#createGraphicBtn` in the
  viewport toolbar (just left of Settings) opens `#createOverlay`, a dialog for **building a new
  compound graphic** by appending existing on-matrix symbols left-to-right ("1"+"0" → "10"), with an
  optional **plural (×) indicator over any individual component**. **Creation is deliberately separate
  from assignment**: the dialog writes a finished `.svg` into the connected `SVG files/` folder, and it
  is then picked/assigned through the ordinary Graphic File picker like any other file. This is why the
  assignment field stayed a plain single-file picker — a compound is just one saved `.svg`.
  - **Model — sequence + superimposition, per-element indicator, create-only.** Whole symbols placed
    side by side on the shared 324 matrix, with any component optionally **stacked on the one before
    it** (Ken, 2026-08-11 — supersedes the earlier append-only rule). Still **no sub-element
    extraction and no free positioning**.
    - **Layout is by COLUMN.** A column normally holds one part; a part flagged `over` joins the
      previous column instead of opening a new one — superimposition is simply the x cursor not
      advancing. A column is as wide as its widest member and members are **centered on it**
      (Ken, 2026-08-11): a container symbol and the symbol inside it are rarely the same width, so
      aligning viewBox lefts would sit the narrow one off to one side. `totalW` sums the columns.
      For a one-part column the centering term is 0, so a plain left-to-right sequence composes
      **exactly** as before — verified: two parts side by side still give viewBox 132 with ink centers
      at x 42 and 112, and stacking the same pair gives viewBox 84 with both at x 42.
    - Y is untouched either way, so stacked parts land on the shared guideline matrix automatically —
      the same reason side-by-side parts line up. Overlapping strokes union in OpenSCAD exactly as
      crossing strokes within one symbol already do, so nothing downstream changes.
    - The **first chip never offers `over`** (nothing to sit on). An indicator on a stacked part still
      centers on *that part's* ink.
    - ⚠️ **Real BCI superimposed compounds often scale or nudge the inner symbol**; this places both at
      native size and matrix position, so it reproduces the pairs drawn to coexist and not the ones
      needing a resize. Going further reopens free positioning — don't, without a decision from Ken. An indicator is a property of a *particular* component (Bliss
    places it over one element of a compound), so each component row carries its own checkboxes:
    **×** (plural), **past** and **future** (Ken, 2026-07-23). There is **no
    "edit existing"** — the dialog only creates new graphics (Ken dropped edit/reopen as too complex,
    2026-07-22); to change one, rebuild it.
    - **One indicator per component.** All three occupy the same spot in the indicator row, so ticking
      one clears the others (`renderCreateChips`'s `flag()` helper re-renders after each change). They
      are checkboxes rather than radios because "none" is the normal state.
    - **The tense glyphs are the BCI characters, not an invention.** `addTenseMark` draws a shallow bow
      whose proportions come from BCI *indicator (past action)* / *indicator (future action)* — a chord
      2·half tall on a radius of 1.390625·half (22.25 at the BCI half of 16), so the bow is ~0.42 of its
      height deep. **Past bows to the right** (chord on the left), **future bows to the left**; verified
      by sampling the arc midpoint of both our path and the BCI glyph's own path and comparing sides.
      Get the sweep flag wrong and you silently draw the *other* tense — check with `getPointAtLength`,
      not `getBBox` (the two directions have identical bounding boxes).
  - **Engine (`composeCompound(parts)`, `parts = [{text, plural, tense}]`, `tense` = `''|'past'|'future'`):**
    parses each component's viewBox,
    lays them out at cumulative x-offsets (each part's viewBox width + `BLISS_SEQUENCE_GAP_UNITS`,
    default 8), and places each in a `<g transform="translate(dx,0)">`. **OpenSCAD's importer honours
    the group translate** (verified against both the desktop CLI and the WASM/Manifold build — the one
    spike that de-risked the whole approach), so no coordinate-baking is needed. Y is untouched, so all
    parts keep their native matrix position and the guidelines line up automatically. For a `plural`
    part, `addPluralMark` draws a × over **that component's ink centre** (measured via `bboxInRootUnits`
    in the compound frame), in the indicator row (midway between y=66 and the sky line 130), at the
    source stroke width; for a `tense` part `addTenseMark` puts its bow in that same spot, centred on
    the same ink center. Built in the offscreen prep host so `getBBox`/`getScreenCTM` resolve.
  - **Added indicators are stamped and survive `stripIndicators`** (Ken, 2026-07-23).
    `addPluralMark`/`addTenseMark` wrap their mark in a `<g data-bts-indicator="plural|past|future">`
    (`BTS_INDICATOR_ATTR`), and `stripIndicators` skips anything inside such a group
    (`el.closest(...)`). **"Remove Bliss Indicators" now means "remove the indicator built into the BCI
    graphic", not "remove everything above the sky line"** — which is precisely what resolves a
    collision between a built-in indicator and an added one: both want the same spot in the indicator
    row, and now the built-in one is the one that goes. Before the stamp the two were
    indistinguishable (both just marks above the sky line) and the added one was stripped along with it.
    - The stamp is written into the saved `.svg`, so it survives the round trip through the folder, and
      it survives being re-used as a component of a *later* compound (`composeCompound` imports child
      nodes wholesale). Verified against the desktop OpenSCAD CLI that the importer treats a `<g>` with
      an unknown attribute like any other group — a two-square probe imported both squares, 24 facets.
    - **A component that is given an indicator replaces its built-in one** (Ken, 2026-07-23), baked
      into the composed artwork — one indicator per element, so the new mark can't land on top of the
      old one. Scoped to that component; a sibling keeps its own. The mark is then centered on what's
      *left* of the component's ink, not on the indicator it just shed.
    - **The dialog has its OWN "remove Bliss indicators" checkbox** (`#createStripBuiltIn` →
      `composeCompound`'s `opts.stripBuiltIn`), which extends that removal to the components that
      weren't given an indicator. It is **not** the Customizer's `remove_Bliss_indicators` and must not
      be wired to it (Ken, 2026-07-23): **the Create-Graphic button is independent of any particular
      concept, while that param belongs to the concept being designed.** An earlier version read the
      form via `pv()` — that was the wrong axis. Resets to on with each dialog open, since it belongs
      to the graphic being built, not to the session.
    - **Baking is safe because the compound is saved under a NEW name** — the source component files
      keep their own indicators either way, which is what makes this a compositional choice rather
      than destructive editing. Preview and saved file are therefore the same bytes.
  - **The saved SVG is on-matrix line-art** (strokes intact, `.pen1` style carried from the first
    part, indicators as explicit-stroke `<line>`s / `<path>` arcs + a fresh `viewBox`/`width`/`height`
    in mm; built-in indicators removed per the rules above). So when
    later picked it flows through the **normal prep pipeline** (`stripIndicators` → `fattenStrokes` →
    `strokeToOutline` → `normalizeUnits` → registration) exactly like a BCI export — nothing downstream
    knows it was composed. Save is **always Save-As**: it prompts for a new name and confirms before
    overwriting; it never overwrites a source implicitly. After a write, `SVG_LIST = null` so the picker
    re-enumerates and the new file appears.
  - **2D preview** injects the composed SVG **inline** (the browser renders the line-art natively — it
    is *not* CSS-blind like OpenSCAD, so `.pen1` strokes show) and overlays faint **guideline
    references** (`overlayGuidelines`: sky/earth solid, indicator-top/mid dashed) that are preview-only
    and never saved.
    - **What the preview shows is exactly what Save writes** — both call `composeCompound` with the
      same `createComposeOpts()`, so there is nothing to explain away and no divergence note (an
      earlier `#createPreviewNote` existed for exactly that and is gone). The picker's `openSvgPicker(onChoose, seed)` was generalised so the dialog's "+ Add
    symbol" appends a component instead of assigning; assignment passes the default `loadSvgByName`.
  - Test hooks: `window.__composeCompound`, `window.__loadFromFolder` (drive the whole UI with a mock
    directory handle — the automated in-app browser can't operate the OS folder-picker dialog, so this
    is how the dialog is verified headlessly end-to-end).
- **Split-Graphic dialog — decomposing a symbol into components (Ken, 2026-08-11):** a
  `#splitGraphicBtn` in the viewport toolbar (just left of Create-Graphic) opens `#splitOverlay`,
  which takes **one** on-matrix symbol and writes its components out as **separate `.svg` files** —
  the raw material for a tile set built from a Blissymbol's parts. It is the inverse of
  Create-Graphic and reuses that dialog's frame (`.create-*` classes) and the ordinary Graphic File
  picker for choosing the source symbol.
  - **Decomposition happens in LEVELS, and the output is the union across them.** Level 0 = the
    whole symbol; level 1 = the drawing primitives as authored; level 2 = sub-primitive geometry (a
    circle's four arcs, a path's segments). `eye.svg` (a circle + a dot) therefore gives **circle,
    dot, and four arcs = the six components Ken specified**, plus the whole symbol when that box is
    ticked. `arm.svg` (two lines) stops at level 1 with two pieces.
  - **A straight line and a Bliss dot are ATOMIC** — no level 2. This is why `arm` comes out as
    exactly two files and why the dot is written once rather than appearing at both levels.
  - **One primitive = one piece is the DEFAULT; connected ink = one piece is an option.** "Join
    touching strokes into one piece" (`opts.merge`) is off by default because `arm`'s two lines meet
    at (10,194) — merging would fuse precisely the two components that must stay apart. Its real use
    is a **raw BSI file whose circle is drawn as four loose arcs**: merging rebuilds the circle at
    level 1 and the four arcs reappear beneath it at level 2, which is the same six pieces reached
    from the opposite direction. Verified both ways.
  - **Circles are cut at the CARDINAL points** (12/3/6/9 o'clock), so arc 1 is the upper-right
    quadrant and they run clockwise; "Cut circles at the diagonals" switches to a top/right/bottom/
    left set. **Half-arcs are opt-in, not a standing level** — ticking "Add half-arcs as well as
    quarters" adds an upper and a lower half alongside the quarters (cut at 9 and 3, which is the
    pairing Bliss uses: a mouth, a container). **"Include the whole symbol" defaults ON**, so `eye`
    yields 7 files out of the box; untick it for Ken's 6.
  - **Every piece keeps the source's viewBox and its original coordinates** — nothing is re-centered
    or re-scaled. So a piece flows through the normal Step-0 prep (`stripIndicators` → `fattenStrokes`
    → `strokeToOutline` → `normalizeUnits`) exactly like any BCI export and, via the band scale,
    prints at the size and place that component occupies on the whole symbol; a set of pieces
    reassembles into the symbol with no fitting. Arcs are emitted as **open `<path d="M… A…">`**
    carrying the source's `class`/paint, which `strokeToOutline` traces correctly (OpenSCAD's own
    importer would fill an open arc as a chord region — see the stroke-to-outline notes).
    Verified: `eye`'s arc 1 spans exactly the circle's upper-right quadrant, and after prep its ink
    bbox is that quadrant grown by half the fattened stroke.
  - **Folders are per-app** (`APP_CONFIG.svgSplitSourceDirs` / `svgSplitDestDirs`): Tiles reads whole
    symbols from **`Bliss SVG files`** and offers **`Basic SVG files`** or **`Puzzle SVG files`** as
    the save destination (Ken, 2026-08-11). **Symbols offers it too** (Ken, 2026-08-14): it reads from
    its own **`Bliss SVG files`** and can save into **any of the three** —
    `Bliss SVG files` (first, so it's the default: the only folder its own Graphic File picker reads)
    **or either Tiles folder**, so a symbol can be broken into tile/puzzle parts without switching
    apps (Ken, 2026-08-14). Sources must exist to be offered; a **destination is offered whether or
    not it exists** and is created on save, as Create-Graphic creates its own folder. An app that
    configures **no** source folders doesn't get the button at all — no app-specific code, just
    absent config.
    - **The destination selector and its "Save into" caption hide when there is only one destination**,
      the same rule Create-Graphic's source selector follows. Neither app is in that state today
      (both offer three and two), but the Save line names the folder regardless
      ("6 of 6 pieces → Bliss SVG files"), so nothing is left unsaid either way.
    - Splitting is **entirely app-side** — it reads an SVG, decomposes it, and writes `.svg` files;
      the pieces then flow through the ordinary picker. **No `.scad` change is involved in offering
      it in another app.**
  - Each row carries a checkbox, a thumbnail showing the piece over a faint copy of the whole symbol,
    and an editable file name. Default names are `<base> - <kind>`, numbered by the label's **stem**
    when a kind repeats (`arm - line 1` / `arm - line 2`) — several elements can each produce their
    own "line 1", and numbering the full label would read as "line 1 2". Editing the base name
    re-derives every row. One overwrite confirmation covers the whole set, not one prompt per file.
  - Test hooks: `window.__splitGraphic(text, opts)` (headless: returns `{pieces, warnings}`) and
    `window.__absSegments(d)` (the path-segment splitter, which resolves relative commands, expands
    the smooth forms S/T, and closes Z).
  - **TILE graphics register to the guideline band VERTICALLY ONLY; horizontally they are
    ink-centered, and PUZZLE graphics are ink-centered on both axes**
    (Ken, 2026-08-11; puzzle carve-out and the X reversal both Ken, 2026-08-14).
    A tile can be engraved with sky and earth lines, so a graphic — or a component split out of
    one — has to sit at its own height in the frame those lines live in; anchoring Y to anything
    else puts the artwork and its guidelines in different frames. **X is a different question**:
    a tile graphic sits in the middle of its tile, and a target graphic in the middle of its
    column — so the two land on the same center line and **the tile sits directly below its
    target** (Ken, 2026-08-14). That is exactly what the Symbols `graphic()` does: translate on
    Y, hardcode X to 0. **A puzzle has no guidelines at all**, so it is ink-centered on both
    axes; its branches call `tile_piece_graphic(svg, mmpu)` with no offset, and since the piece
    and the graphic share an origin, ink-centered *is* piece-centered.
    - `matrixOffsets(text)` returns `{ox, oy}` in SVG units; only `oy` is used —
      `registrationOffset()` is that `oy`, and the app passes `-D tile_piece_offset_y` (20 slots,
      aligned to `tile_piece_svg_1..20` like `tile_piece_mm_per_unit`). `tile_piece_graphic(path,
      mm_per_unit, off_y)` wraps its union in `translate([0, off_y*sc, 0])`.
      **There is no X counterpart** — `tile_piece_offset_x` and the `off_x` argument were removed
      outright rather than passed as 0, so nothing declared is unused. `ox` stays on
      `matrixOffsets`/`prepSvgText` as a general measurement (and a test hook), unplumbed.
      Removal is safe both ways: an older app's `-D` for a variable the `.scad` no longer declares
      is harmless, and a newer app simply stops sending it, so an older `.scad` falls back to its
      own `0` default — which IS the new behavior.
    - ⚠️ **`oy`'s sign is the opposite of what you would write for X**, because the importer flips
      Y. After `center=true` a point lands at `(Cy − y_s)·s`; we want `(anchorY − y_s)·s`, so
      `oy = anchorY − Cy` (an X offset would have been `Cx − anchorX`). Applying it cancels the
      centering on Y, making the height independent of the file's own ink — i.e. absolute.
    - **A file with no `viewBox` falls back to 0**, i.e. plain ink-centered placement — same guard
      as `stripIndicators`, so the hand-prepped legacy SVGs are unaffected.
    - Verified: a 2-column tile base 120 mm wide puts its two targets at x −29.00 and +29.00,
      exactly the column centers `base_x0+gap3/2+c_+b_x+(gap3+2*b_x)*j`, whatever each graphic's
      ink looks like; each tile renders its graphic at x 0 on a 55 mm tile. The slot and the target
      come from the same `x` expression, so the alignment is structural, not fitted. Vertical
      registration is untouched and still per-graphic (`arm` yMid 25, `eye` yMid 19.09).
    - **Consequences Ken accepted:** a graphic's height is absolute, so **it can overrun a tile
      shorter than the 24 mm sky-to-earth band** — tile size and graphic height are not
      independent. Horizontal position is no longer absolute, so a component no longer keeps its
      left-right place within the whole symbol; that was the 2026-08-11 behavior and Ken reversed
      it in favor of target/tile alignment.
- **SVG input:** the Graphic Info picker, or drag-and-drop onto the viewport. `parseStrokeWidth()`
  finds the dominant stroke-width. No SVG loaded → renders the bare symbol body.
- **Header:** title + **Export STL**, nothing else. The folder is opened once through the launch gate
  (`gateOpenBtn` → `connectFolder`), so there is no header folder button or folder-name label; the
  connected folder's name goes to the log instead.
- **Step-0 prep (`stripIndicators`)** — first slice of Step 0 brought in-app. Removes the indicator
  glyph that rides above the symbol (tense: a square, a "v", an inverted "v", any of them optionally
  with a dot). **Always on** — `applyPrep` runs unconditionally; the old "Auto-prep SVG" header
  checkbox is gone. Indicator removal specifically is still gated by the Graphic Info param
  `remove_Bliss_indicators` (default yes), and `svgRaw` keeps the upload so flipping that doesn't
  need a re-open. It removes the indicator **built into the BCI graphic** only — an indicator added in
  the Create-Graphic dialog is stamped `data-bts-indicator` and always kept (Ken, 2026-07-23; see that
  dialog's section). See "Bliss guideline matrix" below for why this is geometric rather than
  shape-recognition. Test hooks: `window.__stripIndicators`, `window.__parseStrokeWidth`.
- **Viewport:** light theme, no grid. Render-on-demand (a single rAF is queued only on orbit /
  resize / new mesh — no perpetual loop, near-zero idle CPU). `syncSize()` reconciles the drawing
  buffer inside the frame, which is what makes the canvas size reliably in embedded panes.
- **Export:** renders the whole symbol fresh (`-D render_part="all"`) and **writes it into the
  connected folder** (`getFileHandle(create:true)` → `createWritable`) as **`<preset name>.stl`** —
  the keyguard model (outputs beside the project files, not in Downloads). With no preset selected it
  falls back to the graphic's name, then `bliss-symbol`. One solid; display colours don't affect it.
  (A download fallback remains for the no-folder case, which shouldn't occur once a folder is open.)
  - **The confirmation pill names the folder** (Ken, 2026-07-22): "Exported `<file>.stl` to the
    `<folder>` folder", off `folder.dir.name` — "to the folder" alone didn't say *which*. The
    two-colour STL and the PNG say it the same way.
- **Two-colour export (`exportStl2Btn`, the multi-coloured "STL" button beside the plain one):**
  writes the **same two passes the preview already renders** — `render_part="symbol"` and
  `render_part="graphic"` — as `<base> - body.stl` and `<base> - graphic.stl` instead of the merged
  `"all"` solid, so a multi-material printer or a mid-print filament swap can colour the body and the
  raised graphic separately. Both passes share one OpenSCAD coordinate system, so importing the pair
  as parts of a single object (Bambu Studio / OrcaSlicer / PrusaSlicer all offer this on multi-file
  import) lands them already aligned — no container format needed. Both are rendered *before*
  anything is written, so a failed second pass can't leave a half-written pair in the folder. With no
  graphic loaded the button refuses (there is only one part). Same `exportBaseName()` as the
  one-piece STL and the PNG, so a concept's outputs sort together. The button carries
  the same `#06c` lettering as the other text buttons over a hard-split two-tone background — one
  tint per exported part — which is what marks it as the multi-colour sibling. The background is set as
  `background-image`, not the `background` shorthand, so it survives the `.vp-btn` hover/`.active`
  rules that repaint the background colour.
  - **The slicer import route matters (Ken, 2026-07-22).** In PrusaSlicer: **load the body STL
    first, then right-click it → Add Part → Load… and pick the graphic STL.** The graphic comes in
    as a part at the correct height (Ken measured y −3.11, z 3.9) — Add Part keeps the mesh's own
    coordinates relative to the object. **Importing both files at once does not work**: that route
    drops each mesh onto the bed, which zeroes the graphic's Z and buries it inside the body (X/Y
    is still right, since both parts are centred on the same origin).
  - This makes a **3MF export unnecessary** — it had been the planned fix for the Z-drop, and the
    operational solution removes the reason for it. Don't build one unless a different need appears.
- **Test hook:** `window.__captureViewportPNG()` renders synchronously and returns a PNG data URL.
- **Change control (keyguard-style, see `RELEASING.md`):** the app carries an integer `APP_RELEASE`
  (header label + console banner) and self-updates on GitHub Pages via a service worker (`sw.js`) +
  `latest_app_version.json` (`checkForAppUpdate`), showing a bundled "What's new" notice after an
  update (`RELEASE_NOTES`, generated from `CHANGELOG.md` by `scripts/apply-release-notes.mjs`). The
  **symbol designer `.scad`** has its own version axis (`scad_version` in its `/*[Hidden]*/` block):
  when the folder's local `.scad` is behind the published `latest_scad_version.json`, the app offers
  an in-place update (`checkForScadUpdate` → `showScadUpdateModal` → `applyScadUpdate`; download +
  verify version + overwrite in place + reload). The canonical `.scad` + `latest_scad_version.json`
  live in a **SEPARATE repo** (`Volksswitch/bliss-tactile-symbols`, constant `SCAD_REPO` in
  `app.html`) so the `.scad` releases **independently** of the app — a `.scad` publish never
  redeploys the app and an app release never touches the `.scad`. That repo has its own
  `RELEASING.md` + `publish-scad-version.mjs`. **⚠️ SIX trigger phrases now — the word "old" selects the retiring address**
  (Ken, 2026-08-16): *"bts web app means new; old bts web app means old."* So **"bump bts web
  app"** releases to `bts.volksswitch.org` (remote `origin`, repo `bts-web-app`) and **"bump
  OLD bts web app"** releases to the retiring `volksswitch.github.io/bliss-tactile-symbols-web/`
  (remote `legacy`). The trap: **"bump old bts web app" CONTAINS "bump bts web app"** — skim
  past the "old" and you deploy to the wrong address, which would put the black
  domain-based icons on the retiring app and destroy the distinction the migration relies on.
  Read the whole phrase and check the remote. **Four original phrases** (Ken, 2026-07-24; `bts` = Bliss
  Tactile Symbols, `btp` = Bliss Tiles and Puzzles) — and within each pair the short phrase is a
  **prefix** of the long one, so read the whole phrase before acting: **"bump bts web app"** /
  **"bump btp web app"** release the two web apps (`symbols/` / `tiles/` in this repo);
  **"bump bts"** / **"bump btp"** release the two designer `.scad`s (from the scad repo). See
  `RELEASING.md` for the table + ritual. Test hooks: `window.__parseScadVersion`,
  `window.__showScadUpdateModal`.
  - ⚠️ **Browser storage is per-ORIGIN, and both apps share one origin — so every
    key must carry `APP_CONFIG.appDir`** (Ken, 2026-08-11). GitHub Pages serves both apps
    from `volksswitch.github.io`, and `localStorage`/`sessionStorage` are scoped to the
    origin, *not* to the path — so a bare key is one value shared by Symbols and Tiles even
    though their release axes are independent. This shipped as a real bug: with Symbols at
    release 15 and Tiles at 5, the shared `bts_last_seen_release` made `maybeShowWhatsNew`'s
    `seen >= APP_RELEASE` guard swallow **every** Tiles "What's new" notice, and it would
    have kept doing so until Tiles passed 15. Same collision hit `bts_scad_snooze` (snoozing
    one designer's update silenced the other's prompt) and the `bts_app_update_tried` loop
    guard. All three are now suffixed `:${APP_CONFIG.appDir}`. The last-seen key migrates
    off the legacy shared key once, adopting it **only if `<= APP_RELEASE`** — a higher
    value belongs to the other app, so it is treated as no record and baselines silently
    rather than announcing releases that never existed. **Adding any new persisted key?
    Namespace it the same way.** (The IndexedDB folder handle is deliberately shared — both
    apps connect to the same folder.)
  - ⚠️ **"What's new" must wait for the app-update check** (Ken, 2026-08-14). `maybeShowWhatsNew()`
    used to run at module load, *before* `checkForAppUpdate`. On a load that is about to
    self-update that is the wrong build to announce from: the page is still the OLD release, the
    modal goes up, `setLastSeenRelease` has **already** advanced the record — and then the update
    reload tears the page down. The notes are consumed by a build that never showed them, and the
    only thing the user sees is **the start page appearing twice**. Ken hit exactly this going
    Symbols 19 → 20: release 19's Reset note was eaten by the pre-reload build.
    - Fixed by deferring: `whatsNewAfterUpdateCheck()` returns early when `appReloadArmed ||
      appReloaded`, and is called from the `.finally()` of the load-time `checkForAppUpdate`
      (and directly on localhost / when there is no service worker, which can't reload us). Every
      path in `checkForAppUpdate` that proceeds past "already current" sets `appReloadArmed`
      **before** it resolves, so the guard is reliable; the two early returns leave it false,
      which is precisely when the notice should show.
    - Cost is one manifest fetch of delay before the modal, on a screen that is showing the launch
      gate anyway. **Don't move `maybeShowWhatsNew()` back to the top of startup** — and note this
      is a different bug from the empty-release one above: that one is about *not advancing* the
      record, this one is about *not announcing from a doomed build*. Both guards are needed.

---

## The Bliss guideline matrix (basis for Step-0 automation)

BSI SVG exports are laid out on the standard Bliss guideline matrix. In a 324-unit tall drawing the
guidelines fall at **y = 66** (top of the indicator row), **130** (sky line), **194** (earth line),
**258** (ground line) — a 64-unit band between each, with all geometry snapped to the grid.

**Indicators are the only thing that ever occupies the row above the sky line.** That makes them
identifiable by position alone — bounding box entirely above the sky line — with no glyph
recognition needed. Two consequences worth remembering:

- This removes **all** above-sky-line indicators, not just tense (plural, question and the rest share
  that row). Correct for now; distinguishing them would need shape classification, which the regular
  geometry makes tractable if it's ever wanted. The **one** exception is an indicator added in the
  Create-Graphic dialog, which is identified by its `data-bts-indicator` stamp rather than by geometry
  and is always kept.
- The test must be the **absolute** grid band, not "the topmost element". `bright.svg` proves it: it
  has a "v" indicator at y 66–98 *and* a legitimate intensifier at y 162–225.

Two things that trip up naive implementations:

- **Dots are zero-length lines** (`<line x1="42" x2="42" y1="66" y2="66"/>`), visible only because
  the root sets `stroke-linecap="round"`. Raw `getBBox()` gives them zero area, so bounding boxes
  must be grown by half the stroke width. They can't be blanket-removed as degenerate either —
  `bright.svg` has a legitimate one at the centre of the graphic.
- **Guard on `viewBox`.** Without one there's no way to locate the matrix, and assuming 324 slices at
  an arbitrary height. `stripIndicators` skips such files (and skips any cut that would remove every
  element) rather than guessing.

### Stroke fattening (7 → 11) — and an open size discrepancy

BSI exports draw at ~7 units on the 324 matrix (PowerPoint reports this as 7 pt); manual prep
thickens it to 11. `fattenStrokes()` does this automatically. It is not cosmetic: `bliss.scad` pins
the printed stroke via `scale = target_stroke_mm / svg_stroke_width`, so the SVG's stroke width
really sets the stroke-to-symbol *ratio*, and hence the finished symbol's size.

The same pass also **bakes computed paint into presentation attributes**. BSI files carry paint in a
CSS class (`.pen1`), the legacy files use per-element attributes. Flattening makes BSI input
structurally identical to the form known to work.

### Graphic scale — set by the guideline band (Ken, 2026-07-20)

**The sky-line-to-earth-line band maps to the 24 mm between the symbol's engraved lines**, and the
aspect ratio is preserved from there; the symbol body is then made wide enough to hold the resulting
graphic width. Scale does **not** come from stroke width. The earth line is the deeper engraved line
(y=258, not the mid-guideline at 194), so on the 324 matrix the band is **128 units** and the scale is
a flat **0.1875 mm per matrix unit** (`band_scale_factor` in bliss.scad).

Stroke width governs only the printed line (arm) thickness: 11 units × 0.1875 = **2.06 mm** ("2 mm
arms", matching the SCAD `get.stl` ~1.959 mm — Ken, 2026-07-20).

### Raised-graphic arms and chamfer — physical, not scaled (Ken, 2026-07-20)

`raw_graphic()` scales the SVG in **2D** and then applies its offsets in **physical mm**, so arm width
and chamfer are fixed sizes independent of the band scale. Two bugs this fixed (diagnosed against
`get.stl`, a type-2 original at scale ~0.036):

- The old base `offset(delta=2)` (SVG units, inside the scale) fattened every arm by `2·gsf` per side
  ≈ 0.75 mm, making a 2.06 mm arm print at **2.81 mm**. Removed — the prepped SVG is already a filled
  stroke outline at the right width, so the body has vertical walls with no growth. (Confirmed: overall
  graphic width drops exactly 4·0.1875 = 0.76 mm.)
- The chamfer stepped `offset(-2)→offset(-5)` = 3 SVG units × `gsf` = **0.56 mm** per step. Now a
  fixed `chamfer_step = 0.1 mm` in *and* up per step (a 45° bevel, two steps), applied as `offset`
  outside the 2D scale. Z span stays 0..6.2 so the placement math in `graphic()` is unchanged.

The old rule scaled all three (arm, base margin, chamfer) by the type factor together; it looked right
only because that factor happened to be tiny (0.036). Our band scale is ~5× larger, so anything in SVG
units ballooned ~5×. Keep offsets that must be a fixed physical size **outside** the 2D `scale()`.

⚠️ **`bliss.scad` is read once, when the folder is opened**, into the in-memory `SCAD_TEXT`, so
editing it requires **reconnecting the folder** (or reloading `app.html` and re-opening) to take
effect — a re-render alone reuses `SCAD_TEXT`. The read is straight from the folder handle (no HTTP
⚠️ **Never hard-reload on the RETIRING address (`volksswitch.github.io/bliss-tactile-symbols-web/`)
during the migration rehearsal.** It bypasses the service worker, and on a test client that is
the one action that can destroy the state the test depends on — and those client states are
one-shot (see `ORIGIN-MIGRATION-STATE.md` §14 and the before-state record). Hard-reloading on
localhost or on `bts.volksswitch.org` is fine. In the app itself the user-facing advice is gone:
Settings → Preferences has **"Reload the app cleanly"**, which migrates first if a move is due and
only then clears caches — clearing them first would remove the very thing that carries the
hand-over.

cache in play), but the reload of `app.html` itself can still be cache-served — hard-reload when
verifying app-code changes.

**OpenSCAD's SVG unit conversion** (measured with a 200-unit line at scale 1):

| width/height declaration | mm per user unit |
|---|---|
| `400` (unitless) + viewBox | 0.35278 (72 dpi fallback) |
| `400mm` + viewBox | 1.00000 |
| `4.1667in` + viewBox | 0.26458 |
| absent, viewBox only | 0.35278 (72 dpi fallback) |

The importer maps the viewBox across the physical width/height when they carry real units, else falls
back to 72 dpi. A raw BSI export (324 units over `height="4.5in"`) is therefore **1 unit = 1 point** —
which is exactly why PowerPoint reports the stroke as "7 pt". `normalizeUnits()` rewrites width/height
as mm equal to the viewBox so the import is pinned at 1 mm/unit and `svg_mm_per_unit` is 1.
`preserveAspectRatio="none"` was tested and makes no difference.

Verification: `brain_injury.svg` = 298 units wide → 298 × 0.375 + 1.5 (the `offset(delta=2)` grow,
scaled) = 113.25 mm predicted, 113.25 mm measured.

⚠️ The `.scad`/`.json`/SVGs are now read from the **user's connected folder** (File System Access),
not fetched from the app's origin, so there's no `cache:'no-store'` fetch to worry about any more —
but the same stale-geometry trap applies if `SCAD_TEXT` isn't refreshed: reconnect the folder after
editing the `.scad`. (Historical: a cached fetch once made a graphic scale by `1.807/50.4167`, the
old stroke formula at its default — the read-from-handle model removes that failure mode.)

### Graphic registration

`import(center=true)` anchors on the **content bounding box**, not the viewBox, so a symbol is
otherwise centred on its own ink and its guidelines miss the engraved ones. `registrationOffset()`
measures the signed distance from the ink centre up to the guideline-band centre and passes it as
`graphic_registration_offset` (SVG units, scaled with the graphic in `graphic()`).

After `center=true`, SVG `y_s` lands at `y_o = (Cy − y_s)·scale` (the import flips Y), so shifting by
`(bandCentre − Cy)` puts the sky line at +12 mm and the earth line at −12 mm. Verified: ink spanning
y 130–258 gives yMax 14.81 (predicted 14.81) and yMid −12.00; `broken,injured,damaged`, whose ink sits
entirely between earth and ground, offsets −64 units and correctly sits *below* the earth line.

This replaced **`slide_Bliss_graphic_vertically`**, which existed only to hand-correct the
misplacement now computed (Ken, 2026-07-20) — the parameter is deleted.

### Stroke to outline (`strokeToOutline`)

Converts every stroked element into a **filled** path tracing that stroke's outline (like Inkscape's
"Stroke to Path"), so the finished SVG has no strokes left and the importer's stroke handling stops
mattering. This fixes two importer defects at once:

- **`<circle>`/`<ellipse>` strokes were ignored** — imported as filled discs. Probe: a circle at
  stroke 6 vs 30 rendered byte-identically; a line at those widths did not. So `bright.svg`'s
  concentric circles merged into one blob.
- **Open `<path>` arcs were filled as chord regions** — `brain_injury.svg`'s semicircular head was
  clipped to its centreline radius instead of stroked out to radius + half-stroke.

Method: sample each centreline with the browser's `getPointAtLength` (works uniformly for
line/circle/ellipse/rect/polygon/polyline/path), offset by ±half-stroke along the normal, and emit a
filled path — round caps for open ends, two nested loops (`fill-rule="evenodd"`, already set on these
files) for closed shapes. Zero-length lines (Bliss dots) become a full cap circle.

Runs in `applyPrep` **after** fattening and **before** unit-normalisation. Stroke width is read for
the log *before* this consumes the strokes. `window.__strokeToOutline` is the test hook;
`window.__raySpans(yFrac)` ray-casts the graphic mesh to distinguish a hollow ring (multiple solid
spans with gaps) from a filled disc (one span).

Verification: outline bbox reproduces the stroked bbox exactly (circle at stroke 6 → [17,17,225,225]
before and after; stroke 30 → [5,5,237,237] both). Through OpenSCAD, `bright.svg`'s graphic went
776 → 19,836 triangles, width 63.57 → 65.63 mm (now includes the circle stroke), and `__raySpans`
shows 5 separated solid spans — concentric rings with real holes, not a disc. Registration still
lands the sky line at +12 mm (yMax 14.81).

### Concept width — derived from the graphic (Ken, 2026-07-20)

The body width is chosen automatically: the **smallest discrete width** (0.25 steps, minimum 1×) whose
body holds the graphic with a **≥ BLISS_MIN_BORDER_MM border on each side** (3 mm — Ken, 2026-07-20;
5 mm was too generous and tipped common-width graphics up a step). The user no longer picks it. **The
graphic's aspect ratio is never touched** — only the body changes; the graphic scale stays fixed by
the band mapping.

Border is measured to the **ink** (the stroke outline), not the rendered mesh: `raw_graphic()` grows
the import by `offset(delta=2)` (~0.75 mm each side of margin), and counting that pushed `acquiring`
from bcw 1 to 1.25. `graphicInkWidthMm()` measures the prepped SVG's content bbox (all filled paths,
so getBBox is exact — `bboxInRootUnits` skips stroke padding when `stroke:none`) and scales by
`graphic_scale_factor`.

The body half-width is `18·bcw·rm` (bliss.scad `shape()`), the graphic is centred on x=0, and both sit
inside the same resize scale `rm`, so the constraint is `18·bcw·rm ≥ inkWidth/2 + b`, i.e.
`bcw ≥ (inkWidth + 2b) / (36·rm)`, rounded up to the next 0.25 and floored at 1. The border `b` is
absolute, hence the `/rm`.

Mechanism: `Bliss_concept_width` is app-managed (hidden); the app sets **`concept_width_override`**
(bliss.scad: `bcw = concept_width_override>0 ? concept_width_override : <dropdown ladder>`; 0 keeps the
dropdown for standalone OpenSCAD). Because ink width comes from the SVG (no mesh needed), `runRender`
computes `bcw` **before** rendering, so both passes use it in a single pass (no re-render).
`pv('resize_symbol_height_width')` supplies `rm`; the graphic scale is the band scale, full stop.

**`graphic_size_override` is deleted** (Ken, 2026-07-20). It was a ±50–200 % fudge on
`graphic_scale_factor`, so its only function was to break the band mapping that makes the symbol
correct — and because the app feeds the same factor into `graphicInkWidthMm`, changing it silently
moved the auto concept width too. `graphic_scale_factor = band_scale_factor` now. Pruned from the one
preset (`afraid`) that carried it.

Verified (3 mm border): acquiring 26 mm ink → 36 mm (1×); broken → 36 mm (1×); bright → 45 mm (1.25×);
brain_injury 56 mm → 63 mm (1.75×). Each the smallest step that keeps ≥3 mm. Body width is `bcw·36`.

⚠️ Note the top-arc `top_len` table in `shape()` only has entries to `bcw==3`; beyond that it uses the
`34.8` default. Pre-existing (the dropdown went to 4 with no table past 3); only affects the "⁀ noun"
rounded top on very wide symbols.

⚠️ The legacy SVGs shipped in the `SVG files/` set were manually — and *inconsistently* — prepped in
PowerPoint. **They are not official Bliss graphics and are not a validation corpus for Step-0 logic.**
They happen to carry no `viewBox`, so the guard above passes them through untouched. Validate
Step-0 work against BSI-native exports, which Ken supplies — don't go hunting for a folder of them.

## Running the app locally

```bat
server.bat         :: starts python -m http.server 8000 (own window) and opens the landing page
:: opens http://localhost:8000/ — pick Symbols or Tiles (or go straight to
:: http://localhost:8000/symbols/ or /tiles/)
```

`file://` will not work — openscad-wasm and the File System Access API both require a secure origin
(localhost qualifies). `server.bat` prefers `python` and falls back to `py`; the server runs in its
own window (close it to stop). On launch each app shows the **launch gate** — click **Open folder…**
and pick a **provisioned folder** — one holding the app's `.scad`, its `.json`, and its SVG folder
(`Bliss SVG files` / `Basic SVG files`), i.e. what a user gets from the website ZIP (Ken's
`…/Desktop/Bliss Tactile Symbols/` is one). Grant read/write.
⚠️ Not this repo and not the scad repo: neither carries the `.json`/SVGs, so the concept list and
graphic picker would come up empty. The folder is remembered in IndexedDB, so later runs just need one
click to reconnect. When hosted, the user opens their own downloaded copy. **Chrome/Edge only** (FSA API).

---

## Testing / verification notes

- The desktop OpenSCAD CLI (`C:\Program Files\OpenSCAD\openscad.exe`, v2021.01) uses **CGAL** and is
  slow (offset-heavy Bliss renders take minutes) — fine for one-off ground-truth bounding-box
  checks, not for iteration. The app's WASM build has **Manifold**, which is ~100× faster.
- **The in-app browser `computer screenshot` tool times out on this WebGL page** — a tool
  limitation, not an app bug. The page is fully responsive: use `get_page_text` and
  `javascript_tool` (both return instantly), or the `window.__captureViewportPNG()` hook (capture a
  downscaled JPEG to keep the payload small).
- To drive the file input from a test, build a `File`, set `input.files` via `DataTransfer`, and
  dispatch a `change` event.

---

## Scope decisions (Ken, 2026-07-19)

1. **Start at scope (a):** the app consumes already-prepped SVGs and replaces Steps 1+2, auto-
   handling scale. Step 0 stays upstream in PowerPoint for now, but Ken expects this to expand —
   keep `svg_stroke_width`/`svg_path` app-managed so a Step-0 assist layer can bolt on later.
2. **SVG-only:** do NOT bundle the 242 pre-baked "core concept" STLs as a library.
3. **Mirror the keyguard app exactly:** single `app.html`, vendored openscad-wasm + Three.js, no
   build step.

---

## Project file structure

```
BTS web app/
├── CLAUDE.md          ← This file
├── README.md          ← Human-facing overview (both apps)
├── index.html         ← Landing page: chooser linking to ./symbols/ and ./tiles/
├── server.bat         ← Starts the server (python http.server 8000) and opens the landing page
├── RELEASING.md       ← Release process for both apps (see the trigger-phrase table there)
├── shared/
│   ├── bts-core.js    ← The engine (formerly app.html's inline module); reads window.APP_CONFIG
│   ├── bts.css        ← Shared styles (formerly app.html's <style>)
│   └── app-body.html  ← Shared body markup, injected by each shell at boot
├── symbols/           ← Bliss Tactile Symbols app (thin shell)
│   ├── index.html     ← Sets window.APP_CONFIG, injects shared markup, imports the engine
│   ├── sw.js          ← Service worker (scope /symbols/, CACHE_NAME bts-symbols-vN)
│   ├── manifest.webmanifest · latest_app_version.json · CHANGELOG.md
├── tiles/             ← Bliss Tiles and Puzzles app (same shape as symbols/)
├── scripts/           ← apply-release-notes.mjs (both apps), publish-app-version.mjs <app>
├── favicon.svg        ← landing-page mark only
├── icons/             ← per-app icon sets, see "App icons — the Volksswitch standard"
│                        <app>.svg · <app>-maskable.svg · <app>-{192,512,maskable-512}.png
├── openscad-wasm/     ← Vendored openscad-wasm v0.0.4 (single-threaded, embedded wasm) — shared
└── vendor/three/      ← Vendored Three.js + TrackballControls + STLLoader — shared
```

Only the **app shells + shared engine** are hosted in this repo. The **separate** `Volksswitch/bliss-tactile-symbols`
repo (released independently; see the change-control note above) is the canonical source for the
symbol designer `.scad` (+ `latest_scad_version.json`, `SCAD-CHANGELOG.md`, `publish-scad-version.mjs`)
— and **only** those. The starter presets `.json` + `SVG files/` are the *provisioning bundle* Ken's
website serves as a ZIP to new users; they are maintained there, not in any repo, and copies were
deleted from the scad repo on 2026-07-22 so nothing could drift against the website's. Only the
`.scad` auto-updates; the `.json`/SVGs become the user's own after provisioning. At runtime the app
reads all of these from the user's **connected folder**, never from a repo (except the
`.scad`/manifest it fetches for updates).

---

## App icons — the Volksswitch standard (Ken, 2026-08-16)

**White glyph on a BLACK plate means "this app is served from its own volksswitch.org
subdomain."** Ken set this as the house standard while moving BTS/BTP to
`bts.volksswitch.org`. Conversant is already white-on-black and already domain-based, so it
already conforms; the keyguard designer (white on light green) converts **when it migrates**.

- **Why black and white specifically:** they match the Volksswitch website's own scheme, and
  — Ken's point — **black and white are the only colors that stay visible against any
  desktop color scheme.** A tinted plate can disappear into someone's wallpaper or taskbar.
- **Why this replaced the earlier idea of "mark the OLD app."** During a migration a user
  can end up with two icons, same name, same artwork — one pointing at the retired address.
  Marking the *old* one would have required Chrome to update an already-installed app's icon
  from a changed manifest, which is unreliable and would have needed a sandbox test. Marking
  the **new** one needs no update mechanism at all, because the new app is always installed
  fresh. It also stops being a "migration mark" the moment everything has migrated — it is
  simply the brand.
- **Not a scar on the permanent app:** the end state is white-on-black everywhere, so the
  green plates are the transitional oddity, not the black ones.

### What every app ships

```
icons/
  <app>.svg                    rounded plate (rx ≈ 0.1875 × side), the app's own glyph
                               — this is the app's favicon AND the source for the PNGs
  <app>-maskable.svg           FULL-BLEED plate, no rounded corners; glyph scaled to 80%
                               about centre so a platform crop cannot clip it
  <app>-192.png                from <app>.svg
  <app>-512.png                from <app>.svg
  <app>-maskable-512.png       from <app>-maskable.svg
```

- Flat naming, `icons/<app>-<size>.png`. Sources and PNGs sit together in `icons/`.
- Root `favicon.svg` is the **landing page's** mark only (currently the Symbols glyph).
- **Each app keeps its OWN glyph** — Symbols is the Blissymbol for "all" (square + both
  diagonals), Tiles is the Blissymbol face. The plate color says *which origin*; the glyph
  says *which app*. Both distinctions are needed at once.
- **The maskable variant is not optional.** Android crops icons to its own shape, so a
  rounded-plate icon gets its corners cut twice and the glyph can be clipped. Tiles shipped
  without one until 2026-08-16 and rendered worse than Symbols on some platforms.

### Regenerating the PNGs

`.svg` is the source of truth — edit it, then re-render. ImageMagick is installed; there is
no cairosvg/rsvg on this machine:

```bash
magick -background none icons/<app>.svg          -resize 192x192 icons/<app>-192.png
magick -background none icons/<app>.svg          -resize 512x512 icons/<app>-512.png
magick -background none icons/<app>-maskable.svg -resize 512x512 icons/<app>-maskable-512.png
```

### The title bar matches the icon

`theme_color` in each `manifest.webmanifest` **and** `<meta name="theme-color">` in each
shell (plus the root landing page) are **`#000000`**, so an installed app's window frame
matches its icon. A black icon opening a green-framed window reads as a mismatch.

⚠️ **The app's INTERIOR accent is a different thing and stays teal.** `--accent: #2b8a80`
in `shared/bts.css` and the landing page is UI styling, not identity — changing the icon
scheme must not restyle the app. Ken asked for icons; the interior was deliberately left.

## Working conventions

- **American English everywhere** (Ken, 2026-07-23). All new text — UI strings, code comments,
  `CHANGELOG.md` bullets, this file, and anything Claude writes in chat — uses American spelling
  ("color", "center", "behavior", "normalize"). Existing British spellings scattered through the
  older comments and docs are left alone unless the surrounding text is being rewritten anyway;
  don't open a sweep just to respell them.
- **No point scoring and no attitude!** (Ken, 2026-07-21.) When Ken overrules a suggestion, that
  is the end of it — do not revisit it, do not justify the earlier position, and do not comment on
  whether a later request vindicates it. An instruction is not a proposal to be assessed: carry it
  out. Concretely, this rule was written after "Now there's something to ship" was used to reassert
  an objection Ken had already overruled.
- **Decisions go in `CLAUDE.md`, never in Claude's memory** (Ken, 2026-07-21). This file is in the
  repo and therefore syncs across machines (OneDrive + git); Claude's memory directory is local to
  one machine, so anything recorded there is invisible from every other machine and silently
  drifts out of date. When Ken makes a call — scope, conventions, geometry choices, process — write
  it **here**, in the section it belongs to, and cite him with the date as the existing entries do.
  Do not save it as a memory instead of, or in addition to, this file.
- The app lives entirely in `app.html` + `bliss.scad`. No build step, no bundler. Do not add deps
  that require a build — it must stay servable by a plain `python -m http.server`.
- `bliss.scad` is the single source of truth for both geometry and the Customizer form. Change a
  parameter there and the UI follows.
- Keep `bliss.scad` standalone-usable in desktop OpenSCAD (set `svg_path` to a real file).
