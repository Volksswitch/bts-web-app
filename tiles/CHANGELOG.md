# Changelog — Bliss Tiles and Puzzles web app

User-facing changes, newest first. Each bullet is written the way a user reads it
(not engineering language). This file is the single source of truth for the in-app
"What's new" notice — after any edit here, regenerate the bundled notes with
`node scripts/apply-release-notes.mjs`. See RELEASING.md for the full process.

## Unreleased (next release)

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
