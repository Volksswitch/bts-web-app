# Changelog — Bliss Tactile Symbol Designer web app

User-facing changes, newest first. Each bullet is written the way a user reads it
(not engineering language). This file is the single source of truth for the in-app
"What's new" notice — after any edit here, regenerate the bundled notes with
`node scripts/apply-release-notes.mjs`. See RELEASING.md for the full process.

## Unreleased (next release)

## Release 14

- "Create a graphic" now deals with the indicators your components were drawn
  with, so your own indicator no longer lands on top of one. Tick ×, past or
  future on a component and it replaces that component's built-in indicator
  rather than sitting on it. There is also a new "Remove Bliss indicators the
  components came with" tick box in the dialog, on by default, which takes them
  off the other components too. The preview shows exactly what gets saved. Your
  original symbol files are untouched — the new graphic is saved under its own
  name.

## Release 13

- "Remove Bliss Indicators" no longer removes an indicator you added yourself. It
  now takes off only the indicator that came built into the BCI graphic, and
  leaves anything you ticked on in "Create a graphic" in place. Before, both were
  removed together — so if the graphic already carried an indicator, adding your
  own put two marks in the same spot and then lost them both.

## Release 12

- "Create a graphic" can now put a past or future indicator over a component, not
  just a plural one. Each component in the dialog has three tick boxes — ×, past
  and future — and a component carries one indicator at a time, so ticking one
  clears the others. The past and future marks are the standard Blissymbolics
  characters: a shallow bow in the indicator row, curving to the right for past
  and to the left for future.

## Release 11

## Release 10

- The app only ever touches "Bliss Tactile Symbols.json". You can now keep extra
  copies of your concepts file in the same folder — "Bliss Tactile Symbols -
  Copy.json", a dated backup, anything — and the app will leave them completely
  alone. It reads and saves concepts only in the file whose name matches your
  symbol designer file. Before, the app used whichever .json the folder happened
  to list first, so a backup copy could quietly become the file your saves went
  to while the real one never changed — and you would only find out the next time
  you opened the app. The startup log now names the concepts file it is using and
  lists any other .json files it is ignoring.

## Release 9

- You find out about a lost save while you are still working, not at the end.
  Every save now re-reads your concepts file — before writing, to be sure the
  file is still the one it last wrote, and again just after — and it re-checks
  once more a few seconds later and whenever you switch concepts. If anything
  has rewritten the file behind the app's back (OneDrive syncing your folder, or
  a second copy of the app open on the same folder), you get a message there and
  then and the concept goes back to being marked unsaved, so pressing Save again
  is all it takes. There is nothing new to click and nothing to remember to run.

- A save can no longer wipe out work done in another window. If your concepts
  file has changed since the app last wrote it, Save stops and tells you instead
  of overwriting it with what this window happens to be holding.

## Release 8

- Saving a concept now tells you when it didn't work. Save writes your concepts
  file and then reads it back to confirm the change actually arrived; if it
  didn't, you get a message saying so. Until now a failed save left the concept
  looking saved for the rest of the session — it kept its graphic, and switched,
  rendered and exported normally — and the change was only missing the next time
  you started the app. The concept is now left marked as unsaved so you can try
  again, and the same check covers creating, renaming and deleting a concept.
  The app also re-checks a moment after saving and warns you if something outside
  it — OneDrive syncing your folder, or a second copy of the app open on the same
  folder — overwrote what you just saved.

## Release 7

- The graphic picker always shows what is in your folder right now. Pressing Open
  or Change re-reads the SVG files folder each time, so a graphic added since you
  started the app — by the Create dialog or by you, outside the browser — is in the
  list straight away, with no reload.

- Exporting tells you where the file went. The message under the 3D view now names
  the folder — "Exported afraid.stl to the Bliss Tactile Symbols folder" — instead
  of just saying "the folder". The picture (PNG) export says the same.

- Deleting a concept leaves you on the starting point. The Concepts box used to go
  blank while the settings on screen still belonged to the concept you had just
  deleted. It now loads "design default values", so what you see is a real,
  complete set of settings you can build the next concept from.

## Release 6

- Build your own graphics from existing ones. A new Create button (next to
  Settings, below the viewport) opens a dialog where you can string existing Bliss
  graphics together left to right — for example "1" then "0" to make "10" — and
  optionally place a plural mark (×) over any one of them. The result is drawn in
  2D as you build it, with the Bliss guidelines shown for reference; give it a name
  and save it, and it drops into your SVG files folder so you can pick it in
  Graphic File just like the graphics that came with the app.

- Concepts no longer inherit settings from each other. Choosing a concept now sets
  every setting, not just the ones that concept saved: anything it doesn't mention
  goes back to the symbol designer file's default instead of keeping the value left
  behind by the concept you had open before. A concept now looks the same however
  you arrive at it. (Most of the supplied concepts don't save every setting, so this
  is noticeable — switching between them no longer carries over things like the
  velcro mounts, the earth and sky lines, or where the braille sits.)

- A known starting point in the Concepts list. The list now opens with "design
  default values", the same entry the desktop Customizer offers. Choosing it sets
  every setting back to the symbol designer file's own defaults and clears the
  graphic, so you can start a new concept from a known place instead of from
  whatever the last concept left behind. It is built in rather than saved in your
  concepts file, so it is always there and cannot be renamed, deleted, or saved
  over — pressing Save after choosing it asks for a name for a new concept.

## Release 5

- Two-colour printing. A second, multi-coloured STL button in the button bar saves
  the symbol as two files — "<name> - body.stl" and "<name> - graphic.stl" — so the
  raised graphic can be printed in a different colour from the body. In your slicer,
  load the body file first, then right-click it and choose Add Part → Load… and pick
  the graphic file — it drops into place at the right height automatically, and you
  can then give each part its own filament (or use a filament change part-way through
  the print). Load the body first: opening both files together puts the graphic in
  the wrong place. The original single-file STL button is unchanged.

## Release 4

- A button bar under the 3D view. The view buttons have moved out of the corner of
  the 3D view into a bar along the bottom, and are half again as large. Next to them
  are buttons to export the STL and to save a picture of the 3D view as a PNG file,
  both saved into your folder. The Export STL button stays lit while the export runs
  and chimes when it finishes.
- A Settings panel. The gear button at the right-hand end of the button bar opens
  Settings, which starts with an About tab showing the app release, the version of
  the symbol designer program in your folder, the license, and where the tool comes
  from. More settings will be added here over time.
- The grey title bar at the top of the page is gone, giving the 3D view more room.
  The app release number it used to show now lives in Settings → About.

## Release 3

- You can now install the designer as an app. In Chrome or Edge an install button
  appears at the right-hand end of the address bar; installing gives it its own
  window and a desktop/Start-menu icon, with no browser tabs or address bar. It is
  the same app either way — your folder, concepts and files are unchanged.

## Release 2

- The app keeps your symbol designer file up to date. When you open your folder, if a
  newer version of the symbol designer program has been published, the app offers to
  download it and replace your local copy — keeping your saved concepts. You can update
  now, be reminded in a week, or skip. The notice lists what changed so you can decide.

## Release 1

- First release of the Bliss Tactile Symbol Designer web app. Turn a prepped
  Blissymbol SVG into a finished, 3D-printable tactile symbol STL entirely in
  Chrome or Edge — no OpenSCAD install and no command line.
