# Changelog — Bliss Tiles and Puzzles web app

User-facing changes, newest first. Each bullet is written the way a user reads it
(not engineering language). This file is the single source of truth for the in-app
"What's new" notice — after any edit here, regenerate the bundled notes with
`node scripts/apply-release-notes.mjs`. See RELEASING.md for the full process.

## Unreleased (next release)

- "Create a graphic" can now stack components as well as place them side by side.
  Tick "over" on a component and it is superimposed on the one to its left instead
  of sitting next to it — centered on it, and keeping its own height on the Bliss
  guidelines. Useful for the compounds where one symbol goes inside or over another.

## Release 7

- Tile and puzzle graphics are now placed by the Bliss guidelines instead of being
  centered on their own ink, so a graphic lands where it belongs relative to the sky
  and earth lines a tile can be engraved with. A component split out of a symbol now
  keeps the exact place it had in the whole symbol — the upright of "arm" sits at the
  left, not in the middle — and a set of components fits back together. Note that
  this changes where existing tile graphics sit, and that a graphic now needs a tile
  tall enough for the full sky-to-earth band. (Needs version 4 or later of the tile
  and puzzle designer file.)
- Fixed: a release could go by without its "What's new" notice. The app now marks
  a release as read only when it actually had something to show, so an interim build
  with no notes can't quietly swallow the next real one.

## Release 6

- Fixed: the "What's new" notice after an update didn't appear. Both apps share
  one place to remember which release you last saw, so the Bliss Tactile Symbols
  release number was hiding this app's notices. Each app now remembers its own.
  The same applied to the "Remind me in a week" postponement on a designer file
  update — postponing one app's no longer silences the other's.

## Release 5

- New: split a Blissymbol into its components, each saved as its own SVG — the
  building blocks for a tile set. Choose a symbol from your `Bliss SVG files`
  folder and the app offers it broken down in levels: the whole symbol, its
  separate strokes and shapes, and one level further down (a circle's four arcs, a
  shape's individual lines). Tick the pieces you want, name them, and save them
  into `Basic SVG files` or `Puzzle SVG files`. "eye" comes apart into a circle, a
  dot and four arcs. Each piece keeps its place on the Bliss guidelines, so it
  prints at the size that part has on the whole symbol and a set of pieces fits
  back together.

## Release 4

- Fixed: a number you type into a field and then Save right away is now kept in
  the saved concept. Before, if the typed value hadn't been confirmed yet (with
  Enter or Tab) it could be left out of the save.

## Release 3

- When a render fails, the on-screen message now shows what actually went wrong,
  instead of pointing you to a browser console the app doesn't display.

## Release 2

- Tile and puzzle pieces now take their graphics from your SVG files, sized to
  match how the same graphic appears on a Bliss Tactile Symbol — a graphic at
  100% prints at that official size.
- New two-color export: you can save the base and its raised graphic as separate
  files (`… - body.stl` / `… - graphic.stl`) for a multi-material printer or a
  mid-print filament swap, and the raised graphic now shows in its own color in
  the preview.

## Release 1

- First release of the Bliss Tiles and Puzzles web app. Build remedial and
  motivational tools for your Bliss Tactile Symbols — turn a prepped Blissymbol
  SVG into a 3D-printable tile or puzzle piece entirely in Chrome or Edge, with no
  OpenSCAD install and no command line.
