# Bliss Tactile Symbol Designer (web) — Claude Code Context

## What this project is

A browser-based tool that lets a user turn a prepped **Blissymbol SVG** directly into a
finished, 3D-printable **tactile symbol STL** — in one step, entirely in Chrome or Edge, with no
OpenSCAD install and no command line. It merges two public-domain Volksswitch OpenSCAD programs
(the *Bliss Tactile Symbols* designer and the *Bliss Graphic STL maker*) into a single combined
`bliss.scad`, and wraps it in a single-file web app modeled on the keyguard designer.

**Author:** Volksswitch (www.volksswitch.org) — released to the public domain (CC0)

## The only two folders in play

Development touches **exactly two** folders. Nothing else on the machine is part of this work —
do not read from, write to, or reason about any other path, and do not go looking for one.

| Folder | What it is |
|---|---|
| `BTS web app/` | This repo — the app shell (`app.html`, `sw.js`, vendored deps, change control). |
| `bliss-tactile-symbols/` | The separate repo — canonical `.scad` + `latest_scad_version.json` only. Released independently; see below. The starter `.json` / `SVG files/` are **not** there (deleted 2026-07-22): they ship as a ZIP from the Volksswitch website, so there is no local corpus of concepts or Blissymbols to consult. |

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
  - **Model — append-only, per-element indicator, create-only.** Whole symbols placed side by side on
    the shared 324 matrix; **no stacking/superimposition, no sub-element extraction, no free positioning**
    (Ken confirmed append-only twice). An indicator is a property of a *particular* component (Bliss
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
  `RELEASING.md` + `publish-scad-version.mjs`. **Two trigger phrases, and the shorter one is a prefix
  of the longer — read to the end before acting** (Ken, 2026-07-23): **"bump bts"** releases the
  `.scad` from the scad repo; **"bump bts web app"** releases this app. Test hooks:
  `window.__parseScadVersion`, `window.__showScadUpdateModal`.

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
server.bat         :: starts python -m http.server 8000 (own window) and opens the app
:: opens http://localhost:8000/app.html in the default browser
```

`file://` will not work — openscad-wasm and the File System Access API both require a secure origin
(localhost qualifies). `server.bat` prefers `python` and falls back to `py`; the server runs in its
own window (close it to stop). On launch the app shows the **launch gate** — click **Open folder…**
and pick a **provisioned folder** — one holding a `.scad`, its `.json`, and `SVG files/`, i.e. what a
user gets from the website ZIP (Ken's `…/Desktop/Bliss Tactile Symbols/` is one). Grant read/write.
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
├── README.md          ← Short human-facing overview
├── app.html           ← The entire app (single HTML file with inline ES module)
├── index.html         ← Redirect stub so the GitHub Pages site root opens app.html
├── server.bat         ← Starts the server (python http.server 8000) and opens the app
├── sw.js              ← Service worker (offline shell + app self-update); CACHE_NAME bumped at release
├── latest_app_version.json   ← App self-update manifest (app_release)
├── CHANGELOG.md       ← App user-facing changes (source of the bundled "What's new" notes)
├── RELEASING.md       ← App release process (trigger: "bump bts web app")
├── scripts/           ← apply-release-notes.mjs, publish-app-version.mjs
├── openscad-wasm/     ← Vendored openscad-wasm v0.0.4 (single-threaded, embedded wasm)
└── vendor/three/      ← Vendored Three.js + OrbitControls + STLLoader
```

Only the **app shell** is hosted in this repo. The **separate** `Volksswitch/bliss-tactile-symbols`
repo (released independently; see the change-control note above) is the canonical source for the
symbol designer `.scad` (+ `latest_scad_version.json`, `SCAD-CHANGELOG.md`, `publish-scad-version.mjs`)
— and **only** those. The starter presets `.json` + `SVG files/` are the *provisioning bundle* Ken's
website serves as a ZIP to new users; they are maintained there, not in any repo, and copies were
deleted from the scad repo on 2026-07-22 so nothing could drift against the website's. Only the
`.scad` auto-updates; the `.json`/SVGs become the user's own after provisioning. At runtime the app
reads all of these from the user's **connected folder**, never from a repo (except the
`.scad`/manifest it fetches for updates).

---

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
