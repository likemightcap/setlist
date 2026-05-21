# Setlist Builder (Tablet-First PWA)

A touch-first setlist builder for live performance, implemented with plain HTML, CSS, and JavaScript.

## Included

- Main screen matching your mock direction (dark theme, large controls, rounded cards/buttons)
- New Set, Load Set, Save Set
- Add/Edit Track modal with two track types:
  - Master Slate: audio file selected, BPM/time fields locked
  - Built Track: BPM, time signature, count-in, click sample, sections, optional backing audio, split output routing
- Track row tap opens Play View modal:
  - Play, Stop, Next Track, Track Info
  - Continuous Play toggle
- Track options menu:
  - Edit, Duplicate, Replace Audio, Move Up/Down, Delete (confirm)
- Offline-friendly static cache via service worker
- Local persistence:
  - Set data in localStorage
  - Audio files in IndexedDB

## Project Files

- index.html
- styles.css
- app.js
- manifest.webmanifest
- service-worker.js
- icon.svg

## Run Locally (Recommended)

Service workers and installable PWA mode require HTTP(S), not file://.

1. Place this folder on the tablet or removable media.
2. Serve it with a local static web server on the tablet (no app store required if you sideload an APK web server utility).
3. Open the local URL in Chrome or Chromium.
4. Use Add to Home Screen to install as an app-like PWA.

## File:// Launch (Limited)

You can open index.html directly from storage, but:

- Service worker will not run.
- Install prompt is typically unavailable.
- Some browser security policies may reduce features.

Core UI still works, but app-like install/offline cache is reduced.

## Fallback Hosted Installable PWA

If local-only serving is not practical:

1. Host these static files on HTTPS.
2. Open in tablet browser.
3. Add to Home Screen.

The app remains mostly offline after first load due to cached core assets and local data storage.

## Notes

- Master Slate BPM detection is currently placeholder metadata and defaults to 120 if unknown.
- Built Track timing uses section bars and time signature to compute total duration.
- Split output routes click/backing left/right using stereo panning.
- Browser storage limits vary by device and browser.
