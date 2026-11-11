// Brain Box logic that does not touch the DOM: the prompt, parsing the model's JSON,
// merging chunked results and filing them into the journal.
import { KS, PCATS, FOOD_TYPES, MICHELIN } from "./constants.js";
import { arr, uid } from "./util.js";
import { newCity, newTrip } from "./model.js";

/** Copy only `keys` from o as trimmed strings; normalise status/booked when present. */
export function norm(o, keys) {
  var x = {};
  keys.forEach(function (k) { x[k] = o && o[k] != null ? String(o[k]).trim() : ""; });
  if (keys.indexOf("status") >= 0) {
    x.status = x.status.toLowerCase() === "confirmed" ? "confirmed" : "tentative";
    x.booked = x.booked.toLowerCase() === "yes" ? "yes" : "no";
  }
  return x;
}

export function buildPrompt(text, cur, done, year) {
  year = year || new Date().getFullYear();
  return 'You organise travel notes into JSON. Return one JSON object with these keys: country (string), city (string), currency (3-letter code for the money in the text, or empty), '
    + 'itin (array of activities: {city, country, day: number, time: 24h HH:MM or empty, text, via: provider or venue, cost: number as string, spent: number as string, status, booked}), '
    + 'trans (array: {city, country, mode: Flight|Train|Bus|Ferry|Car|Taxi|Other, no: flight or train number such as EK055, route, via: carrier such as Emirates, date: YYYY-MM-DD, time, ref: booking reference or PNR code, cost, spent, status, booked}), '
    + 'stays (array: {city, country, name, via: booking platform or hotel, checkin: YYYY-MM-DD, checkout: YYYY-MM-DD, conf, cost, spent, status, booked}), '
    + 'food (array of restaurants, cafes, bars and bakeries: {city, country, name, type: one of ' + FOOD_TYPES.join(', ') + ', status: "visited" if the text says they ate or drank there, otherwise "want", michelin: one of ' + MICHELIN.filter(Boolean).join(', ') + ' or empty, only if the text says so or you are certain, best50: "yes" only if the text says it is on The World\'s 50 Best Restaurants or 50 Best Bars, otherwise empty, note, link}), '
    + 'places (array of {city, country, name, cat, note, link}), budget (array of other costs: {city, country, label, cat, cost, spent}), packing (array of {text}), notes (string of general guide tips). '
    + 'cat for places is exactly one of: ' + PCATS.join(", ") + '. '
    + 'Put every named restaurant, cafe, bar or bakery in food, not places. Add every named winery, hotel, attraction or shop to places with the right cat, even when it is also in itin or stays. '
    + 'status is "confirmed" if the text says confirmed, reserved or ticketed, otherwise "tentative". booked is "yes" if the text says booked, paid or ticketed, otherwise "no". Set spent only if the text says it was paid. '
    + 'If the text is a bank or card SMS alert, add exactly one budget item with label = merchant, cat = Spending, cost and spent = the amount. '
    + 'Use empty strings or empty arrays when something is not in the text. Never invent details. '
    + (done ? 'The text records trips that already happened. If a date has no year in the text, leave the date empty rather than guessing a year. ' : 'If dates have no year assume ' + year + '. ')
    + 'Number activity days from 1 in order within each trip. The text may cover several destinations or trips. Give EVERY item in itin, trans, stays, places and budget its own "city" (destination) and "country" (trip). An item belongs to the destination where it happens: a hotel or activity to its own destination; a flight or train to its destination, EXCEPT the final leg that ends at the traveller home (the origin of the first flight), which belongs to the destination it departs from. Example: DXB to DUS belongs to Dusseldorf, DUS to FRA belongs to Frankfurt, FRA to DXB (going home) belongs to Frankfurt. Copy flight numbers and booking reference codes exactly as written in the text and never drop them. '
    + 'Current destination in the journal: ' + (cur ? (cur.city ? cur.city.name + ', ' : '(none chosen) in trip ') + cur.c.name : 'none') + '. If the text names no destination, use the current one.\n\nTEXT:\n' + text;
}

/** A restaurant with only known values for its type, awards and status. */
export function normFood(o) {
  var x = norm(o, ["name", "type", "michelin", "best50", "note", "link", "city", "country"]);
  if (FOOD_TYPES.indexOf(x.type) < 0) x.type = "Other";
  x.status = String((o && o.status) || "").trim().toLowerCase() === "visited" ? "visited" : "want";
  if (MICHELIN.indexOf(x.michelin) < 0) x.michelin = "";
  x.best50 = x.best50.toLowerCase() === "yes" ? "yes" : "";
  return x;
}

/** Turn whatever the model returned into the strict shape the app expects. */
export function normRes(r, cur) {
  if (!r || typeof r !== "object" || Array.isArray(r)) r = {};
  var B = ["status", "booked"], C = ["city", "country"];
  var res = {
    country: String(r.country || (cur && cur.c && cur.c.name) || "").trim(),
    city: String(r.city || (cur && cur.city && cur.city.name) || "").trim(),
    currency: String(r.currency || "").trim().toUpperCase().slice(0, 4),
    itin: arr(r.itin).map(function (o) { return norm(o, ["day", "time", "text", "via", "cost", "spent"].concat(C, B)); }),
    food: arr(r.food).map(function (o) { return normFood(o); }),
    trans: arr(r.trans).map(function (o) { return norm(o, ["mode", "no", "route", "via", "date", "time", "ref", "cost", "spent"].concat(C, B)); }),
    stays: arr(r.stays).map(function (o) { return norm(o, ["name", "via", "checkin", "checkout", "conf", "cost", "spent"].concat(C, B)); }),
    places: arr(r.places).map(function (o) { return norm(o, ["name", "cat", "note", "link"].concat(C)); }),
    budget: arr(r.budget).map(function (o) { return norm(o, ["label", "cat", "cost", "spent"].concat(C)); }),
    packing: arr(r.packing).map(function (o) { return norm(o, ["text"]); }),
    notes: String(r.notes || "").trim()
  };
  res.places.forEach(function (p) { if (PCATS.indexOf(p.cat) < 0) p.cat = "Other"; });
  KS.forEach(function (k) { res[k].forEach(function (x) { x.city = x.city || res.city; x.country = x.country || res.country; }); });
  if (!res.city) {
    var first = [].concat(res.itin, res.trans, res.stays, res.food, res.places, res.budget).filter(function (x) { return x.city && x.country; })[0];
    if (first) { res.city = first.city; res.country = first.country; }
  }
  return res;
}

/** Merge chunk result b into a (mutates and returns a). */
export function mergeRes(a, b) {
  KS.concat(["packing"]).forEach(function (k) { a[k] = a[k].concat(b[k]); });
  if (b.notes) a.notes = (a.notes ? a.notes + "\n\n" : "") + b.notes;
  if (!a.city) { a.city = b.city; a.country = b.country; }
  if (!a.currency) a.currency = b.currency;
  return a;
}

/** Split text on line boundaries into chunks of about n characters. A single line longer than n stays whole. */
export function chunkText(t, n) {
  var out = [], cur = "";
  t.split("\n").forEach(function (line) {
    if (cur.length + line.length + 1 > n && cur) { out.push(cur); cur = ""; }
    cur += line + "\n";
  });
  if (cur.trim()) out.push(cur);
  return out;
}

/** True when every item (and the packing/notes target) has a city and country. */
export function isRoutable(r) {
  var all = [].concat(r.itin, r.trans, r.stays, r.food, r.places, r.budget);
  if (all.some(function (x) { return !x.city || !x.country; })) return false;
  if ((r.packing.length || r.notes) && (!r.city || !r.country)) return false;
  return true;
}

/** For past trips: mark everything confirmed, booked and spent. Mutates r. */
export function markPast(r) {
  ["itin", "trans", "stays"].forEach(function (k) {
    r[k].forEach(function (x) { x.status = "confirmed"; x.booked = "yes"; if (!x.spent) x.spent = x.cost; });
  });
  r.budget.forEach(function (x) { if (!x.spent) x.spent = x.cost; });
  r.food.forEach(function (x) { x.status = "visited"; });
  return r;
}

export function citiesOf(r) {
  var m = {};
  KS.forEach(function (k) { r[k].forEach(function (x) { m[x.city] = 1; }); });
  if (r.packing.length || r.notes) m[r.city] = 1;
  return Object.keys(m).join(", ");
}

export function yearOfItem(it) {
  var m = String(it.date || it.checkin || "").match(/\b(?:19|20)\d\d\b/);
  return m ? m[0] : "";
}

/**
 * File a normalised result into the journal S. Countries and cities are matched by name,
 * case-insensitively, and created when missing. Returns the city to open afterwards.
 */
export function applyResult(S, r, done) {
  var first = null, years = {};
  function dest(cn, cy) {
    var co = S.countries.filter(function (c) { return c.name.toLowerCase() === cn.toLowerCase(); })[0];
    if (!co) { co = newTrip(cn, done ? "visited" : "planned", r.currency || "USD"); S.countries.push(co); }
    var c2 = co.cities.filter(function (c) { return c.name.toLowerCase() === cy.toLowerCase(); })[0];
    if (!c2) { c2 = newCity(cy, r.currency, done ? "completed" : "planning"); co.cities.push(c2); }
    if (done) { c2.status = "completed"; co.status = "visited"; }
    return { co: co, ci: c2 };
  }
  KS.forEach(function (k) {
    r[k].forEach(function (x) {
      var t = dest(x.country, x.city);
      if (!first) first = t.ci;
      var y = yearOfItem(x);
      if (y && (!years[t.co.id] || y < years[t.co.id])) years[t.co.id] = y;
      var o = {};
      Object.keys(x).forEach(function (q) { if (q !== "city" && q !== "country") o[q] = x[q]; });
      o.id = uid();
      t.ci[k].push(o);
    });
  });
  var main = (r.packing.length || r.notes || !first) ? dest(r.country, r.city).ci : first;
  r.packing.forEach(function (x) { main.packing.push(Object.assign({ id: uid() }, x)); });
  if (r.notes) main.notes = (main.notes ? main.notes + "\n\n" : "") + r.notes;
  S.countries.forEach(function (co) { if (years[co.id] && !co.year) co.year = years[co.id]; });
  return main;
}

/* ---------- Structured output schemas for Claude ---------- */
function strObj(keys, enums) {
  var p = {};
  keys.forEach(function (k) { p[k] = enums && enums[k] ? { type: "string", enum: enums[k] } : { type: "string" }; });
  return { type: "object", properties: p, required: keys, additionalProperties: false };
}
const BOOK = { status: ["tentative", "confirmed"], booked: ["yes", "no"] };
const list = (o) => ({ type: "array", items: o });

/** JSON schema matching what normRes() expects. Every field is required; the prompt says to use "" when unknown. */
export const BRAIN_SCHEMA = {
  type: "object",
  properties: {
    country: { type: "string" }, city: { type: "string" }, currency: { type: "string" },
    itin: list(strObj(["city", "country", "day", "time", "text", "via", "cost", "spent", "status", "booked"], BOOK)),
    trans: list(strObj(["city", "country", "mode", "no", "route", "via", "date", "time", "ref", "cost", "spent", "status", "booked"],
      Object.assign({ mode: ["Flight", "Train", "Bus", "Ferry", "Car", "Taxi", "Other"] }, BOOK))),
    stays: list(strObj(["city", "country", "name", "via", "checkin", "checkout", "conf", "cost", "spent", "status", "booked"], BOOK)),
    food: list(strObj(["city", "country", "name", "type", "status", "michelin", "best50", "note", "link"], { type: FOOD_TYPES, status: ["want", "visited"], michelin: MICHELIN, best50: ["", "yes"] })),
    places: list(strObj(["city", "country", "name", "cat", "note", "link"], { cat: PCATS })),
    budget: list(strObj(["city", "country", "label", "cat", "cost", "spent"])),
    packing: list(strObj(["text"])),
    notes: { type: "string" }
  },
  required: ["country", "city", "currency", "itin", "trans", "stays", "food", "places", "budget", "packing", "notes"],
  additionalProperties: false
};

export const PACK_SCHEMA = {
  type: "object",
  properties: { items: { type: "array", items: { type: "string" } } },
  required: ["items"],
  additionalProperties: false
};

export function packPrompt(f, have) {
  var d = f.city.stays.map(function (s) { return s.checkin; }).filter(Boolean).sort()[0] || "";
  return "Suggest 12 practical items to pack for a trip to " + f.city.name + ", " + f.c.name + (d ? " around " + d : "") + ". Items already on the list: " + (have || "none") + ". Give short item names only.";
}
