# Fernweh travel journal

A personal travel journal: plan trips by country and city, track bookings and budgets, keep places and packing lists, and keep a passport of countries visited. Plain JavaScript ES modules, no build step and no dependencies. Data is stored in the browser's localStorage.

## Status
This project is already an installable Progressive Web App. Do not rebuild it.
- `manifest.webmanifest`: name, colours, `display: standalone`, icons (192, 512, maskable 512).
- `sw.js`: service worker. Caches the app shell on install, serves same-origin files network-first with a cache fallback (works offline), and caches Google Fonts and cdnjs scripts at runtime.
- `index.html`: links the manifest, Apple touch icon and theme colour; `src/main.js` registers the service worker.
- Checked in headless Chrome: no manifest errors, no installability errors, and the app reloads offline with its data intact.

## Claude
The Brain Box and packing suggestions use Claude with your own API key (Settings in the app). The key stays on your device and is not in backups.

## Deploying
Every push to `main` runs the tests and publishes to GitHub Pages (`.github/workflows/pages.yml`). Installed copies pick up the new version the next time they open online.

## Earlier notes
1. **Host it on HTTPS** (a PWA cannot be installed from a local file). Any static host works: GitHub Pages, Netlify, Cloudflare Pages, Firebase Hosting. Upload the folder as-is; no build command, publish directory is the project root. All paths are relative, so a sub-path such as `https://user.github.io/fernweh/` works.
2. **AI features (optional).** The Brain Box and packing suggestions were written for claude.ai Artifacts. Outside an Artifact they show "The AI helper is not available here." To enable them, replace `sampleJson()` in `src/platform.js` with a call to an LLM API that returns JSON. `buildPrompt()` in `src/brain.js` holds the prompt, and `normRes()` cleans up whatever comes back. Never commit an API key: let the user paste their own key into the app and keep it in localStorage.
3. **Downloads (optional).** `saveFile()` in `src/platform.js` also uses an Artifact capability. Replace it with a normal browser download (a Blob and an `<a download>` link).
4. When you change any file, bump `VERSION` in `sw.js`, and add any new file under `src/` to its `SHELL` list, so installed copies update.

## Run and test locally
```bash
npm start   # http://localhost:5173 (ES modules do not load from file://)
npm test    # 61 tests with Node's built-in runner, Node 18+
```

## Moving existing data in
Open Backup and restore in the old version, copy the text, then paste it into Restore in the new one.

See `CLAUDE.md` for the code layout, data model and the flight-routing rule the AI prompt depends on.
