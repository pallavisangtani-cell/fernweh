// Brain Box logic that does not touch the DOM: the prompt, parsing the model's JSON,
// merging chunked results and filing them into the journal.
import { KS, PCATS, FOOD_TYPES, MICHELIN } from "./constants.js";
import { arr, uid } from "./util.js";
import { newCity, newTrip, tripRange } from "./model.js";

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

export function buildPrompt(text, cur, done, year, home) {
  year = year || new Date().getFullYear();
  return 'You organise travel notes into JSON. Return one JSON object with these keys: country (string), city (string), currency (3-letter code for the money in the text, or empty), '
    + 'itin (array of activities: {city, country, day: number, time: 24h HH:MM or empty, text, via: provider or venue, link: a URL from the text for this activity or empty, cost: number as string, spent: number as string, status, booked}), '
    + 'trans (array: {city, country, mode: Flight|Train|Bus|Ferry|Car|Taxi|Other, no: flight or train number such as EK055, route, via: carrier such as Emirates, date: YYYY-MM-DD, time, ref: booking reference or PNR code, cost, spent, status, booked}), '
    + 'stays (array: {city, country, name, area: neighbourhood or empty, via: booking platform or hotel, checkin: YYYY-MM-DD, checkout: YYYY-MM-DD, conf, cost, spent, status, booked}), '
    + 'food (array of restaurants, cafes, bars and bakeries: {city, country, name, type: one of ' + FOOD_TYPES.join(', ') + ', cuisine: the cuisine in one or two words such as Sushi, Ramen, French, or empty, recBy: who or what recommended it if the text says, bookVia: the booking platform or app if the text says, bookDate: YYYY-MM-DD of a booked table or empty, bookTime: HH:MM of a booked table or empty, status: "visited" if the text says they ate or drank there, otherwise "want", michelin: one of ' + MICHELIN.filter(Boolean).join(', ') + ' or empty, only if the text says so or you are certain, best50: "yes" only if the text says it is on The World\'s 50 Best Restaurants or 50 Best Bars, otherwise empty, note, link}), '
    + 'places (array of {city, country, name, cat, note, link}), budget (array of other costs: {city, country, label, cat, cost, spent}), packing (array of {text}), notes (string of general guide tips). '
    + 'cat for places is exactly one of: ' + PCATS.join(", ") + '. '
    + 'Put every named restaurant, cafe, bar or bakery in food, not places. Add every named winery, hotel, attraction or shop to places with the right cat, even when it is also in itin or stays. '
    + 'status is "confirmed" if the text says confirmed, reserved or ticketed, otherwise "tentative". booked is "yes" if the text says booked, paid or ticketed, otherwise "no". Set spent only if the text says it was paid. '
    + 'If the text is a bank or card SMS alert, add exactly one budget item with label = merchant, cat = Spending, cost and spent = the amount. '
    + 'Use empty strings or empty arrays when something is not in the text. Never invent details. '
    + (done ? 'The text records trips that already happened. If a date has no year in the text, leave the date empty rather than guessing a year. ' : 'If dates have no year assume ' + year + '. ')
    + 'Number activity days from 1 in order within each trip. The text may cover several destinations or trips. Give EVERY item in itin, trans, stays, places and budget its own "city" (destination) and "country" (trip). An item belongs to the destination where it happens: a hotel or activity to its own destination; a flight or train to its destination, EXCEPT the final leg that ends at the traveller home' + (home ? ' (' + home + ')' : ' (the origin of the first flight)') + ', which belongs to the destination it departs from. Never create a destination for the traveller home. Example: DXB to DUS belongs to Dusseldorf, DUS to FRA belongs to Frankfurt, FRA to DXB (going home) belongs to Frankfurt. Copy flight numbers and booking reference codes exactly as written in the text and never drop them. '
    + 'Current destination in the journal: ' + (cur ? (cur.city ? cur.city.name + ', ' : '(none chosen) in trip ') + cur.c.name : 'none') + '. If the text names no destination, use the current one.\n\nTEXT:\n' + text;
}

/** A restaurant with only known values for its type, awards and status. */
export function normFood(o) {
  var x = norm(o, ["name", "type", "cuisine", "michelin", "best50", "recBy", "bookVia", "bookDate", "bookTime", "note", "link", "city", "country"]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x.bookDate)) x.bookDate = "";
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
    itin: arr(r.itin).map(function (o) { return norm(o, ["day", "time", "text", "via", "link", "cost", "spent"].concat(C, B)); }),
    food: arr(r.food).map(function (o) { return normFood(o); }),
    trans: arr(r.trans).map(function (o) { return norm(o, ["mode", "no", "route", "via", "date", "time", "ref", "cost", "spent"].concat(C, B)); }),
    stays: arr(r.stays).map(function (o) { return norm(o, ["name", "area", "via", "checkin", "checkout", "conf", "cost", "spent"].concat(C, B)); }),
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
/** What makes two items the same booking or entry, per list. "" means never treat as the same. */
export function itemKey(k, x) {
  var low = function (v) { return String(v || "").trim().toLowerCase().replace(/\s+/g, " "); };
  if (k === "trans") return (x.ref ? "ref:" + low(x.ref) + "|" : "") + (low(x.no) || low(x.route)) + "|" + low(x.date);
  if (k === "stays") return low(x.name) + "|" + low(x.checkin);
  if (k === "itin") return low(x.text) + "|" + low(x.day);
  if (k === "food" || k === "places") return low(x.name);
  if (k === "budget") return low(x.label) + "|" + low(x.cost);
  return "";
}
function sameItem(k, a, b) {
  if (k === "trans" && a.ref && b.ref && a.ref.toLowerCase() === b.ref.toLowerCase()) return true;
  var ka = itemKey(k, a).replace(/^ref:[^|]*\|/, ""), kb = itemKey(k, b).replace(/^ref:[^|]*\|/, "");
  return !!ka && ka === kb;
}
/** Fill an existing item's blanks from a newer copy; a confirmation or booking only ever upgrades it. */
function mergeInto(old, x) {
  var changed = false;
  Object.keys(x).forEach(function (q) {
    if (q === "city" || q === "country" || q === "id") return;
    if (q === "status" && (old.status === "tentative" || !old.status) && x.status === "confirmed") { old.status = "confirmed"; changed = true; return; }
    if (q === "status" && old.status === "want" && x.status === "visited") { old.status = "visited"; changed = true; return; }
    if (q === "booked" && old.booked !== "yes" && x.booked === "yes") { old.booked = "yes"; changed = true; return; }
    if (q === "status" || q === "booked") return;
    if ((old[q] == null || old[q] === "") && x[q] !== "") { old[q] = x[q]; changed = true; }
  });
  return changed;
}

/**
 * File a normalised result into the journal S. Countries and cities are matched by name,
 * case-insensitively, and created when missing. Items that already exist are updated instead of added twice.
 * Returns the city to open afterwards; `stats` (optional) collects {added: [...], updated: [...]} as
 * {list, title, trip, city}.
 */
export function applyResult(S, r, done, stats) {
  var first = null, years = {};
  stats = stats || {}; stats.added = stats.added || []; stats.updated = stats.updated || [];
  function dest(cn, cy) {
    var co = S.countries.filter(function (c) { return c.name.toLowerCase() === cn.toLowerCase(); })[0];
    if (!co) { co = newTrip(cn, done ? "visited" : "planned", r.currency || "USD"); S.countries.push(co); }
    var c2 = co.cities.filter(function (c) { return c.name.toLowerCase() === cy.toLowerCase(); })[0];
    if (!c2) { c2 = newCity(cy, r.currency, done ? "completed" : "planning"); co.cities.push(c2); }
    if (done) { c2.status = "completed"; co.status = "visited"; }
    return { co: co, ci: c2 };
  }
  var mainT = null;
  KS.forEach(function (k) {
    r[k].forEach(function (x) {
      var t = dest(x.country, x.city);
      if (!first) { first = t.ci; mainT = t.co; }
      var y = yearOfItem(x);
      if (y && (!years[t.co.id] || y < years[t.co.id])) years[t.co.id] = y;
      var note = { list: k, title: x.name || x.text || x.label || [x.no, x.route].filter(Boolean).join(" "), trip: t.co.name, city: t.ci.name };
      var old = t.ci[k].filter(function (e) { return sameItem(k, e, x); })[0];
      if (old) { if (mergeInto(old, x)) stats.updated.push(note); return; }
      var o = {};
      Object.keys(x).forEach(function (q) { if (q !== "city" && q !== "country") o[q] = x[q]; });
      o.id = uid();
      t.ci[k].push(o);
      stats.added.push(note);
    });
  });
  var mainD = (r.packing.length || r.notes || !first) ? dest(r.country, r.city) : { co: mainT, ci: first };
  var main = mainD.ci, trip = mainD.co;
  // Packing belongs to the trip.
  var have = {}; trip.packing.forEach(function (p) { have[String(p.text).toLowerCase()] = 1; });
  r.packing.forEach(function (x) { if (have[String(x.text).toLowerCase()]) return; trip.packing.push(Object.assign({ id: uid() }, x)); });
  if (r.notes) main.notes = (main.notes ? main.notes + "\n\n" : "") + r.notes;
  S.countries.forEach(function (co) { if (years[co.id] && !co.year) co.year = years[co.id]; });
  return main;
}

/** Instructions put in front of a batch of emails, with the user's existing trips so bookings join the right one. */
export function gmailPreamble(S, today) {
  var trips = S.countries.map(function (co) {
    var r = tripRange(co);
    return "- " + co.name + (r ? " (" + r.start + " to " + r.end + ")" : "") + ": " + (co.cities.map(function (c) { return c.name; }).join(", ") || "no destinations yet");
  });
  return "The text below is booking emails from the traveller's inbox. Today is " + today + ". Extract only real bookings and reservations: flights, trains and other transport, hotels and other stays, tickets for activities, and booked restaurant tables. "
    + "A booking email means it is booked: set booked \"yes\" and status \"confirmed\" unless the email says it is on hold, pending or not yet paid. Ignore offers, marketing and anything that is not a booking. "
    + "For country (the trip), use an existing trip below when the booking's place and dates fit it, written exactly as shown. Otherwise use the country visited and the year, for example \"Japan 2027\".\n"
    + "Existing trips:\n" + (trips.length ? trips.join("\n") : "(none yet)") + "\n\n";
}

/** Keep only actual bookings (for Gmail sync): transport, stays, ticketed activities and booked tables. Drops items with no destination. */
export function bookingsOnly(r) {
  var ok = function (x) { return x.city && x.country; };
  r.trans = r.trans.filter(ok); r.stays = r.stays.filter(ok); r.itin = r.itin.filter(ok);
  r.food = r.food.filter(function (x) { return ok(x) && x.bookDate; });
  r.places = []; r.budget = []; r.packing = []; r.notes = "";
  return r;
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
    itin: list(strObj(["city", "country", "day", "time", "text", "via", "link", "cost", "spent", "status", "booked"], BOOK)),
    trans: list(strObj(["city", "country", "mode", "no", "route", "via", "date", "time", "ref", "cost", "spent", "status", "booked"],
      Object.assign({ mode: ["Flight", "Train", "Bus", "Ferry", "Car", "Taxi", "Other"] }, BOOK))),
    stays: list(strObj(["city", "country", "name", "area", "via", "checkin", "checkout", "conf", "cost", "spent", "status", "booked"], BOOK)),
    food: list(strObj(["city", "country", "name", "type", "cuisine", "status", "michelin", "best50", "recBy", "bookVia", "bookDate", "bookTime", "note", "link"], { type: FOOD_TYPES, status: ["want", "visited"], michelin: MICHELIN, best50: ["", "yes"] })),
    places: list(strObj(["city", "country", "name", "cat", "note", "link"], { cat: PCATS })),
    budget: list(strObj(["city", "country", "label", "cat", "cost", "spent"])),
    packing: list(strObj(["text"])),
    notes: { type: "string" }
  },
  required: ["country", "city", "currency", "itin", "trans", "stays", "food", "places", "budget", "packing", "notes"],
  additionalProperties: false
};

export const PACK_CATS = ["Clothes", "Shoes", "Toiletries", "Health", "Tech", "Documents", "Other"];

export const PACK_SCHEMA = {
  type: "object",
  properties: { items: { type: "array", items: { type: "object", properties: { text: { type: "string" }, cat: { type: "string", enum: PACK_CATS }, why: { type: "string" } }, required: ["text", "cat", "why"], additionalProperties: false } } },
  required: ["items"],
  additionalProperties: false
};

/**
 * ctx: {trip, home, range: {start, end} or null, dests: [{name, weather, activities: [], dining: []}], have: [texts]}
 */
export function packPrompt(ctx) {
  var lines = ["Suggest what to pack for this trip. Be specific to the weather and plans below, skip generic items the traveller would never forget, and do not repeat items already on the list.",
    "Give 10 to 18 items. For each: a short item name, a category, and a reason of a few words that points to the weather or a plan (for example \"Rain on 3 of 6 days in Düsseldorf\").",
    "Trip: " + ctx.trip + (ctx.range ? ", " + ctx.range.start + " to " + ctx.range.end : "") + (ctx.home ? ". Travelling from " + ctx.home : "") + "."];
  ctx.dests.forEach(function (d) {
    lines.push("- " + d.name + ": " + (d.weather || "weather unknown, use the usual climate for the dates") + (d.activities.length ? ". Plans: " + d.activities.slice(0, 12).join("; ") : "") + (d.dining.length ? ". Dining: " + d.dining.slice(0, 8).join("; ") : "") + ".");
  });
  lines.push("Already packed or on the list: " + (ctx.have.length ? ctx.have.join(", ") : "nothing yet") + ".");
  return lines.join("\n");
}
