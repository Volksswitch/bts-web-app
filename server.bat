@echo off
REM Bliss 3D-Printing Tools — start the local web server and open the landing page.
REM openscad-wasm and the File System Access API need a secure origin (localhost); file:// won't work.
REM The landing page links to both apps (Bliss Tactile Symbols and Bliss Tiles and Puzzles).
REM Each app asks you to Open the shared "Bliss Tactile Symbols" folder (holding both .scad files,
REM both .json files, and the "Bliss SVG files" and "Basic SVG files" folders).
cd /d "%~dp0"

echo Starting Bliss 3D-Printing Tools at http://localhost:8000/
echo A separate server window will open — close it to stop the server.

REM Launch the web server in its own window (prefer "python", fall back to "py").
python --version >nul 2>nul
if %errorlevel%==0 (
    start "Bliss tools server  (close this window to stop)" python -m http.server 8000
) else (
    start "Bliss tools server  (close this window to stop)" py -m http.server 8000
)

REM Give the server a moment to come up, then open the landing page in the default browser.
timeout /t 1 /nobreak >nul
start "" "http://localhost:8000/"
