# Bliss 3D-Printing Tools (web)

Two browser tools that turn a prepped **Blissymbol SVG** into a 3D-printable object — right in your
browser. No OpenSCAD install, no command line. Runs in Chrome or Edge.

- **Bliss Tactile Symbols** (`symbols/`) — turn a prepped Blissymbol SVG into a finished, 3D-printable
  tactile symbol. Combines two Volksswitch OpenSCAD programs (the *Bliss Tactile Symbols* designer and
  the *Bliss Graphic STL maker*) into one; you bring an SVG, it produces the STL in a single step.
- **Bliss Tiles and Puzzles** (`tiles/`) — build remedial and motivational tools for your Bliss
  Tactile Symbols.

Both apps are one shared engine (`shared/bts-core.js`) pointed at a different designer `.scad`; each
is a thin shell (`<app>/index.html`) that supplies its own configuration. See `CLAUDE.md`.

## Run it

1. Double-click **`server.bat`** — it starts a local server and opens the landing page
   (http://localhost:8000/). A separate server window opens; close it to stop the server.
2. Pick an app from the landing page.
3. On launch, **Open** the shared folder that holds the designer files (its `.scad`s, `.json`s, and
   the `Bliss SVG files` / `Basic SVG files` folders). The app remembers it next time.
4. Pick a graphic, adjust the settings on the left, and **Export STL** (saved into your folder).

> It must be served over http — opening the files directly as `file://` will not work (openscad-wasm
> and the File System Access API both need a secure origin; localhost qualifies).
> If nothing opens, make sure Python is installed and on your PATH.

## What the Symbols app does

- Takes a **prepped** Blissymbol SVG (stroke-based line art) as direct input.
- **Auto-scales** the graphic from the Bliss guideline matrix — no choosing a "type1/type2" scale
  factor by hand.
- Builds the full tactile symbol: grammatical top-edge shape, earth/sky lines, engraved text, ASCII
  Braille, string hole, RFID pocket, magnets, and Velcro recesses.
- Live 3D preview, two-colour preview, and one-click **STL** / two-colour STL / PNG export.

## Preparing SVGs

The apps expect an SVG already prepared for tactile printing (thick strokes, closed shapes, and enough
spacing that elements don't merge when the stroke is fattened). Some of that preparation is now done
in-app; the rest is currently done outside the tool.

## License

Public domain (CC0) — Volksswitch, www.volksswitch.org.
