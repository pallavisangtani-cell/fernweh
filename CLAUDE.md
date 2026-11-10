# Fernweh travel journal: brief for Claude Code

## What this is
A web app (plain JS ES modules, no build step, no dependencies) for one person to plan trips, track bookings and budgets, and keep a passport of countries visited. It currently runs as a published claude.ai Artifact, so it has no server. Everything is stored in the browser's localStorage under the key `travel-journal-v1`.

## Layout
- `index.html`: markup shell; loads `src/styles.css` and `src/main.js`.
- `src/constants.js`: storage key, list names, place categories, tab and form definitions, samples.
- `src/util.js`: pure helpers (`esc`, `fmt`/`setCur`, `planned`, `slug`, `mapsUrl`).
- `src/model.js`: `fix` (migrates old saves), `findCity`, `newCity`, `totals`, `sortKey`, `title`, `groupByDay`.
- `src/brain.js`: Brain Box logic with no DOM: `buildPrompt`, `normRes`, `mergeRes`, `chunkText`, `isRoutable`, `markPast`, `applyResult`.
- `src/csv.js`: `buildCsv`, `csvCell`, `parseCSV`, `placesFromCsv` (Google Maps saved-places import).
- `src/share.js`: standalone trip guide (`buildShareDoc`) and `shareText`. Both take `{itin, costs}` options.
- `src/platform.js`: everything tied to claude.ai Artifacts (`sampleJson`, `saveFile`, `readUpload`). Swap this file when moving to the Claude API and normal downloads.
- `src/state.js`: the live journal `S` (never reassigned; `replaceState` swaps contents in place), UI state, `load`/`save`.
- `src/ui/render.js`: HTML builders and `renderTree`/`renderMain`. `src/main.js`: event wiring and actions.
- `legacy/travel-journal.html`: the original single file, kept for reference and for republishing as an Artifact until a bundling step exists.

## Commands
- `npm test`: Node's built-in test runner (`node --test`), no installs needed. Tests live in `test/` and cover only DOM-free modules.
- `npm start`: zero-dependency static server on http://localhost:5173 (ES modules do not load from `file://`).

## Data model
- `S.countries[]`: `{id, name, status: "planned"|"visited", year, note, cities[]}`
- city: `{id, name, cur, tbudget, status: "planning"|"completed", itin[], trans[], stays[], places[], budget[], packing[], notes}`
- Bookable items (`itin`, `trans`, `stays`) carry `status` ("tentative"|"confirmed"), `booked` ("yes"|"no"), `via` (carrier or booking platform), `cost` (planned) and `spent`.
- `trans` items also have `mode`, `no` (flight or train number), `route`, `date`, `time`, `ref` (booking reference).
- `places` items have `cat`: Food & drink, Hotel, Vineyard, Sights, Activity, Shopping, Other.

## Features
- Country > city tree, with a trip budget per city and planned, spent and left totals.
- Overview, itinerary by day, flights and transport, stays, places, other costs, packing, notes.
- Passport page: add past countries with a year, no trip planning needed.
- Share trip: builds a standalone HTML guide (places filterable by type, each with a Google Maps search link), plus copy-as-text and CSV. Booking references and costs are excluded unless "Include budget and costs" is ticked.
- Brain Box: pastes or uploads (xlsx, docx, csv, txt) go to an LLM that returns JSON; each item carries its own city and country. A "past trips" tickbox marks everything completed, booked and spent, and adds the country to the passport.

## Known limits of the Artifact version (reasons to move to a real project)
- The AI calls use the Artifact `sample` capability. In a real project, replace `sampleJson()` in `src/platform.js` with a call to the Claude API, using structured output for the JSON.
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
