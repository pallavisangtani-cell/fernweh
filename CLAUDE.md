# Fernweh travel journal: brief for Claude Code

## What this is
A web app (plain JS ES modules, no build step, no dependencies) for one person to plan trips, track bookings and budgets, and keep a passport of countries visited. It is an installable PWA hosted on GitHub Pages, with no server. The journal is stored in the browser's localStorage under `travel-journal-v1`; the user's Claude API key is stored separately under `fernweh-claude-key` and must never be added to the journal or backups.

## Layout
- `index.html`: markup shell; loads `src/styles.css` and `src/main.js`.
- `src/constants.js`: storage key, list names, place categories, tab and form definitions, samples.
- `src/util.js`: pure helpers (`esc`, `fmt`/`setCur`, `planned`, `slug`, `mapsUrl`).
- `src/model.js`: `fix` (migrates old saves), `findCity`, `newCity`, `totals`, `sortKey`, `title`, `groupByDay`.
- `src/brain.js`: Brain Box logic with no DOM: `buildPrompt`, `normRes`, `mergeRes`, `chunkText`, `isRoutable`, `markPast`, `applyResult`.
- `src/csv.js`: `buildCsv`, `csvCell`, `parseCSV`, `placesFromCsv` (Google Maps saved-places import).
- `src/share.js`: standalone trip guide (`buildShareDoc`) and `shareText`. Both take `{itin, costs}` options.
- `src/platform.js`: Claude calls (`claudeJson`, `testKey`, key storage), file downloads (`saveFile`) and upload reading. Claude is called from the browser with the user's own key via the bundled SDK in `vendor/` (`dangerouslyAllowBrowser`), model `claude-opus-5-5`, structured outputs (`output_config.format`) and server-side `fallbacks: "default"`. The SDK sends the key as `Authorization: Bearer`.
- `src/weather.js`: Open-Meteo (no key). `weatherPlan` picks forecast (within 16 days), actual (past) or typical (same dates last year); results cached in localStorage `fernweh-weather`.
- `src/gmail.js`: read-only Gmail import via Google Identity Services token client, using the user's own OAuth client ID (Settings, localStorage `fernweh-gmail-client`). Emails go Gmail -> device -> Claude; nothing stored.
- `src/brain.js` also holds `BRAIN_SCHEMA` and `PACK_SCHEMA`, the JSON schemas Claude must answer in. Keep `BRAIN_SCHEMA` in step with `normRes`.
- `src/state.js`: the live journal `S` (never reassigned; `replaceState` swaps contents in place), UI state, `load`/`save`.
- `src/ui/render.js`: screens (home, destination, passport, Claude, settings, share) plus `renderTree` (sidebar and phone tab bar) and `renderMain`. `src/ui/icons.js`: inline icons and cover gradients. `src/main.js`: event wiring and actions.
- Design: warm sand background, teal brand, coral accent; destinations get a gradient cover; flights render as boarding passes; phones (under 820px) get a bottom tab bar. Check changes at phone width (390px) and in dark mode.
- `manifest.webmanifest`, `sw.js`, `icons/`: installable PWA. `sw.js` serves the app network-first and falls back to its cache offline. Bump `VERSION` in `sw.js` and add any new `src/` file to `SHELL` when files change.
- `legacy/`: the original Artifact single file and the Gemini-edited version, for reference only. Not loaded by the app.
- `.github/workflows/pages.yml`: runs `npm test`, then deploys the repo root to GitHub Pages on every push to `main`. A failing test blocks the deploy.

## Commands
- `npm test`: Node's built-in test runner (`node --test`), no installs needed. Tests live in `test/` and cover only DOM-free modules.
- `npm start`: zero-dependency static server on http://localhost:5173 (ES modules do not load from `file://`).

## Data model
- `S.home`: the traveller's home city (Settings), used in the Brain Box routing rule.
- `S.countries[]` (a **trip**): `{id, name, status: "planned"|"visited", year, note, tbudget, cur, start, end, packing[], cities[]}`. `start`/`end` set by hand win over booking dates in `tripRange`. Packing is trip-level (items `{id, text, cat?, why?, done}`); `fix()` lifts old per-city packing. Budget and currency are trip-level; all amounts in a trip are in its `cur`.
- city (a **destination**): `{id, name, status: "planning"|"completed", itin[], trans[], stays[], food[], places[], budget[], packing[], notes}`. Old saves also carry `cur`/`tbudget` per city; `fix()` lifts them to the trip and ignores them after.
- `food` items (restaurants): `{id, name, type (FOOD_TYPES), status: "want"|"visited", michelin (MICHELIN), best50: "yes"|"", note, link}`. `fix()` moves old `places` in "Food & drink" into `food` once (`_foodMoved` flag).
- Bookable items (`itin`, `trans`, `stays`) carry `status` ("tentative"|"confirmed"), `booked` ("yes"|"no"), `via` (carrier or booking platform), `cost` (planned) and `spent`.
- `trans` items also have `mode`, `no` (flight or train number), `route`, `date`, `time`, `ref` (booking reference).
- `places` items have `cat`: Hotel, Vineyard, Sights, Activity, Shopping, Other.

## Features
- UI words: a `country` is shown as a **trip** and a `city` as a **destination**. The data model keeps the old names.
- Home shows one card per trip. The trip page has the trip budget and totals across destinations, a destination switcher (All or one city), and tabs. List tabs are per destination; in All they are grouped by city, items carry `data-cid`, and the add form asks which destination.
- Restaurants tab: filter by want/visited, category and award (`filterFood`).
- Settings > Add trips from a file: `mergeJournal` adds a Fernweh JSON file without replacing anything (matched by name, skips known ids). Use this to import a user's past trips: convert their data to that JSON, never commit it to the repo.
- Overview, itinerary by day, flights and transport, stays, places, other costs, packing, notes.
- Passport page: add past countries with a year, no trip planning needed.
- Share trip (whole trip, via `tripShare`): builds a standalone HTML guide (places filterable by type, each with a Google Maps search link), plus copy-as-text and CSV. Booking references and costs are excluded unless "Include budget and costs" is ticked.
- Brain Box: pastes or uploads (xlsx, docx, csv, txt) go to an LLM that returns JSON; each item carries its own city and country. A "past trips" tickbox marks everything completed, booked and spent, and adds the country to the passport.

## Known limits
- No Gmail or Google Maps connection. Hotel and flight confirmations are pasted by hand. A real app could use Gmail OAuth and the Google Maps/Places API for pins and geocoding.
- No map view. Places only link out to Google Maps.
- Data lives in one browser. Moving to a database would give sync across devices and real sharing links.
- No PDF import. Excel, Word, CSV and text work.

## Routing rule the AI prompt depends on
A flight or train is filed under its destination city, except the final leg that ends at the traveller's home (the origin of the first flight), which is filed under the city it departs from. Example: DXB to DUS belongs to Düsseldorf, DUS to FRA belongs to Frankfurt, FRA to DXB belongs to Frankfurt.

## Suggested first tasks
1. ~~Split the single file into modules and add tests for `normRes`, `mergeRes`, `chunkText` and `buildCsv`.~~ Done.
2. Collect real pasted bookings the model got wrong, and use them as regression tests for the prompt.
3. Add a map view and Gmail import.
