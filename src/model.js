// Data-model helpers. Every function takes the state object explicitly so it can be tested.
import { LISTS, CATS } from "./constants.js";
import { uid, planned, spentOf } from "./util.js";

/** Fill in fields that older saves may lack. Mutates and returns S. */
export function fix(S) {
  if (!S.countries) S.countries = [];
  S.countries.forEach(function (c) {
    if (!c.status) c.status = "planned";
    if (c.year == null) c.year = "";
    if (c.note == null) c.note = "";
    if (!c.cities) c.cities = [];
    c.cities.forEach(function (ci) {
      LISTS.forEach(function (k) { if (!ci[k]) ci[k] = []; });
      if (!ci.cur) ci.cur = "USD";
      if (ci.notes == null) ci.notes = "";
      if (ci.tbudget == null) ci.tbudget = "";
      if (!ci.status) ci.status = "planning";
      // Restaurants used to be places in "Food & drink". Move them to their own list once.
      if (!ci._foodMoved) {
        ci.places = ci.places.filter(function (p) {
          if (p.cat !== "Food & drink") return true;
          ci.food.push({ id: p.id || uid(), name: p.name, type: "", status: ci.status === "completed" ? "visited" : "want", michelin: "", best50: "", note: p.note || "", link: p.link || "" });
          return false;
        });
        ci._foodMoved = 1;
      }
    });
    // Budget and currency live on the trip. Older saves kept them per destination.
    if (c.tbudget == null) {
      var sum = 0, any = false;
      c.cities.forEach(function (ci) { var v = parseFloat(ci.tbudget); if (v) { sum += v; any = true; } });
      c.tbudget = any ? String(sum) : "";
    }
    if (!c.cur) c.cur = (c.cities[0] && c.cities[0].cur) || "USD";
  });
  return S;
}

export function findTrip(S, id) {
  return S.countries.filter(function (c) { return c.id === id; })[0] || null;
}

export function newTrip(name, status, cur) {
  return { id: uid(), name: name, status: status || "planned", year: "", note: "", tbudget: "", cur: cur || "USD", cities: [] };
}

/** Totals for a set of destinations, in the same shape as totals(). */
export function totalsOf(cities) {
  var T = { all: { p: 0, s: 0 } };
  CATS.forEach(function (x) { T[x[0]] = { label: x[1], p: 0, s: 0 }; });
  cities.forEach(function (ci) {
    var t = totals(ci);
    CATS.forEach(function (x) { T[x[0]].p += t[x[0]].p; T[x[0]].s += t[x[0]].s; });
    T.all.p += t.all.p; T.all.s += t.all.s;
  });
  return T;
}

export function findCity(S, id) {
  for (var i = 0; i < S.countries.length; i++) {
    var cs = S.countries[i].cities;
    for (var j = 0; j < cs.length; j++) if (cs[j].id === id) return { c: S.countries[i], city: cs[j] };
  }
  return null;
}

export function newCity(n, cur, status) {
  return { id: uid(), name: n, cur: cur || "USD", tbudget: "", status: status || "planning", itin: [], trans: [], stays: [], food: [], places: [], budget: [], packing: [], notes: "", _foodMoved: 1 };
}

export function totals(city) {
  var T = { all: { p: 0, s: 0 } };
  CATS.forEach(function (x) {
    var p = 0, s = 0;
    city[x[0]].forEach(function (it) { p += planned(it); s += spentOf(it); });
    T[x[0]] = { label: x[1], p: p, s: s };
    T.all.p += p; T.all.s += s;
  });
  return T;
}

export function sortKey(k, a, b) {
  if (k === "itin") return (parseFloat(a.day) || 0) - (parseFloat(b.day) || 0) || String(a.time).localeCompare(b.time);
  if (k === "trans") return String(a.date).localeCompare(b.date) || String(a.time).localeCompare(b.time);
  if (k === "stays") return String(a.checkin).localeCompare(String(b.checkin));
  return 0;
}

export function title(k, it) {
  return k === "itin" ? it.text : k === "trans" ? (it.no ? it.no + " · " : "") + it.route : k === "stays" ? it.name : k === "budget" ? it.label : it.name || it.text;
}

/** Restaurants matching the filters: status "all"|"want"|"visited", type "All" or a category, award ""|"michelin"|"best50". */
export function filterFood(list, status, type, award) {
  return list.filter(function (r) {
    if (status && status !== "all" && (r.status || "want") !== status) return false;
    if (type && type !== "All" && (r.type || "Other") !== type) return false;
    if (award === "michelin" && !r.michelin) return false;
    if (award === "best50" && r.best50 !== "yes") return false;
    return true;
  });
}

export function groupByDay(list) {
  var days = {};
  list.forEach(function (it) { var d = it.day || "?"; (days[d] = days[d] || []).push(it); });
  return days;
}

/* ---------- Dates and routes for the travel-style cards ---------- */
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Earliest and latest ISO date across the transport and stays of one destination, or a whole trip (anything with .cities). */
export function tripRange(x) {
  var ds = [];
  (x.cities || [x]).forEach(function (city) {
    city.trans.forEach(function (t) { ds.push(t.date); });
    city.stays.forEach(function (s) { ds.push(s.checkin, s.checkout); });
  });
  ds = ds.filter(function (d) { return ISO.test(d || ""); }).sort();
  return ds.length ? { start: ds[0], end: ds[ds.length - 1] } : null;
}

/** Whole days from `today` (ISO) to `iso`. Negative when in the past. */
export function daysBetween(today, iso) {
  return Math.round((Date.parse(iso + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000);
}

export function todayIso(d) {
  d = d || new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

/** "in 12 days", "Tomorrow", "Today", "On the trip", or "" once it is over or undated. */
export function countdown(range, today) {
  if (!range) return "";
  var a = daysBetween(today, range.start), b = daysBetween(today, range.end);
  if (a > 1) return "in " + a + " days";
  if (a === 1) return "Tomorrow";
  if (a === 0) return "Today";
  if (b >= 0) return "On the trip";
  return "";
}

/** Split "DXB to DUS", "DXB-DUS", "Dubai → Düsseldorf" into [from, to]. */
export function routeParts(route) {
  var p = String(route || "").split(/\s*(?:\bto\b|→|->|–|—|-|\/|>)\s*/i).map(function (x) { return x.trim(); }).filter(Boolean);
  return p.length >= 2 ? [p[0], p[p.length - 1]] : [String(route || "").trim(), ""];
}

export function nights(checkin, checkout) {
  if (!ISO.test(checkin || "") || !ISO.test(checkout || "")) return 0;
  return Math.max(0, daysBetween(checkin, checkout));
}

/**
 * Add another journal's trips into S without replacing anything. Trips and destinations are matched by name
 * (ignoring case); items whose id is already present are skipped, so importing the same file twice is harmless.
 * Returns counts of what was added.
 */
export function mergeJournal(S, d) {
  var add = { trips: 0, destinations: 0, items: 0 };
  fix(d);
  d.countries.forEach(function (tc) {
    var co = S.countries.filter(function (c) { return c.name.toLowerCase() === String(tc.name).toLowerCase(); })[0];
    if (!co) {
      S.countries.push(tc); add.trips++; add.destinations += tc.cities.length;
      tc.cities.forEach(function (ci) { LISTS.forEach(function (k) { add.items += ci[k].length; }); });
      return;
    }
    if (tc.status === "visited") co.status = "visited";
    if (!co.year && tc.year) co.year = tc.year;
    if (!co.tbudget && tc.tbudget) { co.tbudget = tc.tbudget; co.cur = tc.cur; }
    tc.cities.forEach(function (tci) {
      var ci = co.cities.filter(function (c) { return c.name.toLowerCase() === String(tci.name).toLowerCase(); })[0];
      if (!ci) { co.cities.push(tci); add.destinations++; LISTS.forEach(function (k) { add.items += tci[k].length; }); return; }
      if (tci.status === "completed") ci.status = "completed";
      if (tci.notes && ci.notes.indexOf(tci.notes) < 0) ci.notes = (ci.notes ? ci.notes + "\n\n" : "") + tci.notes;
      LISTS.forEach(function (k) {
        var ids = {}; ci[k].forEach(function (x) { ids[x.id] = 1; });
        tci[k].forEach(function (x) { if (x.id && ids[x.id]) return; if (!x.id) x.id = uid(); ci[k].push(x); add.items++; });
      });
    });
  });
  return add;
}
