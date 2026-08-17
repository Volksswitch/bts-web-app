// Service worker for the Bliss Tactile Symbols web app (the /symbols/ shell).
// Scope is /symbols/ (this file's folder), so it is independent of the Tiles
// app's worker at /tiles/sw.js — publishing one never disturbs the other.
// Bump CACHE_NAME when deploying changes to any file in SHELL; the activate
// handler purges old caches so clients get the new version on next load. It only
// ever goes UP, and moves only at release (in lockstep with this app's
// APP_RELEASE and its latest_app_version.json). See RELEASING.md.
const CACHE_NAME = 'bts-symbols-v22';

// This app's shell, served over HTTP from this origin (GitHub Pages). The shared
// engine + vendored deps live above /symbols/, reached with ../ . The user's
// .scad / .json / SVGs come from the File System Access API (local disk) and
// never touch the network, so the fetch handler never sees them.
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  '../icons/symbols.svg',
  '../icons/symbols-192.png',
  '../icons/symbols-512.png',
  '../icons/symbols-maskable-512.png',
  '../shared/bts.css',
  '../shared/app-body.html',
  '../shared/bts-core.js',
  '../openscad-wasm/openscad.js',
  '../openscad-wasm/openscad.fonts.js',
  '../vendor/three/build/three.module.min.js',
  '../vendor/three/examples/jsm/controls/TrackballControls.js',
  '../vendor/three/examples/jsm/loaders/STLLoader.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Cache-first for GET requests that match our shell; fall back to network.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request)
      .then(cached => cached ?? fetch(e.request))
  );
});
