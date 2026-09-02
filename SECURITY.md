# Bliss Tactile Symbols & Tiles (web) — Security Overview for IT

_Last updated: 2026-09-01_

This document is written for IT / information-security teams evaluating whether to allow
**Bliss Tactile Symbols** and **Bliss Tiles and Puzzles** on a managed device or network.
Both apps are served from `bts.volksswitch.org`.

The apps are open source and released to the public domain (CC0), so every claim below
can be checked against the source rather than taken on trust. Section 9 lists the checks
you can run yourself in a few minutes.

---

## 1. Executive summary

- Each app is a **100% client-side, static web page**. It runs entirely inside the
  browser tab. There is **no server-side component, no database, and no user accounts**.
- **No user data ever leaves the device.** Symbols, tiles and puzzles are created,
  rendered, and exported locally. There is **no analytics, no telemetry, no cloud
  storage, and no external API** the apps send anything to. Nothing a user opens, edits,
  or exports is ever uploaded.
- **No third-party contact.** The apps talk only to the address you host them on — the
  one address you would allowlist to let them load at all. There is no second hostname to
  review. Section 4 describes the whole footprint.
- The heavy lifting (the OpenSCAD CAD engine) runs inside the browser's **WebAssembly
  sandbox**, which has no access to the host filesystem or network.
- They need **no installation and no administrator rights**, and run on locked-down
  workstations where installing desktop software is not permitted.
- **Chrome or Edge is required**, because the apps use the File System Access API to work
  with a folder the user chooses.

---

## 2. What the apps are for

A user turns a prepared Blissymbol drawing into a 3D-printable tactile symbol, tile, or
puzzle piece. The result is an STL file they send to a 3D printer. The apps are used by
teachers, therapists, and parents making communication aids.

Both apps are the same engine pointed at different design files, served from one site.

---

## 3. How they run

- Static files only: HTML, JavaScript, CSS, WebAssembly, icons.
- Two bundled, **local** libraries — no third-party CDNs:
  - **OpenSCAD compiled to WebAssembly** — the CAD engine that turns a drawing into a 3D
    model. Single-threaded; it needs no special cross-origin isolation headers.
  - **Three.js** — draws the 3D preview in the browser.
- Both are served from the app's own origin, so there is no runtime dependency on any
  outside service.
- Once the browser has cached the app, it runs **with no network at all**.

---

## 4. Network footprint

The apps contact exactly one address — **the origin you host them on** — and nothing
else. No CDNs, ad networks, font services, trackers, or analytics endpoints are contacted
at any time, and no second hostname needs reviewing or allowlisting. On the public
deployment that origin is `bts.volksswitch.org`.

Everything the apps fetch comes from there:

- **The app's own files** (HTML/JS/WASM/icons/shared engine) and its own version
  manifest. Once cached, the app runs offline.
- **The designer file update check.** The design program each app drives (an OpenSCAD
  `.scad` file) is a document the user keeps in their own folder, and it is revised over
  time. When a folder is connected, the app requests one small JSON file, served from the
  same origin, stating the current version. The request sends no data — no identifiers, no
  design content, no usage information.
- **The designer file itself, only on acceptance.** If a newer version exists and the user
  explicitly accepts the offer, the app downloads the replacement from that same origin and
  overwrites the local copy. This never happens without a click, and it can be deferred a
  week or skipped.
- **Any failure is harmless.** If the check cannot complete — offline, say — the app says
  so in its console and carries on. The user keeps working with the file they already have;
  nothing retries or degrades.

**This changed on 1 September 2026, and the change was made for schools.** Previously the
designer update check asked `raw.githubusercontent.com`. Networks that block that hostname
— a common and reasonable policy, as it is widely used to stage files — left users able to
open the app but never able to receive a newer designer file, silently. Serving it from the
app's own origin removes that hostname from the apps entirely.

**One link, never followed automatically.** The page footer contains a hyperlink to
`www.volksswitch.org`, the project's home page. It is an ordinary link: nothing is fetched
from that address unless a user clicks it.

### What this means for firewall policy

- **Allowlisting the app's origin is the whole configuration.** There is nothing else to
  permit. If the apps load for your users, every feature described here works, including
  designer updates.

---

## 5. Files and folders — what the apps touch

The apps use the browser's **File System Access API**. On first use the user clicks a
button and picks a folder in the operating system's own dialog; the browser then asks them
to grant read/write access to **that folder only**.

- **The user chooses the folder. The apps cannot browse the disk**, cannot reach anything
  outside the granted folder, and cannot obtain access without that explicit prompt.
- Inside it, the apps read the design program, its saved settings file, and the drawing
  files; they write exported models and any drawings the user creates.
- Access is remembered so a returning user reconnects in one click. **What is stored is a
  browser-held handle, not a path** — it is meaningless outside that browser profile, and
  the browser still requires a user gesture to re-grant permission.
- Both apps deliberately share one folder, because a user's files for both live together.

---

## 6. What is stored in the browser

All of it is local to the browser profile, per origin, and none of it is transmitted:

- **Local storage** — which release's "what's new" notice has been seen, an optional
  one-week reminder snooze on a designer update, and any saved *styles* (named collections
  of finishing settings the user creates). Keys are namespaced per app.
- **IndexedDB** — the folder handle described in section 5.
- **Service worker caches** — a copy of the app's own files so it works offline.

There is no cookie, no session, no identifier of any kind, and nothing that describes the
user or their work leaves the machine. Clearing site data removes all of it; the user's own
files in their chosen folder are untouched.

---

## 7. Threats considered

| Area | Risk | Mitigation in place |
|---|---|---|
| Console output | A malicious design file printing markup via OpenSCAD `echo` | The console is rendered as **plain text**, never as HTML. |
| Form labels | Design-file text, file names, or folder names containing markup | Rendered by DOM construction, never by assigning raw HTML. |
| CAD engine | A malicious design file abusing the OpenSCAD parsers | OpenSCAD runs in the **WebAssembly sandbox** — no host filesystem, no network. Worst case is a crashed or hung render tab, **not** machine access. |
| Supply chain | A compromised third-party CDN or library | Dependencies are **bundled and served from the app's own origin** — no runtime CDN. Source is public for audit. |
| Designer update | A tampered or mismatched design file | The download is verified before anything is written: the file must declare the exact version the manifest promised, or the update aborts and the user's files are left untouched. |

### Residual considerations

- **Treat shared design files like any document.** As with an email attachment or an
  Office file, opening a *deliberately malicious* design file from an untrusted source is
  the main residual risk. The mitigations above — text-only rendering plus the WebAssembly
  sandbox — are designed so that even a malicious file cannot reach the machine.

---

## 8. Recommended hosting hardening (for whoever serves the apps)

The apps are safe as static files, but if you host them you can add defense-in-depth at
the web-server or CDN level. Suggested HTTP response headers:

```
Content-Security-Policy: default-src 'self'; object-src 'none'; base-uri 'self';
    frame-ancestors 'none';
    connect-src 'self';
    img-src 'self' blob: data:;
    script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'
Strict-Transport-Security: max-age=63072000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
```

Notes:

- **`connect-src 'self'` is sufficient** — every request the apps make, including the
  designer update check and download, goes to their own origin. No third-party hostname
  needs listing.
- `frame-ancestors` and `X-Frame-Options` prevent clickjacking; these work only as HTTP
  headers, not as an in-page tag.
- `'wasm-unsafe-eval'` is required for the WebAssembly CAD engine.
- Serve over **HTTPS** — also required for the File System Access API and the offline
  cache.

---

## 9. Verifying these claims

Everything above is observable in a few minutes:

1. **Watch the network.** Open the browser's developer tools, Network tab, and use the app
   normally — connect a folder, build a symbol, export it. Beyond the app's own files you
   will see, at most, the single version check described in section 4.
2. **Pull the plug.** Load the app, disconnect the network, and reload. It still runs.
3. **Check the folder prompt.** The browser names the exact folder being granted, and the
   apps can reach nothing outside it.
4. **Read the source.** Both apps and the shared engine are public and unminified.
