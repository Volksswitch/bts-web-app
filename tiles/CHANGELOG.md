# Changelog — Bliss Tiles and Puzzles web app

User-facing changes, newest first. Each bullet is written the way a user reads it
(not engineering language). This file is the single source of truth for the in-app
"What's new" notice — after any edit here, regenerate the bundled notes with
`node scripts/apply-release-notes.mjs`. See RELEASING.md for the full process.

## Unreleased (next release)

## Release 22

- What's new now always appears after the app updates itself. The setting that let
  you switch it off has been removed — an update is worth a moment of your time,
  and it is the only place the app tells you what changed.
- The button that starts the app fresh is now simply called “Reload the app”, and
  it is the one to use whenever the app looks wrong or seems stuck. You do not
  need to know anything about refreshing, or about clearing your browser.
- The app no longer carries the machinery that moved it to its new web address.
  That move is finished, so the reminder bar asking you to save your settings, and
  the hand-over that ran when you arrived, have both been retired. Loading a saved
  settings file is unchanged and still offered when the app has nothing stored.

## Release 21

- Your saved copy of your settings now goes into your folder, beside your concepts
  and graphics, instead of into your downloads. It always uses the same name and
  saving again replaces it, so there is only ever one copy and it is the current
  one. "Load saved settings" looks there first and simply loads it; only if it is
  not there are you asked to find it.

## Release 20

- A second test of the update system for Bliss Tiles and Puzzles, to check that
  this app shows its own notice with its own release number. Nothing about
  designing tiles or puzzles has changed.

## Release 19

- A test of the update system: this release exists only to check that Bliss Tiles
  and Puzzles updates itself and shows its own notes, separately from Bliss
  Tactile Symbols. Nothing about designing tiles or puzzles has changed.

## Release 18

- Fixed, important: saving a copy of your settings, and the move to the new web
  address, could pick up information belonging to OTHER Volksswitch apps that
  share the same web address — including private details and an access key.
  Both now handle only this app's own settings and nothing else. If you saved a
  settings file before today, delete it and save a fresh one.

## Release 17

- If the app ever opens with no settings at all — on a new computer, or after
  your browser has been cleared — it now offers to load a saved settings file
  right there on the opening screen, instead of quietly starting from scratch.


## Release 16

- If the app ever seems stuck on an old version, Settings → Preferences now has
  “Reload the app cleanly”. Use that rather than a hard refresh — a hard refresh
  skips past the app entirely and can lose your settings. The old advice to press
  Ctrl-Shift-R has been removed.

- Groundwork for the app's move to a new web address. This release cannot move
  anyone — it only teaches the app how, and it stays switched off until the
  new address is ready. When it does happen you will be asked to open your
  folder once more, because permission to read a folder cannot follow the app
  to a new address. Your concepts and graphics are in that folder and are not
  affected. Your settings come across with you.

## Release 15

- New Preferences tab in Settings, with two things in it. You can turn off the
  “What’s new” notice that appears after the app updates itself. And you can
  now save a copy of your settings to a file, and load a saved copy back.

- Why saving a copy is worth doing: your settings are kept by your browser
  against this app’s web address. They are not in your folder with your
  concepts and graphics, so they do not travel when you move to another
  computer, and they are lost if the browser is ever cleared. A saved copy
  covers both. It also covers both apps at once — a copy saved from either
  one restores the settings for both.

## Release 14

- New app icon: a white symbol on a black background, matching the
  Volksswitch website. Black and white stay visible whatever colors you
  have chosen for your desktop. The window's title bar now matches the
  icon. Each app keeps its own picture, so they are still easy to tell
  apart from one another.

## Release 13

- Updates are now more reliable. The app used to look up its version information
  on GitHub — a site some school and workplace networks block outright, and one
  that could briefly disagree with the app itself just after a release. It now
  reads that information from its own web address, so it always matches the app
  you are actually running, and it keeps working on networks that block GitHub.

## Release 12

- "Slot Gap" is now set in millimeters, to a tenth of a millimeter, instead of in
  tenths of a millimeter — so a 0.4 mm gap is typed as 0.4 rather than 4. Your
  concepts file has been converted, so the gaps your saved concepts print are
  unchanged. "Move Lines Vertically" has been removed. (Needs version 7 or later
  of the tile and puzzle designer file.)

- Fixed: the "What's new" notice could go missing on the very update it was meant
  to describe, leaving you with nothing but the start page appearing twice. The
  app was putting the notice up on the old build, a moment before the update
  reloaded the page — so the notice was swept away, and it counted as read. It
  now waits until the app has finished checking for an update, and appears on the
  new build.

## Release 11

- Tile graphics line up with their targets. A graphic on a tile now sits in the
  middle of the tile from side to side, and a target graphic in the middle of its
  column, so a tile sits directly below its target whatever the graphic is. Up and
  down is unchanged — a graphic still sits at its proper height against the sky
  and earth lines. (Needs version 6 or later of the tile and puzzle designer file.)

## Release 10

- Reset is now a button, next to Save under the Concepts box. It arrived in the
  last release as a line inside the Concepts list that only appeared once you had
  changed something, which made it hard to find. It now sits beside Save and is
  always in view, greyed until there is something to discard — Save keeps your
  changes, Reset throws them away.

## Release 9

- New "Reset" in the Concepts list — throw away unsaved changes. As soon as you
  change anything, "● unsaved" appears and a "↺ Reset — discard unsaved changes"
  line appears at the top of the Concepts list. Choosing it puts every setting,
  including the graphic, back the way it was when you last opened or saved the
  concept, and the list goes back to normal. With no concept chosen it goes back
  to the designer file's own defaults.

- Fixed: several concepts failed with "Render failed: render returned code 1".
  Any concept with the target graphics switched off — the "no targets" ones —
  leaves nothing raised to draw, and the app was treating "nothing to draw" as a
  failure instead of simply drawing the base on its own.
- "Split a graphic into components" now opens with no symbol chosen. It used to
  still show the name of the symbol you split last time, even though the list of
  components below it was empty.

## Release 8

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
